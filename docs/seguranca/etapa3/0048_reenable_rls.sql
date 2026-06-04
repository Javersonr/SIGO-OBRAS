-- ============================================================================
-- 0048 — Reabilita a RLS multi-tenant (reverte a 0026)  [DRAFT — NÃO APLICAR]
-- ============================================================================
-- ⚠️  NÃO mova este arquivo para supabase/migrations/ nem rode antes da janela.
--     Aplicar isto SEM os pré-requisitos abaixo = apagão para os 19 clientes.
--
-- PRÉ-REQUISITOS (obrigatórios antes de aplicar):
--   1. Front da Etapa 2 publicado e no ar (login/troca aplicam setSession).
--   2. Usuários relogados → cada um tem auth.users espelho + sessão com
--      app_metadata.empresa_id (a ponte cria no 1º login).
--   3. Portais de FORNECEDOR e CLIENTE tratados (ver README — eles NÃO têm
--      sessão Supabase Auth hoje; as tabelas deles ficam de fora aqui).
--   4. Backup/PITR confirmado no Supabase.
--
-- O que faz:
--   A. Liga RLS em TODA tabela com empresa_id e garante as policies padrão
--      (cobre as tabelas criadas DEPOIS da 0014 — fiscal/NFe/certificado — que
--       nunca receberam policy: a brecha de vazamento real hoje).
--   B. Religa as tabelas especiais sem empresa_id que a 0014 protegeu.
--   C. Troca a policy de usuario_empresa para "por e-mail" (senão a troca de
--      empresa quebra: o usuário não enxergaria os vínculos das outras empresas).
--   D. Mantém de FORA (RLS continua off) as tabelas dos portais externos, até
--      a ponte de auth de fornecedor/cliente (Etapa 3b).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. Toda tabela com empresa_id: liga RLS + garante policies padrão
--    Só cria policy se a tabela ainda não tiver NENHUMA (preserva as do 0014 e
--    as especiais nominais, ex.: boleto_bancario blt_*).
--    SKIP_LIST = tabelas dos portais externos (sem sessão Auth ainda).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- B. Especiais SEM empresa_id que a 0014 protegeu (policies já existem no banco
--    — a 0026 só DESLIGOU a RLS, não dropou nada; aqui só religamos).
-- ---------------------------------------------------------------------------
alter table public.empresa enable row level security;
alter table public.plano enable row level security;
alter table public.proposta_comercial enable row level security;

-- ---------------------------------------------------------------------------
-- C. usuario_empresa: visão "dos meus vínculos" (em qualquer empresa), senão a
--    troca de empresa e a tela de seleção no login quebram. Substitui o
--    tenant_isolation (empresa_id = atual) por filtro pelo e-mail do próprio JWT.
-- ---------------------------------------------------------------------------
drop policy if exists tenant_isolation on public.usuario_empresa;
create policy usuario_empresa_self on public.usuario_empresa
  for all to authenticated
  using (lower(usuario_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(usuario_email) = lower(auth.jwt() ->> 'email'));

-- ---------------------------------------------------------------------------
-- Conferência (rodar à parte, fora da transação, p/ inspecionar):
--   -- tabelas que FICARAM sem RLS (esperado: catálogos globais + portais):
--   select tablename from pg_tables
--   where schemaname='public' and rowsecurity=false
--   order by 1;
--
--   -- tabelas com RLS ligada mas SEM policy (PERIGO = deny-all, revisar!):
--   select t.tablename from pg_tables t
--   where t.schemaname='public' and t.rowsecurity=true
--     and not exists (select 1 from pg_policies p
--                     where p.schemaname='public' and p.tablename=t.tablename);
-- ---------------------------------------------------------------------------

commit;
