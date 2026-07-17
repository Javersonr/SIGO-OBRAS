-- ============================================================================
-- 0084_remove_manufatura.sql — remove o módulo Manufatura (indústria) do SIGO
--
-- Decisão do produto (jul/2026): a gestão de fábrica vai virar um APP
-- INDEPENDENTE do SIGO Obras (portfólio Sinergia Digital). Remove o módulo
-- inteiro criado nas 0076–0082. Verificado antes do drop: as 13 tabelas estavam
-- com 0 linhas (o E2E rodou em rollback) — nenhum dado operacional é perdido.
--
-- Remove:
--   - cron gerar_manutencoes_preventivas
--   - 4 views (vw_producao_resumo, vw_oee_centro_dia, vw_paradas_resumo,
--     vw_custo_ordem_producao)
--   - 8 funções do módulo (assinaturas resolvidas dinamicamente)
--   - 13 tabelas (cascade)
--   - colunas/CHECKs que as 0076/0078/0080 adicionaram em tabelas COMPARTILHADAS
--     (material, almoxarifado, estoque_movimento, reserva_material,
--      solicitacao_compra) — todos com 0 linhas usando os valores novos
--   - a chave "Manufatura" de plano.modulos_liberados (6 planos)
--
-- Restaura:
--   - liberar_reservas_vencidas à versão ORIGINAL do estoque (0038) — a 0078
--     só tinha acrescentado o filtro "<> 'OrdemProducao'". NÃO dropar: o cron
--     diário do estoque (06:40 UTC) aponta pra ela.
-- ============================================================================

-- 1. Cron do módulo (executar_mrp por segurança; só gerar_manutencoes existia)
do $$ begin perform cron.unschedule('gerar_manutencoes_preventivas'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('executar_mrp'); exception when others then null; end $$;

-- 2. Views
drop view if exists public.vw_custo_ordem_producao cascade;
drop view if exists public.vw_oee_centro_dia cascade;
drop view if exists public.vw_paradas_resumo cascade;
drop view if exists public.vw_producao_resumo cascade;

-- 3. Funções do módulo (assinaturas dinâmicas — DROP FUNCTION exige args)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'atualizar_custo_padrao', 'calcular_custo_padrao',
        'concluir_ordem_producao', 'converter_sugestao_producao',
        'executar_mrp', 'gerar_manutencoes_preventivas',
        'gerar_solicitacao_compra_mrp', 'liberar_ordem_producao'
      )
  loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

-- 4. Restaura liberar_reservas_vencidas (versão 0038, verbatim)
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

-- 5. Tabelas do módulo (cascade cobre FKs entre elas e o FK de reserva_material)
drop table if exists public.apontamento_producao cascade;
drop table if exists public.ordem_producao_operacao cascade;
drop table if exists public.ordem_producao_item cascade;
drop table if exists public.inspecao_qualidade cascade;
drop table if exists public.mrp_sugestao cascade;
drop table if exists public.mrp_execucao cascade;
drop table if exists public.ordem_manutencao cascade;
drop table if exists public.plano_manutencao cascade;
drop table if exists public.ordem_producao cascade;
drop table if exists public.ficha_tecnica_item cascade;
drop table if exists public.roteiro_operacao cascade;
drop table if exists public.ficha_tecnica cascade;
drop table if exists public.centro_trabalho cascade;

-- 6. Tabelas compartilhadas: desfaz os ALTERs das 0076/0078/0080
alter table public.reserva_material drop column if exists ordem_producao_id;
alter table public.reserva_material drop constraint if exists reserva_material_tipo_reserva_check;
alter table public.reserva_material
  add constraint reserva_material_tipo_reserva_check
  check (tipo_reserva in ('Projeto', 'Caminhão')) not valid;

alter table public.estoque_movimento drop constraint if exists estoque_movimento_referencia_tipo_check;
alter table public.estoque_movimento
  add constraint estoque_movimento_referencia_tipo_check
  check (referencia_tipo is null or referencia_tipo in (
    'Pedido', 'Retirada', 'Ajuste', 'Transferência', 'Inventário', 'Manual',
    'Reserva', 'NotaFiscal', 'Devolução'
  )) not valid;

alter table public.solicitacao_compra drop constraint if exists solicitacao_compra_origem_check;
alter table public.solicitacao_compra
  add constraint solicitacao_compra_origem_check
  check (origem in ('Manual', 'Orcamento', 'Estoque')) not valid;

alter table public.material
  drop column if exists tipo_item,
  drop column if exists fabricado,
  drop column if exists controla_lote,
  drop column if exists controla_serie,
  drop column if exists custo_padrao,
  drop column if exists lead_time_dias;

alter table public.almoxarifado drop column if exists tipo;

-- 7. Remove a chave "Manufatura" dos planos
update public.plano
  set modulos_liberados = modulos_liberados - 'Manufatura'
  where modulos_liberados ? 'Manufatura';

notify pgrst, 'reload schema';
