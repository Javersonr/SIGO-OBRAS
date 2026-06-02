-- ============================================================================
-- 0035_recalc_saldo_conta.sql
--
-- Mantém conta_financeira.saldo_atual coerente com os lançamentos do
-- extrato_bancario. Antes, frontend deletava/criava lançamentos sem
-- atualizar o saldo da conta — relatórios ficavam mostrando valor errado
-- até alguém clicar em "Recalcular" manualmente.
--
-- Estratégia: trigger AFTER INSERT/UPDATE/DELETE em extrato_bancario que
-- recalcula saldo das contas afetadas (uma de cada vez no caso de INSERT/
-- DELETE; ambas no caso de UPDATE com mudança de conta_id).
-- ============================================================================

create or replace function public.recalcular_saldo_conta(p_conta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_conta_id is null then
    return;
  end if;
  update public.conta_financeira c
    set saldo_atual = coalesce(c.saldo_inicial, 0) + coalesce((
      select sum(valor)
        from public.extrato_bancario e
        where e.conta_id = c.id
          and e.deleted_at is null
    ), 0),
    updated_at = now()
    where c.id = p_conta_id;
end;
$$;

comment on function public.recalcular_saldo_conta is
  'Recalcula saldo_atual de uma conta_financeira a partir do saldo_inicial + soma dos extratos não-deletados.';

create or replace function public.tg_extrato_bancario_recalc_saldo()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.recalcular_saldo_conta(new.conta_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.recalcular_saldo_conta(new.conta_id);
    if old.conta_id is distinct from new.conta_id then
      perform public.recalcular_saldo_conta(old.conta_id);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.recalcular_saldo_conta(old.conta_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_extrato_bancario_recalc_saldo on public.extrato_bancario;
create trigger trg_extrato_bancario_recalc_saldo
  after insert or update or delete on public.extrato_bancario
  for each row
  execute function public.tg_extrato_bancario_recalc_saldo();

-- Backfill: garante que o saldo_atual está coerente com extratos existentes.
-- Roda 1x na aplicação; é seguro re-rodar.
do $$
declare
  r record;
begin
  for r in select id from public.conta_financeira where deleted_at is null loop
    perform public.recalcular_saldo_conta(r.id);
  end loop;
end;
$$;

-- ============================================================================
-- Hook similar pra transacao_transferencia: como a RPC criar_transferencia_atomica
-- já mexe em conta_financeira diretamente e dispara o trigger via inserção
-- em extrato_bancario, NÃO precisamos de outro trigger aqui. Mas o UPDATE
-- direto de saldo dentro da RPC + esse trigger criam DUPLA contagem.
--
-- Solução: revisar a RPC do 0034 e tirar o UPDATE direto, deixando o
-- recálculo via trigger.
-- ============================================================================

-- Patch da 0034: remove o ajuste manual de saldo, deixa o trigger fazer
create or replace function public.criar_transferencia_atomica(
  p_empresa_id uuid,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_valor numeric,
  p_data date,
  p_descricao text default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta_origem public.conta_financeira%rowtype;
  v_conta_destino public.conta_financeira%rowtype;
  v_transferencia_id uuid;
  v_extrato_origem_id uuid;
  v_extrato_destino_id uuid;
  v_descricao_norm text;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id é obrigatório';
  end if;
  if p_conta_origem_id is null or p_conta_destino_id is null then
    raise exception 'conta_origem_id e conta_destino_id são obrigatórios';
  end if;
  if p_conta_origem_id = p_conta_destino_id then
    raise exception 'Conta de origem e destino não podem ser iguais';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor deve ser maior que zero';
  end if;
  if p_data is null then
    raise exception 'data é obrigatória';
  end if;

  if p_conta_origem_id < p_conta_destino_id then
    select * into v_conta_origem
      from public.conta_financeira
      where id = p_conta_origem_id and empresa_id = p_empresa_id
        and deleted_at is null
      for update;

    select * into v_conta_destino
      from public.conta_financeira
      where id = p_conta_destino_id and empresa_id = p_empresa_id
        and deleted_at is null
      for update;
  else
    select * into v_conta_destino
      from public.conta_financeira
      where id = p_conta_destino_id and empresa_id = p_empresa_id
        and deleted_at is null
      for update;

    select * into v_conta_origem
      from public.conta_financeira
      where id = p_conta_origem_id and empresa_id = p_empresa_id
        and deleted_at is null
      for update;
  end if;

  if v_conta_origem.id is null then
    raise exception 'Conta de origem não encontrada nesta empresa';
  end if;
  if v_conta_destino.id is null then
    raise exception 'Conta de destino não encontrada nesta empresa';
  end if;

  v_descricao_norm := coalesce(nullif(trim(p_descricao), ''), 'Transferência entre contas');

  insert into public.transacao_transferencia (
    empresa_id, conta_origem_id, conta_origem_nome,
    conta_destino_id, conta_destino_nome,
    valor, data, descricao, created_by
  ) values (
    p_empresa_id, v_conta_origem.id, v_conta_origem.nome,
    v_conta_destino.id, v_conta_destino.nome,
    p_valor, p_data, v_descricao_norm, p_created_by
  )
  returning id into v_transferencia_id;

  insert into public.extrato_bancario (
    empresa_id, conta_id, conta_nome, data, historico, valor,
    origem, hash_linha, conciliado, created_by
  ) values (
    p_empresa_id, v_conta_origem.id, v_conta_origem.nome, p_data,
    v_descricao_norm || ' (saída p/ ' || v_conta_destino.nome || ')',
    -abs(p_valor),
    'Manual', 'transf:' || v_transferencia_id::text || ':out',
    false, p_created_by
  )
  returning id into v_extrato_origem_id;

  insert into public.extrato_bancario (
    empresa_id, conta_id, conta_nome, data, historico, valor,
    origem, hash_linha, conciliado, created_by
  ) values (
    p_empresa_id, v_conta_destino.id, v_conta_destino.nome, p_data,
    v_descricao_norm || ' (entrada de ' || v_conta_origem.nome || ')',
    abs(p_valor),
    'Manual', 'transf:' || v_transferencia_id::text || ':in',
    false, p_created_by
  )
  returning id into v_extrato_destino_id;

  -- NB: o UPDATE manual de saldo foi removido. O trigger
  -- trg_extrato_bancario_recalc_saldo (definido nesta migration) já
  -- recalcula saldo_atual a partir dos inserts acima. Manter o UPDATE
  -- manual junto causaria dupla contagem.

  return jsonb_build_object(
    'success', true,
    'transferencia_id', v_transferencia_id,
    'extrato_origem_id', v_extrato_origem_id,
    'extrato_destino_id', v_extrato_destino_id
  );
end;
$$;
