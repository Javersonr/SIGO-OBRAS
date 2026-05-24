# Roadmap de migração — SIGO Obras

**Origem:** App Base44 em produção (Vite/React + 83 functions Deno + entidades + auth + storage proprietários)
**Destino:** Frontend em Hostgator (`sigoobras.com.br`), backend em Supabase (DB + Auth + Storage + Edge Functions), workers pesados em Railway.

## Estimativa total

8 a 12 semanas de trabalho focado.

## Fases

### Fase 0 — Setup do monorepo  ✅ (em andamento)

- [x] Reorganizar código em monorepo (`apps/web`, `supabase`, `workers`, `shared`, `legacy`, `tools`, `docs`)
- [x] `package.json` raiz com workspaces
- [x] `.gitignore` raiz
- [ ] `git init` + commit inicial

### Fase 1 — Schema completo + dados

**Bloqueador:** exportar tudo do Base44.

- [ ] Rodar `tools/export-base44.mjs` (precisa de admin Base44)
- [ ] Inferir schema completo a partir do dump (~30 entities)
- [ ] Escrever migrations Supabase em ordem topológica
- [ ] Habilitar RLS em todas as tabelas, filtrando por `empresa_id` do JWT
- [ ] Importar dados de staging
- [ ] Validar integridade referencial

### Fase 2 — Auth

Migrar auth customizado (`UsuarioCustom` + `UsuarioEmpresa` + `ClientePortalUsuario`) para Supabase Auth + tabelas de perfil.

- [ ] Migrar `loginCustom` → Supabase Auth (provider `email`)
- [ ] Recriar fluxo de convites (`convidarUsuario`, `validarTokenConvite`, `concluirPrimeiroAcesso`)
- [ ] Recriar reset de senha (`solicitarResetSenha`, `redefinirSenha`)
- [ ] Manter hierarquia super_admin → GrupoEmpresarial (holding) → Empresa → UsuarioEmpresa → ClientePortalUsuario
- [ ] Política de hash: Supabase Auth usa bcrypt — durante dual-write, manter `senha_hash` (SHA-256) sincronizado

### Fase 3 — Wrapper SDK (`shared/sdk`)

Wrapper compatível com `@base44/sdk` falando com Supabase. Permite migração gradual.

- [ ] Implementar `base44.entities.<X>.filter/find/create/update/delete`
- [ ] Implementar `base44.entities.<X>.list` com paginação
- [ ] Implementar `base44.functions.<X>.invoke()` chamando Edge Functions
- [ ] Implementar `base44.auth.*` mapeando para Supabase Auth
- [ ] Testes: rodar uma página existente com o wrapper

### Fase 4 — Edge Functions leves (~60)

Portar functions Deno do Base44 para Supabase Edge Functions (também Deno → mudança mínima).

- [ ] 18 functions de auth (loginCustom, alterarSenha, etc.)
- [ ] ~20 functions CRUD/RPC (criarPreLancamento, conciliarLancamento, etc.)
- [ ] 3 webhooks (Asaas, Assinafy, WhatsApp — fase rápida)
- [ ] ~6 functions de email (Resend ou SMTP)
- [ ] Functions de geração simples (PDF, Excel pequenos)

### Fase 5 — Crons (~8)

- [ ] `dispararAlertas`
- [ ] `processarRecorrencias`
- [ ] `notificarEstoqueBaixo`
- [ ] `notificarManutencoesVencendo`
- [ ] `verificarTarefasVencendo`, `verificarDocumentosRH`, `verificarManutencoesPendentes`, `verificarMateriaisReserva`

Implementação: `pg_cron` chamando Edge Functions.

### Fase 6 — Workers pesados (~12)

Deploy no Railway (aproveita o `SIGO-WHATSAPP-BOT` existente como base).

- [ ] Tabela `worker_jobs` no Supabase
- [ ] `processarPDFsComGemini`, `processarCertificadosComIA`, `importarCertificadosFuncionario`
- [ ] `analisarCertificadoComGemini`, `analisarDocumentoSeguranca`
- [ ] `buscarFerramentaPorFoto`, `extrairDadosComprovante`
- [ ] `validarFotoComGemini`, `validarFotoComIA`

### Fase 7 — Frontend deploy no Hostgator

- [ ] `npm run build` no `apps/web`
- [ ] Upload `dist/` para `public_html/` via FTP/cPanel
- [ ] `.htaccess` com SPA fallback
- [ ] SSL Let's Encrypt + HTTPS forçado
- [ ] Configurar CORS no Supabase para `https://sigoobras.com.br`
- [ ] Smoke test no domínio

### Fase 8 — Migração de dados produção

Estratégia: **dual-write** durante ~1 semana.

- [ ] Wrapper SDK passa a escrever em Base44 E Supabase
- [ ] Job de reconciliação compara os dois lados, loga divergências
- [ ] Cutover de LEITURA: frontend lê do Supabase, escreve nos dois
- [ ] Cutover de ESCRITA: para de escrever no Base44
- [ ] Janela de monitoramento de 1 semana
- [ ] Desliga Base44

### Fase 9 — Pós-cutover

- [ ] Monitoramento contínuo (Supabase logs, Sentry no frontend)
- [ ] Backup automatizado do Postgres
- [ ] Documentar runbook de incidentes
- [ ] Apagar `legacy/base44/` (após 2 semanas estáveis)

## Riscos principais

| Risco | Mitigação |
|---|---|
| Entities não documentadas no zip | Fase 1 bloqueante: rodar `tools/export-base44.mjs` com admin Base44 |
| Storage Base44 (comprovantes, certificados) | Script de export baixa todos os arquivos referenciados |
| Senha dual-write (SHA-256 vs bcrypt) | Fase 2: rehash transparente no próximo login |
| Limites Hostgator shared | Tudo dinâmico vai pro Supabase/Railway — Hostgator só serve estáticos |
| CORS / cookies cross-domain | Configurar Allowed Origins no Supabase desde a Fase 0 |
