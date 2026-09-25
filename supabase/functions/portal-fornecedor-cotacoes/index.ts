/**
 * portal-fornecedor-cotacoes — histórico de cotações do fornecedor logado.
 *
 * Substitui as leituras diretas (sigo.entities.*) de HistoricoCotacoes.jsx, que
 * voltariam vazias sob RLS (o fornecedor opera como `anon`). Valida o
 * `portal_token` (HMAC) emitido no login e devolve, via service role, apenas as
 * cotações daquele fornecedor — escopo mínimo.
 *
 * Escopo = empresa_id + fornecedor_id do token, e TODA leitura filtra pelos
 * dois: o fornecedor tem de ser da empresa do token e cada participação e
 * cotação também (linha legada apontando para outra empresa fica de fora).
 *
 * Service role enxerga tudo: a resposta leva SÓ as colunas listadas abaixo —
 * nada de select("*"). Resultado da cotação (vencedor, valor aprovado) só vai
 * quando o vencedor é o próprio fornecedor; concorrente nunca aparece.
 *
 * Entrada:  { portal_token }
 * Resposta: { success, empresa, fornecedor, cotacoes: [{ ...cotacao, participacao }] }
 *   empresa.logo_url_assinada = URL pronta do logo; null → mostrar só o nome.
 *   participacao.token = link da PRÓPRIA participação (abre/responde a cotação).
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { verifyPortalToken } from "../_shared/portal-token.ts";
import { comLogoAssinado } from "../_shared/storage-assinar.ts";

// O que o HistoricoCotacoes usa
const COLS_PARTICIPACAO =
  "id, cotacao_id, fornecedor_id, status, motivo_recusa, data_resposta, data_visualizacao, created_at, token";
const COLS_COTACAO = "id, numero, projeto_nome, data_limite, observacoes, status, created_at";
// Lidas só para saber se ESTE fornecedor venceu (ver montagem abaixo)
const COLS_RESULTADO = "fornecedor_vencedor_id, fornecedor_vencedor_nome, valor_aprovado";

const MSG_SESSAO_INVALIDA = "Sessão do fornecedor inválida ou expirada";

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
    if (!claims || claims.scope !== "fornecedor" || !claims.fornecedor_id || !claims.empresa_id) {
      return fail(MSG_SESSAO_INVALIDA, 401);
    }

    const supabase = createAdminClient();
    const fornecedorId = claims.fornecedor_id as string;
    const empresaId = claims.empresa_id as string;

    // Cabeçalho (empresa + fornecedor) e participações — tudo no escopo do token
    const [empresaRes, fornecedorRes, participacoesRes] = await Promise.all([
      supabase
        .from("empresa")
        .select("id, nome, nome_fantasia, razao_social, logo_url")
        .eq("id", empresaId)
        .maybeSingle(),
      supabase
        .from("fornecedor")
        .select("id, nome_razao, nome_fantasia, email")
        .eq("id", fornecedorId)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
      supabase
        .from("cotacao_fornecedor")
        .select(COLS_PARTICIPACAO)
        .eq("fornecedor_id", fornecedorId)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null),
    ]);

    if (fornecedorRes.error || participacoesRes.error) {
      console.error(
        "[portal-fornecedor-cotacoes] erro:",
        fornecedorRes.error?.message ?? participacoesRes.error?.message
      );
      return fail("Erro ao carregar cotações", 500);
    }
    // Fornecedor que não é da empresa do token (acesso legado forjado) = sessão inválida
    const fornecedor = fornecedorRes.data;
    if (!fornecedor) return fail(MSG_SESSAO_INVALIDA, 401);

    const participacoes = participacoesRes.data ?? [];
    let cotacoes: unknown[] = [];
    if (participacoes.length > 0) {
      const cotacaoIds = [...new Set(participacoes.map((p) => p.cotacao_id))];
      const { data: cots, error: cErr } = await supabase
        .from("cotacao")
        .select(`${COLS_COTACAO}, ${COLS_RESULTADO}`)
        .in("id", cotacaoIds)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null);
      if (cErr) {
        console.error("[portal-fornecedor-cotacoes] erro cotacoes:", cErr.message);
        return fail("Erro ao carregar cotações", 500);
      }

      const cotById = new Map((cots ?? []).map((c) => [c.id, c]));
      cotacoes = participacoes
        .map((p) => {
          const cot = cotById.get(p.cotacao_id);
          if (!cot) return null;
          const { fornecedor_vencedor_id, fornecedor_vencedor_nome, valor_aprovado, ...c } = cot;
          // A tela mostra "Vencedor"/"Você" comparando com participacao.fornecedor_id:
          // o resultado só vai se o vencedor for ELE; de concorrente, nada.
          const venceu = !!fornecedor_vencedor_id && fornecedor_vencedor_id === fornecedorId;
          return {
            ...withCreatedDate(c),
            fornecedor_vencedor_id: venceu ? fornecedorId : null,
            fornecedor_vencedor_nome: venceu ? fornecedor_vencedor_nome : null,
            valor_aprovado: venceu ? valor_aprovado : null,
            participacao: withCreatedDate(p),
          };
        })
        .filter(Boolean)
        // mais recentes primeiro
        // deno-lint-ignore no-explicit-any
        .sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }

    return ok({
      empresa: await comLogoAssinado(supabase, empresaRes.data ?? null),
      fornecedor,
      cotacoes,
    });
  })
);
