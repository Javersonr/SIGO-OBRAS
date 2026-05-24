-- ============================================================================
-- 0005 — Projetos + Orçamento (7 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. projeto
-- ============================================================================
create table public.projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  cliente_id uuid references public.cliente(id) on delete set null,
  cliente_nome text,
  status_id uuid,
  status_nome text,
  origem_id uuid,
  origem_nome text,
  valor_estimado numeric(14,2) default 0,
  probabilidade integer default 50,
  data_fechamento_prevista date,
  descricao text,
  observacoes text,
  responsaveis_emails jsonb default '[]'::jsonb,
  licitacao_modalidade text,
  licitacao_data date,
  licitacao_horario text,
  numero_contrato text,
  data_vencimento_contrato date,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  oportunidade_origem_id uuid references public.oportunidade(id) on delete set null,
  status_aprovacao_orcamento text check (status_aprovacao_orcamento in (
    'Nao Iniciado','Pendente','Aprovado','Rejeitado'
  )) default 'Nao Iniciado',
  proximo_aprovador_orcamento_id uuid,
  etiquetas_ids jsonb default '[]'::jsonb,
  arquivado boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index projeto_empresa_idx on public.projeto(empresa_id);
create index projeto_cliente_idx on public.projeto(cliente_id) where cliente_id is not null;
create index projeto_op_origem_idx on public.projeto(oportunidade_origem_id) where oportunidade_origem_id is not null;
select attach_updated_at_trigger('projeto');

-- FKs pendentes
alter table public.usuario_empresa
  add constraint usuario_empresa_projeto_fk
  foreign key (projeto_id) references public.projeto(id) on delete set null;

alter table public.cliente_portal_usuario
  add constraint cliente_portal_projeto_fk
  foreign key (projeto_id) references public.projeto(id) on delete cascade;

alter table public.regra_aprovacao
  add constraint regra_aprov_projeto_fk
  foreign key (projeto_id) references public.projeto(id) on delete set null;

alter table public.aprovacao_solicitacao
  add constraint aprov_sol_solicitacao_fk_pending check (true);
-- (solicitacao_id apontará para public.solicitacao_compra em 0007)

-- ============================================================================
-- 2. tarefa_projeto
-- ============================================================================
create table public.tarefa_projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  projeto_id uuid not null references public.projeto(id) on delete cascade,
  tarefa_pai_id uuid references public.tarefa_projeto(id) on delete cascade,
  titulo text not null,
  descricao text,
  status text check (status in (
    'A Fazer','Em Andamento','Em Revisão','Concluída','Bloqueada'
  )) default 'A Fazer',
  prioridade text check (prioridade in ('Baixa','Normal','Alta','Urgente')) default 'Normal',
  responsavel_principal_id uuid,
  responsavel_principal_nome text,
  responsavel_principal_email text,
  responsaveis_ids jsonb default '[]'::jsonb,
  responsaveis_nomes jsonb default '[]'::jsonb,
  data_inicio date,
  data_fim date,
  data_conclusao timestamptz,
  progresso integer default 0 check (progresso between 0 and 100),
  dependencias jsonb default '[]'::jsonb,
  ordem integer,
  tags jsonb default '[]'::jsonb,
  anexos jsonb default '[]'::jsonb,
  tempo_estimado_horas numeric(8,2),
  tempo_gasto_horas numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index tarefa_empresa_idx on public.tarefa_projeto(empresa_id);
create index tarefa_projeto_idx on public.tarefa_projeto(projeto_id);
create index tarefa_pai_idx on public.tarefa_projeto(tarefa_pai_id) where tarefa_pai_id is not null;
create index tarefa_status_idx on public.tarefa_projeto(empresa_id, status);
create index tarefa_resp_idx on public.tarefa_projeto(responsavel_principal_id) where responsavel_principal_id is not null;
select attach_updated_at_trigger('tarefa_projeto');

-- ============================================================================
-- 3. cronograma_etapa
-- ============================================================================
create table public.cronograma_etapa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  oportunidade_id uuid references public.oportunidade(id) on delete cascade,
  projeto_id uuid references public.projeto(id) on delete cascade,
  etapa text not null,
  descricao text,
  data_inicio_planejada date,
  data_fim_planejada date,
  data_inicio_real date,
  data_fim_real date,
  percentual_conclusao integer default 0 check (percentual_conclusao between 0 and 100),
  status text check (status in ('A Fazer','Em Andamento','Concluída','Atrasada','Pausada')) default 'A Fazer',
  prioridade text check (prioridade in ('Baixa','Média','Alta')) default 'Média',
  responsavel_id uuid,
  responsavel_nome text,
  responsaveis_ids jsonb default '[]'::jsonb,
  ordem integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index cronog_empresa_idx on public.cronograma_etapa(empresa_id);
create index cronog_op_idx on public.cronograma_etapa(oportunidade_id) where oportunidade_id is not null;
create index cronog_projeto_idx on public.cronograma_etapa(projeto_id) where projeto_id is not null;
select attach_updated_at_trigger('cronograma_etapa');

-- ============================================================================
-- 4. diario_obra
-- ============================================================================
create table public.diario_obra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  projeto_id uuid not null references public.projeto(id) on delete cascade,
  data date not null,
  horario_inicio text,
  horario_fim text,
  numero_contrato text,
  prazo_decorrido text,
  obra_nome text,
  obra_local text,
  contratante_nome text,
  responsavel text,
  clima text check (clima in ('Sol','Nublado','Chuva','Vento')),
  temperatura text,
  atividades text not null,
  observacoes text,
  problemas text,
  mao_de_obra jsonb,
  fotos jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index diario_empresa_idx on public.diario_obra(empresa_id);
create index diario_projeto_data_idx on public.diario_obra(projeto_id, data desc);
select attach_updated_at_trigger('diario_obra');

-- ============================================================================
-- 5. orcamento_coluna_config
-- ============================================================================
create table public.orcamento_coluna_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome_coluna text not null,
  tipo text check (tipo in ('text','number','select')),
  largura integer,
  visivel boolean default true,
  ordem integer,
  opcoes jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index orc_col_empresa_idx on public.orcamento_coluna_config(empresa_id);
select attach_updated_at_trigger('orcamento_coluna_config');

-- ============================================================================
-- 6. orcamento_item
-- ============================================================================
create table public.orcamento_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  oportunidade_id uuid references public.oportunidade(id) on delete cascade,
  projeto_id uuid references public.projeto(id) on delete cascade,
  item text,
  tipo text check (tipo in ('Material','Mão de Obra','Kit')),
  kit_id uuid,
  kit_nome text,
  material_id uuid,
  descricao text not null,
  codigo text,
  unidade text,
  quantidade numeric(14,3),
  valor_unitario numeric(14,4),
  bdi numeric(7,4),
  imposto numeric(7,4),
  valor_total numeric(14,2),
  campos_customizados jsonb,
  ordem integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  check (oportunidade_id is not null or projeto_id is not null)
);
create index orc_item_empresa_idx on public.orcamento_item(empresa_id);
create index orc_item_op_idx on public.orcamento_item(oportunidade_id) where oportunidade_id is not null;
create index orc_item_projeto_idx on public.orcamento_item(projeto_id) where projeto_id is not null;
create index orc_item_kit_idx on public.orcamento_item(kit_id) where kit_id is not null;
select attach_updated_at_trigger('orcamento_item');

-- ============================================================================
-- 7. mao_de_obra
-- ============================================================================
create table public.mao_de_obra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  categoria text,
  codigo text,
  unidade text,
  valor_us_global numeric(14,4),
  raior_us numeric(14,4),
  preco_referencia numeric(14,2),
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index mo_empresa_idx on public.mao_de_obra(empresa_id);
create index mo_categoria_idx on public.mao_de_obra(empresa_id, categoria) where categoria is not null;
select attach_updated_at_trigger('mao_de_obra');
