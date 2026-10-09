-- ============================================================================
-- smoke-conector-envio.sql — valida a 0149 (link de envio e texto do edital do
-- conector do Claude)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria, nas duas
-- empresas mais antigas da base (A e B), oportunidades, um atestado, um arquivo,
-- uma autorização do conector, links e páginas de texto sintéticos, e confere:
--   1. mcp_link_envio: o alvo tem de ser da mesma empresa (trigger da 0118) e o
--      CHECK do alvo; authenticated não lê a tabela;
--   2. arquivo_texto_pagina: índice único por (arquivo, página); a RLS como
--      authenticated da empresa B (não vê, não grava com a empresa A, não aponta
--      para o arquivo da A); a empresa A grava, lê e "apaga" (deleted_at), mas
--      não apaga de verdade;
--   3. edital_analise_mesclar preserva "arquivos", grava edital_analisado_em,
--      recusa chave fora da lista e não mexe na oportunidade de outra empresa;
--   4. edital_analise_anexar_arquivos não duplica;
--   5. conector_texto_disponivel conta as páginas só da empresa pedida;
--   6. sem_acento('Joanópolis') = 'joanopolis', também como authenticated;
--   7. authenticated não executa as funções só do servidor.
-- Nenhum UUID fixo: as empresas, o usuário e os registros são escolhidos ou
-- criados em tempo de execução.
--
-- Como rodar (com a 0149 já aplicada; quem roda é o Javerson):
--   supabase db query --linked -f tools/smoke-conector-envio.sql
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

-- token simulado de um usuário da empresa (e-mail sintético)
create or replace function public.smoke_conector_claims(p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-conector-' || p_empresa::text)::uuid,
    'email', 'smoke.conector@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

do $$
declare
  v_a uuid;
  v_b uuid;
  v_uc uuid;
  v_email text;
  v_aut uuid;
  v_op_a uuid;
  v_op_b uuid;
  v_at_a uuid;
  v_arq_a uuid;
  v_n int;
  v_ok boolean;
  v_txt text;
  v_analise jsonb;
begin
  select id into v_a from public.empresa where deleted_at is null order by created_at limit 1;
  select id into v_b from public.empresa where deleted_at is null and id <> v_a order by created_at limit 1;
  select id, lower(email) into v_uc, v_email from public.usuario_custom where deleted_at is null order by created_at limit 1;
  if v_a is null or v_b is null or v_uc is null then
    raise exception 'Preciso de duas empresas e um usuário para testar.';
  end if;
  raise notice '== empresa A: %, empresa B: %', v_a, v_b;

  insert into public.oportunidade (empresa_id, nome) values (v_a, 'SMOKE conector A') returning id into v_op_a;
  insert into public.oportunidade (empresa_id, nome) values (v_b, 'SMOKE conector B') returning id into v_op_b;
  insert into public.acervo_atestado (empresa_id, tipo, objeto) values (v_a, 'cat', 'SMOKE conector') returning id into v_at_a;
  insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, tipo, categoria)
  values (v_a, v_op_a, 'Edital.pdf', 'anexos-oportunidade/' || v_a || '/2026/10/smoke-Edital.pdf', 'application/pdf', 'edital')
  returning id into v_arq_a;
  insert into public.conector_autorizacao (empresa_id, usuario_custom_id, usuario_email, tipo, resource)
  values (v_a, v_uc, v_email, 'manual', 'https://smoke.test/functions/v1/mcp')
  returning id into v_aut;

  -- 1. link de envio
  perform public.smoke_conector_recusa(format(
    $q$insert into public.mcp_link_envio (empresa_id, autorizacao_id, usuario_custom_id, alvo, oportunidade_id, bucket, arquivos, expira_em)
       values (%L, %L, %L, 'oportunidade', %L, 'anexos-oportunidade', '[]', now() + interval '2 hours')$q$,
    v_a, v_aut, v_uc, v_op_b), 'Acesso negado: oportunidade_id aponta para registro de outra empresa');
  perform public.smoke_conector_recusa(format(
    $q$insert into public.mcp_link_envio (empresa_id, autorizacao_id, usuario_custom_id, alvo, oportunidade_id, atestado_id, bucket, arquivos, expira_em)
       values (%L, %L, %L, 'atestado', %L, %L, 'certificados', '[]', now() + interval '2 hours')$q$,
    v_a, v_aut, v_uc, v_op_a, v_at_a), '%mcp_link_envio_check%', '23514');
  insert into public.mcp_link_envio (empresa_id, autorizacao_id, usuario_custom_id, alvo, atestado_id, bucket, arquivos, expira_em)
  values (v_a, v_aut, v_uc, 'atestado', v_at_a, 'certificados', '[]', now() + interval '2 hours');
  raise notice '[1] mcp_link_envio: referência e CHECK do alvo ok';

  -- 2. texto por página
  insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto)
  values (v_a, v_arq_a, 1, 'Edital de Joanópolis — página 1');
  perform public.smoke_conector_recusa(format(
    $q$insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto) values (%L, %L, 1, 'dup')$q$,
    v_a, v_arq_a), '%arquivo_texto_pagina_arquivo_pagina_uidx%', '23505');

  perform set_config('request.jwt.claims', public.smoke_conector_claims(v_b), true);
  set local role authenticated;
  select count(*) into v_n from public.arquivo_texto_pagina where arquivo_id = v_arq_a;
  if v_n <> 0 then raise exception 'FALHOU: a empresa B leu o texto da A'; end if;
  -- com a empresa da A ou com a própria, a B não grava texto no arquivo da A (o trigger BEFORE da 0118 recusa
  -- antes do WITH CHECK da RLS, porque para a B o arquivo da A não existe)
  perform public.smoke_conector_recusa(format(
    $q$insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto) values (%L, %L, 2, 'x')$q$,
    v_a, v_arq_a), 'Acesso negado: arquivo_id aponta para registro de outra empresa');
  perform public.smoke_conector_recusa(format(
    $q$insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto) values (%L, %L, 2, 'x')$q$,
    v_b, v_arq_a), 'Acesso negado: arquivo_id aponta para registro de outra empresa');
  perform public.smoke_conector_recusa('select count(*) from public.mcp_link_envio',
    'permission denied for table mcp_link_envio');
  if public.sem_acento('Joanópolis') <> 'joanopolis' then
    raise exception 'FALHOU: sem_acento como authenticated';
  end if;
  perform public.smoke_conector_recusa(format(
    'select public.edital_analise_mesclar(%L, %L, %L)', v_b, v_op_b, '{"atende":null}'),
    'permission denied for function edital_analise_mesclar%');
  perform public.smoke_conector_recusa(format(
    'select public.edital_analise_anexar_arquivos(%L, %L, %L)', v_b, v_op_b, '[]'),
    'permission denied for function edital_analise_anexar_arquivos%');
  perform public.smoke_conector_recusa(format(
    'select * from public.conector_texto_disponivel(%L, array[%L]::uuid[])', v_b, v_arq_a),
    'permission denied for function conector_texto_disponivel%');
  perform public.smoke_conector_recusa('select public.conector_limpeza_envio()',
    'permission denied for function conector_limpeza_envio%');
  reset role;

  perform set_config('request.jwt.claims', public.smoke_conector_claims(v_a), true);
  set local role authenticated;
  insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto, escaneada)
  values (v_a, v_arq_a, 2, '', true);
  select count(*) into v_n from public.arquivo_texto_pagina where arquivo_id = v_arq_a and deleted_at is null;
  if v_n <> 2 then raise exception 'FALHOU: a empresa A deveria ver 2 páginas (viu %)', v_n; end if;
  update public.arquivo_texto_pagina set deleted_at = now() where arquivo_id = v_arq_a and pagina = 2;
  perform public.smoke_conector_recusa(format(
    'delete from public.arquivo_texto_pagina where arquivo_id = %L', v_arq_a),
    'permission denied for table arquivo_texto_pagina');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[2] arquivo_texto_pagina: índice único e RLS ok';

  -- 3. edital_analise_mesclar
  update public.oportunidade
     set edital_analise = jsonb_build_object('versao', 1, 'atende', null, 'arquivos',
           jsonb_build_array(jsonb_build_object('arquivo_oportunidade_id', v_arq_a, 'nome', 'Edital.pdf', 'categoria', 'edital')))
   where id = v_op_a;
  v_ok := public.edital_analise_mesclar(v_a, v_op_a,
    '{"extraido": {"orgao": "Prefeitura de Teste"}, "analisado_por": "smoke via Claude"}'::jsonb);
  select edital_analise into v_analise from public.oportunidade where id = v_op_a;
  if not v_ok or jsonb_array_length(v_analise -> 'arquivos') <> 1
     or v_analise #>> '{extraido,orgao}' <> 'Prefeitura de Teste'
     or (select edital_analisado_em from public.oportunidade where id = v_op_a) is null then
    raise exception 'FALHOU: mesclar → %', v_analise;
  end if;
  perform public.smoke_conector_recusa(format(
    'select public.edital_analise_mesclar(%L, %L, %L)', v_a, v_op_a, '{"arquivos": []}'),
    'edital_analise: chave não aceita: arquivos', '22023');
  if public.edital_analise_mesclar(v_b, v_op_a, '{"atende": null}'::jsonb) then
    raise exception 'FALHOU: mesclar com a empresa B mexeu na oportunidade da A';
  end if;
  raise notice '[3] edital_analise_mesclar ok';

  -- 4. edital_analise_anexar_arquivos
  v_n := public.edital_analise_anexar_arquivos(v_a, v_op_a, jsonb_build_array(
    jsonb_build_object('arquivo_oportunidade_id', v_arq_a, 'nome', 'Edital.pdf', 'categoria', 'edital'),
    jsonb_build_object('arquivo_oportunidade_id', gen_random_uuid(), 'nome', 'TR.pdf', 'categoria', 'termo_referencia')));
  if v_n <> 1 then raise exception 'FALHOU: anexar deveria acrescentar 1 (acrescentou %)', v_n; end if;
  select edital_analise into v_analise from public.oportunidade where id = v_op_a;
  if jsonb_array_length(v_analise -> 'arquivos') <> 2 then
    raise exception 'FALHOU: anexar → %', v_analise -> 'arquivos';
  end if;
  raise notice '[4] edital_analise_anexar_arquivos ok (sem duplicar)';

  -- 5. texto disponível só na empresa pedida
  select paginas into v_n from public.conector_texto_disponivel(v_a, array[v_arq_a]);
  if v_n is distinct from 1 then raise exception 'FALHOU: texto disponível da A = % (esperado 1)', v_n; end if;
  select count(*) into v_n from public.conector_texto_disponivel(v_b, array[v_arq_a]);
  if v_n <> 0 then raise exception 'FALHOU: a empresa B viu o texto da A'; end if;
  raise notice '[5] conector_texto_disponivel ok';

  -- 6. sem_acento
  v_txt := public.sem_acento('Joanópolis');
  if v_txt <> 'joanopolis' then raise exception 'FALHOU: sem_acento → %', v_txt; end if;
  raise notice '[6] sem_acento ok';

  raise notice 'SMOKE TEST OK';
end;
$$;

rollback;
