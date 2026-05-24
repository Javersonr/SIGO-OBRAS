# Supabase — backend novo do SIGO Obras

Aqui vive o novo backend: schema Postgres (em `migrations/`) e Edge Functions Deno (em `functions/`) que substituem as 83 functions do Base44.

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

- `0001_entities_conhecidas.sql` — 5 entities que temos no snapshot Base44 (Ferramenta, HistoricoDocumentoAssinado, Oportunidade, ReservaMaterial, SolicitacaoCompra). Cobertura PARCIAL — precisa rodar `export:base44` para descobrir as outras.

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
