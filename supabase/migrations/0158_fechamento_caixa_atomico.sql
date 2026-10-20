-- 0158 — fechamento de caixa (fundo fixo): número seguro e operações atômicas
--
-- Problemas (PreLancamentosAReconciliar / AcrescentarPreLancamentoModal /
-- FechamentoCaixaModal / HistoricoFechamentosCaixa):
--   * número = count(fechamentos não apagados) + 1 no front: dois ao mesmo
--     tempo repetem, e desfazer um fechamento faz o PRÓXIMO repetir o último;
--   * fechar, acrescentar, aprovar e desfazer = várias gravações soltas; um
--     item podia entrar em dois fechamentos, e "acrescentar" regravava a lista
--     de itens a partir de uma cópia velha (perdia itens);
--   * aprovar o pagamento só trocava status: nenhum dinheiro saía de conta
--     nenhuma (as despesas "pagas" não lançavam extrato; a reposição do fundo
--     fixo não existia).
--
-- Agora:
--   * número: trigger com lock por empresa, maior número já usado (inclusive
--     apagados) + 1. Número digitado à mão que não repete é respeitado;
--   * fechar_caixa / acrescentar_ao_fechamento / aprovar_pagamento_fechamento /
--     desfazer_pagamento_fechamento / desfazer_fechamento_caixa: cada uma numa
--     transação, com trava de empresa e dos itens;
--   * aprovar: despesas dos itens ficam pagas (o trigger da 0155 lança o
--     extrato na conta delas) e, se informada a conta pagadora, a reposição
--     vira uma transferência conta pagadora → fundo fixo (criar_transferencia_atomica);
--     desfazer o pagamento desfaz a transferência junto.

-- 1. Coluna: transferência da reposição ------------------------------------
alter table public.fechamento_caixa
  add column if not exists despesas_baixadas_ids uuid[],
  add column if not exists transferencia_id uuid;

-- 2. Número sequencial -----------------------------------------------------
create or replace function public.tg_fechamento_caixa_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
begin
  perform pg_advisory_xact_lock(hashtext('fechamento_caixa:' || new.empresa_id::text));

  select coalesce(max(numero::int), 0) into v_max
    from public.fechamento_caixa
    where empresa_id = new.empresa_id
      and numero ~ '^\d{1,9}$';

  -- vazio, ou número que já existe/ficaria para trás (o count+1 do front): próximo
  if coalesce(trim(new.numero), '') = ''
     or (new.numero ~ '^\d{1,9}$' and new.numero::int <= v_max)
     or exists (select 1 from public.fechamento_caixa f
                 where f.empresa_id = new.empresa_id and f.numero = new.numero) then
    new.numero := lpad((v_max + 1)::text, 4, '0');
  end if;

  return new;
end;
$$;

revoke all on function public.tg_fechamento_caixa_numero() from public, anon, authenticated;

drop trigger if exists trg_fechamento_caixa_numero on public.fechamento_caixa;
create trigger trg_fechamento_caixa_numero
  before insert on public.fechamento_caixa
  for each row execute function public.tg_fechamento_caixa_numero();

-- 3. Helpers ---------------------------------------------------------------
-- ids dos itens (jsonb array de uuid; legado pode estar como string JSON)
create or replace function public._fechamento_itens(p jsonb)
returns uuid[]
language plpgsql
immutable
as $$
declare
  v jsonb := public._jsonb_desembrulhar(p);
  v_out uuid[] := '{}';
  v_t text;
begin
  if v is null or jsonb_typeof(v) <> 'array' then
    return v_out;
  end if;
  for v_t in select jsonb_array_elements_text(v) loop
    begin
      v_out := v_out || v_t::uuid;
    exception when others then
      null; -- id inválido no legado: ignora
    end;
  end loop;
  return v_out;
end;
$$;

-- valor do pré-lançamento (dados_extraidos.valor; legado pode ser string JSON)
create or replace function public._pre_lancamento_valor(p_dados jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(public._numero_br(public._jsonb_desembrulhar(p_dados) ->> 'valor'), 0);
$$;

-- 4. Fechar caixa ------------------------------------------------------------
create or replace function public.fechar_caixa(
  p_pre_lancamento_ids uuid[],
  p_usuario_nome text default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_ids uuid[];
  v_total numeric;
  v_n int;
  v_fc public.fechamento_caixa%rowtype;
begin
  perform public.exigir_empresa_do_chamador(v_empresa, 'fechamento');

  select array_agg(distinct x) into v_ids from unnest(p_pre_lancamento_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Selecione ao menos um pré-lançamento';
  end if;

  -- trava os itens e confere: da empresa, não apagados, fora de outro fechamento
  select count(*), coalesce(sum(public._pre_lancamento_valor(pl.dados_extraidos)), 0)
    into v_n, v_total
    from (select * from public.pre_lancamento
           where id = any (v_ids) and empresa_id = v_empresa and deleted_at is null
           for update) pl
   where coalesce(pl.status, '') not in ('Em Fechamento', 'Rejeitado');

  if v_n <> cardinality(v_ids) then
    raise exception 'Algum pré-lançamento não está disponível (já está em fechamento, rejeitado ou foi excluído). Recarregue a lista.';
  end if;

  if exists (
    select 1 from public.fechamento_caixa f
     where f.empresa_id = v_empresa
       and f.deleted_at is null
       and public._fechamento_itens(f.pre_lancamentos_ids) && v_ids
  ) then
    raise exception 'Algum pré-lançamento já está em outro fechamento. Recarregue a lista.';
  end if;

  insert into public.fechamento_caixa (
    empresa_id, status, pre_lancamentos_ids, valor_total,
    usuario_fechamento_email, usuario_fechamento_nome, data_fechamento,
    observacoes_fechamento, created_by
  ) values (
    v_empresa, 'Aguardando Pagamento', to_jsonb(v_ids), v_total,
    public.current_user_email(), p_usuario_nome, now(),
    p_observacoes, auth.uid()
  )
  returning * into v_fc;

  update public.pre_lancamento set status = 'Em Fechamento' where id = any (v_ids);

  return jsonb_build_object('id', v_fc.id, 'numero', v_fc.numero, 'valor_total', v_total, 'itens', v_n);
end;
$$;

revoke all on function public.fechar_caixa(uuid[], text, text) from public, anon;
grant execute on function public.fechar_caixa(uuid[], text, text) to authenticated, service_role;

-- 5. Acrescentar itens a um fechamento aguardando pagamento ------------------
create or replace function public.acrescentar_ao_fechamento(
  p_fechamento_id uuid,
  p_pre_lancamento_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fc public.fechamento_caixa%rowtype;
  v_ids uuid[];
  v_atuais uuid[];
  v_extra numeric;
  v_n int;
begin
  select * into v_fc from public.fechamento_caixa
    where id = p_fechamento_id and deleted_at is null
    for update;
  if v_fc.id is null then
    raise exception 'Fechamento não encontrado';
  end if;
  perform public.exigir_empresa_do_chamador(v_fc.empresa_id, 'fechamento');

  if v_fc.status <> 'Aguardando Pagamento' then
    raise exception 'Só dá para acrescentar itens a fechamento aguardando pagamento';
  end if;

  v_atuais := public._fechamento_itens(v_fc.pre_lancamentos_ids);
  select array_agg(distinct x) into v_ids
    from unnest(p_pre_lancamento_ids) x
   where x is not null and not (x = any (v_atuais));
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Selecione ao menos um pré-lançamento novo';
  end if;

  select count(*), coalesce(sum(public._pre_lancamento_valor(pl.dados_extraidos)), 0)
    into v_n, v_extra
    from (select * from public.pre_lancamento
           where id = any (v_ids) and empresa_id = v_fc.empresa_id and deleted_at is null
           for update) pl
   where pl.status = 'Pendente';

  if v_n <> cardinality(v_ids) then
    raise exception 'Algum pré-lançamento não está mais pendente. Recarregue a lista.';
  end if;

  if exists (
    select 1 from public.fechamento_caixa f
     where f.empresa_id = v_fc.empresa_id
       and f.deleted_at is null
       and f.id <> v_fc.id
       and public._fechamento_itens(f.pre_lancamentos_ids) && v_ids
  ) then
    raise exception 'Algum pré-lançamento já está em outro fechamento. Recarregue a lista.';
  end if;

  update public.fechamento_caixa
     set pre_lancamentos_ids = to_jsonb(v_atuais || v_ids),
         valor_total = coalesce(valor_total, 0) + v_extra
   where id = v_fc.id;

  update public.pre_lancamento set status = 'Em Fechamento' where id = any (v_ids);

  return jsonb_build_object('id', v_fc.id, 'acrescentados', v_n, 'valor_acrescentado', v_extra);
end;
$$;

revoke all on function public.acrescentar_ao_fechamento(uuid, uuid[]) from public, anon;
grant execute on function public.acrescentar_ao_fechamento(uuid, uuid[]) to authenticated, service_role;

-- 6. Aprovar o pagamento -------------------------------------------------------
create or replace function public.aprovar_pagamento_fechamento(
  p_fechamento_id uuid,
  p_data date,
  p_observacoes text default null,
  p_comprovante_url text default null,
  p_usuario_nome text default null,
  p_conta_pagadora_id uuid default null,
  p_conta_fundo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fc public.fechamento_caixa%rowtype;
  v_ids uuid[];
  v_fundo uuid;
  v_transf jsonb;
  v_transf_id uuid;
  v_n int;
  v_baixadas uuid[];
  v_repor numeric;
  v_fora int;
  v_parceladas int;
begin
  select * into v_fc from public.fechamento_caixa
    where id = p_fechamento_id and deleted_at is null
    for update;
  if v_fc.id is null then
    raise exception 'Fechamento não encontrado';
  end if;
  perform public.exigir_empresa_do_chamador(v_fc.empresa_id, 'fechamento');

  -- contas informadas: só desta empresa (a função é security definer)
  if p_conta_fundo_id is not null and not exists (
       select 1 from public.conta_financeira
        where id = p_conta_fundo_id and empresa_id = v_fc.empresa_id and deleted_at is null) then
    raise exception 'Conta do fundo fixo não encontrada nesta empresa';
  end if;
  if p_conta_pagadora_id is not null and not exists (
       select 1 from public.conta_financeira
        where id = p_conta_pagadora_id and empresa_id = v_fc.empresa_id and deleted_at is null) then
    raise exception 'Conta pagadora não encontrada nesta empresa';
  end if;

  if v_fc.status <> 'Aguardando Pagamento' then
    raise exception 'Fechamento não está aguardando pagamento (status: %)', v_fc.status;
  end if;
  if p_data is null then
    raise exception 'Informe a data do pagamento';
  end if;

  v_ids := public._fechamento_itens(v_fc.pre_lancamentos_ids);
  if cardinality(v_ids) = 0 then
    raise exception 'Fechamento sem itens';
  end if;

  perform 1 from public.pre_lancamento
    where id = any (v_ids) and empresa_id = v_fc.empresa_id
    for update;

  update public.pre_lancamento
     set status = 'Conciliado'
   where id = any (v_ids) and empresa_id = v_fc.empresa_id and deleted_at is null;
  get diagnostics v_n = row_count;

  -- despesas dos itens: pagas (na data do comprovante; o extrato vem do
  -- trigger). Parcelada fica de fora: o status dela não move o extrato (0155),
  -- marcar "pago" a deixaria paga sem sair dinheiro. Guarda quem foi baixado
  -- aqui: o desfazer reabre só essas.
  with baixadas as (
    update public.transacao_financeira t
       set status = 'pago',
           data_pagamento = coalesce(t.data_pagamento, t.data, t.data_vencimento, p_data)
      from public.pre_lancamento pl
     where pl.id = any (v_ids)
       and pl.empresa_id = v_fc.empresa_id
       and t.id = pl.transacao_id
       and t.empresa_id = v_fc.empresa_id
       and t.deleted_at is null
       and not coalesce(t.parcelado, false)
       and lower(trim(coalesce(t.status, ''))) not in ('pago', 'realizado', 'cancelado')
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_baixadas from baixadas;

  select count(*) into v_parceladas
    from public.pre_lancamento pl
    join public.transacao_financeira t on t.id = pl.transacao_id
   where pl.id = any (v_ids) and pl.empresa_id = v_fc.empresa_id
     and t.deleted_at is null and coalesce(t.parcelado, false)
     and lower(trim(coalesce(t.status, ''))) not in ('pago', 'realizado');

  -- reposição do fundo fixo: conta pagadora → fundo, pelo que saiu DO FUNDO.
  -- Antes transferia o valor_total mesmo com despesa lançada em outra conta
  -- (ex.: o banco): o banco pagava a despesa e a reposição — duas vezes.
  v_fundo := coalesce(p_conta_fundo_id, v_fc.conta_financeira_id);
  if p_conta_pagadora_id is not null then
    if v_fundo is null then
      raise exception 'Informe a conta do fundo fixo que recebe a reposição';
    end if;
    if p_conta_pagadora_id = v_fundo then
      raise exception 'A conta pagadora não pode ser o próprio fundo fixo';
    end if;

    select coalesce(sum(abs(t.valor)) filter (where t.conta_id = v_fundo), 0),
           count(*) filter (where t.conta_id is distinct from v_fundo)
      into v_repor, v_fora
      from public.pre_lancamento pl
      join public.transacao_financeira t on t.id = pl.transacao_id
     where pl.id = any (v_ids)
       and pl.empresa_id = v_fc.empresa_id
       and t.empresa_id = v_fc.empresa_id
       and t.deleted_at is null
       and lower(trim(coalesce(t.tipo, ''))) = 'despesa'
       and lower(trim(coalesce(t.status, ''))) in ('pago', 'realizado');

    if v_repor <= 0 then
      raise exception 'Nenhuma despesa paga deste fechamento saiu da conta do fundo fixo: não há reposição a lançar (aprove sem conta pagadora)';
    end if;
    v_transf := public.criar_transferencia_atomica(
      v_fc.empresa_id, p_conta_pagadora_id, v_fundo, v_repor, p_data,
      'Reposição do fundo fixo — fechamento #' || coalesce(v_fc.numero, ''), auth.uid()
    );
    v_transf_id := (v_transf ->> 'transferencia_id')::uuid;
  end if;

  update public.fechamento_caixa
     set status = 'Pago',
         usuario_pagamento_email = public.current_user_email(),
         usuario_pagamento_nome = p_usuario_nome,
         data_pagamento = p_data,
         observacoes_pagamento = p_observacoes,
         comprovante_pagamento_url = p_comprovante_url,
         conta_financeira_id = v_fundo,
         conta_financeira_nome = (select nome from public.conta_financeira
                                   where id = v_fundo and empresa_id = v_fc.empresa_id),
         transferencia_id = v_transf_id,
         despesas_baixadas_ids = v_baixadas
   where id = v_fc.id;

  return jsonb_build_object(
    'id', v_fc.id,
    'itens', v_n,
    'despesas_baixadas', cardinality(v_baixadas),
    'parceladas_ignoradas', v_parceladas,
    'transferencia_id', v_transf_id,
    'valor_reposicao', v_repor,
    'despesas_fora_do_fundo', coalesce(v_fora, 0)
  );
end;
$$;

revoke all on function public.aprovar_pagamento_fechamento(uuid, date, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.aprovar_pagamento_fechamento(uuid, date, text, text, text, uuid, uuid) to authenticated, service_role;

-- 7. Desfazer o pagamento --------------------------------------------------------
-- Espelho da aprovação: as despesas que ELA baixou voltam para em aberto (não
-- são mais apagadas — a tela antiga apagava inclusive as criadas no
-- "Conciliar", com anexos, e a nova aprovação não as recria), os itens voltam
-- para "Em Fechamento" com a despesa ligada, e a reposição é desfeita.
-- Fechamento aprovado antes desta migração (sem despesas_baixadas_ids): a
-- aprovação antiga marcava as despesas dos itens como pagas, então todas as
-- que estiverem pagas são reabertas.
create or replace function public.desfazer_pagamento_fechamento(p_fechamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fc public.fechamento_caixa%rowtype;
  v_ids uuid[];
  v_tx uuid[];
  v_reabertas int;
begin
  select * into v_fc from public.fechamento_caixa
    where id = p_fechamento_id and deleted_at is null
    for update;
  if v_fc.id is null then
    raise exception 'Fechamento não encontrado';
  end if;
  perform public.exigir_empresa_do_chamador(v_fc.empresa_id, 'fechamento');

  if v_fc.status <> 'Pago' then
    raise exception 'Fechamento não está pago';
  end if;

  v_ids := public._fechamento_itens(v_fc.pre_lancamentos_ids);

  select coalesce(array_agg(pl.transacao_id), '{}') into v_tx
    from public.pre_lancamento pl
   where pl.id = any (v_ids) and pl.empresa_id = v_fc.empresa_id and pl.transacao_id is not null;

  if v_fc.despesas_baixadas_ids is not null then
    v_tx := array(select unnest(v_tx) intersect select unnest(v_fc.despesas_baixadas_ids));
  end if;

  -- despesa conciliada com o banco trava aqui (trigger da 0155): mensagem clara
  update public.transacao_financeira
     set status = 'em_aberto', data_pagamento = null
   where id = any (v_tx) and empresa_id = v_fc.empresa_id and deleted_at is null
     and lower(trim(coalesce(status, ''))) in ('pago', 'realizado');
  get diagnostics v_reabertas = row_count;

  update public.pre_lancamento
     set status = 'Em Fechamento'
   where id = any (v_ids) and empresa_id = v_fc.empresa_id;

  if v_fc.transferencia_id is not null then
    update public.extrato_bancario set deleted_at = now()
     where empresa_id = v_fc.empresa_id
       and hash_linha in ('transf:' || v_fc.transferencia_id || ':out',
                          'transf:' || v_fc.transferencia_id || ':in')
       and deleted_at is null;
    update public.transacao_transferencia set deleted_at = now()
     where id = v_fc.transferencia_id and empresa_id = v_fc.empresa_id;
  end if;

  update public.fechamento_caixa
     set status = 'Aguardando Pagamento',
         usuario_pagamento_email = null,
         usuario_pagamento_nome = null,
         data_pagamento = null,
         observacoes_pagamento = null,
         comprovante_pagamento_url = null,
         transferencia_id = null,
         despesas_baixadas_ids = null
   where id = v_fc.id;

  return jsonb_build_object('id', v_fc.id, 'despesas_reabertas', v_reabertas);
end;
$$;

revoke all on function public.desfazer_pagamento_fechamento(uuid) from public, anon;
grant execute on function public.desfazer_pagamento_fechamento(uuid) to authenticated, service_role;

-- 8. Desfazer o fechamento (ainda não pago) -------------------------------------
create or replace function public.desfazer_fechamento_caixa(p_fechamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fc public.fechamento_caixa%rowtype;
  v_ids uuid[];
begin
  select * into v_fc from public.fechamento_caixa
    where id = p_fechamento_id and deleted_at is null
    for update;
  if v_fc.id is null then
    raise exception 'Fechamento não encontrado';
  end if;
  perform public.exigir_empresa_do_chamador(v_fc.empresa_id, 'fechamento');

  if v_fc.status = 'Pago' then
    raise exception 'Fechamento pago: desfaça o pagamento antes';
  end if;

  v_ids := public._fechamento_itens(v_fc.pre_lancamentos_ids);

  update public.pre_lancamento
     set status = case when transacao_id is not null then 'Conciliado' else 'Pendente' end
   where id = any (v_ids) and empresa_id = v_fc.empresa_id and status = 'Em Fechamento';

  update public.fechamento_caixa set deleted_at = now() where id = v_fc.id;

  return jsonb_build_object('id', v_fc.id, 'itens', cardinality(v_ids));
end;
$$;

revoke all on function public.desfazer_fechamento_caixa(uuid) from public, anon;
grant execute on function public.desfazer_fechamento_caixa(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Conferência (SQL editor): números de fechamento já repetidos
--
--   select empresa_id, numero, count(*) from fechamento_caixa
--    where deleted_at is null group by 1, 2 having count(*) > 1;
