-- ============================================================================
-- 0130_pastas_arquivos.sql — pastas na aba Arquivos da oportunidade
--   (spec docs/superpowers/specs/2026-09-29-pastas-arquivos-oportunidade-design.md)
--
--   arquivo_oportunidade.pasta      nome da pasta; null = regra do front
--                                   (categorias do edital → "Edital"; resto → "Outros")
--   oportunidade.pastas_arquivos    pastas EXTRAS criadas pelo usuário (array jsonb)
--
-- Aditiva e idempotente. Sem backfill. RLS inalterada (mesmas tabelas).
-- Numeração: 0125–0129 estão reservadas pela branch fix/financeiro-auditoria-2026-09.
-- ============================================================================

alter table public.arquivo_oportunidade
  add column if not exists pasta text;

alter table public.oportunidade
  add column if not exists pastas_arquivos jsonb not null default '[]'::jsonb;

comment on column public.arquivo_oportunidade.pasta is
  'Pasta do arquivo na aba Arquivos (ex.: Envelope 02 – Habilitação). Null = Edital (categorias do edital) ou Outros.';
comment on column public.oportunidade.pastas_arquivos is
  'Pastas extras da aba Arquivos criadas pelo usuário (array de nomes). As padrão ficam no front.';
