-- ============================================================================
-- 0001 — Helpers comuns + Auth & Multi-tenant
-- ============================================================================
-- Cobre 8 tabelas-base de auth/tenant: GrupoEmpresarial, Empresa, profiles,
-- UsuarioCustom, UsuarioEmpresa, ClientePortalUsuario, FornecedorAcesso,
-- TokenClienteOportunidade
--
-- Convenções deste e dos próximos arquivos:
--   * id uuid primary key default gen_random_uuid()
--   * empresa_id uuid not null (NÃO referencia public.empresa enquanto a
--     primeira empresa não foi criada — adicionamos FK depois com NOT VALID)
--   * created_at, updated_at: trigger set_updated_at
--   * deleted_at: soft delete (preserva o endpoint /restore do Base44)
--   * RLS desligada: ativaremos em 0015 quando o fluxo de JWT estiver pronto
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: trigger para atualizar updated_at
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: aplicar trigger updated_at numa tabela (idempotente)
-- ---------------------------------------------------------------------------
create or replace function attach_updated_at_trigger(tname text)
returns void
language plpgsql
as $$
begin
  execute format(
    'drop trigger if exists set_updated_at on public.%I', tname
  );
  execute format(
    'create trigger set_updated_at before update on public.%I
       for each row execute function set_updated_at()',
    tname
  );
end;
$$;

-- ============================================================================
-- 1. grupo_empresarial — holding (pai das empresas)
-- ============================================================================
create table public.grupo_empresarial (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj_principal text,
  razao_social text,
  nome_fantasia text,
  email text,
  telefone text,
  logo_url text,
  max_empresas integer,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
select attach_updated_at_trigger('grupo_empresarial');

-- ============================================================================
-- 2. empresa
-- ============================================================================
create table public.empresa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  email text,
  telefone text,
  whatsapp_financeiro text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  responsavel_principal text,
  observacoes text,
  logo_url text,
  tema_cores jsonb,
  grupo_id uuid references public.grupo_empresarial(id),
  is_holding boolean default false,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index empresa_grupo_idx on public.empresa(grupo_id);
create index empresa_cnpj_idx on public.empresa(cnpj) where cnpj is not null;
select attach_updated_at_trigger('empresa');

-- ============================================================================
-- 3. profiles — extensão de auth.users (Supabase Auth)
-- ----------------------------------------------------------------------------
-- Substitui a entidade `User` nativa do Base44. Cada auth.users tem 1 profile.
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  telefone text,
  role text check (role in ('admin', 'user')) default 'user',
  dashboard_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select attach_updated_at_trigger('profiles');

-- Trigger: ao criar usuário no auth, cria profile vazio
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================================
-- 4. usuario_custom — credencial local (legado Base44, manter por compat)
-- ----------------------------------------------------------------------------
-- Será sincronizada com Supabase Auth durante a Fase 2 (dual-write).
-- ============================================================================
create table public.usuario_custom (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  senha_hash text not null,
  nome_completo text not null,
  empresa_id uuid not null,
  is_super_admin boolean default false,
  ativo boolean default true,
  reset_token text,
  reset_token_expira timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index usuario_custom_empresa_idx on public.usuario_custom(empresa_id);
create index usuario_custom_auth_idx on public.usuario_custom(auth_user_id) where auth_user_id is not null;
select attach_updated_at_trigger('usuario_custom');

-- ============================================================================
-- 5. usuario_empresa — vínculo N:N usuário ↔ empresa, com perfil
-- ============================================================================
create table public.usuario_empresa (
  id uuid primary key default gen_random_uuid(),
  usuario_email text not null,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  grupo_id uuid references public.grupo_empresarial(id),
  nome_completo text,
  telefone text,
  documento text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  foto_url text,
  perfil text not null check (perfil in (
    'Admin Holding', 'Admin', 'Gestor', 'Compras', 'Estoque', 'Financeiro', 'Cliente'
  )),
  permissoes jsonb,
  is_owner boolean default false,
  projeto_id uuid,
  projeto_nome text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (usuario_email, empresa_id)
);
create index usuario_empresa_email_idx on public.usuario_empresa(usuario_email);
create index usuario_empresa_empresa_idx on public.usuario_empresa(empresa_id);
create index usuario_empresa_grupo_idx on public.usuario_empresa(grupo_id) where grupo_id is not null;
select attach_updated_at_trigger('usuario_empresa');

-- ============================================================================
-- 6. cliente_portal_usuario — login do cliente final no portal
-- ============================================================================
create table public.cliente_portal_usuario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  projeto_id uuid not null,
  nome text not null,
  email text not null,
  senha_hash text,
  telefone text,
  cpf_cnpj text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, email)
);
create index cliente_portal_empresa_idx on public.cliente_portal_usuario(empresa_id);
create index cliente_portal_projeto_idx on public.cliente_portal_usuario(projeto_id);
select attach_updated_at_trigger('cliente_portal_usuario');

-- ============================================================================
-- 7. fornecedor_acesso — credencial para portal do fornecedor
-- ============================================================================
create table public.fornecedor_acesso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  fornecedor_id uuid not null,
  fornecedor_email text not null,
  fornecedor_nome text,
  senha_acesso text not null,  -- TODO: hashear no cutover
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, fornecedor_email)
);
create index fornecedor_acesso_empresa_idx on public.fornecedor_acesso(empresa_id);
create index fornecedor_acesso_fornecedor_idx on public.fornecedor_acesso(fornecedor_id);
select attach_updated_at_trigger('fornecedor_acesso');

-- ============================================================================
-- 8. token_cliente_oportunidade — link mágico para cliente ver oportunidade
-- ============================================================================
create table public.token_cliente_oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  oportunidade_id uuid not null,
  token text not null unique,
  email_cliente text,
  expira_em timestamptz,
  abas_liberadas jsonb default '[]'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index token_cliente_op_empresa_idx on public.token_cliente_oportunidade(empresa_id);
create index token_cliente_op_oportunidade_idx on public.token_cliente_oportunidade(oportunidade_id);
select attach_updated_at_trigger('token_cliente_oportunidade');
