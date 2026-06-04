-- ============================================================================
-- 0049 — Hardening pós-RLS (Etapa 5): view respeita RLS + remove grants anon
-- ============================================================================
-- Aditivo e reversível. Não afeta usuários logados (papel `authenticated`
-- mantém todos os grants); só fecha o acesso do papel `anon` (sem login).
--
-- 1) v_nfe_resumo_mensal: uma view, por padrão, executa com os privilégios do
--    DONO e portanto BURLA a RLS das tabelas-base — ou seja, mesmo com a RLS
--    ligada (0048), um usuário autenticado poderia ler o resumo de NFe de
--    TODAS as empresas via a view. `security_invoker = on` faz a view rodar com
--    os privilégios do CHAMADOR, respeitando a RLS (cada um vê só a sua empresa).
--    Também tiramos o acesso do `anon`.
--
-- 2) criar_transferencia_atomica é SECURITY DEFINER (roda como dono, bypassa
--    RLS) e estava acessível a `anon`. Só usuários autenticados devem criar
--    transferências. Mantém authenticated + service_role.
--
-- NOTA (follow-up, NÃO neste arquivo): existem outras RPCs SECURITY DEFINER com
-- grant a `anon` (estoque 0027, compras 0028, upsert_nfe_recebida 0031,
-- get_aliquota_vigente 0033, sincronizar_projeto 0029/0030, jsonb helpers).
-- Revogar `anon` nelas é defense-in-depth (validam empresa_id internamente e
-- exigem UUIDs válidos), mas precisa de enumeração por assinatura e teste —
-- fica para um passe dedicado. NÃO usar REVOKE ... ALL FUNCTIONS FROM anon:
-- isso quebraria os helpers de RLS (current_empresa_id, current_user_is_super_admin)
-- que o `anon` precisa executar para as policies avaliarem (e devolverem []).
-- ============================================================================

-- 1) View de NFe: respeitar a RLS do chamador + tirar anon
alter view public.v_nfe_resumo_mensal set (security_invoker = on);
revoke select on public.v_nfe_resumo_mensal from anon;

-- 2) Transferência atômica: não chamável por anon
revoke execute on function public.criar_transferencia_atomica(
  uuid, uuid, uuid, numeric, date, text, uuid
) from anon;
