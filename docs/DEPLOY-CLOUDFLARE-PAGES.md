# Deploy do frontend no Cloudflare Pages — ALTERNATIVA (arquivado)

> ⚠️ **Esse roteiro virou alternativa**, não o caminho oficial. A decisão atual (2026-05-25) é usar **Hostgator** (ver [`DEPLOY-HOSTGATOR.md`](./DEPLOY-HOSTGATOR.md)) porque o usuário já paga e o domínio também é registrado lá.
>
> Mantemos este doc como referência para o caso de querer mover o frontend pro Cloudflare no futuro (custo zero, CDN global, melhor performance).

---

# Deploy do frontend no Cloudflare Pages

Roteiro para colocar o frontend (`apps/web`) rodando em `https://sigoobras.com.br` via **Cloudflare Pages** (não Hostgator).

## Por que Cloudflare Pages e não Hostgator?

| Critério                        | Cloudflare Pages             | Hostgator shared             |
| ------------------------------- | ---------------------------- | ---------------------------- |
| O domínio já está no Cloudflare | ✅ sim                       | precisa mover DNS            |
| Build automático do GitHub      | ✅ nativo                    | precisa GitHub Actions + FTP |
| SSL                             | ✅ automático                | precisa Let's Encrypt manual |
| SPA fallback                    | ✅ nativo (`_redirects`)     | precisa `.htaccess`          |
| CDN global                      | ✅ 300+ POPs                 | 1 servidor BR                |
| Custo                           | ✅ grátis até 500 builds/mês | mensalidade Hostgator        |
| Preview por branch/PR           | ✅ nativo                    | não tem                      |

Decisão: usar Cloudflare Pages. **Hostgator continua só com email** (Titan + AWS SES inbound já configurados).

## Pré-requisitos

- [ ] Acesso à conta Cloudflare que controla `sigoobras.com.br`
- [ ] Repositório GitHub (https://github.com/Javersonr/SIGO-OBRAS) acessível ao Cloudflare
- [ ] Supabase já configurado (ver `DEPLOY-SUPABASE.md`)
- [ ] Mocha removido do Custom Hostnames do Cloudflare (ver Fase 1)

---

## Fase 1 — Limpar setup antigo do Mocha

O DNS atual mostra:

```
TXT  _cf-custom-hostname.sigoobras.com.br  "5c72ddba-4d51-42e9-8b00-618632fb41dc"
TXT  _cf-custom-hostname.sigoobras.com.br  "d2a5f293-ea3c-4834-89a0-1ba88f78925a"
A    sigoobras.com.br  104.19.163.13
A    sigoobras.com.br  104.19.162.13
```

Esses TXT records são UUIDs do **Cloudflare for SaaS** (Custom Hostnames) — provavelmente o Mocha cadastrou o `sigoobras.com.br` na conta SaaS deles. Os A records são IPs anycast do Cloudflare.

**O que fazer:**

1. Dashboard Cloudflare → conta correta → **SSL/TLS → Custom Hostnames**
   - Se aparecer `sigoobras.com.br` listado pelo Mocha: deletar
   - Se não aparecer e os UUIDs continuam no DNS: o Mocha está usando _outra_ conta Cloudflare como SaaS provider. Nesse caso, os TXT records ficam no nosso DNS mas SEM efeito após removermos a referência.
2. Avisar o suporte Mocha que vamos parar de usar o custom hostname (assim eles removem do lado deles)
3. Após Pages estar configurado e DNS apontando pra ele, esses TXT records podem ser deletados sem dor

---

## Fase 2 — Criar projeto Cloudflare Pages

1. Dashboard Cloudflare → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Autorizar GitHub e selecionar `Javersonr/SIGO-OBRAS`
3. Configurações do build:
   ```
   Project name:         sigoobras
   Production branch:    master
   Framework preset:     Vite
   Build command:        cd apps/web && npm install && npm run build
   Build output dir:     apps/web/dist
   Root directory:       (deixar vazio = monorepo root)
   ```
4. **Environment variables** (Production):
   ```
   NODE_VERSION=20
   VITE_SUPABASE_URL=https://fpyvdwpvxrubrkdwrqbs.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key-do-Supabase>
   VITE_APP_BASE_URL=https://sigoobras.com.br
   ```
5. **Save and Deploy** — primeira build vai rodar (~3 min)
6. URL temporária do Pages: `https://sigoobras.pages.dev` — testar essa primeiro

---

## Fase 3 — Apontar `sigoobras.com.br` pro Pages

Após o Pages estar funcional na URL `*.pages.dev`:

1. Dashboard Cloudflare Pages → projeto sigoobras → **Custom domains** → **Set up a custom domain**
2. Digite `sigoobras.com.br` (e em seguida `www.sigoobras.com.br`)
3. Cloudflare verifica que o domínio está na mesma conta e configura automático:
   - Cria CNAME `sigoobras.com.br` → `sigoobras.pages.dev`
   - Remove os 2 A records (104.19.x.x) antigos
   - Mantém todos os OUTROS registros (MX, cpanel, webmail, email DKIMs) intactos
4. SSL: Cloudflare gera Universal Certificate automaticamente em ~30s
5. Verificar acessando `https://sigoobras.com.br` — deve servir o novo app

---

## Fase 4 — `_redirects` para SPA fallback

Substitui o `.htaccess` da Hostgator. Crie `apps/web/public/_redirects`:

```
# SIGO Obras — SPA fallback do Cloudflare Pages
# Qualquer rota não-arquivo → index.html (React Router pega no client)
/*    /index.html   200
```

Vite copia automaticamente `public/*` para `dist/` durante o build, então esse arquivo vai parar no deploy.

Outras alternativas que o Cloudflare Pages suporta (caso queira):

- `_headers` — set headers customizados (CSP, cache, etc.)
- `_worker.js` — código Edge serverless rodando antes da resposta (não precisamos disso ainda)

---

## Fase 5 — Headers de segurança e cache

Criar `apps/web/public/_headers`:

```
# Assets versionados pelo Vite (hash no nome) — cache infinito
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# index.html — nunca cacheia
/
  Cache-Control: public, max-age=0, must-revalidate
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(self)

/index.html
  Cache-Control: public, max-age=0, must-revalidate
```

---

## Fase 6 — Configurar CORS no Supabase

Dashboard Supabase → Project Settings → API → **Allowed Origins**:

```
https://sigoobras.com.br
https://www.sigoobras.com.br
https://sigoobras.pages.dev
https://*.sigoobras.pages.dev    (preview deploys de branches/PRs)
http://localhost:5173
http://localhost:4173
```

---

## Fase 7 — Smoke test

1. `https://sigoobras.com.br` → tela de login do novo app (não mais o Mocha)
2. F12 → Console: sem erros
3. Network: chamadas a `*.supabase.co` retornando 200
4. Logar com usuário de teste → dashboard
5. Recarregar em rota interna (ex: `/financeiro`) → não dá 404 (`_redirects` funcionando)
6. Email continua chegando em `contato@sigoobras.com.br`? (testa enviando de outra conta)
7. Webmail `https://webmail.sigoobras.com.br` continua acessando o Titan/Hostgator

---

## Fase 8 — Branch previews (opcional)

Cloudflare Pages cria URL de preview para cada PR/branch:

- `https://<commit-sha>.sigoobras.pages.dev` — sempre o último commit
- `https://<branch-name>.sigoobras.pages.dev` — última build da branch

Útil pra testar uma feature antes do merge. Sem configuração extra.

---

## Tabela: o que muda no DNS após Pages estar ativo

| Registro hoje                                             | Mudança                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| A `sigoobras.com.br` → 104.19.163.13/162.13               | **Removido** (Pages cria CNAME novo)             |
| `_cf-custom-hostname` TXT (UUIDs Mocha)                   | **Removido** (após Mocha confirmar saída)        |
| CNAME `_acme-challenge.sigoobras.com.br` → cloudflare DCV | Mantém — Cloudflare gerencia SSL automaticamente |
| MX `sigoobras.com.br` → SES + Titan                       | **Mantém** (email continua igual)                |
| Subdomains `cpanel/webmail/mail/ftp` → 108.179.253.173    | **Mantém** (Hostgator admin continua)            |
| DKIMs (Brevo, SendGrid, Resend, SES, Titan)               | **Mantém** (envio de email continua)             |

---

## Rollback se algo der errado

Setup atual do Mocha continua intacto até a Fase 3. Se algo quebrar:

1. Dashboard Cloudflare → DNS → re-adicionar os 2 A records 104.19.x.x
2. Remover o CNAME criado pelo Pages
3. Voltou pro Mocha

O rollback é reversível e leva ~1 minuto. Use isso pra fazer cutover em horário de baixa.

---

## Checklist final

- [ ] Acesso confirmado à conta Cloudflare
- [ ] Custom Hostname Mocha removido (ou notificado)
- [ ] Projeto Pages criado e conectado ao GitHub
- [ ] Build verde na URL `sigoobras.pages.dev`
- [ ] Env vars `VITE_SUPABASE_*` corretas
- [ ] `_redirects` e `_headers` em `apps/web/public/`
- [ ] Custom domain `sigoobras.com.br` apontado pro Pages
- [ ] SSL ativo (cadeado verde)
- [ ] CORS Supabase libera o domínio
- [ ] Smoke test passou
- [ ] Email ainda funciona (SES + Titan)
