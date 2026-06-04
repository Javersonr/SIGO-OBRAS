/**
 * resolveClienteScope — deriva o escopo (empresa_id + oportunidade_id) do
 * cliente a partir da credencial do portal, validando-a no servidor. NUNCA
 * confie no empresa_id/oportunidade_id vindos do client; sempre re-derive aqui.
 *
 * Credencial (uma das duas no body):
 *   - { token }        → magic link (token_cliente_oportunidade)
 *   - { portal_token } → login do cliente (HMAC, perfil "Cliente")
 */
import { verifyPortalToken } from "./portal-token.ts";

export interface ClienteScope {
  empresa_id: string;
  oportunidade_id: string;
  email_cliente: string | null;
  abas: Record<string, boolean>;
}

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

export async function resolveClienteScope(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  body: any
): Promise<{ scope?: ClienteScope; error?: string; status?: number }> {
  if (body?.portal_token) {
    const claims = await verifyPortalToken(body.portal_token);
    if (!claims || claims.scope !== "cliente" || !claims.oportunidade_id || !claims.empresa_id) {
      return { error: "Sessão do cliente inválida ou expirada", status: 401 };
    }
    return {
      scope: {
        empresa_id: claims.empresa_id,
        oportunidade_id: claims.oportunidade_id,
        email_cliente: (claims.email as string) ?? null,
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
    if (!row) return { error: "Link inválido ou expirado", status: 404 };
    if (row.expira_em && new Date(row.expira_em).getTime() < Date.now()) {
      return { error: "Este link expirou. Solicite um novo link.", status: 401 };
    }
    return {
      scope: {
        empresa_id: row.empresa_id,
        oportunidade_id: row.oportunidade_id,
        email_cliente: row.email_cliente ?? null,
        abas: safeJson(row.abas_liberadas, {}),
      },
    };
  }

  return { error: "Credencial ausente", status: 400 };
}
