-- ============================================================================
-- seed-storage.sql — Buckets do Supabase Storage + policies multi-tenant
-- ============================================================================
-- Cada bucket tem isolamento por empresa_id usando a convenção de path:
--     <empresa_id>/<resto-do-caminho>
-- Ex: ferramentas/8a7b6c5d-.../IMG_1234.png
--
-- A policy garante que upload/download/delete só funciona se o JWT contém
-- empresa_id que bate com o primeiro segmento do path.
--
-- Service role (e super admin via claim) bypassam.
--
-- IMPORTANTE: aplicar APÓS as migrations 0001-0014 estarem prontas, porque
-- a função `public.current_empresa_id()` é criada na 0014.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: cria bucket privado se não existe + aplica policies padrão
-- ---------------------------------------------------------------------------
create or replace function public.ensure_tenant_bucket(bucket_name text)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  -- Cria o bucket (privado por padrão)
  insert into storage.buckets (id, name, public)
  values (bucket_name, bucket_name, false)
  on conflict (id) do nothing;

  -- Drop policies antigas (idempotente)
  execute format('drop policy if exists "%s_tenant_select" on storage.objects', bucket_name);
  execute format('drop policy if exists "%s_tenant_insert" on storage.objects', bucket_name);
  execute format('drop policy if exists "%s_tenant_update" on storage.objects', bucket_name);
  execute format('drop policy if exists "%s_tenant_delete" on storage.objects', bucket_name);
  execute format('drop policy if exists "%s_super_admin" on storage.objects', bucket_name);

  -- Policy: super admin pode tudo
  execute format($p$
    create policy "%s_super_admin" on storage.objects
      for all to authenticated
      using (bucket_id = %L and public.current_user_is_super_admin())
      with check (bucket_id = %L and public.current_user_is_super_admin())
  $p$, bucket_name, bucket_name, bucket_name);

  -- Policy: tenant SELECT — empresa_id é o 1º segmento do path
  execute format($p$
    create policy "%s_tenant_select" on storage.objects
      for select to authenticated
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
  $p$, bucket_name, bucket_name);

  -- Policy: tenant INSERT
  execute format($p$
    create policy "%s_tenant_insert" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
  $p$, bucket_name, bucket_name);

  -- Policy: tenant UPDATE
  execute format($p$
    create policy "%s_tenant_update" on storage.objects
      for update to authenticated
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
      with check (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
  $p$, bucket_name, bucket_name, bucket_name);

  -- Policy: tenant DELETE
  execute format($p$
    create policy "%s_tenant_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_empresa_id()::text
      )
  $p$, bucket_name, bucket_name);
end;
$$;

-- ============================================================================
-- Criar todos os buckets
-- ============================================================================

select public.ensure_tenant_bucket('comprovantes');         -- pre_lancamento, transacao_anexo
select public.ensure_tenant_bucket('certificados');         -- treinamento, ASOs, funcionario.treinamentos_anexos
select public.ensure_tenant_bucket('laudos');               -- laudo_ferramenta, ferramenta.laudo_url
select public.ensure_tenant_bucket('fotos-ferramentas');    -- ferramenta.foto_url
select public.ensure_tenant_bucket('fotos-materiais');      -- material.foto_url, kit
select public.ensure_tenant_bucket('fotos-funcionarios');   -- funcionario.foto_url
select public.ensure_tenant_bucket('documentos-assinados'); -- historico_documento_assinado
select public.ensure_tenant_bucket('anexos-cotacao');       -- arquivo_cotacao_fornecedor
select public.ensure_tenant_bucket('anexos-oportunidade');  -- arquivo_oportunidade
select public.ensure_tenant_bucket('logos-empresa');        -- empresa.logo_url, grupo_empresarial.logo_url
select public.ensure_tenant_bucket('comprovantes-pagamento'); -- fechamento_caixa.comprovante_pagamento_url
select public.ensure_tenant_bucket('diario-obra');          -- diario_obra.fotos
select public.ensure_tenant_bucket('inspecoes');            -- inspecao_*.itens_inspecao (fotos), inventario_historico.foto_url
select public.ensure_tenant_bucket('biometria');            -- funcionario.biometria_template (template binário)
select public.ensure_tenant_bucket('nfe-xml');              -- nota_fiscal_devolucao.xml_url
select public.ensure_tenant_bucket('nfe-pdf');              -- nota_fiscal_devolucao.pdf_url
select public.ensure_tenant_bucket('boletos');              -- boleto_bancario.url_boleto
select public.ensure_tenant_bucket('assinaturas');          -- movimentacao_ferramenta.assinatura_url
select public.ensure_tenant_bucket('templates');            -- gerarModeloProjetos, gerarModeloChecklistExcel

-- ============================================================================
-- ATENÇÃO: limite de tamanho por bucket
-- ============================================================================
-- Para limitar individualmente:
--   update storage.buckets set file_size_limit = 10485760 where id = 'fotos-ferramentas';
-- (10MB para fotos, 50MB para PDFs/certificados é razoável)

update storage.buckets set file_size_limit = 5242880   where id = 'fotos-ferramentas';     -- 5MB
update storage.buckets set file_size_limit = 5242880   where id = 'fotos-materiais';       -- 5MB
update storage.buckets set file_size_limit = 5242880   where id = 'fotos-funcionarios';    -- 5MB
update storage.buckets set file_size_limit = 5242880   where id = 'logos-empresa';         -- 5MB
update storage.buckets set file_size_limit = 10485760  where id = 'comprovantes';          -- 10MB
update storage.buckets set file_size_limit = 10485760  where id = 'comprovantes-pagamento';-- 10MB
update storage.buckets set file_size_limit = 10485760  where id = 'inspecoes';             -- 10MB
update storage.buckets set file_size_limit = 10485760  where id = 'diario-obra';           -- 10MB
update storage.buckets set file_size_limit = 10485760  where id = 'assinaturas';           -- 10MB
update storage.buckets set file_size_limit = 26214400  where id = 'certificados';          -- 25MB
update storage.buckets set file_size_limit = 26214400  where id = 'laudos';                -- 25MB
update storage.buckets set file_size_limit = 26214400  where id = 'documentos-assinados';  -- 25MB
update storage.buckets set file_size_limit = 26214400  where id = 'anexos-cotacao';        -- 25MB
update storage.buckets set file_size_limit = 26214400  where id = 'anexos-oportunidade';   -- 25MB
update storage.buckets set file_size_limit = 26214400  where id = 'boletos';               -- 25MB
update storage.buckets set file_size_limit = 26214400  where id = 'nfe-pdf';               -- 25MB
update storage.buckets set file_size_limit = 5242880   where id = 'nfe-xml';               -- 5MB
update storage.buckets set file_size_limit = 1048576   where id = 'biometria';             -- 1MB
update storage.buckets set file_size_limit = 52428800  where id = 'templates';             -- 50MB (planilhas, modelos PDF)

-- ============================================================================
-- MIME types permitidos (opcional, segurança extra)
-- ============================================================================
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id in ('fotos-ferramentas','fotos-materiais','fotos-funcionarios','logos-empresa');

update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
  where id in ('comprovantes','comprovantes-pagamento','inspecoes','diario-obra','assinaturas');

update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png']
  where id in ('certificados','laudos','documentos-assinados','anexos-cotacao','anexos-oportunidade','boletos','nfe-pdf');

update storage.buckets set allowed_mime_types = array['text/xml','application/xml']
  where id = 'nfe-xml';

-- ============================================================================
-- Verificação
-- ============================================================================
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
