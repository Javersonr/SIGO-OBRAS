-- ============================================================================
-- smoke-ead-trilha.sql — valida a 0135: a trilha de auditoria do EAD é só de inclusão (nem o
-- servidor reescreve ou apaga) e cada evento diz de onde veio (servidor ou navegador).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria um curso, uma matrícula, eventos,
-- uma tentativa e um certificado descartáveis para um funcionário que já existe e simula, com
-- `set local role` + `request.jwt.claims`, o dono do banco (postgres), o servidor (service_role, como
-- o portal-funcionario), o usuário da empresa (authenticated), o super admin e o anônimo. Nada é
-- persistido. ATENÇÃO: as linhas de teste só saem pelo ROLLBACK (a trilha não aceita DELETE): rode o
-- arquivo inteiro, de uma vez, e não tire o `begin;` do começo nem o `rollback;` do fim.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo mais antigo): nenhum
-- UUID fixo neste arquivo. Para testar outra empresa, troque o filtro do passo 1 por
-- `and f.empresa_id = '<empresa_teste>'`.
--
-- O que confere:
--   1. o catálogo: coluna origem (not null, default 'servidor', check) e os triggers trilha_imutavel
--      (evento e tentativa: UPDATE/DELETE; certificado: DELETE) e trilha_imutavel_truncate nas três;
--   2. origem: nasce 'servidor' por padrão, aceita 'navegador' e recusa qualquer outro valor (23514);
--   3. dono do banco e servidor (service_role) NÃO conseguem UPDATE nem DELETE em evento e tentativa,
--      nem DELETE em certificado (42501), e apagar o curso ou a matrícula, que cascateia para a trilha,
--      também falha; INSERT de evento continua funcionando;
--   4. usuário da empresa: não faz DELETE/TRUNCATE em curso, aula, questão, dúvida, certificado,
--      evento e tentativa (42501) nem UPDATE no evento; excluir curso logicamente (deleted_at) e
--      REVOGAR o certificado continuam funcionando; lê o evento com a origem;
--   5. super admin: também sem DELETE (o grant foi revogado; a policy ALL não basta);
--   6. anônimo: sem acesso às tabelas;
--   7. TRUNCATE barrado (testado numa tabela temporária com o mesmo trigger, para não tocar a trilha);
--   8. o expurgo: só com `sigo.permitir_expurgo = 'on'` (exatamente 'on') o UPDATE/DELETE/TRUNCATE
--      passam; apagar a matrícula leva tentativa e certificado, e o evento fica com matricula_id nulo.
--
-- Como rodar (precisa da migração 0135 já aplicada):
--   supabase db query --linked -f tools/smoke-ead-trilha.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-trilha.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado esperado (padrão 42501). Roda com os
-- direitos de quem chama (SECURITY INVOKER): vale o papel ativo no momento. Some no ROLLBACK.
create or replace function public.smoke_trilha_recusa(p_sql text, p_estado text default '42501')
returns void
language plpgsql
as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado then
      raise exception 'FALHOU: esperava % e veio % (%) em: %', p_estado, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

do $$
declare
  v_empresa uuid;
  v_func uuid;
  v_curso uuid;
  v_mat uuid;
  v_ev_servidor bigint;
  v_ev_navegador bigint;
  v_ev_extra bigint;
  v_tentativa uuid;
  v_cert uuid;
  v_origem text;
  v_n int;
  v_linhas int;
  v_matricula_id uuid;
  v_claims_usuario text;
  v_claims_super text;
  t text;
begin
  -- 1. empresa e funcionário de teste (ativos, só leitura aqui) ---------------
  select f.empresa_id, f.id into v_empresa, v_func
    from public.funcionario f
    where f.deleted_at is null
    order by f.created_at
    limit 1;
  if v_empresa is null then
    raise exception 'Nenhum funcionário ativo para testar.';
  end if;
  raise notice '== empresa de teste: %', v_empresa;

  v_claims_usuario := jsonb_build_object(
    'role', 'authenticated',
    'sub', gen_random_uuid(),
    'app_metadata', jsonb_build_object('empresa_id', v_empresa)
  )::text;
  v_claims_super := jsonb_build_object(
    'role', 'authenticated',
    'sub', gen_random_uuid(),
    'app_metadata', jsonb_build_object('empresa_id', v_empresa, 'is_super_admin', true)
  )::text;

  -- ------------------------------------------------------------ dono do banco
  -- massa de teste (rolada para trás no fim)
  insert into public.treinamento_curso (empresa_id, nome)
    values (v_empresa, 'SMOKE trilha')
    returning id into v_curso;
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso, v_func)
    returning id into v_mat;

  -- 2. origem: padrão 'servidor', aceita 'navegador', recusa o resto
  insert into public.treinamento_evento (empresa_id, funcionario_id, matricula_id, curso_id, evento)
    values (v_empresa, v_func, v_mat, v_curso, 'login')
    returning id, origem into v_ev_servidor, v_origem;
  if v_origem is distinct from 'servidor' then
    raise exception 'FALHOU: evento sem origem deveria nascer servidor (%)', v_origem;
  end if;

  insert into public.treinamento_evento
    (empresa_id, funcionario_id, matricula_id, curso_id, evento, origem)
    values (v_empresa, v_func, v_mat, v_curso, 'play', 'navegador')
    returning id, origem into v_ev_navegador, v_origem;
  if v_origem is distinct from 'navegador' then
    raise exception 'FALHOU: evento do navegador deveria guardar origem navegador (%)', v_origem;
  end if;

  perform public.smoke_trilha_recusa(format(
    'insert into public.treinamento_evento (empresa_id, funcionario_id, evento, origem) values (%L, %L, %L, %L)',
    v_empresa, v_func, 'play', 'outra'), '23514');
  perform public.smoke_trilha_recusa(format(
    'insert into public.treinamento_evento (empresa_id, funcionario_id, evento, origem) values (%L, %L, %L, null)',
    v_empresa, v_func, 'play'), '23502');
  raise notice '[origem] OK padrão servidor, navegador aceito, outros valores recusados';

  insert into public.treinamento_tentativa
    (empresa_id, matricula_id, curso_id, funcionario_id, numero, prova, respostas,
     acertos, total, nota, aprovada)
    values (v_empresa, v_mat, v_curso, v_func, 1, '[]'::jsonb, '[]'::jsonb, 0, 1, 0, false)
    returning id into v_tentativa;
  insert into public.treinamento_certificado
    (empresa_id, matricula_id, curso_id, funcionario_id, codigo, hash_sha256, dados, assinatura_aluno)
    values (v_empresa, v_mat, v_curso, v_func,
            'SMK-' || substr(md5(random()::text), 1, 8), 'smoke', '{}'::jsonb, '{}'::jsonb)
    returning id into v_cert;

  -- 3. catálogo: coluna, check e triggers ---------------------------------------
  select count(*) into v_n from information_schema.columns
    where table_schema = 'public' and table_name = 'treinamento_evento' and column_name = 'origem'
      and is_nullable = 'NO' and column_default like '''servidor''%';
  if v_n <> 1 then
    raise exception 'FALHOU: treinamento_evento.origem deveria ser not null com default servidor';
  end if;

  select count(*) into v_n from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where g.tgname = 'trilha_imutavel' and not g.tgisinternal and g.tgenabled = 'O'
      and c.relnamespace = 'public'::regnamespace
      and ((c.relname in ('treinamento_evento', 'treinamento_tentativa')
            and (g.tgtype & 8) = 8 and (g.tgtype & 16) = 16 and (g.tgtype & 1) = 1) -- delete e update, por linha
        or (c.relname = 'treinamento_certificado'
            and (g.tgtype & 8) = 8 and (g.tgtype & 16) = 0 and (g.tgtype & 1) = 1)); -- só delete, por linha
  if v_n <> 3 then
    raise exception 'FALHOU: esperava 3 triggers trilha_imutavel (evento, tentativa, certificado), achou %', v_n;
  end if;

  select count(*) into v_n from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where g.tgname = 'trilha_imutavel_truncate' and not g.tgisinternal and g.tgenabled = 'O'
      and c.relnamespace = 'public'::regnamespace
      and c.relname in ('treinamento_evento', 'treinamento_tentativa', 'treinamento_certificado')
      and (g.tgtype & 32) = 32 and (g.tgtype & 1) = 0; -- truncate, por comando
  if v_n <> 3 then
    raise exception 'FALHOU: esperava 3 triggers trilha_imutavel_truncate, achou %', v_n;
  end if;
  raise notice '[catálogo] OK coluna origem e 6 triggers';

  -- 4. o dono do banco (SQL editor, migração) também é barrado -------------------
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_evento set evento = %L where id = %L', 'reescrito', v_ev_servidor));
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_evento set origem = %L where id = %L', 'servidor', v_ev_navegador));
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_evento set matricula_id = null where id = %L', v_ev_servidor));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_evento where id = %L', v_ev_servidor));
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_tentativa set nota = 100, aprovada = true where id = %L', v_tentativa));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_tentativa where id = %L', v_tentativa));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_certificado where id = %L', v_cert));
  -- a cascata também passa pelo trigger: matrícula e curso com trilha não saem
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_matricula where id = %L', v_mat));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_curso where id = %L', v_curso));
  select count(*) into v_n from public.treinamento_evento where id in (v_ev_servidor, v_ev_navegador)
    and evento in ('login', 'play') and matricula_id = v_mat;
  if v_n <> 2 then
    raise exception 'FALHOU: a trilha foi alterada apesar do bloqueio';
  end if;
  raise notice '[dono do banco] OK UPDATE/DELETE barrados em evento, tentativa e certificado (e na cascata)';

  -- --------------------------------------------------------------- servidor
  -- o portal-funcionario (service role): grava, mas não reescreve nem apaga
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;

  insert into public.treinamento_evento
    (empresa_id, funcionario_id, matricula_id, curso_id, evento, origem)
    values (v_empresa, v_func, v_mat, v_curso, 'abrir_aula', 'navegador')
    returning id into v_ev_extra;
  insert into public.treinamento_evento (empresa_id, funcionario_id, matricula_id, curso_id, evento)
    values (v_empresa, v_func, v_mat, v_curso, 'aula_concluida');

  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_evento set detalhe = %L::jsonb where id = %L', '{"x":1}', v_ev_extra));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_evento where id = %L', v_ev_extra));
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_tentativa set aprovada = true where id = %L', v_tentativa));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_tentativa where id = %L', v_tentativa));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_certificado where id = %L', v_cert));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_matricula where id = %L', v_mat));
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_curso where id = %L', v_curso));
  raise notice '[servidor] OK insere, mas não altera nem apaga a trilha';

  -- ---------------------------------------------------------------- usuário
  reset role;
  perform set_config('request.jwt.claims', v_claims_usuario, true);
  set local role authenticated;

  -- lê o evento com a origem (a tela de auditoria do RH)
  select origem into v_origem from public.treinamento_evento where id = v_ev_navegador;
  if v_origem is distinct from 'navegador' then
    raise exception 'FALHOU: o usuário da empresa deveria ler a origem do evento (%)', v_origem;
  end if;

  -- sem DELETE nem TRUNCATE nas 7 tabelas (as 4 do conteúdo + certificado, evento e tentativa)
  foreach t in array array['treinamento_curso', 'treinamento_aula', 'treinamento_questao',
                           'treinamento_duvida', 'treinamento_certificado', 'treinamento_evento',
                           'treinamento_tentativa'] loop
    perform public.smoke_trilha_recusa(format(
      'delete from public.%I where id::text = %L', t, gen_random_uuid()::text));
    perform public.smoke_trilha_recusa(format('truncate public.%I', t));
  end loop;
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_evento set origem = %L where id = %L', 'servidor', v_ev_navegador));
  perform public.smoke_trilha_recusa(format(
    'insert into public.treinamento_evento (empresa_id, funcionario_id, evento) values (%L, %L, %L)',
    v_empresa, v_func, 'forjado'));
  raise notice '[usuário] OK sem DELETE/TRUNCATE nas 7 tabelas, sem UPDATE/INSERT no evento';

  -- exclusão lógica do curso segue funcionando (é o que o SDK faz)
  update public.treinamento_curso set deleted_at = now() where id = v_curso;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU: a exclusão lógica do curso deveria gravar deleted_at (linhas=%)', v_linhas;
  end if;

  -- revogar o certificado (0119) segue funcionando: a trava é só do DELETE
  update public.treinamento_certificado
    set revogado_em = now(), revogado_por = 'smoke', motivo_revogacao = 'smoke'
    where id = v_cert;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU: a revogação do certificado deveria continuar funcionando (linhas=%)', v_linhas;
  end if;
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_certificado where id = %L', v_cert));
  raise notice '[usuário] OK exclusão lógica do curso e revogação do certificado funcionam';

  -- ------------------------------------------------------------- super admin
  reset role;
  perform set_config('request.jwt.claims', v_claims_super, true);
  set local role authenticated;

  foreach t in array array['treinamento_curso', 'treinamento_aula', 'treinamento_questao',
                           'treinamento_duvida', 'treinamento_certificado', 'treinamento_evento',
                           'treinamento_tentativa'] loop
    perform public.smoke_trilha_recusa(format(
      'delete from public.%I where id::text = %L', t, gen_random_uuid()::text));
  end loop;
  perform public.smoke_trilha_recusa(format(
    'update public.treinamento_evento set evento = %L where id = %L', 'reescrito', v_ev_servidor));
  raise notice '[super admin] OK também sem DELETE (o grant foi revogado) nem UPDATE no evento';

  -- ----------------------------------------------------------------- anônimo
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  foreach t in array array['treinamento_curso', 'treinamento_aula', 'treinamento_questao',
                           'treinamento_duvida', 'treinamento_certificado', 'treinamento_evento',
                           'treinamento_tentativa'] loop
    perform public.smoke_trilha_recusa(format('select count(*) from public.%I', t));
  end loop;
  raise notice '[anon] OK sem acesso às tabelas';

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 7. TRUNCATE: tabela temporária com o mesmo trigger (não toca a trilha real) ---
  create temp table smoke_trilha_tmp (id int primary key) on commit drop;
  create trigger trilha_imutavel before update or delete on smoke_trilha_tmp
    for each row execute function public.trilha_imutavel();
  create trigger trilha_imutavel_truncate before truncate on smoke_trilha_tmp
    for each statement execute function public.trilha_imutavel();
  insert into smoke_trilha_tmp values (1);

  perform public.smoke_trilha_recusa('truncate smoke_trilha_tmp');
  perform public.smoke_trilha_recusa('update smoke_trilha_tmp set id = 2');
  perform public.smoke_trilha_recusa('delete from smoke_trilha_tmp');
  select count(*) into v_n from smoke_trilha_tmp;
  if v_n <> 1 then
    raise exception 'FALHOU: a tabela temporária foi alterada apesar do trigger';
  end if;
  raise notice '[truncate] OK barrado pelo trigger de comando';

  -- 8. expurgo: só 'on' libera -------------------------------------------------
  foreach t in array array['ON', 'true', '1', 'sim', ''] loop
    perform set_config('sigo.permitir_expurgo', t, true);
    perform public.smoke_trilha_recusa(format(
      'delete from public.treinamento_evento where id = %L', v_ev_extra));
    perform public.smoke_trilha_recusa('truncate smoke_trilha_tmp');
  end loop;
  raise notice '[expurgo] OK qualquer valor diferente de on continua barrado';

  perform set_config('sigo.permitir_expurgo', 'on', true);

  -- UPDATE e DELETE de evento passam
  update public.treinamento_evento set detalhe = '{"expurgo":true}'::jsonb where id = v_ev_extra;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU: com o expurgo ligado o UPDATE do evento deveria passar (linhas=%)', v_linhas;
  end if;
  delete from public.treinamento_evento where id = v_ev_extra;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU: com o expurgo ligado o DELETE do evento deveria passar (linhas=%)', v_linhas;
  end if;

  -- TRUNCATE (na tabela temporária) passa
  truncate smoke_trilha_tmp;
  select count(*) into v_n from smoke_trilha_tmp;
  if v_n <> 0 then
    raise exception 'FALHOU: com o expurgo ligado o TRUNCATE deveria passar';
  end if;

  -- apagar a matrícula de verdade leva tentativa e certificado; o evento fica, sem matrícula
  delete from public.treinamento_matricula where id = v_mat;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU: com o expurgo ligado a matrícula deveria ser apagada (linhas=%)', v_linhas;
  end if;
  select count(*) into v_n from public.treinamento_tentativa where id = v_tentativa;
  if v_n <> 0 then
    raise exception 'FALHOU: a tentativa deveria sair junto com a matrícula (cascata)';
  end if;
  select count(*) into v_n from public.treinamento_certificado where id = v_cert;
  if v_n <> 0 then
    raise exception 'FALHOU: o certificado deveria sair junto com a matrícula (cascata)';
  end if;
  select matricula_id into v_matricula_id from public.treinamento_evento where id = v_ev_servidor;
  if not found or v_matricula_id is not null then
    raise exception 'FALHOU: o evento deveria ficar, com matricula_id nulo (ON DELETE SET NULL)';
  end if;
  raise notice '[expurgo] OK com sigo.permitir_expurgo = on: UPDATE, DELETE, TRUNCATE e a cascata passam';

  -- ligar de novo o freio: volta a barrar
  perform set_config('sigo.permitir_expurgo', 'off', true);
  perform public.smoke_trilha_recusa(format(
    'delete from public.treinamento_evento where id = %L', v_ev_servidor));
  raise notice '[expurgo] OK desligado, a trilha volta a ser imutável';

  raise notice '============ SMOKE TEST OK (trilha de auditoria travada, 0135) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP, a transação
-- abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: trilha de auditoria travada (0135)' as res;

rollback;
