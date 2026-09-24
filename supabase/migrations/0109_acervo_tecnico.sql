-- ============================================================================
-- 0109: ACERVO TÉCNICO e habilitação por empresa (licitações)
--
-- Base do "Atende?" automático: a IA lê o edital (Oportunidade) e cruza as
-- exigências de habilitação com o acervo DA EMPRESA LOGADA:
--   acervo_perfil        1 por empresa: qualificação econômico-financeira,
--                        registros (CREA), cadastros (CEMIG...), certidões, alertas
--   acervo_profissional  quadro técnico (RTs) — capacidade técnico-profissional
--   acervo_atestado      CAT / atestado sem CAT / CAO / CAT do profissional
--   acervo_quantitativo  quantitativos de cada atestado (postes, kVA, luminárias…)
-- Tudo editável pela própria empresa (tenant_isolation), como o resto do app.
-- ============================================================================

create table if not exists public.acervo_perfil (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  razao_social_anterior text,          -- CATs emitidas no nome antigo (juntar alteração contratual)
  registro_crea_pj text,
  porte text,                          -- ME / EPP / demais
  capital_social numeric(15,2),
  capital_social_data date,
  patrimonio_liquido numeric(15,2),
  pl_data_base date,
  ccl numeric(15,2),                   -- capital circulante líquido
  liquidez_corrente numeric(10,3),
  liquidez_geral numeric(10,3),
  solvencia_geral numeric(10,3),
  endividamento_geral numeric(10,3),
  exercicio_balanco integer,
  balanco_registro text,               -- registro na Junta Comercial
  faturamento jsonb not null default '[]'::jsonb,  -- [{ano, receita_bruta}]
  cadastros jsonb not null default '[]'::jsonb,    -- [{orgao, codigo, situacao, validade, grupos:[{codigo, descricao, validade}]}]
  certidoes jsonb not null default '[]'::jsonb,    -- [{tipo, numero, emissao, validade, observacao}]
  alertas jsonb not null default '[]'::jsonb,      -- ["texto a citar em toda análise", ...]
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists acervo_perfil_empresa_uidx
  on public.acervo_perfil (empresa_id) where deleted_at is null;

create table if not exists public.acervo_profissional (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  registro text,                       -- CREA / RNP
  titulos text,                        -- ex.: Eng. Eletricista + Eng. Civil + Eng. Seg. Trabalho
  atribuicoes text,                    -- artigos da Res. 218/73 etc.
  restricoes text,
  vinculo_desde date,
  responsavel_tecnico boolean not null default true,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists acervo_profissional_empresa_idx on public.acervo_profissional (empresa_id);

create table if not exists public.acervo_atestado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  -- cat: CAT com atestado (operacional da empresa) · atestado: sem CAT ·
  -- cao: certidão de acervo operacional · cat_profissional: CAT do RT em obra de OUTRA empresa
  tipo text not null default 'cat' check (tipo in ('cat','atestado','cao','cat_profissional')),
  numero text,                         -- nº da CAT / CAO
  conselho text,                       -- CREA-MG, CREA-SP...
  art_numero text,
  art_observacao text,
  contratante text,
  contratante_cnpj text,
  contrato text,
  valor numeric(15,2),
  data_inicio date,
  data_fim date,
  objeto text,
  cidade text,
  uf text,
  codigos_crea jsonb not null default '[]'::jsonb,  -- [{codigo, descricao, quantidade, unidade}]
  atividades jsonb not null default '[]'::jsonb,    -- ["execucao","projeto","consultoria","fiscalizacao","assessoria"]
  com_execucao boolean,                -- ART registra "Execução de obra"?
  situacao text not null default 'concluida' check (situacao in ('concluida','em_andamento')),
  profissional_id uuid references public.acervo_profissional(id) on delete set null,
  profissional_nome text,
  empresa_executora text,              -- cat_profissional: quem executou
  cobre_arts jsonb not null default '[]'::jsonb,    -- cao: ARTs cobertas
  riscos text,                         -- divergências conhecidas a citar quando usar
  observacoes text,
  arquivo_ref text,                    -- PDF da CAT/atestado ("bucket/path")
  ordem integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists acervo_atestado_empresa_idx on public.acervo_atestado (empresa_id);

create table if not exists public.acervo_quantitativo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  atestado_id uuid not null references public.acervo_atestado(id) on delete cascade,
  -- categoria normalizada (soma/teto por obra): potencia_kva, transformador,
  -- poste, luminaria_ip, refletor, substituicao_luminaria, cabo_mt_protegido,
  -- cabo_bt_multiplexado, cabo_cobre_bt, rede_subterranea, rede_aerea,
  -- spda, rele_fotoeletrico, chave_fusivel, para_raios, haste_aterramento,
  -- eletroduto, escavacao, topografia, terraplenagem, outro
  categoria text not null default 'outro',
  descricao text not null,             -- texto do atestado
  quantidade numeric(18,3),
  unidade text,
  especificacao text,                  -- ex.: 45 kVA trifásico · LED 200 W · 11 m 300 daN
  na_atividade_tecnica boolean not null default false, -- consta na atividade técnica da ART (mais forte que só observação)
  observacao text,
  ordem integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists acervo_quantitativo_atestado_idx on public.acervo_quantitativo (atestado_id);
create index if not exists acervo_quantitativo_empresa_cat_idx on public.acervo_quantitativo (empresa_id, categoria);

select attach_updated_at_trigger('acervo_perfil');
select attach_updated_at_trigger('acervo_profissional');
select attach_updated_at_trigger('acervo_atestado');
select attach_updated_at_trigger('acervo_quantitativo');

do $rls$
declare t text;
begin
  foreach t in array array['acervo_perfil','acervo_profissional','acervo_atestado','acervo_quantitativo'] loop
    execute format('alter table public.%I enable row level security', t);
    begin
      execute format($p$create policy tenant_isolation on public.%I
        using (empresa_id = public.current_empresa_id())
        with check (empresa_id = public.current_empresa_id())$p$, t);
    exception when duplicate_object then null; end;
    begin
      execute format($p$create policy super_admin_all on public.%I
        using (public.current_user_is_super_admin())
        with check (public.current_user_is_super_admin())$p$, t);
    exception when duplicate_object then null; end;
  end loop;
end $rls$;

select 'ok' as res;
