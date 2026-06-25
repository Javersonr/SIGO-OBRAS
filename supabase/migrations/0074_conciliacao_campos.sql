-- ============================================================================
-- 0074_conciliacao_campos.sql — colunas do fluxo de conciliação bancária
--
-- Auditoria (cruzamento frontend × schema) encontrou os últimos campos fantasma
-- do módulo financeiro, no fluxo de CONCILIAÇÃO (era a tarefa adiada #117):
--   - ConciliacaoBancaria.conciliarTransacao() faz:
--       ExtratoBancario.update({ ..., data_conciliacao })  ← coluna não existia
--       TransacaoFinanceira.update({ conciliado, extrato_id }) ← coluna não existia
--   Sem essas colunas a conciliação quebrava (Promise.allSettled → "conciliação
--   ficou pela metade").
--
-- Fix aditivo (nullable, sem FK p/ não esbarrar em dados legados):
--   - transacao_financeira.extrato_id  uuid : qual extrato conciliou a transação
--   - extrato_bancario.data_conciliacao date : quando foi conciliado
-- (status_conciliacao já foi adicionado na 0072.) + reload do schema cache.
--
-- Observação: o campo `centro_custo` (errado) do PreLancamentosTab foi corrigido
-- no frontend p/ `centro_custo_nome` (coluna que já existe) — não precisa de DDL.
-- ============================================================================

alter table public.transacao_financeira
  add column if not exists extrato_id uuid;

alter table public.extrato_bancario
  add column if not exists data_conciliacao date;

notify pgrst, 'reload schema';
