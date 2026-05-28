-- ============================================================================
-- 0020 — Terceira rodada — caça aos últimos 2.741 records falhando
-- ============================================================================

-- ferramenta: mais 1 coluna legacy
alter table public.ferramenta
  add column if not exists proxima_calibracao date;
alter table public.ferramenta
  add column if not exists ultima_calibracao date;
alter table public.ferramenta
  add column if not exists numero_serie text;

-- solicitacao_compra: mais 1 coluna
alter table public.solicitacao_compra
  add column if not exists valor_total_estimado numeric(14,2);
alter table public.solicitacao_compra
  add column if not exists valor_total_aprovado numeric(14,2);

-- transacao_financeira: drop FK conta_id (alguns registros legacy apontam
-- pra contas que não existem mais ou foram deletadas)
alter table public.transacao_financeira
  drop constraint if exists transacao_financeira_conta_id_fkey;

-- canal_chat: outra FK que aparece após dropar oportunidade_id
alter table public.canal_chat
  drop constraint if exists canal_chat_solicitacao_id_fkey;
