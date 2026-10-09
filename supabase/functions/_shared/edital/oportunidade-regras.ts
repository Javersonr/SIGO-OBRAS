/**
 * Regras puras da gravação do edital pelo conector do Claude (spec 25/09 §5):
 *   - o plano de INSERT/UPDATE da oportunidade (as mesmas regras do "Salvar" do LerEditalSheet:
 *     só o que mudou, título e descrição existentes ficam, status inicial, responsável, alerta);
 *   - o edital_analise novo e o patch de reanálise (a RPC edital_analise_mesclar preserva o
 *     "Atende?" e os arquivos);
 *   - a resposta técnica do Claude (atestados por UUID) conferida contra o edital gravado e o
 *     acervo, e convertida para os apelidos [ATn] que o montarAtende entende.
 * Puro: sem Deno, sem import de URL.
 */
import {
  dataDoEdital,
  horaDoEdital,
  numeroDoEdital,
  ufDoEdital,
  type CamposOportunidade,
} from "./campos-oportunidade.ts";
import type { Apelidos } from "./edital-regras.ts";
import {
  STATUS_ATENDE,
  type EditalConsolidado,
  type RespostaTecnica,
  type StatusAtende,
} from "./edital-schemas.ts";
import { uuidOuNull } from "../conector/entrada.ts";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

// ─── Plano de gravação da oportunidade ──────────────────────────────────────

export interface PlanoGravacao {
  criar: boolean;
  /** o que vai para o insert/update de oportunidade (sem edital_analise) */
  patch: Record<string, unknown>;
  anteriores: Record<string, unknown> | null;
  novos: Record<string, unknown>;
}

const CAMPOS_DATA = new Set([
  "licitacao_data",
  "licitacao_data_proposta",
  "licitacao_data_impugnacao",
  "licitacao_data_esclarecimento",
]);
const CAMPOS_HORA = new Set([
  "licitacao_horario",
  "licitacao_horario_proposta",
  "licitacao_horario_impugnacao",
  "licitacao_horario_esclarecimento",
]);
const CAMPOS_BOOL = new Set(["licitacao_garantia_proposta", "licitacao_exclusiva_me_epp"]);
/** Numa oportunidade existente, título e descrição digitados pelo usuário ficam. */
const PRESERVAR_EXISTENTE = new Set(["nome", "descricao"]);
/** Título quando o edital não traz título nem objeto (a coluna nome é obrigatória). */
export const NOME_PADRAO = "Edital analisado pelo Claude";

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());

/** Valor de uma coluna normalizado para comparar (o normalizarCampo do LerEditalSheet). */
export function normalizarCampo(k: string, v: unknown): string | number | boolean | null {
  if (vazio(v)) return null;
  if (CAMPOS_DATA.has(k)) return dataDoEdital(v);
  if (CAMPOS_HORA.has(k)) return horaDoEdital(v) || String(v).trim();
  if (CAMPOS_BOOL.has(k)) return v === true || v === false ? v : null;
  if (k === "valor_estimado") {
    const n = numeroDoEdital(v);
    return n ? n : null; // 0 = não informado (default da coluna)
  }
  if (k === "estado") return ufDoEdital(v) || String(v).trim().toUpperCase().slice(0, 2);
  return String(v).trim();
}

const iguais = (a: unknown, b: unknown) =>
  (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? "");

function nomeDeReserva(c: CamposOportunidade): string {
  const partes = [c.licitacao_numero ? `Edital ${c.licitacao_numero}` : null, c.orgao ?? null];
  return partes.filter(Boolean).join(" — ") || NOME_PADRAO;
}

export function planoDeGravacao(
  campos: CamposOportunidade,
  existente: Record<string, unknown> | null,
  o: { statusInicial: { id: string; nome: string } | null; vinculoId: string; temAnalise: boolean }
): PlanoGravacao {
  if (!existente) {
    const novos: Record<string, unknown> = {
      ...campos,
      nome: campos.nome ?? nomeDeReserva(campos),
      alertar_prazos: true,
    };
    const patch: Record<string, unknown> = { ...novos, responsaveis_ids: [o.vinculoId] };
    if (o.statusInicial) {
      patch.status_id = o.statusInicial.id;
      patch.status_nome = o.statusInicial.nome || null;
    }
    return { criar: true, patch, anteriores: null, novos };
  }
  const patch: Record<string, unknown> = {};
  const anteriores: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    const atual = normalizarCampo(k, existente[k]);
    if (PRESERVAR_EXISTENTE.has(k) && atual !== null) continue;
    if (iguais(normalizarCampo(k, v), atual)) continue;
    patch[k] = v;
    anteriores[k] = existente[k] ?? null;
  }
  if (!o.temAnalise && existente.alertar_prazos !== true) {
    patch.alertar_prazos = true;
    anteriores.alertar_prazos = existente.alertar_prazos === true;
  }
  return { criar: false, patch, anteriores, novos: { ...patch } };
}

// ─── edital_analise ─────────────────────────────────────────────────────────

/** edital_analise de uma oportunidade criada agora. */
export function analiseNova(p: {
  extraido: EditalConsolidado;
  email: string;
  agoraIso: string;
}): Record<string, unknown> {
  return {
    versao: 1,
    extraido: p.extraido,
    atende: null,
    arquivos: [],
    analisado_em: p.agoraIso,
    analisado_por: `${p.email} via Claude`,
  };
}

/** Reanálise: vai pela RPC edital_analise_mesclar, que preserva atende e arquivos. */
export function patchDaAnalise(p: {
  extraido: EditalConsolidado;
  email: string;
  agoraIso: string;
}): Record<string, unknown> {
  return {
    versao: 1,
    extraido: p.extraido,
    analisado_em: p.agoraIso,
    analisado_por: `${p.email} via Claude`,
  };
}

/** O "exigencias" da saída de criar_ou_atualizar_oportunidade: os ids finais para o Claude. */
export function resumoExigencias(e: EditalConsolidado): Record<string, unknown> {
  const h = e.habilitacao;
  return {
    tecnica_operacional: h.tecnica_operacional.map((x) => ({ id: x.id, descricao: x.descricao })),
    tecnica_profissional: h.tecnica_profissional.map((x) => ({ id: x.id, descricao: x.descricao })),
    economica: h.economica.map((x) => ({ id: x.id, tipo: x.tipo, descricao: x.descricao })),
    registros: h.registros.map((x) => ({ id: x.id, tipo: x.tipo, descricao: x.descricao })),
  };
}

// ─── Resposta técnica do Claude ─────────────────────────────────────────────

export interface RespostaTecnicaUuid {
  itens: {
    exigencia_id: string;
    status: StatusAtende;
    comprovacao: string | null;
    atestado_ids: string[];
    justificativa: string;
  }[];
  cats_anexar: { atestado_id: string; motivo: string }[];
  pendencias: string[];
  riscos: string[];
}

const textoLimpo = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const textos = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => textoLimpo(x, max))
    .filter((x): x is string => !!x)
    .slice(0, 40);

export function validarRespostaTecnica(
  entrada: Record<string, unknown>,
  extraido: EditalConsolidado,
  atestadoIds: ReadonlySet<string>
):
  | { ok: true; resposta: RespostaTecnicaUuid }
  | { ok: false; exigencias_invalidas: string[]; atestados_invalidos: string[]; erros: string[] } {
  const h = extraido.habilitacao;
  const tecnicas = new Set(
    [...h.tecnica_operacional, ...h.tecnica_profissional, ...h.registros].map((x) => x.id)
  );
  const economicas = new Set(h.economica.map((x) => x.id));
  const exigencias_invalidas: string[] = [];
  const atestados_invalidos: string[] = [];
  const erros: string[] = [];
  const atestado = (v: unknown): string | null => {
    const id = uuidOuNull(v);
    if (id && atestadoIds.has(id)) return id;
    if (!atestados_invalidos.includes(String(v))) atestados_invalidos.push(String(v));
    return null;
  };

  if (!Array.isArray(entrada.itens))
    erros.push("itens é obrigatório (lista de exigências avaliadas).");
  const itens: RespostaTecnicaUuid["itens"] = [];
  const vistos = new Set<string>();
  (Array.isArray(entrada.itens) ? entrada.itens : []).forEach((y, i) => {
    const it = obj(y);
    const id = typeof it.exigencia_id === "string" ? it.exigencia_id.trim() : "";
    if (!tecnicas.has(id)) {
      exigencias_invalidas.push(id || `itens[${i}]`);
      if (economicas.has(id)) {
        erros.push(`${id} é econômico-financeira: o SIGO calcula; não envie em itens.`);
      }
      return;
    }
    if (vistos.has(id)) {
      erros.push(`${id} repetida em itens.`);
      return;
    }
    vistos.add(id);
    const status = it.status as StatusAtende;
    if (!(STATUS_ATENDE as readonly unknown[]).includes(status)) {
      erros.push(`${id}: status inválido (${String(it.status)}); use ${STATUS_ATENDE.join(", ")}.`);
    }
    const justificativa = textoLimpo(it.justificativa, 1500);
    if (!justificativa) erros.push(`${id}: justificativa é obrigatória.`);
    const ids = (Array.isArray(it.atestado_ids) ? it.atestado_ids : [])
      .map(atestado)
      .filter((x): x is string => !!x);
    itens.push({
      exigencia_id: id,
      status,
      comprovacao: textoLimpo(it.comprovacao, 1000),
      atestado_ids: [...new Set(ids)],
      justificativa: justificativa ?? "",
    });
  });

  const cats_anexar: RespostaTecnicaUuid["cats_anexar"] = [];
  for (const y of Array.isArray(entrada.cats_anexar) ? entrada.cats_anexar : []) {
    const c = obj(y);
    const id = atestado(c.atestado_id);
    if (id) cats_anexar.push({ atestado_id: id, motivo: textoLimpo(c.motivo, 500) ?? "" });
  }

  if (exigencias_invalidas.length || atestados_invalidos.length || erros.length) {
    return { ok: false, exigencias_invalidas, atestados_invalidos, erros };
  }
  return {
    ok: true,
    resposta: {
      itens,
      cats_anexar,
      pendencias: textos(entrada.pendencias, 600),
      riscos: textos(entrada.riscos, 600),
    },
  };
}

const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** UUID → "[ATn]" (nas listas e nos textos), o formato que o montarAtende converte em "CAT nº". */
export function paraApelidos(r: RespostaTecnicaUuid, ap: Apelidos): RespostaTecnica {
  const alias = (id: string) => ap.aliasDoId.get(id.toLowerCase());
  const trocar = (t: string) => t.replace(RE_UUID, (m) => alias(m) ?? m);
  return {
    itens: r.itens.map((i) => ({
      exigencia_id: i.exigencia_id,
      status: i.status,
      comprovacao: i.comprovacao === null ? null : trocar(i.comprovacao),
      atestados: i.atestado_ids.map(alias).filter((x): x is string => !!x),
      justificativa: trocar(i.justificativa),
    })),
    cats_anexar: r.cats_anexar
      .map((c) => ({ atestado: alias(c.atestado_id) ?? "", motivo: trocar(c.motivo) }))
      .filter((c) => c.atestado),
    pendencias: r.pendencias.map(trocar),
    riscos: r.riscos.map(trocar),
  };
}
