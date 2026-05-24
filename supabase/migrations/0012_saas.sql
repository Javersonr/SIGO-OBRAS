-- ============================================================================
-- 0012 — SaaS comercial (4 tabelas)
-- Lado super_admin: cobrança das empresas que usam o SIGO Obras
-- ============================================================================

-- ============================================================================
-- 1. plano (catálogo global)
-- ============================================================================
create table public.plano (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  valor_mensal numeric(14,2) not null,
  max_usuarios integer,
  max_projetos integer,
  recursos jsonb default '[]'::jsonb,
  modulos_liberados jsonb default '{}'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
select attach_updated_at_trigger('plano');

-- ============================================================================
-- 2. proposta_comercial (pré-venda para novas empresas)
-- ============================================================================
create table public.proposta_comercial (
  id uuid primary key default gen_random_uuid(),
  numero text,
  empresa_id uuid references public.empresa(id) on delete set null,
  empresa_nome text not null,
  empresa_cnpj text,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  plano_id uuid not null references public.plano(id) on delete restrict,
  plano_nome text,
  valor_mensal numeric(14,2) not null,
  desconto_percentual numeric(5,2),
  valor_final numeric(14,2),
  vigencia_meses integer,
  data_validade date,
  status text not null check (status in ('Rascunho','Enviada','Em Análise','Aprovada','Rejeitada','Expirada')),
  observacoes text,
  campos_customizados jsonb,
  termos_condicoes text,
  responsavel_id uuid,
  responsavel_nome text,
  data_envio timestamptz,
  data_resposta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index prop_status_idx on public.proposta_comercial(status);
create index prop_empresa_idx on public.proposta_comercial(empresa_id) where empresa_id is not null;
create index prop_plano_idx on public.proposta_comercial(plano_id);
select attach_updated_at_trigger('proposta_comercial');

-- ============================================================================
-- 3. assinatura
-- ============================================================================
create table public.assinatura (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  empresa_nome text,
  plano_id uuid not null references public.plano(id) on delete restrict,
  plano_nome text,
  status text not null check (status in ('Ativa','Suspensa','Cancelada','Trial')),
  data_inicio date,
  data_vencimento date,
  valor_mensal numeric(14,2),
  forma_pagamento text check (forma_pagamento in ('Boleto','Cartão','PIX','Transferência')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ass_empresa_idx on public.assinatura(empresa_id);
create index ass_status_idx on public.assinatura(status);
create index ass_venc_idx on public.assinatura(data_vencimento) where data_vencimento is not null;
select attach_updated_at_trigger('assinatura');

-- FK pendente da 0011: boleto.assinatura_id
alter table public.boleto_bancario
  add constraint blt_assinatura_fk
  foreign key (assinatura_id) references public.assinatura(id) on delete set null;

-- ============================================================================
-- 4. pagamento (pagamentos da assinatura SaaS)
-- ============================================================================
create table public.pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  empresa_nome text,
  assinatura_id uuid not null references public.assinatura(id) on delete cascade,
  valor numeric(14,2) not null,
  data_vencimento date not null,
  data_pagamento date,
  status text not null check (status in ('Pendente','Pago','Atrasado','Cancelado')),
  forma_pagamento text,
  comprovante_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index pag_empresa_idx on public.pagamento(empresa_id);
create index pag_assinatura_idx on public.pagamento(assinatura_id);
create index pag_status_idx on public.pagamento(status);
create index pag_venc_idx on public.pagamento(data_vencimento);
select attach_updated_at_trigger('pagamento');

-- FK pendente da 0011: boleto.pagamento_id
alter table public.boleto_bancario
  add constraint blt_pagamento_fk
  foreign key (pagamento_id) references public.pagamento(id) on delete set null;
