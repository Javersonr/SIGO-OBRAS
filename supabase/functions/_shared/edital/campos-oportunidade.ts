/**
 * EditalConsolidado → colunas de public.oportunidade, no servidor (conector do Claude).
 * Porte LINHA A LINHA de apps/web/src/lib/edital-ia.js (numeroDoEdital, dataDoEdital,
 * horaDoEdital, ufDoEdital, a parte do normalizarEdital que a conversão usa e
 * camposOportunidadeDoEdital). O apps/web/src/lib/edital-campos-paridade.test.js roda os dois
 * com o mesmo fixture: mudou um, muda o outro.
 * Puro: sem Deno, sem import de URL.
 */
import { MODALIDADES } from "./edital-schemas.ts";

/** Lista fechada das colunas que o conector grava a partir do edital. */
export const COLUNAS_OPORTUNIDADE_EDITAL = [
  "nome",
  "orgao",
  "valor_estimado",
  "licitacao_modalidade",
  "licitacao_numero",
  "licitacao_processo",
  "licitacao_portal",
  "licitacao_forma",
  "licitacao_data",
  "licitacao_horario",
  "licitacao_data_proposta",
  "licitacao_horario_proposta",
  "licitacao_data_impugnacao",
  "licitacao_horario_impugnacao",
  "licitacao_data_esclarecimento",
  "licitacao_horario_esclarecimento",
  "licitacao_visita_tecnica",
  "licitacao_garantia_proposta",
  "licitacao_criterio_julgamento",
  "licitacao_prazo_execucao",
  "licitacao_exclusiva_me_epp",
  "cidade",
  "estado",
  "endereco",
  "descricao",
] as const;
export type ColunaOportunidadeEdital = (typeof COLUNAS_OPORTUNIDADE_EDITAL)[number];
export type CamposOportunidade = Partial<
  Record<ColunaOportunidadeEdital, string | number | boolean>
>;

/** o.k do JS (o?.k): string, número e lista dão undefined como no front */
const de = (o: unknown, k: string): unknown =>
  o === null || o === undefined ? undefined : (o as Record<string, unknown>)[k];

const txt = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const bool = (v: unknown): boolean | null => (v === true || v === false ? v : null);

/** "1.234.567,89" / "R$ 1.234,00" / 1234.5 → number | null */
export function numeroDoEdital(v: unknown): number | null {
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
export function dataDoEdital(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let a: string, mes: string, d: string;
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
export function horaDoEdital(v: unknown): string | null {
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

const UFS: Record<string, string> = {
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
const semAcento = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function ufDoEdital(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const sigla = s.toUpperCase();
  if (Object.hasOwn(UFS, sigla)) return sigla;
  const nome = semAcento(s);
  return Object.keys(UFS).find((k) => UFS[k] === nome) || null;
}

const pagina = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const dataHora = (o: unknown) => ({
  data: dataDoEdital(de(o, "data")),
  hora: horaDoEdital(de(o, "hora")),
  pagina: pagina(de(o, "pagina")),
});

/** Só a parte do normalizarEdital do front que a conversão para colunas usa. */
function normalizarParaColunas(ex: unknown) {
  const e = ex && typeof ex === "object" ? ex : {};
  const datas = de(e, "datas");
  const vt = de(datas, "visita_tecnica") || {};
  const gp = de(e, "garantia_proposta") || {};
  const local = de(e, "local");
  const modalidade = de(e, "modalidade");
  const forma = de(e, "forma");
  return {
    orgao: txt(de(e, "orgao")),
    numero_edital: txt(de(e, "numero_edital")),
    numero_processo: txt(de(e, "numero_processo")),
    modalidade: (MODALIDADES as readonly unknown[]).includes(modalidade)
      ? (modalidade as string)
      : null,
    forma: forma === "eletronica" || forma === "presencial" ? forma : null,
    portal: txt(de(e, "portal")),
    objeto: txt(de(e, "objeto")),
    titulo_sugerido: txt(de(e, "titulo_sugerido")),
    valor_estimado: numeroDoEdital(de(e, "valor_estimado")),
    criterio_julgamento: txt(de(e, "criterio_julgamento")),
    prazo_execucao: txt(de(e, "prazo_execucao")),
    local: {
      cidade: txt(de(local, "cidade")),
      uf: ufDoEdital(de(local, "uf")),
      endereco: txt(de(local, "endereco")),
    },
    datas: {
      sessao: dataHora(de(datas, "sessao")),
      proposta_limite: dataHora(de(datas, "proposta_limite")),
      impugnacao_limite: dataHora(de(datas, "impugnacao_limite")),
      esclarecimento_limite: dataHora(de(datas, "esclarecimento_limite")),
      visita_tecnica: {
        obrigatoria: bool(de(vt, "obrigatoria")),
        data: dataDoEdital(de(vt, "data")),
        hora: horaDoEdital(de(vt, "hora")),
        descricao: txt(de(vt, "descricao")),
      },
    },
    garantia_proposta: { exigida: bool(de(gp, "exigida")) },
    exclusiva_me_epp: bool(de(e, "exclusiva_me_epp")),
  };
}

const dataBR = (iso: unknown) => {
  const [a, m, d] = String(iso || "").split("-");
  return a && m && d ? `${d.slice(0, 2)}/${m}/${a}` : "";
};

/** Texto da visita técnica p/ a coluna licitacao_visita_tecnica. */
function textoVisitaTecnica(vt: {
  obrigatoria: boolean | null;
  data: string | null;
  hora: string | null;
  descricao: string | null;
}): string | null {
  if (!vt) return null;
  const partes: string[] = [];
  if (vt.obrigatoria === true) partes.push("Obrigatória");
  else if (vt.obrigatoria === false && (vt.data || vt.descricao)) partes.push("Facultativa");
  if (vt.data) partes.push(dataBR(vt.data) + (vt.hora ? ` às ${vt.hora}` : ""));
  if (vt.descricao) partes.push(vt.descricao);
  return partes.length ? partes.join(" — ") : null;
}

function resumir(texto: unknown, max = 120): string | null {
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
export function camposOportunidadeDoEdital(extraido: unknown): CamposOportunidade {
  if (!extraido || typeof extraido !== "object") return {};
  const e = normalizarParaColunas(extraido);
  const c: CamposOportunidade = {};
  const set = (k: ColunaOportunidadeEdital, v: string | number | boolean | null | undefined) => {
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
