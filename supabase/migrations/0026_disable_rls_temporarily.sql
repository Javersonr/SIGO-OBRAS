-- ============================================================================
-- 0022 — Desabilita RLS temporariamente até implementarmos JWT real
-- ============================================================================
-- Contexto: a migration 0014 aplicou `apply_tenant_rls(tabela)` em todas as
-- tabelas, que cria policies do tipo "permita só se empresa_id = current_empresa_id()".
-- O current_empresa_id() lê da JWT (auth.jwt() -> 'app_metadata' -> 'empresa_id').
--
-- PROBLEMA: o frontend atual NÃO usa JWT real do Supabase Auth — usa
-- sessionStorage + a chave anon pra todas as queries. Sem JWT com claims,
-- RLS bloqueia todos os SELECTs porque current_empresa_id() retorna null.
-- Resultado: usuário loga, Layout tenta carregar dados, recebe arrays
-- vazios em tudo, e como o flow assume "se não tem dados, deslogue", o
-- usuário é chutado de volta pra tela de login.
--
-- FIX TEMPORÁRIO: desabilita RLS em TODAS as tabelas do public.
-- A segurança fica nas Edge Functions (auth real) + service role pro backend.
--
-- TODO FUTURO (não bloqueador agora):
--   - Implementar JWT customizado na Edge Function login-custom com claim
--     `app_metadata.empresa_id`
--   - Frontend usa esse JWT em vez da anon key para todas as queries
--   - Reabilita RLS em todas as tabelas
--   - As policies de empresa_id voltam a funcionar
-- ============================================================================

-- Desabilita RLS em todas as tabelas do schema public
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('schema_migrations', 'supabase_migrations')
  loop
    execute format('alter table public.%I disable row level security', r.tablename);
  end loop;
end $$;
