-- ============================================================================
-- 0006 — Estoque (10 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. material
-- ============================================================================
create table public.material (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  categoria text,
  codigo text,
  ean text,
  unidade text not null check (unidade in ('UN','PC','KG','M','M2','M3','L','CX','SC','TN')),
  preco numeric(14,4),
  estoque numeric(14,3) default 0,
  estoque_minimo numeric(14,3) default 0,
  localizacao text,
  foto_url text,
  preco_medio numeric(14,4),
  ncm text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index material_empresa_idx on public.material(empresa_id);
create index material_codigo_idx on public.material(empresa_id, codigo) where codigo is not null;
create index material_ean_idx on public.material(empresa_id, ean) where ean is not null;
create index material_categoria_idx on public.material(empresa_id, categoria) where categoria is not null;
select attach_updated_at_trigger('material');

-- ============================================================================
-- 2. almoxarifado
-- ============================================================================
create table public.almoxarifado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  endereco text,
  responsavel text,
  projeto_id uuid references public.projeto(id) on delete set null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index almox_empresa_idx on public.almoxarifado(empresa_id);
create index almox_projeto_idx on public.almoxarifado(projeto_id) where projeto_id is not null;
select attach_updated_at_trigger('almoxarifado');

-- ============================================================================
-- 3. almoxarifado_local — prateleiras, corredores
-- ============================================================================
create table public.almoxarifado_local (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  almoxarifado_id uuid not null references public.almoxarifado(id) on delete cascade,
  nome text not null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index almox_local_empresa_idx on public.almoxarifado_local(empresa_id);
create index almox_local_almox_idx on public.almoxarifado_local(almoxarifado_id);
select attach_updated_at_trigger('almoxarifado_local');

-- ============================================================================
-- 4. estoque_movimento
-- ============================================================================
create table public.estoque_movimento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete cascade,
  material_descricao text,
  almoxarifado_id uuid not null references public.almoxarifado(id) on delete cascade,
  almoxarifado_nome text,
  local_id uuid references public.almoxarifado_local(id) on delete set null,
  tipo text not null check (tipo in ('Entrada','Saída','Ajuste','Transferência')),
  quantidade numeric(14,3) not null,
  valor_unitario numeric(14,4),
  valor_total numeric(14,2),
  data_movimento timestamptz default now(),
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  referencia_tipo text check (referencia_tipo in ('Pedido','Retirada','Ajuste','Transferência','Inventário','Manual')),
  referencia_id uuid,
  usuario_nome text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index mov_empresa_idx on public.estoque_movimento(empresa_id);
create index mov_material_idx on public.estoque_movimento(material_id);
create index mov_almox_idx on public.estoque_movimento(almoxarifado_id);
create index mov_data_idx on public.estoque_movimento(empresa_id, data_movimento desc);
create index mov_referencia_idx on public.estoque_movimento(referencia_tipo, referencia_id) where referencia_id is not null;
select attach_updated_at_trigger('estoque_movimento');

-- ============================================================================
-- 5. estoque_saldo (materializada)
-- ============================================================================
create table public.estoque_saldo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete cascade,
  material_codigo text,
  material_descricao text,
  almoxarifado_id uuid not null references public.almoxarifado(id) on delete cascade,
  almoxarifado_nome text,
  local_id uuid references public.almoxarifado_local(id) on delete set null,
  quantidade numeric(14,3) default 0,
  quantidade_reservada numeric(14,3) default 0,
  quantidade_disponivel numeric(14,3) generated always as (quantidade - quantidade_reservada) stored,
  valor_medio numeric(14,4),
  valor_total numeric(14,2),
  estoque_minimo numeric(14,3) default 0,
  unidade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (material_id, almoxarifado_id, local_id)
);
create index saldo_empresa_idx on public.estoque_saldo(empresa_id);
create index saldo_material_idx on public.estoque_saldo(material_id);
create index saldo_almox_idx on public.estoque_saldo(almoxarifado_id);
select attach_updated_at_trigger('estoque_saldo');

-- ============================================================================
-- 6. retirada_estoque + 7. retirada_estoque_item
-- ============================================================================
create table public.retirada_estoque (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  almoxarifado_id uuid not null references public.almoxarifado(id) on delete cascade,
  almoxarifado_nome text,
  solicitante_id uuid,
  solicitante_nome text,
  status text not null check (status in ('Aberta','Aprovada','Atendida','Cancelada')) default 'Aberta',
  data_necessidade date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ret_empresa_idx on public.retirada_estoque(empresa_id);
create index ret_status_idx on public.retirada_estoque(empresa_id, status);
create index ret_projeto_idx on public.retirada_estoque(projeto_id) where projeto_id is not null;
select attach_updated_at_trigger('retirada_estoque');

create table public.retirada_estoque_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  retirada_id uuid not null references public.retirada_estoque(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete cascade,
  material_descricao text,
  quantidade_solicitada numeric(14,3) not null,
  quantidade_atendida numeric(14,3) default 0,
  unidade text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ret_item_empresa_idx on public.retirada_estoque_item(empresa_id);
create index ret_item_retirada_idx on public.retirada_estoque_item(retirada_id);
create index ret_item_material_idx on public.retirada_estoque_item(material_id);
select attach_updated_at_trigger('retirada_estoque_item');

-- ============================================================================
-- 8. reserva_material (caminhao_id referenciará caminhao em 0003 já existente)
-- ============================================================================
create table public.reserva_material (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  grupo_id uuid,
  material_id uuid not null references public.material(id) on delete cascade,
  material_codigo text,
  material_descricao text,
  almoxarifado_id uuid not null references public.almoxarifado(id) on delete cascade,
  almoxarifado_nome text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  caminhao_id uuid references public.caminhao(id) on delete set null,
  caminhao_placa text,
  tipo_reserva text check (tipo_reserva in ('Projeto','Caminhão')) default 'Projeto',
  quantidade_reservada numeric(14,3) not null,
  unidade text,
  data_reserva date default current_date,
  data_necessidade date,
  solicitante_id uuid,
  solicitante_nome text,
  status text check (status in ('Ativa','Utilizada','Cancelada')) default 'Ativa',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index reserva_empresa_idx on public.reserva_material(empresa_id);
create index reserva_material_idx on public.reserva_material(material_id);
create index reserva_projeto_idx on public.reserva_material(projeto_id) where projeto_id is not null;
create index reserva_grupo_idx on public.reserva_material(grupo_id) where grupo_id is not null;
create index reserva_status_idx on public.reserva_material(empresa_id, status);
select attach_updated_at_trigger('reserva_material');

-- ============================================================================
-- 9. kit + 10. kit_item
-- ============================================================================
create table public.kit (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  codigo text,
  descricao text,
  total_itens integer default 0,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, codigo)
);
create index kit_empresa_idx on public.kit(empresa_id);
select attach_updated_at_trigger('kit');

create table public.kit_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  kit_id uuid not null references public.kit(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete cascade,
  material_nome text,
  material_codigo text,
  material_unidade text,
  quantidade numeric(14,3) not null,
  preco_unitario numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index kit_item_empresa_idx on public.kit_item(empresa_id);
create index kit_item_kit_idx on public.kit_item(kit_id);
create index kit_item_material_idx on public.kit_item(material_id);
select attach_updated_at_trigger('kit_item');

-- FK pendente: orcamento_item.kit_id
alter table public.orcamento_item
  add constraint orc_item_kit_fk
  foreign key (kit_id) references public.kit(id) on delete set null;

alter table public.orcamento_item
  add constraint orc_item_material_fk
  foreign key (material_id) references public.material(id) on delete set null;
