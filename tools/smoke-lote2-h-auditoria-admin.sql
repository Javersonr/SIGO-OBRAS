-- ============================================================================
-- smoke-lote2-h-auditoria-admin.sql — valida a 0176 (Lote 2b-1, regra 5 do dono):
-- a auditoria só é lida pelo administrador (Admin, Admin Holding, super admin);
-- os outros perfis veem lista vazia, sem erro.
--
-- Transação com ROLLBACK; EMPRESA SINTÉTICA e dados sintéticos (e-mails
-- @exemplo.test) criados aqui; nenhum UUID fixo, nenhuma linha real usada.
-- Perfis simulados: admin (Admin), holding (Admin Holding), comum (Estoque),
-- admin_inativo (Admin com vínculo inativo), outra (outra empresa), super.
--
-- Como rodar (com a 0176 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-h-auditoria-admin.sql
-- Deve terminar com a linha "SMOKE LOTE2-H OK" e o número de verificações.
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
  v_e2 uuid;
  v_log uuid;
  v_log2 uuid;
  v_quem text;
  v_cnt bigint;
  v_ok boolean;
  v_n int := 0;
begin
  if to_regprocedure('public.usuario_eh_administrador()') is null then
    raise exception 'A 0176 não está aplicada (falta usuario_eh_administrador).';
  end if;

  -- catálogo: a função não é de anon nem de PUBLIC
  if has_function_privilege('anon', 'public.usuario_eh_administrador()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.usuario_eh_administrador()', 'EXECUTE') then
    raise exception 'FALHOU: usuario_eh_administrador com grants errados';
  end if;
  v_n := v_n + 1;

  insert into public.empresa (nome) values ('SMOKE LOTE2 empresa sintética') returning id into v_e1;
  raise notice '== empresa sintética: %', v_e1;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.holding@exemplo.test', 'Admin Holding', true, null, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.comum@exemplo.test', 'Estoque', true,
            '{"Estoque":{"Materiais":{"visualizar":true}}}'::jsonb, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.admin_inativo@exemplo.test', 'Admin', false, null, 'Smoke Lote2');

  insert into public.audit_log (empresa_id, usuario_email, tipo_acao, entidade, descricao)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'configurar', 'SmokeLote2', 'SMOKE linha de auditoria')
    returning id into v_log;

  -- 1. administradores leem (positivo) --------------------------------------------------------------------------
  foreach v_quem in array array['admin', 'holding'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;
    select count(*) into v_cnt from public.audit_log where id = v_log;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: administrador deixou de ler a auditoria', v_quem; end if;
    v_n := v_n + 1;
    v_ok := public.usuario_eh_administrador();
    if v_ok is not true then raise exception 'FALHOU [%]: devia ser administrador', v_quem; end if;
    v_n := v_n + 1;
    reset role;
  end loop;

  -- 2. não administradores: lista vazia, sem erro (negativo) -------------------------------------------------------
  foreach v_quem in array array['comum', 'admin_inativo'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;
    select count(*) into v_cnt from public.audit_log where empresa_id = v_e1;  -- o filtro da AuditLogs.jsx:68
    if v_cnt <> 0 then raise exception 'FALHOU [%]: não administrador leu a auditoria', v_quem; end if;
    v_n := v_n + 1;
    v_ok := public.usuario_eh_administrador();
    if v_ok is not false then raise exception 'FALHOU [%]: não devia ser administrador', v_quem; end if;
    v_n := v_n + 1;
    reset role;
  end loop;

  -- 3. outra empresa: o MESMO e-mail é Admin também numa 2ª empresa sintética; com o token
  --    dela, lê a auditoria dela e não a da 1ª ------------------------------------------------------------
  insert into public.empresa (nome) values ('SMOKE LOTE2 outra empresa sintética') returning id into v_e2;
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e2, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2');
  insert into public.audit_log (empresa_id, usuario_email, tipo_acao, entidade, descricao)
    values (v_e2, 'smoke.lote2.admin@exemplo.test', 'configurar', 'SmokeLote2', 'SMOKE auditoria da outra')
    returning id into v_log2;
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('admin', v_e2), true);
  set local role authenticated;
  select count(*) into v_cnt from public.audit_log where id = v_log2;
  if v_cnt <> 1 then raise exception 'FALHOU [outra]: Admin da 2ª empresa não leu a própria auditoria'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.audit_log where id = v_log;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: Admin da 2ª empresa leu a auditoria da 1ª'; end if;
  v_n := v_n + 1;
  reset role;

  -- 3b. Admin com ativo NULO (dado legado) continua administrador (revisão 2b-1, achado 3) ----------------
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.admin_nulo@exemplo.test', 'Admin', null, null, 'Smoke Lote2');
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('admin_nulo', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.audit_log where id = v_log;
  if v_cnt <> 1 then raise exception 'FALHOU [admin_nulo]: Admin com ativo nulo deixou de ler'; end if;
  v_n := v_n + 1;
  reset role;

  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  select count(*) into v_cnt from public.audit_log where id = v_log;
  if v_cnt <> 1 then raise exception 'FALHOU [super]: super admin deixou de ler'; end if;
  v_n := v_n + 1;
  reset role;

  -- 4. a escrita continua fechada (0173), conferida no catálogo -------------------------------------------------
  if has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_log', 'DELETE') then
    raise exception 'FALHOU: authenticated voltou a gravar em audit_log';
  end if;
  v_n := v_n + 1;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-H OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-H OK: auditoria só para o administrador (0176)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
