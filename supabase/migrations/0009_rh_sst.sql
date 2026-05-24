-- ============================================================================
-- 0009 — RH + Segurança do Trabalho (6 tabelas)
-- ============================================================================

-- ============================================================================
-- 1. funcao
-- ============================================================================
create table public.funcao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  categoria text,
  salario numeric(14,2),
  modelo_epi jsonb default '[]'::jsonb,
  modelo_ferramentas jsonb default '[]'::jsonb,
  modelo_treinamentos jsonb default '[]'::jsonb,
  modelo_autorizacao_formal text,
  modelo_autorizacao_formal_opcoes jsonb,
  modelo_direito_recusa text,
  modelo_ordem_servicos text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index funcao_empresa_idx on public.funcao(empresa_id);
select attach_updated_at_trigger('funcao');

-- ============================================================================
-- 2. treinamento
-- ============================================================================
create table public.treinamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcao_id uuid references public.funcao(id) on delete set null,
  nome text not null,
  codigo text,
  carga_horaria integer,
  validade_meses integer,
  conteudo_programatico text,
  obrigatorio boolean default false,
  responsavel_tecnico_nome text,
  responsavel_tecnico_criacao text,
  responsavel_tecnico_assinatura_url text,
  instrutor_nome text,
  instrutor_cpf text,
  instrutor_assinatura_url text,
  engenheiro_responsavel_nome text,
  engenheiro_responsavel_crea text,
  engenheiro_responsavel_assinatura_url text,
  aproveitamento numeric(5,2),
  local text,
  data_inicio date,
  data_fim date,
  usar_como_modelo boolean default false,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index tre_empresa_idx on public.treinamento(empresa_id);
create index tre_funcao_idx on public.treinamento(funcao_id) where funcao_id is not null;
select attach_updated_at_trigger('treinamento');

-- ============================================================================
-- 3. funcionario
-- ============================================================================
create table public.funcionario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome_completo text not null,
  nome_mae text,
  nome_pai text,
  cpf text not null,
  numero_registro text,
  rg text,
  rg_data_expedicao date,
  rg_uf text,
  pis text,
  data_nascimento date,
  naturalidade text,
  titulo_eleitor text,
  titulo_eleitor_zona text,
  titulo_eleitor_secao text,
  reservista text,
  estado_civil text check (estado_civil in (
    'Solteiro','Casado','Divorciado','Viúvo','União Estável','Outros'
  )),
  raca_cor text check (raca_cor in (
    'Indígena','Branca','Negra','Amarela','Parda','Outros'
  )),
  grau_instrucao text check (grau_instrucao in (
    'Analfabeto','Fundamental até 5º Incompleto','Fundamental 5º Completo',
    'Fundamental 6º ao 9º','Fundamental Completo','Ensino Médio Incompleto',
    'Ensino Médio Completo','Superior Incompleto','Superior Completo',
    'Pós-Graduação','Mestrado','Doutorado'
  )),
  banco_codigo text,
  banco_tipo_conta text check (banco_tipo_conta in ('Conta Corrente','Conta Poupança')),
  banco_agencia text,
  banco_conta text,
  dependentes jsonb default '[]'::jsonb,
  email text,
  telefone text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  data_admissao date,
  funcao_id uuid references public.funcao(id) on delete set null,
  funcao_nome text,
  aso_vencimento date,
  documentos_pessoais jsonb default '[]'::jsonb,
  documentos_obrigatorios jsonb default '[]'::jsonb,
  documentos_rh_estruturados jsonb default '[]'::jsonb,
  documentos_demissionais jsonb default '[]'::jsonb,
  treinamentos_anexos jsonb default '[]'::jsonb,
  ferramentais_anexos jsonb default '[]'::jsonb,
  epis_anexos jsonb default '[]'::jsonb,
  documentos_rh_anexos jsonb default '[]'::jsonb,
  ordem_servicos_anexos jsonb default '[]'::jsonb,
  autorizacao_formal_anexos jsonb default '[]'::jsonb,
  direito_recusa_anexos jsonb default '[]'::jsonb,
  foto_url text,
  biometria_capturada boolean default false,
  biometria_template text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, cpf)
);
create index func_empresa_idx on public.funcionario(empresa_id);
create index func_funcao_idx on public.funcionario(funcao_id) where funcao_id is not null;
create index func_aso_idx on public.funcionario(empresa_id, aso_vencimento) where aso_vencimento is not null;
create index func_ativo_idx on public.funcionario(empresa_id, ativo);
select attach_updated_at_trigger('funcionario');

-- FK pendente da 0008
alter table public.ferramenta
  add constraint ferr_funcionario_fk
  foreign key (funcionario_id) references public.funcionario(id) on delete set null;

alter table public.movimentacao_ferramenta
  add constraint mov_ferr_funcionario_fk
  foreign key (funcionario_id) references public.funcionario(id) on delete set null;

alter table public.entrega_ferramental
  add constraint ent_ferr_funcionario_fk
  foreign key (funcionario_id) references public.funcionario(id) on delete set null;

alter table public.entrega_ferramental
  add constraint ent_ferr_funcao_fk
  foreign key (funcao_id) references public.funcao(id) on delete set null;

alter table public.inspecao_ferramenta
  add constraint insp_ferr_funcionario_fk
  foreign key (funcionario_id) references public.funcionario(id) on delete cascade;

alter table public.caminhao
  add constraint caminhao_motorista_fk
  foreign key (motorista_padrao_id) references public.funcionario(id) on delete set null;

-- ============================================================================
-- 4. historico_documento_assinado
-- ============================================================================
create table public.historico_documento_assinado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid not null references public.funcionario(id) on delete cascade,
  funcionario_nome text,
  tipo_documento text not null,
  label_documento text,
  nome_arquivo text,
  url text not null,
  data_upload timestamptz default now(),
  usuario_email text,
  usuario_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index hda_empresa_idx on public.historico_documento_assinado(empresa_id);
create index hda_funcionario_idx on public.historico_documento_assinado(funcionario_id);
create index hda_tipo_idx on public.historico_documento_assinado(funcionario_id, tipo_documento);
select attach_updated_at_trigger('historico_documento_assinado');

-- ============================================================================
-- 5. documento_empresa (PCMSO, PGR, Lista de Presença)
-- ============================================================================
create table public.documento_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  tipo text not null check (tipo in ('PCMSO','PGR','Lista de Presença','Outro')),
  nome text not null,
  descricao text,
  treinamento_nome text,
  data_documento date,
  data_vencimento date,
  responsavel_tecnico text,
  crea_responsavel text,
  anexos jsonb default '[]'::jsonb,
  status text check (status in ('Rascunho','Vigente','Vencido','Arquivado')),
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index doc_emp_empresa_idx on public.documento_empresa(empresa_id);
create index doc_emp_tipo_idx on public.documento_empresa(empresa_id, tipo);
create index doc_emp_venc_idx on public.documento_empresa(empresa_id, data_vencimento) where data_vencimento is not null;
select attach_updated_at_trigger('documento_empresa');

-- ============================================================================
-- 6. vencimento (CNDs, FGTS, PGR, PCMSO, LTCAT, ASOs, Treinamentos, ART, contratos…)
-- ============================================================================
create table public.vencimento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  empresa_nome text,
  grupo_id uuid references public.grupo_empresarial(id),
  tipo text not null check (tipo in (
    'Certidão Federal (CND)','Certidão Estadual','Certidão Municipal',
    'Certidão FGTS','Certidão Trabalhista','PGR','PCMSO','LTCAT','ASO',
    'Treinamento NR','ART','CAT','Contrato','Licença Ambiental','Alvará',
    'Manutenção/Calibração','Seguro','Outro'
  )),
  titulo text not null,
  data_vencimento date not null,
  data_emissao date,
  status text check (status in ('OK','A Vencer','Vencido')) default 'OK',
  alerta_dias integer default 30,
  responsavel_nome text,
  responsavel_email text,
  arquivo_url text,
  arquivo_nome text,
  observacao text,
  renovacao_automatica boolean default false,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index venc_empresa_idx on public.vencimento(empresa_id);
create index venc_grupo_idx on public.vencimento(grupo_id) where grupo_id is not null;
create index venc_status_idx on public.vencimento(empresa_id, status);
create index venc_data_idx on public.vencimento(empresa_id, data_vencimento);
select attach_updated_at_trigger('vencimento');
