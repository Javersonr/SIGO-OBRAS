-- ============================================================================
-- 0100: Treinamentos EAD — hospedagem própria de vídeo + avaliação
--
-- Aula passa a aceitar vídeo hospedado no Storage (bucket 'treinamentos',
-- isolado por empresa) OU YouTube (híbrido, por aula).
-- Avaliação: questões de múltipla escolha por curso; a matrícula só conclui
-- com todas as aulas assistidas E aprovação na avaliação (quando houver),
-- com nota mínima configurável por curso (default 70%).
-- ============================================================================

alter table public.treinamento_aula
  add column if not exists video_ref text,          -- "bucket/caminho" no Storage
  add column if not exists fonte text not null default 'youtube'
    check (fonte in ('youtube','upload'));
alter table public.treinamento_aula alter column youtube_id drop not null;

alter table public.treinamento_curso
  add column if not exists nota_minima integer not null default 70;

alter table public.treinamento_matricula
  add column if not exists nota_avaliacao numeric,
  add column if not exists avaliacao_aprovada boolean,
  add column if not exists avaliacao_em timestamptz;

create table if not exists public.treinamento_questao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  curso_id uuid not null references public.treinamento_curso(id) on delete cascade,
  ordem integer not null default 1,
  pergunta text not null,
  opcoes jsonb not null default '[]'::jsonb,   -- ["opção A", "opção B", ...]
  correta integer not null default 0,           -- índice da opção correta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists trein_questao_curso_idx on public.treinamento_questao(curso_id);
select attach_updated_at_trigger('treinamento_questao');

alter table public.treinamento_questao enable row level security;
do $pol$ begin
  create policy tenant_isolation on public.treinamento_questao
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.treinamento_questao
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

-- bucket de vídeos com isolamento por empresa (helper da 0015)
select public.ensure_tenant_bucket('treinamentos');
-- vídeos são grandes: limite por arquivo de 1GB no bucket
update storage.buckets set file_size_limit = 1073741824 where id = 'treinamentos';

select json_build_object(
  'questao', (select count(*) from information_schema.tables where table_name='treinamento_questao'),
  'bucket', (select file_size_limit from storage.buckets where id='treinamentos')
) as res;
