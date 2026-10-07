-- ============================================================================
-- smoke-permissoes-ead.sql — valida a 0147 (T33): a permissão própria do EAD
-- conferida pelo banco, os documentos do portal só por RPC e as travas da
-- matrícula e do certificado.
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria vínculos de
-- usuário sintéticos (e-mails @exemplo.test), cursos, aulas, questões,
-- matrículas, certificado, dúvida, sessão prática e um modelo do cadastro
-- central descartáveis, para um funcionário que já existe, e simula com
-- `set local role` + `request.jwt.claims` cada usuário da empresa
-- (authenticated). Nada é persistido. Rode o arquivo inteiro, de uma vez.
--
-- A empresa de teste é escolhida em tempo de execução (a do funcionário ativo
-- mais antigo): nenhum UUID fixo neste arquivo. Para testar outra empresa,
-- troque o filtro do passo 1 por `and f.empresa_id = '<empresa_teste>'`.
--
-- Usuários de teste (vínculos sintéticos na empresa de teste):
--   admin     perfil Admin
--   nada      só Segurança do Trabalho → Funcionários → editar (sem a aba nova)
--   ver       Treinamentos EAD → visualizar
--   editar    Treinamentos EAD → editar
--   publicar  Treinamentos EAD → publicar
--   editpub   Treinamentos EAD → editar e publicar
--   matric    Treinamentos EAD → matricular
--   tutor     Treinamentos EAD → responder_duvidas
--   rh        RH → criar e deletar (documentos do portal)
--
-- O que confere:
--   1. tem_permissao: a tabela de casos P01..P22, IGUAL à do
--      supabase/functions/_shared/conector/acesso.test.ts (o teste do Node
--      confere que cada caso está aqui com a mesma resposta);
--   2. curso: criar exige Editar (e Publicar, se nascer publicado); mudar
--      "Publicado" exige Publicar; mudar o resto exige Editar; excluir
--      (deleted_at) exige os dois; UPDATE que não muda nada passa;
--   3. aula e questão exigem Editar;
--   4. leitura: quem não tem a aba não vê questão, tentativa nem evento
--      (curso, matrícula e certificado continuam visíveis);
--   5. matrícula: matricular exige Matricular; tentativas_extras não muda pela
--      API (nem para o Admin); remover com certificado válido é recusado;
--   6. certificado: nenhum UPDATE pela API (nem do Admin);
--   7. dúvida: responder exige Responder dúvidas;
--   8. cadastro central (A1/P4): editar um modelo com curso EAD vinculado exige
--      Editar, desativar exige também Publicar (a mensagem fala do cadastro
--      central); modelo sem curso vinculado segue livre;
--   9. prática presencial (T12) e texto da declaração (T35) exigem Editar;
--  10. Storage: as 3 policies restritivas do bucket treinamentos existem e a
--      expressão delas libera só quem tem Editar (e não atrapalha outro bucket);
--  11. documentos do portal: a escrita COMUM em funcionario continua passando
--      como authenticated (INSERT sem a coluna, com "[]" e com anexo comum;
--      UPDATE com a lista igual, com e sem PDF do portal, e com anexo comum:
--      o trigger zz_documentos_portal roda como authenticated e chama as
--      funções anexos_*, que precisam de EXECUTE para authenticated); as RPC
--      exigem RH → Criar/Deletar, recusam arquivo fora da pasta da empresa, em
--      recibos/, com "..", inexistente ou que não é PDF; o UPDATE só dos itens
--      do portal pela API é recusado; o salvamento do formulário inteiro com a
--      lista velha mantém o PDF; um item forjado junto com outra mudança não
--      entra; INSERT de funcionário com item do portal é recusado.
--
-- Cada recusa confere a MENSAGEM esperada ou, no mínimo, que não foi um
-- "permission denied" nem uma policy de RLS (smoke_t33_recusa): 42501 sozinho
-- aceitaria a recusa pelo motivo errado, como o EXECUTE que faltava.
--
-- Como rodar (precisa da migração 0147 já aplicada; rode LOGO DEPOIS de aplicar
-- a 0147 e antes de liberar o uso, porque termina em ROLLBACK e pega o que a
-- migração quebraria. Se falhar, desfaça pelo bloco "PARA DESFAZER" da 0147):
--   supabase db query --linked -f tools/smoke-permissoes-ead.sql
--   -- ou: psql "$DATABASE_URL" -f tools/smoke-permissoes-ead.sql
-- Deve terminar imprimindo "SMOKE TEST OK" (e a linha da tabela de resultado).
-- ============================================================================

begin;

-- tenta o comando e exige que ele seja RECUSADO com o estado esperado (padrão 42501). Roda com os direitos de quem
-- chama (SECURITY INVOKER): vale o papel ativo no momento. Some no ROLLBACK.
-- O estado sozinho não basta: 42501 também é o "permission denied" de um grant ou EXECUTE que falta e o "new row
-- violates row-level security" de uma policy, e a recusa passaria pelo motivo errado (foi o que escondeu o EXECUTE
-- que faltava nas funções auxiliares do trigger dos documentos, revisão 1 da T33). Por isso:
--   * p_msg (padrão LIKE) exige a mensagem esperada; passe sempre que o motivo importar;
--   * sem p_msg, a recusa por "permission denied" ou por RLS é falha do smoke (quem espera "permission denied" de
--     propósito, como o UPDATE do certificado sem grant, diz isso em p_msg).
create or replace function public.smoke_t33_recusa(
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
create or replace function public.smoke_t33_claims(p_quem text, p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-t33-' || p_quem)::uuid,
    'email', 'smoke.t33.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

do $$
declare
  c_ead constant text := 'Treinamentos EAD';
  v_empresa uuid;
  v_func uuid;
  v_curso uuid;        -- C1: curso de teste (rascunho)
  v_curso2 uuid;       -- C2: outro curso (matrícula sem certificado)
  v_curso3 uuid;       -- C3: criado pelo usuário "editar"
  v_curso4 uuid;       -- C4: para o usuário "matric" matricular
  v_curso_mod uuid;    -- C5: vinculado ao modelo do cadastro central
  v_modelo uuid;       -- modelo com curso vinculado
  v_modelo_livre uuid; -- modelo sem curso vinculado
  v_aula uuid;
  v_questao uuid;
  v_mat uuid;          -- M1 (C1, com certificado válido)
  v_mat2 uuid;         -- M2 (C2, sem certificado)
  v_duvida uuid;
  v_sessao uuid;
  v_novo uuid;         -- funcionário comum criado pelo admin (passo 13)
  v_n bigint;
  v_ok boolean;
  v_msg text;
  v_texto text;
  v_item jsonb;
  v_lista jsonb;
  v_sem_portal jsonb;
  v_forjada jsonb;
  v_ret boolean;
  v_ref_pdf text;
  v_storage boolean := false;
  r record;
  v_pol record;
  v_expr text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if to_regprocedure('public.tem_permissao(text,text,text)') is null then
    raise exception 'Falta a migração 0147 (public.tem_permissao): aplique antes de rodar este smoke.';
  end if;

  -- 1. empresa e funcionário de teste (ativos, só leitura aqui) --------------------------------------------------
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

  -- 2. tem_permissao: a tabela de casos (a mesma do acesso.test.ts) ----------------------------------------------
  -- (id, perfil, dono, ativo, excluído, permissoes, aba, função, esperado); módulo = Segurança do Trabalho
  for r in
    select * from (values
      ('P01_sem_vinculo', null::text, false, true, false, null::jsonb, 'Treinamentos EAD'::text, null::text, false),
      ('P02_vinculo_inativo', 'Gestor', false, false, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb, 'Treinamentos EAD', 'editar', false),
      ('P03_vinculo_ativo_nulo', 'Gestor', false, null, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb, 'Treinamentos EAD', 'editar', false),
      ('P04_vinculo_excluido', 'Gestor', false, true, true, '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb, 'Treinamentos EAD', 'editar', false),
      ('P05_admin', 'Admin', false, true, false, null::jsonb, 'Treinamentos EAD', 'publicar', true),
      ('P06_dono', 'Gestor', true, true, false, '{}'::jsonb, 'Treinamentos EAD', 'publicar', true),
      ('P07_admin_inativo', 'Admin', false, false, false, null::jsonb, 'Treinamentos EAD', 'publicar', false),
      ('P08_aba_true', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":true}}'::jsonb, 'Treinamentos EAD', null, true),
      ('P09_aba_true_com_funcao', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":true}}'::jsonb, 'Treinamentos EAD', 'editar', false),
      ('P10_funcao_true', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb, 'Treinamentos EAD', 'editar', true),
      ('P11_funcao_false', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":false,"visualizar":true}}}'::jsonb, 'Treinamentos EAD', 'editar', false),
      ('P12_qualquer_funcao_da_aba', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"matricular":true}}}'::jsonb, 'Treinamentos EAD', null, true),
      ('P13_aba_sem_funcao_true', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":false}}}'::jsonb, 'Treinamentos EAD', null, false),
      ('P14_aba_false', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":false}}'::jsonb, 'Treinamentos EAD', null, false),
      ('P15_so_modulo', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":{"matricular":true}}}'::jsonb, null, null, true),
      ('P16_so_modulo_aba_true', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Treinamentos EAD":true}}'::jsonb, null, null, false),
      ('P17_outra_aba', 'Gestor', false, true, false, '{"Segurança do Trabalho":{"Funcionários":{"editar":true}}}'::jsonb, 'Treinamentos EAD', 'editar', false),
      ('P18_texto_json', 'Gestor', false, true, false, to_jsonb('{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::text), 'Treinamentos EAD', 'editar', true),
      ('P19_texto_json_duas_vezes', 'Gestor', false, true, false, to_jsonb(to_jsonb('{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::text)::text), 'Treinamentos EAD', 'editar', true),
      ('P20_json_invalido', 'Gestor', false, true, false, to_jsonb('não é json'::text), 'Treinamentos EAD', 'editar', false),
      ('P21_lista_no_lugar_do_objeto', 'Gestor', false, true, false, '[]'::jsonb, 'Treinamentos EAD', null, false),
      ('P22_permissoes_nulas', 'Gestor', false, true, false, null::jsonb, 'Treinamentos EAD', null, false)
    ) as c(id, perfil, dono, ativo, excluido, permissoes, aba, funcao, esperado)
  loop
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if r.perfil is not null then
      insert into public.usuario_empresa
        (empresa_id, usuario_email, perfil, is_owner, ativo, deleted_at, permissoes, nome_completo)
        values (v_empresa, 'smoke.t33.' || lower(r.id) || '@exemplo.test', r.perfil, r.dono, r.ativo,
                case when r.excluido then now() end, r.permissoes, 'Smoke T33');
    end if;
    perform set_config('request.jwt.claims', public.smoke_t33_claims(lower(r.id), v_empresa), true);
    set local role authenticated;
    v_ok := public.tem_permissao('Segurança do Trabalho', r.aba, r.funcao);
    reset role;
    if v_ok is distinct from r.esperado then
      raise exception 'FALHOU %: tem_permissao deu % e devia dar %', r.id, v_ok, r.esperado;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[tem_permissao] OK os 22 casos dão o mesmo que o acesso.test.ts';

  -- 3. usuários de teste e massa (como servidor: sem token) -----------------------------------------------------
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    select v_empresa, 'smoke.t33.' || u.quem || '@exemplo.test', u.perfil, true, u.permissoes, 'Smoke T33'
      from (values
        ('admin', 'Admin', null::jsonb),
        ('nada', 'Gestor', '{"Segurança do Trabalho":{"Funcionários":{"visualizar":true,"editar":true}}}'::jsonb),
        ('ver', 'Gestor', '{"Segurança do Trabalho":{"Treinamentos EAD":{"visualizar":true}}}'::jsonb),
        ('editar', 'Gestor', '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true}}}'::jsonb),
        ('publicar', 'Gestor', '{"Segurança do Trabalho":{"Treinamentos EAD":{"publicar":true}}}'::jsonb),
        ('editpub', 'Gestor', '{"Segurança do Trabalho":{"Treinamentos EAD":{"editar":true,"publicar":true}}}'::jsonb),
        ('matric', 'Gestor', '{"Segurança do Trabalho":{"Treinamentos EAD":{"matricular":true}}}'::jsonb),
        ('tutor', 'Gestor', '{"Segurança do Trabalho":{"Treinamentos EAD":{"responder_duvidas":true}}}'::jsonb),
        ('rh', 'Gestor', '{"Segurança do Trabalho":{"RH":{"criar":true,"deletar":true}}}'::jsonb)
      ) as u(quem, perfil, permissoes);

  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE T33 curso 1', false) returning id into v_curso;
  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE T33 curso 2', false) returning id into v_curso2;
  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE T33 curso 4', false) returning id into v_curso4;
  insert into public.treinamento_aula (empresa_id, curso_id, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 'SMOKE aula', 'texto', 'SMOKE texto', 60) returning id into v_aula;
  insert into public.treinamento_questao (empresa_id, curso_id, pergunta, opcoes, correta)
    values (v_empresa, v_curso, 'SMOKE pergunta?', '["a","b"]'::jsonb, 1) returning id into v_questao;
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso, v_func) returning id into v_mat;
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso2, v_func) returning id into v_mat2;
  insert into public.treinamento_tentativa
    (empresa_id, matricula_id, curso_id, funcionario_id, numero, prova, respostas, acertos, total, nota, aprovada)
    values (v_empresa, v_mat, v_curso, v_func, 1, '[]'::jsonb, '[]'::jsonb, 0, 1, 0, false);
  insert into public.treinamento_evento (empresa_id, funcionario_id, matricula_id, curso_id, evento)
    values (v_empresa, v_func, v_mat, v_curso, 'login');
  insert into public.treinamento_certificado
    (empresa_id, matricula_id, curso_id, funcionario_id, codigo, hash_sha256, dados, assinatura_aluno)
    values (v_empresa, v_mat, v_curso, v_func,
            'SMK-' || substr(md5(random()::text), 1, 8), 'smoke', '{}'::jsonb, '{}'::jsonb);
  insert into public.treinamento_duvida (empresa_id, curso_id, funcionario_id, matricula_id, pergunta)
    values (v_empresa, v_curso, v_func, v_mat, 'SMOKE dúvida?') returning id into v_duvida;
  insert into public.treinamento (empresa_id, nome, carga_horaria, validade_meses, ativo)
    values (v_empresa, 'SMOKE T33 modelo', 8, 12, true) returning id into v_modelo;
  insert into public.treinamento (empresa_id, nome, carga_horaria, validade_meses, ativo)
    values (v_empresa, 'SMOKE T33 modelo livre', 4, 12, true) returning id into v_modelo_livre;
  -- publicado: desativar o modelo despublica o curso, e é isso que exige Publicar
  insert into public.treinamento_curso (empresa_id, nome, ativo, modelo_treinamento_id)
    values (v_empresa, 'x', true, v_modelo) returning id into v_curso_mod;
  raise notice '[massa de teste] OK';

  -- 4. curso ----------------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', public.smoke_t33_claims('ver', v_empresa), true);
  set local role authenticated;
  v_msg := public.smoke_t33_recusa(format(
    'update public.treinamento_curso set nome = %L where id = %L', 'SMOKE mudou', v_curso));
  if v_msg not like 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → Editar%' then
    raise exception 'FALHOU: a mensagem deveria citar a permissão (veio: %)', v_msg;
  end if;
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_curso (empresa_id, nome, ativo) values (%L, %L, false)', v_empresa, 'SMOKE x'));
  -- UPDATE que não muda nada (o SDK manda a linha inteira) passa
  update public.treinamento_curso set nome = nome where id = v_curso;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'FALHOU: UPDATE sem mudança deveria passar para quem só vê (linhas=%)', v_n;
  end if;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('nada', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_curso (empresa_id, nome, ativo) values (%L, %L, false)', v_empresa, 'SMOKE x'));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editar', v_empresa), true);
  set local role authenticated;
  insert into public.treinamento_curso (empresa_id, nome, ativo)
    values (v_empresa, 'SMOKE T33 curso 3', false) returning id into v_curso3;
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_curso (empresa_id, nome, ativo) values (%L, %L, true)', v_empresa, 'SMOKE x'));
  update public.treinamento_curso set nome = 'SMOKE T33 curso 1 editado', nota_minima = 80 where id = v_curso;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_curso set ativo = true where id = %L', v_curso));
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_curso set deleted_at = now() where id = %L', v_curso3));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('publicar', v_empresa), true);
  set local role authenticated;
  update public.treinamento_curso set ativo = true where id = v_curso2;
  update public.treinamento_curso set ativo = false where id = v_curso2;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_curso set nome = %L where id = %L', 'SMOKE mudou', v_curso2));
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_curso set nome = %L, ativo = true where id = %L', 'SMOKE mudou', v_curso2));
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_curso set deleted_at = now() where id = %L', v_curso3));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editpub', v_empresa), true);
  set local role authenticated;
  update public.treinamento_curso set deleted_at = now() where id = v_curso3;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'FALHOU: Editar + Publicar deveria excluir o curso (linhas=%)', v_n;
  end if;
  raise notice '[curso] OK criar/alterar = Editar, Publicado = Publicar, excluir = os dois; sem mudança passa';

  -- 5. aula e questão -------------------------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editar', v_empresa), true);
  set local role authenticated;
  insert into public.treinamento_aula (empresa_id, curso_id, titulo, tipo, conteudo_texto, duracao_seg)
    values (v_empresa, v_curso, 'SMOKE aula 2', 'texto', 'SMOKE texto 2', 60);
  insert into public.treinamento_questao (empresa_id, curso_id, pergunta, opcoes, correta)
    values (v_empresa, v_curso, 'SMOKE pergunta 2?', '["a","b"]'::jsonb, 0);
  update public.treinamento_questao set correta = 0 where id = v_questao;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_aula set titulo = %L where id = %L', 'SMOKE mudou', v_aula));
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_questao set correta = 1 where id = %L', v_questao));
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_questao (empresa_id, curso_id, pergunta, opcoes, correta) values (%L, %L, %L, %L::jsonb, 0)',
    v_empresa, v_curso, 'SMOKE x?', '["a","b"]'));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('matric', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_aula (empresa_id, curso_id, titulo, tipo) values (%L, %L, %L, %L)',
    v_empresa, v_curso, 'SMOKE x', 'texto'));
  raise notice '[aula e questão] OK só com Editar (inclusive o gabarito)';

  -- 6. leitura do gabarito, das tentativas e da trilha (P5) -----------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('nada', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_questao where curso_id = v_curso;
  if v_n <> 0 then raise exception 'FALHOU: quem não tem a aba leu % questão(ões)', v_n; end if;
  select count(*) into v_n from public.treinamento_tentativa where matricula_id = v_mat;
  if v_n <> 0 then raise exception 'FALHOU: quem não tem a aba leu % tentativa(s)', v_n; end if;
  select count(*) into v_n from public.treinamento_evento where matricula_id = v_mat;
  if v_n <> 0 then raise exception 'FALHOU: quem não tem a aba leu % evento(s) da trilha', v_n; end if;
  select count(*) into v_n from public.treinamento_curso where id = v_curso;
  if v_n <> 1 then raise exception 'FALHOU: o curso deveria seguir visível à empresa (%)', v_n; end if;
  select count(*) into v_n from public.treinamento_matricula where id = v_mat;
  if v_n <> 1 then raise exception 'FALHOU: a matrícula deveria seguir visível à empresa (%)', v_n; end if;
  select count(*) into v_n from public.treinamento_certificado where matricula_id = v_mat;
  if v_n <> 1 then raise exception 'FALHOU: o certificado deveria seguir visível à empresa (%)', v_n; end if;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('ver', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.treinamento_questao where curso_id = v_curso;
  if v_n < 1 then raise exception 'FALHOU: quem tem a aba deveria ler as questões'; end if;
  select count(*) into v_n from public.treinamento_tentativa where matricula_id = v_mat;
  if v_n <> 1 then raise exception 'FALHOU: quem tem a aba deveria ler a tentativa (%)', v_n; end if;
  select count(*) into v_n from public.treinamento_evento where matricula_id = v_mat;
  if v_n <> 1 then raise exception 'FALHOU: quem tem a aba deveria ler a trilha (%)', v_n; end if;
  raise notice '[leitura] OK questão, tentativa e trilha só para quem tem a aba; curso, matrícula e certificado abertos';

  -- 7. matrícula --------------------------------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editar', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id) values (%L, %L, %L)',
    v_empresa, v_curso4, v_func));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('matric', v_empresa), true);
  set local role authenticated;
  insert into public.treinamento_matricula (empresa_id, curso_id, funcionario_id)
    values (v_empresa, v_curso4, v_func);
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_matricula set tentativas_extras = tentativas_extras + 1 where id = %L', v_mat2),
    '42501', 'Acesso negado: andamento e conclusão%');
  v_msg := public.smoke_t33_recusa(format(
    'update public.treinamento_matricula set deleted_at = now() where id = %L', v_mat));
  if v_msg not like 'Esta matrícula tem certificado emitido e ainda válido%' then
    raise exception 'FALHOU: remover com certificado válido deveria explicar o motivo (veio: %)', v_msg;
  end if;
  update public.treinamento_matricula set deleted_at = now() where id = v_mat2;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALHOU: remover matrícula sem certificado deveria passar (linhas=%)', v_n; end if;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('admin', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_matricula set tentativas_extras = 1 where id = %L', v_mat),
    '42501', 'Acesso negado: andamento e conclusão%');
  raise notice '[matrícula] OK matricular = Matricular; tentativa extra só pelo servidor; certificado válido trava a remoção';

  -- 8. certificado: nem o Admin revoga pela API -------------------------------------------------------------------
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_certificado set revogado_em = now(), revogado_por = %L, motivo_revogacao = %L where matricula_id = %L',
    'smoke', 'smoke motivo', v_mat),
    -- aqui o motivo É o grant: o revoke update tira o UPDATE da API antes do trigger (que fica de segunda barreira)
    '42501', 'permission denied for table treinamento_certificado%');
  raise notice '[certificado] OK sem UPDATE pela API (a revogação é do funcionario-acesso)';

  -- 9. dúvida ---------------------------------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_duvida set resposta = %L, respondida_por = %L, respondida_em = now() where id = %L',
    'SMOKE resposta', 'smoke', v_duvida));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('tutor', v_empresa), true);
  set local role authenticated;
  update public.treinamento_duvida
     set resposta = 'SMOKE resposta', respondida_por = 'smoke', respondida_em = now()
   where id = v_duvida;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALHOU: o tutor deveria responder (linhas=%)', v_n; end if;
  raise notice '[dúvida] OK responder só com Responder dúvidas';

  -- 10. cadastro central com curso EAD vinculado (A1, P4) ---------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('nada', v_empresa), true);
  set local role authenticated;
  v_msg := public.smoke_t33_recusa(format(
    'update public.treinamento set nome = %L where id = %L', 'SMOKE T33 modelo 2', v_modelo));
  if v_msg not like 'Este treinamento do cadastro central tem curso EAD vinculado%' then
    raise exception 'FALHOU: a recusa da propagação deveria explicar o cadastro central (veio: %)', v_msg;
  end if;
  update public.treinamento set nome = 'SMOKE T33 modelo livre 2' where id = v_modelo_livre;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALHOU: modelo sem curso vinculado deveria seguir livre (linhas=%)', v_n; end if;

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editar', v_empresa), true);
  set local role authenticated;
  update public.treinamento set nome = 'SMOKE T33 modelo 2' where id = v_modelo;
  select nome into v_texto from public.treinamento_curso where id = v_curso_mod;
  if v_texto is distinct from 'SMOKE T33 modelo 2' then
    raise exception 'FALHOU: o curso vinculado deveria receber o nome novo (veio %)', v_texto;
  end if;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento set ativo = false where id = %L', v_modelo));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editpub', v_empresa), true);
  set local role authenticated;
  update public.treinamento set ativo = false where id = v_modelo;
  select count(*) into v_n from public.treinamento_curso where id = v_curso_mod and ativo = false;
  if v_n <> 1 then raise exception 'FALHOU: desativar o modelo deveria despublicar o curso vinculado'; end if;
  raise notice '[cadastro central] OK editar o modelo vinculado = Editar; desativar = Editar + Publicar';

  -- 11. prática presencial (T12) e texto da declaração (T35) -----------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_sessao_pratica (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome) values (%L, %L, %L, %L, %L, 1, %L, %L)',
    v_empresa, v_curso, v_hoje, '08:00', '09:00', 'SMOKE local', 'SMOKE instrutor'));
  perform public.smoke_t33_recusa(format(
    'insert into public.treinamento_declaracao_texto (empresa_id, texto) values (%L, %L)',
    v_empresa, 'SMOKE T33 orientação do RT para o aluno.'));

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('editar', v_empresa), true);
  set local role authenticated;
  insert into public.treinamento_sessao_pratica
    (empresa_id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome)
    values (v_empresa, v_curso, v_hoje, '08:00', '09:00', 1, 'SMOKE local', 'SMOKE instrutor')
    returning id into v_sessao;
  insert into public.treinamento_pratica_participante (empresa_id, sessao_id, matricula_id, funcionario_id)
    values (v_empresa, v_sessao, v_mat, v_func);
  insert into public.treinamento_declaracao_texto (empresa_id, texto)
    values (v_empresa, 'SMOKE T33 orientação do RT para o aluno.');

  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('matric', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'update public.treinamento_pratica_participante set presente = true where sessao_id = %L', v_sessao));
  raise notice '[prática e declaração] OK sessão, presença e texto do RT só com Editar';

  -- 12. Storage: as policies restritivas do bucket treinamentos --------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
     and policyname in ('treinamentos_insert_com_permissao', 'treinamentos_update_com_permissao',
                        'treinamentos_delete_com_permissao')
     and roles = '{authenticated}';
  if v_n <> 3 then raise exception 'FALHOU: as 3 policies restritivas do Storage deveriam existir (%)', v_n; end if;
  -- a expressão gravada de cada policy, com bucket_id trocado pelo bucket de teste, avaliada como cada usuário
  for v_pol in
    select policyname, coalesce(with_check, qual) as expr
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'treinamentos\_%\_com\_permissao'
  loop
    for r in
      select * from (values
        ('editar', 'treinamentos', true),
        ('ver', 'treinamentos', false),
        ('nada', 'treinamentos', false),
        ('ver', 'contratacao', true)
      ) as t(quem, bucket, esperado)
    loop
      v_expr := regexp_replace(v_pol.expr, '\mbucket_id\M', quote_literal(r.bucket) || '::text', 'g');
      perform set_config('request.jwt.claims', public.smoke_t33_claims(r.quem, v_empresa), true);
      set local role authenticated;
      execute 'select (' || v_expr || ')' into v_ok;
      reset role;
      if v_ok is distinct from r.esperado then
        raise exception 'FALHOU: policy % para % no bucket % deu % (esperado %)',
          v_pol.policyname, r.quem, r.bucket, v_ok, r.esperado;
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[Storage] OK enviar, trocar e apagar arquivo de aula só com Editar; outros buckets não mudam';

  -- 13. documentos do portal (B2) ---------------------------------------------------------------------------------
  -- 13.0 a escrita COMUM em funcionario continua passando (regressão da revisão 1 da T33). O trigger
  -- zz_documentos_portal NÃO é SECURITY DEFINER (R7) e roda como authenticated em todo INSERT de funcionário e em todo
  -- UPDATE que leva documentos_rh_anexos; ele chama anexos_como_lista e anexos_do_portal, que por isso precisam de
  -- EXECUTE para authenticated. Sem o grant, cadastro, contratação, importação e a Edição completa do RH caíam com
  -- "permission denied for function". anon continua sem acesso.
  if not has_function_privilege('authenticated', 'public.anexos_como_lista(jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.anexos_do_portal(jsonb, boolean)', 'execute') then
    raise exception 'FALHOU: authenticated não executa anexos_como_lista/anexos_do_portal, que o trigger zz_documentos_portal chama como authenticated (falta o grant da 0147)';
  end if;
  if has_function_privilege('anon', 'public.anexos_como_lista(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.anexos_do_portal(jsonb, boolean)', 'execute') then
    raise exception 'FALHOU: anon não deveria executar anexos_como_lista/anexos_do_portal';
  end if;

  perform set_config('request.jwt.claims', public.smoke_t33_claims('admin', v_empresa), true);
  set local role authenticated;
  begin
    -- o cadastro (SegurancaTrabalho) manda a linha sem a coluna; a importação manda o texto "[]"; a contratação, anexos
    insert into public.funcionario (empresa_id, nome_completo, cpf)
      values (v_empresa, 'SMOKE T33 funcionário comum', '00000000001')
      returning id into v_novo;
    insert into public.funcionario (empresa_id, nome_completo, cpf, documentos_rh_anexos)
      values (v_empresa, 'SMOKE T33 funcionário importado', '00000000002', '"[]"'::jsonb);
    insert into public.funcionario (empresa_id, nome_completo, cpf, documentos_rh_anexos)
      values (v_empresa, 'SMOKE T33 funcionário contratado', '00000000003',
              '[{"id":"smoke-t33-comum","nome_arquivo":"a.pdf","url":"contratacao/x/a.pdf"}]'::jsonb);
    -- a Edição completa manda a linha inteira: a lista igual, junto com outra coluna
    update public.funcionario
       set observacoes = 'SMOKE T33', documentos_rh_anexos = documentos_rh_anexos
     where id = v_novo;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'o UPDATE com a lista igual não achou o funcionário (linhas=%)', v_n; end if;
    -- anexo comum novo (o que não é do portal muda à vontade)
    update public.funcionario
       set documentos_rh_anexos = '[{"id":"smoke-t33-comum-2","nome_arquivo":"b.pdf","url":"contratacao/x/b.pdf"}]'::jsonb
     where id = v_novo;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'o UPDATE do anexo comum não achou o funcionário (linhas=%)', v_n; end if;
  exception when others then
    raise exception 'FALHOU: a escrita comum em funcionario (INSERT sem a coluna, com "[]", com anexo comum; UPDATE com a lista igual e com anexo comum) deveria passar como authenticated, e veio % (%)',
      sqlerrm, sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[funcionário] OK INSERT e UPDATE comuns passam (o trigger dos documentos roda como authenticated)';

  -- (aqui, como dono do banco, antes de trocar de papel: as funções auxiliares anexos_* também funcionam)
  if public.anexos_como_lista((select documentos_rh_anexos from public.funcionario where id = v_func)) is null then
    raise exception 'O funcionário de teste tem documentos_rh_anexos ilegível: escolha outro (passo 1).';
  end if;
  -- um item do portal gravado pelo servidor (o caminho que a RPC usa), para testar o trigger sem depender do Storage
  update public.funcionario
     set documentos_rh_anexos = public.anexos_como_lista(documentos_rh_anexos) || jsonb_build_array(jsonb_build_object(
       'id', 'smoke-t33-doc', 'origem', 'portal_funcionario', 'funcionario_id', v_func::text, 'publicado', true,
       'tipo', 'documentacao', 'competencia', null, 'nome_arquivo', 'smoke.pdf',
       'url', 'contratacao/' || v_empresa || '/smoke-t33/smoke.pdf', 'data_upload', '2026-10-07T12:00:00.000Z'))
   where id = v_func;

  -- o PDF no Storage (para o publicar de verdade): se o Storage não aceitar o INSERT direto, essa parte fica para o
  -- roteiro manual e o resto do passo segue
  v_ref_pdf := 'contratacao/' || v_empresa || '/smoke-t33/' || gen_random_uuid() || '-doc.pdf';
  begin
    insert into storage.objects (bucket_id, name, metadata)
      values ('contratacao', substr(v_ref_pdf, char_length('contratacao/') + 1), '{"mimetype":"application/pdf"}'::jsonb);
    insert into storage.objects (bucket_id, name, metadata)
      values ('contratacao', v_empresa || '/smoke-t33/nao-pdf.png', '{"mimetype":"image/png"}'::jsonb);
    v_storage := true;
  exception when others then
    raise notice '[documentos] o Storage não aceitou o objeto de teste (% %): o publicar com PDF real fica para o roteiro manual',
      sqlstate, sqlerrm;
  end;

  -- sem RH → Criar/Deletar: as RPC recusam antes de ler qualquer coisa
  perform set_config('request.jwt.claims', public.smoke_t33_claims('ver', v_empresa), true);
  set local role authenticated;
  perform public.smoke_t33_recusa(format(
    'select public.portal_documento_publicar(%L, %L, null, %L, %L)', v_func, 'documentacao', v_ref_pdf, 'doc.pdf'),
    '42501', 'Sem permissão: Segurança do Trabalho → RH → Criar%');
  perform public.smoke_t33_recusa(format(
    'select public.portal_documento_retirar(%L, %L)', v_func, 'smoke-t33-doc'),
    '42501', 'Sem permissão: Segurança do Trabalho → RH → Deletar%');

  -- com RH: arquivo fora da regra é recusado (22023)
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('rh', v_empresa), true);
  set local role authenticated;
  foreach v_texto in array array[
    'contratacao/' || gen_random_uuid() || '/x/doc.pdf',                 -- pasta de outra empresa
    'contratacao/' || v_empresa || '/recibos/doc.pdf',                   -- recibos/
    'contratacao/' || v_empresa || '/../' || gen_random_uuid() || '/doc.pdf',
    'contratacao/' || v_empresa || '//doc.pdf',
    'treinamentos/' || v_empresa || '/doc.pdf',                          -- outro bucket
    'contratacao/' || v_empresa || '/smoke-t33/nao-existe.pdf',          -- não existe
    'contratacao/' || v_empresa || '/smoke-t33/nao-pdf.png'              -- não é PDF
  ] loop
    perform public.smoke_t33_recusa(format(
      'select public.portal_documento_publicar(%L, %L, null, %L, %L)', v_func, 'documentacao', v_texto, 'doc.pdf'),
      '22023');
  end loop;
  perform public.smoke_t33_recusa(format(
    'select public.portal_documento_publicar(%L, %L, null, %L, %L)', v_func, 'outro', v_ref_pdf, 'doc.pdf'), '22023');
  perform public.smoke_t33_recusa(format(
    'select public.portal_documento_publicar(%L, %L, %L, %L, %L)', v_func, 'contracheque', '2026-13', v_ref_pdf,
    'doc.pdf'), '22023');
  perform public.smoke_t33_recusa(format(
    'select public.portal_documento_publicar(%L, %L, null, %L, %L)', gen_random_uuid(), 'documentacao', v_ref_pdf,
    'doc.pdf'), 'P0002');

  if v_storage then
    v_item := public.portal_documento_publicar(v_func, 'contracheque', '2026-09', v_ref_pdf, '  contracheque.pdf ');
    if v_item ->> 'origem' <> 'portal_funcionario' or v_item ->> 'publicado_por' <> 'smoke.t33.rh@exemplo.test'
       or v_item ->> 'competencia' <> '2026-09' or v_item ->> 'nome_arquivo' <> 'contracheque.pdf'
       or v_item ->> 'funcionario_id' <> v_func::text then
      raise exception 'FALHOU: o item publicado veio diferente do esperado: %', v_item;
    end if;
    reset role;
    select documentos_rh_anexos into v_lista from public.funcionario where id = v_func;
    if not exists (
      select 1 from jsonb_array_elements(public.anexos_como_lista(v_lista)) e where e.value ->> 'id' = v_item ->> 'id'
    ) then
      raise exception 'FALHOU: o PDF publicado pela RPC não está na lista do funcionário';
    end if;
    perform set_config('request.jwt.claims', public.smoke_t33_claims('rh', v_empresa), true);
    set local role authenticated;
    v_ret := public.portal_documento_retirar(v_func, v_item ->> 'id');
    if v_ret is not true then raise exception 'FALHOU: retirar o PDF publicado deveria dar true'; end if;
    raise notice '[documentos] OK publicar (item montado pelo banco, com quem publicou) e retirar pela RPC';
  end if;

  -- a Edição completa de quem tem PDF publicado: a linha inteira com a lista IGUAL (portal inclusive) passa e o PDF fica
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select documentos_rh_anexos into v_lista from public.funcionario where id = v_func;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('admin', v_empresa), true);
  set local role authenticated;
  begin
    update public.funcionario
       set observacoes = coalesce(observacoes, '') || ' ', documentos_rh_anexos = v_lista
     where id = v_func;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'o UPDATE com a lista igual não achou o funcionário (linhas=%)', v_n; end if;
  exception when others then
    raise exception 'FALHOU: o UPDATE com a lista igual (o PDF do portal incluído) deveria passar como authenticated, e veio % (%)',
      sqlerrm, sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select documentos_rh_anexos into v_lista from public.funcionario where id = v_func;
  if not exists (
    select 1 from jsonb_array_elements(public.anexos_como_lista(v_lista)) e where e.value ->> 'id' = 'smoke-t33-doc'
  ) then
    raise exception 'FALHOU: o UPDATE com a lista igual tirou o PDF publicado';
  end if;

  -- a chamada direta à API que mexe SÓ nos itens do portal é recusada (nem o Admin publica por fora)
  select documentos_rh_anexos into v_lista from public.funcionario where id = v_func;
  v_sem_portal := public.anexos_do_portal(v_lista, false);   -- a lista "velha", sem o PDF publicado
  v_forjada := public.anexos_como_lista(v_lista) || jsonb_build_array(jsonb_build_object(
    'id', 'smoke-t33-forjado', 'origem', 'portal_funcionario', 'funcionario_id', v_func::text,
    'publicado', true, 'tipo', 'documentacao', 'nome_arquivo', 'x.pdf',
    'url', 'contratacao/' || v_empresa || '/qualquer.pdf'));
  perform set_config('request.jwt.claims', public.smoke_t33_claims('admin', v_empresa), true);
  set local role authenticated;
  v_msg := public.smoke_t33_recusa(format(
    'update public.funcionario set documentos_rh_anexos = %L::jsonb where id = %L', v_sem_portal, v_func));
  if v_msg not like 'Publique ou retire o PDF pelo cartão%' then
    raise exception 'FALHOU: a recusa deveria mandar usar o cartão (veio: %)', v_msg;
  end if;

  -- o salvamento do formulário inteiro com a lista VELHA (sem o PDF) muda outra coluna e mantém o PDF
  update public.funcionario
     set observacoes = coalesce(observacoes, '') || ' ',
         documentos_rh_anexos = v_sem_portal
   where id = v_func;
  reset role;
  select documentos_rh_anexos into v_lista from public.funcionario where id = v_func;
  if not exists (
    select 1 from jsonb_array_elements(public.anexos_como_lista(v_lista)) e where e.value ->> 'id' = 'smoke-t33-doc'
  ) then
    raise exception 'FALHOU: o salvamento com a lista velha apagou o PDF publicado';
  end if;

  -- um item forjado junto com outra mudança não entra (os itens do portal são os do banco)
  perform set_config('request.jwt.claims', public.smoke_t33_claims('admin', v_empresa), true);
  set local role authenticated;
  update public.funcionario
     set observacoes = coalesce(observacoes, '') || ' ',
         documentos_rh_anexos = v_forjada
   where id = v_func;
  reset role;
  select documentos_rh_anexos into v_lista from public.funcionario where id = v_func;
  if exists (
    select 1 from jsonb_array_elements(public.anexos_como_lista(v_lista)) e
     where e.value ->> 'id' = 'smoke-t33-forjado'
  ) then
    raise exception 'FALHOU: um item do portal forjado pela API entrou na lista';
  end if;

  -- INSERT de funcionário já com item do portal: recusado
  perform set_config('request.jwt.claims', public.smoke_t33_claims('admin', v_empresa), true);
  set local role authenticated;
  -- (a mensagem é a do trigger: "permission denied" aqui seria o grant que falta, não a regra)
  perform public.smoke_t33_recusa(format(
    'insert into public.funcionario (empresa_id, nome_completo, cpf, documentos_rh_anexos) values (%L, %L, %L, %L::jsonb)',
    v_empresa, 'SMOKE T33 funcionário', '00000000000',
    jsonb_build_array(jsonb_build_object('id', 'x', 'origem', 'portal_funcionario', 'publicado', true))),
    '42501', 'Publique o PDF pelo cartão%');

  -- retirar pela RPC: some da lista; de novo, não acha (false)
  reset role;
  perform set_config('request.jwt.claims', public.smoke_t33_claims('rh', v_empresa), true);
  set local role authenticated;
  v_ret := public.portal_documento_retirar(v_func, 'smoke-t33-doc');
  if v_ret is not true then raise exception 'FALHOU: retirar deveria dar true'; end if;
  v_ret := public.portal_documento_retirar(v_func, 'smoke-t33-doc');
  if v_ret is not false then raise exception 'FALHOU: retirar de novo deveria dar false'; end if;
  raise notice '[documentos] OK só pelas RPC; o formulário com a lista velha não apaga o PDF; item forjado não entra';

  reset role;
  perform set_config('request.jwt.claims', '', true);

  raise notice '============ SMOKE TEST OK (permissões do EAD e documentos do portal, 0147) ============';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro (em psql sem ON_ERROR_STOP,
-- a transação abortada recusa este select e a linha não aparece)
select 'SMOKE TEST OK: permissões do EAD e documentos do portal (0147)' as res;

rollback;
