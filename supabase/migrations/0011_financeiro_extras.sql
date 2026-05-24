-- ============================================================================
-- 0011 — Financeiro extras (7 tabelas)
-- OFX, Extrato, Conciliação, PreLançamento, FechamentoCaixa, Boleto, NF-e Dev
-- ============================================================================

-- ============================================================================
-- 1. upload_ofx
-- ============================================================================
create table public.upload_ofx (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  conta_id uuid not null references public.conta_financeira(id) on delete cascade,
  conta_nome text,
  nome_arquivo text not null,
  url_arquivo text,
  periodo_inicio date,
  periodo_fim date,
  status text check (status in ('Recebido','Processado','Erro')) default 'Recebido',
  mensagem_erro text,
  total_linhas integer default 0,
  linhas_importadas integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index ofx_empresa_idx on public.upload_ofx(empresa_id);
create index ofx_conta_idx on public.upload_ofx(conta_id);
create index ofx_status_idx on public.upload_ofx(empresa_id, status);
select attach_updated_at_trigger('upload_ofx');

-- ============================================================================
-- 2. extrato_bancario
-- ============================================================================
create table public.extrato_bancario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  conta_id uuid not null references public.conta_financeira(id) on delete cascade,
  conta_nome text,
  data date not null,
  historico text,
  documento text,
  valor numeric(14,2) not null,
  saldo numeric(14,2),
  origem text check (origem in ('OFX','Manual')) default 'Manual',
  hash_linha text,
  conciliado boolean default false,
  transacao_id uuid references public.transacao_financeira(id) on delete set null,
  upload_id uuid references public.upload_ofx(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (conta_id, hash_linha)
);
create index ext_empresa_idx on public.extrato_bancario(empresa_id);
create index ext_conta_data_idx on public.extrato_bancario(conta_id, data desc);
create index ext_conciliado_idx on public.extrato_bancario(empresa_id, conciliado);
create index ext_transacao_idx on public.extrato_bancario(transacao_id) where transacao_id is not null;
select attach_updated_at_trigger('extrato_bancario');

-- ============================================================================
-- 3. regra_conciliacao
-- ============================================================================
create table public.regra_conciliacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  prioridade integer default 5 check (prioridade between 1 and 10),
  conta_id uuid references public.conta_financeira(id) on delete set null,
  tipo text check (tipo in ('Receita','Despesa','Ambos')) default 'Ambos',
  contem_texto text,
  nao_contem_texto text,
  valor_minimo numeric(14,2),
  valor_maximo numeric(14,2),
  categoria_id uuid references public.categoria_financeira(id) on delete set null,
  categoria_nome text,
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
  fornecedor_nome text,
  cliente_id uuid references public.cliente(id) on delete set null,
  cliente_nome text,
  centro_custo_id uuid references public.centro_custo(id) on delete set null,
  centro_custo_nome text,
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  marcar_como_realizado boolean default false,
  tolerancia_valor numeric(14,2) default 0,
  tolerancia_dias integer default 0,
  usa_ia boolean default false,
  confianca_ia numeric(5,2),
  aplicacoes integer default 0,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index rc_empresa_idx on public.regra_conciliacao(empresa_id);
create index rc_prioridade_idx on public.regra_conciliacao(empresa_id, prioridade desc) where ativo = true;
select attach_updated_at_trigger('regra_conciliacao');

-- ============================================================================
-- 4. pre_lancamento (comprovante via OCR / WhatsApp / upload)
-- ============================================================================
create table public.pre_lancamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  usuario_email text not null,
  comprovante_url text not null,
  dados_extraidos jsonb not null default '{}'::jsonb,
  status text check (status in ('Pendente','Confirmado','Em Fechamento','Conciliado','Rejeitado')) default 'Pendente',
  projeto_id uuid references public.projeto(id) on delete set null,
  projeto_nome text,
  conta_financeira_id uuid references public.conta_financeira(id) on delete set null,
  transacao_id uuid references public.transacao_financeira(id) on delete set null,
  observacoes text,
  offline boolean default false,
  data_competencia date,
  descricao_caixa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index pl_empresa_idx on public.pre_lancamento(empresa_id);
create index pl_status_idx on public.pre_lancamento(empresa_id, status);
create index pl_usuario_idx on public.pre_lancamento(empresa_id, usuario_email);
create index pl_competencia_idx on public.pre_lancamento(empresa_id, data_competencia) where data_competencia is not null;
select attach_updated_at_trigger('pre_lancamento');

-- FK pendente da 0010: transacao_financeira.pre_lancamento_id
alter table public.transacao_financeira
  add constraint tx_pre_lancamento_fk
  foreign key (pre_lancamento_id) references public.pre_lancamento(id) on delete set null;

-- ============================================================================
-- 5. fechamento_caixa (fluxo: Camila fecha → Samira paga → Matheus repõe)
-- ============================================================================
create table public.fechamento_caixa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  status text not null check (status in ('Aberto','Aguardando Pagamento','Pago')),
  pre_lancamentos_ids jsonb default '[]'::jsonb,
  valor_total numeric(14,2),
  usuario_fechamento_email text,
  usuario_fechamento_nome text,
  data_fechamento timestamptz,
  observacoes_fechamento text,
  usuario_pagamento_email text,
  usuario_pagamento_nome text,
  data_pagamento timestamptz,
  observacoes_pagamento text,
  comprovante_pagamento_url text,
  usuario_reposicao_email text,
  usuario_reposicao_nome text,
  conta_financeira_id uuid references public.conta_financeira(id) on delete set null,
  conta_financeira_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index fc_empresa_idx on public.fechamento_caixa(empresa_id);
create index fc_status_idx on public.fechamento_caixa(empresa_id, status);
create index fc_conta_idx on public.fechamento_caixa(conta_financeira_id) where conta_financeira_id is not null;
select attach_updated_at_trigger('fechamento_caixa');

-- ============================================================================
-- 6. boleto_bancario
-- ============================================================================
create table public.boleto_bancario (
  id uuid primary key default gen_random_uuid(),
  numero_documento text,
  empresa_id uuid references public.empresa(id) on delete set null,
  empresa_nome text not null,
  empresa_cnpj text,
  assinatura_id uuid,
  pagamento_id uuid,
  valor numeric(14,2) not null,
  valor_pago numeric(14,2),
  data_vencimento date not null,
  data_emissao date default current_date,
  data_pagamento date,
  status text not null check (status in ('Emitido','Enviado','Vencido','Pago','Cancelado')),
  linha_digitavel text,
  codigo_barras text,
  url_boleto text,
  banco text,
  agencia text,
  conta text,
  carteira text,
  instrucoes text,
  multa_percentual numeric(5,2),
  juros_percentual_mes numeric(5,2),
  desconto_percentual numeric(5,2),
  data_limite_desconto date,
  observacoes text,
  id_externo text,
  gateway text check (gateway in (
    'Asaas','Gerencianet','Banco do Brasil','Bradesco','Itaú','Santander','Manual'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index blt_empresa_idx on public.boleto_bancario(empresa_id) where empresa_id is not null;
create index blt_status_idx on public.boleto_bancario(status);
create index blt_venc_idx on public.boleto_bancario(data_vencimento);
create index blt_id_ext_idx on public.boleto_bancario(id_externo) where id_externo is not null;
select attach_updated_at_trigger('boleto_bancario');

-- ============================================================================
-- 7. nota_fiscal_devolucao
-- ============================================================================
create table public.nota_fiscal_devolucao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  numero text,
  serie text,
  chave_acesso text,
  focus_ref text unique,
  status text not null check (status in ('Rascunho','Enviando','Autorizada','Cancelada','Erro')) default 'Rascunho',
  almoxarifado_id uuid references public.almoxarifado(id) on delete set null,
  almoxarifado_nome text,
  destinatario_nome text,
  destinatario_cnpj text,
  destinatario_ie text,
  destinatario_email text,
  destinatario_endereco text,
  destinatario_numero text,
  destinatario_bairro text,
  destinatario_cidade text,
  destinatario_uf text,
  destinatario_cep text,
  nfe_referenciada text,
  itens jsonb default '[]'::jsonb,
  valor_total numeric(14,2),
  informacoes_adicionais text,
  pdf_url text,
  xml_url text,
  protocolo text,
  mensagem_erro text,
  usuario_nome text,
  data_emissao date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index nfd_empresa_idx on public.nota_fiscal_devolucao(empresa_id);
create index nfd_status_idx on public.nota_fiscal_devolucao(empresa_id, status);
create index nfd_chave_idx on public.nota_fiscal_devolucao(chave_acesso) where chave_acesso is not null;
create index nfd_almox_idx on public.nota_fiscal_devolucao(almoxarifado_id) where almoxarifado_id is not null;
select attach_updated_at_trigger('nota_fiscal_devolucao');
