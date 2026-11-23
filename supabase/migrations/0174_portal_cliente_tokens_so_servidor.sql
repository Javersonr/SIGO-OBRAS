-- ============================================================================
-- 0174 — F-07 (varredura nov/2026, Lote 2): cliente_portal_usuario e
-- token_cliente_oportunidade só pelo servidor (o que a 0089 pretendia)
--
-- FURO: a 0089 religou a RLS destas duas tabelas dizendo "RLS ligada SEM policy
-- de cliente = fechado", mas a policy tenant_isolation (FOR ALL) criada na 0014
-- nunca foi apagada (o catálogo de produção de 23/11 confirma). Qualquer perfil
-- da empresa lia senha_hash e cpf_cnpj dos usuários do portal do cliente e os
-- tokens dos links mágicos (sem expiração quando expira_em é nulo), e podia
-- criar um token novo para qualquer oportunidade da empresa.
--
-- QUEM USA HOJE (levantado no código):
--   * cliente_portal_usuario: ninguém (nem front, nem Edge Function, nem função
--     do banco); o login do cliente usa usuario_custom (portal-cliente-scope.ts);
--   * token_cliente_oportunidade: só a Edge Function portal-cliente-dados, via
--     _shared/portal-cliente-scope.ts:160 (service role, só SELECT). Nenhuma
--     tela cria nem lê token (grep de TokenClienteOportunidade e do nome da
--     tabela em apps/web/src: vazio).
--
-- AGORA: sai a policy da empresa; super_admin_all fica (só leitura, pelos
-- grants); anon perde tudo; authenticated perde INSERT/UPDATE/DELETE/TRUNCATE.
-- O servidor (service role) segue lendo e gravando.
--
-- FORA deste item: guardar só o hash do token e exigir expira_em (muda a Edge
-- Function portal-cliente-dados e quem venha a gerar o link); apagar a tabela
-- cliente_portal_usuario (sem uso). Ver LOTE2-banco.md.
--
-- Deploy: independente das outras do lote.
--   supabase db query --linked -f supabase/migrations/0174_portal_cliente_tokens_so_servidor.sql
-- Teste: tools/smoke-lote2-c-portal-cliente.sql (termina em ROLLBACK).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

drop policy if exists tenant_isolation on public.cliente_portal_usuario;
drop policy if exists tenant_isolation on public.token_cliente_oportunidade;

revoke all on public.cliente_portal_usuario from anon;
revoke all on public.token_cliente_oportunidade from anon;

revoke insert, update, delete, truncate on public.cliente_portal_usuario from authenticated;
revoke insert, update, delete, truncate on public.token_cliente_oportunidade from authenticated;

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
