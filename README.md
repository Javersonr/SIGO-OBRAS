<div align="center">

# SIGO Obras

**Sistema Integrado de Gestão de Obras**

ERP multi-tenant para gestão completa de obras: financeiro, compras, estoque, ferramental, RH, segurança do trabalho, projetos e CRM de oportunidades.

[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-orange)]()
[![Backend](https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Frontend](https://img.shields.io/badge/frontend-Vite%20%2B%20React-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![License](https://img.shields.io/badge/license-Proprietary-red)](./LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)

</div>

---

## 🎯 Visão geral

SIGO Obras é um ERP em produção atendendo 13+ empresas do setor de construção e serviços. Está sendo migrado de uma plataforma low-code proprietária para arquitetura própria, com:

- **Frontend**: Vite + React 18 + Tailwind + Radix UI
- **Backend**: Supabase (Postgres 17 + Auth + Storage + Edge Functions)
- **Hospedagem**: Hostgator (frontend) + Supabase Cloud (backend) + Railway (workers)
- **Multi-tenant**: isolamento por `empresa_id` via Row Level Security (RLS)

## 🏗️ Arquitetura

```
┌──────────────────────────┐         ┌───────────────────────────┐
│   Frontend (Vite+React)  │ ──HTTP─►│  Supabase Postgres + Auth │
│   sigoobras.com.br       │         │  (RLS por empresa_id)     │
│   (Hostgator)            │         │                           │
└──────────────────────────┘         └─────────────┬─────────────┘
            │                                      │
            │ Storage signed URLs                  │ pg_cron
            ▼                                      ▼
   ┌─────────────────┐                ┌────────────────────────┐
   │ Supabase Storage│                │  Edge Functions (Deno) │
   │ 19 buckets      │                │  Auth, Webhooks, OCR   │
   │ multi-tenant    │                └─────────────┬──────────┘
   └─────────────────┘                              │
                                                    │ Jobs
                                                    ▼
                                       ┌────────────────────────┐
                                       │   Workers (Railway)    │
                                       │   IA pesada, OCR batch │
                                       └────────────────────────┘
```

## 📁 Estrutura do monorepo

```
sigoobras-base/
├── apps/
│   └── web/                  # Frontend Vite + React (sigoobras.com.br)
├── supabase/
│   ├── migrations/           # 15 migrations, 100 tabelas, RLS habilitada
│   ├── functions/            # Edge Functions Deno (em construção)
│   ├── config.toml
│   └── README.md
├── shared/
│   ├── sdk/                  # @sigoobras/sdk — cliente unificado contra Supabase
│   └── types/                # TypeScript types gerados do schema (futuro)
├── workers/                  # Workers Railway (OCR pesado, IA batch)
├── legacy/                   # Snapshot da plataforma anterior (somente referência)
├── tools/                    # Scripts utilitários
│   ├── export-base44.mjs     # Export do dump da plataforma anterior (100 entidades)
│   └── seed-from-xlsx.mjs    # Seed do backup multi-empresa
├── docs/                     # Documentação operacional → ver docs/README.md
├── .github/
│   ├── workflows/            # CI (lint/build/tests) + deploy automático
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── dependabot.yml
└── .husky/                   # Git hooks (commit-msg, pre-commit)
```

## 🚀 Quick start

### Pré-requisitos

- Node.js **20+** (use `.nvmrc`)
- npm **10+**
- Supabase CLI (`npm i -g supabase`)
- (opcional) Docker Desktop para `supabase start` local

### Instalação

```bash
# Clone
git clone https://github.com/Javersonr/SIGO-OBRAS.git
cd SIGO-OBRAS

# Instala devDeps da raiz (husky, commitlint, prettier)
npm install

# Instala deps de cada workspace
npm install --workspaces

# Hooks Git são instalados automaticamente via 'prepare' script
```

### Frontend em dev

```bash
# Configure env vars
cp apps/web/.env.example apps/web/.env.local
# (a anon key do Supabase já está no .env.example)

# Roda em http://localhost:5173
npm run dev
```

### Backend Supabase

```bash
# Aplicar migrations no projeto remoto (já linkado em supabase/config.toml)
npm run supabase:db:push

# OU local com Docker (mais lento, mas sandbox completo)
npm run supabase:start
```

## 📚 Documentação

Toda a documentação operacional está em [`docs/`](./docs/README.md):

| Documento                                                       | Descrição                                        |
| --------------------------------------------------------------- | ------------------------------------------------ |
| [ROADMAP.md](./docs/ROADMAP.md)                                 | 9 fases da migração, com checkboxes de progresso |
| [SCHEMA.md](./docs/SCHEMA.md)                                   | Inventário das 100 entidades por domínio         |
| [DEPLOY-SUPABASE.md](./docs/DEPLOY-SUPABASE.md)                 | Setup do backend hosted                          |
| [DEPLOY-HOSTGATOR.md](./docs/DEPLOY-HOSTGATOR.md)               | Deploy do frontend (oficial)                     |
| [DEPLOY-CLOUDFLARE-PAGES.md](./docs/DEPLOY-CLOUDFLARE-PAGES.md) | Alternativa de deploy                            |
| [DNS-CHECKLIST-HOSTGATOR.md](./docs/DNS-CHECKLIST-HOSTGATOR.md) | Migração DNS sem quebrar email                   |
| [CUTOVER-PASSO-A-PASSO.md](./docs/CUTOVER-PASSO-A-PASSO.md)     | Guia operacional clique-a-clique                 |
| [MIGRATION-CHECKLIST.md](./docs/MIGRATION-CHECKLIST.md)         | Acessos, credenciais, decisões                   |

## 🧰 Scripts disponíveis

```bash
# Desenvolvimento
npm run dev               # frontend em watch mode
npm run build             # build de produção
npm run preview           # preview do build

# Qualidade
npm run lint              # ESLint em apps/web
npm run lint:fix          # ESLint com auto-fix
npm run typecheck         # TypeScript check
npm run format            # Prettier em tudo
npm run format:check      # só checa, não modifica

# Supabase
npm run supabase:start    # ambiente local com Docker
npm run supabase:status   # status do ambiente local
npm run supabase:db:push  # aplica migrations no remoto
npm run supabase:db:reset # zera DB local
npm run supabase:functions:serve  # roda Edge Functions local
npm run supabase:functions:deploy # deploy Edge Functions
npm run supabase:types    # gera TS types a partir do schema

# SDK
npm run sdk:test          # smoke test do @sigoobras/sdk

# Data
npm run export:base44     # exporta todas as 100 entidades da plataforma anterior
npm run seed:from-xlsx    # importa backup_todas_empresas.xlsx
```

## 🤝 Contribuindo

Antes de abrir PR, leia [CONTRIBUTING.md](./CONTRIBUTING.md). Resumo:

- **Conventional Commits** obrigatório (validado por commitlint no commit-msg hook)
- **Prettier** rodando em pre-commit via lint-staged
- **CI verde** antes de revisar PR
- **Squash merge** ao aprovar

## 🔒 Segurança

Vulnerabilidades: **NÃO** abra issue pública. Leia [SECURITY.md](./SECURITY.md) e envie email privado.

## 📊 Status do projeto

- ✅ Backend Supabase: 100 tabelas + RLS + 19 buckets
- ✅ SDK unificado (`@sigoobras/sdk`) com a API esperada pelo frontend
- ✅ CI/CD configurado
- 🔄 Edge Function `login-custom` (em construção)
- 🔄 Cutover de DNS para Hostgator (em planejamento)
- 🔄 Importação dos dados produtivos (aguardando)

Ver [ROADMAP.md](./docs/ROADMAP.md) para detalhes.

## 📜 Licença

Software proprietário. Ver [LICENSE](./LICENSE).

## 👥 Contato

- **Autor**: Javerson Rodrigues
- **Email**: javersonr@gmail.com
- **Issues**: https://github.com/Javersonr/SIGO-OBRAS/issues
