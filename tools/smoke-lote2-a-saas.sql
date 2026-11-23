-- ============================================================================
-- smoke-lote2-a-saas.sql — valida a 0172 (F-03): a empresa cliente só LÊ a
-- própria assinatura, pagamento e boletos do SaaS; o super admin (SaasAdmin)
-- continua gravando.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria um plano, uma
-- assinatura, um pagamento, um boleto e vínculos de usuário sintéticos
-- (e-mails @exemplo.test) numa EMPRESA SINTÉTICA criada aqui, e simula cada usuário com
-- `set local role authenticated` + `request.jwt.claims`. Nada é persistido.
-- Nenhum UUID fixo e nenhuma linha real usada. A recusa de DELETE físico é conferida
-- pelo catálogo (has_table_privilege), sem executar DELETE.
--
-- Perfis simulados: admin (Admin), comum (Compras, sem permissão no SaaS),
-- outra (usuário de OUTRA empresa) e super (super admin, como a SaasAdmin).
--
-- Como rodar (com a 0172 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-a-saas.sql
-- Deve terminar com a linha "SMOKE LOTE2-A OK" e o número de verificações.
-- ============================================================================

begin;

-- recusa esperada: estado E mensagem (LIKE). Roda com os direitos de quem chama.
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

-- token simulado (e-mail sintético, empresa, super admin opcional)
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
  v_e2 uuid := gen_random_uuid(); -- outra empresa: só no token (não precisa existir)
  v_plano uuid;
  v_ass uuid;
  v_pag uuid;
  v_blt uuid;
  v_quem text;
  v_cnt bigint;
  v_rows bigint;
  v_n int := 0;
begin
  -- 0. migração aplicada?
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assinatura'
              and policyname = 'tenant_isolation') then
    raise exception 'A 0172 não está aplicada (assinatura ainda tem tenant_isolation).';
  end if;

  -- 1. massa (como servidor) -----------------------------------------------------------------------------------
  insert into public.empresa (nome) values ('SMOKE LOTE2 empresa sintética') returning id into v_e1;
  raise notice '== empresa sintética: %', v_e1;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.comum@exemplo.test', 'Compras', true,
            '{"Compras":{"Solicitações":{"visualizar":true}}}'::jsonb, 'Smoke Lote2');

  insert into public.plano (nome, valor_mensal) values ('SMOKE plano', 1) returning id into v_plano;
  insert into public.assinatura (empresa_id, plano_id, status, data_vencimento, valor_mensal)
    values (v_e1, v_plano, 'Trial', current_date + 1, 1) returning id into v_ass;
  insert into public.pagamento (empresa_id, assinatura_id, valor, data_vencimento, status)
    values (v_e1, v_ass, 1, current_date + 1, 'Pendente') returning id into v_pag;
  insert into public.boleto_bancario (empresa_id, empresa_nome, valor, data_vencimento, status)
    values (v_e1, 'SMOKE', 1, current_date + 1, 'Emitido') returning id into v_blt;

  -- 2. Admin e perfil comum: lêem, não gravam ----------------------------------------------------------------
  foreach v_quem in array array['admin', 'comum'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;

    select count(*) into v_cnt from public.assinatura where id = v_ass;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: devia LER a própria assinatura (Layout/Configurações)', v_quem; end if;
    v_n := v_n + 1;
    select count(*) into v_cnt from public.pagamento where id = v_pag;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: devia ler o próprio pagamento', v_quem; end if;
    v_n := v_n + 1;
    select count(*) into v_cnt from public.boleto_bancario where id = v_blt;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: devia ler o próprio boleto', v_quem; end if;
    v_n := v_n + 1;

    perform public.smoke_lote2_recusa(format(
      'insert into public.assinatura (empresa_id, plano_id, status, data_vencimento, valor_mensal) values (%L, %L, %L, %L, 0)',
      v_e1, v_plano, 'Ativa', '2099-12-31'), '42501', 'new row violates row-level security%');
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa(format(
      'insert into public.boleto_bancario (empresa_id, empresa_nome, valor, data_vencimento, status) values (%L, %L, 1, current_date, %L)',
      v_e1, 'SMOKE', 'Pago'), '42501', 'new row violates row-level security%');
    v_n := v_n + 1;

    update public.assinatura set status = 'Ativa', data_vencimento = '2099-12-31' where id = v_ass;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then raise exception 'FALHOU [%]: alterou a própria assinatura', v_quem; end if;
    v_n := v_n + 1;
    update public.pagamento set status = 'Pago' where id = v_pag;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then raise exception 'FALHOU [%]: marcou o pagamento como pago', v_quem; end if;
    v_n := v_n + 1;
    update public.boleto_bancario set deleted_at = now() where id = v_blt;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then raise exception 'FALHOU [%]: apagou (lógico) o boleto do SaaS', v_quem; end if;
    v_n := v_n + 1;

    reset role;
  end loop;

  -- DELETE físico e TRUNCATE: conferidos no catálogo (sem executar)
  if has_table_privilege('authenticated', 'public.assinatura', 'DELETE')
     or has_table_privilege('authenticated', 'public.pagamento', 'DELETE')
     or has_table_privilege('authenticated', 'public.boleto_bancario', 'DELETE')
     or has_table_privilege('authenticated', 'public.assinatura', 'TRUNCATE')
     or has_table_privilege('anon', 'public.assinatura', 'INSERT')
     or has_table_privilege('anon', 'public.boleto_bancario', 'UPDATE') then
    raise exception 'FALHOU: authenticated ainda apaga/esvazia ou anon ainda grava (assinatura/pagamento/boleto)';
  end if;
  v_n := v_n + 1;
  raise notice '[admin/comum] OK lêem e não gravam assinatura, pagamento e boleto';

  -- 3. outra empresa: não vê nada ------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  select (select count(*) from public.assinatura where id = v_ass)
       + (select count(*) from public.pagamento where id = v_pag)
       + (select count(*) from public.boleto_bancario where id = v_blt) into v_cnt;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: viu dado do SaaS de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 4. super admin (SaasAdmin): continua gravando -----------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  update public.assinatura set status = 'Ativa', observacoes = 'SMOKE' where id = v_ass;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [super]: SaasAdmin não alterou a assinatura'; end if;
  v_n := v_n + 1;
  insert into public.pagamento (empresa_id, assinatura_id, valor, data_vencimento, status)
    values (v_e1, v_ass, 1, current_date + 30, 'Pendente');
  v_n := v_n + 1;
  insert into public.boleto_bancario (empresa_id, empresa_nome, valor, data_vencimento, status)
    values (v_e1, 'SMOKE 2', 1, current_date + 30, 'Emitido');
  v_n := v_n + 1;
  update public.boleto_bancario set deleted_at = now() where id = v_blt; -- "excluir" da SaasAdmin (lógico)
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [super]: SaasAdmin não excluiu (lógico) o boleto'; end if;
  v_n := v_n + 1;
  reset role;
  raise notice '[super] OK SaasAdmin cria, altera e exclui (lógico)';

  perform set_config('request.jwt.claims', '', true);
  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-A OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-A OK: assinatura/pagamento/boleto só leitura para a empresa (0172)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
