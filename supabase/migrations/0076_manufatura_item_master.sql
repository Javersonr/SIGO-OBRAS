-- ============================================================================
-- 0076 — Manufatura (Fase 0): Item master + fundação
-- ============================================================================
-- Módulo de manufatura DISCRETA dentro do SIGO. Reusa o motor de estoque
-- (material / almoxarifado / estoque_movimento / estoque_saldo / reserva_material
-- e as RPCs atômicas de 0027). Aqui só ESTENDEMOS o que já existe:
--   1. material vira o item master de produção (tipo_item, fabricado, lote/série,
--      custo_padrao, lead_time)
--   2. almoxarifado ganha `tipo` (pra distinguir WIP / Produto Acabado)
--   3. estoque_movimento.referencia_tipo e reserva_material.tipo_reserva ganham
--      'OrdemProducao' (forward-compat; usadas em 0078)
-- Nenhuma tabela nova nesta fase — a produção pluga no estoque existente.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. material como item master de manufatura
-- ────────────────────────────────────────────────────────────────────────────
alter table public.material
  add column if not exists tipo_item text
    check (tipo_item in ('MateriaPrima','Semiacabado','ProdutoAcabado','Embalagem','Servico'))
    default 'MateriaPrima',
  add column if not exists fabricado boolean default false,   -- true = produzido (tem ficha técnica); false = comprado
  add column if not exists controla_lote boolean default false,
  add column if not exists controla_serie boolean default false,
  add column if not exists custo_padrao numeric(14,4),
  add column if not exists lead_time_dias integer;            -- ressuprimento (compra OU produção)

create index if not exists material_tipo_item_idx on public.material(empresa_id, tipo_item);
create index if not exists material_fabricado_idx on public.material(empresa_id) where fabricado = true;

comment on column public.material.tipo_item is 'Papel do item na manufatura: MateriaPrima|Semiacabado|ProdutoAcabado|Embalagem|Servico';
comment on column public.material.fabricado is 'true = produzido internamente (espera ficha técnica); false = comprado';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. almoxarifado: tipo (WIP / Produto Acabado / etc.)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.almoxarifado
  add column if not exists tipo text
    check (tipo in ('Geral','MateriaPrima','WIP','ProdutoAcabado','Expedicao'))
    default 'Geral';

comment on column public.almoxarifado.tipo is 'Classifica o almoxarifado no fluxo de produção (WIP = chão de fábrica).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Estender enums pra referenciar Ordem de Produção
--    (mesma técnica NOT VALID já usada em 0027 — legado não é revalidado)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.estoque_movimento
  drop constraint if exists estoque_movimento_referencia_tipo_check;
alter table public.estoque_movimento
  add constraint estoque_movimento_referencia_tipo_check
  check (referencia_tipo is null or referencia_tipo in (
    'Pedido','Retirada','Ajuste','Transferência','Inventário','Manual',
    'Reserva','NotaFiscal','Devolução','OrdemProducao'
  ))
  not valid;

alter table public.reserva_material
  drop constraint if exists reserva_material_tipo_reserva_check;
alter table public.reserva_material
  add constraint reserva_material_tipo_reserva_check
  check (tipo_reserva in ('Projeto','Caminhão','OrdemProducao'))
  not valid;
