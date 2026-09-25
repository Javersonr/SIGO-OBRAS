/**
 * edital-regras — regras PURAS (sem rede, sem banco, sem Deno) da leitura de
 * edital e do "Atende?":
 *   - saneamento do JSON (vindo do modelo OU do front) no formato do contrato;
 *   - junção das partes (dedup exata, conflitos, errata tem prioridade);
 *   - totais/tetos do acervo a partir das linhas "síntese";
 *   - econômico-financeiro decidido em código;
 *   - montagem do AtendeResultado (ajustes de regra, pendências, riscos, alertas).
 * Sem imports externos: dá para transpilar com esbuild e testar em Node.
 */
import {
  FORMAS,
  MODALIDADES,
  STATUS_ATENDE,
  TIPOS_ECONOMICA,
  TIPOS_REGISTRO,
  type AtendeResultado,
  type DataHora,
  type EditalConsolidado,
  type ExigenciaEconomica,
  type ExigenciaOperacional,
  type ExigenciaProfissional,
  type ExigenciaRegistro,
  type GrupoAtende,
  type ItemAtende,
  type RespostaTecnica,
  type StatusAtende,
} from "./edital-schemas.ts";

// ─── Utilitários ────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

export const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pad = (n: number) => String(n).padStart(2, "0");

/** minúsculas, sem acento, espaços simples */
export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function texto(v: unknown, max = 2000): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || /^(null|undefined|n\/a|-+)$/i.test(s)) return null;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** número de number ou string ("400000.00", "1.234,56", "R$ 10,5") */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/[R$\s%]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function inteiroPositivo(v: unknown): number | null {
  const n = numero(v);
  return n === null || n < 1 ? null : Math.round(n);
}

function booleano(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = normalizar(v);
  if (["true", "sim", "s"].includes(s)) return true;
  if (["false", "nao", "n"].includes(s)) return false;
  return null;
}

function opcao<T extends string>(v: unknown, validos: readonly T[]): T | null {
  const s = normalizar(v).replace(/\s+/g, "_");
  return (validos as readonly string[]).includes(s) ? (s as T) : null;
}

/** "AAAA-MM-DD" (aceita também DD/MM/AAAA); inválida → null */
export function dataISO(v: unknown): string | null {
  const s = texto(v, 40);
  if (!s) return null;
  let a: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    a = +iso[1];
    m = +iso[2];
    d = +iso[3];
  } else {
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!br) return null;
    d = +br[1];
    m = +br[2];
    a = +br[3];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2100) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

/** "HH:MM" (aceita 9h, 9h30, 09:00:00, 14:30h) */
export function horaHHMM(v: unknown): string | null {
  const s = texto(v, 20);
  if (!s) return null;
  const r = s.match(/^(\d{1,2})(?:\s*[:hH]\s*(\d{2})?)?(?::\d{2})?\s*(?:h|hs|min)?$/i);
  if (!r) return null;
  const h = +r[1];
  const mi = +(r[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  return `${pad(h)}:${pad(mi)}`;
}

function uf(v: unknown): string | null {
  const s = (texto(v, 10) ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" sem Date (não cai 1 dia no fuso) */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

const FMT_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FMT_NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const brl = (n: number) => FMT_BRL.format(n);
export const fmtNum = (n: number) => FMT_NUM.format(n);
const arred2 = (n: number) => Math.round(n * 100) / 100;

/** remove textos repetidos (comparação sem acento/caixa), mantém a ordem */
export function dedupTextos(lista: unknown[], max = 2000): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const x of lista) {
    const t = texto(x, max);
    if (!t) continue;
    const k = normalizar(t);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(t);
  }
  return out;
}

/** Conta valores "preenchidos" (não-null/não-vazios) numa estrutura JSON. */
export function contarPreenchidos(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (Array.isArray(v)) return v.reduce((s: number, x) => s + contarPreenchidos(x), 0);
  if (typeof v === "object") {
    return Object.values(v as Obj).reduce((s: number, x) => s + contarPreenchidos(x), 0);
  }
  return 1;
}

const STOPWORDS = new Set(
  (
    "de da do das dos em para com por que uma um ou e a o as os no na nos nas ao aos se sua seu suas seus " +
    "pelo pela pelos pelas entre sobre sob ate apos como mais menos sera serao deve devera deverao ser " +
    "servico execucao obra fornecimento instalacao implantacao atestado capacidade tecnica tecnico " +
    "comprovacao quantidade minimo minima similar caracteristica compativel parcela relevancia maior " +
    "empresa licitante sistema tipo total conforme item itens edital anexo referencia termo objeto"
  ).split(" ")
);

/** palavras-chave (sem acento, sem stopword, plural simples) */
export function palavrasChave(v: unknown): Set<string> {
  const out = new Set<string>();
  for (let p of normalizar(v).split(/[^a-z0-9]+/)) {
    if (p.length < 4 || /^\d+$/.test(p)) continue;
    if (p.length > 5 && p.endsWith("s")) p = p.slice(0, -1);
    if (STOPWORDS.has(p)) continue;
    out.add(p);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ─── Saneamento do EditalConsolidado ────────────────────────────────────────

function dataHora(v: unknown): DataHora {
  const d = obj(v);
  return { data: dataISO(d.data), hora: horaHHMM(d.hora), pagina: inteiroPositivo(d.pagina) };
}

/** Garante o formato do contrato (tipos, enums, listas) para qualquer entrada. */
export function sanearEdital(x: unknown): EditalConsolidado {
  const o = obj(x);
  const loc = obj(o.local);
  const dt = obj(o.datas);
  const vt = obj(dt.visita_tecnica);
  const g = obj(o.garantia_proposta);
  const h = obj(o.habilitacao);
  const valorPositivo = (v: unknown) => {
    const n = numero(v);
    return n !== null && n > 0 ? n : null;
  };

  const tecnica_operacional: ExigenciaOperacional[] = arr(h.tecnica_operacional)
    .map((y) => {
      const e = obj(y);
      return {
        id: texto(e.id, 20) ?? "",
        descricao: texto(e.descricao, 1500) ?? texto(e.servico, 1500) ?? "",
        servico: texto(e.servico, 500),
        quantidade: numero(e.quantidade),
        unidade: texto(e.unidade, 40),
        percentual_minimo: numero(e.percentual_minimo),
        somatorio_permitido: booleano(e.somatorio_permitido),
        exige_execucao: booleano(e.exige_execucao),
        pagina: inteiroPositivo(e.pagina),
        trecho: texto(e.trecho, 800),
      };
    })
    .filter((e) => e.descricao);

  const tecnica_profissional: ExigenciaProfissional[] = arr(h.tecnica_profissional)
    .map((y) => {
      const e = obj(y);
      return {
        id: texto(e.id, 20) ?? "",
        descricao: texto(e.descricao, 1500) ?? texto(e.servico, 1500) ?? "",
        profissional: texto(e.profissional, 300),
        servico: texto(e.servico, 500),
        quantidade: numero(e.quantidade),
        unidade: texto(e.unidade, 40),
        pagina: inteiroPositivo(e.pagina),
        trecho: texto(e.trecho, 800),
      };
    })
    .filter((e) => e.descricao);

  const economica: ExigenciaEconomica[] = arr(h.economica).map((y) => {
    const e = obj(y);
    return {
      id: texto(e.id, 20) ?? "",
      tipo: opcao(e.tipo, TIPOS_ECONOMICA) ?? "outro",
      valor_minimo: numero(e.valor_minimo),
      percentual_do_estimado: numero(e.percentual_do_estimado),
      exercicio: texto(e.exercicio, 100),
      descricao: texto(e.descricao, 1000),
      pagina: inteiroPositivo(e.pagina),
      trecho: texto(e.trecho, 800),
    };
  });

  const registros: ExigenciaRegistro[] = arr(h.registros).map((y) => {
    const e = obj(y);
    return {
      id: texto(e.id, 20) ?? "",
      tipo: opcao(e.tipo, TIPOS_REGISTRO) ?? "outro",
      descricao: texto(e.descricao, 1000),
      pagina: inteiroPositivo(e.pagina),
    };
  });

  return {
    orgao: texto(o.orgao, 300),
    cnpj_orgao: texto(o.cnpj_orgao, 30),
    numero_edital: texto(o.numero_edital, 80),
    numero_processo: texto(o.numero_processo, 80),
    modalidade: opcao(o.modalidade, MODALIDADES),
    forma: opcao(o.forma, FORMAS),
    portal: texto(o.portal, 300),
    objeto: texto(o.objeto, 3000),
    titulo_sugerido: texto(o.titulo_sugerido, 120),
    valor_estimado: valorPositivo(o.valor_estimado),
    criterio_julgamento: texto(o.criterio_julgamento, 300),
    regime_execucao: texto(o.regime_execucao, 300),
    prazo_execucao: texto(o.prazo_execucao, 300),
    vigencia: texto(o.vigencia, 300),
    local: { cidade: texto(loc.cidade, 120), uf: uf(loc.uf), endereco: texto(loc.endereco, 300) },
    datas: {
      sessao: dataHora(dt.sessao),
      proposta_limite: dataHora(dt.proposta_limite),
      impugnacao_limite: dataHora(dt.impugnacao_limite),
      esclarecimento_limite: dataHora(dt.esclarecimento_limite),
      visita_tecnica: {
        obrigatoria: booleano(vt.obrigatoria),
        data: dataISO(vt.data),
        hora: horaHHMM(vt.hora),
        descricao: texto(vt.descricao, 800),
        pagina: inteiroPositivo(vt.pagina),
      },
    },
    garantia_proposta: {
      exigida: booleano(g.exigida),
      percentual: numero(g.percentual),
      valor: valorPositivo(g.valor),
      pagina: inteiroPositivo(g.pagina),
    },
    exclusiva_me_epp: booleano(o.exclusiva_me_epp),
    consorcio_permitido: booleano(o.consorcio_permitido),
    subcontratacao_permitida: booleano(o.subcontratacao_permitida),
    habilitacao: {
      tecnica_operacional,
      tecnica_profissional,
      economica,
      registros,
      outros_documentos: arr(h.outros_documentos)
        .map((y) => {
          const e = obj(y);
          return { descricao: texto(e.descricao, 800) ?? "", pagina: inteiroPositivo(e.pagina) };
        })
        .filter((e) => e.descricao),
    },
    itens: arr(o.itens)
      .map((y) => {
        const e = obj(y);
        return {
          lote: texto(e.lote, 40),
          item: texto(e.item, 40),
          descricao: texto(e.descricao, 600),
          quantidade: numero(e.quantidade),
          unidade: texto(e.unidade, 40),
          valor_unitario: numero(e.valor_unitario),
          valor_total: numero(e.valor_total),
        };
      })
      .filter((e) => e.descricao || e.item)
      .slice(0, 300),
    observacoes_importantes: arr(o.observacoes_importantes)
      .map((y) => {
        const e = obj(y);
        return { texto: texto(e.texto, 800) ?? "", pagina: inteiroPositivo(e.pagina) };
      })
      .filter((e) => e.texto)
      .slice(0, 40),
    paginas_lidas: Math.max(0, Math.round(numero(o.paginas_lidas) ?? 0)),
    avisos: dedupTextos(arr(o.avisos), 600).slice(0, 60),
  };
}

/** ids estáveis por ordem: op1…, pr1…, ec1…, rg1… */
export function renumerarIds(e: EditalConsolidado): EditalConsolidado {
  e.habilitacao.tecnica_operacional.forEach((x, i) => (x.id = `op${i + 1}`));
  e.habilitacao.tecnica_profissional.forEach((x, i) => (x.id = `pr${i + 1}`));
  e.habilitacao.economica.forEach((x, i) => (x.id = `ec${i + 1}`));
  e.habilitacao.registros.forEach((x, i) => (x.id = `rg${i + 1}`));
  return e;
}

/** zera "pagina" que não é de nenhuma página enviada (o modelo não inventa página) */
export function limparPaginas(v: unknown, validas: Set<number>): void {
  if (Array.isArray(v)) {
    for (const x of v) limparPaginas(x, validas);
    return;
  }
  if (!v || typeof v !== "object") return;
  const o = v as Obj;
  for (const [k, x] of Object.entries(o)) {
    if (k === "pagina" && typeof x === "number" && !validas.has(x)) o[k] = null;
    else if (x && typeof x === "object") limparPaginas(x, validas);
  }
}

/**
 * Tira as entradas de SUMÁRIO ("8.4 Qualificação técnica ........ 12") do texto
 * normalizado: do início da entrada (ponto anterior, fim da entrada anterior ou
 * até 150 caracteres antes) até o nº da página depois dos pontilhados. O(n).
 */
export function semSumario(t: string): string {
  const re = /(?:\.\s?|…\s?){4,}\s*\d{1,4}(?![\d,])|_{4,}\s*\d{1,4}(?![\d,])/g;
  let out = "";
  let ult = 0;
  for (const m of t.matchAll(re)) {
    const i = m.index ?? 0;
    const ini = Math.max(ult, i - 150, t.lastIndexOf(".", i - 1) + 1);
    out += t.slice(ult, ini) + " ";
    ult = i + m[0].length;
  }
  return out + t.slice(ult);
}

// termo que indica a seção × "cara de exigência" perto dele (sem contar o termo)
const RE_TERMO_TECNICA =
  /qualificacao tecnica|capacidade tecnic|acervo tecnico|atestados? de capacidade/g;
const RE_CARA_TECNICA =
  /atestad|\bcats?\b|certidao de acervo|acervo tecnico|parcelas? de maior relevancia|quantitativ|quantidades?\b|\d\s*%|por cento|tecnico[- ]?(operacional|profissional)/;
const RE_TERMO_ECONOMICA =
  /patrimonio liquido|capital social minimo|indice de liquidez|liquidez (geral|corrente)|capital circulante/g;
const RE_CARA_ECONOMICA =
  /\d\s*%|por cento|r\$\s*\d|\bminim[oa]\b|igual ou (superior|maior)|superior a|maior (ou igual )?(que|a)\b|>=|≥|\b\d+,\d{1,2}\b|\bindices?\b|\b(lg|lc|sg)\s*=/;

/** alguma ocorrência do termo tem cara de exigência nos arredores (80 antes, 250 depois)? */
function mencaoComCara(t: string, termo: RegExp, cara: RegExp): boolean {
  for (const m of t.matchAll(termo)) {
    const i = m.index ?? 0;
    const fim = i + m[0].length;
    if (cara.test(`${t.slice(Math.max(0, i - 80), i)} ${t.slice(fim, fim + 250)}`)) return true;
  }
  return false;
}

/**
 * Por que a parcial é "fraca": quase vazia, ou calada sobre exigência técnica /
 * econômica que o texto claramente traz. A simples menção ("qualificação
 * técnica" num sumário ou numa lista de documentos) não conta: precisa de cara
 * de exigência por perto (atestado, CAT, parcela de maior relevância, %, R$…).
 */
export type MotivoFraca = "quase_vazia" | "tecnica" | "economica";

export function motivosFraca(
  p: EditalConsolidado,
  textoPaginas: string,
  temImagens: boolean
): MotivoFraca[] {
  const out: MotivoFraca[] = [];
  const { avisos: _a, paginas_lidas: _p, ...util } = p;
  const pontos = contarPreenchidos(util);
  if ((textoPaginas.length > 1500 || temImagens) && pontos < 3) out.push("quase_vazia");
  const h = p.habilitacao;
  const semTecnica = !h.tecnica_operacional.length && !h.tecnica_profissional.length;
  const semEconomica = !h.economica.length;
  if (!semTecnica && !semEconomica) return out;
  const t = semSumario(normalizar(textoPaginas));
  if (semTecnica && mencaoComCara(t, RE_TERMO_TECNICA, RE_CARA_TECNICA)) out.push("tecnica");
  if (semEconomica && mencaoComCara(t, RE_TERMO_ECONOMICA, RE_CARA_ECONOMICA))
    out.push("economica");
  return out;
}

export function parcialFraca(
  p: EditalConsolidado,
  textoPaginas: string,
  temImagens: boolean
): boolean {
  return motivosFraca(p, textoPaginas, temImagens).length > 0;
}

// ─── Junção das partes ──────────────────────────────────────────────────────

export interface OrigemParcial {
  nome_arquivo: string | null;
  parte: number | null;
  total_partes: number | null;
  errata: boolean;
}

export const ehErrata = (nome: unknown) =>
  /errata|retifica|adendo|aditamento|republica/.test(normalizar(nome));

/** origem gravada pela edital_extrair_parte em resultado._origem (se o front devolveu) */
export function origemDaParcial(x: unknown, nomeAlternativo: string | null): OrigemParcial {
  const o = obj(obj(x)._origem);
  const nome = texto(o.nome_arquivo, 300) ?? nomeAlternativo;
  return {
    nome_arquivo: nome,
    parte: inteiroPositivo(o.parte),
    total_partes: inteiroPositivo(o.total_partes),
    errata: o.errata === true || ehErrata(nome),
  };
}

export function rotuloOrigem(o: OrigemParcial): string {
  const nome = o.nome_arquivo ?? "arquivo";
  return o.total_partes && o.total_partes > 1 ? `${nome} parte ${o.parte}/${o.total_partes}` : nome;
}

interface Candidato<T> {
  v: T;
  origem: OrigemParcial;
  pagina: number | null;
}

const ondeEsta = (c: Candidato<unknown>) =>
  `${rotuloOrigem(c.origem)}${c.pagina ? `, p. ${c.pagina}` : ""}`;

/** Errata vence; senão o valor mais frequente (empate → primeiro). Registra conflito. */
function escolher<T>(
  campo: string,
  cands: Candidato<T>[],
  chave: (v: T) => string,
  fmt: (v: T) => string,
  conflitos: string[]
): Candidato<T> | null {
  if (!cands.length) return null;
  const grupos = new Map<string, Candidato<T>[]>();
  for (const c of cands) {
    const k = chave(c.v);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  }
  const erratas = cands.filter((c) => c.origem.errata);
  let escolhido: Candidato<T>;
  if (erratas.length) {
    escolhido = erratas[erratas.length - 1];
  } else {
    let melhor: Candidato<T>[] = [];
    for (const g of grupos.values()) if (g.length > melhor.length) melhor = g;
    escolhido = melhor[0];
  }
  if (grupos.size > 1) {
    const kEsc = chave(escolhido.v);
    const outros = [...grupos.entries()]
      .filter(([k]) => k !== kEsc)
      .map(([, g]) => `${fmt(g[0].v)} (${ondeEsta(g[0])})`);
    conflitos.push(
      `${campo}: usado ${fmt(escolhido.v)} (${ondeEsta(escolhido)}${escolhido.origem.errata ? ", errata" : ""}) em vez de ${outros.join("; ")} — confira`
    );
  }
  return escolhido;
}

/** junta listas removendo repetição exata (fica a versão mais completa, na 1ª posição) */
function juntar<T>(
  itens: { x: T; origem: OrigemParcial }[],
  chave: (x: T) => string,
  origens: WeakMap<object, string>
): T[] {
  const out: T[] = [];
  const pos = new Map<string, number>();
  for (const { x, origem } of itens) {
    const k = chave(x);
    const i = pos.get(k);
    if (i === undefined) {
      pos.set(k, out.length);
      out.push(x);
      origens.set(
        x as unknown as object,
        rotuloOrigem(origem) + (origem.errata ? " (errata)" : "")
      );
    } else if (contarPreenchidos(x) > contarPreenchidos(out[i])) {
      out[i] = x;
      origens.set(
        x as unknown as object,
        rotuloOrigem(origem) + (origem.errata ? " (errata)" : "")
      );
    }
  }
  return out;
}

const soDigitos = (v: unknown) =>
  String(v ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");

/** quantos pares de exigências parecem a mesma (texto parecido / mesmo tipo) */
export function contarDuplicatasSuspeitas(h: EditalConsolidado["habilitacao"]): number {
  let n = 0;
  const pares = <T>(lista: T[], txt: (x: T) => string) => {
    const kws = lista.map((x) => palavrasChave(txt(x)));
    for (let i = 0; i < kws.length; i++) {
      for (let j = i + 1; j < kws.length; j++) if (jaccard(kws[i], kws[j]) >= 0.6) n++;
    }
  };
  pares(h.tecnica_operacional, (e) => `${e.servico ?? ""} ${e.descricao}`);
  pares(h.tecnica_profissional, (e) => `${e.profissional ?? ""} ${e.servico ?? ""} ${e.descricao}`);
  const repetidos = (lista: { tipo: string }[]) => {
    const vistos = new Set<string>();
    for (const e of lista) {
      if (e.tipo !== "outro" && vistos.has(e.tipo)) n++;
      vistos.add(e.tipo);
    }
  };
  repetidos(h.economica);
  repetidos(h.registros);
  return n;
}

export interface Juncao {
  rascunho: EditalConsolidado;
  conflitos: string[];
  suspeitas: number;
  /** objeto da exigência → "arquivo parte x/y (errata)" (para o prompt de consolidação) */
  origens: WeakMap<object, string>;
}

/** Junta as parciais em código: escolhe escalares, deduplica listas, soma páginas. */
export function juntarParciais(
  parciais: { edital: EditalConsolidado; origem: OrigemParcial }[]
): Juncao {
  const conflitos: string[] = [];
  const origens = new WeakMap<object, string>();
  // texto descritivo: 1º não-nulo, partes normais antes das erratas
  const ordenadas = [
    ...parciais.filter((p) => !p.origem.errata),
    ...parciais.filter((p) => p.origem.errata),
  ];
  const primeiroTexto = (get: (e: EditalConsolidado) => string | null) => {
    for (const p of ordenadas) {
      const v = get(p.edital);
      if (v) return v;
    }
    return null;
  };
  const cands = <T>(
    get: (e: EditalConsolidado) => T | null,
    pag?: (e: EditalConsolidado) => number | null
  ) =>
    parciais
      .map((p) => ({ v: get(p.edital), origem: p.origem, pagina: pag ? pag(p.edital) : null }))
      .filter((c): c is Candidato<T> => c.v !== null && c.v !== undefined);
  const simNao = (b: boolean) => (b ? "sim" : "não");

  const escolherData = (campo: string, get: (e: EditalConsolidado) => DataHora): DataHora => {
    let cs = cands(
      (e) => (get(e).data ? get(e) : null),
      (e) => get(e).pagina
    );
    // mesma data sem hora × com hora: fica a mais específica, sem conflito
    cs = cs.filter((c) => c.v.hora || !cs.some((o) => o.v.data === c.v.data && o.v.hora));
    const esc = escolher(
      campo,
      cs,
      (v) => `${v.data} ${v.hora ?? ""}`,
      (v) => `${fmtData(v.data)}${v.hora ? ` ${v.hora}` : ""}`,
      conflitos
    );
    return esc ? { ...esc.v } : { data: null, hora: null, pagina: null };
  };
  const escolherValor = <T>(
    campo: string,
    get: (e: EditalConsolidado) => T | null,
    fmt: (v: T) => string,
    chave?: (v: T) => string
  ) => escolher(campo, cands(get), chave ?? ((v) => String(v)), fmt, conflitos)?.v ?? null;

  const vtData = escolherData("visita técnica", (e) => e.datas.visita_tecnica);
  const descricoesVisita = cands(
    (e) => e.datas.visita_tecnica.descricao,
    (e) => e.datas.visita_tecnica.pagina
  );
  const descricaoVisita = descricoesVisita.sort((a, b) => b.v.length - a.v.length)[0] ?? null;

  const hab = (get: (e: EditalConsolidado) => unknown[]) =>
    parciais.flatMap((p) => get(p.edital).map((x) => ({ x, origem: p.origem })));

  const h = {
    tecnica_operacional: juntar(
      hab((e) => e.habilitacao.tecnica_operacional) as {
        x: ExigenciaOperacional;
        origem: OrigemParcial;
      }[],
      (e) => `${normalizar(e.servico || e.descricao)}|${e.quantidade}|${normalizar(e.unidade)}`,
      origens
    ),
    tecnica_profissional: juntar(
      hab((e) => e.habilitacao.tecnica_profissional) as {
        x: ExigenciaProfissional;
        origem: OrigemParcial;
      }[],
      (e) =>
        `${normalizar(e.profissional)}|${normalizar(e.servico || e.descricao)}|${e.quantidade}`,
      origens
    ),
    economica: juntar(
      hab((e) => e.habilitacao.economica) as { x: ExigenciaEconomica; origem: OrigemParcial }[],
      (e) =>
        `${e.tipo}|${e.valor_minimo}|${e.percentual_do_estimado}|${e.tipo === "outro" ? normalizar(e.descricao) : ""}`,
      origens
    ),
    registros: juntar(
      hab((e) => e.habilitacao.registros) as { x: ExigenciaRegistro; origem: OrigemParcial }[],
      (e) => `${e.tipo}|${normalizar(e.descricao)}`,
      origens
    ),
    outros_documentos: juntar(
      hab((e) => e.habilitacao.outros_documentos) as {
        x: { descricao: string; pagina: number | null };
        origem: OrigemParcial;
      }[],
      (e) => normalizar(e.descricao).slice(0, 200),
      origens
    ),
  };

  const rascunho: EditalConsolidado = {
    orgao: primeiroTexto((e) => e.orgao),
    cnpj_orgao: escolherValor(
      "CNPJ do órgão",
      (e) => e.cnpj_orgao,
      (v) => v,
      soDigitos
    ),
    numero_edital: escolherValor(
      "nº do edital",
      (e) => e.numero_edital,
      (v) => v,
      soDigitos
    ),
    numero_processo: escolherValor(
      "nº do processo",
      (e) => e.numero_processo,
      (v) => v,
      soDigitos
    ),
    modalidade: escolherValor(
      "modalidade",
      (e) => e.modalidade,
      (v) => v
    ),
    forma: escolherValor(
      "forma",
      (e) => e.forma,
      (v) => v
    ),
    portal: primeiroTexto((e) => e.portal),
    objeto: primeiroTexto((e) => e.objeto),
    titulo_sugerido: primeiroTexto((e) => e.titulo_sugerido),
    valor_estimado: escolherValor("valor estimado", (e) => e.valor_estimado, brl),
    criterio_julgamento: primeiroTexto((e) => e.criterio_julgamento),
    regime_execucao: primeiroTexto((e) => e.regime_execucao),
    prazo_execucao: primeiroTexto((e) => e.prazo_execucao),
    vigencia: primeiroTexto((e) => e.vigencia),
    local: {
      cidade: primeiroTexto((e) => e.local.cidade),
      uf: primeiroTexto((e) => e.local.uf),
      endereco: primeiroTexto((e) => e.local.endereco),
    },
    datas: {
      sessao: escolherData("sessão", (e) => e.datas.sessao),
      proposta_limite: escolherData("limite de proposta", (e) => e.datas.proposta_limite),
      impugnacao_limite: escolherData("limite de impugnação", (e) => e.datas.impugnacao_limite),
      esclarecimento_limite: escolherData(
        "limite de esclarecimento",
        (e) => e.datas.esclarecimento_limite
      ),
      visita_tecnica: {
        obrigatoria: escolherValor(
          "visita técnica obrigatória",
          (e) => e.datas.visita_tecnica.obrigatoria,
          simNao
        ),
        data: vtData.data,
        hora: vtData.hora,
        descricao: descricaoVisita?.v ?? null,
        pagina: vtData.pagina ?? descricaoVisita?.pagina ?? null,
      },
    },
    garantia_proposta: {
      exigida: escolherValor("garantia de proposta", (e) => e.garantia_proposta.exigida, simNao),
      percentual: escolherValor(
        "% da garantia",
        (e) => e.garantia_proposta.percentual,
        (v) => `${fmtNum(v)}%`
      ),
      valor: escolherValor("valor da garantia", (e) => e.garantia_proposta.valor, brl),
      pagina: cands((e) => e.garantia_proposta.pagina)[0]?.v ?? null,
    },
    exclusiva_me_epp: escolherValor("exclusiva ME/EPP", (e) => e.exclusiva_me_epp, simNao),
    consorcio_permitido: escolherValor("consórcio", (e) => e.consorcio_permitido, simNao),
    subcontratacao_permitida: escolherValor(
      "subcontratação",
      (e) => e.subcontratacao_permitida,
      simNao
    ),
    habilitacao: h,
    itens: juntar(
      parciais.flatMap((p) => p.edital.itens.map((x) => ({ x, origem: p.origem }))),
      (i) => `${normalizar(i.lote)}|${normalizar(i.item)}|${normalizar(i.descricao).slice(0, 120)}`,
      origens
    ).slice(0, 300),
    observacoes_importantes: juntar(
      parciais.flatMap((p) =>
        p.edital.observacoes_importantes.map((x) => ({ x, origem: p.origem }))
      ),
      (o) => normalizar(o.texto).slice(0, 200),
      origens
    ).slice(0, 40),
    paginas_lidas: parciais.reduce((s, p) => s + (p.edital.paginas_lidas || 0), 0),
    avisos: dedupTextos(
      parciais.flatMap((p) => p.edital.avisos),
      600
    ).slice(0, 60),
  };
  return { rascunho, conflitos, suspeitas: contarDuplicatasSuspeitas(h), origens };
}

/** Preenche com a fonte o que o alvo deixou null (o modelo não pode "perder" dado). */
export function completarNulos(alvo: Obj, fonte: Obj): void {
  for (const [k, v] of Object.entries(fonte)) {
    if (Array.isArray(v)) continue;
    const atual = alvo[k];
    if (
      (atual === null || atual === undefined) &&
      v !== null &&
      v !== undefined &&
      typeof v !== "object"
    ) {
      alvo[k] = v;
    } else if (
      v &&
      typeof v === "object" &&
      atual &&
      typeof atual === "object" &&
      !Array.isArray(atual)
    ) {
      const a = atual as Obj;
      const f = v as Obj;
      // data/hora/página andam juntas: não mistura a hora de uma com a data de outra
      if ("data" in f && "data" in a) {
        if (a.data == null && f.data != null) alvo[k] = { ...f };
        continue;
      }
      completarNulos(a, f);
    }
  }
}

// ─── Acervo: tipos, apelidos, totais e tetos ────────────────────────────────

export interface AcervoPerfil {
  razao_social_anterior?: string | null;
  registro_crea_pj?: string | null;
  porte?: string | null;
  capital_social?: number | string | null;
  capital_social_data?: string | null;
  patrimonio_liquido?: number | string | null;
  pl_data_base?: string | null;
  ccl?: number | string | null;
  liquidez_corrente?: number | string | null;
  liquidez_geral?: number | string | null;
  solvencia_geral?: number | string | null;
  endividamento_geral?: number | string | null;
  exercicio_balanco?: number | string | null;
  balanco_registro?: string | null;
  faturamento?: unknown;
  cadastros?: unknown;
  certidoes?: unknown;
  alertas?: unknown;
  observacoes?: string | null;
}

export interface AcervoProfissional {
  id?: string;
  nome?: string | null;
  registro?: string | null;
  titulos?: string | null;
  atribuicoes?: string | null;
  restricoes?: string | null;
  vinculo_desde?: string | null;
  responsavel_tecnico?: boolean | null;
  ativo?: boolean | null;
  observacoes?: string | null;
}

export interface AcervoAtestado {
  id: string;
  tipo: string; // cat | atestado | cao | cat_profissional
  numero?: string | null;
  conselho?: string | null;
  art_numero?: string | null;
  contratante?: string | null;
  valor?: number | string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  objeto?: string | null;
  cidade?: string | null;
  uf?: string | null;
  codigos_crea?: unknown;
  atividades?: unknown;
  com_execucao?: boolean | null;
  situacao?: string | null;
  profissional_nome?: string | null;
  empresa_executora?: string | null;
  cobre_arts?: unknown;
  riscos?: string | null;
  observacoes?: string | null;
  ordem?: number | null;
}

export interface AcervoQuantitativo {
  atestado_id: string;
  categoria?: string | null;
  descricao?: string | null;
  quantidade?: number | string | null;
  unidade?: string | null;
  especificacao?: string | null;
  na_atividade_tecnica?: boolean | null;
  observacao?: string | null;
  ordem?: number | null;
}

export interface Acervo {
  perfil: AcervoPerfil | null;
  profissionais: AcervoProfissional[];
  atestados: AcervoAtestado[];
  quantitativos: AcervoQuantitativo[];
}

export interface Apelidos {
  /** alias = "[AT1]", como aparece no prompt */
  lista: { alias: string; a: AcervoAtestado }[];
  /** chave canônica "AT1" (sem colchetes) → atestado; use atestadoDoApelido() */
  porAlias: Map<string, AcervoAtestado>;
  /** id → "[AT1]" */
  aliasDoId: Map<string, string>;
}

const ORDEM_TIPO: Record<string, number> = { cat: 0, atestado: 1, cao: 2, cat_profissional: 3 };

/** "[AT7]", "AT7", " at-7 " → "AT7" (chave de porAlias); qualquer outra coisa → null */
export function chaveApelido(v: unknown): string | null {
  const m = String(v ?? "")
    .trim()
    .toUpperCase()
    .match(/^\[?\s*AT\s*-?\s*(\d{1,4})\s*\]?$/);
  return m ? `AT${Number(m[1])}` : null;
}

export function atestadoDoApelido(ap: Apelidos, v: unknown): AcervoAtestado | undefined {
  const k = chaveApelido(v);
  return k ? ap.porAlias.get(k) : undefined;
}

/**
 * [AT1], [AT2]… (curto p/ o modelo; o id real nunca sai do servidor pelo
 * modelo). Colchetes + "AT" não colidem com termos do setor ("Grupo A4",
 * subgrupo A1/A3a, "AT" solto de alta tensão).
 */
export function apelidarAtestados(atestados: AcervoAtestado[]): Apelidos {
  const ordenados = [...atestados].sort(
    (x, y) =>
      (ORDEM_TIPO[x.tipo] ?? 9) - (ORDEM_TIPO[y.tipo] ?? 9) ||
      (x.ordem ?? 1e9) - (y.ordem ?? 1e9) ||
      String(x.numero ?? "").localeCompare(String(y.numero ?? ""))
  );
  const lista = ordenados.map((a, i) => ({ alias: `[AT${i + 1}]`, a }));
  return {
    lista,
    porAlias: new Map(lista.map((l, i) => [`AT${i + 1}`, l.a])),
    aliasDoId: new Map(lista.map((l) => [l.a.id, l.alias])),
  };
}

export function rotuloAtestado(a: AcervoAtestado): string {
  const tipo =
    { cat: "CAT", atestado: "Atestado s/ CAT", cao: "CAO", cat_profissional: "CAT profissional" }[
      a.tipo
    ] ?? "Atestado";
  return `${tipo} ${a.numero || "s/ nº"}${a.contratante ? ` – ${a.contratante}` : ""}`;
}

const ehSintese = (q: AcervoQuantitativo) => normalizar(q.observacao).includes("sintese");

/** unidade canônica + fator (km → m ×1000, MVA → kVA ×1000) */
export function normalizarUnidade(u: unknown): { unidade: string; fator: number } {
  const s = normalizar(u).replace(/\.$/, "");
  if (!s) return { unidade: "(sem unidade)", fator: 1 };
  if (
    ["un", "und", "unid", "unidade", "unidades", "ud", "pc", "pca", "peca", "pecas", "pç"].includes(
      s
    )
  ) {
    return { unidade: "un", fator: 1 };
  }
  if (s === "km") return { unidade: "m", fator: 1000 };
  if (["m", "ml", "metro", "metros"].includes(s)) return { unidade: "m", fator: 1 };
  if (["m2", "m²"].includes(s)) return { unidade: "m²", fator: 1 };
  if (["m3", "m³"].includes(s)) return { unidade: "m³", fator: 1 };
  if (s === "kva") return { unidade: "kVA", fator: 1 };
  if (s === "mva") return { unidade: "kVA", fator: 1000 };
  if (["conj", "conjunto", "conjuntos", "cj"].includes(s)) return { unidade: "conj", fator: 1 };
  if (["jogo", "jogos", "jg"].includes(s)) return { unidade: "jogo", fator: 1 };
  if (["ponto", "pontos", "pt"].includes(s)) return { unidade: "ponto", fator: 1 };
  return { unidade: s, fator: 1 };
}

export interface Teto {
  quantidade: number;
  atestado_id: string;
  alias: string;
  rotulo: string;
  tipo: string;
  profissional: string | null;
}

export interface TotalCategoria {
  categoria: string;
  unidade: string;
  /** só CATs da empresa (tipo cat) */
  total_cat: number;
  obras_cat: number;
  /** parte do total_cat que consta na atividade técnica da ART */
  total_cat_na_art: number;
  /** só CATs cuja ART registra execução (com_execucao ≠ false) */
  total_cat_execucao: number;
  /** CAT + atestado sem CAT */
  total_operacional: number;
  obras_operacional: number;
  teto_cat: Teto | null;
  /** maior obra única entre as CATs com execução */
  teto_cat_execucao: Teto | null;
  teto_operacional: Teto | null;
  /** CATs em nome do profissional (cat + cat_profissional) */
  teto_profissional: Teto | null;
}

export interface ValorObra {
  valor: number;
  atestado_id: string;
  alias: string;
  rotulo: string;
}

export interface Totais {
  categorias: TotalCategoria[];
  maior_valor_cat: ValorObra | null;
  maior_valor_operacional: ValorObra | null;
  maior_valor_profissional: ValorObra | null;
  soma_valores_cat: number;
  soma_valores_operacional: number;
  qtd: { cat: number; atestado: number; cao: number; cat_profissional: number };
}

/**
 * Totais por categoria = soma das SÍNTESES (1 por categoria por obra);
 * teto = maior quantidade numa obra única. Linhas "detalhe" não entram.
 */
export function calcularTotais(acervo: Acervo, apelidos: Apelidos): Totais {
  const porId = new Map(acervo.atestados.map((a) => [a.id, a]));
  // chave categoria|unidade → atestado_id → { qtd, naArt }
  const mapa = new Map<
    string,
    { categoria: string; unidade: string; obras: Map<string, { qtd: number; naArt: number }> }
  >();
  for (const q of acervo.quantitativos) {
    if (!ehSintese(q)) continue;
    const a = porId.get(q.atestado_id);
    const qtd = numero(q.quantidade);
    if (!a || qtd === null || qtd <= 0) continue; // atestado de outra empresa/removido: ignora
    const categoria = texto(q.categoria, 60) ?? "outro";
    const { unidade, fator } = normalizarUnidade(q.unidade);
    const k = `${categoria}|${unidade}`;
    if (!mapa.has(k)) mapa.set(k, { categoria, unidade, obras: new Map() });
    const obras = mapa.get(k)!.obras;
    const atual = obras.get(a.id) ?? { qtd: 0, naArt: 0 };
    atual.qtd += qtd * fator;
    if (q.na_atividade_tecnica) atual.naArt += qtd * fator;
    obras.set(a.id, atual);
  }

  const teto = (obras: [AcervoAtestado, number][]): Teto | null => {
    let melhor: [AcervoAtestado, number] | null = null;
    for (const o of obras) if (!melhor || o[1] > melhor[1]) melhor = o;
    if (!melhor) return null;
    const [a, qtd] = melhor;
    return {
      quantidade: arred3(qtd),
      atestado_id: a.id,
      alias: apelidos.aliasDoId.get(a.id) ?? "?",
      rotulo: rotuloAtestado(a),
      tipo: a.tipo,
      profissional: texto(a.profissional_nome, 120),
    };
  };

  const categorias: TotalCategoria[] = [];
  for (const { categoria, unidade, obras } of mapa.values()) {
    const lista = [...obras.entries()].map(([id, v]) => ({ a: porId.get(id)!, ...v }));
    const cat = lista.filter((o) => o.a.tipo === "cat");
    const catExec = cat.filter((o) => o.a.com_execucao !== false);
    const oper = lista.filter((o) => o.a.tipo === "cat" || o.a.tipo === "atestado");
    const prof = lista.filter((o) => o.a.tipo === "cat" || o.a.tipo === "cat_profissional");
    categorias.push({
      categoria,
      unidade,
      total_cat: arred3(cat.reduce((s, o) => s + o.qtd, 0)),
      obras_cat: cat.length,
      total_cat_na_art: arred3(cat.reduce((s, o) => s + o.naArt, 0)),
      total_cat_execucao: arred3(catExec.reduce((s, o) => s + o.qtd, 0)),
      total_operacional: arred3(oper.reduce((s, o) => s + o.qtd, 0)),
      obras_operacional: oper.length,
      teto_cat: teto(cat.map((o): [AcervoAtestado, number] => [o.a, o.qtd])),
      teto_cat_execucao: teto(catExec.map((o): [AcervoAtestado, number] => [o.a, o.qtd])),
      teto_operacional: teto(oper.map((o): [AcervoAtestado, number] => [o.a, o.qtd])),
      teto_profissional: teto(prof.map((o): [AcervoAtestado, number] => [o.a, o.qtd])),
    });
  }
  categorias.sort(
    (x, y) => x.categoria.localeCompare(y.categoria) || x.unidade.localeCompare(y.unidade)
  );

  const maiorValor = (tipos: string[]): ValorObra | null => {
    let melhor: ValorObra | null = null;
    for (const a of acervo.atestados) {
      const v = numero(a.valor);
      if (!tipos.includes(a.tipo) || v === null || v <= 0) continue;
      if (!melhor || v > melhor.valor) {
        melhor = {
          valor: v,
          atestado_id: a.id,
          alias: apelidos.aliasDoId.get(a.id) ?? "?",
          rotulo: rotuloAtestado(a),
        };
      }
    }
    return melhor;
  };
  const somaValores = (tipos: string[]) =>
    arred2(
      acervo.atestados
        .filter((a) => tipos.includes(a.tipo))
        .reduce((s, a) => s + (numero(a.valor) ?? 0), 0)
    );
  const conta = (t: string) => acervo.atestados.filter((a) => a.tipo === t).length;

  return {
    categorias,
    maior_valor_cat: maiorValor(["cat"]),
    maior_valor_operacional: maiorValor(["cat", "atestado"]),
    maior_valor_profissional: maiorValor(["cat", "cat_profissional"]),
    soma_valores_cat: somaValores(["cat"]),
    soma_valores_operacional: somaValores(["cat", "atestado"]),
    qtd: {
      cat: conta("cat"),
      atestado: conta("atestado"),
      cao: conta("cao"),
      cat_profissional: conta("cat_profissional"),
    },
  };
}

function arred3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export interface SinteseObra {
  categoria: string;
  /** unidade canônica (normalizarUnidade) */
  unidade: string;
  /** já convertida para a unidade canônica */
  qtd: number;
}

/** sínteses de cada atestado, somadas por categoria|unidade canônica (mesma regra de calcularTotais) */
export function sintesesPorAtestado(acervo: Acervo): Map<string, SinteseObra[]> {
  const out = new Map<string, SinteseObra[]>();
  for (const q of acervo.quantitativos) {
    if (!ehSintese(q)) continue;
    const qtd = numero(q.quantidade);
    if (qtd === null || qtd <= 0) continue;
    const categoria = texto(q.categoria, 60) ?? "outro";
    const { unidade, fator } = normalizarUnidade(q.unidade);
    const lista = out.get(q.atestado_id) ?? [];
    const atual = lista.find((s) => s.categoria === categoria && s.unidade === unidade);
    if (atual) atual.qtd += qtd * fator;
    else lista.push({ categoria, unidade, qtd: qtd * fator });
    out.set(q.atestado_id, lista);
  }
  return out;
}

// unidades que não identificam o serviço sozinhas (várias categorias usam)
const UNIDADES_GENERICAS = new Set([
  "un",
  "m",
  "m²",
  "m³",
  "(sem unidade)",
  "conj",
  "jogo",
  "ponto",
]);

/** "transformadore" (plural cortado) casa com "transformador"; "cabos" com "cabo" */
const casaPalavra = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 4 &&
    Math.abs(a.length - b.length) <= 2 &&
    (a.startsWith(b) || b.startsWith(a)));

/**
 * Categoria das sínteses que corresponde à exigência: TODAS as palavras da
 * categoria ("cabo_mt_protegido" → cabo, protegido) aparecem no texto da
 * exigência; entre as que casam, a mais específica (mais palavras). Empate ou
 * nenhuma → só vale a unidade quando ela é específica (kVA) e só uma categoria
 * a usa. Ambíguo → null (quem chama não recalcula).
 */
export function categoriaDaExigencia(
  textoExigencia: string,
  unidade: string,
  categorias: string[]
): string | null {
  const unicas = [...new Set(categorias)];
  if (!unicas.length) return null;
  const kw = [...palavrasChave(textoExigencia)];
  const cobertas = unicas
    .map((c) => ({ c, palavras: [...palavrasChave(c.replace(/_/g, " "))] }))
    .filter((x) => x.palavras.length && x.palavras.every((p) => kw.some((k) => casaPalavra(k, p))));
  if (cobertas.length) {
    const max = Math.max(...cobertas.map((x) => x.palavras.length));
    const topo = cobertas.filter((x) => x.palavras.length === max);
    return topo.length === 1 ? topo[0].c : null;
  }
  return unicas.length === 1 && !UNIDADES_GENERICAS.has(unidade) ? unicas[0] : null;
}

/**
 * Recalcula uma exigência técnico-operacional só com os atestados que
 * sobraram (depois de tirar CAT profissional / sem execução), pelas sínteses:
 * somatório PERMITIDO → soma; VEDADO → teto por obra; edital não diz → teto
 * atende, e se só a soma atender, "ressalva". Não alcança → "verificar".
 * null = não dá para recalcular (categoria ambígua / sem unidade compatível).
 */
export function recalcularOperacional(
  x: Pick<
    ExigenciaOperacional,
    "descricao" | "servico" | "quantidade" | "unidade" | "somatorio_permitido"
  >,
  restantes: AcervoAtestado[],
  removidos: AcervoAtestado[],
  sinteses: Map<string, SinteseObra[]>
): { status: StatusAtende; nota: string } | null {
  const { unidade, fator } = normalizarUnidade(x.unidade ?? "un");
  const u = unidade === "(sem unidade)" ? "un" : unidade;
  const exigido = x.quantidade !== null && x.quantidade > 0 ? arred3(x.quantidade * fator) : null;
  const doCitado = (a: AcervoAtestado) => (sinteses.get(a.id) ?? []).filter((s) => s.unidade === u);
  const categorias = [...restantes, ...removidos].flatMap((a) =>
    doCitado(a).map((s) => s.categoria)
  );
  const categoria = categoriaDaExigencia(`${x.servico ?? ""} ${x.descricao}`, u, categorias);
  if (!categoria) return null;

  // só o que conta como operacional: CAT da empresa e atestado s/ CAT
  const obras = restantes
    .filter((a) => a.tipo === "cat" || a.tipo === "atestado")
    .map((a) => ({ a, qtd: doCitado(a).find((s) => s.categoria === categoria)?.qtd ?? 0 }))
    .filter((o) => o.qtd > 0);
  const soma = arred3(obras.reduce((s, o) => s + o.qtd, 0));
  const teto = arred3(obras.reduce((m, o) => Math.max(m, o.qtd), 0));
  const sem = `sem ${removidos.map(rotuloCurto).join(", ")}`;
  const fmt = (n: number) => `${fmtNum(n)} ${u}`;
  const base = `recalculado ${sem}: ${categoria} nas demais citadas = soma ${fmt(soma)}, teto por obra ${fmt(teto)}`;

  if (exigido === null) {
    return soma > 0
      ? { status: "atende", nota: `${base} (edital sem quantidade mínima)` }
      : { status: "verificar", nota: `${base} — as demais não comprovam ${categoria}` };
  }
  const alvo = `exigido ${fmt(exigido)}`;
  if (x.somatorio_permitido === true) {
    return soma >= exigido
      ? { status: "atende", nota: `${base}; somatório permitido, ${alvo}` }
      : {
          status: "verificar",
          nota: `${base}; a soma não alcança o ${alvo} — confira outras CATs`,
        };
  }
  if (teto >= exigido) return { status: "atende", nota: `${base}; ${alvo} numa obra única` };
  if (x.somatorio_permitido === null && soma >= exigido) {
    return {
      status: "ressalva",
      nota: `${base}; ${alvo} só somando atestados (o edital não diz se aceita somatório)`,
    };
  }
  return {
    status: "verificar",
    nota: `${base}; não alcança o ${alvo}${x.somatorio_permitido === false ? " em obra única (somatório vedado)" : ""} — confira outras CATs`,
  };
}

// ─── Blocos de texto do prompt do "Atende?" ─────────────────────────────────

const simNaoTxt = (b: boolean | null | undefined, nulo = "não informado") =>
  b === true ? "sim" : b === false ? "não" : nulo;
const cortar = (s: unknown, max: number) => texto(s, max) ?? "";

export function blocoExigencias(e: EditalConsolidado): string {
  const linhas: string[] = [];
  const qtd = (q: number | null, u: string | null) =>
    q !== null ? `${fmtNum(q)} ${u ?? ""}`.trim() : "não informada";
  for (const x of e.habilitacao.tecnica_operacional) {
    linhas.push(
      [
        `${x.id} [técnico-operacional] ${cortar(x.descricao, 600)}`,
        x.servico ? `serviço: ${cortar(x.servico, 200)}` : "",
        `qtd mínima: ${qtd(x.quantidade, x.unidade)}`,
        x.percentual_minimo !== null ? `% mínimo citado: ${fmtNum(x.percentual_minimo)}%` : "",
        `somatório: ${x.somatorio_permitido === true ? "PERMITIDO" : x.somatorio_permitido === false ? "VEDADO (atestado único)" : "edital não diz"}`,
        `exige execução: ${simNaoTxt(x.exige_execucao)}`,
        x.pagina ? `p. ${x.pagina}` : "",
        x.trecho ? `trecho: "${cortar(x.trecho, 350)}"` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }
  for (const x of e.habilitacao.tecnica_profissional) {
    linhas.push(
      [
        `${x.id} [técnico-profissional] ${cortar(x.descricao, 600)}`,
        x.profissional ? `profissional: ${cortar(x.profissional, 150)}` : "",
        x.servico ? `serviço: ${cortar(x.servico, 200)}` : "",
        x.quantidade !== null ? `qtd: ${qtd(x.quantidade, x.unidade)}` : "",
        x.pagina ? `p. ${x.pagina}` : "",
        x.trecho ? `trecho: "${cortar(x.trecho, 350)}"` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }
  for (const x of e.habilitacao.registros) {
    linhas.push(
      [
        `${x.id} [registro: ${x.tipo}] ${cortar(x.descricao, 500)}`,
        x.pagina ? `p. ${x.pagina}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }
  const ctx = [
    `Objeto: ${cortar(e.objeto, 800) || "não informado"}`,
    `Órgão: ${e.orgao ?? "?"} | Local: ${[e.local.cidade, e.local.uf].filter(Boolean).join("/") || "?"}`,
    `Valor estimado: ${e.valor_estimado !== null ? brl(e.valor_estimado) : "não informado"}`,
    `Consórcio: ${simNaoTxt(e.consorcio_permitido)} | Subcontratação: ${simNaoTxt(e.subcontratacao_permitida)}`,
  ];
  const docs = e.habilitacao.outros_documentos
    .slice(0, 15)
    .map((d) => `- ${cortar(d.descricao, 250)}`);
  const obs = e.observacoes_importantes.slice(0, 15).map((o) => `- ${cortar(o.texto, 300)}`);
  return [
    ...ctx,
    "",
    "EXIGÊNCIAS A AVALIAR:",
    ...linhas,
    ...(docs.length ? ["", "Outros documentos de habilitação (contexto):", ...docs] : []),
    ...(obs.length ? ["", "Observações importantes do edital (contexto):", ...obs] : []),
  ].join("\n");
}

function linhaCodigosCrea(v: unknown): string {
  return arr(v)
    .map((y) => {
      const c = obj(y);
      const q = numero(c.quantidade);
      return `${cortar(c.codigo, 20)} ${cortar(c.descricao, 90)}${q !== null ? ` = ${fmtNum(q)} ${cortar(c.unidade, 15)}` : ""}`.trim();
    })
    .filter(Boolean)
    .join("; ");
}

/** Detalhes de planilha que compartilham palavras com as exigências (só apoio). */
export function detalhesRelevantes(
  acervo: Acervo,
  apelidos: Apelidos,
  e: EditalConsolidado,
  limite = 80
): string[] {
  const chaves = new Set<string>();
  for (const x of e.habilitacao.tecnica_operacional)
    for (const k of palavrasChave(`${x.servico ?? ""} ${x.descricao}`)) chaves.add(k);
  for (const x of e.habilitacao.tecnica_profissional)
    for (const k of palavrasChave(`${x.servico ?? ""} ${x.descricao}`)) chaves.add(k);
  if (!chaves.size) return [];
  const minimo = chaves.size <= 3 ? 1 : 2;
  const achados: { alias: string; linha: string; pontos: number }[] = [];
  for (const q of acervo.quantitativos) {
    if (ehSintese(q)) continue;
    const alias = apelidos.aliasDoId.get(q.atestado_id);
    if (!alias) continue;
    const kws = palavrasChave(`${q.descricao ?? ""} ${q.especificacao ?? ""} ${q.categoria ?? ""}`);
    let pontos = 0;
    for (const k of kws) if (chaves.has(k)) pontos++;
    if (pontos < minimo) continue;
    const qtd = numero(q.quantidade);
    achados.push({
      alias,
      pontos: pontos + (q.na_atividade_tecnica ? 0.5 : 0),
      linha: `${alias}: ${cortar(q.descricao, 140)}${qtd !== null ? ` — ${fmtNum(qtd)} ${cortar(q.unidade, 12)}` : ""}${q.na_atividade_tecnica ? " [ART]" : ""}`,
    });
  }
  return achados
    .sort((x, y) => y.pontos - x.pontos)
    .slice(0, limite)
    .map((x) => `- ${x.linha}`);
}

export function blocoAcervo(
  acervo: Acervo,
  apelidos: Apelidos,
  totais: Totais,
  empresa: { nome: string | null; uf: string | null },
  detalhes: string[]
): string {
  const p: AcervoPerfil = acervo.perfil ?? {};
  const out: string[] = [];
  out.push(`EMPRESA: ${empresa.nome ?? "?"}${empresa.uf ? ` (sede ${empresa.uf})` : ""}`);
  out.push(
    `PERFIL: CREA PJ ${p.registro_crea_pj ?? "não cadastrado"} | porte ${p.porte ?? "?"}` +
      (p.razao_social_anterior ? ` | razão social anterior: ${p.razao_social_anterior}` : "")
  );
  const cads = arr(p.cadastros).map((y) => {
    const c = obj(y);
    const grupos = arr(c.grupos)
      .map((gy) => {
        const g = obj(gy);
        return `${cortar(g.codigo, 12)} ${cortar(g.descricao, 80)}${g.validade ? ` (até ${fmtData(dataISO(g.validade))})` : ""}`;
      })
      .join("; ");
    return `- ${cortar(c.orgao, 120)} cód. ${cortar(c.codigo, 30)} | ${cortar(c.situacao, 30)}${c.validade ? ` | validade ${fmtData(dataISO(c.validade))}` : ""}${grupos ? ` | grupos: ${grupos}` : ""}${c.ressalvas ? ` | ressalvas: ${cortar(c.ressalvas, 400)}` : ""}`;
  });
  if (cads.length) out.push("CADASTROS:", ...cads);
  const certs = arr(p.certidoes).map((y) => {
    const c = obj(y);
    return `- ${cortar(c.tipo, 150)}${c.numero ? ` nº ${cortar(c.numero, 40)}` : ""}${c.validade ? ` (validade ${fmtData(dataISO(c.validade))})` : ""}`;
  });
  if (certs.length) out.push("CERTIDÕES:", ...certs);

  out.push("QUADRO TÉCNICO (acervo_profissional):");
  if (!acervo.profissionais.length) out.push("- nenhum profissional cadastrado");
  for (const pr of acervo.profissionais) {
    out.push(
      `- ${pr.nome ?? "?"} | ${cortar(pr.registro, 80)} | ${cortar(pr.titulos, 200)}` +
        (pr.atribuicoes ? ` | atribuições: ${cortar(pr.atribuicoes, 200)}` : "") +
        (pr.restricoes ? ` | restrições: ${cortar(pr.restricoes, 300)}` : "") +
        ` | vínculo desde ${pr.vinculo_desde ? fmtData(pr.vinculo_desde) : "não informado"}` +
        ` | RT: ${simNaoTxt(pr.responsavel_tecnico)} | ativo: ${simNaoTxt(pr.ativo)}`
    );
  }
  if (p.observacoes)
    out.push("OBSERVAÇÕES/REGRAS DA EMPRESA (cadastro do acervo):", cortar(p.observacoes, 6000));
  const alertas = dedupTextos(arr(p.alertas), 500);
  if (alertas.length) out.push("ALERTAS DA EMPRESA:", ...alertas.map((a) => `- ${a}`));

  // sínteses por atestado
  const sinteses = new Map<string, string[]>();
  for (const q of acervo.quantitativos) {
    if (!ehSintese(q)) continue;
    const qtd = numero(q.quantidade);
    if (qtd === null) continue;
    const l = sinteses.get(q.atestado_id) ?? [];
    l.push(
      `${q.categoria ?? "outro"} ${fmtNum(qtd)} ${q.unidade ?? ""}${q.na_atividade_tecnica ? " [ART]" : ""}`.trim()
    );
    sinteses.set(q.atestado_id, l);
  }
  // ARTs → apelido (para dizer o que cada CAO cobre)
  const aliasDaArt = new Map<string, string>();
  for (const { alias, a } of apelidos.lista) {
    const art = normalizar(a.art_numero).replace(/[^a-z0-9]/g, "");
    if (art) aliasDaArt.set(art, alias);
  }

  out.push("", "ATESTADOS (cite somente estes códigos):");
  for (const { alias, a } of apelidos.lista) {
    const valor = numero(a.valor);
    const periodo =
      a.data_inicio || a.data_fim
        ? `${fmtData(a.data_inicio) || "?"} a ${fmtData(a.data_fim) || "?"}`
        : "";
    out.push(
      [
        `${alias} | ${rotuloAtestado(a)}${a.conselho ? ` (${a.conselho})` : ""} | tipo ${a.tipo}`,
        valor !== null ? brl(valor) : "",
        periodo,
        a.situacao === "em_andamento" ? "EM ANDAMENTO" : "concluída",
        `execução na ART: ${simNaoTxt(a.com_execucao)}`,
        arr(a.atividades).length ? `atividades: ${arr(a.atividades).join(", ")}` : "",
        a.empresa_executora ? `executora: ${cortar(a.empresa_executora, 80)}` : "",
        a.profissional_nome ? `profissional: ${cortar(a.profissional_nome, 80)}` : "",
        a.cidade || a.uf ? [a.cidade, a.uf].filter(Boolean).join("/") : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
    const cods = linhaCodigosCrea(a.codigos_crea);
    if (cods) out.push(`   atividade técnica da ART: ${cods}`);
    const s = sinteses.get(a.id);
    if (s?.length) out.push(`   sínteses: ${s.join("; ")}`);
    if (a.objeto) out.push(`   objeto: ${cortar(a.objeto, 260)}`);
    if (a.tipo === "cao") {
      const cobre = arr(a.cobre_arts).map((x) =>
        aliasDaArt.get(normalizar(x).replace(/[^a-z0-9]/g, ""))
      );
      const achados = [...new Set(cobre.filter(Boolean))];
      out.push(
        `   cobre ${arr(a.cobre_arts).length} ARTs${achados.length ? `, entre elas as de: ${achados.join(", ")}` : ""}`
      );
    }
    if (a.riscos) out.push(`   riscos: ${cortar(a.riscos, 380)}`);
  }

  out.push(
    "",
    "TOTAIS E TETOS POR CATEGORIA (somente sínteses; calculados pelo sistema — use estes números):"
  );
  const t = (x: Teto | null) => (x ? `${fmtNum(x.quantidade)} = ${x.alias} (${x.rotulo})` : "—");
  for (const c of totais.categorias) {
    const partes = [
      `- ${c.categoria} (${c.unidade}): somatório CATs ${fmtNum(c.total_cat)} em ${c.obras_cat} obra(s)`,
      c.total_cat_na_art ? `(${fmtNum(c.total_cat_na_art)} na atividade técnica da ART)` : "",
      c.total_cat_execucao !== c.total_cat ? `(com execução: ${fmtNum(c.total_cat_execucao)})` : "",
      c.total_operacional !== c.total_cat
        ? `; com atestados s/ CAT ${fmtNum(c.total_operacional)} em ${c.obras_operacional} obra(s)`
        : "",
      `; teto obra única (CAT) ${t(c.teto_cat)}`,
      c.teto_cat_execucao?.atestado_id !== c.teto_cat?.atestado_id
        ? `; teto obra única com execução ${t(c.teto_cat_execucao)}`
        : "",
      c.teto_operacional && c.teto_operacional.atestado_id !== c.teto_cat?.atestado_id
        ? `; teto incl. atestado s/ CAT ${t(c.teto_operacional)}`
        : "",
      c.teto_profissional && c.teto_profissional.atestado_id !== c.teto_cat?.atestado_id
        ? `; teto técnico-profissional ${t(c.teto_profissional)}${c.teto_profissional.profissional ? ` [${c.teto_profissional.profissional}]` : ""}`
        : "",
    ];
    out.push(partes.filter(Boolean).join(" "));
  }
  const v = (x: ValorObra | null) => (x ? `${brl(x.valor)} = ${x.alias} (${x.rotulo})` : "—");
  out.push(
    `VALORES: maior contrato em CAT ${v(totais.maior_valor_cat)}; ` +
      (totais.maior_valor_operacional?.atestado_id !== totais.maior_valor_cat?.atestado_id
        ? `maior incl. atestado s/ CAT ${v(totais.maior_valor_operacional)}; `
        : "") +
      `somatório dos contratos em CAT ${brl(totais.soma_valores_cat)} (${totais.qtd.cat} CATs); ` +
      `incl. atestados s/ CAT ${brl(totais.soma_valores_operacional)}; ` +
      `maior contrato em CAT do profissional ${v(totais.maior_valor_profissional)}.`
  );
  if (detalhes.length) {
    out.push(
      "",
      "DETALHES DE PLANILHA LIGADOS ÀS EXIGÊNCIAS (apoio; os totais acima já valem):",
      ...detalhes
    );
  }
  return out.join("\n");
}

// ─── Econômico-financeiro (em código, sem modelo) ───────────────────────────

const ROTULO_ECONOMICA: Record<string, string> = {
  capital_social: "Capital social mínimo",
  patrimonio_liquido: "Patrimônio líquido mínimo",
  capital_ou_pl: "Capital social ou patrimônio líquido mínimo",
  ccl: "Capital circulante líquido mínimo",
  liquidez_corrente: "Índice de liquidez corrente",
  liquidez_geral: "Índice de liquidez geral",
  solvencia_geral: "Índice de solvência geral",
  endividamento: "Índice de endividamento",
  faturamento: "Faturamento mínimo",
  outro: "Exigência econômico-financeira",
};

/**
 * Edital com mais de um lote/item disputado separadamente: itens com lotes
 * distintos ou critério de julgamento por lote/item/grupo. Nesses casos o
 * "% do valor estimado" é do lote que a empresa disputar, não do total.
 */
export function editalPorLote(
  ed: Pick<EditalConsolidado, "itens" | "criterio_julgamento">
): boolean {
  const lotes = new Set(ed.itens.map((i) => normalizar(i.lote)).filter(Boolean));
  if (lotes.size > 1) return true;
  return /\b(lotes?|itens|item|grupos?)\b/.test(normalizar(ed.criterio_julgamento));
}

export function avaliarEconomica(
  e: ExigenciaEconomica,
  perfil: AcervoPerfil | null,
  valorEstimado: number | null,
  opts: { porLote?: boolean } = {}
): ItemAtende {
  const base = {
    exigencia_id: e.id,
    grupo: "economica" as GrupoAtende,
    exigencia: e.descricao || ROTULO_ECONOMICA[e.tipo] || "Exigência econômico-financeira",
    atestados: [],
  };
  const item = (
    status: StatusAtende,
    qtd: number | null,
    unidade: string | null,
    comprovacao: string | null,
    justificativa: string
  ): ItemAtende => ({ ...base, qtd_exigida: qtd, unidade, status, comprovacao, justificativa });
  const semDado = (campo: string, qtd: number | null, unidade: string | null) =>
    item(
      "verificar",
      qtd,
      unidade,
      null,
      `${campo}: dado não cadastrado no acervo (Oportunidades → Acervo técnico).`
    );
  const pct = e.percentual_do_estimado;
  const exercicio = perfil?.exercicio_balanco ? ` (balanço ${perfil.exercicio_balanco})` : "";

  // Mais de um lote/item + mínimo em % do estimado: a base é o lote disputado,
  // não o total — "nao_atende" pelo total seria falso. Um valor_minimo que é
  // só pct × total (o modelo fez a conta) também não vale nesse caso.
  const porLote = opts.porLote === true && pct !== null && pct > 0;
  const minimoDoTotal =
    pct !== null && pct > 0 && valorEstimado ? arred2((valorEstimado * pct) / 100) : null;
  const minimoDerivado =
    minimoDoTotal !== null &&
    e.valor_minimo !== null &&
    Math.abs(e.valor_minimo - minimoDoTotal) <= Math.max(1, minimoDoTotal * 0.01);

  // mínimo em R$: valor explícito > % do estimado
  const minimoReais = (): { valor: number | null; txt: string; porLote: boolean } => {
    if (e.valor_minimo !== null && e.valor_minimo > 0 && !(porLote && minimoDerivado)) {
      return {
        valor: e.valor_minimo,
        txt: `${brl(e.valor_minimo)}${pct !== null ? ` (${fmtNum(pct)}% do estimado)` : ""}`,
        porLote: false,
      };
    }
    if (porLote) {
      return {
        valor: null,
        txt: `${fmtNum(pct!)}% do valor estimado do lote/item disputado (o edital tem mais de um lote/item${valorEstimado ? `; ${brl(valorEstimado)} é o total de todos` : ""})`,
        porLote: true,
      };
    }
    if (pct !== null && pct > 0 && valorEstimado) {
      const v = arred2((valorEstimado * pct) / 100);
      return {
        valor: v,
        txt: `${brl(v)} (${fmtNum(pct)}% de ${brl(valorEstimado)})`,
        porLote: false,
      };
    }
    return {
      valor: null,
      txt:
        pct !== null
          ? `${fmtNum(pct)}% do valor estimado, que não foi identificado no edital`
          : "valor mínimo não identificado no edital",
      porLote: false,
    };
  };
  /** por lote: cobre o % até do total → atende a qualquer lote; senão "verificar" com o teto */
  const itemPorLote = (valorEmpresa: number, comprovacao: string, tem: string, txt: string) =>
    minimoDoTotal !== null && valorEmpresa >= minimoDoTotal
      ? item(
          "atende",
          minimoDoTotal,
          "R$",
          comprovacao,
          `Exigido ${txt}; ${tem} ≥ ${fmtNum(pct!)}% do valor total estimado (${brl(minimoDoTotal)}) — atende a qualquer lote.`
        )
      : item(
          "verificar",
          null,
          "R$",
          comprovacao,
          `Exigido ${txt}. ${tem.charAt(0).toUpperCase()}${tem.slice(1)} — atende a lotes de até ${brl((valorEmpresa * 100) / pct!)} de valor estimado; confira o valor do(s) lote(s) que vai disputar.`
        );

  switch (e.tipo) {
    case "capital_social":
    case "patrimonio_liquido":
    case "capital_ou_pl":
    case "ccl": {
      const cs = numero(perfil?.capital_social);
      const pl = numero(perfil?.patrimonio_liquido);
      const rotCs = `Capital social${perfil?.capital_social_data ? ` (${fmtData(perfil.capital_social_data)})` : ""}`;
      const rotPl = `Patrimônio líquido${perfil?.pl_data_base ? ` (base ${fmtData(perfil.pl_data_base)})` : ""}`;
      let valor: number | null = null;
      let rotulo = "";
      if (e.tipo === "capital_social") [valor, rotulo] = [cs, rotCs];
      else if (e.tipo === "patrimonio_liquido") [valor, rotulo] = [pl, rotPl];
      else if (e.tipo === "ccl")
        [valor, rotulo] = [numero(perfil?.ccl), `Capital circulante líquido${exercicio}`];
      else if (cs === null && pl === null)
        return semDado("Capital social e patrimônio líquido", null, "R$");
      else if ((pl ?? -Infinity) >= (cs ?? -Infinity)) {
        [valor, rotulo] = [
          pl,
          `${rotPl}${cs !== null ? ` — maior que o capital social (${brl(cs)}), por isso foi o usado` : ""}`,
        ];
      } else {
        [valor, rotulo] = [
          cs,
          `${rotCs}${pl !== null ? ` — maior que o patrimônio líquido (${brl(pl)}), por isso foi o usado` : ""}`,
        ];
      }
      const m = minimoReais();
      if (valor === null) return semDado(rotulo.split(" (")[0], m.valor, "R$");
      const comprovacao = `${rotulo.split(" — ")[0]}: ${brl(valor)}`;
      if (m.porLote) return itemPorLote(valor, comprovacao, `a empresa tem ${brl(valor)}`, m.txt);
      if (m.valor === null) {
        const teto =
          pct !== null && pct > 0
            ? ` — atende a editais de até ${brl((valor * 100) / pct)} de valor estimado`
            : "";
        return item(
          "verificar",
          null,
          "R$",
          comprovacao,
          `Exigido ${m.txt}. A empresa tem ${brl(valor)}${teto}.`
        );
      }
      const ok = valor >= m.valor;
      return item(
        ok ? "atende" : "nao_atende",
        m.valor,
        "R$",
        comprovacao,
        `Exigido ${m.txt}; a empresa tem ${brl(valor)} — ${rotulo}. ${ok ? "Atende." : `Faltam ${brl(m.valor - valor)}.`}`
      );
    }
    case "liquidez_corrente":
    case "liquidez_geral":
    case "solvencia_geral": {
      const nome = ROTULO_ECONOMICA[e.tipo];
      const v = numero(perfil?.[e.tipo]);
      if (v === null) return semDado(nome, e.valor_minimo, "índice");
      const assumido = e.valor_minimo === null;
      const min = e.valor_minimo ?? 1;
      const ok = v >= min;
      return item(
        ok ? "atende" : assumido ? "verificar" : "nao_atende",
        min,
        "índice",
        `${nome}: ${fmtNum(v)}${exercicio}`,
        `${nome} ${fmtNum(v)} ${ok ? "≥" : "<"} ${fmtNum(min)}${assumido ? " (mínimo não identificado no edital; considerado o usual ≥ 1,00)" : ""}.`
      );
    }
    case "endividamento": {
      const v = numero(perfil?.endividamento_geral);
      if (v === null) return semDado("Índice de endividamento geral", e.valor_minimo, "índice");
      if (e.valor_minimo === null) {
        return item(
          "verificar",
          null,
          "índice",
          `Endividamento geral: ${fmtNum(v)}${exercicio}`,
          `Índice máximo não identificado no edital; a empresa tem ${fmtNum(v)}.`
        );
      }
      const ok = v <= e.valor_minimo;
      return item(
        ok ? "atende" : "nao_atende",
        e.valor_minimo,
        "índice (máx.)",
        `Endividamento geral: ${fmtNum(v)}${exercicio}`,
        `Endividamento ${fmtNum(v)} ${ok ? "≤" : ">"} máximo ${fmtNum(e.valor_minimo)}.`
      );
    }
    case "faturamento": {
      const fat = arr(perfil?.faturamento)
        .map((y) => {
          const f = obj(y);
          return { ano: inteiroPositivo(f.ano), receita: numero(f.receita_bruta) };
        })
        .filter((f): f is { ano: number; receita: number } => f.ano !== null && f.receita !== null)
        .sort((x, y) => y.ano - x.ano);
      const m = minimoReais();
      if (!fat.length) return semDado("Faturamento (receita bruta)", m.valor, "R$");
      const anoPedido = Number(e.exercicio?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
      const alvo = anoPedido ? fat.find((f) => f.ano === anoPedido) : fat[0];
      const cadastrados = fat.map((f) => `${f.ano}: ${brl(f.receita)}`).join("; ");
      if (!alvo) {
        return item(
          "verificar",
          m.valor,
          "R$",
          null,
          `Exercício ${anoPedido} não cadastrado no acervo (cadastrados: ${cadastrados}).`
        );
      }
      const comprovacao = `Receita bruta ${alvo.ano}: ${brl(alvo.receita)}`;
      if (m.porLote) {
        return itemPorLote(
          alvo.receita,
          comprovacao,
          `receita bruta ${alvo.ano} ${brl(alvo.receita)}`,
          m.txt
        );
      }
      if (m.valor === null) {
        return item(
          "verificar",
          null,
          "R$",
          comprovacao,
          `Exigido ${m.txt}. Cadastrados: ${cadastrados}.`
        );
      }
      if (alvo.receita >= m.valor) {
        return item(
          "atende",
          m.valor,
          "R$",
          comprovacao,
          `Exigido ${m.txt}; receita bruta ${alvo.ano} ${brl(alvo.receita)}.`
        );
      }
      const outro = !anoPedido ? fat.find((f) => f.receita >= m.valor!) : undefined;
      if (outro) {
        return item(
          "ressalva",
          m.valor,
          "R$",
          `Receita bruta ${outro.ano}: ${brl(outro.receita)}`,
          `O último exercício (${alvo.ano}: ${brl(alvo.receita)}) não alcança ${m.txt}; atende com ${outro.ano} (${brl(outro.receita)}) — confirme qual exercício o edital aceita.`
        );
      }
      return item(
        "nao_atende",
        m.valor,
        "R$",
        comprovacao,
        `Exigido ${m.txt}; cadastrados: ${cadastrados}.`
      );
    }
    default:
      return item(
        "verificar",
        e.valor_minimo,
        null,
        null,
        "Exigência econômico-financeira fora dos tipos padronizados — conferir manualmente."
      );
  }
}

// ─── Montagem do AtendeResultado ────────────────────────────────────────────

export function calcularVeredito(itens: ItemAtende[]): AtendeResultado["veredito"] {
  if (!itens.length) return "atende_parcialmente";
  if (itens.some((i) => i.status === "nao_atende")) return "nao_atende";
  if (itens.some((i) => i.status === "ressalva" || i.status === "verificar"))
    return "atende_parcialmente";
  return "atende";
}

function rotuloCurto(a: AcervoAtestado): string {
  if (a.tipo === "atestado") return `atestado s/ CAT (${a.contratante ?? "?"})`;
  return `${a.tipo === "cao" ? "CAO" : "CAT"} ${a.numero || `s/ nº (${a.contratante ?? "?"})`}`;
}

const RE_CODIGO_AT = /AT\s*-?\s*(\d{1,4})/gi;
/** "[AT7]" ou "[AT7, AT9]" / "[AT7 e AT9]" no texto do modelo */
const RE_GRUPO_AT = /\[\s*(AT\s*-?\s*\d{1,4}(?:\s*(?:[,;/]|\be\b)\s*AT\s*-?\s*\d{1,4})*)\s*\]/gi;

/**
 * Troca os apelidos ([AT7]) por "CAT nº" no texto do modelo. Só o formato com
 * colchetes: "A4" (grupo tarifário), "AT" (alta tensão) etc. ficam intactos.
 */
export function trocarApelidos(t: string | null, apelidos: Apelidos): string | null {
  if (!t) return t;
  return t.replace(RE_GRUPO_AT, (grupo, dentro: string) => {
    const rotulos: string[] = [];
    for (const m of dentro.matchAll(RE_CODIGO_AT)) {
      const a = apelidos.porAlias.get(`AT${Number(m[1])}`);
      if (!a) return grupo; // código desconhecido: não mexe no trecho
      rotulos.push(rotuloCurto(a));
    }
    return rotulos.join(", ");
  });
}

const RANK_STATUS: Record<StatusAtende, number> = {
  atende: 3,
  ressalva: 2,
  verificar: 1,
  nao_atende: 0,
};
/** o mais restritivo dos dois (ajuste automático nunca promove) */
const pior = (a: StatusAtende, b: StatusAtende): StatusAtende =>
  RANK_STATUS[a] <= RANK_STATUS[b] ? a : b;

/** a exigência fala explicitamente em execução (descrição, serviço ou trecho)? */
const execucaoExplicita = (x: Pick<ExigenciaOperacional, "descricao" | "servico" | "trecho">) =>
  /\bexecu(c|t)/.test(normalizar(`${x.descricao} ${x.servico ?? ""} ${x.trecho ?? ""}`));

interface ParamsAtende {
  extraido: EditalConsolidado;
  acervo: Acervo;
  apelidos: Apelidos;
  empresa: { id: string; nome: string | null; uf: string | null };
  /** null = não havia exigência técnica/registro (modelo não foi chamado) */
  resposta: RespostaTecnica | null;
  modelo: string;
  agoraISO: string;
  hojeISO: string;
}

export function montarAtende(p: ParamsAtende): AtendeResultado {
  const { extraido: ed, acervo, apelidos } = p;
  const h = ed.habilitacao;
  const respostas = new Map<string, RespostaTecnica["itens"][number]>();
  for (const r of p.resposta?.itens ?? [])
    if (!respostas.has(r.exigencia_id)) respostas.set(r.exigencia_id, r);
  const sinteses = sintesesPorAtestado(acervo);
  /** atestados que o modelo citou e o ajuste automático tirou de algum item */
  const descartados = new Set<string>();
  const listaRotulos = (l: AcervoAtestado[]) => l.map(rotuloCurto).join(", ");

  const avaliarTecnico = (
    id: string,
    grupo: GrupoAtende,
    exigencia: string,
    qtd: number | null,
    unidade: string | null,
    /** a exigência técnico-operacional (para execução / recálculo) */
    op: ExigenciaOperacional | null
  ): ItemAtende => {
    const r = respostas.get(id);
    if (!r) {
      return {
        exigencia_id: id,
        grupo,
        exigencia,
        qtd_exigida: qtd,
        unidade,
        status: "verificar",
        comprovacao: null,
        atestados: [],
        justificativa: "A IA não avaliou esta exigência — conferir manualmente.",
      };
    }
    let status: StatusAtende = (STATUS_ATENDE as readonly string[]).includes(r.status)
      ? r.status
      : "verificar";
    // só apelidos que existem = só atestados DESTA empresa
    let citados = [
      ...new Set(
        arr(r.atestados)
          .map(chaveApelido)
          .filter((k): k is string => !!k)
      ),
    ]
      .map((k) => apelidos.porAlias.get(k))
      .filter((a): a is AcervoAtestado => !!a);
    const notas: string[] = [];
    const usado = status === "atende" || status === "ressalva";
    const removidos: AcervoAtestado[] = [];
    if (grupo === "tecnica_operacional") {
      // 1) CAT profissional (obra de OUTRA empresa) nunca prova o operacional
      const deOutra = citados.filter((a) => a.tipo === "cat_profissional");
      if (deOutra.length) {
        citados = citados.filter((a) => a.tipo !== "cat_profissional");
        removidos.push(...deOutra);
        notas.push(
          `${listaRotulos(deOutra)} é de obra de outra empresa: só vale como capacidade técnico-profissional`
        );
      }
      // 2) edital exige execução: CAT cuja ART não registra execução não prova
      let execucaoDuvidosa = false;
      if (op?.exige_execucao === true) {
        const semExec = citados.filter((a) => a.com_execucao === false);
        if (semExec.length && execucaoExplicita(op)) {
          citados = citados.filter((a) => a.com_execucao !== false);
          removidos.push(...semExec);
          notas.push(
            `o edital exige execução e ${listaRotulos(semExec)} não registra(m) execução na ART`
          );
        } else if (semExec.length) {
          // o texto lido não fala em execução: a marcação pode ter sido dedução
          execucaoDuvidosa = true;
          notas.push(
            `${listaRotulos(semExec)} não registra(m) execução na ART e a exigência parece pedir execução — confira o trecho do edital`
          );
        }
      }
      if (removidos.length && usado) {
        if (!citados.length) {
          status = "nao_atende";
        } else {
          // o que sobrou basta? recalcula pelas sínteses; se não der, rebaixa
          const rc = op ? recalcularOperacional(op, citados, removidos, sinteses) : null;
          if (rc) {
            status = pior(status, rc.status);
            notas.push(rc.nota);
          } else if (status === "atende") {
            status = "verificar";
            notas.push(
              `sem ${listaRotulos(removidos)}, confira se as demais citadas bastam (não deu para recalcular a quantidade)`
            );
          }
        }
      }
      if (execucaoDuvidosa && usado) status = pior(status, "ressalva");
      if (status === "atende" && citados.length && citados.every((a) => a.tipo === "atestado")) {
        status = "ressalva";
        notas.push("atestado sem CAT só vale se o edital aceitar atestado sem registro no CREA");
      }
    }
    // 4) técnico-profissional se prova com CAT (da empresa ou do profissional)
    if (grupo === "tecnica_profissional" && usado && citados.length) {
      const comCat = citados.some((a) => a.tipo === "cat" || a.tipo === "cat_profissional");
      if (!comCat && citados.some((a) => a.tipo === "atestado")) {
        status = pior(status, "ressalva");
        notas.push(
          "técnico-profissional se comprova com CAT em nome do profissional; atestado sem CAT só vale se o edital aceitar"
        );
      } else if (!comCat) {
        status = pior(status, "verificar");
        notas.push(
          "CAO comprova o acervo da empresa, não o do profissional — falta CAT em nome do profissional"
        );
      }
    }
    if (
      status === "atende" &&
      citados.length &&
      citados.every((a) => a.situacao === "em_andamento")
    ) {
      status = "ressalva";
      notas.push("CAT em andamento (obra não concluída)");
    }
    for (const a of removidos) descartados.add(a.id);
    const justificativa =
      (trocarApelidos(texto(r.justificativa, 1500), apelidos) ?? "") +
      (notas.length ? ` [Ajuste automático: ${notas.join("; ")}.]` : "");
    const comprovacao = trocarApelidos(texto(r.comprovacao, 1000), apelidos);
    return {
      exigencia_id: id,
      grupo,
      exigencia,
      qtd_exigida: qtd,
      unidade,
      status,
      comprovacao:
        comprovacao && removidos.length
          ? `${comprovacao} (desconsiderado pelo sistema: ${listaRotulos(removidos)})`
          : comprovacao,
      atestados: citados.map((a) => ({
        id: a.id,
        numero: a.numero ?? null,
        contratante: a.contratante ?? null,
      })),
      justificativa: justificativa.trim() || "—",
    };
  };

  const itens: ItemAtende[] = [
    ...h.tecnica_operacional.map((x) =>
      avaliarTecnico(x.id, "tecnica_operacional", x.descricao, x.quantidade, x.unidade, x)
    ),
    ...h.tecnica_profissional.map((x) =>
      avaliarTecnico(x.id, "tecnica_profissional", x.descricao, x.quantidade, x.unidade, null)
    ),
    ...h.economica.map((x) =>
      avaliarEconomica(x, acervo.perfil, ed.valor_estimado, { porLote: editalPorLote(ed) })
    ),
    ...h.registros.map((x) =>
      avaliarTecnico(x.id, "registros", x.descricao || `Registro (${x.tipo})`, null, null, null)
    ),
  ];

  // CATs a anexar: SÓ as usadas em itens atende/ressalva DEPOIS dos ajustes.
  // Do modelo aproveita-se só a ordem e o motivo — e o motivo só quando o
  // ajuste não tirou aquela CAT de algum item (senão citaria o que não prova).
  const usos = new Map<string, string[]>();
  for (const i of itens) {
    if (i.status !== "atende" && i.status !== "ressalva") continue;
    for (const a of i.atestados) usos.set(a.id, [...(usos.get(a.id) ?? []), i.exigencia_id]);
  }
  const cats = new Map<string, { id: string; numero: string | null; motivo: string }>();
  for (const c of p.resposta?.cats_anexar ?? []) {
    const a = atestadoDoApelido(apelidos, c.atestado);
    if (!a || !usos.has(a.id) || cats.has(a.id)) continue;
    cats.set(a.id, {
      id: a.id,
      numero: a.numero ?? null,
      motivo: descartados.has(a.id) ? "" : (trocarApelidos(texto(c.motivo, 500), apelidos) ?? ""),
    });
  }
  for (const [id, ids] of usos) {
    const a = acervo.atestados.find((x) => x.id === id);
    if (!a) continue;
    const comprova = `Comprova ${ids.join(", ")}`;
    const atual = cats.get(id);
    if (!atual) cats.set(id, { id, numero: a.numero ?? null, motivo: comprova });
    else if (!atual.motivo) atual.motivo = comprova;
  }

  // riscos dos atestados que serão usados
  const riscosAcervo: string[] = [];
  for (const id of usos.keys()) {
    const a = acervo.atestados.find((x) => x.id === id);
    if (!a) continue;
    if (a.situacao === "em_andamento")
      riscosAcervo.push(`${rotuloCurto(a)}: consta como EM ANDAMENTO (não concluída).`);
    if (a.riscos) riscosAcervo.push(`${rotuloCurto(a)}: ${cortar(a.riscos, 450)}`);
  }

  const alertas = [
    ...dedupTextos(arr(acervo.perfil?.alertas), 800),
    ...alertasAutomaticos(ed, acervo, itens),
  ];

  return {
    empresa: { id: p.empresa.id, nome: p.empresa.nome },
    itens,
    veredito: calcularVeredito(itens),
    cats_anexar: [...cats.values()],
    pendencias: dedupTextos([
      ...pendenciasAutomaticas(ed, acervo, p.empresa.uf, p.hojeISO),
      ...(p.resposta?.pendencias ?? []).map((x) => trocarApelidos(texto(x, 600), apelidos)),
    ]).slice(0, 40),
    riscos: dedupTextos([
      ...(p.resposta?.riscos ?? []).map((x) => trocarApelidos(texto(x, 600), apelidos)),
      ...riscosAcervo,
    ]).slice(0, 40),
    alertas: dedupTextos(alertas, 800).slice(0, 40),
    analisado_em: p.agoraISO,
    modelo: p.modelo,
  };
}

export function pendenciasAutomaticas(
  ed: EditalConsolidado,
  acervo: Acervo,
  ufEmpresa: string | null,
  hojeISO: string
): string[] {
  const out: string[] = [];
  const p = acervo.perfil;
  if (p?.razao_social_anterior) {
    out.push(
      `Juntar a alteração contratual da mudança de razão social: CATs/atestados emitidos em nome de ${p.razao_social_anterior}.`
    );
  }
  const ufEd = ed.local.uf;
  if (ufEd && ufEmpresa && ufEd !== ufEmpresa) {
    out.push(
      `Visto no CREA-${ufEd}: a empresa é registrada no CREA-${ufEmpresa} (em regra exigido para contratar; confira se o edital pede já na habilitação).`
    );
  }
  if (ed.habilitacao.tecnica_profissional.length) {
    out.push(
      "Comprovar o vínculo do profissional indicado (contrato social, CTPS, contrato de prestação de serviços ou declaração de contratação futura)."
    );
    for (const pr of acervo.profissionais) {
      if (pr.ativo !== false && pr.responsavel_tecnico !== false && !pr.vinculo_desde) {
        out.push(
          `Cadastrar/comprovar a data de vínculo de ${pr.nome ?? "profissional"} com a empresa.`
        );
      }
    }
  }
  const vt = ed.datas.visita_tecnica;
  if (vt.obrigatoria === true) {
    out.push(
      `Visita técnica OBRIGATÓRIA${vt.data ? ` em ${fmtData(vt.data)}${vt.hora ? ` às ${vt.hora}` : ""}` : ""}${vt.descricao ? ` — ${cortar(vt.descricao, 300)}` : ""}.`
    );
  }
  const g = ed.garantia_proposta;
  if (g.exigida === true) {
    out.push(
      `Providenciar garantia de proposta${g.percentual !== null ? ` de ${fmtNum(g.percentual)}%` : ""}${g.valor !== null ? ` (${brl(g.valor)})` : ""}.`
    );
  }
  // validade até a sessão (ou hoje, se a sessão já passou/não foi lida)
  const sessao = ed.datas.sessao.data;
  const ref = sessao && sessao > hojeISO ? sessao : hojeISO;
  const quando = ref === hojeISO ? "" : " (vence antes da sessão)";
  for (const y of arr(p?.certidoes)) {
    const c = obj(y);
    const v = dataISO(c.validade);
    if (v && v < ref) {
      out.push(
        `Renovar ${cortar(c.tipo, 150) || "certidão"}${c.numero ? ` nº ${cortar(c.numero, 40)}` : ""}: validade ${fmtData(v)}${quando}.`
      );
    }
  }
  for (const y of arr(p?.cadastros)) {
    const c = obj(y);
    const v = dataISO(c.validade);
    if (v && v < ref) {
      out.push(
        `Renovar cadastro ${cortar(c.orgao, 120) || ""}${c.codigo ? ` (${cortar(c.codigo, 30)})` : ""}: validade ${fmtData(v)}${quando}.`
      );
    }
  }
  // balanço: a partir de maio o exercício anterior passa a ser o exigível
  const exBal = inteiroPositivo(p?.exercicio_balanco);
  if (exBal && ed.habilitacao.economica.length) {
    const [ano, mes] = ref.split("-").map(Number);
    const esperado = mes > 4 ? ano - 1 : ano - 2;
    if (exBal < esperado) {
      out.push(
        `Balanço do exercício ${esperado} não cadastrado no acervo (último: ${exBal}) — ele já é o exigível desde maio/${esperado + 1}.`
      );
    }
  }
  return out;
}

function alertasAutomaticos(ed: EditalConsolidado, acervo: Acervo, itens: ItemAtende[]): string[] {
  const out: string[] = [];
  if (ed.exclusiva_me_epp === true) {
    const porte = normalizar(acervo.perfil?.porte);
    if (!porte)
      out.push(
        "Licitação exclusiva para ME/EPP — confirme o enquadramento (porte não cadastrado no acervo)."
      );
    else if (!/^(me|epp|mei)$/.test(porte))
      out.push(`Licitação exclusiva para ME/EPP — o porte cadastrado é ${acervo.perfil?.porte}.`);
  }
  const tecnicoNao = itens.some(
    (i) =>
      i.status === "nao_atende" &&
      (i.grupo === "tecnica_operacional" || i.grupo === "tecnica_profissional")
  );
  if (tecnicoNao && ed.consorcio_permitido === true) {
    out.push(
      "O edital permite consórcio: avaliar parceria para as exigências técnicas não atendidas."
    );
  }
  if (tecnicoNao && ed.subcontratacao_permitida === true) {
    out.push(
      "O edital permite subcontratação — em regra ela não supre a qualificação técnica da licitante; confira o edital."
    );
  }
  if (!ed.habilitacao.tecnica_operacional.length && !ed.habilitacao.tecnica_profissional.length) {
    out.push(
      "Nenhuma exigência de qualificação técnica foi extraída do edital — confira o item de habilitação antes de concluir."
    );
  }
  return out;
}
