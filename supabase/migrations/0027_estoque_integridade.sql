-- ============================================================================
-- 0027 — Estoque: integridade de reservas + entradas/saídas atômicas + dedup NFe
-- ============================================================================
-- Onda A do refactor de Estoque solicitado em 28/05/2026.
--
-- Resolve 4 bugs estruturais:
--   1. Reserva criada NÃO trava o saldo (quantidade_reservada nunca atualiza)
--   2. tipo "Reserva" em estoque_movimento viola CHECK
--   3. Entrada/saída tem race condition (read-modify-write sem lock)
--   4. NFe pode ser lançada duplicada (sem unique em chave_nfe)
--
-- Adições:
--   - Trigger que sincroniza reserva_material -> estoque_saldo.quantidade_reservada
--   - Function entrada_estoque_atomica() — UPSERT saldo + movimento + CMP em 1 tx
--   - Function saida_estoque_atomica()   — valida disponível + decrementa + movimento
--   - Function baixar_reserva_atomica()  — marca reserva utilizada + saída
--   - chave_nfe em transacao_financeira com índice único
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Estender CHECKs de estoque_movimento (tipo + referencia_tipo)
-- ────────────────────────────────────────────────────────────────────────────
-- NOT VALID: aplica só pra inserts/updates futuros. Dados legados podem
-- ter valores fora da lista (vimos isso ao rodar — abortou).
alter table public.estoque_movimento
  drop constraint if exists estoque_movimento_tipo_check;
alter table public.estoque_movimento
  add constraint estoque_movimento_tipo_check
  check (tipo in ('Entrada','Saída','Ajuste','Transferência','Reserva','Devolução'))
  not valid;

alter table public.estoque_movimento
  drop constraint if exists estoque_movimento_referencia_tipo_check;
alter table public.estoque_movimento
  add constraint estoque_movimento_referencia_tipo_check
  check (referencia_tipo is null or referencia_tipo in (
    'Pedido','Retirada','Ajuste','Transferência','Inventário','Manual',
    'Reserva','NotaFiscal','Devolução'
  ))
  not valid;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. NFe não pode ser lançada duplicada — adiciona chave_nfe + índice único
-- ────────────────────────────────────────────────────────────────────────────
alter table public.transacao_financeira
  add column if not exists chave_nfe text;

create unique index if not exists tx_chave_nfe_unique_idx
  on public.transacao_financeira(empresa_id, chave_nfe)
  where chave_nfe is not null and deleted_at is null;

-- Também queremos saber rápido se uma transação gerou entrada de estoque
-- (referência reversa pro EstoqueMovimento). Nullable: nem toda transação tem.
alter table public.transacao_financeira
  add column if not exists gerou_entrada_estoque boolean default false;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: sincroniza reserva_material -> estoque_saldo.quantidade_reservada
-- ────────────────────────────────────────────────────────────────────────────
-- Sempre que uma reserva é criada/atualizada/cancelada/deletada, recalcula
-- a soma de reservas Ativas para o (material, almoxarifado, local) e grava
-- no saldo. Isso faz quantidade_disponivel (coluna gerada) refletir a
-- realidade automaticamente.
--
-- Operação atômica do Postgres — sem race entre app + trigger.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_saldo_reservas()
returns trigger
language plpgsql
as $$
declare
  v_material_id uuid;
  v_almoxarifado_id uuid;
  v_total_reservado numeric(14,3);
begin
  -- Pegamos material+almox da linha afetada (NEW em INSERT/UPDATE, OLD em DELETE)
  v_material_id := coalesce(NEW.material_id, OLD.material_id);
  v_almoxarifado_id := coalesce(NEW.almoxarifado_id, OLD.almoxarifado_id);

  -- Em UPDATE pode ter mudado material ou almox: precisa sincronizar AMBOS lados
  if TG_OP = 'UPDATE' and (
    NEW.material_id is distinct from OLD.material_id
    or NEW.almoxarifado_id is distinct from OLD.almoxarifado_id
  ) then
    -- recalcula o lado OLD
    select coalesce(sum(quantidade_reservada), 0)
      into v_total_reservado
      from public.reserva_material
      where material_id = OLD.material_id
        and almoxarifado_id = OLD.almoxarifado_id
        and status = 'Ativa'
        and deleted_at is null;

    update public.estoque_saldo
       set quantidade_reservada = v_total_reservado,
           updated_at = now()
     where material_id = OLD.material_id
       and almoxarifado_id = OLD.almoxarifado_id;
  end if;

  -- recalcula o lado NEW (ou o único lado em INSERT/DELETE)
  select coalesce(sum(quantidade_reservada), 0)
    into v_total_reservado
    from public.reserva_material
    where material_id = v_material_id
      and almoxarifado_id = v_almoxarifado_id
      and status = 'Ativa'
      and deleted_at is null;

  update public.estoque_saldo
     set quantidade_reservada = v_total_reservado,
         updated_at = now()
   where material_id = v_material_id
     and almoxarifado_id = v_almoxarifado_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_saldo_reservas on public.reserva_material;
create trigger trg_sync_saldo_reservas
  after insert or update or delete on public.reserva_material
  for each row execute function public.sync_saldo_reservas();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Function entrada_estoque_atomica
-- ────────────────────────────────────────────────────────────────────────────
-- Faz em uma única transação:
--   1. INSERT em estoque_movimento (tipo 'Entrada')
--   2. UPSERT em estoque_saldo (incrementa quantidade)
--   3. Recalcula valor_medio ponderado (CMP) no saldo
--   4. Atualiza material.preco_medio com o novo CMP
--
-- Substitui o Promise.all do frontend que tinha race condition.
-- Frontend chama via supabase.rpc('entrada_estoque_atomica', {...}).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.entrada_estoque_atomica(
  p_empresa_id uuid,
  p_material_id uuid,
  p_almoxarifado_id uuid,
  p_quantidade numeric,
  p_valor_unitario numeric,
  p_referencia_tipo text default 'Manual',
  p_referencia_id uuid default null,
  p_projeto_id uuid default null,
  p_usuario_nome text default null,
  p_observacoes text default null,
  p_local_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_movimento_id uuid;
  v_saldo_atual numeric(14,3);
  v_valor_medio_atual numeric(14,4);
  v_novo_saldo numeric(14,3);
  v_novo_valor_medio numeric(14,4);
  v_material_nome text;
  v_almoxarifado_nome text;
  v_unidade text;
  v_projeto_nome text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva (recebido: %)', p_quantidade;
  end if;
  if p_valor_unitario is null or p_valor_unitario < 0 then
    raise exception 'Valor unitário inválido (recebido: %)', p_valor_unitario;
  end if;

  -- Dados nominais (denormalização útil pra relatórios sem JOIN)
  select nome, unidade into v_material_nome, v_unidade
    from public.material where id = p_material_id;
  select nome into v_almoxarifado_nome
    from public.almoxarifado where id = p_almoxarifado_id;
  if p_projeto_id is not null then
    select nome into v_projeto_nome from public.projeto where id = p_projeto_id;
  end if;

  -- LOCK pessimista no saldo (FOR UPDATE) — qualquer outra transação aguarda.
  -- Acaba com a race condition do frontend.
  select quantidade, valor_medio
    into v_saldo_atual, v_valor_medio_atual
    from public.estoque_saldo
    where material_id = p_material_id
      and almoxarifado_id = p_almoxarifado_id
      and coalesce(local_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_local_id, '00000000-0000-0000-0000-000000000000'::uuid)
    for update;

  if v_saldo_atual is null then
    -- Primeira entrada: saldo zero
    v_saldo_atual := 0;
    v_valor_medio_atual := 0;
  end if;

  -- Custo médio ponderado:
  --   novo_cmp = (saldo*cmp_atual + qtd*valor_unit) / (saldo + qtd)
  v_novo_saldo := v_saldo_atual + p_quantidade;
  v_novo_valor_medio := round(
    ((v_saldo_atual * coalesce(v_valor_medio_atual, 0))
     + (p_quantidade * p_valor_unitario))
    / nullif(v_novo_saldo, 0)::numeric
  , 4);

  -- 1. Movimento
  insert into public.estoque_movimento (
    empresa_id, material_id, material_descricao,
    almoxarifado_id, almoxarifado_nome, local_id,
    tipo, quantidade, valor_unitario, valor_total,
    data_movimento, projeto_id, projeto_nome,
    referencia_tipo, referencia_id, usuario_nome, observacoes
  ) values (
    p_empresa_id, p_material_id, v_material_nome,
    p_almoxarifado_id, v_almoxarifado_nome, p_local_id,
    'Entrada', p_quantidade, p_valor_unitario, p_quantidade * p_valor_unitario,
    now(), p_projeto_id, v_projeto_nome,
    p_referencia_tipo, p_referencia_id, p_usuario_nome, p_observacoes
  ) returning id into v_movimento_id;

  -- 2. UPSERT saldo
  insert into public.estoque_saldo (
    empresa_id, material_id, material_descricao,
    almoxarifado_id, almoxarifado_nome, local_id,
    quantidade, valor_medio, valor_total, unidade
  ) values (
    p_empresa_id, p_material_id, v_material_nome,
    p_almoxarifado_id, v_almoxarifado_nome, p_local_id,
    v_novo_saldo, v_novo_valor_medio,
    v_novo_saldo * v_novo_valor_medio, v_unidade
  )
  on conflict (material_id, almoxarifado_id, local_id) do update set
    quantidade = excluded.quantidade,
    valor_medio = excluded.valor_medio,
    valor_total = excluded.valor_total,
    updated_at = now();

  -- 3. Atualiza CMP do material (média de TODOS os saldos do material)
  update public.material
     set preco_medio = (
       select round(
         sum(quantidade * coalesce(valor_medio, 0))
         / nullif(sum(quantidade), 0)::numeric
       , 4)
       from public.estoque_saldo
       where material_id = p_material_id
         and deleted_at is null
     ),
     updated_at = now()
   where id = p_material_id;

  return v_movimento_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Function saida_estoque_atomica
-- ────────────────────────────────────────────────────────────────────────────
-- Saída valida disponibilidade ANTES de descontar. Reservas trav-am de fato:
-- só consegue tirar se quantidade_disponivel >= quantidade.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.saida_estoque_atomica(
  p_empresa_id uuid,
  p_material_id uuid,
  p_almoxarifado_id uuid,
  p_quantidade numeric,
  p_referencia_tipo text default 'Manual',
  p_referencia_id uuid default null,
  p_projeto_id uuid default null,
  p_usuario_nome text default null,
  p_observacoes text default null,
  p_local_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_movimento_id uuid;
  v_disponivel numeric(14,3);
  v_saldo_atual numeric(14,3);
  v_valor_medio numeric(14,4);
  v_material_nome text;
  v_almoxarifado_nome text;
  v_unidade text;
  v_projeto_nome text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva (recebido: %)', p_quantidade;
  end if;

  select nome, unidade into v_material_nome, v_unidade
    from public.material where id = p_material_id;
  select nome into v_almoxarifado_nome
    from public.almoxarifado where id = p_almoxarifado_id;
  if p_projeto_id is not null then
    select nome into v_projeto_nome from public.projeto where id = p_projeto_id;
  end if;

  -- LOCK pessimista + valida disponibilidade
  select quantidade, quantidade_disponivel, valor_medio
    into v_saldo_atual, v_disponivel, v_valor_medio
    from public.estoque_saldo
    where material_id = p_material_id
      and almoxarifado_id = p_almoxarifado_id
      and coalesce(local_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_local_id, '00000000-0000-0000-0000-000000000000'::uuid)
    for update;

  if v_saldo_atual is null then
    raise exception 'Sem saldo para material % no almoxarifado %', p_material_id, p_almoxarifado_id;
  end if;

  if v_disponivel < p_quantidade then
    raise exception 'Saldo disponível insuficiente. Disponível: %, solicitado: % (% reservado)',
      v_disponivel, p_quantidade, (v_saldo_atual - v_disponivel);
  end if;

  insert into public.estoque_movimento (
    empresa_id, material_id, material_descricao,
    almoxarifado_id, almoxarifado_nome, local_id,
    tipo, quantidade, valor_unitario, valor_total,
    data_movimento, projeto_id, projeto_nome,
    referencia_tipo, referencia_id, usuario_nome, observacoes
  ) values (
    p_empresa_id, p_material_id, v_material_nome,
    p_almoxarifado_id, v_almoxarifado_nome, p_local_id,
    'Saída', p_quantidade, v_valor_medio, p_quantidade * coalesce(v_valor_medio, 0),
    now(), p_projeto_id, v_projeto_nome,
    p_referencia_tipo, p_referencia_id, p_usuario_nome, p_observacoes
  ) returning id into v_movimento_id;

  update public.estoque_saldo
     set quantidade = v_saldo_atual - p_quantidade,
         valor_total = (v_saldo_atual - p_quantidade) * coalesce(v_valor_medio, 0),
         updated_at = now()
   where material_id = p_material_id
     and almoxarifado_id = p_almoxarifado_id
     and coalesce(local_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_local_id, '00000000-0000-0000-0000-000000000000'::uuid);

  return v_movimento_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Function baixar_reserva_atomica
-- ────────────────────────────────────────────────────────────────────────────
-- Quando obra consome material reservado:
--   1. Marca reserva como 'Utilizada' (trigger ajusta quantidade_reservada)
--   2. Cria movimento de Saída referenciando a reserva
--   3. Decrementa o saldo
-- Mesmo padrão atômico das outras functions.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.baixar_reserva_atomica(
  p_reserva_id uuid,
  p_quantidade_baixar numeric,
  p_usuario_nome text default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
as $$
declare
  v_reserva public.reserva_material%rowtype;
  v_movimento_id uuid;
  v_saldo_atual numeric(14,3);
  v_valor_medio numeric(14,4);
begin
  select * into v_reserva
    from public.reserva_material
    where id = p_reserva_id
    for update;

  if v_reserva.id is null then
    raise exception 'Reserva % não encontrada', p_reserva_id;
  end if;

  if v_reserva.status <> 'Ativa' then
    raise exception 'Reserva % não está ativa (status: %)', p_reserva_id, v_reserva.status;
  end if;

  if p_quantidade_baixar is null or p_quantidade_baixar <= 0 then
    raise exception 'Quantidade a baixar deve ser positiva';
  end if;

  if p_quantidade_baixar > v_reserva.quantidade_reservada then
    raise exception 'Tentativa de baixar % de uma reserva de %',
      p_quantidade_baixar, v_reserva.quantidade_reservada;
  end if;

  -- Lock no saldo
  select quantidade, valor_medio
    into v_saldo_atual, v_valor_medio
    from public.estoque_saldo
    where material_id = v_reserva.material_id
      and almoxarifado_id = v_reserva.almoxarifado_id
    for update;

  -- Cria movimento de Saída (referenciando a reserva)
  insert into public.estoque_movimento (
    empresa_id, material_id, material_descricao,
    almoxarifado_id, almoxarifado_nome,
    tipo, quantidade, valor_unitario, valor_total,
    data_movimento, projeto_id, projeto_nome,
    referencia_tipo, referencia_id, usuario_nome, observacoes
  ) values (
    v_reserva.empresa_id, v_reserva.material_id, v_reserva.material_descricao,
    v_reserva.almoxarifado_id, v_reserva.almoxarifado_nome,
    'Saída', p_quantidade_baixar, coalesce(v_valor_medio, 0),
    p_quantidade_baixar * coalesce(v_valor_medio, 0),
    now(), v_reserva.projeto_id, v_reserva.projeto_nome,
    'Reserva', p_reserva_id,
    p_usuario_nome,
    coalesce(p_observacoes, 'Baixa de reserva ' || coalesce(v_reserva.numero, p_reserva_id::text))
  ) returning id into v_movimento_id;

  -- Decrementa saldo
  update public.estoque_saldo
     set quantidade = v_saldo_atual - p_quantidade_baixar,
         valor_total = (v_saldo_atual - p_quantidade_baixar) * coalesce(v_valor_medio, 0),
         updated_at = now()
   where material_id = v_reserva.material_id
     and almoxarifado_id = v_reserva.almoxarifado_id;

  -- Atualiza reserva: se baixou TUDO, marca como Utilizada; senão, decrementa
  if p_quantidade_baixar = v_reserva.quantidade_reservada then
    update public.reserva_material
       set status = 'Utilizada',
           updated_at = now()
     where id = p_reserva_id;
  else
    update public.reserva_material
       set quantidade_reservada = v_reserva.quantidade_reservada - p_quantidade_baixar,
           updated_at = now()
     where id = p_reserva_id;
  end if;

  -- Trigger trg_sync_saldo_reservas recalcula quantidade_reservada do saldo
  -- automaticamente após o UPDATE acima.

  return v_movimento_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Re-sincronizar saldos com reservas existentes (one-time)
-- ────────────────────────────────────────────────────────────────────────────
-- Se já tinham reservas Ativas antes desta migration, o saldo nunca foi
-- atualizado. Fazemos um catch-up rodando o cálculo manualmente.
-- ────────────────────────────────────────────────────────────────────────────
update public.estoque_saldo es
   set quantidade_reservada = coalesce(sub.total_reservado, 0),
       updated_at = now()
  from (
    select material_id, almoxarifado_id, sum(quantidade_reservada) as total_reservado
      from public.reserva_material
      where status = 'Ativa' and deleted_at is null
      group by material_id, almoxarifado_id
  ) sub
 where es.material_id = sub.material_id
   and es.almoxarifado_id = sub.almoxarifado_id;

-- Zera reservas de saldos sem reserva ativa correspondente
update public.estoque_saldo
   set quantidade_reservada = 0,
       updated_at = now()
 where quantidade_reservada > 0
   and not exists (
     select 1 from public.reserva_material rm
      where rm.material_id = estoque_saldo.material_id
        and rm.almoxarifado_id = estoque_saldo.almoxarifado_id
        and rm.status = 'Ativa'
        and rm.deleted_at is null
   );

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Permissões pras functions serem chamadas via PostgREST (Supabase RPC)
-- ────────────────────────────────────────────────────────────────────────────
grant execute on function public.entrada_estoque_atomica(
  uuid, uuid, uuid, numeric, numeric, text, uuid, uuid, text, text, uuid
) to anon, authenticated;

grant execute on function public.saida_estoque_atomica(
  uuid, uuid, uuid, numeric, text, uuid, uuid, text, text, uuid
) to anon, authenticated;

grant execute on function public.baixar_reserva_atomica(
  uuid, numeric, text, text
) to anon, authenticated;
