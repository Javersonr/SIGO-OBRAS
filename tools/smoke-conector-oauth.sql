-- ============================================================================
-- smoke-conector-oauth.sql — valida a 0148 (OAuth atômico do conector do Claude)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria um cliente
-- DCR, autorizações, códigos e chaves sintéticos (hashes "smoke-…") para a
-- empresa e o usuário mais antigos da base, e confere:
--   1. conector_aprovar cria a autorização (oauth) e o código juntos;
--   2. conector_trocar_codigo consome o código e emite 2 chaves da mesma
--      família; trocar de novo volta "reutilizado" com a autorização; um código
--      desconhecido volta "invalido";
--   3. conector_renovar emite o par novo na mesma família; a 2ª renovação com a
--      mesma chave volta "corrida";
--   4. conector_criar_manual cria a autorização (manual) e a chave manual;
--   5. conector_limpeza revoga a autorização OAuth sem chave (criada há 2 dias),
--      apaga o cliente nunca usado (criado há 2 dias) e não toca na autorização
--      com chaves vivas;
--   6. authenticated não executa nenhuma das 5 funções ("permission denied for
--      function").
-- Nenhum UUID fixo: a empresa e o usuário são escolhidos em tempo de execução.
-- A limpeza roda sobre a tabela toda, mas dentro do ROLLBACK: nada é persistido.
--
-- Como rodar (com a 0148 já aplicada; quem roda é o Javerson):
--   supabase db query --linked -f tools/smoke-conector-oauth.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- exige que o comando seja RECUSADO com o estado e a mensagem esperados; some no ROLLBACK
create or replace function public.smoke_conector_recusa(p_sql text, p_msg text, p_estado text default '42501')
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

do $$
declare
  v_empresa uuid;
  v_uc uuid;
  v_email text;
  v_cli uuid;
  v_cli_velho uuid;
  v_aut uuid;
  v_aut_orfa uuid;
  v_manual uuid;
  v_familia uuid := gen_random_uuid();
  v_familia2 uuid;
  v_n int;
  r jsonb;
begin
  select e.id into v_empresa from public.empresa e where e.deleted_at is null order by e.created_at limit 1;
  select u.id, lower(u.email) into v_uc, v_email
    from public.usuario_custom u where u.deleted_at is null order by u.created_at limit 1;
  if v_empresa is null or v_uc is null then
    raise exception 'Sem empresa ou usuário para testar.';
  end if;

  insert into public.conector_cliente (client_id, nome, redirect_uris, tipo)
  values ('sigo_c_smoke_' || gen_random_uuid(), 'Smoke', array['http://localhost/callback'], 'loopback')
  returning id into v_cli;

  -- 1. aprovar
  v_aut := public.conector_aprovar(v_empresa, v_uc, v_email, v_cli, 'https://smoke.test/functions/v1/mcp',
    'conector', 'smoke-cod-1', 'http://localhost:9/callback', repeat('c', 43), now() + interval '5 minutes');
  select count(*) into v_n from public.conector_autorizacao where id = v_aut and tipo = 'oauth' and revogado_em is null;
  if v_n <> 1 then raise exception 'FALHOU: aprovar não criou a autorização'; end if;
  select count(*) into v_n from public.conector_codigo where codigo_hash = 'smoke-cod-1' and autorizacao_id = v_aut;
  if v_n <> 1 then raise exception 'FALHOU: aprovar não criou o código'; end if;
  raise notice '[1] aprovar ok';

  -- 2. trocar o código
  -- As conferências abaixo usam "is distinct from" porque "<>" com NULL dá NULL e o IF não dispara:
  -- um sucesso por engano ({"ok": true}, sem "motivo") passaria calado.
  r := public.conector_trocar_codigo('smoke-cod-1', 'smoke-at-1', now() + interval '1 hour',
    'smoke-rt-1', now() + interval '30 days', v_familia);
  if (r ->> 'ok')::boolean is distinct from true or (r ->> 'autorizacao_id')::uuid is distinct from v_aut then
    raise exception 'FALHOU: troca → %', r;
  end if;
  select count(*) into v_n from public.conector_chave where autorizacao_id = v_aut and familia = v_familia;
  if v_n <> 2 then raise exception 'FALHOU: troca emitiu % chaves (esperado 2)', v_n; end if;
  select count(*) into v_n from public.conector_cliente where id = v_cli and ultimo_uso is not null;
  if v_n <> 1 then raise exception 'FALHOU: troca não gravou o ultimo_uso do cliente'; end if;
  r := public.conector_trocar_codigo('smoke-cod-1', 'smoke-at-x', now() + interval '1 hour',
    'smoke-rt-x', now() + interval '30 days', gen_random_uuid());
  if (r ->> 'motivo') is distinct from 'reutilizado'
     or (r ->> 'autorizacao_id')::uuid is distinct from v_aut then
    raise exception 'FALHOU: 2ª troca → % (esperado reutilizado)', r;
  end if;
  r := public.conector_trocar_codigo('smoke-nao-existe', 'smoke-at-y', now() + interval '1 hour',
    'smoke-rt-y', now() + interval '30 days', gen_random_uuid());
  if (r ->> 'motivo') is distinct from 'invalido' then raise exception 'FALHOU: código desconhecido → %', r; end if;
  raise notice '[2] trocar ok (reutilizado e invalido conferidos)';

  -- 3. renovar duas vezes com a mesma chave
  r := public.conector_renovar('smoke-rt-1', 'smoke-at-2', now() + interval '1 hour',
    'smoke-rt-2', now() + interval '30 days');
  v_familia2 := (r ->> 'familia')::uuid;
  if (r ->> 'ok')::boolean is distinct from true or v_familia2 is distinct from v_familia then
    raise exception 'FALHOU: renovação → %', r;
  end if;
  r := public.conector_renovar('smoke-rt-1', 'smoke-at-3', now() + interval '1 hour',
    'smoke-rt-3', now() + interval '30 days');
  if (r ->> 'motivo') is distinct from 'corrida' then raise exception 'FALHOU: 2ª renovação → % (esperado corrida)', r; end if;
  raise notice '[3] renovar ok (corrida conferida)';

  -- 4. chave manual
  v_manual := public.conector_criar_manual(v_empresa, v_uc, v_email, 'https://smoke.test/functions/v1/mcp',
    'conector', 'smoke-pk-1', gen_random_uuid(), now() + interval '90 days');
  select count(*) into v_n from public.conector_chave c join public.conector_autorizacao a on a.id = c.autorizacao_id
   where a.id = v_manual and a.tipo = 'manual' and c.tipo = 'manual' and c.chave_hash = 'smoke-pk-1';
  if v_n <> 1 then raise exception 'FALHOU: chave manual não criada'; end if;
  raise notice '[4] chave manual ok';

  -- 5. limpeza
  insert into public.conector_autorizacao (empresa_id, usuario_custom_id, usuario_email, cliente_id, tipo, resource, criado_em)
  values (v_empresa, v_uc, v_email, v_cli, 'oauth', 'https://smoke.test/functions/v1/mcp', now() - interval '2 days')
  returning id into v_aut_orfa;
  insert into public.conector_cliente (client_id, nome, redirect_uris, tipo, criado_em)
  values ('sigo_c_smoke_velho_' || gen_random_uuid(), 'Smoke velho', array['http://localhost/callback'], 'loopback',
          now() - interval '2 days')
  returning id into v_cli_velho;
  r := public.conector_limpeza();
  raise notice '[5] limpeza → %', r;
  select count(*) into v_n from public.conector_autorizacao
   where id = v_aut_orfa and revogado_em is not null and revogado_motivo = 'sem_chave';
  if v_n <> 1 then raise exception 'FALHOU: a autorização sem chave não foi revogada'; end if;
  select count(*) into v_n from public.conector_cliente where id = v_cli_velho;
  if v_n <> 0 then raise exception 'FALHOU: o cliente sem uso não foi apagado'; end if;
  select count(*) into v_n from public.conector_autorizacao where id = v_aut and revogado_em is null;
  if v_n <> 1 then raise exception 'FALHOU: a limpeza revogou uma autorização com chaves vivas'; end if;
  raise notice '[5] limpeza ok';

  -- 6. authenticated não executa nenhuma das funções
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', gen_random_uuid(), 'email', 'smoke.conector@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa))::text, true);
  set local role authenticated;
  perform public.smoke_conector_recusa('select public.conector_limpeza()', 'permission denied for function conector_limpeza%');
  perform public.smoke_conector_recusa(format(
    'select public.conector_aprovar(%L, %L, %L, %L, %L, %L, %L, %L, %L, now())',
    v_empresa, v_uc, v_email, v_cli, 'x', 'conector', 'smoke-cod-auth', 'http://localhost/callback', repeat('c', 43)),
    'permission denied for function conector_aprovar%');
  perform public.smoke_conector_recusa(format(
    'select public.conector_criar_manual(%L, %L, %L, %L, %L, %L, %L, now())',
    v_empresa, v_uc, v_email, 'x', 'conector', 'smoke-pk-auth', gen_random_uuid()),
    'permission denied for function conector_criar_manual%');
  perform public.smoke_conector_recusa(
    'select public.conector_trocar_codigo(''a'', ''b'', now(), ''c'', now(), gen_random_uuid())',
    'permission denied for function conector_trocar_codigo%');
  perform public.smoke_conector_recusa(
    'select public.conector_renovar(''a'', ''b'', now(), ''c'', now())',
    'permission denied for function conector_renovar%');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[6] authenticated recusado nas 5 funções';

  raise notice 'SMOKE TEST OK';
end;
$$;

rollback;
