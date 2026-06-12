-- ============================================================================
-- 0064_medicao_impostos_retidos.sql — ISS/INSS retidos na fonte, por medição
--
-- Realidade de contrato público (CEMIG/órgãos): a contratante retém ISS e
-- INSS na fatura. O que entra na conta = medido − retenção contratual −
-- ISS − INSS. Sem registrar isso, o contas-a-receber fica inflado e a margem
-- por obra ignora o custo fiscal.
--
-- Decisão do dono (mesma da retenção contratual): % varia por contrato →
-- campos configuráveis POR OBRA, snapshot na medição.
--
-- Ao faturar (faturar_medicao v3):
--   - receita líquida = medido − retenção − ISS − INSS  (o que entra de fato)
--   - receita de retenção contratual (caução, como antes)
--   - ISS e INSS viram DESPESAS vinculadas (categoria fiscal), status 'pago'
--     com data = vencimento da fatura: entram no custo da obra (margem certa)
--     e na DRE, e NÃO mexem no saldo bancário (saldo vem do extrato, 0035).
-- ============================================================================

-- 1. Config por obra + snapshot na medição -------------------------------------
alter table public.projeto
  add column if not exists iss_percentual numeric(5,2) default 0,
  add column if not exists inss_percentual numeric(5,2) default 0;

comment on column public.projeto.iss_percentual is
  'ISS retido na fonte pela contratante (%) — varia por contrato/município.';
comment on column public.projeto.inss_percentual is
  'INSS retido na fonte pela contratante (%) — varia por contrato.';

alter table public.medicao_obra
  add column if not exists iss_percentual numeric(5,2),
  add column if not exists inss_percentual numeric(5,2),
  add column if not exists valor_iss numeric(14,2),
  add column if not exists valor_inss numeric(14,2),
  add column if not exists transacao_iss_id uuid,
  add column if not exists transacao_inss_id uuid;

-- snapshot dos % fiscais no insert (igual à retenção contratual)
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
  if new.retencao_percentual is null or new.iss_percentual is null
     or new.inss_percentual is null then
    select
      coalesce(new.retencao_percentual, p.retencao_percentual, 0),
      coalesce(new.iss_percentual, p.iss_percentual, 0),
      coalesce(new.inss_percentual, p.inss_percentual, 0)
    into new.retencao_percentual, new.iss_percentual, new.inss_percentual
      from public.projeto p where p.id = new.projeto_id;
  end if;
  if new.competencia is not null then
    new.competencia := date_trunc('month', new.competencia)::date;
  end if;
  return new;
end;
$$;

-- 2. referencia_tipo: permite linkar os impostos à medição ----------------------
alter table public.transacao_financeira
  drop constraint if exists transacao_financeira_referencia_tipo_check;
alter table public.transacao_financeira
  add constraint transacao_financeira_referencia_tipo_check
  check (referencia_tipo = any (array[
    'Pedido', 'OFX', 'Manual', 'Fatura', 'Outro',
    'medicao_obra', 'medicao_obra_retencao', 'medicao_obra_imposto'
  ]));

-- 3. faturar_medicao v3 — líquido desconta ISS/INSS + lança as despesas fiscais -
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
  v_iss_pct numeric(5,2);
  v_inss_pct numeric(5,2);
  v_ret numeric(14,2);
  v_iss numeric(14,2);
  v_inss numeric(14,2);
  v_liq numeric(14,2);
  v_rec_id uuid;
  v_ret_id uuid;
  v_iss_id uuid;
  v_inss_id uuid;
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

  v_pct      := coalesce(v_m.retencao_percentual, v_p.retencao_percentual, 0);
  v_iss_pct  := coalesce(v_m.iss_percentual, v_p.iss_percentual, 0);
  v_inss_pct := coalesce(v_m.inss_percentual, v_p.inss_percentual, 0);

  v_ret  := round(v_m.valor_medido * v_pct / 100.0, 2);
  v_iss  := round(v_m.valor_medido * v_iss_pct / 100.0, 2);
  v_inss := round(v_m.valor_medido * v_inss_pct / 100.0, 2);
  v_liq  := v_m.valor_medido - v_ret - v_iss - v_inss;

  if v_liq < 0 then
    raise exception 'Percentuais somados excedem 100%% (retenção %% + ISS %% + INSS %%)';
  end if;

  -- receita líquida (o que efetivamente entra na conta)
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
    'Medido R$ ' || v_m.valor_medido ||
      case when v_ret > 0 then ' • retenção ' || v_pct || '% (R$ ' || v_ret || ')' else '' end ||
      case when v_iss > 0 then ' • ISS ' || v_iss_pct || '% (R$ ' || v_iss || ')' else '' end ||
      case when v_inss > 0 then ' • INSS ' || v_inss_pct || '% (R$ ' || v_inss || ')' else '' end
  ) returning id into v_rec_id;

  -- receita de retenção contratual (caução a receber no fim do contrato)
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

  -- impostos retidos na fonte: DESPESA paga na data da fatura (não transita
  -- pelo caixa bancário — o saldo vem do extrato; aqui é custo/DRE da obra)
  if v_iss > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, data_vencimento, data_pagamento, status,
      descricao, projeto_id, projeto_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Despesa', v_iss, current_date, p_data_vencimento, p_data_vencimento, 'pago',
      'ISS retido ' || v_iss_pct || '% — Medição #' || v_m.numero || ' — ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome,
      'medicao_obra_imposto', v_m.id,
      'Retido na fonte pela contratante — não transita pelo caixa.'
    ) returning id into v_iss_id;
  end if;

  if v_inss > 0 then
    insert into public.transacao_financeira (
      empresa_id, tipo, valor, data, data_vencimento, data_pagamento, status,
      descricao, projeto_id, projeto_nome,
      referencia_tipo, referencia_id, observacoes
    ) values (
      v_m.empresa_id, 'Despesa', v_inss, current_date, p_data_vencimento, p_data_vencimento, 'pago',
      'INSS retido ' || v_inss_pct || '% — Medição #' || v_m.numero || ' — ' || coalesce(v_p.nome, 'obra'),
      v_p.id, v_p.nome,
      'medicao_obra_imposto', v_m.id,
      'Retido na fonte pela contratante — não transita pelo caixa.'
    ) returning id into v_inss_id;
  end if;

  update public.medicao_obra
     set status = 'Faturada',
         retencao_percentual = v_pct,
         iss_percentual = v_iss_pct,
         inss_percentual = v_inss_pct,
         valor_retencao = v_ret,
         valor_iss = v_iss,
         valor_inss = v_inss,
         valor_liquido = v_liq,
         transacao_receita_id = v_rec_id,
         transacao_retencao_id = v_ret_id,
         transacao_iss_id = v_iss_id,
         transacao_inss_id = v_inss_id,
         data_faturamento = now(),
         updated_at = now()
   where id = p_medicao_id;

  return jsonb_build_object(
    'medicao', v_m.numero,
    'valor_medido', v_m.valor_medido,
    'retencao_percentual', v_pct,
    'valor_retencao', v_ret,
    'valor_iss', v_iss,
    'valor_inss', v_inss,
    'valor_liquido', v_liq,
    'transacao_receita_id', v_rec_id,
    'mensagem', 'Medição faturada: líquido R$ ' || v_liq ||
      case when v_ret > 0 then ' • retenção R$ ' || v_ret else '' end ||
      case when v_iss > 0 then ' • ISS R$ ' || v_iss else '' end ||
      case when v_inss > 0 then ' • INSS R$ ' || v_inss else '' end
  );
end;
$$;

-- grants preservados (create or replace); assinatura inalterada.
notify pgrst, 'reload schema';
