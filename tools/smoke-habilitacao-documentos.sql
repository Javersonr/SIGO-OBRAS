-- ============================================================================
-- smoke-habilitacao-documentos.sql — valida a 0154 (biblioteca de habilitação)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria documentos
-- sintéticos ("Smoke …") e dois vínculos de usuário sintéticos (e-mails
-- @exemplo.test) para a empresa mais antiga da base, e simula cada usuário com
-- `set local role authenticated` + `request.jwt.claims`. Nada é persistido.
--
-- Usuários de teste (perfil Gestor: nem Admin nem dono):
--   editar      Oportunidades → Lista → visualizar e editar
--   ver         Oportunidades → Lista → visualizar
--   semvinculo  e-mail sem vínculo na empresa
--
-- O que confere:
--   1. a versão nova (substitui_id) desativa a anterior;
--   2. versão nova de outro tipo é recusada;
--   3. arquivo_ref fora da pasta da empresa é recusado;
--   4. tipo fora da lista é recusado;
--   5. substituir documento de outra empresa é recusado (quando há outra empresa);
--   6. cadeia de versões: o documento que já tem uma versão viva não ganha outra
--      (índice único); documento excluído, ou fora de vigor sem versão viva, não
--      é substituído; excluir uma versão do histórico não mexe na anterior;
--   7. excluir a versão em vigor devolve a anterior; restaurá-la desativa a
--      anterior de novo; com outra versão viva no lugar, a restauração é
--      recusada pelo índice único;
--   8. o bucket "habilitacao" existe, privado, com 50 MB e só PDF/JPEG/PNG;
--   9. as policies restritivas existem, cada uma no seu comando (3 na tabela:
--      SELECT, INSERT e UPDATE; 4 no bucket: SELECT, INSERT, UPDATE e DELETE);
--  10. a escrita LEGÍTIMA como authenticated: quem tem Lista → editar cria,
--      faz a versão nova (o trigger desativa a anterior com os direitos dele),
--      edita e exclui (a anterior volta a valer);
--  11. quem só vê lê, mas não cria (RLS) nem altera (o UPDATE não atinge linha);
--  12. o usuário que edita, com o token em OUTRA empresa, não lê nem grava os
--      documentos desta (quando há outra empresa);
--  13. um usuário sem vínculo na empresa não lê nem grava.
-- Nenhum UUID fixo: as empresas são escolhidas em tempo de execução.
--
-- Como rodar (com a 0154 já aplicada; quem roda é o Javerson):
--   npx supabase@2.118.0 db query --linked -f tools/smoke-habilitacao-documentos.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- exige que o comando seja RECUSADO com o estado e a mensagem esperados; some no ROLLBACK
-- (o estado sozinho não basta: 42501 também é o "permission denied" de um grant que falta)
create or replace function public.smoke_hab_recusa(p_sql text, p_msg text, p_estado text)
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
create or replace function public.smoke_hab_claims(p_quem text, p_empresa uuid)
returns text
language sql
as $f$
  select jsonb_build_object(
    'role', 'authenticated',
    'sub', md5('smoke-hab-' || p_quem)::uuid,
    'email', 'smoke.hab.' || p_quem || '@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', p_empresa)
  )::text;
$f$;

do $$
declare
  v_empresa uuid;
  v_outra uuid;
  v_ref text;
  v_a uuid;        -- CND 1
  v_b uuid;        -- CND 2 (substitui a 1)
  v_c uuid;        -- CND 3 (substitui a 1, depois de a 2 ser excluída)
  v_x uuid;        -- FGTS excluído
  v_p1 uuid;       -- CNDT 1
  v_p2 uuid;       -- CNDT 2 (substitui a 1)
  v_p3 uuid;       -- CNDT 3 (substitui a 2)
  v_de_outra uuid; -- documento de outra empresa
  v_e1 uuid;       -- cartão CNPJ 1, gravado pelo usuário que edita
  v_e2 uuid;       -- cartão CNPJ 2 (substitui o 1), gravado pelo usuário que edita
  v_n bigint;
  r record;
begin
  if to_regclass('public.acervo_documento') is null then
    raise exception 'Falta a migração 0154 (public.acervo_documento): aplique antes de rodar este smoke.';
  end if;

  select e.id into v_empresa from public.empresa e where e.deleted_at is null order by e.created_at limit 1;
  if v_empresa is null then raise exception 'Sem empresa para testar.'; end if;
  select e.id into v_outra from public.empresa e
   where e.deleted_at is null and e.id <> v_empresa order by e.created_at limit 1;
  v_ref := 'habilitacao/' || v_empresa::text || '/2026/10/smoke-documento.pdf';

  -- 1. a versão nova desativa a anterior
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade)
  values (v_empresa, 'cnd_federal', 'Smoke CND 1', v_ref, current_date + 5)
  returning id into v_a;
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade, substitui_id)
  values (v_empresa, 'cnd_federal', 'Smoke CND 2', v_ref, current_date + 180, v_a)
  returning id into v_b;
  select count(*) into v_n from public.acervo_documento where id = v_a and ativo = false;
  if v_n <> 1 then raise exception 'FALHOU: a versão anterior continuou ativa'; end if;
  select count(*) into v_n from public.acervo_documento where id = v_b and ativo = true;
  if v_n <> 1 then raise exception 'FALHOU: a versão nova não ficou ativa'; end if;
  raise notice '[1] versão nova desativa a anterior';

  -- 2. versão nova de outro tipo
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id) values (%L, %L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke FGTS', v_ref, v_b), '%mesmo tipo%', '23514');
  raise notice '[2] tipo diferente recusado';

  -- 3. arquivo fora da pasta da empresa
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke FGTS', 'habilitacao/' || gen_random_uuid()::text || '/x.pdf'),
    '%acervo_documento_ref_check%', '23514');
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke FGTS', 'certificados/' || v_empresa::text || '/x.pdf'),
    '%acervo_documento_ref_check%', '23514');
  raise notice '[3] ref fora da pasta recusada';

  -- 4. tipo fora da lista
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
    v_empresa, 'inventado', 'Smoke', v_ref), '%acervo_documento_tipo_check%', '23514');
  raise notice '[4] tipo fora da lista recusado';

  -- 5. substituir documento de outra empresa
  if v_outra is not null then
    insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref)
    values (v_outra, 'cnd_federal', 'Smoke outra empresa',
            'habilitacao/' || v_outra::text || '/2026/10/smoke.pdf')
    returning id into v_de_outra;
    perform public.smoke_hab_recusa(format(
      'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id) values (%L, %L, %L, %L, %L)',
      v_empresa, 'cnd_federal', 'Smoke CND de outra', v_ref, v_de_outra), '%outra empresa%', '42501');
    raise notice '[5] documento de outra empresa recusado';
  else
    raise notice '[5] PULADO: só há uma empresa na base';
  end if;

  -- 6. cadeia de versões íntegra
  -- 6.1 a CND 1 já tem uma versão viva (a CND 2): outra versão viva dela é barrada pelo índice único, na
  --     gravação da linha (antes do trigger, que é AFTER)
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id) values (%L, %L, %L, %L, %L)',
    v_empresa, 'cnd_federal', 'Smoke CND repetida', v_ref, v_a),
    '%acervo_documento_substitui_uidx%', '23505');

  -- 6.2 documento excluído não é substituído (nenhuma versão viva aponta para ele: quem recusa é o trigger)
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref)
  values (v_empresa, 'crf_fgts', 'Smoke FGTS excluído', v_ref)
  returning id into v_x;
  update public.acervo_documento set deleted_at = now() where id = v_x;
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id) values (%L, %L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke FGTS novo', v_ref, v_x), '%não está em vigor%', '23514');

  -- 6.3 documento fora de vigor e sem versão viva: CNDT 1 ← CNDT 2 ← CNDT 3, e a 2 (histórico) é excluída.
  --     Excluir versão do histórico não devolve a anterior (a 3 continua em vigor), e a 1 não é substituída.
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref)
  values (v_empresa, 'cndt_trabalhista', 'Smoke CNDT 1', v_ref)
  returning id into v_p1;
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id)
  values (v_empresa, 'cndt_trabalhista', 'Smoke CNDT 2', v_ref, v_p1)
  returning id into v_p2;
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id)
  values (v_empresa, 'cndt_trabalhista', 'Smoke CNDT 3', v_ref, v_p2)
  returning id into v_p3;
  update public.acervo_documento set deleted_at = now() where id = v_p2;
  select count(*) into v_n from public.acervo_documento
   where (id = v_p1 and ativo = false) or (id = v_p3 and ativo = true and deleted_at is null);
  if v_n <> 2 then
    raise exception 'FALHOU: excluir uma versão do histórico mexeu em quem está em vigor (certos: % de 2)', v_n;
  end if;
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, substitui_id) values (%L, %L, %L, %L, %L)',
    v_empresa, 'cndt_trabalhista', 'Smoke CNDT 4', v_ref, v_p1), '%não está em vigor%', '23514');
  raise notice '[6] cadeia íntegra: uma versão viva por documento; só documento em vigor é substituído';

  -- 7. excluir a versão em vigor devolve a anterior; restaurar desativa a anterior de novo
  update public.acervo_documento set deleted_at = now() where id = v_b;
  select count(*) into v_n from public.acervo_documento
   where id = v_a and ativo = true and deleted_at is null;
  if v_n <> 1 then raise exception 'FALHOU: excluir a versão em vigor não devolveu a anterior'; end if;
  update public.acervo_documento set deleted_at = null where id = v_b;
  select count(*) into v_n from public.acervo_documento
   where (id = v_a and ativo = false) or (id = v_b and ativo = true and deleted_at is null);
  if v_n <> 2 then
    raise exception 'FALHOU: restaurar a versão não desativou a anterior de novo (certos: % de 2)', v_n;
  end if;
  -- com outra versão viva no lugar (a CND 3), a excluída não volta: o índice único recusa a restauração
  update public.acervo_documento set deleted_at = now() where id = v_b;
  insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade, substitui_id)
  values (v_empresa, 'cnd_federal', 'Smoke CND 3', v_ref, current_date + 180, v_a)
  returning id into v_c;
  select count(*) into v_n from public.acervo_documento
   where (id = v_a and ativo = false) or (id = v_c and ativo = true and deleted_at is null);
  if v_n <> 2 then
    raise exception 'FALHOU: a anterior, de volta ao vigor, deveria aceitar a versão nova (certos: % de 2)', v_n;
  end if;
  perform public.smoke_hab_recusa(format(
    'update public.acervo_documento set deleted_at = null where id = %L', v_b),
    '%acervo_documento_substitui_uidx%', '23505');
  raise notice '[7] excluir a versão em vigor devolve a anterior; restaurar desativa de novo';

  -- 8. bucket: privado, 50 MB e exatamente os três tipos
  select count(*) into v_n from storage.buckets
   where id = 'habilitacao' and public = false and file_size_limit = 52428800
     and allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png']
     and allowed_mime_types <@ array['application/pdf', 'image/jpeg', 'image/png'];
  if v_n <> 1 then raise exception 'FALHOU: bucket habilitacao ausente ou com outra configuração'; end if;
  raise notice '[8] bucket ok';

  -- 9. policies restritivas: cada uma pelo nome, no seu comando
  for r in
    select * from (values
      ('public', 'acervo_documento', 'acervo_documento_ler_com_permissao', 'SELECT'),
      ('public', 'acervo_documento', 'acervo_documento_criar_com_permissao', 'INSERT'),
      ('public', 'acervo_documento', 'acervo_documento_alterar_com_permissao', 'UPDATE'),
      ('storage', 'objects', 'habilitacao_ler_com_permissao', 'SELECT'),
      ('storage', 'objects', 'habilitacao_enviar_com_permissao', 'INSERT'),
      ('storage', 'objects', 'habilitacao_alterar_com_permissao', 'UPDATE'),
      ('storage', 'objects', 'habilitacao_apagar_com_permissao', 'DELETE')
    ) as e(esquema, tabela, nome, comando)
  loop
    select count(*) into v_n from pg_policies p
     where p.schemaname = r.esquema and p.tablename = r.tabela and p.policyname = r.nome
       and p.cmd = r.comando and p.permissive = 'RESTRICTIVE' and p.roles = '{authenticated}';
    if v_n <> 1 then
      raise exception 'FALHOU: a policy % deveria ser restritiva, de %, para authenticated, em %.%',
        r.nome, r.comando, r.esquema, r.tabela;
    end if;
  end loop;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'acervo_documento' and permissive = 'RESTRICTIVE';
  if v_n <> 3 then raise exception 'FALHOU: % policies restritivas na tabela (esperado 3)', v_n; end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'habilitacao%com_permissao' and permissive = 'RESTRICTIVE';
  if v_n <> 4 then raise exception 'FALHOU: % policies restritivas no bucket (esperado 4)', v_n; end if;
  raise notice '[9] policies ok';

  -- 10. a escrita legítima como authenticated ----------------------------------------------------------------
  -- vínculos sintéticos (como servidor: sem token). Gestor não é Admin nem dono: valem as permissões.
  insert into public.usuario_empresa (empresa_id, usuario_email, perfil, ativo, permissoes, nome_completo)
    select v_empresa, 'smoke.hab.' || u.quem || '@exemplo.test', 'Gestor', true, u.permissoes, 'Smoke Habilitação'
      from (values
        ('editar', '{"Oportunidades":{"Lista":{"visualizar":true,"editar":true}}}'::jsonb),
        ('ver', '{"Oportunidades":{"Lista":{"visualizar":true}}}'::jsonb)
      ) as u(quem, permissoes);

  -- O trigger acervo_documento_versao não é SECURITY DEFINER: roda como authenticated, sob a RLS. Um grant ou
  -- uma policy que falte derruba o INSERT/UPDATE de quem pode gravar, e só este passo pega.
  perform set_config('request.jwt.claims', public.smoke_hab_claims('editar', v_empresa), true);
  set local role authenticated;
  begin
    insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade)
    values (v_empresa, 'cartao_cnpj', 'Smoke CNPJ 1', v_ref, current_date + 30)
    returning id into v_e1;
    insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref, validade, substitui_id)
    values (v_empresa, 'cartao_cnpj', 'Smoke CNPJ 2', v_ref, current_date + 365, v_e1)
    returning id into v_e2;
    select count(*) into v_n from public.acervo_documento where id = v_e1 and ativo = false;
    if v_n <> 1 then raise exception 'a versão nova não desativou a anterior'; end if;
    update public.acervo_documento set nome = 'Smoke CNPJ 2 (editado)' where id = v_e2;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a edição não atingiu o documento (linhas=%)', v_n; end if;
    update public.acervo_documento set deleted_at = now() where id = v_e2;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'a exclusão não atingiu o documento (linhas=%)', v_n; end if;
    select count(*) into v_n from public.acervo_documento
     where id = v_e1 and ativo = true and deleted_at is null;
    if v_n <> 1 then raise exception 'excluir a versão em vigor não devolveu a anterior'; end if;
  exception when others then
    raise exception 'FALHOU: quem tem Oportunidades → Lista → editar deveria criar, fazer versão nova, editar e excluir como authenticated, e veio: % (%)',
      sqlerrm, sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[10] quem edita cria, faz versão nova, edita e exclui como authenticated';

  -- 11. quem só vê: lê, não cria e não altera
  perform set_config('request.jwt.claims', public.smoke_hab_claims('ver', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.acervo_documento where id in (v_a, v_e1);
  if v_n <> 2 then
    raise exception 'FALHOU: quem tem Oportunidades → Lista deveria ler os documentos (leu % de 2)', v_n;
  end if;
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke só vê', v_ref), '%row-level security%', '42501');
  update public.acervo_documento set nome = 'Smoke mudou' where id = v_e1;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: quem só vê alterou % documento(s)', v_n; end if;
  update public.acervo_documento set deleted_at = now() where id = v_e1;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: quem só vê excluiu % documento(s)', v_n; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[11] quem só vê lê, mas não cria nem altera';

  -- 12. o usuário que edita, com o token em OUTRA empresa: não lê nem grava os documentos desta
  if v_outra is not null then
    perform set_config('request.jwt.claims', public.smoke_hab_claims('editar', v_outra), true);
    set local role authenticated;
    select count(*) into v_n from public.acervo_documento where empresa_id = v_empresa;
    if v_n <> 0 then
      raise exception 'FALHOU: com o token em outra empresa, o usuário leu % documento(s) desta', v_n;
    end if;
    perform public.smoke_hab_recusa(format(
      'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
      v_empresa, 'crf_fgts', 'Smoke token de outra empresa', v_ref), '%row-level security%', '42501');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    raise notice '[12] token de outra empresa: não lê nem grava';
  else
    raise notice '[12] PULADO: só há uma empresa na base';
  end if;

  -- 13. usuário sem vínculo na empresa: não lê nem grava
  perform set_config('request.jwt.claims', public.smoke_hab_claims('semvinculo', v_empresa), true);
  set local role authenticated;
  select count(*) into v_n from public.acervo_documento where id in (v_a, v_e1);
  if v_n <> 0 then raise exception 'FALHOU: usuário sem a permissão leu % documento(s)', v_n; end if;
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke sem permissão', v_ref), '%row-level security%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[13] sem vínculo: não lê nem grava';

  raise notice 'SMOKE TEST OK';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: biblioteca de habilitação (0154)' as res;

rollback;
