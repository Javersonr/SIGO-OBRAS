-- ============================================================================
-- 0060_unique_soft_delete.sql — índices únicos cientes de soft-delete
--
-- BUG latente: catálogos com unique constraint global + soft-delete. Apagar
-- (deleted_at) um registro e recriar outro com o MESMO nome/código viola a
-- constraint — o usuário vê "duplicate key" sem entender (o registro "não
-- existe mais" pra ele).
--
-- Conversão: constraint única → ÍNDICE único parcial (where deleted_at is
-- null). Vivos continuam únicos; soft-deletados não bloqueiam recriação.
-- Dados atuais sempre satisfazem (a regra nova é mais frouxa que a antiga).
--
-- DELIBERADAMENTE NÃO convertidos (verificado em código):
--   - estoque_saldo (material,almox,local)   → ON CONFLICT na RPC 0027
--   - licitacao_encontrada (empresa,id_lic)  → upsert nas functions de busca
--   - token_cliente_oportunidade.token, cotacao_fornecedor.token
--                                            → token deve ser único p/ sempre
--   - nota_fiscal_devolucao.focus_ref        → ref externa (Focus NFe)
--   - extrato_bancario (conta,hash_linha)    → dedup de import OFX
--   - preferencia_notificacao, empresa_config_fiscal → 1:1, sem fluxo de recriação
-- ============================================================================

-- categoria_material (empresa_id, nome)
alter table public.categoria_material
  drop constraint if exists categoria_material_empresa_id_nome_key;
create unique index if not exists categoria_material_empresa_nome_uniq
  on public.categoria_material(empresa_id, nome) where deleted_at is null;

-- unidade_medida (empresa_id, sigla)
alter table public.unidade_medida
  drop constraint if exists unidade_medida_empresa_id_sigla_key;
create unique index if not exists unidade_medida_empresa_sigla_uniq
  on public.unidade_medida(empresa_id, sigla) where deleted_at is null;

-- categoria_mao_de_obra (empresa_id, nome)
alter table public.categoria_mao_de_obra
  drop constraint if exists categoria_mao_de_obra_empresa_id_nome_key;
create unique index if not exists categoria_mao_de_obra_empresa_nome_uniq
  on public.categoria_mao_de_obra(empresa_id, nome) where deleted_at is null;

-- centro_custo (empresa_id, codigo)
alter table public.centro_custo
  drop constraint if exists centro_custo_empresa_id_codigo_key;
create unique index if not exists centro_custo_empresa_codigo_uniq
  on public.centro_custo(empresa_id, codigo) where deleted_at is null;

-- origem_oportunidade (empresa_id, nome)
alter table public.origem_oportunidade
  drop constraint if exists origem_oportunidade_empresa_id_nome_key;
create unique index if not exists origem_oportunidade_empresa_nome_uniq
  on public.origem_oportunidade(empresa_id, nome) where deleted_at is null;

-- kit (empresa_id, codigo)
alter table public.kit
  drop constraint if exists kit_empresa_id_codigo_key;
create unique index if not exists kit_empresa_codigo_uniq
  on public.kit(empresa_id, codigo) where deleted_at is null;

-- cliente_portal_usuario (empresa_id, email)
alter table public.cliente_portal_usuario
  drop constraint if exists cliente_portal_usuario_empresa_id_email_key;
create unique index if not exists cliente_portal_usuario_empresa_email_uniq
  on public.cliente_portal_usuario(empresa_id, email) where deleted_at is null;

-- permissao_detalhada (codigo)
alter table public.permissao_detalhada
  drop constraint if exists permissao_detalhada_codigo_key;
create unique index if not exists permissao_detalhada_codigo_uniq
  on public.permissao_detalhada(codigo) where deleted_at is null;
