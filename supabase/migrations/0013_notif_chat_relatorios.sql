-- ============================================================================
-- 0013 — Notificações + Chat + Relatórios (5 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. notificacao
-- ============================================================================
create table public.notificacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_email text not null,
  titulo text not null,
  mensagem text not null,
  link text,
  tipo text check (tipo in (
    'Cotação','Projeto','Compra','Financeiro','Estoque','Sistema','Inspeção','Manutenção'
  )),
  prioridade text check (prioridade in ('Baixa','Normal','Alta','Urgente')) default 'Normal',
  lida boolean default false,
  icone text,
  dados_extra jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index notif_empresa_usuario_idx on public.notificacao(empresa_id, usuario_email, lida);
create index notif_tipo_idx on public.notificacao(empresa_id, tipo);
create index notif_created_idx on public.notificacao(empresa_id, created_at desc);
select attach_updated_at_trigger('notificacao');

-- ============================================================================
-- 2. preferencia_notificacao
-- ============================================================================
create table public.preferencia_notificacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_email text not null,
  preferencias jsonb default '{}'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, usuario_email)
);
create index pref_empresa_idx on public.preferencia_notificacao(empresa_id);
create index pref_email_idx on public.preferencia_notificacao(usuario_email);
select attach_updated_at_trigger('preferencia_notificacao');

-- ============================================================================
-- 3. canal_chat
-- ============================================================================
create table public.canal_chat (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  tipo text not null check (tipo in ('Projeto','Oportunidade','Tarefa','Solicitacao','Direto','Geral')),
  nome text not null,
  projeto_id uuid references public.projeto(id) on delete cascade,
  oportunidade_id uuid references public.oportunidade(id) on delete cascade,
  solicitacao_id uuid references public.solicitacao_compra(id) on delete cascade,
  pedido_id uuid references public.pedido_compra(id) on delete cascade,
  participantes jsonb default '[]'::jsonb,
  participantes_emails jsonb default '[]'::jsonb,
  ultima_mensagem text,
  ultima_mensagem_data timestamptz,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index canal_empresa_idx on public.canal_chat(empresa_id);
create index canal_tipo_idx on public.canal_chat(empresa_id, tipo);
create index canal_projeto_idx on public.canal_chat(projeto_id) where projeto_id is not null;
create index canal_op_idx on public.canal_chat(oportunidade_id) where oportunidade_id is not null;
create index canal_sol_idx on public.canal_chat(solicitacao_id) where solicitacao_id is not null;
create index canal_ped_idx on public.canal_chat(pedido_id) where pedido_id is not null;
select attach_updated_at_trigger('canal_chat');

-- ============================================================================
-- 4. mensagem_chat
-- ============================================================================
create table public.mensagem_chat (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  canal_id uuid not null references public.canal_chat(id) on delete cascade,
  usuario_id uuid,
  usuario_email text not null,
  usuario_nome text,
  mensagem text not null,
  mencoes jsonb default '[]'::jsonb,
  arquivo_url text,
  arquivo_nome text,
  arquivo_tipo text,
  lida_por jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index msg_empresa_idx on public.mensagem_chat(empresa_id);
create index msg_canal_idx on public.mensagem_chat(canal_id, created_at desc);
create index msg_usuario_idx on public.mensagem_chat(empresa_id, usuario_email);
select attach_updated_at_trigger('mensagem_chat');

-- ============================================================================
-- 5. relatorio_customizado
-- ============================================================================
create table public.relatorio_customizado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_id uuid not null,
  nome text not null,
  tipo text not null check (tipo in ('DRE','Balanço','Fluxo de Caixa','Personalizado')),
  filtros jsonb not null default '{}'::jsonb,
  metricas jsonb,
  configuracao_grafico jsonb,
  publico boolean default false,
  favorito boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index rel_empresa_idx on public.relatorio_customizado(empresa_id);
create index rel_usuario_idx on public.relatorio_customizado(usuario_id);
create index rel_tipo_idx on public.relatorio_customizado(empresa_id, tipo);
select attach_updated_at_trigger('relatorio_customizado');
