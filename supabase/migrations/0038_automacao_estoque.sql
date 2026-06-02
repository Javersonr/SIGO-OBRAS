-- ============================================================================
-- 0038_automacao_estoque.sql — AUTOMAÇÕES DE ESTOQUE
--
-- Depende de 0036 (notificar_gestores) e 0027 (sync_saldo_reservas).
--
--   1. Alerta de estoque abaixo do mínimo — trigger BEFORE em estoque_saldo.
--      Dispara notificação quando quantidade_disponivel cai abaixo do
--      estoque_minimo. Rearma sozinho quando o saldo volta ao normal
--      (flag alerta_minimo_ativo), então não floda a cada movimento.
--   2. Liberar reservas vencidas — cron diário cancela reservas Ativas cuja
--      data_necessidade passou (+2 dias de tolerância). O trigger
--      trg_sync_saldo_reservas (0027) recalcula o saldo automaticamente.
--
-- NÃO incluído aqui: entrada de estoque ao receber NFe — JÁ é automático no
-- app (DespesasTab chama entrada_estoque_atomica por item associado).
-- ============================================================================

-- 1. Alerta de estoque mínimo ---------------------------------------------
alter table public.estoque_saldo
  add column if not exists alerta_minimo_ativo boolean default false;

create or replace function public.tg_estoque_alerta_minimo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp numeric;
  v_min numeric;
begin
  v_min := coalesce(new.estoque_minimo, 0);
  -- quantidade_disponivel é GENERATED (não disponível em BEFORE), calcula na mão
  v_disp := coalesce(new.quantidade, 0) - coalesce(new.quantidade_reservada, 0);

  if v_min > 0 and v_disp < v_min then
    -- Só alerta na transição "normal -> abaixo" (flag evita repetição).
    if coalesce(new.alerta_minimo_ativo, false) = false then
      new.alerta_minimo_ativo := true;
      perform public.notificar_gestores(
        new.empresa_id,
        array['Admin Holding', 'Admin', 'Gestor', 'Estoque', 'Compras'],
        'Estoque abaixo do mínimo',
        format(
          '%s (%s): %s %s disponível, abaixo do mínimo de %s.',
          coalesce(new.material_descricao, new.material_codigo, 'Material'),
          coalesce(new.almoxarifado_nome, 'almoxarifado'),
          trim(to_char(v_disp, 'FM999999990.00')),
          coalesce(new.unidade, ''),
          trim(to_char(v_min, 'FM999999990.00'))
        ),
        '/Estoque',
        'Estoque',
        'Alta',
        'estoque_min:' || new.material_id::text || ':' || new.almoxarifado_id::text
          || ':' || to_char(now(), 'YYYYMMDD"T"HH24MISS')
      );
    end if;
  else
    -- Voltou ao/ acima do mínimo: rearma pra alertar de novo numa próxima queda.
    new.alerta_minimo_ativo := false;
  end if;

  return new;
end;
$$;

comment on function public.tg_estoque_alerta_minimo is
  'Notifica gestores quando saldo disponível cai abaixo do mínimo; rearma ao normalizar.';

drop trigger if exists trg_estoque_alerta_minimo on public.estoque_saldo;
create trigger trg_estoque_alerta_minimo
  before insert or update on public.estoque_saldo
  for each row
  execute function public.tg_estoque_alerta_minimo();

-- 2. Liberar reservas vencidas --------------------------------------------
create or replace function public.liberar_reservas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
begin
  -- CTE que cancela e devolve as empresas afetadas pra notificar.
  for rec in
    with cancelled as (
      update public.reserva_material
        set status = 'Cancelada',
            observacoes = trim(coalesce(observacoes, '')
              || ' [cancelada automaticamente: data de necessidade vencida]'),
            updated_at = now()
        where status = 'Ativa'
          and deleted_at is null
          and data_necessidade is not null
          and data_necessidade < current_date - interval '2 days'
        returning empresa_id
    )
    select empresa_id, count(*) as qtd
      from cancelled
      group by empresa_id
  loop
    v_total := v_total + rec.qtd;
    perform public.notificar_gestores(
      rec.empresa_id,
      array['Admin Holding', 'Admin', 'Gestor', 'Estoque'],
      'Reservas liberadas automaticamente',
      format('%s reserva(s) de material foram canceladas por vencimento da data de necessidade.', rec.qtd),
      '/Estoque',
      'Estoque',
      'Normal',
      'reservas_venc:' || rec.empresa_id::text || ':' || current_date
    );
  end loop;

  return v_total;
end;
$$;

comment on function public.liberar_reservas_vencidas is
  'Cancela reservas Ativas com data_necessidade vencida (+2d); o trigger de saldo devolve a quantidade.';

-- Agenda: 06:40 UTC (~03:40 BRT)
do $$ begin perform cron.unschedule('liberar_reservas_vencidas'); exception when others then null; end $$;
select cron.schedule('liberar_reservas_vencidas', '40 6 * * *',
  $$ select public.liberar_reservas_vencidas(); $$);
