-- ============================================================================
-- smoke-conector-orcamento.sql — valida a 0153 (orçamento e desconto do
-- conector do Claude gravados numa transação; Plano 2 do conector, T14)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria, nas duas
-- empresas mais antigas da base (A e B), oportunidades e itens de orçamento
-- sintéticos ("SMOKE T14 ...") e confere:
--   0. catálogo: anon e authenticated sem EXECUTE; service_role com EXECUTE;
--   1. substituir sem p_substituir, com itens existentes → ja_existe e nada muda;
--   2. com p_substituir → os antigos ficam com deleted_at, os novos entram com o
--      empresa_id e o oportunidade_id dos PARÂMETROS (o empresa_id do JSON é
--      ignorado), o orcamento_info é gravado e a atualização "Sistema" registrada;
--   3. oportunidade de outra empresa → nao_encontrada e nada muda na B;
--   4. 3001 registros → 22023 e nada muda;
--   5. desconto com a contagem errada → orcamento_mudou; com um id trocado (a
--      mesma contagem) → orcamento_mudou e nada fica gravado; com a lista certa
--      → grava os preços, o desconto_proposta_pct e a atualização;
--   6. desconto 100 ou com 3 casas → 22023;
--   7. authenticated não executa as duas funções (permission denied).
-- Nenhum UUID fixo: as empresas e os registros são escolhidos ou criados em
-- tempo de execução.
--
-- Como rodar (com a 0153 já aplicada; quem roda é o Javerson):
--   supabase db query --linked -f tools/smoke-conector-orcamento.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- exige que o comando seja RECUSADO com o estado e a mensagem esperados; some no ROLLBACK
create or replace function public.smoke_t14_recusa(p_sql text, p_msg text, p_estado text default '42501')
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

do $smoke$
declare
  v_sub constant text := 'public.conector_substituir_orcamento(uuid, uuid, jsonb, jsonb, boolean, text, text)';
  v_desc constant text := 'public.conector_aplicar_desconto(uuid, uuid, numeric, jsonb, text)';
  v_a uuid;
  v_b uuid;
  v_op_a uuid;
  v_op_b uuid;
  v_r jsonb;
  v_n int;
  v_ids uuid[];
  v_registros jsonb;
  v_alteracoes jsonb;
  v_grandes jsonb;
begin
  -- 0. catálogo ------------------------------------------------------------------------------------------------------
  if has_function_privilege('authenticated', v_sub, 'execute') or has_function_privilege('anon', v_sub, 'execute')
     or has_function_privilege('authenticated', v_desc, 'execute') or has_function_privilege('anon', v_desc, 'execute') then
    raise exception 'FALHOU: anon/authenticated podem executar as funções do orçamento do conector';
  end if;
  if not has_function_privilege('service_role', v_sub, 'execute')
     or not has_function_privilege('service_role', v_desc, 'execute') then
    raise exception 'FALHOU: service_role sem EXECUTE nas funções do orçamento do conector';
  end if;
  raise notice '[0] OK catálogo: só service_role executa';

  -- massa ------------------------------------------------------------------------------------------------------------
  select id into v_a from public.empresa where deleted_at is null order by created_at limit 1;
  select id into v_b from public.empresa where deleted_at is null and id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then
    raise exception 'O smoke precisa de duas empresas cadastradas';
  end if;
  raise notice '== empresa A: %, empresa B: %', v_a, v_b;

  insert into public.oportunidade (empresa_id, nome) values (v_a, 'SMOKE T14 orçamento A') returning id into v_op_a;
  insert into public.oportunidade (empresa_id, nome) values (v_b, 'SMOKE T14 orçamento B') returning id into v_op_b;
  insert into public.orcamento_item (empresa_id, oportunidade_id, numero, item, etapa, descricao, quantidade,
                                     valor_unitario_ref, valor_unitario, valor_total, ordem)
  values (v_a, v_op_a, '1', '1', true, 'SMOKE etapa antiga', null, null, null, null, 0),
         (v_a, v_op_a, '1.1', '1.1', false, 'SMOKE item antigo', 2, 10, 10, 20, 1);
  insert into public.orcamento_item (empresa_id, oportunidade_id, numero, item, etapa, descricao, quantidade,
                                     valor_unitario_ref, valor_unitario, valor_total, ordem)
  values (v_b, v_op_b, '1.1', '1.1', false, 'SMOKE item da B', 1, 5, 5, 5, 0);

  -- o empresa_id e o oportunidade_id do JSON apontam para a B de propósito: têm de ser ignorados
  v_registros := jsonb_build_array(
    jsonb_build_object('empresa_id', v_b, 'oportunidade_id', v_op_b, 'numero', '1', 'item', '1', 'etapa', true,
      'descricao', 'SMOKE SERVIÇOS DE ELÉTRICA', 'ordem', 0),
    jsonb_build_object('empresa_id', v_b, 'oportunidade_id', v_op_b, 'numero', '1.1', 'item', '1.1', 'etapa', false,
      'codigo', '93358', 'fonte', 'SINAPI', 'descricao', 'SMOKE item 1.1', 'unidade', 'un', 'quantidade', 6,
      'valor_unitario_ref', 3505.49, 'valor_unitario', 3505.49, 'valor_total', 21032.94, 'ordem', 1),
    jsonb_build_object('empresa_id', v_b, 'oportunidade_id', v_op_b, 'numero', '1.2', 'item', '1.2', 'etapa', false,
      'descricao', 'SMOKE item 1.2', 'unidade', 'm', 'quantidade', 125.5,
      'valor_unitario_ref', 10.48, 'valor_unitario', 10.48, 'valor_total', 1315.24, 'ordem', 2)
  );

  -- 1. já existe e não pediu para substituir ---------------------------------------------------------------------------
  v_r := public.conector_substituir_orcamento(v_a, v_op_a, v_registros, '{"orgao":"SMOKE"}'::jsonb, false,
                                              'Smoke (via Claude)', 'SMOKE importação');
  if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'ja_existe', 'itens_atuais', 2) then
    raise exception 'FALHOU: sem p_substituir deveria dar ja_existe com 2 itens (veio %)', v_r;
  end if;
  select count(*) into v_n from public.orcamento_item
   where oportunidade_id = v_op_a and deleted_at is null and descricao like 'SMOKE item antigo%';
  if v_n <> 1 or (select orcamento_info ->> 'orgao' from public.oportunidade where id = v_op_a) is not null then
    raise exception 'FALHOU: o ja_existe mexeu no orçamento';
  end if;
  raise notice '[1] OK ja_existe sem p_substituir; nada mudou';

  -- 2. substituir ----------------------------------------------------------------------------------------------------
  v_r := public.conector_substituir_orcamento(v_a, v_op_a, v_registros,
           '{"orgao":"SMOKE Prefeitura","arquivo_nome":"via Claude"}'::jsonb, true,
           'Smoke (via Claude)', 'Orçamento importado pelo Claude: 1 etapas e 2 itens');
  if v_r is distinct from jsonb_build_object('ok', true, 'itens_gravados', 3, 'substituidos', 2) then
    raise exception 'FALHOU: substituir (veio %)', v_r;
  end if;
  select count(*) into v_n from public.orcamento_item
   where oportunidade_id = v_op_a and descricao like 'SMOKE%antig%' and deleted_at is not null;
  if v_n <> 2 then raise exception 'FALHOU: os 2 itens antigos deveriam ter deleted_at (vieram %)', v_n; end if;
  select count(*) into v_n from public.orcamento_item
   where oportunidade_id = v_op_a and deleted_at is null and empresa_id = v_a and tipo is null and bdi = 0 and imposto = 0;
  if v_n <> 3 then raise exception 'FALHOU: 3 itens novos na A, com tipo null e bdi/imposto 0 (vieram %)', v_n; end if;
  select count(*) into v_n from public.orcamento_item where oportunidade_id = v_op_b and deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: o JSON com a empresa B mexeu na B (% itens)', v_n; end if;
  if (select orcamento_info ->> 'orgao' from public.oportunidade where id = v_op_a) is distinct from 'SMOKE Prefeitura' then
    raise exception 'FALHOU: orcamento_info não gravado';
  end if;
  select count(*) into v_n from public.oportunidade_atualizacao
   where oportunidade_id = v_op_a and tipo = 'Sistema' and usuario_nome = 'Smoke (via Claude)'
     and dados_novos = jsonb_build_object('itens', 3, 'substituidos', 2);
  if v_n <> 1 then raise exception 'FALHOU: atualização "Sistema" da importação (vieram %)', v_n; end if;
  raise notice '[2] OK substituir: antigos com deleted_at, novos com a empresa do parâmetro, info e histórico';

  -- 3. oportunidade de outra empresa ---------------------------------------------------------------------------------
  v_r := public.conector_substituir_orcamento(v_a, v_op_b, v_registros, '{}'::jsonb, true, 'Smoke', 'SMOKE');
  if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'nao_encontrada') then
    raise exception 'FALHOU: oportunidade da B com a empresa A (veio %)', v_r;
  end if;
  v_r := public.conector_aplicar_desconto(v_a, v_op_b, 10, '[]'::jsonb, 'Smoke');
  if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'nao_encontrada') then
    raise exception 'FALHOU: desconto na oportunidade da B com a empresa A (veio %)', v_r;
  end if;
  if (select count(*) from public.orcamento_item where oportunidade_id = v_op_b and deleted_at is null) <> 1 then
    raise exception 'FALHOU: a chamada com a empresa A mexeu na B';
  end if;
  raise notice '[3] OK oportunidade de outra empresa: nao_encontrada';

  -- 4. 3001 registros ------------------------------------------------------------------------------------------------
  select jsonb_agg(jsonb_build_object('numero', g::text, 'item', g::text, 'etapa', false, 'descricao', 'x',
                                      'quantidade', 1, 'valor_unitario_ref', 1, 'valor_unitario', 1,
                                      'valor_total', 1, 'ordem', g))
    into v_grandes from generate_series(1, 3001) g;
  perform public.smoke_t14_recusa(format(
    'select public.conector_substituir_orcamento(%L, %L, %L::jsonb, %L::jsonb, true, %L, %L)',
    v_a, v_op_a, v_grandes, '{}', 'Smoke', 'SMOKE'), '%de 1 a 3000 registros%', '22023');
  select count(*) into v_n from public.orcamento_item where oportunidade_id = v_op_a and deleted_at is null;
  if v_n <> 3 then raise exception 'FALHOU: os 3001 registros mexeram no orçamento (% itens vivos)', v_n; end if;
  raise notice '[4] OK 3001 registros recusados (22023) e nada mudou';

  -- 5. desconto ------------------------------------------------------------------------------------------------------
  select array_agg(id order by numero) into v_ids
    from public.orcamento_item
   where oportunidade_id = v_op_a and deleted_at is null and etapa is not true;
  -- contagem errada (1 de 2)
  v_r := public.conector_aplicar_desconto(v_a, v_op_a, 12.35, jsonb_build_array(
    jsonb_build_object('id', v_ids[1], 'valor_unitario', 3072.56, 'valor_total', 18435.36)), 'Smoke (via Claude)');
  if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'orcamento_mudou') then
    raise exception 'FALHOU: contagem errada deveria dar orcamento_mudou (veio %)', v_r;
  end if;
  -- mesma contagem, mas um id de fora (o item da B): desfaz e devolve orcamento_mudou
  v_r := public.conector_aplicar_desconto(v_a, v_op_a, 12.35, jsonb_build_array(
    jsonb_build_object('id', v_ids[1], 'valor_unitario', 3072.56, 'valor_total', 18435.36),
    jsonb_build_object('id', (select id from public.orcamento_item where oportunidade_id = v_op_b limit 1),
                       'valor_unitario', 1, 'valor_total', 1)), 'Smoke (via Claude)');
  if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'orcamento_mudou') then
    raise exception 'FALHOU: id trocado deveria dar orcamento_mudou (veio %)', v_r;
  end if;
  if (select valor_unitario from public.orcamento_item where id = v_ids[1]) <> 3505.49
     or (select desconto_proposta_pct from public.oportunidade where id = v_op_a) <> 0 then
    raise exception 'FALHOU: o orcamento_mudou deixou alguma gravação';
  end if;
  -- a lista certa
  v_alteracoes := jsonb_build_array(
    jsonb_build_object('id', v_ids[1], 'valor_unitario', 3072.56, 'valor_total', 18435.36),
    jsonb_build_object('id', v_ids[2], 'valor_unitario', 9.18, 'valor_total', 1152.09));
  v_r := public.conector_aplicar_desconto(v_a, v_op_a, 12.35, v_alteracoes, 'Smoke (via Claude)');
  if v_r is distinct from jsonb_build_object('ok', true, 'itens', 2) then
    raise exception 'FALHOU: aplicar desconto (veio %)', v_r;
  end if;
  if (select valor_total from public.orcamento_item where id = v_ids[1]) <> 18435.36
     or (select valor_unitario from public.orcamento_item where id = v_ids[2]) <> 9.18
     or (select desconto_proposta_pct from public.oportunidade where id = v_op_a) <> 12.35 then
    raise exception 'FALHOU: preços ou desconto_proposta_pct não gravados';
  end if;
  select count(*) into v_n from public.oportunidade_atualizacao
   where oportunidade_id = v_op_a and tipo = 'Sistema'
     and descricao = 'Desconto de 12,35% aplicado pelo Claude em 2 itens';
  if v_n <> 1 then raise exception 'FALHOU: atualização "Sistema" do desconto (vieram %)', v_n; end if;
  raise notice '[5] OK desconto: contagem e id conferidos; gravação e histórico';

  -- 6. desconto fora da faixa ----------------------------------------------------------------------------------------
  perform public.smoke_t14_recusa(format(
    'select public.conector_aplicar_desconto(%L, %L, 100, %L::jsonb, %L)', v_a, v_op_a, v_alteracoes, 'Smoke'),
    '%desconto fora de 0 a 99,99%%', '22023');
  perform public.smoke_t14_recusa(format(
    'select public.conector_aplicar_desconto(%L, %L, 12.345, %L::jsonb, %L)', v_a, v_op_a, v_alteracoes, 'Smoke'),
    '%desconto fora de 0 a 99,99%%', '22023');
  raise notice '[6] OK desconto 100 e com 3 casas recusados (22023)';

  -- 7. a API não executa ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', gen_random_uuid(), 'app_metadata', jsonb_build_object('empresa_id', v_a)
  )::text, true);
  set local role authenticated;
  perform public.smoke_t14_recusa(format(
    'select public.conector_substituir_orcamento(%L, %L, %L::jsonb, %L::jsonb, true, %L, %L)',
    v_a, v_op_a, v_registros, '{}', 'x', 'x'), 'permission denied for function conector_substituir_orcamento%');
  perform public.smoke_t14_recusa(format(
    'select public.conector_aplicar_desconto(%L, %L, 10, %L::jsonb, %L)', v_a, v_op_a, '[]', 'x'),
    'permission denied for function conector_aplicar_desconto%');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[7] OK authenticated não executa as funções do orçamento do conector';

  raise notice '============ SMOKE TEST OK (orçamento do conector, 0153) ============';
end;
$smoke$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: orçamento do conector (0153)' as res;

rollback;
