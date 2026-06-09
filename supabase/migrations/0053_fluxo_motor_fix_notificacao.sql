-- ============================================================================
-- 0053_fluxo_motor_fix_notificacao.sql — corrige inserts de notificação do motor
--
-- A 0052 copiou os nomes de coluna do motor de Compras (0028), que estão ERRADOS
-- para a tabela real public.notificacao (0013):
--   descricao    → na verdade é "mensagem"
--   link_destino → na verdade é "link"
--   tipo='Fluxo' → não estava na lista do CHECK notificacao_tipo_check
--
-- (Observação: o 0028 tem o mesmo bug latente — plpgsql não valida colunas na
--  criação da função, só em runtime. Fora do escopo aqui; tratado à parte.)
--
-- Forward-only: a 0052 já está aplicada, então corrigimos por create-or-replace
-- das 2 funções que escrevem em notificacao + ampliamos o CHECK de tipo.
-- Aditivo/não-destrutivo.
-- ============================================================================

-- 1. Inclui 'Fluxo' nos tipos de notificação permitidos -----------------------
alter table public.notificacao drop constraint if exists notificacao_tipo_check;
alter table public.notificacao add constraint notificacao_tipo_check
  check (tipo in (
    'Cotação', 'Projeto', 'Compra', 'Financeiro', 'Estoque',
    'Sistema', 'Inspeção', 'Manutenção', 'Fluxo'
  ));

-- 2. fluxo_notificar_papel — colunas corretas (mensagem/link/tipo) ------------
create or replace function public.fluxo_notificar_papel(
  p_empresa_id uuid,
  p_papel text,
  p_titulo text,
  p_descricao text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_papel is null or length(trim(p_papel)) = 0 then
    return;  -- etapa sem papel definido = ninguém específico a notificar
  end if;

  insert into public.notificacao (
    empresa_id, usuario_email, titulo, mensagem, tipo, prioridade, lida, link
  )
  select p_empresa_id, ue.usuario_email, p_titulo, p_descricao, 'Fluxo', 'Normal', false, p_link
    from public.usuario_empresa ue
    where ue.empresa_id = p_empresa_id
      and ue.ativo = true
      and ue.deleted_at is null
      and (ue.perfil = p_papel or ue.perfil = 'Admin');
end;
$$;

-- 3. fluxo_reprovar_etapa — corrige o insert direto em notificacao ------------
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
begin
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

  -- notifica o executor diretamente (por e-mail) com o motivo
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
