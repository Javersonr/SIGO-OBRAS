-- ============================================================================
-- 0048 — Reabilita a RLS multi-tenant (reverte a 0026)
-- ============================================================================
-- Pré-requisitos (todos atendidos na janela):
--   1. Front da Etapa 2 publicado (login/troca aplicam setSession).      ✅
--   2. Usuários relogam → sessão com app_metadata.empresa_id.            ✅ (1º login)
--   3. Portais fornecedor/cliente portados p/ Edge Functions (Etapa 3b). ✅
--   4. Backup/PITR confirmado.                                           (janela)
--
-- O que faz:
--   A. Liga RLS em TODA tabela com empresa_id e garante as policies padrão
--      (cobre as tabelas criadas DEPOIS da 0014 — fiscal/NFe/certificado).
--   B. Religa empresa/plano/proposta_comercial (policies já existem).
--   C. usuario_empresa: policy "por e-mail" (senão a troca de empresa quebra).
--   D. Mantém de FORA as tabelas dos portais externos (skip_list) — elas são
--      lidas via service role nas Edge Functions da Etapa 3b.
--
-- Reversível: docs/seguranca/etapa3/0048_rollback_disable_rls.sql (desliga RLS).
-- Sem begin/commit explícito: o `supabase db push` já roda a migration numa
-- transação.
-- ============================================================================

-- A. Toda tabela com empresa_id: liga RLS + garante policies padrão
do $$
declare
  r record;
  n_pol int;
  skip_list text[] := array[
    'fornecedor_acesso',
    'cliente_portal_usuario',
    'token_cliente_oportunidade'
  ];
begin
  for r in
    select t.tablename
    from pg_tables t
    where t.schemaname = 'public'
      and t.tablename <> all (skip_list)
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = t.tablename
          and c.column_name = 'empresa_id'
      )
  loop
    execute format('alter table public.%I enable row level security', r.tablename);

    select count(*) into n_pol
    from pg_policies
    where schemaname = 'public' and tablename = r.tablename;

    if n_pol = 0 then
      execute format(
        'create policy super_admin_all on public.%I
           for all to authenticated
           using (public.current_user_is_super_admin())
           with check (public.current_user_is_super_admin())',
        r.tablename
      );
      execute format(
        'create policy tenant_isolation on public.%I
           for all to authenticated
           using (empresa_id = public.current_empresa_id())
           with check (empresa_id = public.current_empresa_id())',
        r.tablename
      );
      raise notice 'NOVA policy (lacuna pós-0014): %', r.tablename;
    else
      raise notice 'RLS religada (policies já existiam): %', r.tablename;
    end if;
  end loop;
end $$;

-- B. Especiais SEM empresa_id que a 0014 protegeu (policies já existem no banco).
alter table public.empresa enable row level security;
alter table public.plano enable row level security;
alter table public.proposta_comercial enable row level security;

-- C. usuario_empresa: visão "dos meus vínculos" (em qualquer empresa).
drop policy if exists tenant_isolation on public.usuario_empresa;
create policy usuario_empresa_self on public.usuario_empresa
  for all to authenticated
  using (lower(usuario_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(usuario_email) = lower(auth.jwt() ->> 'email'));
