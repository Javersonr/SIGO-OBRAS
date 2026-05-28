-- ============================================================================
-- 0031 - Contabilidade Tier 1: tabela nota_fiscal_eletronica + backfill
-- ============================================================================
-- Objetivo: a NFe importada via DespesaModal hoje fica solta no JSONB da
-- transacao_financeira. Ao puxar relatorios contabeis, nao da pra cruzar
-- por chave, por NCM, por CFOP, nem detectar duplicidade.
--
-- Esta migration cria:
--   1. empresa.regime_tributario + cnae_principal (cada empresa pode ter regime
--      diferente, como o usuario confirmou).
--   2. Tabela nota_fiscal_eletronica unificando NFe recebidas (modelo 55)
--      e NFSe emitidas (servico municipal — schema flexivel via jsonb).
--   3. Tabela nota_fiscal_item para os itens (NCM, CFOP, CST por item).
--   4. Indice unico de chave_nfe por empresa (44 digitos) - bloqueia importar
--      mesma NFe 2x.
--   5. Trigger que ao criar/atualizar transacao_financeira com chave_nfe,
--      faz UPSERT em nota_fiscal_eletronica (cross-link automatico).
--
-- Backfill: popula nota_fiscal_eletronica a partir das transacoes
-- existentes que tem chave_nfe no numero_documento (44 digitos hex).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Empresa: regime tributario e atividade
-- ----------------------------------------------------------------------------
alter table public.empresa
  add column if not exists regime_tributario text
    check (regime_tributario in (
      'Simples Nacional',
      'Lucro Presumido',
      'Lucro Real',
      'MEI',
      'Nao Definido'
    )) default 'Nao Definido',
  add column if not exists cnae_principal text,
  add column if not exists inscricao_municipal text;

-- ----------------------------------------------------------------------------
-- 2. Tabela nota_fiscal_eletronica
-- ----------------------------------------------------------------------------
create table if not exists public.nota_fiscal_eletronica (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,

  -- Classificacao
  tipo text not null check (tipo in (
    'NFe_recebida',     -- modelo 55, empresa e destinataria
    'NFe_emitida',      -- modelo 55, empresa e emitente
    'NFSe_recebida',    -- servico municipal recebido
    'NFSe_emitida',     -- servico municipal emitido
    'NFCe',             -- consumidor final modelo 65
    'Outro'
  )),
  modelo text,           -- '55', '65', 'NFS-e', etc

  -- Identificacao NFe (validada pelo unique index abaixo)
  chave_nfe text,        -- 44 digitos (NFe/NFCe). Null para NFSe municipal.
  numero text,
  serie text,

  -- Datas
  data_emissao date,
  data_entrada_saida date,  -- entrada se recebida, saida se emitida

  -- Emitente
  emit_cnpj text,
  emit_nome text,
  emit_ie text,
  emit_uf text,

  -- Destinatario
  dest_cnpj text,
  dest_nome text,
  dest_ie text,
  dest_uf text,

  -- Valores totais
  valor_produtos numeric(14, 2),
  valor_servicos numeric(14, 2),
  valor_frete numeric(14, 2),
  valor_seguro numeric(14, 2),
  valor_desconto numeric(14, 2),
  valor_outros numeric(14, 2),
  valor_total numeric(14, 2),

  -- Impostos destacados (somatorios — detalhe por item em nota_fiscal_item)
  valor_icms_base numeric(14, 2),
  valor_icms numeric(14, 2),
  valor_icms_st numeric(14, 2),
  valor_ipi numeric(14, 2),
  valor_pis numeric(14, 2),
  valor_cofins numeric(14, 2),
  valor_iss numeric(14, 2),
  valor_irrf numeric(14, 2),
  valor_inss numeric(14, 2),
  valor_csll numeric(14, 2),

  -- Classificacao contabil
  natureza_operacao text,
  cfop_principal text,
  cnae text,
  municipio_prestacao text,

  -- Arquivos
  xml_url text,
  pdf_url text,

  -- Cross-link com Financeiro
  transacao_id uuid references public.transacao_financeira(id) on delete set null,
  fornecedor_id uuid references public.fornecedor(id) on delete set null,
  cliente_id uuid references public.cliente(id) on delete set null,

  -- Status contabil
  status text check (status in (
    'Pendente Conferencia',
    'Conferida',
    'Cancelada',
    'Inutilizada',
    'Substituida'
  )) default 'Pendente Conferencia',
  observacoes text,

  -- Dados crus do XML (debug, contestacoes futuras)
  dados_xml jsonb,

  -- Padrao
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);

-- Indices essenciais
create index if not exists nfe_empresa_idx on public.nota_fiscal_eletronica(empresa_id);
create index if not exists nfe_data_emissao_idx on public.nota_fiscal_eletronica(empresa_id, data_emissao desc);
create index if not exists nfe_emit_cnpj_idx on public.nota_fiscal_eletronica(empresa_id, emit_cnpj)
  where emit_cnpj is not null;
create index if not exists nfe_tipo_idx on public.nota_fiscal_eletronica(empresa_id, tipo);
create index if not exists nfe_transacao_idx on public.nota_fiscal_eletronica(transacao_id)
  where transacao_id is not null;

-- Unique: nao deixa duplicar a mesma NFe (chave 44 digitos) por empresa
create unique index if not exists nfe_chave_unica_idx
  on public.nota_fiscal_eletronica(empresa_id, chave_nfe)
  where chave_nfe is not null and deleted_at is null;

select public.attach_updated_at_trigger('nota_fiscal_eletronica');

-- ----------------------------------------------------------------------------
-- 3. Tabela nota_fiscal_item (itens da NFe)
-- ----------------------------------------------------------------------------
create table if not exists public.nota_fiscal_item (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nfe_id uuid not null references public.nota_fiscal_eletronica(id) on delete cascade,

  numero_item integer,
  codigo text,
  descricao text,
  ncm text,
  cfop text,
  cst text,
  cest text,
  unidade text,
  quantidade numeric(14, 4),
  valor_unitario numeric(14, 4),
  valor_total numeric(14, 2),
  valor_desconto numeric(14, 2),

  -- Impostos por item
  icms_aliquota numeric(7, 4),
  icms_valor numeric(14, 2),
  ipi_aliquota numeric(7, 4),
  ipi_valor numeric(14, 2),
  pis_aliquota numeric(7, 4),
  pis_valor numeric(14, 2),
  cofins_aliquota numeric(7, 4),
  cofins_valor numeric(14, 2),

  -- Classificacao
  conta_contabil text,  -- preenchida manualmente ou via IA depois
  centro_custo text,

  -- Cross-link com cadastro de material
  material_id uuid references public.material(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists nfe_item_empresa_idx on public.nota_fiscal_item(empresa_id);
create index if not exists nfe_item_nfe_idx on public.nota_fiscal_item(nfe_id);
create index if not exists nfe_item_ncm_idx on public.nota_fiscal_item(empresa_id, ncm)
  where ncm is not null;
create index if not exists nfe_item_cfop_idx on public.nota_fiscal_item(empresa_id, cfop)
  where cfop is not null;

select public.attach_updated_at_trigger('nota_fiscal_item');

-- ----------------------------------------------------------------------------
-- 4. RPC: importar_nfe_de_xml — chamada pelo frontend ao processar XML
-- ----------------------------------------------------------------------------
-- O frontend ja extrai os campos do XML (DespesaModal.handleImportarXML).
-- Esta funcao recebe o JSON com os campos extraidos e:
--   1) Faz UPSERT em nota_fiscal_eletronica (chave_nfe unique evita dup)
--   2) Retorna o id da NFe (nova ou existente)
-- Frontend usa o retorno pra vincular transacao_financeira.nfe_id.
-- ----------------------------------------------------------------------------
create or replace function public.upsert_nfe_recebida(
  p_empresa_id uuid,
  p_chave_nfe text,
  p_numero text,
  p_data_emissao date,
  p_emit_cnpj text,
  p_emit_nome text,
  p_valor_total numeric,
  p_dados_xml jsonb default null,
  p_xml_url text default null,
  p_transacao_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_nfe_id uuid;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id e obrigatorio';
  end if;

  -- Tenta atualizar se ja existe (mesma empresa + mesma chave)
  if p_chave_nfe is not null then
    update public.nota_fiscal_eletronica
       set numero = coalesce(p_numero, numero),
           data_emissao = coalesce(p_data_emissao, data_emissao),
           emit_cnpj = coalesce(p_emit_cnpj, emit_cnpj),
           emit_nome = coalesce(p_emit_nome, emit_nome),
           valor_total = coalesce(p_valor_total, valor_total),
           dados_xml = coalesce(p_dados_xml, dados_xml),
           xml_url = coalesce(p_xml_url, xml_url),
           transacao_id = coalesce(p_transacao_id, transacao_id),
           updated_at = now()
     where empresa_id = p_empresa_id
       and chave_nfe = p_chave_nfe
       and deleted_at is null
     returning id into v_nfe_id;

    if v_nfe_id is not null then
      return v_nfe_id;
    end if;
  end if;

  -- Nao existe ou nao tem chave: INSERT
  insert into public.nota_fiscal_eletronica (
    empresa_id, tipo, modelo, chave_nfe, numero,
    data_emissao, emit_cnpj, emit_nome,
    valor_total, dados_xml, xml_url, transacao_id, status
  ) values (
    p_empresa_id, 'NFe_recebida', '55', p_chave_nfe, p_numero,
    p_data_emissao, p_emit_cnpj, p_emit_nome,
    p_valor_total, p_dados_xml, p_xml_url, p_transacao_id,
    'Pendente Conferencia'
  )
  returning id into v_nfe_id;

  return v_nfe_id;
end;
$$;

grant execute on function public.upsert_nfe_recebida(
  uuid, text, text, date, text, text, numeric, jsonb, text, uuid
) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. (Backfill movido para 0032 - coluna era 'data' nao 'data_emissao'
--     em transacao_financeira; 0031 ficou so com DDL pra ser idempotente)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 6. View pratica para dashboard contabil
-- ----------------------------------------------------------------------------
create or replace view public.v_nfe_resumo_mensal as
select
  empresa_id,
  date_trunc('month', data_emissao)::date as mes,
  tipo,
  count(*) as qt_notas,
  sum(coalesce(valor_total, 0)) as valor_total,
  sum(coalesce(valor_icms, 0)) as total_icms,
  sum(coalesce(valor_ipi, 0)) as total_ipi,
  sum(coalesce(valor_pis, 0)) as total_pis,
  sum(coalesce(valor_cofins, 0)) as total_cofins,
  sum(coalesce(valor_iss, 0)) as total_iss
from public.nota_fiscal_eletronica
where deleted_at is null
group by empresa_id, mes, tipo;

grant select on public.v_nfe_resumo_mensal to anon, authenticated;
