/**
 * portal-fornecedor-cotacoes — histórico de cotações do fornecedor logado.
 *
 * Substitui as leituras diretas (sigo.entities.*) de HistoricoCotacoes.jsx, que
 * voltariam vazias sob RLS (o fornecedor opera como `anon`). Valida o
 * `portal_token` (HMAC) emitido no login e devolve, via service role, apenas as
 * cotações daquele fornecedor — escopo mínimo.
 *
 * Entrada:  { portal_token }
 * Resposta: { success, empresa, fornecedor, cotacoes: [{ ...cotacao, participacao }] }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { verifyPortalToken } from "../_shared/portal-token.ts";

// deno-lint-ignore no-explicit-any
function withCreatedDate(row: any) {
  if (row && row.created_at !== undefined && row.created_date === undefined) {
    row.created_date = row.created_at;
  }
  return row;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: { portal_token?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const claims = await verifyPortalToken(body.portal_token ?? "");
    if (!claims || claims.scope !== "fornecedor" || !claims.fornecedor_id) {
      return fail("Sessão do fornecedor inválida ou expirada", 401);
    }

    const supabase = createAdminClient();
    const fornecedorId = claims.fornecedor_id as string;
    const empresaId = claims.empresa_id as string;

    // Participações do fornecedor (cotacao_fornecedor)
    const { data: participacoes, error: pErr } = await supabase
      .from("cotacao_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedorId)
      .is("deleted_at", null);

    if (pErr) {
      console.error("[portal-fornecedor-cotacoes] erro participacoes:", pErr.message);
      return fail("Erro ao carregar cotações", 500);
    }

    // Empresa (cabeçalho) + cadastro do fornecedor (cabeçalho)
    const [{ data: empresa }, { data: fornecedor }] = await Promise.all([
      supabase
        .from("empresa")
        .select("id, nome, nome_fantasia, razao_social, logo_url")
        .eq("id", empresaId)
        .maybeSingle(),
      supabase
        .from("fornecedor")
        .select("id, nome_razao, nome_fantasia, email")
        .eq("id", fornecedorId)
        .maybeSingle(),
    ]);

    let cotacoes: unknown[] = [];
    if (participacoes && participacoes.length > 0) {
      const cotacaoIds = [...new Set(participacoes.map((p) => p.cotacao_id))];
      const { data: cots } = await supabase
        .from("cotacao")
        .select("*")
        .in("id", cotacaoIds)
        .is("deleted_at", null);

      const cotById = new Map((cots ?? []).map((c) => [c.id, c]));
      cotacoes = participacoes
        .map((p) => {
          const c = cotById.get(p.cotacao_id);
          if (!c) return null;
          return { ...withCreatedDate(c), participacao: withCreatedDate(p) };
        })
        .filter(Boolean)
        // mais recentes primeiro
        // deno-lint-ignore no-explicit-any
        .sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }

    return ok({ empresa: empresa ?? null, fornecedor: fornecedor ?? null, cotacoes });
  })
);
