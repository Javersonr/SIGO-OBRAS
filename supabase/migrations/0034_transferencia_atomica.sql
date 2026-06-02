-- ============================================================================
-- 0034_transferencia_atomica.sql
--
-- RPC criar_transferencia_atomica
--
-- Antes: o frontend (TransferenciasTab.jsx) criava só a linha em
-- transacao_transferencia. ExtratoBancario das contas e saldo_atual não eram
-- mexidos. Resultado: relatórios financeiros mostravam saldos
-- desatualizados, e se o usuário criasse uma transferência e fechasse o
-- navegador, o estado ficava inconsistente.
--
-- Esta função garante atomicidade: ou cria tudo (transferência + 2 extratos
-- + 2 ajustes de saldo) ou nada. Roda em SECURITY DEFINER e valida que as
-- duas contas pertencem à empresa informada antes de qualquer write.
-- ============================================================================

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
  -- Validações de entrada
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

  -- LOCK pessimista nas duas contas (sempre na mesma ordem de UUID pra
  -- evitar deadlock se duas transferências cruzadas rodarem simultâneo).
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

  -- 1. Cria a transferência
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

  -- 2. Cria os dois lançamentos de extrato (débito origem + crédito destino).
  --    Usa origem='Manual' (constraint do extrato_bancario só aceita OFX/Manual).
  --    hash_linha único por conta — usamos o id da transferência pra evitar
  --    colisão com OFX importado.
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

  -- 3. Atualiza saldo_atual das duas contas
  update public.conta_financeira
    set saldo_atual = coalesce(saldo_atual, 0) - abs(p_valor),
        updated_at = now()
    where id = v_conta_origem.id;

  update public.conta_financeira
    set saldo_atual = coalesce(saldo_atual, 0) + abs(p_valor),
        updated_at = now()
    where id = v_conta_destino.id;

  return jsonb_build_object(
    'success', true,
    'transferencia_id', v_transferencia_id,
    'extrato_origem_id', v_extrato_origem_id,
    'extrato_destino_id', v_extrato_destino_id
  );
end;
$$;

comment on function public.criar_transferencia_atomica is
  'Cria uma transferência entre contas de forma atômica: linha em transacao_transferencia + 2 extratos + ajuste de saldo. Tudo ou nada.';

-- Permite chamar via PostgREST (RLS continua valendo nas tabelas envolvidas
-- para reads; a função em si roda como definer pra garantir consistência).
grant execute on function public.criar_transferencia_atomica(uuid, uuid, uuid, numeric, date, text, uuid) to authenticated, anon, service_role;
