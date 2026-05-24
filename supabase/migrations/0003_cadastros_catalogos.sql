-- ============================================================================
-- 0003 — Cadastros gerais + Catálogos (9 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. cliente
-- ============================================================================
create table public.cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome_razao text not null,
  nome_fantasia text,
  tipo_pessoa text check (tipo_pessoa in ('PF','PJ')),
  documento text,
  contato_email text,
  contato_telefone text,
  endereco text,
  numero text,
  complemento_bairro text,
  cidade text,
  estado text,
  cep text,
  contato_principal text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index cliente_empresa_idx on public.cliente(empresa_id);
create index cliente_documento_idx on public.cliente(empresa_id, documento) where documento is not null;
select attach_updated_at_trigger('cliente');

-- ============================================================================
-- 2. fornecedor
-- ============================================================================
create table public.fornecedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome_razao text not null,
  nome_fantasia text,
  tipo_pessoa text check (tipo_pessoa in ('PF','PJ')),
  cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  contato_nome text,
  email text,
  telefone text,
  endereco text,
  numero text,
  complemento_bairro text,
  cidade text,
  estado text,
  cep text,
  contato_principal text,
  categorias jsonb default '[]'::jsonb,
  observacoes text,
  avaliacao numeric(3,1),
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index fornecedor_empresa_idx on public.fornecedor(empresa_id);
create index fornecedor_cnpj_idx on public.fornecedor(empresa_id, cnpj) where cnpj is not null;
select attach_updated_at_trigger('fornecedor');

-- ============================================================================
-- 3. etiqueta
-- ============================================================================
create table public.etiqueta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  cor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index etiqueta_empresa_idx on public.etiqueta(empresa_id);
select attach_updated_at_trigger('etiqueta');

-- ============================================================================
-- 4. caminhao
-- ============================================================================
create table public.caminhao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  placa text not null,
  modelo text,
  marca text,
  ano integer,
  cor text,
  renavam text,
  chassi text,
  km_atual numeric(10,1),
  motorista_padrao_id uuid,
  motorista_padrao_nome text,
  foto_url text,
  ferramentas_obrigatorias jsonb default '[]'::jsonb,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, placa)
);
create index caminhao_empresa_idx on public.caminhao(empresa_id);
select attach_updated_at_trigger('caminhao');

-- ============================================================================
-- 5. caminhao_campo_obrigatorio
-- ============================================================================
create table public.caminhao_campo_obrigatorio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  caminhao_id uuid not null references public.caminhao(id) on delete cascade,
  caminhao_placa text,
  nome_campo text not null,
  quantidade_obrigatoria numeric(10,2) not null,
  descricao text,
  ferramenta_ids jsonb default '[]'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ccobr_empresa_idx on public.caminhao_campo_obrigatorio(empresa_id);
create index ccobr_caminhao_idx on public.caminhao_campo_obrigatorio(caminhao_id);
select attach_updated_at_trigger('caminhao_campo_obrigatorio');

-- ============================================================================
-- 6. categoria_material
-- ============================================================================
create table public.categoria_material (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, nome)
);
create index cat_mat_empresa_idx on public.categoria_material(empresa_id);
select attach_updated_at_trigger('categoria_material');

-- ============================================================================
-- 7. unidade_medida
-- ============================================================================
create table public.unidade_medida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  sigla text not null,
  nome text not null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, sigla)
);
create index unid_med_empresa_idx on public.unidade_medida(empresa_id);
select attach_updated_at_trigger('unidade_medida');

-- ============================================================================
-- 8. categoria_mao_de_obra
-- ============================================================================
create table public.categoria_mao_de_obra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, nome)
);
create index cat_mo_empresa_idx on public.categoria_mao_de_obra(empresa_id);
select attach_updated_at_trigger('categoria_mao_de_obra');

-- ============================================================================
-- 9. centro_custo
-- ============================================================================
create table public.centro_custo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  codigo text,
  nome text not null,
  descricao text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, codigo)
);
create index centro_custo_empresa_idx on public.centro_custo(empresa_id);
select attach_updated_at_trigger('centro_custo');
