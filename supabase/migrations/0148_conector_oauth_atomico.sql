-- ============================================================================
-- 0148_conector_oauth_atomico.sql — OAuth do conector do Claude em transações
-- (Plano 2 do conector, Task 3; obrigatórios T8 M1/M2 e FINAL M5 do Plano 1)
--
-- Por quê:
--   * M1 — a troca do código marcava o código como usado e SÓ DEPOIS gravava as
--     chaves. Uma falha no INSERT das chaves deixava o código queimado; a nova
--     tentativa do Claude parecia "código reutilizado" e derrubava a autorização.
--   * M2 — a aprovação gravava a autorização e depois o código em dois INSERTs.
--     Uma falha no segundo deixava uma autorização órfã ("Apps conectados" sem
--     chave). O mesmo valia para a chave manual.
--   * FINAL M5 — o registro de clientes (DCR) é aberto: sem limpeza, as tabelas
--     só crescem. A limpeza diária apaga códigos e chaves vencidos, revoga as
--     autorizações OAuth que nunca receberam chave e apaga clientes sem uso.
--
-- Agora cada passo do OAuth é UMA função (uma transação):
--   conector_aprovar        autorização (oauth) + código
--   conector_criar_manual   autorização (manual) + chave manual
--   conector_trocar_codigo  consome o código + emite acesso e renovação
--   conector_renovar        marca a renovação como substituída + emite o par novo
--   conector_limpeza        a limpeza diária (cron 07:15 UTC = 04:15 BRT)
-- Todas são só do servidor (service role / pg_cron), como a 0110.
--
-- Ordem: aplicar ANTES do deploy do mcp-oauth novo. O código atual não usa
-- estas funções, então aplicar antes é seguro. Idempotente.
-- ============================================================================

-- T7 (menores do Plano 1): a revogação por família (detecção de reuso) filtra por familia
create index if not exists conector_chave_familia_idx on public.conector_chave (familia);

-- ─── Aprovação: autorização OAuth + código, juntos ──────────────────────────
create or replace function public.conector_aprovar(
  p_empresa_id uuid,
  p_usuario_custom_id uuid,
  p_usuario_email text,
  p_cliente_id uuid,
  p_resource text,
  p_escopo text,
  p_codigo_hash text,
  p_redirect_uri text,
  p_code_challenge text,
  p_codigo_expira_em timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aut uuid;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  insert into public.conector_autorizacao
    (empresa_id, usuario_custom_id, usuario_email, cliente_id, tipo, resource, escopo)
  values
    (p_empresa_id, p_usuario_custom_id, p_usuario_email, p_cliente_id, 'oauth', p_resource,
     coalesce(p_escopo, 'conector'))
  returning id into v_aut;
  insert into public.conector_codigo
    (codigo_hash, autorizacao_id, cliente_id, redirect_uri, code_challenge, resource, expira_em)
  values
    (p_codigo_hash, v_aut, p_cliente_id, p_redirect_uri, p_code_challenge, p_resource,
     p_codigo_expira_em);
  return v_aut;
end;
$$;

-- ─── Chave manual (Claude Code): autorização + chave, juntas ────────────────
create or replace function public.conector_criar_manual(
  p_empresa_id uuid,
  p_usuario_custom_id uuid,
  p_usuario_email text,
  p_resource text,
  p_escopo text,
  p_chave_hash text,
  p_familia uuid,
  p_expira_em timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aut uuid;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  insert into public.conector_autorizacao
    (empresa_id, usuario_custom_id, usuario_email, cliente_id, tipo, resource, escopo)
  values
    (p_empresa_id, p_usuario_custom_id, p_usuario_email, null, 'manual', p_resource,
     coalesce(p_escopo, 'conector'))
  returning id into v_aut;
  insert into public.conector_chave (chave_hash, autorizacao_id, tipo, familia, expira_em)
  values (p_chave_hash, v_aut, 'manual', p_familia, p_expira_em);
  return v_aut;
end;
$$;

-- ─── Troca do código: consome e emite as duas chaves na mesma transação ─────
-- O mcp-oauth confere cliente, redirect_uri, PKCE, resource e autorização ANTES
-- de chamar (e queima o código se algo não bate). Aqui só o consumo atômico.
create or replace function public.conector_trocar_codigo(
  p_codigo_hash text,
  p_acesso_hash text,
  p_acesso_expira timestamptz,
  p_renovacao_hash text,
  p_renovacao_expira timestamptz,
  p_familia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aut uuid;
  v_cli uuid;
  v_usado uuid;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.conector_codigo
     set usado_em = now()
   where codigo_hash = p_codigo_hash and usado_em is null and expira_em > now()
  returning autorizacao_id, cliente_id into v_aut, v_cli;
  if v_aut is null then
    select autorizacao_id into v_usado
      from public.conector_codigo
     where codigo_hash = p_codigo_hash and usado_em is not null;
    if v_usado is not null then
      return jsonb_build_object('ok', false, 'motivo', 'reutilizado', 'autorizacao_id', v_usado);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;
  insert into public.conector_chave (chave_hash, autorizacao_id, tipo, familia, expira_em)
  values
    (p_acesso_hash, v_aut, 'acesso', p_familia, p_acesso_expira),
    (p_renovacao_hash, v_aut, 'renovacao', p_familia, p_renovacao_expira);
  update public.conector_autorizacao set ultimo_uso = now() where id = v_aut;
  update public.conector_cliente set ultimo_uso = now() where id = v_cli;
  return jsonb_build_object('ok', true, 'autorizacao_id', v_aut);
end;
$$;

-- ─── Renovação: marca a velha e emite o par novo na mesma transação ────────
create or replace function public.conector_renovar(
  p_chave_hash text,
  p_acesso_hash text,
  p_acesso_expira timestamptz,
  p_renovacao_hash text,
  p_renovacao_expira timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aut uuid;
  v_familia uuid;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.conector_chave
     set substituida_em = now()
   where chave_hash = p_chave_hash
     and tipo = 'renovacao'
     and substituida_em is null
     and revogada_em is null
     and expira_em > now()
  returning autorizacao_id, familia into v_aut, v_familia;
  if v_aut is null then
    -- outra renovação com a mesma chave chegou antes (ou ela venceu/foi revogada agora)
    return jsonb_build_object('ok', false, 'motivo', 'corrida');
  end if;
  insert into public.conector_chave (chave_hash, autorizacao_id, tipo, familia, expira_em)
  values
    (p_acesso_hash, v_aut, 'acesso', v_familia, p_acesso_expira),
    (p_renovacao_hash, v_aut, 'renovacao', v_familia, p_renovacao_expira);
  update public.conector_autorizacao set ultimo_uso = now() where id = v_aut;
  return jsonb_build_object('ok', true, 'autorizacao_id', v_aut, 'familia', v_familia);
end;
$$;

-- ─── Limpeza diária do DCR e das credenciais vencidas ──────────────────────
create or replace function public.conector_limpeza()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigos integer;
  v_chaves integer;
  v_autorizacoes integer;
  v_clientes_novos integer;
  v_clientes_parados integer;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  delete from public.conector_codigo where expira_em < now() - interval '1 day';
  get diagnostics v_codigos = row_count;

  delete from public.conector_chave where expira_em < now() - interval '1 day';
  get diagnostics v_chaves = row_count;

  -- aprovação abandonada (código nunca trocado) ou credenciais todas vencidas
  update public.conector_autorizacao a
     set revogado_em = now(), revogado_motivo = 'sem_chave'
   where a.tipo = 'oauth'
     and a.revogado_em is null
     and a.criado_em < now() - interval '1 day'
     and not exists (select 1 from public.conector_chave c where c.autorizacao_id = a.id);
  get diagnostics v_autorizacoes = row_count;

  -- registrado e nunca usado há mais de 1 dia
  delete from public.conector_cliente cl
   where cl.ultimo_uso is null
     and cl.criado_em < now() - interval '1 day'
     and not exists (select 1 from public.conector_autorizacao a where a.cliente_id = cl.id);
  get diagnostics v_clientes_novos = row_count;

  -- parado há 180 dias e sem nenhuma autorização viva
  delete from public.conector_cliente cl
   where cl.ultimo_uso < now() - interval '180 days'
     and not exists (
       select 1 from public.conector_autorizacao a
        where a.cliente_id = cl.id and a.revogado_em is null
     );
  get diagnostics v_clientes_parados = row_count;

  return jsonb_build_object(
    'codigos', v_codigos,
    'chaves', v_chaves,
    'autorizacoes_sem_chave', v_autorizacoes,
    'clientes_sem_uso', v_clientes_novos,
    'clientes_parados', v_clientes_parados
  );
end;
$$;

-- ─── Privilégios: só servidor (service role; pg_cron roda como postgres) ────
revoke all on function public.conector_aprovar(uuid, uuid, text, uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.conector_criar_manual(uuid, uuid, text, text, text, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.conector_trocar_codigo(text, text, timestamptz, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.conector_renovar(text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.conector_limpeza() from public, anon, authenticated;
grant execute on function public.conector_aprovar(uuid, uuid, text, uuid, text, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.conector_criar_manual(uuid, uuid, text, text, text, text, uuid, timestamptz)
  to service_role;
grant execute on function public.conector_trocar_codigo(text, text, timestamptz, text, timestamptz, uuid)
  to service_role;
grant execute on function public.conector_renovar(text, text, timestamptz, text, timestamptz)
  to service_role;
grant execute on function public.conector_limpeza() to service_role;

-- ─── Agendamento: 07:15 UTC = 04:15 BRT (padrão da 0111) ───────────────────
do $$ begin perform cron.unschedule('conector_limpeza'); exception when others then null; end $$;
select cron.schedule('conector_limpeza', '15 7 * * *', $$ select public.conector_limpeza(); $$);

-- ─── Conferência ───────────────────────────────────────────────────────────
select 'funções do OAuth atômico (esperado 5)' as item,
       count(*)::text as valor
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('conector_aprovar', 'conector_criar_manual', 'conector_trocar_codigo',
                   'conector_renovar', 'conector_limpeza')
union all
select 'cron conector_limpeza', schedule || ' | ' || command
  from cron.job
 where jobname = 'conector_limpeza'
union all
select 'índice conector_chave_familia_idx', count(*)::text
  from pg_indexes
 where schemaname = 'public' and indexname = 'conector_chave_familia_idx';

select 'ok' as res;
