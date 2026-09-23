-- ============================================================================
-- 0094 HOTFIX: a policy empresa_mesmo_grupo (0093) fazia subselect na própria
-- tabela empresa → recursão infinita (42P17) → TODO select em empresa falhava
-- e o app voltava pro login. Quebramos a recursão com função SECURITY DEFINER
-- (bypassa RLS ao buscar o grupo da empresa atual).
-- ============================================================================

drop policy if exists empresa_mesmo_grupo on public.empresa;

create or replace function public.grupo_da_empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select grupo_id from public.empresa where id = public.current_empresa_id();
$$;

revoke all on function public.grupo_da_empresa_atual() from public;
grant execute on function public.grupo_da_empresa_atual() to authenticated, anon;

create policy empresa_mesmo_grupo on public.empresa for select
  using (
    grupo_id is not null
    and ativo = true
    and grupo_id = public.grupo_da_empresa_atual()
  );

-- prova: select em empresa volta a funcionar (sem 42P17)
select json_build_object(
  'select_ok', (select count(*) >= 0 from empresa),
  'policy', (select count(*) from pg_policies
              where tablename = 'empresa' and policyname = 'empresa_mesmo_grupo')
) as res;
