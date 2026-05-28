-- ============================================================================
-- 0033 - Configuração fiscal por empresa (alíquotas, ISS, NCM, certificado)
-- ============================================================================
-- Esta migration cria a base para cálculo determinístico de impostos.
-- A intenção é que o usuário (ou contador) cadastre uma vez todas as
-- alíquotas/regras corretas, e o sistema NUNCA chute - sempre calcule
-- a partir das tabelas configuradas.
--
-- Tabelas:
--   1. empresa_config_fiscal  - parâmetros fiscais avançados por empresa
--   2. aliquota_imposto       - alíquotas vigentes (PIS, COFINS, IRPJ, CSLL...)
--                              com vigência (data_inicio/fim) pra historico
--   3. iss_municipio          - tabela de municípios + ISS + código LC 116/03
--   4. regra_imposto_ncm      - NCM → CFOP padrão, CST, redução base ICMS
--   5. certificado_empresa    - upload .pfx + senha (criptografada) + validade
-- ============================================================================

-- ============================================================================
-- 1. empresa_config_fiscal — parâmetros fiscais avançados (1:1 com empresa)
-- ============================================================================
create table if not exists public.empresa_config_fiscal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresa(id) on delete cascade,

  -- Simples Nacional
  simples_anexo text check (simples_anexo in ('I','II','III','IV','V')),
  simples_rbt12 numeric(14, 2),         -- receita bruta últimos 12 meses
  simples_aliquota_efetiva numeric(7, 4), -- calculada via fórmula RBT12

  -- Lucro Presumido (base presumida sobre receita)
  presumido_base_servicos numeric(7, 4) default 32.00,  -- % padrão
  presumido_base_comercio numeric(7, 4) default 8.00,
  presumido_base_industria numeric(7, 4) default 8.00,

  -- Retenções (quando emite NFe pra outras pessoas jurídicas)
  retencao_iss_fora_municipio boolean default false,
  retencao_inss_servicos boolean default true,

  -- Configurações extras
  optante_credito_pis_cofins boolean default false,  -- não-cumulativo
  recolhe_iss_municipio_proprio boolean default true,

  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists ecf_empresa_idx on public.empresa_config_fiscal(empresa_id);
select public.attach_updated_at_trigger('empresa_config_fiscal');

-- ============================================================================
-- 2. aliquota_imposto — alíquotas vigentes por imposto, com versionamento
-- ============================================================================
-- Histórico: se uma alíquota muda em 01/07/2024, antiga fica com
-- data_fim = 2024-06-30 e cria-se nova com data_inicio = 2024-07-01.
-- Função calcula impostos sempre pega a alíquota vigente na data da NFe.
-- ============================================================================
create table if not exists public.aliquota_imposto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,

  imposto text not null check (imposto in (
    'PIS', 'COFINS', 'IRPJ', 'CSLL', 'ISS', 'ICMS', 'IPI', 'INSS', 'IRRF'
  )),
  aliquota numeric(7, 4) not null,    -- ex: 0.65 = 0,65%

  -- Vigência (data_fim null = vigente até hoje)
  data_inicio date not null default current_date,
  data_fim date,

  -- Contexto opcional (pode ter alíquotas diferentes pra contextos)
  regime_aplicavel text check (regime_aplicavel in (
    'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Todos'
  )) default 'Todos',
  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists aliq_empresa_idx on public.aliquota_imposto(empresa_id);
create index if not exists aliq_imposto_idx on public.aliquota_imposto(empresa_id, imposto);
create index if not exists aliq_vigencia_idx on public.aliquota_imposto(empresa_id, imposto, data_inicio);
select public.attach_updated_at_trigger('aliquota_imposto');

-- ============================================================================
-- 3. iss_municipio — ISS por município que a empresa presta serviço
-- ============================================================================
create table if not exists public.iss_municipio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,

  -- Identificação do município
  codigo_ibge text,                    -- 7 dígitos (ex: 3550308 = SP capital)
  municipio text not null,
  uf text not null,

  -- ISS
  aliquota_iss numeric(7, 4) not null, -- 2.00 a 5.00 tipicamente
  codigo_servico_lc116 text,           -- ex: 7.02 (execução de obra)
  descricao_servico text,              -- texto livre

  -- Retenção
  retencao_iss_obra boolean default true,  -- contrante retém ISS na obra

  ativo boolean default true,
  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists iss_empresa_idx on public.iss_municipio(empresa_id);
create index if not exists iss_codigo_ibge_idx on public.iss_municipio(empresa_id, codigo_ibge)
  where codigo_ibge is not null;
select public.attach_updated_at_trigger('iss_municipio');

-- ============================================================================
-- 4. regra_imposto_ncm — NCM → CFOP, CST, alíquotas ICMS por origem/destino
-- ============================================================================
create table if not exists public.regra_imposto_ncm (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,

  ncm text not null,                   -- 8 dígitos
  descricao text,

  -- ICMS
  cfop_padrao_entrada text,            -- ex: 1102 = compra dentro do estado
  cfop_padrao_saida text,
  cst_icms text,                       -- ex: 00, 10, 20, 60, 70...
  uf_origem text,                      -- aplica só nessa origem (null = todas)
  uf_destino text,                     -- mesmo
  aliquota_icms numeric(7, 4),
  aliquota_icms_st numeric(7, 4),
  reducao_base_calculo numeric(7, 4),  -- % redução BC (ex: 50%)

  -- IPI
  cst_ipi text,
  aliquota_ipi numeric(7, 4),

  -- Conta contábil padrão (autocompleta lançamento)
  conta_contabil_sugerida text,
  centro_custo_sugerido text,

  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists rin_empresa_idx on public.regra_imposto_ncm(empresa_id);
create index if not exists rin_ncm_idx on public.regra_imposto_ncm(empresa_id, ncm);
create index if not exists rin_uf_idx on public.regra_imposto_ncm(empresa_id, uf_origem, uf_destino)
  where uf_origem is not null;
select public.attach_updated_at_trigger('regra_imposto_ncm');

-- ============================================================================
-- 5. certificado_empresa — upload .pfx + senha (pra futuro worker SEFAZ)
-- ============================================================================
-- Apenas SCHEMA agora. Worker SEFAZ vem na próxima migration.
-- senha_encriptada: usar pgcrypto (pgp_sym_encrypt) com chave do .env
-- ============================================================================
create table if not exists public.certificado_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,

  nome_arquivo text not null,
  arquivo_url text not null,           -- caminho no Supabase Storage (privado)
  senha_encriptada text,               -- pgp_sym_encrypt
  cnpj_certificado text,               -- pra validar que bate com a empresa
  tipo text default 'A1' check (tipo in ('A1', 'A3')),  -- A3 só pra info
  data_emissao date,
  data_validade date,
  emissora text,                       -- ex: Certisign, Serasa, Soluti...

  ativo boolean default true,
  ultima_validacao timestamptz,
  ultimo_uso timestamptz,

  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index if not exists cert_empresa_idx on public.certificado_empresa(empresa_id);
create index if not exists cert_validade_idx on public.certificado_empresa(data_validade)
  where ativo = true and deleted_at is null;
select public.attach_updated_at_trigger('certificado_empresa');

-- ============================================================================
-- 6. Defaults úteis pra Simples Nacional (não preenche - só comentário)
-- ============================================================================
-- Quando o contador cadastrar, ele preenche.
-- Anexo IV (construção civil mais comum) - faixa inicial 2024:
--   RBT12 até R$ 180.000   → 4.50%
--   RBT12 R$ 180.000-360k  → 9.00% (deduz R$ 8.100)
--   RBT12 R$ 360.000-720k  → 10.20% (deduz R$ 12.420)
--   RBT12 R$ 720.000-1.8M  → 14.00% (deduz R$ 39.780)
--   RBT12 R$ 1.8M-3.6M     → 22.00% (deduz R$ 183.780)
--   RBT12 R$ 3.6M-4.8M     → 33.00% (deduz R$ 828.000)
-- Alíquota efetiva = (RBT12 × aliq nominal - parcela_deduzir) / RBT12
-- (Função SQL pra calcular isso virá no próximo commit)

-- ============================================================================
-- 7. RPC: get_aliquota_vigente(empresa, imposto, data) - util pra cálculos
-- ============================================================================
create or replace function public.get_aliquota_vigente(
  p_empresa_id uuid,
  p_imposto text,
  p_data date default current_date
)
returns numeric
language sql
stable
as $$
  select aliquota
    from public.aliquota_imposto
    where empresa_id = p_empresa_id
      and imposto = p_imposto
      and data_inicio <= p_data
      and (data_fim is null or data_fim >= p_data)
      and deleted_at is null
    order by data_inicio desc
    limit 1;
$$;

grant execute on function public.get_aliquota_vigente(uuid, text, date)
  to anon, authenticated;
