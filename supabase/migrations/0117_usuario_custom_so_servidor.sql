-- 0117 — usuario_custom: só servidor e super admin
--
-- A policy "tenant_isolation" (ALL, empresa_id = current_empresa_id()) deixava
-- qualquer usuário logado:
--   - marcar a PRÓPRIA conta com is_super_admin = true → no login seguinte o
--     login-custom emitia o JWT de super admin (acesso a TODAS as empresas);
--   - ler e sobrescrever o senha_hash/reset_token dos colegas da empresa
--     (inclusive de contas com vínculo em outras empresas).
-- O app não lê nem grava usuario_custom direto (login, troca e redefinição
-- de senha passam pelas Edge Functions com service role); só a tela do
-- SaaS Admin usa, e ela segue pela policy super_admin_all.

drop policy if exists tenant_isolation on public.usuario_custom;
