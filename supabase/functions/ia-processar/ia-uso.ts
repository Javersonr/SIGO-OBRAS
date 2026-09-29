/**
 * ia-uso — consumo da IA e cota diária das ações edital_* (tabela public.ia_uso,
 * migrações 0114_ia_uso_cota.sql e 0123_ia_uso_provedor_custo.sql).
 *
 *   - 1 linha por requisição que chegou a chamar a IA (Gemini e/ou OpenAI),
 *     com os tokens de TODAS as chamadas da requisição somados (fallback de
 *     provedor, escalonamento etc.), o(s) provedor(es), o(s) modelo(s) e o
 *     custo estimado em US$ (ia-precos.ts; null se nenhum modelo tem preço);
 *   - ANTES de chamar a IA nas ações edital_*: linhas edital_* da empresa no
 *     dia (fuso de Brasília) ≥ cota → a ação é recusada (429 COTA_IA). Cota =
 *     saas_config 'ia_cota_edital_dia' (inteiro ≥ 1) ou COTA_EDITAL_PADRAO.
 *     Super admin isento (mas o uso dele também é gravado).
 *   - Falha ao ler a cota/contar (ex.: migração ainda não aplicada) libera a
 *     ação; falha ao gravar só vai para o log — nunca derruba a ação.
 *
 * Só importa ../_shared/ia-precos.ts (puro); o cliente (service role) vem de
 * quem chama — testável em Node.
 */
import { custoUsd } from "../_shared/ia-precos.ts";

export const COTA_EDITAL_PADRAO = 400;
export const CHAVE_COTA_EDITAL = "ia_cota_edital_dia";
export const ACOES_EDITAL = ["edital_extrair_parte", "edital_consolidar", "edital_atende"] as const;
export type AcaoEdital = (typeof ACOES_EDITAL)[number];

export const ehAcaoEdital = (acao: unknown): acao is AcaoEdital =>
  typeof acao === "string" && (ACOES_EDITAL as readonly string[]).includes(acao);

export interface UsuarioUso {
  email: string;
  is_super_admin: boolean;
  empresa_id: string | null;
}

export interface MedidorUso {
  /** chamadas a um provedor de IA que chegaram a sair (inclui erro/timeout) */
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  modelos: string[];
  /** provedores chamados, na ordem ("gemini", "openai") */
  provedores: string[];
  /** soma do custo estimado (US$) das chamadas com preço conhecido */
  custo_usd: number;
  /** false = nenhuma chamada tinha preço conhecido → grava custo_usd null */
  custo_conhecido: boolean;
}

export const novoMedidor = (): MedidorUso => ({
  chamadas: 0,
  tokens_entrada: 0,
  tokens_saida: 0,
  modelos: [],
  provedores: [],
  custo_usd: 0,
  custo_conhecido: false,
});

/** o que interessa de RespostaIA (ok ou não) — ver _shared/ia-tipos.ts */
interface RespostaComUso {
  ok: boolean;
  motivo?: string;
  modelo?: string;
  provedor?: string;
  usage?: { input_tokens: number; output_tokens: number };
  /** chamarIA: TODAS as respostas da chamada (Gemini e reserva), na ordem */
  tentativas?: RespostaComUso[];
}

/**
 * Soma uma resposta ao medidor. Com `tentativas` (chamarIA), soma cada uma
 * delas — a resposta final já está na lista e não é somada de novo; sem,
 * soma a própria resposta. "config" (sem chave) não chegou a chamar a IA.
 */
export function contabilizar(
  m: MedidorUso | undefined,
  r: RespostaComUso,
  modeloPedido?: string
): void {
  if (!m) return;
  const lista = r.tentativas?.length ? r.tentativas : [r];
  for (const t of lista) {
    if (!t.ok && t.motivo === "config") continue;
    m.chamadas++;
    const entrada = Math.max(0, Math.round(Number(t.usage?.input_tokens) || 0));
    const saida = Math.max(0, Math.round(Number(t.usage?.output_tokens) || 0));
    m.tokens_entrada += entrada;
    m.tokens_saida += saida;
    const modelo = t.modelo || modeloPedido;
    if (modelo && !m.modelos.includes(modelo)) m.modelos.push(modelo);
    if (t.provedor && !m.provedores.includes(t.provedor)) m.provedores.push(t.provedor);
    const custo = custoUsd(modelo, { input_tokens: entrada, output_tokens: saida });
    if (custo !== null) {
      // soma em micro-dólar para não acumular erro de ponto flutuante
      m.custo_usd = Math.round((m.custo_usd + custo) * 1_000_000) / 1_000_000;
      m.custo_conhecido = true;
    }
  }
}

/** 00:00 de hoje em Brasília (UTC−3; sem horário de verão desde 2019), em ISO */
export function inicioDoDiaBR(agora = new Date()): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return `${dia}T00:00:00-03:00`;
}

/** valor de saas_config → cota (inteiro ≥ 1); ausente/inválido → padrão */
export function lerCota(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  return Number.isInteger(n) && n >= 1 ? n : COTA_EDITAL_PADRAO;
}

// supabase-js com service role (tipado solto de propósito: sem imports aqui)
// deno-lint-ignore no-explicit-any
type Cliente = any;

/** filtro do "dono" do consumo: a empresa; sem empresa, o próprio usuário */
// deno-lint-ignore no-explicit-any
function doDono(q: any, u: UsuarioUso) {
  return u.empresa_id
    ? q.eq("empresa_id", u.empresa_id)
    : q.is("empresa_id", null).eq("usuario_email", u.email);
}

/**
 * null = pode seguir; { cota, usadas } = passou da cota do dia.
 * Erro de leitura → libera (a cota é freio de custo, não pode parar o SaaS).
 */
export async function verificarCotaEdital(
  admin: Cliente,
  u: UsuarioUso,
  agora = new Date()
): Promise<{ cota: number; usadas: number } | null> {
  if (u.is_super_admin) return null;
  try {
    const [cfg, cont] = await Promise.all([
      admin.from("saas_config").select("valor").eq("chave", CHAVE_COTA_EDITAL).maybeSingle(),
      doDono(admin.from("ia_uso").select("id", { count: "exact", head: true }), u)
        .in("acao", [...ACOES_EDITAL])
        .gte("criado_em", inicioDoDiaBR(agora)),
    ]);
    if (cont?.error) {
      console.warn("[ia-processar] cota: falha ao contar ia_uso —", cont.error.message);
      return null;
    }
    const cota = lerCota(cfg?.error ? null : cfg?.data?.valor);
    const usadas = Number(cont?.count) || 0;
    return usadas >= cota ? { cota, usadas } : null;
  } catch (e) {
    console.warn("[ia-processar] cota: erro —", (e as Error)?.message);
    return null;
  }
}

/** grava o consumo da requisição (só se chamou a IA); erro vai só para o log */
export async function registrarUso(
  admin: Cliente,
  u: UsuarioUso,
  acao: string,
  m: MedidorUso
): Promise<void> {
  if (!m.chamadas) return;
  try {
    const { error } = await admin.from("ia_uso").insert({
      empresa_id: u.empresa_id,
      usuario_email: u.email,
      acao,
      provedor: m.provedores.join(",").slice(0, 100) || null,
      modelo: m.modelos.join(",").slice(0, 200) || null,
      tokens_entrada: m.tokens_entrada,
      tokens_saida: m.tokens_saida,
      custo_usd: m.custo_conhecido ? m.custo_usd : null,
    });
    if (error) console.warn("[ia-processar] ia_uso: falha ao gravar —", error.message);
  } catch (e) {
    console.warn("[ia-processar] ia_uso: erro ao gravar —", (e as Error)?.message);
  }
}
