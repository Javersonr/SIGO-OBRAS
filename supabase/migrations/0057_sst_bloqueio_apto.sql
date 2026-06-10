-- ============================================================================
-- 0057_sst_bloqueio_apto.sql — bloqueio operacional por ASO vencido (SST)
--
-- Regra do dono: funcionário com ASO vencido NÃO pode receber ferramenta /
-- ir a campo — mas um Admin/Gestor pode LIBERAR excepcionalmente, com
-- justificativa registrada e prazo de validade.
--
-- Esta migration entrega o BACKEND (fonte da verdade):
--   - liberacao_sst        : registro de liberação excepcional (auditável)
--   - funcionario_apto_campo: RPC que diz se o funcionário está apto + por quê
--   - liberar_sst           : RPC que cria a liberação (só Admin/Gestor)
--
-- O bloqueio é aplicado na tela de entrega (frontend consulta apto). A matriz
-- de treinamento (NR-10/NR-35) fica para a fase 2 — a conclusão por funcionário
-- hoje está em jsonb (funcionario.treinamentos_anexos), sem dado estruturado
-- confiável para travar. Aditivo/não-destrutivo.
-- ============================================================================

-- 1. Tabela de liberação excepcional -----------------------------------------
create table if not exists public.liberacao_sst (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  motivo text not null,
  liberado_por_email text,
  liberado_por_nome text,
  valido_ate date not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index liberacao_sst_func_idx
  on public.liberacao_sst(funcionario_id, valido_ate)
  where deleted_at is null;
create index liberacao_sst_empresa_idx on public.liberacao_sst(empresa_id);
select apply_tenant_rls('liberacao_sst');

-- 2. funcionario_apto_campo — fonte da verdade do "pode ir a campo?" ----------
-- Retorna jsonb:
--   { apto: bool, motivos: text[], aso_vencimento: date,
--     liberado_excepcionalmente: bool, liberacao: {...}|null }
create or replace function public.funcionario_apto_campo(p_funcionario_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if public.current_empresa_id() is not null
     and v_f.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: funcionário de outra empresa';
  end if;

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
$$;

-- 3. liberar_sst — cria a liberação excepcional (só Admin/Gestor) -------------
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
begin
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

-- 4. Permissões — só authenticated (sem anon) --------------------------------
revoke all on function public.funcionario_apto_campo(uuid) from public;
revoke all on function public.liberar_sst(uuid, text, text, text, text, integer) from public;
grant execute on function public.funcionario_apto_campo(uuid) to authenticated;
grant execute on function public.liberar_sst(uuid, text, text, text, text, integer) to authenticated;
