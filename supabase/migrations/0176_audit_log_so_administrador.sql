-- ============================================================================
-- 0176 — Lote 2b-1 (varredura nov/2026): a auditoria só é lida pelo administrador
--
-- DECISÃO DO DONO (23/11): a tela de Auditoria é só para o administrador; os outros
-- perfis passam a ver a lista vazia. "Administrador" = perfil Admin ou Admin Holding
-- no vínculo com a empresa ativa, ou super admin (mesma definição das regras de
-- compras da 0178).
--
-- ANTES (0173, aplicada em 23/11): policy tenant_ler (SELECT, empresa_id =
-- current_empresa_id()) para qualquer perfil + super_admin_all; escrita só pelo
-- servidor; trigger audit_log_imutavel.
--
-- COMO O FRONT DECIDE "ADMINISTRADOR": pelo perfil do vínculo da empresa ativa
-- (`perfil === "Admin"` em Configuracoes.jsx:1040, Compras.jsx:814;
-- `perfil === "Admin" || perfil === "Admin Holding"` em MinhasPendencias.jsx:32) e
-- por `is_super_admin` do login (Layout.jsx:572). No banco, a mesma fonte é
-- usuario_empresa (perfil, ativo, deleted_at) da empresa do token + o
-- is_super_admin do app_metadata — a função nova usuario_eh_administrador() lê
-- exatamente isso (como current_user_perfil/tem_permissao, 0110/0147).
--
-- QUEM USA: só pages/AuditLogs.jsx:68 (AuditLog.filter). A página não tem trava de
-- perfil: para quem não é administrador o SELECT devolve lista vazia (RLS), sem
-- erro. Edge Functions gravam com service role (não passam por RLS).
--
-- Deploy: primeira do Lote 2b-1; independente da 0177 e da 0178 (a 0178 reusa a
-- função usuario_eh_administrador e a recria igual, se esta não tiver rodado).
--   supabase db query --linked -f supabase/migrations/0176_audit_log_so_administrador.sql
-- Teste: tools/smoke-lote2-h-auditoria-admin.sql (termina em ROLLBACK).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- 1. quem é administrador na empresa do token ------------------------------------
-- SECURITY DEFINER: lê usuario_empresa sem depender da policy de "só o próprio
-- vínculo" (0115). Só responde sobre o próprio chamador (e-mail e empresa do JWT).
create or replace function public.usuario_eh_administrador()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return true;
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return false;
  end if;
  -- SUPOSIÇÃO (dúvida em aberto do dono, ponto único): administrador = perfil Admin ou
  -- Admin Holding; o dono da conta (is_owner) com outro perfil NÃO conta. Para contar,
  -- acrescente "or ue.is_owner is true" abaixo. ativo nulo = ativo, como em
  -- current_user_perfil(), na RLS e no front (Layout.jsx:578).
  return exists (
    select 1
      from public.usuario_empresa ue
     where lower(ue.usuario_email) = public.current_user_email()
       and ue.empresa_id = public.current_empresa_id()
       and coalesce(ue.ativo, true) = true
       and ue.deleted_at is null
       and ue.perfil in ('Admin', 'Admin Holding')
  );
end;
$$;

revoke all on function public.usuario_eh_administrador() from public, anon, authenticated;
grant execute on function public.usuario_eh_administrador() to authenticated, service_role;

comment on function public.usuario_eh_administrador() is
  'Administrador da empresa do token: perfil Admin ou Admin Holding (vínculo ativo) ou super admin (0176).';

-- 2. leitura da auditoria: só administrador -------------------------------------
drop policy if exists tenant_ler on public.audit_log;
create policy tenant_ler on public.audit_log
  for select to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and (select public.usuario_eh_administrador())
  );

-- super_admin_all fica (o super admin lê por ela).

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
