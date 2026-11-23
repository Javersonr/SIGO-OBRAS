-- ============================================================================
-- smoke-lote2-j-compras-aprovacao.sql — valida a 0178 (Lote 2b-1, F-06, regras do
-- dono de 23/11 e revisão achados 1, 2 e 8):
--   regra 1: quem pede não aprova a própria (pelo autor do token E pelo
--            solicitante_id da tela, que é id de usuario_custom), salvo
--            administrador; o solicitante passa a receber o aviso;
--   regra 2: mexer em item (quantidade, preço, incluir, excluir lógico e físico) de
--            solicitação JÁ APROVADA a devolve para "Pendente Aprovação" no nível 1;
--            pendente, em qualquer nível, pode ter item ajustado sem mudar de nível
--            (o aprovador do nível 2 ajusta e aprova numa ação, AprovacaoModal.jsx:195-230);
--            item que aponta para solicitação de outra empresa é recusado, e o
--            trigger de pendente só mexe na solicitação da mesma empresa do item;
--   regra 3: valor fora de todas as faixas: perfil comum não aprova, administrador
--            aprova; empresa sem nenhuma faixa segue como hoje;
--   travas: ninguém aprova pela API sem a RPC, nem muda nível, autor ou valor;
--   alçadas: só o administrador grava nivel_aprovacao.
--
-- Transação com ROLLBACK; DUAS EMPRESAS SINTÉTICAS (com faixas e sem faixas),
-- usuários (usuario_empresa e usuario_custom), faixas, solicitações e itens
-- sintéticos (e-mails @exemplo.test) criados aqui; nenhum UUID fixo, nenhuma linha
-- real usada. Perfis simulados: solic (Compras), comprador (Compras, não é o
-- solicitante), gestor (Gestor), admin (Admin), holding (Admin Holding), outra
-- (Admin de outra empresa), solic2/comum2 (Compras da empresa sem faixas) e super
-- (super admin SEM vínculo na empresa).
--
-- Como rodar (com a 0178 aplicada):
--   supabase db query --linked -f tools/smoke-lote2-j-compras-aprovacao.sql
-- Deve terminar com a linha "SMOKE LOTE2-J OK" e o número de verificações.
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
  v_e1 uuid;          -- empresa com faixa (nível 1 = Gestor, até R$ 5.000)
  v_e2 uuid;          -- empresa sem nenhuma faixa
  v_uc_solic uuid;    -- usuario_custom do solicitante (o user.id da tela)
  v_nivel1 uuid;
  v_sc uuid;          -- R$ 1.000, pedida pelo solic, aprovada pelo gestor
  v_sc_legado uuid;   -- criada sem autor (legado), solicitante_id = usuario_custom
  v_sc_admin uuid;    -- pedida pelo próprio admin
  v_sc_grande uuid;   -- R$ 10.000, fora da faixa
  v_sc_e2 uuid;       -- empresa sem faixas
  v_sc_epi uuid;      -- sem solicitante_id (como SolicitacaoEPIModal.jsx:126): só o autor do token
  v_sc_holding uuid;  -- pedida pelo próprio Admin Holding
  v_sc_super uuid;    -- pedida pelo próprio super admin
  v_sc_rej uuid;      -- rejeitada no nível 2 e reaberta
  v_sc_x uuid;        -- solicitação que "muda de empresa" (teste do filtro por empresa)
  v_status text;
  v_nivel int;
  v_valor numeric;
  v_aprov text;
  v_autor uuid;
  v_rows bigint;
  v_cnt bigint;
  r jsonb;
  v_n int := 0;
begin
  if not exists (select 1 from pg_proc where oid = 'public.aprovar_solicitacao_compra(uuid,text,text,text,text)'::regprocedure
                  and prosecdef)
     or not exists (select 1 from pg_trigger where tgname = 'trg_volta_pendente_item_alterado' and not tgisinternal) then
    raise exception 'A 0178 não está aplicada (aprovar não é definer ou falta o trigger dos itens).';
  end if;
  v_n := v_n + 1;
  if has_function_privilege('authenticated', 'public.solicitacao_compra_email_solicitante(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.aprovar_solicitacao_compra(uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.aprovar_solicitacao_compra(uuid,text,text,text,text)', 'EXECUTE') then
    raise exception 'FALHOU: grants das funções de compras errados';
  end if;
  v_n := v_n + 1;

  -- 1. massa (como servidor) -----------------------------------------------------------------------------------
  insert into public.empresa (nome) values ('SMOKE LOTE2 com faixas') returning id into v_e1;
  insert into public.empresa (nome) values ('SMOKE LOTE2 sem faixas') returning id into v_e2;
  raise notice '== empresas sintéticas: % (com faixa) e % (sem faixa)', v_e1, v_e2;

  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    values (v_e1, 'smoke.lote2.solic@exemplo.test', 'Compras', true,
            '{"Compras":{"Solicitações":{"visualizar":true,"criar":true},"Cotações":{"visualizar":true,"editar":true}}}'::jsonb,
            'Smoke Solic'),
           (v_e1, 'smoke.lote2.gestor@exemplo.test', 'Gestor', true, null, 'Smoke Gestor'),
           (v_e1, 'smoke.lote2.comprador@exemplo.test', 'Compras', true, null, 'Smoke Comprador'),
           (v_e1, 'smoke.lote2.admin@exemplo.test', 'Admin', true, null, 'Smoke Admin'),
           (v_e1, 'smoke.lote2.holding@exemplo.test', 'Admin Holding', true, null, 'Smoke Holding'),
           (v_e2, 'smoke.lote2.outra@exemplo.test', 'Admin', true, null, 'Smoke Outra'),
           (v_e2, 'smoke.lote2.comum2@exemplo.test', 'Compras', true, null, 'Smoke Comum E2'),
           (v_e2, 'smoke.lote2.solic2@exemplo.test', 'Compras', true, null, 'Smoke Solic E2');
  -- o login da tela: user.id = usuario_custom.id (login-custom/index.ts:324-326)
  insert into public.usuario_custom (email, senha_hash, nome_completo, empresa_id)
    values ('smoke.lote2.solic@exemplo.test', 'smoke-sem-senha', 'Smoke Solic', v_e1) returning id into v_uc_solic;

  insert into public.nivel_aprovacao (empresa_id, nome, ordem, tipo, perfis_aprovadores, valor_minimo, valor_maximo)
    values (v_e1, 'SMOKE Nivel 1', 1, 'SolicitacaoCompra', '["Gestor"]'::jsonb, 0, 5000) returning id into v_nivel1;
  insert into public.nivel_aprovacao (empresa_id, nome, ordem, tipo, perfis_aprovadores, valor_minimo, valor_maximo)
    values (v_e1, 'SMOKE Nivel 2', 2, 'SolicitacaoCompra', '["Admin"]'::jsonb, 1500, 5000);

  -- legado: sem autor no token, solicitante_id = usuario_custom (como a tela grava)
  insert into public.solicitacao_compra (empresa_id, numero, status, solicitante_id, solicitante_nome)
    values (v_e1, 'SC-SMOKE-L2-LEGADO', 'Pendente Aprovação', v_uc_solic, 'Smoke Solic') returning id into v_sc_legado;

  -- 2. solicitante: cria como a tela (Compras.jsx:264), não aprova a própria ---------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('solic', v_e1), true);
  set local role authenticated;
  insert into public.solicitacao_compra
    (empresa_id, numero, status, solicitante_id, solicitante_nome, solicitante_email, prioridade, origem, total_itens)
    values (v_e1, 'SC-SMOKE-L2-1', 'Pendente Aprovação', v_uc_solic, 'Smoke Solic', 'smoke.lote2.solic@exemplo.test',
            'Normal', 'Manual', 1)
    returning id, created_by into v_sc, v_autor;
  if v_autor is distinct from md5('smoke-lote2-solic')::uuid then
    raise exception 'FALHOU [solic]: created_by não é o autor do token (%)', v_autor;
  end if;
  v_n := v_n + 1;
  insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade, unidade, preco_unitario_estimado)
    values (v_e1, v_sc, 'SMOKE item', 10, 'un', 100);
  select valor_total_estimado into v_valor from public.solicitacao_compra where id = v_sc;
  if v_valor is distinct from 1000 then raise exception 'FALHOU [solic]: o valor não veio dos itens (%)', v_valor; end if;
  v_n := v_n + 1;
  -- valor declarado no INSERT é ignorado (achado 8): nasce 0
  insert into public.solicitacao_compra (empresa_id, numero, status, valor_total_estimado)
    values (v_e1, 'SC-SMOKE-L2-GRANDE', 'Pendente Aprovação', 1) returning id, valor_total_estimado into v_sc_grande, v_valor;
  if v_valor <> 0 then raise exception 'FALHOU [solic]: valor declarado no INSERT foi aceito (%)', v_valor; end if;
  v_n := v_n + 1;
  insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade, unidade, preco_unitario_estimado)
    values (v_e1, v_sc_grande, 'SMOKE item grande', 100, 'un', 100);   -- R$ 10.000: fora da faixa

  -- regra 1 (negativo): a própria, pelo autor do token e pelo legado
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, null, %L, %L, null)', v_sc, 'Smoke Solic', 'Admin'),
    'P0001', 'Solicitante não pode aprovar a própria solicitação%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, null, %L, null, null)', v_sc_legado, 'Smoke Solic'),
    'P0001', 'Solicitante não pode aprovar a própria solicitação%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'select public.rejeitar_solicitacao_compra(%L, null, %L, null, %L)', v_sc, 'Smoke Solic', 'SMOKE desisti'),
    'P0001', 'Solicitante não pode rejeitar a própria solicitação%');
  v_n := v_n + 1;

  -- regra 1 só pelo autor do token: solicitação sem solicitante_id (SolicitacaoEPIModal.jsx:126)
  insert into public.solicitacao_compra (empresa_id, numero, status, solicitante_nome, total_itens)
    values (v_e1, 'SC-SMOKE-L2-EPI', 'Pendente Aprovação', 'Funcionário qualquer', 1) returning id into v_sc_epi;
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, null, %L, null, null)', v_sc_epi, 'Smoke Solic'),
    'P0001', 'Solicitante não pode aprovar a própria solicitação%');
  v_n := v_n + 1;

  -- travas pela API
  perform public.smoke_lote2_recusa(format(
    'insert into public.solicitacao_compra (empresa_id, numero, status) values (%L, %L, %L)',
    v_e1, 'SC-SMOKE-FORJADA', 'Aprovada'), '42501', 'Acesso negado: a solicitação de compra nasce pendente%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'insert into public.solicitacao_compra (empresa_id, numero, status, nivel_aprovacao_atual) values (%L, %L, %L, 99)',
    v_e1, 'SC-SMOKE-FORJADA', 'Pendente Aprovação'), '42501', 'Acesso negado: a solicitação de compra nasce no nível 1%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'update public.solicitacao_compra set status = %L where id = %L', 'Aprovada', v_sc),
    '42501', 'Acesso negado: só a tela de aprovação%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'update public.solicitacao_compra set valor_total_estimado = 0 where id = %L', v_sc),
    '42501', 'Acesso negado: o valor estimado da solicitação vem dos itens%');
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'update public.solicitacao_compra set created_by = null where id = %L', v_sc),
    '42501', 'Acesso negado: o autor da solicitação de compra não muda%');
  v_n := v_n + 1;
  -- alçada: o solicitante não mexe
  update public.nivel_aprovacao set perfis_aprovadores = '["Compras"]'::jsonb where id = v_nivel1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHOU [solic]: trocou os aprovadores da faixa'; end if;
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'insert into public.nivel_aprovacao (empresa_id, nome, ordem, tipo, perfis_aprovadores) values (%L, %L, 2, %L, %L::jsonb)',
    v_e1, 'SMOKE forjado', 'SolicitacaoCompra', '["Compras"]'), '42501', 'new row violates row-level security%');
  v_n := v_n + 1;
  select count(*) into v_cnt from public.nivel_aprovacao where id = v_nivel1;   -- AprovacaoModal.jsx:90
  if v_cnt <> 1 then raise exception 'FALHOU [solic]: deixou de ler a faixa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 3a. comprador (não é o solicitante) declara 'Admin': o perfil vem do token, e 'Compras' não está no nível -----
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('comprador', v_e1), true);
  set local role authenticated;
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, null, %L, %L, null)', v_sc, 'Smoke Comprador', 'Admin'),
    'P0001', 'Perfil "Compras" não autorizado%');
  v_n := v_n + 1;
  reset role;

  -- 3. gestor: aprova a do solic (positivo); regra 3 barra a fora da faixa (negativo) -----------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('gestor', v_e1), true);
  set local role authenticated;
  r := public.aprovar_solicitacao_compra(v_sc, 'ignorado@exemplo.test', 'Smoke Gestor', 'Admin', 'ok');
  if (r ->> 'aprovada_final')::boolean is not true then raise exception 'FALHOU [gestor]: devia aprovar (%)', r; end if;
  v_n := v_n + 1;
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, null, %L, null, null)', v_sc_grande, 'Smoke Gestor'),
    'P0001', 'Nenhuma faixa de aprovação cobre R$%só o administrador aprova');
  v_n := v_n + 1;
  reset role;

  -- o solicitante recebeu o aviso (achado 1: antes não chegava)
  select count(*) into v_cnt from public.notificacao
   where empresa_id = v_e1 and usuario_email = 'smoke.lote2.solic@exemplo.test' and titulo like '%foi APROVADA%';
  if v_cnt < 1 then raise exception 'FALHOU: o solicitante não recebeu o aviso de aprovada'; end if;
  v_n := v_n + 1;

  -- 4. administrador: aprova a fora da faixa (regra 3) e a própria (regra 1) ------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('admin', v_e1), true);
  set local role authenticated;
  r := public.aprovar_solicitacao_compra(v_sc_grande, null, 'Smoke Admin', null, 'ok admin');
  if (r ->> 'aprovada_final')::boolean is not true then raise exception 'FALHOU [admin]: devia aprovar fora da faixa (%)', r; end if;
  v_n := v_n + 1;
  insert into public.solicitacao_compra (empresa_id, numero, status, solicitante_nome)
    values (v_e1, 'SC-SMOKE-L2-ADMIN', 'Pendente Aprovação', 'Smoke Admin') returning id into v_sc_admin;
  insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade, unidade, preco_unitario_estimado)
    values (v_e1, v_sc_admin, 'SMOKE item admin', 1, 'un', 100);
  r := public.aprovar_solicitacao_compra(v_sc_admin, null, 'Smoke Admin', null, 'a minha');
  if (r ->> 'aprovada_final')::boolean is not true then raise exception 'FALHOU [admin]: administrador devia aprovar a própria (%)', r; end if;
  v_n := v_n + 1;
  -- alçada: o administrador grava (AprovacaoConfigTab)
  update public.nivel_aprovacao set valor_maximo = 6000 where id = v_nivel1;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FALHOU [admin]: não alterou a faixa'; end if;
  v_n := v_n + 1;
  reset role;

  perform set_config('request.jwt.claims', public.smoke_lote2_claims('holding', v_e1), true);
  set local role authenticated;
  insert into public.nivel_aprovacao (empresa_id, nome, ordem, tipo, perfis_aprovadores)
    values (v_e1, 'SMOKE Nivel orçamento', 1, 'OrcamentoProjeto', '["Admin"]'::jsonb);
  v_n := v_n + 1;
  -- regra 1: o Admin Holding aprova a própria
  insert into public.solicitacao_compra (empresa_id, numero, status) values (v_e1, 'SC-SMOKE-L2-HOLDING', 'Pendente Aprovação')
    returning id into v_sc_holding;
  insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade, unidade, preco_unitario_estimado)
    values (v_e1, v_sc_holding, 'SMOKE item holding', 1, 'un', 100);
  r := public.aprovar_solicitacao_compra(v_sc_holding, null, 'Smoke Holding', null, 'a minha');
  if (r ->> 'aprovada_final')::boolean is not true then raise exception 'FALHOU [holding]: devia aprovar a própria (%)', r; end if;
  v_n := v_n + 1;
  reset role;

  -- regra 1: o super admin (sem vínculo na empresa) aprova a própria
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('super', v_e1, true), true);
  set local role authenticated;
  insert into public.solicitacao_compra (empresa_id, numero, status) values (v_e1, 'SC-SMOKE-L2-SUPER', 'Pendente Aprovação')
    returning id, created_by into v_sc_super, v_autor;
  if v_autor is distinct from md5('smoke-lote2-super')::uuid then
    raise exception 'FALHOU [super]: created_by não gravado para o super admin (%)', v_autor;
  end if;
  insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade, unidade, preco_unitario_estimado)
    values (v_e1, v_sc_super, 'SMOKE item super', 1, 'un', 100);
  r := public.aprovar_solicitacao_compra(v_sc_super, null, 'Smoke Super', null, 'a minha');
  if (r ->> 'aprovada_final')::boolean is not true then raise exception 'FALHOU [super]: devia aprovar a própria (%)', r; end if;
  v_n := v_n + 1;
  reset role;

  -- 5. regra 2: mexer no item volta para pendente no nível 1 ------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('solic', v_e1), true);
  set local role authenticated;
  -- quantidade, numa aprovada que já está "Em Cotação"
  update public.solicitacao_compra set status = 'Em Cotação' where id = v_sc;   -- CotacaoModal.jsx:281 (segue livre)
  update public.solicitacao_compra_item set quantidade = 20 where solicitacao_id = v_sc;
  select status, nivel_aprovacao_atual, aprovador_final_email, valor_total_estimado
    into v_status, v_nivel, v_aprov, v_valor
    from public.solicitacao_compra where id = v_sc;
  if v_status <> 'Pendente Aprovação' or coalesce(v_nivel, 1) <> 1 or v_aprov is not null or v_valor <> 2000 then
    raise exception 'FALHOU [regra 2]: depois de mudar a quantidade: % / % / % / %', v_status, v_nivel, v_aprov, v_valor;
  end if;
  v_n := v_n + 1;
  -- preço (preco_unitario_estimado), numa aprovada pelo admin
  update public.solicitacao_compra_item set preco_unitario_estimado = 50 where solicitacao_id = v_sc_grande;
  select status into v_status from public.solicitacao_compra where id = v_sc_grande;
  if v_status <> 'Pendente Aprovação' then raise exception 'FALHOU [regra 2]: mudar o preço não voltou a pendente (%)', v_status; end if;
  v_n := v_n + 1;
  -- exclusão lógica (Compras.jsx:450, AprovacaoModal.jsx:340)
  update public.solicitacao_compra_item set deleted_at = now() where solicitacao_id = v_sc_admin;
  select status into v_status from public.solicitacao_compra where id = v_sc_admin;
  if v_status <> 'Pendente Aprovação' then raise exception 'FALHOU [regra 2]: excluir (lógico) não voltou a pendente (%)', v_status; end if;
  v_n := v_n + 1;
  -- DELETE físico do item (a API permite a authenticated)
  delete from public.solicitacao_compra_item where solicitacao_id = v_sc_holding;
  select status into v_status from public.solicitacao_compra where id = v_sc_holding;
  if v_status <> 'Pendente Aprovação' then raise exception 'FALHOU [regra 2]: DELETE do item não voltou a pendente (%)', v_status; end if;
  v_n := v_n + 1;
  reset role;

  -- pendente no nível 2 (revisão 2b-1, achado 17): o gestor aprova o nível 1 (R$ 2.000 → nível 2 = Admin)…
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('gestor', v_e1), true);
  set local role authenticated;
  r := public.aprovar_solicitacao_compra(v_sc, null, 'Smoke Gestor', null, 'nível 1');
  if (r ->> 'proximo_nivel')::int is distinct from 2 then raise exception 'FALHOU [gestor]: devia ir para o nível 2 (%)', r; end if;
  reset role;
  -- …e o aprovador do nível 2 ajusta a quantidade e aprova numa ação só, como o AprovacaoModal.jsx:195-230:
  -- ajustar item de PENDENTE não reinicia o nível
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('admin', v_e1), true);
  set local role authenticated;
  update public.solicitacao_compra_item set quantidade = 21 where solicitacao_id = v_sc and descricao = 'SMOKE item';
  select status, nivel_aprovacao_atual, valor_total_estimado into v_status, v_nivel, v_valor
    from public.solicitacao_compra where id = v_sc;
  if v_status <> 'Pendente Aprovação' or v_nivel <> 2 or v_valor <> 2100 then
    raise exception 'FALHOU [regra 2]: ajustar item da pendente no nível 2 mudou o nível (% / % / %)', v_status, v_nivel, v_valor;
  end if;
  v_n := v_n + 1;
  r := public.aprovar_solicitacao_compra(v_sc, null, 'Smoke Admin', null, 'nível 2 com ajuste');
  if (r ->> 'aprovada_final')::boolean is not true then
    raise exception 'FALHOU [admin]: o aprovador do nível 2 devia aprovar logo depois do ajuste (%)', r;
  end if;
  v_n := v_n + 1;
  reset role;
  -- "Rejeitada" → "Pendente Aprovação" volta ao nível 1
  reset role;
  insert into public.solicitacao_compra (empresa_id, numero, status, nivel_aprovacao_atual)
    values (v_e1, 'SC-SMOKE-L2-REJ', 'Rejeitada', 2) returning id into v_sc_rej;   -- como servidor
  set local role authenticated;
  update public.solicitacao_compra set status = 'Pendente Aprovação' where id = v_sc_rej;
  select nivel_aprovacao_atual into v_nivel from public.solicitacao_compra where id = v_sc_rej;
  if v_nivel <> 1 then raise exception 'FALHOU: reaberta de "Rejeitada" manteve o nível %', v_nivel; end if;
  v_n := v_n + 1;
  reset role;

  -- item de OUTRA empresa apontando para solicitação aprovada da 1ª: recusado e sem efeito na 1ª
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('solic2', v_e2), true);
  set local role authenticated;
  perform public.smoke_lote2_recusa(format(
    'insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade) values (%L, %L, %L, 1)',
    v_e2, v_sc_super, 'SMOKE ataque'),
    '42501', 'Acesso negado: solicitacao_id aponta para registro de outra empresa');
  v_n := v_n + 1;
  reset role;
  select status into v_status from public.solicitacao_compra where id = v_sc_super;
  if v_status <> 'Aprovada' then raise exception 'FALHOU: item de outra empresa mexeu na solicitação da 1ª (%)', v_status; end if;
  v_n := v_n + 1;

  -- filtro por empresa do trigger de pendente (revisão 2b-1, achado 18), sem desligar trigger: o caminho que o
  -- referencias_da_empresa do item não cobre é a SOLICITAÇÃO mudar de empresa (não há esse trigger nela). Como
  -- servidor: item da 2ª empresa numa solicitação da 2ª, que é aprovada e depois passa para a 1ª; o usuário da
  -- 2ª mexe na quantidade do próprio item (UPDATE só de quantidade: o trigger de referências não roda).
  insert into public.solicitacao_compra (empresa_id, numero, status) values (v_e2, 'SC-SMOKE-L2-X', 'Pendente Aprovação')
    returning id into v_sc_x;
  insert into public.solicitacao_compra_item (empresa_id, solicitacao_id, descricao, quantidade)
    values (v_e2, v_sc_x, 'SMOKE item cruzado', 1);
  update public.solicitacao_compra set status = 'Aprovada', empresa_id = v_e1 where id = v_sc_x;
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('solic2', v_e2), true);
  set local role authenticated;
  update public.solicitacao_compra_item set quantidade = 2 where solicitacao_id = v_sc_x;
  get diagnostics v_rows = row_count;
  reset role;
  if v_rows <> 1 then raise exception 'FALHOU [filtro]: o usuário da 2ª empresa não alterou o próprio item'; end if;
  select status into v_status from public.solicitacao_compra where id = v_sc_x;
  if v_status <> 'Aprovada' then
    raise exception 'FALHOU [filtro]: o trigger de pendente mexeu em solicitação de outra empresa (%)', v_status;
  end if;
  v_n := v_n + 1;

  -- 6. empresa sem nenhuma faixa: como hoje, perfil comum aprova (não é a própria) --------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('solic2', v_e2), true);
  set local role authenticated;
  insert into public.solicitacao_compra (empresa_id, numero, status) values (v_e2, 'SC-SMOKE-L2-E2', 'Pendente Aprovação')
    returning id into v_sc_e2;
  reset role;
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('comum2', v_e2), true);
  set local role authenticated;
  r := public.aprovar_solicitacao_compra(v_sc_e2, null, 'Smoke Comum E2', null, 'sem faixas');
  if (r ->> 'aprovada_final')::boolean is not true then raise exception 'FALHOU [sem faixas]: devia aprovar como hoje (%)', r; end if;
  v_n := v_n + 1;
  reset role;

  -- 7. outra empresa: a RPC recusa solicitação alheia ------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_lote2_claims('outra', v_e2), true);
  set local role authenticated;
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, null, %L, null, null)', v_sc_admin, 'Smoke Outra'),
    '42501', 'Acesso negado: solicitação de outra empresa');
  v_n := v_n + 1;
  select count(*) into v_cnt from public.solicitacao_compra where id in (v_sc, v_sc_admin);
  if v_cnt <> 0 then raise exception 'FALHOU [outra]: leu solicitação de outra empresa'; end if;
  v_n := v_n + 1;
  reset role;

  -- 8. servidor (sem JWT): o perfil declarado não libera a própria aprovação -----------------------------------
  perform set_config('request.jwt.claims', '', true);
  perform public.smoke_lote2_recusa(format(
    'select public.aprovar_solicitacao_compra(%L, %L, %L, %L, null)', v_sc_legado, 'smoke.lote2.solic@exemplo.test',
    'Smoke Solic', 'Admin'),
    'P0001', 'Solicitante não pode aprovar a própria solicitação%');
  v_n := v_n + 1;

  perform set_config('smoke.lote2_ok', v_n::text, true);
  raise notice '============ SMOKE LOTE2-J OK (% verificações) ============', v_n;
end;
$$;

select 'SMOKE LOTE2-J OK: aprovação de compras com as regras do dono (0178)' as res,
       current_setting('smoke.lote2_ok', true)::int as verificacoes_ok;

rollback;
