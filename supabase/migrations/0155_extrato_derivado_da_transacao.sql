-- 0155 — o extrato do sistema passa a ser derivado da transação
--
-- O saldo da conta é saldo_inicial + soma do extrato_bancario (0035). Quem
-- criava/apagava a linha do extrato ao pagar era o FRONT, em ~15 lugares, cada
-- um de um jeito, sem transação:
--   * "Marcar como Pago" (ModalPagamento/DetalheDespesaModal), baixa em lote,
--     aprovação do fechamento de caixa e import de planilha só trocavam o
--     status → despesa "paga" sem sair dinheiro de conta nenhuma;
--   * despesa parcelada lançava no extrato TODAS as parcelas como débito já na
--     criação (antes de pagar) e pagar/desfazer parcela não mexia no extrato;
--   * "Marcar como Pendente" no formulário não tirava a linha do extrato;
--   * desmarcar o pagamento/excluir apagava também a linha do banco (OFX)
--     conciliada com a transação.
--
-- Agora o banco garante a regra, na MESMA transação do UPDATE/INSERT:
--   transação paga (status pago/realizado) em conta → 1 linha "tx:<id>";
--   parcelada → 1 linha "tx:<id>:p<n>" por parcela PAGA;
--   não paga, cancelada, excluída, sem conta ou imposto retido na fonte
--   (medicao_obra_imposto: "não transita pelo caixa") → nenhuma linha.
-- As linhas do sistema são identificadas por transacao_id + hash "tx:" (ou
-- sem hash, as antigas do front); linhas de extrato bancário importado
-- (status_conciliacao / origem OFX / upload_id) e de transferência ("transf:")
-- nunca são criadas nem apagadas aqui.
--
-- Compatível com o front já publicado: se ele ainda inserir a linha "à mão"
-- (sem hash), o trigger da seção 4b re-sincroniza e descarta a duplicata.
--
-- NÃO corrige sozinho o que já está gravado: cada transação é ajustada quando
-- for alterada. Para acertar tudo de uma vez: financeiro_diagnostico_extrato()
-- mostra a diferença (só leitura) e financeiro_ressincronizar_extrato() aplica
-- — ambos só pelo servidor (SQL editor), a rodar DEPOIS de conferir.

-- 1. Helpers -------------------------------------------------------------

-- número vindo do JSON das parcelas: 123.45 | "123.45" | "1.234,56" | lixo → null
create or replace function public._numero_br(p text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := trim(coalesce(p, ''));
begin
  if v = '' then
    return null;
  end if;
  if v ~ ',' then
    v := replace(replace(v, '.', ''), ',', '.');
  end if;
  return v::numeric;
exception when others then
  return null;
end;
$$;

-- data vinda do JSON das parcelas: "2026-09-29" | lixo → null
create or replace function public._data_iso(p text)
returns date
language plpgsql
immutable
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then
    return null;
  end if;
  return left(p, 10)::date;
exception when others then
  return null;
end;
$$;

-- jsonb que pode ter sido gravado como string JSON (JSON.stringify no front)
create or replace function public._jsonb_desembrulhar(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if p is null then
    return null;
  end if;
  if jsonb_typeof(p) = 'string' then
    return (p #>> '{}')::jsonb;
  end if;
  return p;
exception when others then
  return null;
end;
$$;

-- linha "do sistema" (gerada por pagamento de transação), e não linha de
-- extrato bancário importado nem de transferência
create or replace function public._extrato_eh_do_sistema(e public.extrato_bancario)
returns boolean
language sql
immutable
as $$
  select e.status_conciliacao is null
     and e.upload_id is null
     and upper(coalesce(e.origem, '')) <> 'OFX'
     and (e.hash_linha is null or e.hash_linha like 'tx:%');
$$;

-- saldo da conta pelo extrato (a 0156 tira daqui as linhas importadas do banco)
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
     and e.deleted_at is null;
$$;

revoke all on function public._saldo_extrato(uuid, uuid) from public, anon, authenticated;

-- 2. Linhas que a transação DEVE ter no extrato ---------------------------
create or replace function public.financeiro_extrato_esperado(p_tx public.transacao_financeira)
returns table (hash_linha text, data date, valor numeric)
language plpgsql
stable
as $$
declare
  v_sinal int;
  v_parcelas jsonb;
  v_p jsonb;
  v_i int;
  v_valor numeric;
begin
  v_sinal := case lower(trim(coalesce(p_tx.tipo, '')))
               when 'receita' then 1
               when 'despesa' then -1
               else 0
             end;

  if v_sinal = 0
     or p_tx.deleted_at is not null
     or p_tx.conta_id is null
     or coalesce(p_tx.referencia_tipo, '') = 'medicao_obra_imposto' then
    return;
  end if;

  v_parcelas := public._jsonb_desembrulhar(p_tx.parcelas);

  if coalesce(p_tx.parcelado, false)
     and jsonb_typeof(v_parcelas) = 'array'
     and jsonb_array_length(v_parcelas) > 0 then
    for v_i in 0 .. jsonb_array_length(v_parcelas) - 1 loop
      v_p := v_parcelas -> v_i;
      if jsonb_typeof(v_p) <> 'object' then
        continue;
      end if;
      v_valor := abs(coalesce(public._numero_br(v_p ->> 'valor'), 0));
      if lower(coalesce(v_p ->> 'status', '')) in ('pago', 'realizado') and v_valor > 0 then
        hash_linha := 'tx:' || p_tx.id || ':p' || (v_i + 1);
        data := coalesce(
          public._data_iso(v_p ->> 'data_pagamento'),
          public._data_iso(v_p ->> 'data_vencimento'),
          p_tx.data_vencimento,
          p_tx.data
        );
        valor := v_sinal * v_valor;
        return next;
      end if;
    end loop;
    return;
  end if;

  if lower(trim(coalesce(p_tx.status, ''))) in ('pago', 'realizado')
     and coalesce(p_tx.valor, 0) <> 0 then
    hash_linha := 'tx:' || p_tx.id;
    data := coalesce(p_tx.data_pagamento, p_tx.data_vencimento, p_tx.data);
    valor := v_sinal * abs(p_tx.valor);
    return next;
  end if;
end;
$$;

-- 3. Sincroniza as linhas do sistema de UMA transação ----------------------
-- p_empresa_id: empresa da transação (usada quando ela já foi apagada de vez)
create or replace function public._financeiro_sincronizar_extrato(
  p_transacao_id uuid,
  p_empresa_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transacao_financeira%rowtype;
  v_existe boolean;
  v_empresa uuid;
  v_esp record;
  v_ext public.extrato_bancario%rowtype;
  v_manter uuid[] := '{}';
begin
  if p_transacao_id is null then
    return;
  end if;

  select * into v_tx from public.transacao_financeira where id = p_transacao_id;
  v_existe := found;
  v_empresa := case when v_existe then v_tx.empresa_id else p_empresa_id end;

  if v_empresa is null then
    return;
  end if;
  perform public.exigir_empresa_do_chamador(v_empresa, 'lançamento');

  if v_existe then
    -- tipo desconhecido (legado): não mexe em nada
    if lower(trim(coalesce(v_tx.tipo, ''))) not in ('receita', 'despesa') then
      return;
    end if;

    for v_esp in select * from public.financeiro_extrato_esperado(v_tx) loop
      -- a linha já existe (mesma conta + hash), inclusive apagada: atualiza/revive
      select * into v_ext
        from public.extrato_bancario e
        where e.conta_id = v_tx.conta_id
          and e.hash_linha = v_esp.hash_linha
        limit 1;

      if found then
        if v_ext.deleted_at is not null
           or v_ext.data is distinct from v_esp.data
           or v_ext.valor is distinct from v_esp.valor
           or v_ext.historico is distinct from v_tx.descricao
           or v_ext.conta_nome is distinct from v_tx.conta_nome
           or v_ext.categoria is distinct from v_tx.categoria_nome
           or v_ext.transacao_id is distinct from v_tx.id then
          update public.extrato_bancario
             set deleted_at = null,
                 data = v_esp.data,
                 valor = v_esp.valor,
                 historico = v_tx.descricao,
                 descricao = v_tx.descricao,
                 categoria = v_tx.categoria_nome,
                 conta_nome = v_tx.conta_nome,
                 tipo = case when v_esp.valor < 0 then 'debito' else 'credito' end,
                 transacao_id = v_tx.id
           where id = v_ext.id;
        end if;
      else
        insert into public.extrato_bancario (
          empresa_id, conta_id, conta_nome, data, historico, descricao, valor,
          tipo, categoria, origem, hash_linha, conciliado, transacao_id, created_by
        ) values (
          v_tx.empresa_id, v_tx.conta_id, v_tx.conta_nome, v_esp.data, v_tx.descricao,
          v_tx.descricao, v_esp.valor,
          case when v_esp.valor < 0 then 'debito' else 'credito' end,
          v_tx.categoria_nome, 'Manual', v_esp.hash_linha, false, v_tx.id, auth.uid()
        )
        returning * into v_ext;
      end if;
      v_manter := v_manter || v_ext.id;
    end loop;
  end if;

  -- o resto das linhas do sistema desta transação sai (inclui as antigas sem
  -- hash, gravadas pelo front, e as parcelas lançadas antes de pagar)
  update public.extrato_bancario e
     set deleted_at = now()
   where e.transacao_id = p_transacao_id
     and e.empresa_id = v_empresa
     and e.deleted_at is null
     and public._extrato_eh_do_sistema(e)
     and not (e.id = any (v_manter));

  -- transação excluída: a linha do banco conciliada com ela volta a pendente
  if not v_existe or v_tx.deleted_at is not null then
    update public.extrato_bancario e
       set transacao_id = null,
           status_conciliacao = 'pendente',
           data_conciliacao = null,
           conciliado = false
     where e.transacao_id = p_transacao_id
       and e.empresa_id = v_empresa
       and e.deleted_at is null
       and not public._extrato_eh_do_sistema(e);
  end if;
end;
$$;

revoke all on function public._financeiro_sincronizar_extrato(uuid, uuid) from public, anon, authenticated;

-- 4. Triggers -------------------------------------------------------------

-- 4a. transação mudou → extrato acompanha
-- As linhas que a transação deve ter (hash, data, valor) são as mesmas antes e
-- depois do UPDATE?
create or replace function public._financeiro_mesmo_extrato(
  p_antes public.transacao_financeira,
  p_depois public.transacao_financeira
)
returns boolean
language sql
stable
as $$
  select coalesce((select array_agg(row(x.hash_linha, x.data, x.valor)::text order by x.hash_linha)
                     from public.financeiro_extrato_esperado(p_antes) x), '{}')
       = coalesce((select array_agg(row(x.hash_linha, x.data, x.valor)::text order by x.hash_linha)
                     from public.financeiro_extrato_esperado(p_depois) x), '{}');
$$;

-- Só re-sincroniza quando o UPDATE muda o efeito no dinheiro (linhas
-- esperadas, conta ou tipo). Mudança que não mexe em dinheiro — o cron que
-- passa em_aberto → atrasado (0037), descrição, categoria — só atualiza o
-- texto das linhas que esta regra já criou ("tx:"): o legado desta transação
-- (linha faltando, parcela lançada antes de paga) NÃO é corrigido de carona,
-- só pelo financeiro_ressincronizar_extrato, depois de conferir.
create or replace function public.tg_transacao_sincroniza_extrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public._financeiro_sincronizar_extrato(old.id, old.empresa_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.conta_id is not distinct from new.conta_id
     and old.deleted_at is not distinct from new.deleted_at
     and lower(trim(coalesce(old.tipo, ''))) = lower(trim(coalesce(new.tipo, '')))
     and public._financeiro_mesmo_extrato(old, new) then
    if old.descricao is distinct from new.descricao
       or old.categoria_nome is distinct from new.categoria_nome
       or old.conta_nome is distinct from new.conta_nome then
      update public.extrato_bancario e
         set historico = new.descricao,
             descricao = new.descricao,
             categoria = new.categoria_nome,
             conta_nome = new.conta_nome
       where e.transacao_id = new.id
         and e.empresa_id = new.empresa_id
         and e.deleted_at is null
         and e.hash_linha like 'tx:%';
    end if;
    return new;
  end if;

  perform public._financeiro_sincronizar_extrato(new.id, new.empresa_id);
  return new;
end;
$$;

revoke all on function public.tg_transacao_sincroniza_extrato() from public, anon, authenticated;

drop trigger if exists trg_transacao_sincroniza_extrato on public.transacao_financeira;
create trigger trg_transacao_sincroniza_extrato
  after insert or delete or update of
    status, valor, conta_id, conta_nome, tipo, parcelado, parcelas, data_pagamento,
    data_vencimento, data, descricao, categoria_nome, deleted_at, referencia_tipo
  on public.transacao_financeira
  for each row execute function public.tg_transacao_sincroniza_extrato();

-- 4b. front antigo inseriu a linha "à mão" → re-sincroniza (descarta duplicata
-- e parcela lançada antes de pagar)
create or replace function public.tg_extrato_manual_resincroniza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._financeiro_sincronizar_extrato(new.transacao_id, new.empresa_id);
  return new;
end;
$$;

revoke all on function public.tg_extrato_manual_resincroniza() from public, anon, authenticated;

drop trigger if exists trg_extrato_manual_resincroniza on public.extrato_bancario;
create trigger trg_extrato_manual_resincroniza
  after insert on public.extrato_bancario
  for each row
  when (new.transacao_id is not null
        and new.hash_linha is null
        and new.status_conciliacao is null
        and new.upload_id is null
        and upper(coalesce(new.origem, '')) <> 'OFX')
  execute function public.tg_extrato_manual_resincroniza();

-- 4c. estorno/exclusão de transação conciliada com o banco: desfazer a
-- conciliação antes (o front antigo, ao desmarcar, apagava a linha do banco)
create or replace function public.tg_transacao_conciliada_sem_estorno()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.conciliado, false)
     and coalesce(new.conciliado, false)
     and ((lower(trim(coalesce(old.status, ''))) in ('pago', 'realizado')
           and lower(trim(coalesce(new.status, ''))) not in ('pago', 'realizado'))
          or (old.deleted_at is null and new.deleted_at is not null)) then
    raise exception 'Lançamento conciliado com o extrato do banco: desfaça a conciliação antes de estornar ou excluir'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transacao_conciliada_sem_estorno on public.transacao_financeira;
create trigger trg_transacao_conciliada_sem_estorno
  before update of status, deleted_at on public.transacao_financeira
  for each row execute function public.tg_transacao_conciliada_sem_estorno();

-- 4d. linha do banco ligada a uma transação não é apagada pelo app
create or replace function public.tg_extrato_banco_conciliado_sem_apagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and old.transacao_id is not null
     and not public._extrato_eh_do_sistema(old)
     and not public.chamador_eh_servidor() then
    raise exception 'Linha do extrato bancário conciliada: desfaça a conciliação antes de excluir'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_extrato_banco_conciliado_sem_apagar() from public, anon, authenticated;

drop trigger if exists trg_extrato_banco_conciliado_sem_apagar on public.extrato_bancario;
create trigger trg_extrato_banco_conciliado_sem_apagar
  before update of deleted_at on public.extrato_bancario
  for each row execute function public.tg_extrato_banco_conciliado_sem_apagar();

-- 5. Conta: saldo_atual é sempre derivado ----------------------------------
-- PlanoContas.jsx gravava saldo_inicial = 0 e saldo_atual = 0 ao editar
-- QUALQUER conta (inclusive a bancária) e ContasExtratosTab gravava
-- saldo_atual = saldo_inicial. Agora, se o app mexer em saldo_inicial ou
-- saldo_atual, o saldo_atual é recalculado na hora pelo extrato.
create or replace function public.tg_conta_saldo_atual_derivado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.saldo_atual := coalesce(new.saldo_inicial, 0) + public._saldo_extrato(new.id, new.empresa_id);
  return new;
end;
$$;

revoke all on function public.tg_conta_saldo_atual_derivado() from public, anon, authenticated;

drop trigger if exists trg_conta_saldo_atual_derivado on public.conta_financeira;
create trigger trg_conta_saldo_atual_derivado
  before insert or update of saldo_inicial, saldo_atual on public.conta_financeira
  for each row execute function public.tg_conta_saldo_atual_derivado();

-- recalcular_saldo_conta (0110) com a mesma fórmula
create or replace function public.recalcular_saldo_conta(p_conta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  if p_conta_id is null then
    return;
  end if;

  select empresa_id into v_empresa
    from public.conta_financeira
    where id = p_conta_id;

  if not found then
    return;
  end if;

  perform public.exigir_empresa_do_chamador(v_empresa, 'conta');

  update public.conta_financeira c
     set saldo_atual = coalesce(c.saldo_inicial, 0) + public._saldo_extrato(c.id, c.empresa_id),
         updated_at = now()
   where c.id = p_conta_id;
end;
$$;

-- 5b. Pagar / desfazer UMA parcela ------------------------------------------
-- A tela gravava o JSON inteiro a partir da cópia que tinha aberta: pagar a
-- parcela 2 com o detalhe desatualizado "despagava" a 1 (e o extrato agora
-- segue o JSON). Aqui a transação é travada e só a parcela pedida muda. O
-- status da transação acompanha: todas pagas → pago; senão, em aberto.
create or replace function public.financeiro_marcar_parcela(
  p_transacao_id uuid,
  p_indice int,
  p_pago boolean,
  p_data_pagamento date default null,
  p_comprovante_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.transacao_financeira%rowtype;
  v_parcelas jsonb;
  v_p jsonb;
  v_novas jsonb;
  v_todas boolean;
  v_data date := coalesce(p_data_pagamento, current_date);
begin
  select * into v_tx from public.transacao_financeira
    where id = p_transacao_id and deleted_at is null
    for update;
  if v_tx.id is null then
    raise exception 'Lançamento não encontrado';
  end if;
  perform public.exigir_empresa_do_chamador(v_tx.empresa_id, 'lançamento');

  v_parcelas := public._jsonb_desembrulhar(v_tx.parcelas);
  if not coalesce(v_tx.parcelado, false) or jsonb_typeof(v_parcelas) is distinct from 'array' then
    raise exception 'Este lançamento não é parcelado';
  end if;
  if p_indice is null or p_indice < 0 or p_indice >= jsonb_array_length(v_parcelas) then
    raise exception 'A parcela % não existe neste lançamento', coalesce(p_indice + 1, 0);
  end if;
  v_p := v_parcelas -> p_indice;
  if jsonb_typeof(v_p) is distinct from 'object' then
    raise exception 'A parcela % está gravada num formato inválido', p_indice + 1;
  end if;

  if p_pago then
    v_p := v_p || jsonb_build_object(
      'status', 'pago', 'data_pagamento', v_data::text, 'comprovante_url', p_comprovante_url);
  else
    v_p := v_p || jsonb_build_object('status', 'em_aberto', 'data_pagamento', null, 'comprovante_url', null);
  end if;
  v_novas := jsonb_set(v_parcelas, array[p_indice::text], v_p);

  select coalesce(bool_and(jsonb_typeof(e) = 'object'
                           and lower(coalesce(e ->> 'status', '')) in ('pago', 'realizado')), false)
    into v_todas
    from jsonb_array_elements(v_novas) e;

  update public.transacao_financeira
     set parcelas = v_novas,
         status = case
                    when lower(trim(coalesce(status, ''))) = 'cancelado' then status
                    when v_todas then 'pago'
                    when lower(trim(coalesce(status, ''))) in ('pago', 'realizado') then 'em_aberto'
                    else status
                  end,
         data_pagamento = case
                            when v_todas then v_data
                            when lower(trim(coalesce(status, ''))) in ('pago', 'realizado') then null
                            else data_pagamento
                          end
   where id = v_tx.id;

  return v_novas;
end;
$$;

revoke all on function public.financeiro_marcar_parcela(uuid, int, boolean, date, text) from public, anon;
grant execute on function public.financeiro_marcar_parcela(uuid, int, boolean, date, text) to authenticated, service_role;

-- 6. Diagnóstico e re-sincronização do legado (só servidor) ----------------
-- Diferença entre o extrato do sistema gravado e o esperado, por transação.
create or replace function public.financeiro_diagnostico_extrato(p_empresa_id uuid default null)
returns table (
  empresa_id uuid,
  transacao_id uuid,
  tipo text,
  status text,
  descricao text,
  conta_id uuid,
  valor_esperado numeric,
  valor_gravado numeric,
  diferenca numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: só pelo servidor' using errcode = '42501';
  end if;

  return query
  with esperado as (
    select t.id, sum(x.valor) as v
      from public.transacao_financeira t
      cross join lateral public.financeiro_extrato_esperado(t) x
     where (p_empresa_id is null or t.empresa_id = p_empresa_id)
     group by t.id
  ),
  gravado as (
    select e.transacao_id as id, sum(e.valor) as v
      from public.extrato_bancario e
     where e.deleted_at is null
       and e.transacao_id is not null
       and (p_empresa_id is null or e.empresa_id = p_empresa_id)
       and public._extrato_eh_do_sistema(e)
     group by e.transacao_id
  )
  select t.empresa_id, t.id, t.tipo, t.status, t.descricao, t.conta_id,
         coalesce(es.v, 0), coalesce(g.v, 0), coalesce(es.v, 0) - coalesce(g.v, 0)
    from public.transacao_financeira t
    left join esperado es on es.id = t.id
    left join gravado g on g.id = t.id
   where (p_empresa_id is null or t.empresa_id = p_empresa_id)
     and lower(trim(coalesce(t.tipo, ''))) in ('receita', 'despesa')
     and coalesce(es.v, 0) <> coalesce(g.v, 0);
end;
$$;

revoke all on function public.financeiro_diagnostico_extrato(uuid) from public, anon, authenticated;
grant execute on function public.financeiro_diagnostico_extrato(uuid) to service_role;

-- Aplica a regra nas transações com diferença. Devolve quantas ajustou.
create or replace function public.financeiro_ressincronizar_extrato(p_empresa_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado: só pelo servidor' using errcode = '42501';
  end if;
  if p_empresa_id is null then
    raise exception 'Informe a empresa';
  end if;
  for r in select d.transacao_id, d.empresa_id from public.financeiro_diagnostico_extrato(p_empresa_id) d loop
    perform public._financeiro_sincronizar_extrato(r.transacao_id, r.empresa_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.financeiro_ressincronizar_extrato(uuid) from public, anon, authenticated;
grant execute on function public.financeiro_ressincronizar_extrato(uuid) to service_role;

notify pgrst, 'reload schema';

-- 7. Legado: parcelada "paga pelo status" ------------------------------------
-- A baixa em lote e o "Marcar como Pago" antigos gravavam status pago na
-- despesa parcelada sem marcar as parcelas (e o front antigo já tinha lançado
-- TODAS as parcelas no extrato na criação). Pela regra nova (só parcela paga
-- lança) a primeira mexida tiraria todas as linhas e o saldo subiria pelo
-- total. A intenção era "tudo pago": as parcelas passam a pagas, na data de
-- pagamento da despesa (ou no vencimento da parcela). Só o JSON muda — o
-- gatilho fica desligado aqui; o extrato dessas despesas é acertado pelo
-- financeiro_ressincronizar_extrato, junto com o resto, depois de conferir.
alter table public.transacao_financeira disable trigger trg_transacao_sincroniza_extrato;

update public.transacao_financeira t
   set parcelas = (
         select jsonb_agg(
                  case
                    when jsonb_typeof(e.p) = 'object'
                         and lower(coalesce(e.p ->> 'status', '')) not in ('pago', 'realizado')
                    then e.p || jsonb_build_object(
                           'status', 'pago',
                           'data_pagamento', coalesce(
                             public._data_iso(e.p ->> 'data_pagamento')::text,
                             t.data_pagamento::text,
                             public._data_iso(e.p ->> 'data_vencimento')::text,
                             t.data_vencimento::text))
                    else e.p
                  end
                  order by e.i)
           from jsonb_array_elements(public._jsonb_desembrulhar(t.parcelas)) with ordinality as e(p, i)
       )
 where coalesce(t.parcelado, false)
   and t.deleted_at is null
   and lower(trim(coalesce(t.status, ''))) in ('pago', 'realizado')
   and jsonb_typeof(public._jsonb_desembrulhar(t.parcelas)) = 'array'
   and exists (
         select 1
           from jsonb_array_elements(public._jsonb_desembrulhar(t.parcelas)) x
          where jsonb_typeof(x) = 'object'
            and lower(coalesce(x ->> 'status', '')) not in ('pago', 'realizado'));

alter table public.transacao_financeira enable trigger trg_transacao_sincroniza_extrato;

-- Conferência (SQL editor, ANTES de aplicar): quantas parceladas serão normalizadas
--   select empresa_id, count(*) from transacao_financeira t
--    where coalesce(parcelado,false) and deleted_at is null
--      and lower(trim(coalesce(status,''))) in ('pago','realizado')
--    group by 1;
