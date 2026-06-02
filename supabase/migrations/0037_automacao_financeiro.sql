-- ============================================================================
-- 0037_automacao_financeiro.sql — JOBS AUTOMÁTICOS DO FINANCEIRO
--
-- Depende de 0036 (pg_cron + helpers de notificação).
--
-- Cria e agenda 3 rotinas:
--   1. processar_recorrencias_vencidas() — gera as TransacaoFinanceira das
--      recorrências cujo proxima_geracao já chegou; avança a data; desativa
--      quando passa do data_fim. (antes era botão "Processar Agora")
--   2. marcar_transacoes_atrasadas() — vira pra "atrasado" tudo que está
--      pendente e passou do vencimento.
--   3. alertar_vencimentos() — resumo diário no sino pros gestores: contas
--      vencendo em até 3 dias + atrasadas.
--
-- Fuso: pg_cron roda em UTC. Brasil = UTC-3 (horários abaixo somam +3h).
-- ============================================================================

-- Helpers de data ----------------------------------------------------------

-- Formata número como moeda BR sem depender de lc_numeric do servidor.
create or replace function public.fmt_brl(v numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || replace(to_char(coalesce(v, 0), 'FM9999999990.00'), '.', ',');
$$;

-- Data de vencimento de uma ocorrência: aplica dia_vencimento no mês de d,
-- com clamp pro último dia do mês (ex: dia 31 em fevereiro -> 28/29).
create or replace function public.data_vencimento_ocorrencia(d date, dia_venc int)
returns date
language plpgsql
immutable
as $$
declare
  v_dim int;
begin
  if dia_venc is null then
    return d;
  end if;
  v_dim := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
  return make_date(
    extract(year from d)::int,
    extract(month from d)::int,
    least(dia_venc, v_dim)
  );
end;
$$;

-- Próxima data de geração conforme a frequência, com clamp de dia no mês.
create or replace function public.proxima_data_recorrencia(d date, freq text, dia_venc int)
returns date
language plpgsql
immutable
as $$
declare
  v_first date;
  v_dim int;
  v_day int;
begin
  if freq = 'diaria' then
    return d + 1;
  elsif freq = 'semanal' then
    return d + 7;
  elsif freq = 'mensal' then
    v_first := (date_trunc('month', d) + interval '1 month')::date;
    v_dim := extract(day from (date_trunc('month', v_first) + interval '1 month - 1 day'))::int;
    v_day := least(coalesce(dia_venc, extract(day from d)::int), v_dim);
    return make_date(extract(year from v_first)::int, extract(month from v_first)::int, v_day);
  elsif freq = 'anual' then
    v_first := make_date(extract(year from d)::int + 1, extract(month from d)::int, 1);
    v_dim := extract(day from (date_trunc('month', v_first) + interval '1 month - 1 day'))::int;
    v_day := least(coalesce(dia_venc, extract(day from d)::int), v_dim);
    return make_date(extract(year from v_first)::int, extract(month from v_first)::int, v_day);
  else
    return d + 1;
  end if;
end;
$$;

-- 1. processar_recorrencias_vencidas --------------------------------------
create or replace function public.processar_recorrencias_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_d date;
  v_count int := 0;
  v_guard int;
begin
  for r in
    select * from public.transacao_recorrente
      where ativo = true
        and deleted_at is null
        and proxima_geracao is not null
        and proxima_geracao <= current_date
  loop
    v_d := r.proxima_geracao;
    v_guard := 0;

    -- Catch-up: gera todas as ocorrências atrasadas (cap 60 p/ segurança).
    while v_d is not null
          and v_d <= current_date
          and (r.data_fim is null or v_d <= r.data_fim)
          and v_guard < 60
    loop
      insert into public.transacao_financeira (
        empresa_id, tipo, conta_id, conta_nome, categoria_id, categoria_nome,
        valor, data, data_vencimento,
        projeto_id, projeto_nome, fornecedor_id, fornecedor_nome,
        cliente_id, cliente_nome, descricao, status, forma_pagamento,
        observacoes, referencia_tipo, referencia_id
      ) values (
        r.empresa_id,
        case when lower(r.tipo) = 'receita' then 'Receita' else 'Despesa' end,
        r.conta_id, r.conta_nome, r.categoria_id, r.categoria_nome,
        r.valor, v_d, public.data_vencimento_ocorrencia(v_d, r.dia_vencimento),
        r.projeto_id, r.projeto_nome, r.fornecedor_id, r.fornecedor_nome,
        r.cliente_id, r.cliente_nome, r.descricao, 'em_aberto', r.forma_pagamento,
        trim(coalesce(r.observacoes, '') || ' [gerada automaticamente da recorrência]'),
        'Outro', r.id
      );
      v_count := v_count + 1;
      v_d := public.proxima_data_recorrencia(v_d, r.frequencia, r.dia_vencimento);
      v_guard := v_guard + 1;
    end loop;

    -- Grava a próxima data e desativa se passou do fim.
    update public.transacao_recorrente
      set proxima_geracao = v_d,
          ativo = case when r.data_fim is not null and v_d is not null and v_d > r.data_fim
                       then false else ativo end,
          updated_at = now()
      where id = r.id;
  end loop;

  return v_count;
end;
$$;

comment on function public.processar_recorrencias_vencidas is
  'Gera TransacaoFinanceira das recorrências vencidas (catch-up até 60 ocorrências) e avança proxima_geracao.';

-- 2. marcar_transacoes_atrasadas ------------------------------------------
create or replace function public.marcar_transacoes_atrasadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.transacao_financeira
    set status = 'atrasado', updated_at = now()
    where deleted_at is null
      and data_vencimento is not null
      and data_vencimento < current_date
      and lower(status) in ('em_aberto', 'pendente', 'previsto', 'agendado');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.marcar_transacoes_atrasadas is
  'Vira status para "atrasado" em transações pendentes com vencimento passado (não toca pago/realizado/cancelado).';

-- 3. alertar_vencimentos ---------------------------------------------------
create or replace function public.alertar_vencimentos()
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
    select
      empresa_id,
      count(*) filter (where data_vencimento between current_date and current_date + 3) as venc_3d,
      count(*) filter (where data_vencimento < current_date) as atrasadas,
      sum(valor) filter (where data_vencimento between current_date and current_date + 3) as total_venc,
      sum(valor) filter (where data_vencimento < current_date) as total_atraso
    from public.transacao_financeira
    where deleted_at is null
      and data_vencimento is not null
      and lower(status) not in ('pago', 'realizado', 'cancelado')
      and data_vencimento <= current_date + 3
    group by empresa_id
  loop
    if rec.venc_3d > 0 or rec.atrasadas > 0 then
      perform public.notificar_gestores(
        rec.empresa_id,
        array['Admin Holding', 'Admin', 'Gestor', 'Financeiro'],
        case
          when rec.atrasadas > 0 then 'Contas atrasadas e a vencer'
          else 'Contas a vencer'
        end,
        format(
          '%s conta(s) vencendo em até 3 dias (%s) e %s atrasada(s) (%s).',
          rec.venc_3d, public.fmt_brl(rec.total_venc),
          rec.atrasadas, public.fmt_brl(rec.total_atraso)
        ),
        '/Financeiro',
        'Financeiro',
        case when rec.atrasadas > 0 then 'Alta' else 'Normal' end,
        'venc_resumo:' || rec.empresa_id || ':' || current_date
      );
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

comment on function public.alertar_vencimentos is
  'Resumo diário no sino dos gestores: contas vencendo em até 3 dias + atrasadas.';

-- Agendamentos -------------------------------------------------------------
-- 06:10 UTC (~03:10 BRT): gerar recorrências
do $$ begin perform cron.unschedule('processar_recorrencias'); exception when others then null; end $$;
select cron.schedule('processar_recorrencias', '10 6 * * *',
  $$ select public.processar_recorrencias_vencidas(); $$);

-- 06:20 UTC (~03:20 BRT): marcar atrasados (depois das recorrências)
do $$ begin perform cron.unschedule('marcar_atrasados'); exception when others then null; end $$;
select cron.schedule('marcar_atrasados', '20 6 * * *',
  $$ select public.marcar_transacoes_atrasadas(); $$);

-- 11:00 UTC (~08:00 BRT): alertar vencimentos no sino
do $$ begin perform cron.unschedule('alertar_vencimentos'); exception when others then null; end $$;
select cron.schedule('alertar_vencimentos', '0 11 * * *',
  $$ select public.alertar_vencimentos(); $$);
