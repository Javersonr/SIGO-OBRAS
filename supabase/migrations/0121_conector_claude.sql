-- ============================================================================
-- 0121_conector_claude.sql — conector do Claude (MCP): autorização própria
--
-- JÁ APLICADA em 25/09/2026 — não reaplicar: religaria o conector/módulo que o
-- SaaS Admin tenha desligado (o update do fim liga empresa.conector_claude).
--
-- O SIGO é o servidor de autorização do conector (spec 2026-09-25): chaves
-- OPACAS (aqui só o SHA-256), presas a UMA empresa escolhida na tela de
-- autorização. Tabelas só-servidor (Edge Functions mcp e mcp-oauth, service
-- role): RLS ligada, nenhuma policy, nenhum privilégio para anon/authenticated.
-- mcp_auditoria: o Admin da empresa lê; só o servidor grava.
-- empresa.conector_claude: liberação comercial por empresa (a RLS de empresa
-- já só deixa o super admin escrever — empresa_super_admin).
-- ============================================================================

alter table public.empresa add column if not exists conector_claude boolean not null default false;

create table if not exists public.conector_cliente (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  nome text not null,
  redirect_uris text[] not null,
  tipo text not null check (tipo in ('claude', 'loopback')),
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);

create table if not exists public.conector_autorizacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_custom_id uuid not null references public.usuario_custom(id) on delete cascade,
  usuario_email text not null,
  cliente_id uuid references public.conector_cliente(id) on delete set null,
  tipo text not null check (tipo in ('oauth', 'manual')),
  resource text not null,
  escopo text not null default 'conector',
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogado_em timestamptz,
  revogado_motivo text
);
create index if not exists conector_autorizacao_usuario_idx
  on public.conector_autorizacao (usuario_custom_id) where revogado_em is null;

create table if not exists public.conector_codigo (
  codigo_hash text primary key,
  autorizacao_id uuid not null references public.conector_autorizacao(id) on delete cascade,
  cliente_id uuid not null references public.conector_cliente(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  resource text not null,
  expira_em timestamptz not null,
  usado_em timestamptz
);

create table if not exists public.conector_chave (
  chave_hash text primary key,
  autorizacao_id uuid not null references public.conector_autorizacao(id) on delete cascade,
  tipo text not null check (tipo in ('acesso', 'renovacao', 'manual')),
  familia uuid not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  substituida_em timestamptz,
  revogada_em timestamptz
);
create index if not exists conector_chave_autorizacao_idx on public.conector_chave (autorizacao_id);

create table if not exists public.mcp_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_email text,
  autorizacao_id uuid,
  cliente text,
  ferramenta text not null,
  alvo text,
  resultado text not null check (resultado in ('ok', 'negado', 'erro')),
  motivo text,
  ip text,
  criado_em timestamptz not null default now()
);
create index if not exists mcp_auditoria_empresa_idx on public.mcp_auditoria (empresa_id, criado_em desc);

-- Só-servidor (padrão 0112): RLS ligada, sem policies, sem privilégio de cliente
do $$
declare t text;
begin
  foreach t in array array['conector_cliente', 'conector_autorizacao', 'conector_codigo', 'conector_chave', 'mcp_auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- mcp_auditoria: leitura pelo Admin da empresa ativa (e super admin)
grant select on table public.mcp_auditoria to authenticated;
do $rls$ begin
  create policy mcp_auditoria_select on public.mcp_auditoria for select to authenticated
    using (
      (empresa_id = public.current_empresa_id() and public.current_user_perfil() = 'Admin')
      or public.current_user_is_super_admin()
    );
exception when duplicate_object then null; end $rls$;

-- Liberação inicial (decisão 25/09/2026): Sinergia Construções e SG Ligth
update public.empresa set conector_claude = true
 where id in ('00000000-695c-339e-bec0-d89449ec981c', 'a335df76-d5a9-42fb-be01-5c82032fb5d8');

select 'ok' as res;
