-- ============================================================================
-- 0039_automacao_sst_ferramental.sql — ALERTAS SST + FERRAMENTAL
--
-- Depende de 0036 (notificar_gestores).
--
--   1. Trigger: agenda manutenção preventiva automaticamente
--      (proxima_manutencao = ultima_manutencao + intervalo_manutencao_dias).
--   2. alertar_aso() — digest diário: ASOs vencendo em 30 dias.
--   3. alertar_treinamentos() — digest: treinamentos vencendo (data_fim + validade_meses).
--   4. alertar_ferramental() — digest: laudos vencendo + manutenções atrasadas
--      + devoluções atrasadas.
--
-- Tudo agregado por empresa (1 notificação/empresa/dia por tema) pra não
-- floodar o sino. notificacao.tipo não tem 'RH'/'SST', então SST usa 'Sistema'.
-- Fuso: pg_cron em UTC; horários ~08h BRT = 11h UTC.
-- ============================================================================

-- 1. Trigger: agenda manutenção preventiva --------------------------------
create or replace function public.tg_ferramenta_agenda_manutencao()
returns trigger
language plpgsql
as $$
begin
  if new.intervalo_manutencao_dias is not null
     and new.intervalo_manutencao_dias > 0
     and new.ultima_manutencao is not null then
    if tg_op = 'INSERT'
       or new.ultima_manutencao is distinct from old.ultima_manutencao
       or new.intervalo_manutencao_dias is distinct from old.intervalo_manutencao_dias
       or new.proxima_manutencao is null then
      new.proxima_manutencao := new.ultima_manutencao + new.intervalo_manutencao_dias;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.tg_ferramenta_agenda_manutencao is
  'Calcula proxima_manutencao a partir de ultima_manutencao + intervalo_manutencao_dias.';

drop trigger if exists trg_ferramenta_agenda_manutencao on public.ferramenta;
create trigger trg_ferramenta_agenda_manutencao
  before insert or update on public.ferramenta
  for each row
  execute function public.tg_ferramenta_agenda_manutencao();

-- 2. alertar_aso -----------------------------------------------------------
create or replace function public.alertar_aso()
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
      count(*) as total,
      count(*) filter (where aso_vencimento < current_date) as vencidos
    from public.funcionario
    where ativo = true
      and deleted_at is null
      and aso_vencimento is not null
      and aso_vencimento <= current_date + 30
    group by empresa_id
  loop
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor'],
      'ASOs a vencer',
      format('%s funcionário(s) com ASO vencendo em até 30 dias (%s já vencido(s)).',
        rec.total, rec.vencidos),
      '/SegurancaTrabalho',
      'Sistema',
      case when rec.vencidos > 0 then 'Alta' else 'Normal' end,
      'aso_resumo:' || rec.empresa_id::text || ':' || current_date
    );
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- 3. alertar_treinamentos --------------------------------------------------
create or replace function public.alertar_treinamentos()
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
      count(*) as total,
      count(*) filter (
        where (data_fim + (validade_meses || ' months')::interval)::date < current_date
      ) as vencidos
    from public.treinamento
    where deleted_at is null
      and data_fim is not null
      and validade_meses is not null
      and validade_meses > 0
      and (data_fim + (validade_meses || ' months')::interval)::date <= current_date + 30
    group by empresa_id
  loop
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor'],
      'Treinamentos a vencer',
      format('%s treinamento(s) vencendo em até 30 dias (%s já vencido(s)).',
        rec.total, rec.vencidos),
      '/SegurancaTrabalho',
      'Sistema',
      case when rec.vencidos > 0 then 'Alta' else 'Normal' end,
      'treino_resumo:' || rec.empresa_id::text || ':' || current_date
    );
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- 4. alertar_ferramental ---------------------------------------------------
create or replace function public.alertar_ferramental()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
begin
  -- Marca alerta_manutencao nas ferramentas com manutenção atrasada (flag UI).
  update public.ferramenta
    set alerta_manutencao = true, updated_at = now()
    where deleted_at is null
      and ativo = true
      and proxima_manutencao is not null
      and proxima_manutencao < current_date
      and coalesce(alerta_manutencao, false) = false
      and coalesce(status, '') not in ('Inativo', 'Sucata');

  for rec in
    select empresa_id,
      sum(laudo) as laudo_cnt,
      sum(manut) as manut_cnt,
      sum(dev)   as dev_cnt
    from (
      -- Laudos vencendo/vencidos
      select empresa_id, 1 as laudo, 0 as manut, 0 as dev
        from public.ferramenta
        where deleted_at is null and ativo = true and laudo_obrigatorio = true
          and data_vencimento_laudo is not null
          and data_vencimento_laudo <= current_date + 30
          and coalesce(status, '') not in ('Inativo', 'Sucata')
      union all
      -- Manutenções atrasadas
      select empresa_id, 0, 1, 0
        from public.ferramenta
        where deleted_at is null and ativo = true
          and proxima_manutencao is not null
          and proxima_manutencao < current_date
          and coalesce(status, '') not in ('Inativo', 'Sucata')
      union all
      -- Devoluções atrasadas
      select empresa_id, 0, 0, 1
        from public.movimentacao_ferramenta
        where deleted_at is null
          and coalesce(status, '') <> 'Cancelada'
          and tipo_movimentacao in ('Entrega para Funcionário', 'Empréstimo')
          and data_devolucao is null
          and data_prevista_devolucao is not null
          and data_prevista_devolucao < current_date
    ) x
    group by empresa_id
  loop
    if coalesce(rec.laudo_cnt, 0) + coalesce(rec.manut_cnt, 0) + coalesce(rec.dev_cnt, 0) > 0 then
      perform public.notificar_gestores(
        rec.empresa_id,
        array['Admin Holding', 'Admin', 'Gestor', 'Estoque'],
        'Ferramental: pendências',
        format('%s laudo(s) vencendo/vencido, %s manutenção(ões) atrasada(s), %s devolução(ões) atrasada(s).',
          coalesce(rec.laudo_cnt, 0), coalesce(rec.manut_cnt, 0), coalesce(rec.dev_cnt, 0)),
        '/Ferramental',
        case when coalesce(rec.manut_cnt, 0) > 0 then 'Manutenção' else 'Inspeção' end,
        'Alta',
        'ferramental_resumo:' || rec.empresa_id::text || ':' || current_date
      );
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

-- Agendamentos (manhã BRT) -------------------------------------------------
do $$ begin perform cron.unschedule('alertar_aso'); exception when others then null; end $$;
select cron.schedule('alertar_aso', '5 11 * * *', $$ select public.alertar_aso(); $$);

do $$ begin perform cron.unschedule('alertar_treinamentos'); exception when others then null; end $$;
select cron.schedule('alertar_treinamentos', '10 11 * * *', $$ select public.alertar_treinamentos(); $$);

do $$ begin perform cron.unschedule('alertar_ferramental'); exception when others then null; end $$;
select cron.schedule('alertar_ferramental', '15 11 * * *', $$ select public.alertar_ferramental(); $$);
