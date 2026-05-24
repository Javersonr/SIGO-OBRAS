-- ============================================================================
-- 0002 — Permissões + Auditoria (7 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. permissao_detalhada (catálogo global — sem empresa_id)
-- ============================================================================
create table public.permissao_detalhada (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text not null unique,
  modulo text not null check (modulo in (
    'Dashboard','Oportunidades','Projetos','Compras','Estoque','Ferramental',
    'Segurança','Financeiro','Contabilidade','Relatórios','Configurações'
  )),
  aba text,
  acao text not null check (acao in (
    'visualizar','criar','editar','deletar','aprovar','exportar','importar'
  )),
  descricao text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
select attach_updated_at_trigger('permissao_detalhada');

-- ============================================================================
-- 2. perfil_permissao (global OU por empresa)
-- ============================================================================
create table public.perfil_permissao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo text not null check (tipo in ('Global','Customizado')),
  permissoes_json jsonb default '{}'::jsonb,
  nivel_hierarquico integer,
  criado_por text,
  modificado_por text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index perfil_perm_empresa_idx on public.perfil_permissao(empresa_id) where empresa_id is not null;
create index perfil_perm_tipo_idx on public.perfil_permissao(tipo);
select attach_updated_at_trigger('perfil_permissao');

-- ============================================================================
-- 3. nivel_aprovacao
-- ============================================================================
create table public.nivel_aprovacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  ordem integer not null,
  tipo text not null check (tipo in ('SolicitacaoCompra','OrcamentoProjeto')),
  valor_minimo numeric(14,2),
  valor_maximo numeric(14,2),
  perfis_aprovadores jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index nivel_aprov_empresa_idx on public.nivel_aprovacao(empresa_id);
create index nivel_aprov_tipo_ordem_idx on public.nivel_aprovacao(empresa_id, tipo, ordem);
select attach_updated_at_trigger('nivel_aprovacao');

-- ============================================================================
-- 4. regra_aprovacao
-- ============================================================================
create table public.regra_aprovacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  tipo_documento text not null check (tipo_documento in ('SolicitacaoCompra','OrcamentoProjeto')),
  valor_minimo numeric(14,2),
  valor_maximo numeric(14,2),
  projeto_id uuid,
  departamento text,
  exigir_gestor_aprovacao boolean default false,
  pular_niveis boolean default false,
  niveis_ids jsonb default '[]'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index regra_aprov_empresa_idx on public.regra_aprovacao(empresa_id);
select attach_updated_at_trigger('regra_aprovacao');

-- ============================================================================
-- 5. gestor_aprovacao
-- ============================================================================
create table public.gestor_aprovacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_email text not null,
  usuario_nome text not null,
  tipo_aprovacao text check (tipo_aprovacao in ('SolicitacaoCompra','OrcamentoProjeto','Geral')),
  valor_minimo numeric(14,2),
  valor_maximo numeric(14,2),
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index gestor_aprov_empresa_idx on public.gestor_aprovacao(empresa_id);
create index gestor_aprov_email_idx on public.gestor_aprovacao(empresa_id, usuario_email);
select attach_updated_at_trigger('gestor_aprovacao');

-- ============================================================================
-- 6. aprovacao_solicitacao — registros de decisão
-- ============================================================================
create table public.aprovacao_solicitacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  solicitacao_id uuid not null,
  status text not null check (status in ('Pendente','Aprovado','Rejeitado')),
  aprovador_id uuid,
  aprovador_nome text,
  data_decisao timestamptz,
  comentarios text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index aprov_sol_empresa_idx on public.aprovacao_solicitacao(empresa_id);
create index aprov_sol_solicitacao_idx on public.aprovacao_solicitacao(solicitacao_id);
select attach_updated_at_trigger('aprovacao_solicitacao');

-- ============================================================================
-- 7. audit_log
-- ============================================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  usuario_email text not null,
  usuario_nome text,
  tipo_acao text not null check (tipo_acao in (
    'criar','editar','deletar','visualizar','exportar','imprimir','configurar','arquivar'
  )),
  entidade text not null,
  entidade_id uuid,
  entidade_nome text,
  descricao text not null,
  modulo text,
  dados_anteriores jsonb,
  dados_novos jsonb,
  endereco_ip inet,
  user_agent text,
  status text check (status in ('sucesso','erro')) default 'sucesso',
  mensagem_erro text,
  requer_atencao boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index audit_log_empresa_idx on public.audit_log(empresa_id);
create index audit_log_entidade_idx on public.audit_log(empresa_id, entidade);
create index audit_log_usuario_idx on public.audit_log(empresa_id, usuario_email);
create index audit_log_created_idx on public.audit_log(empresa_id, created_at desc);
select attach_updated_at_trigger('audit_log');
