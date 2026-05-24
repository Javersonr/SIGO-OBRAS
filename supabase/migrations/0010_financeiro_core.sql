-- ============================================================================
-- 0010 — Financeiro core (7 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. conta_financeira (plano de contas hierárquico)
-- ============================================================================
create table public.conta_financeira (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('Banco','Caixa','Cartão','Investimento','Fundo Fixo')),
  responsavel_email text,
  codigo_contabil text,
  conta_pai_id uuid references public.conta_financeira(id) on delete set null,
  nivel integer,
  tipo_natureza text check (tipo_natureza in (
    'Ativo','Passivo','Receita','Despesa','Patrimônio Líquido'
  )),
  banco text,
  agencia text,
  numero_conta text,
  saldo_inicial numeric(14,2) default 0,
  saldo_atual numeric(14,2) default 0,
  cor text,
  integracao_bancaria boolean default false,
  codigo_banco text,
  token_acesso text,  -- TODO: mover pro Vault do Supabase
  ultima_sincronizacao timestamptz,
  categorizacao_automatica boolean default false,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index conta_empresa_idx on public.conta_financeira(empresa_id);
create index conta_tipo_idx on public.conta_financeira(empresa_id, tipo);
create index conta_pai_idx on public.conta_financeira(conta_pai_id) where conta_pai_id is not null;
create index conta_codigo_idx on public.conta_financeira(empresa_id, codigo_contabil) where codigo_contabil is not null;
select attach_updated_at_trigger('conta_financeira');

-- ============================================================================
-- 2. categoria_financeira (hierárquica)
-- ============================================================================
create table public.categoria_financeira (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('Receita','Despesa')),
  cor text,
  icone text,
  categoria_pai_id uuid references public.categoria_financeira(id) on delete set null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index catfin_empresa_idx on public.categoria_financeira(empresa_id);
create index catfin_tipo_idx on public.categoria_financeira(empresa_id, tipo);
create index catfin_pai_idx on public.categoria_financeira(categoria_pai_id) where categoria_pai_id is not null;
select attach_updated_at_trigger('categoria_financeira');

-- ============================================================================
-- 3. integracao_bancaria
-- ============================================================================
create table public.integracao_bancaria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  conta_id uuid not null references public.conta_financeira(id) on delete cascade,
  banco text not null,
  tipo_integracao text not null check (tipo_integracao in (
    'Open Finance','API Proprietária','Scraping','Manual'
  )),
  status text check (status in ('Ativa','Inativa','Erro','Pendente Autorização')) default 'Pendente Autorização',
  token_acesso text,  -- TODO: Vault
  refresh_token text, -- TODO: Vault
  expira_em timestamptz,
  ultima_sincronizacao timestamptz,
  proxima_sincronizacao timestamptz,
  frequencia_sincronizacao text check (frequencia_sincronizacao in (
    'Manual','Hora','4 horas','Diária','Semanal'
  )) default 'Manual',
  sincronizar_automaticamente boolean default false,
  transacoes_importadas integer default 0,
  ultima_transacao_data date,
  erros jsonb default '[]'::jsonb,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index intbnc_empresa_idx on public.integracao_bancaria(empresa_id);
create index intbnc_conta_idx on public.integracao_bancaria(conta_id);
create index intbnc_status_idx on public.integracao_bancaria(empresa_id, status);
select attach_updated_at_trigger('integracao_bancaria');

-- ============================================================================
-- 4. transacao_financeira
-- ============================================================================
create table public.transacao_financeira (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  tipo text not null check (tipo in ('Receita','Despesa')),
  conta_id uuid not null references public.conta_financeira(id) on delete restrict,
  conta_nome text,
  categoria_id uuid references public.categoria_financeira(id) on delete set null,
  categoria_nome text,
  centro_custo_id uuid references public.centro_custo(id) on delete set null,
  centro_custo_nome text,
  valor numeric(14,2) not null,
  data date not null,
  data_vencimento date,
  data_pagamento date,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
  fornecedor_nome text,
  cliente_id uuid references public.cliente(id) on delete set null,
  cliente_nome text,
  descricao text,
  status text check (status in ('Previsto','Realizado','Cancelado')) default 'Previsto',
  referencia_tipo text check (referencia_tipo in ('Pedido','OFX','Manual','Fatura','Outro')),
  referencia_id uuid,
  numero_documento text,
  observacoes text,
  conciliado boolean default false,
  forma_pagamento text,
  parcelado boolean default false,
  parcelas jsonb default '[]'::jsonb,
  pre_lancamento_id uuid,
  pre_lancamento_aprovado boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index tx_empresa_idx on public.transacao_financeira(empresa_id);
create index tx_data_idx on public.transacao_financeira(empresa_id, data desc);
create index tx_venc_idx on public.transacao_financeira(empresa_id, data_vencimento) where data_vencimento is not null;
create index tx_conta_idx on public.transacao_financeira(conta_id);
create index tx_categoria_idx on public.transacao_financeira(categoria_id) where categoria_id is not null;
create index tx_projeto_idx on public.transacao_financeira(projeto_id) where projeto_id is not null;
create index tx_fornecedor_idx on public.transacao_financeira(fornecedor_id) where fornecedor_id is not null;
create index tx_cliente_idx on public.transacao_financeira(cliente_id) where cliente_id is not null;
create index tx_status_idx on public.transacao_financeira(empresa_id, status);
create index tx_pre_lan_idx on public.transacao_financeira(pre_lancamento_id) where pre_lancamento_id is not null;
select attach_updated_at_trigger('transacao_financeira');

-- ============================================================================
-- 5. transacao_anexo
-- ============================================================================
create table public.transacao_anexo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  transacao_id uuid not null references public.transacao_financeira(id) on delete cascade,
  nome text not null,
  url text not null,
  tipo text check (tipo in ('documento','comprovante','recibo','nota_fiscal','orcamento')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index txa_empresa_idx on public.transacao_anexo(empresa_id);
create index txa_tx_idx on public.transacao_anexo(transacao_id);
select attach_updated_at_trigger('transacao_anexo');

-- ============================================================================
-- 6. transacao_transferencia
-- ============================================================================
create table public.transacao_transferencia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  conta_origem_id uuid not null references public.conta_financeira(id) on delete restrict,
  conta_origem_nome text,
  conta_destino_id uuid not null references public.conta_financeira(id) on delete restrict,
  conta_destino_nome text,
  valor numeric(14,2) not null,
  data date not null,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  check (conta_origem_id <> conta_destino_id)
);
create index txt_empresa_idx on public.transacao_transferencia(empresa_id);
create index txt_origem_idx on public.transacao_transferencia(conta_origem_id);
create index txt_destino_idx on public.transacao_transferencia(conta_destino_id);
create index txt_data_idx on public.transacao_transferencia(empresa_id, data desc);
select attach_updated_at_trigger('transacao_transferencia');

-- ============================================================================
-- 7. transacao_recorrente
-- ============================================================================
create table public.transacao_recorrente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  tipo text not null check (tipo in ('despesa','receita')),
  descricao text not null,
  valor numeric(14,2) not null,
  conta_id uuid not null references public.conta_financeira(id) on delete restrict,
  conta_nome text,
  categoria_id uuid references public.categoria_financeira(id) on delete set null,
  categoria_nome text,
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
  fornecedor_nome text,
  cliente_id uuid references public.cliente(id) on delete set null,
  cliente_nome text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  oportunidade_id uuid references public.oportunidade(id) on delete set null,
  oportunidade_nome text,
  frequencia text not null check (frequencia in ('diaria','semanal','mensal','anual')),
  data_inicio date not null,
  data_fim date,
  proxima_geracao date,
  dia_vencimento integer check (dia_vencimento between 1 and 31),
  forma_pagamento text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index txr_empresa_idx on public.transacao_recorrente(empresa_id);
create index txr_proxima_idx on public.transacao_recorrente(empresa_id, proxima_geracao) where ativo = true;
create index txr_conta_idx on public.transacao_recorrente(conta_id);
select attach_updated_at_trigger('transacao_recorrente');
