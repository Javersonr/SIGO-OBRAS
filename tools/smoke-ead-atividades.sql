-- ============================================================================
-- smoke-ead-atividades.sql — valida a 0170 (atividades interativas do EAD:
-- questionário do módulo, caso com decisões e tarefa de estudo; spec
-- docs/superpowers/specs/2026-10-14-ead-atividades-interativas-design.md §6).
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria vínculos de
-- usuário sintéticos (e-mails @exemplo.test), dois cursos, aulas, questões,
-- um roteiro de caso, uma matrícula e uma tentativa descartáveis, para um
-- funcionário que já existe, e simula com `set local role authenticated` +
-- `request.jwt.claims` cada usuário da empresa. Nada é persistido. Rode o
-- arquivo inteiro, de uma vez.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo): nenhum UUID fixo neste arquivo. Para testar outra empresa,
-- troque o filtro do passo 1 por `and f.empresa_id = '<empresa_teste>'`.
--
-- Usuários de teste (vínculos sintéticos na empresa de teste):
--   editar  Treinamentos EAD → editar
--   ver     Treinamentos EAD → visualizar
--   nada    só Segurança do Trabalho → Funcionários (sem a aba do EAD)
--
-- O que confere:
--   1. colunas novas, tabelas novas e o zz_permissao_ead como ÚLTIMO trigger
--      BEFORE em todas as tabelas do EAD;
--   2. os tipos novos de aula (questionario, caso, tarefa) entram; tipo
--      desconhecido não (23514); curso novo nasce com nota mínima do módulo 80;
--   3. questão do questionário: aula de OUTRO curso ou que não é questionário
--      é recusada (23514); a questão da prova final (sem aula) continua;
--   4. roteiro do caso: aula que não é caso (23514), conteúdo que não é objeto
--      (23514), segundo roteiro vivo da mesma aula (23505) e DELETE de verdade
--      (permission denied) recusados;
--   5. nota mínima do módulo fora de 0 a 100 recusada (23514);
--   6. leitura: quem não tem a aba não lê o roteiro nem a tentativa; quem só
--      vê não grava o roteiro (42501);
--   7. tentativa do questionário: authenticated não grava (permission denied);
--      UPDATE e DELETE recusados até para o servidor (trilha_imutavel);
--   8. RPC importar_atividades_ead: quem não tem Editar recebe 42501; "editar"
--      importa um caso e um questionário no fim do módulo, um questionário
--      logo DEPOIS de uma aula (depois_da_aula_id, no meio do curso, herdando
--      o módulo dela) e uma tarefa de módulo novo no fim; as ordens ficam
--      contínuas; rodada de novo, pula tudo; código repetido na lista, aula de
--      referência de outro curso, tipo e questão malformados e lista que não é
--      lista recusados (22023) sem gravar nada; curso de outra empresa (42501).
--
-- Cada recusa confere a MENSAGEM esperada (smoke_0170_recusa): 42501 sozinho
-- aceitaria a recusa pelo motivo errado (grant ou RLS).
--
-- Como rodar (precisa da migração 0170 já aplicada; termina em ROLLBACK):
--   supabase db query --linked -f tools/smoke-ead-atividades.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-ead-atividades.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado e a mensagem esperados (LIKE). Roda com os direitos de
-- quem chama (SECURITY INVOKER). Some no ROLLBACK. Sem p_msg, a recusa por grant ou RLS é falha do smoke.
create or replace function public.smoke_0170_recusa(
  p_sql text, p_estado text default '42501', p_msg text default null)
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
    if p_msg is not null and sqlerrm not like p_msg then
      raise exception 'FALHOU: recusado, mas pelo motivo errado. Esperava "%" e veio "%" em: %', p_msg, sqlerrm, p_sql;
    end if;
    if p_msg is null and (sqlerrm like 'permission denied%' or sqlerrm like 'new row violates row-level security%') then
      raise exception 'FALHOU: recusado por grant ou RLS ("%"), não pela regra, em: %', sqlerrm, p_sql;
    end if;
    return sqlerrm;
  end;
  raise exception 'FALHOU: o comando não foi recusado: %', p_sql;
end;
$f$;

-- o token simulado de cada usuário de teste (e-mail sintético, empresa de teste)
create or replace function public.smoke_0170_claims(p_quem text, p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-0170-' || p_quem)::uuid,
    'email', 'smoke.0170.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

do $$
declare
  v_empresa uuid;
  v_func uuid;
  v_outra_empresa_curso uuid;
  v_curso uuid;      -- curso A: aulas de teste e a importação
  v_curso_b uuid;    -- curso B: as recusas de "outro curso"
  v_a1 uuid;
  v_quest uuid;
  v_caso uuid;
  v_tarefa uuid;
  v_quest_b uuid;
  v_texto_b uuid;
  v_questao uuid;
  v_roteiro uuid;
  v_mat uuid;
  v_tent uuid;
  v_n bigint;
  v_texto text;
  v_res jsonb;
  v_payload jsonb;
  v_roteiro_json jsonb := '{"contexto":"SMOKE contexto","etapas":[{"id":"e1","pergunta":"SMOKE decisão?","opcoes":[{"texto":"SMOKE segura","comentario":"SMOKE certo","segura":true,"proxima":null},{"texto":"SMOKE insegura","comentario":"SMOKE errado","segura":false,"proxima":"e1"}]}],"reflexao":"SMOKE reflexão"}';
  v_duas_questoes jsonb := '[{"pergunta":"SMOKE q1?","opcoes":["a","b","c"],"correta":2,"comentario":"SMOKE comentário"},{"pergunta":"SMOKE q2?","opcoes":["a","b"],"correta":0}]';
begin
  if to_regprocedure('public.importar_atividades_ead(uuid,jsonb)') is null then
    raise exception 'Falta a migração 0170 (public.importar_atividades_ead): aplique antes de rodar este smoke.';
  end if;

  -- 1. empresa e funcionário de teste (ativos, só leitura aqui) ------------------------------------------------
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

  -- um curso de outra empresa (se houver), lido como servidor
  select c.id into v_outra_empresa_curso
    from public.treinamento_curso c
   where c.empresa_id <> v_empresa and c.deleted_at is null
   limit 1;

  -- colunas e tabelas da 0170; zz_permissao_ead como o último BEFORE (ordem C, a do Postgres)
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'treinamento_aula' and column_name = 'codigo_origem')
       or (table_name = 'treinamento_questao' and column_name = 'aula_id')
       or (table_name = 'treinamento_curso' and column_name = 'nota_minima_modulo'));
  if v_n <> 3 then
    raise exception 'FALHOU: esperava 3 colunas novas e achei %', v_n;
  end if;
  if to_regclass('public.treinamento_caso') is null
     or to_regclass('public.treinamento_questionario_tentativa') is null then
    raise exception 'FALHOU: faltam as tabelas treinamento_caso e treinamento_questionario_tentativa';
  end if;
  select count(*) into v_n
    from (
      select t.tgrelid, max(t.tgname::text collate "C") as ultimo
        from pg_trigger t
       where not t.tgisinternal
         and (t.tgtype & 3) = 3
         and t.tgrelid in (select z.tgrelid from pg_trigger z where z.tgname = 'zz_permissao_ead')
       group by t.tgrelid
    ) u
   where u.ultimo <> 'zz_permissao_ead';
  if v_n <> 0 then
    raise exception 'FALHOU: % tabela(s) do EAD com trigger BEFORE depois do zz_permissao_ead', v_n;
  end if;
  select count(*) into v_n
    from pg_trigger where tgname = 'zz_permissao_ead' and tgrelid = 'public.treinamento_caso'::regclass;
  if v_n <> 1 then
    raise exception 'FALHOU: treinamento_caso sem o zz_permissao_ead';
  end if;
  raise notice '[estrutura] OK colunas, tabelas e zz_permissao_ead por último';

  -- usuários de teste (como servidor: sem token)
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    select v_empresa, 'smoke.0170.' || u.quem || '@exemplo.test', 'Gestor', true, u.permissoes, 'Smoke 0170'
      from (values
        ('editar', '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb),
        ('ver', '{"Segurança do Trabalho":{"Treinamentos EAD":{"visualizar":true}}}'::jsonb),
        ('nada', '{"Segurança do Trabalho":{"Funcionários":{"visualizar":true,"editar":true}}}'::jsonb)
      ) as u(quem, permissoes);

  -- 2. como "editar": cursos, aulas e os tipos novos ---------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_0170_claims('editar', v_empresa), true);
  set local role authenticated;

  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE 0170 curso A', false) returning id into v_curso;
  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE 0170 curso B', false) returning id into v_curso_b;
  select nota_minima_modulo into v_n from public.treinamento_curso where id = v_curso;
  if v_n <> 80 then
    raise exception 'FALHOU: o curso novo devia nascer com nota mínima do módulo 80 (veio %)', v_n;
  end if;

  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 1, 'SMOKE M1', 'SMOKE A1', 'texto', 'SMOKE texto A1', 60) returning id into v_a1;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 2, 'SMOKE M1', 'SMOKE A2', 'texto', 'SMOKE texto A2', 60);
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 3, 'SMOKE M2', 'SMOKE A3', 'texto', 'SMOKE texto A3', 60);
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg)
    values (v_empresa, v_curso, 4, 'SMOKE M2', 'SMOKE Q', 'questionario', 900) returning id into v_quest;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg)
    values (v_empresa, v_curso, 5, 'SMOKE M2', 'SMOKE C', 'caso', 600) returning id into v_caso;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 6, 'SMOKE M2', 'SMOKE T', 'tarefa', 'SMOKE instruções', 1200) returning id into v_tarefa;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, duracao_seg)
    values (v_empresa, v_curso_b, 1, 'SMOKE M1', 'SMOKE B1', 'questionario', 900) returning id into v_quest_b;
  insert into public.treinamento_aula (empresa_id, curso_id, ordem, modulo, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso_b, 2, 'SMOKE M1', 'SMOKE B2', 'texto', 'SMOKE texto B2', 60) returning id into v_texto_b;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_aula (empresa_id, curso_id, titulo, tipo) values (%L, %L, %L, %L)',
    v_empresa, v_curso, 'SMOKE X', 'inventado'), '23514', '%treinamento_aula_tipo_chk%');
  raise notice '[tipos] OK questionario, caso e tarefa entram; tipo desconhecido não; nota do módulo nasce 80';

  -- 3. questão do questionário -----------------------------------------------------------------------------------
  insert into public.treinamento_questao (empresa_id, curso_id, aula_id, pergunta, opcoes, correta)
    values (v_empresa, v_curso, v_quest, 'SMOKE pergunta do questionário?', '["a","b"]'::jsonb, 0)
    returning id into v_questao;
  -- a questão da prova final (sem aula) continua gravável
  insert into public.treinamento_questao (empresa_id, curso_id, pergunta, opcoes, correta)
    values (v_empresa, v_curso, 'SMOKE pergunta da prova?', '["a","b"]'::jsonb, 1);
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_questao (empresa_id, curso_id, aula_id, pergunta, opcoes, correta) values (%L, %L, %L, %L, %L::jsonb, 0)',
    v_empresa, v_curso, v_quest_b, 'SMOKE outro curso?', '["a","b"]'),
    '23514', 'A questão do questionário precisa de uma aula viva do mesmo curso%');
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_questao (empresa_id, curso_id, aula_id, pergunta, opcoes, correta) values (%L, %L, %L, %L, %L::jsonb, 0)',
    v_empresa, v_curso, v_a1, 'SMOKE aula de texto?', '["a","b"]'),
    '23514', 'A questão só entra numa aula do tipo questionário%');
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_questao set aula_id = %L where id = %L', v_tarefa, v_questao),
    '23514', 'A questão só entra numa aula do tipo questionário%');
  raise notice '[questão] OK aula de outro curso e aula que não é questionário recusadas; prova final continua';

  -- 4. roteiro do caso ---------------------------------------------------------------------------------------------
  insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo)
    values (v_empresa, v_curso, v_caso, v_roteiro_json) returning id into v_roteiro;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_tarefa, v_roteiro_json), '23514', 'O roteiro só entra numa aula do tipo caso%');
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_caso, '[]'), '23514', '%treinamento_caso_conteudo_chk%');
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_caso, v_roteiro_json), '23505', '%treinamento_caso_aula_uniq%');
  perform public.smoke_0170_recusa(format(
    'delete from public.treinamento_caso where id = %L', v_roteiro), '42501', 'permission denied%');
  raise notice '[caso] OK aula que não é caso, conteúdo que não é objeto, segundo roteiro e DELETE recusados';

  -- 5. nota mínima do módulo -----------------------------------------------------------------------------------
  update public.treinamento_curso set nota_minima_modulo = 70 where id = v_curso;
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_curso set nota_minima_modulo = 101 where id = %L', v_curso),
    '23514', '%treinamento_curso_nota_minima_modulo_chk%');
  raise notice '[nota do módulo] OK 70 grava; 101 recusado';

  -- 6. leitura e escrita do roteiro por quem não tem Editar ---------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('nada', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_caso where id = v_roteiro;
  if v_n <> 0 then
    raise exception 'FALHOU: quem não tem a aba Treinamentos EAD leu o roteiro do caso';
  end if;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_caso (empresa_id, curso_id, aula_id, conteudo) values (%L, %L, %L, %L::jsonb)',
    v_empresa, v_curso, v_caso, v_roteiro_json),
    '42501', 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%');

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('ver', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_caso where id = v_roteiro;
  if v_n <> 1 then
    raise exception 'FALHOU: quem tem a aba (visualizar) devia ler o roteiro';
  end if;
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_caso set conteudo = conteudo || %L::jsonb where id = %L',
    '{"reflexao":"SMOKE mudou"}', v_roteiro),
    '42501', 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%');
  raise notice '[leitura do roteiro] OK sem a aba não lê; visualizar lê e não grava';

  -- 7. tentativas do questionário ----------------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso, v_func) returning id into v_mat;
  insert into public.treinamento_questionario_tentativa
    (empresa_id, matricula_id, curso_id, aula_id, funcionario_id, numero, prova, respostas, acertos, total, nota, aprovada)
    values (v_empresa, v_mat, v_curso, v_quest, v_func, 1, '[]'::jsonb, '[]'::jsonb, 0, 1, 0, false)
    returning id into v_tent;
  perform public.smoke_0170_recusa(format(
    'update public.treinamento_questionario_tentativa set nota = 100 where id = %L', v_tent),
    '42501', 'Acesso negado: o registro de auditoria%');
  perform public.smoke_0170_recusa(format(
    'delete from public.treinamento_questionario_tentativa where id = %L', v_tent),
    '42501', 'Acesso negado: o registro de auditoria%');

  perform set_config('request.jwt.claims', public.smoke_0170_claims('editar', v_empresa), true);
  set local role authenticated;
  perform public.smoke_0170_recusa(format(
    'insert into public.treinamento_questionario_tentativa (empresa_id, matricula_id, curso_id, aula_id, funcionario_id, numero, prova, respostas, acertos, total, nota, aprovada) values (%L, %L, %L, %L, %L, 2, %L::jsonb, %L::jsonb, 1, 1, 100, true)',
    v_empresa, v_mat, v_curso, v_quest, v_func, '[]', '[]'), '42501', 'permission denied%');
  select count(*) into v_n from public.treinamento_questionario_tentativa where id = v_tent;
  if v_n <> 1 then
    raise exception 'FALHOU: quem tem a aba devia ler a tentativa do questionário';
  end if;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('nada', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_questionario_tentativa where id = v_tent;
  if v_n <> 0 then
    raise exception 'FALHOU: quem não tem a aba leu a tentativa do questionário';
  end if;
  raise notice '[tentativas] OK só o servidor grava; UPDATE e DELETE recusados; leitura só com a aba';

  -- 8. RPC importar_atividades_ead ----------------------------------------------------------------------------------
  v_payload := jsonb_build_array(
    jsonb_build_object('codigo_origem', 'SMK-M1-C1', 'tipo', 'caso', 'modulo', 'SMOKE M1',
      'titulo', 'SMOKE caso importado', 'duracao_seg', 600, 'caso', v_roteiro_json),
    jsonb_build_object('codigo_origem', 'SMK-M1-Q', 'tipo', 'questionario', 'modulo', 'SMOKE M1',
      'titulo', 'SMOKE questionário importado', 'duracao_seg', 900, 'questoes', v_duas_questoes),
    -- pós-vídeo: logo depois da aula A1, no meio do curso; o módulo do item é ignorado (fica o da A1)
    jsonb_build_object('codigo_origem', 'SMK-PV-A1', 'tipo', 'questionario', 'modulo', 'SMOKE ignorado',
      'depois_da_aula_id', v_a1, 'titulo', 'SMOKE pós-aula A1', 'duracao_seg', 300, 'questoes', v_duas_questoes),
    jsonb_build_object('codigo_origem', 'SMK-M9-T1', 'tipo', 'tarefa', 'modulo', 'SMOKE M9 novo',
      'titulo', 'SMOKE tarefa importada', 'duracao_seg', 1200,
      'conteudo_texto', E'SMOKE instruções\n\nO que produzir: SMOKE evidência')
  );

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_0170_recusa(format(
    'select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso, v_payload),
    '42501', 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%');

  reset role;
  perform set_config('request.jwt.claims', public.smoke_0170_claims('editar', v_empresa), true);
  set local role authenticated;
  v_res := public.importar_atividades_ead(v_curso, v_payload);
  if v_res is distinct from jsonb_build_object('criadas', 4, 'puladas', 0, 'questoes', 4) then
    raise exception 'FALHOU: a importação devolveu %', v_res;
  end if;
  -- ordem: o pós-aula logo depois da A1; caso e questionário no fim do M1; a tarefa do módulo novo no fim
  select string_agg(a.titulo, ' | ' order by a.ordem) into v_texto
    from public.treinamento_aula a where a.curso_id = v_curso and a.deleted_at is null;
  if v_texto is distinct from
     'SMOKE A1 | SMOKE pós-aula A1 | SMOKE A2 | SMOKE caso importado | SMOKE questionário importado | SMOKE A3 | SMOKE Q | SMOKE C | SMOKE T | SMOKE tarefa importada' then
    raise exception 'FALHOU: ordem das aulas depois da importação: %', v_texto;
  end if;
  select string_agg(a.ordem::text, ',' order by a.ordem) into v_texto
    from public.treinamento_aula a where a.curso_id = v_curso and a.deleted_at is null;
  if v_texto is distinct from '1,2,3,4,5,6,7,8,9,10' then
    raise exception 'FALHOU: as ordens deviam ficar contínuas (vieram %)', v_texto;
  end if;
  select a.modulo into v_texto from public.treinamento_aula a where a.curso_id = v_curso and a.codigo_origem = 'SMK-PV-A1';
  if v_texto is distinct from 'SMOKE M1' then
    raise exception 'FALHOU: o item com depois_da_aula_id devia herdar o módulo da aula (veio %)', v_texto;
  end if;
  select string_agg(q.ordem::text || ':' || q.correta::text || ':' || coalesce(q.comentario, '-'), ',' order by q.ordem)
    into v_texto
    from public.treinamento_questao q
    join public.treinamento_aula a on a.id = q.aula_id
   where a.curso_id = v_curso and a.codigo_origem = 'SMK-M1-Q';
  if v_texto is distinct from '1:2:SMOKE comentário,2:0:-' then
    raise exception 'FALHOU: questões do questionário importado: %', v_texto;
  end if;
  select count(*) into v_n
    from public.treinamento_caso c join public.treinamento_aula a on a.id = c.aula_id
   where a.curso_id = v_curso and a.codigo_origem = 'SMK-M1-C1' and c.conteudo = v_roteiro_json;
  if v_n <> 1 then
    raise exception 'FALHOU: o roteiro do caso importado não foi gravado';
  end if;
  select a.conteudo_texto into v_texto from public.treinamento_aula a where a.curso_id = v_curso and a.codigo_origem = 'SMK-M9-T1';
  if v_texto is distinct from E'SMOKE instruções\n\nO que produzir: SMOKE evidência' then
    raise exception 'FALHOU: texto da tarefa importada: %', v_texto;
  end if;
  raise notice '[importação] OK 4 aulas, 4 questões, 1 roteiro; pós-aula depois da A1 (módulo dela); ordens contínuas';

  -- de novo: pula tudo, nada muda
  v_res := public.importar_atividades_ead(v_curso, v_payload);
  if v_res is distinct from jsonb_build_object('criadas', 0, 'puladas', 4, 'questoes', 0) then
    raise exception 'FALHOU: a reimportação devia pular tudo e devolveu %', v_res;
  end if;
  select count(*) into v_n from public.treinamento_aula where curso_id = v_curso and deleted_at is null;
  if v_n <> 10 then
    raise exception 'FALHOU: a reimportação mudou o número de aulas (%)', v_n;
  end if;
  raise notice '[reimportação] OK pula as 4, nada duplica';

  -- recusas de formato (22023), sem gravar nada (tudo ou nada)
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(
      jsonb_build_object('codigo_origem', 'SMK-OK', 'tipo', 'tarefa', 'titulo', 'SMOKE ok', 'duracao_seg', 60,
        'conteudo_texto', 'SMOKE texto'),
      jsonb_build_object('codigo_origem', 'SMK-OK', 'tipo', 'tarefa', 'titulo', 'SMOKE repetido', 'duracao_seg', 60,
        'conteudo_texto', 'SMOKE texto'))),
    '22023', 'Código de origem repetido na lista%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(
      jsonb_build_object('codigo_origem', 'SMK-OK', 'tipo', 'tarefa', 'titulo', 'SMOKE ok', 'duracao_seg', 60,
        'conteudo_texto', 'SMOKE texto'),
      jsonb_build_object('codigo_origem', 'SMK-PV-B2', 'tipo', 'questionario', 'depois_da_aula_id', v_texto_b,
        'titulo', 'SMOKE âncora de outro curso', 'duracao_seg', 300, 'questoes', v_duas_questoes))),
    '22023', 'Atividade SMK-PV-B2: a aula de referência (depois_da_aula_id) não é deste curso ou foi apagada%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(jsonb_build_object('codigo_origem', 'SMK-X', 'tipo', 'video', 'titulo', 'SMOKE x',
      'duracao_seg', 60))),
    '22023', 'Atividade SMK-X: tipo inválido%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    jsonb_build_array(jsonb_build_object('codigo_origem', 'SMK-Y', 'tipo', 'questionario', 'titulo', 'SMOKE y',
      'duracao_seg', 60, 'questoes', '[{"pergunta":"SMOKE?","opcoes":["a","b"],"correta":2}]'::jsonb))),
    '22023', 'Atividade SMK-Y: a alternativa correta%');
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)', v_curso,
    '{}'), '22023', 'A importação precisa de uma lista de atividades%');
  select count(*) into v_n from public.treinamento_aula where curso_id = v_curso and codigo_origem = 'SMK-OK';
  if v_n <> 0 then
    raise exception 'FALHOU: a importação recusada gravou parte da lista';
  end if;
  perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)',
    gen_random_uuid(), '[]'), 'P0002', 'Curso não encontrado%');
  if v_outra_empresa_curso is null then
    raise notice '[importação de outra empresa] pulado: não há curso de outra empresa';
  else
    perform public.smoke_0170_recusa(format('select public.importar_atividades_ead(%L::uuid, %L::jsonb)',
      v_outra_empresa_curso, '[]'), '42501', 'Acesso negado: curso de outra empresa%');
  end if;
  raise notice '[importação] OK recusas: código repetido, âncora de outro curso, tipo, questão, lista; nada gravado';

  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '============ SMOKE TEST OK (atividades interativas, 0170) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: atividades interativas (0170)' as res;

rollback;
