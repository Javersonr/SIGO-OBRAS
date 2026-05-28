-- ============================================================================
-- 0019 — Segunda rodada de relaxamento pra import legacy
-- ============================================================================
-- Após M0018, conseguimos 6.978 de 10.936 registros. Os 3.958 que ainda
-- falham têm padrões similares: mais CHECKs restritivos, colunas legadas
-- não previstas, FKs rígidas e NOT NULLs onde dados legados tinham null.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. projeto — add coluna responsaveis_ids (estava como jsonb na plataforma anterior)
-- ---------------------------------------------------------------------------
alter table public.projeto
  add column if not exists responsaveis_ids jsonb;

alter table public.projeto
  add column if not exists responsaveis_emails jsonb;

alter table public.projeto
  add column if not exists responsaveis_nomes jsonb;

-- Drop CHECKs restritivos da projeto também (status pode ter valores extras)
alter table public.projeto
  drop constraint if exists projeto_status_check;

-- ---------------------------------------------------------------------------
-- 2. tarefa_projeto — drop CHECKs status + progresso
-- ---------------------------------------------------------------------------
alter table public.tarefa_projeto
  drop constraint if exists tarefa_projeto_status_check;

alter table public.tarefa_projeto
  drop constraint if exists tarefa_projeto_progresso_check;

-- ---------------------------------------------------------------------------
-- 3. cronograma_etapa — add data_fim
-- ---------------------------------------------------------------------------
alter table public.cronograma_etapa
  add column if not exists data_fim date;

alter table public.cronograma_etapa
  add column if not exists data_inicio date;

-- ---------------------------------------------------------------------------
-- 4. orcamento_item — relax NOT NULL em descricao
-- ---------------------------------------------------------------------------
alter table public.orcamento_item
  alter column descricao drop not null;

alter table public.orcamento_item
  drop constraint if exists orcamento_item_projeto_id_fkey;

-- ---------------------------------------------------------------------------
-- 5. solicitacao_compra — colunas legacy adicionais
-- ---------------------------------------------------------------------------
alter table public.solicitacao_compra
  add column if not exists proximo_aprovador_nome text;

alter table public.solicitacao_compra
  add column if not exists proximo_aprovador_email text;

alter table public.solicitacao_compra
  add column if not exists nivel_aprovacao_atual integer;

-- ---------------------------------------------------------------------------
-- 6. ferramenta — add projeto_id + outras colunas legacy
-- ---------------------------------------------------------------------------
alter table public.ferramenta
  add column if not exists projeto_id uuid;

alter table public.ferramenta
  add column if not exists projeto_nome text;

-- ---------------------------------------------------------------------------
-- 7. transacao_financeira — drop CHECK tipo (não só status)
-- ---------------------------------------------------------------------------
alter table public.transacao_financeira
  drop constraint if exists transacao_financeira_tipo_check;

alter table public.transacao_financeira
  alter column conta_id drop not null;

-- ---------------------------------------------------------------------------
-- 8. transacao_anexo — drop FK pra transacao
-- ---------------------------------------------------------------------------
alter table public.transacao_anexo
  drop constraint if exists transacao_anexo_transacao_id_fkey;

-- ---------------------------------------------------------------------------
-- 9. pre_lancamento — drop FKs duros
-- ---------------------------------------------------------------------------
alter table public.pre_lancamento
  drop constraint if exists pre_lancamento_transacao_id_fkey;

-- ---------------------------------------------------------------------------
-- 10. movimentacao_ferramenta — drop FK funcionario e ferramenta
-- ---------------------------------------------------------------------------
alter table public.movimentacao_ferramenta
  drop constraint if exists movimentacao_ferramenta_ferramenta_id_fkey;

alter table public.movimentacao_ferramenta
  drop constraint if exists mov_ferr_funcionario_fk;

-- ---------------------------------------------------------------------------
-- 11. inspecao_historico — drop FK ferramenta
-- ---------------------------------------------------------------------------
alter table public.inspecao_historico
  drop constraint if exists inspecao_historico_ferramenta_id_fkey;

-- ---------------------------------------------------------------------------
-- 12. diario_obra — drop FK projeto
-- ---------------------------------------------------------------------------
alter table public.diario_obra
  drop constraint if exists diario_obra_projeto_id_fkey;

-- ---------------------------------------------------------------------------
-- 13. cotacao — drop FK projeto
-- ---------------------------------------------------------------------------
alter table public.cotacao
  drop constraint if exists cotacao_projeto_id_fkey;

-- ---------------------------------------------------------------------------
-- 14. canal_chat — drop FK oportunidade
-- ---------------------------------------------------------------------------
alter table public.canal_chat
  drop constraint if exists canal_chat_oportunidade_id_fkey;

-- ---------------------------------------------------------------------------
-- 15. reserva_material — relax NOT NULL almoxarifado_id
-- ---------------------------------------------------------------------------
alter table public.reserva_material
  alter column almoxarifado_id drop not null;

-- ---------------------------------------------------------------------------
-- 16. token_cliente_oportunidade — diagnostic placeholder (1 registro falhou)
--     drop FKs por segurança
-- ---------------------------------------------------------------------------
alter table public.token_cliente_oportunidade
  drop constraint if exists token_cliente_oportunidade_oportunidade_id_fkey;
