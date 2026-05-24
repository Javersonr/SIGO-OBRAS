-- ============================================================================
-- 0004 — CRM / Oportunidades (6 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. status_oportunidade
-- ============================================================================
create table public.status_oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  cor text,
  ordem integer,
  tipo text check (tipo in ('aberto','ganho','perdido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index status_op_empresa_idx on public.status_oportunidade(empresa_id);
select attach_updated_at_trigger('status_oportunidade');

-- ============================================================================
-- 2. origem_oportunidade
-- ============================================================================
create table public.origem_oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, nome)
);
create index origem_op_empresa_idx on public.origem_oportunidade(empresa_id);
select attach_updated_at_trigger('origem_oportunidade');

-- ============================================================================
-- 3. template_oportunidade
-- ============================================================================
create table public.template_oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  campos_padrao jsonb default '{}'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index tpl_op_empresa_idx on public.template_oportunidade(empresa_id);
select attach_updated_at_trigger('template_oportunidade');

-- ============================================================================
-- 4. oportunidade
-- ============================================================================
create table public.oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  cliente_id uuid references public.cliente(id) on delete set null,
  cliente_nome text,
  status_id uuid references public.status_oportunidade(id) on delete set null,
  status_nome text,
  origem_id uuid references public.origem_oportunidade(id) on delete set null,
  origem_nome text,
  valor_estimado numeric(14,2) default 0,
  probabilidade integer default 50 check (probabilidade between 0 and 100),
  data_fechamento_prevista date,
  descricao text,
  observacoes text,
  responsavel_id uuid,
  responsavel_nome text,
  responsavel_email text,
  responsaveis_ids jsonb default '[]'::jsonb,
  licitacao_modalidade text,
  licitacao_data date,
  licitacao_horario text,
  licitacao_data_impugnacao date,
  licitacao_data_proposta date,
  licitacao_horario_proposta text,
  licitacao_garantia_proposta boolean default false,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  etiquetas_ids jsonb default '[]'::jsonb,
  arquivado boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index op_empresa_idx on public.oportunidade(empresa_id);
create index op_cliente_idx on public.oportunidade(cliente_id) where cliente_id is not null;
create index op_status_idx on public.oportunidade(empresa_id, status_id);
create index op_responsavel_idx on public.oportunidade(responsavel_id) where responsavel_id is not null;
select attach_updated_at_trigger('oportunidade');

-- FK pendente do migration 0001 (token_cliente_oportunidade.oportunidade_id)
alter table public.token_cliente_oportunidade
  add constraint token_cliente_op_fk
  foreign key (oportunidade_id) references public.oportunidade(id) on delete cascade;

-- ============================================================================
-- 5. oportunidade_atualizacao — timeline de mudanças
-- ============================================================================
create table public.oportunidade_atualizacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  oportunidade_id uuid references public.oportunidade(id) on delete cascade,
  projeto_id uuid,
  usuario_id uuid,
  usuario_nome text,
  tipo text not null check (tipo in ('Status','Nota','Sistema','Arquivo')),
  descricao text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index op_atual_empresa_idx on public.oportunidade_atualizacao(empresa_id);
create index op_atual_op_idx on public.oportunidade_atualizacao(oportunidade_id);
create index op_atual_projeto_idx on public.oportunidade_atualizacao(projeto_id) where projeto_id is not null;
select attach_updated_at_trigger('oportunidade_atualizacao');

-- ============================================================================
-- 6. arquivo_oportunidade
-- ============================================================================
create table public.arquivo_oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  oportunidade_id uuid references public.oportunidade(id) on delete cascade,
  projeto_id uuid,
  nome text not null,
  url text not null,
  tipo text,
  tamanho bigint,
  usuario_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index arq_op_empresa_idx on public.arquivo_oportunidade(empresa_id);
create index arq_op_op_idx on public.arquivo_oportunidade(oportunidade_id);
select attach_updated_at_trigger('arquivo_oportunidade');
