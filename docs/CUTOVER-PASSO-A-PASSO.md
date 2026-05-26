# Passo a passo do cutover — SIGO Obras

Guia operacional pra publicar o novo SIGO Obras em `https://sigoobras.com.br` sem quebrar o email nem a plataforma anterior. **Siga na ordem.**

**Tempo total estimado:** 1h-2h de ação + 1h-24h de propagação DNS.

**O que você vai precisar antes:**

- Login do portal Hostgator (`portalcliente.hostgator.com.br`)
- Login do cPanel (acessado via portal ou diretamente)
- Login do GitHub (Javersonr)
- Este documento aberto em outra aba
- O documento [`DNS-CHECKLIST-HOSTGATOR.md`](./DNS-CHECKLIST-HOSTGATOR.md) aberto também (vai usar como referência)
- Sua anon key do Supabase (já está em `apps/web/.env.example` linha 12)

---

# 📦 ETAPA A — Hostgator (~30 min)

## A.1 — Login no portal Hostgator

1. Abra: https://portalcliente.hostgator.com.br
2. Faça login
3. Você vai cair no **Painel** com lista dos seus serviços
4. Localize seu plano (deve ser o **Plano M** que aparece na sua imagem)
5. Clique no nome do plano OU no botão **"Gerenciar"** ao lado dele
6. Vai abrir a página de gerenciamento do plano

**Vai precisar acessar o cPanel.** Em algum lugar dessa tela tem um botão **"Acessar cPanel"** ou **"Login no cPanel"**. Clica nele. Nova aba abre direto no cPanel sem precisar redigitar senha.

> ⚠ Se pedir login do cPanel separado, o usuário/senha está no email de boas-vindas da Hostgator quando você contratou o plano. Se perdeu, no portal tem opção de redefinir.

---

## A.2 — Adicionar `sigoobras.com.br` como Addon Domain

Você vai criar `sigoobras.com.br` como um "domínio adicional" do plano principal (`sinergiaservicos.com` ou similar).

### Passos:

1. No cPanel, na barra de busca no topo, digite **"domínio adicional"** ou **"addon"**
2. Clique em **"Domínios Adicionais"** (ou "Addon Domains" se o cPanel estiver em inglês)
3. Vai abrir um formulário com 4 campos:

| Campo                         | O que preencher                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **Novo Nome de Domínio**      | `sigoobras.com.br`                                                                                 |
| **Subdomínio/prefixo do FTP** | deixe o padrão que ele sugerir (algo como `sigoobras`)                                             |
| **Document Root**             | `public_html/sigoobras` (importante — é exatamente o que vamos usar no deploy)                     |
| **Senha**                     | usa o botão **"Gerador de Senha"** → marca "Eu copiei essa senha" → guarda no Notepad por enquanto |

4. Clique em **"Adicionar Domínio"**

### Resultado esperado:

- Verde no topo: "Sucesso, adicionado o domínio sigoobras.com.br"
- Aparece na lista de Domínios Adicionais embaixo

### ⚠ Pode dar este erro:

> "O domínio já está apontado para outro lugar — confirme propriedade"

Se aparecer, é porque o Hostgator detectou que os nameservers do `sigoobras.com.br` estão fora (Cloudflare). Tem 2 opções:

- **Opção 1**: marque a opção "Adicionar mesmo assim" / "Ignorar verificação"
- **Opção 2**: se não tiver checkbox, **passa pra Etapa C primeiro** (troca os NS pra Hostgator), aguarda 2h e volta aqui

Recomendado: tente Opção 1 primeiro. Se não der, é Opção 2.

---

## A.3 — Criar conta FTP `deploy` (pra o GitHub Actions usar)

Vamos criar uma conta FTP **isolada** só pra deploys automáticos (não usa a senha principal do cPanel — segurança).

### Passos:

1. cPanel → busca **"FTP"** → clique em **"Contas FTP"**
2. Formulário:

| Campo                          | O que preencher                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Login**                      | `deploy`                                                                                                                                   |
| **Domínio** (dropdown ao lado) | escolha `sigoobras.com.br`                                                                                                                 |
| **Senha**                      | botão **"Gerador de Senha"** → 16+ caracteres → **COPIE pro Notepad**                                                                      |
| **Diretório**                  | `/home/<seu-usuario>/public_html/sigoobras` (geralmente já vem preenchido com `public_html/sigoobras` quando você escolhe o domínio acima) |
| **Quota**                      | "Ilimitado"                                                                                                                                |

3. Clique em **"Criar Conta FTP"**

### Resultado esperado:

- Verde: "Conta criada com sucesso"
- Lista embaixo mostra `deploy@sigoobras.com.br`

### 📝 Anote AGORA em um arquivo seguro (precisa nos próximos passos):

```
FTP_HOST: ftp.sigoobras.com.br
FTP_USER: deploy@sigoobras.com.br
FTP_PASS: (a senha que você gerou)
FTP_DIR:  /public_html/sigoobras
```

> ⚠ Em alguns servidores o host FTP é o IP do servidor (ex: `br588.hostgator.com.br` ou `108.179.253.173`) em vez de `ftp.sigoobras.com.br`. Depois confirmamos.

### Como confirmar o host correto:

- Na mesma tela de Contas FTP, ao lado da conta criada, clique em **"Configurar Cliente FTP"**
- Vai mostrar uma seção com "Configuração FTP Manual" — copie o **"Servidor FTP"** dali. Esse é o valor real do `FTP_HOST`.

---

## A.4 — Pré-cadastrar registros DNS na Zona Avançada

> ⚠ **Importante:** essa etapa só vale a pena fazer **AGORA** se você ainda NÃO trocou os nameservers. Se já trocou e a propagação completou, pode pular pra A.5 — o cPanel já vai estar gerenciando o DNS por padrão.

Pré-cadastrar significa: deixar tudo pronto na Zona Avançada **antes** de redirecionar os nameservers, pra quando o DNS virar, todos os registros já estarem prontos e o email não cair.

### A.4.0 — Como entrar no Editor de Zona

1. cPanel → busca **"Zona Avançada"** ou **"Advanced DNS Zone"**
2. Clica em **"Editor de Zona DNS"** ou **"Advanced Zone Editor"** ou **"Editor DNS Avançado"** (o nome muda entre versões do cPanel)
3. No topo da tela tem um dropdown **"Domínio"** — escolhe `sigoobras.com.br`

> ⚠ Se NÃO aparecer `sigoobras.com.br` no dropdown, é porque os nameservers atuais NÃO são os da Hostgator. Nesse caso o cPanel não tem autoridade sobre a zona dele e o editor está desabilitado.
> Caminho alternativo: **Etapa C primeiro** (troca NS → espera propagar → volta aqui pra adicionar os DKIMs etc.).

### A.4.1 — Adicionar 6 DKIMs

Pra cada registro abaixo:

- Clique em **"Adicionar Registro"** (botão geralmente no topo direito)
- Preencha conforme a tabela
- Clique em **"Adicionar Registro"** (confirmação)
- Repete pro próximo

#### Registro 1: Resend DKIM

```
Tipo:    TXT
Nome:    resend._domainkey
TTL:     3600
Valor:   p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ys+O4szWenx4ed1FeX1qVFVfJfVHMkxye5uZ7+hC+abTpKVxk+PWSZbNey3a3tOK5kVZr2uv3VPO7+R0sDxdkM834b0ZBwC03AnichBaXpL8cpWUZBTp3m8m1Ds15yw2giLGleFb9XrJ+B0lhMvS8xiv42p2zkaY88BgiQK34QIDAQAB
```

> ⚠ Esse valor é **muito longo** (uma linha só). Copia inteiro. Alguns cPanels truncam visualmente — não tem problema, salva e abre de novo pra conferir.

#### Registro 2: Brevo DKIM 1

```
Tipo:    CNAME
Nome:    brevo1._domainkey
TTL:     14400
Valor:   b1.sigoobras-com-br.dkim.brevo.com
```

#### Registro 3: Brevo DKIM 2

```
Tipo:    CNAME
Nome:    brevo2._domainkey
TTL:     14400
Valor:   b2.sigoobras-com-br.dkim.brevo.com
```

#### Registro 4: SendGrid DKIM 1

```
Tipo:    CNAME
Nome:    s1._domainkey
TTL:     14400
Valor:   s1.domainkey.u58028738.wl239.sendgrid.net
```

#### Registro 5: SendGrid DKIM 2

```
Tipo:    CNAME
Nome:    s2._domainkey
TTL:     14400
Valor:   s2.domainkey.u58028738.wl239.sendgrid.net
```

#### Registro 6: AWS SES feedback

```
Tipo:    TXT
Nome:    titan1._domainkey
TTL:     3600
Valor:   feedback-smtp.sa-east-1.amazonses.com
```

### A.4.2 — SPF do subdomínio `send`

#### Registro 7

```
Tipo:    TXT
Nome:    send
TTL:     3600
Valor:   v=spf1 include:amazonses.com ~all
```

(SEM aspas no campo Valor — o cPanel adiciona sozinho.)

### A.4.3 — DMARC

#### Registro 8

```
Tipo:    TXT
Nome:    _dmarc
TTL:     3600
Valor:   v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com
```

### A.4.4 — Verificação Brevo

#### Registro 9

```
Tipo:    TXT
Nome:    @  (ou deixe em branco se aceitar; significa o domínio raiz sigoobras.com.br)
TTL:     14400
Valor:   brevo-code:9d4ad8dbd1e993f6454768cc31a01f10
```

> ⚠ Pode haver outro TXT no `@` (SPF default do cPanel). Os dois convivem (Brevo verifica o seu, SPF é independente).

### A.4.5 — MX adicionais (backup Titan + bounces SES)

#### Registro 10: Titan backup

```
Tipo:      MX
Nome:      @ (raiz, ou deixe em branco)
TTL:       3600
Prioridade: 20
Destino:   mx2.titan.email
```

#### Registro 11: SES bounces no `send`

```
Tipo:      MX
Nome:      send
TTL:       3600
Prioridade: 10
Destino:   feedback-smtp.sa-east-1.amazonses.com
```

### A.4.6 — (Opcional) CNAMEs SendGrid

> Pule se você não usa SendGrid pra envio (parece que já tem Resend + Brevo + SES, então provavelmente SendGrid não é mais necessário).

#### Registros 12-14 (só se usar SendGrid)

```
Tipo: CNAME, Nome: em471,  Valor: u58028738.wl239.sendgrid.net
Tipo: CNAME, Nome: em846,  Valor: u58028738.wl239.sendgrid.net
Tipo: CNAME, Nome: em4005, Valor: u58028738.wl239.sendgrid.net
```

### ✅ Conferência da Etapa A.4

Volte ao topo da Zona Avançada e role a página. Deve aparecer agora (entre o que o cPanel criou automático + o que você adicionou):

- ✓ `default._domainkey` (criado pelo cPanel, DKIM Titan)
- ✓ `resend._domainkey`
- ✓ `brevo1._domainkey` e `brevo2._domainkey`
- ✓ `s1._domainkey` e `s2._domainkey`
- ✓ `titan1._domainkey`
- ✓ `_dmarc`
- ✓ `send` (TXT SPF)
- ✓ `send` (MX prio 10)
- ✓ `@` (MX prio 20 → titan)
- ✓ `@` (TXT brevo-code)

Total: ~11 registros adicionados manualmente + ~15 default = ~26 records.

---

## A.5 — Email Routing (Local Mail Exchanger)

Confirma que o Hostgator vai **receber localmente** os emails (não tentar reenviar pra SES).

1. cPanel → busca **"Email Routing"** ou **"Roteamento de E-mail"**
2. Clica em **"Configuração de Roteamento de E-mail"**
3. Dropdown no topo: escolhe `sigoobras.com.br`
4. Marca a opção **"Servidor de E-mail Local"** (Local Mail Exchanger) ou **"Detectar Automaticamente"**
5. Clica em **"Alterar"** / **"Salvar"**

### Resultado esperado:

- Verde: "Detecção Automática selecionada para sigoobras.com.br"

---

# 🐙 ETAPA B — GitHub (~5 min)

## B.1 — Login e abrir Settings

1. Abra: https://github.com/Javersonr/SIGO-OBRAS
2. No topo da página do repo, clique na aba **"Settings"** (último item à direita, ícone de engrenagem)
3. No menu lateral esquerdo, role pra baixo até a seção **"Security"**
4. Clique em **"Secrets and variables"** → expande
5. Clique em **"Actions"** (subitem que aparece)

URL direta: https://github.com/Javersonr/SIGO-OBRAS/settings/secrets/actions

## B.2 — Criar 6 secrets

Pra cada secret:

- Clique no botão verde **"New repository secret"** no topo direito
- Preencha `Name` (exato) e `Secret` (valor)
- Clique em **"Add secret"**
- Volta automático pra lista, e repete pro próximo

### Secret 1: VITE_SUPABASE_URL

```
Name:   VITE_SUPABASE_URL
Value:  https://fpyvdwpvxrubrkdwrqbs.supabase.co
```

### Secret 2: VITE_SUPABASE_ANON_KEY

Pegar o valor de **uma** das opções:

- **Opção a:** abra `apps/web/.env.example` no seu PC, copia a linha que começa com `VITE_SUPABASE_ANON_KEY=eyJhbGc...`
- **Opção b:** Dashboard Supabase → https://supabase.com/dashboard/project/fpyvdwpvxrubrkdwrqbs/settings/api → seção **"Project API keys"** → linha **"anon"** → botão **"Copy"**

```
Name:   VITE_SUPABASE_ANON_KEY
Value:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZweXZkd3B2eHJ1YnJrZHdycWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTQyNTYsImV4cCI6MjA5MzczMDI1Nn0.Npvrjuu8gGrGugw-RVHI6ZgvoKqJSPW93inC4rw3lWU
```

### Secret 3: HOSTGATOR_FTP_HOST

```
Name:   HOSTGATOR_FTP_HOST
Value:  ftp.sigoobras.com.br
```

(Ou o valor que você anotou na A.3 quando viu "Configurar Cliente FTP".)

### Secret 4: HOSTGATOR_FTP_USER

```
Name:   HOSTGATOR_FTP_USER
Value:  deploy@sigoobras.com.br
```

### Secret 5: HOSTGATOR_FTP_PASS

```
Name:   HOSTGATOR_FTP_PASS
Value:  (a senha forte que você gerou na A.3)
```

### Secret 6: HOSTGATOR_FTP_DIR

```
Name:   HOSTGATOR_FTP_DIR
Value:  /public_html/sigoobras/
```

> ⚠ A barra final `/` é importante.

### Conferência B.2

A lista de secrets deve ter exatamente esses 6 nomes:

- ✓ HOSTGATOR_FTP_DIR
- ✓ HOSTGATOR_FTP_HOST
- ✓ HOSTGATOR_FTP_PASS
- ✓ HOSTGATOR_FTP_USER
- ✓ VITE_SUPABASE_ANON_KEY
- ✓ VITE_SUPABASE_URL

## B.3 — Disparar workflow manualmente

1. Vai pra: https://github.com/Javersonr/SIGO-OBRAS/actions
2. Na barra lateral esquerda, clique em **"Deploy frontend to Hostgator"**
3. No canto superior direito do conteúdo, vai aparecer **"Run workflow"** com uma seta dropdown
4. Clica em **"Run workflow"**
5. Confirma:
   - Branch: **master** (padrão)
   - Clica no botão verde **"Run workflow"**

### O que vai acontecer:

- Em ~30s aparece um novo "run" em amarelo na lista
- Clica nele pra ver progresso
- Vai passar por etapas:
  - ✓ Setup Node 20
  - ✓ Install web deps (~1 min)
  - ✓ Install sdk deps (~30s)
  - ✓ Build Vite production (~1 min)
  - ✓ Verify build artifacts
  - ✓ Deploy via FTP to Hostgator (~1-2 min)
  - ✓ Notify result

**Total: ~3-5 min.**

### Resultado esperado:

- Bolinha verde ✓ ao lado do run
- Mensagem final: "Deploy concluído. Site: https://sigoobras.com.br"

### Se der erro:

| Erro                                             | Causa                                | Solução                                                                 |
| ------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| `Error: Login authentication failed` no step FTP | Senha FTP errada nos secrets         | Volte na A.3, reseta senha, atualiza secret HOSTGATOR_FTP_PASS          |
| `unable to verify the first certificate`         | FTP com SSL não match                | Geralmente passa retry; se persistir, troca FTP_HOST pra IP do servidor |
| `dist/.htaccess ausente`                         | Pasta `public/` não foi pro build    | Confirma que `apps/web/public/.htaccess` existe no repo                 |
| `VITE_SUPABASE_URL undefined`                    | Secret não foi criado ou nome errado | Re-confere B.2                                                          |
| Timeout no Build                                 | Lento (raro)                         | Re-roda                                                                 |

## B.4 — Confirmar que os arquivos chegaram no servidor

Você pode confirmar de 2 jeitos:

### Opção 1: via cPanel File Manager

1. cPanel → **"Gerenciador de Arquivos"** (File Manager)
2. Navega pra `public_html/sigoobras/`
3. Deve ver: `index.html`, pasta `assets/`, `.htaccess`, `vite.svg` etc.

### Opção 2: via URL direta (só funciona ANTES da troca de NS, usando um IP-based path do servidor)

Hostgator geralmente expõe sites antes do DNS via uma URL tipo:

```
http://<seu-usuario-cpanel>.br588.hostgator.com.br/sigoobras/
```

ou

```
http://<IP-servidor>/~<seu-usuario-cpanel>/sigoobras/
```

(O IP é o que aparece em cPanel → "Informações Gerais" → "IP Compartilhado".)

**Se conseguir abrir e mostrar a tela de login do SIGO Obras** = build subiu OK e está esperando o DNS apontar.

---

# 🔄 ETAPA C — Cutover DNS (~30 min + 1-24h de propagação)

> ⚠ **Só faça essa etapa quando ETAPA A e B estiverem 100% completas.** Caso contrário, o site fica fora do ar entre o momento que troca NS e o momento que tudo está deployado.

## C.1 — Trocar os nameservers do `sigoobras.com.br`

> ⚠ Isso é diferente da imagem que você me mandou. Naquela imagem você estava vendo o **domínio principal** (`sinergiase…`). Agora você precisa trocar os NS do **`sigoobras.com.br` especificamente**, que provavelmente está em outra seção do portal.

### Passos:

1. https://portalcliente.hostgator.com.br
2. Menu superior → **"Domínios"** (geralmente tem um item específico, não confundir com "Hospedagem")
3. Lista de domínios da sua conta → procura `sigoobras.com.br` → clica no nome dele
4. Vai abrir a tela específica do domínio com várias seções
5. Localize a seção **"Servidores de Nome"** ou **"Nameservers"** ou **"DNS"**
6. Vai mostrar os atuais (provavelmente nameservers Cloudflare ou outro provider)
7. Clica em **"Alterar"** ou **"Editar"**
8. Escolhe a opção **"Usar nameservers personalizados"** ou **"Servidores DNS personalizados"**
9. Preenche:
   - **Servidor 1:** `ns588.hostgator.com.br`
   - **Servidor 2:** `ns589.hostgator.com.br`
10. Clica em **"Salvar"** / **"Alterar"** / **"Atualizar"**

### Resultado esperado:

- Mensagem verde: "Servidores de nome atualizados com sucesso"
- A tela mostra os novos NS

> ⚠ ALGUNS PROVEDORES PEDEM CONFIRMAÇÃO POR EMAIL. Se aparecer "Confirme via email", abre o email que veio na hora e clica no link de confirmação.

## C.2 — Aguardar propagação (1h-24h, geralmente 1-2h)

Enquanto propaga, **o site ainda mostra a plataforma anterior pra alguns usuários, e o novo SIGO pra outros** (dependendo do servidor DNS de cada um). Isso é normal.

### Como acompanhar a propagação:

#### Opção 1: navegador

- https://www.whatsmydns.net/#NS/sigoobras.com.br
- Conforme as bandeirinhas globais ficam verdes (mostram ns588/ns589), a propagação avança

#### Opção 2: terminal

```bash
nslookup -type=NS sigoobras.com.br
# Deve mostrar: ns588.hostgator.com.br + ns589.hostgator.com.br
```

Se ainda mostra outros nameservers, aguarda mais.

## C.3 — Emitir SSL Let's Encrypt no cPanel

Depois que a propagação DNS chegar (verifica acima), o cPanel pode emitir SSL gratuito automaticamente. Se não emitir sozinho em 30 min, força manualmente:

1. cPanel → busca **"SSL/TLS Status"**
2. Vai listar todos os domínios da conta com status de SSL
3. Procura `sigoobras.com.br` e `www.sigoobras.com.br`
4. Se mostrar **"AutoSSL Domain Validated"** → ✓ já está OK
5. Se mostrar **"AutoSSL Failed"** ou **"Não tem SSL"**:
   - Marca a caixinha ao lado de `sigoobras.com.br`
   - Marca também `www.sigoobras.com.br`
   - Clica em **"Executar AutoSSL"** (Run AutoSSL) no topo
   - Aguarda 1-3 min

### Resultado esperado:

- Status verde "AutoSSL Domain Validated" para ambos
- Pode levar até 10-15 min pra fluxo completo

## C.4 — Testar o site público

1. Abre uma aba **anônima** (Chrome: Ctrl+Shift+N) — pra não usar cache
2. Acessa `https://sigoobras.com.br`
3. Deve mostrar:
   - ✓ Cadeado verde de SSL ao lado da URL
   - ✓ Tela de login do SIGO Obras (não mais a plataforma anterior)
   - ✓ Header com logo / título "SIGO OBRAS"

### Teste de SPA fallback (refresh em rota interna):

1. Tente acessar uma rota direta: `https://sigoobras.com.br/financeiro`
2. Deve mostrar tela de login (porque não está logado), NÃO 404
3. Se aparecer "404 Not Found", o `.htaccess` não foi pro servidor — volta na B.4 e confere

## C.5 — Testar email

### Recebimento:

1. Manda um email de teste de um Gmail (ou outro provider) externo para `contato@sigoobras.com.br` (ou outro email que você tenha)
2. Aguarda 1-2 min
3. Acessa https://webmail.sigoobras.com.br → entra com login do email
4. Deve estar lá

### Envio:

1. No webmail, manda um teste pro seu Gmail
2. No Gmail, abre o email
3. Clica nos 3 pontinhos → **"Mostrar original"** ou **"Show original"**
4. Procura por:
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`

Se tudo PASS → ✅ configuração de email perfeita.
Se algum FAIL → revisa registros DKIM/SPF no doc DNS-CHECKLIST.

---

# 🔍 Verificações finais (5 min)

Use https://mxtoolbox.com/SuperTool.aspx (gratuito, sem login) pra confirmar:

| Teste                                             | Esperado                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `MX Lookup` sigoobras.com.br                      | Ver os MX prio 0 (Hostgator), 20 (Titan), 10 (SES bounces no send) |
| `SPF Record Lookup` sigoobras.com.br              | Resposta com `v=spf1...`                                           |
| `DKIM Lookup` resend.\_domainkey.sigoobras.com.br | Valor com `p=MIGfMA...`                                            |
| `DMARC Lookup` sigoobras.com.br                   | `v=DMARC1; p=none; rua=...`                                        |
| `DNS Lookup` sigoobras.com.br                     | IP do servidor Hostgator (108.x.x.x)                               |
| `Blacklist Check`                                 | 0 listas (todo OK)                                                 |

---

# 🧹 Limpeza pós-cutover (depois de tudo OK)

## Avisar suporte da plataforma anterior

Mande email/ticket pra suporte da plataforma anterior (`support@mocha.app` ou pelo chat do `sigoobras2.mocha.app`):

```
Olá, equipe de suporte.

Estou descontinuando o uso do app sigoobras2.mocha.app e migrando para um
sistema próprio em https://sigoobras.com.br. Solicito a REMOÇÃO do custom
hostname `sigoobras.com.br` do meu projeto (e a desativação do app, se
possível) para evitar conflitos de roteamento.

Aguardo confirmação. Obrigado.
```

## Atualizar o bot WhatsApp

O bot em `C:\Users\javer\SIGO-WHATSAPP-BOT\` aponta para a plataforma anterior:

```
LEGACY_OCR_URL=https://sigoobras2.mocha.app/api/ocr-receber-arquivo
```

Vai precisar atualizar pra apontar pra uma Edge Function do Supabase quando ela for criada. Fica como pendência da próxima fase.

---

# 🆘 Se algo der errado

| Sintoma                                                         | Diagnóstico rápido                            | Solução                                                                                |
| --------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `sigoobras.com.br` mostra "Default Page cPanel"                 | Build não chegou ao servidor                  | Confere se workflow GitHub passou; arquivo `index.html` em `public_html/sigoobras/`?   |
| Erro de SSL `ERR_CERT_AUTHORITY_INVALID`                        | Let's Encrypt ainda não emitiu                | Espera 30 min, ou força em SSL/TLS Status                                              |
| Refresh em `/financeiro` dá 404                                 | `.htaccess` ausente ou `mod_rewrite` off      | Confere `.htaccess` no `public_html/sigoobras/`; cPanel → Apache Modules → mod_rewrite |
| Email não chega                                                 | Email Routing errado, ou MX errado, ou Spam   | Confere A.5 (Local Mail Exchanger), mxtoolbox                                          |
| Email chega mas SPF/DKIM FAIL                                   | Registros DKIM/SPF errados                    | Revisa A.4 — tab da Zona Avançada                                                      |
| Login no app falha mesmo com dados certos                       | Edge Function `login-custom` ainda não existe | Esperado por enquanto. Próxima fase                                                    |
| `A plataforma anterior continua aparecendo em vez do novo site` | DNS ainda propagando                          | Espera mais; testa em aba anônima; testa em outro dispositivo/rede                     |
| `Login_FAILED` no FTP do workflow GH                            | Senha errada nos secrets                      | Reseta FTP pwd em cPanel → atualiza secret                                             |

---

# ✅ Checklist final

Quando todos esses estiverem ✅, o cutover está completo:

- [ ] sigoobras.com.br responde com o novo site (não mais a plataforma anterior)
- [ ] SSL Let's Encrypt válido
- [ ] Refresh em rotas internas funciona (sem 404)
- [ ] Email entra normalmente
- [ ] Email sai com SPF/DKIM/DMARC PASS
- [ ] Webmail acessível em `webmail.sigoobras.com.br`
- [ ] cPanel acessível em `cpanel.sigoobras.com.br`
- [ ] Suporte da plataforma anterior avisado pra remover custom hostname
- [ ] Próxima task: criar Edge Function `login-custom` no Supabase pra fluxo de login funcionar

---

**Quando você terminar até a ETAPA B (build subindo no Hostgator), me avisa que eu adianto a Edge Function de login.** A ETAPA C (cutover DNS) pode ser feita junto ou separado.
