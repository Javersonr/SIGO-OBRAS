# Auditoria / Varredura completa — 2026-06

> Pedido: otimizar código, corrigir bugs, descobrir ganhos rápidos e deletar
> código obsoleto. Esta auditoria foi feita por agentes de leitura + ferramentas.
> **Princípio:** nada de produção é alterado/deletado sem verificação e OK.

## ⚠️ Aviso sobre confiabilidade dos achados

Os detectores automáticos deram **muitos falsos-positivos** — então **NÃO** se deve
deletar/corrigir em massa cegamente:

- O agente de "código morto" disse que `DespesaModal.jsx` tem **"0 importações"**
  — **falso**: 8 arquivos o importam. (Foi onde corrigimos o bug do cmdk.)
- O `knip` **sem configuração** marcou `App.jsx`, `Layout.jsx`, `ErrorBoundary.jsx`,
  `sigoClient.js` como "não usados" — são a **raiz do app**. Ele não conhece o
  entry (`main.jsx`) nem o roteamento dinâmico de páginas.
- O agente de bugs marcou `status[0].id` (Oportunidades:234) como crash — **falso**:
  está dentro de `if (status.length > 0)`.

➡️ **Cada item abaixo precisa ser verificado antes de virar mudança.**

---

## ✅ JÁ CORRIGIDO E NO AR (nesta sessão)

1. **Crash do `cmdk` com valor nulo** (`Cannot use 'in' operator...`) — o bug que
   derrubava o Financeiro ao escolher projeto. Blindado em **todos** os seletores
   de busca: Despesa (projeto/categoria/fornecedor/centro de custo), Receita
   (categoria/centro/cliente), Estoque (almoxarifado/projeto), Usuário (projeto),
   Projeto (cliente). `value` agora sempre cai para o `id`.
2. **Auto-recuperação de erro de chunk pós-deploy** — `ErrorBoundary` detecta
   "Failed to fetch dynamically imported module" (React.lazy após deploy novo) e
   **recarrega sozinho 1x**, mostrando "Atualizando…" em vez do card de erro.

---

## 🔴 BUGS REAIS a corrigir (verificados, próxima onda)

| #   | Onde                                                                                                                                                                               | Problema                                                                                                                                       | Ação                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| B1  | 15 telas de filtro (AuditLogs, RelatorioInventario, PrevisaoDemanda, HistoricoInventarioFilters, HistoricoInspecaoTab, MateriaisTab, MaoDeObraTab, ReceitasTab, PreLancamentosTab) | `<SelectItem value={null}>Todos</SelectItem>` — Radix Select não aceita valor nulo/vazio (mesma família do cmdk). Hoje "tolera", mas é frágil. | Trocar por **sentinela** (ex.: `value="__todos__"`) + tratar no `onValueChange`. Refactor por item (não é `\|\| id`). |
| B2  | `pages/Ferramental.jsx:248`                                                                                                                                                        | `almoxarifadosList[0].nome` sem checar `length` → crash se vazio                                                                               | Guardar `?.` + fallback                                                                                               |
| B3  | Layout/Dashboard/Relatorios/Configuracoes                                                                                                                                          | `assinaturas[0].plano_id` / `planos[0]...` sem guarda de array vazio                                                                           | Guardar (empresa sem assinatura = crash no carregamento)                                                              |
| B4  | vários                                                                                                                                                                             | `.find(...).campo` sem `?.` (ex.: `usuariosEmpresa.find(...).id`)                                                                              | Verificar 1 a 1 e proteger os reais                                                                                   |

> Itens marcados pelo agente como crash mas que **já têm guarda** (status[0].id,
> divisões com `> 0`, safeParseJSON) foram descartados como falso-positivo.

---

## 🟡 PERFORMANCE / GANHOS RÁPIDOS (verificar + aplicar)

| #   | Onde                                                         | Problema                                                               | Ganho                                              |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| P1  | `chat/ChatWindow.jsx:46`, `:87`                              | loop `for ... await update/create` em série                            | `Promise.all(...)`                                 |
| P2  | `chat/ChatWindow.jsx:18` (3s) e `ChatContextual.jsx:33` (5s) | polling agressivo                                                      | subir intervalo / Realtime (é a tarefa **AUTO-8**) |
| P3  | `financeiro/DespesasTab.jsx:223`                             | upload de anexos em série                                              | `Promise.all(files.map(...))`                      |
| P4  | `estoque/ImportarMovimentacoesModal.jsx:205`                 | `EstoqueSaldo.filter` possivelmente sem `empresa_id`                   | confirmar (RLS já protege no servidor) e adicionar |
| P5  | `pages/Oportunidades.jsx` (Kanban)                           | `key={idx}` em listas, callbacks sem `useCallback`, busca sem debounce | corrigir keys + memo + debounce                    |

> Obs.: `console.log` em produção **já é removido** no build (`drop_console` no
> Vite) — então não é problema de runtime/segurança.

---

## 🗑️ CÓDIGO OBSOLETO — precisa de tooling antes de deletar

A detecção automática **não é confiável** aqui (ver aviso acima). Para deletar com
segurança é preciso:

1. **Configurar `knip`** (`apps/web/knip.json`): entry = `src/main.jsx`, e ensinar
   o resolver do roteamento dinâmico de páginas (senão marca páginas válidas como
   mortas).
2. Rodar e **revisar a lista** candidato a candidato (conferir import dinâmico,
   `createPageUrl`, lazy).
3. Deletar em **wave pequena**, com build verde a cada passo.

**Candidatos com indício forte (a confirmar com knip configurado):**

- **`legacy/base44/`** — código Base44 antigo. Verificar se `vite.config.js` ainda
  referencia `@base44/sdk`; se não, é o candidato nº 1 a remover.
- `moment` no `package.json` — usado em **1 arquivo** (`DashboardInspecoes.jsx`); o
  resto usa `date-fns`. Migrar esse 1 e remover a dep.
- Possíveis duplicatas: `components/oportunidades/DespesasTab.jsx` vs
  `components/financeiro/DespesasTab.jsx` — confirmar qual é usado.

> **NÃO deletar** com base nas listas de "415 arquivos" / "158 órfãos" — elas
> incluem arquivos comprovadamente usados.

---

## Plano de ondas (proposto — pedir OK)

- **Onda 1 (feita):** crash do cmdk + auto-recuperação de chunk. ✅
- **Onda 2 (bugs):** B1 (SelectItem sentinela) + B2/B3/B4 verificados. Risco baixo,
  alto valor (tira telas de filtro do risco de crash).
- **Onda 3 (perf):** P1/P3 (Promise.all) + P5 (keys/debounce). P2 entra no AUTO-8.
- **Onda 4 (limpeza):** configurar knip → deletar obsoleto verificado + remover
  `moment` + (se confirmado) pasta `legacy/`.

Cada onda é um deploy isolado e reversível. As deleções (Onda 4) só após o knip
configurado e revisão item a item.
