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
--   habilitacao_config          por empresa: dias de antecedência, quem recebe (até 200 e-mails) e
--                               se vai WhatsApp. Ler exige Oportunidades → Lista; gravar exige
--                               Oportunidades → Lista → editar (como a biblioteca, 0154).
--   habilitacao_lembrete_fila   mensagens de WhatsApp a enviar (só o servidor lê e grava), com a
--                               reserva de quem está enviando (reivindicado_em).
--   habilitacao_usuarios_da_empresa()  RPC da tela (cartão "Quem recebe"): os usuários ativos da
--                               empresa do token, com o nome e SE têm telefone (o telefone não sai).
--                               A RLS de usuario_empresa só deixa o usuário comum ler os próprios
--                               vínculos (0115); sem a RPC ele só veria a si mesmo. Exige
--                               Oportunidades → Lista → editar.
--   habilitacao_lembretes_acionar()    só servidor: se há mensagem pendente na fila, chama a função
--                               habilitacao-lembretes (pg_net).
--   alertar_documentos_habilitacao()   só servidor: cria o aviso no sino, enfileira o WhatsApp e
--                               aciona o envio. O erro de uma empresa não derruba o aviso das outras.
--   cron alertar_documentos_habilitacao  11:45 UTC (08:45 de Brasília), depois dos outros alertas
--                               da manhã.
--   cron habilitacao_lembretes_reenvio   a cada 30 minutos: só aciona o envio quando sobrou
--                               mensagem pendente (falha de envio, canal fora do ar). Sem ele, a
--                               mensagem que falhou só seria tentada de novo no dia seguinte.
--
-- O WhatsApp sai pela função habilitacao-lembretes, que só esvazia a fila: quem decide o
-- que enviar é a função do banco. Chamar a Edge Function de fora não envia nada além do que já
-- está na fila, e cada mensagem sai uma vez (dedup_key; até 3 tentativas em 36 horas). O texto
-- começa com "SIGO Obras — <nome da empresa>": quem trabalha em mais de uma empresa sabe de qual
-- é o aviso.
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
  dias_antecedencia integer not null default 10,
  destinatarios jsonb not null default '[]'::jsonb,
  whatsapp boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint habilitacao_config_dias_antecedencia_check check (dias_antecedencia between 1 and 90)
);
create unique index if not exists habilitacao_config_empresa_uidx
  on public.habilitacao_config (empresa_id) where deleted_at is null;
select attach_updated_at_trigger('habilitacao_config');

-- destinatários: uma lista de até 200 e-mails. O CASE garante que jsonb_array_length (que lança se o
-- valor não for lista) só é avaliado quando é lista. Fica fora do create table, com nome fixo, para
-- valer também se a tabela já existir de uma aplicação anterior desta migração.
alter table public.habilitacao_config
  drop constraint if exists habilitacao_config_destinatarios_check;
alter table public.habilitacao_config
  add constraint habilitacao_config_destinatarios_check check (
    case
      when jsonb_typeof(destinatarios) = 'array' then jsonb_array_length(destinatarios) <= 200
      else false
    end
  );

comment on table public.habilitacao_config is
  'Lembretes de vencimento dos documentos de habilitação: dias de antecedência, e-mails dos usuários que recebem (vazio = donos e Admins; até 200) e se o aviso vai também por WhatsApp.';

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

-- Permissão da tela, conferida no banco (somada à policy da empresa), como na 0154: a lista de
-- quem recebe o lembrete só aparece para quem vê a tela.
drop policy if exists habilitacao_config_ler_com_permissao on public.habilitacao_config;
create policy habilitacao_config_ler_com_permissao on public.habilitacao_config
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Oportunidades', 'Lista')));

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
  erro text,
  reivindicado_em timestamptz
);
-- se a tabela já existir de uma aplicação anterior desta migração (sem a reserva)
alter table public.habilitacao_lembrete_fila add column if not exists reivindicado_em timestamptz;
create index if not exists habilitacao_lembrete_fila_pendente_idx
  on public.habilitacao_lembrete_fila (criado_em) where enviado_em is null;

alter table public.habilitacao_lembrete_fila enable row level security;
revoke all on table public.habilitacao_lembrete_fila from anon, authenticated;
grant all on table public.habilitacao_lembrete_fila to service_role;

comment on table public.habilitacao_lembrete_fila is
  'Lembretes de habilitação a enviar por WhatsApp. Só o servidor lê e grava: a função alertar_documentos_habilitacao enfileira e a Edge Function habilitacao-lembretes envia.';
comment on column public.habilitacao_lembrete_fila.reivindicado_em is
  'Reserva de quem está enviando: enquanto ela tem menos de 10 minutos, outra execução da função habilitacao-lembretes não pega a mensagem (não sai duas vezes). Volta a nulo quando o envio termina, com sucesso ou com erro.';

-- Quem pode ser escolhido no cartão "Quem recebe" -------------------------------------------
-- SECURITY DEFINER: a RLS de usuario_empresa só deixa o usuário comum ler os próprios vínculos
-- (0115). A empresa vem SÓ do token; devolve o mínimo (e-mail, nome e se há telefone).
create or replace function public.habilitacao_usuarios_da_empresa()
returns table (usuario_email text, nome text, tem_telefone boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if v_empresa is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if public.tem_permissao('Oportunidades', 'Lista', 'editar') is not true then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  -- um e-mail pode ter mais de um vínculo vivo na empresa (o unique caiu na 0023): uma linha por
  -- e-mail, com o nome do vínculo mais antigo que tem nome e "tem telefone" se algum deles tiver
  return query
    select v.email, v.nome_exibido, v.com_telefone
      from (
        select lower(u.usuario_email) as email,
               coalesce(
                 (array_agg(nullif(btrim(u.nome_completo), '') order by u.created_at, u.id)
                    filter (where nullif(btrim(u.nome_completo), '') is not null))[1],
                 lower(u.usuario_email)
               ) as nome_exibido,
               bool_or(nullif(btrim(u.telefone), '') is not null) as com_telefone
          from public.usuario_empresa u
         where u.empresa_id = v_empresa
           and u.ativo = true
           and u.deleted_at is null
         group by lower(u.usuario_email)
      ) v
     order by lower(v.nome_exibido), v.email;
end;
$$;

comment on function public.habilitacao_usuarios_da_empresa() is
  'Cartão "Quem recebe" dos lembretes de habilitação: os usuários ativos da empresa do token (e-mail em minúsculas, nome e se têm telefone; o telefone não sai), sem repetir e-mail, por nome. Exige Oportunidades → Lista → editar.';

revoke all on function public.habilitacao_usuarios_da_empresa() from public, anon, authenticated;
grant execute on function public.habilitacao_usuarios_da_empresa() to authenticated, service_role;

-- Aciona o envio do WhatsApp quando há mensagem pendente ------------------------------------
-- Pendente = não enviada, com menos de 3 tentativas e criada nas últimas 36 horas (os mesmos
-- limites da função habilitacao-lembretes: MAX_TENTATIVAS e VALIDADE_DA_FILA_HORAS). Sem chave no
-- cabeçalho: a função não aceita entrada e só esvazia a fila. O pedido do pg_net só sai quando a
-- transação de quem chamou é confirmada.
create or replace function public.habilitacao_lembretes_acionar()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.habilitacao_lembrete_fila f
     where f.enviado_em is null
       and f.tentativas < 3
       and f.criado_em > now() - interval '36 hours'
  ) then
    return false;
  end if;

  begin
    perform net.http_post(
      url := 'https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/habilitacao-lembretes',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  exception when others then
    raise warning 'habilitacao_lembretes_acionar: não foi possível acionar o envio do WhatsApp (%)', sqlerrm;
  end;

  return true;
end;
$$;

comment on function public.habilitacao_lembretes_acionar() is
  'Lembretes de habilitação por WhatsApp: se há mensagem pendente na fila (não enviada, menos de 3 tentativas, últimas 36 horas), chama a Edge Function habilitacao-lembretes e devolve true; senão false. Chamada pelo alerta diário e pelo job de reenvio (a cada 30 minutos).';

revoke all on function public.habilitacao_lembretes_acionar() from public, anon, authenticated;
grant execute on function public.habilitacao_lembretes_acionar() to service_role;

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
  v_titulo constant text := 'Documentos de habilitação a vencer';
  v_email text;
  v_tel text;
  v_msg text;
  v_chave text;
  v_ja_avisado boolean;
  v_id uuid;
  v_criados int;
  v_total int := 0;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  for rec in
    with doc as (
      -- só empresa viva e ativa (empresa.ativo aceita nulo: nulo conta como ativa, como na 0110)
      select d.empresa_id, d.nome, d.validade, (d.validade - v_hoje) as dias,
             left(coalesce(nullif(btrim(e.nome_fantasia), ''), e.nome), 80) as empresa_nome,
             coalesce(c.dias_antecedencia, 10) as n,
             coalesce(c.destinatarios, '[]'::jsonb) as destinatarios,
             coalesce(c.whatsapp, false) as whatsapp
        from public.acervo_documento d
        join public.empresa e
          on e.id = d.empresa_id and e.deleted_at is null and coalesce(e.ativo, true)
        left join public.habilitacao_config c
          on c.empresa_id = d.empresa_id and c.deleted_at is null
       where d.deleted_at is null and d.ativo and d.validade is not null
    )
    select m.empresa_id,
           min(m.empresa_nome) as empresa_nome,
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
    -- uma empresa por bloco: se o aviso dela falhar, só o dela é desfeito, e as outras recebem
    begin
      v_criados := 0;

      -- só entra na frase o que existe (nada de "0 vencem hoje"); todo documento do grupo vence
      -- hoje (dias = 0) ou nos próximos dias (dias = N ou 3), então pelo menos uma parte existe
      if rec.vencem_hoje > 0 and rec.a_vencer > 0 then
        v_msg := format('%s documento(s) vencem hoje e %s vencem nos próximos dias',
                        rec.vencem_hoje, rec.a_vencer);
      elsif rec.vencem_hoje > 0 then
        v_msg := format('%s documento(s) vencem hoje', rec.vencem_hoje);
      else
        v_msg := format('%s documento(s) vencem nos próximos dias', rec.a_vencer);
      end if;
      v_msg := v_msg || ': ' || left(rec.lista, 600) || '.';
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
        select distinct lower(d)
          from public.destinatarios_alerta(rec.empresa_id, array['Admin Holding', 'Admin']) as d
         where not exists (select 1 from escolhidos)
      loop
        v_chave := 'habilitacao:' || rec.empresa_id::text || ':' || v_hoje::text || '|' || v_email;
        -- criar_notificacao_dedup devolve o id também quando o aviso JÁ existia (0036:62-72): para
        -- contar só o que foi criado agora, confere antes, com a mesma condição que ela usa
        v_ja_avisado := exists (
          select 1
            from public.notificacao n
           where n.empresa_id = rec.empresa_id
             and n.usuario_email = v_email
             and n.deleted_at is null
             and (n.dados_extra ->> 'dedup_key') = v_chave
        );
        v_id := public.criar_notificacao_dedup(
          rec.empresa_id,
          v_email,
          v_titulo,
          v_msg,
          '/AcervoTecnico?aba=habilitacao',
          'Licitação',
          case when rec.vencem_hoje > 0 then 'Alta' else 'Normal' end,
          v_chave
        );
        if v_id is not null and not v_ja_avisado then
          v_criados := v_criados + 1;
        end if;

        if rec.whatsapp then
          -- o telefone do vínculo ativo mais antigo que TEM telefone preenchido
          v_tel := null;
          select btrim(u.telefone) into v_tel
            from public.usuario_empresa u
           where u.empresa_id = rec.empresa_id and lower(u.usuario_email) = v_email
             and u.ativo = true and u.deleted_at is null
             and nullif(btrim(u.telefone), '') is not null
           order by u.created_at, u.id
           limit 1;
          if v_tel is not null then
            insert into public.habilitacao_lembrete_fila (empresa_id, usuario_email, telefone, texto, dedup_key)
            values (rec.empresa_id, v_email, v_tel,
                    left('SIGO Obras — ' || rec.empresa_nome || E'\n' || v_titulo || E'\n' || v_msg, 1500),
                    'habilitacao_wa:' || rec.empresa_id::text || ':' || v_hoje::text || '|' || v_email)
            on conflict (dedup_key) do nothing;
          end if;
        end if;
      end loop;

      -- só soma depois que a empresa terminou: o que um erro desfaz não entra na conta
      v_total := v_total + v_criados;
    exception when others then
      raise warning 'alertar_documentos_habilitacao: empresa % falhou (%)', rec.empresa_id, sqlerrm;
    end;
  end loop;

  -- acorda a função que envia o WhatsApp (se há pendente); falha aqui não desfaz os avisos do sino
  begin
    perform public.habilitacao_lembretes_acionar();
  exception when others then
    raise warning 'alertar_documentos_habilitacao: não foi possível acionar o envio do WhatsApp (%)', sqlerrm;
  end;

  return v_total;
end;
$$;

comment on function public.alertar_documentos_habilitacao() is
  'Aviso diário dos documentos de habilitação que vencem em N dias (config, padrão 10), em 3 dias ou hoje: sino para os usuários escolhidos (ou donos e Admins) e, se ligado, WhatsApp pela fila. 1 aviso por pessoa por dia. Devolve quantos avisos de sino foram criados.';

revoke all on function public.alertar_documentos_habilitacao() from public, anon, authenticated;
grant execute on function public.alertar_documentos_habilitacao() to service_role;

-- Agendamento -------------------------------------------------------------------------------
-- o alerta: manhã de Brasília (11:45 UTC = 08:45)
do $$ begin perform cron.unschedule('alertar_documentos_habilitacao'); exception when others then null; end $$;
select cron.schedule('alertar_documentos_habilitacao', '45 11 * * *',
  $$ select public.alertar_documentos_habilitacao(); $$);

-- o reenvio: a cada 30 minutos, só chama a função do WhatsApp se sobrou mensagem pendente
do $$ begin perform cron.unschedule('habilitacao_lembretes_reenvio'); exception when others then null; end $$;
select cron.schedule('habilitacao_lembretes_reenvio', '*/30 * * * *',
  $$ select public.habilitacao_lembretes_acionar(); $$);

notify pgrst, 'reload schema';

commit;

-- Conferência (só leitura). Esperado: os dois jobs ativos (o alerta às 11:45 UTC e o reenvio a
-- cada 30 minutos); 5 policies na configuração (2 da empresa, permissivas, e 3 restritivas:
-- SELECT, INSERT e UPDATE); o alerta e o acionamento só para o service_role, a RPC da tela para o
-- authenticated e não para o anon, e a fila fechada para o authenticated; a coluna da reserva na
-- fila.
select jobname, schedule, active from cron.job
 where jobname in ('alertar_documentos_habilitacao', 'habilitacao_lembretes_reenvio')
 order by jobname;
select policyname, permissive, cmd from pg_policies
 where schemaname = 'public' and tablename = 'habilitacao_config'
 order by policyname;
select has_function_privilege('authenticated', 'public.alertar_documentos_habilitacao()', 'execute') as authenticated_alerta,
       has_function_privilege('authenticated', 'public.habilitacao_lembretes_acionar()', 'execute') as authenticated_aciona,
       has_function_privilege('authenticated', 'public.habilitacao_usuarios_da_empresa()', 'execute') as authenticated_lista_usuarios,
       has_function_privilege('anon', 'public.habilitacao_usuarios_da_empresa()', 'execute') as anon_lista_usuarios,
       has_function_privilege('service_role', 'public.alertar_documentos_habilitacao()', 'execute') as service_role_alerta,
       has_function_privilege('service_role', 'public.habilitacao_lembretes_acionar()', 'execute') as service_role_aciona,
       has_table_privilege('authenticated', 'public.habilitacao_lembrete_fila', 'select') as authenticated_le_a_fila;
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'habilitacao_lembrete_fila' and column_name = 'reivindicado_em';

select 'ok' as res;
