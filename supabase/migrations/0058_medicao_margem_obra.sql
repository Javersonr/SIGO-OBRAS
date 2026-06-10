-- ============================================================================
-- 0058_medicao_margem_obra.sql — MEDIÇÃO MENSAL + RETENÇÃO + MARGEM POR OBRA
--
-- Decisões do dono (PROGRAMA-MELHORIAS-2026-06):
--   - contratos faturam por MEDIÇÃO mensal; retenção/caução com % POR CONTRATO.
--   - meta: o sistema responder "a obra X está dando lucro?".
--
-- Entrega:
--   1. projeto.valor_contrato + projeto.retencao_percentual (config por obra)
--   2. medicao_obra — boletim de medição (nº sequencial por obra, % físico,
--      valor medido, retenção calculada, status Rascunho→Faturada)
--   3. RPC faturar_medicao — gera a RECEITA líquida (valor - retenção) e a
--      RECEITA de retenção (a receber no fim do contrato), ambas linkadas à
--      medição via referencia_tipo/referencia_id. Trava dupla-faturação.
--   4. View v_margem_projeto — orçado × realizado × faturado × recebido ×
--      medido × retido, por obra (security_invoker; só authenticated).
--
-- Aditivo e não-destrutivo.
-- ============================================================================

-- 1. Configuração de contrato na obra -----------------------------------------
alter table public.projeto
  add column if not exists valor_contrato numeric(14,2),
  add column if not exists retencao_percentual numeric(5,2) default 0;

comment on column public.projeto.retencao_percentual is
  'Retenção/caução contratual em % (varia por contrato). Usada como default nas medições.';

-- 2. medicao_obra — boletim de medição ----------------------------------------
create table if not exists public.medicao_obra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  projeto_id uuid not null references public.projeto(id) on delete cascade,
  numero integer not null default 0,                -- sequencial por obra (trigger)
  competencia date not null,                         -- mês de referência (dia 1)
  percentual_fisico numeric(5,2),                    -- avanço físico acumulado 0-100
  valor_medido numeric(14,2) not null check (valor_medido >= 0),
  retencao_percentual numeric(5,2),                  -- snapshot (default: projeto)
  valor_retencao numeric(14,2),                      -- calculado ao faturar
  valor_liquido numeric(14,2),                       -- calculado ao faturar
  status text not null default 'Rascunho'
    check (status in ('Rascunho', 'Aprovada', 'Faturada')),
  transacao_receita_id uuid,                         -- receita líquida gerada
  transacao_retencao_id uuid,                        -- receita de retenção gerada
  data_faturamento timestamptz,
  observacoes text,
  arquivo_boletim_url text,                          -- PDF do boletim (futuro)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index medicao_obra_projeto_idx on public.medicao_obra(projeto_id, numero);
create index medicao_obra_empresa_idx on public.medicao_obra(empresa_id);
create unique index medicao_obra_projeto_numero_uniq
  on public.medicao_obra(projeto_id, numero) where deleted_at is null;
select attach_updated_at_trigger('medicao_obra');
select apply_tenant_rls('medicao_obra');

-- numero sequencial por obra (não confia no frontend)
create or replace function public.tg_medicao_obra_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or new.numero <= 0 then
    select coalesce(max(numero), 0) + 1 into new.numero
      from public.medicao_obra
      where projeto_id = new.projeto_id and deleted_at is null;
  end if;
  -- snapshot da retenção do contrato, se não informada
  if new.retencao_percentual is null then
    select coalesce(retencao_percentual, 0) into new.retencao_percentual
      from public.projeto where id = new.projeto_id;
  end if;
  -- normaliza competência pro dia 1 do mês
  if new.competencia is not null then
    new.competencia := date_trunc('month', new.competencia)::date;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_medicao_obra_numero on public.medicao_obra;
create trigger trg_medicao_obra_numero
  before insert on public.medicao_obra
  for each row execute function public.tg_medicao_obra_numero();

-- 3. referencia_tipo: permite linkar transação à medição -----------------------
alter table public.transacao_financeira
  drop constraint if exists transacao_financeira_referencia_tipo_check;
alter table public.transacao_financeira
  add constraint transacao_financeira_referencia_tipo_check
  check (referencia_tipo = any (array[
    'Pedido', 'OFX', 'Manual', 'Fatura', 'Outro',
    'medicao_obra', 'medicao_obra_retencao'
  ]));

-- 3b. faturar_medicao — gera as receitas e trava dupla-faturação ----------------
create or replace function public.faturar_medicao(
  p_medicao_id uuid,
  p_data_vencimento date,
  p_ator_email text default null,
  p_ator_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.medicao_obra%rowtype;
  v_p public.projeto%rowtype;
  v_pct numeric(5,2);
  v_ret numeric(14,2);
  v_liq numeric(14,2);
  v_rec_id uuid;
  v_ret_id uuid;
begin
  select * into v_m
    from public.medicao_obra
    where id = p_medicao_id and deleted_at is null
    for update;

  if v_m.id is null then
    raise exception 'Medição não encontrada';
  end if;

  if public.current_empresa_id() is not null
     and v_m.empresa_id <> public.current_empresa_id() then
    raise exception 'Acesso negado: medição de outra empresa';
  end if;

  if v_m.status = 'Faturada' then
    raise exception 'Medição #% já foi faturada', v_m.numero;
  end if;

  if p_data_vencimento is null then
    raise exception 'Informe a data de vencimento da fatura';
  end if;

  select * into v_p from public.projeto where id = v_m.projeto_id;

  v_pct := coalesce(v_m.retencao_percentual, v_p.retencao_percentual, 0);
  v_ret := round(v_m.valor_medido * v_pct / 100.0, 2);
  v_liq := v_m.valor_medido - v_ret;

  -- receita líquida (o que efetivamente entra agora)
  insert into public.transacao_financeira (
    empresa_id, tipo, valor, data, data_vencimento, status, descricao,
    projeto_id, projeto_nome, cliente_id, cliente_nome,
    oportunidade_id,
    referencia_tipo, referencia_id, observacoes
  ) values (
    v_m.empresa_id, 'Receita', v_liq, current_date, p_data_vencimento, 'pendente',
    'Medição #' || v_m.numero || ' — ' || coalesce(v_p.nome, 'obra'),
    v_p.id, v_p.nome, v_p.cliente_id, v_p.cliente_nome,
    v_p.oportunidade_origem_id,
    'medicao_obra', v_m.id,
    case when v_pct > 0
      then 'Valor medido R$ ' || v_m.valor_medido || ' • retenção ' || v_pct || '% (R$ ' || v_ret || ')'
      else null end
  ) returning id into v_rec_id;

  -- receita de retenção (a receber na liberação da caução)
  if v_ret > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, status, descricao,
      projeto_id, projeto_nome, cliente_id, cliente_nome,
      oportunidade_id,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Receita', v_ret, current_date, 'pendente',
      'Retenção ' || v_pct || '% — Medição #' || v_m.numero || ' — ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome, v_p.cliente_id, v_p.cliente_nome,
      v_p.oportunidade_origem_id,
      'medicao_obra_retencao', v_m.id,
      'Caução contratual; liberar conforme contrato (ajuste o vencimento quando definido).'
    ) returning id into v_ret_id;
  end if;

  update public.medicao_obra
     set status = 'Faturada',
         retencao_percentual = v_pct,
         valor_retencao = v_ret,
         valor_liquido = v_liq,
         transacao_receita_id = v_rec_id,
         transacao_retencao_id = v_ret_id,
         data_faturamento = now(),
         updated_at = now()
   where id = p_medicao_id;

  return jsonb_build_object(
    'medicao', v_m.numero,
    'valor_medido', v_m.valor_medido,
    'retencao_percentual', v_pct,
    'valor_retencao', v_ret,
    'valor_liquido', v_liq,
    'transacao_receita_id', v_rec_id,
    'transacao_retencao_id', v_ret_id,
    'mensagem', 'Medição faturada: receita de R$ ' || v_liq ||
      case when v_ret > 0 then ' + retenção de R$ ' || v_ret else '' end
  );
end;
$$;

revoke all on function public.faturar_medicao(uuid, date, text, text) from public;
grant execute on function public.faturar_medicao(uuid, date, text, text) to authenticated;

-- 4. v_margem_projeto — a resposta de "a obra está dando lucro?" ---------------
create or replace view public.v_margem_projeto
with (security_invoker = on)
as
select
  p.id as projeto_id,
  p.empresa_id,
  p.nome,
  p.numero_contrato,
  coalesce(p.valor_contrato, p.valor_estimado) as valor_contrato,
  p.retencao_percentual,
  -- orçado (soma do orçamento da obra)
  coalesce((select sum(oi.valor_total) from public.orcamento_item oi
    where oi.projeto_id = p.id and oi.deleted_at is null), 0) as orcado,
  -- custo realizado (despesas pagas)
  coalesce((select sum(t.valor) from public.transacao_financeira t
    where t.projeto_id = p.id and t.deleted_at is null and t.tipo = 'Despesa'
      and lower(coalesce(t.status,'')) in ('pago','realizado')), 0) as custo_realizado,
  -- custo comprometido (despesas lançadas ainda não pagas)
  coalesce((select sum(t.valor) from public.transacao_financeira t
    where t.projeto_id = p.id and t.deleted_at is null and t.tipo = 'Despesa'
      and lower(coalesce(t.status,'')) not in ('pago','realizado','cancelado')), 0) as custo_comprometido,
  -- faturado (receitas emitidas, pagas ou não)
  coalesce((select sum(t.valor) from public.transacao_financeira t
    where t.projeto_id = p.id and t.deleted_at is null and t.tipo = 'Receita'
      and lower(coalesce(t.status,'')) <> 'cancelado'), 0) as faturado,
  -- recebido (receitas pagas)
  coalesce((select sum(t.valor) from public.transacao_financeira t
    where t.projeto_id = p.id and t.deleted_at is null and t.tipo = 'Receita'
      and lower(coalesce(t.status,'')) in ('pago','realizado','recebido')), 0) as recebido,
  -- medição acumulada
  coalesce((select sum(m.valor_medido) from public.medicao_obra m
    where m.projeto_id = p.id and m.deleted_at is null), 0) as medido_acumulado,
  coalesce((select sum(m.valor_retencao) from public.medicao_obra m
    where m.projeto_id = p.id and m.deleted_at is null and m.status = 'Faturada'), 0) as retido_acumulado,
  (select max(m.percentual_fisico) from public.medicao_obra m
    where m.projeto_id = p.id and m.deleted_at is null) as percentual_fisico
from public.projeto p
where p.deleted_at is null;

revoke all on public.v_margem_projeto from public;
revoke all on public.v_margem_projeto from anon;
grant select on public.v_margem_projeto to authenticated;

notify pgrst, 'reload schema';
