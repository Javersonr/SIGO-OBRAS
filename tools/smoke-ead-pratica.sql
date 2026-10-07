-- ============================================================================
-- smoke-ead-pratica.sql — valida a 0143 (T12): sessão prática presencial e a
-- presença/resultado de cada matrícula do curso semipresencial.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria um curso
-- semipresencial e um curso EAD descartáveis, matrículas para um funcionário
-- que já existe, sessões e participantes, simulando com `set local role` +
-- `request.jwt.claims` o usuário da empresa (authenticated) e o anônimo. Nada é
-- persistido.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo): nenhum UUID fixo neste arquivo. Para testar outra empresa, troque
-- o filtro do passo 1 por `and f.empresa_id = '<empresa_teste>'`.
--
-- O que confere:
--   1. curso: carga teórica/prática positivas (0 é recusado);
--   2. sessão: horário com fim depois do início, carga > 0, local de 3 a 120
--      caracteres e lista assinada só como referência "treinamentos/<empresa>/...";
--   3. participante: o funcionário é sempre o da matrícula (o enviado é trocado);
--      avaliado_por/avaliado_em vêm do banco (os enviados são ignorados) e só
--      mudam quando presença ou resultado mudam (e aí com o usuário que mudou);
--   4. "satisfatório" sem presença: recusado (23514);
--   5. matrícula de outro curso: recusada (23514); a mesma matrícula duas vezes
--      na sessão: recusada (23505);
--   6. sessão de data futura: presença/resultado recusados (23514), mas incluir
--      pendente e excluir (soft) funcionam;
--   7. trocar sessão, matrícula ou funcionário do participante: 42501;
--   8. DELETE/TRUNCATE de verdade (as duas tabelas) e o anônimo: 42501;
--   9. exclusão lógica (deleted_at) funciona e libera incluir a matrícula de novo;
--  10. (A6) carga acima do tempo do horário: recusada (23514); sessão apagada não recebe participante (42501);
--      sessão com participante vivo não troca de curso (23514); com presença lançada ela não vai para
--      depois de hoje (23514), e sem presença nem resultado ela pode ser remarcada.
--
-- Como rodar (precisa da migração 0143 já aplicada):
--   supabase db query --linked -f tools/smoke-ead-pratica.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-pratica.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

do $$
declare
  v_empresa uuid;
  v_func uuid;
  v_curso uuid;          -- semipresencial de teste
  v_outro uuid;          -- curso EAD de teste (a matrícula dele não entra na sessão do outro)
  v_mat uuid;
  v_mat_outro uuid;
  v_sessao uuid;         -- sessão de hoje
  v_futura uuid;         -- sessão da semana que vem
  v_part uuid;
  v_part_futura uuid;
  v_part_novo uuid;      -- participante incluído de novo na sessão de hoje (passo 10)
  v_linha public.treinamento_pratica_participante;
  v_sql text;
  v_falhou boolean;
  v_sub uuid := gen_random_uuid();
  v_sub2 uuid := gen_random_uuid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_esperado text;
begin
  -- 1. empresa e funcionário de teste (ativos, só leitura aqui)
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

  -- T33 (0147): gravar no EAD exige a permissão da aba Treinamentos EAD, lida do vínculo do e-mail do token. Os dois
  -- usuários de teste são Admin sintéticos (e-mail @exemplo.test), que somem no ROLLBACK.
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, nome_completo)
    values (v_empresa, 'smoke.t12.um@exemplo.test', 'Admin', true, 'Smoke T12'),
           (v_empresa, 'smoke.t12.dois@exemplo.test', 'Admin', true, 'Smoke T12');

  -- ---------------------------------------------------------------- usuário
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated',
    'sub', v_sub,
    'email', 'smoke.t12.um@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text, true);
  set local role authenticated;

  -- 2. cursos de teste (despublicados) e matrículas
  insert into public.treinamento_curso
    (empresa_id, nome, modalidade, carga_horaria_horas, carga_teorica_horas, carga_pratica_horas, ativo)
    values (v_empresa, 'SMOKE T12 semipresencial', 'semipresencial', 2, 1, 1, false)
    returning id into v_curso;
  insert into public.treinamento_curso (empresa_id, nome, modalidade, carga_horaria_horas, ativo)
    values (v_empresa, 'SMOKE T12 outro curso', 'ead', 1, false)
    returning id into v_outro;
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso, v_func)
    returning id into v_mat;
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_outro, v_func)
    returning id into v_mat_outro;
  raise notice '[cursos e matrículas de teste] OK';

  -- 3. restrições do curso e da sessão (23514)
  foreach v_sql in array array[
    format('update public.treinamento_curso set carga_teorica_horas = 0 where id = %L', v_curso),
    format('update public.treinamento_curso set carga_pratica_horas = -1 where id = %L', v_curso),
    format('insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome) values (%L, %L, %L, %L, %L, 1, %L, %L)',
           v_empresa, v_curso, v_hoje, '10:00', '09:00', 'SMOKE local', 'SMOKE instrutor'),
    format('insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome) values (%L, %L, %L, %L, %L, 0, %L, %L)',
           v_empresa, v_curso, v_hoje, '08:00', '09:00', 'SMOKE local', 'SMOKE instrutor'),
    format('insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome) values (%L, %L, %L, %L, %L, 1, %L, %L)',
           v_empresa, v_curso, v_hoje, '08:00', '09:00', 'ab', 'SMOKE instrutor'),
    -- A6: 24 h de carga num horário de 1 h (a carga não passa do tempo do horário)
    format('insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome) values (%L, %L, %L, %L, %L, 24, %L, %L)',
           v_empresa, v_curso, v_hoje, '08:00', '09:00', 'SMOKE local', 'SMOKE instrutor'),
    format('insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome, lista_presenca_ref) values (%L, %L, %L, %L, %L, 1, %L, %L, %L)',
           v_empresa, v_curso, v_hoje, '08:00', '09:00', 'SMOKE local', 'SMOKE instrutor',
           'https://exemplo.test/lista.pdf'),
    format('insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome, lista_presenca_ref) values (%L, %L, %L, %L, %L, 1, %L, %L, %L)',
           v_empresa, v_curso, v_hoje, '08:00', '09:00', 'SMOKE local', 'SMOKE instrutor',
           'treinamentos/' || gen_random_uuid() || '/lista.pdf')
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '23514' then
        raise exception 'FALHOU: esperava 23514 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o banco aceitou: %', v_sql;
    end if;
  end loop;
  raise notice '[restrições do curso e da sessão] OK (8 recusas)';

  -- 4. sessões válidas: hoje (com a lista da própria empresa) e a da semana que vem
  insert into public.treinamento_sessao_pratica
    (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome, lista_presenca_ref)
    values (v_empresa, v_curso, v_hoje, '08:00', '09:00', 1, 'SMOKE local', 'SMOKE instrutor',
            'treinamentos/' || v_empresa || '/smoke/lista.pdf')
    returning id into v_sessao;
  insert into public.treinamento_sessao_pratica
    (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome)
    values (v_empresa, v_curso, v_hoje + 7, '08:00', '09:00', 1, 'SMOKE local', 'SMOKE instrutor')
    returning id into v_futura;
  raise notice '[sessões válidas] OK';

  -- 5. participante: funcionário forjado e avaliação forjada são trocados pelo banco
  insert into public.treinamento_pratica_participante
    (empresa_id, sessao_id, matricula_id, funcionario_id, presente, resultado, avaliado_por, avaliado_em)
    values (v_empresa, v_sessao, v_mat, gen_random_uuid(), true, 'satisfatorio',
            gen_random_uuid(), now() - interval '30 days')
    returning id into v_part;
  select * into v_linha from public.treinamento_pratica_participante where id = v_part;
  if v_linha.funcionario_id is distinct from v_func then
    raise exception 'FALHOU: o funcionário deveria ser o da matrícula';
  end if;
  if v_linha.avaliado_por is distinct from v_sub
     or v_linha.avaliado_em < now() - interval '1 minute' then
    raise exception 'FALHOU: avaliado_por/avaliado_em deveriam vir do banco (% / %)',
      v_linha.avaliado_por, v_linha.avaliado_em;
  end if;
  raise notice '[participante] OK funcionário e avaliação vêm do banco';

  -- 6. mudar só a observação (ou forjar a avaliação) não muda quem avaliou; mudar o resultado, muda
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated',
    'sub', v_sub2,
    'email', 'smoke.t12.dois@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text, true);
  update public.treinamento_pratica_participante
    set observacao = 'SMOKE observação', avaliado_por = gen_random_uuid(),
        avaliado_em = now() - interval '1 year'
    where id = v_part;
  select * into v_linha from public.treinamento_pratica_participante where id = v_part;
  if v_linha.avaliado_por is distinct from v_sub or v_linha.observacao <> 'SMOKE observação'
     or v_linha.avaliado_em < now() - interval '1 minute' then
    raise exception 'FALHOU: sem mudar presença/resultado, a avaliação deveria ficar como estava';
  end if;
  update public.treinamento_pratica_participante set resultado = 'insatisfatorio' where id = v_part;
  select * into v_linha from public.treinamento_pratica_participante where id = v_part;
  if v_linha.avaliado_por is distinct from v_sub2 then
    raise exception 'FALHOU: quem mudou o resultado deveria ficar em avaliado_por';
  end if;
  raise notice '[avaliação] OK só muda com a presença ou o resultado, e com o usuário que mudou';

  -- 7. recusas: satisfatório sem presença (23514), matrícula de outro curso (23514), repetida (23505),
  --    presença numa sessão futura (23514), trocar sessão/matrícula/funcionário (42501)
  foreach v_sql in array array[
    format('update public.treinamento_pratica_participante set presente = false, resultado = %L where id = %L',
           'satisfatorio', v_part) || ' -- 23514',
    format('insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id) values (%L, %L, %L, %L)',
           v_empresa, v_sessao, v_mat_outro, v_func) || ' -- 23514',
    format('insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id) values (%L, %L, %L, %L)',
           v_empresa, v_sessao, v_mat, v_func) || ' -- 23505',
    format('insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id, presente) values (%L, %L, %L, %L, true)',
           v_empresa, v_futura, v_mat, v_func) || ' -- 23514',
    format('update public.treinamento_pratica_participante set sessao_id = %L where id = %L',
           v_futura, v_part) || ' -- 42501',
    format('update public.treinamento_pratica_participante set funcionario_id = gen_random_uuid() where id = %L',
           v_part) || ' -- 42501'
  ] loop
    v_esperado := substring(v_sql from '-- (\d{5})$');
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> v_esperado then
        raise exception 'FALHOU: esperava % e veio % (%) em: %', v_esperado, sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o banco aceitou: %', v_sql;
    end if;
  end loop;
  raise notice '[recusas do participante] OK (6)';

  -- 8. sessão futura: incluir pendente funciona; marcar presença não; excluir (soft) sempre
  insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id)
    values (v_empresa, v_futura, v_mat, v_func)
    returning id into v_part_futura;
  v_falhou := false;
  begin
    update public.treinamento_pratica_participante set presente = true where id = v_part_futura;
  exception when others then
    if sqlstate <> '23514' then
      raise exception 'FALHOU: esperava 23514 e veio % (%)', sqlstate, sqlerrm;
    end if;
    v_falhou := true;
  end;
  if not v_falhou then
    raise exception 'FALHOU: o banco aceitou presença numa sessão futura';
  end if;
  update public.treinamento_pratica_participante set deleted_at = now() where id = v_part_futura;
  raise notice '[sessão futura] OK pendente entra, presença não, excluir pode';

  -- 9. DELETE/TRUNCATE de verdade: sem privilégio
  foreach v_sql in array array[
    format('delete from public.treinamento_pratica_participante where id = %L', v_part),
    format('delete from public.treinamento_sessao_pratica where id = %L', v_sessao),
    'truncate public.treinamento_pratica_participante',
    'truncate public.treinamento_sessao_pratica'
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o usuário conseguiu executar: %', v_sql;
    end if;
  end loop;
  raise notice '[delete/truncate] OK sem privilégio';

  -- 10. exclusão lógica libera incluir a mesma matrícula de novo na sessão
  update public.treinamento_pratica_participante set deleted_at = now() where id = v_part;
  insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id)
    values (v_empresa, v_sessao, v_mat, v_func)
    returning id into v_part_novo;
  update public.treinamento_sessao_pratica set deleted_at = now() where id = v_futura;
  raise notice '[exclusão lógica] OK';

  -- 11. A6: sessão apagada não recebe participante (42501); sessão com participante vivo não troca de curso
  --     (23514); com presença lançada a sessão não vai para depois de hoje (23514), e sem presença ela remarca
  foreach v_sql in array array[
    format('insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id) values (%L, %L, %L, %L)',
           v_empresa, v_futura, v_mat, v_func) || ' -- 42501',
    format('update public.treinamento_sessao_pratica set curso_id = %L where id = %L',
           v_outro, v_sessao) || ' -- 23514'
  ] loop
    v_esperado := substring(v_sql from '-- (\d{5})$');
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> v_esperado then
        raise exception 'FALHOU: esperava % e veio % (%) em: %', v_esperado, sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o banco aceitou: %', v_sql;
    end if;
  end loop;
  -- sem presença nem resultado lançados (o participante novo é "pendente"), remarcar para a semana que vem pode
  update public.treinamento_sessao_pratica set data = v_hoje + 3 where id = v_sessao;
  update public.treinamento_sessao_pratica set data = v_hoje where id = v_sessao;
  update public.treinamento_pratica_participante set presente = true where id = v_part_novo;
  v_falhou := false;
  begin
    update public.treinamento_sessao_pratica set data = v_hoje + 3 where id = v_sessao;
  exception when others then
    if sqlstate <> '23514' then
      raise exception 'FALHOU: esperava 23514 e veio % (%)', sqlstate, sqlerrm;
    end if;
    v_falhou := true;
  end;
  if not v_falhou then
    raise exception 'FALHOU: o banco remarcou para o futuro uma sessão com presença lançada';
  end if;
  raise notice '[sessão apagada e sessão com participantes] OK';

  -- ----------------------------------------------------------------- anônimo
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  foreach v_sql in array array[
    'select count(*) from public.treinamento_sessao_pratica',
    'select count(*) from public.treinamento_pratica_participante'
  ] loop
    v_falhou := false;
    begin
      execute v_sql;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FALHOU: esperava 42501 e veio % (%) em: %', sqlstate, sqlerrm, v_sql;
      end if;
      v_falhou := true;
    end;
    if not v_falhou then
      raise exception 'FALHOU: o anônimo conseguiu executar: %', v_sql;
    end if;
  end loop;
  raise notice '[anon] OK sem acesso às tabelas';

  reset role;
  perform set_config('request.jwt.claims', '', true);

  raise notice '============ SMOKE TEST OK (prática presencial do semipresencial, 0143) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: prática presencial do semipresencial (0143)' as res;

rollback;
