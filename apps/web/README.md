# @sigoobras/web

Frontend SIGO Obras — SPA Vite + React 18 servida em `https://sigoobras.com.br`.

## Stack

- Vite 6 + React 18 + react-router-dom 6
- Tailwind CSS + Radix UI + lucide-react
- `@tanstack/react-query` para cache de dados
- Wrapper SDK `@sigoobras/sdk` (Supabase por baixo) — em rollout gradual

## Setup local

```bash
# da raiz do monorepo
npm install --workspaces

# variáveis de ambiente
cp apps/web/.env.example apps/web/.env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# dev server em http://localhost:5173
npm run dev
```

## Scripts

| Script              | O que faz                            |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Vite dev server com HMR              |
| `npm run build`     | Build de produção (gera `dist/`)     |
| `npm run preview`   | Servidor estático servindo o `dist/` |
| `npm run lint`      | ESLint (quiet)                       |
| `npm run lint:fix`  | ESLint com auto-fix                  |
| `npm run typecheck` | `tsc -p ./jsconfig.json`             |

## Build de produção

```bash
npm run build
# dist/ é o que sobe pro Hostgator (ver docs/DEPLOY-HOSTGATOR.md)
```

- Minify: Terser, removendo `console.log/info/debug` em produção (mantém `error` e `warn`).
- Source maps: gerados em dev/staging, omitidos em produção.
- Aviso de chunk: 600 KB (Radix UI faz estourar o default de 500).

## Roteamento e SPA fallback

App é SPA com `react-router-dom`. O `public/.htaccess` redireciona todas as rotas inexistentes para `index.html` (sem isso, F5 numa rota interna retorna 404 no Hostgator).

## Estrutura

```
apps/web/
├── public/
│   ├── .htaccess        # SPA fallback + HTTPS + cache + headers
│   ├── favicon.svg
│   └── manifest.json
├── src/
│   ├── api/             # Cliente SDK (em transição p/ @sigoobras/sdk)
│   ├── components/      # Componentes por domínio (financeiro/, ferramental/, ...)
│   ├── pages/           # Rotas top-level
│   ├── lib/             # Helpers
│   ├── Layout.jsx       # Shell autenticado
│   └── main.jsx
├── index.html
├── vite.config.js
└── package.json
```

Mais contexto: [`../../docs/`](../../docs/README.md).
