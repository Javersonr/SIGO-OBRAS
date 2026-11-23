-- ============================================================================
-- smoke-lote2-c-portal-cliente.sql — valida a 0174 (F-07): cliente_portal_usuario
-- e token_cliente_oportunidade só pelo servidor (a Edge Function
-- portal-cliente-dados lê com service role); a empresa não lê nem grava;
-- super admin só lê.
--
-- Transação com ROLLBACK; EMPRESA, oportunidade e projeto SINTÉTICOS criados
-- aqui (token aleatório, e-mail @exemplo.test); nenhum UUID fixo, nenhuma linha
-- real usada. Recusas de escrita conferidas no catálogo (has_table_privilege).
-- Perfis simulados: admin (Admin), comum (Gestor), outra (outra empresa),
-- super (super admin), anon e service_role (se o usuário da conexão puder
-- assumir esses papéis).
--
-- Como rodar (com a 0174 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-c-portal-cliente.sql
-- Deve terminar com a linha "SMOKE LOTE2-C OK" e o número de verificações.
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

grant execute on function public.smoke_lote2_recusa(text, text, text) to authenticated, anon, service_role;
grant execute on function public.smoke_lote2_claims(text, uuid, boolean) to authenticated, anon, service_role;

do $$
declare
  v_e1 uuid;
  v_e2 uuid := gen_random_uuid();
  v_op uuid;
  v_proj uuid;
  v_tok uuid;
  v_cpu uuid;
  v_quem text;
  v_cnt bigint;
  v_n int := 0;
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('cliente_portal_usuario', 'token_cliente_oportunidade')
              and policyname = 'tenant_isolation') then
    raise exception 'A 0174 não está aplicada (ainda há tenant_isolation).';
  end if;

  insert into public.empresa (nome) values ('SMOKE LOTE2 empresa sintética') returning id into v_e1;
  insert into public.oportunidade (empresa_id, nome) values (v_e1, 'SMOKE LOTE2 oportunidade') returning id into v_op;
  insert into public.projeto (empresa_id, nome) values (v_e1, 'SMOKE LOTE2 projeto') returning id into v_proj;
  raise notice '== empresa sintética: %', v_e1;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.comum@exemplo.test', 'Gestor', true,
            '{"Oportunidades":{"Lista":{"visualizar":true,"editar":true}}}'::jsonb, 'Smoke Lote2');

  -- massa como servidor
  insert into public.token_cliente_oportunidade (empresa_id, oportunidade_id, token, email_cliente, ativo)
    values (v_e1, v_op, 'smoke-lote2-' || md5(random()::text), 'smoke.lote2.cliente@exemplo.test', true)
    returning id into v_tok;

  insert into public.cliente_portal_usuario (empresa_id, projeto_id, nome, email, senha_hash, cpf_cnpj)
    values (v_e1, v_proj, 'SMOKE cliente', 'smoke.lote2.cliente@exemplo.test', 'smoke-hash', '00000000000')
    returning id into v_cpu;

  -- 1. Admin e perfil comum: não leem, não gravam ----------------------------------------------------------
  foreach v_quem in array array['admin', 'comum'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;

    select count(*) into v_cnt from public.token_cliente_oportunidade where id = v_tok;
    if v_cnt <> 0 then raise exception 'FALHOU [%]: leu o token do link do cliente', v_quem; end if;
    v_n := v_n + 1;
    select count(*) into v_cnt from public.cliente_portal_usuario where id = v_cpu;
    if v_cnt <> 0 then raise exception 'FALHOU [%]: leu senha_hash/cpf do portal do cliente', v_quem; end if;
    v_n := v_n + 1;

    reset role;
  end loop;

  -- escrita do usuário logado e qualquer acesso de anon: catálogo (sem executar)
  if has_table_privilege('authenticated', 'public.token_cliente_oportunidade', 'INSERT')
     or has_table_privilege('authenticated', 'public.token_cliente_oportunidade', 'UPDATE')
     or has_table_privilege('authenticated', 'public.token_cliente_oportunidade', 'DELETE')
     or has_table_privilege('authenticated', 'public.cliente_portal_usuario', 'INSERT')
     or has_table_privilege('authenticated', 'public.cliente_portal_usuario', 'UPDATE')
     or has_table_privilege('authenticated', 'public.cliente_portal_usuario', 'DELETE') then
    raise exception 'FALHOU: authenticated ainda grava tokens/usuários do portal do cliente';
  end if;
  v_n := v_n + 1;
  if has_table_privilege('anon', 'public.token_cliente_oportunidade', 'SELECT')
     or has_table_privilege('anon', 'public.cliente_portal_usuario', 'SELECT') then
    raise exception 'FALHOU: anon ainda lê tokens/usuários do portal do cliente';
  end if;
  v_n := v_n + 1;
  raise notice '[admin/comum] OK não leem nem gravam tokens e usuários do portal do cliente';

  -- 2. outra empresa ------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  select count(*) into v_cnt from public.token_cliente_oportunidade where id = v_tok;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: leu token de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 3. super admin: lê ----------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  select count(*) into v_cnt from public.token_cliente_oportunidade where id = v_tok;
  if v_cnt <> 1 then raise exception 'FALHOU [super]: super admin deixou de ler'; end if;
  v_n := v_n + 1;
  reset role;

  -- 4. anon: nem leitura ----------------------------------------------------------------------------------------------
  if pg_has_role(current_user, 'anon', 'MEMBER') then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    perform public.smoke_lote2_recusa('select count(*) from public.token_cliente_oportunidade',
      '42501', 'permission denied for table token_cliente_oportunidade');
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa('select count(*) from public.cliente_portal_usuario',
      '42501', 'permission denied for table cliente_portal_usuario');
    v_n := v_n + 1;
    reset role;
  else
    raise notice '[anon] PULADO: % não assume anon', current_user;
  end if;

  -- 5. servidor (Edge Function portal-cliente-dados): lê o token ------------------------------------------------
  if pg_has_role(current_user, 'service_role', 'MEMBER') then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
    select count(*) into v_cnt from public.token_cliente_oportunidade where id = v_tok and ativo;
    if v_cnt <> 1 then raise exception 'FALHOU [service_role]: a Edge Function deixou de ler o token'; end if;
    v_n := v_n + 1;
    reset role;
  else
    raise notice '[service_role] PULADO: % não assume service_role', current_user;
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-C OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-C OK: portal do cliente só pelo servidor (0174)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
