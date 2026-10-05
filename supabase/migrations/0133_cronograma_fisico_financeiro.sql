-- 0133 — Cronograma físico-financeiro na aba Planejamento da oportunidade (05/10/2026)
--
-- oportunidade.cronograma_ff  % de cada etapa de nível 1 do orçamento em cada mês:
--   { "meses": 4, "pct": { "1": [20, 35, 30, 15] }, "origem": "importado" | "manual",
--     "arquivo_nome": "...", "atualizado_em": "<ISO>" }
--   {} = sem cronograma. O R$ não é gravado: a tela calcula pelo subtotal com desconto
--   do orçamento atual (muda junto com o desconto ou com uma reimportação).
--
-- Só aditiva e idempotente. A RLS não muda (mesma tabela). O CHECK só garante que o
-- valor é um objeto JSON; o formato interno é conferido no front (normalizarCronograma).
-- Ordem do deploy: aplicar ESTA migração ANTES do push do front. O quadro grava
-- cronograma_ff; sem a coluna o PostgREST responde PGRST204.
-- Spec: docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md, §3.

alter table public.oportunidade
  add column if not exists cronograma_ff jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cronograma_ff) = 'object');
notify pgrst, 'reload schema';

select 'ok' as res;
