-- ============================================================================
-- smoke-ead-pre-requisito.sql — valida a 0142 (T23): tipo do treinamento e
-- motivo do eventual na matrícula, e pré-requisito entre cursos.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria cursos
-- descartáveis e matrículas para um funcionário que já existe, simulando com
-- `set local role` + `request.jwt.claims` o usuário da empresa (authenticated).
-- Nada é persistido.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo): nenhum UUID fixo neste arquivo. Para testar outra empresa, troque
-- o filtro do passo 1 por `and f.empresa_id = '<empresa_teste>'`.
--
-- O que confere (A6, T23):
--   1. as duas colunas da matrícula e a do curso existem;
--   2. matrícula sem `tipo` nasce 'inicial' e sem motivo; 'periodico' passa;
--   3. 'eventual' com motivo passa, inclusive com tab/quebra de linha nas pontas e com
--      150 emojis (o banco conta caracteres, não bytes nem unidades UTF-16);
--   4. 'eventual' sem motivo, só com quebras de linha, curto ('ab'), com 201 caracteres,
--      'inicial' COM motivo e um tipo desconhecido: recusados (23514);
--   5. o RH não muda o tipo depois de criada a matrícula (42501);
--   6. pré-requisito: um curso exige outro; exigir a si mesmo e fechar círculo (direto
--      ou em volta de 3 cursos): recusados (23514); curso de OUTRA empresa: recusado.
--
-- Como rodar (precisa da migração 0142 já aplicada):
--   supabase db query --linked -f tools/smoke-ead-pre-requisito.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-pre-requisito.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
--
-- NÃO cobre o preenchimento do tipo das matrículas antigas (o bloco da 0142 que roda só na primeira
-- aplicação): para isso use a conferência no fim da própria migração (iniciais_com_concluida_anterior).
-- ============================================================================

begin;

do $$
declare
  v_empresa uuid;
  v_func uuid;
  v_outra_empresa_curso uuid;
  v_cursos uuid[] := '{}';
  v_id uuid;
  v_i integer;
  v_n integer;
  v_linha public.treinamento_matricula;
  v_sql text;
  v_falhou boolean;
  v_sub uuid := gen_random_uuid();
begin
  -- 1. empresa e funcionário de teste (ativos, só leitura aqui) e as colunas da 0142
  select f.empresa_id, f.id into v_empresa, v_func
    from public.funcionario f
    where f.deleted_at is null
      and f.ativo is not false
    order by f.created_at
    limit 1;
  if v_empresa is null then
    raise exception 'Nenhum funcionário ativo para testar.';
  end if;
  raise notice '== empresa de teste: %', v_empresa;

  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'treinamento_matricula'
     and column_name in ('tipo', 'motivo_eventual');
  if v_n <> 2 then
    raise exception 'FALHOU: faltam colunas da matrícula (esperava tipo e motivo_eventual, achei %)', v_n;
  end if;
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'treinamento_curso'
     and column_name = 'pre_requisito_curso_id';
  if v_n <> 1 then
    raise exception 'FALHOU: falta a coluna pre_requisito_curso_id no curso';
  end if;

  -- um curso de outra empresa (se houver), lido ANTES de virar o usuário da empresa de teste
  select c.id into v_outra_empresa_curso
    from public.treinamento_curso c
   where c.empresa_id <> v_empresa
     and c.deleted_at is null
   limit 1;

  -- T33 (0147): gravar no EAD exige a permissão da aba Treinamentos EAD, lida do vínculo do e-mail do token. O usuário
  -- de teste é um Admin sintético (e-mail @exemplo.test), que some no ROLLBACK.
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, nome_completo)
    values (v_empresa, 'smoke.t23@exemplo.test', 'Admin', true, 'Smoke T23');

  -- ---------------------------------------------------------------- usuário
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated',
    'sub', v_sub,
    'email', 'smoke.t23@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text, true);
  set local role authenticated;

  -- 2. nove cursos de teste (despublicados): uma matrícula por caso, porque só pode haver uma aberta por curso
  for v_i in 1..9 loop
    insert into public.treinamento_curso (empresa_id, nome, modalidade, carga_horaria_horas, ativo)
      values (v_empresa, 'SMOKE T23 curso ' || v_i, 'ead', 1, false)
      returning id into v_id;
    v_cursos := v_cursos || v_id;
  end loop;
  raise notice '[cursos de teste] OK 9 cursos';

  -- 3. sem tipo: nasce inicial e sem motivo
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_cursos[1], v_func)
    returning * into v_linha;
  if v_linha.tipo <> 'inicial' or v_linha.motivo_eventual is not null then
    raise exception 'FALHOU: matrícula sem tipo deveria nascer inicial e sem motivo (% / %)',
      v_linha.tipo, v_linha.motivo_eventual;
  end if;
  raise notice '[tipo padrão] OK inicial, sem motivo';

  -- 4. tipos válidos: periódico; eventual com motivo (tab e quebra de linha nas pontas) e com 150 emojis
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo)
    values (v_empresa, v_cursos[2], v_func, 'periodico');
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo, motivo_eventual)
    values (v_empresa, v_cursos[3], v_func, 'eventual', E'\t Troca de equipamento \n');
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo, motivo_eventual)
    values (v_empresa, v_cursos[4], v_func, 'eventual', repeat(chr(128512), 150));
  raise notice '[tipos válidos] OK periódico, eventual com motivo e eventual com 150 emojis';

  -- 5. recusas do tipo e do motivo (23514)
  foreach v_sql in array array[
    format('insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo) values (%L, %L, %L, %L)',
           v_empresa, v_cursos[5], v_func, 'eventual'),
    format('insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo, motivo_eventual) values (%L, %L, %L, %L, %L)',
           v_empresa, v_cursos[5], v_func, 'eventual', E'\n\n\n'),
    format('insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo, motivo_eventual) values (%L, %L, %L, %L, %L)',
           v_empresa, v_cursos[5], v_func, 'eventual', 'ab'),
    format('insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo, motivo_eventual) values (%L, %L, %L, %L, %L)',
           v_empresa, v_cursos[5], v_func, 'eventual', repeat('x', 201)),
    format('insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo, motivo_eventual) values (%L, %L, %L, %L, %L)',
           v_empresa, v_cursos[5], v_func, 'inicial', 'texto solto'),
    format('insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id, tipo) values (%L, %L, %L, %L)',
           v_empresa, v_cursos[5], v_func, 'desconhecido')
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '23514' then
        raise exception 'FALHOU: esperava 23514 e veio % (%) em: %', sqlstate, sqlerrm, left(v_sql, 140);
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o banco aceitou: %', left(v_sql, 140);
    end if;
  end loop;
  raise notice '[motivo e tipo] OK 6 recusas (sem motivo, só quebras de linha, curto, longo, inicial com motivo, tipo desconhecido)';

  -- 6. o RH não muda o tipo depois (0130: só o servidor muda o tipo de uma matrícula que já existe)
  v_falhou := false;
  begin
    update public.treinamento_matricula set tipo = 'periodico' where id = v_linha.id;
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FALHOU: mudar o tipo deveria dar 42501 e veio % (%)', sqlstate, sqlerrm;
    end if;
    v_falhou := true;
  end;
  if not v_falhou then
    raise exception 'FALHOU: o RH conseguiu mudar o tipo de uma matrícula existente';
  end if;
  raise notice '[tipo imutável para o RH] OK';

  -- 7. pré-requisito: o curso 7 exige o 6 (vale); exigir a si mesmo e fechar círculo não
  update public.treinamento_curso set pre_requisito_curso_id = v_cursos[6] where id = v_cursos[7];
  select count(*) into v_n from public.treinamento_curso
   where id = v_cursos[7] and pre_requisito_curso_id = v_cursos[6];
  if v_n <> 1 then
    raise exception 'FALHOU: o pré-requisito válido não foi gravado';
  end if;
  update public.treinamento_curso set pre_requisito_curso_id = v_cursos[7] where id = v_cursos[8];

  foreach v_sql in array array[
    -- a si mesmo
    format('update public.treinamento_curso set pre_requisito_curso_id = id where id = %L', v_cursos[9]),
    -- círculo direto: 6 exigir 7, que já exige 6
    format('update public.treinamento_curso set pre_requisito_curso_id = %L where id = %L', v_cursos[7], v_cursos[6]),
    -- círculo de 3 cursos: 6 exigir 8, que exige 7, que exige 6
    format('update public.treinamento_curso set pre_requisito_curso_id = %L where id = %L', v_cursos[8], v_cursos[6])
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '23514' then
        raise exception 'FALHOU: esperava 23514 e veio % (%) em: %', sqlstate, sqlerrm, left(v_sql, 140);
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o banco aceitou o pré-requisito: %', left(v_sql, 140);
    end if;
  end loop;
  raise notice '[pré-requisito] OK válido gravado; a si mesmo, círculo direto e círculo de 3 cursos recusados';

  -- 8. o curso exigido tem de ser da mesma empresa (só se houver outra empresa com curso)
  if v_outra_empresa_curso is null then
    raise notice '[outra empresa] pulado: não há curso de outra empresa';
  else
    v_falhou := false;
    begin
      update public.treinamento_curso set pre_requisito_curso_id = v_outra_empresa_curso where id = v_cursos[9];
    exception when others then
      if sqlstate not in ('42501', '23514') then
        raise exception 'FALHOU: pré-requisito de outra empresa deveria dar 42501 ou 23514 e veio % (%)', sqlstate, sqlerrm;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: aceitou como pré-requisito um curso de outra empresa';
    end if;
    raise notice '[outra empresa] OK pré-requisito de outra empresa recusado';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '============ SMOKE TEST OK (tipo do treinamento e pré-requisito, 0142) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: tipo do treinamento e pré-requisito (0142)' as res;

rollback;
