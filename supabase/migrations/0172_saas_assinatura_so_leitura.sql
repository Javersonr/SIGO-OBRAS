-- ============================================================================
-- 0172 — F-03 (varredura nov/2026, Lote 2): a empresa cliente só LÊ a própria
-- assinatura, os pagamentos e os boletos do SaaS
--
-- FURO: assinatura, pagamento e boleto_bancario tinham a policy da empresa FOR ALL
-- (tenant_isolation / blt_tenant: empresa_id = current_empresa_id()). Qualquer
-- usuário de uma empresa cliente podia, direto por /rest/v1, criar uma assinatura
-- "Ativa" até 2099 no plano mais caro (o Layout libera os módulos lendo
-- assinatura Ativa/Trial), marcar pagamento como "Pago" ou apagar os boletos que
-- a Sinergia Digital emitiu para ele.
--
-- QUEM USA HOJE (levantado no código):
--   * leitura da empresa: Layout.jsx:400/488, Configuracoes.jsx:101,
--     Dashboard.jsx:110, Relatorios.jsx:48 (só Assinatura.filter);
--   * escrita: SÓ a tela SaasAdmin (super admin): Assinatura/BoletoBancario/
--     Pagamento create/update/delete (SaasAdmin.jsx:437-635), que passa pela
--     policy super_admin_all / blt_super_admin (mantidas);
--   * Edge Functions mcp/contexto.ts:145 e mcp-oauth/index.ts:565 leem com
--     service role (não passam por RLS).
--   boleto_bancario é só do SaaS: a empresa NÃO emite boleto próprio por esta
--   tabela (o "boleto" do Financeiro é só forma de pagamento em
--   transacao_financeira; nenhuma tela além da SaasAdmin usa BoletoBancario).
--
-- AGORA: a policy da empresa vira só SELECT (mesmo filtro); a escrita fica para o
-- super admin (policy existente) e para o servidor (service role). DELETE físico
-- sai de authenticated (o SDK só faz exclusão lógica = UPDATE de deleted_at) e
-- toda escrita sai de anon (nenhuma página pública usa estas tabelas).
--
-- Efeito para a empresa cliente: INSERT recusado pela RLS; UPDATE/DELETE lógico
-- não acham a linha (o SDK lança "não encontrado"). Nenhuma tela da empresa
-- escreve aqui, então nada muda para ela.
--
-- Deploy: independente das outras do lote; pode ir primeiro.
--   supabase db query --linked -f supabase/migrations/0172_saas_assinatura_so_leitura.sql
-- Teste: tools/smoke-lote2-a-saas.sql (termina em ROLLBACK).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- assinatura ------------------------------------------------------------------
drop policy if exists tenant_isolation on public.assinatura;
drop policy if exists tenant_ler on public.assinatura;
create policy tenant_ler on public.assinatura
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

-- pagamento -------------------------------------------------------------------
drop policy if exists tenant_isolation on public.pagamento;
drop policy if exists tenant_ler on public.pagamento;
create policy tenant_ler on public.pagamento
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

-- boleto_bancario (boletos do SaaS; empresa_id nulo = boleto sem empresa) -----
drop policy if exists blt_tenant on public.boleto_bancario;
drop policy if exists blt_tenant_ler on public.boleto_bancario;
create policy blt_tenant_ler on public.boleto_bancario
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

-- super_admin_all (assinatura, pagamento) e blt_super_admin ficam como estão:
-- a SaasAdmin grava por elas, com o JWT do super admin (papel authenticated).

-- grants ----------------------------------------------------------------------
revoke insert, update, delete, truncate on public.assinatura from anon;
revoke insert, update, delete, truncate on public.pagamento from anon;
revoke insert, update, delete, truncate on public.boleto_bancario from anon;

revoke delete, truncate on public.assinatura from authenticated;
revoke delete, truncate on public.pagamento from authenticated;
revoke delete, truncate on public.boleto_bancario from authenticated;

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
