-- ============================================================================
-- ROLLBACK da 0048 — re-desabilita a RLS em tudo (volta ao estado da 0026)
-- ============================================================================
-- Use IMEDIATAMENTE se, após aplicar a 0048, algo quebrar (usuário vê dados
-- vazios, portal fora do ar, etc.). Devolve o sistema ao comportamento atual
-- (RLS off, segurança só nas Edge Functions + service role).
--
-- Não dropa policies (mantém pra reaplicar depois) — só DESLIGA a RLS, igual
-- a 0026 fez. A policy especial usuario_empresa_self também fica inofensiva
-- com a RLS desligada.
-- ============================================================================

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
