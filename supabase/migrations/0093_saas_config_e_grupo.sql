-- ============================================================================
-- 0093: config global do SaaS (só service role) + leitura de empresas do grupo
--
-- saas_config guarda pares chave/valor do SaaS (ex.: openai_api_key).
-- RLS LIGADA e SEM policies: anon/authenticated não leem nada; as edge
-- functions (service role) bypassam. A chave nunca chega ao navegador.
--
-- empresa_mesmo_grupo: o Layout listava empresas do grupo via asServiceRole
-- (Base44, removido). Usuário autenticado passa a enxergar empresas ATIVAS
-- do MESMO grupo empresarial da sua empresa atual.
-- ============================================================================

create table if not exists public.saas_config (
  chave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);
alter table public.saas_config enable row level security;

do $pol$ begin
  create policy empresa_mesmo_grupo on public.empresa for select
    using (
      grupo_id is not null
      and ativo = true
      and grupo_id = (select e.grupo_id from public.empresa e
                       where e.id = public.current_empresa_id())
    );
exception when duplicate_object then null; end $pol$;

select json_build_object(
  'saas_config_rls', (select relrowsecurity from pg_class where relname = 'saas_config'),
  'policy_grupo', (select count(*) from pg_policies
                    where tablename = 'empresa' and policyname = 'empresa_mesmo_grupo')
) as res;
