-- ============================================================================
-- 0022 — Últimos 361 records: drops e relaxes finais
-- ============================================================================

-- === COLUNAS LEGADAS ===
alter table public.usuario_empresa add column if not exists usuario_id uuid;
alter table public.treinamento     add column if not exists aluno_nome text;
alter table public.projeto         add column if not exists responsavel_id uuid;
alter table public.projeto         add column if not exists responsavel_nome text;

-- === CHECK CONSTRAINTS — DROP ===
alter table public.audit_log drop constraint if exists audit_log_tipo_acao_check;

-- === UNIQUE — DROP ===
alter table public.fornecedor_acesso
  drop constraint if exists fornecedor_acesso_empresa_id_fornecedor_email_key;

-- === FKs RÍGIDAS — DROP ===
alter table public.extrato_bancario   drop constraint if exists extrato_bancario_transacao_id_fkey;
alter table public.cronograma_etapa   drop constraint if exists cronograma_etapa_projeto_id_fkey;
alter table public.solicitacao_compra drop constraint if exists solicitacao_compra_projeto_id_fkey;

-- === NOT NULLs ===
alter table public.usuario_custom alter column empresa_id drop not null;

-- Refresh cache
notify pgrst, 'reload schema';
