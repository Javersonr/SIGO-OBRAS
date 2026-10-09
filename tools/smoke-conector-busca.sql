-- ============================================================================
-- smoke-conector-busca.sql — valida a 0151 (busca de oportunidades do conector do Claude, Plano 2 T8).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria oportunidades SINTÉTICAS ("SMOKE T8 ...") nas
-- duas empresas mais antigas e confere a RPC. Nada é persistido. Nenhum UUID fixo: as empresas são escolhidas em
-- tempo de execução. Rode o arquivo inteiro, de uma vez.
--
-- O que confere:
--   0. catálogo: anon e authenticated sem EXECUTE; service_role com EXECUTE;
--   1. acento e caixa: "JOANÓPOLIS" acha "Joanópolis" e "Joanopolis" (no nome e na coluna cidade); a excluída e a
--      de outra empresa não aparecem;
--   2. nº/ano: "012"/"2026" acha "012/2026", "12.2026" e licitacao_numero "012/2026"; não acha "112/2026" nem
--      "12/20260"; texto + nº = as duas condições;
--   3. ordem (mais nova primeiro) e limite (0 → 1; 999 → até 50);
--   4. a empresa B só vê a dela;
--   5. sem filtro (só palavras curtas) → nenhuma linha;
--   6. p_numero com letra, ano com 2 dígitos e nº sem ano → 22023;
--   7. authenticated não executa (42501, permission denied).
--
-- Como rodar (precisa da 0149 e da 0151 aplicadas):
--   supabase db query --linked -f tools/smoke-conector-busca.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado (e, se dado, a mensagem) esperado. Some no ROLLBACK.
create or replace function public.smoke_t8_recusa(p_sql text, p_estado text, p_msg text default null)
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
  v_fn constant text := 'public.conector_buscar_oportunidades(uuid, text, text, text, integer)';
  v_emp1 uuid;
  v_emp2 uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_d uuid;
  v_e uuid;
  v_del uuid;
  v_x uuid;
  v_ids uuid[];
  v_n integer;
begin
  -- 0. catálogo ------------------------------------------------------------------------------------------------------
  if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'FALHOU: anon/authenticated podem executar conector_buscar_oportunidades';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'FALHOU: service_role sem EXECUTE em conector_buscar_oportunidades';
  end if;
  raise notice '[0] OK catálogo: só service_role executa';

  -- massa ------------------------------------------------------------------------------------------------------------
  select id into v_emp1 from public.empresa order by created_at limit 1;
  select id into v_emp2 from public.empresa where id <> v_emp1 order by created_at limit 1;
  if v_emp2 is null then
    raise exception 'O smoke precisa de duas empresas cadastradas';
  end if;
  raise notice '== empresas de teste: % e %', v_emp1, v_emp2;

  insert into public.oportunidade (empresa_id, nome, created_at)
    values (v_emp1, 'SMOKE T8 PE 012/2026 - Iluminação Pública - Pref. Mun. de Joanópolis/SP', now() - interval '5 days')
    returning id into v_a;
  insert into public.oportunidade (empresa_id, nome, created_at)
    values (v_emp1, 'SMOKE T8 Concorrência 12.2026 Joanopolis', now() - interval '4 days')
    returning id into v_b;
  insert into public.oportunidade (empresa_id, nome, created_at)
    values (v_emp1, 'SMOKE T8 Pregão 112/2026 Joanópolis', now() - interval '3 days')
    returning id into v_c;
  insert into public.oportunidade (empresa_id, nome, created_at)
    values (v_emp1, 'SMOKE T8 Pregão 12/20260 Joanópolis', now() - interval '2 days')
    returning id into v_d;
  insert into public.oportunidade (empresa_id, nome, licitacao_numero, cidade, created_at)
    values (v_emp1, 'SMOKE T8 Tomada de preços', '012/2026', 'Joanópolis', now() - interval '1 day')
    returning id into v_e;
  insert into public.oportunidade (empresa_id, nome, deleted_at)
    values (v_emp1, 'SMOKE T8 PE 12/2026 Joanópolis excluída', now())
    returning id into v_del;
  insert into public.oportunidade (empresa_id, nome)
    values (v_emp2, 'SMOKE T8 PE 12/2026 Joanópolis da empresa B')
    returning id into v_x;

  -- 1. acento e caixa ----------------------------------------------------------------------------------------------
  select array_agg(b.id) into v_ids
    from public.conector_buscar_oportunidades(v_emp1, 'SMOKE t8 JOANÓPOLIS', null, null, 50) b;
  if not (v_ids @> array[v_a, v_b, v_c, v_d, v_e]) or v_del = any(v_ids) or v_x = any(v_ids) then
    raise exception 'FALHOU: busca sem acento (vieram %)', v_ids;
  end if;
  raise notice '[1] OK acento e caixa; excluída e outra empresa fora';

  -- 2. nº/ano ------------------------------------------------------------------------------------------------------
  select array_agg(b.id order by b.id) into v_ids
    from public.conector_buscar_oportunidades(v_emp1, 'smoke', '012', '2026', 50) b;
  if v_ids is distinct from (select array_agg(u order by u) from unnest(array[v_a, v_b, v_e]) u) then
    raise exception 'FALHOU: nº/ano 012/2026 (vieram %; esperava %, % e %)', v_ids, v_a, v_b, v_e;
  end if;
  select count(*) into v_n from public.conector_buscar_oportunidades(v_emp1, 'smoke concorrencia', '12', '2026', 50);
  if v_n <> 1 then
    raise exception 'FALHOU: texto + nº deveria achar só a concorrência (vieram %)', v_n;
  end if;
  raise notice '[2] OK nº/ano com "/", "." e licitacao_numero; 112/2026 e 12/20260 fora';

  -- 3. ordem e limite ------------------------------------------------------------------------------------------------
  select array_agg(b.id) into v_ids
    from public.conector_buscar_oportunidades(v_emp1, 'smoke joanopolis', '12', '2026', 50) b;
  if v_ids[1] is distinct from v_e or v_ids[array_length(v_ids, 1)] is distinct from v_a then
    raise exception 'FALHOU: ordem por created_at desc (vieram %)', v_ids;
  end if;
  select count(*) into v_n from public.conector_buscar_oportunidades(v_emp1, 'smoke joanopolis', null, null, 0);
  if v_n <> 1 then
    raise exception 'FALHOU: p_limite 0 deveria virar 1 (vieram %)', v_n;
  end if;
  select count(*) into v_n from public.conector_buscar_oportunidades(v_emp1, 'smoke', null, null, 999);
  if v_n > 50 then
    raise exception 'FALHOU: p_limite acima de 50 (vieram %)', v_n;
  end if;
  raise notice '[3] OK ordem (mais nova primeiro) e limite entre 1 e 50';

  -- 4. empresa B -----------------------------------------------------------------------------------------------------
  select array_agg(b.id) into v_ids
    from public.conector_buscar_oportunidades(v_emp2, 'smoke joanopolis', '12', '2026', 50) b;
  if v_ids is distinct from array[v_x] then
    raise exception 'FALHOU: a empresa B deveria ver só a dela (vieram %)', v_ids;
  end if;
  raise notice '[4] OK cada empresa vê só as suas';

  -- 5. sem filtro -----------------------------------------------------------------------------------------------------
  select count(*) into v_n from public.conector_buscar_oportunidades(v_emp1, 'de a t8', null, null, 50);
  if v_n <> 0 then
    raise exception 'FALHOU: sem palavra de 3 letras e sem nº não deveria devolver nada (vieram %)', v_n;
  end if;
  raise notice '[5] OK sem filtro, nada';

  -- 6. entradas inválidas -----------------------------------------------------------------------------------------------
  perform public.smoke_t8_recusa(format(
    'select * from public.conector_buscar_oportunidades(%L, null, %L, %L)', v_emp1, '12a', '2026'), '22023');
  perform public.smoke_t8_recusa(format(
    'select * from public.conector_buscar_oportunidades(%L, null, %L, %L)', v_emp1, '12', '26'), '22023');
  perform public.smoke_t8_recusa(format(
    'select * from public.conector_buscar_oportunidades(%L, null, %L, null)', v_emp1, '12'), '22023');
  raise notice '[6] OK nº com letra, ano curto e nº sem ano recusados (22023)';

  -- 7. a API não executa ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', gen_random_uuid(), 'app_metadata', jsonb_build_object('empresa_id', v_emp1)
  )::text, true);
  set local role authenticated;
  perform public.smoke_t8_recusa(format(
    'select * from public.conector_buscar_oportunidades(%L, %L)', v_emp1, 'smoke'), '42501', 'permission denied%');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[7] OK authenticated não executa a busca';

  raise notice '============ SMOKE TEST OK (busca de oportunidades do conector, 0151) ============';
end;
$smoke$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: busca de oportunidades do conector (0151)' as res;

rollback;
