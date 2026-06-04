-- ============================================================================
-- 0050 — oportunidade.motivo_perda
-- ============================================================================
-- Registra POR QUE uma oportunidade foi perdida (ex.: preço, prazo, habilitação,
-- desistiu). Necessário para a ação "Marcar Perdido com motivo" e para o
-- win-rate (ganhas × perdidas por motivo). Aditivo e seguro.
-- ============================================================================

alter table public.oportunidade
  add column if not exists motivo_perda text;
