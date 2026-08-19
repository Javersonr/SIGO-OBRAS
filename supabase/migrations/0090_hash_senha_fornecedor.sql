-- ============================================================================
-- 0090_hash_senha_fornecedor.sql — elimina senha em TEXTO PURO do portal
--
-- fornecedor_acesso.senha_acesso guardava a senha em claro (12 linhas). O login
-- do portal (portal-fornecedor-login) já aceita SHA-256 hex e regrava como
-- bcrypt no primeiro acesso — então basta converter o legado para SHA-256.
-- O frontend também parou de gravar/exibir texto puro (rotaciona a senha a cada
-- ENVIO e grava só o hash — lib/senha-portal.js).
--
-- Idempotente: só converte o que não é bcrypt ($2...) nem SHA-256 (64 hex).
-- ============================================================================

create extension if not exists pgcrypto;

update public.fornecedor_acesso
   set senha_acesso = encode(digest(senha_acesso, 'sha256'), 'hex'),
       updated_at = now()
 where senha_acesso is not null
   and senha_acesso !~ '^\$2'
   and senha_acesso !~* '^[a-f0-9]{64}$';
