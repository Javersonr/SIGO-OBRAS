-- ============================================================================
-- 0103: Portal do Funcionário com login + trilha de auditoria do EAD
--
-- Requisitos do EAD de segurança (NR-1, Anexo II): identificar o aluno,
-- registrar acessos e atividades com data/hora do servidor, guardar cada
-- tentativa de avaliação, emitir certificado verificável e oferecer projeto
-- pedagógico e canal de dúvidas.
-- ============================================================================

-- 1. Credenciais do portal ---------------------------------------------------
-- Sem policies: só as edge functions (service role) leem e gravam. O hash da
-- senha nunca chega ao navegador de ninguém, nem da equipe do RH.
create table if not exists public.funcionario_portal_acesso (
  funcionario_id uuid primary key references public.funcionario(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario text not null,
  senha_hash text not null,
  senha_provisoria boolean not null default true,
  ativo boolean not null default true,
  tentativas integer not null default 0,
  bloqueado_ate timestamptz,
  -- incrementa ao redefinir/desativar: derruba as sessões abertas
  sessao_versao integer not null default 1,
  ultimo_acesso timestamptz,
  -- relógio do servidor usado para validar o tempo assistido informado
  ultimo_sinal_em timestamptz,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists funcionario_portal_acesso_usuario_uidx
  on public.funcionario_portal_acesso (lower(usuario));
create index if not exists funcionario_portal_acesso_empresa_idx
  on public.funcionario_portal_acesso (empresa_id);
select attach_updated_at_trigger('funcionario_portal_acesso');
alter table public.funcionario_portal_acesso enable row level security;

-- 2. Trilha de eventos (somente inclusão) -------------------------------------
create table if not exists public.treinamento_evento (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  matricula_id uuid references public.treinamento_matricula(id) on delete set null,
  curso_id uuid,
  aula_id uuid,
  evento text not null,
  detalhe jsonb,
  ip text,
  dispositivo text,
  created_at timestamptz not null default now()
);
create index if not exists treinamento_evento_mat_idx
  on public.treinamento_evento (matricula_id, created_at);
create index if not exists treinamento_evento_func_idx
  on public.treinamento_evento (funcionario_id, created_at);
alter table public.treinamento_evento enable row level security;
do $pol$ begin
  create policy tenant_read on public.treinamento_evento for select
    using (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_read on public.treinamento_evento for select
    using (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

-- 3. Tentativas da avaliação (histórico completo, com a prova como foi feita) --
create table if not exists public.treinamento_tentativa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade,
  curso_id uuid not null,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  numero integer not null,
  prova jsonb not null,      -- [{questao_id, ordem, pergunta, opcoes, correta}]
  respostas jsonb not null,  -- [{questao_id, resposta, acertou}]
  acertos integer not null,
  total integer not null,
  nota numeric not null,
  aprovada boolean not null,
  ip text,
  dispositivo text,
  created_at timestamptz not null default now(),
  unique (matricula_id, numero)
);
alter table public.treinamento_tentativa enable row level security;
do $pol$ begin
  create policy tenant_read on public.treinamento_tentativa for select
    using (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_read on public.treinamento_tentativa for select
    using (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

-- 4. Dúvidas (canal com o tutor) ---------------------------------------------
create table if not exists public.treinamento_duvida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  matricula_id uuid references public.treinamento_matricula(id) on delete set null,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  aula_id uuid,
  pergunta text not null,
  resposta text,
  respondida_por text,
  respondida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists treinamento_duvida_curso_idx on public.treinamento_duvida (curso_id);
select attach_updated_at_trigger('treinamento_duvida');
alter table public.treinamento_duvida enable row level security;
do $pol$ begin
  create policy tenant_isolation on public.treinamento_duvida
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.treinamento_duvida
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

-- 5. Certificados ------------------------------------------------------------
-- Emitidos só pelo servidor (sem policy de insert). A equipe lê e pode revogar.
create table if not exists public.treinamento_certificado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  matricula_id uuid not null unique references public.treinamento_matricula(id) on delete cascade,
  curso_id uuid not null,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  codigo text not null unique,
  hash_sha256 text not null,
  dados jsonb not null,
  assinatura_aluno jsonb not null,
  emitido_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por text,
  motivo_revogacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select attach_updated_at_trigger('treinamento_certificado');
alter table public.treinamento_certificado enable row level security;
do $pol$ begin
  create policy tenant_read on public.treinamento_certificado for select
    using (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy tenant_revogar on public.treinamento_certificado for update
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.treinamento_certificado
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

-- 6. Curso: certificado, projeto pedagógico, regras da avaliação, tutor -------
alter table public.treinamento_curso
  add column if not exists conteudo_programatico text,
  add column if not exists projeto_pedagogico_ref text,
  add column if not exists responsavel_tecnico_nome text,
  add column if not exists responsavel_tecnico_registro text,
  add column if not exists instrutor_nome text,
  add column if not exists instrutor_qualificacao text,
  add column if not exists tutor_telefone text,
  add column if not exists max_tentativas integer not null default 3,
  add column if not exists intervalo_tentativa_min integer not null default 30;

-- 7. Aula: módulo e tipos (vídeo, PDF, texto) ---------------------------------
-- Em PDF/texto, duracao_seg é o tempo mínimo de leitura com a aula aberta.
alter table public.treinamento_aula
  add column if not exists modulo text,
  add column if not exists tipo text not null default 'video',
  add column if not exists arquivo_ref text,
  add column if not exists conteudo_texto text;
do $chk$ begin
  alter table public.treinamento_aula
    add constraint treinamento_aula_tipo_chk check (tipo in ('video','pdf','texto'));
exception when duplicate_object then null; end $chk$;

-- 8. Matrícula: início efetivo e tentativas extras liberadas pelo RH ----------
alter table public.treinamento_matricula
  add column if not exists iniciado_em timestamptz,
  add column if not exists tentativas_extras integer not null default 0;

select 'ok' as res;
