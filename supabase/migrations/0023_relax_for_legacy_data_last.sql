-- ============================================================================
-- 0023 — Últimos drops/adds pros 286 records remanescentes
-- ============================================================================

-- Coluna
alter table public.projeto add column if not exists titulo text;

-- UNIQUEs (dump tem duplicatas em emails)
alter table public.usuario_custom  drop constraint if exists usuario_custom_email_key;
alter table public.usuario_empresa drop constraint if exists usuario_empresa_usuario_email_empresa_id_key;

-- FKs rígidas finais
alter table public.treinamento          drop constraint if exists treinamento_funcao_id_fkey;
alter table public.extrato_bancario     drop constraint if exists extrato_bancario_conta_id_fkey;
alter table public.transacao_financeira drop constraint if exists tx_pre_lancamento_fk;

notify pgrst, 'reload schema';
