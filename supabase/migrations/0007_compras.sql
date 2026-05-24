-- ============================================================================
-- 0007 — Compras (9 tabelas)
-- Fluxo: SolicitacaoCompra → Cotacao → PedidoCompra
-- ============================================================================

-- ============================================================================
-- 1. solicitacao_compra
-- ============================================================================
create table public.solicitacao_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  projetos_ids jsonb default '[]'::jsonb,
  projetos_nomes jsonb default '[]'::jsonb,
  oportunidade_id uuid references public.oportunidade(id) on delete set null,
  oportunidade_nome text,
  solicitante_id uuid,
  solicitante_nome text,
  status text not null check (status in (
    'Pendente Aprovação','Aprovada','Em Cotação','Cotação Aprovada',
    'Pedido Gerado','Cancelada','Rejeitada'
  )),
  prioridade text check (prioridade in ('Baixa','Normal','Alta','Urgente')) default 'Normal',
  origem text check (origem in ('Manual','Orcamento','Estoque')) default 'Manual',
  data_necessidade date,
  observacoes text,
  total_itens integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index sol_compra_empresa_idx on public.solicitacao_compra(empresa_id);
create index sol_compra_status_idx on public.solicitacao_compra(empresa_id, status);
create index sol_compra_projeto_idx on public.solicitacao_compra(projeto_id) where projeto_id is not null;
create index sol_compra_op_idx on public.solicitacao_compra(oportunidade_id) where oportunidade_id is not null;
select attach_updated_at_trigger('solicitacao_compra');

-- FK pendente da 0002: aprovacao_solicitacao.solicitacao_id
alter table public.aprovacao_solicitacao
  drop constraint aprov_sol_solicitacao_fk_pending;
alter table public.aprovacao_solicitacao
  add constraint aprov_sol_solicitacao_fk
  foreign key (solicitacao_id) references public.solicitacao_compra(id) on delete cascade;

-- ============================================================================
-- 2. solicitacao_compra_item
-- ============================================================================
create table public.solicitacao_compra_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacao_compra(id) on delete cascade,
  material_id uuid references public.material(id) on delete set null,
  material_codigo text,
  descricao text not null,
  quantidade numeric(14,3) not null,
  unidade text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index sol_item_empresa_idx on public.solicitacao_compra_item(empresa_id);
create index sol_item_sol_idx on public.solicitacao_compra_item(solicitacao_id);
create index sol_item_material_idx on public.solicitacao_compra_item(material_id) where material_id is not null;
select attach_updated_at_trigger('solicitacao_compra_item');

-- ============================================================================
-- 3. cotacao
-- ============================================================================
create table public.cotacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  solicitacao_id uuid references public.solicitacao_compra(id) on delete set null,
  solicitacao_numero text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  status text not null check (status in (
    'Aberta','Enviada aos Fornecedores','Aguardando Respostas',
    'Respostas Recebidas','Aprovada','Cancelada'
  )),
  data_limite timestamptz,
  fornecedor_vencedor_id uuid references public.fornecedor(id) on delete set null,
  fornecedor_vencedor_nome text,
  valor_aprovado numeric(14,2),
  observacoes text,
  total_fornecedores integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index cot_empresa_idx on public.cotacao(empresa_id);
create index cot_status_idx on public.cotacao(empresa_id, status);
create index cot_sol_idx on public.cotacao(solicitacao_id) where solicitacao_id is not null;
create index cot_projeto_idx on public.cotacao(projeto_id) where projeto_id is not null;
select attach_updated_at_trigger('cotacao');

-- ============================================================================
-- 4. cotacao_fornecedor (envio para cada fornecedor)
-- ============================================================================
create table public.cotacao_fornecedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  cotacao_id uuid not null references public.cotacao(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedor(id) on delete cascade,
  fornecedor_nome text,
  fornecedor_email text,
  status text check (status in (
    'Enviada','Visualizada','Respondida Parcialmente',
    'Respondida Totalmente','Impossível Responder'
  )) default 'Enviada',
  token text unique,
  total_cotado numeric(14,2),
  prazo_entrega_dias integer,
  condicao_pagamento text,
  observacoes text,
  motivo_recusa text,
  data_resposta timestamptz,
  data_visualizacao timestamptz,
  ultima_notificacao timestamptz,
  arquivos_anexados jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index cot_forn_empresa_idx on public.cotacao_fornecedor(empresa_id);
create index cot_forn_cot_idx on public.cotacao_fornecedor(cotacao_id);
create index cot_forn_forn_idx on public.cotacao_fornecedor(fornecedor_id);
select attach_updated_at_trigger('cotacao_fornecedor');

-- ============================================================================
-- 5. cotacao_item
-- ============================================================================
create table public.cotacao_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  cotacao_id uuid not null references public.cotacao(id) on delete cascade,
  solicitacao_item_id uuid references public.solicitacao_compra_item(id) on delete set null,
  descricao text not null,
  material_codigo text,
  quantidade numeric(14,3),
  unidade text,
  especificacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index cot_item_empresa_idx on public.cotacao_item(empresa_id);
create index cot_item_cot_idx on public.cotacao_item(cotacao_id);
select attach_updated_at_trigger('cotacao_item');

-- ============================================================================
-- 6. cotacao_resposta (resposta do fornecedor por item)
-- ============================================================================
create table public.cotacao_resposta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  cotacao_id uuid not null references public.cotacao(id) on delete cascade,
  cotacao_fornecedor_id uuid references public.cotacao_fornecedor(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedor(id) on delete cascade,
  item_id uuid not null references public.cotacao_item(id) on delete cascade,
  item_descricao text,
  valor_unitario numeric(14,4) not null,
  valor_total numeric(14,2),
  prazo_entrega_dias integer,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index cot_resp_empresa_idx on public.cotacao_resposta(empresa_id);
create index cot_resp_cot_idx on public.cotacao_resposta(cotacao_id);
create index cot_resp_forn_idx on public.cotacao_resposta(fornecedor_id);
create index cot_resp_item_idx on public.cotacao_resposta(item_id);
select attach_updated_at_trigger('cotacao_resposta');

-- ============================================================================
-- 7. arquivo_cotacao_fornecedor
-- ============================================================================
create table public.arquivo_cotacao_fornecedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  cotacao_id uuid not null references public.cotacao(id) on delete cascade,
  cotacao_fornecedor_id uuid not null references public.cotacao_fornecedor(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedor(id) on delete cascade,
  fornecedor_nome text,
  nome_arquivo text not null,
  url_arquivo text not null,
  tamanho bigint,
  tipo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index arq_cf_empresa_idx on public.arquivo_cotacao_fornecedor(empresa_id);
create index arq_cf_cf_idx on public.arquivo_cotacao_fornecedor(cotacao_fornecedor_id);
select attach_updated_at_trigger('arquivo_cotacao_fornecedor');

-- ============================================================================
-- 8. pedido_compra
-- ============================================================================
create table public.pedido_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  fornecedor_id uuid not null references public.fornecedor(id) on delete restrict,
  fornecedor_nome text,
  solicitacao_id uuid references public.solicitacao_compra(id) on delete set null,
  cotacao_id uuid references public.cotacao(id) on delete set null,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  status text not null check (status in (
    'Emitido','Enviado','Confirmado','Em Trânsito',
    'Entregue Parcial','Entregue','Cancelado'
  )),
  data_emissao date default current_date,
  previsao_entrega date,
  data_entrega date,
  condicao_pagamento text,
  total numeric(14,2),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ped_empresa_idx on public.pedido_compra(empresa_id);
create index ped_status_idx on public.pedido_compra(empresa_id, status);
create index ped_forn_idx on public.pedido_compra(fornecedor_id);
create index ped_projeto_idx on public.pedido_compra(projeto_id) where projeto_id is not null;
select attach_updated_at_trigger('pedido_compra');

-- ============================================================================
-- 9. pedido_compra_item
-- ============================================================================
create table public.pedido_compra_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  pedido_id uuid not null references public.pedido_compra(id) on delete cascade,
  material_id uuid references public.material(id) on delete set null,
  descricao text not null,
  quantidade numeric(14,3) not null,
  quantidade_entregue numeric(14,3) default 0,
  unidade text,
  valor_unitario numeric(14,4) not null,
  valor_total numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ped_item_empresa_idx on public.pedido_compra_item(empresa_id);
create index ped_item_pedido_idx on public.pedido_compra_item(pedido_id);
create index ped_item_material_idx on public.pedido_compra_item(material_id) where material_id is not null;
select attach_updated_at_trigger('pedido_compra_item');
