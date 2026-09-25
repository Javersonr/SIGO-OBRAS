/**
 * Acervo técnico — contas e formatação PURAS (sem React/SDK): usadas pela tela
 * AcervoTecnico e testáveis em Node/Vitest com os dados reais.
 *
 * Totais do Resumo: só contam as linhas de SÍNTESE (observacao contém
 * "síntese") dos documentos OPERACIONAIS da empresa — CAT com atestado ('cat')
 * e atestado sem CAT ('atestado'). As linhas "detalhe" já estão dentro da
 * síntese; a CAO repete ARTs das CATs e a CAT profissional é obra de OUTRA
 * empresa — somar qualquer um deles contaria a mesma obra duas vezes.
 */

export const TIPOS_DOC = [
  { id: "cat", label: "CAT", descricao: "CAT com atestado (operacional da empresa)" },
  { id: "atestado", label: "Atestado", descricao: "Atestado sem CAT" },
  { id: "cao", label: "CAO", descricao: "Certidão de acervo operacional" },
  {
    id: "cat_profissional",
    label: "CAT profissional",
    descricao: "CAT do RT em obra de outra empresa",
  },
];
export const TIPOS_OPERACIONAIS = ["cat", "atestado"];
export const labelTipoDoc = (id) => TIPOS_DOC.find((t) => t.id === id)?.label || id || "—";

export const ATIVIDADES = [
  { id: "execucao", label: "Execução" },
  { id: "projeto", label: "Projeto" },
  { id: "consultoria", label: "Consultoria" },
  { id: "fiscalizacao", label: "Fiscalização" },
  { id: "assessoria", label: "Assessoria" },
];
export const labelAtividade = (id) => ATIVIDADES.find((a) => a.id === id)?.label || id;

// Categorias normalizadas (0109) + as que já vieram na carga real.
export const CATEGORIAS = [
  { id: "potencia_kva", label: "Potência (kVA)", unidade: "kVA" },
  { id: "transformador", label: "Transformadores", unidade: "un" },
  { id: "poste", label: "Postes", unidade: "un" },
  { id: "luminaria_ip", label: "Luminárias de IP", unidade: "un" },
  { id: "refletor", label: "Refletores", unidade: "un" },
  { id: "substituicao_luminaria", label: "Substituição de luminárias", unidade: "un" },
  { id: "cabo_mt_protegido", label: "Cabo MT protegido", unidade: "m" },
  { id: "cabo_bt_multiplexado", label: "Cabo BT multiplexado", unidade: "m" },
  { id: "cabo_cobre_bt", label: "Cabo de cobre BT", unidade: "m" },
  { id: "rede_subterranea", label: "Rede subterrânea", unidade: "m" },
  { id: "rede_aerea", label: "Rede aérea", unidade: "m" },
  { id: "spda", label: "SPDA", unidade: "conj" },
  { id: "rele_fotoeletrico", label: "Relés fotoelétricos", unidade: "un" },
  { id: "chave_fusivel", label: "Chaves fusíveis", unidade: "un" },
  { id: "para_raios", label: "Para-raios", unidade: "un" },
  { id: "haste_aterramento", label: "Hastes de aterramento", unidade: "un" },
  { id: "eletroduto", label: "Eletroduto", unidade: "m" },
  { id: "escavacao", label: "Escavação", unidade: "m³" },
  { id: "topografia", label: "Topografia", unidade: "" },
  { id: "terraplenagem", label: "Terraplenagem", unidade: "m²" },
  { id: "calcamento", label: "Calçamento", unidade: "m²" },
  { id: "servico_concessionaria", label: "Serviços na concessionária", unidade: "" },
  { id: "mao_de_obra", label: "Mão de obra", unidade: "" },
  { id: "outro", label: "Outro", unidade: "" },
];
export const labelCategoria = (id) => CATEGORIAS.find((c) => c.id === id)?.label || id || "—";
const ordemCategoria = (id) => {
  const i = CATEGORIAS.findIndex((c) => c.id === id);
  return i < 0 ? 999 : i;
};

// Cards do Resumo, na ordem de exibição ("categorias" pode somar mais de uma).
export const CARDS_RESUMO = [
  {
    id: "kva",
    titulo: "Potência em transformadores",
    categorias: ["potencia_kva"],
    unidade: "kVA",
  },
  { id: "postes", titulo: "Postes", categorias: ["poste"], unidade: "un" },
  {
    id: "luminarias",
    titulo: "Luminárias IP + refletores",
    categorias: ["luminaria_ip", "refletor"],
    unidade: "un",
  },
  { id: "cabo_mt", titulo: "Cabo MT protegido", categorias: ["cabo_mt_protegido"], unidade: "m" },
  {
    id: "cabo_bt",
    titulo: "Cabo BT multiplexado",
    categorias: ["cabo_bt_multiplexado"],
    unidade: "m",
  },
  { id: "cabo_cobre", titulo: "Cabo de cobre BT", categorias: ["cabo_cobre_bt"], unidade: "m" },
  {
    id: "subterranea",
    titulo: "Rede subterrânea",
    categorias: ["rede_subterranea"],
    unidade: "m",
  },
];

/** minúsculas e sem acento (mesma regra de lib/busca, sem depender do alias "@/"). */
export function semAcento(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const ehSintese = (q) => semAcento(q?.observacao).includes("sintese");

const SINONIMOS_UNIDADE = {
  und: "un",
  unid: "un",
  unidade: "un",
  unidades: "un",
  pc: "un",
  peca: "un",
  pecas: "un",
  metro: "m",
  metros: "m",
};
/** Chave de unidade para somar ("kVA" e "kva" são a mesma; "unidade" = "un"). */
export function normalizarUnidade(u) {
  const s = semAcento(u).trim().replace(/\.$/, "");
  return SINONIMOS_UNIDADE[s] || s;
}

const arred = (n, casas = 3) => {
  const f = 10 ** casas;
  return Math.round((Number(n) || 0) * f) / f;
};

function temNumero(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
}

function acumular(alvo, cat, un, n) {
  if (!alvo[cat]) alvo[cat] = {};
  alvo[cat][un] = (alvo[cat][un] || 0) + n;
}

/** Maior soma de UMA obra para as categorias/unidade dadas (soCat: só CATs). */
function tetoPorObra(porDoc, docs, categorias, un, soCat = false) {
  let teto = null;
  for (const [id, cats] of Object.entries(porDoc)) {
    if (soCat && docs.get(id)?.tipo !== "cat") continue;
    const v = categorias.reduce((s, c) => s + (cats[c]?.[un] || 0), 0);
    if (v > 0 && (!teto || v > teto.quantidade)) {
      teto = { quantidade: arred(v), atestado: docs.get(id) };
    }
  }
  return teto;
}

/**
 * Teto geral + o maior só entre CATs quando o geral é atestado sem CAT
 * (muito edital exige atestado registrado no CREA).
 */
function tetos(porDoc, docs, categorias, un) {
  const teto = tetoPorObra(porDoc, docs, categorias, un);
  const tetoCat =
    teto && teto.atestado?.tipo !== "cat" ? tetoPorObra(porDoc, docs, categorias, un, true) : null;
  return { teto, tetoCat };
}

/**
 * Totais e tetos por obra única do acervo operacional.
 * Cada teto = { quantidade|valor, atestado }; tetoCat só vem quando o teto
 * geral é um atestado sem CAT.
 * @returns {{ documentos, sinteses, valorTotal, semValor, tetoValor, tetoValorCat, cards, demais }}
 */
export function calcularResumo(atestados = [], quantitativos = []) {
  const docs = new Map();
  for (const a of atestados || []) {
    if (a && !a.deleted_at && TIPOS_OPERACIONAIS.includes(a.tipo)) docs.set(a.id, a);
  }

  const soma = {}; // categoria → unidade → soma
  const porDoc = {}; // atestado_id → categoria → unidade → soma
  const rotulo = {}; // unidade normalizada → como foi digitada (1ª vez)
  let sinteses = 0;
  for (const q of quantitativos || []) {
    if (!q || q.deleted_at || !docs.has(q.atestado_id) || !ehSintese(q)) continue;
    if (!temNumero(q.quantidade)) continue;
    const n = Number(q.quantidade);
    const cat = q.categoria || "outro";
    const un = normalizarUnidade(q.unidade);
    if (!(un in rotulo)) rotulo[un] = String(q.unidade ?? "").trim();
    sinteses++;
    acumular(soma, cat, un, n);
    if (!porDoc[q.atestado_id]) porDoc[q.atestado_id] = {};
    acumular(porDoc[q.atestado_id], cat, un, n);
  }

  const cards = CARDS_RESUMO.map((card) => {
    const un = normalizarUnidade(card.unidade);
    let total = 0;
    const outras = {};
    for (const c of card.categorias) {
      for (const [u, v] of Object.entries(soma[c] || {})) {
        if (u === un) total += v;
        else outras[u] = (outras[u] || 0) + v;
      }
    }
    return {
      ...card,
      total: arred(total),
      // sínteses da categoria lançadas noutra unidade: não entram no total
      outras: Object.entries(outras).map(([u, v]) => ({
        unidade: rotulo[u] || u,
        quantidade: arred(v),
      })),
      ...tetos(porDoc, docs, card.categorias, un),
    };
  });

  let valorTotal = 0;
  let semValor = 0;
  let tetoValor = null;
  let tetoValorCat = null;
  for (const a of docs.values()) {
    if (!temNumero(a.valor)) {
      semValor++;
      continue;
    }
    const v = Number(a.valor);
    valorTotal += v;
    if (!tetoValor || v > tetoValor.valor) tetoValor = { valor: v, atestado: a };
    if (a.tipo === "cat" && (!tetoValorCat || v > tetoValorCat.valor)) {
      tetoValorCat = { valor: v, atestado: a };
    }
  }
  if (tetoValor?.atestado?.tipo === "cat") tetoValorCat = null;

  const nosCards = new Set(CARDS_RESUMO.flatMap((c) => c.categorias));
  const demais = [];
  for (const [cat, unidades] of Object.entries(soma)) {
    if (nosCards.has(cat)) continue;
    for (const [un, v] of Object.entries(unidades)) {
      demais.push({
        categoria: cat,
        unidade: rotulo[un] || un,
        total: arred(v),
        ...tetos(porDoc, docs, [cat], un),
      });
    }
  }
  demais.sort(
    (a, b) =>
      ordemCategoria(a.categoria) - ordemCategoria(b.categoria) ||
      a.unidade.localeCompare(b.unidade)
  );

  return {
    documentos: docs.size,
    sinteses,
    valorTotal: arred(valorTotal, 2),
    semValor,
    tetoValor,
    tetoValorCat,
    cards,
    demais,
  };
}

// ---------------------------------------------------------------------------
// Formatação (pt-BR). Datas "AAAA-MM-DD" por split — new Date() cai 1 dia no fuso BR.
// ---------------------------------------------------------------------------
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export const fmtMoeda = (v) => (temNumero(v) ? BRL.format(Number(v)) : "—");
export const fmtNumero = (v) => (temNumero(v) ? NUM.format(Number(v)) : "—");
export function fmtIndice(v) {
  if (!temNumero(v)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(Number(v));
}

export function fmtData(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d ? `${d}/${m}/${a}` : String(iso);
}

export function fmtPeriodo(inicio, fim) {
  if (!inicio && !fim) return "—";
  if (inicio && fim) return `${fmtData(inicio)} a ${fmtData(fim)}`;
  return inicio ? `desde ${fmtData(inicio)}` : `até ${fmtData(fim)}`;
}

const pad = (n) => String(n).padStart(2, "0");
/** Hoje no fuso do navegador, "AAAA-MM-DD". */
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function partes(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
}

/** Dias de `hoje` até `iso` (negativo = já passou); null se data inválida. */
export function diasAte(iso, hoje = hojeISO()) {
  const a = partes(hoje);
  const b = partes(iso);
  if (!a || !b) return null;
  return Math.round((Date.UTC(...b) - Date.UTC(...a)) / 86400000);
}

/** Situação de uma validade: vencida (< hoje), vence_logo (≤ 30 dias) ou ok. */
export function statusValidade(iso, hoje = hojeISO()) {
  const d = diasAte(iso, hoje);
  if (d === null) return null;
  if (d < 0) return { status: "vencida", dias: d, texto: `vencida há ${-d} dia(s)` };
  if (d <= 30) {
    return {
      status: "vence_logo",
      dias: d,
      texto: d === 0 ? "vence hoje" : `vence em ${d} dia(s)`,
    };
  }
  return { status: "ok", dias: d, texto: `válida até ${fmtData(iso)}` };
}

// ---------------------------------------------------------------------------
// Conversão de campos de formulário → colunas
// ---------------------------------------------------------------------------
export function textoOuNull(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** Aceita "1234.5", "1.234,50" e "1234,5"; vazio/inválido → null. */
export function numeroOuNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v)
    .trim()
    .replace(/\s|R\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function inteiroOuNull(v) {
  const n = numeroOuNull(v);
  return n === null ? null : Math.trunc(n);
}

/** Texto único para a busca da lista de documentos. */
export function textoBuscaDocumento(a) {
  return [
    a.numero,
    a.art_numero,
    a.contratante,
    a.contratante_cnpj,
    a.contrato,
    a.cidade,
    a.uf,
    a.objeto,
    a.profissional_nome,
    a.empresa_executora,
    a.conselho,
    ...(Array.isArray(a.codigos_crea)
      ? a.codigos_crea.map((c) => `${c?.codigo || ""} ${c?.descricao || ""}`)
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

/** "CAT nº 3031672/2023" / "Atestado s/ nº". */
export function rotuloDocumento(a) {
  if (!a) return "—";
  return `${labelTipoDoc(a.tipo)} ${a.numero ? `nº ${a.numero}` : "s/ nº"}`;
}

/** "Araxá/MG" (ou o contratante, se não houver cidade). */
export function localDocumento(a) {
  if (a?.cidade) return [a.cidade, a.uf].filter(Boolean).join("/");
  return a?.contratante || a?.uf || "";
}

/** A ART registra execução? false = explicitamente sem; null = não informado. */
export function semExecucao(a) {
  if (a?.com_execucao === false) return true;
  if (a?.com_execucao === true) return false;
  const ativ = Array.isArray(a?.atividades) ? a.atividades : [];
  return ativ.length > 0 && !ativ.includes("execucao");
}
