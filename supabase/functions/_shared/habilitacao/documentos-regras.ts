/**
 * Biblioteca de documentos de habilitação (acervo_documento): tipos, situação da validade e as
 * certidões no formato que o "Atende?" já entende (spec 2026-10-09 §2). A tela tem o espelho em
 * apps/web/src/lib/habilitacao-documentos.js; a paridade é conferida no Vitest
 * (habilitacao-documentos-paridade.test.js). Puro: sem Deno e sem import de URL.
 */

export interface TipoDocumento {
  id: string;
  rotulo: string;
  grupo: "certidao" | "documento" | "outro";
  /** a empresa costuma ter um só em vigor: a tela sugere substituir o que já existe */
  unico: boolean;
  /** entra em "faltam" e no checklist mesmo quando o edital não cita */
  essencial: boolean;
}

const t = (
  id: string,
  rotulo: string,
  grupo: TipoDocumento["grupo"],
  unico: boolean,
  essencial: boolean
): TipoDocumento => ({ id, rotulo, grupo, unico, essencial });

/** A mesma lista (e ordem) do CHECK de acervo_documento.tipo (migração 0154). */
export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = [
  t("cnd_federal", "CND Federal (Receita/PGFN)", "certidao", true, true),
  t("cnd_estadual", "CND Estadual", "certidao", false, true),
  t("cnd_municipal", "CND Municipal", "certidao", false, true),
  t("crf_fgts", "CRF do FGTS", "certidao", true, true),
  t("cndt_trabalhista", "CNDT (Trabalhista)", "certidao", true, true),
  t("certidao_falencia", "Certidão de falência e recuperação judicial", "certidao", true, true),
  t("certidao_crea_pj", "Certidão de registro no CREA (pessoa jurídica)", "certidao", false, false),
  t("certidao_junta", "Certidão simplificada da Junta Comercial", "certidao", true, false),
  t("sicaf", "SICAF ou cadastro de fornecedor", "certidao", false, false),
  t("contrato_social", "Contrato social e alterações", "documento", false, true),
  t("cartao_cnpj", "Cartão CNPJ", "documento", true, true),
  t("inscricao_estadual", "Inscrição estadual", "documento", true, false),
  t("inscricao_municipal", "Inscrição municipal", "documento", true, false),
  t("balanco_dre", "Balanço patrimonial e DRE", "documento", false, false),
  t("alvara", "Alvará de funcionamento", "documento", true, false),
  t("procuracao", "Procuração", "documento", false, false),
  t("documento_representante", "Documento do representante legal", "documento", false, false),
  t("outro", "Outro", "outro", false, false),
];

export const IDS_TIPO_DOCUMENTO: readonly string[] = TIPOS_DOCUMENTO.map((x) => x.id);
export const TIPOS_ESSENCIAIS: readonly string[] = TIPOS_DOCUMENTO.filter((x) => x.essencial).map(
  (x) => x.id
);
export const JANELA_VENCE_LOGO_DIAS = 30;

const POR_ID = new Map(TIPOS_DOCUMENTO.map((x) => [x.id, x]));

export function tipoDocumento(id: unknown): TipoDocumento | null {
  return typeof id === "string" ? (POR_ID.get(id) ?? null) : null;
}

export function rotuloDoTipo(id: unknown): string {
  return tipoDocumento(id)?.rotulo ?? "Outro";
}

/** "AAAA-MM-DD" (ou timestamp ISO) → dia em ms UTC; null se não é uma data real (30/02). */
function diaEmMs(texto: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? ""));
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    return null;
  return ms;
}

export type SituacaoValidade = "sem_validade" | "valido" | "vence_logo" | "vencido";

export function diasAte(validadeISO: unknown, hojeISO: string): number | null {
  const fim = diaEmMs(validadeISO);
  const hoje = diaEmMs(hojeISO);
  if (fim === null || hoje === null) return null;
  return Math.round((fim - hoje) / 86_400_000);
}

export function situacaoDaValidade(
  validadeISO: unknown,
  hojeISO: string,
  janela: number = JANELA_VENCE_LOGO_DIAS
): { situacao: SituacaoValidade; dias: number | null } {
  const dias = diasAte(validadeISO, hojeISO);
  if (dias === null) return { situacao: "sem_validade", dias: null };
  if (dias < 0) return { situacao: "vencido", dias };
  return { situacao: dias <= janela ? "vence_logo" : "valido", dias };
}

export interface DocumentoBiblioteca {
  id: string;
  tipo: string;
  nome: string;
  arquivo_ref?: string | null;
  numero?: string | null;
  orgao_emissor?: string | null;
  emissao?: string | null;
  validade?: string | null;
  observacao?: string | null;
  substitui_id?: string | null;
  ativo?: boolean | null;
}

const texto = (v: unknown): string => String(v ?? "").trim();

/**
 * Os documentos ativos que interessam ao "Atende?" (certidões e tudo o que tem validade), no formato
 * de acervo_perfil.certidoes: { tipo, numero, validade }. `tipo` é o rótulo; em tipo que admite
 * vários documentos vai "rótulo — nome", e em "outro" vai só o nome. Ordem: a dos tipos, depois o nome.
 */
export function certidoesDaBiblioteca(
  docs: DocumentoBiblioteca[]
): { tipo: string; numero: string | null; validade: string | null }[] {
  const ordem = (d: DocumentoBiblioteca) => {
    const i = IDS_TIPO_DOCUMENTO.indexOf(d.tipo);
    return i < 0 ? IDS_TIPO_DOCUMENTO.length : i;
  };
  return (docs ?? [])
    .filter((d) => d && d.ativo !== false)
    .filter((d) => tipoDocumento(d.tipo)?.grupo === "certidao" || texto(d.validade) !== "")
    .sort((a, b) => ordem(a) - ordem(b) || texto(a.nome).localeCompare(texto(b.nome), "pt-BR"))
    .map((d) => {
      const tipo = tipoDocumento(d.tipo);
      const rotulo =
        !tipo || tipo.id === "outro"
          ? texto(d.nome) || "Outro"
          : tipo.unico
            ? tipo.rotulo
            : `${tipo.rotulo} — ${texto(d.nome)}`;
      return { tipo: rotulo, numero: texto(d.numero) || null, validade: texto(d.validade) || null };
    });
}
