-- ============================================================================
-- 0132_pastas_arquivos.sql — pastas na aba Arquivos da oportunidade (05/10/2026)
--   (spec docs/superpowers/specs/2026-09-29-pastas-arquivos-oportunidade-design.md)
--
--   arquivo_oportunidade.pasta      nome da pasta; null = regra do front
--                                   (categorias do edital → "Edital"; resto → "Outros")
--   oportunidade.pastas_arquivos    pastas EXTRAS criadas pelo usuário (array jsonb)
--
-- Aditiva e idempotente. Sem backfill. RLS inalterada (mesmas tabelas).
-- Os CHECKs são só higiene (texto livre do usuário): pasta até 120 caracteres e
-- pastas_arquivos sempre um array. Entram junto com a coluna.
-- Numeração: 0125–0129 financeiro, 0127 também no plano do Orçamento, 0130/0131 EAD/treinamentos.
-- ============================================================================

alter table public.arquivo_oportunidade
  add column if not exists pasta text
    check (pasta is null or char_length(pasta) <= 120);

alter table public.oportunidade
  add column if not exists pastas_arquivos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pastas_arquivos) = 'array');

comment on column public.arquivo_oportunidade.pasta is
  'Pasta do arquivo na aba Arquivos (ex.: Envelope 02 – Habilitação). Null = Edital (categorias do edital) ou Outros.';
comment on column public.oportunidade.pastas_arquivos is
  'Pastas extras da aba Arquivos criadas pelo usuário (array de nomes). As padrão ficam no front.';

notify pgrst, 'reload schema';

select 'ok' as res;
