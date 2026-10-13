-- ============================================================================
-- smoke-habilitacao-documentos.sql — valida a 0154 (biblioteca de habilitação)
--
-- Roda TUDO dentro de uma transação que termina em ROLLBACK: cria documentos
-- sintéticos ("Smoke …") para a empresa mais antiga da base e confere:
--   1. a versão nova (substitui_id) desativa a anterior;
--   2. versão nova de outro tipo é recusada;
--   3. arquivo_ref fora da pasta da empresa é recusado;
--   4. tipo fora da lista é recusado;
--   5. substituir documento de outra empresa é recusado (quando há outra empresa);
--   6. o bucket "habilitacao" existe, privado, com 50 MB e PDF/JPEG/PNG;
--   7. as policies restritivas existem (3 na tabela e 4 no bucket);
--   8. um usuário sem vínculo na empresa não lê nem grava.
-- Nenhum UUID fixo: as empresas são escolhidas em tempo de execução. Nada é persistido.
--
-- Como rodar (com a 0154 já aplicada; quem roda é o Javerson):
--   supabase db query --linked -f tools/smoke-habilitacao-documentos.sql
-- Deve terminar imprimindo "SMOKE TEST OK".
-- ============================================================================

begin;

-- exige que o comando seja RECUSADO com o estado e a mensagem esperados; some no ROLLBACK
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

do $$
declare
  v_empresa uuid;
  v_outra uuid;
  v_ref text;
  v_a uuid;
  v_b uuid;
  v_de_outra uuid;
  v_n int;
begin
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
      v_empresa, 'cnd_federal', 'Smoke CND 3', v_ref, v_de_outra), '%outra empresa%', '42501');
    raise notice '[5] documento de outra empresa recusado';
  else
    raise notice '[5] PULADO: só há uma empresa na base';
  end if;

  -- 6. bucket
  select count(*) into v_n from storage.buckets
   where id = 'habilitacao' and public = false and file_size_limit = 52428800
     and allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png'];
  if v_n <> 1 then raise exception 'FALHOU: bucket habilitacao ausente ou com outra configuração'; end if;
  raise notice '[6] bucket ok';

  -- 7. policies restritivas
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'acervo_documento' and permissive = 'RESTRICTIVE';
  if v_n <> 3 then raise exception 'FALHOU: % policies restritivas na tabela (esperado 3)', v_n; end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'habilitacao%com_permissao' and permissive = 'RESTRICTIVE';
  if v_n <> 4 then raise exception 'FALHOU: % policies restritivas no bucket (esperado 4)', v_n; end if;
  raise notice '[7] policies ok';

  -- 8. usuário sem vínculo na empresa: não lê nem grava
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', gen_random_uuid(), 'email', 'smoke.habilitacao@exemplo.test',
    'app_metadata', jsonb_build_object('empresa_id', v_empresa))::text, true);
  set local role authenticated;
  select count(*) into v_n from public.acervo_documento where id in (v_a, v_b);
  if v_n <> 0 then raise exception 'FALHOU: usuário sem a permissão leu % documento(s)', v_n; end if;
  perform public.smoke_hab_recusa(format(
    'insert into public.acervo_documento (empresa_id, tipo, nome, arquivo_ref) values (%L, %L, %L, %L)',
    v_empresa, 'crf_fgts', 'Smoke sem permissão', v_ref), '%row-level security%', '42501');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice '[8] sem permissão: não lê nem grava';

  raise notice 'SMOKE TEST OK';
end;
$$;

-- só chega aqui se o bloco acima terminou sem erro
select 'SMOKE TEST OK: biblioteca de habilitação (0154)' as res;

rollback;
