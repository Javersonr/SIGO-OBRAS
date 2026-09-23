-- ============================================================================
-- 0097: Plataforma de Treinamentos EAD (Sub-projeto D da spec RH & Segurança)
--
-- Cursos com aulas em vídeo (YouTube não listado). Funcionário assiste pelo
-- Portal do Funcionário (token HMAC); aula conclui com >=90% assistido; o
-- curso conclui quando TODAS as aulas concluírem → grava data e calcula a
-- próxima renovação (validade_meses).
-- ============================================================================

create table if not exists public.treinamento_curso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  codigo text,
  descricao text,
  validade_meses integer,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists trein_curso_empresa_idx on public.treinamento_curso(empresa_id);
select attach_updated_at_trigger('treinamento_curso');

create table if not exists public.treinamento_aula (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  ordem integer not null default 1,
  titulo text not null,
  youtube_id text not null,
  duracao_seg integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists trein_aula_curso_idx on public.treinamento_aula(curso_id);
select attach_updated_at_trigger('treinamento_aula');

create table if not exists public.treinamento_matricula (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluido')),
  data_conclusao date,
  proxima_renovacao date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists trein_mat_empresa_idx on public.treinamento_matricula(empresa_id);
create index if not exists trein_mat_func_idx on public.treinamento_matricula(funcionario_id);
select attach_updated_at_trigger('treinamento_matricula');

create table if not exists public.treinamento_progresso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  matricula_id uuid not null references public.treinamento_matricula(id) on delete cascade,
  aula_id uuid not null references public.treinamento_aula(id) on delete cascade,
  segundos_assistidos integer not null default 0,
  concluida boolean not null default false,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matricula_id, aula_id)
);
select attach_updated_at_trigger('treinamento_progresso');

do $rls$
declare t text;
begin
  foreach t in array array['treinamento_curso','treinamento_aula',
                           'treinamento_matricula','treinamento_progresso'] loop
    execute format('alter table public.%I enable row level security', t);
    begin
      execute format($p$create policy tenant_isolation on public.%I
        using (empresa_id = public.current_empresa_id())
        with check (empresa_id = public.current_empresa_id())$p$, t);
    exception when duplicate_object then null; end;
    begin
      execute format($p$create policy super_admin_all on public.%I
        using (public.current_user_is_super_admin())
        with check (public.current_user_is_super_admin())$p$, t);
    exception when duplicate_object then null; end;
  end loop;
end $rls$;

select json_build_object('tabelas', (
  select count(*) from information_schema.tables
  where table_name like 'treinamento_%' and table_schema = 'public'
)) as res;
