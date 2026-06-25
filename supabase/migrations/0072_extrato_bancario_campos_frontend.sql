-- ============================================================================
-- 0072_extrato_bancario_campos_frontend.sql — colunas que o frontend grava
--
-- BUG em produção: "Registrar Pagamento" (toggle de status da despesa/receita)
-- falha com "Could not find the 'categoria' column of 'extrato_bancario'".
--
-- Causa: o frontend escreve no extrato_bancario o shape antigo do Base44
-- (descricao, tipo, categoria, status_conciliacao) em 5 pontos (DespesasTab,
-- ReceitasTab, ConciliacaoBancaria), mas a tabela (0011) só tem `historico`,
-- `valor` (com sinal) e `conciliado`. É o "campos fantasma" que estava adiado
-- (AUTO-5/#117) — agora travando o pagamento.
--
-- Fix (aditivo, sem mexer no frontend → risco mínimo): adiciona as colunas que
-- o frontend grava/lê. Nullable, sem CHECK. Recarrega o schema cache do
-- PostgREST ao final pra a API enxergar as colunas na hora.
-- ============================================================================

alter table public.extrato_bancario
  add column if not exists descricao text,
  add column if not exists tipo text, -- 'debito' | 'credito' (o sinal de valor já reflete)
  add column if not exists categoria text,
  add column if not exists status_conciliacao text;

-- PostgREST: recarrega o cache de schema imediatamente (Supabase também dispara
-- sozinho no DDL, mas garantimos pra não depender da janela do watcher).
notify pgrst, 'reload schema';
