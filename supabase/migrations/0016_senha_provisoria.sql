-- ============================================================================
-- 0016 — senha_provisoria nas tabelas de auth
-- ============================================================================
-- Decisão (2026-05-26): SIGO Obras NÃO usa reset de senha por email.
-- Fluxo adotado:
--   1. Admin cria usuário com senha provisória (gerada/escolhida pelo admin)
--   2. Admin entrega a senha pessoalmente (WhatsApp, papel, presencial)
--   3. No primeiro login, sistema força troca de senha
--   4. "Esqueci minha senha" não existe — usuário pede pro admin redefinir
--
-- Vantagens:
--   - Zero dependência de provedor de email transacional (Resend/SES/etc.)
--   - Sem fluxo de tokens expiráveis
--   - Sem risco de phishing via link de reset
--   - Menor superfície de ataque
--
-- Trade-off:
--   - Admin precisa estar disponível pra resetar senhas
--   - Não escala bem em organizações muito grandes (>100 usuários)
--   - Para 13 empresas atuais, mais que suficiente
--
-- Esta migration:
--   1. Adiciona coluna senha_provisoria boolean (default true) em usuario_custom
--   2. Mesmo em cliente_portal_usuario e fornecedor_acesso
--   3. Comenta colunas reset_token / reset_token_expira (não removemos pra
--      preservar compatibilidade com dados migrados da plataforma anterior)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. usuario_custom (admin, staff interno, super_admin)
-- ---------------------------------------------------------------------------
alter table public.usuario_custom
  add column if not exists senha_provisoria boolean not null default true;

comment on column public.usuario_custom.senha_provisoria is
  'Se true, o usuário foi criado por admin com senha provisória e deve trocar no primeiro login. Setado para false após troca bem-sucedida.';

-- Marca colunas legadas de reset (ainda existem mas não são mais usadas)
comment on column public.usuario_custom.reset_token is
  'LEGADO. Não usado no fluxo atual (sem reset por email). Mantido só para compatibilidade com dados migrados da plataforma anterior. Sempre NULL em registros novos.';

comment on column public.usuario_custom.reset_token_expira is
  'LEGADO. Não usado no fluxo atual. Ver coluna reset_token.';

-- ---------------------------------------------------------------------------
-- 2. cliente_portal_usuario (cliente externo do portal)
-- ---------------------------------------------------------------------------
alter table public.cliente_portal_usuario
  add column if not exists senha_provisoria boolean not null default true;

comment on column public.cliente_portal_usuario.senha_provisoria is
  'Se true, cliente foi convidado pelo admin e deve trocar a senha no primeiro acesso ao portal.';

-- ---------------------------------------------------------------------------
-- 3. fornecedor_acesso (login do portal do fornecedor)
-- ---------------------------------------------------------------------------
alter table public.fornecedor_acesso
  add column if not exists senha_provisoria boolean not null default true;

comment on column public.fornecedor_acesso.senha_provisoria is
  'Se true, fornecedor foi convidado e deve trocar a senha no primeiro acesso.';

-- ---------------------------------------------------------------------------
-- 4. Índices úteis (opcional, ajudam dashboards de "convites pendentes")
-- ---------------------------------------------------------------------------
create index if not exists usuario_custom_provisoria_idx
  on public.usuario_custom (empresa_id, senha_provisoria)
  where senha_provisoria = true;

create index if not exists cliente_portal_provisoria_idx
  on public.cliente_portal_usuario (empresa_id, senha_provisoria)
  where senha_provisoria = true;

create index if not exists fornecedor_acesso_provisoria_idx
  on public.fornecedor_acesso (empresa_id, senha_provisoria)
  where senha_provisoria = true;
