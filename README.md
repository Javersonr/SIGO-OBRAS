# SIGO Obras

ERP de gestão de obras — migração de Base44 para Supabase + Hostgator.

## Estrutura do monorepo

```
.
├── apps/
│   └── web/              # Frontend Vite + React (atual, ainda fala com Base44)
├── supabase/
│   ├── migrations/       # Schema SQL versionado
│   └── functions/        # Edge Functions Deno (substituem as Base44 functions)
├── workers/              # Workers de longa duração (IA pesada, OCR batch) → Railway
├── shared/
│   ├── sdk/              # Wrapper que vai substituir @base44/sdk no frontend
│   └── types/            # Tipos compartilhados (gerados do schema Supabase)
├── legacy/
│   └── base44/           # Código original Base44 (entities + 83 functions) — REFERÊNCIA, não rode
├── tools/
│   └── export-base44.mjs # Script para exportar todos os dados do Base44
└── docs/
    ├── ROADMAP.md
    ├── SCHEMA.md
    └── MIGRATION-CHECKLIST.md
```

## Status atual da migração

Ver [docs/ROADMAP.md](./docs/ROADMAP.md) e [docs/MIGRATION-CHECKLIST.md](./docs/MIGRATION-CHECKLIST.md).

**Próximo passo bloqueante:** rodar `npm run export:base44` para baixar TODAS as entidades e arquivos do Base44 (apenas 5 das ~30 estão documentadas no snapshot atual).

## Rodar frontend localmente

```bash
cd apps/web
npm install
# crie apps/web/.env.local com VITE_BASE44_APP_ID e VITE_BASE44_APP_BASE_URL
npm run dev
```

(Por enquanto, ainda usa o backend Base44. Depois da Fase 4 da migração, passará a usar o Supabase via wrapper em `shared/sdk`.)
