-- 0156 — extrato bancário importado (OFX/CSV) e conciliação
--
-- Problemas (ConciliacaoBancaria.jsx):
--   * a importação gravava |TRNAMT| (débito entrava POSITIVO) numa tabela cujo
--     total É o saldo da conta: cada débito importado AUMENTAVA o saldo, e cada
--     pagamento conciliado contava duas vezes (linha do sistema + linha do banco);
--   * sem hash: reimportar o mesmo arquivo duplicava tudo; linha a linha, sem
--     transação — um erro no meio deixava a importação pela metade;
--   * conciliar/desfazer = 2 gravações soltas do front (uma pode falhar);
--   * regra_conciliacao não tem as colunas que a tela grava (tipo_match,
--     palavras_chave, ignorar_descricao) → todo salvar de regra falhava.
--
-- Agora:
--   * o saldo da conta é saldo_inicial + linhas DO SISTEMA (pagamentos e
--     transferências). Linha importada do banco é só para conciliar;
--   * importar_extrato_bancario(): uma chamada, uma transação, hash por FITID
--     (ou pelo conteúdo) com "on conflict do nothing" → reimportar não duplica;
--   * conciliar_extrato() / desconciliar_transacao(): os dois lados juntos;
--   * colunas que faltavam em regra_conciliacao.
--
-- EFEITO VISÍVEL: nas contas que já tiveram extrato importado, o saldo muda
-- (as linhas importadas deixam de somar). Conferir antes com a consulta do
-- final deste arquivo.

-- 1. Saldo: só linhas do sistema -----------------------------------------
create or replace function public._extrato_eh_do_banco(e public.extrato_bancario)
returns boolean
language sql
immutable
as $$
  select e.status_conciliacao is not null
      or e.upload_id is not null
      or upper(coalesce(e.origem, '')) = 'OFX';
$$;

create or replace function public._saldo_extrato(p_conta_id uuid, p_empresa_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(e.valor), 0)
    from public.extrato_bancario e
   where e.conta_id = p_conta_id
     and e.empresa_id = p_empresa_id
     and e.deleted_at is null
     and not public._extrato_eh_do_banco(e);
$$;

revoke all on function public._saldo_extrato(uuid, uuid) from public, anon, authenticated;

-- linha importada não dispara recálculo à toa, mas se disparar dá o mesmo valor
-- (a fórmula acima já a ignora). Recalcula todas as contas uma vez:
do $$
declare
  r record;
begin
  for r in select id from public.conta_financeira where deleted_at is null loop
    perform public.recalcular_saldo_conta(r.id);
  end loop;
end $$;

-- sentido da linha do banco: +1 entrada, -1 saída, 0 desconhecido. A linha
-- importada antes desta migração (sem hash_linha) tem o valor SEM sinal, e o
-- leitor antigo gravava 'debito' para todo TRNTYPE que não fosse CREDIT
-- (inclusive DEP, XFER, INT): positiva + 'debito' sem hash não diz o sentido.
create or replace function public._extrato_sentido(e public.extrato_bancario)
returns int
language sql
immutable
as $$
  select case
           when e.valor < 0 then -1
           when e.hash_linha is null and lower(coalesce(e.tipo, '')) like 'deb%' then 0
           when lower(coalesce(e.tipo, '')) like 'deb%' then -1
           else 1
         end;
$$;

-- 2. Importação do extrato ----------------------------------------------
-- p_linhas: [{ "data": "2026-09-29", "valor": -123.45, "descricao": "...",
--              "fitid": "...", "documento": "..." }]  (valor COM sinal)
create or replace function public.importar_extrato_bancario(
  p_conta_id uuid,
  p_linhas jsonb,
  p_nome_arquivo text default null,
  p_url_arquivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta public.conta_financeira%rowtype;
  v_upload uuid;
  v_l jsonb;
  v_data date;
  v_valor numeric;
  v_desc text;
  v_doc text;
  v_fitid text;
  v_chave text;
  v_hash text;
  v_rep jsonb := '{}'::jsonb;
  v_n int;
  v_chave_leg text;
  v_rep_leg jsonb := '{}'::jsonb;
  v_n_leg int;
  v_total int := 0;
  v_import int := 0;
  v_dup int := 0;
  v_inval int := 0;
  v_min date;
  v_max date;
begin
  select * into v_conta
    from public.conta_financeira
    where id = p_conta_id and deleted_at is null;

  if v_conta.id is null then
    raise exception 'Conta não encontrada';
  end if;

  perform public.exigir_empresa_do_chamador(v_conta.empresa_id, 'conta');

  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Nenhuma linha para importar';
  end if;

  insert into public.upload_ofx (
    empresa_id, conta_id, conta_nome, nome_arquivo, url_arquivo, status, created_by
  ) values (
    v_conta.empresa_id, v_conta.id, v_conta.nome,
    coalesce(nullif(trim(p_nome_arquivo), ''), 'extrato'), p_url_arquivo, 'Recebido', auth.uid()
  )
  returning id into v_upload;

  for v_l in select * from jsonb_array_elements(p_linhas) loop
    v_total := v_total + 1;
    v_data := public._data_iso(v_l ->> 'data');
    v_valor := public._numero_br(v_l ->> 'valor');
    v_desc := nullif(trim(coalesce(v_l ->> 'descricao', '')), '');
    v_doc := nullif(trim(coalesce(v_l ->> 'documento', '')), '');
    v_fitid := nullif(trim(coalesce(v_l ->> 'fitid', '')), '');

    if v_data is null or v_valor is null or v_valor = 0 then
      v_inval := v_inval + 1;
      continue;
    end if;

    -- extrato importado ANTES desta migração: sem hash_linha e com o valor
    -- gravado sem sinal (e o sentido em tipo nem sempre certo). Reimportar o
    -- mesmo período não pode duplicar: casa por data + valor absoluto, contando
    -- as repetições (2 linhas iguais no arquivo só pulam se houver 2 no
    -- legado). Descrição e sentido não entram: o leitor antigo os gravava
    -- de outro jeito.
    v_chave_leg := v_data::text || '|' || round(abs(v_valor), 2)::text;
    v_n_leg := coalesce((v_rep_leg ->> v_chave_leg)::int, 0) + 1;
    v_rep_leg := v_rep_leg || jsonb_build_object(v_chave_leg, v_n_leg);
    if v_n_leg <= (
      select count(*)
        from public.extrato_bancario e
       where e.conta_id = v_conta.id
         and e.deleted_at is null
         and e.hash_linha is null
         and public._extrato_eh_do_banco(e)
         and e.data = v_data
         and round(abs(e.valor), 2) = round(abs(v_valor), 2)
    ) then
      v_dup := v_dup + 1;
      continue;
    end if;

    if v_fitid is not null then
      v_hash := 'ofx:' || v_fitid;
    else
      -- sem FITID: pelo conteúdo; linhas idênticas no mesmo arquivo viram #1, #2...
      v_chave := md5(v_data::text || '|' || v_valor::text || '|' || coalesce(v_desc, '') || '|' || coalesce(v_doc, ''));
      v_n := coalesce((v_rep ->> v_chave)::int, 0) + 1;
      v_rep := v_rep || jsonb_build_object(v_chave, v_n);
      v_hash := 'lin:' || v_chave || ':' || v_n;
    end if;

    insert into public.extrato_bancario (
      empresa_id, conta_id, conta_nome, data, historico, descricao, documento, valor,
      tipo, origem, hash_linha, conciliado, status_conciliacao, upload_id, created_by
    ) values (
      v_conta.empresa_id, v_conta.id, v_conta.nome, v_data, v_desc, v_desc, v_doc, v_valor,
      case when v_valor < 0 then 'debito' else 'credito' end,
      'OFX', v_hash, false, 'pendente', v_upload, auth.uid()
    )
    on conflict (conta_id, hash_linha) do nothing;

    if found then
      v_import := v_import + 1;
      v_min := least(coalesce(v_min, v_data), v_data);
      v_max := greatest(coalesce(v_max, v_data), v_data);
    else
      v_dup := v_dup + 1;
    end if;
  end loop;

  update public.upload_ofx
     set status = 'Processado',
         total_linhas = v_total,
         linhas_importadas = v_import,
         periodo_inicio = v_min,
         periodo_fim = v_max
   where id = v_upload;

  return jsonb_build_object(
    'upload_id', v_upload,
    'total', v_total,
    'importadas', v_import,
    'duplicadas', v_dup,
    'invalidas', v_inval
  );
end;
$$;

revoke all on function public.importar_extrato_bancario(uuid, jsonb, text, text) from public, anon;
grant execute on function public.importar_extrato_bancario(uuid, jsonb, text, text) to authenticated, service_role;

-- 3. Conciliação ---------------------------------------------------------
-- Liga UMA linha do banco a UMA transação. Transação ainda em aberto é baixada
-- na data da linha (o trigger da 0155 lança o pagamento no extrato do sistema).
create or replace function public.conciliar_extrato(p_extrato_id uuid, p_transacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ext public.extrato_bancario%rowtype;
  v_tx public.transacao_financeira%rowtype;
begin
  select * into v_ext from public.extrato_bancario
    where id = p_extrato_id and deleted_at is null
    for update;
  if v_ext.id is null then
    raise exception 'Linha do extrato não encontrada';
  end if;
  perform public.exigir_empresa_do_chamador(v_ext.empresa_id, 'extrato');

  select * into v_tx from public.transacao_financeira
    where id = p_transacao_id and deleted_at is null
    for update;
  if v_tx.id is null then
    raise exception 'Lançamento não encontrado';
  end if;

  if v_tx.empresa_id <> v_ext.empresa_id then
    raise exception 'Acesso negado: lançamento de outra empresa' using errcode = '42501';
  end if;
  if not public._extrato_eh_do_banco(v_ext) then
    raise exception 'Só linhas importadas do extrato do banco podem ser conciliadas';
  end if;
  if v_ext.transacao_id is not null or coalesce(v_ext.status_conciliacao, '') = 'conciliado' then
    raise exception 'Esta linha do extrato já está conciliada';
  end if;
  if coalesce(v_tx.conciliado, false) then
    raise exception 'Este lançamento já está conciliado com outra linha do extrato';
  end if;
  if v_tx.conta_id is distinct from v_ext.conta_id then
    raise exception 'O lançamento está em outra conta: corrija a conta do lançamento antes de conciliar';
  end if;
  if (lower(trim(coalesce(v_tx.tipo, ''))) = 'receita' and public._extrato_sentido(v_ext) < 0)
     or (lower(trim(coalesce(v_tx.tipo, ''))) = 'despesa' and public._extrato_sentido(v_ext) > 0) then
    raise exception 'Sentidos diferentes: % no sistema com uma % no extrato do banco',
      case when lower(trim(coalesce(v_tx.tipo, ''))) = 'receita' then 'receita' else 'despesa' end,
      case when public._extrato_sentido(v_ext) < 0 then 'saída' else 'entrada' end;
  end if;

  if lower(trim(coalesce(v_tx.status, ''))) not in ('pago', 'realizado') then
    if coalesce(v_tx.parcelado, false) then
      raise exception 'Lançamento parcelado em aberto: pague a parcela antes de conciliar';
    end if;
    update public.transacao_financeira
       set status = 'pago',
           data_pagamento = v_ext.data
     where id = v_tx.id;
  end if;

  update public.transacao_financeira
     set conciliado = true,
         extrato_id = v_ext.id
   where id = v_tx.id;

  update public.extrato_bancario
     set status_conciliacao = 'conciliado',
         transacao_id = v_tx.id,
         data_conciliacao = current_date,
         conciliado = true
   where id = v_ext.id;

  return jsonb_build_object('extrato_id', v_ext.id, 'transacao_id', v_tx.id);
end;
$$;

revoke all on function public.conciliar_extrato(uuid, uuid) from public, anon;
grant execute on function public.conciliar_extrato(uuid, uuid) to authenticated, service_role;

-- Desfaz a conciliação de um lançamento (todas as linhas do banco ligadas a ele).
create or replace function public.desconciliar_transacao(p_transacao_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transacao_financeira%rowtype;
  v_n int;
begin
  select * into v_tx from public.transacao_financeira
    where id = p_transacao_id
    for update;
  if v_tx.id is null then
    raise exception 'Lançamento não encontrado';
  end if;
  perform public.exigir_empresa_do_chamador(v_tx.empresa_id, 'lançamento');

  update public.extrato_bancario e
     set status_conciliacao = 'pendente',
         transacao_id = null,
         data_conciliacao = null,
         conciliado = false
   where e.empresa_id = v_tx.empresa_id
     and e.deleted_at is null
     and public._extrato_eh_do_banco(e)
     and (e.transacao_id = v_tx.id or e.id = v_tx.extrato_id);
  get diagnostics v_n = row_count;

  update public.transacao_financeira
     set conciliado = false,
         extrato_id = null
   where id = v_tx.id;

  return v_n;
end;
$$;

revoke all on function public.desconciliar_transacao(uuid) from public, anon;
grant execute on function public.desconciliar_transacao(uuid) to authenticated, service_role;

-- 4. Regras de conciliação: colunas que a tela grava -----------------------
alter table public.regra_conciliacao
  add column if not exists tipo_match text default 'contem',
  add column if not exists palavras_chave text,
  add column if not exists ignorar_descricao boolean default false;

notify pgrst, 'reload schema';

-- Conferência (rodar ANTES de aplicar, no SQL editor) — saldo de hoje × saldo
-- sem as linhas importadas do banco, por conta:
--
--   select c.empresa_id, c.nome, c.saldo_atual as hoje,
--          coalesce(c.saldo_inicial,0) + coalesce(sum(e.valor) filter (
--            where e.status_conciliacao is null and e.upload_id is null
--              and upper(coalesce(e.origem,'')) <> 'OFX'), 0) as depois,
--          count(*) filter (where e.status_conciliacao is not null
--              or upper(coalesce(e.origem,'')) = 'OFX') as linhas_importadas
--     from conta_financeira c
--     left join extrato_bancario e on e.conta_id = c.id and e.deleted_at is null
--    where c.deleted_at is null
--    group by c.id
--   having count(*) filter (where e.status_conciliacao is not null
--              or upper(coalesce(e.origem,'')) = 'OFX') > 0;
