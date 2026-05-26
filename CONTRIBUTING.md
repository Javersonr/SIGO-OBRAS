# Contribuindo com o SIGO Obras

Obrigado por contribuir! Esse documento descreve nosso fluxo de trabalho e padrões.

## Setup do ambiente

```bash
# Pré-requisitos: Node 20 (use .nvmrc), npm 10+
nvm use   # se você usa nvm

# Instalação
git clone https://github.com/Javersonr/SIGO-OBRAS.git
cd SIGO-OBRAS
npm install   # instala devDeps da raiz (husky, prettier, commitlint)
npm install --workspaces  # instala deps de cada workspace

# Frontend em dev
npm run dev   # roda apps/web em http://localhost:5173

# Supabase local (opcional, requer Docker)
npx supabase start
```

## Fluxo de branches

- `master` — produção. Apenas via PR aprovado.
- `feat/<nome-curto>` — novas features.
- `fix/<descrição>` — correções de bug.
- `chore/<descrição>` — refatoração, ferramental, sem mudança de comportamento.
- `docs/<tópico>` — só documentação.

## Conventional Commits (obrigatório)

Mensagens de commit DEVEM seguir [Conventional Commits 1.0.0](https://www.conventionalcommits.org/):

```
<tipo>(<escopo opcional>): <descrição curta no imperativo>

<corpo opcional explicando o porquê>

<footer opcional: BREAKING CHANGE, Refs #N, Co-Authored-By>
```

### Tipos aceitos

- `feat` — nova funcionalidade
- `fix` — correção de bug
- `docs` — só documentação
- `style` — formatação, sem mudança de código
- `refactor` — refatoração sem mudar comportamento
- `perf` — melhoria de performance
- `test` — adição ou ajuste de testes
- `build` — sistema de build, deps, etc.
- `ci` — workflows GitHub Actions
- `chore` — tarefas auxiliares, sem afetar src
- `revert` — desfaz um commit anterior

### Exemplos

```
feat(financeiro): adiciona conciliação automática de extratos OFX
fix(auth): corrige expiração do token de convite
docs(deploy): atualiza checklist DNS após cutover Mocha → Hostgator
refactor(sdk): extrai query builder em módulo separado
chore(deps): atualiza supabase-js para 2.46.0
```

O `commitlint` no `commit-msg` hook valida automaticamente. Mensagem fora do padrão é rejeitada antes do commit ser criado.

## Formatação automática

Antes de cada commit, `lint-staged` roda Prettier nos arquivos modificados. Para rodar manualmente:

```bash
npm run format        # formata tudo
npm run format:check  # só checa, não modifica
npm run lint          # ESLint em apps/web
```

## Pull Requests

1. Crie a branch a partir de `master` atualizada.
2. Faça commits semânticos.
3. Abra o PR usando o template (preenchido automaticamente).
4. CI roda lint + build em PRs — espere ficar verde.
5. Marque um revisor (padrão: `@Javersonr`).
6. Squash merge ao aprovar (mantém histórico limpo em master).

## Estrutura do monorepo

```
sigoobras-base/
├── apps/web/         # Frontend Vite + React (produção)
├── supabase/         # Backend: migrations SQL + Edge Functions
├── shared/sdk/       # @sigoobras/sdk — wrapper compatível com @base44/sdk
├── workers/          # Workers de longa duração (Railway)
├── legacy/base44/    # Código original Base44 — REFERÊNCIA, não rode
├── tools/            # Scripts utilitários (export, seed)
├── docs/             # Documentação operacional
└── .github/          # CI/CD, templates, dependabot
```

## Dúvidas?

Abra uma [Discussion](https://github.com/Javersonr/SIGO-OBRAS/discussions) ou mande um email para javersonr@gmail.com.
