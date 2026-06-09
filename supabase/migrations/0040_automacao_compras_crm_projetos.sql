-- ============================================================================
-- 0040_automacao_compras_crm_projetos.sql
--
-- Depende de 0036 (notificar_gestores) e 0030 (sincronizar_projeto_com_oportunidade).
--
--   1. Trigger: oportunidade alterada -> ressincroniza os projetos ligados
--      a ela (oportunidade_origem_id) chamando a RPC já existente.
--   2. alertar_solicitacoes_paradas() — SC sem movimento há 7+ dias.
--   3. alertar_crm() — oportunidades paradas (14d) + fechamento previsto em 7d.
--   4. alertar_projetos() — contrato vencido/vencendo + gastos acima do estimado.
--
-- Tudo agregado por empresa (1 notificação/empresa/dia por tema).
-- Fuso: pg_cron em UTC; ~08h BRT = 11h UTC.
-- ============================================================================

-- 1. Trigger: sincroniza projetos quando a oportunidade muda ---------------
create or replace function public.tg_oportunidade_sincroniza_projetos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.projeto
      where oportunidade_origem_id = new.id and deleted_at is null
  loop
    begin
      perform public.sincronizar_projeto_com_oportunidade(r.id);
    exception when others then
      -- sync nunca pode derrubar o UPDATE da oportunidade
      raise warning 'sincronizar_projeto % falhou: %', r.id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;

comment on function public.tg_oportunidade_sincroniza_projetos is
  'Ao alterar uma oportunidade, ressincroniza os projetos com oportunidade_origem_id = oportunidade.';

drop trigger if exists trg_oportunidade_sincroniza_projetos on public.oportunidade;
create trigger trg_oportunidade_sincroniza_projetos
  after update on public.oportunidade
  for each row
  execute function public.tg_oportunidade_sincroniza_projetos();

-- 2. alertar_solicitacoes_paradas -----------------------------------------
create or replace function public.alertar_solicitacoes_paradas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
begin
  for rec in
    select empresa_id, count(*) as total
    from public.solicitacao_compra
    where deleted_at is null
      and status in ('Pendente Aprovação', 'Em Cotação')
      and updated_at < now() - interval '7 days'
    group by empresa_id
  loop
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor', 'Compras'],
      'Solicitações de compra paradas',
      format('%s solicitação(ões) de compra sem movimento há mais de 7 dias.', rec.total),
      '/Compras',
      'Compra',
      'Alta',
      'sc_parada:' || rec.empresa_id::text || ':' || current_date
    );
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- 3. alertar_crm -----------------------------------------------------------
create or replace function public.alertar_crm()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
begin
  for rec in
    select empresa_id,
      count(*) filter (where parada) as paradas,
      count(*) filter (where fechando) as fechando
    from (
      select empresa_id,
        (updated_at < now() - interval '14 days') as parada,
        (data_fechamento_prevista is not null
          and data_fechamento_prevista <= current_date + 7
          and data_fechamento_prevista >= current_date) as fechando
      from public.oportunidade
      where deleted_at is null
        and coalesce(arquivado, false) = false
        and coalesce(status_nome, '') !~* '(ganho|perdid|conclu|cancel|fechad)'
        and (
          updated_at < now() - interval '14 days'
          or (data_fechamento_prevista is not null and data_fechamento_prevista <= current_date + 7)
        )
    ) x
    group by empresa_id
  loop
    if rec.paradas > 0 or rec.fechando > 0 then
      perform public.notificar_gestores(
        rec.empresa_id,
        array['Admin Holding', 'Admin', 'Gestor'],
        'Oportunidades: acompanhamento',
        format('%s oportunidade(s) sem atualização há 14+ dias; %s com fechamento previsto em até 7 dias.',
          rec.paradas, rec.fechando),
        '/Oportunidades',
        'Sistema',
        'Normal',
        'crm_resumo:' || rec.empresa_id::text || ':' || current_date
      );
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

-- 4. alertar_projetos ------------------------------------------------------
create or replace function public.alertar_projetos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
begin
  for rec in
    select empresa_id,
      count(*) filter (where contrato_venc) as contrato_vencido,
      count(*) filter (where contrato_30) as contrato_vencendo,
      count(*) filter (where estourado) as estourados
    from (
      select p.empresa_id, p.id,
        (p.data_vencimento_contrato is not null and p.data_vencimento_contrato < current_date)
          as contrato_venc,
        (p.data_vencimento_contrato is not null
          and p.data_vencimento_contrato between current_date and current_date + 30)
          as contrato_30,
        (p.valor_estimado > 0 and coalesce(g.gasto, 0) > p.valor_estimado)
          as estourado
      from public.projeto p
      left join (
        select projeto_id, sum(valor) as gasto
          from public.transacao_financeira
          where deleted_at is null
            and tipo = 'Despesa'
            and lower(status) in ('pago', 'realizado')
            and projeto_id is not null
          group by projeto_id
      ) g on g.projeto_id = p.id
      where p.deleted_at is null
        and coalesce(p.arquivado, false) = false
    ) x
    where contrato_venc or contrato_30 or estourado
    group by empresa_id
  loop
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor'],
      'Projetos: atenção',
      format('%s contrato(s) vencido(s), %s vencendo em 30d, %s com gastos acima do estimado.',
        rec.contrato_vencido, rec.contrato_vencendo, rec.estourados),
      '/Projetos',
      'Projeto',
      case when rec.contrato_vencido > 0 or rec.estourados > 0 then 'Alta' else 'Normal' end,
      'projeto_resumo:' || rec.empresa_id::text || ':' || current_date
    );
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- Agendamentos -------------------------------------------------------------
do $$ begin perform cron.unschedule('alertar_solicitacoes_paradas'); exception when others then null; end $$;
select cron.schedule('alertar_solicitacoes_paradas', '20 11 * * *',
  $$ select public.alertar_solicitacoes_paradas(); $$);

do $$ begin perform cron.unschedule('alertar_crm'); exception when others then null; end $$;
select cron.schedule('alertar_crm', '25 11 * * *', $$ select public.alertar_crm(); $$);

do $$ begin perform cron.unschedule('alertar_projetos'); exception when others then null; end $$;
select cron.schedule('alertar_projetos', '30 11 * * *', $$ select public.alertar_projetos(); $$);
