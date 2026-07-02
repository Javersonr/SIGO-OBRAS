-- ============================================================================
-- 0084 — Compras: colunas que o frontend novo envia e não existiam no schema
-- ============================================================================
-- Bug real visto na SG Ligth (1ª empresa a usar Compras no stack novo):
-- o PostgREST rejeita o INSERT INTEIRO quando o payload tem coluna
-- desconhecida (PGRST204), mesmo com valor null. A produção da Sinergia
-- não sentia porque roda no Base44 legado.
--
--   solicitacao_compra.solicitante_email  — enviado por Compras.jsx e
--     Projetos.jsx (identidade denormalizada; as funções de aprovação de
--     0062/0063 resolvem via vínculo, então é informativo)
--   solicitacao_compra_item.especificacoes — texto livre do item
--   solicitacao_compra_item.ultimo_preco   — último preço conhecido (exibido
--     no formulário como referência)
-- ============================================================================

alter table public.solicitacao_compra
  add column if not exists solicitante_email text;

alter table public.solicitacao_compra_item
  add column if not exists especificacoes text,
  add column if not exists ultimo_preco numeric(14,4);
