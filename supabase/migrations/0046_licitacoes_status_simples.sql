-- ============================================================================
-- 0046_licitacoes_status_simples.sql — modelo de 4 status (sem validador)
--
-- Decisão do usuário: simplificar o fluxo das licitações para
--   Nova → Em análise → Convertida (vira Oportunidade direto)  ·  Excluída
-- Removendo a etapa de validador ("Aguardando validação") e unificando
-- "Recusada"/"Descartada" em "Excluída" (aba recuperável).
--
-- Adiciona 'Excluída' ao CHECK e migra os dados legados para os 4 status.
-- Mantém os valores antigos no CHECK por segurança (não quebra insert antigo).
-- ============================================================================

alter table public.licitacao_encontrada
  drop constraint if exists licitacao_encontrada_status_check;

alter table public.licitacao_encontrada
  add constraint licitacao_encontrada_status_check
  check (status in (
    'Nova', 'Em análise', 'Aguardando validação',
    'Convertida', 'Recusada', 'Descartada', 'Excluída'
  ));

-- migra legado para o modelo de 4 status
update public.licitacao_encontrada
  set status = 'Em análise'
  where status = 'Aguardando validação';

update public.licitacao_encontrada
  set status = 'Excluída'
  where status in ('Recusada', 'Descartada');
