-- ============================================================================
-- conferir-portal-fornecedor-orcamento.sql — conferência SÓ DE LEITURA antes de publicar a função
-- portal-fornecedor-orcamento (o fornecedor anexa o orçamento no link da cotação e a IA sugere os valores).
--
-- A função NÃO tem migração: ela usa o que já deveria existir em produção. Esta consulta confere se existe mesmo.
-- Não grava nada e não mostra dado de empresa, de fornecedor nem chave.
--
-- Como rodar (o Javerson, ANTES do deploy da função):
--   supabase db query --linked -f tools/conferir-portal-fornecedor-orcamento.sql
--
-- Uma linha por item, com a coluna `situacao`:
--   1. bucket privado anexos-cotacao (0015; a 0017 deixou vivo de propósito): onde o arquivo fica guardado. Tem de
--      estar "ok" (existe e NÃO é público). O detalhe mostra o limite e os tipos aceitos (esperado: 25 MB; PDF, JPEG
--      e PNG).
--   2. policy de leitura da empresa no bucket: é ela que deixa o comprador abrir o orçamento na comparação de preços.
--   3. coluna cotacao_fornecedor.arquivos_anexados (jsonb, da 0007): onde fica a referência "bucket/caminho".
--   4. função auth_rate_limit_consumir (0112): freio de envios e de leituras por participação.
--   5. tabela ia_uso com provedor e custo (0114/0123): consumo e cota diária da IA.
--   6. chave de IA no banco: "sem chave no banco" só é problema se as funções também não tiverem o segredo
--      GEMINI_API_KEY / OPENAI_API_KEY (sem chave nenhuma o arquivo é anexado, mas os valores não são lidos).
--   7. informação: quantas participações já têm algo em arquivos_anexados (resto do legado; a função preserva).
--
-- Itens 1 a 5 com "FALTA" ou "ERRADO": NÃO publicar; avisar para preparar uma migração.
-- ============================================================================

select 1 as ordem,
       'bucket privado anexos-cotacao' as item,
       case
         when b.id is null then 'FALTA'
         when b.public then 'ERRADO: o bucket está público'
         else 'ok'
       end as situacao,
       case
         when b.id is null then ''
         else 'limite ' || coalesce((b.file_size_limit / 1048576)::text, '?') || ' MB; tipos '
              || coalesce(array_to_string(b.allowed_mime_types, ', '), 'qualquer')
       end as detalhe
  from (select 1) x
  left join storage.buckets b on b.id = 'anexos-cotacao'
union all
select 2,
       'policy de leitura da empresa no bucket',
       case when count(*) > 0 then 'ok' else 'FALTA' end,
       count(*)::text || ' policy(ies) de SELECT'
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects'
   and cmd = 'SELECT'
   and policyname = 'anexos-cotacao_tenant_select'
union all
select 3,
       'coluna cotacao_fornecedor.arquivos_anexados (jsonb)',
       case when count(*) = 1 and max(data_type) = 'jsonb' then 'ok' else 'FALTA' end,
       coalesce(max(data_type), '')
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'cotacao_fornecedor'
   and column_name = 'arquivos_anexados'
union all
select 4,
       'função auth_rate_limit_consumir',
       case when count(*) > 0 then 'ok' else 'FALTA' end,
       ''
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'auth_rate_limit_consumir'
union all
select 5,
       'tabela ia_uso com provedor e custo',
       case when count(*) = 3 then 'ok' else 'FALTA' end,
       count(*)::text || ' de 3 colunas'
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'ia_uso'
   and column_name in ('acao', 'provedor', 'custo_usd')
union all
select 6,
       'chave de IA no banco (Gemini ou OpenAI)',
       case when count(*) > 0 then 'ok' else 'sem chave no banco' end,
       ''
  from public.saas_config
 where chave in ('gemini_api_key', 'openai_api_key')
   and length(btrim(coalesce(valor, ''))) > 0
union all
select 7,
       'participações que já têm algo em arquivos_anexados',
       'informação',
       count(*)::text
  from public.cotacao_fornecedor
 where arquivos_anexados is not null
   and arquivos_anexados::text not in ('[]', 'null', '""', '"[]"')
 order by ordem;
