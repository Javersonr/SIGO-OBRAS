/**
 * cotacao-portal — regras do link de cotação do fornecedor (magic link da
 * participação, coluna `cotacao_fornecedor.token`).
 *
 * O token é a ÚNICA credencial do link: 32 bytes aleatórios em base64url
 * (43 chars), gerados pelo BANCO (trigger da 0113) — nunca pelo navegador.
 * O formato antigo, btoa("<cotacao_id>-<fornecedor_id>-<Date.now()>"), era
 * derivável: quem decodificava o próprio link só precisava do fornecedor_id do
 * concorrente para ler e sobrescrever a resposta dele.
 *
 * O que for lógica pura fica aqui (testável sem banco: cotacao-portal.test.ts).
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export const TOKEN_COTACAO_RE = /^[A-Za-z0-9_-]{43}$/;

export function tokenCotacaoValido(t: unknown): t is string {
  return typeof t === "string" && TOKEN_COTACAO_RE.test(t);
}

// id legado (ObjectId do Base44, 24 hex) ou uuid
const ID_RE = "(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
const LEGADO_RE = new RegExp(`^${ID_RE}-${ID_RE}-\\d{13}$`, "i");

/** Link do formato antigo (já reemitido): recusar com aviso, sem consultar. */
export function ehTokenCotacaoLegado(t: unknown): boolean {
  if (typeof t !== "string" || t.length > 200 || !/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return false;
  try {
    return LEGADO_RE.test(atob(t));
  } catch {
    return false;
  }
}

export const MSG_LINK_SUBSTITUIDO =
  "Este link de cotação foi substituído por um novo, por segurança. Peça o link " +
  "atualizado à empresa ou acesse a cotação pelo Portal do Fornecedor.";

type Falha = { erro: string; status: number; codigo?: string };

/**
 * Participação (cotacao_fornecedor) pelo token do link. `colunas` = select do
 * PostgREST; o chamador escolhe o mínimo que precisa.
 */
export async function participacaoPorToken(
  supabase: Db,
  token: unknown,
  colunas: string
  // deno-lint-ignore no-explicit-any
): Promise<{ cf: any } | Falha> {
  if (!token) return { erro: "Token obrigatório", status: 400 };
  if (!tokenCotacaoValido(token)) {
    if (ehTokenCotacaoLegado(token)) {
      return { erro: MSG_LINK_SUBSTITUIDO, status: 410, codigo: "LINK_SUBSTITUIDO" };
    }
    return { erro: "Cotação não encontrada", status: 404 };
  }
  const { data: cf } = await supabase
    .from("cotacao_fornecedor")
    .select(colunas)
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cf) return { erro: "Cotação não encontrada", status: 404 };
  return { cf };
}

// ── Prazo / encerramento ─────────────────────────────────────────────────────

export const STATUS_COTACAO_ENCERRADA = ["Aprovada", "Cancelada"];

/**
 * Fim do prazo em epoch ms: o DIA de `data_limite` inteiro, até 23:59:59 de
 * Brasília (UTC-3, sem horário de verão desde 2019). O modal grava a data pura
 * "AAAA-MM-DD", que o timestamptz guarda como meia-noite UTC.
 */
export function fimDoPrazo(dataLimite: unknown): number | null {
  const dia = diaDoPrazo(dataLimite);
  return dia ? Date.parse(`${dia}T23:59:59.999-03:00`) : null;
}

/** "AAAA-MM-DD" do prazo (data UTC do timestamptz), ou null. */
function diaDoPrazo(dataLimite: unknown): string | null {
  if (!dataLimite) return null;
  const d = new Date(String(dataLimite));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const dataBR = (dia: string) => {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Motivo pelo qual a cotação NÃO aceita mais resposta do fornecedor, ou null.
 * "Respostas Recebidas" continua aberta: a empresa pode reabrir um fornecedor.
 */
export function motivoCotacaoFechada(
  cotacao: { status?: string | null; data_limite?: string | null } | null,
  agora = Date.now()
): string | null {
  if (!cotacao) return "Cotação não encontrada.";
  if (STATUS_COTACAO_ENCERRADA.includes(cotacao.status ?? "")) {
    return "Esta cotação foi encerrada e não aceita mais respostas.";
  }
  const fim = fimDoPrazo(cotacao.data_limite);
  if (fim !== null && agora > fim) {
    const dia = diaDoPrazo(cotacao.data_limite) as string;
    return `O prazo desta cotação terminou em ${dataBR(dia)}; ela não aceita mais respostas.`;
  }
  return null;
}

// ── Validação das respostas ─────────────────────────────────────────────────

// limites das colunas de cotacao_resposta
const MAX_VALOR_UNITARIO = 1e10; // numeric(14,4)
const MAX_VALOR_TOTAL = 1e12; // numeric(14,2)
const MAX_PRAZO_DIAS = 3650;
const MAX_OBS = 2000;

export interface ItemCotacao {
  id: string;
  descricao: string | null;
  quantidade: number | string | null;
}

export interface LinhaResposta {
  item_id: string;
  item_descricao: string | null;
  valor_unitario: number;
  valor_total: number;
  prazo_entrega_dias: number | null;
  observacoes: string;
}

const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/**
 * Monta as linhas de cotacao_resposta a partir do que o fornecedor enviou,
 * usando SÓ os itens da cotação vindos do banco: descrição e quantidade saem
 * de cotacao_item (valor_total = unitário × quantidade real); chave que não é
 * item da cotação é ignorada. Item sem valor = não cotado (fica de fora).
 */
export function validarRespostas(
  respostas: unknown,
  itens: ItemCotacao[]
): { ok: true; linhas: LinhaResposta[]; ignorados: number } | { ok: false; erro: string } {
  if (!respostas || typeof respostas !== "object" || Array.isArray(respostas)) {
    return { ok: false, erro: "Dados incompletos" };
  }
  const mapa = respostas as Record<string, unknown>;
  const ids = new Set(itens.map((i) => i.id));
  const ignorados = Object.keys(mapa).filter((k) => !ids.has(k)).length;

  const linhas: LinhaResposta[] = [];
  for (const item of itens) {
    const r = mapa[item.id];
    if (!r || typeof r !== "object") continue;
    const resp = r as Record<string, unknown>;
    if (vazio(resp.valor_unitario)) continue;

    const nome = item.descricao || "item";
    const valor = Number(String(resp.valor_unitario).trim().replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0 || valor >= MAX_VALOR_UNITARIO) {
      return { ok: false, erro: `Valor unitário inválido em "${nome}"` };
    }
    const quantidade = Number(item.quantidade) || 0;
    const total = Math.round(valor * quantidade * 100) / 100;
    if (!Number.isFinite(total) || total >= MAX_VALOR_TOTAL) {
      return { ok: false, erro: `Valor total fora do limite em "${nome}"` };
    }

    let prazo: number | null = null;
    if (!vazio(resp.prazo_entrega)) {
      const p = parseInt(String(resp.prazo_entrega), 10);
      if (Number.isNaN(p) || p < 0 || p > MAX_PRAZO_DIAS) {
        return { ok: false, erro: `Prazo de entrega inválido em "${nome}"` };
      }
      prazo = p || null;
    }

    linhas.push({
      item_id: item.id,
      item_descricao: item.descricao,
      valor_unitario: valor,
      valor_total: total,
      prazo_entrega_dias: prazo,
      observacoes: typeof resp.observacoes === "string" ? resp.observacoes.slice(0, MAX_OBS) : "",
    });
  }
  return { ok: true, linhas, ignorados };
}
