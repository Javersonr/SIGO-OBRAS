-- ============================================================================
-- 0089_rls_faltantes.sql — liga a RLS nas 6 tabelas que ficaram de fora
--
-- Motivo: Security Advisor do Supabase (17/ago/2026) acusou "rls_disabled_in_public"
-- e "sensitive_columns_exposed" no projeto. Auditoria confirmou 6 tabelas públicas
-- sem RLS — 3 com dados sensíveis expostos à anon key:
--   cliente_portal_usuario (senha_hash, cpf_cnpj), fornecedor_acesso (senha_acesso),
--   token_cliente_oportunidade (token).
--
-- Padrão de acesso verificado no código antes de fechar:
--   - fornecedor_acesso: o FRONTEND gerencia (CotacaoModal/LinksModal) → política
--     tenant por empresa_id + bypass de super admin (padrão 0048).
--   - cliente_portal_usuario / token_cliente_oportunidade: só Edge Functions com
--     service_role (que BYPASSA RLS) → RLS ligada SEM policy de cliente = fechado.
--   - grupo_empresarial / permissao_detalhada: telas do SaaS; leitura autenticada,
--     escrita só super admin.
--   - profiles: tabela legada sem uso no app → fechada.
-- ============================================================================

-- 1. fornecedor_acesso — tenant + super admin (frontend precisa)
alter table public.fornecedor_acesso enable row level security;
drop policy if exists tenant_isolation on public.fornecedor_acesso;
create policy tenant_isolation on public.fornecedor_acesso
  for all to authenticated
  using (empresa_id = current_empresa_id())
  with check (empresa_id = current_empresa_id());
drop policy if exists super_admin_all on public.fornecedor_acesso;
create policy super_admin_all on public.fornecedor_acesso
  for all to authenticated
  using (current_user_is_super_admin())
  with check (current_user_is_super_admin());

-- 2. Portais — só service_role acessa (bypassa RLS); nenhuma policy de cliente
alter table public.cliente_portal_usuario enable row level security;
alter table public.token_cliente_oportunidade enable row level security;

-- 3-5. grupo_empresarial / permissao_detalhada / profiles: as policies certas JÁ
-- existiam (grupo_select_membros/grupo_super_admin, perm_det_read/
-- perm_det_write_super, profile_self) — estavam INERTES porque a RLS nunca foi
-- ligada nessas tabelas. Só ligar já ativa o desenho original.
alter table public.grupo_empresarial enable row level security;
alter table public.permissao_detalhada enable row level security;
alter table public.profiles enable row level security;

notify pgrst, 'reload schema';
