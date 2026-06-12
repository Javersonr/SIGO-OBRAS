-- ============================================================================
-- 0071_sst_liberacao_notifica_revoga.sql — fecha o loop da liberação SST
--
-- Hoje: liberar_sst (0057/0061) cria a liberação excepcional mas NINGUÉM é
-- avisado e não há como REVOGAR (se a liberação foi indevida, fica valendo até
-- vencer). Para compliance (decisão nº 1 do dono: ASO/NR vencido bloqueia, mas
-- Admin/Gestor libera) isso precisa ser auditável e reversível.
--
-- Entrega:
--   1) liberar_sst: ao liberar, NOTIFICA os gestores (Admin/Admin Holding/Gestor)
--      — trilha de auditoria visível no sino. Corpo idêntico ao da 0061 + o
--      disparo. (funcionario usa nome_completo, não "nome".)
--   2) revogar_liberacao_sst(): Admin/Gestor revoga (soft-delete) uma liberação
--      ativa, com justificativa, identidade via token; volta a bloquear o campo
--      (funcionario_apto_campo deixa de ver liberação ativa) e notifica gestores.
-- Aditivo/não-destrutivo.
-- ============================================================================

-- 1. liberar_sst + notificação ------------------------------------------------
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
$$;

-- 2. revogar_liberacao_sst ----------------------------------------------------
create or replace function public.revogar_liberacao_sst(
  p_liberacao_id uuid,
  p_motivo text,
  p_perfil text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  if public.current_empresa_id() is not null
     and v_lib.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: liberação de outra empresa';
  end if;

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
$$;

revoke all on function public.revogar_liberacao_sst(uuid, text, text) from public;
grant execute on function public.revogar_liberacao_sst(uuid, text, text) to authenticated;
