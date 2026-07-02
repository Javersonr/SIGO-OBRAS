-- ============================================================================
-- 0078 — Manufatura (Fases 3-4): Ordem de Produção + apontamento + RPCs
-- ============================================================================
-- Fecha o loop com o estoque existente:
--   * ordem_producao            — a OP (planejar → liberar → produzir → concluir)
--   * ordem_producao_item       — componentes explodidos da ficha (necessidade)
--   * ordem_producao_operacao   — operações instanciadas do roteiro
--   * apontamento_producao      — chão de fábrica (boa/refugo/tempo/parada → OEE + custo MO)
--
-- RPCs (o pulo do gato do reuso):
--   * liberar_ordem_producao()  — explode ficha, cria itens/operações e RESERVA
--                                 MP (trigger de 0027 trava o saldo sozinho)
--   * concluir_ordem_producao() — baixa MP via baixar_reserva_atomica/
--                                 saida_estoque_atomica, custeia, e dá entrada
--                                 do PA via entrada_estoque_atomica (0027)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ordem_producao
-- ────────────────────────────────────────────────────────────────────────────
create table public.ordem_producao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  material_id uuid not null references public.material(id) on delete restrict,  -- produto a fabricar
  material_nome text,
  ficha_id uuid references public.ficha_tecnica(id) on delete set null,         -- versão usada (snapshot)
  ficha_versao integer,
  quantidade numeric(14,4) not null,             -- qtd a produzir
  quantidade_produzida numeric(14,4) default 0,
  quantidade_refugada numeric(14,4) default 0,
  almoxarifado_wip_id uuid references public.almoxarifado(id) on delete set null,     -- consome MP / WIP
  almoxarifado_destino_id uuid references public.almoxarifado(id) on delete set null, -- entra PA
  centro_custo_id uuid references public.centro_custo(id) on delete set null,
  data_prevista_inicio date,
  data_prevista_fim date,
  data_inicio_real timestamptz,
  data_fim_real timestamptz,
  status text not null
    check (status in ('Planejada','Liberada','EmProducao','Concluida','Cancelada'))
    default 'Planejada',
  origem text check (origem in ('Manual','MRP','Pedido')) default 'Manual',
  origem_id uuid,
  custo_material numeric(14,2) default 0,        -- preenchidos no fechamento
  custo_mao_obra numeric(14,2) default 0,
  custo_total numeric(14,2) default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
-- nomes oprod_*: op_empresa_idx/op_status_idx já existem na tabela oportunidade
create index oprod_empresa_idx on public.ordem_producao(empresa_id);
create index oprod_material_idx on public.ordem_producao(material_id);
create index oprod_status_idx on public.ordem_producao(empresa_id, status);
create index oprod_data_idx on public.ordem_producao(empresa_id, data_prevista_inicio);
select attach_updated_at_trigger('ordem_producao');

-- Reserva de MP aponta pra OP (coluna nova em tabela existente)
alter table public.reserva_material
  add column if not exists ordem_producao_id uuid references public.ordem_producao(id) on delete set null;
create index if not exists reserva_op_idx
  on public.reserva_material(ordem_producao_id) where ordem_producao_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ordem_producao_item — necessidade de componentes (explodido da ficha)
-- ────────────────────────────────────────────────────────────────────────────
create table public.ordem_producao_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ordem_producao_id uuid not null references public.ordem_producao(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete restrict,
  material_nome text,
  material_codigo text,
  quantidade_necessaria numeric(14,4) not null,     -- (qtd_ficha / base) * qtd_OP * (1 + perda)
  quantidade_consumida numeric(14,4) default 0,
  unidade text,
  operacao_seq integer,
  reserva_id uuid references public.reserva_material(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index op_item_empresa_idx on public.ordem_producao_item(empresa_id);
create index op_item_op_idx on public.ordem_producao_item(ordem_producao_id);
create index op_item_material_idx on public.ordem_producao_item(material_id);
select attach_updated_at_trigger('ordem_producao_item');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ordem_producao_operacao — roteiro instanciado
-- ────────────────────────────────────────────────────────────────────────────
create table public.ordem_producao_operacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ordem_producao_id uuid not null references public.ordem_producao(id) on delete cascade,
  seq integer not null,
  nome text not null,
  centro_trabalho_id uuid references public.centro_trabalho(id) on delete set null,
  centro_trabalho_nome text,
  tempo_previsto_min numeric(12,2),
  tempo_real_min numeric(12,2) default 0,
  status text check (status in ('Pendente','EmExecucao','Concluida')) default 'Pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (ordem_producao_id, seq)
);
create index op_oper_empresa_idx on public.ordem_producao_operacao(empresa_id);
create index op_oper_op_idx on public.ordem_producao_operacao(ordem_producao_id);
select attach_updated_at_trigger('ordem_producao_operacao');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. apontamento_producao — chão de fábrica (alimenta OEE + custo de MO)
-- ────────────────────────────────────────────────────────────────────────────
create table public.apontamento_producao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ordem_producao_id uuid not null references public.ordem_producao(id) on delete cascade,
  operacao_id uuid references public.ordem_producao_operacao(id) on delete set null,
  operacao_seq integer,
  centro_trabalho_id uuid references public.centro_trabalho(id) on delete set null,
  operador_id uuid,
  operador_nome text,
  inicio timestamptz,
  fim timestamptz,
  tempo_min numeric(12,2),                 -- duração produtiva
  tempo_parada_min numeric(12,2) default 0,
  motivo_parada text,
  quantidade_boa numeric(14,4) default 0,
  quantidade_refugo numeric(14,4) default 0,
  motivo_refugo text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index apont_empresa_idx on public.apontamento_producao(empresa_id);
create index apont_op_idx on public.apontamento_producao(ordem_producao_id);
create index apont_centro_idx on public.apontamento_producao(centro_trabalho_id);
create index apont_data_idx on public.apontamento_producao(empresa_id, inicio desc);
select attach_updated_at_trigger('apontamento_producao');

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS + grants
-- ────────────────────────────────────────────────────────────────────────────
select apply_tenant_rls('ordem_producao');
select apply_tenant_rls('ordem_producao_item');
select apply_tenant_rls('ordem_producao_operacao');
select apply_tenant_rls('apontamento_producao');

grant select, insert, update, delete on
  public.ordem_producao,
  public.ordem_producao_item,
  public.ordem_producao_operacao,
  public.apontamento_producao
  to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: liberar_ordem_producao — explode ficha, cria itens/operações, reserva MP
-- ────────────────────────────────────────────────────────────────────────────
-- Invoker rights (como as RPCs de 0027): roda com o empresa_id do JWT, RLS isola.
create or replace function public.liberar_ordem_producao(p_op_id uuid)
returns void
language plpgsql
as $$
declare
  v_op public.ordem_producao%rowtype;
  v_ficha_id uuid;
  v_qtd_base numeric(14,4);
  rec record;
  v_qtd_necessaria numeric(14,4);
  v_reserva_id uuid;
begin
  select * into v_op from public.ordem_producao where id = p_op_id for update;
  if v_op.id is null then
    raise exception 'OP % não encontrada', p_op_id;
  end if;
  if v_op.status <> 'Planejada' then
    raise exception 'OP % não está Planejada (status atual: %)', coalesce(v_op.numero, p_op_id::text), v_op.status;
  end if;
  if v_op.almoxarifado_wip_id is null then
    raise exception 'OP % precisa de almoxarifado WIP para reservar a matéria-prima', coalesce(v_op.numero, p_op_id::text);
  end if;

  -- Ficha: usa a informada ou a Ativa do material
  v_ficha_id := v_op.ficha_id;
  if v_ficha_id is null then
    select id into v_ficha_id
      from public.ficha_tecnica
     where material_id = v_op.material_id and empresa_id = v_op.empresa_id
       and status = 'Ativa' and deleted_at is null
     limit 1;
    if v_ficha_id is null then
      raise exception 'Material % não tem ficha técnica Ativa', v_op.material_id;
    end if;
  end if;

  select quantidade_base into v_qtd_base from public.ficha_tecnica where id = v_ficha_id;
  v_qtd_base := coalesce(nullif(v_qtd_base, 0), 1);

  -- Explode componentes -> reserva_material (trava saldo) + ordem_producao_item
  for rec in
    select material_id, material_nome, material_codigo, quantidade,
           coalesce(perda_pct, 0) as perda_pct, operacao_seq, unidade
      from public.ficha_tecnica_item
     where ficha_id = v_ficha_id and deleted_at is null
  loop
    v_qtd_necessaria := round(
      (rec.quantidade / v_qtd_base) * v_op.quantidade * (1 + rec.perda_pct / 100.0)
    , 4);

    insert into public.reserva_material (
      empresa_id, material_id, material_descricao,
      almoxarifado_id, tipo_reserva, ordem_producao_id,
      quantidade_reservada, unidade, data_reserva, data_necessidade,
      status, observacoes
    ) values (
      v_op.empresa_id, rec.material_id, rec.material_nome,
      v_op.almoxarifado_wip_id, 'OrdemProducao', v_op.id,
      v_qtd_necessaria, rec.unidade, current_date, v_op.data_prevista_inicio,
      'Ativa', 'Reserva OP ' || coalesce(v_op.numero, v_op.id::text)
    ) returning id into v_reserva_id;

    insert into public.ordem_producao_item (
      empresa_id, ordem_producao_id, material_id, material_nome, material_codigo,
      quantidade_necessaria, unidade, operacao_seq, reserva_id
    ) values (
      v_op.empresa_id, v_op.id, rec.material_id, rec.material_nome, rec.material_codigo,
      v_qtd_necessaria, rec.unidade, rec.operacao_seq, v_reserva_id
    );
  end loop;

  -- Instancia as operações do roteiro
  insert into public.ordem_producao_operacao (
    empresa_id, ordem_producao_id, seq, nome,
    centro_trabalho_id, centro_trabalho_nome, tempo_previsto_min, status
  )
  select v_op.empresa_id, v_op.id, ro.seq, ro.nome,
         ro.centro_trabalho_id, ro.centro_trabalho_nome,
         coalesce(ro.tempo_setup_min, 0) + coalesce(ro.tempo_ciclo_min, 0) * v_op.quantidade,
         'Pendente'
    from public.roteiro_operacao ro
   where ro.ficha_id = v_ficha_id and ro.deleted_at is null;

  update public.ordem_producao
     set status = 'Liberada', ficha_id = v_ficha_id, updated_at = now()
   where id = p_op_id;
end;
$$;

comment on function public.liberar_ordem_producao is
  'Explode a ficha técnica da OP em itens+operações e reserva a MP (o trigger de 0027 trava o saldo).';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC: concluir_ordem_producao — consome MP, custeia e dá entrada no PA
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.concluir_ordem_producao(
  p_op_id uuid,
  p_quantidade_boa numeric,
  p_quantidade_refugo numeric default 0,
  p_usuario_nome text default null
)
returns numeric   -- custo unitário do produto acabado
language plpgsql
as $$
declare
  v_op public.ordem_producao%rowtype;
  rec record;
  v_a_consumir numeric(14,4);
  v_custo_material numeric(14,2) := 0;
  v_custo_mo numeric(14,2) := 0;
  v_mov_id uuid;
  v_valor numeric(14,2);
  v_custo_unit numeric(14,4);
  v_reserva_status text;
begin
  select * into v_op from public.ordem_producao where id = p_op_id for update;
  if v_op.id is null then
    raise exception 'OP % não encontrada', p_op_id;
  end if;
  if v_op.status not in ('Liberada','EmProducao') then
    raise exception 'OP % não pode ser concluída (status: %)', coalesce(v_op.numero, p_op_id::text), v_op.status;
  end if;
  if p_quantidade_boa is null or p_quantidade_boa <= 0 then
    raise exception 'Quantidade boa deve ser positiva (recebido: %)', p_quantidade_boa;
  end if;

  -- 1. Consome cada componente (baixa a reserva ou dá saída direta) e soma o custo
  for rec in
    select * from public.ordem_producao_item
     where ordem_producao_id = p_op_id and deleted_at is null
  loop
    v_a_consumir := rec.quantidade_necessaria - coalesce(rec.quantidade_consumida, 0);
    if v_a_consumir <= 0 then continue; end if;

    -- Reserva pode ter sido cancelada por fora (ex.: manualmente): cai pra saída direta
    v_reserva_status := null;
    if rec.reserva_id is not null then
      select status into v_reserva_status
        from public.reserva_material where id = rec.reserva_id;
    end if;

    if v_reserva_status = 'Ativa' then
      v_mov_id := public.baixar_reserva_atomica(
        rec.reserva_id, v_a_consumir, p_usuario_nome,
        'Consumo OP ' || coalesce(v_op.numero, v_op.id::text)
      );
    else
      v_mov_id := public.saida_estoque_atomica(
        v_op.empresa_id, rec.material_id, v_op.almoxarifado_wip_id, v_a_consumir,
        'OrdemProducao', v_op.id, null, p_usuario_nome,
        'Consumo OP ' || coalesce(v_op.numero, v_op.id::text), null
      );
    end if;

    select coalesce(valor_total, 0) into v_valor
      from public.estoque_movimento where id = v_mov_id;
    v_custo_material := v_custo_material + coalesce(v_valor, 0);

    update public.ordem_producao_item
       set quantidade_consumida = rec.quantidade_necessaria, updated_at = now()
     where id = rec.id;
  end loop;

  -- 2. Mão de obra = Σ (tempo apontado em horas × custo_hora do centro)
  select coalesce(sum((coalesce(ap.tempo_min, 0) / 60.0) * coalesce(ct.custo_hora, 0)), 0)::numeric(14,2)
    into v_custo_mo
    from public.apontamento_producao ap
    left join public.centro_trabalho ct on ct.id = ap.centro_trabalho_id
   where ap.ordem_producao_id = p_op_id and ap.deleted_at is null;

  -- 3. Custo unitário do PA
  v_custo_unit := round((v_custo_material + v_custo_mo) / nullif(p_quantidade_boa, 0), 4);

  -- 4. Entrada do produto acabado no almox destino, ao custo calculado (recalcula CMP)
  v_mov_id := public.entrada_estoque_atomica(
    v_op.empresa_id, v_op.material_id,
    coalesce(v_op.almoxarifado_destino_id, v_op.almoxarifado_wip_id),
    p_quantidade_boa, v_custo_unit,
    'OrdemProducao', v_op.id, null, p_usuario_nome,
    'Produção OP ' || coalesce(v_op.numero, v_op.id::text), null
  );

  -- 5. Fecha a OP
  update public.ordem_producao
     set status = 'Concluida',
         quantidade_produzida = p_quantidade_boa,
         quantidade_refugada = coalesce(p_quantidade_refugo, 0),
         custo_material = v_custo_material,
         custo_mao_obra = v_custo_mo,
         custo_total = v_custo_material + v_custo_mo,
         data_fim_real = now(),
         updated_at = now()
   where id = p_op_id;

  return v_custo_unit;
end;
$$;

comment on function public.concluir_ordem_producao is
  'Consome MP (baixar_reserva/saida atômicas), custeia MP+MO e dá entrada do PA (entrada atômica). Retorna o custo unitário.';

grant execute on function public.liberar_ordem_producao(uuid) to authenticated;
grant execute on function public.concluir_ordem_producao(uuid, numeric, numeric, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. PATCH 0038: liberar_reservas_vencidas NÃO pode cancelar reservas de OP.
--    O ciclo de vida delas é da ordem de produção (concluir/cancelar OP).
--    Sem isso, uma OP liberada que atrasasse >2 dias perderia a MP reservada.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.liberar_reservas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
begin
  for rec in
    with cancelled as (
      update public.reserva_material
        set status = 'Cancelada',
            observacoes = trim(coalesce(observacoes, '')
              || ' [cancelada automaticamente: data de necessidade vencida]'),
            updated_at = now()
        where status = 'Ativa'
          and deleted_at is null
          and coalesce(tipo_reserva, 'Projeto') <> 'OrdemProducao'
          and data_necessidade is not null
          and data_necessidade < current_date - interval '2 days'
        returning empresa_id
    )
    select empresa_id, count(*) as qtd
      from cancelled
      group by empresa_id
  loop
    v_total := v_total + rec.qtd;
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor', 'Estoque'],
      'Reservas liberadas automaticamente',
      format('%s reserva(s) de material foram canceladas por vencimento da data de necessidade.', rec.qtd),
      '/Estoque',
      'Estoque',
      'Normal',
      'reservas_venc:' || rec.empresa_id::text || ':' || current_date
    );
  end loop;

  return v_total;
end;
$$;

comment on function public.liberar_reservas_vencidas is
  'Cancela reservas Ativas vencidas (+2d), EXCETO tipo OrdemProducao (patch manufatura 0078).';
