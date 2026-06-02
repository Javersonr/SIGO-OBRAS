-- ============================================================================
-- 0036_automacao_infra.sql  — FUNDAÇÃO DE AUTOMAÇÃO
--
-- Habilita o agendador (pg_cron) e cria os helpers compartilhados por todos
-- os jobs automáticos das próximas migrations (0037+):
--
--   1. extensões pg_cron (agendamento) + pg_net (HTTP a partir do banco,
--      usado depois pra disparar Edge Function de email)
--   2. criar_notificacao_dedup() — insere em notificacao SÓ se ainda não
--      existe alerta com a mesma "chave de evento" (dedup_key). Evita
--      floodar o sino do usuário todo dia com o mesmo aviso.
--   3. destinatarios_alerta() — devolve os e-mails que devem receber um
--      alerta de uma empresa, por perfil (owners sempre incluídos).
--   4. notificar_gestores() — açúcar: monta 1 notificação dedupada pra cada
--      destinatário de uma vez.
--
-- IMPORTANTE — fuso: pg_cron roda em UTC. O Brasil é UTC-3, então os
-- horários agendados nas próximas migrations somam +3h (ex: 08:00 BRT = 11:00
-- UTC). Isso está documentado em cada cron.schedule().
--
-- IMPORTANTE — RLS: estas funções são SECURITY DEFINER e pertencem ao role
-- que aplica a migration (postgres, dono das tabelas), então enxergam todas
-- as empresas. Os jobs precisam disso pra varrer o banco inteiro.
-- ============================================================================

-- 1. Extensões -------------------------------------------------------------
-- Se o push falhar aqui, habilite pg_cron e pg_net no Dashboard do Supabase
-- (Database > Extensions) e rode a migration de novo.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Índice de dedup -------------------------------------------------------
-- Acelera a checagem "já existe alerta com esse dedup_key?".
create index if not exists notif_dedup_idx
  on public.notificacao (empresa_id, (dados_extra ->> 'dedup_key'))
  where dados_extra ? 'dedup_key' and deleted_at is null;

-- 3. criar_notificacao_dedup ----------------------------------------------
create or replace function public.criar_notificacao_dedup(
  p_empresa_id uuid,
  p_usuario_email text,
  p_titulo text,
  p_mensagem text,
  p_link text,
  p_tipo text,
  p_prioridade text,
  p_dedup_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_empresa_id is null or p_usuario_email is null or p_dedup_key is null then
    return null;
  end if;

  -- Já existe (lida ou não) um alerta vivo com a mesma chave? Não duplica.
  select id into v_id
    from public.notificacao
    where empresa_id = p_empresa_id
      and usuario_email = p_usuario_email
      and deleted_at is null
      and (dados_extra ->> 'dedup_key') = p_dedup_key
    limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.notificacao (
    empresa_id, usuario_email, titulo, mensagem, link, tipo, prioridade, dados_extra
  ) values (
    p_empresa_id, p_usuario_email, p_titulo, p_mensagem, p_link,
    p_tipo, coalesce(p_prioridade, 'Normal'),
    jsonb_build_object('dedup_key', p_dedup_key, 'auto', true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.criar_notificacao_dedup is
  'Insere notificacao só se não houver outra viva com o mesmo dedup_key (alerta 1x por evento).';

-- 4. destinatarios_alerta --------------------------------------------------
-- Devolve e-mails de quem deve receber um alerta da empresa.
-- Owners entram sempre; demais perfis vêm da lista p_perfis.
-- Se ninguém casar, cai pra qualquer usuário ativo da empresa (não deixa
-- o alerta no vácuo).
create or replace function public.destinatarios_alerta(
  p_empresa_id uuid,
  p_perfis text[]
)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.usuario_empresa
    where empresa_id = p_empresa_id
      and ativo = true
      and deleted_at is null
      and (is_owner = true or perfil = any(p_perfis));

  if v_count > 0 then
    return query
      select distinct usuario_email
        from public.usuario_empresa
        where empresa_id = p_empresa_id
          and ativo = true
          and deleted_at is null
          and (is_owner = true or perfil = any(p_perfis));
  else
    return query
      select distinct usuario_email
        from public.usuario_empresa
        where empresa_id = p_empresa_id
          and ativo = true
          and deleted_at is null;
  end if;
end;
$$;

comment on function public.destinatarios_alerta is
  'E-mails que recebem um alerta da empresa: owners + perfis informados (fallback: todos ativos).';

-- 5. notificar_gestores ----------------------------------------------------
-- Cria 1 notificação dedupada pra cada destinatário. dedup_key recebe sufixo
-- por e-mail internamente pra não colidir entre usuários.
create or replace function public.notificar_gestores(
  p_empresa_id uuid,
  p_perfis text[],
  p_titulo text,
  p_mensagem text,
  p_link text,
  p_tipo text,
  p_prioridade text,
  p_dedup_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_total int := 0;
  v_id uuid;
begin
  for v_email in select public.destinatarios_alerta(p_empresa_id, p_perfis) loop
    v_id := public.criar_notificacao_dedup(
      p_empresa_id, v_email, p_titulo, p_mensagem, p_link, p_tipo, p_prioridade,
      p_dedup_key || '|' || v_email
    );
    if v_id is not null then
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

comment on function public.notificar_gestores is
  'Dispara notificação dedupada pra cada destinatário (owners + perfis) de uma empresa.';

-- 6. Limpeza de notificações automáticas antigas ---------------------------
-- Mantém o sino enxuto: apaga (soft) alertas auto lidos com mais de 90 dias.
create or replace function public.limpar_notificacoes_auto_antigas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.notificacao
    set deleted_at = now()
    where deleted_at is null
      and (dados_extra ->> 'auto') = 'true'
      and lida = true
      and created_at < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Agenda a limpeza: todo dia 05:00 UTC (02:00 BRT)
do $$
begin
  perform cron.unschedule('limpar_notificacoes_auto');
exception when others then null;
end $$;
select cron.schedule('limpar_notificacoes_auto', '0 5 * * *',
  $$ select public.limpar_notificacoes_auto_antigas(); $$);
