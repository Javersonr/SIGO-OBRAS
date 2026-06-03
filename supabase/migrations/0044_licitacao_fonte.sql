-- ============================================================================
-- 0044_licitacao_fonte.sql — origem da licitação (Alerta vs PNCP vs ...)
--
-- Agora a mesma lista (licitacao_encontrada) recebe licitações de mais de uma
-- fonte. A coluna `fonte` etiqueta de onde veio cada uma, pra mostrar na UI e
-- pra dedup/depuração. Linhas antigas viraram 'Alerta Licitação'.
-- ============================================================================

alter table public.licitacao_encontrada
  add column if not exists fonte text not null default 'Alerta Licitação';

-- backfill explícito (idempotente) das que já existiam
update public.licitacao_encontrada
  set fonte = 'Alerta Licitação'
  where fonte is null;

create index if not exists lic_enc_fonte_idx
  on public.licitacao_encontrada(empresa_id, fonte);
