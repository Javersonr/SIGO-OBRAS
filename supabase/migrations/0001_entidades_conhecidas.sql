-- ============================================================================
-- 0001 — Entidades conhecidas do snapshot Base44
-- ============================================================================
-- Cobertura PARCIAL — só 5 das ~30 entities estão documentadas no zip.
-- Schema completo virá quando rodarmos tools/export-base44.mjs.
--
-- Padrões adotados:
--   * id = UUID v4 (Supabase gera com gen_random_uuid())
--   * empresa_id obrigatório → multi-tenant via RLS
--   * timestamps automáticos (created_at, updated_at)
--   * campos _nome denormalizados ao lado dos _id (preservar UX Base44)
--   * arrays JSON viram jsonb
-- ============================================================================

-- Helpers comuns
create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. FERRAMENTA
-- ============================================================================
create table if not exists public.ferramenta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  codigo text not null,
  descricao text not null,
  codigo_secundario text,
  tipo text not null default 'Ferramenta' check (tipo in ('Ferramenta', 'EPI')),
  marca text,
  modelo text,
  status text check (status in ('Disponível', 'Em Uso', 'Em Manutenção', 'Danificado', 'Inativo', 'Sucata')),
  localizacao text,
  campo_obrigatorio_id uuid,
  funcionario_id uuid,
  funcionario_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  valor_unitario numeric(14,2) default 0,
  quantidade_estoque numeric(14,3) default 1,
  quantidade_minima numeric(14,3) default 0,
  controle_individual boolean default false,
  numero_serie text,
  numero text,
  ca text,
  numero_laudo text,
  data_vencimento_laudo date,
  laudo_url text,
  laudo_obrigatorio boolean default false,
  observacoes text,
  foto_url text,
  qrcode_data text,
  intervalo_manutencao_dias integer default 0,
  intervalo_manutencao_horas integer,
  ultima_manutencao date,
  proxima_manutencao date,
  horas_uso numeric(14,2) default 0,
  alerta_manutencao boolean default false,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create index ferramenta_empresa_idx on public.ferramenta (empresa_id);
create index ferramenta_funcionario_idx on public.ferramenta (funcionario_id) where funcionario_id is not null;
create index ferramenta_status_idx on public.ferramenta (empresa_id, status);

create trigger ferramenta_updated_at
  before update on public.ferramenta
  for each row execute function set_updated_at();

-- ============================================================================
-- 2. HISTORICO_DOCUMENTO_ASSINADO
-- ============================================================================
create table if not exists public.historico_documento_assinado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  funcionario_id uuid not null,
  funcionario_nome text,
  tipo_documento text not null,
  label_documento text,
  nome_arquivo text,
  url text not null,
  data_upload timestamptz default now(),
  usuario_email text,
  usuario_nome text,
  created_at timestamptz not null default now()
);

create index hist_doc_empresa_idx on public.historico_documento_assinado (empresa_id);
create index hist_doc_funcionario_idx on public.historico_documento_assinado (funcionario_id);

-- ============================================================================
-- 3. OPORTUNIDADE
-- ============================================================================
create table if not exists public.oportunidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  cliente_id uuid,
  cliente_nome text,
  status_id uuid,
  status_nome text,
  origem_id uuid,
  origem_nome text,
  valor_estimado numeric(14,2) default 0,
  probabilidade integer default 50 check (probabilidade between 0 and 100),
  data_fechamento_prevista date,
  descricao text,
  observacoes text,
  responsavel_id uuid,
  responsavel_nome text,
  responsavel_email text,
  responsaveis_ids jsonb default '[]'::jsonb,
  licitacao_modalidade text,
  licitacao_data date,
  licitacao_horario text,
  licitacao_data_impugnacao date,
  licitacao_data_proposta date,
  licitacao_horario_proposta text,
  licitacao_garantia_proposta boolean default false,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  etiquetas_ids jsonb default '[]'::jsonb,
  arquivado boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index oportunidade_empresa_idx on public.oportunidade (empresa_id);
create index oportunidade_responsavel_idx on public.oportunidade (responsavel_id) where responsavel_id is not null;
create index oportunidade_status_idx on public.oportunidade (empresa_id, status_id);

create trigger oportunidade_updated_at
  before update on public.oportunidade
  for each row execute function set_updated_at();

-- ============================================================================
-- 4. RESERVA_MATERIAL
-- ============================================================================
create table if not exists public.reserva_material (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  numero text,
  grupo_id uuid,
  material_id uuid not null,
  material_codigo text,
  material_descricao text,
  almoxarifado_id uuid not null,
  almoxarifado_nome text,
  projeto_id uuid,
  projeto_nome text,
  caminhao_id uuid,
  caminhao_placa text,
  tipo_reserva text default 'Projeto' check (tipo_reserva in ('Projeto', 'Caminhão')),
  quantidade_reservada numeric(14,3) not null,
  unidade text,
  data_reserva date default current_date,
  data_necessidade date,
  solicitante_id uuid,
  solicitante_nome text,
  status text default 'Ativa' check (status in ('Ativa', 'Utilizada', 'Cancelada')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reserva_empresa_idx on public.reserva_material (empresa_id);
create index reserva_material_idx on public.reserva_material (material_id);
create index reserva_projeto_idx on public.reserva_material (projeto_id) where projeto_id is not null;
create index reserva_grupo_idx on public.reserva_material (grupo_id) where grupo_id is not null;

create trigger reserva_material_updated_at
  before update on public.reserva_material
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. SOLICITACAO_COMPRA
-- ============================================================================
create table if not exists public.solicitacao_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  numero text,
  projeto_id uuid,
  projeto_nome text,
  projetos_ids jsonb default '[]'::jsonb,
  projetos_nomes jsonb default '[]'::jsonb,
  oportunidade_id uuid,
  oportunidade_nome text,
  solicitante_id uuid,
  solicitante_nome text,
  status text not null check (status in (
    'Pendente Aprovação',
    'Aprovada',
    'Em Cotação',
    'Cotação Aprovada',
    'Pedido Gerado',
    'Cancelada',
    'Rejeitada'
  )),
  prioridade text default 'Normal' check (prioridade in ('Baixa', 'Normal', 'Alta', 'Urgente')),
  origem text default 'Manual' check (origem in ('Manual', 'Orçamento', 'Estoque')),
  data_necessidade date,
  observacoes text,
  total_itens integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index solicitacao_empresa_idx on public.solicitacao_compra (empresa_id);
create index solicitacao_status_idx on public.solicitacao_compra (empresa_id, status);
create index solicitacao_projeto_idx on public.solicitacao_compra (projeto_id) where projeto_id is not null;

create trigger solicitacao_compra_updated_at
  before update on public.solicitacao_compra
  for each row execute function set_updated_at();

-- ============================================================================
-- RLS — política tenant_isolation por empresa_id
-- ============================================================================
-- ATENÇÃO: ativada apenas APÓS termos a tabela de Empresa e o fluxo de JWT
-- com a claim empresa_id. Por enquanto deixamos as policies prontas mas sem
-- ENABLE — para não bloquear o seed inicial.
--
-- Quando estiver pronto, descomentar:
--
-- alter table public.ferramenta enable row level security;
-- create policy tenant_isolation_ferramenta on public.ferramenta
--   for all
--   using (empresa_id = (auth.jwt() ->> 'empresa_id')::uuid)
--   with check (empresa_id = (auth.jwt() ->> 'empresa_id')::uuid);
--
-- (e idem para as outras 4 tabelas)
