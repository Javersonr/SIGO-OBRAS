-- ============================================================================
-- 0161_documentos_gerados.sql — arquivos da oportunidade gravados pelo servidor,
-- assinatura pendente e modelos de declaração (13/10/2026)
--   (spec docs/superpowers/specs/2026-10-09-habilitacao-documentos-automaticos-design.md §3 e §4)
--   Renumerada em 20/10/2026 (era 0156): a auditoria financeira foi publicada em 17/10
--   com 0154–0158. Nunca tinha sido aplicada com o número antigo.
--
-- Por quê: o Claude não consegue enviar arquivo ao SIGO (a rede do ambiente dele bloqueia o
-- Storage). O servidor passa a gerar, copiar ou baixar os arquivos da licitação e a gravá-los
-- nos Arquivos da oportunidade. Para isso:
--
--   arquivo_oportunidade.origem      identifica o documento dentro da oportunidade
--                                    ("gerado:proposta:pdf", "biblioteca:<id>", "acervo:<id>",
--                                    "declaracao:<chave>:pdf", "url:<hash>"): repetir a ferramenta
--                                    troca o arquivo no lugar, sem duplicar.
--   arquivo_oportunidade.assinatura  'pendente' = gerado com o bloco de assinatura e ainda não
--                                    assinado ("falta assinar"); 'assinado' = o usuário enviou a
--                                    versão assinada (gov.br ou certificado). A tela grava o
--                                    'assinado' (UPDATE comum, sob a RLS da empresa).
--   bucket anexos-oportunidade       aceita também .docx, .doc, .xls e .zip (declaração em Word
--                                    e edital baixado pelo link).
--   modelo_declaracao                modelos de declaração editados ou criados pela empresa (os
--                                    seis padrão ficam no código e valem sem linha aqui). Ler exige
--                                    Oportunidades → Lista; gravar exige Oportunidades → Lista →
--                                    editar (como a biblioteca, 0159), conferido no banco. Chave
--                                    com o prefixo "edital_" é recusada: ele é das declarações
--                                    pedidas pelo edital, que não viram modelo.
--   conector_gravar_arquivo          grava ou troca o arquivo numa transação; arquivo já
--                                    assinado não é trocado. Só o servidor chama.
--
-- Índice único parcial (empresa_id, oportunidade_id, origem), entre as linhas vivas com origem:
--   * "origem" é nula em TODAS as linhas de hoje (a coluna nasce agora), então o índice nasce
--     vazio e a criação não pode falhar por duplicata;
--   * a empresa faz parte da chave porque arquivo_oportunidade.oportunidade_id não tem chave
--     estrangeira (caiu na 0021) nem trigger de conferência: um usuário de OUTRA empresa consegue
--     gravar, pela API, uma linha da empresa dele apontando para uma oportunidade daqui com a mesma
--     origem. A RPC procura o arquivo pela empresa; com o índice sem a empresa, ela não acharia
--     essa linha e a gravação desta empresa estouraria 23505 para sempre;
--   * quando a oportunidade vira projeto, quem leva os arquivos é a TELA
--     (apps/web/src/pages/Oportunidades.jsx grava projeto_id e oportunidade_id = null em cada
--     arquivo; a função do banco que fazia isso, da 0029/0030, foi removida na 0085). A origem
--     continua na linha movida. Nulo não repete no índice, então as linhas movidas não colidem
--     entre si, e a RPC (que procura pela oportunidade) deixa de vê-las: repetir a ferramenta
--     naquela oportunidade grava um arquivo novo.
--
-- Texto por página (arquivo_texto_pagina, 0149): ele é guardado pelo arquivo_id, e a troca no lugar
-- mantém o arquivo_id com OUTRO arquivo dentro. Sem limpar, o ler_edital_anexado devolveria o texto
-- do arquivo antigo como se fosse do novo, sem aviso. Por isso a troca exclui (deleted_at), na mesma
-- transação, as páginas daquele arquivo: o conector passa a responder "sem_texto" até o usuário
-- usar "Preparar para o Claude" de novo. Quando o arquivo assinado é mantido, nada é trocado e o
-- texto fica.
--
-- Aditiva e idempotente. Nada do que existe muda de comportamento: origem e assinatura
-- nascem nulas nos arquivos atuais. Se a coluna já existir de uma aplicação anterior, o
-- "add column if not exists" pula também o CHECK dela. Roda numa transação só (begin … commit).
-- Ordem: primeiro o que é novo (bucket, modelo_declaracao e a função) e, por ÚLTIMO, o ALTER TABLE
-- e o índice em arquivo_oportunidade, para a trava exclusiva da tabela em uso ficar presa pelo
-- menor tempo possível. A função pode nascer antes das colunas: o plpgsql só resolve tabelas e
-- colunas quando a função roda (não há %TYPE nem %ROWTYPE no corpo).
-- lock_timeout: o ALTER TABLE e o índice em arquivo_oportunidade, e a chave estrangeira da tabela
-- nova para empresa, pedem trava forte em tabela em uso; sem ela em 10 s, desfaz tudo e é só
-- aplicar de novo.
-- ============================================================================

begin;
set local lock_timeout = '10s';

-- Bucket: Word, Excel antigo e ZIP (não restringe o que hoje está livre) ---------------------
update storage.buckets
   set allowed_mime_types = case when allowed_mime_types is null then null
         else (select array(select distinct unnest(allowed_mime_types || array[
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/msword',
           'application/vnd.ms-excel',
           'application/zip',
           'application/x-zip-compressed'
         ]))) end
 where id = 'anexos-oportunidade';

-- Modelos de declaração da empresa ------------------------------------------------------------
create table if not exists public.modelo_declaracao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  chave text not null,
  titulo text not null,
  texto text not null,
  ativo boolean not null default true,
  ordem integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- a mesma regra da chave no TypeScript (CHAVE_MODELO em declaracoes.ts): 2 a 60 caracteres
  constraint modelo_declaracao_chave_check check (chave ~ '^[a-z][a-z0-9_]{1,59}$'),
  -- "edital_" é o prefixo das declarações pedidas pelo edital (chaveDoItem em declaracoes.ts):
  -- reservado, não é chave de modelo (a tela já recusa; o banco espelha)
  constraint modelo_declaracao_chave_reservada_chk check (chave !~ '^edital_'),
  -- título e texto: ao menos um caractere que não seja espaço, tabulação ou quebra de linha
  -- (a tela e o servidor recusam o que sobra vazio depois do trim)
  constraint modelo_declaracao_titulo_check
    check (char_length(btrim(titulo)) between 1 and 200 and titulo ~ '\S'),
  constraint modelo_declaracao_texto_check
    check (char_length(texto) between 1 and 20000 and texto ~ '\S')
);
create unique index if not exists modelo_declaracao_chave_uidx
  on public.modelo_declaracao (empresa_id, chave) where deleted_at is null;
select attach_updated_at_trigger('modelo_declaracao');

comment on table public.modelo_declaracao is
  'Modelos de declaração de habilitação editados ou criados pela empresa. A linha com a chave de um dos seis modelos padrão (que ficam no código) substitui o padrão; outra chave é modelo próprio (o prefixo edital_ é reservado às declarações pedidas pelo edital). Variáveis: {empresa} {cnpj} {endereco} {orgao} {edital} {objeto} {local} {data} {representante} {cargo} {cpf}.';

do $rls$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'modelo_declaracao' and policyname = 'tenant_isolation'
  ) then
    perform public.apply_tenant_rls('modelo_declaracao');
  end if;
end $rls$;

-- a tela grava e "apaga" (deleted_at) pelo SDK; ninguém apaga de verdade pela API
revoke all on table public.modelo_declaracao from anon, authenticated;
grant select, insert, update on table public.modelo_declaracao to authenticated;
grant all on table public.modelo_declaracao to service_role;

-- Permissão da tela, conferida no banco (somada à policy da empresa), como na 0159 ---------------
drop policy if exists modelo_declaracao_ler_com_permissao on public.modelo_declaracao;
create policy modelo_declaracao_ler_com_permissao on public.modelo_declaracao
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Oportunidades', 'Lista')));

drop policy if exists modelo_declaracao_criar_com_permissao on public.modelo_declaracao;
create policy modelo_declaracao_criar_com_permissao on public.modelo_declaracao
  as restrictive for insert to authenticated
  with check ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')));

drop policy if exists modelo_declaracao_alterar_com_permissao on public.modelo_declaracao;
create policy modelo_declaracao_alterar_com_permissao on public.modelo_declaracao
  as restrictive for update to authenticated
  using ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')))
  with check ((select public.tem_permissao('Oportunidades', 'Lista', 'editar')));

-- Gravação atômica do arquivo gerado, copiado ou baixado pelo servidor -----------------------
-- A empresa e a oportunidade vêm SEMPRE dos parâmetros (a camada do conector injeta p_empresa_id
-- da chave). security definer: grava como o dono, sem RLS; arquivo_oportunidade só tem o trigger
-- set_updated_at (sem referencias_da_empresa e sem auth.uid()). Em arquivo_texto_pagina (0149), o
-- UPDATE da troca só grava deleted_at: dispara o set_updated_at, e não o referencias_da_empresa
-- (que é "update of arquivo_id, empresa_id").
-- Criada antes das colunas origem e assinatura (mais abaixo): o corpo só é resolvido ao rodar.
create or replace function public.conector_gravar_arquivo(
  p_empresa_id uuid,
  p_oportunidade_id uuid,
  p_origem text,
  p_nome text,
  p_url text,
  p_tipo text,
  p_tamanho bigint,
  p_pasta text,
  p_categoria text,
  p_assinatura text,
  p_usuario_nome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual record;
  v_id uuid;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_empresa_id is null or p_oportunidade_id is null then
    raise exception 'empresa e oportunidade são obrigatórias' using errcode = '22023';
  end if;
  -- origem e nome: ao menos um caractere que não seja espaço, tabulação ou quebra de linha
  if p_origem is null or p_origem !~ '\S' or char_length(p_origem) > 200 then
    raise exception 'origem inválida' using errcode = '22023';
  end if;
  if p_nome is null or p_nome !~ '\S' then
    raise exception 'nome inválido' using errcode = '22023';
  end if;
  -- a ref tem de ser um arquivo DENTRO da pasta da empresa, no bucket da oportunidade: ao menos um
  -- caractere depois da barra e nenhum segmento "." ou ".." no caminho (que sairia da pasta). Pontos
  -- seguidos dentro do NOME do arquivo ("Empresa Ltda..pdf") não são segmento e passam. Lista branca:
  -- só A-Z a-z 0-9 . _ / - (o servidor só grava refs feitas por caminhoDoEnvio, que sanea o nome a esse
  -- conjunto). Tab, quebra de linha, "\", "%", espaço, acento etc. ficam de fora: o parser de URL do
  -- storage-js apaga tab/LF/CR, e ".<tab>." viraria ".." e sairia da pasta da empresa.
  if p_url is null
     or p_url not like 'anexos-oportunidade/' || p_empresa_id::text || '/_%'
     or p_url ~ '(^|/)\.{1,2}(/|$)'
     or p_url !~ '^[A-Za-z0-9._/-]+$' then
    raise exception 'arquivo fora da pasta da empresa' using errcode = '22023';
  end if;
  if p_assinatura is not null and p_assinatura <> 'pendente' then
    raise exception 'assinatura inválida' using errcode = '22023';
  end if;

  -- trava a oportunidade: duas gravações da mesma origem não correm juntas
  perform 1
     from public.oportunidade o
    where o.id = p_oportunidade_id and o.empresa_id = p_empresa_id and o.deleted_at is null
      for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;

  -- no máximo uma linha: o índice único é (empresa_id, oportunidade_id, origem) entre as vivas
  select a.id, a.assinatura, a.url into v_atual
    from public.arquivo_oportunidade a
   where a.empresa_id = p_empresa_id
     and a.oportunidade_id = p_oportunidade_id
     and a.origem = p_origem
     and a.deleted_at is null
     for update;

  if found then
    if v_atual.assinatura = 'assinado' then
      return jsonb_build_object('ok', true, 'arquivo_id', v_atual.id, 'substituiu', false,
                                'mantido_assinado', true, 'ref_anterior', null::text);
    end if;
    update public.arquivo_oportunidade
       set nome = p_nome,
           url = p_url,
           tipo = p_tipo,
           tamanho = p_tamanho,
           pasta = p_pasta,
           categoria = p_categoria,
           assinatura = p_assinatura,
           usuario_nome = p_usuario_nome
     where id = v_atual.id
       and empresa_id = p_empresa_id;
    -- o texto por página (0149) era do arquivo ANTIGO: sai junto com a troca, senão o
    -- ler_edital_anexado leria o texto antigo no arquivo novo (o conector passa a responder
    -- "sem_texto" até o usuário preparar o texto de novo)
    update public.arquivo_texto_pagina
       set deleted_at = now()
     where empresa_id = p_empresa_id
       and arquivo_id = v_atual.id
       and deleted_at is null;
    return jsonb_build_object('ok', true, 'arquivo_id', v_atual.id, 'substituiu', true,
                              'mantido_assinado', false, 'ref_anterior', v_atual.url);
  end if;

  insert into public.arquivo_oportunidade
    (empresa_id, oportunidade_id, nome, url, tipo, tamanho, pasta, categoria, origem, assinatura, usuario_nome)
  values
    (p_empresa_id, p_oportunidade_id, p_nome, p_url, p_tipo, p_tamanho, p_pasta, p_categoria, p_origem,
     p_assinatura, p_usuario_nome)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'arquivo_id', v_id, 'substituiu', false,
                            'mantido_assinado', false, 'ref_anterior', null::text);
end;
$$;

comment on function public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text) is
  'Conector do Claude: grava nos Arquivos da oportunidade um arquivo gerado, copiado ou baixado pelo servidor. Mesma origem (na mesma empresa e oportunidade) = troca no lugar, e o texto por página do arquivo antigo (arquivo_texto_pagina) é excluído na mesma transação; arquivo já assinado não é trocado, e o texto dele fica. Só o servidor chama.';

revoke all on function public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text)
  to service_role;

-- Por último, a tabela em uso: colunas novas e o índice único (trava exclusiva até o commit) --------
alter table public.arquivo_oportunidade
  add column if not exists origem text
    constraint arquivo_oportunidade_origem_check
      check (origem is null or char_length(origem) between 1 and 200),
  add column if not exists assinatura text
    constraint arquivo_oportunidade_assinatura_check
      check (assinatura is null or assinatura in ('pendente', 'assinado'));

-- a empresa entra na chave: linha de outra empresa apontando para a oportunidade não colide
create unique index if not exists arquivo_oportunidade_origem_uidx
  on public.arquivo_oportunidade (empresa_id, oportunidade_id, origem)
  where origem is not null and deleted_at is null;

comment on column public.arquivo_oportunidade.origem is
  'Documento gravado pelo servidor: chave única dentro da oportunidade, por empresa (gerado:proposta:pdf, biblioteca:<id>, acervo:<id>, declaracao:<chave>:pdf, url:<hash>). Null = enviado pela tela.';
comment on column public.arquivo_oportunidade.assinatura is
  'pendente = gerado com o bloco de assinatura e ainda não assinado; assinado = a versão assinada foi enviada. Null = não se aplica.';

notify pgrst, 'reload schema';

commit;

-- Conferência (só leitura). Esperado: o bucket com os MIMEs novos (ou sem lista, se ela é nula); as colunas
-- origem e assinatura (text) em arquivo_oportunidade; os índices arquivo_oportunidade_origem_uidx — com
-- (empresa_id, oportunidade_id, origem) no indexdef — e modelo_declaracao_chave_uidx; os 4 CHECKs de
-- modelo_declaracao (chave_check, chave_reservada_chk, texto_check e titulo_check); 5 policies em
-- modelo_declaracao (2 da empresa, permissivas, e 3 restritivas: SELECT, INSERT e UPDATE); a RPC só para o
-- service_role (false, false, true).
select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'anexos-oportunidade';
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'arquivo_oportunidade' and column_name in ('origem', 'assinatura')
 order by column_name;
select indexname, indexdef from pg_indexes
 where schemaname = 'public'
   and indexname in ('arquivo_oportunidade_origem_uidx', 'modelo_declaracao_chave_uidx')
 order by indexname;
select conname from pg_constraint
 where conrelid = 'public.modelo_declaracao'::regclass and contype = 'c'
 order by conname;
select policyname, permissive, cmd from pg_policies
 where schemaname = 'public' and tablename = 'modelo_declaracao'
 order by policyname;
select has_function_privilege('authenticated', 'public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text)', 'execute') as authenticated_grava,
       has_function_privilege('anon', 'public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text)', 'execute') as anon_grava,
       has_function_privilege('service_role', 'public.conector_gravar_arquivo(uuid, uuid, text, text, text, text, bigint, text, text, text, text)', 'execute') as service_role_grava;

select 'ok' as res;
