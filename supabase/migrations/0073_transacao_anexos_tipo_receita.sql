-- ============================================================================
-- 0073_transacao_anexos_tipo_receita.sql — colunas que o form de receita grava
--
-- BUG em produção: criar receita falha com
-- "Could not find the 'anexos' column of 'transacao_financeira'".
--
-- Causa (mesma família do 0072): o formulário de Receita (ReceitasTab.handleSave)
-- monta a transação com `anexos` (JSON dos comprovantes) e `tipo_receita`
-- (Serviço/Produto/...), mas transacao_financeira não tem essas colunas. A
-- criação de despesa não passava por isso (anexo vai em tabela separada e o
-- DespesaModal não grava tipo_receita).
--
-- Fix (aditivo, nullable, sem CHECK → risco mínimo, sem mexer no frontend):
--   - tipo_receita text  : classificação da receita (exibida na tela)
--   - anexos       text  : JSON dos comprovantes anexados na criação
-- + recarrega o schema cache do PostgREST.
--
-- Obs.: consolidar anexos de receita no mesmo mecanismo da despesa (tabela de
-- Anexo) fica como limpeza futura; aqui só destravamos sem perder dado.
-- ============================================================================

alter table public.transacao_financeira
  add column if not exists tipo_receita text,
  add column if not exists anexos text;

notify pgrst, 'reload schema';
