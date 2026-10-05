-- 0127 — Orçamento pela planilha da prefeitura: etapas, preço de referência, desconto e representante
--
-- orcamento_item:
--   numero              número hierárquico da planilha ("1", "1.2", "1.2.3"), em texto;
--   etapa               linha de título (sem quantidade nem preço; o subtotal é calculado na tela);
--   fonte               SINAPI, SETOP, SICRO, CDHU, Próprio…;
--   valor_unitario_ref  preço unitário da prefeitura COM BDI e SEM desconto (até 4 casas).
--   valor_unitario continua sendo o preço da proposta (com o desconto aplicado).
-- oportunidade:
--   desconto_proposta_pct  desconto linear da proposta, de 0 a 99,99%;
--   orcamento_info         aba "Informações" da planilha + arquivo_nome e importado_em.
-- empresa:
--   representante_nome/cargo/cpf  representante legal que assina a proposta.
--
-- Só aditiva e idempotente. A RLS não muda (mesmas tabelas).
-- Ordem do deploy: aplicar ESTA migração ANTES do push do front. A importação
-- (bulkCreate) e o Salvar da aba Empresa mandam as colunas novas; sem elas o
-- PostgREST responde PGRST204.
-- Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md, §6.

alter table public.orcamento_item add column if not exists numero text;
alter table public.orcamento_item add column if not exists etapa boolean not null default false;
alter table public.orcamento_item add column if not exists fonte text;
alter table public.orcamento_item add column if not exists valor_unitario_ref numeric(14,4);
alter table public.oportunidade add column if not exists desconto_proposta_pct numeric(5,2) not null default 0;
alter table public.oportunidade add column if not exists orcamento_info jsonb not null default '{}'::jsonb;
alter table public.empresa add column if not exists representante_nome text;
alter table public.empresa add column if not exists representante_cargo text;
alter table public.empresa add column if not exists representante_cpf text;
notify pgrst, 'reload schema';

select 'ok' as res;
