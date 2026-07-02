-- ============================================================================
-- 0077 — Manufatura (Fase 2): Engenharia — ficha técnica (BOM) + roteiro
-- ============================================================================
-- Tabelas GENUINAMENTE novas (o kit/kit_item do SIGO é BOM plano de 1 nível,
-- sem versão/roteiro/perda — não serve pra produção).
--   * centro_trabalho    — máquina/célula, com custo_hora pra custeio
--   * ficha_tecnica       — cabeçalho da BOM, versionada, 1 Ativa por material
--   * ficha_tecnica_item  — componentes (multinível: o componente é um material
--                           que pode, ele mesmo, ter ficha)
--   * roteiro_operacao    — operações da ficha (seq, centro, tempos)
-- Convenções: id uuid, empresa_id NOT NULL, audit + soft delete, updated_at
-- trigger, RLS por apply_tenant_rls (padrão 0014).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. centro_trabalho — recurso produtivo (máquina/célula/posto)
-- ────────────────────────────────────────────────────────────────────────────
create table public.centro_trabalho (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  codigo text,
  nome text not null,
  descricao text,
  tipo text check (tipo in ('Maquina','Celula','Manual','Externo')) default 'Maquina',
  custo_hora numeric(14,4) default 0,          -- taxa horária (MO + overhead) p/ custeio da OP
  capacidade_hora_dia numeric(8,2),            -- horas produtivas disponíveis/dia (p/ PCP futuro)
  centro_custo_id uuid references public.centro_custo(id) on delete set null,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, codigo)
);
create index centro_trabalho_empresa_idx on public.centro_trabalho(empresa_id);
select attach_updated_at_trigger('centro_trabalho');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ficha_tecnica — cabeçalho da BOM (versionada)
-- ────────────────────────────────────────────────────────────────────────────
create table public.ficha_tecnica (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete cascade,  -- produto fabricado (pai)
  material_nome text,
  versao integer not null default 1,
  quantidade_base numeric(14,4) not null default 1,   -- rendimento base (ex.: componentes p/ produzir N UN)
  unidade text,
  status text check (status in ('Rascunho','Ativa','Obsoleta')) default 'Rascunho',
  vigencia_inicio date,
  vigencia_fim date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, material_id, versao)
);
create index ficha_empresa_idx on public.ficha_tecnica(empresa_id);
create index ficha_material_idx on public.ficha_tecnica(material_id);
-- No máximo UMA ficha Ativa por material (evita ambiguidade ao liberar OP)
create unique index ficha_ativa_unica_idx
  on public.ficha_tecnica(empresa_id, material_id)
  where status = 'Ativa' and deleted_at is null;
select attach_updated_at_trigger('ficha_tecnica');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ficha_tecnica_item — componentes da BOM
-- ────────────────────────────────────────────────────────────────────────────
create table public.ficha_tecnica_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ficha_id uuid not null references public.ficha_tecnica(id) on delete cascade,
  material_id uuid not null references public.material(id) on delete restrict,  -- componente
  material_nome text,
  material_codigo text,
  quantidade numeric(14,4) not null,          -- por quantidade_base do pai
  unidade text,
  perda_pct numeric(6,3) default 0,           -- % de perda/refugo esperado no consumo
  operacao_seq integer,                       -- em qual operação do roteiro é consumido (nullable)
  opcional boolean default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ft_item_empresa_idx on public.ficha_tecnica_item(empresa_id);
create index ft_item_ficha_idx on public.ficha_tecnica_item(ficha_id);
create index ft_item_material_idx on public.ficha_tecnica_item(material_id);
select attach_updated_at_trigger('ficha_tecnica_item');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. roteiro_operacao — operações da ficha (roteiro de produção)
-- ────────────────────────────────────────────────────────────────────────────
create table public.roteiro_operacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ficha_id uuid not null references public.ficha_tecnica(id) on delete cascade,
  seq integer not null,                        -- ordem (10, 20, 30…)
  nome text not null,                          -- "Corte", "Montagem", "Pintura"
  centro_trabalho_id uuid references public.centro_trabalho(id) on delete set null,
  centro_trabalho_nome text,
  tempo_setup_min numeric(10,2) default 0,     -- setup fixo por OP
  tempo_ciclo_min numeric(10,2) default 0,     -- por unidade produzida
  instrucoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (ficha_id, seq)
);
create index roteiro_op_empresa_idx on public.roteiro_operacao(empresa_id);
create index roteiro_op_ficha_idx on public.roteiro_operacao(ficha_id);
select attach_updated_at_trigger('roteiro_operacao');

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS (isolamento por empresa_id — padrão 0014)
-- ────────────────────────────────────────────────────────────────────────────
select apply_tenant_rls('centro_trabalho');
select apply_tenant_rls('ficha_tecnica');
select apply_tenant_rls('ficha_tecnica_item');
select apply_tenant_rls('roteiro_operacao');

-- Grants p/ role authenticated (RLS já isola por tenant). anon fica revogado (0056).
grant select, insert, update, delete on
  public.centro_trabalho,
  public.ficha_tecnica,
  public.ficha_tecnica_item,
  public.roteiro_operacao
  to authenticated;
