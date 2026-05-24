# Deploy do backend no Supabase

Roteiro operacional para configurar o projeto **sigoobras** no Supabase hosted (já existe, ref `fpyvdwpvxrubrkdwrqbs`, região São Paulo).

## Pré-requisitos

- [ ] Supabase CLI instalado (`supabase --version` ≥ 2.x) — já temos v2.98.2
- [ ] Logado: `supabase login` (ok)
- [ ] Projeto sigoobras existe no dashboard

## URLs e identidades importantes

```
Project Ref:   fpyvdwpvxrubrkdwrqbs
Dashboard:     https://supabase.com/dashboard/project/fpyvdwpvxrubrkdwrqbs
API URL:       https://fpyvdwpvxrubrkdwrqbs.supabase.co
DB URL:        postgresql://postgres.<ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
Region:        South America (São Paulo) → sa-east-1
```

---

## Fase 1 — Despausar o projeto

O projeto está **PAUSADO** (free tier pausa após 7 dias ociosos).

1. Abrir https://supabase.com/dashboard/project/fpyvdwpvxrubrkdwrqbs
2. Banner amarelo no topo: clicar em **Restore project**
3. Aguardar ~2-5 min (status muda para "Active")
4. Confirmar via CLI:
   ```bash
   supabase projects list
   # Deve mostrar o projeto sem warning de pause
   ```

---

## Fase 2 — Link local ↔ remoto

```bash
cd C:\Users\javer\sigoobras-base
supabase link --project-ref fpyvdwpvxrubrkdwrqbs
```

Vai pedir a **senha do banco** (Database Password). Está em:
Dashboard → Settings → Database → Connection Pooling → Password (ou redefinir se esqueceu)

---

## Fase 3 — Aplicar migrations

```bash
# Lista o que vai aplicar (dry run lógico)
supabase migration list

# Empurra as 14 migrations pro banco remoto
supabase db push
```

**Atenção:** se o banco tiver tabelas anteriores (do uso antigo), pode dar conflito. Conferir antes:

```bash
# Inspecionar schemas atuais do remoto
supabase db dump --schema public --data-only=false | head -100
```

Se houver tabelas legadas e for OK perder, **resetar** (DESTRUTIVO):
```bash
supabase db reset --linked
# Isso APAGA o banco e re-aplica todas as migrations limpas
```

---

## Fase 4 — Criar buckets de Storage

Aplicar via SQL no Dashboard (Editor SQL) ou via CLI:

```bash
psql "<DB_URL>" < supabase/seed-storage.sql
```

Buckets criados (ver `supabase/seed-storage.sql`):
- `comprovantes` — imagens/PDFs anexados a pre_lancamento e transacao_anexo
- `certificados` — certificados de treinamento, ASOs
- `laudos` — laudos técnicos de ferramentas
- `fotos-ferramentas` — foto_url da entidade ferramenta
- `fotos-materiais` — foto_url da entidade material
- `fotos-funcionarios` — foto e biometria
- `documentos-assinados` — historico_documento_assinado
- `anexos-cotacao` — arquivo_cotacao_fornecedor
- `anexos-oportunidade` — arquivo_oportunidade
- `logos-empresa` — logo_url da entidade empresa
- `comprovantes-pagamento` — fechamento_caixa.comprovante_pagamento_url
- `diario-obra` — fotos do diário de obra

Cada bucket tem policy `tenant_isolation_<bucket>` que só permite upload/download se o JWT contém o `empresa_id` correto (path: `<empresa_id>/<resto>`).

---

## Fase 5 — Configurar Auth

### 5a. Provider e fluxos
Dashboard → Authentication → Providers
- [ ] Email/password: habilitado (default)
- [ ] Confirmation email: **desativar** inicialmente (vamos usar fluxo customizado de convite)
- [ ] Magic links: opcional

### 5b. Email templates
Dashboard → Authentication → Email Templates
- Personalizar com logo/cores SIGO Obras
- Templates a editar: Confirm signup, Reset password, Magic link, Invite user

### 5c. SMTP (custom)
Dashboard → Project Settings → Auth → SMTP Settings
- Configurar com seu provedor de email (Resend, SendGrid, ou SMTP da Hostgator)
- Sem isso, Supabase usa SMTP padrão com rate limit baixo (4 emails/h)

### 5d. JWT Claims
A Edge Function `login-custom` (Fase 7) será responsável por setar `empresa_id` no `app_metadata` do JWT após login. Isso é o que faz a RLS funcionar.

---

## Fase 6 — Configurar CORS

Dashboard → Project Settings → API → CORS Allowed Origins

Adicionar:
```
https://sigoobras.com.br
https://www.sigoobras.com.br
http://localhost:5173
http://localhost:4173
```

Salvar. Efeito imediato.

---

## Fase 7 — Edge Functions

Estrutura (ainda não criadas — vão na Fase 4 do roadmap):
```
supabase/functions/
├── login-custom/
├── webhook-asaas/
├── webhook-assinafy/
├── webhook-whatsapp/
└── ...
```

Deploy:
```bash
supabase functions deploy login-custom
supabase functions deploy webhook-asaas
# ...
```

Secrets das functions:
```bash
supabase secrets set ASAAS_API_KEY=...
supabase secrets set ASSINAFY_API_KEY=...
supabase secrets set ASSINAFY_ACCOUNT_ID=...
supabase secrets set WHATSAPP_TOKEN=...
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...
supabase secrets set GEMINI_API_KEY=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set FOCUSNFE_API_KEY=...
```

Listar:
```bash
supabase secrets list
```

---

## Fase 8 — Importar dados (seed)

Opção A: do backup xlsx (`tools/seed-from-xlsx.mjs`):
```bash
cd tools
# .env com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (de Dashboard → Settings → API → service_role)
npm install
npm run seed:from-xlsx
```

Opção B: do export Base44 live (`tools/export-base44.mjs` + script de import a criar):
```bash
# 1. exporta tudo do Base44
npm run export:base44
# 2. import (TODO: criar script seed-from-base44-dump.mjs)
```

---

## Fase 9 — pg_cron para Edge Functions agendadas

8 functions são crons (`dispararAlertas`, `processarRecorrencias`, etc.). Setup:

```sql
-- No Dashboard → SQL Editor:

-- Habilitar pg_cron e pg_net
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Exemplo: rodar dispararAlertas diariamente às 7h BR (10h UTC)
select cron.schedule(
  'disparar-alertas-diario',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/disparar-alertas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

(O `service_role_key` precisa estar no `vault.secrets` ou em `current_setting`. Setup completo virá na Fase 5 do roadmap.)

---

## Fase 10 — Backups

Dashboard → Database → Backups
- Free tier: 7 dias de backup automático (Point-in-Time Recovery limitado)
- Pro tier: 30 dias PITR
- Backup manual: `supabase db dump --linked > backup-$(date +%F).sql` periodicamente

---

## Checklist final

- [ ] Projeto despausado e Active
- [ ] CLI linkada (`supabase link`)
- [ ] 14 migrations aplicadas (`supabase db push`)
- [ ] Buckets Storage criados (`seed-storage.sql`)
- [ ] CORS configurado para `https://sigoobras.com.br`
- [ ] Auth providers configurados
- [ ] SMTP customizado (se for usar convites por email)
- [ ] (futuro) Edge Functions deployadas com secrets
- [ ] (futuro) pg_cron jobs ativos
- [ ] Backup manual feito antes do cutover de produção

---

## Troubleshooting

| Sintoma | Solução |
|---|---|
| `project is paused` | Despausar no dashboard, Fase 1 |
| `Database password mismatch` | Settings → Database → Reset DB Password |
| `migration X already applied` | `supabase migration repair --status applied <timestamp>` |
| `relation already exists` | Banco tem schema legado — `supabase db reset --linked` se for OK perder, ou criar migration de cleanup |
| `permission denied for schema public` | Usar service_role_key, não anon key |
| `JWT expired` | Renovar token: `supabase login` |
