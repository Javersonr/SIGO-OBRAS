-- ============================================================================
-- 0055_transacao_oportunidade.sql — corrige criação de despesa/receita
--
-- BUG (produção): salvar despesa/receita falhava com
--   "Could not find the 'oportunidade_id' column of 'transacao_financeira'
--    in the schema cache"
--
-- A tabela transacao_financeira (0010) foi criada com projeto_id e cliente_id,
-- mas SEM oportunidade_id/oportunidade_nome. Porém o formulário de despesa
-- (DespesasTab) e de receita (ReceitasTab) sempre enviam oportunidade_id +
-- oportunidade_nome, e o DetalheReceitaModal exibe oportunidade_nome — ou seja,
-- a coluna é esperada pelo app. (Uma tabela irmã na 0010 já tinha esse par.)
--
-- Fix aditivo/não-destrutivo: adiciona as 2 colunas + índice, no mesmo padrão
-- de projeto_id/cliente_id, e recarrega o schema cache do PostgREST.
-- ============================================================================

alter table public.transacao_financeira
  add column if not exists oportunidade_id uuid
    references public.oportunidade(id) on delete set null,
  add column if not exists oportunidade_nome text;

create index if not exists tx_oportunidade_idx
  on public.transacao_financeira(oportunidade_id)
  where oportunidade_id is not null;

-- recarrega o cache de schema do PostgREST (para o erro sumir na hora)
notify pgrst, 'reload schema';
