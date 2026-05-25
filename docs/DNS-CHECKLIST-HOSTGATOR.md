# Checklist DNS — migração `sigoobras.com.br` Cloudflare → Hostgator

Lista de TODOS os registros DNS que precisam estar presentes na **Zona Avançada de DNS** do Hostgator antes/depois de trocar os nameservers.

**Fonte:** dump DNS do Cloudflare atual (capturado em 2026-05-25).

---

## 🟢 Categoria A — Hostgator cria automaticamente (não fazer nada)

Quando o domínio vira addon na Hostgator e os NS apontam pra ns588/ns589, o cPanel cria sozinho:

| Tipo | Nome | Valor | Observação |
|---|---|---|---|
| A | `sigoobras.com.br` | IP do servidor (provavelmente `108.179.253.173` ou outro do plano) | apex |
| A | `cpanel.sigoobras.com.br` | IP do servidor | já existia, vai recriar |
| A | `webmail.sigoobras.com.br` | (CNAME → titan.hostgator.com.br ou A pro servidor) | webmail Titan |
| A | `mail.sigoobras.com.br` | IP do servidor | email |
| A | `whm.sigoobras.com.br` | IP do servidor | admin |
| A | `autodiscover.sigoobras.com.br` | IP do servidor | configuração automática Outlook etc |
| A | `autoconfig.sigoobras.com.br` | IP do servidor | configuração Thunderbird etc |
| A | `cpcalendars.sigoobras.com.br` | IP do servidor | calendários cPanel |
| A | `cpcontacts.sigoobras.com.br` | IP do servidor | contatos cPanel |
| A | `webdisk.sigoobras.com.br` | IP do servidor | webdisk |
| CNAME | `www.sigoobras.com.br` | `sigoobras.com.br` | www → raiz |
| CNAME | `ftp.sigoobras.com.br` | `sigoobras.com.br` | FTP |
| MX | `sigoobras.com.br` (prio 0) | mail server do Hostgator | **VAI CONFLITAR — ver categoria C abaixo** |
| TXT | `default._domainkey.sigoobras.com.br` | DKIM do Titan/cPanel | recriado automaticamente |
| TXT | `sigoobras.com.br` | `"v=spf1 +a +mx include:hostgator.com.br ~all"` (ou similar) | SPF default |
| SRV | `_autodiscover._tcp` `_caldav._tcp` `_caldavs._tcp` `_carddav._tcp` `_carddavs._tcp` | apontando pro cPanel | infra calendário/contatos |
| TXT | `_caldav._tcp` `_caldavs._tcp` `_carddav._tcp` `_carddavs._tcp` | `"path=/"` | infra calendário/contatos |
| TXT | `_cpanel-dcv-test-record.sigoobras.com.br` | gerado pelo cPanel | validação SSL interna |

**Você não precisa fazer nada nesta categoria.** Mas confira se foi tudo criado depois da troca de NS.

---

## 🔴 Categoria B — Adicionar MANUALMENTE na Zona Avançada (CRÍTICO)

Esses registros são de SERVIÇOS DE TERCEIROS (Resend, Brevo, SendGrid, AWS SES) que o Hostgator NÃO conhece. **Sem eles, envio de email autenticado quebra** (vai cair em spam ou ser rejeitado).

### B.1 — DKIM dos provedores de email

| Tipo | Nome (host) | Valor (TXT/CNAME destino) | TTL | Provedor |
|---|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ys+O4szWenx4ed1FeX1qVFVfJfVHMkxye5uZ7+hC+abTpKVxk+PWSZbNey3a3tOK5kVZr2uv3VPO7+R0sDxdkM834b0ZBwC03AnichBaXpL8cpWUZBTp3m8m1Ds15yw2giLGleFb9XrJ+B0lhMvS8xiv42p2zkaY88BgiQK34QIDAQAB` | 3600 | **Resend** |
| CNAME | `brevo1._domainkey` | `b1.sigoobras-com-br.dkim.brevo.com` | 14400 | **Brevo** |
| CNAME | `brevo2._domainkey` | `b2.sigoobras-com-br.dkim.brevo.com` | 14400 | **Brevo** |
| CNAME | `s1._domainkey` | `s1.domainkey.u58028738.wl239.sendgrid.net` | 14400 | **SendGrid** |
| CNAME | `s2._domainkey` | `s2.domainkey.u58028738.wl239.sendgrid.net` | 14400 | **SendGrid** |
| TXT | `titan1._domainkey` | `feedback-smtp.sa-east-1.amazonses.com` | 3600 | **AWS SES** (config feedback) |

> ⚠ O cPanel pode criar um `default._domainkey` (DKIM do Titan). Não delete — mantém esse, e adicione os 6 acima como adicionais.

### B.2 — SPF para subdomínio `send`

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| TXT | `send` | `"v=spf1 include:amazonses.com ~all"` | 3600 |

(Usado pra envio de email autenticado via AWS SES vindo de `email@send.sigoobras.com.br`.)

### B.3 — MX (recebimento de email)

> **Decisão tomada: Caminho 1 — Hostgator/Titan recebe.** Email chega no webmail.sigoobras.com.br normalmente.

| Tipo | Nome | Prioridade | Destino | Ação |
|---|---|---|---|---|
| MX | `sigoobras.com.br` | 0 | mail server do Hostgator (cPanel cria) | **Não fazer nada** — cPanel cria automático |
| MX | `sigoobras.com.br` | 20 | `mx2.titan.email` | **Adicionar manual** (backup) |
| MX | `send.sigoobras.com.br` | 10 | `feedback-smtp.sa-east-1.amazonses.com` | **Adicionar manual** (bounces do envio SES) |

**Importante:** em cPanel → **Email Routing**, deixar como **"Local Mail Exchanger"** (ou "Automatic Detection" que vai escolher local sozinho). Não escolher Remote.

### B.4 — CNAMEs SendGrid (link tracking)

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| CNAME | `em471` | `u58028738.wl239.sendgrid.net` | 14400 |
| CNAME | `em846` | `u58028738.wl239.sendgrid.net` | 14400 |
| CNAME | `em4005` | `u58028738.wl239.sendgrid.net` | 14400 |

(SendGrid usa subdomains rotativos para tracking de clicks/abertura. Se você não usa SendGrid mais, pode descartar.)

### B.5 — Verificação Brevo

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| TXT | `sigoobras.com.br` (raiz) | `"brevo-code:9d4ad8dbd1e993f6454768cc31a01f10"` | 14400 |

### B.6 — DMARC (escolher 1)

> O dump tinha 3 cópias do `_dmarc` (conflito). Mantém só **uma**, com `rua` pra ver relatórios:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| TXT | `_dmarc` | `"v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com"` | 3600 |

---

## 🟡 Categoria C — Conflito provável (resolver após troca de NS)

### C.1 — MX default do Hostgator

O Hostgator cria MX prio 0 → servidor próprio. Se você quer SES como prio 0 (Caminho 2 acima), **delete o MX que o cPanel criar e adicione o do SES manualmente**.

### C.2 — SPF default vs. seu SPF

O cPanel cria `"v=spf1 +a +mx include:hostgator.com.br ~all"` no apex. Se você envia também via Resend/Brevo/SendGrid/SES do domínio principal (não só do `send.`), precisa expandir pra:

```
v=spf1 +a +mx include:hostgator.com.br include:amazonses.com include:sendgrid.net include:_spf.brevo.com include:resend.com ~all
```

(Só inclua os providers que você efetivamente usa.)

### C.3 — Email Routing

cPanel → **Email Routing** → escolher entre:
- **Local Mail Exchanger** (Hostgator/Titan recebe — Caminho 1)
- **Remote Mail Exchanger** (servidor externo recebe — Caminho 2, com SES inbound)
- **Automatic Detection** (decide pelo MX prio 0)

---

## ⚫ Categoria D — Descartar (não precisa migrar)

Registros que SÓ faziam sentido com o Cloudflare/Mocha:

| Tipo | Nome | Valor antigo | Motivo de descartar |
|---|---|---|---|
| A | `sigoobras.com.br` | `104.19.163.13`, `104.19.162.13` | Cloudflare → não usamos mais |
| TXT | `_cf-custom-hostname` | UUIDs `5c72ddba…` e `d2a5f293…` | Cloudflare for SaaS (Mocha) — irrelevante fora do Cloudflare |
| CNAME | `_acme-challenge` | `…dcv.cloudflare.com` | ACME via Cloudflare — Hostgator usa o próprio Let's Encrypt |
| TXT | `_acme-challenge.webmail` | `wcBy-9eT…` | Idem (ACME desafios antigos) |
| TXT | `_acme-challenge.www` | `MopsCZG…` | Idem |
| TXT | `_acme-challenge.cpanel` | `NCl0zVz…` | Idem |
| A | `localhost.sigoobras.com.br` | `127.0.0.1` | Default Hostgator antigo, sem uso |

---

## 📋 Sequência prática

### Passo 1 — Adicionar `sigoobras.com.br` como Addon Domain no cPanel
- cPanel → **Domínios Adicionais (Addon Domains)** → "sigoobras.com.br"
- Diretório: `public_html/sigoobras/` (mesmo onde o GitHub Actions vai mandar o build)
- Subdomínio: `sigoobras` (Hostgator vai criar `sigoobras.sinergiaservicos.com` ou similar como apelido)
- Username FTP: a mesma que você criou pro deploy, ou nova

### Passo 2 — Pré-cadastrar TODOS os registros da Categoria B
- cPanel → **Editor Zona Avançada de DNS** → escolher `sigoobras.com.br`
- Adicionar 1 a 1: B.1 (6 registros) + B.2 (1) + B.3 (3 — depois de decidir Caminho 1 ou 2) + B.4 (3, opcional) + B.5 (1) + B.6 (1)
- Total: ~14 registros

### Passo 3 — TROCAR os nameservers
- **Onde:** painel da Hostgator > Domínios > sigoobras.com.br > **Nameservers** (ou "Servidores DNS")
- **De:** os atuais (provavelmente nameservers Cloudflare)
- **Para:** `ns588.hostgator.com.br` e `ns589.hostgator.com.br`
- Salvar. Propagação: 30 min a 24h (geralmente 1-2h)

### Passo 4 — Aguardar propagação e validar
```bash
# No terminal:
nslookup -type=NS sigoobras.com.br
# Deve mostrar ns588.hostgator.com.br + ns589.hostgator.com.br

nslookup sigoobras.com.br
# Deve mostrar IP do servidor Hostgator (108.x.x.x)

nslookup -type=MX sigoobras.com.br
# Conferir prioridades e destinos
```

### Passo 5 — SSL Let's Encrypt
- cPanel → **SSL/TLS Status** → emitir Let's Encrypt para:
  - `sigoobras.com.br`
  - `www.sigoobras.com.br`
  - subdomínios técnicos (webmail, cpanel, mail, etc.)

### Passo 6 — Testar
- Site: `https://sigoobras.com.br` (mostra o que estiver em `public_html/sigoobras/`)
- Email recebido: mandar de um Gmail externo para você
- Email enviado: enviar via Resend/Brevo/etc., conferir headers (DKIM=pass, SPF=pass, DMARC=pass)
- Webmail: `https://webmail.sigoobras.com.br`

### Passo 7 — Avisar suporte Mocha
- Pedir pra remover `sigoobras.com.br` do Custom Hostnames deles (pra liberar a entrada lá)

---

## 🆘 Em caso de problema

| Sintoma | Diagnóstico | Solução |
|---|---|---|
| `sigoobras.com.br` não resolve depois de 24h | Nameservers não trocaram | Conferir no portalcliente.hostgator.com.br se NS estão como ns588/ns589 |
| Email não chega | MX errado ou Email Routing local mas você queria remote | cPanel → Email Routing |
| Email cai em spam | SPF/DKIM/DMARC quebrados | `mxtoolbox.com/SuperTool.aspx` para verificar |
| Site dá "página default cPanel" | Build não foi enviado | Conferir GitHub Actions e que `dist/index.html` foi pro `public_html/sigoobras/` |
| `ERR_SSL_PROTOCOL_ERROR` | SSL ainda não emitido | Espera 5-10 min após cPanel processar; força emissão manual em SSL/TLS Status |

---

## ✅ Checklist antes de trocar NS

- [ ] `sigoobras.com.br` adicionado como Addon Domain (Passo 1)
- [x] ~~Decidir caminho~~ — **Caminho 1 (Hostgator/Titan recebe)** já decidido
- [ ] 6 DKIMs adicionados (B.1)
- [ ] SPF do send adicionado (B.2)
- [ ] MX prio 20 (`mx2.titan.email`) e MX prio 10 do `send` adicionados (B.3)
- [ ] CNAMEs SendGrid (B.4) — **só se ainda usar SendGrid** (Resend já parece suficiente)
- [ ] TXT verificação Brevo (B.5) — só se ainda usar Brevo
- [ ] DMARC (B.6)
- [ ] Build do frontend já está em `public_html/sigoobras/` (pra evitar página default no apex)
- [ ] Email Routing setado como "Local Mail Exchanger" (cPanel → Email Routing)
- [ ] Avisado clientes/usuários sobre janela de instabilidade de DNS (~2h)

Quando todos os ✓ estiverem marcados, **aí sim** vai no Passo 3 e troca os nameservers.
