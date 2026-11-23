-- ============================================================================
-- smoke-lote2-g-grants.sql — valida a 0175 (F-11 e grants, Lote 2a):
--   * nenhuma tabela/view de public dá TRUNCATE, TRIGGER ou REFERENCES a anon
--     ou authenticated, nem INSERT/UPDATE/DELETE a anon; anon segue com SELECT
--     (Registro.jsx lê empresa sem sessão: lista vazia, não erro);
--   * as 36 funções saíram de anon e de PUBLIC; authenticated e service_role
--     seguem executando (triggers e RPCs do front, inclusive
--     aprovar/rejeitar_solicitacao_compra, que seguem SECURITY INVOKER); as 3 de policy
--     (current_empresa_id, current_user_is_super_admin, current_user_email)
--     seguem com anon; apply_tenant_rls/attach_updated_at_trigger saíram de
--     authenticated;
--   * todas as RPCs que o front chama (supabase.rpc em apps/web/src) seguem
--     executáveis por authenticated;
--   * escrita comum como authenticated (com trigger set_updated_at) passa;
--   * objetos NOVOS criados pelo usuário da conexão já nascem fechados (se ele
--     for postgres ou supabase_admin).
--
-- Transação com ROLLBACK; EMPRESA SINTÉTICA criada aqui; nenhum UUID fixo,
-- nenhuma linha real usada. Recusas por falta de privilégio são conferidas no
-- catálogo (has_table_privilege/has_function_privilege), sem TRUNCATE nem
-- DELETE de verdade. Perfis simulados: admin (Admin), comum (Estoque), outra
-- (outra empresa) e anon.
--
-- Como rodar (com a 0175 aplicada; é a última do Lote 2a, depois da 0172, 0173 e 0174):
--   supabase db query --linked -f tools/smoke-lote2-g-grants.sql
-- Deve terminar com a linha "SMOKE LOTE2-G OK" e o número de verificações.
-- ============================================================================

begin;

create or replace function public.smoke_lote2_recusa(p_sql text, p_estado text, p_msg text)
returns text
language plpgsql
as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado then
      raise exception 'FALHOU: esperava % e veio % (%) em: %', p_estado, sqlstate, sqlerrm, p_sql;
    end if;
    if sqlerrm not like p_msg then
      raise exception 'FALHOU: recusado pelo motivo errado. Esperava "%" e veio "%" em: %', p_msg, sqlerrm, p_sql;
    end if;
    return sqlerrm;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

create or replace function public.smoke_lote2_claims(p_quem text, p_empresa uuid, p_super boolean default false)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-lote2-' || p_quem)::uuid,
    'email', 'smoke.lote2.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa, 'is_super_admin', p_super)
  )::text;
$f$;

grant execute on function public.smoke_lote2_recusa(text, text, text) to authenticated, anon;
grant execute on function public.smoke_lote2_claims(text, uuid, boolean) to authenticated, anon;

do $$
declare
  v_e1 uuid;
  v_e2 uuid := gen_random_uuid();
  v_forn uuid;
  v_quem text;
  v_cnt bigint;
  v_rows bigint;
  v_lista text;
  v_n int := 0;
  f text;
  v_proc regprocedure;
  comuns constant text[] := array[
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
    'public._pre_lancamento_valor(jsonb)'
  ];
  -- RPCs chamadas pelo front (grep de supabase.rpc em apps/web/src, 23/11/2026)
  rpcs_front constant text[] := array[
    'desconciliar_transacao', 'portal_documento_retirar', 'portal_documento_publicar', 'importar_atividades_ead',
    'conciliar_extrato', 'revogar_liberacao_sst', 'processar_recorrencias_empresa', 'liberar_sst',
    'importar_extrato_bancario', 'habilitacao_usuarios_da_empresa', 'gerar_pedido_direto',
    'funcionario_apto_campo', 'fluxo_reprovar_etapa', 'fluxo_instanciar', 'fluxo_concluir_etapa',
    'fluxo_aprovar_etapa', 'financeiro_marcar_parcela', 'fechar_caixa', 'faturar_medicao',
    'entrada_estoque_atomica', 'desfazer_pagamento_fechamento', 'desfazer_fechamento_caixa',
    'criar_transferencia_atomica', 'consolidado_grupo', 'conferir_recebimento_pedido',
    'baixar_reserva_atomica', 'aprovar_pagamento_fechamento', 'acrescentar_ao_fechamento',
    'aprovar_solicitacao_compra', 'rejeitar_solicitacao_compra'
  ];
begin
  -- 1. catálogo: privilégios de tabela ---------------------------------------------------------------------------
  select string_agg(c.relname || ':' || r.rolname || ':' || p.priv, ', ' order by c.relname), count(*)
    into v_lista, v_cnt
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    cross join (values ('anon'), ('authenticated')) r(rolname)
    cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(priv)
   where c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege(r.rolname, c.oid, p.priv);
  if v_cnt <> 0 then raise exception 'FALHOU: ainda há TRUNCATE/TRIGGER/REFERENCES: %', left(v_lista, 800); end if;
  v_n := v_n + 1;

  select string_agg(c.relname || ':' || p.priv, ', ' order by c.relname), count(*)
    into v_lista, v_cnt
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
   where c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, p.priv);
  if v_cnt <> 0 then raise exception 'FALHOU: anon ainda escreve em: %', left(v_lista, 800); end if;
  v_n := v_n + 1;

  if not has_table_privilege('anon', 'public.empresa', 'SELECT') then
    raise exception 'FALHOU: anon perdeu SELECT em empresa (Registro.jsx:37 passaria a dar erro)';
  end if;
  v_n := v_n + 1;

  -- 2. catálogo: EXECUTE ----------------------------------------------------------------------------------------
  foreach f in array comuns loop
    v_proc := to_regprocedure(f);
    if v_proc is null then
      raise notice 'função não encontrada (pulada): %', f;
      continue;
    end if;
    if has_function_privilege('anon', v_proc, 'EXECUTE') then
      raise exception 'FALHOU: anon ainda executa %', f;
    end if;
    -- ACL nula = padrão do Postgres, que dá EXECUTE a PUBLIC: acldefault evita o falso OK
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_proc and a.grantee = 0) then
      raise exception 'FALHOU: PUBLIC ainda executa %', f;
    end if;
    if not has_function_privilege('authenticated', v_proc, 'EXECUTE')
       or not has_function_privilege('service_role', v_proc, 'EXECUTE') then
      raise exception 'FALHOU: authenticated/service_role perderam %', f;
    end if;
    v_n := v_n + 1;
  end loop;

  foreach f in array array['public.attach_updated_at_trigger(text)', 'public.apply_tenant_rls(text)'] loop
    v_proc := to_regprocedure(f);
    continue when v_proc is null;
    if has_function_privilege('anon', v_proc, 'EXECUTE') or has_function_privilege('authenticated', v_proc, 'EXECUTE') then
      raise exception 'FALHOU: % ainda executável fora da migração', f;
    end if;
    v_n := v_n + 1;
  end loop;

  foreach f in array array['public.current_empresa_id()', 'public.current_user_is_super_admin()', 'public.current_user_email()'] loop
    if not has_function_privilege('anon', f::regprocedure, 'EXECUTE')
       or not has_function_privilege('authenticated', f::regprocedure, 'EXECUTE') then
      raise exception 'FALHOU: % (usada em policy) perdeu anon/authenticated', f;
    end if;
    v_n := v_n + 1;
  end loop;

  foreach f in array rpcs_front loop
    if not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
                    where p.proname = f and has_function_privilege('authenticated', p.oid, 'EXECUTE')) then
      raise exception 'FALHOU: o front chama supabase.rpc(%) e authenticated não executa', f;
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice '[catálogo] OK tabelas, funções e RPCs do front';

  -- 3. comportamento: usuário logado grava (trigger set_updated_at), não esvazia ---------------------------------
  insert into public.empresa (nome) values ('SMOKE LOTE2 empresa sintética') returning id into v_e1;
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.comum@exemplo.test', 'Estoque', true,
            '{"Estoque":{"Materiais":{"visualizar":true,"editar":true}}}'::jsonb, 'Smoke Lote2');

  foreach v_quem in array array['admin', 'comum'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;
    v_forn := null;
    insert into public.fornecedor (empresa_id, nome_razao) values (v_e1, 'SMOKE G ' || v_quem) returning id into v_forn;
    update public.fornecedor set nome_fantasia = 'SMOKE' where id = v_forn;   -- dispara set_updated_at
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'FALHOU [%]: escrita comum (com trigger) não passou', v_quem; end if;
    v_n := v_n + 1;
    if public.jsonb_arr_len(public.jsonb_to_array('"[1,2]"'::jsonb)) <> 2 or public.fmt_brl(1) is null then
      raise exception 'FALHOU [%]: auxiliares deixaram de responder', v_quem;
    end if;
    v_n := v_n + 1;
    reset role;
  end loop;
  if has_table_privilege('authenticated', 'public.fornecedor', 'TRUNCATE') then
    raise exception 'FALHOU: authenticated ainda esvazia fornecedor (TRUNCATE)';
  end if;
  v_n := v_n + 1;

  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  select count(*) into v_cnt from public.fornecedor where id = v_forn;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: viu fornecedor de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 4. anon: lê lista vazia (sem erro), não grava, não executa auxiliar ------------------------------------------
  if pg_has_role(current_user, 'anon', 'MEMBER') then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    select count(*) into v_cnt from public.empresa;              -- Registro.jsx:37
    if v_cnt <> 0 then raise exception 'FALHOU [anon]: anon leu empresas'; end if;
    v_n := v_n + 1;
    select count(*) into v_cnt from public.acervo_atestado;       -- policy "TO public" com current_empresa_id()
    if v_cnt <> 0 then raise exception 'FALHOU [anon]: anon leu acervo'; end if;
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa('select public.fmt_brl(1)', '42501', 'permission denied for function fmt_brl');
    v_n := v_n + 1;
    reset role;
  else
    raise notice '[anon] PULADO: % não assume anon', current_user;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- 5. objetos novos (default privileges) -------------------------------------------------------------------------
  if current_user::text in ('postgres', 'supabase_admin') then
    create table public.smoke_lote2_nova (id int);
    create function public.smoke_lote2_nova_fn() returns int language sql as $q$ select 1 $q$;
    if has_table_privilege('anon', 'public.smoke_lote2_nova', 'SELECT')
       or has_table_privilege('authenticated', 'public.smoke_lote2_nova', 'TRUNCATE')
       or not has_table_privilege('authenticated', 'public.smoke_lote2_nova', 'SELECT') then
      raise exception 'FALHOU: tabela nova não nasceu com os grants do lote 2 (default privileges de %)', current_user;
    end if;
    v_n := v_n + 1;
    if has_function_privilege('anon', 'public.smoke_lote2_nova_fn()', 'EXECUTE')
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = 'public.smoke_lote2_nova_fn()'::regprocedure and a.grantee = 0)
       or not has_function_privilege('authenticated', 'public.smoke_lote2_nova_fn()', 'EXECUTE') then
      raise exception 'FALHOU: função nova não nasceu com os grants do lote 2 (default privileges de %)', current_user;
    end if;
    v_n := v_n + 1;
    raise notice '[novos] OK tabela e função novas nascem fechadas para anon/PUBLIC';
  else
    raise notice '[novos] PULADO: a conexão é % (a 0175 altera os padrões de postgres e supabase_admin)', current_user;
  end if;

  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-G OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-G OK: grants de anon/PUBLIC e TRUNCATE/TRIGGER/REFERENCES (0175)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
