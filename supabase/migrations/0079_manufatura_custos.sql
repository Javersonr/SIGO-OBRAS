-- ============================================================================
-- 0079 — Manufatura (Fase 5): Custos — custo padrão (roll-up) + variação
-- ============================================================================
-- O custo REAL da OP já é apurado em concluir_ordem_producao (0078):
--   custo_material (CMP consumido) + custo_mao_obra (tempo apontado × custo_hora).
-- Esta fase adiciona o lado PADRÃO e a comparação:
--   * calcular_custo_padrao()  — roll-up recursivo da ficha Ativa
--       comprado  -> coalesce(custo_padrao, preco_medio, preco)
--       fabricado -> Σ componentes (com perda) + MO do roteiro
--     MO padrão assume lote = quantidade_base (setup diluído na base).
--   * atualizar_custo_padrao() — grava material.custo_padrao (1 item ou todos)
--   * vw_custo_ordem_producao  — real × padrão por OP concluída (variação)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. calcular_custo_padrao — roll-up recursivo (guarda de ciclo por profundidade)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.calcular_custo_padrao(
  p_material_id uuid,
  p_depth integer default 0
)
returns numeric
language plpgsql
stable
as $$
declare
  v_ficha_id uuid;
  v_qtd_base numeric(14,4);
  v_custo_mat numeric(14,4) := 0;
  v_custo_mo numeric(14,4) := 0;
  rec record;
begin
  if p_depth > 10 then
    raise exception 'Ficha técnica com mais de 10 níveis ou ciclo (material %)', p_material_id;
  end if;

  -- Sem ficha Ativa = item comprado: usa custo cadastrado/CMP/preço
  select id, coalesce(nullif(quantidade_base, 0), 1)
    into v_ficha_id, v_qtd_base
    from public.ficha_tecnica
   where material_id = p_material_id and status = 'Ativa' and deleted_at is null
   limit 1;

  if v_ficha_id is null then
    return coalesce(
      (select coalesce(custo_padrao, preco_medio, preco, 0)
         from public.material where id = p_material_id)
    , 0);
  end if;

  -- Materiais: Σ (qtd/base × (1+perda) × custo do componente [recursivo])
  for rec in
    select material_id, quantidade, coalesce(perda_pct, 0) as perda_pct
      from public.ficha_tecnica_item
     where ficha_id = v_ficha_id and deleted_at is null
  loop
    v_custo_mat := v_custo_mat
      + (rec.quantidade / v_qtd_base)
        * (1 + rec.perda_pct / 100.0)
        * public.calcular_custo_padrao(rec.material_id, p_depth + 1);
  end loop;

  -- Mão de obra: Σ ((setup/base + ciclo) min → horas × custo_hora do centro)
  select coalesce(sum(
           ((coalesce(ro.tempo_setup_min, 0) / v_qtd_base)
             + coalesce(ro.tempo_ciclo_min, 0)) / 60.0
           * coalesce(ct.custo_hora, 0)
         ), 0)
    into v_custo_mo
    from public.roteiro_operacao ro
    left join public.centro_trabalho ct on ct.id = ro.centro_trabalho_id
   where ro.ficha_id = v_ficha_id and ro.deleted_at is null;

  return round(v_custo_mat + v_custo_mo, 4);
end;
$$;

comment on function public.calcular_custo_padrao is
  'Custo padrão unitário por roll-up recursivo da ficha Ativa (componentes com perda + MO do roteiro).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. atualizar_custo_padrao — persiste em material.custo_padrao
--    p_material_id null = recalcula TODOS os fabricados da empresa
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.atualizar_custo_padrao(
  p_empresa_id uuid,
  p_material_id uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
  rec record;
begin
  for rec in
    select id from public.material
     where empresa_id = p_empresa_id
       and (p_material_id is null or id = p_material_id)
       and fabricado = true
       and deleted_at is null
  loop
    update public.material
       set custo_padrao = public.calcular_custo_padrao(rec.id),
           updated_at = now()
     where id = rec.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.atualizar_custo_padrao is
  'Recalcula e grava material.custo_padrao dos itens fabricados (um material ou todos da empresa).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. vw_custo_ordem_producao — real × padrão por OP (variação)
--    security_invoker: a view respeita a RLS das tabelas base
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.vw_custo_ordem_producao
with (security_invoker = true) as
select
  op.id,
  op.empresa_id,
  op.numero,
  op.material_id,
  op.material_nome,
  op.status,
  op.quantidade,
  op.quantidade_produzida,
  op.quantidade_refugada,
  op.custo_material,
  op.custo_mao_obra,
  op.custo_total,
  case when op.quantidade_produzida > 0
       then round(op.custo_total / op.quantidade_produzida, 4) end as custo_unitario_real,
  m.custo_padrao                                                   as custo_unitario_padrao,
  case when op.quantidade_produzida > 0 and m.custo_padrao is not null
       then round(op.custo_total - (m.custo_padrao * op.quantidade_produzida), 2)
  end as variacao_total,
  case when op.quantidade_produzida > 0 and coalesce(m.custo_padrao, 0) <> 0
       then round(
         ((op.custo_total / op.quantidade_produzida) - m.custo_padrao)
         / m.custo_padrao * 100, 2)
  end as variacao_pct,
  op.data_fim_real,
  op.created_at
from public.ordem_producao op
join public.material m on m.id = op.material_id
where op.deleted_at is null;

grant execute on function public.calcular_custo_padrao(uuid, integer) to authenticated;
grant execute on function public.atualizar_custo_padrao(uuid, uuid) to authenticated;
grant select on public.vw_custo_ordem_producao to authenticated;
