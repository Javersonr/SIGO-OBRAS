-- ============================================================================
-- 0068_recebimento_compra.sql — conferência de recebimento de pedido de compra
--
-- BURACO (apontado nas 2 varreduras): pedido_compra_item.quantidade_entregue
-- existia mas NADA atualizava — o pedido nunca "fechava", recebimento parcial
-- não era registrado, e a entrada de estoque era manual e desligada do pedido.
--
-- Entrega (Parte 1 — backend):
--   - recebimento_compra (cabeçalho: pedido, almoxarifado, NF, data, quem)
--   - recebimento_compra_item (o que entrou, com o id do movimento de estoque)
--   - RPC conferir_recebimento_pedido(): atômica —
--       • valida (não recebe mais que o pendente do item)
--       • dá entrada no estoque (entrada_estoque_atomica) p/ itens com material
--       • soma em pedido_compra_item.quantidade_entregue
--       • fecha o pedido: 'Entregue' (tudo) ou 'Entregue Parcial'
--       • identidade do recebedor vem do token (padrão 0061)
-- Aditivo/não-destrutivo.
-- ============================================================================

-- 1. Cabeçalho do recebimento ---------------------------------------------------
create table if not exists public.recebimento_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  pedido_id uuid not null references public.pedido_compra(id) on delete cascade,
  almoxarifado_id uuid,
  data_recebimento date not null default current_date,
  nfe_chave text,
  status text not null default 'Parcial' check (status in ('Parcial', 'Total')),
  recebido_por_email text,
  recebido_por_nome text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recebimento_compra_pedido_idx on public.recebimento_compra(pedido_id);
create index recebimento_compra_empresa_idx on public.recebimento_compra(empresa_id);
select attach_updated_at_trigger('recebimento_compra');
select apply_tenant_rls('recebimento_compra');

-- 2. Itens recebidos ------------------------------------------------------------
create table if not exists public.recebimento_compra_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  recebimento_id uuid not null references public.recebimento_compra(id) on delete cascade,
  pedido_item_id uuid not null references public.pedido_compra_item(id),
  material_id uuid,
  descricao text,
  quantidade_recebida numeric(14,3) not null check (quantidade_recebida > 0),
  valor_unitario numeric(14,4),
  movimento_estoque_id uuid,
  created_at timestamptz not null default now()
);
create index recebimento_item_receb_idx on public.recebimento_compra_item(recebimento_id);
create index recebimento_item_empresa_idx on public.recebimento_compra_item(empresa_id);
select apply_tenant_rls('recebimento_compra_item');

-- 3. RPC de conferência ---------------------------------------------------------
-- p_itens: jsonb array [{ "pedido_item_id": "...", "quantidade": 10 }, ...]
create or replace function public.conferir_recebimento_pedido(
  p_pedido_id uuid,
  p_almoxarifado_id uuid,
  p_itens jsonb,
  p_nfe_chave text default null,
  p_data date default null,
  p_ator_email text default null,
  p_ator_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ped public.pedido_compra%rowtype;
  v_receb_id uuid;
  v_jwt_email text;
  v_item jsonb;
  v_pi public.pedido_compra_item%rowtype;
  v_qtd numeric(14,3);
  v_pendente numeric(14,3);
  v_mov_id uuid;
  v_n_itens int := 0;
  v_falta boolean;
  v_status_receb text;
begin
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_ator_email := v_jwt_email;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item para conferir';
  end if;

  select * into v_ped
    from public.pedido_compra
    where id = p_pedido_id and deleted_at is null
    for update;

  if v_ped.id is null then
    raise exception 'Pedido não encontrado';
  end if;

  if public.current_empresa_id() is not null
     and v_ped.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: pedido de outra empresa';
  end if;

  if v_ped.status in ('Entregue', 'Cancelado') then
    raise exception 'Pedido já está % — não é possível conferir recebimento', v_ped.status;
  end if;

  -- cabeçalho
  insert into public.recebimento_compra (
    empresa_id, pedido_id, almoxarifado_id, data_recebimento, nfe_chave,
    recebido_por_email, recebido_por_nome, status
  ) values (
    v_ped.empresa_id, p_pedido_id, p_almoxarifado_id, coalesce(p_data, current_date),
    p_nfe_chave, p_ator_email, p_ator_nome, 'Parcial'
  ) returning id into v_receb_id;

  -- itens
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_qtd := coalesce((v_item ->> 'quantidade')::numeric, 0);
    if v_qtd <= 0 then
      continue;
    end if;

    select * into v_pi
      from public.pedido_compra_item
      where id = (v_item ->> 'pedido_item_id')::uuid
        and pedido_id = p_pedido_id
        and deleted_at is null
      for update;

    if v_pi.id is null then
      raise exception 'Item % não pertence a este pedido', v_item ->> 'pedido_item_id';
    end if;

    v_pendente := coalesce(v_pi.quantidade, 0) - coalesce(v_pi.quantidade_entregue, 0);
    if v_qtd > v_pendente + 0.001 then
      raise exception 'Item "%": recebendo % mas só faltam % (pedido %, já entregue %)',
        coalesce(v_pi.descricao, '—'), v_qtd, v_pendente, v_pi.quantidade, v_pi.quantidade_entregue;
    end if;

    -- entrada no estoque só p/ itens com material cadastrado
    v_mov_id := null;
    if v_pi.material_id is not null then
      if p_almoxarifado_id is null then
        raise exception 'Informe o almoxarifado para receber itens de estoque';
      end if;
      v_mov_id := public.entrada_estoque_atomica(
        v_ped.empresa_id, v_pi.material_id, p_almoxarifado_id,
        v_qtd, coalesce(v_pi.valor_unitario, 0),
        'Pedido', v_receb_id, v_ped.projeto_id, p_ator_nome,
        'Recebimento do pedido ' || coalesce(v_ped.numero, p_pedido_id::text)
      );
    end if;

    insert into public.recebimento_compra_item (
      empresa_id, recebimento_id, pedido_item_id, material_id, descricao,
      quantidade_recebida, valor_unitario, movimento_estoque_id
    ) values (
      v_ped.empresa_id, v_receb_id, v_pi.id, v_pi.material_id, v_pi.descricao,
      v_qtd, v_pi.valor_unitario, v_mov_id
    );

    update public.pedido_compra_item
       set quantidade_entregue = coalesce(quantidade_entregue, 0) + v_qtd,
           updated_at = now()
     where id = v_pi.id;

    v_n_itens := v_n_itens + 1;
  end loop;

  if v_n_itens = 0 then
    raise exception 'Nenhum item válido foi conferido';
  end if;

  -- o pedido foi totalmente recebido?
  select exists (
    select 1 from public.pedido_compra_item
    where pedido_id = p_pedido_id and deleted_at is null
      and coalesce(quantidade_entregue, 0) < coalesce(quantidade, 0) - 0.001
  ) into v_falta;

  if v_falta then
    v_status_receb := 'Parcial';
    update public.pedido_compra
       set status = 'Entregue Parcial', updated_at = now()
     where id = p_pedido_id;
  else
    v_status_receb := 'Total';
    update public.pedido_compra
       set status = 'Entregue', data_entrega = coalesce(p_data, current_date), updated_at = now()
     where id = p_pedido_id;
  end if;

  update public.recebimento_compra
     set status = v_status_receb, updated_at = now()
   where id = v_receb_id;

  return jsonb_build_object(
    'recebimento_id', v_receb_id,
    'itens_recebidos', v_n_itens,
    'recebimento_status', v_status_receb,
    'pedido_status', case when v_falta then 'Entregue Parcial' else 'Entregue' end,
    'mensagem', 'Recebimento ' || lower(v_status_receb) || ' registrado; estoque atualizado.'
  );
end;
$$;

revoke all on function public.conferir_recebimento_pedido(uuid, uuid, jsonb, text, date, text, text) from public;
grant execute on function public.conferir_recebimento_pedido(uuid, uuid, jsonb, text, date, text, text) to authenticated;
