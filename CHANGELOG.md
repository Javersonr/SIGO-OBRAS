# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e este projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- Estrutura inicial do monorepo (`apps/web`, `supabase`, `shared/sdk`, `workers`, `tools`, `legacy`)
- Backend Supabase com 100 tabelas + 19 buckets de Storage + RLS por `empresa_id`
- Wrapper `@sigoobras/sdk` compatível com `@base44/sdk` falando com Supabase
- Frontend Vite + React 18 (importado do snapshot Base44, 412 componentes)
- Workflow de CI/CD para deploy automático no Hostgator via FTP
- Documentação operacional completa: roteiros de deploy (Supabase, Hostgator, Cloudflare Pages), DNS checklist, cutover passo-a-passo
- Infraestrutura de qualidade: Conventional Commits, Prettier, EditorConfig, husky, lint-staged

### Pendente

- Edge Function `login-custom` (auth multi-empresa)
- Cutover de DNS Cloudflare → Hostgator
- Importação dos dados produtivos das ~13 empresas do Mocha/Base44

[Unreleased]: https://github.com/Javersonr/SIGO-OBRAS/commits/master
