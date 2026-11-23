-- ============================================================================
-- 0175 — F-11 e grants (varredura nov/2026, Lote 2a): anon e PUBLIC sem o que não
-- usam; TRUNCATE/TRIGGER/REFERENCES fora da API; objetos novos já fechados
--
-- O QUE O CATÁLOGO DE 23/11 MOSTROU:
--   * anon e authenticated com TODOS os privilégios (inclusive TRUNCATE, TRIGGER,
--     REFERENCES) em 127 tabelas de public;
--   * 39 funções NÃO definer executáveis por anon (38 delas também via PUBLIC);
--   * default privileges de postgres e supabase_admin em public dão tudo a
--     anon/authenticated/service_role em tabelas, sequências e funções novas, e o
--     padrão do Postgres dá EXECUTE a PUBLIC em toda função nova.
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   1. TRUNCATE, TRIGGER e REFERENCES saem de anon e authenticated em TODAS as
--      tabelas e views de public. A API (PostgREST) não usa nenhum dos três;
--      criar trigger/FK é coisa de migração (dono), e as RPCs definer rodam como
--      dono.
--   2. INSERT, UPDATE e DELETE saem de anon em todas as tabelas de public, e
--      anon perde as sequências. Nenhuma escrita como anon passa hoje (as
--      policies de escrita são de authenticated ou exigem
--      empresa_id = current_empresa_id(), nulo sem login); as páginas públicas
--      (publicPages do Layout.jsx) gravam só por Edge Function.
--      SELECT de anon FICA (ver "fora" abaixo).
--   3. EXECUTE sai de PUBLIC e de anon em 36 das 39 funções; authenticated e
--      service_role ficam com grant explícito (o front chama por rpc
--      entrada_estoque_atomica, baixar_reserva_atomica, gerar_pedido_direto e
--      aprovar/rejeitar_solicitacao_compra — estas duas continuam SECURITY
--      INVOKER como estão hoje, só perdem anon/PUBLIC; as demais são triggers ou
--      auxiliares de triggers/funções que rodam como authenticated — nota do
--      AGENTS.md, seção Banco). apply_tenant_rls e attach_updated_at_trigger (DDL
--      de migração) saem também de authenticated.
--      FICAM como estão current_empresa_id(), current_user_is_super_admin() e
--      current_user_email(): 37 policies são "TO public" e são avaliadas também
--      para anon; sem EXECUTE, a leitura sem sessão passaria de "lista vazia" a
--      "erro de permissão".
--   4. Default privileges (objetos NOVOS criados por postgres/supabase_admin em
--      public): tabelas sem TRUNCATE/TRIGGER/REFERENCES para anon/authenticated
--      e sem nada para anon; sequências sem anon; funções sem anon e sem PUBLIC
--      (função nova continua executável por authenticated e service_role pelo
--      default do esquema; quem precisar de anon dá grant explícito).
--      O ALTER DEFAULT PRIVILEGES FOR ROLE x exige ser membro de x: o bloco pula
--      (com NOTICE) o papel que o usuário da migração não puder alterar.
--   5. Autoconferência no fim: conta o que ainda sobrou aberto e avisa (NOTICE,
--      sem abortar). Objeto de OUTRO dono (ex.: supabase_admin) é pulado nos
--      passos 1–3, porque o REVOKE de quem não é dono falha ou não tem efeito; o
--      aviso lista esses objetos para o dono deles revogar.
--
-- FORA (ver LOTE2-banco.md): tirar SELECT de anon das tabelas. Hoje a leitura
-- sem sessão devolve lista vazia (RLS); sem o grant, vira erro 42501. Telas que
-- leem como anon: Registro.jsx:37 (Empresa.filter, página pública) e qualquer
-- tela logada cuja sessão do Supabase não foi aplicada (sigoClient.js:255-271,
-- "segue como anon"). Só a 0174 tira SELECT de anon, nas duas tabelas que
-- nenhuma tela lê.
--
-- Deploy: a ÚLTIMA do Lote 2a (depois da 0172, 0173 e 0174). Não depende de
-- nenhuma migração de compras.
--   supabase db query --linked -f supabase/migrations/0175_grants_anon_public.sql
-- Teste: tools/smoke-lote2-g-grants.sql (termina em ROLLBACK).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- 1 e 2. tabelas, views e sequências do usuário da migração ----------------------
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as obj, c.relkind
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
       and pg_has_role(current_user, c.relowner, 'MEMBER')
  loop
    if r.relkind = 'S' then
      execute format('revoke all on sequence %s from anon', r.obj);
    else
      execute format('revoke truncate, trigger, references on table %s from anon, authenticated', r.obj);
      execute format('revoke insert, update, delete on table %s from anon', r.obj);
    end if;
  end loop;
end;
$$;

-- 3. EXECUTE das funções não definer abertas a anon ----------------------------
do $$
declare
  f text;
  v_proc regprocedure;
  -- triggers e auxiliares de trigger/função (authenticated e service_role ficam)
  comuns constant text[] := array[
    'public.set_updated_at()',
    'public.sync_saldo_reservas()',
    'public.entrada_estoque_atomica(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,text,uuid)',
    'public.saida_estoque_atomica(uuid,uuid,uuid,numeric,text,uuid,uuid,text,text,uuid)',
    'public.baixar_reserva_atomica(uuid,numeric,text,text)',
    'public.sync_total_solicitacao()',
    'public.encontrar_nivel_aprovacao(uuid,numeric,integer)',
    'public.aprovar_solicitacao_compra(uuid,text,text,text,text)',
    'public.rejeitar_solicitacao_compra(uuid,text,text,text,text)',
    'public.gerar_pedido_direto(uuid,uuid,text,text,text,date)',
    'public.jsonb_arr_len(jsonb)',
    'public.jsonb_to_array(jsonb)',
    'public.upsert_nfe_recebida(uuid,text,text,date,text,text,numeric,jsonb,text,uuid)',
    'public.get_aliquota_vigente(uuid,text,date)',
    'public.tg_extrato_bancario_recalc_saldo()',
    'public.fmt_brl(numeric)',
    'public.data_vencimento_ocorrencia(date,integer)',
    'public.proxima_data_recorrencia(date,text,integer)',
    'public.tg_ferramenta_agenda_manutencao()',
    'public.tg_medicao_obra_numero()',
    'public.tg_proposta_versao()',
    'public.tg_proposta_imutavel()',
    'public.cotacao_fornecedor_token_servidor()',
    'public._numero_br(text)',
    'public._data_iso(text)',
    'public._jsonb_desembrulhar(jsonb)',
    'public._extrato_eh_do_sistema(public.extrato_bancario)',
    'public.financeiro_extrato_esperado(public.transacao_financeira)',
    'public._financeiro_mesmo_extrato(public.transacao_financeira,public.transacao_financeira)',
    'public.tg_transacao_conciliada_sem_estorno()',
    'public._extrato_eh_do_banco(public.extrato_bancario)',
    'public._extrato_sentido(public.extrato_bancario)',
    'public._fechamento_itens(jsonb)',
    'public._pre_lancamento_valor(jsonb)'
  ];
  -- DDL usada só por migração (o dono executa sem grant)
  so_migracao constant text[] := array[
    'public.attach_updated_at_trigger(text)',
    'public.apply_tenant_rls(text)'
  ];
begin
  foreach f in array comuns || so_migracao loop
    v_proc := to_regprocedure(f);
    if v_proc is null then
      raise notice 'função não encontrada (pulada): %', f;
      continue;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_proc
                    and pg_has_role(current_user, p.proowner, 'MEMBER')) then
      continue; -- de outro dono: a autoconferência (passo 5) avisa
    end if;
    if f = any (so_migracao) then
      execute format('revoke execute on function %s from public, anon, authenticated', v_proc);
    else
      execute format('revoke execute on function %s from public, anon', v_proc);
      execute format('grant execute on function %s to authenticated, service_role', v_proc);
    end if;
  end loop;
end;
$$;

-- 4. default privileges (objetos novos) ----------------------------------------
do $$
declare
  r text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      continue;
    end if;
    if not pg_has_role(current_user, r, 'MEMBER') then
      raise notice 'default privileges de % NÃO alterados: % não é membro de %', r, current_user, r;
      continue;
    end if;
    execute format('alter default privileges for role %I in schema public revoke truncate, trigger, references on tables from anon, authenticated', r);
    execute format('alter default privileges for role %I in schema public revoke all on tables from anon', r);
    execute format('alter default privileges for role %I in schema public revoke all on sequences from anon', r);
    execute format('alter default privileges for role %I in schema public revoke execute on functions from anon', r);
    -- o EXECUTE de PUBLIC vem do padrão GLOBAL (não do esquema): só sai sem "in schema"
    execute format('alter default privileges for role %I revoke execute on functions from public', r);
  end loop;
end;
$$;

-- 5. autoconferência: o que ainda sobrou aberto (só avisa, não aborta) ----------
do $$
declare
  v_n int;
  v_lista text;
  v_funcoes constant text[] := array[
    'public.set_updated_at()', 'public.sync_saldo_reservas()',
    'public.entrada_estoque_atomica(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,text,uuid)',
    'public.saida_estoque_atomica(uuid,uuid,uuid,numeric,text,uuid,uuid,text,text,uuid)',
    'public.baixar_reserva_atomica(uuid,numeric,text,text)', 'public.sync_total_solicitacao()',
    'public.encontrar_nivel_aprovacao(uuid,numeric,integer)',
    'public.aprovar_solicitacao_compra(uuid,text,text,text,text)',
    'public.rejeitar_solicitacao_compra(uuid,text,text,text,text)',
    'public.gerar_pedido_direto(uuid,uuid,text,text,text,date)', 'public.jsonb_arr_len(jsonb)',
    'public.jsonb_to_array(jsonb)',
    'public.upsert_nfe_recebida(uuid,text,text,date,text,text,numeric,jsonb,text,uuid)',
    'public.get_aliquota_vigente(uuid,text,date)', 'public.tg_extrato_bancario_recalc_saldo()',
    'public.fmt_brl(numeric)', 'public.data_vencimento_ocorrencia(date,integer)',
    'public.proxima_data_recorrencia(date,text,integer)', 'public.tg_ferramenta_agenda_manutencao()',
    'public.tg_medicao_obra_numero()', 'public.tg_proposta_versao()', 'public.tg_proposta_imutavel()',
    'public.cotacao_fornecedor_token_servidor()', 'public._numero_br(text)', 'public._data_iso(text)',
    'public._jsonb_desembrulhar(jsonb)', 'public._extrato_eh_do_sistema(public.extrato_bancario)',
    'public.financeiro_extrato_esperado(public.transacao_financeira)',
    'public._financeiro_mesmo_extrato(public.transacao_financeira,public.transacao_financeira)',
    'public.tg_transacao_conciliada_sem_estorno()', 'public._extrato_eh_do_banco(public.extrato_bancario)',
    'public._extrato_sentido(public.extrato_bancario)', 'public._fechamento_itens(jsonb)',
    'public._pre_lancamento_valor(jsonb)', 'public.attach_updated_at_trigger(text)', 'public.apply_tenant_rls(text)'
  ];
begin
  -- tabelas/views que ainda dão TRUNCATE/TRIGGER/REFERENCES a anon/authenticated ou escrita a anon
  select count(*),
         string_agg(nome, ', ' order by nome) filter (where rn <= 20)
    into v_n, v_lista
    from (
      select format('%s (dono %s)', c.oid::regclass, pg_get_userbyid(c.relowner)) as nome,
             row_number() over (order by c.relname) as rn
        from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and c.relkind in ('r', 'p', 'v', 'm', 'f')
         and (   has_table_privilege('anon', c.oid, 'TRUNCATE')
              or has_table_privilege('anon', c.oid, 'TRIGGER')
              or has_table_privilege('anon', c.oid, 'REFERENCES')
              or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
              or has_table_privilege('authenticated', c.oid, 'TRIGGER')
              or has_table_privilege('authenticated', c.oid, 'REFERENCES')
              or has_table_privilege('anon', c.oid, 'INSERT')
              or has_table_privilege('anon', c.oid, 'UPDATE')
              or has_table_privilege('anon', c.oid, 'DELETE'))
    ) t;
  if v_n > 0 then
    raise notice 'ATENÇÃO: % tabela(s)/view(s) de public continuam abertas (até 20): %. São de outro dono: o REVOKE precisa ser feito por ele (ou rode esta migração como esse papel).', v_n, v_lista;
  else
    raise notice 'conferência: nenhuma tabela de public dá TRUNCATE/TRIGGER/REFERENCES a anon/authenticated nem escrita a anon';
  end if;

  -- funções da lista ainda executáveis por anon
  select count(*),
         string_agg(nome, ', ' order by nome) filter (where rn <= 20)
    into v_n, v_lista
    from (
      select format('%s (dono %s)', p.oid::regprocedure, pg_get_userbyid(p.proowner)) as nome,
             row_number() over (order by p.proname) as rn
        from unnest(v_funcoes) f(sig)
        join pg_proc p on p.oid = to_regprocedure(f.sig)
       where has_function_privilege('anon', p.oid, 'EXECUTE')
    ) t;
  if v_n > 0 then
    raise notice 'ATENÇÃO: % função(ões) ainda executáveis por anon (até 20): %. São de outro dono: o REVOKE precisa ser feito por ele.', v_n, v_lista;
  else
    raise notice 'conferência: nenhuma das 36 funções é executável por anon';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
