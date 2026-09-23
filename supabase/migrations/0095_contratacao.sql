-- ============================================================================
-- 0095: Esteira de Contratação (Sub-projeto B da spec RH & Segurança)
--
-- contratacao: pipeline do candidato (documentos → conferência → autorização
-- de exames → exames → validação PCMSO → contabilidade → registrado).
-- empresa.pcmso_ref: PDF do PCMSO da empresa (ref "bucket/caminho"), usado
-- pela IA na validação dos exames. funcionario.salario: definido na esteira.
-- Bucket 'contratacao' com isolamento por empresa (helper 0015).
-- ============================================================================

create table if not exists public.contratacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  etapa text not null default 'documentos' check (etapa in (
    'documentos','conferencia','autorizacao_exames','exames',
    'validacao_pcmso','contabilidade','registrado','cancelado'
  )),
  -- dados do candidato (preenchidos pela IA e revisados)
  nome_completo text,
  cpf text,
  rg text,
  data_nascimento date,
  telefone text,
  endereco text,
  cidade text,
  estado text,
  cep text,
  pis_nis text,
  ctps_numero text,
  -- definição da vaga
  funcao_id uuid references public.funcao(id) on delete set null,
  funcao_nome text,
  salario numeric,
  responsavel_exame_email text,
  responsavel_exame_nome text,
  -- anexos: [{ref:"bucket/caminho", nome, item, por_ia}]
  anexos jsonb not null default '[]'::jsonb,
  exames_anexos jsonb not null default '[]'::jsonb,
  extracao_ia jsonb,
  validacao_ia jsonb,
  -- marcos
  autorizacao_emitida_em timestamptz,
  exames_validados_em timestamptz,
  enviado_contabilidade_em timestamptz,
  registrado_em timestamptz,
  funcionario_id uuid references public.funcionario(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists contratacao_empresa_idx on public.contratacao(empresa_id);
select attach_updated_at_trigger('contratacao');

alter table public.contratacao enable row level security;
do $pol$ begin
  create policy tenant_isolation on public.contratacao
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy super_admin_all on public.contratacao
    using (public.current_user_is_super_admin())
    with check (public.current_user_is_super_admin());
exception when duplicate_object then null; end $pol$;

alter table public.empresa add column if not exists pcmso_ref text;
alter table public.funcionario add column if not exists salario numeric;

select public.ensure_tenant_bucket('contratacao');

select json_build_object(
  'tabela', (select count(*) from information_schema.tables where table_name='contratacao'),
  'bucket', (select count(*) from storage.buckets where id='contratacao'),
  'pcmso_ref', (select count(*) from information_schema.columns where table_name='empresa' and column_name='pcmso_ref'),
  'salario', (select count(*) from information_schema.columns where table_name='funcionario' and column_name='salario')
) as res;
