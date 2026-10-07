# AGENTS.md — SIGO Obras

Instruções para agentes de código (Codex/ChatGPT e outros) que trabalham neste repositório. Valem para o repositório
inteiro. Em caso de conflito com outro documento de `docs/`, este arquivo e o código vencem.

## O que é o projeto

ERP multiempresa (obras, compras, estoque, RH/SST, financeiro, oportunidades, treinamentos EAD) **em produção** em
https://www.sigoobras.com.br. Monorepo npm workspaces:

| Pasta                            | Conteúdo                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/`                      | Front: Vite 6 + React 18 + Tailwind + Radix/shadcn, **JavaScript** (não TypeScript)            |
| `apps/web/src/pages/`            | Uma página por arquivo; rota = `/<NomeDoArquivo>` (registrada em `src/pages.config.js`)        |
| `apps/web/src/components/`       | Telas por domínio (`seguranca/`, `financeiro/`, `portal-funcionario/`...); `ui/` = shadcn      |
| `apps/web/src/lib/`              | Funções puras + testes `*.test.js` ao lado; helpers de anexo, PDF, formatação                  |
| `apps/web/src/api/sigoClient.js` | Único ponto de contato do front com o backend                                                  |
| `shared/sdk/`                    | `@sigoobras/sdk`: proxy de entidades sobre `supabase-js`                                       |
| `supabase/migrations/`           | SQL `NNNN_descricao.sql` (4 dígitos), aplicadas à mão em produção                              |
| `supabase/functions/`            | Edge Functions Deno (`<nome>/index.ts`) + código comum em `_shared/`                           |
| `tools/`                         | Scripts avulsos; vários gravam em produção (ver regras)                                        |
| `docs/`                          | Documentação; `docs/superpowers/{specs,plans}` é a parte viva; handoffs em `docs/HANDOFF-*.md` |
| `legacy/`                        | Snapshot da plataforma antiga (Base44): só referência                                          |

Idioma do projeto: **português do Brasil** (textos de tela, comentários, commits, docs).

## Regras inegociáveis

1. **Nenhum comando que fale com produção** (nem só para ler). Regra geral: nada com `--linked` ou `--project-ref`;
   nenhum `npm run supabase:*` nem `npm run sdk:test`; nenhum `git push`, `gh pr create`, `gh pr merge`,
   `gh workflow run` ou `gh release`; nenhum script de `tools/`. Exemplos (a lista não é completa):
   `supabase db query --linked` (nem para `SELECT`), `supabase db push`, `supabase functions deploy`,
   `supabase secrets set`, `supabase storage ...`, `tools/ead-sync-cursos.py`, `tools/create-super-admin.mjs`,
   `tools/import-dump.mjs`, `tools/seed-from-xlsx.mjs`, `tools/*.sql`, `tools/conector/*`. Deixe os comandos prontos na
   descrição do commit para o Javerson executar. Precisa de um dado de produção? Peça a consulta ao Javerson.
2. **`npm run dev` usa o banco de PRODUÇÃO** (não existe projeto Supabase de teste): o agente não faz login, não cria,
   não altera e não apaga nada por ele. Teste manual é do Javerson (roteiro da seção 7 de
   `docs/HANDOFF-PORTAL-TREINAMENTO.md`). Teste a lógica com Vitest/`node --test` e dados sintéticos.
3. **Branch e pasta:** push em `master` publica o site (workflow `deploy-hostgator.yml`), e `master` não tem proteção.
   Trabalhe numa branch própria (`codex/tNN-tema`), num clone ou worktree separado, nunca no checkout principal nem com
   commit em `master`. Não faça push nem abra PR: a entrega é o commit na branch, e o merge é do Javerson.
4. **Migrações:** sempre arquivo novo (nunca edite migração já existente), idempotente, terminando em
   `select 'ok' as res;`, com cabeçalho em português explicando o porquê. Número = próximo livre. Situação em 05/10:
   `0125`–`0129` reservados (branch `fix/financeiro-auditoria-2026-09`; o `0127` também é do plano do Orçamento),
   `0130` = integridade do EAD, `0131` = cadastro integrado de treinamentos, `0132` = pastas dos Arquivos (as três já
   aplicadas) e `0133` reservado ao cronograma físico-financeiro. Use `0134` em diante **e confirme o número com o
   Javerson** antes do commit. Antes de numerar, confira `ls supabase/migrations`,
   `git ls-tree -r --name-only <branch> supabase/migrations` de cada branch e as reservas escritas em
   `docs/superpowers/{specs,plans}`. Quem aplica é
   o Javerson, com `supabase db query --linked -f <arquivo.sql>`. **Nunca `db push`.**
5. **Multiempresa:** toda tabela de negócio tem `empresa_id uuid not null`; RLS compara com `current_empresa_id()`
   (lido do `app_metadata` do JWT). Coluna nova que aponta para outra tabela de negócio ganha o trigger
   `referencias_da_empresa` (migração `0118`).
6. **Edge Functions:** a identidade do chamador vem **só** do JWT (usuário SIGO) ou do token do portal. Nunca confie em
   `empresa_id`, e-mail, perfil ou `funcionario_id` vindos do corpo. Service role ignora a RLS: filtre toda consulta pela
   empresa do chamador.
7. **Anexos:** grave no banco a referência `"bucket/caminho"` (`res.ref` / `refDoUpload(res)`, com `refDoUpload`
   importado de `@/lib/anexo-ref`), nunca `file_url` (URL assinada que expira). URL com `base44` é arquivo perdido.
8. **Escopo:** mexa só nos arquivos da tarefa. Outras pessoas e agentes trabalham no mesmo repositório (há worktrees e
   branches ativas). Viu um problema fora do escopo? Anote na descrição, não corrija.
9. **Commits:** `git add <caminhos explícitos>` (nunca `git add -A`/`-a`), um commit por tarefa, commit novo (sem
   `--amend`), sem `--no-verify`, sem `--force`. Confira `git status` e `git diff --staged` antes.
10. **Repositório público:** nunca escreva segredo (chave, token, senha, service role, URL assinada), UUID de empresa ou
    dado pessoal (nome de funcionário/cliente, CPF, telefone, e-mail) em código, teste, doc ou mensagem de commit. Não
    leia `.env*`. Use dados sintéticos nos testes.

## Comandos (na raiz; Git Bash ou PowerShell 7+)

| Objetivo                                | Comando                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Instalar                                | `npm install` (o CI usa `npm ci`; mantenha o `package-lock.json` em dia)      |
| Front em dev (http://localhost:5173)    | `npm run dev` — precisa de `apps/web/.env.local`; **fala com produção**       |
| Build                                   | `npm run build` (gera `apps/web/dist`)                                        |
| Lint (só erros)                         | `npm run lint`                                                                |
| Lint com `no-undef` (ver a nota abaixo) | `cd apps/web && npx eslint --rule "no-undef: error" <arquivos>`               |
| Formato                                 | `npm run format:check` / `npx prettier --write <arquivos>`                    |
| Testes do front (Vitest)                | `npm test --workspace=apps/web` ou `cd apps/web && npx vitest run <arquivo>`  |
| Testes das Edge Functions               | `node --test "supabase/functions/**/*.test.ts"` (Node >= 23.6; aspas no glob) |

- No Windows PowerShell 5.1 (o do PC do Javerson), `&&` dá erro de sintaxe: troque `&&` por `;`.
- **Não rode `npx vitest` na raiz.** A raiz não tem config do Vitest: ali ele pega os `supabase/functions/**/*.test.ts`
  (que são `node:test`) e as cópias em `.claude/worktrees/`, e roda sem o alias `@`. Use sempre
  `npm test --workspace=apps/web` ou `cd apps/web && npx vitest run <arquivo>`.
- **`no-undef`:** é obrigatório nos arquivos alterados de `src/components`, `src/pages` e `src/Layout.jsx`, com caminho
  relativo a `apps/web` (ex.: `src/components/seguranca/X.jsx`; com `apps/web/src/...` nenhum arquivo é encontrado).
  `src/lib` fica fora da config do ESLint (roda sem os globais do navegador e dá falso erro em `document`, `window`,
  `setTimeout`): ali quem cobre é o teste.
- Node: `.nvmrc` = 20; CI em Node 22, exceto o job `test`, que usa Node 24. Os testes `.ts` das Edge Functions
  precisam de Node >= 23.6 (type stripping); no Node 22.6+ use `node --experimental-strip-types --test ...`. Não há Deno
  instalado no PC do Javerson.
- Scripts que **não** devem ser usados (regra 1): todos os `npm run supabase:*` (por exemplo,
  `supabase:functions:deploy` publica todas as funções sem `--no-verify-jwt` e quebra os portais, e `supabase:types`
  usa `--linked`) e `npm run sdk:test` (por padrão vai ao projeto de produção).
- `npm run format:check` local acusa arquivos não versionados (`.superpowers/`, `.impeccable/`); confira só os seus
  arquivos com `npx prettier --check <arquivos>`.

## CI, hooks e commits

- `.github/workflows/ci.yml` (push e PR para `master`): Prettier no repositório todo, ESLint de `apps/web`, build, smoke
  do SDK (só com secrets), checagem de migração vazia e o job `test` (Vitest de `apps/web` e `node --test` das Edge
  Functions, ambos exigidos pelo "CI Success"). Rode os dois à mão antes de entregar: o CI só avisa depois do PR.
- `.github/workflows/deploy-hostgator.yml`: push em `master` que toque `apps/web/**`, `shared/sdk/**` ou o próprio
  workflow publica o site (FTP com `--delete`); também há disparo manual (`workflow_dispatch`, ou seja,
  `gh workflow run`). Merge de PR em `master` é push. Mudança só em `supabase/`, `docs/` ou `tools/` não publica o site.
- Husky: `pre-commit` roda `lint-staged` (só `prettier --write` nos arquivos em stage); `commit-msg` roda commitlint.
  Ambos usam `npx --no`, então exigem `node_modules` instalado.
- commitlint (`commitlint.config.cjs`): Conventional Commits, tipos `feat`, `fix`, `docs`, `style`, `refactor`,
  `perf`, `test`, `build`, `ci`, `chore`, `revert`; escopo livre e opcional; assunto até 100 caracteres, cabeçalho até
  120, corpo e rodapé até 200 por linha; linha em branco antes do corpo e do rodapé. Mensagem em português, no imperativo, corpo explicando o porquê.
  Exemplo: `fix(ead): lista de presença usa a empresa ativa`.
- Rodapé de autoria: use o que o Javerson indicar; não copie o rodapé de outro agente/modelo.
- Tudo em **LF** (`.gitattributes`). Prettier: 100 colunas, aspas duplas, `trailingComma: es5`; `.md` com 120 colunas
  e tabelas realinhadas (rode `npx prettier --write` em todo `.md` novo).

## Banco (`supabase/migrations`)

- Padrão de tabela: `id uuid primary key default gen_random_uuid()`, `empresa_id`, `created_at`, `updated_at` (trigger
  `set_updated_at`/`attach_updated_at_trigger`), `deleted_at` (exclusão lógica). RLS: `select apply_tenant_rls('t');`.
- Tabela só do servidor: RLS ligada, sem policy, `revoke` de `anon`/`authenticated`. Escrita "só servidor" com trigger
  `security definer` que deixa passar `chamador_eh_servidor()` e `current_user_is_super_admin()` (modelos: `0119`,
  `0130`).
- RPC `security definer`: `set search_path = public`, `revoke all ... from public, anon, authenticated`,
  `exigir_empresa_do_chamador(...)` no início e `grant execute on function ... to authenticated, service_role` (só
  `service_role` se a função for só do servidor), como na migração `0110` (`:1264-1268`). Sem o `grant`, o front não
  consegue chamar a RPC.
- `jsonb` vindo do legado pode ser string: use `public.jsonb_to_array()` antes de tratar como lista.
- Permissão fina no banco: `public.tem_permissao(modulo, aba, funcao)` (0147, espelho do `temPermissaoServidor`). Nas
  tabelas do EAD o trigger `zz_permissao_ead` tem de ser o ÚLTIMO trigger BEFORE (ordem alfabética: ele confere a
  linha como vai ser gravada); não crie trigger com nome depois de `zz_` nelas.
- Teste de banco: script em `tools/smoke-*.sql` dentro de `begin; ... rollback;` (modelo:
  `tools/smoke-compras-aprovacao.sql`). Quem roda é o Javerson.

## Edge Functions (`supabase/functions`)

- Esqueleto: `Deno.serve(withCors(async (req) => { ... }))`, só `POST`, respostas `ok({...})` / `fail(msg, status)`
  (`_shared/cors.ts`), cliente `createAdminClient()` (`_shared/supabase-admin.ts`). CORS por lista de origens em
  `_shared/cors.ts`.
- Usuário do SIGO: `usuarioDaRequisicao` / `getCallerFromJWT`; permissão fina no servidor:
  `temPermissaoServidor(vinculo, modulo, aba, funcao)` (`_shared/conector/acesso.ts`).
- **Regra de negócio em módulo puro** (`*-regras.ts`, `*-nucleo.ts`, sem `Deno.*` e sem import de URL, banco/fetch
  injetados) com teste `*.test.ts` ao lado (`node:test` + `node:assert/strict`, import com extensão `.ts`). O `index.ts`
  só liga rede e banco; ele não é importável no Node.
- Deploy (só o Javerson): `npx supabase@2.118.0 functions deploy <nome> --project-ref <ref> --no-verify-jwt --use-api`.
  **`ia-processar`, `saas-config` e `validar-certificado` vão SEM `--no-verify-jwt`.** O deploy leva a árvore de
  trabalho de `_shared/` inteira. Função nova: registre em `SUPABASE_FUNCTIONS_REWRITE` (`apps/web/src/api/sigoClient.js`).

## Front (`apps/web/src`)

- Backend só por `import { sigo, supabase } from "@/api/sigoClient"`.
- Entidades: `sigo.entities.<Entidade>` (PascalCase → tabela snake_case, ex. `TreinamentoCurso` →
  `treinamento_curso`): `filter(criterio, opts)`, `list`, `get`, `create`, `bulkCreate` (um INSERT só; fatie lotes e use
  o mesmo conjunto de chaves), `update` (**lança** se a linha não existe ou a RLS barra), `delete`/`deleteMany`
  (**lógico**: grava `deleted_at`; critério vazio lança), `restore`, `count`. Toda leitura soma `deleted_at is null`;
  tabela sem `deleted_at` exige `{ includeDeleted: true }`. Não há `updateMany`, `upsert` nem transação: use RPC.
- `sigo.functions.invoke(nome, payload)` **não lança**: confira `data.success === false` e `data.error`.
- `supabase` (export nomeado) é o `supabase-js` bruto, para Storage e `rpc`. Upload:
  `refDoUpload(await sigo.integrations.Core.UploadFile({ file, bucket: "..." }))` (sempre passe `bucket`), com
  `refDoUpload` importado de `@/lib/anexo-ref`; exibição com `resolveStorageUrl(ref)` (de `@/api/sigoClient`),
  `<AnexoViewer>` ou `<ImgStorage>`.
- Empresa e permissão: `const { empresaAtiva, temPermissao, perfil, user } = useEmpresa()` importando de `@/Layout`
  (não de `@/lib/layout-context`). Toda criação leva `empresa_id: empresaAtiva.id`. `usePermission()`,
  `<PermissionGate modulo aba funcao>` e `temPermissao(modulo, aba, funcao)` são **só interface**; a proteção real é
  RLS e servidor. Aba/função nova de permissão entra em `ESTRUTURA_PERMISSOES`
  (`components/shared/PermissoesGranularesEditor.jsx`).
- Toasts: `import { toast } from "sonner"`. Padrão de dados: `useEffect` + `sigo.entities` + `useState` (não
  introduza React Query nem react-hook-form). Não há `AlertDialog` pronto; `Select`/`Popover` dentro de `Dialog` precisam
  de `className="z-[9999]"`. Página pública entra em `publicPages` do `Layout.jsx`.
- Testes: Vitest em ambiente **node, sem DOM** (`apps/web/vitest.config.js`, só `src/**/*.test.{js,jsx}`). Lógica nova
  vai para `src/lib/<nome>.js` com `src/lib/<nome>.test.js` (`import { describe, it, expect } from "vitest"`); a lib
  pura não importa `@/api/sigoClient`.
- ESLint (`apps/web/eslint.config.js`) só cobre `src/components`, `src/pages` e `src/Layout.jsx`, e o bloco `rules`
  sobrescreve os `recommended`: **`no-undef` está desligado** (variável inexistente passa no lint e quebra em tempo de
  execução). Por isso rode `npx eslint --rule "no-undef: error"` nos arquivos alterados de `src/components`,
  `src/pages` e `src/Layout.jsx`, com caminho relativo a `apps/web` (ex.: `src/components/seguranca/X.jsx`). `src/lib`
  fica fora do ESLint; quem cobre é o teste. O build de produção remove `console.log/debug/info`.

## Armadilhas

- `git status` pode mudar sozinho (outras sessões). Nunca reverta o que não é seu.
- Outras sessões podem fazer commit e push a partir do checkout principal: arquivo ou commit seu deixado ali pode ir
  para produção sem push seu. Por isso trabalhe em clone ou worktree separado (regra 3).
- Arquivos em `apps/web/public/` ficam em cache de 1 ano; o Hostgator devolve `index.html` com 200 para arquivo ausente.
- `README.md`, `CONTRIBUTING.md`, `docs/ESTADO-DO-PROJETO.md`, `docs/COMPACTO-SIGOOBRAS.md`, `docs/DEPLOY-SUPABASE.md`,
  `docs/SCHEMA.md`, `docs/REVISAO-SENIOR-2026-06.md`, `docs/REVISAO-OPORTUNIDADES.md` e `supabase/README.md` estão
  defasados (mandam usar `db push`, entre outros). O código vence.
- `.superpowers/` e `.claude/worktrees/` não são versionados.

## Entregando uma tarefa

1. Testes passando (`npm test --workspace=apps/web` ou `cd apps/web && npx vitest run <arquivo>`, e
   `node --test ...`), `npm run lint`, `no-undef` nos arquivos alterados de `src/components`, `src/pages` e
   `src/Layout.jsx`, `npm run build` quando mexer no front, `npx prettier --check` nos seus arquivos.
2. Um commit na sua branch (regra 3), só com os arquivos da tarefa. Sem push e sem PR.
3. Na descrição do commit: o que mudou, como testar e os comandos de produção (migração, deploy de função, push) que o
   Javerson deve rodar, na ordem.

Trabalho em andamento no Portal de Treinamento: ver `docs/HANDOFF-PORTAL-TREINAMENTO.md`.
