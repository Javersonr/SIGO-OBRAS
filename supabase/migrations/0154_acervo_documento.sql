-- ============================================================================
-- 0154_acervo_documento.sql — biblioteca de documentos de habilitação (13/10/2026)
--   (spec docs/superpowers/specs/2026-10-09-habilitacao-documentos-automaticos-design.md §2)
--
-- Por quê: as certidões e os documentos da empresa (CND, FGTS, CNDT, falência, contrato
-- social, balanço, procurações…) viviam só no OneDrive, e o acervo guardava a validade em
-- texto (acervo_perfil.certidoes), sem o arquivo. Para o SIGO anexar a habilitação de uma
-- licitação sozinho, ele precisa do arquivo, do tipo e da validade de cada documento.
--
--   acervo_documento       um documento por linha, com a ref do arquivo no bucket "habilitacao";
--                          a versão nova aponta a anterior (substitui_id) e a desativa.
--   bucket "habilitacao"   privado, pasta da empresa, PDF/JPEG/PNG até 50 MB.
--
-- Quem lê e quem grava: os mesmos da tela do Acervo Técnico — ver exige
-- Oportunidades → Lista; gravar exige Oportunidades → Lista → editar. Aqui a regra é
-- conferida também no banco (policies restritivas na tabela e no bucket), porque os
-- arquivos são sensíveis (balanço, documentos do representante legal).
--
-- Só cria. Idempotente. acervo_perfil.certidoes continua existindo (o "Atende?" cai nele
-- quando a biblioteca está vazia).
-- ============================================================================

create table if not exists public.acervo_documento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  tipo text not null,
  nome text not null,
  arquivo_ref text not null,            -- "habilitacao/<empresa_id>/…"
  numero text,
  orgao_emissor text,
  emissao date,
  validade date,
  observacao text,
  substitui_id uuid references public.acervo_documento(id) on delete set null,
  ativo boolean not null default true,  -- false = substituído por uma versão mais nova
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint acervo_documento_tipo_check check (tipo in (
    'cnd_federal', 'cnd_estadual', 'cnd_municipal', 'crf_fgts', 'cndt_trabalhista',
    'certidao_falencia', 'certidao_crea_pj', 'certidao_junta', 'sicaf',
    'contrato_social', 'cartao_cnpj', 'inscricao_estadual', 'inscricao_municipal',
    'balanco_dre', 'alvara', 'procuracao', 'documento_representante', 'outro'
  )),
  constraint acervo_documento_nome_check check (char_length(btrim(nome)) between 1 and 200),
  constraint acervo_documento_ref_check
    check (arquivo_ref like 'habilitacao/' || empresa_id::text || '/%'),
  constraint acervo_documento_datas_check
    check (emissao is null or validade is null or validade >= emissao),
  constraint acervo_documento_substitui_check check (substitui_id is null or substitui_id <> id)
);

create index if not exists acervo_documento_empresa_tipo_idx
  on public.acervo_documento (empresa_id, tipo) where deleted_at is null;
create index if not exists acervo_documento_validade_idx
  on public.acervo_documento (empresa_id, validade) where deleted_at is null and ativo;

select attach_updated_at_trigger('acervo_documento');

comment on table public.acervo_documento is
  'Biblioteca de documentos de habilitação da empresa (certidões, contrato social, balanço…), com o arquivo no bucket habilitacao e a validade. A versão nova aponta a anterior em substitui_id.';
comment on column public.acervo_documento.arquivo_ref is
  'Referência "habilitacao/<empresa_id>/…" do arquivo no Storage (nunca URL assinada).';
comment on column public.acervo_documento.ativo is
  'false = substituído por uma versão mais nova (fica no histórico).';

-- RLS da empresa + grants (a tela grava e "apaga" com deleted_at pelo SDK) -----------------
do $rls$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'acervo_documento' and policyname = 'tenant_isolation'
  ) then
    perform public.apply_tenant_rls('acervo_documento');
  end if;
end $rls$;

revoke all on table public.acervo_documento from anon, authenticated;
grant select, insert, update on table public.acervo_documento to authenticated;
grant all on table public.acervo_documento to service_role;

-- Permissão da tela, conferida no banco (somada à policy da empresa) -----------------------
drop policy if exists acervo_documento_ler_com_permissao on public.acervo_documento;
create policy acervo_documento_ler_com_permissao on public.acervo_documento
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Oportunidades', 'Lista')));

drop policy if exists acervo_documento_criar_com_permissao on public.acervo_documento;
create policy acervo_documento_criar_com_permissao on public.acervo_documento
  as restrictive for insert to authenticated
  with check ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')));

drop policy if exists acervo_documento_alterar_com_permissao on public.acervo_documento;
create policy acervo_documento_alterar_com_permissao on public.acervo_documento
  as restrictive for update to authenticated
  using ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')))
  with check ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')));

-- O documento substituído tem de ser da MESMA empresa (0118) -------------------------------
drop trigger if exists referencias_da_empresa on public.acervo_documento;
create trigger referencias_da_empresa
  before insert or update of substitui_id, empresa_id on public.acervo_documento
  for each row execute function public.exigir_referencias_da_empresa('substitui_id:acervo_documento');

-- Versão nova: mesmo tipo do substituído, e o substituído deixa de ser o vigente -----------
-- Não é security definer: roda com os direitos de quem grava (a RLS continua valendo).
create or replace function public.acervo_documento_versionar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo text;
begin
  if new.substitui_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.substitui_id is not distinct from old.substitui_id then
    return null;
  end if;
  select a.tipo into v_tipo
    from public.acervo_documento a
   where a.id = new.substitui_id and a.empresa_id = new.empresa_id;
  if v_tipo is null then
    raise exception 'O documento substituído não existe nesta empresa' using errcode = '23503';
  end if;
  if v_tipo <> new.tipo then
    raise exception 'A versão nova tem de ser do mesmo tipo do documento substituído'
      using errcode = '23514';
  end if;
  update public.acervo_documento a
     set ativo = false
   where a.id = new.substitui_id and a.empresa_id = new.empresa_id and a.ativo;
  return null;
end;
$$;

revoke all on function public.acervo_documento_versionar() from public, anon, authenticated;

drop trigger if exists acervo_documento_versao on public.acervo_documento;
create trigger acervo_documento_versao
  after insert or update of substitui_id on public.acervo_documento
  for each row execute function public.acervo_documento_versionar();

-- Bucket privado por empresa (helper da 0108) ----------------------------------------------
select public.ensure_tenant_bucket('habilitacao');
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
 where id = 'habilitacao';

-- A mesma permissão da tabela, no Storage (somada às policies da pasta da empresa)
drop policy if exists habilitacao_ler_com_permissao on storage.objects;
create policy habilitacao_ler_com_permissao on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'habilitacao'
    or (select public.tem_permissao('Oportunidades', 'Lista'))
  );

drop policy if exists habilitacao_enviar_com_permissao on storage.objects;
create policy habilitacao_enviar_com_permissao on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'habilitacao'
    or (select public.tem_permissao('Oportunidades', 'Lista', 'editar'))
  );

drop policy if exists habilitacao_alterar_com_permissao on storage.objects;
create policy habilitacao_alterar_com_permissao on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'habilitacao'
    or (select public.tem_permissao('Oportunidades', 'Lista', 'editar'))
  )
  with check (
    bucket_id <> 'habilitacao'
    or (select public.tem_permissao('Oportunidades', 'Lista', 'editar'))
  );

drop policy if exists habilitacao_apagar_com_permissao on storage.objects;
create policy habilitacao_apagar_com_permissao on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'habilitacao'
    or (select public.tem_permissao('Oportunidades', 'Lista', 'editar'))
  );

notify pgrst, 'reload schema';

-- Conferência
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'habilitacao';
select policyname, permissive, cmd from pg_policies
 where (schemaname = 'public' and tablename = 'acervo_documento')
    or (schemaname = 'storage' and tablename = 'objects' and policyname like 'habilitacao%')
 order by tablename, policyname;

select 'ok' as res;
