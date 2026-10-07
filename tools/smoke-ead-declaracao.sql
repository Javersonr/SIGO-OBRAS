-- ============================================================================
-- smoke-ead-declaracao.sql — valida a 0144 (T35): versões do texto da declaração
-- de ambiente e horário que o aluno confirma ao abrir o curso.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: grava versões
-- descartáveis simulando com `set local role` + `request.jwt.claims` o usuário da
-- empresa (authenticated) e o anônimo. Nada é persistido.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo): nenhum UUID fixo neste arquivo. Para testar outra empresa, troque
-- o filtro do passo 1 por `and f.empresa_id = '<empresa_teste>'`.
--
-- O que confere:
--   1. a versão é decidida pelo banco: 1, 2, 3... por empresa (a que o cliente
--      manda é ignorada), e `salvo_por`/`salvo_por_email`/`created_at` também;
--   2. texto e ART são aparados; ART vazia vira nula;
--   3. texto curto demais (< 20), longo demais (> 4000) e ART acima de 120
--      caracteres são recusados (23514);
--   4. o usuário da empresa NÃO consegue UPDATE, DELETE nem TRUNCATE (42501), e
--      o dono do banco também é barrado pela trava da trilha (42501);
--   5. o anônimo não lê nem grava (42501);
--   6. o usuário de OUTRA empresa não enxerga as versões (RLS) e não grava
--      numa empresa que não é a dele (42501). Este passo só roda se houver mais
--      de uma empresa; senão é pulado, com aviso.
--
-- Como rodar (precisa das migrações 0135 e 0144 já aplicadas):
--   supabase db query --linked -f tools/smoke-ead-declaracao.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-declaracao.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

do $$
declare
  v_empresa uuid;
  v_outra uuid;
  v_sub uuid := gen_random_uuid();
  v_sub2 uuid := gen_random_uuid();
  v_linha public.treinamento_declaracao_texto;
  v_id1 uuid;
  v_sql text;
  v_falhou boolean;
  v_total integer;
  v_longo text := repeat('x', 4001);
  v_art_longa text := repeat('A', 121);
begin
  -- 1. empresa de teste (a do funcionário ativo mais antigo) e uma outra, se existir
  select f.empresa_id into v_empresa
    from public.funcionario f
    where f.deleted_at is null
      and f.ativo is not false
    order by f.created_at
    limit 1;
  if v_empresa is null then
    raise exception 'Nenhum funcionário ativo para testar.';
  end if;
  select e.id into v_outra from public.empresa e where e.id <> v_empresa order by e.created_at limit 1;
  raise notice '== empresa de teste escolhida em tempo de execução; outra empresa para a RLS: %',
    case when v_outra is null then 'não há (passo 6 pulado)' else 'há' end;

  -- sem versão salva ainda (na 1ª aplicação): o texto padrão do código é que vale
  select count(*) into v_total from public.treinamento_declaracao_texto where empresa_id = v_empresa;
  raise notice '[versões já salvas na empresa de teste] %', v_total;

  -- T33 (0147): salvar o texto exige Treinamentos EAD → Editar, lida do vínculo do e-mail do token. Os dois usuários
  -- de teste são Admin sintéticos (e-mail @exemplo.test), que somem no ROLLBACK.
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, nome_completo)
    values (v_empresa, 'smoke.rt@exemplo.test', 'Admin', true, 'Smoke T35'),
           (v_empresa, 'smoke.rt2@exemplo.test', 'Admin', true, 'Smoke T35');

  -- ---------------------------------------------------------------- usuário
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated',
    'sub', v_sub,
    'email', 'Smoke.RT@Exemplo.Test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text, true);
  set local role authenticated;

  -- 2. a versão, quem salvou e quando são do banco; texto e ART são aparados
  insert into public.treinamento_declaracao_texto
    (empresa_id, versao, texto, art, salvo_por, salvo_por_email, created_at)
    values (v_empresa, 999, E'\t \n  SMOKE T35 orientação do RT, versão um.  \r\n', E'   ART SMOKE 1\t',
            gen_random_uuid(), 'forjado@exemplo.test', now() - interval '30 days')
    returning * into v_linha;
  if v_linha.versao <> v_total + 1 then
    raise exception 'FALHOU: a versão deveria ser % e veio % (o cliente mandou 999)', v_total + 1, v_linha.versao;
  end if;
  v_id1 := v_linha.id;
  if v_linha.texto <> 'SMOKE T35 orientação do RT, versão um.' or v_linha.art <> 'ART SMOKE 1' then
    raise exception 'FALHOU: texto e ART deveriam sair aparados (% / %)', v_linha.texto, v_linha.art;
  end if;
  if v_linha.salvo_por is distinct from v_sub
     or v_linha.salvo_por_email is distinct from 'smoke.rt@exemplo.test'
     or v_linha.created_at < now() - interval '1 minute' then
    raise exception 'FALHOU: salvo_por/e-mail/created_at deveriam vir do banco (% / % / %)',
      v_linha.salvo_por, v_linha.salvo_por_email, v_linha.created_at;
  end if;
  raise notice '[versão 1] OK número, autor e hora vêm do banco; texto e ART aparados (espaço, tab, CR e LF)';

  -- a segunda versão, de outro usuário, sem ART (vazia vira nula)
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated',
    'sub', v_sub2,
    'email', 'smoke.rt2@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text, true);
  insert into public.treinamento_declaracao_texto (empresa_id, texto, art)
    values (v_empresa, 'SMOKE T35 orientação do RT, versão dois.', '   ')
    returning * into v_linha;
  if v_linha.versao <> v_total + 2 or v_linha.art is not null or v_linha.salvo_por is distinct from v_sub2 then
    raise exception 'FALHOU: versão 2 (versão % / ART % / autor %)', v_linha.versao, v_linha.art, v_linha.salvo_por;
  end if;
  raise notice '[versão 2] OK sequência, ART vazia vira nula, autor é quem salvou';

  -- 3. limites: texto curto, texto longo, ART longa (23514)
  foreach v_sql in array array[
    format('insert into public.treinamento_declaracao_texto (empresa_id, texto) values (%L, %L)', v_empresa, 'curto'),
    format('insert into public.treinamento_declaracao_texto (empresa_id, texto) values (%L, %L)', v_empresa, '                         '),
    format('insert into public.treinamento_declaracao_texto (empresa_id, texto) values (%L, %L)', v_empresa, v_longo),
    format('insert into public.treinamento_declaracao_texto (empresa_id, texto, art) values (%L, %L, %L)',
           v_empresa, 'SMOKE T35 texto válido com mais de vinte caracteres', v_art_longa)
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '23514' then
        raise exception 'FALHOU: esperava 23514 e veio % (%) em: %', sqlstate, sqlerrm, left(v_sql, 120);
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o banco aceitou: %', left(v_sql, 120);
    end if;
  end loop;
  raise notice '[limites] OK 4 recusas (texto curto, só espaços, longo, ART longa)';

  -- 4. só inclusão: UPDATE, DELETE e TRUNCATE são recusados para o usuário da empresa (42501)
  foreach v_sql in array array[
    format('update public.treinamento_declaracao_texto set texto = %L where id = %L', 'SMOKE T35 texto trocado depois, mais de vinte', v_id1),
    format('delete from public.treinamento_declaracao_texto where id = %L', v_id1),
    'truncate public.treinamento_declaracao_texto'
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, left(v_sql, 120);
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o usuário da empresa conseguiu: %', left(v_sql, 120);
    end if;
  end loop;
  raise notice '[só inclusão] OK UPDATE, DELETE e TRUNCATE recusados para o usuário da empresa';

  -- ... e o dono do banco também, pela trava da trilha (42501), sem o expurgo deliberado
  reset role;
  foreach v_sql in array array[
    format('update public.treinamento_declaracao_texto set texto = %L where id = %L', 'SMOKE T35 texto trocado depois, mais de vinte', v_id1),
    format('delete from public.treinamento_declaracao_texto where id = %L', v_id1)
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, left(v_sql, 120);
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o dono do banco conseguiu, sem o expurgo deliberado: %', left(v_sql, 120);
    end if;
  end loop;
  raise notice '[trava da trilha] OK o dono do banco também é barrado';

  -- 5. anônimo: nem lê nem grava (42501)
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  set local role anon;
  foreach v_sql in array array[
    'select count(*) from public.treinamento_declaracao_texto',
    format('insert into public.treinamento_declaracao_texto (empresa_id, texto) values (%L, %L)',
           v_empresa, 'SMOKE T35 texto do anônimo, com mais de vinte')
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, left(v_sql, 120);
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o anônimo conseguiu: %', left(v_sql, 120);
    end if;
  end loop;
  raise notice '[anon] OK sem acesso à tabela';
  reset role;

  -- 6. outra empresa: não enxerga as versões e não grava numa empresa que não é a dela
  if v_outra is not null then
    perform set_config('request.jwt.claims', jsonb_build_object(
      'role', 'authenticated',
      'sub', gen_random_uuid(),
      'app_metadata', jsonb_build_object('empresa_id', v_outra)
    )::text, true);
    set local role authenticated;
    select count(*) into v_total
      from public.treinamento_declaracao_texto
      where empresa_id = v_empresa;
    if v_total <> 0 then
      raise exception 'FALHOU: a outra empresa enxergou % versões da empresa de teste', v_total;
    end if;
    v_falhou := false;
    begin
      insert into public.treinamento_declaracao_texto (empresa_id, texto)
        values (v_empresa, 'SMOKE T35 texto de outra empresa, com mais de vinte');
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%)', sqlstate, sqlerrm;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: a outra empresa gravou uma versão na empresa de teste';
    end if;
    raise notice '[outra empresa] OK sem leitura e sem escrita';
    reset role;
  else
    raise notice '[outra empresa] pulado: só existe uma empresa';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice '============ SMOKE TEST OK (texto da declaração de ambiente e horário, 0144) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: texto da declaração de ambiente e horário (0144)' as res;

rollback;
