# Supabase — backend novo do SIGO Obras

Aqui vive o backend do SIGO Obras: schema Postgres (em `migrations/`) e Edge Functions Deno (em `functions/`), que substituem as 83 functions Deno da plataforma anterior.

## Pré-requisitos

```bash
npm install -g supabase
supabase login
```

## Iniciar Supabase local

```bash
# da raiz do monorepo
supabase init        # só na primeira vez
supabase start       # sobe Postgres + Studio + Auth local em Docker
supabase db reset    # aplica todas as migrations em ordem
```

## Aplicar migrations em produção

```bash
supabase link --project-ref <ref-do-projeto>
supabase db push
```

## Status das migrations

- `0001_entities_conhecidas.sql` — 5 entities cobertas pelo snapshot inicial da plataforma anterior (Ferramenta, HistoricoDocumentoAssinado, Oportunidade, ReservaMaterial, SolicitacaoCompra). Cobertura parcial — as demais entram via `export:base44` + migrations subsequentes.

## Edge Functions

Cada subpasta de `functions/` vira um endpoint. Estrutura padrão:

```
functions/
└── login-custom/
    └── index.ts
```

Deploy:

```bash
supabase functions deploy login-custom
```
