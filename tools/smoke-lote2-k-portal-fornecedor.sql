-- ============================================================================
-- smoke-lote2-k-portal-fornecedor.sql — valida a 0179 (Lote 2b-2, F-08):
-- fornecedor_acesso só pelo servidor (a Edge Function fornecedor-acesso, como
-- service_role, lê e grava; ninguém da empresa lê nem grava pela API) e
-- cotacao_fornecedor (com o token do link) só para quem tem alguma permissão de
-- Compras ou é administrador; as telas de Compras seguem funcionando.
--
-- Transação com ROLLBACK; EMPRESAS SINTÉTICAS e dados sintéticos (e-mails
-- @exemplo.test) criados aqui; nenhum UUID fixo, nenhuma linha real usada.
-- Perfis simulados: admin (Admin), holding (Admin Holding, sem permissões),
-- compras (Compras → Cotações), hist (Compras → só Histórico), estoque (Estoque,
-- sem Compras), compras_nulo (Compras → Cotações com ativo NULO: barrado, como na 0147), compras_inativo
-- (Compras → Cotações com ativo = false), outra (Admin de outra empresa), super
-- (super admin) e o servidor
-- (service_role).
--
-- Como rodar (com a 0179 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-k-portal-fornecedor.sql
-- Deve terminar com a linha "SMOKE LOTE2-K OK" e o número de verificações.
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
  v_forn uuid;
  v_forn_novo uuid;
  v_cot uuid;
  v_item uuid;
  v_cf uuid;
  v_cf_novo uuid;
  v_ok boolean;
  v_fa uuid;
  v_fa_novo uuid := gen_random_uuid();
  v_quem text;
  v_cnt bigint;
  v_rows bigint;
  v_tok text;
  v_tok_novo text;
  v_n int := 0;
  v_hash constant text := repeat('ab', 32);                     -- "SHA-256 hex" sintético
  v_bcrypt constant text := '$2a$10$' || repeat('x', 53);      -- "bcrypt" sintético (60 caracteres)
begin
  -- 0. a 0179 está aplicada? (catálogo) -------------------------------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacao_fornecedor'
                  and policyname = 'cotacao_fornecedor_ler_com_compras') then
    raise exception 'A 0179 não está aplicada (falta cotacao_fornecedor_ler_com_compras).';
  end if;
  if to_regprocedure('public.usuario_eh_administrador()') is null
     or to_regprocedure('public.tem_permissao(text,text,text)') is null then
    raise exception 'Faltam usuario_eh_administrador (0176/0178) ou tem_permissao (0147).';
  end if;

  -- fornecedor_acesso: só a policy do super admin sobrou
  select count(*) into v_cnt from pg_policies
   where schemaname = 'public' and tablename = 'fornecedor_acesso' and policyname <> 'super_admin_all';
  if v_cnt <> 0 then
    raise exception 'FALHOU: fornecedor_acesso ainda tem % policy(s) além de super_admin_all', v_cnt;
  end if;
  v_n := v_n + 1;

  -- grants (conferidos no catálogo, sem executar TRUNCATE de verdade: revisão do Lote 2, achado 12)
  if has_table_privilege('authenticated', 'public.fornecedor_acesso', 'INSERT')
     or has_table_privilege('authenticated', 'public.fornecedor_acesso', 'UPDATE')
     or has_table_privilege('authenticated', 'public.fornecedor_acesso', 'DELETE')
     or has_table_privilege('authenticated', 'public.fornecedor_acesso', 'TRUNCATE') then
    raise exception 'FALHOU: authenticated ainda grava em fornecedor_acesso';
  end if;
  v_n := v_n + 1;
  if has_table_privilege('anon', 'public.fornecedor_acesso', 'SELECT')
     or has_table_privilege('anon', 'public.fornecedor_acesso', 'INSERT')
     or has_table_privilege('anon', 'public.fornecedor_acesso', 'UPDATE') then
    raise exception 'FALHOU: anon ainda tem privilégio em fornecedor_acesso';
  end if;
  v_n := v_n + 1;
  if has_table_privilege('authenticated', 'public.cotacao_fornecedor', 'DELETE')
     or has_table_privilege('authenticated', 'public.cotacao_fornecedor', 'TRUNCATE') then
    raise exception 'FALHOU: authenticated ainda apaga fisicamente cotacao_fornecedor';
  end if;
  v_n := v_n + 1;
  if not (has_table_privilege('service_role', 'public.fornecedor_acesso', 'SELECT')
          and has_table_privilege('service_role', 'public.fornecedor_acesso', 'INSERT')
          and has_table_privilege('service_role', 'public.fornecedor_acesso', 'UPDATE')
          and has_table_privilege('service_role', 'public.audit_log', 'INSERT')) then
    raise exception 'FALHOU: o servidor (service_role) perdeu acesso a fornecedor_acesso ou audit_log';
  end if;
  v_n := v_n + 1;

  -- dados sintéticos ---------------------------------------------------------------------------------------------
  insert into public.empresa (nome) values ('SMOKE LOTE2-K empresa sintética') returning id into v_e1;
  insert into public.empresa (nome) values ('SMOKE LOTE2-K outra empresa sintética') returning id into v_e2;
  raise notice '== empresas sintéticas: % e %', v_e1, v_e2;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values
      (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Lote2'),
      (v_e1, 'smoke.lote2.holding@exemplo.test', 'Admin Holding', true, null, 'Smoke Lote2'),
      (v_e1, 'smoke.lote2.compras@exemplo.test', 'Compras', true,
       '{"Compras":{"Cotações":{"visualizar":true,"criar":true,"editar":true,"enviar":true}}}'::jsonb, 'Smoke Lote2'),
      (v_e1, 'smoke.lote2.hist@exemplo.test', 'Compras', true,
       '{"Compras":{"Histórico":{"visualizar":true}}}'::jsonb, 'Smoke Lote2'),
      (v_e1, 'smoke.lote2.estoque@exemplo.test', 'Estoque', true,
       '{"Estoque":{"Materiais":{"visualizar":true,"editar":true}}}'::jsonb, 'Smoke Lote2'),
      (v_e1, 'smoke.lote2.compras_nulo@exemplo.test', 'Compras', null,
       '{"Compras":{"Cotações":{"visualizar":true,"enviar":true}}}'::jsonb, 'Smoke Lote2'),
      (v_e1, 'smoke.lote2.compras_inativo@exemplo.test', 'Compras', false,
       '{"Compras":{"Cotações":{"visualizar":true,"enviar":true}}}'::jsonb, 'Smoke Lote2'),
      (v_e2, 'smoke.lote2.outra@exemplo.test', 'Admin', true, null, 'Smoke Lote2');

  insert into public.fornecedor (empresa_id, nome_razao, email)
    values (v_e1, 'SMOKE Fornecedor', 'smoke.lote2.fornecedor@exemplo.test') returning id into v_forn;
  insert into public.cotacao (empresa_id, numero, status)
    values (v_e1, 'COT-SMOKE-LOTE2K', 'Aberta') returning id into v_cot;
  insert into public.cotacao_item (empresa_id, cotacao_id, descricao, quantidade, unidade)
    values (v_e1, v_cot, 'SMOKE item', 1, 'un') returning id into v_item;
  insert into public.cotacao_fornecedor (empresa_id, cotacao_id, fornecedor_id, fornecedor_nome, fornecedor_email)
    values (v_e1, v_cot, v_forn, 'SMOKE Fornecedor', 'smoke.lote2.fornecedor@exemplo.test')
    returning id, token into v_cf, v_tok;
  insert into public.fornecedor_acesso (empresa_id, fornecedor_id, fornecedor_email, fornecedor_nome, senha_acesso, ativo)
    values (v_e1, v_forn, 'smoke.lote2.fornecedor@exemplo.test', 'SMOKE Fornecedor', v_hash, true)
    returning id into v_fa;

  -- 1. quem trabalha em Compras (ou é administrador): não toca na credencial, mas usa as telas ---------------
  foreach v_quem in array array['admin', 'holding', 'compras', 'hist'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;

    -- a credencial do portal não aparece (o front novo pede status ao servidor)
    select count(*) into v_cnt from public.fornecedor_acesso where empresa_id = v_e1;
    if v_cnt <> 0 then raise exception 'FALHOU [%]: leu fornecedor_acesso (o hash da senha)', v_quem; end if;
    v_n := v_n + 1;
    -- nem grava (era o furo: trocar a senha e entrar como o fornecedor)
    perform public.smoke_lote2_recusa(
      format('update public.fornecedor_acesso set senha_acesso = %L where id = %L', v_hash, v_fa),
      '42501', 'permission denied for table fornecedor_acesso');
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa(format(
      'insert into public.fornecedor_acesso (empresa_id, fornecedor_id, fornecedor_email, senha_acesso) values (%L, %L, %L, %L)',
      v_e1, v_forn, 'smoke.lote2.ataque.' || v_quem || '@exemplo.test', v_hash),
      '42501', 'permission denied for table fornecedor_acesso');
    v_n := v_n + 1;

    -- telas de Compras: leem cotacao_fornecedor (status, valores) e marcam a notificação (LinksModal)
    select count(*) into v_cnt from public.cotacao_fornecedor where id = v_cf and token is not null;
    if v_cnt <> 1 then raise exception 'FALHOU [%]: deixou de ler cotacao_fornecedor', v_quem; end if;
    v_n := v_n + 1;
    update public.cotacao_fornecedor set ultima_notificacao = now() where id = v_cf;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'FALHOU [%]: não marcou ultima_notificacao', v_quem; end if;
    v_n := v_n + 1;
    -- exclusão física não passa (o SDK só faz a lógica)
    perform public.smoke_lote2_recusa(format('delete from public.cotacao_fornecedor where id = %L', v_cf),
      '42501', 'permission denied for table cotacao_fornecedor');
    v_n := v_n + 1;

    reset role;
  end loop;
  raise notice '[admin/holding/compras/hist] OK sem credencial; telas de Compras seguem';

  -- 2. Compras → Cotações: CotacaoModal cria a participação (o banco gera o token), ComparacaoPrecos grava a
  --    resposta (o trigger da 0118 lê cotacao_fornecedor como o usuário) e a exclusão lógica passa ------------
  insert into public.fornecedor (empresa_id, nome_razao, email)
    values (v_e1, 'SMOKE Fornecedor novo', 'smoke.lote2.forn.novo@exemplo.test') returning id into v_forn_novo;
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('compras', v_e1), true);
  set local role authenticated;
  insert into public.cotacao_fornecedor (empresa_id, cotacao_id, fornecedor_id, fornecedor_nome, fornecedor_email, status)
    values (v_e1, v_cot, v_forn_novo, 'SMOKE Fornecedor novo', 'smoke.lote2.forn.novo@exemplo.test', 'Enviada')
    returning id, token into v_cf_novo, v_tok_novo;
  if v_cf_novo is null or v_tok_novo !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'FALHOU [compras]: criar participação não devolveu o token do banco';
  end if;
  v_n := v_n + 1;
  insert into public.cotacao_resposta (empresa_id, cotacao_id, cotacao_fornecedor_id, fornecedor_id, item_id, valor_unitario)
    values (v_e1, v_cot, v_cf_novo, v_forn_novo, v_item, 10);
  v_n := v_n + 1;
  update public.cotacao_fornecedor set deleted_at = now() where id = v_cf_novo;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [compras]: exclusão lógica da participação não passou'; end if;
  v_n := v_n + 1;
  reset role;

  -- 3. Estoque (sem Compras): não vê o token nem mexe na cotação ------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('estoque', v_e1), true);
  set local role authenticated;
  select count(*) into v_cnt from public.cotacao_fornecedor where id = v_cf;
  if v_cnt <> 0 then raise exception 'FALHOU [estoque]: leu o token da cotação'; end if;
  v_n := v_n + 1;
  update public.cotacao_fornecedor set status = 'Respondida Totalmente' where id = v_cf;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU [estoque]: alterou cotacao_fornecedor'; end if;
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'insert into public.cotacao_fornecedor (empresa_id, cotacao_id, fornecedor_id) values (%L, %L, %L)',
    v_e1, v_cot, v_forn), '42501', 'new row violates row-level security%');
  v_n := v_n + 1;
  select count(*) into v_cnt from public.fornecedor_acesso where id = v_fa;
  if v_cnt <> 0 then raise exception 'FALHOU [estoque]: leu a credencial'; end if;
  v_n := v_n + 1;
  reset role;
  raise notice '[estoque] OK sem Compras não vê o token nem a credencial';

  -- 3b. critério ESTRITO do vínculo (o da 0147, caso P03 do smoke do EAD, e o do login): só ativo = true vale.
  --     Vínculo com ativo NULO ou = false, mesmo com permissão de Compras, não lê nem grava cotacao_fornecedor --
  foreach v_quem in array array['compras_nulo', 'compras_inativo'] loop
    perform set_config('request.jwt.claims', public.smoke_lote2_claims(v_quem, v_e1), true);
    set local role authenticated;
    v_ok := public.tem_permissao('Compras');
    if v_ok is not false then
      raise exception 'FALHOU [%]: tem_permissao aceitou vínculo que não é ativo = true', v_quem;
    end if;
    v_n := v_n + 1;
    select count(*) into v_cnt from public.cotacao_fornecedor where id = v_cf;
    if v_cnt <> 0 then raise exception 'FALHOU [%]: vínculo não ativo leu cotacao_fornecedor', v_quem; end if;
    v_n := v_n + 1;
    update public.cotacao_fornecedor set status = 'Respondida Totalmente' where id = v_cf;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then raise exception 'FALHOU [%]: vínculo não ativo alterou cotacao_fornecedor', v_quem; end if;
    v_n := v_n + 1;
    perform public.smoke_lote2_recusa(format(
      'insert into public.cotacao_fornecedor (empresa_id, cotacao_id, fornecedor_id) values (%L, %L, %L)',
      v_e1, v_cot, v_forn_novo), '42501', 'new row violates row-level security%');
    v_n := v_n + 1;
    reset role;
  end loop;
  raise notice '[compras_nulo/compras_inativo] OK ativo nulo e ativo = false barrados (critério estrito)';

  -- 4. outra empresa: nada da 1ª -----------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  select (select count(*) from public.fornecedor_acesso where id = v_fa)
       + (select count(*) from public.cotacao_fornecedor where id = v_cf) into v_cnt;
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: viu dado de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 5. super admin: lê (suporte), não grava pela API ------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  select count(*) into v_cnt from public.fornecedor_acesso where id = v_fa;
  if v_cnt <> 1 then raise exception 'FALHOU [super]: super admin deixou de ler fornecedor_acesso'; end if;
  v_n := v_n + 1;
  select count(*) into v_cnt from public.cotacao_fornecedor where id = v_cf;
  if v_cnt <> 1 then raise exception 'FALHOU [super]: super admin deixou de ler cotacao_fornecedor'; end if;
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(
    format('update public.fornecedor_acesso set senha_acesso = %L where id = %L', v_hash, v_fa),
    '42501', 'permission denied for table fornecedor_acesso');
  v_n := v_n + 1;
  reset role;

  -- 6. o servidor (Edge Function fornecedor-acesso / portal-fornecedor-login, service_role) ----------------------
  if not pg_has_role(current_user, 'service_role', 'MEMBER') then
    raise notice '[servidor] PULADO: o usuário da consulta não pode assumir service_role';
  else
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  -- status: lê a credencial
  select count(*) into v_cnt from public.fornecedor_acesso where empresa_id = v_e1 and fornecedor_id = v_forn;
  if v_cnt <> 1 then raise exception 'FALHOU [servidor]: não leu fornecedor_acesso'; end if;
  v_n := v_n + 1;
  -- credencial: troca a senha (bcrypt) do acesso que existe
  update public.fornecedor_acesso set senha_acesso = v_bcrypt where id = v_fa and empresa_id = v_e1;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [servidor]: não trocou a senha do portal'; end if;
  v_n := v_n + 1;
  -- credencial: cria o acesso com id escolhido pela função
  insert into public.fornecedor_acesso (id, empresa_id, fornecedor_id, fornecedor_nome, fornecedor_email, senha_acesso, ativo)
    values (v_fa_novo, v_e1, v_forn_novo, 'SMOKE Fornecedor novo', 'smoke.lote2.forn.novo@exemplo.test', v_bcrypt, true);
  v_n := v_n + 1;
  -- auditoria da credencial (formato da função; tipo_acao livre desde a 0022)
  insert into public.audit_log (empresa_id, usuario_email, tipo_acao, entidade, entidade_id, entidade_nome,
                                descricao, modulo, dados_novos, status, endereco_ip, user_agent)
    values (v_e1, 'smoke.lote2.compras@exemplo.test', 'senha_portal_fornecedor', 'fornecedor_acesso', v_fa_novo,
            'SMOKE Fornecedor novo', 'SMOKE gerou senha nova do Portal do Fornecedor', 'Compras',
            jsonb_build_object('fornecedor_id', v_forn_novo, 'acesso_novo', true), 'sucesso',
            '203.0.113.7', 'smoke');
  v_n := v_n + 1;
  -- reemitir_link: token = null → o trigger da 0113 gera outro
  update public.cotacao_fornecedor set token = null where id = v_cf and empresa_id = v_e1
    returning token into v_tok_novo;
  if v_tok_novo is null or v_tok_novo = v_tok or v_tok_novo !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'FALHOU [servidor]: reemitir o link não gerou token novo';
  end if;
  v_n := v_n + 1;
  reset role;
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-K OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-K OK: portal do fornecedor só pelo servidor (0179)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
