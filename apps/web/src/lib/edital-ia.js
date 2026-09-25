/**
 * Leitura de edital por IA (front).
 *
 * Fluxo: PDFs (edital, TR, anexos) → texto por página no navegador (pdf.js;
 * página digitalizada vira JPEG) → partes de ~25 páginas → ia-processar
 * "edital_extrair_parte" (2 em paralelo, 1 nova tentativa) → "edital_consolidar"
 * → EditalConsolidado. "edital_atende" confere o resultado com o acervo da
 * empresa do token (nunca mandamos empresa_id no corpo).
 *
 * Formatos (EditalConsolidado / AtendeResultado): ver o CONTRATO da feature e
 * a edge function supabase/functions/ia-processar.
 */
import { sigo } from "@/api/sigoClient";

// Página com menos que isso de texto (e com imagem) = digitalizada.
const MIN_CHARS_TEXTO = 150;
const LARGURA_IMAGEM = 1400; // px da página renderizada
const ALTURA_MAX_IMAGEM = 2400;
const QUALIDADE_JPEG = 0.7;
// Divisão em partes (cada chamada da edge precisa responder em < 150 s).
const PAGINAS_POR_PARTE = 25;
const IMAGENS_POR_PARTE = 6;
const MAX_CHARS_PARTE = 80000;
const LIMITE_PARTE_UNICA = 60000; // arquivo pequeno vai numa parte só
const MAX_CHARS_PAGINA = 40000; // página "tabelão" é cortada
const MAX_PAGINAS_ESCANEADAS = 60; // soma de todos os arquivos
const PARTES_EM_PARALELO = 2;

export const CATEGORIAS_ARQUIVO_EDITAL = [
  { valor: "edital", rotulo: "Edital" },
  { valor: "termo_referencia", rotulo: "Termo de referência" },
  { valor: "anexo_edital", rotulo: "Anexo do edital" },
  { valor: "errata", rotulo: "Errata / retificação" },
];

export const MODALIDADES_LICITACAO = [
  { valor: "concorrencia", rotulo: "Concorrência" },
  { valor: "tomada_precos", rotulo: "Tomada de Preços" },
  { valor: "convite", rotulo: "Convite" },
  { valor: "pregao", rotulo: "Pregão" },
  { valor: "dispensa", rotulo: "Dispensa" },
  { valor: "inexigibilidade", rotulo: "Inexigibilidade" },
  { valor: "outra", rotulo: "Outra" },
];

/** Categoria provável pelo nome do arquivo (o usuário confere). */
export function categoriaPeloNome(nome, primeiro = false) {
  const n = String(nome || "").toLowerCase();
  if (/errata|retifica/.test(n)) return "errata";
  if (/termo.{0,4}refer|(^|[^a-z])tr([^a-z]|$)|projeto.b[aá]sico/.test(n))
    return "termo_referencia";
  if (/edital/.test(n) && !/anexo/.test(n)) return "edital";
  if (/anexo/.test(n)) return "anexo_edital";
  return primeiro ? "edital" : "anexo_edital";
}

// ---------------------------------------------------------------------------
// pdf.js
// ---------------------------------------------------------------------------
let pdfjsPromise = null;

/** Carrega o pdf.js só quando usa (build legacy p/ navegador sem Promise.withResolvers). */
function carregarPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const moderno = typeof Promise.withResolvers === "function";
      const [pdfjs, worker] = moderno
        ? await Promise.all([
            import("pdfjs-dist"),
            import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          ])
        : await Promise.all([
            import("pdfjs-dist/legacy/build/pdf.mjs"),
            import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
          ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })().catch((e) => {
      pdfjsPromise = null; // deixa tentar de novo (ex.: chunk falhou no deploy)
      throw e;
    });
  }
  return pdfjsPromise;
}

/**
 * Texto de uma página a partir do getTextContent(): respeita hasEOL, quebra
 * linha quando o y muda e põe espaço entre itens afastados (células de tabela).
 */
export function textoDaPaginaPdf(conteudo) {
  let out = "";
  let ult = null;
  for (const it of conteudo?.items || []) {
    if (typeof it?.str !== "string") continue; // marcações (beginMarkedContent)
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const x = t[4] || 0;
    const y = t[5] || 0;
    const h = Math.abs(it.height || t[3] || 0) || 10;
    if (ult && !ult.eol && it.str) {
      const afastado = x - ult.xFim > h * 0.2 || x < ult.xFim - h * 2; // gap ou voltou (outra coluna)
      if (Math.abs(y - ult.y) > Math.max(h, ult.h) * 0.6) out += "\n";
      else if (afastado && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
    }
    out += it.str;
    if (it.hasEOL) out += "\n";
    if (it.str || it.hasEOL) ult = { y, h, xFim: x + (it.width || 0), eol: !!it.hasEOL };
  }
  return out
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const tamanhoUtil = (texto) => String(texto || "").replace(/\s+/g, "").length;

let opsDeImagem = null;
async function temImagem(page, pdfjs) {
  if (!opsDeImagem) {
    opsDeImagem = new Set(
      Object.entries(pdfjs.OPS || {})
        .filter(([k]) => /^paint.*Image/.test(k))
        .map(([, v]) => v)
    );
  }
  try {
    const ops = await page.getOperatorList();
    return ops.fnArray.some((f) => opsDeImagem.has(f));
  } catch {
    return true; // na dúvida, trata como digitalizada
  }
}

async function renderizarPaginaJpeg(page) {
  const base = page.getViewport({ scale: 1 });
  const escala = Math.max(
    0.3,
    Math.min(3, LARGURA_IMAGEM / base.width, ALTURA_MAX_IMAGEM / base.height)
  );
  const viewport = page.getViewport({ scale: escala });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff"; // JPEG não tem transparência (viraria preto)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    // intent "print": o pdf.js não usa requestAnimationFrame — com "display" a
    // renderização congela se o usuário trocar de aba no meio da leitura.
    await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
    return canvas.toDataURL("image/jpeg", QUALIDADE_JPEG);
  } finally {
    canvas.width = 0; // libera a memória do canvas já
    canvas.height = 0;
  }
}

function erroCancelado() {
  const e = new Error("Leitura cancelada");
  e.name = "AbortError";
  return e;
}

function verificarCancelado(signal) {
  if (signal?.aborted) throw erroCancelado();
}

/** Promise que rejeita assim que o signal abortar (a chamada em voo segue no servidor). */
function comCancelamento(promise, signal) {
  if (!signal) return promise;
  verificarCancelado(signal);
  return new Promise((resolve, reject) => {
    const aoAbortar = () => reject(erroCancelado());
    signal.addEventListener("abort", aoAbortar, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", aoAbortar);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", aoAbortar);
        reject(e);
      }
    );
  });
}

function esperar(ms, signal) {
  return comCancelamento(new Promise((r) => setTimeout(r, ms)), signal);
}

function erroAoAbrirPdf(e, nome) {
  if (e?.name === "PasswordException") {
    return new Error(
      `O PDF "${nome}" está protegido por senha. Abra-o, salve uma cópia sem senha (ex.: "Imprimir → Salvar como PDF") e tente de novo.`
    );
  }
  if (e?.name === "InvalidPDFException" || e?.name === "MissingPDFException") {
    return new Error(`"${nome}" não é um PDF válido ou está corrompido.`);
  }
  return new Error(`Não foi possível abrir "${nome}": ${e?.message || "erro desconhecido"}`);
}

/**
 * Extrai o texto de cada página do PDF. Página com < ~150 caracteres e com
 * imagem = digitalizada → ganha `imagem` (data URL JPEG) para a IA ler.
 *
 * @param {File|Blob} file
 * @param {(p:{etapa:string, atual:number, total:number, texto:string}) => void} [onProgresso]
 * @param {{signal?: AbortSignal, maxEscaneadas?: number, renderizar?: boolean, pdfjs?: object}} [opcoes]
 *   `pdfjs`/`renderizar:false` servem p/ testar no Node (sem canvas).
 * @returns {Promise<{total:number, paginas:{n:number, texto:string, escaneada:boolean, imagem?:string}[]}>}
 */
export async function extrairPaginasPdf(file, onProgresso, opcoes = {}) {
  const {
    signal,
    maxEscaneadas = MAX_PAGINAS_ESCANEADAS,
    renderizar = true,
    pdfjs: pdfjsInjetado,
  } = opcoes;
  const nome = file?.name || "arquivo.pdf";
  const pdfjs = pdfjsInjetado || (await carregarPdfjs());
  const dados = new Uint8Array(await file.arrayBuffer());
  verificarCancelado(signal);

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: dados, isEvalSupported: false }).promise;
  } catch (e) {
    throw erroAoAbrirPdf(e, nome);
  }

  try {
    const total = doc.numPages;
    const paginas = [];
    for (let n = 1; n <= total; n++) {
      verificarCancelado(signal);
      const page = await doc.getPage(n);
      let texto = textoDaPaginaPdf(await page.getTextContent());
      if (texto.length > MAX_CHARS_PAGINA) texto = texto.slice(0, MAX_CHARS_PAGINA) + " […]";
      const escaneada = tamanhoUtil(texto) < MIN_CHARS_TEXTO && (await temImagem(page, pdfjs));
      paginas.push({ n, texto, escaneada });
      page.cleanup();
      onProgresso?.({
        etapa: "pdf",
        atual: n,
        total,
        texto: `Extraindo texto de "${nome}" — página ${n} de ${total}`,
      });
    }

    const escaneadas = paginas.filter((p) => p.escaneada);
    if (escaneadas.length > maxEscaneadas) {
      const semTexto = escaneadas.length === total;
      throw new Error(
        `"${nome}" ${semTexto ? "é" : "tem"} digitalizado (sem texto) em ${escaneadas.length} de ${total} páginas — ` +
          `grande demais para leitura por imagem (limite de ${MAX_PAGINAS_ESCANEADAS} páginas no total). ` +
          "Envie a versão pesquisável do edital (com texto) ou só as páginas de prazos e habilitação."
      );
    }
    if (renderizar && escaneadas.length && typeof document !== "undefined") {
      let i = 0;
      for (const p of escaneadas) {
        verificarCancelado(signal);
        i += 1;
        onProgresso?.({
          etapa: "imagens",
          atual: i,
          total: escaneadas.length,
          texto: `Convertendo páginas digitalizadas de "${nome}" em imagem (${i} de ${escaneadas.length})`,
        });
        const page = await doc.getPage(p.n);
        try {
          p.imagem = await renderizarPaginaJpeg(page);
        } finally {
          page.cleanup();
        }
      }
    }
    return { total, paginas };
  } finally {
    doc.destroy();
  }
}

// ---------------------------------------------------------------------------
// Partes para a IA
// ---------------------------------------------------------------------------
const faixa = (paginas) => {
  const a = paginas[0]?.n;
  const b = paginas[paginas.length - 1]?.n;
  return a === b ? `pág. ${a}` : `págs. ${a}–${b}`;
};

/**
 * Divide as páginas úteis de cada arquivo em partes (uma parte nunca mistura
 * arquivos: a numeração de página é do arquivo). Exportada p/ teste.
 * @param {{nome:string, paginas:{n:number, texto:string, imagem?:string}[]}[]} docs
 */
export function montarPartesEdital(docs) {
  const partes = [];
  for (const d of docs) {
    const uteis = d.paginas.filter((p) => p.imagem || tamanhoUtil(p.texto) > 0);
    if (!uteis.length) continue;
    const chars = uteis.reduce((s, p) => s + (p.texto?.length || 0), 0);
    const imgs = uteis.filter((p) => p.imagem).length;
    if (chars <= LIMITE_PARTE_UNICA && imgs <= IMAGENS_POR_PARTE) {
      partes.push({ nome: d.nome, paginas: uteis });
      continue;
    }
    let atual = null;
    for (const p of uteis) {
      const c = p.texto?.length || 0;
      const ehImg = !!p.imagem;
      const cabe =
        atual &&
        (ehImg ? atual.imgs < IMAGENS_POR_PARTE : atual.txt < PAGINAS_POR_PARTE) &&
        atual.chars + c <= MAX_CHARS_PARTE;
      if (!cabe) {
        atual = { nome: d.nome, paginas: [], chars: 0, imgs: 0, txt: 0 };
        partes.push(atual);
      }
      atual.paginas.push(p);
      atual.chars += c;
      if (ehImg) atual.imgs += 1;
      else atual.txt += 1;
    }
  }
  return partes.map((p) => ({ nome: p.nome, paginas: p.paginas }));
}

async function chamarIa(payload, signal) {
  const { data } = await comCancelamento(sigo.functions.invoke("iaProcessar", payload), signal);
  if (!data || data.success === false) {
    throw new Error(data?.error || "IA indisponível no momento");
  }
  if (!data.resultado || typeof data.resultado !== "object") {
    throw new Error("A IA não devolveu um resultado válido");
  }
  return data.resultado;
}

/** 1 nova tentativa (erro de rede / timeout da edge é comum em parte grande). */
async function chamarIaComRetry(payload, signal) {
  try {
    return await chamarIa(payload, signal);
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    await esperar(2000, signal);
    return chamarIa(payload, signal);
  }
}

async function emParalelo(itens, limite, fn) {
  const resultados = new Array(itens.length);
  let prox = 0;
  const trabalhador = async () => {
    while (prox < itens.length) {
      const i = prox++;
      resultados[i] = await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

// ---------------------------------------------------------------------------
// Normalização do resultado (garante o formato do CONTRATO para a tela)
// ---------------------------------------------------------------------------
const txt = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const bool = (v) => (v === true || v === false ? v : null);

/** "1.234.567,89" / "R$ 1.234,00" / 1234.5 → number | null */
export function numeroDoEdital(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v)
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "213.148" = milhar
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "AAAA-MM-DD" válido (aceita "DD/MM/AAAA") ou null. */
export function dataDoEdital(v) {
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let a, mes, d;
  if (m) [, a, mes, d] = m;
  else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    [, d, mes, a] = m;
  }
  const ai = +a;
  const mi = +mes;
  const di = +d;
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  const dt = new Date(Date.UTC(ai, mi - 1, di));
  if (dt.getUTCMonth() !== mi - 1) return null; // 31/02 etc.
  return `${a}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`;
}

/** "9h", "09:00:00", "14h30" → "HH:MM" ou null. */
export function horaDoEdital(v) {
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/(\d{1,2})\s*[:hH.]\s*(\d{2})/);
  if (!m) m = s.match(/^(\d{1,2})\s*[hH]?$/);
  if (!m) return null;
  const h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const UFS = {
  AC: "acre",
  AL: "alagoas",
  AP: "amapa",
  AM: "amazonas",
  BA: "bahia",
  CE: "ceara",
  DF: "distrito federal",
  ES: "espirito santo",
  GO: "goias",
  MA: "maranhao",
  MT: "mato grosso",
  MS: "mato grosso do sul",
  MG: "minas gerais",
  PA: "para",
  PB: "paraiba",
  PR: "parana",
  PE: "pernambuco",
  PI: "piaui",
  RJ: "rio de janeiro",
  RN: "rio grande do norte",
  RS: "rio grande do sul",
  RO: "rondonia",
  RR: "roraima",
  SC: "santa catarina",
  SP: "sao paulo",
  SE: "sergipe",
  TO: "tocantins",
};
const semAcento = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function ufDoEdital(v) {
  const s = txt(v);
  if (!s) return null;
  const sigla = s.toUpperCase();
  if (UFS[sigla]) return sigla;
  const nome = semAcento(s);
  return Object.keys(UFS).find((k) => UFS[k] === nome) || null;
}

const PREFIXO_ID = {
  tecnica_operacional: "op",
  tecnica_profissional: "pr",
  economica: "ec",
  registros: "rg",
};

const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const pagina = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const dataHora = (o) => ({
  data: dataDoEdital(o?.data),
  hora: horaDoEdital(o?.hora),
  pagina: pagina(o?.pagina),
});

/** Garante o formato do EditalConsolidado (listas, ids únicos, datas válidas). */
export function normalizarEdital(ex = {}, extras = {}) {
  const e = ex && typeof ex === "object" ? ex : {};
  const hab = e.habilitacao || {};
  const habilitacao = {};
  for (const grupo of Object.keys(PREFIXO_ID)) {
    const usados = new Set();
    habilitacao[grupo] = lista(hab[grupo]).map((it, i) => {
      let id = txt(it.id);
      if (!id || usados.has(id)) id = `${PREFIXO_ID[grupo]}${i + 1}`;
      while (usados.has(id)) id += "b";
      usados.add(id);
      return { ...it, id, pagina: pagina(it.pagina) };
    });
  }
  habilitacao.outros_documentos = lista(hab.outros_documentos).map((it) => ({
    ...it,
    pagina: pagina(it.pagina),
  }));
  const vt = e.datas?.visita_tecnica || {};
  const gp = e.garantia_proposta || {};
  const avisos = [
    ...(Array.isArray(e.avisos) ? e.avisos.map(txt).filter(Boolean) : []),
    ...(extras.avisos || []),
  ];
  return {
    ...e,
    orgao: txt(e.orgao),
    cnpj_orgao: txt(e.cnpj_orgao),
    numero_edital: txt(e.numero_edital),
    numero_processo: txt(e.numero_processo),
    modalidade: MODALIDADES_LICITACAO.some((m) => m.valor === e.modalidade) ? e.modalidade : null,
    forma: e.forma === "eletronica" || e.forma === "presencial" ? e.forma : null,
    portal: txt(e.portal),
    objeto: txt(e.objeto),
    titulo_sugerido: txt(e.titulo_sugerido),
    valor_estimado: numeroDoEdital(e.valor_estimado),
    criterio_julgamento: txt(e.criterio_julgamento),
    regime_execucao: txt(e.regime_execucao),
    prazo_execucao: txt(e.prazo_execucao),
    vigencia: txt(e.vigencia),
    local: {
      cidade: txt(e.local?.cidade),
      uf: ufDoEdital(e.local?.uf),
      endereco: txt(e.local?.endereco),
    },
    datas: {
      sessao: dataHora(e.datas?.sessao),
      proposta_limite: dataHora(e.datas?.proposta_limite),
      impugnacao_limite: dataHora(e.datas?.impugnacao_limite),
      esclarecimento_limite: dataHora(e.datas?.esclarecimento_limite),
      visita_tecnica: {
        obrigatoria: bool(vt.obrigatoria),
        data: dataDoEdital(vt.data),
        hora: horaDoEdital(vt.hora),
        descricao: txt(vt.descricao),
        pagina: pagina(vt.pagina),
      },
    },
    garantia_proposta: {
      exigida: bool(gp.exigida),
      percentual: numeroDoEdital(gp.percentual),
      valor: numeroDoEdital(gp.valor),
      pagina: pagina(gp.pagina),
    },
    exclusiva_me_epp: bool(e.exclusiva_me_epp),
    consorcio_permitido: bool(e.consorcio_permitido),
    subcontratacao_permitida: bool(e.subcontratacao_permitida),
    habilitacao,
    itens: lista(e.itens),
    observacoes_importantes: lista(e.observacoes_importantes).map((o) => ({
      ...o,
      pagina: pagina(o.pagina),
    })),
    paginas_lidas: Number(e.paginas_lidas) > 0 ? Number(e.paginas_lidas) : extras.paginasLidas || 0,
    avisos: [...new Set(avisos)],
  };
}

/** Plano B se o "edital_consolidar" falhar: junta as parciais aqui mesmo. */
function mesclarParciais(parciais) {
  const prim = (f) => {
    for (const p of parciais) {
      const v = f(p);
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };
  const juntar = (f) => {
    const vistos = new Set();
    const out = [];
    for (const p of parciais) {
      for (const it of lista(f(p))) {
        const chave = semAcento(it.descricao || it.texto || JSON.stringify(it));
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        out.push({ ...it, id: undefined });
      }
    }
    return out;
  };
  const dataH = (k) => prim((p) => (p.datas?.[k]?.data || p.datas?.[k]?.hora ? p.datas[k] : null));
  const escalares = [
    "orgao",
    "cnpj_orgao",
    "numero_edital",
    "numero_processo",
    "modalidade",
    "forma",
    "portal",
    "objeto",
    "titulo_sugerido",
    "valor_estimado",
    "criterio_julgamento",
    "regime_execucao",
    "prazo_execucao",
    "vigencia",
    "exclusiva_me_epp",
    "consorcio_permitido",
    "subcontratacao_permitida",
  ];
  const r = {};
  for (const k of escalares) r[k] = prim((p) => p[k]);
  r.local = {
    cidade: prim((p) => p.local?.cidade),
    uf: prim((p) => p.local?.uf),
    endereco: prim((p) => p.local?.endereco),
  };
  r.datas = {
    sessao: dataH("sessao"),
    proposta_limite: dataH("proposta_limite"),
    impugnacao_limite: dataH("impugnacao_limite"),
    esclarecimento_limite: dataH("esclarecimento_limite"),
    visita_tecnica: prim((p) => {
      const v = p.datas?.visita_tecnica;
      return v && (v.obrigatoria != null || v.data || v.descricao) ? v : null;
    }),
  };
  r.garantia_proposta = prim((p) =>
    p.garantia_proposta?.exigida != null ? p.garantia_proposta : null
  );
  r.habilitacao = {};
  for (const g of [...Object.keys(PREFIXO_ID), "outros_documentos"]) {
    r.habilitacao[g] = juntar((p) => p.habilitacao?.[g]);
  }
  r.itens = parciais.flatMap((p) => lista(p.itens));
  r.observacoes_importantes = juntar((p) => p.observacoes_importantes);
  r.avisos = parciais.flatMap((p) => (Array.isArray(p.avisos) ? p.avisos : []));
  return r;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Lê os PDFs do edital com a IA.
 * @param {File[]} arquivos edital + TR + anexos (PDF)
 * @param {(p:{etapa:string, atual:number, total:number, texto:string, percentual:number}) => void} [onProgresso]
 * @param {{signal?: AbortSignal}} [opcoes] cancelamento
 * @returns {Promise<object>} EditalConsolidado
 */
export async function lerEdital(arquivos, onProgresso, opcoes = {}) {
  const { signal } = opcoes;
  const pdfs = Array.from(arquivos || []).filter(Boolean);
  if (!pdfs.length) throw new Error("Selecione ao menos um PDF do edital");
  const avisar = (p, pctIni, pctFim) =>
    onProgresso?.({
      ...p,
      percentual: Math.round(pctIni + (pctFim - pctIni) * (p.total ? p.atual / p.total : 0)),
    });

  // 1) Texto de cada PDF (0–25%)
  const docs = [];
  let escaneadasUsadas = 0;
  for (let i = 0; i < pdfs.length; i++) {
    const file = pdfs[i];
    const ini = (25 * i) / pdfs.length;
    const fim = (25 * (i + 1)) / pdfs.length;
    const r = await extrairPaginasPdf(file, (p) => avisar(p, ini, fim), {
      signal,
      maxEscaneadas: MAX_PAGINAS_ESCANEADAS - escaneadasUsadas,
    });
    escaneadasUsadas += r.paginas.filter((p) => p.escaneada).length;
    docs.push({ nome: file.name || `arquivo-${i + 1}.pdf`, total: r.total, paginas: r.paginas });
  }

  const partes = montarPartesEdital(docs);
  if (!partes.length) {
    throw new Error(
      "Não foi possível extrair texto dos PDFs (nem páginas digitalizadas legíveis). Confira os arquivos."
    );
  }
  const avisosLocais = [];
  if (escaneadasUsadas) {
    avisosLocais.push(
      `${escaneadasUsadas} página(s) digitalizada(s) foram lidas como imagem — confira os dados vindos delas.`
    );
  }

  // 2) Cada parte na IA (25–90%), 2 por vez
  let concluidas = 0;
  const total = partes.length;
  avisar({ etapa: "ia", atual: 0, total, texto: `Lendo parte 1 de ${total} com a IA…` }, 25, 90);
  const resultados = await emParalelo(partes, PARTES_EM_PARALELO, async (parte, i) => {
    verificarCancelado(signal);
    avisar(
      {
        etapa: "ia",
        atual: concluidas,
        total,
        texto: `Lendo parte ${i + 1} de ${total} com a IA (${parte.nome}, ${faixa(parte.paginas)})…`,
      },
      25,
      90
    );
    const payload = {
      acao: "edital_extrair_parte",
      nome_arquivo: parte.nome,
      parte: i + 1,
      total_partes: total,
      paginas: parte.paginas
        .filter((p) => tamanhoUtil(p.texto) > 0)
        .map((p) => ({ n: p.n, texto: p.texto })),
    };
    const imagens = parte.paginas
      .filter((p) => p.imagem)
      .map((p) => ({ n: p.n, data_url: p.imagem }));
    if (imagens.length) payload.imagens = imagens;
    try {
      const resultado = await chamarIaComRetry(payload, signal);
      return { ok: true, resultado, paginas: parte.paginas.length };
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      return {
        ok: false,
        erro: e?.message || "erro desconhecido",
        rotulo: `Parte ${i + 1} de ${total} (${parte.nome}, ${faixa(parte.paginas)})`,
      };
    } finally {
      concluidas += 1;
      avisar(
        {
          etapa: "ia",
          atual: concluidas,
          total,
          texto: `${concluidas} de ${total} parte(s) lida(s)`,
        },
        25,
        90
      );
    }
  });

  const ok = resultados.filter((r) => r.ok);
  const falhas = resultados.filter((r) => !r.ok);
  if (!ok.length) {
    throw new Error(`A IA não conseguiu ler o edital: ${falhas[0]?.erro || "erro desconhecido"}`);
  }
  for (const f of falhas) {
    avisosLocais.push(`${f.rotulo} não pôde ser lida (${f.erro}) — confira essas páginas no PDF.`);
  }
  const paginasLidas = ok.reduce((s, r) => s + r.paginas, 0);
  const parciais = ok.map((r) => r.resultado);

  // 3) Consolidação (90–100%)
  verificarCancelado(signal);
  let consolidado;
  if (partes.length === 1) {
    consolidado = parciais[0];
  } else {
    avisar(
      { etapa: "consolidar", atual: 0, total: 1, texto: "Consolidando o resultado das partes…" },
      90,
      100
    );
    try {
      consolidado = await chamarIaComRetry(
        {
          acao: "edital_consolidar",
          parciais,
          nomes_arquivos: docs.map((d) => d.nome),
        },
        signal
      );
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      consolidado = mesclarParciais(parciais);
      avisosLocais.push(
        `A consolidação pela IA falhou (${e?.message || "erro"}); o resultado foi juntado automaticamente — revise com atenção.`
      );
    }
  }
  const final = normalizarEdital(consolidado, { avisos: avisosLocais, paginasLidas });
  avisar({ etapa: "concluido", atual: 1, total: 1, texto: "Leitura concluída" }, 100, 100);
  return final;
}

/**
 * Confere o edital com o acervo técnico/econômico da empresa do token.
 * @param {object} extraido EditalConsolidado
 * @param {{signal?: AbortSignal}} [opcoes]
 * @returns {Promise<object>} AtendeResultado
 */
export async function analisarAtende(extraido, opcoes = {}) {
  if (!extraido || typeof extraido !== "object") throw new Error("Leia o edital antes");
  return chamarIa({ acao: "edital_atende", extraido }, opcoes.signal);
}

const dataBR = (iso) => {
  const [a, m, d] = String(iso || "").split("-");
  return a && m && d ? `${d.slice(0, 2)}/${m}/${a}` : "";
};

/** Texto da visita técnica p/ a coluna licitacao_visita_tecnica. */
function textoVisitaTecnica(vt) {
  if (!vt) return null;
  const partes = [];
  if (vt.obrigatoria === true) partes.push("Obrigatória");
  else if (vt.obrigatoria === false && (vt.data || vt.descricao)) partes.push("Facultativa");
  if (vt.data) partes.push(dataBR(vt.data) + (vt.hora ? ` às ${vt.hora}` : ""));
  if (vt.descricao) partes.push(vt.descricao);
  return partes.length ? partes.join(" — ") : null;
}

function resumir(texto, max = 120) {
  const s = txt(texto)?.replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const esp = corte.lastIndexOf(" ");
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte).replace(/[\s,;:.–-]+$/, "") + "…";
}

/**
 * EditalConsolidado → colunas de public.oportunidade. Só chaves com valor
 * (nada de undefined/null/""), datas "AAAA-MM-DD" e horas "HH:MM" válidas.
 */
export function camposOportunidadeDoEdital(extraido) {
  if (!extraido || typeof extraido !== "object") return {};
  const e = normalizarEdital(extraido);
  const c = {};
  const set = (k, v) => {
    if (v === undefined || v === null || v === "") return;
    if (typeof v === "number" && !Number.isFinite(v)) return;
    c[k] = v;
  };
  const d = e.datas;
  set("nome", resumir(e.titulo_sugerido) || resumir(e.objeto));
  set("orgao", e.orgao);
  set("valor_estimado", e.valor_estimado);
  set("licitacao_modalidade", e.modalidade);
  set("licitacao_numero", e.numero_edital);
  set("licitacao_processo", e.numero_processo);
  set("licitacao_portal", e.portal);
  set("licitacao_forma", e.forma);
  set("licitacao_data", d.sessao.data);
  set("licitacao_horario", d.sessao.hora);
  set("licitacao_data_proposta", d.proposta_limite.data);
  set("licitacao_horario_proposta", d.proposta_limite.hora);
  set("licitacao_data_impugnacao", d.impugnacao_limite.data);
  set("licitacao_horario_impugnacao", d.impugnacao_limite.hora);
  set("licitacao_data_esclarecimento", d.esclarecimento_limite.data);
  set("licitacao_horario_esclarecimento", d.esclarecimento_limite.hora);
  set("licitacao_visita_tecnica", textoVisitaTecnica(d.visita_tecnica));
  set("licitacao_garantia_proposta", e.garantia_proposta.exigida);
  set("licitacao_criterio_julgamento", e.criterio_julgamento);
  set("licitacao_prazo_execucao", e.prazo_execucao);
  set("licitacao_exclusiva_me_epp", e.exclusiva_me_epp);
  set("cidade", e.local.cidade);
  set("estado", e.local.uf);
  set("endereco", e.local.endereco);
  set("descricao", e.objeto);
  return c;
}
