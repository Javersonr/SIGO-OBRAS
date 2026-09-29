/**
 * resolveClienteScope — deriva o escopo (empresa_id + oportunidade_id) do
 * cliente a partir da credencial do portal, validando-a no servidor. NUNCA
 * confie no empresa_id/oportunidade_id vindos do client; sempre re-derive aqui.
 *
 * Credencial (uma das duas no body):
 *   - { token }        → magic link (token_cliente_oportunidade)
 *   - { portal_token } → login do cliente (HMAC, perfil "Cliente")
 *
 * Nos dois casos o projeto/oportunidade do escopo tem de existir NA empresa
 * do escopo (oportunidadeDaEmpresa) — senão 404, como link inválido.
 *
 * Revogação: o magic link confere `ativo` a cada chamada; o portal_token (12h)
 * confere a cada chamada se o vínculo "Cliente" que o gerou continua ativo —
 * desativar/apagar o vínculo derruba a sessão na hora, sem esperar o `exp`.
 *
 * `abas` sai normalizado: { orcamento?: true, obra?: true } (só `true` libera).
 */
import { verifyPortalToken } from "./portal-token.ts";

export interface ClienteScope {
  empresa_id: string;
  oportunidade_id: string;
  email_cliente: string | null;
  abas: Record<string, boolean>;
}

const MSG_LINK_INVALIDO = "Link inválido ou expirado";
const MSG_SESSAO_INVALIDA = "Sessão do cliente inválida ou expirada";

// deno-lint-ignore no-explicit-any
function safeJson(v: any, fallback: any) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/**
 * abas_liberadas do magic link → { aba: true }. O banco tem objeto
 * ({"obra": true, "orcamento": true}); o default da coluna é lista ('[]'),
 * então ["obra"] também vale. Qualquer outro valor (string, "true"...) = fechada.
 */
function normalizarAbas(v: unknown): Record<string, boolean> {
  const bruto = safeJson(v, {});
  const abas: Record<string, boolean> = {};
  if (Array.isArray(bruto)) {
    for (const a of bruto) if (typeof a === "string" && a) abas[a] = true;
  } else if (bruto && typeof bruto === "object") {
    for (const [k, val] of Object.entries(bruto)) if (val === true) abas[k] = true;
  }
  return abas;
}

/**
 * O vínculo "Cliente" que emitiu o portal_token continua valendo? (e-mail e
 * empresa do token, projeto = oportunidade do escopo, ativo, não apagado).
 * Erro de consulta = não achou (fecha, não abre).
 */
async function vinculoClienteAtivo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
  empresaId: string,
  oportunidadeId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("usuario_empresa")
    .select("id")
    .eq("usuario_email", email)
    .eq("empresa_id", empresaId)
    .eq("projeto_id", oportunidadeId)
    .eq("perfil", "Cliente")
    .eq("ativo", true)
    .is("deleted_at", null)
    .limit(1);
  if (error) console.error("[portal-cliente-scope] conferindo vínculo:", error.message);
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * O projeto OU a oportunidade (mesma id) existe na empresa do escopo? A RLS só
 * confere o empresa_id da linha do token/vínculo, não o do pai: um token da
 * empresa A apontando para a oportunidade da B entregaria os dados da B.
 * Erro de consulta = não achou (fecha, não abre).
 */
async function oportunidadeDaEmpresa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  empresaId: string,
  oportunidadeId: string
): Promise<boolean> {
  const [projeto, oportunidade] = await Promise.all([
    supabase
      .from("projeto")
      .select("id")
      .eq("id", oportunidadeId)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("oportunidade")
      .select("id")
      .eq("id", oportunidadeId)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);
  if (projeto.error || oportunidade.error) {
    console.error(
      "[portal-cliente-scope] conferindo oportunidade:",
      projeto.error?.message ?? oportunidade.error?.message
    );
  }
  return !!(projeto.data || oportunidade.data);
}

export async function resolveClienteScope(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  body: any
): Promise<{ scope?: ClienteScope; error?: string; status?: number }> {
  if (body?.portal_token) {
    const claims = await verifyPortalToken(body.portal_token);
    if (
      !claims ||
      claims.scope !== "cliente" ||
      !claims.oportunidade_id ||
      !claims.empresa_id ||
      typeof claims.email !== "string" ||
      !claims.email
    ) {
      return { error: MSG_SESSAO_INVALIDA, status: 401 };
    }
    const empresa_id = String(claims.empresa_id);
    const oportunidade_id = String(claims.oportunidade_id);
    // o login-custom busca o vínculo pelo e-mail em minúsculas
    const email = claims.email.trim().toLowerCase();
    if (!(await vinculoClienteAtivo(supabase, email, empresa_id, oportunidade_id))) {
      return { error: MSG_SESSAO_INVALIDA, status: 401 };
    }
    if (!(await oportunidadeDaEmpresa(supabase, empresa_id, oportunidade_id))) {
      return { error: MSG_LINK_INVALIDO, status: 404 };
    }
    return {
      scope: {
        empresa_id,
        oportunidade_id,
        email_cliente: claims.email,
        // login do cliente: libera as duas abas (como antes)
        abas: { orcamento: true, obra: true },
      },
    };
  }

  if (body?.token) {
    const { data: row } = await supabase
      .from("token_cliente_oportunidade")
      .select("empresa_id, oportunidade_id, email_cliente, expira_em, abas_liberadas, ativo")
      .eq("token", body.token)
      .eq("ativo", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return { error: MSG_LINK_INVALIDO, status: 404 };
    if (row.expira_em && new Date(row.expira_em).getTime() < Date.now()) {
      return { error: "Este link expirou. Solicite um novo link.", status: 401 };
    }
    if (
      !row.empresa_id ||
      !row.oportunidade_id ||
      !(await oportunidadeDaEmpresa(supabase, row.empresa_id, row.oportunidade_id))
    ) {
      return { error: MSG_LINK_INVALIDO, status: 404 };
    }
    return {
      scope: {
        empresa_id: row.empresa_id,
        oportunidade_id: row.oportunidade_id,
        email_cliente: row.email_cliente ?? null,
        abas: normalizarAbas(row.abas_liberadas),
      },
    };
  }

  return { error: "Credencial ausente", status: 400 };
}
