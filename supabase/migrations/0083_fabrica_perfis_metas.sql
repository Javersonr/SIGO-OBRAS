-- ============================================================================
-- 0083 — Fábrica: perfis por função + metas (vendas/produção/financeiro)
-- ============================================================================
--   1. usuario_empresa.perfil ganha as funções de fábrica:
--      Gerente Geral, Gerente de Produção, Gerente Comercial, Vendedor, Operacional
--      (as permissões granulares de cada função são aplicadas pelo frontend via
--      template — usuario_empresa.permissoes — editáveis caso a caso)
--   2. meta — metas mensais por empresa (Vendas R$, Producao un, Despesas R$ teto,
--      Resultado R$)
--   3. vw_meta_realizado — meta × realizado no mês:
--      Vendas    = Σ transacao_financeira tipo Receita (competência `data`)
--      Despesas  = Σ transacao_financeira tipo Despesa
--      Resultado = Vendas − Despesas
--      Producao  = Σ ordem_producao.quantidade_produzida concluída no mês
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Perfis de fábrica (NOT VALID: linhas legadas não são revalidadas)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.usuario_empresa
  drop constraint if exists usuario_empresa_perfil_check;
alter table public.usuario_empresa
  add constraint usuario_empresa_perfil_check
  check (perfil in (
    'Admin Holding', 'Admin', 'Gestor', 'Compras', 'Estoque', 'Financeiro', 'Cliente',
    'Gerente Geral', 'Gerente de Produção', 'Gerente Comercial', 'Vendedor', 'Operacional'
  ))
  not valid;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. meta — metas mensais
-- ────────────────────────────────────────────────────────────────────────────
create table public.meta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  tipo text not null check (tipo in ('Vendas','Producao','Despesas','Resultado')),
  ano integer not null check (ano between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  valor_meta numeric(14,2) not null,
  unidade text,                      -- 'R$' | 'UN' | ... (informativo)
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, tipo, ano, mes)
);
create index meta_empresa_idx on public.meta(empresa_id);
create index meta_periodo_idx on public.meta(empresa_id, ano, mes);
select attach_updated_at_trigger('meta');
select apply_tenant_rls('meta');
grant select, insert, update, delete on public.meta to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. vw_meta_realizado — meta × realizado (security_invoker => RLS vale)
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.vw_meta_realizado
with (security_invoker = true) as
with fin as (
  select empresa_id,
         extract(year from data)::int  as ano,
         extract(month from data)::int as mes,
         sum(valor) filter (where tipo = 'Receita') as receitas,
         sum(valor) filter (where tipo = 'Despesa') as despesas
    from public.transacao_financeira
   where deleted_at is null and data is not null
   group by 1, 2, 3
),
prod as (
  select empresa_id,
         extract(year from data_fim_real)::int  as ano,
         extract(month from data_fim_real)::int as mes,
         sum(coalesce(quantidade_produzida, 0)) as qtd_produzida
    from public.ordem_producao
   where deleted_at is null and status = 'Concluida' and data_fim_real is not null
   group by 1, 2, 3
),
realizado as (
  select empresa_id, ano, mes, 'Vendas'::text as tipo, coalesce(receitas, 0) as valor from fin
  union all
  select empresa_id, ano, mes, 'Despesas', coalesce(despesas, 0) from fin
  union all
  select empresa_id, ano, mes, 'Resultado', coalesce(receitas, 0) - coalesce(despesas, 0) from fin
  union all
  select empresa_id, ano, mes, 'Producao', qtd_produzida from prod
)
select
  m.id as meta_id,
  m.empresa_id,
  m.tipo,
  m.ano,
  m.mes,
  m.valor_meta,
  m.unidade,
  coalesce(r.valor, 0) as realizado,
  case when m.valor_meta <> 0
       then round(coalesce(r.valor, 0) / m.valor_meta * 100, 1)
  end as pct_atingido,
  m.observacoes
from public.meta m
left join realizado r
  on r.empresa_id = m.empresa_id and r.tipo = m.tipo
 and r.ano = m.ano and r.mes = m.mes
where m.deleted_at is null;

grant select on public.vw_meta_realizado to authenticated;

comment on view public.vw_meta_realizado is
  'Meta mensal × realizado: Vendas/Despesas/Resultado da transacao_financeira (competência) e Producao das OPs concluídas.';
