-- ============================================================================
-- smoke-documentos-gerados.sql — valida a 0161 (origem e assinatura dos arquivos da oportunidade,
-- modelos de declaração e a gravação atômica do conector)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK. Cria DUAS EMPRESAS SINTÉTICAS
-- ("Smoke Documentos A" e "B"), duas oportunidades na A e uma na B (mais uma excluída na A) e três
-- vínculos de usuário sintéticos na A (e-mails @exemplo.test; perfil Gestor, que não é Admin nem dono:
-- valem as permissões). Nada da base real é lido nem alterado, e nada é persistido. Simula cada usuário
-- com `set local role authenticated` + `request.jwt.claims`, e o servidor com `set local role service_role`.
--
-- Usuários de teste (todos da empresa A):
--   editar   Oportunidades → Lista → visualizar e editar
--   ver      Oportunidades → Lista → visualizar
--   sem      só Financeiro (sem permissão em Oportunidades)
--
-- O que confere, nesta ordem:
--   1. conector_gravar_arquivo cria a linha: ok, substituiu = false, origem e assinatura 'pendente' gravadas;
--   2. a mesma origem com outra ref troca a linha no lugar (mesmo arquivo_id, ref_anterior = a primeira ref,
--      nome, tamanho, pasta, categoria, assinatura e usuário trocados) e continua UMA linha viva;
--   3. a troca no lugar exclui (deleted_at) o texto por página do arquivo antigo (arquivo_texto_pagina): o
--      conector deixa de ter texto para ele; o texto de OUTRO arquivo não é tocado;
--   4. a tela marca "assinado" (UPDATE como authenticated da empresa, que é o botão "Enviar assinado"):
--      a RLS deixa, valor fora da lista é recusado pelo CHECK, a empresa B não mexe; depois a RPC devolve
--      mantido_assinado = true, nada da linha muda (a url é a da tela) e o texto por página continua vivo;
--   5. outra origem na mesma oportunidade cria outra linha; a mesma origem em OUTRA oportunidade — da
--      mesma empresa ou de outra — tem a linha dela, e gravar ou trocar numa não mexe na outra; a linha
--      excluída não conta (nova gravação cria outra);
--   6. linha de OUTRA empresa apontando para a oportunidade da A com a mesma origem não colide no índice
--      nem impede a RPC da A de gravar e de trocar o arquivo dela; a linha da outra empresa fica intocada;
--   7. oportunidade (ou empresa) que não casa — empresa aleatória, oportunidade de outra empresa, excluída ou
--      inexistente — devolve {"ok": false, "motivo": "nao_encontrada"} e nada é gravado;
--   8. as recusas da RPC (22023, com a mensagem): ref fora da pasta da empresa (inclusive só a pasta, sem
--      arquivo, e segmento "." ou ".." no caminho) e ref com qualquer caractere fora de A-Z a-z 0-9 . _ / -
--      (tabulação, LF e CR dentro de um segmento, como ".<tab>." que o parser de URL do storage-js
--      transformaria em "..", barra invertida, "%2e%2e", espaço, acento, "?" e "#"), assinatura que não é
--      'pendente', origem e nome inválidos (inclusive só tabulação e quebra de linha), empresa ou oportunidade
--      nulas; nada é gravado. Nome de arquivo com pontos seguidos ("Ltda..pdf") passa;
--   9. o índice único: segunda linha viva com a mesma (empresa_id, oportunidade_id, origem) é recusada
--      (23505); origem nula repete, excluída não conta; duas linhas vivas com a mesma origem e SEM
--      oportunidade (arquivo movido para o projeto) convivem; CHECKs de origem e de assinatura;
--  10. modelo_declaracao: chave única entre as vivas por empresa, chave fora do padrão, chave com o prefixo
--      reservado "edital_", título e texto fora dos limites (ou só com espaço, tabulação e quebra de linha)
--      e empresa inexistente são recusados (limites exatos aceitos);
--  11. o bucket anexos-oportunidade aceita .docx, .doc, .xls e .zip;
--  12. a RPC é só do servidor: pelo caminho REAL (papel service_role, token de service_role) ela grava,
--      troca e exclui o texto por página; authenticated e anon não têm EXECUTE ("permission denied for
--      function", 42501); com token de usuário até o dono do banco é recusado pela função ("Acesso negado");
--  13. modelo_declaracao como authenticated: quem tem Lista → editar cria, altera e exclui; quem só vê lê e
--      não grava; quem não tem Oportunidades → Lista não lê; token de outra empresa não lê nem grava; ninguém
--      apaga de verdade (sem DELETE); as 3 policies restritivas existem, cada uma no seu comando.
-- Nenhum UUID fixo: as empresas, as oportunidades e os registros são criados em tempo de execução.
--
-- Fora o passo 12, a RPC é chamada como o dono do banco: chamador_eh_servidor() aceita sessão sem token
-- fora do papel authenticator (0110:27-35), e o smoke confere isso antes de começar.
--
-- Como rodar (com a 0161 já aplicada; quem roda é o Javerson):
--   npx supabase@2.118.0 db query --linked -f tools/smoke-documentos-gerados.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- exige que o comando seja RECUSADO com o estado e a mensagem esperados; some no ROLLBACK
-- (o estado sozinho não basta: 42501 também é o "permission denied" de um grant que falta)
create or replace function public.smoke_doc_recusa(p_sql text, p_msg text, p_estado text)
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

-- o token simulado de cada usuário de teste (e-mail sintético, empresa do token); some no ROLLBACK
create or replace function public.smoke_doc_claims(p_quem text, p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-doc-' || p_quem)::uuid,
    'email', 'smoke.doc.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

-- a resposta de sucesso da RPC (sem o arquivo_id); some no ROLLBACK
create or replace function public.smoke_doc_esperado(p_substituiu boolean, p_mantido boolean, p_ref_anterior text)
returns jsonb
language sql
as $f$
  select jsonb_build_object('ok', true, 'substituiu', p_substituiu, 'mantido_assinado', p_mantido,
                            'ref_anterior', p_ref_anterior);
$f$;

-- o comando que chama a RPC (para a recusa); o que não é parâmetro vai fixo; some no ROLLBACK
create or replace function public.smoke_doc_chamada(
  p_empresa uuid, p_op uuid, p_origem text, p_nome text, p_url text, p_assinatura text default null)
returns text
language sql
as $f$
  select format('select public.conector_gravar_arquivo(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
                p_empresa, p_op, p_origem, p_nome, p_url, 'application/pdf', 100, 'Envelope 02 – Habilitação',
                null::text, p_assinatura, 'Smoke');
$f$;

do $$
declare
  v_fn constant text := 'public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text)';
  v_pasta constant text := 'Envelope 02 – Habilitação';
  v_a uuid;          -- empresa A
  v_b uuid;          -- empresa B
  v_op_a uuid;       -- oportunidade da A
  v_op_a2 uuid;      -- segunda oportunidade da A
  v_op_b uuid;       -- oportunidade da B
  v_op_del uuid;     -- oportunidade excluída da A
  v_orf uuid := gen_random_uuid();   -- empresa que não existe
  v_pa text;         -- pasta da A no bucket: "anexos-oportunidade/<A>/2026/10/"
  v_pb text;         -- pasta da B
  v_ref1 text;
  v_ref2 text;
  v_ref3 text;
  v_ref_assinada text;
  v_id uuid;         -- o arquivo 'smoke:doc' da A
  v_viz uuid;        -- arquivo enviado pela tela (sem origem) na oportunidade da A, com texto por página
  v_id2 uuid;        -- o arquivo 'smoke:outro' da A
  v_id3 uuid;        -- o arquivo 'smoke:outro' recriado
  v_ida2 uuid;       -- o arquivo 'smoke:outro' da segunda oportunidade da A
  v_idb uuid;        -- o arquivo 'smoke:doc' da B
  v_intr1 uuid;      -- linha da B apontando para a oportunidade da A, origem 'smoke:outro'
  v_intr2 uuid;      -- linha da B apontando para a oportunidade da A, origem 'smoke:nova'
  v_nova uuid;       -- o arquivo 'smoke:nova' da A
  v_srv uuid;        -- o arquivo 'smoke:servidor', gravado como service_role
  v_r jsonb;
  v_antes bigint;
  v_n bigint;
  v_m1 uuid;         -- modelo gravado pelo smoke como servidor
  v_m3 uuid;         -- modelo criado pelo usuário que edita (substitui um padrão)
  v_m4 uuid;         -- modelo próprio criado pelo usuário que edita
  r record;
begin
  -- 0. a migração está aplicada, e o smoke roda como servidor --------------------------------------------------------
  if to_regclass('public.modelo_declaracao') is null
     or to_regprocedure(v_fn) is null
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'arquivo_oportunidade'
            and column_name in ('origem', 'assinatura')) <> 2 then
    raise exception 'Falta a migração 0161 (origem, assinatura, modelo_declaracao e conector_gravar_arquivo): aplique antes de rodar este smoke.';
  end if;
  if to_regclass('public.arquivo_texto_pagina') is null then
    raise exception 'Falta a migração 0149 (arquivo_texto_pagina): a troca do arquivo exclui o texto por página dele.';
  end if;
  perform set_config('request.jwt.claims', '', true);
  if not public.chamador_eh_servidor() then
    raise exception 'FALHOU: o smoke tem de rodar como servidor (sessão sem token, fora do papel authenticator): a RPC só aceita o servidor';
  end if;

  -- massa: duas empresas sintéticas, duas oportunidades na A e uma na B (e uma excluída na A), três usuários na A ------
  insert into public.empresa (nome) values ('Smoke Documentos A (empresa sintética)') returning id into v_a;
  insert into public.empresa (nome) values ('Smoke Documentos B (empresa sintética)') returning id into v_b;
  insert into public.oportunidade (empresa_id, nome) values (v_a, 'SMOKE B5 oportunidade A') returning id into v_op_a;
  insert into public.oportunidade (empresa_id, nome) values (v_a, 'SMOKE B5 oportunidade A 2') returning id into v_op_a2;
  insert into public.oportunidade (empresa_id, nome) values (v_b, 'SMOKE B5 oportunidade B') returning id into v_op_b;
  insert into public.oportunidade (empresa_id, nome, deleted_at)
  values (v_a, 'SMOKE B5 oportunidade A excluída', now())
  returning id into v_op_del;
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    select v_a, 'smoke.doc.' || u.quem || '@exemplo.test', 'Gestor', true, u.permissoes, 'Smoke Documentos'
      from (values
        ('editar', '{"Oportunidades":{"Lista":{"visualizar":true,"editar":true}}}'::jsonb),
        ('ver', '{"Oportunidades":{"Lista":{"visualizar":true}}}'::jsonb),
        ('sem', '{"Financeiro":{"Despesas":{"visualizar":true}}}'::jsonb)
      ) as u(quem, permissoes);

  v_pa := 'anexos-oportunidade/' || v_a::text || '/2026/10/';
  v_pb := 'anexos-oportunidade/' || v_b::text || '/2026/10/';
  v_ref1 := v_pa || 'smoke-1.pdf';
  v_ref2 := v_pa || 'smoke-2.pdf';
  v_ref3 := v_pa || 'smoke-3.pdf';
  v_ref_assinada := v_pa || 'smoke-assinado.pdf';

  -- 1. grava uma linha nova -----------------------------------------------------------------------------------------
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:doc', 'Smoke.pdf', v_ref1, 'application/pdf', 100,
                                        v_pasta, null, 'pendente', 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null) then
    raise exception 'FALHOU: a primeira gravação deveria criar o arquivo (ok, sem substituir, sem ref anterior): %', v_r;
  end if;
  v_id := (v_r ->> 'arquivo_id')::uuid;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.id = v_id and a.empresa_id = v_a and a.oportunidade_id = v_op_a and a.origem = 'smoke:doc'
     and a.assinatura = 'pendente' and a.nome = 'Smoke.pdf' and a.url = v_ref1 and a.tipo = 'application/pdf'
     and a.tamanho = 100 and a.pasta = v_pasta and a.categoria is null and a.usuario_nome = 'Smoke'
     and a.enviado_por_cliente = false and a.deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: a linha gravada não ficou como a RPC recebeu'; end if;
  raise notice '[1] a RPC cria o arquivo com origem e assinatura pendente';

  -- 2. a mesma origem troca a linha no lugar -------------------------------------------------------------------------
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:doc', 'Smoke 2.pdf', v_ref2, 'application/pdf', 200,
                                        'Credenciamento', 'anexo_edital', null, 'Smoke 2');
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_id
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(true, false, v_ref1) then
    raise exception 'FALHOU: a segunda gravação deveria trocar a linha no lugar (mesmo arquivo_id, ref_anterior = a primeira ref): %', v_r;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.id = v_id and a.nome = 'Smoke 2.pdf' and a.url = v_ref2 and a.tipo = 'application/pdf'
     and a.tamanho = 200 and a.pasta = 'Credenciamento' and a.categoria = 'anexo_edital'
     and a.assinatura is null and a.usuario_nome = 'Smoke 2' and a.deleted_at is null;
  if v_n <> 1 then
    raise exception 'FALHOU: a troca deveria levar nome, ref, tamanho, pasta, categoria, assinatura e usuário';
  end if;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.oportunidade_id = v_op_a and a.origem = 'smoke:doc' and a.deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: depois da troca deveria haver 1 linha viva com a origem, e há %', v_n; end if;
  raise notice '[2] a mesma origem troca o arquivo no lugar, sem duplicar';

  -- 3. a troca no lugar exclui o texto por página do arquivo antigo ---------------------------------------------------
  -- O texto (arquivo_texto_pagina, 0149) é guardado pelo arquivo_id, que a troca mantém: sem excluir, o
  -- ler_edital_anexado devolveria o texto do arquivo ANTIGO. O arquivo vizinho (enviado pela tela) não é tocado.
  insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url)
  values (v_a, v_op_a, 'Vizinho da tela.pdf', v_pa || 'vizinho.pdf')
  returning id into v_viz;
  insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto)
  values (v_a, v_id, 1, 'Smoke: página 1 do arquivo antigo'),
         (v_a, v_id, 2, 'Smoke: página 2 do arquivo antigo'),
         (v_a, v_viz, 1, 'Smoke: página 1 do vizinho');
  select count(*) into v_n from public.conector_texto_disponivel(v_a, array[v_id, v_viz]);
  if v_n <> 2 then raise exception 'FALHOU: antes da troca os dois arquivos deveriam ter texto (têm: %)', v_n; end if;
  -- a troca (de volta a pendente, para a etapa seguinte), ainda no mesmo arquivo
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:doc', 'Smoke 3.pdf', v_ref3, 'application/pdf', 300,
                                        v_pasta, null, 'pendente', 'Smoke 3');
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_id
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(true, false, v_ref2) then
    raise exception 'FALHOU: a terceira gravação deveria trocar de novo a mesma linha (ref_anterior = a segunda ref): %', v_r;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.oportunidade_id = v_op_a and a.origem = 'smoke:doc' and a.deleted_at is null and a.assinatura = 'pendente';
  if v_n <> 1 then raise exception 'FALHOU: depois da terceira gravação deveria haver 1 linha viva pendente, e há %', v_n; end if;
  select count(*) into v_n from public.arquivo_texto_pagina t
   where t.arquivo_id = v_id and t.deleted_at is null;
  if v_n <> 0 then
    raise exception 'FALHOU: a troca no lugar deixou % página(s) de texto do arquivo antigo valendo', v_n;
  end if;
  select count(*) into v_n from public.arquivo_texto_pagina t
   where t.arquivo_id = v_id and t.empresa_id = v_a and t.deleted_at is not null;
  if v_n <> 2 then
    raise exception 'FALHOU: as 2 páginas do arquivo antigo deveriam estar excluídas (deleted_at), e há %', v_n;
  end if;
  select count(*) into v_n from public.arquivo_texto_pagina t
   where t.arquivo_id = v_viz and t.deleted_at is null;
  if v_n <> 1 then
    raise exception 'FALHOU: a troca mexeu no texto de OUTRO arquivo (o vizinho ficou com % página viva)', v_n;
  end if;
  -- o que o ler_edital_anexado consulta: o arquivo trocado ficou sem texto (ele responde "sem_texto")
  select count(*) into v_n from public.conector_texto_disponivel(v_a, array[v_id]);
  if v_n <> 0 then raise exception 'FALHOU: o conector ainda vê texto no arquivo trocado'; end if;
  select count(*) into v_n from public.conector_texto_disponivel(v_a, array[v_viz]);
  if v_n <> 1 then raise exception 'FALHOU: o conector deixou de ver o texto do arquivo vizinho'; end if;
  raise notice '[3] a troca no lugar exclui o texto por página do arquivo antigo (e só o dele)';

  -- 4. a tela marca "assinado" (authenticated da empresa); a RPC não troca mais o arquivo --------------------------------
  -- A tela faz um UPDATE comum em arquivo_oportunidade (botão "Enviar assinado"): vale a RLS da empresa, e o
  -- trigger set_updated_at roda como authenticated.
  perform set_config('request.jwt.claims', public.smoke_doc_claims('editar', v_a), true);
  set local role authenticated;
  begin
    update public.arquivo_oportunidade
       set assinatura = 'assinado', url = v_ref_assinada
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'o UPDATE não atingiu o arquivo (linhas=%)', v_n; end if;
  exception when others then
    raise exception 'FALHOU: a tela (authenticated da empresa) deveria marcar o arquivo gerado como assinado, e veio: % (%)',
      sqlerrm, sqlstate;
  end;
  -- valor fora da lista: o CHECK recusa (também para a tela)
  perform public.smoke_doc_recusa(format(
    'update public.arquivo_oportunidade set assinatura = %L where id = %L', 'assinada', v_id),
    '%arquivo_oportunidade_assinatura_check%', '23514');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- a empresa B não enxerga nem altera o arquivo da A
  perform set_config('request.jwt.claims', public.smoke_doc_claims('editar', v_b), true);
  set local role authenticated;
  select count(*) into v_n from public.arquivo_oportunidade where id = v_id;
  if v_n <> 0 then raise exception 'FALHOU: a empresa B leu o arquivo da A'; end if;
  update public.arquivo_oportunidade set assinatura = 'pendente', url = v_pb || 'invasao.pdf' where id = v_id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: a empresa B alterou % arquivo(s) da A', v_n; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- o texto do arquivo assinado, preparado de novo pelo usuário ("Preparar para o Claude")
  insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto)
  values (v_a, v_id, 1, 'Smoke: página 1 do assinado'),
         (v_a, v_id, 2, 'Smoke: página 2 do assinado');

  -- a RPC reconhece o assinado: nada muda, e a url é a que a tela gravou
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:doc', 'Smoke 4.pdf', v_pa || 'smoke-4.pdf', 'application/pdf',
                                        400, 'Envelope 01 – Proposta', 'edital', 'pendente', 'Smoke 4');
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_id
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, true, null) then
    raise exception 'FALHOU: com o arquivo assinado a RPC deveria devolver mantido_assinado = true com o arquivo_id dele: %', v_r;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.id = v_id and a.assinatura = 'assinado' and a.url = v_ref_assinada and a.nome = 'Smoke 3.pdf'
     and a.tamanho = 300 and a.pasta = v_pasta and a.categoria is null and a.usuario_nome = 'Smoke 3'
     and a.deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: a RPC mexeu num arquivo já assinado'; end if;
  -- o arquivo não foi trocado: o texto por página dele continua valendo
  select count(*) into v_n from public.arquivo_texto_pagina t
   where t.arquivo_id = v_id and t.deleted_at is null;
  if v_n <> 2 then
    raise exception 'FALHOU: com o assinado mantido o texto por página deveria continuar (2 páginas vivas), e há %', v_n;
  end if;
  raise notice '[4] a tela marca assinado (RLS ok, CHECK ok, B não mexe); a RPC mantém o assinado e o texto dele';

  -- 5. outra origem, outra oportunidade, linha excluída -------------------------------------------------------------
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:outro', 'Outro.pdf', v_pa || 'smoke-outro.pdf',
                                        'application/pdf', 100, v_pasta, null, 'pendente', 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null)
     or (v_r ->> 'arquivo_id')::uuid = v_id then
    raise exception 'FALHOU: outra origem deveria criar outra linha: %', v_r;
  end if;
  v_id2 := (v_r ->> 'arquivo_id')::uuid;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.oportunidade_id = v_op_a and a.origem in ('smoke:doc', 'smoke:outro') and a.deleted_at is null;
  if v_n <> 2 then raise exception 'FALHOU: deveria haver 2 linhas vivas na oportunidade (uma por origem), e há %', v_n; end if;

  -- a mesma origem em OUTRA oportunidade da MESMA empresa tem a linha dela: gravar e trocar numa não mexe na outra
  v_r := public.conector_gravar_arquivo(v_a, v_op_a2, 'smoke:outro', 'Outro A2.pdf', v_pa || 'smoke-a2-1.pdf',
                                        'application/pdf', 100, v_pasta, null, 'pendente', 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null)
     or (v_r ->> 'arquivo_id')::uuid = v_id2 then
    raise exception 'FALHOU: a mesma origem em outra oportunidade da mesma empresa deveria criar a linha dela: %', v_r;
  end if;
  v_ida2 := (v_r ->> 'arquivo_id')::uuid;
  v_r := public.conector_gravar_arquivo(v_a, v_op_a2, 'smoke:outro', 'Outro A2 b.pdf', v_pa || 'smoke-a2-2.pdf',
                                        'application/pdf', 150, v_pasta, null, null, 'Smoke');
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_ida2
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(true, false, v_pa || 'smoke-a2-1.pdf') then
    raise exception 'FALHOU: a troca na segunda oportunidade deveria atingir só a linha dela: %', v_r;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade a
   where (a.id = v_id2 and a.empresa_id = v_a and a.oportunidade_id = v_op_a and a.nome = 'Outro.pdf'
          and a.url = v_pa || 'smoke-outro.pdf' and a.tamanho = 100 and a.assinatura = 'pendente'
          and a.deleted_at is null)
      or (a.id = v_ida2 and a.empresa_id = v_a and a.oportunidade_id = v_op_a2 and a.nome = 'Outro A2 b.pdf'
          and a.url = v_pa || 'smoke-a2-2.pdf' and a.tamanho = 150 and a.assinatura is null
          and a.deleted_at is null);
  if v_n <> 2 then
    raise exception 'FALHOU: a RPC de uma oportunidade mexeu no arquivo da outra (mesma empresa, mesma origem)';
  end if;

  -- a mesma origem em oportunidade de OUTRA empresa (a da B) tem a linha dela, e a da A não muda
  v_r := public.conector_gravar_arquivo(v_b, v_op_b, 'smoke:doc', 'Smoke B.pdf', v_pb || 'smoke-b.pdf',
                                        'application/pdf', 100, v_pasta, null, 'pendente', 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null)
     or (v_r ->> 'arquivo_id')::uuid = v_id then
    raise exception 'FALHOU: a mesma origem em outra oportunidade deveria criar a linha dela: %', v_r;
  end if;
  v_idb := (v_r ->> 'arquivo_id')::uuid;
  select count(*) into v_n from public.arquivo_oportunidade a
   where (a.id = v_idb and a.empresa_id = v_b and a.oportunidade_id = v_op_b)
      or (a.id = v_id and a.empresa_id = v_a and a.url = v_ref_assinada and a.assinatura = 'assinado');
  if v_n <> 2 then raise exception 'FALHOU: a gravação na empresa B mexeu na linha da A ou caiu na oportunidade errada'; end if;

  -- a linha excluída não conta: gravar de novo cria outra, e a excluída fica como está
  update public.arquivo_oportunidade set deleted_at = now() where id = v_id2;
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:outro', 'Outro 2.pdf', v_pa || 'smoke-outro-2.pdf',
                                        'application/pdf', 100, v_pasta, null, 'pendente', 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null)
     or (v_r ->> 'arquivo_id')::uuid = v_id2 then
    raise exception 'FALHOU: com a linha excluída a RPC deveria criar outra, e não trocar a excluída: %', v_r;
  end if;
  v_id3 := (v_r ->> 'arquivo_id')::uuid;
  select count(*) into v_n from public.arquivo_oportunidade a
   where (a.id = v_id2 and a.deleted_at is not null and a.url = v_pa || 'smoke-outro.pdf')
      or (a.id = v_id3 and a.deleted_at is null and a.url = v_pa || 'smoke-outro-2.pdf');
  if v_n <> 2 then raise exception 'FALHOU: a linha excluída mudou, ou a nova não ficou viva'; end if;
  raise notice '[5] outra origem cria outra linha; a mesma origem em outra oportunidade (da empresa ou de outra) é independente; a excluída não conta';

  -- 6. linha de OUTRA empresa apontando para a oportunidade da A não trava a gravação da A --------------------------
  -- arquivo_oportunidade.oportunidade_id não tem chave estrangeira (0021) nem trigger de conferência: um usuário da
  -- B consegue gravar, pela API, uma linha da empresa DELE (a RLS deixa) apontando para a oportunidade da A, com a
  -- mesma origem. O índice leva a empresa: a linha da B entra sem colidir com a da A, e a RPC da A (que procura
  -- pela empresa) segue criando e trocando o arquivo dela. Sem a empresa no índice, viria 23505 para sempre.
  begin
    -- a A já tem 'smoke:outro' viva nesta oportunidade (v_id3)
    insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem)
    values (v_b, v_op_a, 'Intrusa outro.pdf', v_pb || 'intrusa-outro.pdf', 'smoke:outro')
    returning id into v_intr1;
    -- a A ainda não tem 'smoke:nova'
    insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem)
    values (v_b, v_op_a, 'Intrusa nova.pdf', v_pb || 'intrusa-nova.pdf', 'smoke:nova')
    returning id into v_intr2;
  exception when unique_violation then
    raise exception 'FALHOU: a linha de outra empresa colidiu com a da A no índice único (ele deveria levar a empresa): %', sqlerrm;
  end;
  -- gravar: a RPC da A cria o arquivo 'smoke:nova' dela
  begin
    v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:nova', 'Nova.pdf', v_pa || 'smoke-nova.pdf',
                                          'application/pdf', 100, v_pasta, null, 'pendente', 'Smoke');
  exception when unique_violation then
    raise exception 'FALHOU: a linha de outra empresa impediu a RPC da A de gravar: %', sqlerrm;
  end;
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null)
     or (v_r ->> 'arquivo_id')::uuid in (v_intr1, v_intr2) then
    raise exception 'FALHOU: com a linha de outra empresa na oportunidade, a RPC deveria criar o arquivo da A: %', v_r;
  end if;
  v_nova := (v_r ->> 'arquivo_id')::uuid;
  -- trocar: a RPC da A troca no lugar a linha DELA ('smoke:outro' e, de novo, 'smoke:nova'), não a da B
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:outro', 'Outro 3.pdf', v_pa || 'smoke-outro-3.pdf',
                                        'application/pdf', 130, v_pasta, null, 'pendente', 'Smoke');
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_id3
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(true, false, v_pa || 'smoke-outro-2.pdf') then
    raise exception 'FALHOU: com a linha de outra empresa na oportunidade, a RPC deveria trocar o arquivo da A: %', v_r;
  end if;
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:nova', 'Nova 2.pdf', v_pa || 'smoke-nova-2.pdf',
                                        'application/pdf', 110, v_pasta, null, 'pendente', 'Smoke');
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_nova
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(true, false, v_pa || 'smoke-nova.pdf') then
    raise exception 'FALHOU: a segunda gravação da A deveria trocar o arquivo que ela criou, e não o da outra empresa: %', v_r;
  end if;
  -- a B não grava na oportunidade da A pela RPC (nem troca a linha intrusa por ela)
  v_r := public.conector_gravar_arquivo(v_b, v_op_a, 'smoke:outro', 'Invasão.pdf', v_pb || 'invasao-2.pdf',
                                        'application/pdf', 100, v_pasta, null, null, 'Smoke');
  if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'nao_encontrada') then
    raise exception 'FALHOU: a empresa B pedindo a oportunidade da A deveria voltar nao_encontrada, e voltou %', v_r;
  end if;
  -- as linhas da B ficaram como estavam
  select count(*) into v_n from public.arquivo_oportunidade a
   where (a.id = v_intr1 and a.empresa_id = v_b and a.oportunidade_id = v_op_a and a.origem = 'smoke:outro'
          and a.nome = 'Intrusa outro.pdf' and a.url = v_pb || 'intrusa-outro.pdf' and a.tamanho is null
          and a.assinatura is null and a.deleted_at is null)
      or (a.id = v_intr2 and a.empresa_id = v_b and a.oportunidade_id = v_op_a and a.origem = 'smoke:nova'
          and a.nome = 'Intrusa nova.pdf' and a.url = v_pb || 'intrusa-nova.pdf' and a.tamanho is null
          and a.assinatura is null and a.deleted_at is null);
  if v_n <> 2 then raise exception 'FALHOU: a RPC mexeu na linha da outra empresa (certas: % de 2)', v_n; end if;
  -- e as da A ficaram com o que a RPC gravou
  select count(*) into v_n from public.arquivo_oportunidade a
   where (a.id = v_nova and a.empresa_id = v_a and a.oportunidade_id = v_op_a and a.origem = 'smoke:nova'
          and a.url = v_pa || 'smoke-nova-2.pdf' and a.tamanho = 110 and a.deleted_at is null)
      or (a.id = v_id3 and a.empresa_id = v_a and a.oportunidade_id = v_op_a and a.origem = 'smoke:outro'
          and a.url = v_pa || 'smoke-outro-3.pdf' and a.tamanho = 130 and a.deleted_at is null);
  if v_n <> 2 then raise exception 'FALHOU: os arquivos da A não ficaram com o que a RPC gravou (certos: % de 2)', v_n; end if;
  raise notice '[6] linha de outra empresa na oportunidade da A: não colide, a RPC da A grava e troca, e a linha alheia fica intocada';

  -- 7. oportunidade ou empresa que não casam: nada é gravado --------------------------------------------------------
  for r in
    select * from (values
      ('empresa que não existe', v_orf, v_op_a, 'anexos-oportunidade/' || v_orf::text || '/2026/10/fora.pdf'),
      ('oportunidade da B pedida pela A', v_a, v_op_b, v_pa || 'fora.pdf'),
      ('oportunidade da A pedida pela B', v_b, v_op_a, v_pb || 'fora.pdf'),
      ('oportunidade excluída', v_a, v_op_del, v_pa || 'fora.pdf'),
      ('oportunidade que não existe', v_a, gen_random_uuid(), v_pa || 'fora.pdf')
    ) as e(descricao, empresa, op, caminho)
  loop
    v_r := public.conector_gravar_arquivo(r.empresa, r.op, 'smoke:fora', 'Fora.pdf', r.caminho, 'application/pdf', 100,
                                          null, null, null, 'Smoke');
    if v_r is distinct from jsonb_build_object('ok', false, 'motivo', 'nao_encontrada') then
      raise exception 'FALHOU: % deveria voltar {"ok": false, "motivo": "nao_encontrada"} e voltou %', r.descricao, v_r;
    end if;
  end loop;
  select count(*) into v_n from public.arquivo_oportunidade where origem = 'smoke:fora';
  if v_n <> 0 then raise exception 'FALHOU: oportunidade que não casa gravou % linha(s)', v_n; end if;
  raise notice '[7] empresa ou oportunidade que não casa: nao_encontrada, nada gravado';

  -- 8. as recusas da RPC ----------------------------------------------------------------------------------------------
  select count(*) into v_antes from public.arquivo_oportunidade where empresa_id in (v_a, v_b);
  -- a ref tem de ser um arquivo dentro da pasta da empresa, no bucket da oportunidade
  for r in
    select * from (values
      ('pasta de outra empresa', v_a, v_op_a, 'anexos-oportunidade/' || gen_random_uuid()::text || '/2026/10/x.pdf'),
      ('a empresa B com a ref da pasta da A', v_b, v_op_b, v_pa || 'x.pdf'),
      ('a empresa A com a ref da pasta da B', v_a, v_op_a, v_pb || 'x.pdf'),
      ('outro bucket', v_a, v_op_a, 'certificados/' || v_a::text || '/2026/10/x.pdf'),
      ('bucket da biblioteca', v_a, v_op_a, 'habilitacao/' || v_a::text || '/x.pdf'),
      ('sem a barra depois da empresa', v_a, v_op_a, 'anexos-oportunidade/' || v_a::text),
      ('só a pasta da empresa, sem arquivo', v_a, v_op_a, 'anexos-oportunidade/' || v_a::text || '/'),
      ('segmento ".." no meio do caminho', v_a, v_op_a, v_pa || '../x.pdf'),
      ('".." para cair na pasta de outra empresa', v_a, v_op_a,
        'anexos-oportunidade/' || v_a::text || '/../' || v_b::text || '/2026/10/x.pdf'),
      ('caminho que termina em ".."', v_a, v_op_a, v_pa || '..'),
      ('segmento "." no caminho', v_a, v_op_a, v_pa || './x.pdf'),
      -- lista branca (A-Z a-z 0-9 . _ / -): tab, LF e CR o parser de URL do storage-js APAGA, então ".<tab>."
      -- virava ".." e a ref saía da pasta da empresa
      ('TAB entre pontos, para cair na pasta de outra empresa', v_a, v_op_a,
        'anexos-oportunidade/' || v_a::text || '/.' || chr(9) || './' || v_b::text || '/2026/10/x.pdf'),
      ('LF entre pontos', v_a, v_op_a,
        'anexos-oportunidade/' || v_a::text || '/.' || chr(10) || './' || v_b::text || '/2026/10/x.pdf'),
      ('CR entre pontos', v_a, v_op_a,
        'anexos-oportunidade/' || v_a::text || '/.' || chr(13) || './' || v_b::text || '/2026/10/x.pdf'),
      ('TAB dentro de um segmento comum', v_a, v_op_a, v_pa || 'a' || chr(9) || 'b.pdf'),
      ('LF dentro de um segmento comum', v_a, v_op_a, v_pa || 'a' || chr(10) || 'b.pdf'),
      ('TAB no fim da ref', v_a, v_op_a, v_pa || 'x.pdf' || chr(9)),
      ('barra invertida', v_a, v_op_a, v_pa || 'a' || chr(92) || 'b.pdf'),
      ('%2e%2e', v_a, v_op_a, v_pa || '%2e%2e/x.pdf'),
      ('% dentro do nome', v_a, v_op_a, v_pa || 'a%20b.pdf'),
      ('espaço no meio do nome', v_a, v_op_a, v_pa || 'a b.pdf'),
      ('espaço no fim da ref', v_a, v_op_a, v_pa || 'x.pdf '),
      ('".." com espaço no fim', v_a, v_op_a, 'anexos-oportunidade/' || v_a::text || '/.. '),
      ('acento no nome', v_a, v_op_a, v_pa || 'Declaração.pdf'),
      ('? no nome', v_a, v_op_a, v_pa || 'x.pdf?v=1'),
      ('# no nome', v_a, v_op_a, v_pa || 'x#1.pdf'),
      ('ref vazia', v_a, v_op_a, ''),
      ('ref nula', v_a, v_op_a, null)
    ) as e(descricao, empresa, op, caminho)
  loop
    perform public.smoke_doc_recusa(
      public.smoke_doc_chamada(r.empresa, r.op, 'smoke:recusa', 'Recusa.pdf', r.caminho),
      '%arquivo fora da pasta da empresa%', '22023');
  end loop;
  -- só 'pendente' (ou nulo) entra pela RPC: quem assina é o usuário, pela tela
  for r in select * from (values ('assinado'), (''), ('Pendente'), ('pendente ')) as e(valor) loop
    perform public.smoke_doc_recusa(
      public.smoke_doc_chamada(v_a, v_op_a, 'smoke:recusa', 'Recusa.pdf', v_pa || 'x.pdf', r.valor),
      '%assinatura inválida%', '22023');
  end loop;
  -- origem: obrigatória, sem ser só espaço, tabulação ou quebra de linha, e até 200 caracteres
  for r in
    select * from (values (null::text), (''), ('   '), (chr(9) || chr(10)), (' ' || chr(9) || chr(13) || chr(10)),
                          (repeat('x', 201))) as e(valor)
  loop
    perform public.smoke_doc_recusa(
      public.smoke_doc_chamada(v_a, v_op_a, r.valor, 'Recusa.pdf', v_pa || 'x.pdf'),
      '%origem inválida%', '22023');
  end loop;
  -- nome: obrigatório, sem ser só espaço, tabulação ou quebra de linha
  for r in select * from (values (null::text), (''), ('   '), (chr(9) || chr(10))) as e(valor) loop
    perform public.smoke_doc_recusa(
      public.smoke_doc_chamada(v_a, v_op_a, 'smoke:recusa', r.valor, v_pa || 'x.pdf'),
      '%nome inválido%', '22023');
  end loop;
  -- empresa e oportunidade são obrigatórias
  perform public.smoke_doc_recusa(
    public.smoke_doc_chamada(null, v_op_a, 'smoke:recusa', 'Recusa.pdf', v_pa || 'x.pdf'),
    '%empresa e oportunidade são obrigatórias%', '22023');
  perform public.smoke_doc_recusa(
    public.smoke_doc_chamada(v_a, null, 'smoke:recusa', 'Recusa.pdf', v_pa || 'x.pdf'),
    '%empresa e oportunidade são obrigatórias%', '22023');
  -- origem com 200 caracteres ainda passa
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, repeat('o', 200), 'Limite.pdf', v_pa || 'limite.pdf',
                                        'application/pdf', 100, null, null, null, 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null) then
    raise exception 'FALHOU: origem com 200 caracteres deveria ser aceita: %', v_r;
  end if;
  -- pontos seguidos dentro do NOME do arquivo não são ".." de caminho: passa (o nome saneado mantém os pontos)
  v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:pontos', 'Smoke Ltda..pdf', v_pa || 'Smoke_Ltda..pdf',
                                        'application/pdf', 100, null, null, null, 'Smoke');
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null) then
    raise exception 'FALHOU: nome de arquivo com pontos seguidos deveria ser aceito: %', v_r;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade where empresa_id in (v_a, v_b);
  if v_n <> v_antes + 2 then
    raise exception 'FALHOU: as recusas gravaram linha (havia %, agora %; esperado só a de 200 caracteres e a dos pontos)', v_antes, v_n;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade where origem = 'smoke:recusa';
  if v_n <> 0 then raise exception 'FALHOU: uma chamada recusada gravou % linha(s)', v_n; end if;
  raise notice '[8] recusas da RPC: pasta da empresa (só a pasta, "." e ".."), lista branca da ref (tab/LF/CR, barra invertida, %%, espaço, acento), assinatura, origem, nome e empresa/oportunidade nulas';

  -- 9. o índice único e os CHECKs de arquivo_oportunidade ----------------------------------------------------------------
  -- a chave é (empresa_id, oportunidade_id, origem), entre as linhas vivas com origem
  perform public.smoke_doc_recusa(format(
    'insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem) values (%L, %L, %L, %L, %L)',
    v_a, v_op_a, 'Duplicada', v_ref1, 'smoke:doc'), '%arquivo_oportunidade_origem_uidx%', '23505');
  -- a regra vale dentro de cada empresa: a linha da B (passo 6) também não se repete
  perform public.smoke_doc_recusa(format(
    'insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem) values (%L, %L, %L, %L, %L)',
    v_b, v_op_a, 'Intrusa duplicada', v_pb || 'intrusa-dup.pdf', 'smoke:outro'),
    '%arquivo_oportunidade_origem_uidx%', '23505');
  -- origem nula repete (os arquivos enviados pela tela), e a linha excluída não entra na regra
  insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url)
  values (v_a, v_op_a, 'Da tela 1', v_pa || 'tela-1.pdf'),
         (v_a, v_op_a, 'Da tela 2', v_pa || 'tela-2.pdf');
  insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem, deleted_at)
  values (v_a, v_op_a, 'Excluída', v_pa || 'excluida.pdf', 'smoke:doc', now());
  -- arquivo movido para o projeto: a tela grava oportunidade_id = null (Oportunidades.jsx) e a origem fica na
  -- linha. Duas linhas vivas com a mesma origem e SEM oportunidade convivem (nulo não repete no índice).
  insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem)
  values (v_a, v_op_a, 'Movido 1', v_pa || 'movido-1.pdf', 'smoke:movido'),
         (v_a, v_op_a2, 'Movido 2', v_pa || 'movido-2.pdf', 'smoke:movido');
  begin
    update public.arquivo_oportunidade set oportunidade_id = null
     where empresa_id = v_a and origem = 'smoke:movido';
    get diagnostics v_n = row_count;
  exception when unique_violation then
    raise exception 'FALHOU: duas linhas com a mesma origem e sem oportunidade (movidas para o projeto) colidiram no índice: %', sqlerrm;
  end;
  if v_n <> 2 then raise exception 'FALHOU: as 2 linhas movidas deveriam ficar sem oportunidade (linhas=%)', v_n; end if;
  select count(*) into v_n from public.arquivo_oportunidade
   where empresa_id = v_a and origem = 'smoke:movido' and oportunidade_id is null and deleted_at is null;
  if v_n <> 2 then raise exception 'FALHOU: deveria haver 2 linhas vivas movidas com a mesma origem, e há %', v_n; end if;
  perform public.smoke_doc_recusa(format(
    'insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem) values (%L, %L, %L, %L, %L)',
    v_a, v_op_a, 'Vazia', v_ref1, ''), '%arquivo_oportunidade_origem_check%', '23514');
  perform public.smoke_doc_recusa(format(
    'insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, origem) values (%L, %L, %L, %L, %L)',
    v_a, v_op_a, 'Comprida', v_ref1, repeat('x', 201)), '%arquivo_oportunidade_origem_check%', '23514');
  -- assinatura fora da lista, na criação e na alteração
  perform public.smoke_doc_recusa(format(
    'insert into public.arquivo_oportunidade (empresa_id, oportunidade_id, nome, url, assinatura) values (%L, %L, %L, %L, %L)',
    v_a, v_op_a, 'Assinatura inválida', v_ref1, 'talvez'), '%arquivo_oportunidade_assinatura_check%', '23514');
  perform public.smoke_doc_recusa(format(
    'update public.arquivo_oportunidade set assinatura = %L where id = %L', 'talvez', v_id),
    '%arquivo_oportunidade_assinatura_check%', '23514');
  select count(*) into v_n from public.arquivo_oportunidade
   where empresa_id = v_a and oportunidade_id = v_op_a and origem is null and nome in ('Da tela 1', 'Da tela 2');
  if v_n <> 2 then raise exception 'FALHOU: as duas linhas sem origem deveriam existir (há %)', v_n; end if;
  raise notice '[9] índice único parcial por empresa, oportunidade e origem (movidas para o projeto convivem) e CHECKs de origem e assinatura';

  -- 10. modelo_declaracao: chave, título, texto e empresa -----------------------------------------------------------
  insert into public.modelo_declaracao (empresa_id, chave, titulo, texto)
  values (v_a, 'smoke_modelo', 'Título do modelo', 'Texto do modelo')
  returning id into v_m1;
  perform public.smoke_doc_recusa(format(
    'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
    v_a, 'smoke_modelo', 'Outro título', 'Outro texto'), '%modelo_declaracao_chave_uidx%', '23505');
  -- a mesma chave em outra empresa, e na mesma depois de excluir a primeira, é permitida
  insert into public.modelo_declaracao (empresa_id, chave, titulo, texto)
  values (v_b, 'smoke_modelo', 'Título da B', 'Texto da B');
  update public.modelo_declaracao set deleted_at = now() where id = v_m1;
  insert into public.modelo_declaracao (empresa_id, chave, titulo, texto)
  values (v_a, 'smoke_modelo', 'Título depois de excluir', 'Texto depois de excluir');
  -- chave fora do padrão: maiúscula, espaço, hífen, curta, começando por número, vazia, com 61 caracteres
  for r in
    select * from (values ('ME EPP'), ('Maiuscula'), ('tem espaco'), ('tem-hifen'), ('a'), ('1abc'), (''),
                          ('a' || repeat('b', 60))) as e(chave)
  loop
    perform public.smoke_doc_recusa(format(
      'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
      v_a, r.chave, 'Título', 'Texto'), '%modelo_declaracao_chave_check%', '23514');
  end loop;
  -- o prefixo "edital_" é das declarações pedidas pelo edital: não é chave de modelo
  for r in
    select * from (values ('edital_teste'), ('edital_'), ('edital_declaracao_de_idoneidade')) as e(chave)
  loop
    perform public.smoke_doc_recusa(format(
      'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
      v_a, r.chave, 'Título', 'Texto'), '%modelo_declaracao_chave_reservada_chk%', '23514');
  end loop;
  -- só o prefixo é reservado: "edital" sem o sublinhado, ou no meio da chave, passa
  insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values
    (v_a, 'edital', 'Edital', 'Texto'),
    (v_a, 'editalx', 'Edital x', 'Texto'),
    (v_a, 'smoke_edital_x', 'Smoke edital', 'Texto');
  -- limites exatos aceitos: chave de 2 e de 60 caracteres, título de 200, texto de 20000
  insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values
    (v_a, 'ab', 'Chave de 2', 'Texto'),
    (v_a, 'a' || repeat('b', 59), 'Chave de 60', 'Texto'),
    (v_a, 'smoke_titulo_200', repeat('t', 200), 'Texto'),
    (v_a, 'smoke_texto_20000', 'Título', repeat('x', 20000));
  -- título: vazio, só espaços, só tabulação e quebra de linha, ou com 201 caracteres
  for r in
    select * from (values (''), ('   '), (chr(9) || chr(10)), (' ' || chr(9) || chr(13) || chr(10)),
                          (repeat('t', 201))) as e(titulo)
  loop
    perform public.smoke_doc_recusa(format(
      'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
      v_a, 'smoke_titulo_ruim', r.titulo, 'Texto'), '%modelo_declaracao_titulo_check%', '23514');
  end loop;
  -- texto: vazio, só espaços, só tabulação e quebra de linha, ou com 20001 caracteres
  for r in
    select * from (values (''), ('   '), (chr(9) || chr(10)), (' ' || chr(9) || chr(13) || chr(10)),
                          (repeat('x', 20001))) as e(texto)
  loop
    perform public.smoke_doc_recusa(format(
      'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
      v_a, 'smoke_texto_ruim', 'Título', r.texto), '%modelo_declaracao_texto_check%', '23514');
  end loop;
  -- empresa que não existe: a chave estrangeira recusa
  perform public.smoke_doc_recusa(format(
    'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
    v_orf, 'smoke_sem_empresa', 'Título', 'Texto'), '%modelo_declaracao_empresa_id_fkey%', '23503');
  raise notice '[10] modelo_declaracao: chave única entre as vivas, formato da chave, prefixo reservado, limites de título e texto, empresa';

  -- 11. bucket: aceita .docx, .doc, .xls e .zip ------------------------------------------------------------------------
  select count(*) into v_n from storage.buckets
   where id = 'anexos-oportunidade'
     and (allowed_mime_types is null
          or allowed_mime_types @> array[
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/msword',
               'application/vnd.ms-excel',
               'application/zip',
               'application/x-zip-compressed']);
  if v_n <> 1 then
    raise exception 'FALHOU: o bucket anexos-oportunidade não aceita .docx, .doc, .xls e .zip (ou não existe)';
  end if;
  raise notice '[11] bucket anexos-oportunidade aceita .docx, .doc, .xls e .zip';

  -- 12. a RPC é só do servidor --------------------------------------------------------------------------------------
  if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'FALHOU: anon/authenticated podem executar conector_gravar_arquivo';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'FALHOU: service_role sem EXECUTE em conector_gravar_arquivo';
  end if;
  -- o caminho REAL do servidor: a Edge Function chama a RPC com o papel service_role e o token de service_role.
  -- A função é security definer: grava o arquivo e exclui o texto por página com os direitos do dono.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin
    v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:servidor', 'Servidor.pdf', v_pa || 'servidor-1.pdf',
                                          'application/pdf', 100, v_pasta, null, 'pendente', 'Smoke servidor');
  exception when others then
    raise exception 'FALHOU: o servidor (service_role) deveria gravar o arquivo pela RPC, e veio: % (%)', sqlerrm, sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_r ->> 'arquivo_id' is null or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(false, false, null) then
    raise exception 'FALHOU: como service_role a RPC deveria criar o arquivo: %', v_r;
  end if;
  v_srv := (v_r ->> 'arquivo_id')::uuid;
  insert into public.arquivo_texto_pagina (empresa_id, arquivo_id, pagina, texto)
  values (v_a, v_srv, 1, 'Smoke: página 1 do arquivo do servidor');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin
    v_r := public.conector_gravar_arquivo(v_a, v_op_a, 'smoke:servidor', 'Servidor 2.pdf', v_pa || 'servidor-2.pdf',
                                          'application/pdf', 200, v_pasta, null, null, 'Smoke servidor');
  exception when others then
    raise exception 'FALHOU: o servidor (service_role) deveria trocar o arquivo pela RPC, e veio: % (%)', sqlerrm, sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if (v_r ->> 'arquivo_id')::uuid is distinct from v_srv
     or (v_r - 'arquivo_id') is distinct from public.smoke_doc_esperado(true, false, v_pa || 'servidor-1.pdf') then
    raise exception 'FALHOU: como service_role a RPC deveria trocar o arquivo no lugar: %', v_r;
  end if;
  select count(*) into v_n from public.arquivo_oportunidade a
   where a.id = v_srv and a.empresa_id = v_a and a.oportunidade_id = v_op_a and a.origem = 'smoke:servidor'
     and a.nome = 'Servidor 2.pdf' and a.url = v_pa || 'servidor-2.pdf' and a.tamanho = 200
     and a.assinatura is null and a.usuario_nome = 'Smoke servidor' and a.deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: o arquivo gravado como service_role não ficou como a RPC recebeu'; end if;
  select count(*) into v_n from public.arquivo_texto_pagina t
   where t.arquivo_id = v_srv and t.deleted_at is null;
  if v_n <> 0 then
    raise exception 'FALHOU: a troca feita como service_role deixou % página(s) de texto do arquivo antigo valendo', v_n;
  end if;
  -- com token de usuário, até o dono do banco (que tem EXECUTE) é recusado pela própria função
  perform set_config('request.jwt.claims', public.smoke_doc_claims('editar', v_a), true);
  perform public.smoke_doc_recusa(
    public.smoke_doc_chamada(v_a, v_op_a, 'smoke:guarda', 'Guarda.pdf', v_pa || 'guarda.pdf'),
    'Acesso negado', '42501');
  perform set_config('request.jwt.claims', '', true);
  -- authenticated e anon, que a tela e a API usam: sem EXECUTE
  perform set_config('request.jwt.claims', public.smoke_doc_claims('editar', v_a), true);
  set local role authenticated;
  perform public.smoke_doc_recusa(
    public.smoke_doc_chamada(v_a, v_op_a, 'smoke:guarda', 'Guarda.pdf', v_pa || 'guarda.pdf'),
    'permission denied for function conector_gravar_arquivo%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  perform public.smoke_doc_recusa(
    public.smoke_doc_chamada(v_a, v_op_a, 'smoke:guarda', 'Guarda.pdf', v_pa || 'guarda.pdf'),
    'permission denied for function conector_gravar_arquivo%', '42501');
  reset role;
  select count(*) into v_n from public.arquivo_oportunidade where origem = 'smoke:guarda';
  if v_n <> 0 then raise exception 'FALHOU: uma chamada recusada gravou % linha(s)', v_n; end if;
  raise notice '[12] a RPC só executa como servidor: service_role grava e troca; authenticated e anon sem EXECUTE; a função recusa token de usuário';

  -- 13. modelo_declaracao como authenticated --------------------------------------------------------------------------
  -- 13.1 as policies restritivas, cada uma no seu comando, e os privilégios da tabela
  for r in
    select * from (values
      ('modelo_declaracao_ler_com_permissao', 'SELECT'),
      ('modelo_declaracao_criar_com_permissao', 'INSERT'),
      ('modelo_declaracao_alterar_com_permissao', 'UPDATE')
    ) as e(nome, comando)
  loop
    select count(*) into v_n from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'modelo_declaracao' and p.policyname = r.nome
       and p.cmd = r.comando and p.permissive = 'RESTRICTIVE' and p.roles = '{authenticated}';
    if v_n <> 1 then
      raise exception 'FALHOU: a policy % deveria ser restritiva, de %, para authenticated, em modelo_declaracao',
        r.nome, r.comando;
    end if;
  end loop;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'modelo_declaracao' and permissive = 'RESTRICTIVE';
  if v_n <> 3 then raise exception 'FALHOU: % policies restritivas em modelo_declaracao (esperado 3)', v_n; end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'modelo_declaracao' and permissive = 'PERMISSIVE';
  if v_n <> 2 then raise exception 'FALHOU: % policies da empresa em modelo_declaracao (esperado 2)', v_n; end if;
  if not has_table_privilege('authenticated', 'public.modelo_declaracao', 'select')
     or not has_table_privilege('authenticated', 'public.modelo_declaracao', 'insert')
     or not has_table_privilege('authenticated', 'public.modelo_declaracao', 'update')
     or has_table_privilege('authenticated', 'public.modelo_declaracao', 'delete')
     or has_table_privilege('anon', 'public.modelo_declaracao', 'select')
     or not has_table_privilege('service_role', 'public.modelo_declaracao', 'delete') then
    raise exception 'FALHOU: privilégios de modelo_declaracao (authenticated: select, insert e update; sem delete; anon nada; service_role tudo)';
  end if;

  -- 13.2 quem tem Lista → editar cria (inclusive a substituição de um modelo padrão), altera, desativa e exclui
  perform set_config('request.jwt.claims', public.smoke_doc_claims('editar', v_a), true);
  set local role authenticated;
  begin
    insert into public.modelo_declaracao (empresa_id, chave, titulo, texto, ordem)
    values (v_a, 'nao_emprega_menor', 'Título editado', 'Texto editado {empresa}', 1)
    returning id into v_m3;
    insert into public.modelo_declaracao (empresa_id, chave, titulo, texto)
    values (v_a, 'smoke_proprio', 'Modelo próprio', 'Texto próprio')
    returning id into v_m4;
    update public.modelo_declaracao set titulo = 'Título editado 2' where id = v_m3;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a edição não atingiu o modelo (linhas=%)', v_n; end if;
    update public.modelo_declaracao set ativo = false where id = v_m4;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a desativação não atingiu o modelo (linhas=%)', v_n; end if;
    update public.modelo_declaracao set deleted_at = now() where id = v_m4;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a exclusão não atingiu o modelo (linhas=%)', v_n; end if;
    select count(*) into v_n from public.modelo_declaracao
     where id = v_m3 and titulo = 'Título editado 2' and ativo and deleted_at is null;
    if v_n <> 1 then raise exception 'o modelo editado não foi lido de volta'; end if;
  exception when others then
    raise exception 'FALHOU: quem tem Oportunidades → Lista → editar deveria criar, alterar, desativar e excluir modelo como authenticated, e veio: % (%)',
      sqlerrm, sqlstate;
  end;
  -- ninguém apaga de verdade pela API
  perform public.smoke_doc_recusa(format('delete from public.modelo_declaracao where id = %L', v_m3),
    'permission denied for table modelo_declaracao%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 13.3 quem só vê: lê, não cria, não altera e não exclui
  perform set_config('request.jwt.claims', public.smoke_doc_claims('ver', v_a), true);
  set local role authenticated;
  select count(*) into v_n from public.modelo_declaracao where id = v_m3;
  if v_n <> 1 then
    raise exception 'FALHOU: quem tem Oportunidades → Lista deveria ler o modelo (leu % de 1)', v_n;
  end if;
  perform public.smoke_doc_recusa(format(
    'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
    v_a, 'smoke_ver', 'Título', 'Texto'), '%row-level security%', '42501');
  update public.modelo_declaracao set titulo = 'Smoke mudou' where id = v_m3;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: quem só vê alterou % modelo(s)', v_n; end if;
  update public.modelo_declaracao set deleted_at = now() where id = v_m3;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: quem só vê excluiu % modelo(s)', v_n; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 13.4 quem não tem Oportunidades → Lista não lê nem grava
  perform set_config('request.jwt.claims', public.smoke_doc_claims('sem', v_a), true);
  set local role authenticated;
  select count(*) into v_n from public.modelo_declaracao where empresa_id = v_a;
  if v_n <> 0 then raise exception 'FALHOU: quem não tem Oportunidades → Lista leu % modelo(s)', v_n; end if;
  perform public.smoke_doc_recusa(format(
    'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
    v_a, 'smoke_sem', 'Título', 'Texto'), '%row-level security%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 13.5 o usuário que edita, com o token na empresa B (onde não tem vínculo): não lê nem grava, nem na A nem na B
  perform set_config('request.jwt.claims', public.smoke_doc_claims('editar', v_b), true);
  set local role authenticated;
  select count(*) into v_n from public.modelo_declaracao where empresa_id = v_a;
  if v_n <> 0 then raise exception 'FALHOU: com o token na empresa B o usuário leu % modelo(s) da A', v_n; end if;
  perform public.smoke_doc_recusa(format(
    'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
    v_a, 'smoke_outra_empresa', 'Título', 'Texto'), '%row-level security%', '42501');
  perform public.smoke_doc_recusa(format(
    'insert into public.modelo_declaracao (empresa_id, chave, titulo, texto) values (%L, %L, %L, %L)',
    v_b, 'smoke_outra_empresa', 'Título', 'Texto'), '%row-level security%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 13.6 o anon não lê
  set local role anon;
  perform public.smoke_doc_recusa('select count(*) from public.modelo_declaracao',
    'permission denied for table modelo_declaracao%', '42501');
  reset role;

  -- nada mudou por causa de quem só vê, de quem não tem permissão e da outra empresa
  select count(*) into v_n from public.modelo_declaracao
   where id = v_m3 and titulo = 'Título editado 2' and deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: o modelo mudou depois das tentativas de quem não podia gravar'; end if;
  raise notice '[13] modelos: quem edita cria, altera e exclui; quem só vê lê e não grava; sem permissão ou de outra empresa não lê';

  raise notice 'SMOKE TEST OK';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: documentos gerados (0161)' as res;

rollback;
