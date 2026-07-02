-- ============================================================================
-- 0082 — Manufatura (Fase 8): OEE + views de dashboard
-- ============================================================================
-- Tudo DERIVADO de dados que já existem (apontamento_producao, ordem_producao,
-- ordem_producao_operacao, ordem_manutencao). Nenhuma tabela nova.
--
-- OEE = Disponibilidade × Performance × Qualidade
--   Disponibilidade: tempo produtivo / (produtivo + paradas)   [apontamento]
--   Performance:     tempo previsto / tempo real               [operações]
--   Qualidade:       boas / (boas + refugo)                    [apontamento]
--
-- Expedição: decisão de arquitetura = REUSAR retirada_estoque (0006) a partir
-- de almoxarifado tipo 'ProdutoAcabado'/'Expedicao'. Nenhum objeto novo.
--
-- Todas as views com security_invoker => respeitam a RLS das tabelas base.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. vw_oee_centro_dia — OEE diário por centro de trabalho
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.vw_oee_centro_dia
with (security_invoker = true) as
with apont as (
  select
    ap.empresa_id,
    ap.centro_trabalho_id,
    (coalesce(ap.inicio, ap.created_at))::date as dia,
    sum(coalesce(ap.tempo_min, 0))        as tempo_produtivo_min,
    sum(coalesce(ap.tempo_parada_min, 0)) as tempo_parada_min,
    sum(coalesce(ap.quantidade_boa, 0))   as qtd_boa,
    sum(coalesce(ap.quantidade_refugo, 0)) as qtd_refugo
  from public.apontamento_producao ap
  where ap.deleted_at is null
  group by 1, 2, 3
),
perf as (
  -- performance por centro/dia: previsto ÷ real das operações concluídas no dia
  select
    oo.empresa_id,
    oo.centro_trabalho_id,
    oo.updated_at::date as dia,
    sum(coalesce(oo.tempo_previsto_min, 0)) as previsto_min,
    sum(coalesce(oo.tempo_real_min, 0))     as real_min
  from public.ordem_producao_operacao oo
  where oo.status = 'Concluida' and oo.deleted_at is null
  group by 1, 2, 3
)
select
  a.empresa_id,
  a.centro_trabalho_id,
  ct.nome as centro_trabalho_nome,
  a.dia,
  a.tempo_produtivo_min,
  a.tempo_parada_min,
  a.qtd_boa,
  a.qtd_refugo,
  -- Disponibilidade
  case when (a.tempo_produtivo_min + a.tempo_parada_min) > 0
       then round(a.tempo_produtivo_min / (a.tempo_produtivo_min + a.tempo_parada_min), 4)
  end as disponibilidade,
  -- Performance (cap em 1: apontar mais rápido que o padrão não "sobe" OEE)
  case when coalesce(p.real_min, 0) > 0
       then least(round(p.previsto_min / p.real_min, 4), 1)
  end as performance,
  -- Qualidade
  case when (a.qtd_boa + a.qtd_refugo) > 0
       then round(a.qtd_boa / (a.qtd_boa + a.qtd_refugo), 4)
  end as qualidade,
  -- OEE (só quando os 3 fatores existem)
  case when (a.tempo_produtivo_min + a.tempo_parada_min) > 0
        and coalesce(p.real_min, 0) > 0
        and (a.qtd_boa + a.qtd_refugo) > 0
       then round(
         (a.tempo_produtivo_min / (a.tempo_produtivo_min + a.tempo_parada_min))
         * least(p.previsto_min / p.real_min, 1)
         * (a.qtd_boa / (a.qtd_boa + a.qtd_refugo))
       , 4)
  end as oee
from apont a
left join perf p
  on p.empresa_id = a.empresa_id
 and p.centro_trabalho_id is not distinct from a.centro_trabalho_id
 and p.dia = a.dia
left join public.centro_trabalho ct on ct.id = a.centro_trabalho_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. vw_producao_resumo — carteira de OPs (visão de PCP)
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.vw_producao_resumo
with (security_invoker = true) as
select
  op.empresa_id,
  op.id,
  op.numero,
  op.material_id,
  op.material_nome,
  op.status,
  op.origem,
  op.quantidade,
  op.quantidade_produzida,
  op.quantidade_refugada,
  op.data_prevista_inicio,
  op.data_prevista_fim,
  op.data_inicio_real,
  op.data_fim_real,
  (op.status in ('Planejada','Liberada','EmProducao')
    and op.data_prevista_fim is not null
    and op.data_prevista_fim < current_date)         as atrasada,
  coalesce(oper.total_operacoes, 0)                  as total_operacoes,
  coalesce(oper.operacoes_concluidas, 0)             as operacoes_concluidas,
  case when coalesce(oper.total_operacoes, 0) > 0
       then round(oper.operacoes_concluidas::numeric / oper.total_operacoes * 100, 1)
       else 0 end                                    as progresso_pct,
  op.custo_total,
  op.created_at
from public.ordem_producao op
left join lateral (
  select count(*) as total_operacoes,
         count(*) filter (where status = 'Concluida') as operacoes_concluidas
    from public.ordem_producao_operacao oo
   where oo.ordem_producao_id = op.id and oo.deleted_at is null
) oper on true
where op.deleted_at is null;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. vw_paradas_resumo — Pareto de paradas (motivo × tempo)
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.vw_paradas_resumo
with (security_invoker = true) as
select
  ap.empresa_id,
  ap.centro_trabalho_id,
  ct.nome as centro_trabalho_nome,
  (coalesce(ap.inicio, ap.created_at))::date as dia,
  coalesce(nullif(trim(ap.motivo_parada), ''), 'Não informado') as motivo_parada,
  count(*)                              as ocorrencias,
  sum(coalesce(ap.tempo_parada_min, 0)) as tempo_parada_min
from public.apontamento_producao ap
left join public.centro_trabalho ct on ct.id = ap.centro_trabalho_id
where ap.deleted_at is null
  and coalesce(ap.tempo_parada_min, 0) > 0
group by 1, 2, 3, 4, 5;

grant select on
  public.vw_oee_centro_dia,
  public.vw_producao_resumo,
  public.vw_paradas_resumo
  to authenticated;
