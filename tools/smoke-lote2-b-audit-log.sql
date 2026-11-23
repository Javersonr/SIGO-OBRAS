-- ============================================================================
-- smoke-lote2-b-audit-log.sql — valida a 0173 (F-04): audit_log só recebe linhas
-- novas pelo servidor; a empresa só lê; ninguém altera nem apaga (nem o servidor),
-- salvo o expurgo deliberado (sigo.permitir_expurgo_audit_log).
--
-- Transação com ROLLBACK; EMPRESA SINTÉTICA criada aqui e dados sintéticos
-- (e-mails @exemplo.test); nenhum UUID fixo, nenhuma linha real usada.
-- Recusas por falta de privilégio (INSERT/UPDATE/DELETE/TRUNCATE do usuário
-- logado) são conferidas no catálogo (has_table_privilege), sem executar. Só a
-- linha sintética é alvo de UPDATE/DELETE, para provar o trigger.
-- Perfis simulados: admin (Admin), comum (Estoque), outra (outra empresa),
-- super (super admin) e service_role (como as Edge Functions, se o usuário da
-- conexão puder assumir esse papel).
--
-- Como rodar (com a 0173 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-b-audit-log.sql
-- Deve terminar com a linha "SMOKE LOTE2-B OK" e o número de verificações.
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
  v_log uuid;
  v_quem text;
  v_cnt bigint;
  v_rows bigint;
  v_n int := 0;
  v_ins text;
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.audit_log'::regclass
                  and tgname = 'audit_log_imutavel' and not tgisinternal) then
    raise exception 'A 0173 não está aplicada (falta o trigger audit_log_imutavel).';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.audit_log'::regclass
                  and tgname = 'audit_log_imutavel_truncate' and not tgisinternal) then
    raise exception 'FALHOU: falta o trigger de TRUNCATE (audit_log_imutavel_truncate).';
  end if;
  v_n := v_n + 1;

  insert into public.empresa (nome) values ('SMOKE LOTE2 empresa sintética') returning id into v_e1;
  raise notice '== empresa sintética: %', v_e1;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2'),
           (v_e1, 'smoke.lote2.comum@exemplo.test', 'Estoque', true,
            '{"Estoque":{"Materiais":{"visualizar":true}}}'::jsonb, 'Smoke Lote2');

  -- linha de auditoria como a Edge Function grava (aqui: como servidor)
  insert into public.audit_log (empresa_id, usuario_email, tipo_acao, entidade, descricao)
    values (v_e1, 'smoke.lote2.admin@exemplo.test', 'configurar', 'SmokeLote2', 'SMOKE linha de auditoria')
    returning id into v_log;

  v_ins := format(
    'insert into public.audit_log (empresa_id, usuario_email, tipo_acao, entidade, descricao) values (%L, %L, %L, %L, %L)',
    v_e1, 'smoke.lote2.outro@exemplo.test', 'deletar', 'SmokeLote2', 'SMOKE linha falsa');

  -- 1. Admin e perfil comum: só leem (a tela AuditLogs) -----------------------------------------------------
  foreach v_quem in array array['admin', 'comum'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;

    select count(*) into v_cnt from public.audit_log where id = v_log;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: a tela AuditLogs deixou de ler', v_quem; end if;
    v_n := v_n + 1;

    reset role;
  end loop;

  -- escrita do usuário logado (vale para todo perfil, inclusive super admin) e de anon: catálogo
  if has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
     or has_table_privilege('authenticated', 'public.audit_log', 'TRUNCATE') then
    raise exception 'FALHOU: authenticated ainda insere/altera/apaga/esvazia audit_log';
  end if;
  v_n := v_n + 1;
  if has_table_privilege('anon', 'public.audit_log', 'INSERT')
     or has_table_privilege('anon', 'public.audit_log', 'UPDATE')
     or has_table_privilege('anon', 'public.audit_log', 'DELETE')
     or has_table_privilege('anon', 'public.audit_log', 'TRUNCATE') then
    raise exception 'FALHOU: anon ainda grava em audit_log';
  end if;
  v_n := v_n + 1;
  raise notice '[admin/comum] OK leem; não inserem, não alteram, não apagam, não esvaziam';

  -- 2. outra empresa: não vê -----------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  select count(*) into v_cnt from public.audit_log where id = v_log;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: leu auditoria de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 3. super admin: lê, mas também não altera -------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  select count(*) into v_cnt from public.audit_log where id = v_log;
  if v_cnt <> 1 then raise exception 'FALHOU [super]: super admin deixou de ler'; end if;
  v_n := v_n + 1;
  reset role;

  -- 4. servidor (Edge Function, service_role): insere; não altera nem apaga --------------------------------
  if pg_has_role(current_user, 'service_role', 'MEMBER') then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
    execute v_ins;
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa(
      format('update public.audit_log set descricao = %L where id = %L', 'SMOKE alterado', v_log),
      '42501', 'Acesso negado: o registro de auditoria não pode ser alterado%');
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa(format('delete from public.audit_log where id = %L', v_log),
      '42501', 'Acesso negado: o registro de auditoria não pode ser apagado%');
    v_n := v_n + 1;
    reset role;
    raise notice '[service_role] OK insere; o trigger recusa alterar e apagar';
  else
    raise notice '[service_role] PULADO: % não assume service_role (o trecho 5 cobre o trigger)', current_user;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- 5. dono do banco: o trigger também vale; expurgo deliberado passa --------------------------------------
  perform public.smoke_lote2_recusa(
    format('update public.audit_log set descricao = %L where id = %L', 'SMOKE alterado', v_log),
    '42501', 'Acesso negado: o registro de auditoria não pode ser alterado%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format('delete from public.audit_log where id = %L', v_log),
    '42501', 'Acesso negado: o registro de auditoria não pode ser apagado%');
  v_n := v_n + 1;

  perform set_config('sigo.permitir_expurgo_audit_log', 'on', true);
  delete from public.audit_log where id = v_log;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU: o expurgo deliberado não apagou a linha'; end if;
  v_n := v_n + 1;
  perform set_config('sigo.permitir_expurgo_audit_log', '', true);
  raise notice '[dono] OK trigger recusa; expurgo deliberado passa';

  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-B OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-B OK: audit_log só inserção pelo servidor, imutável (0173)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
