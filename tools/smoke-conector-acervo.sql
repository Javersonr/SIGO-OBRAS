-- ============================================================================
-- smoke-conector-acervo.sql — valida a 0152 (cadastro de CAT/atestado pelo
-- conector do Claude, Plano 2 T10).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cadastra CATs e
-- profissionais SINTÉTICOS ("SMOKE T10 ...") nas duas empresas mais antigas e
-- confere a RPC. Nada é persistido. Nenhum UUID fixo: as empresas são
-- escolhidas em tempo de execução. Rode o arquivo inteiro, de uma vez.
--
-- O que confere:
--   0. catálogo: anon e authenticated sem EXECUTE; service_role com EXECUTE;
--   1. cadastro: atestado e quantitativos com o empresa_id do PARÂMETRO (o do
--      jsonb é ignorado), ordem = maior + 1, uma síntese por categoria, e o
--      profissional reaproveitado pelo registro (só dígitos);
--   2. o mesmo nº escrito de outro jeito → "duplicado", sem gravar nada;
--   3. profissional novo criado (responsavel_tecnico false, ativo true); o
--      mesmo nome sem acento é reaproveitado; homônimo com outro registro não;
--   4. atestado sem CAT com o mesmo nº e CAT "s/n" não deduplicam;
--   5. a outra empresa cadastra o mesmo nº (cada uma tem o seu acervo);
--   6. entradas inválidas → 22023 (duas sínteses, nenhuma, lista vazia, tipo,
--      objeto, quantitativo sem descrição);
--   7. authenticated não executa (42501, permission denied).
--
-- Como rodar (precisa da 0149 e da 0152 aplicadas):
--   supabase db query --linked -f tools/smoke-conector-acervo.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado (e, se dado, a mensagem) esperado. Some no ROLLBACK.
create or replace function public.smoke_t10_recusa(p_sql text, p_estado text, p_msg text default null)
returns void
language plpgsql
as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado or (p_msg is not null and sqlerrm not like p_msg) then
      raise exception 'FALHOU: esperava % (%) e veio % (%) em: %', p_estado, p_msg, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

do $smoke$
declare
  v_fn constant text := 'public.conector_cadastrar_atestado(uuid, jsonb, jsonb, jsonb)';
  v_quant constant jsonb := '[
    {"categoria": "poste", "descricao": "SMOKE T10 Postes DT 11 m", "quantidade": 30, "unidade": "un",
     "especificacao": "11 m 300 daN", "na_atividade_tecnica": true, "observacao": "detalhe", "ordem": 1},
    {"categoria": "poste", "descricao": "SMOKE T10 Total de postes", "quantidade": 50, "unidade": "un",
     "especificacao": null, "na_atividade_tecnica": false, "observacao": "síntese", "ordem": 2},
    {"categoria": "rede_aerea", "descricao": "SMOKE T10 Rede aérea", "quantidade": 1.2, "unidade": "km",
     "especificacao": null, "na_atividade_tecnica": false, "observacao": "síntese", "ordem": 3}
  ]';
  v_emp1 uuid;
  v_emp2 uuid;
  v_prof uuid;
  v_ordem integer;
  v_n integer;
  v_atestado uuid;
  r jsonb;
  r2 jsonb;
begin
  -- 0. catálogo ------------------------------------------------------------------------------------------------------
  if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'FALHOU: anon/authenticated podem executar conector_cadastrar_atestado';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'FALHOU: service_role sem EXECUTE em conector_cadastrar_atestado';
  end if;
  raise notice '[0] OK catálogo: só service_role executa';

  -- massa ------------------------------------------------------------------------------------------------------------
  select id into v_emp1 from public.empresa order by created_at limit 1;
  select id into v_emp2 from public.empresa where id <> v_emp1 order by created_at limit 1;
  if v_emp2 is null then
    raise exception 'O smoke precisa de duas empresas cadastradas';
  end if;
  raise notice '== empresas de teste: % e %', v_emp1, v_emp2;

  insert into public.acervo_profissional (empresa_id, nome, registro, responsavel_tecnico, ativo)
    values (v_emp1, 'SMOKE T10 Eng. Fulano Sintético', 'MG-0999001/D', true, true)
    returning id into v_prof;
  select coalesce(max(ordem), 0) into v_ordem
    from public.acervo_atestado where empresa_id = v_emp1 and deleted_at is null;

  -- 1. cadastro -------------------------------------------------------------------------------------------------------
  r := public.conector_cadastrar_atestado(
    v_emp1,
    jsonb_build_object(
      'tipo', 'cat', 'numero', 'CAT nº 9.990.001/2026', 'objeto', 'SMOKE T10 Iluminação pública',
      'empresa_id', v_emp2, 'uf', 'MG', 'atividades', jsonb_build_array('execucao'), 'situacao', 'concluida',
      'data_inicio', '2026-01-05', 'data_fim', '2026-06-30', 'com_execucao', true,
      'cobre_arts', jsonb_build_array('ART SMOKE 1')
    ),
    v_quant,
    jsonb_build_object('nome', 'SMOKE T10 Outro Nome', 'registro', '0999001')
  );
  v_atestado := (r ->> 'atestado_id')::uuid;
  if r ->> 'ok' <> 'true' or (r ->> 'profissional_id')::uuid is distinct from v_prof
     or r ->> 'profissional_criado' <> 'false' or (r ->> 'quantitativos')::int <> 3 then
    raise exception 'FALHOU: [1] cadastro devolveu %', r;
  end if;
  select count(*) into v_n
    from public.acervo_atestado a
   where a.id = v_atestado and a.empresa_id = v_emp1 and a.profissional_id = v_prof
     and a.ordem = v_ordem + 1 and a.data_inicio = date '2026-01-05' and a.com_execucao
     and a.atividades = '["execucao"]'::jsonb and a.cobre_arts = '["ART SMOKE 1"]'::jsonb
     and a.numero = 'CAT nº 9.990.001/2026' and a.valor is null;
  if v_n <> 1 then
    raise exception 'FALHOU: [1] atestado não gravado como esperado (empresa, ordem, colunas)';
  end if;
  select count(*) into v_n
    from public.acervo_quantitativo q where q.atestado_id = v_atestado and q.empresa_id = v_emp1;
  if v_n <> 3 then
    raise exception 'FALHOU: [1] quantitativos com a empresa do parâmetro: % de 3', v_n;
  end if;
  select count(*) into v_n
    from public.acervo_quantitativo q
   where q.atestado_id = v_atestado and q.observacao = 'síntese'
     and q.categoria in ('poste', 'rede_aerea');
  if v_n <> 2 then
    raise exception 'FALHOU: [1] uma síntese por categoria: % de 2', v_n;
  end if;
  raise notice '[1] OK cadastro na empresa do parâmetro, ordem + 1, profissional reaproveitado pelo registro';

  -- 2. duplicado -----------------------------------------------------------------------------------------------------
  select count(*) into v_n from public.acervo_atestado where empresa_id = v_emp1;
  r2 := public.conector_cadastrar_atestado(
    v_emp1,
    jsonb_build_object('tipo', 'cat_profissional', 'numero', '9990001/2026', 'objeto', 'SMOKE T10 outra leitura'),
    v_quant,
    null
  );
  if r2 is distinct from jsonb_build_object('ok', false, 'motivo', 'duplicado', 'atestado_id', v_atestado) then
    raise exception 'FALHOU: [2] deveria ser duplicado de %: %', v_atestado, r2;
  end if;
  if (select count(*) from public.acervo_atestado where empresa_id = v_emp1) <> v_n then
    raise exception 'FALHOU: [2] o duplicado gravou um atestado';
  end if;
  raise notice '[2] OK o mesmo nº escrito de outro jeito volta duplicado, sem gravar';

  -- 3. profissional novo, nome sem acento, homônimo com outro registro -------------------------------------------
  r := public.conector_cadastrar_atestado(
    v_emp1,
    jsonb_build_object('tipo', 'cat', 'numero', '9990002/2026', 'objeto', 'SMOKE T10 Obra 2'),
    v_quant,
    jsonb_build_object('nome', 'SMOKE T10 Profissional Ávila', 'titulos', 'Engenheiro Eletricista')
  );
  if r ->> 'profissional_criado' <> 'true' or not exists (
    select 1 from public.acervo_profissional p
     where p.id = (r ->> 'profissional_id')::uuid and p.empresa_id = v_emp1 and not p.responsavel_tecnico
       and p.ativo and p.titulos = 'Engenheiro Eletricista' and p.registro is null
  ) then
    raise exception 'FALHOU: [3] profissional novo: %', r;
  end if;
  r2 := public.conector_cadastrar_atestado(
    v_emp1,
    jsonb_build_object('tipo', 'cat', 'numero', '9990003/2026', 'objeto', 'SMOKE T10 Obra 3'),
    v_quant,
    jsonb_build_object('nome', '  smoke t10 profissional   avila ')
  );
  if r2 ->> 'profissional_criado' <> 'false' or r2 ->> 'profissional_id' <> r ->> 'profissional_id' then
    raise exception 'FALHOU: [3] o mesmo nome sem acento deveria ser reaproveitado: %', r2;
  end if;
  r2 := public.conector_cadastrar_atestado(
    v_emp1,
    jsonb_build_object('tipo', 'cat', 'numero', '9990004/2026', 'objeto', 'SMOKE T10 Obra 4'),
    v_quant,
    jsonb_build_object('nome', 'SMOKE T10 Eng. Fulano Sintético', 'registro', '5550555')
  );
  if r2 ->> 'profissional_criado' <> 'true' or (r2 ->> 'profissional_id')::uuid = v_prof then
    raise exception 'FALHOU: [3] homônimo com outro registro não pode ser reaproveitado: %', r2;
  end if;
  raise notice '[3] OK profissional criado, reaproveitado pelo nome sem acento, homônimo com outro registro à parte';

  -- 4. o que não deduplica -------------------------------------------------------------------------------------------
  r := public.conector_cadastrar_atestado(
    v_emp1,
    jsonb_build_object('tipo', 'atestado', 'numero', '9990001/2026', 'objeto', 'SMOKE T10 atestado sem CAT'),
    v_quant,
    null
  );
  if r ->> 'ok' <> 'true' then
    raise exception 'FALHOU: [4] atestado sem CAT não deduplica pelo nº: %', r;
  end if;
  r := public.conector_cadastrar_atestado(
    v_emp1, jsonb_build_object('tipo', 'cat', 'numero', 's/n', 'objeto', 'SMOKE T10 CAT s/n A'), v_quant, null
  );
  r2 := public.conector_cadastrar_atestado(
    v_emp1, jsonb_build_object('tipo', 'cat', 'numero', 'S/N', 'objeto', 'SMOKE T10 CAT s/n B'), v_quant, null
  );
  if r ->> 'ok' <> 'true' or r2 ->> 'ok' <> 'true' then
    raise exception 'FALHOU: [4] CAT sem nº não deduplica: % / %', r, r2;
  end if;
  raise notice '[4] OK atestado sem CAT e CAT "s/n" não deduplicam';

  -- 5. outra empresa --------------------------------------------------------------------------------------------------
  r := public.conector_cadastrar_atestado(
    v_emp2,
    jsonb_build_object('tipo', 'cat', 'numero', 'CAT nº 9.990.001/2026', 'objeto', 'SMOKE T10 empresa B'),
    v_quant,
    jsonb_build_object('nome', 'SMOKE T10 Eng. Fulano Sintético', 'registro', 'MG-0999001/D')
  );
  if r ->> 'ok' <> 'true' or r ->> 'profissional_criado' <> 'true' or not exists (
    select 1 from public.acervo_atestado a
     where a.id = (r ->> 'atestado_id')::uuid and a.empresa_id = v_emp2
  ) or exists (
    select 1 from public.acervo_quantitativo q
     where q.atestado_id = (r ->> 'atestado_id')::uuid and q.empresa_id <> v_emp2
  ) then
    raise exception 'FALHOU: [5] a empresa B cadastra o mesmo nº com o próprio profissional: %', r;
  end if;
  raise notice '[5] OK cada empresa tem o seu acervo (nº e profissional da A não valem na B)';

  -- 6. entradas inválidas ---------------------------------------------------------------------------------------------
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "cat", "objeto": "SMOKE T10 x"}',
    '[{"categoria": "poste", "descricao": "a", "observacao": "síntese"},
      {"categoria": "poste", "descricao": "b", "observacao": "síntese"}]'), '22023');
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "cat", "objeto": "SMOKE T10 x"}',
    '[{"categoria": "poste", "descricao": "a", "observacao": "detalhe"}]'), '22023');
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "cat", "objeto": "SMOKE T10 x"}', '[]'), '22023');
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "obra", "objeto": "SMOKE T10 x"}', v_quant), '22023');
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "cat", "objeto": "  "}', v_quant), '22023');
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "cat", "objeto": "SMOKE T10 x"}',
    '[{"categoria": "poste", "descricao": " ", "observacao": "síntese"}]'), '22023');
  raise notice '[6] OK duas sínteses, nenhuma, lista vazia, tipo, objeto e descrição vazia recusados (22023)';

  -- 7. a API não executa ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', gen_random_uuid(), 'app_metadata', jsonb_build_object('empresa_id', v_emp1)
  )::text, true);
  set local role authenticated;
  perform public.smoke_t10_recusa(format(
    'select public.conector_cadastrar_atestado(%L, %L::jsonb, %L::jsonb, null)', v_emp1,
    '{"tipo": "cat", "objeto": "SMOKE T10 x"}', v_quant), '42501', 'permission denied%');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[7] OK authenticated não executa o cadastro';

  raise notice '============ SMOKE TEST OK (cadastro de atestado do conector, 0152) ============';
end;
$smoke$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: cadastro de atestado do conector (0152)' as res;

rollback;
