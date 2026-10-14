-- ============================================================================
-- 0155_habilitacao_lembretes.sql — lembretes de vencimento dos documentos de
-- habilitação (13/10/2026)
--   (spec docs/superpowers/specs/2026-10-09-habilitacao-documentos-automaticos-design.md §2,
--    "Rotina mensal"; decisão de 25/09: sino e WhatsApp para os usuários escolhidos)
--
-- Por quê: certidão vencida inabilita a empresa na licitação. Todo dia de manhã o banco
-- confere a biblioteca (acervo_documento) e avisa quem a empresa escolheu, N dias antes do
-- vencimento (padrão 10), 3 dias antes e no dia.
--
--   habilitacao_config          por empresa: dias de antecedência, quem recebe e se vai WhatsApp.
--   habilitacao_lembrete_fila   mensagens de WhatsApp a enviar (só o servidor lê e grava).
--   alertar_documentos_habilitacao()  cria o aviso no sino e enfileira o WhatsApp.
--   cron 11:45 UTC (08:45 de Brasília), depois dos outros alertas da manhã.
--
-- O WhatsApp sai pela função habilitacao-lembretes, que só esvazia a fila: quem decide o
-- que enviar é esta função do banco. Chamar a Edge Function de fora não envia nada além do
-- que já está na fila, e cada mensagem sai uma vez (dedup_key).
--
-- Só cria. Idempotente. Roda numa transação só (begin … commit): se qualquer comando falhar,
-- nada fica pela metade (nem o cron sem a função). lock_timeout: a chave estrangeira para
-- empresa pede trava nessa tabela; sem ela em 10 s, desfaz tudo e é só aplicar de novo.
-- ============================================================================

begin;
set local lock_timeout = '10s';

create table if not exists public.habilitacao_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  dias_antecedencia integer not null default 10 check (dias_antecedencia between 1 and 90),
  destinatarios jsonb not null default '[]'::jsonb check (jsonb_typeof(destinatarios) = 'array'),
  whatsapp boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists habilitacao_config_empresa_uidx
  on public.habilitacao_config (empresa_id) where deleted_at is null;
select attach_updated_at_trigger('habilitacao_config');

comment on table public.habilitacao_config is
  'Lembretes de vencimento dos documentos de habilitação: dias de antecedência, e-mails dos usuários que recebem (vazio = donos e Admins) e se o aviso vai também por WhatsApp.';

do $rls$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'habilitacao_config' and policyname = 'tenant_isolation'
  ) then
    perform public.apply_tenant_rls('habilitacao_config');
  end if;
end $rls$;

revoke all on table public.habilitacao_config from anon, authenticated;
grant select, insert, update on table public.habilitacao_config to authenticated;
grant all on table public.habilitacao_config to service_role;

drop policy if exists habilitacao_config_criar_com_permissao on public.habilitacao_config;
create policy habilitacao_config_criar_com_permissao on public.habilitacao_config
  as restrictive for insert to authenticated
  with check ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')));

drop policy if exists habilitacao_config_alterar_com_permissao on public.habilitacao_config;
create policy habilitacao_config_alterar_com_permissao on public.habilitacao_config
  as restrictive for update to authenticated
  using ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')))
  with check ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')));

-- Fila do WhatsApp: só servidor (RLS ligada, sem policy) -----------------------------------
create table if not exists public.habilitacao_lembrete_fila (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_email text not null,
  telefone text not null,
  texto text not null check (char_length(texto) between 1 and 1500),
  dedup_key text not null unique,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);
create index if not exists habilitacao_lembrete_fila_pendente_idx
  on public.habilitacao_lembrete_fila (criado_em) where enviado_em is null;

alter table public.habilitacao_lembrete_fila enable row level security;
revoke all on table public.habilitacao_lembrete_fila from anon, authenticated;
grant all on table public.habilitacao_lembrete_fila to service_role;

comment on table public.habilitacao_lembrete_fila is
  'Lembretes de habilitação a enviar por WhatsApp. Só o servidor lê e grava: a função alertar_documentos_habilitacao enfileira e a Edge Function habilitacao-lembretes envia.';

-- O alerta diário ---------------------------------------------------------------------------
create or replace function public.alertar_documentos_habilitacao()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_email text;
  v_tel text;
  v_titulo text;
  v_msg text;
  v_total int := 0;
  v_enfileirou boolean := false;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  for rec in
    with doc as (
      select d.empresa_id, d.nome, d.validade, (d.validade - v_hoje) as dias,
             coalesce(c.dias_antecedencia, 10) as n,
             coalesce(c.destinatarios, '[]'::jsonb) as destinatarios,
             coalesce(c.whatsapp, false) as whatsapp
        from public.acervo_documento d
        left join public.habilitacao_config c
          on c.empresa_id = d.empresa_id and c.deleted_at is null
       where d.deleted_at is null and d.ativo and d.validade is not null
    )
    select m.empresa_id,
           count(*) filter (where m.dias = 0) as vencem_hoje,
           count(*) filter (where m.dias > 0) as a_vencer,
           string_agg(left(m.nome, 60) || ' (' || to_char(m.validade, 'DD/MM') || ')', '; '
                      order by m.validade, m.nome) as lista,
           (select count(*) from doc v where v.empresa_id = m.empresa_id and v.dias < 0) as vencidos,
           (array_agg(m.destinatarios))[1] as destinatarios,
           bool_or(m.whatsapp) as whatsapp
      from doc m
     where m.dias in (m.n, 3, 0)          -- os marcos do aviso: N dias antes, 3 dias antes e no dia
     group by m.empresa_id
  loop
    v_titulo := 'Documentos de habilitação a vencer';
    v_msg := format('%s vence(m) hoje e %s nos próximos dias: %s.', rec.vencem_hoje, rec.a_vencer,
                    left(rec.lista, 600));
    if rec.vencidos > 0 then
      v_msg := v_msg || format(' Há também %s documento(s) já vencido(s).', rec.vencidos);
    end if;
    v_msg := v_msg || ' Atualize em Oportunidades → Acervo técnico → Documentos e certidões.';

    for v_email in
      -- os usuários escolhidos (ativos na empresa); sem nenhum válido, donos e Admins
      with escolhidos as (
        select distinct lower(u.usuario_email) as email
          from public.usuario_empresa u
         where u.empresa_id = rec.empresa_id and u.ativo = true and u.deleted_at is null
           and lower(u.usuario_email) in (
             select lower(x) from jsonb_array_elements_text(rec.destinatarios) as x
           )
      )
      select e.email from escolhidos e
      union all
      select lower(d) from public.destinatarios_alerta(rec.empresa_id, array['Admin Holding', 'Admin']) as d
       where not exists (select 1 from escolhidos)
    loop
      perform public.criar_notificacao_dedup(
        rec.empresa_id,
        v_email,
        v_titulo,
        v_msg,
        '/AcervoTecnico?aba=habilitacao',
        'Licitação',
        case when rec.vencem_hoje > 0 then 'Alta' else 'Normal' end,
        'habilitacao:' || rec.empresa_id::text || ':' || v_hoje::text || '|' || v_email
      );
      v_total := v_total + 1;

      if rec.whatsapp then
        select nullif(btrim(u.telefone), '') into v_tel
          from public.usuario_empresa u
         where u.empresa_id = rec.empresa_id and lower(u.usuario_email) = v_email
           and u.ativo = true and u.deleted_at is null
         order by u.created_at
         limit 1;
        if v_tel is not null then
          insert into public.habilitacao_lembrete_fila (empresa_id, usuario_email, telefone, texto, dedup_key)
          values (rec.empresa_id, v_email, v_tel, left('SIGO Obras — ' || v_titulo || E'\n' || v_msg, 1500),
                  'habilitacao_wa:' || rec.empresa_id::text || ':' || v_hoje::text || '|' || v_email)
          on conflict (dedup_key) do nothing;
          v_enfileirou := true;
        end if;
      end if;
    end loop;
  end loop;

  -- acorda a função que envia o WhatsApp; falha aqui não desfaz os avisos do sino
  if v_enfileirou then
    begin
      perform net.http_post(
        url := 'https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/habilitacao-lembretes',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    exception when others then
      raise warning 'alertar_documentos_habilitacao: não foi possível acionar o envio do WhatsApp (%)', sqlerrm;
    end;
  end if;

  return v_total;
end;
$$;

comment on function public.alertar_documentos_habilitacao() is
  'Aviso diário dos documentos de habilitação que vencem em N dias (config, padrão 10), em 3 dias ou hoje: sino para os usuários escolhidos (ou donos e Admins) e, se ligado, WhatsApp pela fila. 1 aviso por pessoa por dia.';

revoke all on function public.alertar_documentos_habilitacao() from public, anon, authenticated;
grant execute on function public.alertar_documentos_habilitacao() to service_role;

-- Agendamento (manhã de Brasília) -----------------------------------------------------------
do $$ begin perform cron.unschedule('alertar_documentos_habilitacao'); exception when others then null; end $$;
select cron.schedule('alertar_documentos_habilitacao', '45 11 * * *',
  $$ select public.alertar_documentos_habilitacao(); $$);

notify pgrst, 'reload schema';

commit;

-- Conferência (só leitura). Esperado: o job com '45 11 * * *' e active = true; 4 policies na
-- configuração (2 da empresa, permissivas, e 2 restritivas: INSERT e UPDATE); a função só para
-- o service_role (authenticated_executa = false) e a fila fechada para o authenticated.
select jobname, schedule, active from cron.job where jobname = 'alertar_documentos_habilitacao';
select policyname, permissive, cmd from pg_policies
 where schemaname = 'public' and tablename = 'habilitacao_config'
 order by policyname;
select has_function_privilege('authenticated', 'public.alertar_documentos_habilitacao()', 'execute') as authenticated_executa,
       has_function_privilege('service_role', 'public.alertar_documentos_habilitacao()', 'execute') as service_role_executa,
       has_table_privilege('authenticated', 'public.habilitacao_lembrete_fila', 'select') as authenticated_le_a_fila;

select 'ok' as res;
