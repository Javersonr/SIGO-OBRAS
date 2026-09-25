-- Varredura pós-0108: 33 funções SECURITY DEFINER em public eram executáveis
-- por anon via /rest/v1/rpc. Três furos:
--   1. o guard "if current_empresa_id() is not null and x.empresa_id <> ..."
--      é PULADO quando não há login (current_empresa_id() nulo);
--   2. fluxo_* / liberar_sst / revogar_liberacao_sst só trocam e-mail/perfil
--      pelos do token "se houver token" — anon declarava perfil 'Admin';
--   3. criar_transferencia_atomica, notificar_* e fluxo_abrir_* não checavam
--      nada (a transferência validava as contas contra o p_empresa_id enviado
--      pelo próprio cliente — nem usuário logado de outra empresa era barrado).
-- Além disso consolidado_grupo devolvia as finanças de TODAS as empresas para
-- qualquer Admin Holding, não só as do grupo dele.
--
-- Agora:
--   * exigir_empresa_do_chamador(): servidor (service_role, pg_cron,
--     migração) passa; via API exige login e empresa do token (ou super admin);
--   * crons, notificações, motor interno de fluxo e triggers: só servidor;
--   * RPCs do app: só authenticated, com o guard de empresa;
--   * consolidado_grupo: Admin Holding vê só as empresas do grupo dele.

-- ─────────────────────────────────────────────────────────────────────────
-- Quem está chamando
-- ─────────────────────────────────────────────────────────────────────────

-- true = servidor: service role (edge functions/bot) ou job interno sem JWT
-- (pg_cron, migração, SQL editor). Via API o session_user é sempre
-- "authenticator" e o JWT traz role anon/authenticated.
create or replace function public.chamador_eh_servidor()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or (auth.jwt() ->> 'role' is null and session_user::text <> 'authenticator');
$$;

-- Barra quem não é do servidor e não pertence à empresa do registro.
-- SECURITY DEFINER bypassa a RLS, então as RPCs chamam isto na mão.
create or replace function public.exigir_empresa_do_chamador(
  p_empresa_id uuid,
  p_oque text default 'registro'
)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() then
    return;
  end if;

  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    raise exception 'Acesso negado: login obrigatório' using errcode = '42501';
  end if;

  if public.current_user_is_super_admin() then
    return;
  end if;

  if p_empresa_id is null
     or p_empresa_id is distinct from public.current_empresa_id() then
    raise exception 'Acesso negado: % de outra empresa', p_oque using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.chamador_eh_servidor() from public, anon, authenticated;
revoke all on function public.exigir_empresa_do_chamador(uuid, text) from public, anon, authenticated;
grant execute on function public.chamador_eh_servidor() to service_role;
grant execute on function public.exigir_empresa_do_chamador(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs chamadas pelo app (authenticated) — guard de empresa
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.conferir_recebimento_pedido(p_pedido_id uuid, p_almoxarifado_id uuid, p_itens jsonb, p_nfe_chave text DEFAULT NULL::text, p_data date DEFAULT NULL::date, p_ator_email text DEFAULT NULL::text, p_ator_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.exigir_empresa_do_chamador(v_ped.empresa_id, 'pedido');

  -- o estoque entra no almoxarifado informado: tem que ser da mesma empresa
  if p_almoxarifado_id is not null and not exists (
    select 1 from public.almoxarifado
     where id = p_almoxarifado_id
       and empresa_id = v_ped.empresa_id
       and deleted_at is null
  ) then
    raise exception 'Almoxarifado não pertence à empresa do pedido';
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
$function$;

create or replace function public.criar_transferencia_atomica(p_empresa_id uuid, p_conta_origem_id uuid, p_conta_destino_id uuid, p_valor numeric, p_data date, p_descricao text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- p_empresa_id vem do cliente: tem que ser a empresa do token
  perform public.exigir_empresa_do_chamador(p_empresa_id, 'conta');

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
$function$;

create or replace function public.faturar_medicao(p_medicao_id uuid, p_data_vencimento date, p_ator_email text DEFAULT NULL::text, p_ator_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m public.medicao_obra%rowtype;
  v_p public.projeto%rowtype;
  v_pct numeric(5,2);
  v_iss_pct numeric(5,2);
  v_inss_pct numeric(5,2);
  v_ret numeric(14,2);
  v_iss numeric(14,2);
  v_inss numeric(14,2);
  v_liq numeric(14,2);
  v_rec_id uuid;
  v_ret_id uuid;
  v_iss_id uuid;
  v_inss_id uuid;
begin
  select * into v_m
    from public.medicao_obra
    where id = p_medicao_id and deleted_at is null
    for update;

  if v_m.id is null then
    raise exception 'Medicao nao encontrada';
  end if;

  perform public.exigir_empresa_do_chamador(v_m.empresa_id, 'medição');

  if v_m.status = 'Faturada' then
    raise exception 'Medicao #% ja foi faturada', v_m.numero;
  end if;

  if p_data_vencimento is null then
    raise exception 'Informe a data de vencimento da fatura';
  end if;

  select * into v_p from public.projeto where id = v_m.projeto_id;

  v_pct      := coalesce(v_m.retencao_percentual, v_p.retencao_percentual, 0);
  v_iss_pct  := coalesce(v_m.iss_percentual, v_p.iss_percentual, 0);
  v_inss_pct := coalesce(v_m.inss_percentual, v_p.inss_percentual, 0);

  v_ret  := round(v_m.valor_medido * v_pct / 100.0, 2);
  v_iss  := round(v_m.valor_medido * v_iss_pct / 100.0, 2);
  v_inss := round(v_m.valor_medido * v_inss_pct / 100.0, 2);
  v_liq  := v_m.valor_medido - v_ret - v_iss - v_inss;

  if v_liq < 0 then
    raise exception 'Percentuais somados excedem 100%% (retencao %% + ISS %% + INSS %%)';
  end if;

  insert into public.transacao_financeira (
    empresa_id, tipo, valor, data, data_vencimento, status, descricao,
    projeto_id, projeto_nome, cliente_id, cliente_nome,
    referencia_tipo, referencia_id, observacoes
  ) values (
    v_m.empresa_id, 'Receita', v_liq, current_date, p_data_vencimento, 'pendente',
    'Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
    v_p.id, v_p.nome, v_p.cliente_id, v_p.cliente_nome,
    'medicao_obra', v_m.id,
    'Medido R$ ' || v_m.valor_medido ||
      case when v_ret > 0 then ' - retencao ' || v_pct || '% (R$ ' || v_ret || ')' else '' end ||
      case when v_iss > 0 then ' - ISS ' || v_iss_pct || '% (R$ ' || v_iss || ')' else '' end ||
      case when v_inss > 0 then ' - INSS ' || v_inss_pct || '% (R$ ' || v_inss || ')' else '' end
  ) returning id into v_rec_id;

  if v_ret > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, status, descricao,
      projeto_id, projeto_nome, cliente_id, cliente_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Receita', v_ret, current_date, 'pendente',
      'Retencao ' || v_pct || '% - Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome, v_p.cliente_id, v_p.cliente_nome,
      'medicao_obra_retencao', v_m.id,
      'Caucao contratual; liberar conforme contrato (ajuste o vencimento quando definido).'
    ) returning id into v_ret_id;
  end if;

  if v_iss > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, data_vencimento, data_pagamento, status,
      descricao, projeto_id, projeto_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Despesa', v_iss, current_date, p_data_vencimento, p_data_vencimento, 'pago',
      'ISS retido ' || v_iss_pct || '% - Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome,
      'medicao_obra_imposto', v_m.id,
      'Retido na fonte pela contratante - nao transita pelo caixa.'
    ) returning id into v_iss_id;
  end if;

  if v_inss > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, data_vencimento, data_pagamento, status,
      descricao, projeto_id, projeto_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Despesa', v_inss, current_date, p_data_vencimento, p_data_vencimento, 'pago',
      'INSS retido ' || v_inss_pct || '% - Medicao #' || v_m.numero || ' - ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome,
      'medicao_obra_imposto', v_m.id,
      'Retido na fonte pela contratante - nao transita pelo caixa.'
    ) returning id into v_inss_id;
  end if;

  update public.medicao_obra
     set status = 'Faturada',
         retencao_percentual = v_pct,
         iss_percentual = v_iss_pct,
         inss_percentual = v_inss_pct,
         valor_retencao = v_ret,
         valor_iss = v_iss,
         valor_inss = v_inss,
         valor_liquido = v_liq,
         transacao_receita_id = v_rec_id,
         transacao_retencao_id = v_ret_id,
         transacao_iss_id = v_iss_id,
         transacao_inss_id = v_inss_id,
         data_faturamento = now(),
         updated_at = now()
   where id = p_medicao_id;

  return jsonb_build_object(
    'medicao', v_m.numero,
    'valor_medido', v_m.valor_medido,
    'retencao_percentual', v_pct,
    'valor_retencao', v_ret,
    'valor_iss', v_iss,
    'valor_inss', v_inss,
    'valor_liquido', v_liq,
    'transacao_receita_id', v_rec_id,
    'mensagem', 'Medicao faturada: liquido R$ ' || v_liq ||
      case when v_ret > 0 then ' - retencao R$ ' || v_ret else '' end ||
      case when v_iss > 0 then ' - ISS R$ ' || v_iss else '' end ||
      case when v_inss > 0 then ' - INSS R$ ' || v_inss else '' end
  );
end;
$function$;

create or replace function public.fluxo_instanciar(p_template_id uuid, p_entidade_alvo text, p_registro_id uuid, p_ator_email text, p_ator_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tpl public.fluxo_template%rowtype;
  v_inst_id uuid;
  v_primeira uuid;
begin
  -- identidade do token sobrepõe o que o cliente declarou
  p_ator_email := coalesce(public.current_user_email(), p_ator_email);

  select * into v_tpl
    from public.fluxo_template
    where id = p_template_id and deleted_at is null
    for update;

  if v_tpl.id is null then
    raise exception 'Template de fluxo não encontrado';
  end if;

  -- guard multi-tenant (definer bypassa RLS, então validamos na mão)
  perform public.exigir_empresa_do_chamador(v_tpl.empresa_id, 'template');

  -- evita duas instâncias ativas pro mesmo registro do mesmo template
  if exists (
    select 1 from public.fluxo_instancia
      where fluxo_template_id = p_template_id
        and registro_id = p_registro_id
        and status = 'Em Andamento'
        and deleted_at is null
  ) then
    raise exception 'Já existe um fluxo em andamento para este registro.';
  end if;

  insert into public.fluxo_instancia (
    empresa_id, fluxo_template_id, template_nome, entidade_alvo,
    registro_id, status, created_by_email, created_by_nome
  ) values (
    v_tpl.empresa_id, v_tpl.id, v_tpl.nome,
    coalesce(p_entidade_alvo, v_tpl.entidade_alvo, 'oportunidade'),
    p_registro_id, 'Em Andamento', p_ator_email, p_ator_nome
  ) returning id into v_inst_id;

  -- copia as etapas do template (snapshot)
  insert into public.fluxo_etapa_instancia (
    empresa_id, fluxo_instancia_id, etapa_template_id, ordem, nome, tipo,
    papel_responsavel, papel_aprovador, exige_aprovacao, checklist, opcoes,
    proxima_etapa_ordem, status
  )
  select v_tpl.empresa_id, v_inst_id, et.id, et.ordem, et.nome, et.tipo,
         et.papel_responsavel, et.papel_aprovador, coalesce(et.exige_aprovacao, false),
         coalesce(et.checklist, '[]'::jsonb), coalesce(et.opcoes, '[]'::jsonb),
         et.proxima_etapa_ordem, 'A Fazer'
    from public.fluxo_etapa_template et
    where et.fluxo_template_id = v_tpl.id
      and et.deleted_at is null
    order by et.ordem;

  if not exists (
    select 1 from public.fluxo_etapa_instancia where fluxo_instancia_id = v_inst_id
  ) then
    raise exception 'Template não tem etapas para executar.';
  end if;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, evento, ator_email, ator_nome
  ) values (
    v_tpl.empresa_id, v_inst_id, 'Instanciou', p_ator_email, p_ator_nome
  );

  -- abre a primeira etapa (menor ordem)
  select id into v_primeira
    from public.fluxo_etapa_instancia
    where fluxo_instancia_id = v_inst_id and deleted_at is null
    order by ordem
    limit 1;

  perform public.fluxo_abrir_a_partir(v_inst_id, v_primeira);

  return v_inst_id;
end;
$function$;

create or replace function public.fluxo_aprovar_etapa(p_etapa_id uuid, p_aprovador_email text, p_aprovador_nome text, p_aprovador_perfil text, p_comentario text DEFAULT NULL::text, p_opcao_escolhida text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
  v_destino integer;
  v_jwt_email text;
  v_perfil_real text;
begin
  -- identidade do token sobrepõe o que o cliente declarou; sem token, só o
  -- servidor pode declarar e-mail/perfil
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_aprovador_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_aprovador_perfil := v_perfil_real;
  elsif not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: login obrigatório' using errcode = '42501';
  end if;

  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  perform public.exigir_empresa_do_chamador(v_e.empresa_id, 'etapa');

  if v_e.status <> 'Em Revisão' then
    raise exception 'Etapa não está em revisão (status atual: %)', v_e.status;
  end if;

  if v_e.executor_email is not null
     and lower(v_e.executor_email) = lower(p_aprovador_email) then
    raise exception 'Quem executou a etapa não pode aprová-la.';
  end if;

  if v_e.papel_aprovador is not null
     and p_aprovador_perfil <> v_e.papel_aprovador
     and p_aprovador_perfil <> 'Admin' then
    raise exception 'Perfil "%" não autorizado a aprovar esta etapa (requer "%")',
      p_aprovador_perfil, v_e.papel_aprovador;
  end if;

  v_destino := null;
  if v_e.tipo = 'decisao'
     and p_opcao_escolhida is not null
     and jsonb_typeof(v_e.opcoes) = 'array'
     and jsonb_array_length(v_e.opcoes) > 0
     and jsonb_typeof(v_e.opcoes -> 0) = 'object' then
    select case
             when (op ->> 'destino_ordem') ~ '^-?\d+$' then (op ->> 'destino_ordem')::int
             when (op ->> 'destino') ~ '^-?\d+$' then (op ->> 'destino')::int
             when lower(coalesce(op ->> 'destino', '')) = 'fim' then -1
             else null
           end
      into v_destino
      from jsonb_array_elements(v_e.opcoes) op
      where lower(coalesce(op ->> 'rotulo', op ->> 'label', '')) = lower(p_opcao_escolhida)
      limit 1;
  end if;

  update public.fluxo_etapa_instancia
     set status = 'Aprovada',
         aprovador_email = p_aprovador_email,
         aprovador_nome = p_aprovador_nome,
         data_decisao = now(),
         comentario = p_comentario,
         updated_at = now()
   where id = p_etapa_id;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, fluxo_etapa_instancia_id, evento,
    ator_email, ator_nome, ator_perfil, comentario, opcao_escolhida
  ) values (
    v_e.empresa_id, v_e.fluxo_instancia_id, v_e.id, 'Aprovou',
    p_aprovador_email, p_aprovador_nome, p_aprovador_perfil, p_comentario, p_opcao_escolhida
  );

  perform public.fluxo_abrir_proxima(v_e.fluxo_instancia_id, v_e.id, v_destino);

  return jsonb_build_object('status', 'Aprovada',
    'mensagem', 'Etapa aprovada; o fluxo avançou.');
end;
$function$;

create or replace function public.fluxo_concluir_etapa(p_etapa_id uuid, p_executor_email text, p_executor_nome text, p_executor_perfil text DEFAULT NULL::text, p_checklist_estado jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
  v_jwt_email text;
  v_perfil_real text;
begin
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_executor_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_executor_perfil := v_perfil_real;
  elsif not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: login obrigatório' using errcode = '42501';
  end if;

  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  perform public.exigir_empresa_do_chamador(v_e.empresa_id, 'etapa');

  if v_e.status <> 'Em Execução' then
    raise exception 'Etapa não está em execução (status atual: %)', v_e.status;
  end if;

  if v_e.papel_responsavel is not null
     and p_executor_perfil is not null
     and p_executor_perfil <> v_e.papel_responsavel
     and p_executor_perfil <> 'Admin' then
    raise exception 'Perfil "%" não é o responsável por esta etapa (requer "%")',
      p_executor_perfil, v_e.papel_responsavel;
  end if;

  update public.fluxo_etapa_instancia
     set executor_email = p_executor_email,
         executor_nome = p_executor_nome,
         data_execucao = now(),
         checklist_estado = coalesce(p_checklist_estado, checklist_estado),
         status = case when v_e.exige_aprovacao then 'Em Revisão' else 'Concluída' end,
         updated_at = now()
   where id = p_etapa_id;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, fluxo_etapa_instancia_id, evento,
    ator_email, ator_nome, ator_perfil
  ) values (
    v_e.empresa_id, v_e.fluxo_instancia_id, v_e.id, 'Concluiu',
    p_executor_email, p_executor_nome, p_executor_perfil
  );

  if v_e.exige_aprovacao then
    perform public.fluxo_notificar_papel(
      v_e.empresa_id,
      v_e.papel_aprovador,
      'Etapa aguardando sua aprovação: ' || v_e.nome,
      'Executada por ' || coalesce(p_executor_nome, p_executor_email, '—')
        || '. Revise e aprove ou reprove.',
      '/MinhasPendencias'
    );
    return jsonb_build_object('status', 'Em Revisão',
      'mensagem', 'Etapa enviada para aprovação.');
  else
    perform public.fluxo_abrir_proxima(v_e.fluxo_instancia_id, v_e.id, null);
    return jsonb_build_object('status', 'Concluída',
      'mensagem', 'Etapa concluída; o fluxo avançou.');
  end if;
end;
$function$;

create or replace function public.fluxo_reprovar_etapa(p_etapa_id uuid, p_aprovador_email text, p_aprovador_nome text, p_aprovador_perfil text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
  v_jwt_email text;
  v_perfil_real text;
begin
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_aprovador_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_aprovador_perfil := v_perfil_real;
  elsif not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: login obrigatório' using errcode = '42501';
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Motivo da reprovação é obrigatório (mín. 5 caracteres)';
  end if;

  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  perform public.exigir_empresa_do_chamador(v_e.empresa_id, 'etapa');

  if v_e.status <> 'Em Revisão' then
    raise exception 'Etapa não está em revisão (status atual: %)', v_e.status;
  end if;

  if v_e.executor_email is not null
     and lower(v_e.executor_email) = lower(p_aprovador_email) then
    raise exception 'Quem executou a etapa não pode decidir sobre ela.';
  end if;

  if v_e.papel_aprovador is not null
     and p_aprovador_perfil <> v_e.papel_aprovador
     and p_aprovador_perfil <> 'Admin' then
    raise exception 'Perfil "%" não autorizado a reprovar esta etapa (requer "%")',
      p_aprovador_perfil, v_e.papel_aprovador;
  end if;

  update public.fluxo_etapa_instancia
     set status = 'Em Execução',
         aprovador_email = p_aprovador_email,
         aprovador_nome = p_aprovador_nome,
         data_decisao = now(),
         comentario = p_motivo,
         updated_at = now()
   where id = p_etapa_id;

  update public.fluxo_instancia
     set etapa_atual_id = v_e.id, updated_at = now()
   where id = v_e.fluxo_instancia_id;

  insert into public.fluxo_etapa_evento (
    empresa_id, fluxo_instancia_id, fluxo_etapa_instancia_id, evento,
    ator_email, ator_nome, ator_perfil, comentario
  ) values (
    v_e.empresa_id, v_e.fluxo_instancia_id, v_e.id, 'Reprovou',
    p_aprovador_email, p_aprovador_nome, p_aprovador_perfil, p_motivo
  );

  if v_e.executor_email is not null then
    insert into public.notificacao (
      empresa_id, usuario_email, titulo, mensagem, tipo, prioridade, lida, link
    ) values (
      v_e.empresa_id, v_e.executor_email,
      'Etapa reprovada: ' || v_e.nome,
      'Motivo: ' || p_motivo || ' • Por: ' || coalesce(p_aprovador_nome, p_aprovador_email),
      'Fluxo', 'Alta', false, '/MinhasPendencias'
    );
  end if;

  return jsonb_build_object('status', 'Em Execução',
    'mensagem', 'Etapa reprovada; voltou para execução (re-trabalho).');
end;
$function$;

create or replace function public.funcionario_apto_campo(p_funcionario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_f public.funcionario%rowtype;
  v_motivos text[] := array[]::text[];
  v_lib public.liberacao_sst%rowtype;
  v_apto boolean;
begin
  select * into v_f
    from public.funcionario
    where id = p_funcionario_id and deleted_at is null;

  if v_f.id is null then
    return jsonb_build_object('apto', false,
      'motivos', array['Funcionário não encontrado'], 'liberado_excepcionalmente', false);
  end if;

  perform public.exigir_empresa_do_chamador(v_f.empresa_id, 'funcionário');

  -- regras de impedimento
  if coalesce(v_f.ativo, true) = false then
    v_motivos := array_append(v_motivos, 'Funcionário inativo');
  end if;

  if v_f.aso_vencimento is null then
    v_motivos := array_append(v_motivos, 'ASO não cadastrado');
  elsif v_f.aso_vencimento < current_date then
    v_motivos := array_append(v_motivos,
      'ASO vencido em ' || to_char(v_f.aso_vencimento, 'DD/MM/YYYY'));
  end if;

  v_apto := array_length(v_motivos, 1) is null;

  -- se há impedimento, verifica liberação excepcional vigente
  if not v_apto then
    select * into v_lib
      from public.liberacao_sst
      where funcionario_id = p_funcionario_id
        and deleted_at is null
        and valido_ate >= current_date
      order by valido_ate desc
      limit 1;

    if v_lib.id is not null then
      return jsonb_build_object(
        'apto', true,
        'motivos', to_jsonb(v_motivos),
        'aso_vencimento', v_f.aso_vencimento,
        'liberado_excepcionalmente', true,
        'liberacao', jsonb_build_object(
          'motivo', v_lib.motivo,
          'liberado_por', coalesce(v_lib.liberado_por_nome, v_lib.liberado_por_email),
          'valido_ate', v_lib.valido_ate
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'apto', v_apto,
    'motivos', to_jsonb(v_motivos),
    'aso_vencimento', v_f.aso_vencimento,
    'liberado_excepcionalmente', false,
    'liberacao', null
  );
end;
$function$;

create or replace function public.liberar_sst(p_funcionario_id uuid, p_motivo text, p_liberado_por_email text, p_liberado_por_nome text, p_perfil text, p_dias_validade integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_f public.funcionario%rowtype;
  v_id uuid;
  v_jwt_email text;
  v_perfil_real text;
  v_valido_ate date;
begin
  -- identidade do token sobrepõe o que o cliente declarou
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    p_liberado_por_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_perfil := v_perfil_real;
  elsif not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: login obrigatório' using errcode = '42501';
  end if;

  if p_perfil not in ('Admin', 'Admin Holding', 'Gestor') then
    raise exception 'Apenas Admin/Gestor pode liberar excepcionalmente (perfil: %)', p_perfil;
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Justificativa obrigatória (mín. 5 caracteres)';
  end if;

  select * into v_f
    from public.funcionario
    where id = p_funcionario_id and deleted_at is null;

  if v_f.id is null then
    raise exception 'Funcionário não encontrado';
  end if;

  perform public.exigir_empresa_do_chamador(v_f.empresa_id, 'funcionário');

  v_valido_ate := current_date + greatest(coalesce(p_dias_validade, 30), 1);

  insert into public.liberacao_sst (
    empresa_id, funcionario_id, motivo,
    liberado_por_email, liberado_por_nome, valido_ate
  ) values (
    v_f.empresa_id, p_funcionario_id, p_motivo,
    p_liberado_por_email, p_liberado_por_nome,
    v_valido_ate
  ) returning id into v_id;

  -- trilha de auditoria: avisa os gestores
  perform public.notificar_gestores(
    v_f.empresa_id,
    array['Admin', 'Admin Holding', 'Gestor'],
    'Liberação SST excepcional',
    'Funcionário ' || coalesce(v_f.nome_completo, '—') || ' liberado para campo por ' ||
      coalesce(p_liberado_por_nome, p_liberado_por_email, 'sistema') ||
      ' até ' || to_char(v_valido_ate, 'DD/MM/YYYY') || '. Motivo: ' || p_motivo,
    '/SegurancaTrabalho',
    'Sistema',
    'Alta',
    'sst_liberacao|' || v_id::text
  );

  return v_id;
end;
$function$;

create or replace function public.revogar_liberacao_sst(p_liberacao_id uuid, p_motivo text, p_perfil text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lib public.liberacao_sst%rowtype;
  v_f public.funcionario%rowtype;
  v_jwt_email text;
  v_perfil_real text;
  v_ator_email text;
begin
  -- identidade do token sobrepõe o perfil declarado
  v_jwt_email := public.current_user_email();
  if v_jwt_email is not null then
    v_ator_email := v_jwt_email;
    v_perfil_real := public.current_user_perfil();
    if v_perfil_real is null then
      raise exception 'Sem vínculo ativo nesta empresa';
    end if;
    p_perfil := v_perfil_real;
  elsif not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: login obrigatório' using errcode = '42501';
  end if;

  if p_perfil not in ('Admin', 'Admin Holding', 'Gestor') then
    raise exception 'Apenas Admin/Gestor pode revogar liberação (perfil: %)', p_perfil;
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Justificativa da revogação obrigatória (mín. 5 caracteres)';
  end if;

  select * into v_lib
    from public.liberacao_sst
    where id = p_liberacao_id and deleted_at is null
    for update;

  if v_lib.id is null then
    raise exception 'Liberação não encontrada ou já revogada';
  end if;

  perform public.exigir_empresa_do_chamador(v_lib.empresa_id, 'liberação');

  update public.liberacao_sst
     set deleted_at = now(),
         motivo = motivo || ' | REVOGADA: ' || p_motivo
   where id = p_liberacao_id;

  select * into v_f from public.funcionario where id = v_lib.funcionario_id;

  perform public.notificar_gestores(
    v_lib.empresa_id,
    array['Admin', 'Admin Holding', 'Gestor'],
    'Liberação SST revogada',
    'Liberação de ' || coalesce(v_f.nome_completo, 'funcionário') || ' revogada por ' ||
      coalesce(v_ator_email, 'gestor') || '. Motivo: ' || p_motivo ||
      '. O funcionário volta a ser bloqueado para campo se o ASO/NR estiver vencido.',
    '/SegurancaTrabalho',
    'Sistema',
    'Alta',
    'sst_revoga|' || p_liberacao_id::text
  );

  return p_liberacao_id;
end;
$function$;

-- Chamada pelo trigger trg_extrato_bancario_recalc_saldo (que roda como o
-- usuário), por isso segue executável por authenticated. O guard barra quem
-- grava extrato com conta_id de outra empresa (antes isso recalculava — e
-- contaminava — o saldo da conta alheia), e a soma só considera extrato da
-- própria empresa da conta.
create or replace function public.recalcular_saldo_conta(p_conta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid;
begin
  if p_conta_id is null then
    return;
  end if;

  select empresa_id into v_empresa
    from public.conta_financeira
    where id = p_conta_id;

  if not found then
    return;
  end if;

  perform public.exigir_empresa_do_chamador(v_empresa, 'conta');

  update public.conta_financeira c
    set saldo_atual = coalesce(c.saldo_inicial, 0) + coalesce((
      select sum(valor)
        from public.extrato_bancario e
        where e.conta_id = c.id
          and e.empresa_id = c.empresa_id
          and e.deleted_at is null
    ), 0),
    updated_at = now()
    where c.id = p_conta_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Painel do grupo: Admin Holding vê só as empresas do grupo dele
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public._consolidado_grupo_dados();

-- p_empresa_ids nulo = todas (super admin)
create or replace function public._consolidado_grupo_dados(p_empresa_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(linha order by linha->>'empresa_nome'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'empresa_nome', e.nome,
      'saldo_caixa', coalesce((
        select sum(c.saldo_atual) from public.conta_financeira c
        where c.empresa_id = e.id and c.deleted_at is null
          and coalesce(c.ativo, true) = true), 0),
      'receita_mes', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Receita'
          and lower(coalesce(t.status,'')) in ('pago','realizado','recebido')
          and date_trunc('month', coalesce(t.data_pagamento, t.data)) = date_trunc('month', current_date)), 0),
      'despesa_mes', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Despesa'
          and lower(coalesce(t.status,'')) in ('pago','realizado')
          and date_trunc('month', coalesce(t.data_pagamento, t.data)) = date_trunc('month', current_date)), 0),
      'a_receber', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Receita'
          and lower(coalesce(t.status,'')) not in ('pago','realizado','recebido','cancelado')), 0),
      'a_pagar', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Despesa'
          and lower(coalesce(t.status,'')) not in ('pago','realizado','cancelado')), 0),
      'a_pagar_atrasado', coalesce((
        select sum(t.valor) from public.transacao_financeira t
        where t.empresa_id = e.id and t.deleted_at is null and t.tipo = 'Despesa'
          and lower(coalesce(t.status,'')) not in ('pago','realizado','cancelado')
          and t.data_vencimento is not null and t.data_vencimento < current_date), 0)
    ) as linha
    from public.empresa e
    where e.deleted_at is null and coalesce(e.ativo, true) = true
      and (p_empresa_ids is null or e.id = any(p_empresa_ids))
  ) sub;
$function$;

revoke all on function public._consolidado_grupo_dados(uuid[]) from public, anon, authenticated;
grant execute on function public._consolidado_grupo_dados(uuid[]) to service_role;

create or replace function public.consolidado_grupo()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_ids uuid[];
begin
  if public.current_user_is_super_admin() then
    return public._consolidado_grupo_dados(null);
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Acesso restrito: sessão sem e-mail';
  end if;

  -- empresas do grupo de cada empresa onde o usuário é Admin Holding
  -- (empresa sem grupo = só ela mesma). empresa.grupo_id só o super admin altera.
  select array_agg(distinct e.id) into v_ids
    from public.usuario_empresa ue
    join public.empresa eh on eh.id = ue.empresa_id
    join public.empresa e
      on e.id = eh.id
      or (eh.grupo_id is not null and e.grupo_id = eh.grupo_id)
   where lower(ue.usuario_email) = v_email
     and ue.perfil = 'Admin Holding'
     and coalesce(ue.ativo, true) = true
     and ue.deleted_at is null;

  if v_ids is null then
    raise exception 'Acesso restrito ao painel do grupo (requer perfil Admin Holding)';
  end if;

  return public._consolidado_grupo_dados(v_ids);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Privilégios
-- ─────────────────────────────────────────────────────────────────────────

-- Só servidor: pg_cron (roda como postgres), chamadas internas de outras
-- funções SECURITY DEFINER (rodam como postgres) e triggers (o EXECUTE da
-- função de trigger não é checado ao disparar).
revoke all on function public.alertar_aso() from public, anon, authenticated;
revoke all on function public.alertar_crm() from public, anon, authenticated;
revoke all on function public.alertar_ferramental() from public, anon, authenticated;
revoke all on function public.alertar_projetos() from public, anon, authenticated;
revoke all on function public.alertar_solicitacoes_paradas() from public, anon, authenticated;
revoke all on function public.alertar_treinamentos() from public, anon, authenticated;
revoke all on function public.alertar_vencimentos() from public, anon, authenticated;
revoke all on function public.liberar_reservas_vencidas() from public, anon, authenticated;
revoke all on function public.limpar_notificacoes_auto_antigas() from public, anon, authenticated;
revoke all on function public.marcar_transacoes_atrasadas() from public, anon, authenticated;
revoke all on function public.processar_recorrencias_vencidas() from public, anon, authenticated;
revoke all on function public.notificar_gestores(uuid, text[], text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.criar_notificacao_dedup(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.destinatarios_alerta(uuid, text[]) from public, anon, authenticated;
revoke all on function public.fluxo_abrir_a_partir(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fluxo_abrir_proxima(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.fluxo_proxima_etapa_id(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.fluxo_notificar_papel(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.tg_estoque_alerta_minimo() from public, anon, authenticated;

grant execute on function public.alertar_aso() to service_role;
grant execute on function public.alertar_crm() to service_role;
grant execute on function public.alertar_ferramental() to service_role;
grant execute on function public.alertar_projetos() to service_role;
grant execute on function public.alertar_solicitacoes_paradas() to service_role;
grant execute on function public.alertar_treinamentos() to service_role;
grant execute on function public.alertar_vencimentos() to service_role;
grant execute on function public.liberar_reservas_vencidas() to service_role;
grant execute on function public.limpar_notificacoes_auto_antigas() to service_role;
grant execute on function public.marcar_transacoes_atrasadas() to service_role;
grant execute on function public.processar_recorrencias_vencidas() to service_role;
grant execute on function public.notificar_gestores(uuid, text[], text, text, text, text, text, text) to service_role;
grant execute on function public.criar_notificacao_dedup(uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function public.destinatarios_alerta(uuid, text[]) to service_role;
grant execute on function public.fluxo_abrir_a_partir(uuid, uuid) to service_role;
grant execute on function public.fluxo_abrir_proxima(uuid, uuid, integer) to service_role;
grant execute on function public.fluxo_proxima_etapa_id(uuid, uuid, integer) to service_role;
grant execute on function public.fluxo_notificar_papel(uuid, text, text, text, text) to service_role;
grant execute on function public.handle_new_auth_user() to service_role, supabase_auth_admin;
grant execute on function public.tg_estoque_alerta_minimo() to service_role;

-- App (usuário logado) + servidor; nunca anon.
revoke all on function public.conferir_recebimento_pedido(uuid, uuid, jsonb, text, date, text, text) from public, anon;
revoke all on function public.criar_transferencia_atomica(uuid, uuid, uuid, numeric, date, text, uuid) from public, anon;
revoke all on function public.faturar_medicao(uuid, date, text, text) from public, anon;
revoke all on function public.fluxo_instanciar(uuid, text, uuid, text, text) from public, anon;
revoke all on function public.fluxo_aprovar_etapa(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.fluxo_concluir_etapa(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.fluxo_reprovar_etapa(uuid, text, text, text, text) from public, anon;
revoke all on function public.funcionario_apto_campo(uuid) from public, anon;
revoke all on function public.liberar_sst(uuid, text, text, text, text, integer) from public, anon;
revoke all on function public.revogar_liberacao_sst(uuid, text, text) from public, anon;
revoke all on function public.recalcular_saldo_conta(uuid) from public, anon;
revoke all on function public.consolidado_grupo() from public, anon;
revoke all on function public.current_user_perfil() from public, anon;

grant execute on function public.conferir_recebimento_pedido(uuid, uuid, jsonb, text, date, text, text) to authenticated, service_role;
grant execute on function public.criar_transferencia_atomica(uuid, uuid, uuid, numeric, date, text, uuid) to authenticated, service_role;
grant execute on function public.faturar_medicao(uuid, date, text, text) to authenticated, service_role;
grant execute on function public.fluxo_instanciar(uuid, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.fluxo_aprovar_etapa(uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.fluxo_concluir_etapa(uuid, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.fluxo_reprovar_etapa(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.funcionario_apto_campo(uuid) to authenticated, service_role;
grant execute on function public.liberar_sst(uuid, text, text, text, text, integer) to authenticated, service_role;
grant execute on function public.revogar_liberacao_sst(uuid, text, text) to authenticated, service_role;
grant execute on function public.recalcular_saldo_conta(uuid) to authenticated, service_role;
grant execute on function public.consolidado_grupo() to authenticated, service_role;
grant execute on function public.current_user_perfil() to authenticated, service_role;

-- grupo_da_empresa_atual() fica como está: a policy empresa_mesmo_grupo vale
-- para o papel public (inclui anon) e a função só lê o próprio token.
