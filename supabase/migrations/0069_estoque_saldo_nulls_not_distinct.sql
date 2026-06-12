-- ============================================================================
-- 0069_estoque_saldo_nulls_not_distinct.sql — corrige fragmentação de saldo
--
-- BUG LATENTE (surfou no smoke do recebimento, 0068): a constraint única de
-- estoque_saldo é (material_id, almoxarifado_id, local_id) com NULLS DISTINCT
-- (padrão do Postgres). Como praticamente todo saldo tem local_id NULL
-- (70/70 em produção), o `on conflict (material, almox, local)` de
-- entrada_estoque_atomica (0027) NUNCA casa quando local_id é nulo
-- (NULL <> NULL no índice) → cada nova entrada do MESMO material cria uma
-- linha de saldo ÓRFÃ em vez de somar. Resultado: saldo fragmentado/errado.
--
-- Por que ainda não estourou em produção: cada material só teve 1 entrada
-- (ou veio direto do import) — há 0 grupos duplicados hoje. Mas o Recebimento
-- de Compra (0068) vai receber o mesmo material em vários pedidos, então o
-- bug dispararia já no 2º recebimento.
--
-- FIX: recriar a constraint como NULLS NOT DISTINCT (PG15+; aqui PG17.6).
-- Assim (material, almox, NULL) passa a ser único e o ON CONFLICT deduplica
-- corretamente — entrada_estoque_atomica volta a SOMAR no mesmo saldo.
-- Seguro: 0 duplicatas hoje, então a recriação não viola a nova constraint.
-- Aditivo/não-destrutivo (só troca a semântica de NULL no índice único).
-- ============================================================================

alter table public.estoque_saldo
  drop constraint estoque_saldo_material_id_almoxarifado_id_local_id_key;

alter table public.estoque_saldo
  add constraint estoque_saldo_material_id_almoxarifado_id_local_id_key
  unique nulls not distinct (material_id, almoxarifado_id, local_id);
