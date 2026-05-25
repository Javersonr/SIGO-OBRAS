# Deploy do frontend no Hostgator (`sigoobras.com.br`) — ARQUIVADO

> ⚠️ **Esse roteiro está arquivado.** A decisão (2026-05-25) foi usar **Cloudflare Pages** em vez do Hostgator, porque o domínio já está atrás do Cloudflare e o Pages oferece build automático, CDN global e SSL nativo sem custo.
>
> **Use [`DEPLOY-CLOUDFLARE-PAGES.md`](./DEPLOY-CLOUDFLARE-PAGES.md) como roteiro oficial.**
>
> Este arquivo fica como referência caso, no futuro, queiramos migrar o frontend pro Hostgator (cenário improvável, mas documentado).

---

# Deploy do frontend no Hostgator (`sigoobras.com.br`) — roteiro de referência

Roteiro operacional para colocar o frontend (`apps/web`) rodando em produção no domínio `sigoobras.com.br` via Hostgator (shared hosting).

## Pré-requisitos

- [ ] Conta Hostgator ativa com cPanel
- [ ] Domínio `sigoobras.com.br` registrado (registro.br ou outro registrar)
- [ ] Acesso ao painel onde o domínio foi registrado
- [ ] Backend Supabase já configurado (ver `DEPLOY-SUPABASE.md`)

---

## Fase 1 — Apontar o domínio para Hostgator (DNS)

### Opção A: Mudar nameservers (recomendado se Hostgator vai gerenciar tudo)

1. Entre no painel onde `sigoobras.com.br` está registrado (provavelmente registro.br ou GoDaddy)
2. Em "DNS" / "Servidores de Nome", troque os nameservers atuais por:
   ```
   ns1.hostgator.com.br
   ns2.hostgator.com.br
   ```
   (confirme os nameservers exatos no email de boas-vindas da Hostgator ou em `cPanel → Sumário`)
3. Salve. Propagação leva de 30min a 24h.

### Opção B: Criar registros A apontando para o IP do servidor (mais granular)

1. No painel do registrar, em "DNS", crie:
   ```
   Tipo: A      Nome: @       Valor: <IP do servidor Hostgator>
   Tipo: A      Nome: www     Valor: <IP do servidor Hostgator>
   Tipo: CNAME  Nome: api     Valor: <ref>.supabase.co  (se quiser subdomínio)
   ```
2. O IP do servidor Hostgator está em `cPanel → Informações Gerais → IP Compartilhado`

### Verificar propagação

```bash
nslookup sigoobras.com.br
dig sigoobras.com.br +short
```

Deve retornar o IP do Hostgator. Se ainda mostrar o IP antigo, aguardar.

---

## Fase 2 — Configurar o domínio no cPanel

1. cPanel → **Addon Domains** (se não for o domínio primário) ou **Subdomains** (se for, ex: `app.sigoobras.com.br`)
2. Adicione `sigoobras.com.br`:
   - Document Root: `/home/<usuario>/public_html/sigoobras` (ou `public_html` se for o primário)
   - Salve

3. cPanel → **SSL/TLS** → **Let's Encrypt SSL**
   - Selecione `sigoobras.com.br` e `www.sigoobras.com.br`
   - **Issue** — emite e instala automaticamente
   - Espere ~1 minuto

4. cPanel → **Domains** → ativar **Force HTTPS Redirect** para `sigoobras.com.br`

---

## Fase 3 — Build do frontend

Na sua máquina local (ou via Git/CI futuro):

```bash
cd C:\Users\javer\sigoobras-base\apps\web

# .env.production com URL do Supabase real
cat > .env.production <<EOF
VITE_SUPABASE_URL=https://fpyvdwpvxrubrkdwrqbs.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-do-projeto>
VITE_APP_BASE_URL=https://sigoobras.com.br
EOF

npm install
npm run build
# Saída: dist/
```

`dist/` é o que vai pro servidor.

---

## Fase 4 — Upload para Hostgator

### Opção A: Via FTP (mais simples)

1. cPanel → **FTP Accounts** → crie uma conta ou pega a do usuário principal
2. Cliente FTP (FileZilla, WinSCP, ou `lftp`):
   ```
   Host:     ftp.sigoobras.com.br  (ou IP do servidor)
   User:     <conta-ftp>
   Senha:    <senha>
   Porta:    21 (FTP) ou 22 (SFTP via SSH)
   Diretório remoto: /home/<usuario>/public_html/sigoobras/
   ```
3. Upload de TODO o conteúdo de `apps/web/dist/` para essa pasta

### Opção B: Via Git Deploy (mais profissional, recomendado)

Hostgator suporta Git Version Control no cPanel:

1. cPanel → **Git Version Control** → **Create**
   ```
   Clone URL:    https://github.com/Javersonr/SIGO-OBRAS.git
   Repository Path: /home/<usuario>/repositories/sigoobras
   Repository Name: sigoobras
   ```
2. Salve. O cPanel clona o repo no servidor.
3. Para deploy, criar `apps/web/.cpanel.yml` (ver template abaixo) e fazer push.

Template `.cpanel.yml` (ainda preciso criar este arquivo no repo):
```yaml
---
deployment:
  tasks:
    - export DEPLOYPATH=/home/<usuario>/public_html/sigoobras/
    - /bin/cp -R apps/web/dist/* $DEPLOYPATH
```

Depois é só fazer push pro GitHub que dispara o pull no Hostgator. Mas atenção: o build precisa rodar antes (no GitHub Actions ou local) — Hostgator shared não roda `npm run build`.

### Opção C: GitHub Actions → FTP (totalmente automatizado)

Workflow `.github/workflows/deploy-hostgator.yml`:
```yaml
name: Deploy to Hostgator
on:
  push:
    branches: [master]
    paths: ['apps/web/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: |
          cd apps/web
          npm ci
          npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      - uses: SamKirkland/FTP-Deploy-Action@v4
        with:
          server: ftp.sigoobras.com.br
          username: ${{ secrets.FTP_USER }}
          password: ${{ secrets.FTP_PASS }}
          local-dir: apps/web/dist/
          server-dir: /public_html/sigoobras/
```

Quando estivermos prontos pra automação, eu crio esse workflow.

---

## Fase 5 — `.htaccess` (SPA fallback)

**CRÍTICO.** Sem isso, qualquer URL diferente de `/` (ex: `/financeiro`, `/projetos/123`) dá 404 no refresh, porque o React Router só funciona client-side.

Crie em `apps/web/public/.htaccess` (vai pro `dist/` automaticamente):

```apache
# SIGO Obras — SPA fallback + segurança básica

# 1. SPA fallback: tudo que não for arquivo real cai no index.html
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# 2. HTTPS forçado (caso o cPanel não tenha forçado)
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# 3. Cache agressivo de assets estáticos (Vite gera hash no nome)
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 month"
  ExpiresByType image/png "access plus 1 month"
  ExpiresByType image/jpeg "access plus 1 month"
  ExpiresByType image/webp "access plus 1 month"
  ExpiresByType font/woff2 "access plus 1 year"
</IfModule>

# 4. index.html nunca cacheia (pra mudanças aparecerem na hora)
<Files "index.html">
  Header set Cache-Control "no-cache, no-store, must-revalidate"
  Header set Pragma "no-cache"
  Header set Expires "0"
</Files>

# 5. Headers de segurança
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
```

---

## Fase 6 — Smoke test

1. Acesse `https://sigoobras.com.br` no navegador → deve carregar a tela de login
2. F12 → Network → ver se chamadas pra `*.supabase.co` estão indo
3. Console: nenhum erro CORS (se houver, ver Fase 7)
4. Logar com usuário de teste → ver dashboard
5. Recarregar a página em `/dashboard` → NÃO deve dar 404 (.htaccess funcionando)

---

## Fase 7 — Resolver CORS no Supabase

Se aparecer erro tipo `Access-Control-Allow-Origin missing`:

1. Dashboard Supabase → Project Settings → API → **Allowed Origins**
2. Adicionar:
   ```
   https://sigoobras.com.br
   https://www.sigoobras.com.br
   http://localhost:5173  (para dev local)
   ```
3. Salvar. Efeito imediato.

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| `ERR_NAME_NOT_RESOLVED` | DNS ainda propagando | Aguardar 1-24h, testar com `dig` |
| `404 Not Found` em refresh | `.htaccess` ausente ou sem `mod_rewrite` | Conferir se `.htaccess` foi pro `dist/`; cPanel → Apache Modules → `mod_rewrite` ativo |
| `Mixed Content` (HTTP no HTTPS) | URL Supabase em HTTP | Garantir que `VITE_SUPABASE_URL` começa com `https://` |
| Tela branca, console: `failed to load assets` | Paths absolutos errados | Vite gera `/assets/...` por padrão. Se o app estiver em subpasta (`/sigoobras/`), use `base: '/sigoobras/'` no `vite.config.js` |
| `CORS error` | Supabase não autorizou domínio | Fase 7 |
| `Invalid API key` | `VITE_SUPABASE_ANON_KEY` errada | Pegar de Dashboard → Settings → API → `anon public` |

---

## Checklist final

- [ ] DNS apontando para Hostgator
- [ ] Domínio adicionado no cPanel
- [ ] SSL Let's Encrypt instalado e Force HTTPS ativo
- [ ] Build `apps/web` com `.env.production` correto
- [ ] Upload de `dist/` para `public_html/`
- [ ] `.htaccess` presente com SPA fallback
- [ ] Supabase Allowed Origins inclui `https://sigoobras.com.br`
- [ ] Smoke test: login + refresh em rota interna funcionam
