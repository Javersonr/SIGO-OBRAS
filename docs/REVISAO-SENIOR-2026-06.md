# Revisão sênior do código — parecer e plano de organização (2026-06)

> Leitura de todo o repositório sob 4 lentes (arquitetura, frontend, backend/DB,
> DX/dívida). **Nada foi alterado** — é diagnóstico + plano. Números das
> ferramentas foram filtrados (elas exageram); aqui fica o que é real e relevante.

## Veredito geral

**É uma base production-grade de verdade.** Para um ERP multi-tenant feito em ~6
meses, o nível é alto: RLS por empresa com rollback documentado, transações
atômicas nas operações críticas (transferência, estoque, reservas), portal token
HMAC com escopo restrito, deploy automatizado, ErrorBoundary + auto-recuperação de
chunk. A dívida técnica é **normal** — nenhum red flag grave. O que segue é como
deixar a casa mais **organizada e fácil de evoluir**, não conserto de incêndio.

Nota honesta por dimensão: **Arquitetura 7.5/10 · Frontend 6.5/10 · Backend/DB
8/10 · DX/processo 6/10.** O backend está na frente; o frontend e o processo
(testes/observabilidade) são onde mais se ganha.

---

## Onde melhorar a ORGANIZAÇÃO (priorizado)

### A. Estrutura / arquitetura

1. **God files** — quebrar os 4–5 maiores. `Layout.jsx` (~1k linhas: empresa +
   permissões + sidebar + notificações + CSS) → extrair `EmpresaContext`,
   `useSidebarMenu`, `useNotifications`, `components/layout/*`. Páginas monolito:
   `SegurancaTrabalho.jsx` (~2,6k), `Ferramental.jsx` (~2,3k), `Estoque.jsx`
   (~1,9k), `DespesasTab/ReceitasTab` (~2,2k) → mover cada uma para uma pasta com
   `tabs/`, `modals/`, `services/`.
2. **`components/financeiro/` (49 arquivos numa pasta plana)** → reorganizar por
   feature: `lancamentos/`, `pre-lancamentos/`, `conciliacao/`, `recorrentes/`,
   `relatorios/`, `shared/`. (Mesma ideia para `ferramental/`.)
3. **Pages na raiz (34 arquivos)** → adotar pasta por página para as grandes.
4. **Utils fragmentados** — hoje formatação/parse de data e dinheiro existe em
   `lib/formatters.js`, `lib/financeiro-utils.js`, `components/financeiro/utils.jsx`
   (duplica), `lib/json-utils.js`, `lib/safe-url.js`. Consolidar em `lib/format`,
   `lib/parse`, `lib/validation` e **eliminar a duplicata de `parseData/parseValor`**.
5. **Hooks espalhados** dentro de pastas de componente → centralizar em `src/hooks/`
   (com aliases `@hooks`, `@lib` no vite.config).
6. **`pages.config.js` com metadados** (ícone, módulo, permissão) → a sidebar e as
   rotas leem dali, em vez de permissões hardcoded em 3 lugares no `Layout`.

### B. Padrões de frontend (o maior ganho de produtividade)

7. **Camada de dados com React Query** — o `@tanstack/react-query` está instalado
   mas quase não é usado. Hoje cada tela repete `useEffect → load → setState +
loading/error`. Criar `useEntityData(entidade, filtros)` / `useEmpresaData()` corta
   ~150–200 linhas de telas como Oportunidades/Financeiro e dá cache/retry de graça.
8. **`<EntityCombobox>` reutilizável** — o seletor Popover+Command está copiado em
   ~6 lugares (foi onde caçamos o bug do cmdk). Um componente único elimina a
   duplicação e o risco de o mesmo bug voltar.
9. **`alert()/confirm()` → toast + AlertDialog** — inconsistente (uns usam toast,
   outros `alert`). Padronizar um `confirmDialog()` e um helper de erro
   (`withErrorToast`) acaba com falha silenciosa de save (já sentimos isso na despesa).
10. **`react-hook-form` (instalado, não usado)** nos formulários grandes (DespesaModal
    tem ~14 `useState` só de form) — menos código, validação real (Zod).

### C. Backend / Banco (segurança em primeiro)

11. **CORS `*` → restringir a sigoobras.com.br** (tarefa #144). 1 linha em
    `_shared/cors.ts`. **Alto valor, baixo esforço.**
12. **Revogar `anon` nas ~45 RPCs SECURITY DEFINER** (tarefa #146) — só 1 foi feita
    (0049). Defesa em profundidade. Uma migration nova + smoke test.
13. **Segredos em texto** — `conta_financeira.token_acesso` /
    `integracao_bancaria.token/refresh` e `fornecedor_acesso.senha_acesso` (TODO de
    hash do 0001). Mover para Vault/pgcrypto. **Crítico se a integração bancária
    estiver ligada.**
14. **Índices `unique` sem `where deleted_at is null`** (ex.: `usuario_empresa`,
    `cliente_portal_usuario`) — um registro soft-deletado pode bloquear recriar
    outro com mesmo e-mail. Auditar e corrigir.
15. **Locks pessimistas** em aprovação de SC e saída de estoque (hoje só
    transferência tem `for update`) — evita corrida com 2 usuários simultâneos.
16. **Colunas `_nome`/`_email` denormalizadas** (cópias do relacionado) — ok para
    histórico, mas sem trigger de sincronização podem mostrar nome "fantasma".
    Decidir caso a caso (trigger nas top 3 ou view de leitura).

### D. Processo / dívida (o que mais falta)

17. **Zero testes automatizados** — o maior buraco. Priorizar testes dos **RPCs
    financeiros** (transferência atômica, parcelas dia 31, recálculo de saldo, DST)
    com Vitest contra Supabase local, como job no CI.
18. **Sem observabilidade** — adicionar **Sentry** (front + ErrorBoundary) pra
    enxergar erro em produção em vez de depender do print do usuário.
19. **ESLint** — ligar `react-hooks/exhaustive-deps` (como `warn`) e
    `no-console` (allow warn/error). Pega bug silencioso de efeito.
20. **`moment` (1 uso) → `date-fns`** (resto do app já usa) e remover a dep (~25 KB).
21. **`docs/` virou depósito** — marcar cada arquivo como Oficial/Arquivado, mover
    revisões internas pra `docs/internal/`, e definir 1 fonte de verdade.

---

## Por onde EU começaria (do mais barato/valioso ao maior)

1. **Quick wins de baixo risco (1 dia):** CORS restrito (#11) · remover `moment`
   (#20) · ligar `exhaustive-deps`=warn (#19) · `docs/` arrumado (#21).
2. **`<EntityCombobox>` + helpers `confirmDialog`/`withErrorToast` (2–3 dias):**
   mata duplicação e falha silenciosa de uma vez (#8, #9).
3. **`useEntityData` (React Query) + migrar 2 telas piloto (3–4 dias):** começa a
   cortar o boilerplate de dados (#7).
4. **Segurança backend (1 dia):** revogar `anon` (#12) + auditar índices unique
   (#14) + plano do Vault de segredos (#13).
5. **Quebrar `Layout.jsx` e reorganizar `components/financeiro/` (1 semana):** a
   reorganização estrutural que destrava o resto (#1, #2).
6. **Testes dos RPCs financeiros no CI (1 semana):** a rede de segurança que falta
   (#17).

> Recomendação: **não** fazer tudo de uma vez. As fases 1–2 já melhoram muito a
> sensação de organização com risco mínimo. Estrutural (5) e testes (6) entram
> depois, em janelas dedicadas.
