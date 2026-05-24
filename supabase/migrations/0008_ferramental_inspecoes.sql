-- ============================================================================
-- 0008 — Ferramental + Inspeções (15 tabelas)
-- ============================================================================
-- ATENÇÃO: Ferramenta e Ferramental são entidades distintas no Base44.
--   * Ferramenta: completa (manutenção, laudo, QR, biometria, controle individual)
--   * Ferramental: catálogo simples (categoria + estoque)
-- ============================================================================

-- ============================================================================
-- 1. ferramenta — registro completo
-- ============================================================================
create table public.ferramenta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  codigo text not null,
  descricao text not null,
  codigo_secundario text,
  tipo text check (tipo in ('Ferramenta','EPI')) default 'Ferramenta',
  marca text,
  modelo text,
  status text check (status in (
    'Disponível','Em Uso','Em Manutenção','Danificado','Inativo','Sucata'
  )),
  localizacao text,
  campo_obrigatorio_id uuid references public.caminhao_campo_obrigatorio(id) on delete set null,
  funcionario_id uuid,
  funcionario_nome text,
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
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
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, codigo)
);
create index ferr_empresa_idx on public.ferramenta(empresa_id);
create index ferr_status_idx on public.ferramenta(empresa_id, status);
create index ferr_funcionario_idx on public.ferramenta(funcionario_id) where funcionario_id is not null;
create index ferr_proxima_manut_idx on public.ferramenta(empresa_id, proxima_manutencao) where proxima_manutencao is not null;
select attach_updated_at_trigger('ferramenta');

-- ============================================================================
-- 2. ferramental — catálogo simples (paralelo a ferramenta)
-- ============================================================================
create table public.ferramental (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  categoria text,
  codigo text,
  ean text,
  unidade text check (unidade in ('UN','PC','KG')),
  preco numeric(14,4),
  estoque numeric(14,3) default 0,
  estoque_minimo numeric(14,3) default 0,
  localizacao text,
  foto_url text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index fermal_empresa_idx on public.ferramental(empresa_id);
create index fermal_codigo_idx on public.ferramental(empresa_id, codigo) where codigo is not null;
select attach_updated_at_trigger('ferramental');

-- ============================================================================
-- 3. epi
-- ============================================================================
create table public.epi (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  codigo text,
  descricao text not null,
  ca text,
  validade_ca date,
  quantidade_padrao numeric(10,2),
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index epi_empresa_idx on public.epi(empresa_id);
select attach_updated_at_trigger('epi');

-- ============================================================================
-- 4. movimentacao_ferramenta
-- ============================================================================
create table public.movimentacao_ferramenta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ferramenta_id uuid not null references public.ferramenta(id) on delete cascade,
  ferramenta_codigo text,
  ferramenta_descricao text,
  tipo_movimentacao text not null check (tipo_movimentacao in (
    'Entrega para Funcionário','Empréstimo','Manutenção','Baixa para Sucata',
    'Devolução','Entrada Estoque','Movimentação para Caminhão'
  )),
  status text check (status in ('Pendente','Realizada','Cancelada')) default 'Pendente',
  funcionario_id uuid,
  funcionario_nome text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  data_movimentacao timestamptz not null default now(),
  data_prevista_devolucao date,
  data_devolucao date,
  motivo_manutencao text,
  motivo_baixa text,
  usuario_id uuid,
  usuario_nome text,
  observacoes text,
  quantidade numeric(14,3),
  origem text,
  destino text,
  numero_laudo text,
  vencimento_laudo date,
  assinatura_url text,
  foto_confirmacao_url text,
  data_hora_assinatura timestamptz,
  localizacao jsonb,
  endereco_confirmacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index mov_ferr_empresa_idx on public.movimentacao_ferramenta(empresa_id);
create index mov_ferr_ferramenta_idx on public.movimentacao_ferramenta(ferramenta_id);
create index mov_ferr_funcionario_idx on public.movimentacao_ferramenta(funcionario_id) where funcionario_id is not null;
create index mov_ferr_data_idx on public.movimentacao_ferramenta(empresa_id, data_movimentacao desc);
select attach_updated_at_trigger('movimentacao_ferramenta');

-- ============================================================================
-- 5. entrega_ferramental
-- ============================================================================
create table public.entrega_ferramental (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid,
  funcionario_nome text,
  funcao_id uuid,
  funcao_nome text,
  caminhao_id uuid references public.caminhao(id) on delete set null,
  caminhao_placa text,
  caminhao_modelo text,
  tipo_destinatario text check (tipo_destinatario in ('Funcionário','Caminhão')),
  status text not null check (status in ('Pendente','Entregue','Cancelada')) default 'Pendente',
  tipo text check (tipo in ('Ferramentas','EPIs','Ferramentas e EPIs')),
  itens jsonb default '[]'::jsonb,
  solicitante_nome text,
  solicitante_email text,
  data_solicitacao timestamptz default now(),
  responsavel_entrega_nome text,
  responsavel_entrega_email text,
  data_entrega timestamptz,
  biometria_capturada boolean default false,
  biometria_template text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ent_ferr_empresa_idx on public.entrega_ferramental(empresa_id);
create index ent_ferr_funcionario_idx on public.entrega_ferramental(funcionario_id) where funcionario_id is not null;
create index ent_ferr_caminhao_idx on public.entrega_ferramental(caminhao_id) where caminhao_id is not null;
create index ent_ferr_status_idx on public.entrega_ferramental(empresa_id, status);
select attach_updated_at_trigger('entrega_ferramental');

-- ============================================================================
-- 6. laudo_ferramenta
-- ============================================================================
create table public.laudo_ferramenta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ferramenta_id uuid not null references public.ferramenta(id) on delete cascade,
  ferramenta_codigo text,
  ferramenta_descricao text,
  data_laudo date not null,
  data_vencimento date,
  numero_laudo text not null,
  instituicao_responsavel text not null,
  resultado text check (resultado in ('Aprovado','Reprovado','Condicional')),
  foto_laudo_url text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index laudo_empresa_idx on public.laudo_ferramenta(empresa_id);
create index laudo_ferramenta_idx on public.laudo_ferramenta(ferramenta_id);
select attach_updated_at_trigger('laudo_ferramenta');

-- ============================================================================
-- 7. manutencao_ferramenta
-- ============================================================================
create table public.manutencao_ferramenta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ferramenta_id uuid references public.ferramenta(id) on delete set null,
  ferramenta_codigo text,
  ferramenta_descricao text,
  ferramentas jsonb default '[]'::jsonb,
  tipo_manutencao text not null check (tipo_manutencao in ('Preventiva','Corretiva','Preditiva','Inspeção')),
  data_manutencao date,
  data_prevista date,
  descricao text,
  custo numeric(14,2),
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
  fornecedor_nome text,
  responsavel_id uuid,
  responsavel_nome text,
  status text not null check (status in ('Agendada','Em Andamento','Concluída','Cancelada')) default 'Agendada',
  pecas_substituidas jsonb default '[]'::jsonb,
  observacoes text,
  horas_uso_no_momento numeric(14,2),
  proxima_manutencao_prevista date,
  anexos jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index manut_empresa_idx on public.manutencao_ferramenta(empresa_id);
create index manut_ferramenta_idx on public.manutencao_ferramenta(ferramenta_id) where ferramenta_id is not null;
create index manut_status_idx on public.manutencao_ferramenta(empresa_id, status);
select attach_updated_at_trigger('manutencao_ferramenta');

-- ============================================================================
-- 8. ferramenta_nota
-- ============================================================================
create table public.ferramenta_nota (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ferramenta_id uuid not null references public.ferramenta(id) on delete cascade,
  ferramenta_codigo text,
  titulo text not null,
  descricao text,
  tipo text check (tipo in ('Observação','Alerta','Manutenção','Uso','Outro')),
  usuario_nome text,
  usuario_email text,
  anexos jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ferr_nota_empresa_idx on public.ferramenta_nota(empresa_id);
create index ferr_nota_ferr_idx on public.ferramenta_nota(ferramenta_id);
select attach_updated_at_trigger('ferramenta_nota');

-- ============================================================================
-- 9. checklist_inspecao_campo (modelo)
-- ============================================================================
create table public.checklist_inspecao_campo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  categoria text,
  itens jsonb default '[]'::jsonb,
  total_itens integer default 0,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index chk_camp_empresa_idx on public.checklist_inspecao_campo(empresa_id);
select attach_updated_at_trigger('checklist_inspecao_campo');

-- ============================================================================
-- 10. inspecao_campo (execução)
-- ============================================================================
create table public.inspecao_campo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  checklist_id uuid references public.checklist_inspecao_campo(id) on delete set null,
  checklist_nome text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  data_inspecao date not null,
  responsavel_nome text,
  responsavel_email text,
  local text,
  status text check (status in ('Em Andamento','Concluída','Não Conforme')) default 'Em Andamento',
  itens_inspecao jsonb default '[]'::jsonb,
  total_itens integer default 0,
  total_inspecionados integer default 0,
  total_conformes integer default 0,
  total_nao_conformes integer default 0,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index insp_camp_empresa_idx on public.inspecao_campo(empresa_id);
create index insp_camp_projeto_idx on public.inspecao_campo(projeto_id) where projeto_id is not null;
create index insp_camp_data_idx on public.inspecao_campo(empresa_id, data_inspecao desc);
select attach_updated_at_trigger('inspecao_campo');

-- ============================================================================
-- 11. inspecao_ferramenta
-- ============================================================================
create table public.inspecao_ferramenta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  data_inspecao timestamptz default now(),
  funcionario_id uuid not null,
  funcionario_nome text not null,
  caminhao_localizacao text,
  ferramentas_inspecionadas jsonb default '[]'::jsonb,
  total_ferramentas integer default 0,
  total_fotografadas integer default 0,
  status text check (status in ('em_andamento','concluida','cancelada')) default 'em_andamento',
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index insp_ferr_empresa_idx on public.inspecao_ferramenta(empresa_id);
create index insp_ferr_funcionario_idx on public.inspecao_ferramenta(funcionario_id);
create index insp_ferr_status_idx on public.inspecao_ferramenta(empresa_id, status);
select attach_updated_at_trigger('inspecao_ferramenta');

-- ============================================================================
-- 12. inspecao_ferramental
-- ============================================================================
create table public.inspecao_ferramental (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  data_inspecao date not null,
  responsavel_nome text,
  equipamento_nome text not null,
  numero_patrimonio text,
  status text check (status in ('Aprovado','Reprovado','Manutenção Necessária')),
  itens_inspecao jsonb default '[]'::jsonb,
  observacoes text,
  proxima_inspecao date,
  anexos jsonb default '[]'::jsonb,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index insp_fermal_empresa_idx on public.inspecao_ferramental(empresa_id);
create index insp_fermal_proxima_idx on public.inspecao_ferramental(empresa_id, proxima_inspecao) where proxima_inspecao is not null;
select attach_updated_at_trigger('inspecao_ferramental');

-- ============================================================================
-- 13. inspecao_caminhao
-- ============================================================================
create table public.inspecao_caminhao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  caminhao_id uuid not null references public.caminhao(id) on delete cascade,
  caminhao_placa text,
  caminhao_modelo text,
  data_inspecao timestamptz not null default now(),
  usuario_nome text,
  usuario_email text,
  total_ferramentas integer default 0,
  ferramentas_inspecionadas integer default 0,
  status text check (status in ('em_andamento','concluida','reprovada')) default 'em_andamento',
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index insp_cam_empresa_idx on public.inspecao_caminhao(empresa_id);
create index insp_cam_caminhao_idx on public.inspecao_caminhao(caminhao_id);
create index insp_cam_status_idx on public.inspecao_caminhao(empresa_id, status);
select attach_updated_at_trigger('inspecao_caminhao');

-- ============================================================================
-- 14. inspecao_historico
-- ============================================================================
create table public.inspecao_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  inspecao_id uuid not null,
  ferramenta_id uuid references public.ferramenta(id) on delete set null,
  ferramenta_codigo text,
  ferramenta_descricao text,
  tipo_acao text not null check (tipo_acao in (
    'inspecao_iniciada','foto_capturada','foto_validada','foto_rejeitada',
    'confirmacao_desfeita','inspecao_concluida','inspecao_cancelada','observacao_adicionada'
  )),
  descricao text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  usuario_nome text,
  usuario_email text,
  timestamp_acao timestamptz default now(),
  confianca_validacao integer,
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index insp_hist_empresa_idx on public.inspecao_historico(empresa_id);
create index insp_hist_inspecao_idx on public.inspecao_historico(inspecao_id);
create index insp_hist_tempo_idx on public.inspecao_historico(empresa_id, timestamp_acao desc);
select attach_updated_at_trigger('inspecao_historico');

-- ============================================================================
-- 15. inventario_historico
-- ============================================================================
create table public.inventario_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  ferramenta_id uuid not null references public.ferramenta(id) on delete cascade,
  ferramenta_codigo text,
  ferramenta_descricao text,
  quantidade numeric(14,3) not null,
  localizacao text not null,
  usuario_nome text,
  usuario_email text not null,
  foto_url text,
  tipo_operacao text not null check (tipo_operacao in ('Entrada','Ajuste','Confirmação')),
  confianca_ia numeric(5,2),
  metodo_identificacao text check (metodo_identificacao in ('Foto','QR Code','Manual')),
  numero_serie_verificado text,
  observacoes text,
  timestamp_operacao timestamptz default now(),
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index inv_hist_empresa_idx on public.inventario_historico(empresa_id);
create index inv_hist_ferramenta_idx on public.inventario_historico(ferramenta_id);
create index inv_hist_tempo_idx on public.inventario_historico(empresa_id, timestamp_operacao desc);
select attach_updated_at_trigger('inventario_historico');
