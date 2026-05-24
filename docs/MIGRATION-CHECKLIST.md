# Checklist operacional de migração

Lista de coisas práticas — credenciais, contas, decisões — que precisam estar prontas antes de avançar nas fases técnicas.

## Contas / acessos

- [ ] Login admin Base44 (para rodar `tools/export-base44.mjs` e cutover)
- [ ] Projeto Supabase criado (região recomendada: **São Paulo** para latência BR)
- [ ] Service Role Key do Supabase guardada em local seguro (1Password / cofre)
- [ ] Conta Hostgator com plano que suporte:
  - [ ] Domínio `sigoobras.com.br` já apontando para a hospedagem
  - [ ] SSL Let's Encrypt instalado
  - [ ] `.htaccess` permitido (qualquer plano shared serve)
- [ ] Conta Railway (workers pesados) — já existe pela pasta `.railway` do usuário
- [ ] GitHub repo (privado) para o monorepo

## Credenciais de integrações (a transferir para Supabase Secrets)

- [ ] **Meta WhatsApp Business:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `VERIFY_TOKEN_META`
- [ ] **OpenAI:** `OPENAI_API_KEY`
- [ ] **Google Gemini:** `GOOGLE_AI_API_KEY` (ou `GEMINI_API_KEY`)
- [ ] **Asaas:** `ASAAS_API_KEY` (sandbox e prod separadas)
- [ ] **Assinafy:** `ASSINAFY_API_KEY`, `ASSINAFY_ACCOUNT_ID`
- [ ] **SMTP / Resend:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` ou `RESEND_API_KEY`
- [ ] Possivelmente **Focus NFe:** `FOCUSNFE_API_KEY`
- [ ] Possivelmente **Stripe:** chaves (vi `@stripe/react-stripe-js` no package.json — confirmar uso)

## Decisões pendentes

- [ ] Nome do projeto Supabase (`sigoobras-prod`? `sigo-obras`?)
- [ ] Subdomínio do Supabase Auth ou usar Hostgator (`auth.sigoobras.com.br`?)
- [ ] Domínio de Edge Functions (`api.sigoobras.com.br` via CNAME para `*.supabase.co`?)
- [ ] Estratégia de cutover: dual-write 1 semana **(recomendado)** vs janela de manutenção
- [ ] Por qual módulo começar a cutover? Sugestão: **Financeiro** (já tem bot WhatsApp e é o mais visível)
- [ ] Stripe está mesmo em uso? Se não, podemos remover do `package.json`
- [ ] Migrar bot WhatsApp para dentro do monorepo (`workers/whatsapp-bot`) ou manter como repo separado?

## Antes de cada fase

### Fase 1
- [ ] Backup completo do Base44 (snapshot além do export do script)
- [ ] Confirmar que `tools/dump/` não vai pro git (já está no `.gitignore`)

### Fase 7 (deploy Hostgator)
- [ ] Definir build target Vite (default `es2020` deve servir)
- [ ] Configurar variáveis de produção (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] Adicionar `https://sigoobras.com.br` em Allowed Origins do Supabase

### Fase 8 (cutover)
- [ ] Avisar usuários sobre janela de instabilidade
- [ ] Ter rollback documentado (DNS pode voltar pra Base44 em <5min)
