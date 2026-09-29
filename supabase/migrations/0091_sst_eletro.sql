-- ============================================================================
-- 0091 — SST: espelho da planilha CONTROLE SST (Eletro & Energia) no Supabase
-- Alimentado pelo serviço sst-sync (VPS) a partir da planilha do OneDrive.
-- Somente leitura para usuários; escrita pelo service_role.
-- ============================================================================

create table if not exists public.sst_colaborador (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero integer not null,                       -- coluna Nº da planilha (chave estável)
  funcionario_id uuid references public.funcionario(id) on delete set null,
  nome text not null,
  cpf text,
  funcao text,
  equipe text,                                   -- placa do caminhão ou SEDE
  numero_equipe text,
  data_admissao date,
  data_aso date,
  status text,                                   -- ATIVO / INATIVO
  situacao text,                                 -- VERDE / AMARELO / VERMELHO / INATIVO
  pendencias integer default 0,
  vencidos integer default 0,
  vence_30 integer default 0,
  sem_data integer default 0,
  sem_assinatura integer default 0,
  presenca_pendente integer default 0,
  linha_planilha integer,
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index if not exists sst_colab_empresa_idx on public.sst_colaborador(empresa_id);
do $$ begin perform public.attach_updated_at_trigger('sst_colaborador'); exception when duplicate_object then null; end $$;

create table if not exists public.sst_treinamento_colab (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero integer not null,                       -- Nº do colaborador
  funcionario_id uuid references public.funcionario(id) on delete set null,
  nome text not null,
  funcao text,
  equipe text,
  codigo text not null,                          -- código da matriz (TTRP-0011)
  codigo_aplicado text,                          -- código do certificado (TTRP-0045 se reciclagem)
  treinamento text,
  tipo text,                                     -- COMPLETO / RECICLAGEM
  carga_horas numeric,
  validade_meses integer,
  status text,                                   -- PENDENTE / REALIZADO / ASSINADO
  data_realizacao date,
  lista_presenca text,                           -- PENDENTE / ASSINADA
  link text,
  vencimento date,
  dias_restantes integer,
  alerta text,                                   -- PENDENTE / SEM DATA / VENCIDO / SEM ASSINATURA / PRESENÇA PENDENTE / VENCE ≤30 / OK
  linha_planilha integer,
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero, codigo)
);
create index if not exists sst_trein_empresa_idx on public.sst_treinamento_colab(empresa_id);
create index if not exists sst_trein_alerta_idx on public.sst_treinamento_colab(empresa_id, alerta);
create index if not exists sst_trein_venc_idx on public.sst_treinamento_colab(empresa_id, vencimento);
do $$ begin perform public.attach_updated_at_trigger('sst_treinamento_colab'); exception when duplicate_object then null; end $$;

create table if not exists public.sst_exame_colab (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero integer not null,
  funcionario_id uuid references public.funcionario(id) on delete set null,
  nome text not null,
  funcao text,
  equipe text,
  exame text not null,                           -- ASO, AVP LAUDADA, ACV, ECG, EEG, AUDIOMETRIA, EXAMES LABORATORIAIS
  data date,
  validade_meses integer,
  link text,
  arquivo_na_pasta boolean,
  vencimento date,
  dias_restantes integer,
  alerta text,
  linha_planilha integer,
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero, exame)
);
create index if not exists sst_exame_empresa_idx on public.sst_exame_colab(empresa_id);
create index if not exists sst_exame_venc_idx on public.sst_exame_colab(empresa_id, vencimento);
do $$ begin perform public.attach_updated_at_trigger('sst_exame_colab'); exception when duplicate_object then null; end $$;

create table if not exists public.sst_sync_log (
  id bigserial primary key,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  origem text,                                   -- graph / local
  colaboradores integer,
  treinamentos integer,
  exames integer,
  ok boolean,
  erro text
);
create index if not exists sst_sync_log_empresa_idx on public.sst_sync_log(empresa_id, iniciado_em desc);

-- RLS: mesmo padrão multi-tenant das demais tabelas (leitura por usuários da empresa; escrita service_role)
do $$ begin perform public.apply_tenant_rls('sst_colaborador'); exception when duplicate_object then null; end $$;
do $$ begin perform public.apply_tenant_rls('sst_treinamento_colab'); exception when duplicate_object then null; end $$;
do $$ begin perform public.apply_tenant_rls('sst_exame_colab'); exception when duplicate_object then null; end $$;
do $$ begin perform public.apply_tenant_rls('sst_sync_log'); exception when duplicate_object then null; end $$;
