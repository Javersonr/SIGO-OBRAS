# Plano — Fundação de Segurança Multi-tenant (pré-requisito de comercialização)

> Objetivo: fechar o vazamento entre clientes (hoje, com a anon key pública, dá
> pra ler/escrever dados de qualquer empresa). É o gate nº 1 pra vender como SaaS.
> **Status: AGUARDANDO APROVAÇÃO. Nada será aplicado em produção sem o OK.**

## Diagnóstico (resumo)

- RLS desligada em todas as tabelas (migration 0026, nunca reativada).
- `login-custom` valida senha mas **não emite JWT**; front opera como `anon`.
- `current_empresa_id()` e `apply_tenant_rls()` já existem (0014) e esperam um
  JWT com `app_metadata.empresa_id`. Falta só emitir esse JWT.
- Projeto usa chaves NOVAS do Supabase (JWKS/assimétrico) → **não** assinar JWT na mão.

## Abordagem recomendada: Supabase Auth nativo (com migração de senha "lazy")

Por que: com chave assimétrica, só o Supabase assina JWT válido. Então usamos o
Auth nativo — que é o caminho profissional e o que a 0014 já previu
(`app_metadata.empresa_id`). Aproveitamos o `login-custom` pra fazer a ponte sem
quebrar ninguém:

**Fluxo novo do login-custom (service role):**

1. Valida e-mail+senha contra `usuario_custom` (igual hoje — bcrypt).
2. Garante um `auth.users` correspondente (cria na 1ª vez via `auth.admin.createUser`
   com a senha que o usuário acabou de digitar; nas próximas, atualiza se preciso).
   → migração de senha **transparente**, sem reset, sem ter os hashes antigos.
3. Seta `app_metadata = { empresa_id, is_super_admin, perfil }` no auth user
   (via `auth.admin.updateUserById`) — `app_metadata` não é editável pelo usuário.
4. Faz `signInWithPassword` (cliente anon, server-side) → obtém `access_token` +
   `refresh_token` e devolve pro front (além do `usuario` que já devolve hoje).

**Frontend/SDK:**

- Após o login, `supabase.auth.setSession({ access_token, refresh_token })`.
- A partir daí o supabase-js manda o JWT do usuário (role `authenticated`) →
  o PostgREST aplica RLS por `empresa_id`. `autoRefreshToken` já está ligado.

**Troca de empresa (usuários multi-empresa / Admin Holding):**

- Ao trocar, chamar uma Edge Function `trocar-empresa` que valida o vínculo,
  faz `updateUserById` mudando `app_metadata.empresa_id`, e devolve sessão nova
  (ou força refresh). Sem isso, a RLS continuaria na empresa antiga.

## Etapas (em ordem, com teste a cada passo)

**Etapa 0 — Validar a abordagem (sem tocar produção):**

- Confirmar num usuário de teste que `auth.admin.createUser` + `signInWithPassword`
  retorna JWT com `app_metadata.empresa_id`, e que `current_empresa_id()` lê certo.

**Etapa 1 — Backend de auth (sem ligar RLS ainda):**

- Atualizar `login-custom` (ponte Auth + tokens), criar `trocar-empresa`.
- `alterar-senha`/`redefinir-senha-admin`: refletir a senha no Auth também.
- Deploy. Testar login/troca de empresa retornando tokens — **RLS ainda off**,
  então nada quebra; só passa a haver sessão real.

**Etapa 2 — Frontend usa a sessão:**

- SDK/Layout: `setSession` no login; usar a sessão; tratar refresh/expiração e
  logout. Testar todo o app logado (ainda com RLS off).

**Etapa 3 — Reabilitar RLS (o passo sensível):**

- Migration `00XX_reenable_rls.sql`: roda `apply_tenant_rls` em TODAS as tabelas
  com `empresa_id` (reverter a 0026) + policies especiais (empresa, grupo, profiles).
- Migration de **ROLLBACK** pronta (re-desabilita) caso algo quebre.
- Aplicar **fora do horário de pico**; testar imediatamente com 2 usuários de
  empresas diferentes (cada um só vê o seu).

**Etapa 4 — Edge Functions param de confiar no body:**

- `licitacoes-triagem`, `config-licitacao`, `vincular-pasta-oportunidade`:
  validar o JWT do chamador e derivar/conferir `empresa_id` (não aceitar do body).
- CORS: restringir às origens do SaaS (sigoobras.com.br) em vez de `*`.

**Etapa 5 — Limpeza de autorização e bordas:**

- Remover grants a `anon` (`0031` v_nfe_resumo_mensal, `0034` criar_transferencia_atomica).
- Tirar o fallback `perfil || "Admin"` (default = negar) no `Layout.jsx`.
- `PermissionGate` nas ações da view "Lista" (Oportunidades).
- Sanitizar o `q` (filter injection) e validar protocolo de links (`http/https`).

## Mitigação de risco

- Cada etapa é deployável e testável isolada; RLS (a parte perigosa) só na Etapa 3,
  com rollback pronto e teste imediato cross-tenant.
- O app já tem ErrorBoundary + auto-reload de chunk (tela branca não trava ninguém).
- Backup: o Supabase tem PITR/daily backup; confirmar antes da Etapa 3.
- Critério de sucesso da Etapa 3: usuário da empresa A não enxerga 1 linha da B
  via tela NEM via REST direto com a anon key.

## Decisão pendente

- Abordagem: **Auth nativo (recomendado)** vs JWT custom HS256 (só se o projeto
  ainda aceitar o segredo legado — mais frágil).
- Janela pra Etapa 3 (reabilitar RLS) — idealmente horário de baixo uso.
