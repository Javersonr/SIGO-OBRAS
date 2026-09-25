-- ============================================================================
-- 0111_edital_ia_prazos.sql — leitura de edital por IA + alerta de prazos
--
--   1. oportunidade: campos do edital que a IA extrai (nº, processo, portal,
--      forma, horários de impugnação/esclarecimento, visita técnica…), o JSON
--      da análise (edital_analise) e a configuração do alerta de prazos.
--      arquivo_oportunidade.categoria marca edital / TR / anexo / errata.
--   2. notificacao: tipo 'Licitação' no CHECK (mantém todos os atuais).
--   3. alertar_prazos_licitacao(): avisa D-n dos prazos (impugnação,
--      esclarecimento, proposta, sessão) aos responsáveis + Admins.
--   4. pg_cron diário 11:40 UTC (08:40 BRT).
--   5. Execução só servidor (padrão 0110).
--
-- Aditivo e idempotente (add column if not exists / create or replace).
-- ============================================================================

-- 1. Colunas ------------------------------------------------------------------
alter table public.oportunidade
  add column if not exists licitacao_numero text,
  add column if not exists licitacao_processo text,
  add column if not exists licitacao_portal text,
  add column if not exists licitacao_forma text,
  add column if not exists licitacao_horario_impugnacao text,
  add column if not exists licitacao_data_esclarecimento date,
  add column if not exists licitacao_horario_esclarecimento text,
  add column if not exists licitacao_visita_tecnica text,
  add column if not exists licitacao_criterio_julgamento text,
  add column if not exists licitacao_prazo_execucao text,
  add column if not exists licitacao_exclusiva_me_epp boolean,
  add column if not exists edital_analise jsonb,
  add column if not exists edital_analisado_em timestamptz,
  add column if not exists alertar_prazos boolean not null default false,
  add column if not exists alerta_antecedencia_dias int[] not null default '{3,1,0}';

alter table public.arquivo_oportunidade
  add column if not exists categoria text;

comment on column public.oportunidade.licitacao_numero is 'Nº do edital (ex.: 011/2026).';
comment on column public.oportunidade.licitacao_processo is 'Nº do processo administrativo.';
comment on column public.oportunidade.licitacao_portal is 'Plataforma/link onde ocorre a disputa.';
comment on column public.oportunidade.licitacao_forma is '''eletronica'' | ''presencial''.';
comment on column public.oportunidade.licitacao_horario_impugnacao is 'HH:MM limite da impugnação (data em licitacao_data_impugnacao).';
comment on column public.oportunidade.licitacao_visita_tecnica is 'Visita técnica: obrigatória/facultativa, data, local.';
comment on column public.oportunidade.edital_analise is
  'Análise do edital por IA: {versao, extraido, atende, arquivos, analisado_em, analisado_por}.';
comment on column public.oportunidade.alertar_prazos is 'Liga o alerta diário de prazos da licitação (alertar_prazos_licitacao).';
comment on column public.oportunidade.alerta_antecedencia_dias is 'Dias de antecedência dos alertas (0 = no dia).';
comment on column public.arquivo_oportunidade.categoria is
  'null | ''edital'' | ''termo_referencia'' | ''anexo_edital'' | ''errata''.';

-- Acelera a varredura do cron (só as poucas oportunidades com alerta ligado).
create index if not exists op_alertar_prazos_idx
  on public.oportunidade (empresa_id)
  where alertar_prazos = true and deleted_at is null;

-- 2. Tipo 'Licitação' na notificação -----------------------------------------
-- Valores atuais conferidos com pg_get_constraintdef em 24/09/2026 (0053).
alter table public.notificacao drop constraint if exists notificacao_tipo_check;
alter table public.notificacao add constraint notificacao_tipo_check
  check (tipo in (
    'Cotação', 'Projeto', 'Compra', 'Financeiro', 'Estoque',
    'Sistema', 'Inspeção', 'Manutenção', 'Fluxo', 'Licitação'
  ));

-- 3. alertar_prazos_licitacao ---------------------------------------------------
-- Para cada oportunidade viva com alertar_prazos = true e cada prazo cuja
-- distância (data - hoje em BRT) esteja em alerta_antecedencia_dias, notifica
-- os responsáveis (responsaveis_ids + responsavel_email/id) e os Admins da
-- PRÓPRIA empresa. dedup_key leva a data: errata que muda a data gera alerta
-- novo. Retorna quantos prazos foram avisados.
create or replace function public.alertar_prazos_licitacao()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora time := (now() at time zone 'America/Sao_Paulo')::time;
  rec record;
  v_ids text[];
  v_m text[];
  v_hora text;
  v_hora_ok boolean;
  v_quando text;
  v_msg text;
  v_email text;
  v_total int := 0;
begin
  for rec in
    select o.id, o.empresa_id, o.nome, o.orgao, o.licitacao_numero,
           o.responsaveis_ids, o.responsavel_email, o.responsavel_id,
           p.codigo, p.rotulo, p.data, p.hora_txt,
           (p.data - v_hoje) as dias
      from public.oportunidade o
      cross join lateral (values
        ('impugnacao', 'Impugnação', o.licitacao_data_impugnacao, o.licitacao_horario_impugnacao),
        ('esclarecimento', 'Esclarecimento', o.licitacao_data_esclarecimento, o.licitacao_horario_esclarecimento),
        ('proposta', 'Proposta', o.licitacao_data_proposta, o.licitacao_horario_proposta),
        ('sessao', 'Sessão', o.licitacao_data, o.licitacao_horario)
      ) as p(codigo, rotulo, data, hora_txt)
     where o.deleted_at is null
       and coalesce(o.arquivado, false) = false
       and o.alertar_prazos = true
       -- mesmo filtro de encerradas do alertar_crm (+ finalizado/desistência)
       and coalesce(o.status_nome, '') !~* '(ganho|perdid|conclu|cancel|fechad|finaliz|desist)'
       and p.data is not null
       and p.data >= v_hoje
       and (p.data - v_hoje) = any(o.alerta_antecedencia_dias)
     order by o.empresa_id, p.data, o.id
  loop
    -- Hora livre ("09:00", "9h30", "14:00 (Brasília)", "9h") → HH:MM;
    -- se não reconhecer, exibe o texto como veio.
    v_hora_ok := false;
    v_m := regexp_match(coalesce(rec.hora_txt, ''), '(\d{1,2})\s*[:hH.]\s*(\d{2})');
    if v_m is null then
      v_m := regexp_match(coalesce(rec.hora_txt, ''), '^\s*(\d{1,2})\s*[hH]?\s*$');
    end if;
    if v_m is not null and v_m[1]::int <= 23 and coalesce(v_m[2], '00')::int <= 59 then
      v_hora := lpad(v_m[1], 2, '0') || ':' || coalesce(v_m[2], '00');
      v_hora_ok := true;
    else
      v_hora := nullif(trim(rec.hora_txt), '');
    end if;

    -- No próprio dia, prazo com hora já vencida não gera alarme.
    if rec.dias = 0 and v_hora_ok then
      if v_hora::time <= v_agora then
        continue;
      end if;
    end if;

    v_quando := case rec.dias
                  when 0 then 'hoje'
                  when 1 then 'amanhã'
                  else 'em ' || rec.dias || ' dias'
                end;

    -- Ex.: "Proposta em 26/09 às 10:00 (amanhã) · Edital 011/2026 · Prefeitura X"
    v_msg := rec.rotulo || ' em ' || to_char(rec.data, 'DD/MM')
          || coalesce(' às ' || v_hora, '')
          || ' (' || v_quando || ')'
          || coalesce(' · Edital ' || nullif(trim(rec.licitacao_numero), ''), '')
          || coalesce(' · ' || nullif(trim(rec.orgao), ''), '');

    -- responsaveis_ids pode ter e-mail, usuario_empresa.id ou usuario_id
    -- (e vir como jsonb-string do import Base44).
    v_ids := array_remove(
      array(
        select lower(trim(e #>> '{}'))
          from jsonb_array_elements(public.jsonb_to_array(rec.responsaveis_ids)) as e
         where jsonb_typeof(e) = 'string'
      ) || lower(trim(rec.responsavel_email)) || rec.responsavel_id::text,
      null
    );

    for v_email in
      select distinct on (lower(x.email)) x.email
        from (
          -- responsáveis: só usuários ativos da PRÓPRIA empresa
          select ue.usuario_email as email
            from public.usuario_empresa ue
           where ue.empresa_id = rec.empresa_id
             and ue.ativo = true
             and ue.deleted_at is null
             and (lower(ue.usuario_email) = any(v_ids)
                  or ue.id::text = any(v_ids)
                  or ue.usuario_id::text = any(v_ids))
          union all
          select d
            from public.destinatarios_alerta(rec.empresa_id, array['Admin Holding', 'Admin']) as d
        ) x
       where x.email is not null
       order by lower(x.email), x.email
    loop
      perform public.criar_notificacao_dedup(
        rec.empresa_id,
        v_email,
        rec.rotulo || ' ' || v_quando || ': ' || left(rec.nome, 120),
        v_msg,
        '/Oportunidades?openId=' || rec.id::text,
        'Licitação',
        case when rec.dias = 0 then 'Urgente' else 'Alta' end,
        'licitacao_prazo:' || rec.id::text || ':' || rec.codigo || ':' || to_char(rec.data, 'YYYY-MM-DD')
          || ':D-' || rec.dias || '|' || lower(v_email)
      );
    end loop;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

comment on function public.alertar_prazos_licitacao is
  'Cron diário: alerta D-n dos prazos de licitação (impugnação, esclarecimento, proposta, sessão) das oportunidades com alertar_prazos.';

-- 4. Agendamento: 11:40 UTC = 08:40 BRT ----------------------------------------
do $$ begin perform cron.unschedule('alertar_prazos_licitacao'); exception when others then null; end $$;
select cron.schedule('alertar_prazos_licitacao', '40 11 * * *',
  $$ select public.alertar_prazos_licitacao(); $$);

-- 5. Privilégios: só servidor (pg_cron roda como postgres) ------------------------
revoke all on function public.alertar_prazos_licitacao() from public, anon, authenticated;
grant execute on function public.alertar_prazos_licitacao() to service_role;

-- 6. Conferência ----------------------------------------------------------------
select 'colunas oportunidade (esperado 15)' as item,
       count(*)::text as valor
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'oportunidade'
   and column_name in (
     'licitacao_numero', 'licitacao_processo', 'licitacao_portal', 'licitacao_forma',
     'licitacao_horario_impugnacao', 'licitacao_data_esclarecimento',
     'licitacao_horario_esclarecimento', 'licitacao_visita_tecnica',
     'licitacao_criterio_julgamento', 'licitacao_prazo_execucao',
     'licitacao_exclusiva_me_epp', 'edital_analise', 'edital_analisado_em',
     'alertar_prazos', 'alerta_antecedencia_dias')
union all
select 'arquivo_oportunidade.categoria',
       coalesce(max(data_type)::text, 'FALTANDO')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'arquivo_oportunidade' and column_name = 'categoria'
union all
select 'notificacao_tipo_check',
       pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.notificacao'::regclass and conname = 'notificacao_tipo_check'
union all
select 'cron alertar_prazos_licitacao',
       schedule || ' |' || command
  from cron.job
 where jobname = 'alertar_prazos_licitacao'
union all
select 'execute anon/authenticated/service_role',
       has_function_privilege('anon', 'public.alertar_prazos_licitacao()', 'execute')::text || '/'
       || has_function_privilege('authenticated', 'public.alertar_prazos_licitacao()', 'execute')::text || '/'
       || has_function_privilege('service_role', 'public.alertar_prazos_licitacao()', 'execute')::text;
