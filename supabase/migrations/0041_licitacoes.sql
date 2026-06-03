-- ============================================================================
-- 0041_licitacoes.sql — BUSCA AUTOMÁTICA DE LICITAÇÕES (Alerta Licitação)
--
-- Duas tabelas:
--   1. licitacao_busca — configuração da busca (UFs, palavras-chave, faixa de
--      valor, modalidades) — TUDO editável pela tela. Uma config por empresa.
--   2. licitacao_encontrada — inbox das licitações achadas pela API. Dedup
--      por (empresa_id, id_licitacao). Quando passa no filtro de valor e
--      criar_oportunidade_auto está ligado, vira Oportunidade (oportunidade_id).
--
-- A Edge Function buscar-licitacoes (service role) popula essas tabelas.
-- RLS por empresa igual ao resto (admins da empresa veem/editam o que é seu).
-- ============================================================================

-- 1. licitacao_busca (config) ---------------------------------------------
create table if not exists public.licitacao_busca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null default 'Busca padrão',
  ufs jsonb not null default '[]'::jsonb,             -- ["MG","SP","GO"]
  palavras_chave text not null default '',            -- string crua p/ a API
  modalidades jsonb default '[]'::jsonb,              -- [] = todas
  municipios_ibge jsonb default '[]'::jsonb,          -- opcional
  valor_minimo numeric(14,2) default 0,               -- filtro de valor (auto-criar)
  valor_maximo numeric(14,2),                          -- null = sem teto
  criar_oportunidade_auto boolean default false,      -- OFF até afinar
  status_oportunidade_nome text default 'Triagem Licitação',
  analisar_ia boolean default false,                  -- liga camada Claude (LIC-5)
  ativo boolean default true,
  ultima_execucao timestamptz,
  ultima_qtd_novas integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index lic_busca_empresa_idx on public.licitacao_busca(empresa_id);
create index lic_busca_ativo_idx on public.licitacao_busca(ativo) where ativo = true;
select attach_updated_at_trigger('licitacao_busca');

-- 2. licitacao_encontrada (inbox) -----------------------------------------
create table if not exists public.licitacao_encontrada (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  busca_id uuid references public.licitacao_busca(id) on delete set null,
  id_licitacao text not null,                          -- id estável da API (dedup)
  titulo text,
  orgao text,
  uf text,
  municipio text,
  municipio_ibge text,
  objeto text,
  valor numeric(14,2),
  tipo text,
  id_tipo text,
  id_portal text,
  abertura_datetime text,                              -- cru (sem TZ, vem do edital)
  abertura date,                                       -- parse best-effort
  link text,
  link_externo text,
  status text check (status in ('Nova','Em análise','Descartada','Convertida'))
    default 'Nova',
  analise_ia jsonb,                                    -- saída do Claude (LIC-5)
  recomendacao text,                                   -- ir / não ir / analisar
  oportunidade_id uuid references public.oportunidade(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  unique (empresa_id, id_licitacao)
);
create index lic_enc_empresa_idx on public.licitacao_encontrada(empresa_id);
create index lic_enc_status_idx on public.licitacao_encontrada(empresa_id, status);
create index lic_enc_abertura_idx on public.licitacao_encontrada(empresa_id, abertura);
create index lic_enc_valor_idx on public.licitacao_encontrada(empresa_id, valor);
select attach_updated_at_trigger('licitacao_encontrada');

-- 3. RLS -------------------------------------------------------------------
select apply_tenant_rls('licitacao_busca');
select apply_tenant_rls('licitacao_encontrada');

-- 4. Seed: 1 config sob a empresa mais antiga (matriz), auto-criar DESLIGADO.
--    Palavras-chave e UFs definidas pelo usuário; ajustáveis na tela depois.
insert into public.licitacao_busca (
  empresa_id, nome, ufs, palavras_chave, valor_minimo,
  criar_oportunidade_auto, ativo
)
select
  e.id,
  'Obras / Engenharia / Iluminação',
  '["MG","SP","GO"]'::jsonb,
  'iluminação pública, construção, "obras elétricas", engenharia, "campos de futebol", "estádios de futebol", telefonia, -informática',
  0,
  false,   -- começa em modo INBOX; liga auto-criar após afinar valor/keywords
  true
from public.empresa e
where e.deleted_at is null
order by e.created_at asc
limit 1
on conflict do nothing;
