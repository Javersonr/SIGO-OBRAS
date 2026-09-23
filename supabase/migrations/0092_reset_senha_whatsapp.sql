-- ============================================================================
-- 0092_reset_senha_whatsapp.sql — recuperação de senha por código no WhatsApp
--
-- Reaproveita usuario_custom.reset_token / reset_token_expira (legado Base44)
-- para guardar o HASH bcrypt do código de 6 dígitos + validade (10 min).
-- Novo: contador de tentativas erradas — 5 erros invalidam o código (sem isso
-- a API permitiria força bruta nos 10^6 códigos possíveis).
-- ============================================================================

alter table public.usuario_custom
  add column if not exists reset_tentativas integer not null default 0;
