-- ============================================================================
-- 0080 — Manufatura (Fase 6): MRP — cálculo de necessidades + conversão
-- ============================================================================
-- MRP v1 (pragmático):
--   Necessidade bruta  = estoque mínimo + componentes de OPs Planejadas
--                        (OPs Liberadas JÁ reservaram MP → refletem no disponível)
--   Suprimento previsto = OPs em aberto do próprio item (se fabricado)
--   Necessidade líquida = bruta − disponível − suprimento
--   > 0  →  sugestão: 'Produzir' (fabricado) ou 'Comprar' (comprado)
--
-- Limitação documentada (v2): não desconta pedidos de compra em trânsito.
--
-- Conversão (o MRP DISPARA os fluxos existentes, não os reimplementa):
--   Comprar  → solicitacao_compra (status 'Pendente Aprovação', origem 'MRP')
--              → cai na esteira de aprovação de compras existente (0028+)
--   Produzir → ordem_producao 'Planejada' (origem 'MRP')
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. solicitacao_compra.origem ganha 'MRP' (técnica NOT VALID de 0027)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.solicitacao_compra
  drop constraint if exists solicitacao_compra_origem_check;
alter table public.solicitacao_compra
  add constraint solicitacao_compra_origem_check
  check (origem in ('Manual','Orcamento','Estoque','MRP'))
  not valid;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. mrp_execucao + mrp_sugestao
-- ────────────────────────────────────────────────────────────────────────────
create table public.mrp_execucao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  executado_por text,
  total_sugestoes integer default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index mrp_exec_empresa_idx on public.mrp_execucao(empresa_id);
select attach_updated_at_trigger('mrp_execucao');

create table public.mrp_sugestao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  execucao_id uuid not null references public.mrp_execucao(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete cascade,
  material_nome text,
  material_codigo text,
  tipo text not null check (tipo in ('Comprar','Produzir')),
  quantidade numeric(14,4) not null,
  unidade text,
  data_necessidade date,
  disponivel numeric(14,4),          -- fotografia no momento do cálculo
  suprimento_previsto numeric(14,4),
  necessidade_bruta numeric(14,4),
  motivo text,
  status text not null check (status in ('Pendente','Convertida','Descartada')) default 'Pendente',
  convertida_tipo text check (convertida_tipo in ('SolicitacaoCompra','OrdemProducao')),
  convertida_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index mrp_sug_empresa_idx on public.mrp_sugestao(empresa_id);
create index mrp_sug_exec_idx on public.mrp_sugestao(execucao_id);
create index mrp_sug_status_idx on public.mrp_sugestao(empresa_id, status);
select attach_updated_at_trigger('mrp_sugestao');

select apply_tenant_rls('mrp_execucao');
select apply_tenant_rls('mrp_sugestao');
grant select, insert, update, delete on public.mrp_execucao, public.mrp_sugestao to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. executar_mrp — calcula e grava as sugestões; retorna execucao_id
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.executar_mrp(
  p_empresa_id uuid,
  p_executado_por text default null
)
returns uuid
language plpgsql
as $$
declare
  v_exec_id uuid;
  v_total integer;
begin
  insert into public.mrp_execucao (empresa_id, executado_por)
  values (p_empresa_id, p_executado_por)
  returning id into v_exec_id;

  with saldo as (
    -- disponível já desconta reservas (coluna gerada)
    select material_id, sum(quantidade_disponivel) as disp
      from public.estoque_saldo
     where empresa_id = p_empresa_id and deleted_at is null
     group by material_id
  ),
  suprimento as (
    -- OPs em aberto do próprio item (produção a caminho)
    select material_id, sum(quantidade - coalesce(quantidade_produzida, 0)) as qtd
      from public.ordem_producao
     where empresa_id = p_empresa_id
       and status in ('Planejada','Liberada','EmProducao')
       and deleted_at is null
     group by material_id
  ),
  demanda_op as (
    -- componentes de OPs Planejadas (ainda não reservados)
    select fti.material_id,
           sum((fti.quantidade / coalesce(nullif(ft.quantidade_base, 0), 1))
               * op.quantidade
               * (1 + coalesce(fti.perda_pct, 0) / 100.0)) as qtd,
           min(op.data_prevista_inicio) as data_nec
      from public.ordem_producao op
      join public.ficha_tecnica ft
        on ft.id = coalesce(
             op.ficha_id,
             (select f.id from public.ficha_tecnica f
               where f.material_id = op.material_id
                 and f.empresa_id = p_empresa_id
                 and f.status = 'Ativa' and f.deleted_at is null
               limit 1))
      join public.ficha_tecnica_item fti
        on fti.ficha_id = ft.id and fti.deleted_at is null
     where op.empresa_id = p_empresa_id
       and op.status = 'Planejada'
       and op.deleted_at is null
     group by fti.material_id
  ),
  calc as (
    select m.id as material_id, m.nome, m.codigo, m.unidade,
           m.fabricado, m.lead_time_dias,
           coalesce(s.disp, 0)                       as disponivel,
           coalesce(sup.qtd, 0)                      as suprimento,
           coalesce(d.qtd, 0) + coalesce(m.estoque_minimo, 0) as bruta,
           d.data_nec
      from public.material m
      left join saldo s       on s.material_id = m.id
      left join suprimento sup on sup.material_id = m.id
      left join demanda_op d  on d.material_id = m.id
     where m.empresa_id = p_empresa_id
       and m.ativo = true and m.deleted_at is null
  )
  insert into public.mrp_sugestao (
    empresa_id, execucao_id, material_id, material_nome, material_codigo,
    tipo, quantidade, unidade, data_necessidade,
    disponivel, suprimento_previsto, necessidade_bruta, motivo
  )
  select
    p_empresa_id, v_exec_id, c.material_id, c.nome, c.codigo,
    case when c.fabricado then 'Produzir' else 'Comprar' end,
    round(c.bruta - c.disponivel - (case when c.fabricado then c.suprimento else 0 end), 4),
    c.unidade,
    coalesce(c.data_nec, current_date + coalesce(c.lead_time_dias, 0)),
    c.disponivel, c.suprimento, c.bruta,
    format('Bruta %s − disponível %s − suprimento %s',
           round(c.bruta, 2), round(c.disponivel, 2),
           case when c.fabricado then round(c.suprimento, 2) else 0 end)
  from calc c
  where c.bruta - c.disponivel - (case when c.fabricado then c.suprimento else 0 end) > 0;

  get diagnostics v_total = row_count;
  update public.mrp_execucao set total_sugestoes = v_total, updated_at = now()
   where id = v_exec_id;

  return v_exec_id;
end;
$$;

comment on function public.executar_mrp is
  'MRP v1: necessidade = mínimo + componentes de OPs Planejadas − disponível − OPs em aberto. Gera mrp_sugestao.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. converter_sugestao_producao — sugestão 'Produzir' → OP Planejada
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.converter_sugestao_producao(p_sugestao_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_sug public.mrp_sugestao%rowtype;
  v_op_id uuid;
begin
  select * into v_sug from public.mrp_sugestao where id = p_sugestao_id for update;
  if v_sug.id is null then
    raise exception 'Sugestão % não encontrada', p_sugestao_id;
  end if;
  if v_sug.status <> 'Pendente' or v_sug.tipo <> 'Produzir' then
    raise exception 'Sugestão % não é Produzir/Pendente (tipo %, status %)',
      p_sugestao_id, v_sug.tipo, v_sug.status;
  end if;

  insert into public.ordem_producao (
    empresa_id, material_id, material_nome, quantidade,
    data_prevista_inicio, status, origem, origem_id,
    observacoes
  ) values (
    v_sug.empresa_id, v_sug.material_id, v_sug.material_nome, v_sug.quantidade,
    v_sug.data_necessidade, 'Planejada', 'MRP', v_sug.id,
    'Gerada pelo MRP: ' || coalesce(v_sug.motivo, '')
  ) returning id into v_op_id;

  update public.mrp_sugestao
     set status = 'Convertida', convertida_tipo = 'OrdemProducao',
         convertida_id = v_op_id, updated_at = now()
   where id = p_sugestao_id;

  return v_op_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. gerar_solicitacao_compra_mrp — TODAS as sugestões 'Comprar' Pendentes de
--    uma execução → UMA solicitacao_compra (entra na esteira de aprovação)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.gerar_solicitacao_compra_mrp(
  p_execucao_id uuid,
  p_solicitante_nome text default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_sol_id uuid;
  v_total integer;
begin
  select empresa_id into v_empresa_id
    from public.mrp_execucao where id = p_execucao_id;
  if v_empresa_id is null then
    raise exception 'Execução MRP % não encontrada', p_execucao_id;
  end if;

  select count(*) into v_total
    from public.mrp_sugestao
   where execucao_id = p_execucao_id and tipo = 'Comprar'
     and status = 'Pendente' and deleted_at is null;
  if v_total = 0 then
    raise exception 'Nenhuma sugestão de compra Pendente na execução %', p_execucao_id;
  end if;

  insert into public.solicitacao_compra (
    empresa_id, solicitante_nome, status, prioridade, origem,
    data_necessidade, observacoes, total_itens
  )
  select v_empresa_id, p_solicitante_nome, 'Pendente Aprovação', 'Normal', 'MRP',
         min(s.data_necessidade),
         'Gerada pelo MRP em ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
         v_total
    from public.mrp_sugestao s
   where s.execucao_id = p_execucao_id and s.tipo = 'Comprar'
     and s.status = 'Pendente' and s.deleted_at is null
  returning id into v_sol_id;

  insert into public.solicitacao_compra_item (
    empresa_id, solicitacao_id, material_id, material_codigo,
    descricao, quantidade, unidade, observacoes
  )
  select v_empresa_id, v_sol_id, s.material_id, s.material_codigo,
         coalesce(s.material_nome, 'Material'), s.quantidade, s.unidade, s.motivo
    from public.mrp_sugestao s
   where s.execucao_id = p_execucao_id and s.tipo = 'Comprar'
     and s.status = 'Pendente' and s.deleted_at is null;

  update public.mrp_sugestao
     set status = 'Convertida', convertida_tipo = 'SolicitacaoCompra',
         convertida_id = v_sol_id, updated_at = now()
   where execucao_id = p_execucao_id and tipo = 'Comprar'
     and status = 'Pendente' and deleted_at is null;

  return v_sol_id;
end;
$$;

comment on function public.gerar_solicitacao_compra_mrp is
  'Converte as sugestões Comprar/Pendente da execução em UMA solicitacao_compra (origem MRP, Pendente Aprovação).';

grant execute on function public.executar_mrp(uuid, text) to authenticated;
grant execute on function public.converter_sugestao_producao(uuid) to authenticated;
grant execute on function public.gerar_solicitacao_compra_mrp(uuid, text) to authenticated;
