-- ============================================================================
-- 0017 — Dropa 3 tabelas vazias sem referências no frontend
-- ============================================================================
-- Auditoria 2026-05-26: o dump completo das 19 empresas (10.938 registros)
-- mostrou 32 tabelas com zero registros. Cruzando com o frontend, dessas 32:
--   - 27 têm pelo menos 1 referência em JSX → mantemos (features inativas
--     mas conectadas, podem virar ativas)
--   - 5 não têm NENHUMA referência no frontend, mas:
--       * cliente_portal_usuario → preparado pra futuro fluxo de portal
--         (0016 acabou de adicionar senha_provisoria nela), mantemos
--       * almoxarifado_local → tem FK reverso de estoque_saldo.local_id,
--         dropar exigiria migração das colunas referenciadoras, deferido
--
-- Sobram 3 que dropamos aqui (zero risco):
--   1. arquivo_cotacao_fornecedor  — anexos por fornecedor da cotação
--   2. regra_aprovacao             — fluxo de aprovação não usado
--   3. gestor_aprovacao            — fluxo de aprovação não usado
--
-- Limpezas associadas:
--   - Coluna exigir_gestor_aprovacao em outras tabelas (não existe — a flag
--     estava SÓ dentro de regra_aprovacao, que cai junto)
--   - apply_tenant_rls() pra essas 3 em 0014 não precisa rollback aqui
--     (a RLS some junto com a tabela)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove FKs e índices antes do DROP TABLE (Postgres faz cascade, mas
--    documentamos explicitamente)
-- ---------------------------------------------------------------------------

-- regra_aprovacao tem FK pra projeto (adicionada em 0005). DROP TABLE
-- já remove constraint, mas explicito pra clareza:
alter table if exists public.regra_aprovacao
  drop constraint if exists regra_aprov_projeto_fk;

-- ---------------------------------------------------------------------------
-- 2. DROP TABLE — em ordem reversa de dependência (filhas antes das pais)
-- ---------------------------------------------------------------------------

drop table if exists public.arquivo_cotacao_fornecedor;
drop table if exists public.regra_aprovacao;
drop table if exists public.gestor_aprovacao;

-- ---------------------------------------------------------------------------
-- 3. Storage bucket órfão: anexos-cotacao foi criado em 0015 pra
--    arquivo_cotacao_fornecedor. Deixamos o bucket vivo — sem custo, e se
--    a tabela voltar no futuro, o bucket está pronto. Se quiser remover:
--      delete from storage.buckets where id = 'anexos-cotacao';
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Resultado: schema cai de 100 para 97 tabelas.
-- ---------------------------------------------------------------------------
