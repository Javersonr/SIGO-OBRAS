-- ============================================================================
-- 0018 — Relaxa CHECK constraints e adiciona colunas faltando pra aceitar
-- os dados legados da plataforma anterior durante o import.
-- ============================================================================
-- Contexto: o import-dump.mjs (tools/) inseriu só 2.585 de 10.936 registros.
-- 8.351 falharam por:
--   1. CHECK constraints com listas fixas de valores que não cobriam dados reais
--      (ex: material.unidade só aceitava UN/PC/KG/M/M2/M3/L/CX/SC/TN, mas dados
--      tinham PC, UND, CJ, pç, RL, mxmês, CT, H, PR, M³, m², M2, etc.)
--   2. Colunas que existiam na plataforma anterior mas não no schema novo
--      (material.descricao, ferramenta.data_aquisicao, solicitacao_compra.proximo_aprovador_id,
--      inspecao_historico.timestamp)
--   3. UNIQUE constraints rígidos (ferramenta empresa_id+codigo duplicado em dados reais)
--
-- Estratégia: ao invés de tentar adivinhar todos os valores possíveis dos
-- enums, a migration DROPA os CHECKs problemáticos. Re-adicionamos depois
-- de mapear os valores reais que estão sendo usados (pós-import).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. material — drop CHECK unidade + add descricao
-- ---------------------------------------------------------------------------
alter table public.material
  drop constraint if exists material_unidade_check;

alter table public.material
  add column if not exists descricao text;

-- ---------------------------------------------------------------------------
-- 2. estoque_movimento — drop CHECK referencia_tipo (data legada usa
--    variações como 'Solicitação', 'Compra', etc. fora da lista original)
-- ---------------------------------------------------------------------------
alter table public.estoque_movimento
  drop constraint if exists estoque_movimento_referencia_tipo_check;

-- Também o tipo principal pode ter valores que não previmos
alter table public.estoque_movimento
  drop constraint if exists estoque_movimento_tipo_check;

-- ---------------------------------------------------------------------------
-- 3. transacao_financeira — drop CHECK status
-- ---------------------------------------------------------------------------
alter table public.transacao_financeira
  drop constraint if exists transacao_financeira_status_check;

-- ---------------------------------------------------------------------------
-- 4. transacao_anexo — drop CHECK tipo
-- ---------------------------------------------------------------------------
alter table public.transacao_anexo
  drop constraint if exists transacao_anexo_tipo_check;

-- ---------------------------------------------------------------------------
-- 5. movimentacao_ferramenta — drop CHECK tipo_movimentacao
-- ---------------------------------------------------------------------------
alter table public.movimentacao_ferramenta
  drop constraint if exists movimentacao_ferramenta_tipo_movimentacao_check;

-- ---------------------------------------------------------------------------
-- 6. solicitacao_compra — add coluna proximo_aprovador_id
--    (fluxo de aprovação legado guardava o próximo aprovador como FK direta)
-- ---------------------------------------------------------------------------
alter table public.solicitacao_compra
  add column if not exists proximo_aprovador_id uuid;

-- Outras colunas legadas que podem aparecer em SolicitacaoCompra:
alter table public.solicitacao_compra
  drop constraint if exists solicitacao_compra_status_check;

-- ---------------------------------------------------------------------------
-- 7. ferramenta — add data_aquisicao + drop unique restritivo
--    O dump tem múltiplas ferramentas com mesmo codigo na mesma empresa
--    (provavelmente código duplicado entre lojas/filiais da plataforma legada).
--    Tirar o UNIQUE permite inserir tudo; reinstauramos depois de cleanup.
-- ---------------------------------------------------------------------------
alter table public.ferramenta
  add column if not exists data_aquisicao date;

alter table public.ferramenta
  drop constraint if exists ferramenta_empresa_id_codigo_key;

-- Drop FK rígido pra funcionario (alguns dados têm funcionario_id apontando
-- pra registros que não existem ainda no momento do import — FK fica frouxa
-- e podemos validar e re-criar depois)
alter table public.ferramenta
  drop constraint if exists ferr_funcionario_fk;

-- ---------------------------------------------------------------------------
-- 8. inspecao_historico — add timestamp
-- ---------------------------------------------------------------------------
alter table public.inspecao_historico
  add column if not exists timestamp timestamptz;

-- ---------------------------------------------------------------------------
-- 9. Outras FKs rígidas que causam cascata em dados parciais — droppa
--    (dá pra recriar depois de cleanup com dados completos)
-- ---------------------------------------------------------------------------
alter table public.entrega_ferramental
  drop constraint if exists ent_ferr_funcionario_fk;

alter table public.inspecao_ferramenta
  drop constraint if exists insp_ferr_funcionario_fk;

alter table public.inspecao_caminhao
  drop constraint if exists inspecao_caminhao_caminhao_id_fkey;

alter table public.canal_chat
  drop constraint if exists canal_chat_projeto_id_fkey;

alter table public.mensagem_chat
  drop constraint if exists mensagem_chat_canal_id_fkey;

alter table public.boleto_bancario
  drop constraint if exists blt_assinatura_fk;

alter table public.manutencao_ferramenta
  drop constraint if exists manutencao_ferramenta_ferramenta_id_fkey;

alter table public.cotacao
  drop constraint if exists cotacao_solicitacao_id_fkey;

alter table public.cotacao_fornecedor
  drop constraint if exists cotacao_fornecedor_cotacao_id_fkey;

alter table public.cotacao_item
  drop constraint if exists cotacao_item_cotacao_id_fkey;

alter table public.cotacao_resposta
  drop constraint if exists cotacao_resposta_cotacao_id_fkey;

alter table public.solicitacao_compra_item
  drop constraint if exists solicitacao_compra_item_solicitacao_id_fkey;

alter table public.pre_lancamento
  drop constraint if exists pre_lancamento_projeto_id_fkey;

alter table public.pre_lancamento
  drop constraint if exists pre_lancamento_conta_financeira_id_fkey;

alter table public.aprovacao_solicitacao
  drop constraint if exists aprov_sol_solicitacao_fk;

alter table public.aprovacao_solicitacao
  drop constraint if exists aprov_sol_solicitacao_fk_pending;

-- ---------------------------------------------------------------------------
-- 10. reserva_material.material_id — relaxa NOT NULL temporariamente
--     pra dados onde Material falhou primeiro
-- ---------------------------------------------------------------------------
alter table public.reserva_material
  alter column material_id drop not null;

alter table public.movimentacao_ferramenta
  alter column ferramenta_id drop not null;

-- ---------------------------------------------------------------------------
-- TODO pós-import (a fazer manualmente depois que dados estiverem dentro):
--   - Mapear valores reais dos enums (SELECT distinct unidade FROM material...)
--   - Re-adicionar CHECKs com listas atualizadas
--   - Validar e re-criar FKs (DELETE registros órfãos primeiro)
--   - Re-adicionar UNIQUEs (depois de deduplica)
-- ---------------------------------------------------------------------------
