# Cronograma físico-financeiro: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Planejamento da oportunidade, um quadro "Cronograma físico-financeiro" (etapas de nível 1 do orçamento × meses, % em cada célula e R$ calculado do subtotal com desconto) que importa a aba `Cronograma` do modelo SIGO preenchida pela skill do Claude, permite editar os %, mudar o número de meses e reperiodizar, e exporta o cronograma da proposta em PDF ou Excel.

**Architecture:**

- **Lógica pura em `apps/web/src/lib/`, testada com Vitest:** `cronograma-ff.js` (contas inteiras: % em centésimos, R$ em centavos, meses e reperiodização), `cronograma-modelo.js` (leitura da aba `Cronograma` e a 3ª aba do `gerarModelo`), `cronograma-export.js` (PDF e Excel, com o cabeçalho, o nome do arquivo e o jsPDF da proposta) e `fila-gravacao.js` (gravação com espera, em ordem).
- **Tela:** `CronogramaFisicoFinanceiro.jsx`, `ImportarCronogramaDialog.jsx` e `ExportarCronogramaDialog.jsx` em `components/oportunidades/`, ligados no `OportunidadeDetalhe.jsx` (aba Planejamento, acima do `DiarioObraTab`). O quadro grava o objeto inteiro em `oportunidade.cronograma_ff` (migração aditiva `0133`); o R$ nunca é gravado.
- **Skill do Claude** `orcamento-prefeitura-sigo`: seção Cronograma e o código Python com a 3ª aba. Nenhuma Edge Function nova ou alterada.

**Tech Stack:** React 18 + Vite 6 (JavaScript), SheetJS `xlsx` 0.18.5 (sem estilos), `jspdf` 2.5.2 + `jspdf-autotable` 3.8.4 (do Orçamento), Vitest 3 (ambiente node, sem DOM), Supabase pelo `sigo.entities`, Python 3 + openpyxl (skill).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md` (commit `37ad85c`); depende do Orçamento (`docs/superpowers/plans/2026-09-29-orcamento-planilha-prefeitura.md`), já no `master` do checkout principal e ainda não publicado.
- **Migração `0133_cronograma_fisico_financeiro.sql`** (número reservado no `AGENTS.md`): só aditiva e idempotente, `alter table public.oportunidade add column if not exists cronograma_ff jsonb not null default '{}'::jsonb check (jsonb_typeof(cronograma_ff) = 'object');` + `notify pgrst, 'reload schema';`, terminando em `select 'ok' as res;`.
- **Aplicação da `0133`:** `supabase db query --linked -f supabase/migrations/0133_cronograma_fisico_financeiro.sql` (nunca `db push`), **antes** do push do front, porque o quadro grava `cronograma_ff`.
- **Formato de `cronograma_ff`:** `{ "meses": 1 a 60, "pct": { "<numero da etapa de nível 1>": [% de 0 a 100 com até 2 casas, uma posição por mês] }, "origem": "importado" | "manual", "arquivo_nome", "atualizado_em" }`; `{}` = sem cronograma; a RLS não muda.
- **O R$ não é gravado:** sai sempre do subtotal com desconto da etapa (`subtotaisEtapas` do Orçamento), então muda com o desconto ou com uma reimportação do orçamento, sem mexer nos %.
- **Aritmética inteira:** % em centésimos (10000 = 100,00%) e R$ em centavos; a linha fecha só com a soma exata de 10000 centésimos.
- **Célula:** arredondar(subtotal da etapa em centavos × centésimos ÷ 10000), com BigInt quando o produto passa de 2^53.
- **Absorção no último mês com %:** se a linha fecha 100,00, o último mês com % > 0 recebe a diferença e a linha soma exatamente o subtotal; se não fecha, cada célula é só o arredondamento dela.
- **Totais:** R$ do mês = soma da coluna; % do mês = R$ do mês ÷ total da proposta (2 casas); acumulado em R$ e acumulado em % sobre o total da proposta.
- **Mudar meses (N → M) sem reperiodizar:** M > N acrescenta colunas com 0; M < N corta as do fim e, se alguma cortada tem % > 0, confirma "Os meses M+1 a N têm valores. Cortar mesmo assim? (as linhas deixam de fechar 100%)".
- **Reperiodização pelo maior resto:** curva acumulada linear entre os limites dos meses, novos limites em j·N/M, arredondamento em centésimos pelo maior resto preservando a soma da linha (20/35/30/15 em 4 meses → 55/45 em 2); pede confirmação e grava `origem: "manual"`.
- **Linhas da grade:** etapas de nível 1 do orçamento (`etapa = true` e `numero` sem ponto), na ordem da tela; colunas Mês 1 … Mês N (sem datas), Total % (verde com 100,00; vermelho com a diferença) e rodapé com R$ do mês, % do mês, acumulado em R$ e acumulado em %.
- **Sem etapas:** "Importe o orçamento com etapas para montar o cronograma." (sem itens) e "O orçamento não tem etapas. Reimporte a planilha com as etapas (a skill cria a etapa quando o edital tem uma só)." (com itens).
- **Linha órfã** (sem etapa no orçamento): cinza, "Etapa não existe mais no orçamento", com a lixeira; etapa sem linha aparece com as células vazias.
- **Gravação:** ao sair de uma célula, com espera de 1 s, grava o objeto inteiro com `Oportunidade.update(id, { cronograma_ff })` e o padrão `setSelectedOp`/`setOportunidades`; na falha, toast e o estado local volta.
- **Permissão:** edita quem edita o orçamento (aba "Orçamento"/"Orcamento", função `editar`, o `podeEditarOrcamento` do `OportunidadeDetalhe`); os demais com acesso à aba só veem.
- **Aba "Cronograma" do modelo SIGO:** 3ª aba opcional do `gerarModelo`, cabeçalho na linha 1 `Item` | `Descrição` | `Mês 1` … `Mês 12` (até `Mês 60`; colunas a mais ignoradas), uma linha por etapa de nível 1 com o % de cada mês.
- **Leitura da aba:** cabeçalho sem acento, sem maiúsculas e com espaços colapsados; % como número 0–100, texto pt-BR (`12,5`, `12,5%`) ou célula com formato de % (× 100); vazio = 0; erros e avisos do §6 da spec.
- **Importação na tela:** prévia (meses, etapas, erros e avisos), "Substituir o cronograma atual?" quando já existe, grava `origem: "importado"` e o nome do arquivo.
- **Skill:** a seção Cronograma copia os meses do edital sem reperiodizar, converte R$ em % (2 casas) quando o edital só traz R$, cria a etapa 1 quando o orçamento não tem etapas e o cronograma tem uma só; `conferir_modelo_sigo` aceita 2 ou 3 abas e confere a soma 100,00 de cada linha (aviso).
- **Exportar:** habilitado só com todas as etapas em 100,00%; diálogo com formato, local, data e representante legal (`empresa.representante_*`, editável sem gravar, `validarRepresentante`); nome `Cronograma - <oportunidade> - <aaaa-mm-dd>.pdf` ou `.xlsx`; sem registro de versão.
- **PDF:** A4 paisagem com `jspdf` + `jspdf-autotable`; com mais de 12 meses, `horizontalPageBreak` e `horizontalPageBreakRepeat` (Item e Etapa); "Página X de Y".
- **Excel sem negrito** (limitação do SheetJS CE): R$ e % por célula, rodapé e acumulados em fórmula `SUM` com o valor em cache.
- **Produção com OK:** aplicar a `0133`, publicar (push em `master`) e o plano de volta só com o "sim" explícito do Javerson no chat, imediatamente antes de cada passo; `npm run dev` usa o banco de produção (o roteiro é do Javerson, depois da `0133`; o agente não faz login nem grava dados por conta própria).
- **Commits parciais:** outras sessões mexem no mesmo checkout; `git add` só dos arquivos novos da task e `git commit -F - -- <caminhos da task>`; nunca `-A`/`-a`/`.`, stash, reset, rebase, `--amend`, `--no-verify` ou `--force`; mensagem em português (commitlint, assunto até 100 caracteres) terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **LF/Edit:** arquivo novo com a ferramenta Write, copiando o bloco do plano (LF); arquivo existente com a ferramenta Edit, trocas old→new na ordem, cada `old` único no arquivo no momento da troca; o `.gitattributes` define `eol=lf`.
- **Este arquivo e o Prettier:** o CI roda o Prettier nos `.md` (largura 120) e os blocos de código seguem a largura 100 dos `.js`/`.jsx`; os blocos com `<!-- prettier-ignore -->` antes da cerca **não podem perder essa linha**, senão o `prettier --write` reformata o bloco e as âncoras old→new deixam de ser exatas.
- **Comandos de teste** (na raiz, Git Bash; `apps/web` sempre num subshell, nunca `npx vitest` na raiz): `(cd apps/web && npx vitest run [arquivo])`, `(cd apps/web && npx eslint --rule "no-undef: error" <src/components/...>)`, `(cd apps/web && npm run lint)`, `(cd apps/web && npm run build > /dev/null && echo BUILD_OK)` e `npx prettier --check <arquivos>`.

## Decisões registradas na redação

- **Ordem do orçamento:** o contrato fala em `ordemDoItem`, que não existe; as etapas saem na ordem do `ordenarItensOportunidade` (`ordem`, nula como 0, depois `numero`), a mesma da tela do orçamento (Task 1).
- **Contas estritas (Task 1):** `lerPercentual` devolve `null` para vazio e `NaN` para texto inválido, sinal, milhar ou valor fora de 0–100 (o arredondamento em 2 casas vem antes da conferência da faixa); `ajustarMeses`, `reperiodizarLinha` e `reperiodizar` lançam `RangeError` com N fora de 1 a 60; `normalizarCronograma` com `meses` 0 devolve `pct: {}`; `todasFecham` é `false` sem etapas; nenhuma função preenche `atualizado_em` (quem grava põe a data).
- **Leitura da aba (Task 2):** `lerArquivoCronograma` lê com `sheetStubs: true` além do `cellNF` do contrato (fórmula sem valor salvo vira erro, não 0); aba sem linhas e nenhuma linha com etapa do orçamento são **erros** fora da lista da spec, para a importação não trocar o cronograma atual por um vazio; Mês faltando, Mês repetido, colunas além do Mês 60 e linha sem Item são avisos extras.
- **Sem dependência circular (Task 2):** `orcamento-modelo.js` importa o nome e o cabeçalho de `cronograma-modelo.js`, que não importa `orcamento-modelo.js` e repete 7 utilitários pequenos de célula.
- **Skill mais estrita que o SIGO (Task 3):** o código Python exige Item em texto e % numérico, porque quem grava é o próprio código; `pct_da_linha` converte R$ em % com a diferença no último mês com valor.
- **Sem cópia da proposta (Task 4):** `montarCabecalhoLicitacao` sai de dentro de `montarDadosProposta` (o resultado da proposta não muda) e `cabecalhoDoDocumento`, `linhasAssinatura`, `textoPdf` e o novo `carregarJsPdf` passam a ser exportados por `proposta-export.js`; `nomeArquivoCronograma` reaproveita `nomeArquivoProposta`.
- **Excel (Task 4):** cada etapa em 2 linhas com Item, Etapa, Valor e % do total mesclados; % gravado como fração com formato `0.00%`; mês com 0% em branco; acima de 255 etapas, `SUM` de `SUM`s.
- **PDF (Task 4):** cada etapa é **uma** linha da tabela com o R$ e o % em duas linhas de texto (o par não se separa na quebra de página); a quebra horizontal liga com mais de 12 meses **ou** quando os meses não cabem na largura útil.
- **Linha órfã fora da exportação e dos totais:** `resumoCronograma` só soma as etapas do orçamento.
- **Fila de gravação (Task 5, lib extra testada):** grava só o último valor 1 s depois da última célula, uma gravação de cada vez e em ordem; Importar, Meses, Reperiodizar e apagar linha órfã gravam na hora; ao sair do quadro, a edição pendente é gravada na hora; na falha, descarta o que veio depois e a tela volta ao último gravado.
- **Origem e data:** toda gravação põe `atualizado_em`; célula, Meses, Reperiodizar e apagar linha marcam `origem: "manual"` (mantêm `arquivo_nome`); Importar marca `"importado"` com o nome do arquivo.
- **`ListaMensagens`** passa a ser export nomeado do `ImportarPlanilhaOrcamentoDialog.jsx`, reusada no diálogo do cronograma; a prop `user` é aceita e não usada (o cronograma não grava autor).
- **Exportar entre as Tasks 5 e 6:** a Task 5 deixa a âncora `{/* EXPORTAR_CRONOGRAMA */}` na barra de botões, fora de qualquer condição de `podeEditar`; a Task 6 troca a âncora pelo `BotaoExportarCronograma` (export extra do `ExportarCronogramaDialog.jsx`), visível também para quem só vê a aba, que exporta o estado local do quadro (o `selectedOp` pode estar atrás da tela).
- **Imbé de Minas (Task 7):** a planilha feita à mão não redistribui a curva: copia as 5 parcelas preenchidas do CFF de 12 parcelas. O equivalente no SIGO é **Meses 12 → 5**; o roteiro mostra também o **Reperiodizar 12 → 5** como o outro critério, com a diferença explicada. O arquivo de teste promove os grupos 1.1 a 1.6 do edital a etapas 1 a 6.
- **Onde se trabalha:** no `master` do checkout principal, como o plano do Orçamento (a base dele está lá, ainda não publicada), com commit parcial por task; a Task 7 trata o risco de outra sessão publicar antes (Step 1) e só publica com o OK do Javerson.
- **Conferência de 05/10** (cópia do `master` `37ad85c` fora do repositório): as Tasks 1 a 6 aplicadas em ordem, com todas as âncoras únicas no momento da troca; Prettier sem mudança; Vitest com 40 arquivos e 515 testes (base 36/433; a Task 1 ganhou depois 1 teste de `lerPercentual` com `number`, e a suíte passou a 516); `npm run lint`, `no-undef` e `vite build` sem erro, com os chunks esperados; o código Python da skill e os números da Task 7 (Itatinga e Imbé) recalculados sobre cópias das planilhas.

---

## Linha de base e regras comuns

**Antes da Task 1 — linha de base da suíte** (outras sessões mudam o número; em 05/10 às 14:12, no master `37ad85c`, eram 36 arquivos e 433 testes):

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Anote as linhas `Test Files  N passed` e `Tests  M passed`. A suíte cresce assim, sem falhas:

| Fim da task | Arquivos | Testes   | Com a base de 05/10 |
| ----------- | -------- | -------- | ------------------- |
| Task 1      | `N + 1`  | `M + 37` | 37 e 470            |
| Task 2      | `N + 2`  | `M + 56` | 38 e 489            |
| Task 3      | `N + 2`  | `M + 57` | 38 e 490            |
| Task 4      | `N + 3`  | `M + 75` | 39 e 508            |
| Tasks 5 e 6 | `N + 4`  | `M + 83` | 40 e 516            |

**Regras para todas as tasks:**

- **Arquivos novos:** crie com a ferramenta Write, copiando os blocos do plano como estão (LF).
- **Arquivos existentes:** aplique as trocas old→new com a ferramenta **Edit**, na ordem. Cada `old` aparece **uma única vez** no arquivo no momento da sua troca; os números de linha citados são do `master` `37ad85c` e só orientam.
- Os blocos já passaram no Prettier do repositório (`.prettierrc.json`) e nos testes, numa cópia fora do repositório (05/10). Mesmo assim, rode o Prettier nos arquivos da task antes do commit: o hook do lint-staged também formata, mas é melhor o commit parcial chegar formatado.
- **ESLint:** o `apps/web/eslint.config.js` ignora `src/lib/**` (ali quem cobre é o Vitest); nos arquivos alterados de `src/components` rode também o `no-undef`, com caminho relativo a `apps/web`.
- **Commit parcial:** rode `git status --short` antes, faça `git add` só dos arquivos novos da task (o git só aceita `git commit -- <caminho>` de arquivo novo se ele já estiver no índice) e `git commit -F - -- <caminhos>`. Se o hook do lint-staged recusar o commit com caminhos, confira com `git diff --cached --name-only` que só os arquivos da task estão no índice e rode o mesmo `git commit -F -` sem o `-- <caminhos>`.
- Os comandos partem da raiz do repositório (`C:/Users/javer/sigoobras-base`), no Git Bash; os que precisam de `apps/web` entram lá num subshell `( ... )`, para a pasta de trabalho continuar na raiz.
- **Não teste no `npm run dev` antes da Task 7:** o dev usa o banco de produção, e sem a `0133` toda gravação do quadro falha (PGRST204).

---

## Parte A — Tasks 1 a 3: contas do cronograma, aba Cronograma do modelo e skill do Claude

### Task 1: Contas do cronograma (`lib/cronograma-ff.js`)

**Files:**

- Create: `apps/web/src/lib/cronograma-ff.js`
- Test: `apps/web/src/lib/cronograma-ff.test.js`

**Interfaces:**

- Consumes:
  - `subtotaisEtapas(itens)` de `./orcamento-desconto` (subtotal com desconto de cada etapa, em reais, chave = `numero`);
  - `ordenarItensOportunidade(itens)` e `compararNumeroItem(a, b)` de `./orcamento-registros` (a ordem da tela do orçamento: `ordem`, nula como 0, e depois `numero`). O contrato fala em "`ordemDoItem`", que não existe no código: o critério reaproveitado é o do `ordenarItensOportunidade`.
- Produces (nomes do contrato; aritmética inteira, % em centésimos e R$ em centavos):
  - `MAX_MESES = 60`.
  - `etapasDoOrcamento(itens): EtapaCron[]` — linhas com `etapa === true` e `numero` sem ponto, na ordem do `ordenarItensOportunidade`; `centavos = Math.round(subtotaisEtapas(itens)[numero] * 100)`, ou 0. Ignora `null` na lista e, com `numero` repetido, fica com o primeiro.
  - `normalizarCronograma(obj): Cronograma` — `{}`, `null`, array ou não objeto → `{ meses: 0, pct: {} }`; `meses` inteiro de 0 a 60 (fração cortada, fora da faixa vai ao limite); **com `meses` 0, `pct` fica `{}`**; cada array cortado ou completado com 0; valor que não é `number` de 0 a 100 vira 0, e o resto fica com 2 casas; chave cujo valor não é array sai; `origem` (`"importado"`/`"manual"`), `arquivo_nome` e `atualizado_em` (strings) só ficam quando válidos.
  - `lerPercentual(entrada): number|null` — aceita `number`, `"12,5"`, `"12.5"`, `"12,5%"`, `",5"` e espaços; vazio (`null`, `undefined`, `""`, só espaços, `"%"`) → `null`; texto inválido, com sinal ou milhar, e **valor fora de 0 a 100 → `NaN`** (assim o `Number.isNaN` da grade cobre tudo); arredonda em 2 casas, meio para cima (`"33,335"` → 33,34), **antes** de conferir a faixa e também para `number` (`100.004` → 100; `100.005` → `NaN`, porque vira 100,01; `-0.004` → 0); texto com sinal continua `NaN`.
  - `somaCentesimos(linha): number` e `linhaFecha(linha): boolean` (`=== 10000`).
  - `valoresDaLinha(linha, centavosEtapa): number[]` — célula = `Math.round(centavos × centésimos ÷ 10000)` (BigInt quando o produto passa de 2^53); se a linha fecha, o último mês com % > 0 recebe `centavosEtapa − soma dos outros`.
  - `resumoCronograma(etapas, cron): { linhas, meses, totalCentavos, todasFecham, orfas }` — `linhas[i] = { numero, descricao, centavos, peso, pct, valores, fecha, diferenca }` (etapa sem linha no cronograma = zeros; `diferenca = (10000 − soma) ÷ 100`, negativa quando passa de 100); `meses[j] = { centavos, pct, acumCentavos, acumPct }`, os % sobre `totalCentavos` com 2 casas (0 com total zero); **`todasFecham` é `false` sem etapas**; `orfas` na ordem do `compararNumeroItem`.
  - `ajustarMeses(cron, novoN): { cronograma, cortouValores }` — mais colunas com 0 ou corte das do fim; `cortouValores` = alguma coluna cortada tinha % > 0. **Mantém `origem`, `arquivo_nome` e `atualizado_em`** (quem grava decide se marca `"manual"` e atualiza a data).
  - `reperiodizarLinha(linha, novoN): number[]` — curva acumulada linear e novos limites em `j·N/M`, em inteiros exatos (`M·C(j·N/M) = M·C(q) + a[q]·r`); maior resto em centésimos, empate para o mês mais cedo; a soma em centésimos não muda; linha vazia → zeros.
  - `reperiodizar(cron, novoN): Cronograma` — todas as linhas, `meses = novoN` e `origem: "manual"` (mantém `arquivo_nome`).
  - `ajustarMeses`, `reperiodizarLinha` e `reperiodizar` **lançam `RangeError`** ("O número de meses vai de 1 a 60") com `novoN` que não seja inteiro de 1 a 60. A tela valida antes ou faz `try/catch` com toast.
  - Nenhuma função preenche `atualizado_em`: quem grava (Task 5) põe a data.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/lib/cronograma-ff.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect } from "vitest";
import {
  MAX_MESES,
  etapasDoOrcamento,
  normalizarCronograma,
  lerPercentual,
  somaCentesimos,
  linhaFecha,
  valoresDaLinha,
  resumoCronograma,
  ajustarMeses,
  reperiodizarLinha,
  reperiodizar,
} from "./cronograma-ff";

const soma = (lista) => lista.reduce((s, v) => s + v, 0);

describe("etapasDoOrcamento", () => {
  it("só etapas de nível 1, na ordem da tela, com o subtotal com desconto em centavos", () => {
    const itens = [
      { id: "e2", etapa: true, numero: "2", descricao: "POSTES", ordem: 3 },
      { id: "i21", etapa: false, numero: "2.1", valor_total: 21032.94, ordem: 4 },
      { id: "e1", etapa: true, numero: "1", descricao: "PRELIMINARES", ordem: 0 },
      { id: "e11", etapa: true, numero: "1.1", descricao: "Sub", ordem: 1 },
      { id: "i111", etapa: false, numero: "1.1.1", valor_total: 1315.24, ordem: 2 },
      { id: "i12", etapa: false, numero: "1.2", valor_total: "0.01", ordem: 2 },
      { id: "e3", etapa: true, numero: "3", descricao: "VAZIA", ordem: 5 },
      { id: "x", etapa: true, numero: null, descricao: "sem número", ordem: 6 },
      null,
    ];
    expect(etapasDoOrcamento(itens)).toEqual([
      { numero: "1", descricao: "PRELIMINARES", centavos: 131525 },
      { numero: "2", descricao: "POSTES", centavos: 2103294 },
      { numero: "3", descricao: "VAZIA", centavos: 0 },
    ]);
  });
  it("sem itens ou sem etapas → lista vazia", () => {
    expect(etapasDoOrcamento(undefined)).toEqual([]);
    expect(etapasDoOrcamento([{ etapa: false, numero: "1", valor_total: 10 }])).toEqual([]);
  });
  it("ordem nula conta como 0 e o desempate é pelo número", () => {
    const itens = [
      { etapa: true, numero: "10", descricao: "Dez" },
      { etapa: true, numero: "2", descricao: "Dois" },
    ];
    expect(etapasDoOrcamento(itens).map((e) => e.numero)).toEqual(["2", "10"]);
  });
});

describe("normalizarCronograma", () => {
  it("vazio, null e inválido → { meses: 0, pct: {} }", () => {
    for (const v of [{}, null, undefined, "x", 5, [1, 2], { meses: "abc" }]) {
      expect(normalizarCronograma(v)).toEqual({ meses: 0, pct: {} });
    }
  });
  it("corta e completa as linhas até meses; % inválido vira 0; 2 casas", () => {
    const r = normalizarCronograma({
      meses: 3,
      pct: { 1: [20, 35, 30, 15], 2: [50], 3: [-1, 101, "20"], 4: "x", 5: [33.333, null, 0] },
      origem: "importado",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
      atualizado_em: "2026-10-05T12:00:00.000Z",
    });
    expect(r).toEqual({
      meses: 3,
      pct: { 1: [20, 35, 30], 2: [50, 0, 0], 3: [0, 0, 0], 5: [33.33, 0, 0] },
      origem: "importado",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
      atualizado_em: "2026-10-05T12:00:00.000Z",
    });
  });
  it("meses fica entre 0 e MAX_MESES; com 0 não sobra linha; origem desconhecida sai", () => {
    expect(normalizarCronograma({ meses: 99, pct: {} }).meses).toBe(MAX_MESES);
    expect(normalizarCronograma({ meses: -2, pct: { 1: [10] } })).toEqual({ meses: 0, pct: {} });
    expect(normalizarCronograma({ meses: 2.7, pct: { 1: [10, 20, 30] } })).toEqual({
      meses: 2,
      pct: { 1: [10, 20] },
    });
    expect(normalizarCronograma({ meses: 1, pct: [], origem: "outra" })).toEqual({
      meses: 1,
      pct: {},
    });
  });
});

describe("lerPercentual", () => {
  it("number, vírgula, ponto, % e espaços", () => {
    expect(lerPercentual(20)).toBe(20);
    expect(lerPercentual("12,5")).toBe(12.5);
    expect(lerPercentual("12.5")).toBe(12.5);
    expect(lerPercentual(" 12,5 % ")).toBe(12.5);
    expect(lerPercentual("100")).toBe(100);
    expect(lerPercentual("0")).toBe(0);
    expect(lerPercentual(",5")).toBe(0.5);
  });
  it("vazio → null", () => {
    expect(lerPercentual("")).toBeNull();
    expect(lerPercentual("   ")).toBeNull();
    expect(lerPercentual("%")).toBeNull();
    expect(lerPercentual(null)).toBeNull();
    expect(lerPercentual(undefined)).toBeNull();
  });
  it("inválido ou fora de 0 a 100 → NaN", () => {
    for (const v of ["abc", "12abc", "1.234,5", "1,2,3", "-5", "+5", "100,01", 101, -0.5, NaN]) {
      expect(lerPercentual(v)).toBeNaN();
    }
    expect(lerPercentual(Infinity)).toBeNaN();
    expect(lerPercentual({})).toBeNaN();
  });
  it("arredonda em 2 casas, meio para cima", () => {
    expect(lerPercentual("33,335")).toBe(33.34);
    expect(lerPercentual(1.005)).toBe(1.01);
    expect(lerPercentual("33,3333")).toBe(33.33);
    expect(lerPercentual("100,004")).toBe(100);
  });
  it("number arredonda em 2 casas antes de conferir a faixa; texto com sinal continua inválido", () => {
    expect(lerPercentual(100.004)).toBe(100);
    expect(lerPercentual(100.005)).toBeNaN(); // vira 100,01
    expect(lerPercentual(-0.004)).toBe(0);
    expect(Object.is(lerPercentual(-0.004), 0)).toBe(true); // sem −0
    expect(lerPercentual(-0.006)).toBeNaN(); // vira −0,01
    expect(lerPercentual("-0,004")).toBeNaN();
    expect(lerPercentual("-0.004")).toBeNaN();
  });
});

describe("somaCentesimos e linhaFecha", () => {
  it("soma em centésimos, sem erro de ponto flutuante", () => {
    expect(somaCentesimos([33.33, 33.33, 33.34])).toBe(10000);
    expect(somaCentesimos([0.1, 0.2])).toBe(30);
    expect(somaCentesimos([])).toBe(0);
    expect(somaCentesimos(undefined)).toBe(0);
    expect(linhaFecha([33.33, 33.33, 33.34])).toBe(true);
    expect(linhaFecha([20, 35, 30, 15])).toBe(true);
    expect(linhaFecha([20, 35, 30, 14.99])).toBe(false);
    expect(linhaFecha([])).toBe(false);
  });
});

describe("valoresDaLinha", () => {
  it("33,33/33,33/33,34 com subtotal ímpar: o último mês absorve o centavo", () => {
    const v = valoresDaLinha([33.33, 33.33, 33.34], 100001);
    // 100001 × 33,34% = 33340,33 → 33340 sem ajuste; com o ajuste, 33341
    expect(v).toEqual([33330, 33330, 33341]);
    expect(soma(v)).toBe(100001);
  });
  it("o ajuste vai no último mês com % > 0, não na última coluna", () => {
    const v = valoresDaLinha([50, 50, 0], 1);
    expect(v).toEqual([1, 0, 0]);
    expect(soma(v)).toBe(1);
    expect(valoresDaLinha([0, 25, 25, 50, 0], 99999)).toEqual([0, 25000, 25000, 49999, 0]);
  });
  it("linha que não fecha: cada célula só arredondada, sem ajuste", () => {
    const v = valoresDaLinha([33.33, 33.33], 100001);
    expect(v).toEqual([33330, 33330]);
    expect(valoresDaLinha([60, 50], 1000)).toEqual([600, 500]);
  });
  it("etapa acima de 2^53 em centavos × centésimos (BigInt)", () => {
    const cents = 900000000000001; // R$ 9 trilhões e 1 centavo
    const v = valoresDaLinha([33.33, 33.33, 33.34], cents);
    expect(v[0]).toBe(299970000000000); // 900000000000001 × 3333 ÷ 10000 = 299970000000000,3
    expect(soma(v)).toBe(cents);
  });
  it("linha vazia ou zerada", () => {
    expect(valoresDaLinha([], 5000)).toEqual([]);
    expect(valoresDaLinha([0, 0], 5000)).toEqual([0, 0]);
  });
});

describe("resumoCronograma", () => {
  const etapas = [
    { numero: "1", descricao: "PRELIMINARES", centavos: 100000 },
    { numero: "2", descricao: "POSTES", centavos: 50001 },
    { numero: "3", descricao: "SEM LINHA", centavos: 0 },
  ];
  const cron = {
    meses: 4,
    pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0], 9: [100, 0, 0, 0], 10: [0, 0, 0, 0] },
  };

  it("linhas com peso, valores, fecha e diferença", () => {
    const r = resumoCronograma(etapas, cron);
    expect(r.totalCentavos).toBe(150001);
    expect(r.linhas[0]).toEqual({
      numero: "1",
      descricao: "PRELIMINARES",
      centavos: 100000,
      peso: 66.67,
      pct: [20, 35, 30, 15],
      valores: [20000, 35000, 30000, 15000],
      fecha: true,
      diferenca: 0,
    });
    // 50001 × 50% = 25000,5 → 25001; o último mês com % > 0 fica com 50001 − 25001
    expect(r.linhas[1].valores).toEqual([0, 25001, 25000, 0]);
    expect(r.linhas[1].peso).toBe(33.33);
    expect(r.linhas[2]).toEqual({
      numero: "3",
      descricao: "SEM LINHA",
      centavos: 0,
      peso: 0,
      pct: [0, 0, 0, 0],
      valores: [0, 0, 0, 0],
      fecha: false,
      diferenca: 100,
    });
    expect(r.todasFecham).toBe(false);
    expect(r.orfas).toEqual(["9", "10"]);
  });

  it("totais do mês e acumulados em R$ e em % do total", () => {
    const r = resumoCronograma(etapas, cron);
    expect(r.meses).toEqual([
      { centavos: 20000, pct: 13.33, acumCentavos: 20000, acumPct: 13.33 },
      { centavos: 60001, pct: 40, acumCentavos: 80001, acumPct: 53.33 },
      { centavos: 55000, pct: 36.67, acumCentavos: 135001, acumPct: 90 },
      { centavos: 15000, pct: 10, acumCentavos: 150001, acumPct: 100 },
    ]);
  });

  it("todas fecham → todasFecham; diferença com sinal quando passa de 100", () => {
    const so2 = etapas.slice(0, 2);
    expect(resumoCronograma(so2, cron).todasFecham).toBe(true);
    const r = resumoCronograma(so2, { meses: 2, pct: { 1: [60, 45], 2: [50, 49.99] } });
    expect(r.linhas.map((l) => [l.fecha, l.diferenca])).toEqual([
      [false, -5],
      [false, 0.01],
    ]);
    expect(r.todasFecham).toBe(false);
  });

  it("sem etapas ou sem cronograma", () => {
    expect(resumoCronograma([], cron)).toEqual({
      linhas: [],
      meses: [
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
      ],
      totalCentavos: 0,
      todasFecham: false,
      orfas: ["1", "2", "9", "10"],
    });
    const r = resumoCronograma(etapas.slice(0, 1), {});
    expect(r.meses).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ pct: [], valores: [], fecha: false, diferenca: 100 });
  });
});

describe("ajustarMeses", () => {
  const cron = {
    meses: 4,
    pct: { 1: [20, 35, 30, 15], 2: [50, 50, 0, 0] },
    origem: "importado",
    arquivo_nome: "x.xlsx",
  };
  it("para mais: colunas com 0, sem corte", () => {
    expect(ajustarMeses(cron, 6)).toEqual({
      cronograma: {
        meses: 6,
        pct: { 1: [20, 35, 30, 15, 0, 0], 2: [50, 50, 0, 0, 0, 0] },
        origem: "importado",
        arquivo_nome: "x.xlsx",
      },
      cortouValores: false,
    });
  });
  it("para menos: corta as do fim e avisa se havia valor", () => {
    const r = ajustarMeses(cron, 3);
    expect(r.cronograma.pct).toEqual({ 1: [20, 35, 30], 2: [50, 50, 0] });
    expect(r.cronograma.meses).toBe(3);
    expect(r.cortouValores).toBe(true);
    expect(linhaFecha(r.cronograma.pct[1])).toBe(false);
    expect(ajustarMeses({ meses: 4, pct: { 2: [50, 50, 0, 0] } }, 2).cortouValores).toBe(false);
  });
  it("mesmo número de meses não muda nada; não altera o objeto recebido", () => {
    const copia = JSON.parse(JSON.stringify(cron));
    expect(ajustarMeses(cron, 4)).toEqual({ cronograma: copia, cortouValores: false });
    expect(cron).toEqual(copia);
  });
  it("meses fora de 1 a 60 ou não inteiro lança RangeError", () => {
    for (const n of [0, 61, 2.5, NaN, "3", null]) {
      expect(() => ajustarMeses(cron, n)).toThrow(RangeError);
    }
  });
});

describe("reperiodizarLinha", () => {
  it("20/35/30/15 em 4 meses → 2 meses = 55/45", () => {
    expect(reperiodizarLinha([20, 35, 30, 15], 2)).toEqual([55, 45]);
  });
  it("20/35/30/15 → 8 meses mantém a forma e soma 100,00", () => {
    const r = reperiodizarLinha([20, 35, 30, 15], 8);
    expect(r).toEqual([10, 10, 17.5, 17.5, 15, 15, 7.5, 7.5]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("8 → 5", () => {
    const r = reperiodizarLinha([5, 10, 15, 20, 20, 15, 10, 5], 5);
    // limites em 1,6 · 3,2 · 4,8 · 6,4 · 8: C = 11 · 34 · 66 · 89 · 100
    expect(r).toEqual([11, 23, 32, 23, 11]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("maior resto: 8 × 12,5 → 3 meses = 33,34/33,33/33,33", () => {
    const r = reperiodizarLinha(new Array(8).fill(12.5), 3);
    expect(r).toEqual([33.34, 33.33, 33.33]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("3 → 2 com 33,33/33,33/33,34 fecha 100,00", () => {
    const r = reperiodizarLinha([33.33, 33.33, 33.34], 2);
    expect(r).toEqual([50, 50]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("2 → 4 → 2 volta ao original", () => {
    const ida = reperiodizarLinha([55, 45], 4);
    expect(ida).toEqual([27.5, 27.5, 22.5, 22.5]);
    expect(reperiodizarLinha(ida, 2)).toEqual([55, 45]);
  });
  it("linha com meses zerados", () => {
    expect(reperiodizarLinha([0, 0, 50, 50], 2)).toEqual([0, 100]);
    expect(reperiodizarLinha([0, 0, 50, 50], 8)).toEqual([0, 0, 0, 0, 25, 25, 25, 25]);
    expect(reperiodizarLinha([0, 0, 0], 5)).toEqual([0, 0, 0, 0, 0]);
  });
  it("linha que não fecha 100 mantém a soma", () => {
    const r = reperiodizarLinha([20, 30, 10], 2);
    expect(r).toEqual([35, 25]);
    expect(somaCentesimos(r)).toBe(6000);
    const r2 = reperiodizarLinha([10, 10, 10.01], 7);
    expect(somaCentesimos(r2)).toBe(3001);
  });
  it("todo N → M de 1 a 12 fecha 100,00 e não dá % negativo", () => {
    const base = [7.77, 12.34, 0, 25, 18.18, 9.09, 0.01, 27.61];
    expect(somaCentesimos(base)).toBe(10000);
    for (let M = 1; M <= 12; M++) {
      const r = reperiodizarLinha(base, M);
      expect(r).toHaveLength(M);
      expect(somaCentesimos(r)).toBe(10000);
      expect(r.every((v) => v >= 0)).toBe(true);
    }
  });
  it("linha vazia → zeros; meses inválidos lançam RangeError", () => {
    expect(reperiodizarLinha([], 3)).toEqual([0, 0, 0]);
    expect(() => reperiodizarLinha([100], 0)).toThrow(RangeError);
    expect(() => reperiodizarLinha([100], 61)).toThrow(RangeError);
  });
});

describe("reperiodizar", () => {
  it("todas as linhas, meses novos e origem manual", () => {
    const cron = {
      meses: 4,
      pct: { 1: [20, 35, 30, 15], 2: [0, 0, 50, 50] },
      origem: "importado",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
    };
    expect(reperiodizar(cron, 2)).toEqual({
      meses: 2,
      pct: { 1: [55, 45], 2: [0, 100] },
      origem: "manual",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
    });
  });
  it("cronograma vazio continua vazio, com os meses novos", () => {
    expect(reperiodizar({}, 5)).toEqual({ meses: 5, pct: {}, origem: "manual" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-ff.test.js 2>&1 | grep -E "Error|Test Files")
```

Esperado: `Error: Cannot find module './cronograma-ff'` (seguido do `Caused by: Error: Failed to load url ./cronograma-ff … Does the file exist?`) e `Test Files  1 failed (1)`.

- [ ] **Step 3: Implementar**

Crie `apps/web/src/lib/cronograma-ff.js`:

<!-- prettier-ignore -->
```js
/**
 * Cronograma físico-financeiro da oportunidade (spec
 * docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md §3 e §5).
 *
 * Funções puras, testadas em cronograma-ff.test.js. A aritmética é inteira: o % vira
 * centésimos (10000 = 100%) e o R$, centavos. O R$ nunca é gravado: sai do subtotal com
 * desconto de cada etapa de nível 1 (`subtotaisEtapas`) a cada cálculo.
 *
 * Cronograma = { meses, pct: { [numero da etapa]: number[] }, origem?, arquivo_nome?,
 *                atualizado_em? }
 * EtapaCron  = { numero, descricao, centavos }
 */
import { subtotaisEtapas } from "./orcamento-desconto";
import { compararNumeroItem, ordenarItensOportunidade } from "./orcamento-registros";

export const MAX_MESES = 60;

const ORIGENS = ["importado", "manual"];

/** Centésimos inteiros de um % com até 2 casas (33.33 → 3333; não numérico → 0). */
function centesimos(p) {
  const n = Number(p);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Arredonda em 2 casas, meio para cima, sem o erro de 1.005 × 100 = 100.49999… */
function duasCasas(v) {
  const s = String(v);
  const r = /e/i.test(s) ? Math.round(v * 100) / 100 : Number(`${Math.round(Number(`${s}e2`))}e-2`);
  return r === 0 ? 0 : r; // sem −0
}

/** parte ÷ total em %, com 2 casas (0 com total zero). */
function percentual(parte, total) {
  if (!total) return 0;
  return duasCasas((parte * 100) / total);
}

/** Inteiro de 1 a MAX_MESES; o resto lança RangeError. */
function conferirMeses(novoN) {
  if (!Number.isInteger(novoN) || novoN < 1 || novoN > MAX_MESES) {
    throw new RangeError(`O número de meses vai de 1 a ${MAX_MESES}`);
  }
  return novoN;
}

/** Corta ou completa com 0 até `n` posições. */
function noTamanho(linha, n) {
  return Array.from({ length: n }, (_, j) => linha[j] ?? 0);
}

/**
 * centavos × centésimos ÷ 10000, arredondado (meio para longe do zero). O produto passa de
 * 2^53 com etapas acima de R$ 9 bilhões: aí a conta vai em BigInt.
 */
function parteDaEtapa(cents, cent) {
  const p = cents * cent;
  if (Number.isSafeInteger(p)) return Math.sign(p) * Math.round(Math.abs(p) / 10000);
  const big = BigInt(cents) * BigInt(cent);
  const negativo = big < 0n;
  const q = ((negativo ? -big : big) + 5000n) / 10000n;
  return Number(negativo ? -q : q);
}

/**
 * Etapas de nível 1 do orçamento (`etapa === true` e `numero` sem ponto), na ordem da tela
 * (`ordenarItensOportunidade`: `ordem`, depois `numero`), com o subtotal com desconto em
 * centavos. Número repetido entra uma vez só (a primeira).
 */
export function etapasDoOrcamento(itens) {
  const lista = (itens || []).filter(Boolean);
  const subtotais = subtotaisEtapas(lista);
  const vistos = new Set();
  const etapas = [];
  for (const item of ordenarItensOportunidade(lista)) {
    if (item.etapa !== true || item.numero === null || item.numero === undefined) continue;
    const numero = String(item.numero).trim();
    if (!numero || numero.includes(".") || vistos.has(numero)) continue;
    vistos.add(numero);
    const subtotal = subtotais[String(item.numero)];
    etapas.push({
      numero,
      descricao: item.descricao ?? "",
      centavos: typeof subtotal === "number" ? Math.round(subtotal * 100) : 0,
    });
  }
  return etapas;
}

/**
 * Cronograma limpo a partir do que veio do banco (`oportunidade.cronograma_ff`).
 * - `{}`, null, array ou qualquer coisa que não seja objeto → { meses: 0, pct: {} };
 * - `meses` inteiro de 0 a MAX_MESES (fração cortada, fora da faixa vai ao limite);
 * - com `meses` 0 não sobra linha; com `meses` > 0 cada array é cortado ou completado com 0;
 * - % fora de 0 a 100 ou que não seja number vira 0; o resto fica com 2 casas;
 * - chave cujo valor não é array sai;
 * - `origem`, `arquivo_nome` e `atualizado_em` só ficam quando válidos.
 */
export function normalizarCronograma(obj) {
  const vazio = { meses: 0, pct: {} };
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return vazio;
  const m = Number(obj.meses);
  const meses = Number.isFinite(m) ? Math.min(MAX_MESES, Math.max(0, Math.trunc(m))) : 0;
  const pct = {};
  const origemPct =
    obj.pct && typeof obj.pct === "object" && !Array.isArray(obj.pct) ? obj.pct : {};
  if (meses > 0) {
    for (const [numero, linha] of Object.entries(origemPct)) {
      if (!Array.isArray(linha)) continue;
      pct[numero] = noTamanho(linha, meses).map((v) =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? duasCasas(v) : 0
      );
    }
  }
  const saida = { meses, pct };
  if (ORIGENS.includes(obj.origem)) saida.origem = obj.origem;
  if (typeof obj.arquivo_nome === "string") saida.arquivo_nome = obj.arquivo_nome;
  if (typeof obj.atualizado_em === "string") saida.atualizado_em = obj.atualizado_em;
  return saida;
}

/**
 * % digitado na grade: number, "12,5", "12.5", "12,5%", com espaços.
 * Vazio (null, undefined, "", só espaços, "%") → null. Texto que não seja número, sinal,
 * milhar ou valor fora de 0 a 100 → NaN. O resultado vem com 2 casas (33,335 → 33,34), e o
 * arredondamento vem antes da faixa: 100,004 → 100, mas 100,005 → 100,01 → NaN.
 */
export function lerPercentual(entrada) {
  if (entrada === null || entrada === undefined) return null;
  let n;
  if (typeof entrada === "number") {
    n = entrada;
  } else if (typeof entrada === "string") {
    const texto = entrada.replace(/\s+/g, "").replace(/%$/, "");
    if (texto === "") return null;
    if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(texto)) return NaN;
    n = Number(texto.replace(",", "."));
  } else {
    return NaN;
  }
  if (!Number.isFinite(n)) return NaN;
  const v = duasCasas(n);
  return v < 0 || v > 100 ? NaN : v;
}

/** Soma da linha em centésimos (10000 = 100,00%). */
export function somaCentesimos(linha) {
  return (linha || []).reduce((soma, p) => soma + centesimos(p), 0);
}

/** A linha soma exatamente 100,00%? */
export function linhaFecha(linha) {
  return somaCentesimos(linha) === 10000;
}

/**
 * R$ de cada mês da etapa, em centavos: arredondar(subtotal × % ÷ 100).
 * Se a linha fecha 100,00%, o último mês com % > 0 recebe a diferença, e a linha soma
 * exatamente o subtotal. Se não fecha, cada célula é só o arredondamento dela.
 */
export function valoresDaLinha(linha, centavosEtapa) {
  const cents = Math.round(Number(centavosEtapa) || 0);
  const cs = (linha || []).map(centesimos);
  const valores = cs.map((c) => parteDaEtapa(cents, c));
  if (cs.reduce((s, c) => s + c, 0) === 10000) {
    let ultimo = -1;
    cs.forEach((c, j) => {
      if (c > 0) ultimo = j;
    });
    const outros = valores.reduce((s, v, j) => (j === ultimo ? s : s + v), 0);
    valores[ultimo] = cents - outros;
  }
  return valores;
}

/**
 * Tudo o que a grade e a exportação mostram.
 * - linhas: uma por etapa, na ordem das etapas (etapa sem linha no cronograma = zeros), com
 *   peso (% da etapa no total), pct, valores (centavos), fecha e diferenca (100 − soma);
 * - meses: R$ do mês, % do mês sobre o total, acumulado em R$ e acumulado em %;
 * - totalCentavos: soma dos subtotais das etapas;
 * - todasFecham: há etapa e todas somam 100,00% (é o que libera o Exportar);
 * - orfas: números com linha no cronograma e sem etapa no orçamento (ordem natural).
 */
export function resumoCronograma(etapas, cron) {
  const c = normalizarCronograma(cron);
  const lista = etapas || [];
  const totalCentavos = lista.reduce((s, e) => s + (Number(e.centavos) || 0), 0);
  const linhas = lista.map((e) => {
    const pct = c.pct[e.numero] ? [...c.pct[e.numero]] : new Array(c.meses).fill(0);
    const soma = somaCentesimos(pct);
    return {
      numero: e.numero,
      descricao: e.descricao,
      centavos: e.centavos,
      peso: percentual(e.centavos, totalCentavos),
      pct,
      valores: valoresDaLinha(pct, e.centavos),
      fecha: soma === 10000,
      diferenca: (10000 - soma) / 100,
    };
  });
  const meses = [];
  let acumCentavos = 0;
  for (let j = 0; j < c.meses; j++) {
    const centavos = linhas.reduce((s, l) => s + l.valores[j], 0);
    acumCentavos += centavos;
    meses.push({
      centavos,
      pct: percentual(centavos, totalCentavos),
      acumCentavos,
      acumPct: percentual(acumCentavos, totalCentavos),
    });
  }
  const numeros = new Set(lista.map((e) => e.numero));
  const orfas = Object.keys(c.pct)
    .filter((n) => !numeros.has(n))
    .sort(compararNumeroItem);
  return {
    linhas,
    meses,
    totalCentavos,
    todasFecham: linhas.length > 0 && linhas.every((l) => l.fecha),
    orfas,
  };
}

/**
 * Muda o número de meses sem reperiodizar: a mais, colunas com 0; a menos, corta as do fim.
 * `cortouValores` = alguma coluna cortada tinha % > 0 (a tela pede confirmação).
 * Os outros campos (origem, arquivo_nome, atualizado_em) ficam como estão.
 * `novoN` fora de 1 a MAX_MESES (ou não inteiro) lança RangeError.
 */
export function ajustarMeses(cron, novoN) {
  const n = conferirMeses(novoN);
  const c = normalizarCronograma(cron);
  let cortouValores = false;
  const pct = {};
  for (const [numero, linha] of Object.entries(c.pct)) {
    if (linha.slice(n).some((v) => v > 0)) cortouValores = true;
    pct[numero] = noTamanho(linha, n);
  }
  return { cronograma: { ...c, meses: n, pct }, cortouValores };
}

/**
 * Reperiodiza uma linha de N para `novoN` meses mantendo a forma da curva:
 * 1. curva acumulada C nos limites dos meses (C(0) = 0 … C(N) = soma), linear entre eles;
 * 2. novos limites em t = j·N/M; o mês j recebe C(j·N/M) − C((j−1)·N/M);
 * 3. arredonda em centésimos pelo maior resto (empate: o mês mais cedo), e a soma da linha
 *    fica igual à de antes (100,00 se fechava).
 * Conta exata em inteiros: M·C(j·N/M) = M·C(q) + a[q]·r, com q = ⌊j·N/M⌋ e r = j·N mod M.
 * Linha vazia → zeros. `novoN` fora de 1 a MAX_MESES lança RangeError.
 */
export function reperiodizarLinha(linha, novoN) {
  const M = conferirMeses(novoN);
  const a = (linha || []).map(centesimos);
  const N = a.length;
  if (N === 0) return new Array(M).fill(0);
  const acum = [0];
  for (const v of a) acum.push(acum[acum.length - 1] + v);
  // D(j) = M × C(j·N/M), inteiro
  const D = (j) => {
    const q = Math.floor((j * N) / M);
    const r = (j * N) % M;
    return M * acum[q] + (r === 0 ? 0 : a[q] * r);
  };
  const base = [];
  const restos = [];
  for (let j = 1; j <= M; j++) {
    const exato = D(j) - D(j - 1); // M × (novo % em centésimos)
    base.push(Math.floor(exato / M));
    restos.push({ j: j - 1, resto: exato - Math.floor(exato / M) * M });
  }
  let falta = acum[N] - base.reduce((s, v) => s + v, 0);
  restos.sort((x, y) => y.resto - x.resto || x.j - y.j);
  for (let k = 0; falta > 0 && k < restos.length; k++, falta--) base[restos[k].j] += 1;
  return base.map((c) => c / 100);
}

/** Reperiodiza todas as linhas para `novoN` meses; o resultado é `origem: "manual"`. */
export function reperiodizar(cron, novoN) {
  const M = conferirMeses(novoN);
  const c = normalizarCronograma(cron);
  const pct = {};
  for (const [numero, linha] of Object.entries(c.pct)) pct[numero] = reperiodizarLinha(linha, M);
  return { ...c, meses: M, pct, origem: "manual" };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-ff.test.js)
```

Esperado: `Test Files  1 passed (1)` e `Tests  37 passed (37)`.

- [ ] **Step 5: Formatar e commitar**

```bash
npx prettier --write apps/web/src/lib/cronograma-ff.js apps/web/src/lib/cronograma-ff.test.js
git status --short
git add apps/web/src/lib/cronograma-ff.js apps/web/src/lib/cronograma-ff.test.js
git commit -F - -- apps/web/src/lib/cronograma-ff.js apps/web/src/lib/cronograma-ff.test.js <<'EOF'
feat(cronograma): contas do cronograma físico-financeiro em centésimos e centavos

cronograma-ff.js: etapas de nível 1 do orçamento com o subtotal com desconto, normalização do
cronograma_ff, leitura do % digitado, R$ por célula com o centavo absorvido no último mês com %,
totais e acumulados, mudar meses e reperiodizar pela curva acumulada linear, com arredondamento
pelo maior resto que mantém a soma da linha. Spec 2026-10-05 §3 e §5.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Esperado: o Prettier não muda nada (`unchanged`), o commit sai e o `git log` mostra `feat(cronograma): contas do cronograma físico-financeiro em centésimos e centavos`.

---

### Task 2: Aba `Cronograma` do modelo SIGO — ler, validar e gerar (`lib/cronograma-modelo.js` + `gerarModelo`)

**Files:**

- Create: `apps/web/src/lib/cronograma-modelo.js`
- Test: `apps/web/src/lib/cronograma-modelo.test.js`
- Modify: `apps/web/src/lib/orcamento-modelo.js` (import e `gerarModelo`, linhas 14 e 307-342)
- Modify: `apps/web/src/lib/orcamento-modelo.test.js` (import e `describe("gerarModelo")`, linhas 13-14 e 88-113)

**Interfaces:**

- Consumes:
  - `MAX_MESES`, `lerPercentual` e `somaCentesimos` (Task 1);
  - `normalizarTexto` de `./busca` (a mesma comparação de rótulos do `orcamento-modelo.js`);
  - SheetJS `xlsx` 0.18.5 (`XLSX.read` com `cellNF`, `XLSX.SSF.is_date`).
- Produces (nomes do contrato):
  - `ABA_CRONOGRAMA = "Cronograma"`;
  - `cabecalhoCronograma(meses = 12): string[]` → `["Item", "Descrição", "Mês 1", …, "Mês <meses>"]` (`cabecalhoCronograma(0)` = `["Item", "Descrição"]`);
  - `lerAbaCronograma(wb, numerosEtapas): { cronograma, erros, avisos, resumo }`:
    - `cronograma` = `{ meses, pct, origem: "importado" }` sem erros, ou `null` com erros; quem grava acrescenta `arquivo_nome` e `atualizado_em`;
    - `resumo` = `{ meses, linhas, ignoradas, faltando }`, todos **números** (meses lidos, linhas importadas, linhas ignoradas e etapas do orçamento sem linha);
    - `numerosEtapas` = `etapasDoOrcamento(itens).map((e) => e.numero)`;
  - `lerArquivoCronograma(buffer, numerosEtapas)` — `XLSX.read(buffer, { type: "array", cellNF: true, sheetStubs: true })`; arquivo que não é planilha → `{ cronograma: null, erros: ["Não foi possível ler o arquivo como planilha Excel (.xlsx)."], avisos: [], resumo: { meses: 0, linhas: 0, ignoradas: 0, faltando: 0 } }`. O `sheetStubs` (além do `cellNF` do contrato) é o mesmo do `lerArquivoModelo`: mantém a fórmula sem valor salvo, para acusar o erro em vez de ler 0.
  - `gerarModelo()` (já existe em `orcamento-modelo.js`) passa a ter 3 abas: `Orçamento`, `Informações` e `Cronograma` (`cabecalhoCronograma(12)`, coluna A em Texto nas linhas 2 a 501, como a aba Orçamento).
- **Sem dependência circular:** `orcamento-modelo.js` importa `ABA_CRONOGRAMA` e `cabecalhoCronograma` de `cronograma-modelo.js`, e este **não** importa `orcamento-modelo.js`. Por isso ele repete 7 utilitários pequenos de célula (`normalizarRotulo`, `acharAba`, `celula`, `formulaSemValor`, `vazia`, `textoCelula`, `formatoData`); a leitura do número é a do `lerPercentual` (Task 1), não uma cópia do `lerNumeroBR`.
- **Regras de leitura (spec §6) e as mensagens exatas:**
  - cabeçalho na linha 1, em qualquer ordem, sem acento, maiúsculas nem espaços extras (`MES 2`, `mês  3` e `Mes1` valem); meses = maior n de `Mês n`;
  - valores: número de 0 a 100; texto pt-BR (`12,5`, `12.5%`, `25 %`, com espaços nas pontas ou não); célula com formato de % (`z` com `%` fora de aspas, colchetes e escapes; sem `z`, o texto exibido terminado em `%`), que vale × 100 (`0,07` → 7, sem o ruído `7.000000000000001`); vazio = 0;
  - **erros** (bloqueiam):
    - `A planilha não tem a aba "Cronograma". Use o modelo do SIGO preenchido pela skill do Claude.`
    - `Linha 1: falta a coluna Item.` e `Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).`
    - `Linha N, Mês J: % negativo (-5).` e `Linha N, Mês J: % acima de 100 (120).` (número ou formato de %)
    - `Linha N, Mês J: "abc" não é um % de 0 a 100.` (texto não numérico, com sinal ou fora da faixa)
    - `Linha N: Item 1 repetido (já está na linha 2).`
    - `Linha N, Mês J: fórmula sem valor salvo; grave o número.`, `Linha N, Mês J: virou data no Excel ("10/1/26"); formate como Número.` e `Linha N, Mês J: "TRUE" não é um número.`
    - **fora da lista da spec, para não trocar o cronograma atual por um vazio:** `A aba "Cronograma" não tem linhas preenchidas.` (é o caso do modelo em branco) e `Nenhuma linha da aba "Cronograma" tem o Item de uma etapa do orçamento.`
  - **avisos** (não bloqueiam):
    - `Linha N: a etapa 1 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.`
    - `Linha N: Item 9 não é etapa do orçamento; foi ignorado.` (as células dessa linha não são validadas)
    - `Etapa 2 do orçamento sem linha no cronograma; fica vazia.`
    - `Linha N, Mês J: % com mais de 2 casas; arredondado para 33,33.`
    - fora da lista da spec: `Linha 1: colunas depois do Mês 60 foram ignoradas.`, `Linha 1: a coluna Mês 1 se repete; vale a primeira.`, `Linha 1: falta a coluna Mês 2; o mês fica com 0%.` e `Linha N: linha sem Item; foi ignorada.`
  - linha sem Item e sem valor nos meses (em branco, ou só com Descrição) é pulada sem aviso.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/lib/cronograma-modelo.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  ABA_CRONOGRAMA,
  cabecalhoCronograma,
  lerAbaCronograma,
  lerArquivoCronograma,
} from "./cronograma-modelo";
import { ABA_ORCAMENTO, gerarModelo } from "./orcamento-modelo";

const CAB4 = cabecalhoCronograma(4);
const ETAPAS = ["1", "2"];

/** Workbook em memória só com a aba Cronograma (e a Orçamento, como no arquivo da skill). */
function montarWb(linhas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item"]]), ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), ABA_CRONOGRAMA);
  return wb;
}

/** Bytes do .xlsx, como o `await file.arrayBuffer()` do navegador entrega. */
function comoArquivo(wb) {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

const OK = [CAB4, ["1", "SERVIÇOS DE ELÉTRICA", 20, 35, 30, 15], ["2", "POSTES", 0, 50, 50, 0]];

describe("constantes", () => {
  it("nome da aba e cabeçalho", () => {
    expect(ABA_CRONOGRAMA).toBe("Cronograma");
    expect(cabecalhoCronograma(3)).toEqual(["Item", "Descrição", "Mês 1", "Mês 2", "Mês 3"]);
    expect(cabecalhoCronograma(0)).toEqual(["Item", "Descrição"]);
    const padrao = cabecalhoCronograma();
    expect(padrao).toHaveLength(14);
    expect(padrao[13]).toBe("Mês 12");
  });
});

describe("lerAbaCronograma — caminho feliz", () => {
  it("lê meses e % por etapa (arquivo gravado e relido)", () => {
    const r = lerArquivoCronograma(comoArquivo(montarWb(OK)), ETAPAS);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.cronograma).toEqual({
      meses: 4,
      pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0] },
      origem: "importado",
    });
    expect(r.resumo).toEqual({ meses: 4, linhas: 2, ignoradas: 0, faltando: 0 });
  });
  it("cabeçalho com variações (acento, maiúsculas, espaços e ordem)", () => {
    const r = lerAbaCronograma(
      montarWb([
        ["MES 2", " ITEM ", "descricao", "Mes1", "mês  3"],
        [35, "1", "x", 20, 45],
        [50, 2, "y", 50, 0],
      ]),
      ETAPAS
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct).toEqual({ 1: [20, 35, 45], 2: [50, 50, 0] });
    expect(r.resumo.meses).toBe(3);
  });
  it("% como número, como texto pt-BR e com formato de %; vazio = 0", () => {
    const wb = montarWb([
      CAB4,
      ["1", "A", "12,5", "12.5%", " 25 % ", null],
      ["2", "B", 0, 0, 0, 0],
    ]);
    const ws = wb.Sheets[ABA_CRONOGRAMA];
    ws.F2 = { t: "n", v: 0.5, z: "0%" };
    ws.C3 = { t: "n", v: 0.075, z: "0.0%" };
    ws.D3 = { t: "n", v: 0.07, z: "0.00%" };
    ws.E3 = { t: "n", v: 85.5, z: '0.0"%"' }; // % literal: o valor já está em %
    const r = lerArquivoCronograma(comoArquivo(wb), ETAPAS);
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct).toEqual({ 1: [12.5, 12.5, 25, 50], 2: [7.5, 7, 85.5, 0] });
    expect(r.avisos).toEqual([]);
  });
  it("% com formato sem `z` (workbook em memória): vale o texto exibido", () => {
    const wb = montarWb([CAB4, ["1", "A", 0, 0, 0, 0]]);
    wb.Sheets[ABA_CRONOGRAMA].C2 = { t: "n", v: 1, w: "100%" };
    expect(lerAbaCronograma(wb, ["1"]).cronograma.pct).toEqual({ 1: [100, 0, 0, 0] });
  });
  it("60 meses; colunas depois do Mês 60 são ignoradas", () => {
    const cab = cabecalhoCronograma(61);
    const linha = ["1", "A", ...new Array(59).fill(1.67), 1.47, 5];
    const r = lerArquivoCronograma(comoArquivo(montarWb([cab, linha])), ["1"]);
    expect(r.erros).toEqual([]);
    expect(r.resumo.meses).toBe(60);
    expect(r.cronograma.pct[1]).toHaveLength(60);
    expect(r.cronograma.pct[1][59]).toBe(1.47);
    expect(r.avisos).toEqual(["Linha 1: colunas depois do Mês 60 foram ignoradas."]);
  });
  it("linhas em branco e linha só com descrição não contam", () => {
    const r = lerAbaCronograma(
      montarWb([CAB4, [], ["", "nota solta"], ["1", "A", 100, 0, 0, 0], ["2", "B", 0, 0, 0, 100]]),
      ETAPAS
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.resumo).toEqual({ meses: 4, linhas: 2, ignoradas: 0, faltando: 0 });
  });
});

describe("lerAbaCronograma — erros", () => {
  it("sem a aba Cronograma (arquivo só com o orçamento)", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item"]]), ABA_ORCAMENTO);
    const r = lerArquivoCronograma(comoArquivo(wb), ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual([
      'A planilha não tem a aba "Cronograma". Use o modelo do SIGO preenchido pela skill do Claude.',
    ]);
    expect(r.resumo).toEqual({ meses: 0, linhas: 0, ignoradas: 0, faltando: 0 });
  });
  it("arquivo que nem é planilha", () => {
    const r = lerArquivoCronograma(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual(["Não foi possível ler o arquivo como planilha Excel (.xlsx)."]);
  });
  it("cabeçalho sem Item ou sem nenhum Mês n", () => {
    const erros = (cabecalho) => lerAbaCronograma(montarWb([cabecalho, ["1", 100]]), ETAPAS).erros;
    expect(erros(["Descrição", "Mês 1"])).toEqual(["Linha 1: falta a coluna Item."]);
    expect(erros(["Item", "Total"])).toEqual([
      "Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).",
    ]);
    expect(lerAbaCronograma(montarWb([]), ETAPAS).erros).toEqual([
      "Linha 1: falta a coluna Item.",
      "Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).",
    ]);
  });
  it("% negativo, acima de 100 (também com formato de %) e texto não numérico", () => {
    const wb = montarWb([CAB4, ["1", "A", -5, 120, "abc", "-3"], ["2", "B", 0, 0, 0, 0]]);
    wb.Sheets[ABA_CRONOGRAMA].D3 = { t: "n", v: 1.2, z: "0%" };
    const r = lerArquivoCronograma(comoArquivo(wb), ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual([
      "Linha 2, Mês 1: % negativo (-5).",
      "Linha 2, Mês 2: % acima de 100 (120).",
      'Linha 2, Mês 3: "abc" não é um % de 0 a 100.',
      'Linha 2, Mês 4: "-3" não é um % de 0 a 100.',
      "Linha 3, Mês 2: % acima de 100 (120).",
    ]);
  });
  it("Item repetido", () => {
    const r = lerAbaCronograma(
      montarWb([
        CAB4,
        ["1", "A", 100, 0, 0, 0],
        ["2", "B", 100, 0, 0, 0],
        ["1", "C", 0, 0, 0, 100],
      ]),
      ETAPAS
    );
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual(["Linha 4: Item 1 repetido (já está na linha 2)."]);
  });
  it("fórmula sem valor salvo, data e booleano numa célula de mês", () => {
    const wb = montarWb([CAB4, ["1", "A", 0, 0, 0, 0]]);
    const ws = wb.Sheets[ABA_CRONOGRAMA];
    ws.C2 = { t: "z", f: "10*2" };
    ws.D2 = { t: "n", v: 46296, z: "m/d/yy", w: "10/1/26" };
    ws.E2 = { t: "b", v: true, w: "TRUE" };
    expect(lerAbaCronograma(wb, ["1"]).erros).toEqual([
      "Linha 2, Mês 1: fórmula sem valor salvo; grave o número.",
      'Linha 2, Mês 2: virou data no Excel ("10/1/26"); formate como Número.',
      'Linha 2, Mês 3: "TRUE" não é um número.',
    ]);
  });
  it("aba vazia (modelo em branco) ou sem nenhuma etapa do orçamento", () => {
    const branco = lerArquivoCronograma(comoArquivo(gerarModelo()), ETAPAS);
    expect(branco.cronograma).toBeNull();
    expect(branco.erros).toEqual(['A aba "Cronograma" não tem linhas preenchidas.']);
    const outras = lerAbaCronograma(montarWb([CAB4, ["7", "X", 100, 0, 0, 0]]), ETAPAS);
    expect(outras.erros).toEqual([
      'Nenhuma linha da aba "Cronograma" tem o Item de uma etapa do orçamento.',
    ]);
  });
});

describe("lerAbaCronograma — avisos", () => {
  it("linha que não soma 100,00 entra assim mesmo", () => {
    const r = lerAbaCronograma(
      montarWb([CAB4, ["1", "A", 20, 35, 30, 14.99], ["2", "B", 50, 50, 10, 0]]),
      ETAPAS
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct[1]).toEqual([20, 35, 30, 14.99]);
    expect(r.avisos).toEqual([
      "Linha 2: a etapa 1 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.",
      "Linha 3: a etapa 2 soma 110,00%, e não 100,00%; fica vermelha até ser corrigida.",
    ]);
  });
  it("Item sem etapa no orçamento é ignorado; etapa sem linha fica vazia", () => {
    const r = lerAbaCronograma(
      montarWb([
        CAB4,
        ["1", "A", 100, 0, 0, 0],
        ["1.1", "Sub", 100, 0, 0, 0],
        ["9", "X", 0, 0, 0, 0],
      ]),
      ["1", "2", "3"]
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct).toEqual({ 1: [100, 0, 0, 0] });
    expect(r.avisos).toEqual([
      "Linha 3: Item 1.1 não é etapa do orçamento; foi ignorado.",
      "Linha 4: Item 9 não é etapa do orçamento; foi ignorado.",
      "Etapa 2 do orçamento sem linha no cronograma; fica vazia.",
      "Etapa 3 do orçamento sem linha no cronograma; fica vazia.",
    ]);
    expect(r.resumo).toEqual({ meses: 4, linhas: 1, ignoradas: 2, faltando: 2 });
  });
  it("% com mais de 2 casas é arredondado", () => {
    const linha = ["1", "A", 33.333, "33,3333", 33.334, "0,000"];
    const r = lerAbaCronograma(montarWb([CAB4, linha]), ["1"]);
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct[1]).toEqual([33.33, 33.33, 33.33, 0]);
    expect(r.avisos).toEqual([
      "Linha 2, Mês 1: % com mais de 2 casas; arredondado para 33,33.",
      "Linha 2, Mês 2: % com mais de 2 casas; arredondado para 33,33.",
      "Linha 2, Mês 3: % com mais de 2 casas; arredondado para 33,33.",
      "Linha 2: a etapa 1 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.",
    ]);
  });
  it("linha sem Item, Mês faltando no meio e coluna repetida", () => {
    const r = lerAbaCronograma(
      montarWb([
        ["Item", "Descrição", "Mês 1", "Mês 3", "Mês 1"],
        ["1", "A", 40, 60, 99],
        ["", "B", 10, 0, 0],
      ]),
      ["1"]
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma).toEqual({ meses: 3, pct: { 1: [40, 0, 60] }, origem: "importado" });
    expect(r.avisos).toEqual([
      "Linha 1: a coluna Mês 1 se repete; vale a primeira.",
      "Linha 1: falta a coluna Mês 2; o mês fica com 0%.",
      "Linha 3: linha sem Item; foi ignorada.",
    ]);
    expect(r.resumo).toEqual({ meses: 3, linhas: 1, ignoradas: 1, faltando: 0 });
  });
});
```

- [ ] **Step 2: Atualizar o teste do `gerarModelo` (3 trocas old→new com a ferramenta Edit em `apps/web/src/lib/orcamento-modelo.test.js`)**

O teste do modelo em branco passa a esperar a 3ª aba e ganha um caso para ela. Aplique cada troca com a ferramenta **Edit**, na ordem.

2.1 — import do teste (linhas 13-14)

old:

<!-- prettier-ignore -->
```js
  lerArquivoModelo,
} from "./orcamento-modelo";
```

new:

<!-- prettier-ignore -->
```js
  lerArquivoModelo,
} from "./orcamento-modelo";
import { ABA_CRONOGRAMA, cabecalhoCronograma } from "./cronograma-modelo";
```

2.2 — o modelo passa a ter três abas (linhas 89-91)

old:

<!-- prettier-ignore -->
```js
  it("duas abas, cabeçalho, coluna A como Texto e rótulos", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    expect(wb.SheetNames).toEqual([ABA_ORCAMENTO, ABA_INFORMACOES]);
```

new:

<!-- prettier-ignore -->
```js
  it("três abas, cabeçalho, coluna A como Texto e rótulos", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    expect(wb.SheetNames).toEqual([ABA_ORCAMENTO, ABA_INFORMACOES, ABA_CRONOGRAMA]);
```

2.3 — teste novo da aba Cronograma, no fim do `describe("gerarModelo")` (linhas 110-112)

old:

<!-- prettier-ignore -->
```js
      else expect(info[`B${i + 1}`].z).toBe("@");
    });
  });
```

new:

<!-- prettier-ignore -->
```js
      else expect(info[`B${i + 1}`].z).toBe("@");
    });
  });
  it("aba Cronograma: Item, Descrição e Mês 1 a Mês 12, coluna A como Texto", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    const cron = wb.Sheets[ABA_CRONOGRAMA];
    expect(XLSX.utils.sheet_to_json(cron, { header: 1 })[0]).toEqual(cabecalhoCronograma(12));
    expect(cron.N1.v).toBe("Mês 12");
    expect(cron.A2.z).toBe("@");
    expect(cron.A501.z).toBe("@");
    expect(cron["!ref"]).toBe("A1:N501");
    const larguras = gerarModelo().Sheets[ABA_CRONOGRAMA]["!cols"].map((c) => c.wch);
    expect(larguras).toEqual([10, 50, ...new Array(12).fill(9)]);
  });
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-modelo.test.js src/lib/orcamento-modelo.test.js 2>&1 | grep -E "Error|Test Files")
```

Esperado: `Error: Cannot find module './cronograma-modelo'` (nos dois arquivos) e `Test Files  2 failed (2)`.

- [ ] **Step 4: Implementar a leitura**

Crie `apps/web/src/lib/cronograma-modelo.js`:

<!-- prettier-ignore -->
```js
/**
 * Aba `Cronograma` do modelo SIGO (.xlsx): nome da aba, cabeçalho e a leitura/validação da
 * aba preenchida pela skill do Claude (spec
 * docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md §6).
 *
 * `orcamento-modelo.js` importa daqui o nome e o cabeçalho para o `gerarModelo`; por isso este
 * arquivo NÃO importa `orcamento-modelo.js` (sem dependência circular) e repete os poucos
 * utilitários de célula de que precisa.
 *
 * Funções puras: recebem o workbook do SheetJS (ou o ArrayBuffer do arquivo) e devolvem
 * { cronograma, erros, avisos, resumo }. Mensagens por linha usam a linha do Excel.
 */
import * as XLSX from "xlsx";
import { normalizarTexto } from "./busca";
import { MAX_MESES, lerPercentual, somaCentesimos } from "./cronograma-ff";

export const ABA_CRONOGRAMA = "Cronograma";

/** ["Item", "Descrição", "Mês 1", …, "Mês <meses>"]. */
export function cabecalhoCronograma(meses = 12) {
  return ["Item", "Descrição", ...Array.from({ length: meses }, (_, j) => `Mês ${j + 1}`)];
}

// ---------------------------------------------------------------- utilidades

function normalizarRotulo(s) {
  return normalizarTexto(s).replace(/\s+/g, " ").trim();
}

function acharAba(wb, nome) {
  const alvo = normalizarRotulo(nome);
  return (wb?.SheetNames || []).find((n) => normalizarRotulo(n) === alvo);
}

function celula(ws, r, c) {
  return c === undefined ? undefined : ws[XLSX.utils.encode_cell({ r, c })];
}

/** Fórmula gravada sem o valor calculado (openpyxl faz isso); com sheetStubs vem t "z". */
function formulaSemValor(cel) {
  return Boolean(cel?.f) && (cel.t === "z" || cel.v === undefined || cel.v === null);
}

function vazia(cel) {
  if (formulaSemValor(cel)) return false;
  if (!cel || cel.t === "z" || cel.v === undefined || cel.v === null) return true;
  return typeof cel.v === "string" && cel.v.trim() === "";
}

/** Texto do Item. Número inteiro vira "1" (o `w` podia vir "1.0" ou "1E+0"). */
function textoCelula(cel) {
  if (vazia(cel) || formulaSemValor(cel)) return "";
  if (cel.t === "n" && Number.isInteger(cel.v)) return String(cel.v);
  return String(cel.w ?? cel.v).trim();
}

/** Formato da célula sem "textos", [cores/locale] e \escapes (0"%" não é percentual). */
function formatoLimpo(cel) {
  return typeof cel?.z === "string" ? cel.z.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "") : null;
}

/** Célula com formato de % (0,2 exibido como 20%): o valor guardado é a fração. */
function formatoPercentual(cel) {
  const z = formatoLimpo(cel);
  if (z !== null) return z.includes("%");
  const exibido = String(cel?.w ?? "").trim();
  return exibido.endsWith("%");
}

function formatoData(cel) {
  return typeof cel?.z === "string" && XLSX.SSF.is_date(cel.z);
}

function formatar(v, minimo, maximo) {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
  });
}

const pct2 = (v) => formatar(v, 2, 2);

/**
 * % de uma célula de mês: { valor } (0 a 100, 2 casas), com `maisCasas` quando foi
 * arredondado, ou { erro }. Vazio = 0.
 */
function lerCelulaPct(cel) {
  if (formulaSemValor(cel)) return { erro: "fórmula sem valor salvo; grave o número" };
  if (vazia(cel)) return { valor: 0, maisCasas: false };
  if (cel.t === "n" && typeof cel.v === "number") {
    if (formatoData(cel)) {
      return { erro: `virou data no Excel ("${cel.w ?? cel.v}"); formate como Número` };
    }
    // 0,07 × 100 = 7.000000000000001: tira o ruído antes de contar as casas
    const v = formatoPercentual(cel) ? Number((cel.v * 100).toPrecision(15)) : cel.v;
    if (v < 0) return { erro: `% negativo (${formatar(v, 0, 4)})` };
    if (v > 100) return { erro: `% acima de 100 (${formatar(v, 0, 4)})` };
    return { valor: lerPercentual(v), maisCasas: Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 };
  }
  if (cel.t === "s") {
    const texto = String(cel.v).trim();
    const valor = lerPercentual(texto);
    if (Number.isNaN(valor)) return { erro: `"${texto}" não é um % de 0 a 100` };
    const decimais = (/[.,](\d+)/.exec(texto)?.[1] ?? "").replace(/0+$/, "");
    return { valor: valor ?? 0, maisCasas: decimais.length > 2 };
  }
  return { erro: `"${cel.w ?? cel.v}" não é um número` };
}

function resumoVazio() {
  return { meses: 0, linhas: 0, ignoradas: 0, faltando: 0 };
}

// ---------------------------------------------------------------- API

/**
 * Lê e valida a aba `Cronograma` (regras da spec §6). `numerosEtapas` = números das etapas de
 * nível 1 do orçamento (`etapasDoOrcamento(...).map((e) => e.numero)`).
 * - cabeçalho na linha 1, comparado sem acento/maiúsculas/espaços extras; meses = maior n de
 *   "Mês n" (até MAX_MESES; colunas além disso são ignoradas);
 * - % como número 0–100, texto pt-BR ("12,5", "12,5%") ou célula com formato de % (× 100);
 *   vazio = 0;
 * - erros bloqueiam (`cronograma` null); avisos só informam;
 * - resumo: meses, linhas importadas, linhas ignoradas e etapas sem linha (`faltando`).
 * O cronograma sai com `origem: "importado"`; quem grava acrescenta `arquivo_nome` e
 * `atualizado_em`.
 */
export function lerAbaCronograma(wb, numerosEtapas) {
  const erros = [];
  const avisos = [];
  const resumo = resumoVazio();
  const pct = {};
  const resultado = () => ({
    cronograma: erros.length === 0 ? { meses: resumo.meses, pct, origem: "importado" } : null,
    erros,
    avisos,
    resumo,
  });

  const nomeAba = acharAba(wb, ABA_CRONOGRAMA);
  if (!nomeAba) {
    erros.push(
      `A planilha não tem a aba "${ABA_CRONOGRAMA}". Use o modelo do SIGO preenchido pela skill ` +
        `do Claude.`
    );
    return resultado();
  }
  const ws = wb.Sheets[nomeAba];

  // Cabeçalho na linha 1: Item, Descrição e Mês 1…Mês N, em qualquer ordem.
  let colItem;
  const colMes = new Map();
  let alemDoLimite = false;
  if (ws["!ref"]) {
    const faixa = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      const rotulo = normalizarRotulo(textoCelula(celula(ws, 0, c)));
      if (rotulo === "item") {
        if (colItem === undefined) colItem = c;
        continue;
      }
      const m = /^mes ?(\d+)$/.exec(rotulo);
      if (!m || Number(m[1]) < 1) continue;
      const n = Number(m[1]);
      if (n > MAX_MESES) {
        alemDoLimite = true;
      } else if (colMes.has(n)) {
        avisos.push(`Linha 1: a coluna Mês ${n} se repete; vale a primeira.`);
      } else {
        colMes.set(n, c);
      }
    }
  }
  if (colItem === undefined) erros.push("Linha 1: falta a coluna Item.");
  if (colMes.size === 0) {
    erros.push("Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).");
  }
  if (erros.length > 0) return resultado();

  const meses = Math.max(...colMes.keys());
  resumo.meses = meses;
  if (alemDoLimite) avisos.push(`Linha 1: colunas depois do Mês ${MAX_MESES} foram ignoradas.`);
  for (let n = 1; n <= meses; n++) {
    if (!colMes.has(n)) avisos.push(`Linha 1: falta a coluna Mês ${n}; o mês fica com 0%.`);
  }

  // Linhas com algum dado no Item ou nos meses (pelas células que existem, não pelo !ref).
  const colunasUsadas = new Set([colItem, ...colMes.values()]);
  const comDados = new Set();
  for (const endereco of Object.keys(ws)) {
    if (endereco[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(endereco);
    if (r > 0 && colunasUsadas.has(c) && !vazia(ws[endereco])) comDados.add(r);
  }
  const linhas = [...comDados].sort((a, b) => a - b);

  const etapas = new Set((numerosEtapas || []).map(String));
  const linhaDoNumero = new Map();
  for (const r of linhas) {
    const n = r + 1;
    const numero = textoCelula(celula(ws, r, colItem));
    if (!numero) {
      avisos.push(`Linha ${n}: linha sem Item; foi ignorada.`);
      resumo.ignoradas++;
      continue;
    }
    if (linhaDoNumero.has(numero)) {
      erros.push(
        `Linha ${n}: Item ${numero} repetido (já está na linha ${linhaDoNumero.get(numero)}).`
      );
      continue;
    }
    linhaDoNumero.set(numero, n);
    if (!etapas.has(numero)) {
      avisos.push(`Linha ${n}: Item ${numero} não é etapa do orçamento; foi ignorado.`);
      resumo.ignoradas++;
      continue;
    }
    const valores = [];
    let comErro = false;
    for (let j = 1; j <= meses; j++) {
      const { valor, maisCasas, erro } = lerCelulaPct(celula(ws, r, colMes.get(j)));
      if (erro) {
        erros.push(`Linha ${n}, Mês ${j}: ${erro}.`);
        comErro = true;
        continue;
      }
      if (maisCasas) {
        avisos.push(
          `Linha ${n}, Mês ${j}: % com mais de 2 casas; arredondado para ${pct2(valor)}.`
        );
      }
      valores.push(valor);
    }
    if (comErro) continue;
    pct[numero] = valores;
    resumo.linhas++;
    const soma = somaCentesimos(valores);
    if (soma !== 10000) {
      avisos.push(
        `Linha ${n}: a etapa ${numero} soma ${pct2(soma / 100)}%, e não 100,00%; ` +
          `fica vermelha até ser corrigida.`
      );
    }
  }

  if (erros.length === 0 && resumo.linhas === 0) {
    erros.push(
      linhas.length === 0
        ? `A aba "${ABA_CRONOGRAMA}" não tem linhas preenchidas.`
        : `Nenhuma linha da aba "${ABA_CRONOGRAMA}" tem o Item de uma etapa do orçamento.`
    );
    return resultado();
  }
  for (const numero of etapas) {
    if (linhaDoNumero.has(numero)) continue;
    avisos.push(`Etapa ${numero} do orçamento sem linha no cronograma; fica vazia.`);
    resumo.faltando++;
  }
  return resultado();
}

/**
 * Lê o arquivo (ArrayBuffer/Uint8Array de `await file.arrayBuffer()`) e valida a aba.
 * `cellNF` traz o formato (`z`) de cada célula, que é como se reconhece o % (0,2 = 20%);
 * `sheetStubs` mantém a fórmula sem valor salvo, para acusar o erro em vez de ler 0.
 */
export function lerArquivoCronograma(buffer, numerosEtapas) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", cellNF: true, sheetStubs: true });
  } catch {
    return {
      cronograma: null,
      erros: ["Não foi possível ler o arquivo como planilha Excel (.xlsx)."],
      avisos: [],
      resumo: resumoVazio(),
    };
  }
  return lerAbaCronograma(wb, numerosEtapas);
}
```

- [ ] **Step 5: Rodar e ver só os testes da 3ª aba falharem**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-modelo.test.js src/lib/orcamento-modelo.test.js 2>&1 | grep -E "×|Tests ")
```

Esperado: 3 falhas, todas pela aba que o `gerarModelo` ainda não cria:

- `lerAbaCronograma — erros > aba vazia (modelo em branco) ou sem nenhuma etapa do orçamento`;
- `gerarModelo > três abas, cabeçalho, coluna A como Texto e rótulos`;
- `gerarModelo > aba Cronograma: Item, Descrição e Mês 1 a Mês 12, coluna A como Texto`;

e `Tests  3 failed | 76 passed (79)`.

- [ ] **Step 6: A 3ª aba no `gerarModelo` (3 trocas old→new com a ferramenta Edit em `apps/web/src/lib/orcamento-modelo.js`)**

A aba usa o mesmo `LINHAS_MODELO` (500) da aba Orçamento para a coluna A em Texto. Aplique cada troca com a ferramenta **Edit**, na ordem.

2.4 — import do nome e do cabeçalho da aba (linha 14)

old:

<!-- prettier-ignore -->
```js
import { totalLinha } from "@/lib/orcamento-desconto";
```

new:

<!-- prettier-ignore -->
```js
import { totalLinha } from "@/lib/orcamento-desconto";
import { ABA_CRONOGRAMA, cabecalhoCronograma } from "@/lib/cronograma-modelo";
```

2.5 — comentário do `gerarModelo` (linha 307)

old:

<!-- prettier-ignore -->
```js
/** Modelo em branco: aba Orçamento (cabeçalho + coluna A como Texto) e aba Informações. */
```

new:

<!-- prettier-ignore -->
```js
/**
 * Modelo em branco: aba Orçamento (cabeçalho + coluna A como Texto), aba Informações e aba
 * Cronograma (opcional; Item | Descrição | Mês 1…Mês 12, coluna A como Texto).
 */
```

2.6 — a aba Cronograma no fim do `gerarModelo` (linhas 337-341)

old:

<!-- prettier-ignore -->
```js
  informacoes["!cols"] = [{ wch: 26 }, { wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, orcamento, ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, informacoes, ABA_INFORMACOES);
  return wb;
```

new:

<!-- prettier-ignore -->
```js
  informacoes["!cols"] = [{ wch: 26 }, { wch: 80 }];
  const cabecalho = cabecalhoCronograma(12);
  const cronograma = XLSX.utils.aoa_to_sheet([cabecalho]);
  for (let r = 1; r <= LINHAS_MODELO; r++) {
    cronograma[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: "", z: "@" };
  }
  cronograma["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: LINHAS_MODELO, c: cabecalho.length - 1 },
  });
  cronograma["!cols"] = [{ wch: 10 }, { wch: 50 }, ...cabecalho.slice(2).map(() => ({ wch: 9 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, orcamento, ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, informacoes, ABA_INFORMACOES);
  XLSX.utils.book_append_sheet(wb, cronograma, ABA_CRONOGRAMA);
  return wb;
```

- [ ] **Step 7: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-modelo.test.js src/lib/orcamento-modelo.test.js)
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Esperado:

- `Test Files  2 passed (2)` e `Tests  79 passed (79)` (18 do cronograma e 61 do modelo, que tinha 60);
- a suíte inteira com `N + 2` arquivos e `M + 56` testes da linha de base, sem falhas.

- [ ] **Step 8: Formatar e commitar**

```bash
npx prettier --write apps/web/src/lib/cronograma-modelo.js apps/web/src/lib/cronograma-modelo.test.js apps/web/src/lib/orcamento-modelo.js apps/web/src/lib/orcamento-modelo.test.js
git status --short
git add apps/web/src/lib/cronograma-modelo.js apps/web/src/lib/cronograma-modelo.test.js
git commit -F - -- apps/web/src/lib/cronograma-modelo.js apps/web/src/lib/cronograma-modelo.test.js apps/web/src/lib/orcamento-modelo.js apps/web/src/lib/orcamento-modelo.test.js <<'EOF'
feat(cronograma): leitura da aba Cronograma do modelo SIGO e a 3ª aba no modelo em branco

cronograma-modelo.js lê a aba Cronograma (Item, Descrição, Mês 1…Mês N, até 60) com % em
número, texto pt-BR ou formato de %, com erros que bloqueiam e avisos (linha que não fecha
100,00, Item sem etapa, etapa sem linha, mais de 2 casas). Aba vazia também é erro, para não
trocar o cronograma atual por nada. O gerarModelo ganha a aba Cronograma com Mês 1 a Mês 12 e a
coluna A como Texto. Spec 2026-10-05 §6.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Esperado: o Prettier não muda nada, o commit sai com os 4 arquivos e o `git log` mostra `feat(cronograma): leitura da aba Cronograma do modelo SIGO e a 3ª aba no modelo em branco`.

---

### Task 3: Skill do Claude — seção Cronograma e código Python com 3 abas (`SKILL.md` + `skill-orcamento.test.js`)

**Files:**

- Modify: `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md`
- Modify: `apps/web/src/lib/skill-orcamento.test.js`

**Interfaces:**

- Consumes (só no teste): `ABA_CRONOGRAMA` e `cabecalhoCronograma` (Task 2) e `MAX_MESES` (Task 1).
- Produces (o texto da skill, que o botão "Skill do Claude" já empacota; `skill-orcamento.js` não muda):
  - seção nova **`## Cronograma`** (regras da spec §6) e a tabela **`### Aba Cronograma (opcional)`** dentro de "O modelo";
  - no bloco Python (o primeiro e único do documento): `CABECALHO_CRONOGRAMA = ["Item", "Descrição"]`, `PREFIXO_MES = "Mês "`, `MAX_MESES = 60`;
  - `gravar_modelo_sigo(linhas, info, caminho, cronograma=None)`, com `cronograma = {"meses": int, "linhas": [{"item": "1", "descricao": "...", "pct": [..]}]}`; lança `ValueError` com meses fora de 1 a 60 ou com uma linha de tamanho diferente de `meses`;
  - `conferir_modelo_sigo(caminho)` aceita `["Orçamento", "Informações"]` ou `["Orçamento", "Informações", "Cronograma"]` e, com a 3ª aba, chama `conferir_cronograma(ws, etapas, erros, avisos)`: erros para cabeçalho, Item que não é texto, Item repetido e % que não é número de 0 a 100; avisos para soma ≠ 100,00, mais de 2 casas, Item que não é etapa de nível 1 e etapa sem linha. Mais estrito que o SIGO (que aceita `"50"` em texto e Item numérico), porque quem grava é o próprio código;
  - `pct_da_linha(valores)`: R$ por mês → % com 2 casas, com a diferença no último mês com valor (a mesma regra do centavo da Task 1), para o edital que só traz R$.
- **Conferido (05/10, numa cópia fora do repositório):**
  - o exemplo do SKILL.md grava as 3 abas e imprime `([], [], 22348.18)`;
  - o mesmo arquivo, lido pelo SIGO: `lerArquivoModelo` com 0 erros e 0 avisos, e `lerArquivoCronograma(buffer, ["1", "2"])` com 0 erros, 0 avisos e `pct = { 1: [20, 35, 30, 15], 2: [0, 33.33, 33.33, 33.34] }`; com o desconto de 12,35% (`montarRegistrosImportacao` → `etapasDoOrcamento` → `resumoCronograma`), `todasFecham = true` e o acumulado do Mês 4 = 100%;
  - a `description` passa de 601 para 755 caracteres (limite 1.024), sem `<` nem `>`;
  - o teste novo falha no SKILL.md atual (`expected '---\nname: orcamento-prefeitura-sigo\…' to contain 'Cronograma'`).

- [ ] **Step 1: Escrever o teste que falha (2 trocas old→new com a ferramenta Edit em `apps/web/src/lib/skill-orcamento.test.js`)**

O teste novo confere o texto da skill **e** o bloco Python contra `cronograma-modelo.js` e `cronograma-ff.js`, como o teste do orçamento faz com `CABECALHOS` e `ROTULOS_INFO`. Aplique cada troca com a ferramenta **Edit**, na ordem.

3.18 — imports do teste (linhas 9-10)

old:

<!-- prettier-ignore -->
```js
  ROTULOS_INFO,
} from "./orcamento-modelo";
```

new:

<!-- prettier-ignore -->
```js
  ROTULOS_INFO,
} from "./orcamento-modelo";
import { ABA_CRONOGRAMA, cabecalhoCronograma } from "./cronograma-modelo";
import { MAX_MESES } from "./cronograma-ff";
```

3.19 — teste novo da aba Cronograma, depois de "usa exatamente os nomes do modelo do SIGO" (linhas 38-40)

old:

<!-- prettier-ignore -->
```js
    expect(python).toContain(`ws.title = "${ABA_ORCAMENTO}"`);
    expect(python).toContain(`create_sheet("${ABA_INFORMACOES}")`);
  });
```

new:

<!-- prettier-ignore -->
````js
    expect(python).toContain(`ws.title = "${ABA_ORCAMENTO}"`);
    expect(python).toContain(`create_sheet("${ABA_INFORMACOES}")`);
  });
  it("aba Cronograma com o nome, o cabeçalho e o limite de meses do SIGO", () => {
    for (const texto of [ABA_CRONOGRAMA, ...cabecalhoCronograma(2)]) {
      expect(skill).toContain(texto);
    }
    const python = /```python\n([\s\S]*?)\n```/.exec(skill)[1];
    const fixo = /^CABECALHO_CRONOGRAMA = (\[[^\]]*\])/m.exec(python)[1];
    expect(JSON.parse(fixo)).toEqual(cabecalhoCronograma(0)); // ["Item", "Descrição"]
    const mes1 = cabecalhoCronograma(1)[2]; // "Mês 1"
    expect(python).toContain(`PREFIXO_MES = "${mes1.slice(0, -1)}"`);
    expect(python).toContain(`create_sheet("${ABA_CRONOGRAMA}")`);
    expect(python).toContain(`MAX_MESES = ${MAX_MESES}`);
    expect(python).toContain(`["Orçamento", "Informações", "${ABA_CRONOGRAMA}"]`);
  });
````

- [ ] **Step 2: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/skill-orcamento.test.js 2>&1 | grep -E "aba Cronograma com o nome|Tests ")
```

Esperado: `× SKILL.md > aba Cronograma com o nome, o cabeçalho e o limite de meses do SIGO`, o mesmo nome no bloco `FAIL` (com a linha do teste), `Failed Tests 1` e `Tests  1 failed | 5 passed (6)`. O filtro não usa `×` porque o diff da falha imprime o SKILL.md, que tem `×` no texto.

- [ ] **Step 3: Seção Cronograma e código Python (17 trocas old→new com a ferramenta Edit em `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md`)**

As trocas 3.1, 3.2 e 3.17 são trechos de linhas longas (o `old` é só o trecho, e não a linha inteira). Nas trocas do bloco Python, a indentação é de 4 espaços, como no arquivo.

3.1 — `description` do frontmatter (linha 3): a aba Cronograma e o gatilho "cronograma SIGO"

old:

<!-- prettier-ignore -->
```md
um .xlsx com as abas "Orçamento" e "Informações". Use quando o usuário anexar a planilha orçamentária, planilha de preços ou orçamento sintético de um edital e pedir para converter, transcrever ou montar no modelo do SIGO, para importar no SIGO, ou disser "orçamento SIGO" ou "planilha para o SIGO".
```

new:

<!-- prettier-ignore -->
```md
um .xlsx com as abas "Orçamento" e "Informações" e, quando o edital traz o cronograma físico-financeiro, a aba "Cronograma" com o % de cada etapa por mês. Use quando o usuário anexar a planilha orçamentária, planilha de preços, orçamento sintético ou cronograma físico-financeiro de um edital e pedir para converter, transcrever ou montar no modelo do SIGO, para importar no SIGO, ou disser "orçamento SIGO", "cronograma SIGO" ou "planilha para o SIGO".
```

3.2 — introdução (linha 8)

old:

<!-- prettier-ignore -->
```md
Você recebe a planilha orçamentária de um edital (PDF ou Excel) e devolve um `.xlsx` no **modelo do SIGO Obras**. O usuário importa esse arquivo no SIGO (Oportunidade → aba Orçamento → **Importar planilha**), que o lê sem IA:
```

new:

<!-- prettier-ignore -->
```md
Você recebe a planilha orçamentária de um edital (PDF ou Excel), e o cronograma físico-financeiro quando houver, e devolve um `.xlsx` no **modelo do SIGO Obras**. O usuário importa esse arquivo no SIGO (Oportunidade → aba Orçamento → **Importar planilha**; o cronograma, na aba Planejamento → **Cronograma físico-financeiro** → **Importar**), que o lê sem IA:
```

3.3 — formato da aba `Cronograma`, depois da aba `Informações` (linhas 53-55)

old:

<!-- prettier-ignore -->
```md
Deixe a coluna B vazia quando a planilha não trouxer a informação. Não invente.

## Passo a passo
```

new:

<!-- prettier-ignore -->
```md
Deixe a coluna B vazia quando a planilha não trouxer a informação. Não invente.

### Aba `Cronograma` (opcional)

Só quando o edital traz o cronograma físico-financeiro (regras na seção **Cronograma**). A linha 1 é o cabeçalho:

| Coluna      | Cabeçalho                 | Conteúdo                                                                        |
| ----------- | ------------------------- | ------------------------------------------------------------------------------- |
| A           | `Item`                    | número da etapa de nível 1 em **texto** (`1`, `2`…), o mesmo da aba `Orçamento` |
| B           | `Descrição`               | título da etapa, como na aba `Orçamento`                                        |
| C em diante | `Mês 1`, `Mês 2`… `Mês N` | % da etapa no mês, **número** de 0 a 100 com até 2 casas (`20` = 20%); N até 60 |

- Uma linha por etapa de nível 1 (`1`, `2`, `3`…); subetapas (`1.1`) e itens não entram.
- Cada linha soma **100,00**. Mês sem execução: `0` ou vazio.

## Passo a passo
```

3.4 — passo 1: a aba do cronograma (linha 58)

old:

<!-- prettier-ignore -->
```md
Use a aba do orçamento sintético, não a de composições analíticas nem a do cronograma.
```

new:

<!-- prettier-ignore -->
```md
Use a aba do orçamento sintético, não a de composições analíticas; a do cronograma vale para a aba `Cronograma` (passo 6).
```

3.5 — passos 5 a 7 viram 5 a 8 (linhas 73-75)

old:

<!-- prettier-ignore -->
```md
5. **Não aplique desconto.** O SIGO aplica o desconto da proposta.
6. **Grave o `.xlsx`** com `gravar_modelo_sigo` (valores, não fórmulas).
7. **Confira** com `conferir_modelo_sigo`, corrija o que der erro e responda ao usuário.
```

new:

<!-- prettier-ignore -->
```md
5. **Não aplique desconto.** O SIGO aplica o desconto da proposta.
6. **Cronograma:** se o edital tiver cronograma físico-financeiro, monte as linhas da aba `Cronograma` (seção **Cronograma**). Sem cronograma no edital, não crie a aba.
7. **Grave o `.xlsx`** com `gravar_modelo_sigo` (valores, não fórmulas; com cronograma, passe `cronograma=`).
8. **Confira** com `conferir_modelo_sigo`, corrija o que der erro e responda ao usuário.
```

3.6 — regra de fidelidade das abas (linha 84)

old:

<!-- prettier-ignore -->
```md
- Não crie outras abas, colunas, fórmulas, células mescladas nem linhas de total.
```

new:

<!-- prettier-ignore -->
```md
- Não crie outras abas além de `Orçamento`, `Informações` e, quando houver cronograma, `Cronograma`; nem colunas, fórmulas, células mescladas ou linhas de total.
```

3.7 — seção nova `## Cronograma`, antes do código (linha 92)

old:

<!-- prettier-ignore -->
```md
## Código (Python + openpyxl)
```

new:

<!-- prettier-ignore -->
```md
## Cronograma

Quando o edital trouxer o **cronograma físico-financeiro** (no PDF, numa aba do Excel ou num anexo), preencha também a aba `Cronograma`.

- **Uma linha por etapa de nível 1** do orçamento, com o mesmo `Item` da aba `Orçamento`, em texto.
- **Os meses do edital, sem reperiodizar.** Cronograma da prefeitura em 6 meses = `Mês 1` a `Mês 6`, mesmo que a Ordem de Serviço vá dar outro prazo: a reperiodização é feita dentro do SIGO.
- **% por célula:** o % daquela etapa naquele mês, como número de 0 a 100 com até 2 casas (`20` para 20%; nunca `0,2`, texto ou formato de %).
- **Cada linha soma 100,00.** Se o edital mostrar % que somam 99,99 ou 100,01 por arredondamento, copie como está e anote em Observações; o SIGO importa e mostra a linha em vermelho até alguém corrigir.
- **Edital só com R$ por mês:** converta com `pct_da_linha` (R$ do mês ÷ total da etapa no cronograma da prefeitura, 2 casas; o último mês com valor fica com a diferença, para fechar 100,00) e anote em Observações: "Cronograma convertido de R$ para %: R$ do mês ÷ total da etapa, 2 casas, diferença no último mês."
- **Orçamento sem etapas e cronograma com uma etapa só** (ex.: Itatinga-SP, "1 SERVIÇOS DE ELÉTRICA"): crie essa etapa `1` na aba `Orçamento`, antes dos itens, numere os itens como `1.1`, `1.2`… e anote em Observações: "Etapa 1 criada a partir do cronograma; itens numerados como 1.1, 1.2…".
- **Não force a correspondência.** Se as etapas do cronograma não baterem com as do orçamento (outra divisão, outra numeração) ou se o cronograma só tiver o total por mês, sem as etapas, não crie a aba: explique na resposta, e o usuário decide.
- Confira com `conferir_modelo_sigo`: % fora de 0 a 100, texto numa célula de mês e `Item` repetido são **erros** (o SIGO recusa); linha que não soma 100,00, `Item` que não é etapa de nível 1 e etapa sem linha são **avisos**.

## Código (Python + openpyxl)
```

3.8 — constantes do cronograma no código (linha 105)

old:

<!-- prettier-ignore -->
```python
LARGURAS = {"A": 10, "B": 12, "C": 12, "D": 70, "E": 9, "F": 12, "G": 20, "H": 16}
```

new:

<!-- prettier-ignore -->
```python
LARGURAS = {"A": 10, "B": 12, "C": 12, "D": 70, "E": 9, "F": 12, "G": 20, "H": 16}
CABECALHO_CRONOGRAMA = ["Item", "Descrição"]  # depois, "Mês 1", "Mês 2"… até "Mês <meses>"
PREFIXO_MES = "Mês "
MAX_MESES = 60
```

3.9 — `pct_da_linha`, depois de `preco_com_bdi` (linhas 116-117)

old:

<!-- prettier-ignore -->
```python
    valor = Decimal(str(sem_bdi)) * (1 + Decimal(str(bdi_pct)) / 100)
    return float(valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
```

new:

<!-- prettier-ignore -->
```python
    valor = Decimal(str(sem_bdi)) * (1 + Decimal(str(bdi_pct)) / 100)
    return float(valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def pct_da_linha(valores):
    """% de cada mês a partir dos R$ da etapa no cronograma da prefeitura, com 2 casas.
    O último mês com valor fica com a diferença, para a linha fechar 100,00."""
    reais = [Decimal(str(v or 0)) for v in valores]
    total = sum(reais)
    if total == 0:
        return [0.0] * len(reais)
    pct = [(v * 100 / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for v in reais]
    ultimo = max(k for k, v in enumerate(reais) if v)
    pct[ultimo] += Decimal("100") - sum(pct)
    return [float(p) for p in pct]
```

3.10 — assinatura de `gravar_modelo_sigo` (linhas 120-122)

old:

<!-- prettier-ignore -->
```python
def gravar_modelo_sigo(linhas, info, caminho):
    """linhas: lista de dicts com item, codigo, fonte, descricao, unidade, quantidade,
    preco e total. Etapa: só item e descricao. info: {rótulo de ROTULOS_INFO: valor}."""
```

new:

<!-- prettier-ignore -->
```python
def gravar_modelo_sigo(linhas, info, caminho, cronograma=None):
    """linhas: lista de dicts com item, codigo, fonte, descricao, unidade, quantidade,
    preco e total. Etapa: só item e descricao. info: {rótulo de ROTULOS_INFO: valor}.
    cronograma (opcional): {"meses": N, "linhas": [{"item": "1", "descricao": "...",
    "pct": [% do Mês 1, ..., % do Mês N]}]}, uma linha por etapa de nível 1."""
```

3.11 — aba `Cronograma` no fim de `gravar_modelo_sigo` (linhas 144-146)

old:

<!-- prettier-ignore -->
```python
    wi.column_dimensions["A"].width = 26
    wi.column_dimensions["B"].width = 80
    wb.save(caminho)
```

new:

<!-- prettier-ignore -->
```python
    wi.column_dimensions["A"].width = 26
    wi.column_dimensions["B"].width = 80
    if cronograma:
        meses = int(cronograma["meses"])
        if not 1 <= meses <= MAX_MESES:
            raise ValueError(f"O cronograma tem de ter de 1 a {MAX_MESES} meses: {meses}")
        wc = wb.create_sheet("Cronograma")
        wc.append(CABECALHO_CRONOGRAMA + [f"{PREFIXO_MES}{k}" for k in range(1, meses + 1)])
        for celula in wc[1]:
            celula.font = Font(bold=True)
        for n, l in enumerate(cronograma["linhas"], start=2):
            pct = list(l["pct"])
            if len(pct) != meses:
                raise ValueError(f"Etapa {l['item']}: {len(pct)} valores de %, e o cronograma "
                                 f"tem {meses} meses")
            for c, valor in enumerate([str(l["item"]), l.get("descricao") or None] + pct, start=1):
                wc.cell(row=n, column=c, value=valor)
            wc.cell(row=n, column=1).number_format = "@"  # coluna A como Texto
        wc.column_dimensions["A"].width = 10
        wc.column_dimensions["B"].width = 50
    wb.save(caminho)
```

3.12 — `conferir_modelo_sigo` aceita 2 ou 3 abas (linhas 154-155)

old:

<!-- prettier-ignore -->
```python
    if wb.sheetnames != ["Orçamento", "Informações"]:
        erros.append(f"As abas devem ser Orçamento e Informações: {wb.sheetnames}")
```

new:

<!-- prettier-ignore -->
```python
    abas_validas = (["Orçamento", "Informações"], ["Orçamento", "Informações", "Cronograma"])
    if wb.sheetnames not in abas_validas:
        erros.append(f"As abas devem ser Orçamento e Informações (e, opcional, Cronograma): "
                     f"{wb.sheetnames}")
```

3.13 — guarda as etapas de nível 1 da aba `Orçamento` (linha 161)

old:

<!-- prettier-ignore -->
```python
    vistos, soma, itens = {}, Decimal("0"), 0
```

new:

<!-- prettier-ignore -->
```python
    vistos, soma, itens, etapas = {}, Decimal("0"), 0, []
```

3.14 — etapa de nível 1 no laço da aba `Orçamento` (linhas 187-188)

old:

<!-- prettier-ignore -->
```python
                avisos.append(f"Linha {n}: Total {total} difere de qtd × preço = {calculado}")
    if itens == 0:
```

new:

<!-- prettier-ignore -->
```python
                avisos.append(f"Linha {n}: Total {total} difere de qtd × preço = {calculado}")
        elif isinstance(item, str) and re.fullmatch(r"\d+", item):
            etapas.append(item)  # etapa de nível 1, para conferir a aba Cronograma
    if itens == 0:
```

3.15 — confere o cronograma e a função `conferir_cronograma` (linhas 197-200)

old:

<!-- prettier-ignore -->
```python
    return erros, avisos, float(soma)


# Exemplo
```

new:

<!-- prettier-ignore -->
```python
    if "Cronograma" in wb.sheetnames:
        conferir_cronograma(wb["Cronograma"], etapas, erros, avisos)
    return erros, avisos, float(soma)


def conferir_cronograma(ws, etapas, erros, avisos):
    """Aba Cronograma com as regras do importador do SIGO. Erros: cabeçalho, Item que não é texto,
    Item repetido e % que não é número de 0 a 100. Avisos: linha que não soma 100,00, % com mais
    de 2 casas, Item que não é etapa de nível 1 da aba Orçamento e etapa sem linha."""
    cabecalho = [c.value for c in ws[1]]
    while cabecalho and cabecalho[-1] in (None, ""):
        cabecalho.pop()
    meses = len(cabecalho) - 2
    esperado = CABECALHO_CRONOGRAMA + [f"{PREFIXO_MES}{k}" for k in range(1, meses + 1)]
    if not 1 <= meses <= MAX_MESES or cabecalho != esperado:
        erros.append(f"Cronograma: cabeçalho diferente de Item, Descrição, Mês 1… Mês N "
                     f"(N de 1 a {MAX_MESES}): {cabecalho}")
        return
    vistos = {}
    for linha in ws.iter_rows(min_row=2, max_col=meses + 2):
        item, _, *pct = [c.value for c in linha]
        n = linha[0].row
        if item in (None, "") and all(p in (None, "") for p in pct):
            continue
        if not isinstance(item, str) or not item.strip():
            erros.append(f"Cronograma, linha {n}: Item {item!r} tem de ser texto (1, 2, 3…)")
            continue
        if item in vistos:
            erros.append(f"Cronograma, linha {n}: Item {item} repetido (linha {vistos[item]})")
            continue
        vistos[item] = n
        if item not in etapas:
            avisos.append(f"Cronograma, linha {n}: Item {item} não é etapa de nível 1 da aba "
                          f"Orçamento; o SIGO ignora a linha")
        total = Decimal("0")
        for k, p in enumerate(pct, start=1):
            if p in (None, ""):
                continue
            if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0 <= p <= 100:
                erros.append(f"Cronograma, linha {n}, Mês {k}: {p!r} tem de ser número de 0 a 100")
                continue
            duas = Decimal(str(p)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if duas != Decimal(str(p)):
                avisos.append(f"Cronograma, linha {n}, Mês {k}: {p} tem mais de 2 casas")
            total += duas
        if total != 100:
            soma = f"{total:.2f}".replace(".", ",")
            avisos.append(f"Cronograma, linha {n}: a etapa {item} soma {soma}%, e não 100,00%")
    for etapa in etapas:
        if etapa not in vistos:
            avisos.append(f"Cronograma: a etapa {etapa} da aba Orçamento não tem linha")


# Exemplo
```

3.16 — exemplo com o cronograma (linha 212)

old:

<!-- prettier-ignore -->
```python
gravar_modelo_sigo(linhas, info, "Orcamento SIGO - PM Exemplo.xlsx")
```

new:

<!-- prettier-ignore -->
```python
cronograma = {"meses": 4, "linhas": [
    {"item": "1", "descricao": "SERVIÇOS PRELIMINARES", "pct": [20, 35, 30, 15]},
    {"item": "2", "descricao": "POSTES", "pct": pct_da_linha([0, 7010.98, 7010.98, 7010.98])},
]}
gravar_modelo_sigo(linhas, info, "Orcamento SIGO - PM Exemplo.xlsx", cronograma)
```

3.17 — resposta ao usuário (linhas 222-224)

old:

<!-- prettier-ignore -->
```md
> - Pontos de atenção: itens ilegíveis, numeração criada ou normalizada, linhas com total diferente.
>
> Para importar: SIGO → Oportunidade → aba **Orçamento** → **Importar planilha**. Confira a prévia e confirme; depois aplique o desconto no campo **Desconto (%)**.
```

new:

<!-- prettier-ignore -->
```md
> - Pontos de atenção: itens ilegíveis, numeração criada ou normalizada, linhas com total diferente.
> - Cronograma: N meses e E etapas, copiado do edital sem reperiodizar; cada linha soma 100,00% (ou: a etapa X soma Y%). Sem cronograma no edital: "O edital não traz cronograma físico-financeiro; a aba Cronograma não foi criada."
>
> Para importar: SIGO → Oportunidade → aba **Orçamento** → **Importar planilha**. Confira a prévia e confirme; depois aplique o desconto no campo **Desconto (%)**. O cronograma, com o mesmo arquivo: aba **Planejamento** → **Cronograma físico-financeiro** → **Importar**.
```

- [ ] **Step 4: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/skill-orcamento.test.js)
```

Esperado: `Test Files  1 passed (1)` e `Tests  6 passed (6)`.

- [ ] **Step 5: Conferir o código Python da skill (`py -3` com openpyxl, numa pasta temporária fora do repositório)**

```bash
(cd "$(mktemp -d)" && PYTHONIOENCODING=utf-8 py -3 - <<'EOF'
cerca = chr(96) * 3
caminho = "C:/Users/javer/sigoobras-base/apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md"
texto = open(caminho, encoding="utf-8").read()
exec(texto.split(cerca + "python" + chr(10))[1].split(cerca)[0])
wb = load_workbook("Orcamento SIGO - PM Exemplo.xlsx")
print(wb.sheetnames)
print([list(r) for r in wb["Cronograma"].iter_rows(values_only=True)])
print(wb["Cronograma"]["A2"].number_format, wb["Cronograma"]["A2"].data_type)
EOF
)
```

Esperado (o `print` do próprio exemplo vem primeiro):

```text
([], [], 22348.18)
['Orçamento', 'Informações', 'Cronograma']
[['Item', 'Descrição', 'Mês 1', 'Mês 2', 'Mês 3', 'Mês 4'], ['1', 'SERVIÇOS PRELIMINARES', 20, 35, 30, 15], ['2', 'POSTES', 0, 33.33, 33.33, 33.34]]
@ s
```

E os avisos e erros do cronograma (uma linha que não fecha, um Item que não é etapa com % negativo e uma etapa sem linha):

```bash
(cd "$(mktemp -d)" && PYTHONIOENCODING=utf-8 py -3 - <<'EOF'
cerca = chr(96) * 3
caminho = "C:/Users/javer/sigoobras-base/apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md"
texto = open(caminho, encoding="utf-8").read()
exec(texto.split(cerca + "python" + chr(10))[1].split(cerca)[0].split("# Exemplo")[0])
linhas = [{"item": "1", "descricao": "A"},
          {"item": "1.1", "descricao": "x", "unidade": "un", "quantidade": 1, "preco": 100},
          {"item": "2", "descricao": "B"},
          {"item": "2.1", "descricao": "y", "unidade": "un", "quantidade": 1, "preco": 50}]
cron = {"meses": 3, "linhas": [{"item": "1", "pct": [50, 30, 19.99]},
                               {"item": "9", "pct": [100, -1, 0]}]}
gravar_modelo_sigo(linhas, {"Total da prefeitura (R$)": 150}, "t.xlsx", cron)
erros, avisos, _ = conferir_modelo_sigo("t.xlsx")
print(*erros, *avisos, sep="\n")
EOF
)
```

Esperado:

```text
Cronograma, linha 3, Mês 2: -1 tem de ser número de 0 a 100
Cronograma, linha 2: a etapa 1 soma 99,99%, e não 100,00%
Cronograma, linha 3: Item 9 não é etapa de nível 1 da aba Orçamento; o SIGO ignora a linha
Cronograma: a etapa 2 da aba Orçamento não tem linha
```

Sem `py` ou sem openpyxl na máquina, pule este passo e registre isso no relatório da task.

- [ ] **Step 6: Suíte inteira, cópia para o build e formatação**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npm run build > /dev/null && ls dist/skills/orcamento-prefeitura-sigo/ && echo BUILD_OK)
npx prettier --check apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md apps/web/src/lib/skill-orcamento.test.js
```

Esperado:

- vitest: `N + 2` arquivos e `M + 57` testes da linha de base, todos passando;
- `SKILL.md` e `BUILD_OK`;
- `All matched files use Prettier code style!` (o CI roda `format:check`, que cobre `.md`).

- [ ] **Step 7: Commit**

```bash
git status --short
git commit -F - -- apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md apps/web/src/lib/skill-orcamento.test.js <<'EOF'
feat(cronograma): skill do Claude preenche a aba Cronograma do modelo SIGO

SKILL.md ganha a seção Cronograma (meses do edital sem reperiodizar, % por etapa de nível 1,
R$ convertido com pct_da_linha, etapa única criada no orçamento) e o código Python grava a aba
Cronograma opcional e confere 2 ou 3 abas, com a soma 100,00 de cada linha como aviso. O teste
confere o nome da aba, o cabeçalho e o limite de 60 meses contra cronograma-modelo.js.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Esperado: o commit sai com os 2 arquivos e o `git log` mostra `feat(cronograma): skill do Claude preenche a aba Cronograma do modelo SIGO`.

---

## Parte B — Task 4: migração 0133 e exportação do cronograma (lib)

### Task 4: Migração 0133 e exportação do cronograma (`lib/cronograma-export.js`)

**Files:**

- Create: `supabase/migrations/0133_cronograma_fisico_financeiro.sql`
- Create: `apps/web/src/lib/cronograma-export.js`
- Test: `apps/web/src/lib/cronograma-export.test.js`
- Modify: `apps/web/src/lib/proposta-orcamento.js` (antes do JSDoc de `montarDadosProposta` `:223`; início dela `:240-245`; fim `:283-314`)
- Modify: `apps/web/src/lib/proposta-export.js` (`cabecalhoDoDocumento` `:45`, `linhasAssinatura` `:66`, `textoPdf` `:195`, `baixarPropostaPdf` `:337-348`)
- Modify: `apps/web/src/lib/proposta-export.test.js` (import `:6`; depois do `LIMITE_PDF` `:163-164`)

Os números de linha são do `master` de 05/10 (commit `37ad85c`) e só orientam: use sempre o texto das âncoras.

**Interfaces:**

- Consumes (Task 1, `apps/web/src/lib/cronograma-ff.js`):
  - `normalizarCronograma(obj): Cronograma` (`{}`, `null` ou `undefined` → `{ meses: 0, pct: {} }`);
  - `resumoCronograma(etapas: EtapaCron[], cron: Cronograma): { linhas, meses, totalCentavos, todasFecham, orfas }`, com `linhas[i] = { numero, descricao, centavos, peso, pct, valores, fecha, diferenca }` (uma por etapa, na ordem das etapas; `pct` em % com 2 casas; `valores` em centavos, o último mês com % > 0 absorvendo os centavos quando a linha fecha) e `meses[j] = { centavos, pct, acumCentavos, acumPct }` (% sobre `totalCentavos`, 2 casas).
- Consumes (Orçamento, já no `master`): `nomeArquivoProposta`, `montarDadosProposta` (`proposta-orcamento.js`); `XLSX` 0.18.5; `jspdf` 2.5.2 e `jspdf-autotable` 3.8.4.
- Produces (`apps/web/src/lib/cronograma-export.js`, export nomeado):
  - `montarDadosCronograma({ etapas, cronograma, info, oportunidade, empresa, representante, opcoes: { local, dataISO } }): DadosCronograma`, com `DadosCronograma = { empresa: { nome, cnpj, endereco, contato }, titulo: "Cronograma físico-financeiro", orgao, objeto, edital, prazoMeses, resumo, localData, representante: { nome, cargo, cpf } }`;
  - `nomeArquivoCronograma(nomeOportunidade, dataISO, ext)` → `Cronograma - <nome> - <aaaa-mm-dd>.<ext>`;
  - `montarPlanilhaCronograma(dados): XLSX.WorkBook` (aba `Cronograma`);
  - `gerarPdfCronograma(dados, { jsPDF, autoTable }): jsPDF`;
  - `baixarCronogramaPdf(dados, nomeArquivo): Promise<void>` e `baixarCronogramaExcel(dados, nomeArquivo): Promise<void>`;
  - **extra (fora do contrato):** `TITULO_CRONOGRAMA = "Cronograma físico-financeiro"`.
- Produces (**extras, fora do contrato**, para não copiar código da proposta):
  - `proposta-orcamento.js`: `montarCabecalhoLicitacao({ info, oportunidade, empresa, representante, opcoes }): { empresa, orgao, objeto, edital, localData, representante }`, a lógica que estava dentro de `montarDadosProposta` (que passa a chamá-la; o resultado dela não muda);
  - `proposta-export.js`: passam a ser exportadas `cabecalhoDoDocumento(dados): { empresa: string[], licitacao: string[] }`, `linhasAssinatura(rep): string[]` e `textoPdf(valor): string` (já existiam), e a nova `carregarJsPdf(): Promise<{ jsPDF, autoTable }>` (o import dinâmico com o ajuste UMD que estava dentro do `baixarPropostaPdf`).

**Decisões desta task (o contrato não cobria):**

- **Sem cópia da proposta:** o cabeçalho (empresa, órgão, objeto, edital com o mesmo fallback, local/data e representante com CPF formatado) vem de `montarCabecalhoLicitacao`; as linhas de texto do topo, da assinatura e o saneamento para a fonte do PDF vêm de `cabecalhoDoDocumento`, `linhasAssinatura` e `textoPdf`; o nome do arquivo é o de `nomeArquivoProposta` com o prefixo trocado; o jsPDF é carregado por `carregarJsPdf`. A data-base e o BDI não saem no cronograma (`cabecalhoDoDocumento` só os mostra quando existem em `dados`). O topo ganha a linha `Prazo de execução: N meses`.
- **Etapa órfã** (linha do cronograma sem etapa no orçamento) não sai no arquivo: `resumoCronograma` só devolve as etapas do orçamento.
- **Excel:**
  - colunas A Item · B Etapa · C Valor da etapa (R$) · D % do total · E… Mês 1…N;
  - cada etapa em 2 linhas (R$ em cima, % embaixo), com A–D mescladas nas duas (`!merges`, que o SheetJS CE grava);
  - % gravado como fração com formato `0.00%` (20% = 0,2), para as fórmulas funcionarem como no Excel;
  - mês com 0% fica em branco nas duas linhas;
  - rodapé em 4 linhas com o valor em cache (ex.: etapas nas linhas 9–12 e rodapé a partir da 13): **Total do mês** = `SUM(E9,E11,…)` só das linhas de R$ (a coluna C leva o total das etapas, também em `SUM`); **% do mês** = `IF($C$13=0,0,E13/$C$13)`; **Acumulado (R$)** = `SUM($E$13:E13)`; **Acumulado (%)** = `SUM($E$14:E14)`;
  - acima de 255 etapas (limite de argumentos do Excel), `SUM(SUM(…),SUM(…))`.
- **PDF:**
  - cada etapa é **uma** linha da tabela com 2 linhas de texto por mês (`"2.000,00\n20,00%"`): R$ em cima e % embaixo, sem o risco de o par se separar numa quebra de página (`rowPageBreak: "avoid"`);
  - o rodapé (4 linhas) sai em negrito com fundo cinza;
  - largura do mês = o maior texto dos meses em negrito, com folga (mínimo 14 mm);
  - `horizontalPageBreak` liga com **mais de 12 meses** (contrato) **ou** quando os meses não cabem na largura útil (valores na casa do milhão em 12 meses); `horizontalPageBreakRepeat: [0, 1]` sempre;
  - "Página X de Y" e o nome da empresa no rodapé, como na proposta.
- **Teste do PDF:** um espião em volta do `autoTable` confere as opções e o corpo; o texto do PDF (`doc.output()`, sem compressão) confere a repetição do cabeçalho "Etapa" na página seguinte. Conferido no rascunho com jspdf 2.5.2 + jspdf-autotable 3.8.4: 18 meses e 3 etapas → 2 páginas (Mês 1–10 com Valor e % do total; Mês 11–18 com Item e Etapa repetidos).

- [ ] **Step 1: Linha de base e número da migração**

Na raiz do repositório (`C:\Users\javer\sigoobras-base`), no Git Bash:

```bash
git status --short
ls supabase/migrations | grep '^0133' ; echo "---"
for b in $(git branch --format='%(refname:short)'); do git ls-tree -r --name-only "$b" supabase/migrations; done | grep '/0133_' | sort -u
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Expected: as duas buscas da `0133` não acham nada (só o `---` aparece): ela está livre em todas as branches, e o `AGENTS.md` a reserva para o cronograma. Anote o número de arquivos e de testes da suíte. No `master` de 05/10 eram **36 arquivos e 433 testes**; as Tasks 1–3 acrescentam `cronograma-ff.test.js` e `cronograma-modelo.test.js`. `git status` pode mostrar arquivos de outras sessões (ex.: `.claude/launch.json`): **não** mexa neles e não use `git add -A`.

- [ ] **Step 2: Criar a migração 0133 (NÃO aplicar agora; é aplicada só na Task 7, com OK do Javerson)**

Crie `supabase/migrations/0133_cronograma_fisico_financeiro.sql`:

```sql
-- 0133 — Cronograma físico-financeiro na aba Planejamento da oportunidade (05/10/2026)
--
-- oportunidade.cronograma_ff  % de cada etapa de nível 1 do orçamento em cada mês:
--   { "meses": 4, "pct": { "1": [20, 35, 30, 15] }, "origem": "importado" | "manual",
--     "arquivo_nome": "...", "atualizado_em": "<ISO>" }
--   {} = sem cronograma. O R$ não é gravado: a tela calcula pelo subtotal com desconto
--   do orçamento atual (muda junto com o desconto ou com uma reimportação).
--
-- Só aditiva e idempotente. A RLS não muda (mesma tabela). O CHECK só garante que o
-- valor é um objeto JSON; o formato interno é conferido no front (normalizarCronograma).
-- Ordem do deploy: aplicar ESTA migração ANTES do push do front. O quadro grava
-- cronograma_ff; sem a coluna o PostgREST responde PGRST204.
-- Spec: docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md, §3.

alter table public.oportunidade
  add column if not exists cronograma_ff jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cronograma_ff) = 'object');
notify pgrst, 'reload schema';

select 'ok' as res;
```

Confira que o SQL é exatamente o do §3 da spec (Git Bash, na raiz):

````bash
diff <(sed -n '/^```sql$/,/^```$/p' docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md | sed '1d;$d') \
     <(grep -vE '^(--|select |$)' supabase/migrations/0133_cronograma_fisico_financeiro.sql) && echo SQL_IGUAL_A_SPEC
tail -n 1 supabase/migrations/0133_cronograma_fisico_financeiro.sql
````

Expected:

```
SQL_IGUAL_A_SPEC
select 'ok' as res;
```

- [ ] **Step 3: Escrever os testes que falham**

O teste novo do cronograma e um teste a mais na proposta (o `carregarJsPdf`).

3.1 — Crie `apps/web/src/lib/cronograma-export.test.js`:

<!-- prettier-ignore -->
```js
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { normalizarCronograma, resumoCronograma } from "./cronograma-ff";
import { montarDadosProposta } from "./proposta-orcamento";
import {
  TITULO_CRONOGRAMA,
  gerarPdfCronograma,
  montarDadosCronograma,
  montarPlanilhaCronograma,
  nomeArquivoCronograma,
} from "./cronograma-export";

// 2 etapas: R$ 10.000,00 (20/35/30/15) e R$ 30.000,00 (0/50/50/0); total R$ 40.000,00.
// Mês: 2.000 · 18.500 · 18.000 · 1.500 (5% · 46,25% · 45% · 3,75%), acumulado 100%.
const ETAPAS = [
  { numero: "1", descricao: "Serviços preliminares", centavos: 1_000_000 },
  { numero: "2", descricao: "Iluminação", centavos: 3_000_000 },
];
const CRONOGRAMA = {
  meses: 4,
  pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0], 9: [100, 0, 0, 0] },
  origem: "importado",
  arquivo_nome: "Orcamento SIGO - PM Teste.xlsx",
};
const INFO = {
  orgao: "Prefeitura Municipal de Teste",
  objeto: "Iluminação pública",
  edital: "Pregão 12/2026",
  data_base: "03/2026",
  bdi: "25%",
};
const OPORTUNIDADE = { id: "op1", nome: "PM Teste - LED" };
const EMPRESA = {
  razao_social: "Empresa Teste Ltda",
  cnpj: "11222333000181",
  endereco: "Rua A",
  numero: "100",
  cidade: "Araxá",
  estado: "MG",
};
const REPRESENTANTE = { nome: "Fulano de Tal", cargo: "Sócio-administrador", cpf: "52998224725" };
const OPCOES = { local: "Araxá/MG", dataISO: "2026-10-05" };

function dados({ etapas = ETAPAS, cronograma = CRONOGRAMA, ...extra } = {}) {
  return montarDadosCronograma({
    etapas,
    cronograma,
    info: INFO,
    oportunidade: OPORTUNIDADE,
    empresa: EMPRESA,
    representante: REPRESENTANTE,
    opcoes: OPCOES,
    ...extra,
  });
}

/** n etapas de R$ 1.000,00 com a mesma linha de % */
function muitas(n, linha) {
  const etapas = [];
  const pct = {};
  for (let i = 1; i <= n; i++) {
    etapas.push({ numero: String(i), descricao: `Etapa ${i}`, centavos: 100_000 });
    pct[String(i)] = [...linha];
  }
  return { etapas, cronograma: { meses: linha.length, pct } };
}

/** 17 × 5,55 + 5,65 = 100,00 */
const LINHA_18 = [...new Array(17).fill(5.55), 5.65];

describe("montarDadosCronograma", () => {
  it("cabeçalho, local/data e representante iguais aos da proposta; título e prazo", () => {
    const d = dados();
    const p = montarDadosProposta({
      itens: [],
      info: INFO,
      oportunidade: OPORTUNIDADE,
      empresa: EMPRESA,
      representante: REPRESENTANTE,
      opcoes: { ...OPCOES, validadeDias: 60 },
    });
    for (const campo of ["empresa", "orgao", "objeto", "edital", "localData", "representante"]) {
      expect(d[campo]).toEqual(p[campo]);
    }
    expect(d.titulo).toBe(TITULO_CRONOGRAMA);
    expect(TITULO_CRONOGRAMA).toBe("Cronograma físico-financeiro");
    expect(d.prazoMeses).toBe(4);
    expect(d.localData).toBe("Araxá/MG, 05 de outubro de 2026");
    expect(d.representante).toEqual({
      nome: "Fulano de Tal",
      cargo: "Sócio-administrador",
      cpf: "529.982.247-25",
    });
    expect(Object.keys(d).sort()).toEqual(
      [
        "edital",
        "empresa",
        "localData",
        "objeto",
        "orgao",
        "prazoMeses",
        "representante",
        "resumo",
        "titulo",
      ].sort()
    );
  });

  it("resumo = resumoCronograma das etapas com o cronograma normalizado (órfã fora)", () => {
    const d = dados();
    expect(d.resumo).toEqual(resumoCronograma(ETAPAS, normalizarCronograma(CRONOGRAMA)));
    expect(d.resumo.linhas.map((l) => l.numero)).toEqual(["1", "2"]);
    expect(d.resumo.totalCentavos).toBe(4_000_000);
    expect(d.resumo.meses.map((m) => m.centavos)).toEqual([200_000, 1_850_000, 1_800_000, 150_000]);
  });

  it("sem cronograma: prazo 0 e nenhum mês", () => {
    for (const cronograma of [{}, null, undefined]) {
      const d = montarDadosCronograma({ etapas: ETAPAS, cronograma, opcoes: OPCOES });
      expect(d.prazoMeses).toBe(0);
      expect(d.resumo.meses).toEqual([]);
    }
  });
});

describe("nomeArquivoCronograma", () => {
  it("monta o nome com a data, com o saneamento da proposta", () => {
    expect(nomeArquivoCronograma("PM Itatinga - LED", "2026-10-05", "pdf")).toBe(
      "Cronograma - PM Itatinga - LED - 2026-10-05.pdf"
    );
    expect(nomeArquivoCronograma("PM Itatinga: LED/Praça", "2026-10-05T10:00:00Z", "xlsx")).toBe(
      "Cronograma - PM Itatinga- LED-Praça - 2026-10-05.xlsx"
    );
    expect(nomeArquivoCronograma("  ", "2026-10-05", "pdf")).toBe(
      "Cronograma - Oportunidade - 2026-10-05.pdf"
    );
    // só o prefixo do nome do arquivo muda, não o nome da oportunidade
    expect(nomeArquivoCronograma("Proposta - X", "2026-10-05", "pdf")).toBe(
      "Cronograma - Proposta - X - 2026-10-05.pdf"
    );
  });
});

/** linha (1-based) do cabeçalho da tabela: A = "Item" e B = "Etapa" */
function linhaCabecalho(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    if (ws[`A${r + 1}`]?.v === "Item" && ws[`B${r + 1}`]?.v === "Etapa") return r + 1;
  }
  throw new Error("cabeçalho da tabela não encontrado");
}

function textosColunaA(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const saida = [];
  for (let r = faixa.s.r; r <= faixa.e.r; r++) if (ws[`A${r + 1}`]) saida.push(ws[`A${r + 1}`].v);
  return saida;
}

/** Soma (em centavos) das células citadas num SUM(...) de células e intervalos de 1 linha. */
function somaDaFormula(ws, formula) {
  const refs = formula.replace(/SUM\(|\)|\$/g, "").split(",");
  let total = 0;
  for (const ref of refs) {
    const [ini, fim = ini] = ref.split(":");
    const a = XLSX.utils.decode_cell(ini);
    const b = XLSX.utils.decode_cell(fim);
    for (let r = a.r; r <= b.r; r++) {
      for (let c = a.c; c <= b.c; c++) {
        total += Math.round((ws[XLSX.utils.encode_cell({ r, c })]?.v ?? 0) * 100);
      }
    }
  }
  return total;
}

describe("montarPlanilhaCronograma", () => {
  const wb = montarPlanilhaCronograma(dados());
  const ws = wb.Sheets.Cronograma;
  const h = linhaCabecalho(ws); // etapa 1: h+1 (R$) e h+2 (%); etapa 2: h+3 e h+4
  const f = h + 5; // Total do mês; depois % do mês, Acumulado (R$), Acumulado (%)

  it("aba Cronograma com o cabeçalho do documento, o prazo e o da tabela", () => {
    expect(wb.SheetNames).toEqual(["Cronograma"]);
    expect(ws.A1.v).toBe("Empresa Teste Ltda");
    expect(ws.A2.v).toBe("CNPJ: 11.222.333/0001-81");
    const textos = textosColunaA(ws);
    expect(textos).toContain("CRONOGRAMA FÍSICO-FINANCEIRO");
    expect(textos).toContain("Órgão: Prefeitura Municipal de Teste");
    expect(textos).toContain("Objeto: Iluminação pública");
    expect(textos).toContain("Edital/Processo: Pregão 12/2026");
    expect(textos).toContain("Prazo de execução: 4 meses");
    // data-base e BDI são da proposta, não do cronograma
    expect(textos.some((t) => String(t).startsWith("Data-base"))).toBe(false);
    expect(["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => ws[`${c}${h}`].v)).toEqual([
      "Item",
      "Etapa",
      "Valor da etapa (R$)",
      "% do total",
      "Mês 1",
      "Mês 2",
      "Mês 3",
      "Mês 4",
    ]);
    expect(ws[`I${h}`]).toBeUndefined();
  });

  it("2 linhas por etapa: R$ (com valor e peso) em cima e % embaixo; mês com 0% em branco", () => {
    expect(ws[`A${h + 1}`]).toMatchObject({ t: "s", v: "1" });
    expect(ws[`B${h + 1}`].v).toBe("Serviços preliminares");
    expect(ws[`C${h + 1}`]).toMatchObject({ t: "n", v: 10000, z: "#,##0.00" });
    expect(ws[`D${h + 1}`]).toMatchObject({ t: "n", v: 0.25, z: "0.00%" });
    expect(["E", "F", "G", "H"].map((c) => ws[`${c}${h + 1}`].v)).toEqual([2000, 3500, 3000, 1500]);
    expect(ws[`E${h + 1}`].z).toBe("#,##0.00");
    expect(["E", "F", "G", "H"].map((c) => ws[`${c}${h + 2}`].v)).toEqual([0.2, 0.35, 0.3, 0.15]);
    expect(ws[`E${h + 2}`].z).toBe("0.00%");
    expect(ws[`A${h + 2}`]).toBeUndefined();
    expect(ws[`C${h + 2}`]).toBeUndefined();
    // Item, Etapa, Valor e % do total mesclados nas 2 linhas da etapa
    expect(ws["!merges"]).toContainEqual({ s: { r: h, c: 0 }, e: { r: h + 1, c: 0 } });
    expect(ws["!merges"]).toContainEqual({ s: { r: h + 2, c: 3 }, e: { r: h + 3, c: 3 } });
    expect(ws["!merges"]).toHaveLength(8);

    expect(ws[`A${h + 3}`].v).toBe("2");
    expect(ws[`D${h + 3}`].v).toBe(0.75);
    expect(ws[`E${h + 3}`]).toBeUndefined();
    expect(ws[`E${h + 4}`]).toBeUndefined();
    expect(ws[`F${h + 3}`].v).toBe(15000);
    expect(ws[`F${h + 4}`].v).toBe(0.5);
    expect(ws[`H${h + 3}`]).toBeUndefined();
    // a etapa órfã (9) não sai
    expect(textosColunaA(ws)).not.toContain("9");
  });

  it("rodapé: SUM das linhas de R$, % do mês e acumulados, com o valor em cache", () => {
    expect([0, 1, 2, 3].map((k) => ws[`B${f + k}`].v)).toEqual([
      "Total do mês (R$)",
      "% do mês",
      "Acumulado (R$)",
      "Acumulado (%)",
    ]);
    expect(ws[`C${f}`]).toMatchObject({ v: 40000, f: `SUM(C${h + 1},C${h + 3})` });
    expect(ws[`E${f}`]).toMatchObject({ v: 2000, f: `SUM(E${h + 1},E${h + 3})`, z: "#,##0.00" });
    expect(ws[`F${f}`]).toMatchObject({ v: 18500, f: `SUM(F${h + 1},F${h + 3})` });
    expect(ws[`H${f}`]).toMatchObject({ v: 1500, f: `SUM(H${h + 1},H${h + 3})` });

    expect(ws[`E${f + 1}`]).toMatchObject({
      v: 0.05,
      f: `IF($C$${f}=0,0,E${f}/$C$${f})`,
      z: "0.00%",
    });
    expect(ws[`F${f + 1}`].v).toBeCloseTo(0.4625, 10);

    expect(ws[`E${f + 2}`]).toMatchObject({ v: 2000, f: `SUM($E$${f}:E${f})` });
    expect(ws[`G${f + 2}`]).toMatchObject({ v: 38500, f: `SUM($E$${f}:G${f})` });
    expect(ws[`H${f + 2}`].v).toBe(40000);

    expect(ws[`F${f + 3}`]).toMatchObject({ f: `SUM($E$${f + 1}:F${f + 1})` });
    expect(ws[`F${f + 3}`].v).toBeCloseTo(0.5125, 10);
    expect(ws[`H${f + 3}`]).toMatchObject({ v: 1, z: "0.00%" });
  });

  it("as fórmulas de soma batem com o valor em cache (o Excel recalcula igual)", () => {
    for (const col of ["C", "E", "F", "G", "H"]) {
      const cel = ws[`${col}${f}`];
      expect(somaDaFormula(ws, cel.f)).toBe(Math.round(cel.v * 100));
    }
    for (const col of ["E", "F", "G", "H"]) {
      const cel = ws[`${col}${f + 2}`];
      expect(somaDaFormula(ws, cel.f)).toBe(Math.round(cel.v * 100));
    }
  });

  it("local/data e assinatura no fim", () => {
    const textos = textosColunaA(ws);
    expect(textos).toContain("Araxá/MG, 05 de outubro de 2026");
    expect(textos.slice(-3)).toEqual([
      "Fulano de Tal",
      "Sócio-administrador",
      "CPF: 529.982.247-25",
    ]);
  });

  it("grava e relê o .xlsx com fórmulas e valores", () => {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const ws2 = XLSX.read(buf, { type: "buffer" }).Sheets.Cronograma;
    expect(ws2[`E${f}`]).toMatchObject({ v: 2000, f: `SUM(E${h + 1},E${h + 3})` });
    expect(ws2[`H${f + 2}`]).toMatchObject({ v: 40000, f: `SUM($E$${f}:H${f})` });
    expect(ws2[`A${h + 1}`].v).toBe("1");
  });

  it("mais de 255 etapas: SUM de SUMs (limite de argumentos do Excel)", () => {
    const { etapas, cronograma } = muitas(300, [100]);
    const ws3 = montarPlanilhaCronograma(dados({ etapas, cronograma })).Sheets.Cronograma;
    const h3 = linhaCabecalho(ws3);
    const tot = ws3[`E${h3 + 601}`];
    expect(ws3[`B${h3 + 601}`].v).toBe("Total do mês (R$)");
    expect(tot.f.startsWith("SUM(SUM(")).toBe(true);
    expect(tot.f.match(/E\d+/g)).toHaveLength(300);
    expect(tot.v).toBe(300_000);
    expect(somaDaFormula(ws3, tot.f)).toBe(30_000_000);
  });

  it("sem etapas: rodapé sem fórmula", () => {
    const ws4 = montarPlanilhaCronograma(dados({ etapas: [] })).Sheets.Cronograma;
    const h4 = linhaCabecalho(ws4);
    expect(ws4[`B${h4 + 1}`].v).toBe("Total do mês (R$)");
    expect(ws4[`C${h4 + 1}`]).toMatchObject({ t: "n", v: 0 });
    expect(ws4[`C${h4 + 1}`].f).toBeUndefined();
    expect(ws4[`E${h4 + 1}`].f).toBeUndefined();
  });
});

// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;

/** autoTable que guarda as opções de cada chamada */
function espiao() {
  const chamadas = [];
  const fn = (doc, opcoes) => {
    chamadas.push(opcoes);
    return autoTable(doc, opcoes);
  };
  return { fn, chamadas };
}

describe("gerarPdfCronograma", () => {
  it(
    "4 meses: uma página, sem quebra horizontal, com o rodapé da tabela",
    () => {
      const { fn, chamadas } = espiao();
      const doc = gerarPdfCronograma(dados(), { jsPDF, autoTable: fn });
      expect(doc.getNumberOfPages()).toBe(1);
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].horizontalPageBreak).toBe(false);
      expect(chamadas[0].head).toEqual([
        ["Item", "Etapa", "Valor da etapa (R$)", "% do total", "Mês 1", "Mês 2", "Mês 3", "Mês 4"],
      ]);
      // etapa: R$ em cima e % embaixo na mesma célula; mês com 0% em branco
      expect(chamadas[0].body[0]).toEqual([
        "1",
        "Serviços preliminares",
        "10.000,00",
        "25,00%",
        "2.000,00\n20,00%",
        "3.500,00\n35,00%",
        "3.000,00\n30,00%",
        "1.500,00\n15,00%",
      ]);
      expect(chamadas[0].body[1][4]).toBe("");
      expect(chamadas[0].body.slice(2).map((l) => l[1])).toEqual([
        "Total do mês (R$)",
        "% do mês",
        "Acumulado (R$)",
        "Acumulado (%)",
      ]);
      expect(chamadas[0].body[2].slice(2)).toEqual([
        "40.000,00",
        "",
        "2.000,00",
        "18.500,00",
        "18.000,00",
        "1.500,00",
      ]);
      expect(chamadas[0].body[5].slice(4)).toEqual(["5,00%", "51,25%", "96,25%", "100,00%"]);
      const saida = doc.output();
      expect(saida.startsWith("%PDF-")).toBe(true);
      expect(saida).toContain("CRONOGRAMA FÍSICO-FINANCEIRO");
      expect(saida).toContain("Prazo de execução: 4 meses");
      expect(saida).toContain("Página 1 de 1");
      expect(saida).toContain("Fulano de Tal");
    },
    LIMITE_PDF
  );

  it(
    "12 meses que cabem na largura: sem quebra horizontal",
    () => {
      const { etapas, cronograma } = muitas(3, [8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9]);
      const { fn, chamadas } = espiao();
      const doc = gerarPdfCronograma(dados({ etapas, cronograma }), { jsPDF, autoTable: fn });
      expect(chamadas[0].horizontalPageBreak).toBe(false);
      expect(doc.getNumberOfPages()).toBe(1);
      expect(doc.output()).toContain("Mês 12");
    },
    LIMITE_PDF
  );

  it(
    "18 meses: quebra na horizontal repetindo Item e Etapa, mais de uma página numerada",
    () => {
      const { etapas, cronograma } = muitas(3, LINHA_18);
      const { fn, chamadas } = espiao();
      const doc = gerarPdfCronograma(dados({ etapas, cronograma }), { jsPDF, autoTable: fn });
      expect(chamadas[0].horizontalPageBreak).toBe(true);
      expect(chamadas[0].horizontalPageBreakRepeat).toEqual([0, 1]);
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(1);
      const saida = doc.output();
      expect(saida).toContain("Mês 18");
      expect(saida).toContain(`Página ${n} de ${n}`);
      // o cabeçalho "Etapa" sai de novo na página dos meses seguintes
      expect(saida.match(/\(Etapa\) Tj/g).length).toBeGreaterThanOrEqual(2);
      // a última célula absorve os centavos: 17 × 55,50 + 56,50 = 1.000,00
      expect(chamadas[0].body[0][4 + 17]).toBe("56,50\n5,65%");
    },
    LIMITE_PDF
  );

  it(
    "60 meses e muitas etapas: gera sem erro",
    () => {
      const linha = [...new Array(59).fill(1.69), 0.29];
      const { etapas, cronograma } = muitas(40, linha);
      const doc = gerarPdfCronograma(dados({ etapas, cronograma }), { jsPDF, autoTable });
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(4);
      expect(doc.output()).toContain(`Página ${n} de ${n}`);
    },
    LIMITE_PDF
  );

  it(
    "não lança com caracteres fora da fonte do PDF",
    () => {
      const etapas = [{ numero: "1", descricao: "Etapa ≤ 3 Ω 😀", centavos: 100_000 }];
      const doc = gerarPdfCronograma(
        dados({ etapas, cronograma: { meses: 1, pct: { 1: [100] } } }),
        { jsPDF, autoTable }
      );
      expect(doc.output()).toContain("Etapa <= 3 ohm ?");
    },
    LIMITE_PDF
  );
});
```

3.2 — Em `apps/web/src/lib/proposta-export.test.js`, duas trocas com a ferramenta **Edit** (cada `old` aparece uma única vez no arquivo):

3.2.1 — import

old:

<!-- prettier-ignore -->
```js
import { gerarPdfProposta, montarPlanilhaProposta } from "./proposta-export";
```

new:

<!-- prettier-ignore -->
```js
import { carregarJsPdf, gerarPdfProposta, montarPlanilhaProposta } from "./proposta-export";
```

3.2.2 — teste do `carregarJsPdf`, logo depois do `LIMITE_PDF`

old:

<!-- prettier-ignore -->
```js
// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;
```

new:

<!-- prettier-ignore -->
```js
// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;

describe("carregarJsPdf", () => {
  it(
    "carrega o jsPDF e a função do autoTable por import dinâmico",
    async () => {
      const carregado = await carregarJsPdf();
      expect(typeof carregado.jsPDF).toBe("function");
      expect(typeof carregado.autoTable).toBe("function");
      const doc = new carregado.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      carregado.autoTable(doc, { head: [["Item"]], body: [["1"]] });
      expect(doc.lastAutoTable.finalY).toBeGreaterThan(0);
    },
    LIMITE_PDF
  );
});
```

- [ ] **Step 4: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-export.test.js src/lib/proposta-export.test.js 2>&1 | grep -E "Cannot find module|is not a function|Test Files")
```

Expected (as duas falhas, pelos motivos certos):

```
Error: Cannot find module './cronograma-export' imported from '.../apps/web/src/lib/cronograma-export.test.js'
     → (0 , carregarJsPdf) is not a function
TypeError: (0 , carregarJsPdf) is not a function
Test Files  2 failed (2)
```

- [ ] **Step 5: Exportar as partes da proposta (7 trocas com Edit)**

Aplique cada troca com a ferramenta **Edit**: os arquivos estão em LF e cada `old` abaixo aparece **uma única vez** no arquivo atual (conferido no `master` de 05/10). Aplique na ordem (5.1 antes de 5.2 e 5.3: depois da 5.1 o trecho `const op = oportunidade || {};` aparece duas vezes, mas os `old` da 5.2 e da 5.3 continuam únicos).

5.1 — `apps/web/src/lib/proposta-orcamento.js`: a função nova, logo antes do JSDoc de `montarDadosProposta` (`:223`)

old:

<!-- prettier-ignore -->
```js
/**
 * Tudo o que o PDF e o Excel mostram, já calculado (DadosProposta):
```

new:

<!-- prettier-ignore -->
```js
/**
 * Cabeçalho comum aos documentos da licitação (proposta de preços e cronograma
 * físico-financeiro):
 * { empresa: { nome, cnpj, endereco, contato }, orgao, objeto, edital, localData,
 *   representante: { nome, cargo, cpf } }
 *
 * - órgão/objeto/edital: de orcamento_info; se faltar, dos campos da licitação da
 *   oportunidade (orgao; licitacao_numero/licitacao_processo). O objeto cai por último no
 *   nome da oportunidade (nome, ou titulo). O que não existir fica null e não sai.
 * - localData: "<local>, <dd de mês de aaaa>" (opcoes.local e opcoes.dataISO).
 */
export function montarCabecalhoLicitacao({
  info,
  oportunidade,
  empresa,
  representante,
  opcoes,
} = {}) {
  const inf = info || {};
  const op = oportunidade || {};
  const opc = opcoes || {};
  const rep = representante || {};
  const data = dataPorExtenso(opc.dataISO);
  const local = texto(opc.local);
  const edital =
    texto(inf.edital) ||
    [
      texto(op.licitacao_numero) && `Edital ${texto(op.licitacao_numero)}`,
      texto(op.licitacao_processo) && `Processo ${texto(op.licitacao_processo)}`,
    ]
      .filter(Boolean)
      .join(" - ");

  return {
    empresa: montarEmpresa(empresa),
    orgao: texto(inf.orgao) || texto(op.orgao) || null,
    objeto: texto(inf.objeto) || texto(op.nome) || texto(op.titulo) || null,
    edital: edital || null,
    localData: [local, data].filter(Boolean).join(", "),
    representante: {
      nome: texto(rep.nome),
      cargo: texto(rep.cargo),
      cpf: texto(rep.cpf) ? formatarCpf(rep.cpf) : "",
    },
  };
}

/**
 * Tudo o que o PDF e o Excel mostram, já calculado (DadosProposta):
```

5.2 — `proposta-orcamento.js`: início de `montarDadosProposta` (`:240-245`; `op` e `rep` passam a ser lidos só na função nova)

old:

<!-- prettier-ignore -->
```js
  const inf = info || {};
  const op = oportunidade || {};
  const opc = opcoes || {};
  const rep = representante || {};

  // Mesma ordem
```

new:

<!-- prettier-ignore -->
```js
  const inf = info || {};
  const opc = opcoes || {};

  // Mesma ordem
```

5.3 — `proposta-orcamento.js`: fim de `montarDadosProposta` (`:283-314`)

old:

<!-- prettier-ignore -->
```js
  const dias = Number(opc.validadeDias) || 0;
  const data = dataPorExtenso(opc.dataISO);
  const local = texto(opc.local);
  const edital =
    texto(inf.edital) ||
    [
      texto(op.licitacao_numero) && `Edital ${texto(op.licitacao_numero)}`,
      texto(op.licitacao_processo) && `Processo ${texto(op.licitacao_processo)}`,
    ]
      .filter(Boolean)
      .join(" - ");

  return {
    empresa: montarEmpresa(empresa),
    titulo: "Proposta de preços",
    orgao: texto(inf.orgao) || texto(op.orgao) || null,
    objeto: texto(inf.objeto) || texto(op.nome) || texto(op.titulo) || null,
    edital: edital || null,
    dataBase: texto(inf.data_base) || null,
    bdi: bdiComPercentual(inf.bdi),
    linhas,
    totalGeral,
    totalExtenso: valorPorExtenso(totalGeral),
    validade: `Validade da proposta: ${dias} ${dias === 1 ? "dia" : "dias"}`,
    localData: [local, data].filter(Boolean).join(", "),
    representante: {
      nome: texto(rep.nome),
      cargo: texto(rep.cargo),
      cpf: texto(rep.cpf) ? formatarCpf(rep.cpf) : "",
    },
  };
}
```

new:

<!-- prettier-ignore -->
```js
  const dias = Number(opc.validadeDias) || 0;
  const cab = montarCabecalhoLicitacao({ info, oportunidade, empresa, representante, opcoes });

  return {
    empresa: cab.empresa,
    titulo: "Proposta de preços",
    orgao: cab.orgao,
    objeto: cab.objeto,
    edital: cab.edital,
    dataBase: texto(inf.data_base) || null,
    bdi: bdiComPercentual(inf.bdi),
    linhas,
    totalGeral,
    totalExtenso: valorPorExtenso(totalGeral),
    validade: `Validade da proposta: ${dias} ${dias === 1 ? "dia" : "dias"}`,
    localData: cab.localData,
    representante: cab.representante,
  };
}
```

5.4 — `apps/web/src/lib/proposta-export.js` (`:45`)

old:

<!-- prettier-ignore -->
```js
function cabecalhoDoDocumento(dados) {
```

new:

<!-- prettier-ignore -->
```js
export function cabecalhoDoDocumento(dados) {
```

5.5 — `proposta-export.js` (`:66`)

old:

<!-- prettier-ignore -->
```js
function linhasAssinatura(rep) {
```

new:

<!-- prettier-ignore -->
```js
export function linhasAssinatura(rep) {
```

5.6 — `proposta-export.js` (`:195`)

old:

<!-- prettier-ignore -->
```js
function textoPdf(valor) {
```

new:

<!-- prettier-ignore -->
```js
export function textoPdf(valor) {
```

5.7 — `proposta-export.js`: `carregarJsPdf` sai de dentro do `baixarPropostaPdf` (`:337-348`)

old:

<!-- prettier-ignore -->
```js
/** Gera e baixa o PDF (jspdf e jspdf-autotable carregados só no clique). */
export async function baixarPropostaPdf(dados, nomeArquivo) {
  const [{ jsPDF }, modAutoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // o pacote é UMD/CommonJS: conforme o empacotador, a função vem em
  // `default` ou em `default.default`
  const autoTable =
    typeof modAutoTable.default === "function"
      ? modAutoTable.default
      : modAutoTable.default?.default;
  if (typeof autoTable !== "function") throw new Error("jspdf-autotable não carregou");
  gerarPdfProposta(dados, { jsPDF, autoTable }).save(nomeArquivo);
}
```

new:

<!-- prettier-ignore -->
```js
/**
 * jsPDF e jspdf-autotable carregados só no clique (import dinâmico). Também
 * usado pelo cronograma físico-financeiro (lib/cronograma-export.js).
 */
export async function carregarJsPdf() {
  const [{ jsPDF }, modAutoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // o pacote é UMD/CommonJS: conforme o empacotador, a função vem em
  // `default` ou em `default.default`
  const autoTable =
    typeof modAutoTable.default === "function"
      ? modAutoTable.default
      : modAutoTable.default?.default;
  if (typeof autoTable !== "function") throw new Error("jspdf-autotable não carregou");
  return { jsPDF, autoTable };
}

/** Gera e baixa o PDF. */
export async function baixarPropostaPdf(dados, nomeArquivo) {
  gerarPdfProposta(dados, await carregarJsPdf()).save(nomeArquivo);
}
```

Confira:

```bash
grep -c "^export function \(cabecalhoDoDocumento\|linhasAssinatura\|textoPdf\)\|^export async function carregarJsPdf" apps/web/src/lib/proposta-export.js
grep -c "montarCabecalhoLicitacao" apps/web/src/lib/proposta-orcamento.js
grep -c "const op = \|const rep = " apps/web/src/lib/proposta-orcamento.js
```

Expected: `4`, `2` (a declaração e a chamada em `montarDadosProposta`) e `2` (só dentro da função nova).

- [ ] **Step 6: A proposta continua igual**

```bash
(cd apps/web && npx vitest run src/lib/proposta-orcamento.test.js src/lib/proposta-export.test.js)
```

Expected: `proposta-orcamento.test.js (16 tests)` e `proposta-export.test.js (10 tests)` passando (`Test Files 2 passed (2)`, `Tests 26 passed (26)`): os 16 + 9 de antes, sem mudança, e o teste novo do `carregarJsPdf`.

- [ ] **Step 7: Implementar `apps/web/src/lib/cronograma-export.js`**

<!-- prettier-ignore -->
```js
/**
 * Cronograma físico-financeiro da proposta, a partir das etapas do orçamento e do
 * cronograma_ff da oportunidade:
 *   - montarDadosCronograma: tudo o que o PDF e o Excel mostram, já calculado;
 *   - Excel (SheetJS): aba "Cronograma", 2 linhas por etapa (R$ em cima, % embaixo) e o
 *     rodapé (total do mês, % do mês e acumulados) em fórmula, com o valor em cache;
 *   - PDF (jsPDF + jspdf-autotable): A4 paisagem; com mais de 12 meses, quebra na
 *     horizontal repetindo Item e Etapa; "Página X de Y".
 * Spec: docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md §7.
 *
 * O cabeçalho (empresa, órgão, objeto, edital, local/data e representante), o nome do
 * arquivo e o carregamento do jsPDF são os da proposta de preços. Este módulo importa
 * o xlsx: no navegador, entra só por import dinâmico (no clique do "Gerar").
 */
import * as XLSX from "xlsx";
import { normalizarCronograma, resumoCronograma } from "./cronograma-ff";
import { montarCabecalhoLicitacao, nomeArquivoProposta } from "./proposta-orcamento";
import { cabecalhoDoDocumento, carregarJsPdf, linhasAssinatura, textoPdf } from "./proposta-export";

export const TITULO_CRONOGRAMA = "Cronograma físico-financeiro";
const ABA = "Cronograma";
const FMT_MOEDA = "#,##0.00";
const FMT_PCT = "0.00%";
const ROTULOS_RODAPE = ["Total do mês (R$)", "% do mês", "Acumulado (R$)", "Acumulado (%)"];
// colunas antes dos meses: Item, Etapa, Valor da etapa, % do total
const COL_MES = 4;
// o Excel aceita até 255 argumentos numa função
const MAX_ARGS = 255;

// ------------------------------------------------------------------ dados

/**
 * DadosCronograma = { empresa: { nome, cnpj, endereco, contato }, titulo, orgao, objeto,
 *   edital, prazoMeses, resumo, localData, representante: { nome, cargo, cpf } }
 *
 * - cabeçalho, local/data e representante: os mesmos da proposta (montarCabecalhoLicitacao);
 * - resumo: resumoCronograma(etapas, cronograma normalizado). Só as etapas do orçamento
 *   entram; linha do cronograma sem etapa (órfã) não sai no arquivo.
 */
export function montarDadosCronograma({
  etapas,
  cronograma,
  info,
  oportunidade,
  empresa,
  representante,
  opcoes,
}) {
  const cron = normalizarCronograma(cronograma);
  const cab = montarCabecalhoLicitacao({ info, oportunidade, empresa, representante, opcoes });
  return {
    empresa: cab.empresa,
    titulo: TITULO_CRONOGRAMA,
    orgao: cab.orgao,
    objeto: cab.objeto,
    edital: cab.edital,
    prazoMeses: cron.meses,
    resumo: resumoCronograma(etapas || [], cron),
    localData: cab.localData,
    representante: cab.representante,
  };
}

/** "Cronograma - <nome> - <aaaa-mm-dd>.<ext>", com o mesmo saneamento da proposta. */
export function nomeArquivoCronograma(nomeOportunidade, dataISO, ext) {
  return nomeArquivoProposta(nomeOportunidade, dataISO, ext).replace(
    /^Proposta - /,
    "Cronograma - "
  );
}

// ------------------------------------------------------ partes em comum

function cabecalhoTabela(meses) {
  const colunas = ["Item", "Etapa", "Valor da etapa (R$)", "% do total"];
  for (let j = 1; j <= meses; j++) colunas.push(`Mês ${j}`);
  return colunas;
}

/** Linhas do topo: as da proposta (empresa, órgão, objeto, edital) e o prazo. */
function linhasDoTopo(dados) {
  const cab = cabecalhoDoDocumento(dados);
  const n = Number(dados.prazoMeses) || 0;
  return {
    empresa: cab.empresa,
    licitacao: [...cab.licitacao, `Prazo de execução: ${n} ${n === 1 ? "mês" : "meses"}`],
  };
}

// ------------------------------------------------------------------ Excel

/** SUM das células da coluna nas linhas dadas; acima de 255, SUM de SUMs. */
function somaDasCelulas(coluna, linhas) {
  const refs = linhas.map((n) => `${coluna}${n}`);
  if (refs.length <= MAX_ARGS) return `SUM(${refs.join(",")})`;
  const grupos = [];
  for (let i = 0; i < refs.length; i += MAX_ARGS) {
    grupos.push(`SUM(${refs.slice(i, i + MAX_ARGS).join(",")})`);
  }
  return `SUM(${grupos.join(",")})`;
}

/**
 * Pasta de trabalho com a aba "Cronograma": cabeçalho da empresa e da licitação, o prazo,
 * a tabela (Item · Etapa · Valor da etapa (R$) · % do total · Mês 1 … Mês N), local/data e
 * a assinatura.
 *
 * - Cada etapa ocupa 2 linhas: R$ em cima (com o valor e o peso da etapa) e % embaixo;
 *   Item, Etapa, Valor e % do total mesclados nas duas. Mês com 0% fica em branco.
 * - % gravado como fração com formato 0.00% (20% = 0,2), como o Excel trata porcentagem.
 * - Rodapé, sempre com o valor em cache (`v`), para abrir certo sem recalcular:
 *   Total do mês = SUM das linhas de R$ (a coluna C leva o total das etapas);
 *   % do mês = total do mês ÷ total das etapas; Acumulado (R$) e Acumulado (%) = SUM do
 *   1º mês até o mês.
 */
export function montarPlanilhaCronograma(dados) {
  const ws = {};
  let r = 0; // próxima linha (0-based)
  const gravar = (linha, coluna, celula) => {
    ws[XLSX.utils.encode_cell({ r: linha, c: coluna })] = celula;
  };
  const linhaDeTexto = (valor) => {
    if (valor) gravar(r, 0, { t: "s", v: String(valor) });
    r++;
  };

  const topo = linhasDoTopo(dados);
  topo.empresa.forEach(linhaDeTexto);
  r++;
  linhaDeTexto(String(dados.titulo || TITULO_CRONOGRAMA).toUpperCase());
  topo.licitacao.forEach(linhaDeTexto);
  r++;

  const resumo = dados.resumo || { linhas: [], meses: [], totalCentavos: 0 };
  const nMeses = resumo.meses.length;
  cabecalhoTabela(nMeses).forEach((h, c) => gravar(r, c, { t: "s", v: h }));
  r++;

  const linhasReais = []; // número (1-based) da linha de R$ de cada etapa
  const mesclas = [];
  resumo.linhas.forEach((l) => {
    const lr = r; // R$
    const lp = r + 1; // %
    linhasReais.push(lr + 1);
    for (let c = 0; c < COL_MES; c++) mesclas.push({ s: { r: lr, c }, e: { r: lp, c } });
    gravar(lr, 0, { t: "s", v: String(l.numero ?? "") });
    gravar(lr, 1, { t: "s", v: String(l.descricao ?? "") });
    gravar(lr, 2, { t: "n", v: l.centavos / 100, z: FMT_MOEDA });
    gravar(lr, 3, { t: "n", v: (Number(l.peso) || 0) / 100, z: FMT_PCT });
    l.pct.forEach((p, j) => {
      if (!p) return;
      gravar(lr, COL_MES + j, { t: "n", v: l.valores[j] / 100, z: FMT_MOEDA });
      gravar(lp, COL_MES + j, { t: "n", v: p / 100, z: FMT_PCT });
    });
    r += 2;
  });

  // rodapé: 4 linhas, a partir de `f` (0-based); nF = número da linha "Total do mês"
  const f = r;
  const nF = f + 1;
  const mes1 = XLSX.utils.encode_col(COL_MES); // coluna do Mês 1 ("E")
  const temEtapas = linhasReais.length > 0;
  ROTULOS_RODAPE.forEach((rotulo, k) => gravar(f + k, 1, { t: "s", v: rotulo }));
  gravar(
    f,
    2,
    temEtapas
      ? {
          t: "n",
          v: resumo.totalCentavos / 100,
          f: somaDasCelulas("C", linhasReais),
          z: FMT_MOEDA,
        }
      : { t: "n", v: 0, z: FMT_MOEDA }
  );
  resumo.meses.forEach((m, j) => {
    const c = COL_MES + j;
    const col = XLSX.utils.encode_col(c);
    const total = { t: "n", v: m.centavos / 100, z: FMT_MOEDA };
    if (temEtapas) total.f = somaDasCelulas(col, linhasReais);
    gravar(f, c, total);
    gravar(f + 1, c, {
      t: "n",
      v: (Number(m.pct) || 0) / 100,
      f: `IF($C$${nF}=0,0,${col}${nF}/$C$${nF})`,
      z: FMT_PCT,
    });
    gravar(f + 2, c, {
      t: "n",
      v: m.acumCentavos / 100,
      f: `SUM($${mes1}$${nF}:${col}${nF})`,
      z: FMT_MOEDA,
    });
    gravar(f + 3, c, {
      t: "n",
      v: (Number(m.acumPct) || 0) / 100,
      f: `SUM($${mes1}$${nF + 1}:${col}${nF + 1})`,
      z: FMT_PCT,
    });
  });
  r = f + ROTULOS_RODAPE.length + 1;

  linhaDeTexto(dados.localData);
  r += 2;
  linhaDeTexto("_______________________________________");
  linhasAssinatura(dados.representante).forEach(linhaDeTexto);

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(r - 1, 0), c: COL_MES - 1 + Math.max(nMeses, 1) },
  });
  if (mesclas.length) ws["!merges"] = mesclas;
  ws["!cols"] = [{ wch: 8 }, { wch: 45 }, { wch: 16 }, { wch: 10 }];
  for (let j = 0; j < nMeses; j++) ws["!cols"].push({ wch: 14 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ABA);
  return wb;
}

// -------------------------------------------------------------------- PDF

const FONTE_TABELA = 7;
const PADDING = 1;
const LARGURA = { item: 12, etapa: 45, etapaMin: 40, valor: 24, peso: 15, mesMin: 14 };

const doisDecimais = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = (centavos) => doisDecimais((Number(centavos) || 0) / 100);
const percentual = (v) => `${doisDecimais(v)}%`;

/**
 * PDF do cronograma (A4 paisagem). `jsPDF` e `autoTable` vêm de fora (carregarJsPdf no
 * navegador; import normal no teste).
 *
 * Cada etapa é uma linha da tabela com 2 linhas de texto em cada mês (R$ em cima, %
 * embaixo), para o par nunca se separar numa quebra de página. Com mais de 12 meses (ou
 * se os meses não couberem na largura), a tabela quebra na horizontal repetindo as colunas
 * Item e Etapa (horizontalPageBreak e horizontalPageBreakRepeat).
 */
export function gerarPdfCronograma(dados, { jsPDF, autoTable }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const M = 12;
  const util = larg - 2 * M;
  let y = 14;

  const escrever = (
    texto,
    { tamanho = 9, negrito = false, alinhar = "left", entre = 4.2 } = {}
  ) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    const partes = doc.splitTextToSize(textoPdf(texto), util);
    const x = alinhar === "center" ? larg / 2 : M;
    partes.forEach((p) => {
      if (y > alt - 16) {
        doc.addPage();
        y = 14;
      }
      doc.text(p, x, y, { align: alinhar });
      y += entre;
    });
  };

  const topo = linhasDoTopo(dados);
  topo.empresa.forEach((t, i) =>
    escrever(t, i === 0 ? { tamanho: 12, negrito: true, entre: 5.5 } : { tamanho: 8.5 })
  );
  y += 3;
  escrever(String(dados.titulo || TITULO_CRONOGRAMA).toUpperCase(), {
    tamanho: 13,
    negrito: true,
    alinhar: "center",
    entre: 7,
  });
  topo.licitacao.forEach((t) => escrever(t, { tamanho: 9 }));
  y += 2;

  const resumo = dados.resumo || { linhas: [], meses: [], totalCentavos: 0 };
  const n = resumo.meses.length;
  const corpo = [];
  const tipos = [];
  resumo.linhas.forEach((l) => {
    corpo.push([
      textoPdf(l.numero),
      textoPdf(l.descricao),
      moeda(l.centavos),
      percentual(l.peso),
      ...l.pct.map((p, j) => (p ? `${moeda(l.valores[j])}\n${percentual(p)}` : "")),
    ]);
    tipos.push("etapa");
  });
  const rodape = [
    [moeda(resumo.totalCentavos), resumo.meses.map((m) => moeda(m.centavos))],
    ["", resumo.meses.map((m) => percentual(m.pct))],
    ["", resumo.meses.map((m) => moeda(m.acumCentavos))],
    ["", resumo.meses.map((m) => percentual(m.acumPct))],
  ];
  rodape.forEach(([total, valores], k) => {
    corpo.push(["", ROTULOS_RODAPE[k], total, "", ...valores]);
    tipos.push("rodape");
  });

  // largura de um mês: o maior texto dos meses em negrito (o do rodapé), com folga
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONTE_TABELA);
  const maiorTexto = corpo.reduce(
    (max, linha) =>
      linha
        .slice(COL_MES)
        .flatMap((t) => String(t).split("\n"))
        .reduce((m, t) => Math.max(m, doc.getTextWidth(t)), max),
    0
  );
  const largMes = Math.max(LARGURA.mesMin, Math.ceil((maiorTexto + 2 * PADDING + 1) * 10) / 10);
  const quebra =
    n > 12 || LARGURA.item + LARGURA.etapaMin + LARGURA.valor + LARGURA.peso + n * largMes > util;

  const columnStyles = {
    0: { cellWidth: LARGURA.item },
    1: quebra
      ? { cellWidth: LARGURA.etapa }
      : { cellWidth: "auto", minCellWidth: LARGURA.etapaMin },
    2: { cellWidth: LARGURA.valor, halign: "right" },
    3: { cellWidth: LARGURA.peso, halign: "right" },
  };
  for (let j = 0; j < n; j++) columnStyles[COL_MES + j] = { cellWidth: largMes, halign: "right" };

  autoTable(doc, {
    startY: y,
    head: [cabecalhoTabela(n)],
    body: corpo,
    theme: "grid",
    margin: { left: M, right: M, bottom: 16 },
    styles: {
      font: "helvetica",
      fontSize: FONTE_TABELA,
      cellPadding: PADDING,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles,
    rowPageBreak: "avoid",
    horizontalPageBreak: quebra,
    horizontalPageBreakRepeat: [0, 1],
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
      if (data.section === "body" && tipos[data.row.index] === "rodape") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 8;
  // local/data e assinatura não se partem
  if (y > alt - 45) {
    doc.addPage();
    y = 20;
  }
  if (dados.localData) escrever(dados.localData, { tamanho: 9 });
  y += 16;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(larg / 2 - 45, y, larg / 2 + 45, y);
  y += 5;
  linhasAssinatura(dados.representante).forEach((t, i) =>
    escrever(t, { tamanho: 9, negrito: i === 0, alinhar: "center" })
  );

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(textoPdf(dados.empresa?.nome || ""), M, alt - 7);
    doc.text(`Página ${p} de ${total}`, larg - M, alt - 7, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}

// -------------------------------------------------------------- downloads

/** Gera e baixa o PDF (jspdf e jspdf-autotable carregados só no clique). */
export async function baixarCronogramaPdf(dados, nomeArquivo) {
  gerarPdfCronograma(dados, await carregarJsPdf()).save(nomeArquivo);
}

/** Gera e baixa o Excel. */
export async function baixarCronogramaExcel(dados, nomeArquivo) {
  XLSX.writeFile(montarPlanilhaCronograma(dados), nomeArquivo);
}
```

- [ ] **Step 8: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/cronograma-export.test.js)
```

Expected:

```
✓ src/lib/cronograma-export.test.js (17 tests)
Test Files  1 passed (1)
     Tests  17 passed (17)
```

(O teste de 60 meses leva de 1 a 4 s no i3; o limite é de 20 s, como na proposta.)

- [ ] **Step 9: Suíte inteira e formatação**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
npx prettier --check apps/web/src/lib/cronograma-export.js apps/web/src/lib/cronograma-export.test.js apps/web/src/lib/proposta-orcamento.js apps/web/src/lib/proposta-export.js apps/web/src/lib/proposta-export.test.js
```

Expected: a suíte com **1 arquivo e 18 testes a mais** que a linha de base do Step 1 (17 do `cronograma-export` e 1 do `carregarJsPdf`), todos passando; Prettier `All matched files use Prettier code style!` (o `.sql` fica fora: o Prettier do projeto não tem parser de SQL).

- [ ] **Step 10: Commit (só os 6 caminhos da task)**

```bash
git status --short
git add supabase/migrations/0133_cronograma_fisico_financeiro.sql apps/web/src/lib/cronograma-export.js apps/web/src/lib/cronograma-export.test.js
git commit -F - -- supabase/migrations/0133_cronograma_fisico_financeiro.sql apps/web/src/lib/cronograma-export.js apps/web/src/lib/cronograma-export.test.js apps/web/src/lib/proposta-orcamento.js apps/web/src/lib/proposta-export.js apps/web/src/lib/proposta-export.test.js <<'EOF'
feat(cronograma): migração 0133 e exportação do cronograma físico-financeiro

- 0133 (só aditiva e idempotente): oportunidade.cronograma_ff jsonb, com CHECK de objeto;
  aplicada só na publicação, antes do push do front
- lib/cronograma-export: dados da exportação (cabeçalho da proposta, prazo e resumo do
  cronograma), nome do arquivo, Excel com 2 linhas por etapa e rodapé em SUM com o valor
  em cache, e PDF A4 paisagem que quebra na horizontal acima de 12 meses repetindo Item
  e Etapa, com "Página X de Y"
- proposta-orcamento: montarCabecalhoLicitacao sai de montarDadosProposta e é exportada
- proposta-export: exporta cabecalhoDoDocumento, linhasAssinatura e textoPdf; o import
  dinâmico do jsPDF vira carregarJsPdf, usado pela proposta e pelo cronograma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `6 files changed`, só esses seis caminhos.

---

## Parte C — Tasks 5 e 6: quadro, importação e exportação na aba Planejamento

### Task 5: Quadro "Cronograma físico-financeiro" e importação na aba Planejamento

**Files:**

- Create: `apps/web/src/lib/fila-gravacao.js`
- Test: `apps/web/src/lib/fila-gravacao.test.js`
- Create: `apps/web/src/components/oportunidades/ImportarCronogramaDialog.jsx`
- Create: `apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx`
- Modify: `apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx` (`function ListaMensagens`, `:26`)
- Modify: `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx` (import `:63`; aba Planejamento `:1532-1542`)

Os números de linha são do `master` de 05/10 (`37ad85c`) e só orientam: use sempre o texto das âncoras. Componentes não têm teste (Vitest em node, sem DOM): a lógica nova de gravação vai para `lib/fila-gravacao.js`, com teste; as telas são conferidas por ESLint com `no-undef`, Prettier, build e o roteiro da Task 7.

**Interfaces:**

- Consumes (Task 1, `@/lib/cronograma-ff`, import estático): `MAX_MESES`, `etapasDoOrcamento`, `normalizarCronograma`, `lerPercentual` (vazio → `null`; inválido ou fora de 0–100 → `NaN`), `resumoCronograma`, `ajustarMeses` e `reperiodizar` (estes dois lançam `RangeError` com N fora de 1–60).
- Consumes (Task 2, `@/lib/cronograma-modelo`, **import dinâmico** no Importar): `lerArquivoCronograma(buffer, numerosEtapas)` → `{ cronograma /*{ meses, pct, origem: "importado" } ou null*/, erros, avisos, resumo: { meses, linhas, ignoradas, faltando } }`.
- Consumes (Orçamento, já no `master`): `sigo.entities.Oportunidade.update`; `formatBRL` (`@/lib/formatters`); `ListaMensagens` do `ImportarPlanilhaOrcamentoDialog.jsx` (passa a ser exportada no Step 6); `podeEditarOrcamento` do `OportunidadeDetalhe.jsx` (`isAdmin || can("Oportunidades", "Orçamento", "editar") || can("Oportunidades", "Orcamento", "editar")`, `:253-256`).
- Produces (contrato):
  - `CronogramaFisicoFinanceiro` (default export), props `{ selectedOp, setSelectedOp, setOportunidades, orcamentoItens, empresaAtiva, user, podeEditar }`, todas opcionais;
  - `ImportarCronogramaDialog` (default export), props `{ open, onOpenChange, numerosEtapas, temCronograma, onImportar }`, com `onImportar(cronograma, arquivoNome)` resolvendo `true` (gravou: o diálogo fecha) ou `false` (falhou: o quadro já avisou e o diálogo fica aberto);
  - ligação no `OportunidadeDetalhe.jsx`, aba Planejamento, acima do `DiarioObraTab`, com `podeEditar={podeEditarOrcamento}`.
- Produces (para a Task 6, conferido no Step 10): a linha `import ImportarCronogramaDialog from "./ImportarCronogramaDialog";`; a âncora `{/* EXPORTAR_CRONOGRAMA */}`, uma vez, na barra de botões e fora de qualquer condição de `podeEditar`; no corpo do quadro, `const etapas = useMemo(...)` (`EtapaCron[]`) e `const [cronograma, setCronograma] = useState(...)` (o `Cronograma` normalizado que a grade mostra).
- Produces (**extras, fora do contrato**):
  - `apps/web/src/lib/fila-gravacao.js`: `criarFilaGravacao({ gravar, esperaMs = 1000, aoFalhar })` → `{ agendar(chave, valor), gravarJa(chave, valor): Promise<boolean>, descarregar(): Promise<boolean>, ocupada(): boolean }`;
  - `ListaMensagens` passa a ser export nomeado do `ImportarPlanilhaOrcamentoDialog.jsx` (a mesma lista de erros/avisos nas duas importações, sem cópia).

**Decisões desta task (o contrato não cobria):**

- **Fila de gravação em lib testada.** O quadro grava o objeto inteiro a cada célula. Com rede lenta, duas gravações podiam chegar fora de ordem e deixar no banco o valor mais velho. A fila grava só o último valor 1 s depois da última célula, uma gravação de cada vez e na ordem. Na falha, descarta o que veio depois (contém a edição que falhou), e o quadro volta ao último gravado com toast.
- **Gravação na hora** (sem a espera de 1 s): Importar, Meses, Reperiodizar e apagar linha órfã. Ao sair do quadro (troca de oportunidade ou de aba, detalhe fechado), a edição que esperava o 1 s é gravada na hora.
- **Origem e data:** toda mudança grava `atualizado_em` (ISO). Editar célula, Meses, Reperiodizar e apagar linha marcam `origem: "manual"` (mantêm `arquivo_nome`); Importar marca `"importado"` com o nome do arquivo. A legenda do quadro mostra meses, total, origem e data.
- **Células:** `12,5`, `12.5` e `12,5%` valem; vazio numa etapa com linha = 0; numa etapa sem linha, a célula continua vazia (a linha só nasce com um valor); texto inválido dá toast e a célula volta. Enter grava, Esc desfaz. O R$ das células vai sem o prefixo "R$" (o cabeçalho diz Valor (R$)), para caber em 60 meses.
- **Meses e Reperiodizar** abrem o mesmo diálogo pequeno, que pede o N (1 a 60). O "Meses" usa o texto de confirmação da spec ("Os meses M+1 a N têm valores. Cortar mesmo assim? (as linhas deixam de fechar 100%)"; com um mês só, "O mês N tem valores."). O Reperiodizar sempre confirma.
- **Botões:** Importar, Meses e Reperiodizar só para quem edita e só com etapas no orçamento; Reperiodizar desabilitado sem meses. A âncora do Exportar fica fora dessas condições.
- **Linha órfã:** cinza, só leitura, com a lixeira para quem edita (pede confirmação). Não entra nos totais (o `resumoCronograma` só soma as etapas do orçamento).
- **`user`** fica fora da desestruturação: o quadro não grava autor, e o ESLint do projeto avisa prop desestruturada sem uso. O `OportunidadeDetalhe` passa a prop assim mesmo, como no contrato.
- **Não teste no `npm run dev` antes da Task 7:** o dev usa o banco de produção, e sem a `0133` toda gravação do quadro falha (PGRST204), com toast e volta.

- [ ] **Step 1: Linha de base e conferência das Tasks 1 e 2**

Na raiz do repositório (Git Bash):

```bash
git status --short
grep -cE "^export function (etapasDoOrcamento|normalizarCronograma|lerPercentual|resumoCronograma|ajustarMeses|reperiodizar)\(" apps/web/src/lib/cronograma-ff.js
grep -c "^export const MAX_MESES = 60;" apps/web/src/lib/cronograma-ff.js
grep -c "^export function lerArquivoCronograma(" apps/web/src/lib/cronograma-modelo.js
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npx eslint --rule "no-undef: error" src/components/oportunidades/OportunidadeDetalhe.jsx src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx; echo "exit $?")
```

Expected:

- `git status --short`: arquivos de outras sessões podem aparecer (ex.: `.claude/launch.json`); não mexa neles;
- `6`, `1` e `1`. Se não bater, **pare**: os nomes vêm das Tasks 1 e 2;
- Vitest sem falha. Anote `Test Files N passed` e `Tests M passed`; com a linha de base de 05/10 (36/433) e as Tasks 1 a 4, são **39 e 508**;
- ESLint: só o aviso que já existia, e `exit 0`:

```
...\OportunidadeDetalhe.jsx
  117:3  warning  'cronogramaEtapas' is defined but never used. Allowed unused args must match /^_/u  unused-imports/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

exit 0
```

- [ ] **Step 2: Escrever o teste que falha**

Crie `apps/web/src/lib/fila-gravacao.test.js`:

<!-- prettier-ignore -->
```js
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFilaGravacao } from "./fila-gravacao";

/** Promessa controlada de fora: a gravação só termina quando o teste manda. */
function adiada() {
  let resolver;
  let rejeitar;
  const promessa = new Promise((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** Deixa rodar as promessas pendentes (a fila encadeia com .then). */
const microtarefas = () => vi.advanceTimersByTimeAsync(0);

describe("criarFilaGravacao", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grava só o último valor, esperaMs depois da última mudança", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    fila.agendar("op1", { v: 1 });
    await vi.advanceTimersByTimeAsync(600);
    fila.agendar("op1", { v: 2 });
    await vi.advanceTimersByTimeAsync(999);
    expect(gravar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(gravar).toHaveBeenCalledWith("op1", { v: 2 });
  });

  it("fica ocupada enquanto espera e enquanto grava", async () => {
    const g = adiada();
    const gravar = vi.fn(() => g.promessa);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    expect(fila.ocupada()).toBe(false);
    fila.agendar("op1", 1);
    expect(fila.ocupada()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(fila.ocupada()).toBe(true);
    g.resolver();
    await microtarefas();
    expect(fila.ocupada()).toBe(false);
  });

  it("uma gravação de cada vez, na ordem em que entraram", async () => {
    const g1 = adiada();
    const g2 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockReturnValueOnce(g2.promessa);
    const fila = criarFilaGravacao({ gravar });
    const p1 = fila.gravarJa("op1", 1);
    const p2 = fila.gravarJa("op1", 2);
    await microtarefas();
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    g1.resolver();
    await microtarefas();
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op1", 2],
    ]);
    g2.resolver();
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(true);
  });

  it("gravarJa descarta o valor que esperava da mesma chave", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar });
    fila.agendar("op1", 1);
    await expect(fila.gravarJa("op1", 2)).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar.mock.calls).toEqual([["op1", 2]]);
    expect(fila.ocupada()).toBe(false);
  });

  it("agendar outra chave manda o valor que esperava para a fila na hora", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    fila.agendar("op1", 1);
    fila.agendar("op2", 2);
    await microtarefas();
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op2", 2],
    ]);
  });

  it("descarregar grava na hora o que esperava, e sem nada esperando só resolve", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    await expect(fila.descarregar()).resolves.toBe(true);
    expect(gravar).not.toHaveBeenCalled();
    fila.agendar("op1", 1);
    await expect(fila.descarregar()).resolves.toBe(true);
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar).toHaveBeenCalledTimes(1);
  });

  it("falha: avisa, descarta o que esperava e o que estava na fila depois, e volta a gravar", async () => {
    const erro = new Error("sem rede");
    const g1 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockResolvedValue(undefined);
    const aoFalhar = vi.fn();
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000, aoFalhar });
    const p1 = fila.gravarJa("op1", 1);
    const p2 = fila.gravarJa("op1", 2);
    fila.agendar("op1", 3);
    g1.rejeitar(erro);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(false);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar).toHaveBeenCalledWith("op1", erro);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    expect(fila.ocupada()).toBe(false);
    await expect(fila.gravarJa("op1", 4)).resolves.toBe(true);
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op1", 4],
    ]);
  });

  it("a falha de uma chave não descarta a outra", async () => {
    const gravar = vi.fn(async (chave) => {
      if (chave === "op1") throw new Error("RLS");
    });
    const aoFalhar = vi.fn();
    const fila = criarFilaGravacao({ gravar, aoFalhar });
    const p1 = fila.gravarJa("op1", 1);
    const p2 = fila.gravarJa("op2", 2);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(true);
    expect(aoFalhar.mock.calls.map((c) => c[0])).toEqual(["op1"]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/fila-gravacao.test.js 2>&1 | grep -E "FAIL|Cannot find module|Test Files")
```

Expected: `FAIL  src/lib/fila-gravacao.test.js`, `Error: Cannot find module './fila-gravacao'` e `Test Files  1 failed (1)`.

- [ ] **Step 4: Implementar `apps/web/src/lib/fila-gravacao.js`**

<!-- prettier-ignore -->
```js
/**
 * Fila de gravação com espera, para a tela que grava um objeto inteiro a cada edição (o quadro
 * do cronograma físico-financeiro grava `oportunidade.cronograma_ff` a cada célula).
 *
 * - Só o último valor é gravado, `esperaMs` depois da última mudança (`agendar`).
 * - As gravações saem uma de cada vez, na ordem em que entraram: a 2ª só começa quando a 1ª
 *   termina, e o banco nunca fica com um valor mais velho que o da tela.
 * - Falha: chama `aoFalhar(chave, erro)` e descarta, da mesma chave, o valor que esperava e os
 *   que já estavam na fila depois do que falhou (eles contêm a edição que falhou). Quem usa a
 *   fila volta a tela para o último valor gravado.
 *
 * A chave separa os donos dos valores (o id da oportunidade): agendar outra chave manda para a
 * fila, na hora, o valor que esperava, e a falha de uma chave não descarta as outras.
 *
 * API:
 * - agendar(chave, valor): troca o valor que espera e reinicia a espera;
 * - gravarJa(chave, valor): descarta o valor que esperava da mesma chave (o novo já o contém) e
 *   põe este na fila; resolve `true` (gravou) ou `false` (falhou ou foi descartado);
 * - descarregar(): põe na fila, na hora, o valor que esperava, e resolve como o `gravarJa`; sem
 *   nada esperando, resolve quando a fila esvazia, com o resultado da última gravação (`true` se
 *   não houve nenhuma);
 * - ocupada(): há valor esperando ou gravação na fila?
 */
export function criarFilaGravacao({ gravar, esperaMs = 1000, aoFalhar } = {}) {
  let timer = null;
  let esperando = null; // { chave, valor }
  let fila = Promise.resolve(true);
  let naFila = 0;
  const epocas = new Map(); // chave → nº de falhas (descarta o que entrou antes da falha)

  const epocaDe = (chave) => epocas.get(chave) ?? 0;

  const cancelarEspera = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    esperando = null;
  };

  const enfileirar = ({ chave, valor }) => {
    const minhaEpoca = epocaDe(chave);
    naFila += 1;
    fila = fila.then(async () => {
      try {
        if (minhaEpoca !== epocaDe(chave)) return false;
        await gravar(chave, valor);
        return true;
      } catch (erro) {
        epocas.set(chave, epocaDe(chave) + 1);
        if (esperando?.chave === chave) cancelarEspera();
        aoFalhar?.(chave, erro);
        return false;
      } finally {
        naFila -= 1;
      }
    });
    return fila;
  };

  const descarregar = () => {
    if (!esperando) return fila;
    const item = esperando;
    cancelarEspera();
    return enfileirar(item);
  };

  const agendar = (chave, valor) => {
    if (esperando && esperando.chave !== chave) descarregar();
    if (timer !== null) clearTimeout(timer);
    esperando = { chave, valor };
    timer = setTimeout(() => {
      timer = null;
      descarregar();
    }, esperaMs);
  };

  const gravarJa = (chave, valor) => {
    if (esperando?.chave === chave) cancelarEspera();
    else if (esperando) descarregar();
    return enfileirar({ chave, valor });
  };

  const ocupada = () => esperando !== null || naFila > 0;

  return { agendar, gravarJa, descarregar, ocupada };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/fila-gravacao.test.js 2>&1 | grep -E "✓|×|Test Files|Tests ")
```

Expected: `✓ src/lib/fila-gravacao.test.js (8 tests)`, `Test Files  1 passed (1)` e `Tests  8 passed (8)`.

- [ ] **Step 6: Exportar a `ListaMensagens` (1 troca com Edit em `apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx`)**

old:

<!-- prettier-ignore -->
```jsx
function ListaMensagens({ titulo, mensagens, tom }) {
```

new:

<!-- prettier-ignore -->
```jsx
/** Erros ou avisos da importação (reusada pelo ImportarCronogramaDialog). */
export function ListaMensagens({ titulo, mensagens, tom }) {
```

- [ ] **Step 7: Criar `apps/web/src/components/oportunidades/ImportarCronogramaDialog.jsx`**

<!-- prettier-ignore -->
```jsx
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListaMensagens } from "./ImportarPlanilhaOrcamentoDialog";

/**
 * Importa a aba `Cronograma` do modelo SIGO (.xlsx; pode ser o mesmo arquivo do orçamento,
 * preenchido pela skill do Claude): prévia com meses, etapas, erros e avisos (regras da spec
 * §6, em `lerArquivoCronograma`). Com erros, não importa.
 *
 * `numerosEtapas` = números das etapas de nível 1 do orçamento. Com `temCronograma`, pergunta
 * "Substituir o cronograma atual?". `onImportar(cronograma, arquivoNome)` grava e resolve
 * `true` (o diálogo fecha) ou `false` (o quadro já avisou da falha; o diálogo fica aberto).
 */
export default function ImportarCronogramaDialog({
  open,
  onOpenChange,
  numerosEtapas,
  temCronograma,
  onImportar,
}) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [gravando, setGravando] = useState(false);

  // fechou: começa do zero na próxima vez
  useEffect(() => {
    if (!open) {
      setArquivoNome("");
      setResultado(null);
    }
  }, [open]);

  const podeConfirmar =
    !!resultado?.cronograma && resultado.erros.length === 0 && !lendo && !gravando;

  const escolherArquivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResultado(null);
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("Escolha o arquivo .xlsx no modelo do SIGO");
      return;
    }
    setArquivoNome(file.name);
    setLendo(true);
    try {
      const { lerArquivoCronograma } = await import("@/lib/cronograma-modelo");
      setResultado(lerArquivoCronograma(await file.arrayBuffer(), numerosEtapas || []));
    } catch (err) {
      console.error("Erro ao ler a planilha:", err);
      toast.error(`Não foi possível ler a planilha: ${err?.message || "arquivo inválido"}`);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!podeConfirmar) return;
    if (temCronograma && !window.confirm("Substituir o cronograma atual?")) return;
    setGravando(true);
    try {
      if (await onImportar?.(resultado.cronograma, arquivoNome)) onOpenChange(false);
    } catch (err) {
      console.error("Erro ao importar o cronograma:", err);
      toast.error(`Erro ao importar o cronograma: ${err?.message || "erro desconhecido"}`);
    } finally {
      setGravando(false);
    }
  };

  const resumo = resultado?.resumo;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!gravando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar cronograma (modelo SIGO)</DialogTitle>
          <DialogDescription>
            {
              "Escolha o .xlsx no modelo do SIGO com a aba Cronograma (pode ser o mesmo arquivo do orçamento, preenchido pela Skill do Claude). A importação substitui o cronograma desta oportunidade."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={escolherArquivo}
            disabled={lendo || gravando}
          />

          {lendo && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Lendo a planilha…
            </p>
          )}

          {resultado && resumo && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                {arquivoNome}
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Meses</p>
                  <p className="font-semibold">{resumo.meses}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Etapas com linha</p>
                  <p className="font-semibold">{resumo.linhas}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Linhas ignoradas</p>
                  <p className="font-semibold">{resumo.ignoradas}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Etapas sem linha</p>
                  <p className="font-semibold">{resumo.faltando}</p>
                </div>
              </div>
              {temCronograma && resultado.cronograma && (
                <p className="text-sm text-slate-600">O cronograma atual será substituído.</p>
              )}
              <ListaMensagens
                titulo="Erros (corrija a planilha e escolha de novo)"
                mensagens={resultado.erros}
                tom="erro"
              />
              <ListaMensagens titulo="Avisos" mensagens={resultado.avisos} tom="aviso" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {gravando && <Loader2 className="w-4 h-4 animate-spin" />}
            {gravando ? "Importando…" : "Importar cronograma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Criar `apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx`**

<!-- prettier-ignore -->
```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, Columns3, Loader2, Repeat, Trash2, Upload } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/formatters";
import {
  MAX_MESES,
  ajustarMeses,
  etapasDoOrcamento,
  lerPercentual,
  normalizarCronograma,
  reperiodizar,
  resumoCronograma,
} from "@/lib/cronograma-ff";
import { criarFilaGravacao } from "@/lib/fila-gravacao";
import ImportarCronogramaDialog from "./ImportarCronogramaDialog";

const SEM_ITENS = "Importe o orçamento com etapas para montar o cronograma.";
const SEM_ETAPAS =
  "O orçamento não tem etapas. Reimporte a planilha com as etapas (a skill cria a etapa quando o edital tem uma só).";

// colunas fixas à esquerda quando a grade rola na horizontal (até 60 meses)
const FIXA_ITEM = "sticky left-0 z-10 w-12 min-w-[3rem] px-2";
const FIXA_ETAPA = "sticky left-12 z-10 min-w-[14rem] max-w-[18rem] px-2";

// 12.3 → "12,30"
const formatPct = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// centavos → "1.234,56" (a coluna diz que é R$)
const formatValor = (centavos) =>
  ((Number(centavos) || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const formatDataHora = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const agoraISO = () => new Date().toISOString();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Total % da linha: verde com 100,00; vermelho com a soma e a diferença quando não fecha. */
function TotalLinha({ linha }) {
  if (linha.fecha) return <span className="font-semibold text-green-700">100,00%</span>;
  return (
    <div className="flex flex-col items-end">
      <span className="font-semibold text-red-600">{`${formatPct(100 - linha.diferenca)}%`}</span>
      <span className="text-[11px] text-red-600">
        {linha.diferenca > 0
          ? `falta ${formatPct(linha.diferenca)}`
          : `passa ${formatPct(-linha.diferenca)}`}
      </span>
    </div>
  );
}

/**
 * Pede o número de meses: "meses" acrescenta ou corta colunas; "reperiodizar" redistribui os %
 * mantendo a curva. `onConfirmar(modo, n)` resolve `true` quando gravou (o diálogo fecha).
 */
function MesesDialog({ modo, mesesAtuais, onFechar, onConfirmar }) {
  const aberto = modo !== null;
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) setTexto(mesesAtuais > 0 ? String(mesesAtuais) : "");
  }, [aberto, mesesAtuais]);

  const reperiodizando = modo === "reperiodizar";

  const confirmar = async () => {
    const n = Number(texto.trim());
    if (!texto.trim() || !Number.isInteger(n) || n < 1 || n > MAX_MESES) {
      toast.error(`O número de meses vai de 1 a ${MAX_MESES}`);
      return;
    }
    if (n === mesesAtuais) {
      toast.info(`O cronograma já tem ${plural(n, "mês", "meses")}`);
      return;
    }
    setSalvando(true);
    try {
      if (await onConfirmar(modo, n)) onFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v && !salvando) onFechar();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reperiodizando ? "Reperiodizar o cronograma" : "Número de meses"}
          </DialogTitle>
          <DialogDescription>
            {reperiodizando
              ? `Redistribui os % de cada etapa no novo número de meses, mantendo a forma da curva (ex.: 20/35/30/15 em 4 meses vira 55/45 em 2). Hoje: ${plural(mesesAtuais, "mês", "meses")}.`
              : "Mais meses acrescentam colunas com 0%. Menos meses cortam as colunas do fim, sem redistribuir os % (para manter a curva, use Reperiodizar)."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="cronograma-meses" className="text-xs text-slate-600">
            {`Meses (1 a ${MAX_MESES})`}
          </Label>
          <Input
            id="cronograma-meses"
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmar();
            }}
            disabled={salvando}
            className="mt-1 w-28"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {reperiodizando ? "Reperiodizar" : "Mudar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quadro "Cronograma físico-financeiro" da aba Planejamento da oportunidade (spec
 * 2026-10-05-cronograma-fisico-financeiro-design.md §4 e §5).
 *
 * Linhas = etapas de nível 1 do orçamento; células = % de cada mês, com o R$ calculado do
 * subtotal com desconto (nada de R$ é gravado). Grava o objeto inteiro em
 * `oportunidade.cronograma_ff`: ao sair de uma célula, com espera de 1 s (fila de gravação em
 * ordem); Importar, Meses, Reperiodizar e apagar linha gravam na hora. Falha = toast e a tela
 * volta ao último gravado.
 *
 * Todas as props são opcionais: o CalendarioConsolidado reusa o OportunidadeDetalhe sem
 * `setOportunidades`. `user` é aceito (contrato) e não é usado: o cronograma não grava autor.
 * Edita quem pode editar o orçamento (`podeEditar`); os demais só veem.
 */
export default function CronogramaFisicoFinanceiro({
  selectedOp,
  setSelectedOp,
  setOportunidades,
  orcamentoItens,
  empresaAtiva,
  podeEditar,
}) {
  const opId = selectedOp?.id;
  const cronogramaFF = selectedOp?.cronograma_ff;
  const podeGravar = !!podeEditar && !!opId && !!empresaAtiva?.id;

  const etapas = useMemo(() => etapasDoOrcamento(orcamentoItens || []), [orcamentoItens]);
  const numerosEtapas = useMemo(() => etapas.map((e) => e.numero), [etapas]);

  const [cronograma, setCronograma] = useState(() => normalizarCronograma(cronogramaFF));
  const [edicao, setEdicao] = useState(null); // { numero, mes, texto } da célula em foco
  const [importarAberto, setImportarAberto] = useState(false);
  const [modoMeses, setModoMeses] = useState(null); // null | "meses" | "reperiodizar"

  // último estado (para os handlers), último gravado (para voltar na falha) e o último
  // cronograma_ff que esta tela gravou ou leu (para não reler o próprio eco do pai)
  const cronogramaRef = useRef(cronograma);
  const salvoRef = useRef(cronograma);
  const ecoRef = useRef(cronogramaFF);
  const opRef = useRef(selectedOp);
  opRef.current = selectedOp;
  const opIdRef = useRef(opId);
  opIdRef.current = opId;
  const paiRef = useRef({ setSelectedOp, setOportunidades });
  paiRef.current = { setSelectedOp, setOportunidades };
  const cancelarEdicaoRef = useRef(false);

  const aplicarLocal = (novo) => {
    cronogramaRef.current = novo;
    setCronograma(novo);
  };

  // criada uma vez; lê os callbacks do pai e a oportunidade atual pelos refs
  const [fila] = useState(() =>
    criarFilaGravacao({
      esperaMs: 1000,
      gravar: async (id, cron) => {
        await sigo.entities.Oportunidade.update(id, { cronograma_ff: cron });
        if (opIdRef.current === id) salvoRef.current = cron;
        ecoRef.current = cron;
        const aplicar = (o) => (o?.id === id ? { ...o, cronograma_ff: cron } : o);
        paiRef.current.setSelectedOp?.((prev) => aplicar(prev));
        paiRef.current.setOportunidades?.((prev) =>
          Array.isArray(prev) ? prev.map(aplicar) : prev
        );
      },
      aoFalhar: (id, erro) => {
        console.error("Erro ao gravar o cronograma:", erro);
        toast.error(
          `Não foi possível gravar o cronograma: ${erro?.message || "erro desconhecido"}. A tela voltou ao último gravado.`
        );
        if (opIdRef.current === id) {
          cronogramaRef.current = salvoRef.current;
          setCronograma(salvoRef.current);
        }
      },
    })
  );

  // Outra oportunidade (ou o quadro montou de novo): começa do que veio do banco. Ao sair (troca
  // de oportunidade ou de aba, detalhe fechado), a edição que esperava o 1 s é gravada na hora.
  useEffect(() => {
    const inicial = normalizarCronograma(opRef.current?.cronograma_ff);
    ecoRef.current = opRef.current?.cronograma_ff;
    salvoRef.current = inicial;
    cronogramaRef.current = inicial;
    setCronograma(inicial);
    setEdicao(null);
    return () => {
      fila.descarregar();
    };
  }, [opId, fila]);

  // O pai trouxe outro cronograma_ff da mesma oportunidade (ex.: a gravação de um quadro
  // anterior terminou depois de este montar): adota, se aqui nada espera para gravar.
  useEffect(() => {
    if (cronogramaFF === ecoRef.current || fila.ocupada()) return;
    ecoRef.current = cronogramaFF;
    const novo = normalizarCronograma(cronogramaFF);
    salvoRef.current = novo;
    cronogramaRef.current = novo;
    setCronograma(novo);
  }, [cronogramaFF, fila]);

  const resumo = useMemo(() => resumoCronograma(etapas, cronograma), [etapas, cronograma]);

  // Importar, Meses, Reperiodizar e apagar linha: mostra já e grava na hora (resolve true/false)
  const gravarAgora = (novo) => {
    aplicarLocal(novo);
    return fila.gravarJa(opId, novo);
  };

  const confirmarCelula = (numero, mes, texto) => {
    setEdicao(null);
    if (cancelarEdicaoRef.current) {
      cancelarEdicaoRef.current = false;
      return;
    }
    if (!podeGravar) return;
    const valor = lerPercentual(texto);
    if (Number.isNaN(valor)) {
      toast.error(`"${String(texto).trim()}" não é um % de 0 a 100 (até 2 casas, ex.: 12,5)`);
      return;
    }
    const atual = cronogramaRef.current;
    const linha = atual.pct[numero];
    if (!linha && valor === null) return; // etapa sem linha e a célula continua vazia
    const novoValor = valor ?? 0;
    if (linha && linha[mes] === novoValor) return;
    const novaLinha = linha ? [...linha] : new Array(atual.meses).fill(0);
    novaLinha[mes] = novoValor;
    const novo = {
      ...atual,
      pct: { ...atual.pct, [numero]: novaLinha },
      origem: "manual",
      atualizado_em: agoraISO(),
    };
    aplicarLocal(novo);
    fila.agendar(opId, novo);
  };

  const importar = async (cron, arquivoNome) => {
    if (!podeGravar) return false;
    const novo = {
      ...normalizarCronograma(cron),
      origem: "importado",
      ...(arquivoNome ? { arquivo_nome: arquivoNome } : {}),
      atualizado_em: agoraISO(),
    };
    const ok = await gravarAgora(novo);
    if (ok) {
      const qtd = Object.keys(novo.pct).length;
      toast.success(
        `Cronograma importado: ${plural(novo.meses, "mês", "meses")} e ${plural(qtd, "etapa", "etapas")}`
      );
    }
    return ok;
  };

  const mudarMeses = async (modo, n) => {
    if (!podeGravar) return false;
    const atual = cronogramaRef.current;
    let novo;
    try {
      if (modo === "reperiodizar") {
        const pergunta = `Reperiodizar de ${atual.meses} para ${n} meses? Os % de cada etapa são redistribuídos mantendo a forma da curva e substituem os atuais.`;
        if (!window.confirm(pergunta)) return false;
        novo = reperiodizar(atual, n);
      } else {
        const { cronograma: ajustado, cortouValores } = ajustarMeses(atual, n);
        if (cortouValores) {
          const cortados =
            n + 1 === atual.meses
              ? `O mês ${atual.meses} tem valores.`
              : `Os meses ${n + 1} a ${atual.meses} têm valores.`;
          const pergunta = `${cortados} Cortar mesmo assim? (as linhas deixam de fechar 100%)`;
          if (!window.confirm(pergunta)) return false;
        }
        novo = { ...ajustado, origem: "manual" };
      }
    } catch (e) {
      toast.error(e?.message || "Número de meses inválido");
      return false;
    }
    const ok = await gravarAgora({ ...novo, atualizado_em: agoraISO() });
    if (ok) {
      toast.success(
        modo === "reperiodizar"
          ? `Cronograma reperiodizado para ${plural(n, "mês", "meses")}`
          : `Cronograma com ${plural(n, "mês", "meses")}`
      );
    }
    return ok;
  };

  const apagarOrfa = async (numero) => {
    if (!podeGravar) return;
    const pergunta = `Apagar a linha da etapa ${numero} do cronograma? Essa etapa não existe mais no orçamento.`;
    if (!window.confirm(pergunta)) return;
    const atual = cronogramaRef.current;
    const pct = { ...atual.pct };
    delete pct[numero];
    if (await gravarAgora({ ...atual, pct, origem: "manual", atualizado_em: agoraISO() })) {
      toast.success(`Linha da etapa ${numero} apagada`);
    }
  };

  const qtdMeses = cronograma.meses;
  const meses = Array.from({ length: qtdMeses }, (_, j) => j);
  const temItens = (orcamentoItens || []).length > 0;
  const semEtapas = etapas.length === 0;
  const temCronograma = qtdMeses > 0 && Object.keys(cronograma.pct).length > 0;
  const mostrarGrade = qtdMeses > 0 && (!semEtapas || resumo.orfas.length > 0);

  const legenda = [
    plural(qtdMeses, "mês", "meses"),
    `total ${formatBRL(resumo.totalCentavos / 100)}`,
    cronograma.origem === "importado"
      ? `importado de ${cronograma.arquivo_nome || "planilha"}`
      : cronograma.origem === "manual"
        ? "ajustado na tela"
        : "",
    cronograma.atualizado_em ? `em ${formatDataHora(cronograma.atualizado_em)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const rodape = [
    {
      rotulo: "Total do mês (R$)",
      valor: formatValor(resumo.totalCentavos),
      peso: resumo.totalCentavos > 0 ? "100,00%" : "",
      mes: (m) => formatValor(m.centavos),
    },
    { rotulo: "% do mês", mes: (m) => `${formatPct(m.pct)}%` },
    { rotulo: "Acumulado (R$)", mes: (m) => formatValor(m.acumCentavos) },
    { rotulo: "Acumulado (%)", mes: (m) => `${formatPct(m.acumPct)}%` },
  ];

  const celula = (linha, mes, temLinha) => {
    const pct = temLinha ? linha.pct[mes] : null;
    const textoPct = pct === null ? "" : formatPct(pct);
    const emEdicao = edicao?.numero === linha.numero && edicao?.mes === mes;
    const reais = temLinha && linha.valores[mes] !== 0 ? formatValor(linha.valores[mes]) : "";
    return (
      <div className="flex min-w-[6.5rem] flex-col items-end gap-0.5">
        {podeGravar ? (
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Etapa ${linha.numero}, Mês ${mes + 1} (%)`}
            value={emEdicao ? edicao.texto : textoPct}
            onFocus={(e) => {
              setEdicao({ numero: linha.numero, mes, texto: textoPct });
              e.target.select();
            }}
            onChange={(e) => {
              const texto = e.target.value;
              setEdicao((prev) => (prev ? { ...prev, texto } : prev));
            }}
            onBlur={(e) => confirmarCelula(linha.numero, mes, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                cancelarEdicaoRef.current = true;
                e.currentTarget.blur();
              }
            }}
            className={`h-7 w-20 rounded border px-1.5 text-right text-sm focus:border-blue-500 focus:text-slate-900 focus:outline-none ${
              pct ? "border-slate-300 text-slate-800" : "border-slate-200 text-slate-400"
            }`}
          />
        ) : (
          <span className={`text-sm ${pct ? "text-slate-800" : "text-slate-400"}`}>{textoPct}</span>
        )}
        <span className="min-h-[11px] text-[11px] leading-none text-slate-400">{reais}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <CalendarRange className="w-4 h-4 text-slate-500" />
            Cronograma físico-financeiro
          </h3>
          {qtdMeses > 0 && <p className="mt-0.5 text-xs text-slate-500">{legenda}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeGravar && !semEtapas && (
            <>
              <Button size="sm" onClick={() => setImportarAberto(true)}>
                <Upload className="w-4 h-4" />
                Importar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setModoMeses("meses")}>
                <Columns3 className="w-4 h-4" />
                Meses
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModoMeses("reperiodizar")}
                disabled={qtdMeses === 0}
              >
                <Repeat className="w-4 h-4" />
                Reperiodizar
              </Button>
            </>
          )}
          {/* EXPORTAR_CRONOGRAMA */}
        </div>
      </div>

      {semEtapas && (
        <p className="rounded-md border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-600">
          {temItens ? SEM_ETAPAS : SEM_ITENS}
        </p>
      )}

      {!semEtapas && qtdMeses === 0 && (
        <p className="rounded-md border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-600">
          {podeGravar
            ? "Sem cronograma. Importe a aba Cronograma da planilha (a mesma do orçamento, preenchida pela skill do Claude) ou defina os Meses para preencher à mão."
            : "Sem cronograma."}
        </p>
      )}

      {mostrarGrade && (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className={`${FIXA_ITEM} bg-slate-50 py-2 text-left`}>Item</th>
                <th className={`${FIXA_ETAPA} bg-slate-50 py-2 text-left`}>Etapa</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Valor (R$)</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Peso</th>
                {meses.map((j) => (
                  <th key={j} className="whitespace-nowrap px-2 py-2 text-right">
                    {`Mês ${j + 1}`}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-right">Total %</th>
              </tr>
            </thead>
            <tbody>
              {resumo.linhas.map((linha) => {
                const temLinha = Array.isArray(cronograma.pct[linha.numero]);
                return (
                  <tr key={linha.numero} className="border-t align-top">
                    <td className={`${FIXA_ITEM} bg-white py-2 font-medium text-slate-700`}>
                      {linha.numero}
                    </td>
                    <td className={`${FIXA_ETAPA} bg-white py-2 text-slate-700`}>
                      <span className="line-clamp-2" title={linha.descricao}>
                        {linha.descricao}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {formatValor(linha.centavos)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-slate-600">
                      {`${formatPct(linha.peso)}%`}
                    </td>
                    {meses.map((j) => (
                      <td key={j} className="px-1 py-1 text-right">
                        {celula(linha, j, temLinha)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <TotalLinha linha={linha} />
                    </td>
                  </tr>
                );
              })}
              {resumo.orfas.map((numero) => (
                <tr key={`orfa-${numero}`} className="border-t bg-slate-50 text-slate-400">
                  <td className={`${FIXA_ITEM} bg-slate-50 py-2`}>{numero}</td>
                  <td className={`${FIXA_ETAPA} bg-slate-50 py-2 italic`}>
                    Etapa não existe mais no orçamento
                  </td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                  {meses.map((j) => (
                    <td key={j} className="whitespace-nowrap px-2 py-2 text-right">
                      {formatPct(cronograma.pct[numero]?.[j])}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right">
                    {podeGravar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        title="Apagar a linha"
                        onClick={() => apagarOrfa(numero)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-slate-50 text-xs font-medium text-slate-700">
              {rodape.map((r) => (
                <tr key={r.rotulo} className="border-t">
                  <td className={`${FIXA_ITEM} bg-slate-50 py-1.5`} />
                  <td className={`${FIXA_ETAPA} bg-slate-50 py-1.5`}>{r.rotulo}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">{r.valor || ""}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">{r.peso || ""}</td>
                  {resumo.meses.map((m, j) => (
                    <td key={j} className="whitespace-nowrap px-2 py-1.5 text-right">
                      {r.mes(m)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5" />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {mostrarGrade && !semEtapas && (
        <p className="text-xs text-slate-500">
          {resumo.todasFecham
            ? "O R$ de cada mês sai do valor da etapa com o desconto do orçamento; os centavos do arredondamento ficam no último mês com % da etapa."
            : "Etapas em vermelho não somam 100,00%. O Exportar só fica disponível com todas em 100,00%."}
        </p>
      )}

      {podeGravar && (
        <ImportarCronogramaDialog
          open={importarAberto}
          onOpenChange={setImportarAberto}
          numerosEtapas={numerosEtapas}
          temCronograma={temCronograma}
          onImportar={importar}
        />
      )}
      {podeGravar && (
        <MesesDialog
          modo={modoMeses}
          mesesAtuais={qtdMeses}
          onFechar={() => setModoMeses(null)}
          onConfirmar={mudarMeses}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Ligar na aba Planejamento (2 trocas com Edit em `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx`)**

Cada `old` aparece uma única vez no arquivo.

9.1 — import (`:63`)

old:

<!-- prettier-ignore -->
```jsx
import OrcamentoLicitacaoBarra from "./OrcamentoLicitacaoBarra";
```

new:

<!-- prettier-ignore -->
```jsx
import OrcamentoLicitacaoBarra from "./OrcamentoLicitacaoBarra";
import CronogramaFisicoFinanceiro from "./CronogramaFisicoFinanceiro";
```

9.2 — o quadro acima das tarefas (`:1534-1541`). O `TabsContent` já tem `space-y-4`, e o fragmento põe os dois como filhos diretos dele.

old:

<!-- prettier-ignore -->
```jsx
                    {visitedTabs.has("obra") && (
                      <DiarioObraTab
                        projetoId={selectedOp.id}
                        empresaAtiva={empresaAtiva}
                        usuariosEmpresa={usuariosEmpresa}
                        showOnlyTasks={true}
                      />
                    )}
```

new:

<!-- prettier-ignore -->
```jsx
                    {visitedTabs.has("obra") && (
                      <>
                        <CronogramaFisicoFinanceiro
                          selectedOp={selectedOp}
                          setSelectedOp={setSelectedOp}
                          setOportunidades={setOportunidades}
                          orcamentoItens={orcamentoItens}
                          empresaAtiva={empresaAtiva}
                          user={user}
                          podeEditar={podeEditarOrcamento}
                        />
                        <DiarioObraTab
                          projetoId={selectedOp.id}
                          empresaAtiva={empresaAtiva}
                          usuariosEmpresa={usuariosEmpresa}
                          showOnlyTasks={true}
                        />
                      </>
                    )}
```

- [ ] **Step 10: Lint, Prettier e as âncoras da Task 6**

```bash
(cd apps/web && npx eslint --rule "no-undef: error" src/components/oportunidades/CronogramaFisicoFinanceiro.jsx src/components/oportunidades/ImportarCronogramaDialog.jsx src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx src/components/oportunidades/OportunidadeDetalhe.jsx; echo "exit $?")
grep -c "{/\* EXPORTAR_CRONOGRAMA \*/}" apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
grep -c '^import ImportarCronogramaDialog from "./ImportarCronogramaDialog";$' apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
grep -cE "const etapas = |const \[cronograma, setCronograma\] = " apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
npx prettier --check apps/web/src/lib/fila-gravacao.js apps/web/src/lib/fila-gravacao.test.js apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx apps/web/src/components/oportunidades/ImportarCronogramaDialog.jsx apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx
```

Expected:

- ESLint: o mesmo aviso do Step 1, agora na linha `118:3` (o import novo empurrou uma linha), `0 errors` e `exit 0`. Aviso novo, ou erro de `no-undef`, é defeito desta task;
- `1`, `1` e `2` (a Task 6 confere os mesmos números antes de mexer no quadro);
- Prettier: `All matched files use Prettier code style!`.

Conferido em 05/10 numa cópia do `apps/web` fora do repositório, com as Tasks 1 e 2 aplicadas:

- lint, Prettier e build passaram;
- as duas trocas da Task 6 aplicadas sobre este quadro deram `7 insertions(+), 1 deletion(-)` e lint limpo;
- o quadro foi renderizado com `react-dom/server` em 4 estados (sem itens, sem etapas, sem cronograma e com cronograma, com linha órfã e linha que não fecha, como editor e como leitor), com os textos e valores esperados.

- [ ] **Step 11: Build**

```bash
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
CHUNK=$(grep -l "Etapa não existe mais no orçamento" apps/web/dist/assets/*.js); echo "$CHUNK"
grep -c 'from"./xlsx-' $CHUNK
grep -o 'import("./cronograma-modelo-[^"]*")' $CHUNK | wc -l
```

Expected:

- `BUILD_OK` (de 2 a 5 minutos neste PC; o `vite.config.js` tem `logLevel: "error"`);
- um arquivo só, o chunk do detalhe da oportunidade (o nome varia; em 05/10 foi `apps/web/dist/assets/prazos-licitacao-<hash>.js`);
- `0`: o `xlsx` não entra estático no chunk do detalhe;
- `1`: a leitura da aba (`cronograma-modelo`, com o `xlsx`) só desce no Importar.

- [ ] **Step 12: Suíte completa**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Expected: `N + 1` arquivos e `M + 8` testes do Step 1, todos passando (com a base de 05/10: **40 e 516**).

- [ ] **Step 13: Commit (só os 6 caminhos da task)**

Na raiz:

```bash
git status --short
git add apps/web/src/lib/fila-gravacao.js apps/web/src/lib/fila-gravacao.test.js apps/web/src/components/oportunidades/ImportarCronogramaDialog.jsx apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
git commit -F - -- apps/web/src/lib/fila-gravacao.js apps/web/src/lib/fila-gravacao.test.js apps/web/src/components/oportunidades/ImportarCronogramaDialog.jsx apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx <<'EOF'
feat(oportunidades): cronograma físico-financeiro na aba Planejamento, com importação

- quadro com as etapas de nível 1 do orçamento por mês: % em cada célula, R$ calculado do
  subtotal com desconto, peso, Total % (verde ou vermelho com a diferença) e rodapé com o mês
  e o acumulado; linha de etapa que saiu do orçamento fica cinza, com lixeira
- grava oportunidade.cronograma_ff ao sair da célula, com 1 s de espera e em ordem (fila de
  gravação testada); na falha, toast e a tela volta ao último gravado. Importar, Meses e
  Reperiodizar gravam na hora
- importa a aba Cronograma do modelo SIGO com prévia, erros e avisos (ListaMensagens agora é
  exportada pelo diálogo do orçamento)
- edita quem edita o orçamento; os demais só veem
- depende da migração 0133, aplicada antes do push (Task 7 do plano)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: o assunto do commit e `6 files changed`, só esses caminhos. Se o hook do lint-staged recusar o commit com caminhos, confira com `git diff --cached --name-only` que só estes 6 estão no índice e rode o mesmo `git commit -F -` sem o `-- <caminhos>`.

---

### Task 6: Diálogo "Exportar cronograma" e botão Exportar no quadro

**Files:**

- Create: `apps/web/src/components/oportunidades/ExportarCronogramaDialog.jsx`
- Modify: `apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx` (criado na Task 5: a linha do import do `ImportarCronogramaDialog` e a âncora `{/* EXPORTAR_CRONOGRAMA */}`)
- Test: sem teste de componente (Vitest em node, sem DOM). A lógica está nas Tasks 1 e 4; os componentes são verificados por ESLint, build e o roteiro da Task 7.

**Interfaces:**

- Consumes (Task 1, `@/lib/cronograma-ff`, import estático): `normalizarCronograma`, `resumoCronograma` (`todasFecham`, `linhas`, `meses`, `totalCentavos`).
- Consumes (Task 4, `@/lib/cronograma-export`, **import dinâmico** no "Gerar"): `montarDadosCronograma`, `nomeArquivoCronograma`, `baixarCronogramaPdf`, `baixarCronogramaExcel`.
- Consumes (Orçamento, já no `master`): `validarRepresentante` (`@/lib/proposta-orcamento`), `formatarCpf` (`@/lib/cpf`), `formatBRL` (`@/lib/formatters`), `sigo.entities.Empresa.get`.
- Consumes (Task 5, `CronogramaFisicoFinanceiro.jsx`):
  - a linha `import ImportarCronogramaDialog from "./ImportarCronogramaDialog";`;
  - a âncora `{/* EXPORTAR_CRONOGRAMA */}`, uma vez, na barra de botões e **fora** de qualquer condição de `podeEditar` (exportar não grava nada);
  - as props `selectedOp` e `empresaAtiva` e, no corpo do componente, `etapas` (o `EtapaCron[]` de `etapasDoOrcamento`) e `cronograma` (o estado local, `Cronograma` normalizado, o mesmo que a grade mostra).
- Produces:
  - `ExportarCronogramaDialog` (default export), props `{ open, onOpenChange, selectedOp, empresaAtiva, etapas, cronograma }` (contrato);
  - **extra (fora do contrato):** `BotaoExportarCronograma` (export nomeado do mesmo arquivo), props `{ selectedOp, empresaAtiva, etapas, cronograma }`: o botão "Exportar" com o próprio estado de abertura e o diálogo. Assim o quadro só precisa de uma linha de import e da âncora, sem estado novo.

**Decisões desta task (o contrato não cobria):**

- **Botão no quadro:** "Exportar" (ícone `FileDown`), habilitado só com etapa, mês e `todasFecham`. Desabilitado, a dica "Todas as etapas precisam somar 100,00% para exportar" fica num `span` em volta, porque o botão desabilitado não recebe o mouse. Aparece para todos que veem a aba.
- **Dados exportados:** os `etapas` e `cronograma` do quadro (estado local), não o `selectedOp.cronograma_ff`. A grade grava com 1 s de espera, e no `CalendarioConsolidado` o `setSelectedOp` é vazio: o `selectedOp` pode estar atrás da tela.
- **Diálogo**, no padrão do "Exportar proposta":
  - campos: formato (PDF/Excel), local (padrão Cidade/UF da empresa), data (hoje) e representante (nome, cargo e CPF com máscara);
  - representante lido de `Empresa.get(empresaAtiva.id)` ao abrir; enquanto carrega, os campos e o "Gerar" ficam desabilitados;
  - sem validade e sem "registrar versão" (não há versão de cronograma, spec §7);
  - validações no "Gerar", com toast: cronograma vazio, linha que não fecha, `validarRepresentante` e data;
  - o aviso vermelho e o "Gerar" desabilitado repetem a regra do botão;
  - o `localDaEmpresa` (5 linhas) é repetido do `ExportarPropostaDialog`, para não mexer nele nem exportar função de um arquivo de componente.
- **Conferido no rascunho** (fora do repositório, com um quadro provisório no lugar do da Task 5): as duas trocas do Step 4, o lint com `no-undef` e o `vite build`, com o `cronograma-export` num chunk próprio que importa o `proposta-export` e o `xlsx`.
- **Não teste no `npm run dev` antes da Task 7:** o dev aponta para o Supabase de produção, e sem a 0133 o quadro não grava `cronograma_ff` (PGRST204).

- [ ] **Step 1: Linha de base do lint e conferência do quadro da Task 5**

```bash
(cd apps/web && npx eslint --rule "no-undef: error" src/components/oportunidades/CronogramaFisicoFinanceiro.jsx; echo "exit $?")
grep -c "{/\* EXPORTAR_CRONOGRAMA \*/}" apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
grep -c '^import ImportarCronogramaDialog from "./ImportarCronogramaDialog";$' apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
grep -cE "const etapas = |const \[cronograma, setCronograma\] = " apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
```

Expected: o lint como a Task 5 deixou (`exit 0`, anote os avisos, se houver), depois `1`, `1` e `2`. Se a contagem não bater, **pare**: os nomes vêm da Task 5 (Consumes acima) e precisam ser acertados lá antes desta task.

- [ ] **Step 2: Criar `apps/web/src/components/oportunidades/ExportarCronogramaDialog.jsx`**

<!-- prettier-ignore -->
```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/formatters";
import { formatarCpf } from "@/lib/cpf";
import { normalizarCronograma, resumoCronograma } from "@/lib/cronograma-ff";
import { validarRepresentante } from "@/lib/proposta-orcamento";

const AVISO_NAO_FECHA = "Todas as etapas precisam somar 100,00% para exportar";

const localDaEmpresa = (e) =>
  [e?.cidade, e?.estado]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join("/");

/** Resumo do cronograma como a tela mostra (as etapas do orçamento, sem as órfãs). */
function useResumo(etapas, cronograma) {
  return useMemo(
    () => resumoCronograma(etapas || [], normalizarCronograma(cronograma)),
    [etapas, cronograma]
  );
}

/** Pronto para exportar: tem etapa, tem mês e todas as linhas fecham 100,00%. */
const prontoParaExportar = (resumo) =>
  resumo.linhas.length > 0 && resumo.meses.length > 0 && resumo.todasFecham;

/**
 * "Exportar cronograma" (PDF ou Excel) do cronograma físico-financeiro da oportunidade.
 *
 * `etapas` e `cronograma` são os do quadro (o estado local, que pode estar à frente do
 * que já foi gravado). O representante legal vem de `empresa.representante_*` (lido de
 * novo ao abrir, como na proposta) e pode ser editado aqui só para esta exportação.
 * Não grava nada no banco.
 */
export default function ExportarCronogramaDialog({
  open,
  onOpenChange,
  selectedOp,
  empresaAtiva,
  etapas,
  cronograma,
}) {
  const [formato, setFormato] = useState("pdf");
  const [local, setLocal] = useState("");
  const [data, setData] = useState("");
  const [representante, setRepresentante] = useState({ nome: "", cargo: "", cpf: "" });
  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // a empresa da sessão entra só como ponto de partida ao abrir; mudar de
  // referência depois não pode apagar o que o usuário já digitou
  const empresaAtivaRef = useRef(empresaAtiva);
  empresaAtivaRef.current = empresaAtiva;
  const empresaId = empresaAtiva?.id;

  useEffect(() => {
    if (!open || !empresaId) return undefined;
    let cancelado = false;
    const preencher = (e) => {
      setEmpresa(e || null);
      setLocal(localDaEmpresa(e));
      setRepresentante({
        nome: e?.representante_nome || "",
        cargo: e?.representante_cargo || "",
        cpf: e?.representante_cpf ? formatarCpf(e.representante_cpf) : "",
      });
    };
    setFormato("pdf");
    setData(format(new Date(), "yyyy-MM-dd"));
    preencher(empresaAtivaRef.current);
    setCarregando(true);
    sigo.entities.Empresa.get(empresaId)
      .then((e) => {
        if (!cancelado && e) preencher(e);
      })
      .catch((err) => console.error("Erro ao carregar a empresa:", err))
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [open, empresaId]);

  const resumo = useResumo(etapas, cronograma);
  const qtdMeses = resumo.meses.length;
  const qtdEtapas = resumo.linhas.length;

  const gerar = async () => {
    if (!selectedOp?.id || !empresaId) return;
    if (qtdEtapas === 0 || qtdMeses === 0) {
      toast.error("O cronograma está vazio");
      return;
    }
    if (!resumo.todasFecham) {
      toast.error(AVISO_NAO_FECHA);
      return;
    }
    const validacao = validarRepresentante(representante);
    if (!validacao.ok) {
      toast.error(validacao.erros.join(". "));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      toast.error("Informe a data do cronograma");
      return;
    }

    setGerando(true);
    try {
      // import dinâmico: xlsx, jspdf e jspdf-autotable só descem no clique
      const {
        baixarCronogramaExcel,
        baixarCronogramaPdf,
        montarDadosCronograma,
        nomeArquivoCronograma,
      } = await import("@/lib/cronograma-export");
      const dados = montarDadosCronograma({
        etapas: etapas || [],
        cronograma,
        info: selectedOp.orcamento_info,
        oportunidade: selectedOp,
        empresa: empresa || empresaAtiva,
        representante,
        opcoes: { local, dataISO: data },
      });
      const nomeOp = selectedOp.nome || selectedOp.titulo || "";
      if (formato === "pdf") {
        await baixarCronogramaPdf(dados, nomeArquivoCronograma(nomeOp, data, "pdf"));
      } else {
        await baixarCronogramaExcel(dados, nomeArquivoCronograma(nomeOp, data, "xlsx"));
      }
      toast.success("Cronograma gerado");
    } catch (err) {
      console.error("Erro ao gerar o cronograma:", err);
      toast.error(`Erro ao gerar o cronograma: ${err?.message || "erro desconhecido"}`);
    } finally {
      setGerando(false);
    }
  };

  const mudarRep = (campo) => (e) =>
    setRepresentante((prev) => ({
      ...prev,
      [campo]: campo === "cpf" ? formatarCpf(e.target.value) : e.target.value,
    }));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!gerando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar cronograma</DialogTitle>
          <DialogDescription>
            {`Prazo de ${qtdMeses} ${qtdMeses === 1 ? "mês" : "meses"} · ${qtdEtapas} ${
              qtdEtapas === 1 ? "etapa" : "etapas"
            } · total de ${formatBRL(resumo.totalCentavos / 100)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!resumo.todasFecham && <p className="text-sm text-red-600">{AVISO_NAO_FECHA}</p>}

          <div>
            <Label className="text-xs text-slate-600">Formato</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={formato === "pdf" ? "default" : "outline"}
                onClick={() => setFormato("pdf")}
                disabled={gerando}
              >
                <FileText className="w-4 h-4" />
                PDF
              </Button>
              <Button
                type="button"
                size="sm"
                variant={formato === "xlsx" ? "default" : "outline"}
                onClick={() => setFormato("xlsx")}
                disabled={gerando}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cronograma-local" className="text-xs text-slate-600">
                Local
              </Label>
              <Input
                id="cronograma-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Cidade/UF"
                disabled={gerando}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cronograma-data" className="text-xs text-slate-600">
                Data
              </Label>
              <Input
                id="cronograma-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={gerando}
                className="mt-1"
              />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Representante legal
              {carregando && <Loader2 className="ml-2 inline w-3.5 h-3.5 animate-spin" />}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="cronograma-rep-nome" className="text-xs text-slate-600">
                  Nome *
                </Label>
                <Input
                  id="cronograma-rep-nome"
                  value={representante.nome}
                  onChange={mudarRep("nome")}
                  placeholder={empresa?.responsavel_principal || ""}
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cronograma-rep-cargo" className="text-xs text-slate-600">
                  Cargo
                </Label>
                <Input
                  id="cronograma-rep-cargo"
                  value={representante.cargo}
                  onChange={mudarRep("cargo")}
                  placeholder="Sócio-administrador"
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cronograma-rep-cpf" className="text-xs text-slate-600">
                  CPF
                </Label>
                <Input
                  id="cronograma-rep-cpf"
                  inputMode="numeric"
                  value={representante.cpf}
                  onChange={mudarRep("cpf")}
                  placeholder="000.000.000-00"
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {
                "Vale só para esta exportação. O padrão fica em Configurações → Empresa → Representante legal."
              }
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Fechar
          </Button>
          <Button onClick={gerar} disabled={gerando || carregando || !prontoParaExportar(resumo)}>
            {gerando && <Loader2 className="w-4 h-4 animate-spin" />}
            {formato === "pdf" ? "Gerar PDF" : "Gerar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botão "Exportar" do quadro do cronograma, com o diálogo. Habilitado só quando todas as
 * etapas somam 100,00%. Não grava nada: aparece também para quem só vê a aba.
 * O `span` leva a dica porque o botão desabilitado não recebe o mouse.
 */
export function BotaoExportarCronograma({ selectedOp, empresaAtiva, etapas, cronograma }) {
  const [aberto, setAberto] = useState(false);
  const resumo = useResumo(etapas, cronograma);
  const pronto = prontoParaExportar(resumo);
  return (
    <>
      <span title={pronto ? "Exportar o cronograma em PDF ou Excel" : AVISO_NAO_FECHA}>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)} disabled={!pronto}>
          <FileDown className="w-4 h-4" />
          Exportar
        </Button>
      </span>
      <ExportarCronogramaDialog
        open={aberto}
        onOpenChange={setAberto}
        selectedOp={selectedOp}
        empresaAtiva={empresaAtiva}
        etapas={etapas}
        cronograma={cronograma}
      />
    </>
  );
}
```

- [ ] **Step 3: Lint do componente novo**

```bash
(cd apps/web && npx eslint --rule "no-undef: error" src/components/oportunidades/ExportarCronogramaDialog.jsx; echo "exit $?")
```

Expected: nenhuma saída e `exit 0`.

- [ ] **Step 4: Ligar no quadro (2 trocas com Edit + Prettier)**

Aplique com a ferramenta **Edit** em `apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx` (cada `old` aparece uma única vez, conferido no Step 1).

4.1 — import

old:

<!-- prettier-ignore -->
```jsx
import ImportarCronogramaDialog from "./ImportarCronogramaDialog";
```

new:

<!-- prettier-ignore -->
```jsx
import ImportarCronogramaDialog from "./ImportarCronogramaDialog";
import { BotaoExportarCronograma } from "./ExportarCronogramaDialog";
```

4.2 — o botão (com o diálogo) no lugar da âncora. O `old` é só o comentário, sem a indentação, porque a indentação da âncora é a da Task 5; o Prettier acerta as linhas novas logo depois. O `Dialog` do Radix não desenha nada no lugar: abre em portal.

old:

<!-- prettier-ignore -->
```jsx
{/* EXPORTAR_CRONOGRAMA */}
```

new:

<!-- prettier-ignore -->
```jsx
<BotaoExportarCronograma
  selectedOp={selectedOp}
  empresaAtiva={empresaAtiva}
  etapas={etapas}
  cronograma={cronograma}
/>
```

Formate e confira (na raiz):

```bash
npx prettier --write apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
grep -c "BotaoExportarCronograma" apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
grep -c "EXPORTAR_CRONOGRAMA" apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
git diff --stat -- apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
```

Expected: `2` (o import e o `<BotaoExportarCronograma`), `0`, e o `git diff --stat` com `1 file changed, 7 insertions(+), 1 deletion(-)` (o Prettier só mexe nas linhas novas, porque o resto do arquivo já estava formatado pela Task 5).

- [ ] **Step 5: Lint e build**

```bash
(cd apps/web && npx eslint --rule "no-undef: error" src/components/oportunidades/ExportarCronogramaDialog.jsx src/components/oportunidades/CronogramaFisicoFinanceiro.jsx; echo "exit $?")
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
ls apps/web/dist/assets | grep -E "^(cronograma-export|proposta-export)-.*\.js$"
grep -o 'from"./[a-zA-Z0-9._-]*"' apps/web/dist/assets/cronograma-export-*.js | grep -c "proposta-export\|xlsx"
```

Expected:

- lint: `exit 0`, com os mesmos avisos do Step 1 e nenhum novo;
- `BUILD_OK` (neste PC leva de 2 a 5 minutos; o `vite.config.js` tem `logLevel: "error"`, então o build não mostra avisos);
- dois arquivos, `cronograma-export-<hash>.js` e `proposta-export-<hash>.js`, e depois `2`: o chunk do cronograma importa o da proposta e o do `xlsx` em vez de copiá-los, e o `xlsx`, o `jspdf` e o `jspdf-autotable` continuam fora dos chunks do Dashboard e da página de Oportunidades.

- [ ] **Step 6: Suíte e formatação**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
npx prettier --check apps/web/src/components/oportunidades/ExportarCronogramaDialog.jsx apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
```

Expected: a suíte igual ao fim da Task 5 (esta task não acrescenta teste), toda passando; Prettier `All matched files use Prettier code style!`.

- [ ] **Step 7: Commit (só os 2 caminhos da task)**

```bash
git status --short
git add apps/web/src/components/oportunidades/ExportarCronogramaDialog.jsx
git commit -F - -- apps/web/src/components/oportunidades/ExportarCronogramaDialog.jsx apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx <<'EOF'
feat(oportunidades): exportar o cronograma físico-financeiro em PDF ou Excel

- ExportarCronogramaDialog: formato, local, data e representante legal (lido da empresa
  ao abrir, editável só para esta exportação e validado como na proposta); xlsx, jspdf e
  jspdf-autotable só descem no clique do Gerar
- botão Exportar no quadro do cronograma: habilitado só com todas as etapas em 100,00% e
  visível também para quem só vê a aba, porque não grava nada; exporta o que a grade mostra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `2 files changed`, só esses dois caminhos.

---

## Parte D — Task 7: 0133 em produção, roteiro com o Javerson e publicação

### Task 7: 0133 em produção, roteiro com o Javerson no servidor local, push e plano de volta

**Regras desta task:**

- **Produção:** todo passo que mexe em produção (migração, push, revert) começa com "Pedir OK ao Javerson" e só segue com um "sim" explícito dele, no chat. As consultas de conferência são só de leitura: peça o OK uma vez, no Step 6, para rodá-las durante o roteiro.
- **Ordem (spec §10):** `0133` primeiro (o quadro grava `cronograma_ff`; sem a coluna, toda gravação falha com PGRST204), depois o roteiro no `npm run dev`, que usa o banco de produção, e só então o push.
- **Dados de teste:** o roteiro cria em produção duas oportunidades, `TESTE cronograma Itatinga` e `TESTE cronograma Imbé`, que o Javerson apaga no fim, se quiser.
- **Defeito no roteiro:** corrija na task de origem (commit `fix(...)` só com os arquivos dela; o Vite recarrega sozinho), repita o passo e, antes do push, refaça o Step 2.

**Files:**

- Nenhum arquivo do repositório é criado ou alterado.
- Fora do repositório:
  - `%TEMP%\cronograma-teste\` (scripts Python e consultas SQL);
  - duas planilhas novas nas pastas das licitações, para o Javerson escolher no navegador; nenhuma planilha existente é alterada;
  - os arquivos que o navegador baixa na exportação.

**Interfaces:**

- Consumes:
  - os commits das Tasks 1 a 6 em `master`, ainda não publicados. Assuntos usados no plano de volta:
    - Task 1 `feat(cronograma): contas do cronograma físico-financeiro em centésimos e centavos`;
    - Task 2 `feat(cronograma): leitura da aba Cronograma do modelo SIGO e a 3ª aba no modelo em branco`;
    - Task 3 `feat(cronograma): skill do Claude preenche a aba Cronograma do modelo SIGO`;
    - Task 4 `feat(cronograma): migração 0133 e exportação do cronograma físico-financeiro`;
    - Task 5 `feat(oportunidades): cronograma físico-financeiro na aba Planejamento, com importação`;
    - Task 6 `feat(oportunidades): exportar o cronograma físico-financeiro em PDF ou Excel`;
  - `supabase/migrations/0133_cronograma_fisico_financeiro.sql` (Task 4), que termina em `select 'ok' as res;`;
  - o bloco Python do `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md` (Task 3): `gravar_modelo_sigo(linhas, info, caminho, cronograma=None)`, `conferir_modelo_sigo(caminho)` e `arred`, antes da linha `# Exemplo`.
- Produces:
  - a `0133` aplicada e conferida em produção;
  - o roteiro conferido com o Javerson no servidor local, antes do push;
  - o front publicado (workflow "Deploy frontend to Hostgator").

**Números esperados** (calculados em 05/10 com as libs das Tasks 1 e 2 e o código da skill da Task 3, sobre cópias das planilhas reais):

- **Itatinga**, 1 etapa ("1 SERVIÇOS DE ELÉTRICA"), 56 itens, desconto de 12,35%:
  - subtotal R$ 1.417.472,96; 20/35/30/15:

    | Mês        | 1          | 2          | 3            | 4            |
    | ---------- | ---------- | ---------- | ------------ | ------------ |
    | R$         | 283.494,59 | 496.115,54 | 425.241,89   | 212.620,94   |
    | Acum. (R$) | 283.494,59 | 779.610,13 | 1.204.852,02 | 1.417.472,96 |
    | Acum. (%)  | 20,00      | 55,00      | 85,00        | 100,00       |

  - com desconto 0%: 323.448,95 · 566.035,66 · 485.173,42 · 242.586,70 (total 1.617.244,73);
  - Reperiodizar 4 → 2: 55,00/45,00 = 779.610,13 · 637.862,83;
  - Reperiodizar 2 → 4: 27,50/27,50/22,50/22,50 = 389.805,06 · 389.805,06 · 318.931,42 · 318.931,42;
  - Reperiodizar 4 → 18: 4,45 · 4,44 · 4,44 · 4,44 · 6,11 · 7,78 (×4) · 6,67 (×4) · 5,00 · 3,33 (×4), somando 100,00; o Mês 18 fica com R$ 47.201,81 (os centavos que sobram).

- **Imbé de Minas:** a comparação está no Step 10.

- [ ] **Step 1: Pré-checagem (o que já foi publicado?)**

Outras sessões também fazem `git push origin master` deste repositório.

```bash
git fetch -q origin
git status -sb | head -1
git status --short
git log --oneline origin/master -- apps/web/src/lib/cronograma-ff.js apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx
git log --oneline -1 origin/master -- apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx
```

Expected:

- `## master...origin/master [ahead K]`, sem `behind`. Com `behind` ou `diverged`, **pare** e mostre ao Javerson;
- `git status --short`: arquivos de outras sessões podem aparecer; não mexa neles (o push leva só commits);
- o 1º `git log`: **nenhuma linha**. Com alguma linha, o cronograma já está no ar sem a `0133`. Avise o Javerson na hora: "o cronograma foi publicado pelo push de outra sessão, e toda gravação do quadro falha até a 0133 subir". Vá direto aos Steps 3 e 4, com o OK dele, e depois volte ao Step 2;
- o 2º `git log`: **uma linha**, o Orçamento já publicado (Task 12 do plano `docs/superpowers/plans/2026-09-29-orcamento-planilha-prefeitura.md`).
  - **Sem linha**, o Orçamento ainda não foi publicado, e a spec §10 põe este roteiro depois do push dele. Os commits deste plano já estão em `master`, em cima dos do Orçamento. O push da Task 12 de lá levaria o cronograma junto, sem a `0133` nem este roteiro.
  - Mostre isso ao Javerson e combine um destes dois caminhos:
    - **(a), o recomendado, que segue a spec:** rodar antes a Task 12 do Orçamento. No roteiro de lá, o **Baixar modelo** já vem com a 3ª aba `Cronograma` (Task 2 deste plano) e a aba Planejamento já mostra o quadro: os dois são esperados. No Step 14 de lá, troque `git push origin master` por um push só até o commit anterior à Task 1 deste plano:

      ```bash
      PRIMEIRO=$(git log --format=%H --diff-filter=A master -- apps/web/src/lib/cronograma-ff.js | tail -1)
      git log --oneline -1 "$PRIMEIRO"
      git push origin "$PRIMEIRO^:master"
      ```

      Confira que o `git log` mostra o assunto da Task 1 (`feat(cronograma): contas do cronograma…`). Depois volte ao Step 1 desta task.

    - **(b):** aplicar a `0127` (Steps 3 e 4 da Task 12 do Orçamento) e a `0133` (Steps 3 e 4 daqui), rodar os dois roteiros agora no mesmo servidor local e publicar tudo de uma vez no Step 12 daqui.

- [ ] **Step 2: Suíte completa**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npm run lint && echo LINT_OK)
(cd apps/web && npx eslint --rule "no-undef: error" src/components/oportunidades/CronogramaFisicoFinanceiro.jsx src/components/oportunidades/ImportarCronogramaDialog.jsx src/components/oportunidades/ExportarCronogramaDialog.jsx src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx src/components/oportunidades/OportunidadeDetalhe.jsx; echo "exit $?")
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
git diff -z --name-only --diff-filter=ACMR origin/master...HEAD | xargs -0 npx prettier --check --ignore-unknown
```

Expected:

- Vitest: a linha de base anotada antes da Task 1 mais **4 arquivos e 83 testes**, sem `failed`. Os 83 são: Task 1, 37; Task 2, 19; Task 3, 1; Task 4, 18; Task 5, 8. Com a base de 05/10, ficam **40 arquivos e 516 testes**;
- `LINT_OK`;
- `no-undef`: só o aviso antigo `'cronogramaEtapas' is defined but never used` e `exit 0`;
- `BUILD_OK`;
- Prettier: `All matched files use Prettier code style!`. O `.sql` é ignorado pelo `--ignore-unknown`.

Se algo falhar em arquivo deste plano, corrija na task de origem (commit `fix(...)` só com ele) e rode o Step 2 de novo. Se falhar em arquivo de outra sessão, **não** corrija: mostre ao Javerson e combine antes de publicar.

- [ ] **Step 3: Pedir OK ao Javerson e aplicar a 0133**

Pergunte: "Posso aplicar a migração 0133 em produção? Ela só acrescenta a coluna oportunidade.cronograma_ff (jsonb, padrão {}, com a checagem de que é um objeto), sem mexer em dado existente."

Só com o "sim":

```bash
tail -n 1 supabase/migrations/0133_cronograma_fisico_financeiro.sql
supabase db query --linked -f supabase/migrations/0133_cronograma_fisico_financeiro.sql
```

Expected:

- a primeira linha é `select 'ok' as res;`;
- a consulta devolve uma linha com `"res": "ok"`, em JSON, dentro do aviso de dados não confiáveis que o CLI põe quando roda por agente.

**Nunca** use `supabase db push`.

- [ ] **Step 4: Conferir a 0133 (e a 0127, de que o quadro depende)**

```bash
mkdir -p "$TEMP/cronograma-teste"
cat > "$TEMP/cronograma-teste/conferir_0133.sql" <<'EOF'
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (table_name::text, column_name::text) in (
     ('oportunidade', 'cronograma_ff'),
     ('oportunidade', 'desconto_proposta_pct'), ('oportunidade', 'orcamento_info'),
     ('orcamento_item', 'numero'), ('orcamento_item', 'etapa')
   )
 order by table_name, column_name;
EOF
cat > "$TEMP/cronograma-teste/conferir_0133_check.sql" <<'EOF'
select (select pg_get_constraintdef(c.oid)
          from pg_constraint c
         where c.conrelid = 'public.oportunidade'::regclass
           and pg_get_constraintdef(c.oid) like '%cronograma_ff%') as checagem,
       (select count(*) from public.oportunidade) as oportunidades,
       (select count(*) from public.oportunidade where cronograma_ff = '{}'::jsonb) as vazias;
EOF
supabase db query --linked -o table -f "$TEMP/cronograma-teste/conferir_0133.sql"
supabase db query --linked -o table -f "$TEMP/cronograma-teste/conferir_0133_check.sql"
```

Expected: **5 linhas** na primeira consulta.

| table_name     | column_name           | data_type | is_nullable | column_default |
| -------------- | --------------------- | --------- | ----------- | -------------- |
| oportunidade   | cronograma_ff         | jsonb     | NO          | '{}'::jsonb    |
| oportunidade   | desconto_proposta_pct | numeric   | NO          | 0              |
| oportunidade   | orcamento_info        | jsonb     | NO          | '{}'::jsonb    |
| orcamento_item | etapa                 | boolean   | NO          | false          |
| orcamento_item | numero                | text      | YES         |                |

Na segunda consulta, uma linha com:

- `checagem` = `CHECK ((jsonb_typeof(cronograma_ff) = 'object'::text))`;
- `oportunidades` = `vazias`.

Se faltar `cronograma_ff`, **pare**: não siga para o roteiro nem publique, e mostre ao Javerson. Se faltar alguma das outras 4, a `0127` não subiu: rode antes os Steps 3 e 4 da Task 12 do Orçamento, com o OK dele.

- [ ] **Step 5: Gerar as planilhas de teste com o código da skill**

Os dois scripts executam o bloco Python do `SKILL.md` do repositório, sem o exemplo do fim. É o código que a skill do Claude roda. Crie-os com a ferramenta **Write**.

5.1 — `C:\Users\javer\AppData\Local\Temp\cronograma-teste\aba_cronograma.py`. Lê as abas Orçamento e Informações de um modelo SIGO e grava uma cópia com a aba Cronograma.

````python
"""Acrescenta a aba Cronograma a um .xlsx no modelo SIGO, com o código da skill (SKILL.md).

Uso: py -3 aba_cronograma.py <SKILL.md> <origem.xlsx> <destino.xlsx> <meses> <item>=<p1,p2,...> ...
Ex.:  ... 4 1=20,35,30,15
A Descrição de cada linha vem da etapa de mesmo Item na aba Orçamento.
"""
import re
import sys

from openpyxl import load_workbook

skill, origem, destino, meses, *linhas_cron = sys.argv[1:]
codigo = re.search(r"```python\n(.*?)\n```", open(skill, encoding="utf-8").read(), re.S).group(1)
ns = {}
exec(codigo.split("\n# Exemplo")[0], ns)  # só as funções da skill, sem o exemplo

wb = load_workbook(origem)
chaves = ["item", "codigo", "fonte", "descricao", "unidade", "quantidade", "preco", "total"]
linhas = []
for row in wb["Orçamento"].iter_rows(min_row=2, max_col=8, values_only=True):
    if any(v not in (None, "") for v in row):
        linhas.append({k: v for k, v in zip(chaves, row) if v not in (None, "")})
info = {r[0]: r[1] for r in wb["Informações"].iter_rows(max_col=2, values_only=True) if r[0]}
descricao = {str(l["item"]): l["descricao"] for l in linhas if "quantidade" not in l}
cronograma = {"meses": int(meses), "linhas": []}
for arg in linhas_cron:
    item, pct = arg.split("=")
    cronograma["linhas"].append({"item": item, "descricao": descricao.get(item),
                                 "pct": [float(p) for p in pct.split(",")]})
ns["gravar_modelo_sigo"](linhas, info, destino, cronograma)
erros, avisos, soma = ns["conferir_modelo_sigo"](destino)
print("erros:", erros)
print("avisos:", avisos)
print("soma dos itens:", soma)
````

5.2 — `C:\Users\javer\AppData\Local\Temp\cronograma-teste\imbe_modelo.py`. Monta o modelo SIGO de teste de Imbé:

- orçamento: a partir da planilha da proposta feita à mão;
- cronograma: o CFF de referência do edital, com 12 parcelas.

````python
"""Modelo SIGO de teste de Imbé de Minas (orçamento + aba Cronograma), com o código da skill.

Uso: py -3 imbe_modelo.py <SKILL.md> <Planilha Orçamentária - Proposta ... .xlsx> <destino.xlsx>
- Orçamento: aba "Planilha" da proposta feita à mão (preço de referência com BDI, coluna H);
  os grupos 1.1 a 1.6 viram as etapas 1 a 6 (o SIGO monta o cronograma pelas etapas de nível 1).
- Cronograma: o CFF de referência do edital (PROJET_1/CRONOGRAMA.pdf), 12 parcelas de 05/26 a
  04/27; os % por grupo estão nas parcelas 1 a 5 e as parcelas 6 a 12 têm 0%.
"""
import re
import sys

from openpyxl import load_workbook

skill, origem, destino = sys.argv[1:]
codigo = re.search(r"```python\n(.*?)\n```", open(skill, encoding="utf-8").read(), re.S).group(1)
ns = {}
exec(codigo.split("\n# Exemplo")[0], ns)  # só as funções da skill, sem o exemplo

ws = load_workbook(origem)["Planilha"]
linhas = []
for item, fonte, cod, descricao, unidade, qtd, _, preco in ws.iter_rows(
        min_row=7, max_col=8, values_only=True):
    if not item or not str(item).startswith("1."):
        continue
    numero = str(item)[2:]  # 1.3 → 3 (etapa), 1.3.2 → 3.2 (item)
    if unidade == "-":
        linhas.append({"item": numero, "descricao": descricao})
    else:
        linhas.append({"item": numero, "codigo": cod, "fonte": fonte, "descricao": descricao,
                       "unidade": unidade, "quantidade": qtd, "preco": preco,
                       "total": ns["arred"](qtd * preco)})
info = {
    "Órgão": "Prefeitura Municipal de Imbé de Minas",
    "Objeto": "Modernização do Estádio Geraldo de Abreu",
    "Edital/Processo": "Concorrência Eletrônica nº 02/2026 - Processo Licitatório nº 048/2026",
    "Data-base": "02/2026",
    "BDI (%)": "28,24",
    "Fonte de preços": "SINAPI Belo Horizonte 02/2026 desonerado",
    "Total da prefeitura (R$)": 542485.98,
    "Observações": "TESTE do cronograma: os grupos 1.1 a 1.6 do edital viraram as etapas 1 a 6. "
                   "Cronograma = CFF de referência, 12 parcelas (05/26 a 04/27), 6 a 12 com 0%.",
}
cff = {  # % por parcela no CFF do edital (as 5 primeiras; as outras 7 são 0)
    "1": [100, 0, 0, 0, 0],
    "2": [100, 0, 0, 0, 0],
    "3": [0, 30, 40, 30, 0],
    "4": [70, 30, 0, 0, 0],
    "5": [0, 0, 0, 20, 80],
    "6": [18.34, 20.62, 20.32, 20.33, 20.39],
}
descricao = {l["item"]: l["descricao"] for l in linhas if "quantidade" not in l}
cronograma = {"meses": 12, "linhas": [
    {"item": k, "descricao": descricao[k], "pct": v + [0] * 7} for k, v in cff.items()]}
ns["gravar_modelo_sigo"](linhas, info, destino, cronograma)
erros, avisos, soma = ns["conferir_modelo_sigo"](destino)
print("etapas:", len(descricao), "itens:", sum(1 for l in linhas if "quantidade" in l))
print("erros:", erros)
print("avisos:", avisos)
print("soma dos itens:", soma)
````

5.3 — rodar (PowerShell). Siga a nota do OneDrive: copie as planilhas antes de ler.

```powershell
$t = "$env:TEMP\cronograma-teste"
New-Item -ItemType Directory -Force $t | Out-Null
$ita = "D:\OneDrive\SINERGIA\LICITAÇÕES\SINERGIA SERVIÇOS\Licitações\2026\101- PM Itatinga - SP\03- SIGO"
$imbe = "D:\OneDrive\SINERGIA\LICITAÇÕES\SINERGIA SERVIÇOS\Licitações\2026\098 - PM DE IMBE DE MINAS\03- Proposta"
$skill = "C:\Users\javer\sigoobras-base\apps\web\public\skills\orcamento-prefeitura-sigo\SKILL.md"
Copy-Item -LiteralPath "$ita\Orcamento SIGO - PM Itatinga.xlsx" -Destination "$t\itatinga.xlsx"
Copy-Item -LiteralPath "$imbe\Planilha Orçamentária - Proposta (desconto linear) + BDI + Composição.xlsx" -Destination "$t\imbe-planilha.xlsx"
$env:PYTHONIOENCODING = "utf-8"
py -3 "$t\aba_cronograma.py" $skill "$t\itatinga.xlsx" "$t\Orcamento SIGO - PM Itatinga - com cronograma.xlsx" 4 1=20,35,30,15
py -3 "$t\imbe_modelo.py" $skill "$t\imbe-planilha.xlsx" "$t\TESTE SIGO - Imbe de Minas - cronograma 12 parcelas.xlsx"
```

Expected (conferido em 05/10):

- **Itatinga:**
  - `erros: []`;
  - em `avisos:`, 27 linhas `Linha N: Total … difere de qtd × preço = …`, que já vinham da conversão do orçamento (a prefeitura não arredonda o unitário com BDI), e `Soma dos itens 1617244.73 difere do total da prefeitura 1617259.46 em -14.73`;
  - **nenhum** aviso de `Cronograma`;
  - `soma dos itens: 1617244.73`.
- **Imbé:** `etapas: 6 itens: 36`, `erros: []`, `avisos: []` e `soma dos itens: 542485.98`.

Copie as duas planilhas para as pastas das licitações. O navegador do Javerson não enxerga o `%TEMP%` do Claude (o app MSIX virtualiza o `AppData`). Nenhum arquivo existente é sobrescrito.

```powershell
Copy-Item -LiteralPath "$t\Orcamento SIGO - PM Itatinga - com cronograma.xlsx" -Destination $ita
Copy-Item -LiteralPath "$t\TESTE SIGO - Imbe de Minas - cronograma 12 parcelas.xlsx" -Destination $imbe
Get-ChildItem -LiteralPath $ita, $imbe -Filter "*cronograma*" | Select-Object Name, Length
```

Expected: os dois arquivos, com tamanho > 0.

- [ ] **Step 6: Servidor local e preparação do roteiro**

Suba o servidor local em segundo plano (`run_in_background`), para o terminal continuar livre:

```bash
(cd apps/web && npm run dev)
```

Expected: `Local:   http://localhost:5173/`. Se a porta estiver ocupada, vale a que a saída mostrar.

O servidor local usa o **mesmo banco de produção** do site publicado: o que o roteiro gravar fica no banco de verdade.

- O Javerson faz os cliques em `http://localhost:5173`, com **Ctrl+F5** antes de começar. Ele entra com o login dele; você não digita nem guarda senha.
- Você acompanha e roda as consultas de conferência. Peça aqui o OK dele, uma vez, para essas consultas (só leitura).
- Ele cria em Oportunidades → Nova as oportunidades **`TESTE cronograma Itatinga`** e **`TESTE cronograma Imbé`**, com esses nomes exatos.

Consulta usada nos roteiros. Crie-a agora e rode-a quando um passo pedir:

```bash
cat > "$TEMP/cronograma-teste/cronograma_teste.sql" <<'EOF'
select o.nome, o.desconto_proposta_pct as desconto,
       o.cronograma_ff->>'meses' as meses, o.cronograma_ff->'pct' as pct,
       o.cronograma_ff->>'origem' as origem, o.cronograma_ff->>'arquivo_nome' as arquivo,
       o.cronograma_ff->>'atualizado_em' as atualizado_em
  from public.oportunidade o
 where o.nome like 'TESTE cronograma %' and o.deleted_at is null
 order by o.nome;
EOF
supabase db query --linked -o table -f "$TEMP/cronograma-teste/cronograma_teste.sql"
```

Expected agora: as duas oportunidades, com `meses`, `pct`, `origem`, `arquivo` e `atualizado_em` vazios (`cronograma_ff = {}`).

- [ ] **Step 7: Roteiro A — Itatinga: orçamento e cronograma importados**

| #   | Ação do Javerson                                                                                                                   | Resultado esperado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir **TESTE cronograma Itatinga** → aba **Planejamento**                                                                         | No topo, o quadro **Cronograma físico-financeiro** com "Importe o orçamento com etapas para montar o cronograma." e só o botão **Exportar**, desabilitado. Abaixo, as tarefas de sempre.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | Aba **Orçamento** → **Importar planilha** → `03- SIGO\Orcamento SIGO - PM Itatinga - com cronograma.xlsx` → **Importar 57 linhas** | Prévia: Etapas 1 · Itens 56 · Total de referência R$ 1.617.244,73 · Total da prefeitura R$ 1.617.259,46. Erros: nenhum. Avisos: 28 (27 de Total de linha e a diferença de R$ 14,73). Toast "Orçamento importado: 1 etapas e 56 itens". A aba Cronograma da planilha não atrapalha a importação do orçamento.                                                                                                                                                                                                                                                                                                                                                            |
| 3   | Desconto (%) `12,35` → **Aplicar** → OK                                                                                            | Total da proposta R$ 1.417.472,96.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | Aba **Planejamento**                                                                                                               | "Sem cronograma. Importe a aba Cronograma da planilha (…) ou defina os Meses para preencher à mão." Botões: **Importar**, **Meses**, **Reperiodizar** (desabilitado) e **Exportar** (desabilitado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | **Importar** → o mesmo arquivo                                                                                                     | Prévia: Meses 4 · Etapas com linha 1 · Linhas ignoradas 0 · Etapas sem linha 0. Sem erros e sem avisos. Não pergunta "Substituir…", porque não havia cronograma.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | **Importar cronograma**                                                                                                            | Toast "Cronograma importado: 4 meses e 1 etapa".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7   | Conferir a grade                                                                                                                   | - Legenda: "4 meses · total R$ 1.417.472,96 · importado de Orcamento SIGO - PM Itatinga - com cronograma.xlsx · em <data e hora>".<br>- Linha: 1 · SERVIÇOS DE ELÉTRICA · 1.417.472,96 · 100,00%.<br>- Células 20,00 · 35,00 · 30,00 · 15,00, com 283.494,59 · 496.115,54 · 425.241,89 · 212.620,94 em cinza embaixo.<br>- Total % **100,00%** em verde.<br>- Rodapé: Total do mês = os mesmos 4 valores; % do mês 20,00 · 35,00 · 30,00 · 15,00%; Acumulado (R$) 283.494,59 · 779.610,13 · 1.204.852,02 · 1.417.472,96; Acumulado (%) 20,00 · 55,00 · 85,00 · 100,00%.<br>- Texto embaixo: "O R$ de cada mês sai do valor da etapa (…)".<br>- **Exportar** habilitado. |

Conferência (consulta do Step 6). Expected na linha de Itatinga:

- `desconto 12.35`, `meses 4`;
- `pct {"1": [20, 35, 30, 15]}`;
- `origem importado`, `arquivo Orcamento SIGO - PM Itatinga - com cronograma.xlsx`;
- `atualizado_em` de agora.

- [ ] **Step 8: Roteiro B — Itatinga: edição, desconto, meses e reperiodizar**

| #   | Ação do Javerson                                                                      | Resultado esperado                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Na célula do Mês 4, digitar `14` e sair (Tab)                                         | Total % vermelho "99,00%" e, embaixo, "falta 1,00". R$ do Mês 4 = 198.446,21, sem o ajuste de centavos, porque a linha não fecha. Acumulado (R$) do Mês 4 = 1.403.298,23 (99,00%). **Exportar** desabilitado, com a dica "Todas as etapas precisam somar 100,00% para exportar". O texto embaixo da grade avisa das etapas em vermelho. |
| 2   | Mês 4 = `15,5%`                                                                       | "100,50%" e "passa 0,50", em vermelho.                                                                                                                                                                                                                                                                                                  |
| 3   | Mês 4 = `abc`                                                                         | Toast `"abc" não é um % de 0 a 100 (até 2 casas, ex.: 12,5)`; a célula volta a 15,50.                                                                                                                                                                                                                                                   |
| 4   | Mês 4 = `15`, Enter. Esperar 2 s, **F5**, abrir a oportunidade de novo → Planejamento | Verde 100,00% e os valores do Step 7. Depois do F5, continua 20/35/30/15, e a legenda diz "ajustado na tela".                                                                                                                                                                                                                           |
| 5   | Começar a digitar `99` no Mês 1 e apertar **Esc**                                     | A célula volta a 20,00, sem gravar.                                                                                                                                                                                                                                                                                                     |
| 6   | Aba Orçamento: Desconto `0` → Aplicar → OK. Voltar ao Planejamento                    | Os % não mudam. Valor 1.617.244,73; células 323.448,95 · 566.035,66 · 485.173,42 · 242.586,70; Acumulado (R$) do Mês 4 = 1.617.244,73.                                                                                                                                                                                                  |
| 7   | Desconto `12,35` → Aplicar → OK → Planejamento                                        | Volta aos valores do Step 7.                                                                                                                                                                                                                                                                                                            |
| 8   | **Meses** → `6` → **Mudar**                                                           | Sem confirmação. Toast "Cronograma com 6 meses"; Mês 5 e Mês 6 com 0,00 e a linha ainda 100,00%.                                                                                                                                                                                                                                        |
| 9   | **Meses** → `3` → **Mudar**                                                           | Confirmação: "Os meses 4 a 6 têm valores. Cortar mesmo assim? (as linhas deixam de fechar 100%)". **Cancelar**: nada muda e o diálogo continua aberto. Feche com **Cancelar**.                                                                                                                                                          |
| 10  | **Meses** → `4` → **Mudar**                                                           | Sem confirmação (os meses cortados estão em 0). Volta a 20/35/30/15.                                                                                                                                                                                                                                                                    |
| 11  | **Reperiodizar** → `2` → **Reperiodizar** → OK                                        | Confirmação: "Reperiodizar de 4 para 2 meses? Os % de cada etapa são redistribuídos mantendo a forma da curva e substituem os atuais.". Depois do OK: **55,00 · 45,00**; R$ 779.610,13 · 637.862,83; Acumulado (%) 55,00 · 100,00; toast "Cronograma reperiodizado para 2 meses".                                                       |
| 12  | **Reperiodizar** → `4` → OK                                                           | 27,50 · 27,50 · 22,50 · 22,50; R$ 389.805,06 · 389.805,06 · 318.931,42 · 318.931,42; 100,00% verde. A curva volta somando 100,00, mas não volta a 20/35/30/15: a forma em 2 meses não guarda o detalhe dos 4.                                                                                                                           |
| 13  | **Reperiodizar** → `0`, e depois `61`                                                 | Toast "O número de meses vai de 1 a 60"; nada muda. **Cancelar**.                                                                                                                                                                                                                                                                       |

Conferência depois do passo 11 (consulta do Step 6). Expected na linha de Itatinga:

- `meses 2`, `pct {"1": [55, 45]}`;
- `origem manual`;
- `arquivo` ainda com o nome da planilha.

- [ ] **Step 9: Roteiro C — Itatinga: exportar PDF e Excel**

| #   | Ação do Javerson                                                                                                                       | Resultado esperado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Importar** → `Orcamento SIGO - PM Itatinga - com cronograma.xlsx` → **Importar cronograma** → OK em "Substituir o cronograma atual?" | Volta a 20/35/30/15 (o Step 8 terminou em 27,50/27,50/22,50/22,50), com a legenda "importado de …".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2   | **Reperiodizar** → `18` → OK                                                                                                           | 18 colunas: 4,45 · 4,44 · 4,44 · 4,44 · 6,11 · 7,78 · 7,78 · 7,78 · 7,78 · 6,67 · 6,67 · 6,67 · 6,67 · 5,00 · 3,33 · 3,33 · 3,33 · 3,33, com Total 100,00% verde. A grade rola na horizontal com Item e Etapa fixos; o Mês 18 tem R$ 47.201,81.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | **Exportar** → PDF → **Gerar PDF**                                                                                                     | Baixa `Cronograma - TESTE cronograma Itatinga - <aaaa-mm-dd>.pdf`, A4 paisagem, com **mais de uma página**: os meses quebram na horizontal, repetindo Item e Etapa. "Página X de Y" em todas as páginas.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | **Importar** o mesmo arquivo de novo → OK em "Substituir o cronograma atual?" → **Exportar**                                           | O diálogo "Exportar cronograma" mostra "Prazo de 4 meses · 1 etapa · total de R$ 1.417.472,96". Local = cidade/UF da empresa; data = hoje; representante legal preenchido com o de Configurações → Empresa.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | Apagar o nome do representante → **Gerar PDF**                                                                                         | Toast de validação (nome obrigatório); nada é baixado. Desfazer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | **Gerar PDF**                                                                                                                          | Baixa `Cronograma - TESTE cronograma Itatinga - <aaaa-mm-dd>.pdf`, A4 paisagem, 1 página:<br>- cabeçalho: razão social, CNPJ e endereço da empresa; "Cronograma físico-financeiro"; Órgão "Prefeitura Municipal de Itatinga"; Objeto "Distrito Industrial de Itatinga"; "Prazo de execução: 4 meses";<br>- tabela: 1 · SERVIÇOS DE ELÉTRICA · 1.417.472,96 · 100,00% e, em cada mês, o R$ em cima e o % embaixo (283.494,59 / 20,00% … 212.620,94 / 15,00%);<br>- rodapé em negrito: Total do mês, % do mês, Acumulado (R$) até 1.417.472,96 e Acumulado (%) até 100,00%;<br>- local e data; linha de assinatura com nome, cargo e CPF; "Página 1 de 1". |
| 7   | **Excel** → **Gerar Excel**                                                                                                            | Baixa `Cronograma - TESTE cronograma Itatinga - <aaaa-mm-dd>.xlsx`, aba `Cronograma`:<br>- a etapa em 2 linhas (R$ e %);<br>- Total do mês, % do mês, Acumulado (R$) e Acumulado (%) em fórmulas `SUM`, com os mesmos números do PDF e da tela;<br>- **Ctrl+Alt+F9** não muda nenhum valor. Fechar **sem salvar**.                                                                                                                                                                                                                                                                                                                                       |

- [ ] **Step 10: Roteiro D — Imbé de Minas: comparação com a planilha feita à mão**

**O que a planilha à mão é.** O arquivo está em `098 - PM DE IMBE DE MINAS\03- Proposta\Cronograma Físico-Financeiro - reperiodizado (5 meses da OS).xlsx`, aba `CFF`, e foi conferido em 05/10.

- Ela **não redistribui a curva**. O CFF de referência do edital (`PROJET_1\CRONOGRAMA.pdf`) tem 12 parcelas, de 05/26 a 04/27, e só as 5 primeiras têm %. A planilha copiou os % de cada grupo nessas 5 parcelas e trocou as datas por "Mês 1 a Mês 5" da OS. A nota da linha 26 dela diz isso.
- Os grupos são 1.1 a 1.6 (nível 2 no edital, abaixo de "1. MODERNIZAÇÃO DO ESTÁDIO…").
- Valor da proposta = referência = R$ 542.485,98 (fator 1, sem desconto).
- Cada célula = % × valor do grupo, sem arredondar; a tela só mostra 2 casas.

No SIGO, o equivalente é **Meses 12 → 5**: corta as 7 parcelas vazias, sem mexer nos %. **Reperiodizar 12 → 5** é outro critério: espalha as 12 parcelas em 5 meses (cada mês novo = 2,4 parcelas) e comprime a obra em menos de 3 meses. O roteiro faz os dois, para mostrar a diferença.

O arquivo de teste do Step 5 transforma os grupos 1.1 a 1.6 nas **etapas 1 a 6**, porque o SIGO monta o cronograma pelas etapas de nível 1. Com a numeração do edital, o orçamento teria uma etapa só, "1 MODERNIZAÇÃO DO ESTÁDIO…", e o cronograma, uma linha só: 18,66 · 20,57 · 20,16 · 20,22 · 20,38 (soma 99,99, vermelha), ou 18,66 · 20,57 · 20,16 · 20,22 · 20,39 se a skill converter pelo R$ do CFF.

| #   | Ação do Javerson                                                                                                                                                       | Resultado esperado                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Abrir **TESTE cronograma Imbé** → Orçamento → **Importar planilha** → `03- Proposta\TESTE SIGO - Imbe de Minas - cronograma 12 parcelas.xlsx` → **Importar 42 linhas** | Prévia: Etapas 6 · Itens 36 · Total de referência R$ 542.485,98 · Total da prefeitura R$ 542.485,98, sem erros e sem avisos. O desconto fica em 0% (a planilha à mão está sem desconto).                                 |
| 2   | Planejamento → **Importar** → o mesmo arquivo → importar                                                                                                               | Prévia: Meses 12 · Etapas com linha 6 · 0 · 0. Grade com 12 meses, todas as linhas em 100,00% verde e os Meses 6 a 12 em 0,00. Total do mês: 101.254,18 · 111.592,90 · 109.387,34 · 109.681,56 · 110.570,00 · 0,00 (×7). |
| 3   | **Meses** → `5` → **Mudar**                                                                                                                                            | **Sem confirmação** (as parcelas cortadas estão vazias). 5 meses, todas as linhas 100,00%.                                                                                                                               |
| 4   | Abrir a planilha à mão no Excel, **só leitura**, ao lado da tela                                                                                                       | Comparar com a tabela abaixo.                                                                                                                                                                                            |
| 5   | (Opcional) **Exportar** PDF                                                                                                                                            | 6 etapas × 5 meses, com os números da tabela abaixo.                                                                                                                                                                     |

Comparação depois do passo 3 (SIGO × planilha à mão):

| Etapa (grupo)                 | Mês 1             | Mês 2             | Mês 3             | Mês 4             | Mês 5                                  |
| ----------------------------- | ----------------- | ----------------- | ----------------- | ----------------- | -------------------------------------- |
| 1 (1.1) Serviços preliminares | 100% · 2.164,32   | 0                 | 0                 | 0                 | 0                                      |
| 2 (1.2) Terraplenagem         | 100% · 29.015,62  | 0                 | 0                 | 0                 | 0                                      |
| 3 (1.3) Alambrados            | 0                 | 30% · 79.094,41   | 40% · 105.459,21  | 30% · 79.094,41   | 0                                      |
| 4 (1.4) Arquibancadas         | 70% · 66.528,87   | 30% · 28.512,37   | 0                 | 0                 | 0                                      |
| 5 (1.5) Instalações elétricas | 0                 | 0                 | 0                 | 20% · 26.657,09   | 80% · 106.628,35                       |
| 6 (1.6) Administração local   | 18,34% · 3.545,37 | 20,62% · 3.986,12 | 20,32% · 3.928,13 | 20,33% · 3.930,06 | 20,39% · **3.941,65** (à mão 3.941,66) |
| Total do mês: SIGO            | **101.254,18**    | 111.592,90        | 109.387,34        | 109.681,56        | **110.570,00**                         |
| Total do mês: à mão           | **101.254,17**    | 111.592,90        | 109.387,34        | 109.681,56        | **110.570,01**                         |
| % do mês (iguais)             | 18,66             | 20,57             | 20,16             | 20,22             | 20,38                                  |
| Acumulado (R$): SIGO          | **101.254,18**    | 212.847,08        | **322.234,42**    | **431.915,98**    | 542.485,98                             |
| Acumulado (R$): à mão         | **101.254,17**    | 212.847,08        | **322.234,41**    | **431.915,97**    | 542.485,98                             |
| Acumulado (%) (iguais)        | 18,66             | 39,24             | 59,40             | 79,62             | 100,00                                 |

**Resultado esperado: tudo igual**, menos R$ 0,01 em 1 célula e em 5 totais, todos explicados por arredondamento.

- Os % por grupo são iguais, e também o % do mês e o acumulado (%), com 2 casas.
- O total da obra é igual, R$ 542.485,98.
- **Administração local, Mês 5:** 3.941,65 no SIGO e 3.941,66 à mão. O SIGO arredonda cada célula em centavos e põe a sobra no último mês com %, para a linha somar exatamente o valor do grupo (19.331,33). A planilha não arredonda (19.331,33 × 20,39% = 3.941,658…), e as 5 células que ela mostra somam 19.331,34.
- **Total do mês e acumulado (R$):** ±R$ 0,01 nos Meses 1, 3, 4 e 5. O SIGO soma células já arredondadas; a planilha soma os valores cheios e só arredonda ao mostrar.

Qualquer outra diferença é defeito.

Agora o critério diferente:

| #   | Ação do Javerson                                                                                | Resultado esperado                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | **Importar** o mesmo arquivo → OK em "Substituir o cronograma atual?"                           | Volta a 12 meses.                                                                                                                                                                                                                                                                                 |
| 7   | **Reperiodizar** → `5` → OK                                                                     | Os %:<br>- 1 e 2: 100,00 · 0 · 0 · 0 · 0;<br>- 3 (Alambrados): 46,00 · 54,00 · 0 · 0 · 0;<br>- 4: 100,00 · 0 · 0 · 0 · 0;<br>- 5: 0 · 84,00 · 16,00 · 0 · 0;<br>- 6: 47,09 · 48,83 · 4,08 · 0 · 0.<br>Total do mês 256.602,39 · 263.769,20 · 22.114,39 · 0,00 · 0,00, todas as linhas em 100,00%. |
| 8   | **Importar** o mesmo arquivo de novo (OK em "Substituir o cronograma atual?") e **Meses** → `5` | Volta ao resultado do passo 3. Fica assim para o Step 11.                                                                                                                                                                                                                                         |

Explicação para o passo 7: **não é defeito**. O Reperiodizar mantém a forma da curva **no prazo inteiro do edital**. Como o CFF de Imbé usa só 5 das 12 parcelas, distribuir as 12 em 5 meses comprime a obra nos 2 primeiros meses e meio. Para Imbé, o botão certo é Meses. O Reperiodizar serve quando a curva do edital ocupa todo o prazo e a OS dá outro (ex.: Itatinga 4 → 2, no Step 8).

Conferência (consulta do Step 6). Expected na linha de Imbé:

- `desconto 0.00`, `meses 5`;
- `pct {"1": [100, 0, 0, 0, 0], "2": [100, 0, 0, 0, 0], "3": [0, 30, 40, 30, 0], "4": [70, 30, 0, 0, 0], "5": [0, 0, 0, 20, 80], "6": [18.34, 20.62, 20.32, 20.33, 20.39]}`;
- `origem manual`.

- [ ] **Step 11: Roteiro E — linha órfã e só leitura**

| #   | Ação do Javerson                                                                                                                                                                                                    | Resultado esperado                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Em **TESTE cronograma Imbé** → Orçamento → **Importar planilha** → o arquivo de Itatinga (`…com cronograma.xlsx`) → **Importar 57 linhas** → OK em "Substituir os 42 itens atuais?" (a contagem inclui as 6 etapas) | O orçamento passa a ter 1 etapa ("1 SERVIÇOS DE ELÉTRICA") e 56 itens.                                                                                                                                                                                                                                |
| 2   | Planejamento                                                                                                                                                                                                        | - Etapa 1 com a linha antiga dela (100,00 no Mês 1), valor 1.617.244,73 e 100,00% verde.<br>- Linhas 2 a 6 em cinza, "Etapa não existe mais no orçamento", com os % antigos e a lixeira.<br>- Os totais do rodapé só contam a etapa 1.<br>- **Exportar** habilitado: as órfãs não vão para o arquivo. |
| 3   | Lixeira da linha 2 → OK em "Apagar a linha da etapa 2 do cronograma? Essa etapa não existe mais no orçamento."                                                                                                      | Toast "Linha da etapa 2 apagada"; a linha some.                                                                                                                                                                                                                                                       |
| 4   | (Se houver um usuário de teste com a aba Cronograma e **sem** "Orçamento → editar") entrar com ele e abrir a mesma oportunidade                                                                                     | % e R$ como texto, sem campos. Sem Importar, Meses, Reperiodizar nem lixeira; Exportar continua.                                                                                                                                                                                                      |
| 5   | (Opcional) Dashboard → calendário → abrir a `TESTE cronograma Itatinga` (se ela tiver data no calendário) → Planejamento → mudar uma célula e voltar                                                                | Grava igual; F5 e conferir. Esse caminho não passa `setOportunidades`, e o quadro não depende dele.                                                                                                                                                                                                   |

Conferência (consulta do Step 6). Expected na linha de Imbé: `pct` com as chaves `1`, `3`, `4`, `5` e `6` (sem a `2`).

Anote o que passou e o que não passou e mostre ao Javerson. Diferença de centavo explicada como no Step 10 é esperada; qualquer outra diferença é defeito. Com tudo passando e o visto dele, siga para o Step 12. Com defeito, corrija antes (veja as regras desta task).

- [ ] **Step 12: Pedir OK ao Javerson e publicar o front (push em master)**

Se o roteiro gerou commits `fix(...)`, rode o Step 2 de novo antes. Encerre o servidor local do Step 6.

```bash
git fetch -q origin
git status -sb | head -1
git log --oneline origin/master..master
```

Mostre a lista ao Javerson, separando:

- os commits deste plano (Tasks 1 a 6, o do próprio plano e eventuais `fix`/`style`);
- os do Orçamento, se ele escolheu o caminho (b) do Step 1;
- os de outras sessões. Se houver, pergunte se podem ir junto: podem depender de migração que ainda não subiu.

Pergunte: "O roteiro passou no servidor local e a 0133 está aplicada. Posso publicar o front (push em master)? Vão junto estes N commits: …". Só com o "sim":

```bash
git push origin master
git rev-parse --short HEAD
gh run list --workflow deploy-hostgator.yml --branch master --limit 3
```

Expected: o push termina com `master -> master`. Na lista, a linha mais nova é do `HEAD` recém-publicado; se ainda for a anterior, rode o `gh run list` de novo em alguns segundos. Pegue o `ID` dessa linha:

```bash
gh run watch <ID> --exit-status
gh run list --workflow ci.yml --branch master --limit 1
```

Expected:

- `gh run watch`: todos os passos com ✓ e `Run Deploy frontend to Hostgator (<ID>) completed with 'success'`. Se falhar, mostre `gh run view <ID> --log-failed` ao Javerson; o site continua na versão anterior;
- CI: `completed success`. Se falhar só por arquivo de outra sessão, informe; isso não bloqueia o deploy.

- [ ] **Step 13: Teste rápido no site publicado**

```bash
curl -s https://www.sigoobras.com.br/skills/orcamento-prefeitura-sigo/SKILL.md | grep -c "^## Cronograma"
```

Expected: `1`. Com `0`, o `SKILL.md` novo não subiu: confira `apps/web/public/skills/` no commit da Task 3.

O Javerson, em https://www.sigoobras.com.br, com **Ctrl+F5**:

| #   | Ação do Javerson                             | Resultado esperado                                                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | **TESTE cronograma Itatinga** → Planejamento | O quadro com 20/35/30/15 e os valores do Step 7.                                                                         |
| 2   | Mudar uma célula, esperar 2 s, F5 e voltar   | A mudança ficou. Volte o valor.                                                                                          |
| 3   | Aba Orçamento → **Baixar modelo**            | `Modelo de orcamento SIGO.xlsx` com 3 abas: `Orçamento`, `Informações` e `Cronograma` (Item, Descrição, Mês 1 … Mês 12). |
| 4   | Planejamento → **Exportar** → PDF            | Igual ao do Step 9, passo 6.                                                                                             |

**Limpeza (o Javerson decide):**

- apagar pelo sistema as oportunidades `TESTE cronograma Itatinga` e `TESTE cronograma Imbé` (exclusão lógica; o `cronograma_ff` delas sai das telas junto);
- apagar `TESTE SIGO - Imbe de Minas - cronograma 12 parcelas.xlsx` da pasta de Imbé.

O `Orcamento SIGO - PM Itatinga - com cronograma.xlsx` pode ficar: é o modelo de Itatinga já com o cronograma.

**Para decidir depois (fora deste plano):** editais como o de Imbé, com um grupo de nível 1 que envolve tudo ("1. MODERNIZAÇÃO…") e as etapas no nível 2, rendem uma linha só no cronograma do SIGO. Pergunte ao Javerson se a skill deve promover os grupos de nível 2 a etapas nesse caso, ou se o cronograma deve aceitar o nível 2.

- [ ] **Step 14: Plano de volta (só se o Javerson pedir)**

A `0133` é só aditiva e **não volta**: a coluna fica, e o que foi gravado nela fica no banco. A volta desfaz:

- as telas (Tasks 5 e 6);
- a skill (Task 3), que mandaria o usuário a um botão que não existe mais;
- a 3ª aba do modelo em branco (Task 2).

As libs das Tasks 1 e 4 ficam sem uso e sem efeito para o usuário.

Pergunte: "Posso desfazer o cronograma físico-financeiro (telas, skill e a aba do modelo) e publicar? A coluna cronograma_ff fica no banco, sem uso." Só com o "sim":

```bash
git fetch -q origin && git status -sb | head -1 && git status --short
PRIMEIRO=$(git log --format=%H --diff-filter=A origin/master -- apps/web/src/lib/cronograma-ff.js | tail -1)
git log -1 --format='%h %s' "$PRIMEIRO"
ALVO="apps/web/src/components/oportunidades/CronogramaFisicoFinanceiro.jsx apps/web/src/components/oportunidades/ImportarCronogramaDialog.jsx apps/web/src/components/oportunidades/ExportarCronogramaDialog.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md apps/web/src/lib/orcamento-modelo.js"
git log --format='%h %s' "$PRIMEIRO"^..origin/master -i --grep='cronograma' -- $ALVO
```

Expected:

- `PRIMEIRO` = o commit da Task 1 (`feat(cronograma): contas do cronograma físico-financeiro …`);
- a lista, do mais novo para o mais antigo: Task 6, Task 5, Task 3 e Task 2, e os `fix` deles.

Mostre a lista ao Javerson. Se entrou commit de **outra sessão**, pare e combine: o revert desfaria o trabalho dela. Se `git status --short` mostrar alteração não commitada nesses arquivos, o revert recusa; combine com a outra sessão antes.

Com a lista confirmada:

```bash
LISTA=$(git log --format=%H "$PRIMEIRO"^..origin/master -i --grep='cronograma' -- $ALVO)
git revert --no-commit $LISTA
git diff --cached --stat
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npm run lint && echo LINT_OK)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
```

Expected:

- `git revert` sem conflito (a lista vem do mais novo para o mais antigo, a ordem certa);
- o `--stat` só com estes arquivos:
  - os de `ALVO`;
  - os testes que esses commits alteraram (`orcamento-modelo.test.js` e `skill-orcamento.test.js`);
  - os arquivos que eles criaram (`fila-gravacao.js` e `cronograma-modelo.js`, cada um com o seu teste), que saem;
- Vitest sem `failed`, com 2 arquivos e 28 testes a menos que no Step 2 (os da Task 2, os da Task 5 e o da Task 3);
- `LINT_OK` e `BUILD_OK`.

Com conflito ou falha: `git revert --abort`, e mostre ao Javerson.

```bash
git commit -F - <<'EOF'
revert(cronograma): tira o cronograma físico-financeiro das telas, da skill e do modelo

Desfaz as Tasks 2, 3, 5 e 6 do plano 2026-10-05: o quadro da aba Planejamento, a importação,
a exportação, a seção Cronograma da skill e a 3ª aba do modelo em branco. As libs das contas e
da exportação ficam sem uso. A 0133 continua aplicada (só aditiva): oportunidade.cronograma_ff
fica no banco, sem tela.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline origin/master..master
```

Mostre de novo o que vai subir (o revert e, se houver, commits novos de outras sessões) e publique só com o OK:

```bash
git push origin master
gh run list --workflow deploy-hostgator.yml --branch master --limit 1
gh run watch <ID> --exit-status
```

Expected: `Run Deploy frontend to Hostgator (<ID>) completed with 'success'`. Com Ctrl+F5:

- a aba Planejamento volta a mostrar só as tarefas;
- o Baixar modelo volta a ter 2 abas;
- a skill volta ao texto sem a seção Cronograma.
