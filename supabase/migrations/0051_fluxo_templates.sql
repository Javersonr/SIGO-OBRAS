-- ============================================================================
-- 0051_fluxo_templates.sql — MOTOR DE FLUXOS (Fase 1): templates configuráveis
--
-- O editor estruturado em Configurações → Processos grava aqui, por empresa.
-- AINDA SEM motor de execução (executa→aprova) — esta fase é só desenhar e
-- documentar os processos no banco (substitui o mapa-processos.html standalone).
-- O motor (Fase A) vai LER esses templates depois.
--
-- Aditivo e não-destrutivo: só cria 2 tabelas novas + RLS por empresa.
-- ============================================================================

-- 1. fluxo_template — um processo (ex.: "Licitação → Obra") por empresa --------
create table if not exists public.fluxo_template (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  entidade_alvo text default 'oportunidade',     -- 'oportunidade' | 'projeto' | 'generico'
  versao integer not null default 1,
  status text not null default 'rascunho',        -- 'rascunho' | 'ativo' | 'arquivado'
  origem_json jsonb,                               -- import do mapa-processos.html (auditoria)
  ordem integer default 0,                         -- ordenação na lista de processos
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid
);
create index fluxo_tmpl_empresa_idx on public.fluxo_template(empresa_id);
select attach_updated_at_trigger('fluxo_template');

-- 2. fluxo_etapa_template — cada etapa do processo ----------------------------
create table if not exists public.fluxo_etapa_template (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  fluxo_template_id uuid not null references public.fluxo_template(id) on delete cascade,
  ordem integer not null default 0,
  nome text not null default 'Nova etapa',
  tipo text not null default 'etapa',              -- 'inicio'|'etapa'|'decisao'|'fim'
  papel_responsavel text,                           -- perfil que EXECUTA
  papel_aprovador text,                             -- perfil que APROVA (gate)
  exige_aprovacao boolean default false,
  atividades text,                                  -- texto livre (vira checklist)
  checklist jsonb default '[]'::jsonb,             -- ["item 1","item 2"]
  opcoes jsonb default '[]'::jsonb,                -- decisão: [{rotulo, destino_ordem|"fim"}]
  proxima_etapa_ordem integer,                      -- fluxo linear (não-decisão)
  processo_link_id uuid,                            -- vincula a outro fluxo_template
  retorno_etapa_ordem integer,                      -- volta do processo vinculado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index fluxo_etapa_tmpl_fluxo_idx on public.fluxo_etapa_template(fluxo_template_id, ordem);
create index fluxo_etapa_tmpl_empresa_idx on public.fluxo_etapa_template(empresa_id);
select attach_updated_at_trigger('fluxo_etapa_template');

-- 3. RLS multi-tenant (mesma política tenant_isolation do resto do sistema) ----
select apply_tenant_rls('fluxo_template');
select apply_tenant_rls('fluxo_etapa_template');
