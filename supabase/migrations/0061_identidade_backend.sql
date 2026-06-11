-- ============================================================================
-- 0061_identidade_backend.sql — RPCs param de confiar no perfil do cliente
--
-- PROBLEMA: liberar_sst e fluxo_concluir/aprovar/reprovar recebem email/perfil
-- como PARÂMETRO. Um usuário logado podia se declarar 'Admin' na chamada e
-- burlar as regras (anti-auto-aprovação, papel aprovador, liberação SST).
--
-- FIX: identidade derivada DO TOKEN no banco:
--   - current_user_email():  e-mail do JWT
--   - current_user_perfil(): perfil REAL em usuario_empresa (e-mail do JWT +
--     empresa do JWT, vínculo ativo)
-- Nas 4 RPCs: se há JWT, os parâmetros de email/perfil são SOBRESCRITOS pelos
-- valores reais (e sem vínculo ativo → erro). Sem JWT (smoke/serviço), os
-- parâmetros seguem valendo — compatibilidade preservada.
--
-- Compras (0028) entra na próxima onda com o mesmo padrão.
-- ============================================================================

-- 1. Helpers de identidade -----------------------------------------------------
create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
$$;

create or replace function public.current_user_perfil()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ue.perfil
    from public.usuario_empresa ue
    where lower(ue.usuario_email) = public.current_user_email()
      and ue.empresa_id = public.current_empresa_id()
      and coalesce(ue.ativo, true) = true
      and ue.deleted_at is null
    limit 1;
$$;

revoke all on function public.current_user_email() from public;
revoke all on function public.current_user_perfil() from public;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.current_user_perfil() to authenticated;

-- 2. liberar_sst — perfil real do token ----------------------------------------
create or replace function public.liberar_sst(
  p_funcionario_id uuid,
  p_motivo text,
  p_liberado_por_email text,
  p_liberado_por_nome text,
  p_perfil text,
  p_dias_validade integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.funcionario%rowtype;
  v_id uuid;
  v_jwt_email text;
  v_perfil_real text;
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

  if public.current_empresa_id() is not null
     and v_f.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: funcionário de outra empresa';
  end if;

  insert into public.liberacao_sst (
    empresa_id, funcionario_id, motivo,
    liberado_por_email, liberado_por_nome, valido_ate
  ) values (
    v_f.empresa_id, p_funcionario_id, p_motivo,
    p_liberado_por_email, p_liberado_por_nome,
    current_date + greatest(coalesce(p_dias_validade, 30), 1)
  ) returning id into v_id;

  return v_id;
end;
$$;

-- 3. fluxo_concluir_etapa — executor real do token ------------------------------
create or replace function public.fluxo_concluir_etapa(
  p_etapa_id uuid,
  p_executor_email text,
  p_executor_nome text,
  p_executor_perfil text default null,
  p_checklist_estado jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  end if;

  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_e.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: etapa de outra empresa';
  end if;

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
$$;

-- 4. fluxo_aprovar_etapa — aprovador real do token ------------------------------
create or replace function public.fluxo_aprovar_etapa(
  p_etapa_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_comentario text default null,
  p_opcao_escolhida text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.fluxo_etapa_instancia%rowtype;
  v_destino integer;
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
  end if;

  select * into v_e
    from public.fluxo_etapa_instancia
    where id = p_etapa_id and deleted_at is null
    for update;

  if v_e.id is null then
    raise exception 'Etapa não encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_e.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: etapa de outra empresa';
  end if;

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
$$;

-- 5. fluxo_reprovar_etapa — aprovador real do token -----------------------------
create or replace function public.fluxo_reprovar_etapa(
  p_etapa_id uuid,
  p_aprovador_email text,
  p_aprovador_nome text,
  p_aprovador_perfil text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if public.current_empresa_id() is not null
     and v_e.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: etapa de outra empresa';
  end if;

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
$$;
