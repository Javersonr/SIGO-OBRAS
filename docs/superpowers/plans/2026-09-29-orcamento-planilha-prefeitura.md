# Orçamento pela planilha da prefeitura, com desconto e proposta em PDF/Excel: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Orçamento da oportunidade:

- importar a planilha da prefeitura no modelo fixo do SIGO, convertida pela skill do Claude;
- aplicar um desconto % linear, com o unitário cortado na 2ª casa;
- exportar a proposta em PDF ou Excel, com o representante legal e a versão registrada.

As etapas aparecem na oportunidade e no projeto, na ordem da planilha.

**Architecture:**

- **Lógica pura em `apps/web/src/lib/`, testada com Vitest:**
  - `orcamento-desconto.js`: dinheiro em inteiros/BigInt;
  - `orcamento-modelo.js`: SheetJS;
  - `orcamento-registros.js`, `orcamento-template.js`, `proposta-orcamento.js`, `proposta-export.js`, `cpf.js`, `representante-empresa.js`, `skill-orcamento.js`.
- **Componentes novos em `components/oportunidades/`:** `OrcamentoLicitacaoBarra`, `ImportarPlanilhaOrcamentoDialog` e `ExportarPropostaDialog`.
- **Telas existentes:** ganham etapas, ordem e permissões corrigidas.
- **Migração `0127`:** só aditiva.
- **Servidor:** nenhuma Edge Function nova ou alterada.

**Tech Stack:** React 18 + Vite, SheetJS `xlsx` 0.18.5 (sem estilos), `jspdf` 2.5.2 + `jspdf-autotable` ^3.8.4 (nova), JSZip + file-saver, Vitest (ambiente node), Supabase (SDK `sigo.entities`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md` (aprovada em 29/09/2026; commits f748101 e 8c9587c).
- **Modelo SIGO:**
  - aba `Orçamento` com o cabeçalho exato `Item | Código | Fonte | Descrição | Unidade | Quantidade | Preço unitário (R$) | Total (R$)`;
  - aba `Informações` com `Órgão`, `Objeto`, `Edital/Processo`, `Data-base`, `BDI (%)`, `Fonte de preços`, `Total da prefeitura (R$)` e `Observações`;
  - limite de 3.000 linhas.
- **Desconto:**
  - de 0 a 99,99%, com até 2 casas;
  - unitário = **truncar**(referência × (1 − d), 2);
  - total do item = **arredondar**(quantidade × unitário, 2), com meio para cima;
  - aritmética em inteiros (BigInt onde passar de 2^53).
- **Importação:** substitui os itens da oportunidade (`deleteMany` + `bulkCreate` em lotes de 200).
  - Todo registro leva todas as chaves.
  - Item importado: `bdi = 0`, `imposto = 0` e `tipo = null`.
  - Etapa: `etapa = true`, com quantidade e valores nulos.
- **Gravações pendentes:** a edição por campo grava a linha inteira depois de 1,5 s. Importar cancela antes os timers de `updateTimeoutRef` (tudo é substituído). Aplicar o desconto **não descarta** edição pendente: se houver timer ou gravação em voo, avisa ("Aguarde a gravação da última edição e aplique de novo") e sai sem gravar; o cancelamento fica só como proteção.
- **Excel sem negrito** (limitação do SheetJS CE); o PDF usa negrito nas etapas.
- **Representante:**
  - no diálogo de exportação, vem preenchido com `empresa.representante_*` e pode ser editado sem gravar;
  - em Configurações, grava na empresa (a RLS só deixa o super admin salvar).
- **Versão da proposta:** `Rascunho`, com o botão "Marcar enviada", que muda só o `status` (o trigger da 0066 barra `data_envio`).
- **Ordem no Projeto:** por `ordem` só quando algum item tem `numero`; senão, a ordem alfabética de hoje.
- **Permissão da aba:** aceita "Orçamento" e "Orcamento"; `aba` passa como expressão JS.
- **Migração nova `0127_orcamento_planilha_prefeitura.sql`:**
  - a 0125 é das pastas, a 0130 do EAD, e as 0127 a 0129 estão reservadas para esta frente;
  - aplicação com `supabase db query --linked -f` (nunca `db push`), idempotente, terminando em `select 'ok' as res;`;
  - sobe **antes** do push do front, porque o Salvar da aba Empresa manda todos os campos.
- **Repositório compartilhado com outras sessões:**
  - commit parcial só com os caminhos da task (`git add` dos arquivos novos, depois `git commit -F - -- <caminhos>`); nunca `-A/-a/.`, stash, reset ou rebase;
  - mensagem em português, com linhas do corpo de até 100 caracteres (commitlint) e a última linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Edição de arquivos:** aplicar as trocas old→new com a ferramenta Edit. O `.gitattributes` define `eol=lf`.
- **Este arquivo e o Prettier:** o CI roda o Prettier nos `.md`, com largura 120, e os blocos de código do plano seguem a largura 100 dos `.js`/`.jsx`. Onde o Prettier dos `.md` reformataria um bloco, há um `<!-- prettier-ignore -->` logo antes da cerca. **Não tire essas linhas:** sem elas, o `prettier --write` reformata os blocos, e as âncoras old→new e o código dos arquivos novos deixam de ser exatos.
- **Front:**
  - `cd apps/web && npx vitest run` (anotar a linha de base antes da Task 1; em 29/09 era de 21 arquivos e 230 testes);
  - `npx eslint <arquivos>`;
  - `npm run build > /dev/null && echo BUILD_OK`.
- **Produção** (migração e push): pedir o OK do Javerson imediatamente antes de cada passo. O teste ponta a ponta com ele é **antes** do push, no `npm run dev` (que usa o banco de produção), depois de aplicada a 0127.

## Decisões registradas na redação e na conferência (aceitas)

- **C1:** o roteiro de teste com o Javerson roda no servidor local (`npm run dev`), com a 0127 já aplicada, e só depois vem o push (spec §13).
- **C2:** a planilha de Itatinga fica em `D:\OneDrive\SINERGIA\LICITAÇÕES\SINERGIA SERVIÇOS\Licitações\2026\101- PM Itatinga - SP\01- Arquivo\Planilha Orcamentaria (original Excel).xlsx`.
- **C3:** na proposta, órgão, objeto e edital vêm de `orcamento_info` e, na falta, dos campos da licitação da oportunidade. O objeto cai por último no nome da oportunidade, e um dado que não exista não aparece.
- `resumoOrcamento().itensSemReferencia` é um **número**.
- `lerArquivoModelo` lê com `sheetStubs: true` e `cellNF: true` (a célula traz o formato `z`) e devolve um erro legível se o arquivo não for uma planilha.
- A prévia da importação mostra no máximo os 50 primeiros avisos, mais "e mais N".
- Um item sem Unidade gera o aviso "Linha N: item sem unidade".
- O card "Importar" do estado vazio abre o diálogo novo, pelo estado `importarAberto` elevado ao `OportunidadeDetalhe`.
- Com orçamento numerado, o filtro de tipo fica escondido e o filtro efetivo vale "all".
- A ferramenta do conector, o Portal do cliente (etapas como R$ 0,00 e corte em 1.000 linhas) e as pastas ficam fora desta entrega. O Portal do cliente é da sessão de segurança.
- Conferido: no "Ganho", os itens mudam de dono **na mesma linha**, e as colunas novas vão junto sem mudar código.
- **Contas estritas (revisão da Task 1, 01/10; decisão do Javerson).** `precoComDesconto` lança `RangeError` com desconto fora de 0 a 99,99 ou referência inválida (antes virava 0%, e a proposta saía a preço cheio), e o texto numérico das contas é estrito, sem `parseFloat` (`"1,5"`, `"12abc"` e `"1e3"` viram vazio; `".5"` e `"5."` valem). Chamadores conferidos: **Task 4** usa `descontoPct ?? 0` explícito (nulo/ausente = 0; o resto vai ao `precoComDesconto`, não ao `validarDesconto`, que recusa vazio); **Task 5** já validava com `validarDesconto` e ganhou `try/catch` ao redor do `aplicarDesconto` e da montagem dos registros da importação (antes de apagar qualquer item); **Tasks 2, 7, 8, 6 e 11** passam number (ou texto de `<input type="number">`), sem mudança de código (ver a observação na Task 6).
- **Leitura do modelo endurecida (revisão 3 da Task 2, 05/10; o Javerson autorizou as correções técnicas).**
  - **Data do Excel pelo formato, não pelo texto exibido.** Digitar `1/10` ou `09/2025` vira data com formato `d-mmm`, `mmm-yy` ou `mm/yyyy`, e o texto exibido (`10/1/26`) só casa com alguns. Por isso `lerArquivoModelo` lê com `cellNF: true` e `XLSX.SSF.is_date(z)` decide (o texto exibido fica só de reserva quando não há `z`). Item, Quantidade e Preço com formato de data são **erro**; `Total (R$)` e `Total da prefeitura` são aviso ("foi ignorado").
  - **`Data-base` numérica:** com formato que mostra o dia vira `dd/mm/aaaa`; sem o dia (`mmm-yy`, `mm/yyyy`), `mm/aaaa`, porque a data-base de uma tabela de preços é mês/ano e não se inventa um "01/". Número puro (`General`, `45901`) vira o texto do número, com o aviso "Informações, linha N: Data-base numérica (45901) — confira.".
  - **Modelo em branco:** `gerarModelo` grava a coluna B da aba `Informações` como Texto (`z: "@"`), menos o total da prefeitura (B7, número), para `09/2025` não virar data.
  - **Tetos do banco:** Quantidade ≥ 1e11 (`numeric(14,3)`), Preço ≥ 1e10 (`numeric(14,4)`) e total da linha ≥ 1e12 (`numeric(14,2)`) são **erro de linha** ("acima do limite"), e o `totalLinha` não roda com valor acima do teto. Sem isso o INSERT da Task 5 estoura depois do `deleteMany`, e o orçamento antigo já foi apagado.
  - **Ruído de fórmula:** quantidade e preço passam por 15 dígitos significativos antes de contar as casas (`10.48 * 1.1` = 11.528000000000002 não gera mais o aviso falso de "mais de 3 casas"). Casas fixas não bastam: `1234568.5 * 1.07` sai `1320988.2950000002`.
  - **Etapa com texto:** linha sem Quantidade e Preço, mas com Unidade ou Total, ainda vira etapa, agora **com aviso** ("Linha N: linha sem quantidade e preço tratada como etapa — confira.").

---

## Parte A — Tasks 1 a 3: contas do desconto, modelo do SIGO e skill do Claude

**Antes da Task 1 — linha de base da suíte** (outras sessões mudam o número; em 29/09 14:53 eram 20 arquivos e 199 testes):

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Anote as linhas `Test Files  N passed` e `Tests  M passed`. Ao fim da Task 3 devem ser `N + 3` arquivos e `M + 96` testes, sem falhas.

**Regras para as três tasks:**

- Todos os arquivos são **novos**: crie com a ferramenta Write, copiando os blocos abaixo como estão (LF). Não há troca em arquivo existente nesta parte. Se precisar ajustar um arquivo já criado, use a ferramenta Edit.
- Os blocos já passaram no Prettier do repositório (`.prettierrc.json`) e nos testes, numa cópia fora do repositório. Mesmo assim, rode `npx prettier --write` nos arquivos da task antes do commit: o hook do lint-staged também formata, mas é melhor o commit parcial chegar formatado.
- **Commit parcial:** outras sessões mexem no repositório. Rode `git status --short` antes, faça `git add` só dos arquivos da task (o git só aceita `git commit -- <caminho>` de arquivo novo se ele já estiver no índice) e `git commit -F - -- <caminhos>`. Se o hook do lint-staged recusar o commit com caminhos, confira com `git diff --cached --name-only` que só os arquivos da task estão no índice e rode o mesmo `git commit -F -` sem o `-- <caminhos>`.
- Os comandos partem da raiz do repositório (`C:/Users/javer/sigoobras-base`), no Git Bash; os que precisam de `apps/web` entram lá num subshell `( ... )`.

---

### Task 1: Contas do desconto em centavos (`orcamento-desconto.js`)

**Files:**

- Create: `apps/web/src/lib/orcamento-desconto.js`
- Test: `apps/web/src/lib/orcamento-desconto.test.js`

**Interfaces:**

- Consumes: nada.
- Produces (assinaturas do contrato):
  - `precoComDesconto(ref: number, pct: number): number` — unitário cortado na 2ª casa (BigInt). **Lança `RangeError`** ("Desconto fora de 0 a 99,99%") se `pct` não for `number` finito de 0 a 99,99 e ("Preço de referência inválido") se `ref` não for `number` finito ou for negativo. Não converte nada: `null`, `undefined` e texto também lançam (quem tem o texto do campo usa `validarDesconto(...).valor` antes).
  - `totalLinha(quantidade: number|null, unitario: number|null): number|null` — arredondamento meio para cima em 2 casas; `null` se faltar um dos dois. Aceita também string numérica **estrita** (`"125.5"`, `".5"`, `"5."`, com espaços nas pontas e sinal), porque a edição por campo da tabela guarda o texto do input no estado; string vazia ou inválida (`"abc"`, `"1,5"`, `"12abc"`, `"1.234,56"`, `"1e3"`) conta como `null`.
  - `totalLinhaLegado({ quantidade, valor_unitario, bdi, imposto }): number` — `totalLinha(q, u) ?? 0` sem BDI e imposto; senão a fórmula antiga arredondada em 2 casas.
  - `validarDesconto(entrada: string|number): { ok: true, valor: number } | { ok: false, erro: string }` — com as 4 mensagens do contrato. Também aceita um `%` no fim e ignora zeros à direita (`"12,350"` vale 12,35); `"-0"` vale `0` (não `-0`).
  - `aplicarDesconto(itens: ItemOrc[], pct: number): Array<{ id, valor_unitario: number, valor_total: number }>` — só `!etapa` com `valor_unitario_ref != null`; `valor_total` é `totalLinha(...) ?? 0`. `pct` é o `valor` (number) de `validarDesconto`: fora de 0 a 99,99 ou com referência negativa num item, **propaga o `RangeError`** do `precoComDesconto` (nunca grava o preço cheio).
  - `subtotaisEtapas(itens): Record<string, number>` — chave = `numero` da etapa, soma em centavos.
  - `resumoOrcamento(itens): { totalReferencia: number, totalProposta: number, descontoReal: number, itensSemReferencia: number, qtdItens: number, qtdEtapas: number }` — **`itensSemReferencia` é a CONTAGEM** (número), para o texto "N itens sem preço de referência não recebem o desconto".

**Decisões da correção (01/10/2026, Javerson; a revisão achou o defeito no código antigo deste plano):**

- **Entrada inválida é recusada, não vira 0.** Antes, `Number(pct) || 0` transformava desconto `NaN`, `"12,35"` ou `"abc"` em 0% e a proposta era gravada a preço cheio, com aviso de sucesso. Agora `precoComDesconto` lança `RangeError`, sem o `|| 0` e sem `Number()` nessas linhas, e o `aplicarDesconto` propaga. Quem chama trata o erro (Task 4: `descontoPct ?? 0` explícito; Task 5: `try/catch`).
- **Texto numérico estrito.** O `paraNumero` não usa mais `parseFloat` (que lia `"1,5"` como 1, `"12abc"` como 12 e `"1.234,56"` como 1,234). Vale `/^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/`: aceita `".5"` (como o usuário digita 0,5) e `"5."`; **expoente (`"1e3"`) não é aceito**, por decisão. O resto vira `null`.
- **Menores da revisão:** o teste do BigInt usa dois casos que um `Number` não acerta (`totalLinha(442591.303, 86956.6132)` = 38486240740.65 e `totalLinha(571643.263, 30695)` = 17546589957.79, conferidos com BigInt independente, a partir do texto decimal); o teste "nunca passa da referência" ganhou o limite inferior; `validarDesconto("-0")` devolve 0; `resumoOrcamento` não converte duas vezes (helper interno `totalLinhaCentavos`). Resultados com entrada válida não mudaram (200 mil sorteios contra a versão anterior, sem divergência).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/lib/orcamento-desconto.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect } from "vitest";
import {
  precoComDesconto,
  totalLinha,
  totalLinhaLegado,
  validarDesconto,
  aplicarDesconto,
  subtotaisEtapas,
  resumoOrcamento,
} from "./orcamento-desconto";

describe("precoComDesconto", () => {
  it("exemplo da spec: 10,48 com 12,35% → 9,18 (corta, não arredonda 9,18572)", () => {
    expect(precoComDesconto(10.48, 12.35)).toBe(9.18);
  });
  it("referência com 4 casas", () => {
    expect(precoComDesconto(10.4899, 12.35)).toBe(9.19); // 9,19439735
    expect(precoComDesconto(2827.9249, 12.35)).toBe(2478.67); // 2.478,6761…
  });
  it("desconto 0 corta a referência na 2ª casa", () => {
    expect(precoComDesconto(10.48, 0)).toBe(10.48);
    expect(precoComDesconto(10.4899, 0)).toBe(10.48);
    expect(precoComDesconto(0.29, 0)).toBe(0.29); // Math.floor(0.29 * 100) / 100 daria 0,28
    expect(precoComDesconto(1.15, 0)).toBe(1.15); // Math.floor(1.15 * 100) / 100 daria 1,14
  });
  it("desconto 99,99", () => {
    expect(precoComDesconto(10.48, 99.99)).toBe(0); // 0,001048
    expect(precoComDesconto(1234.5678, 99.99)).toBe(0.12); // 0,12345678
  });
  it("nunca passa de referência × (1 − d) e fica a menos de 1 centavo dele (é o corte)", () => {
    for (const ref of [0.01, 0.29, 1.005, 10.48, 99.9999, 2827.92]) {
      const unit = precoComDesconto(ref, 12.35);
      expect(unit).toBeLessThanOrEqual(ref * 0.8765 + 1e-9);
      expect(unit + 0.01).toBeGreaterThan(ref * 0.8765 - 1e-9);
      expect(Math.round(unit * 100) / 100).toBe(unit);
    }
  });
  it("bordas válidas: referência 0 e desconto 0 ou 99,99", () => {
    expect(precoComDesconto(0, 0)).toBe(0);
    expect(precoComDesconto(0, 99.99)).toBe(0);
    expect(precoComDesconto(10.48, 99.99)).toBe(0);
  });
  it("desconto fora de 0 a 99,99 ou que não seja número finito lança RangeError", () => {
    expect(() => precoComDesconto(10, NaN)).toThrow(RangeError);
    expect(() => precoComDesconto(10, Infinity)).toThrow(RangeError);
    expect(() => precoComDesconto(10, 100)).toThrow("Desconto fora de 0 a 99,99%");
    expect(() => precoComDesconto(10, 99.991)).toThrow(RangeError);
    expect(() => precoComDesconto(10, -1)).toThrow(RangeError);
    expect(() => precoComDesconto(10, "12,35")).toThrow(RangeError);
    expect(() => precoComDesconto(10, "12.35")).toThrow(RangeError);
    expect(() => precoComDesconto(10, undefined)).toThrow(RangeError);
    expect(() => precoComDesconto(10, null)).toThrow(RangeError);
  });
  it("referência que não seja número finito, ou seja negativa, lança RangeError (sem coerção)", () => {
    expect(() => precoComDesconto(undefined, 10)).toThrow("Preço de referência inválido");
    expect(() => precoComDesconto(null, 10)).toThrow(RangeError);
    expect(() => precoComDesconto(NaN, 10)).toThrow(RangeError);
    expect(() => precoComDesconto(Infinity, 10)).toThrow(RangeError);
    expect(() => precoComDesconto("10.48", 10)).toThrow(RangeError);
    expect(() => precoComDesconto(-10, 10)).toThrow(RangeError);
  });
});

describe("totalLinha", () => {
  it("exemplo da spec: 125,5 × 9,18 = 1.152,09", () => {
    expect(totalLinha(125.5, 9.18)).toBe(1152.09);
  });
  it("sem erro de ponto flutuante", () => {
    expect(totalLinha(100, 0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996
    expect(totalLinha(1, 1.005)).toBe(1.01); // Math.round(1.005 * 100) / 100 daria 1
    expect(totalLinha(3, 0.1)).toBe(0.3);
  });
  it("arredonda o meio para cima", () => {
    expect(totalLinha(1, 0.125)).toBe(0.13);
    expect(totalLinha(2.345, 3.3333)).toBe(7.82); // 7,8165885
  });
  it("produto acima de 2^53 (BigInt)", () => {
    expect(totalLinha(123456.789, 98765.4321)).toBe(12193263111.26);
    // Conferidos com BigInt independente (produto exato em 1e-7). Em ponto flutuante dá ,66 no
    // primeiro; com inteiros em Number dá ,66 no primeiro e ,78 no segundo (que é meio exato).
    expect(totalLinha(442591.303, 86956.6132)).toBe(38486240740.65); // 384862407406549996 (resto 49996)
    expect(totalLinha(571643.263, 30695)).toBe(17546589957.79); // 175465899577850000 (resto 50000)
  });
  it("null quando falta quantidade ou unitário; zero é zero", () => {
    expect(totalLinha(null, 10)).toBeNull();
    expect(totalLinha(10, undefined)).toBeNull();
    expect(totalLinha(0, 10)).toBe(0);
  });
  it("aceita string numérica estrita (como o input guarda o texto)", () => {
    expect(totalLinha("125.5", "9.18")).toBe(1152.09);
    expect(totalLinha(".5", 10)).toBe(5); // 0,5 digitado sem o zero
    expect(totalLinha("5.", 2)).toBe(10);
    expect(totalLinha(" 2 ", "3.5")).toBe(7);
  });
  it("string vazia ou inválida conta como null, sem ler prefixo", () => {
    expect(totalLinha("", 3)).toBeNull();
    expect(totalLinha("   ", 3)).toBeNull();
    expect(totalLinha("abc", 3)).toBeNull();
    expect(totalLinha("1,5", 2)).toBeNull(); // parseFloat leria 1
    expect(totalLinha("12abc", 2)).toBeNull(); // parseFloat leria 12
    expect(totalLinha("10 un", 2)).toBeNull();
    expect(totalLinha("1.234,56", 1)).toBeNull(); // parseFloat leria 1,234
    expect(totalLinha("1e3", 1)).toBeNull(); // expoente não é aceito (decisão)
    expect(totalLinha(2, "1,5")).toBeNull();
    expect(totalLinha(NaN, 2)).toBeNull();
    expect(totalLinha(2, Infinity)).toBeNull();
  });
});

describe("totalLinhaLegado", () => {
  it("sem BDI e imposto é o totalLinha", () => {
    expect(totalLinhaLegado({ quantidade: 125.5, valor_unitario: 9.18, bdi: 0, imposto: 0 })).toBe(
      1152.09
    );
    expect(totalLinhaLegado({ quantidade: "3", valor_unitario: "0.1", bdi: null })).toBe(0.3);
    expect(totalLinhaLegado({ quantidade: null, valor_unitario: 10 })).toBe(0);
  });
  it("com BDI/imposto mantém a fórmula antiga, arredondada em 2 casas", () => {
    expect(totalLinhaLegado({ quantidade: 2, valor_unitario: 100, bdi: 25, imposto: 10 })).toBe(
      275
    );
    expect(totalLinhaLegado({ quantidade: 3, valor_unitario: 10.555, bdi: 10, imposto: 0 })).toBe(
      34.83
    ); // 34,8315
  });
});

describe("validarDesconto", () => {
  it("aceita vírgula, ponto, número, espaços e %", () => {
    expect(validarDesconto("12,35")).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto("12.35")).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto(12.35)).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto(" 12,35 % ")).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto("0")).toEqual({ ok: true, valor: 0 });
    expect(validarDesconto("99,99")).toEqual({ ok: true, valor: 99.99 });
    expect(validarDesconto("12,350")).toEqual({ ok: true, valor: 12.35 });
  });
  it('"-0" vale 0 (não −0)', () => {
    const r = validarDesconto("-0");
    expect(r.ok).toBe(true);
    expect(Object.is(r.valor, 0)).toBe(true);
  });
  it("mensagens de erro", () => {
    expect(validarDesconto("")).toEqual({ ok: false, erro: "Informe o desconto em %" });
    expect(validarDesconto("   ")).toEqual({ ok: false, erro: "Informe o desconto em %" });
    expect(validarDesconto(null)).toEqual({ ok: false, erro: "Informe o desconto em %" });
    expect(validarDesconto("abc")).toEqual({ ok: false, erro: "Desconto inválido" });
    expect(validarDesconto("1,2,3")).toEqual({ ok: false, erro: "Desconto inválido" });
    expect(validarDesconto("100")).toEqual({ ok: false, erro: "O desconto vai de 0 a 99,99%" });
    expect(validarDesconto("-1")).toEqual({ ok: false, erro: "O desconto vai de 0 a 99,99%" });
    expect(validarDesconto("12,345")).toEqual({
      ok: false,
      erro: "Use no máximo 2 casas decimais",
    });
  });
});

describe("aplicarDesconto", () => {
  it("recalcula só os itens com referência; pula etapas e itens manuais", () => {
    const itens = [
      { id: "e1", numero: "1", etapa: true, valor_unitario_ref: null },
      { id: "i1", numero: "1.1", etapa: false, quantidade: 125.5, valor_unitario_ref: 10.48 },
      { id: "i2", numero: "1.2", etapa: false, quantidade: 2, valor_unitario_ref: null },
    ];
    expect(aplicarDesconto(itens, 12.35)).toEqual([
      { id: "i1", valor_unitario: 9.18, valor_total: 1152.09 },
    ]);
    expect(aplicarDesconto(itens, 0)).toEqual([
      { id: "i1", valor_unitario: 10.48, valor_total: 1315.24 },
    ]);
  });
  it("propaga o erro do desconto inválido em vez de gravar o preço cheio", () => {
    const itens = [{ id: "i1", etapa: false, quantidade: 2, valor_unitario_ref: 10 }];
    expect(() => aplicarDesconto(itens, "abc")).toThrow(RangeError);
    expect(() => aplicarDesconto(itens, "12,35")).toThrow(RangeError);
    expect(() => aplicarDesconto(itens, 100)).toThrow(RangeError);
    expect(() => aplicarDesconto(itens, NaN)).toThrow(RangeError);
    expect(() => aplicarDesconto(itens, undefined)).toThrow(RangeError);
  });
  it("propaga o erro da referência negativa", () => {
    const itens = [{ id: "i1", etapa: false, quantidade: 2, valor_unitario_ref: -10 }];
    expect(() => aplicarDesconto(itens, 10)).toThrow("Preço de referência inválido");
  });
  it("aceita referência e quantidade em string numérica estrita", () => {
    const itens = [{ id: "i1", etapa: false, quantidade: "125.5", valor_unitario_ref: "10.48" }];
    expect(aplicarDesconto(itens, 12.35)).toEqual([
      { id: "i1", valor_unitario: 9.18, valor_total: 1152.09 },
    ]);
  });
  it("quantidade ausente grava total 0 (e o unitário com desconto)", () => {
    const itens = [{ id: "i1", etapa: false, quantidade: null, valor_unitario_ref: 10.48 }];
    expect(aplicarDesconto(itens, 12.35)).toEqual([
      { id: "i1", valor_unitario: 9.18, valor_total: 0 },
    ]);
  });
});

describe("subtotaisEtapas", () => {
  it("etapas aninhadas: 1 soma 1.1 e 1.2; 1.2 soma 1.2.1; não confunde 1.2 com 1.20", () => {
    const itens = [
      { numero: "1", etapa: true },
      { numero: "1.1", etapa: false, valor_total: 100.1 },
      { numero: "1.2", etapa: true },
      { numero: "1.2.1", etapa: false, valor_total: 0.2 },
      { numero: "1.20", etapa: true },
      { numero: "1.20.1", etapa: false, valor_total: 5 },
      { numero: "2", etapa: true },
      { numero: "3", etapa: false, valor_total: 7 },
    ];
    const sub = subtotaisEtapas(itens);
    expect(Object.keys(sub).sort()).toEqual(["1", "1.2", "1.20", "2"]);
    expect(sub["1"]).toBe(105.3); // soma em centavos (100.1 + 0.2 daria 100.30000000000001)
    expect(sub["1.2"]).toBe(0.2);
    expect(sub["1.20"]).toBe(5);
    expect(sub["2"]).toBe(0);
  });
  it("valor_total em string numérica soma; inválido ou nulo não vira dinheiro", () => {
    const itens = [
      { numero: "1", etapa: true },
      { numero: "1.1", etapa: false, valor_total: "100.10" },
      { numero: "1.2", etapa: false, valor_total: "1.234,56" },
      { numero: "1.3", etapa: false, valor_total: null },
    ];
    expect(subtotaisEtapas(itens)["1"]).toBe(100.1);
  });
});

describe("resumoOrcamento", () => {
  it("totais, desconto real e item sem referência", () => {
    const itens = [
      { numero: "1", etapa: true },
      {
        numero: "1.1",
        etapa: false,
        quantidade: 125.5,
        valor_unitario_ref: 10.48,
        valor_unitario: 9.18,
        valor_total: 1152.09,
      },
      {
        numero: "1.2",
        etapa: false,
        quantidade: 1,
        valor_unitario_ref: null,
        valor_unitario: 500,
        valor_total: 500,
      },
    ];
    expect(resumoOrcamento(itens)).toEqual({
      totalReferencia: 1315.24,
      totalProposta: 1652.09,
      descontoReal: 12.4, // 1 − 1.152,09 ÷ 1.315,24 = 12,4046%
      itensSemReferencia: 1,
      qtdItens: 2,
      qtdEtapas: 1,
    });
  });
  it("referência com várias linhas: soma os totais da referência em centavos", () => {
    const itens = [
      { numero: "1", etapa: true },
      { etapa: false, quantidade: 100, valor_unitario_ref: 0.29, valor_total: 20 },
      { etapa: false, quantidade: 3, valor_unitario_ref: 0.1, valor_total: 0.2 },
      { etapa: false, quantidade: null, valor_unitario_ref: 5, valor_total: 0 },
      { etapa: false, quantidade: "2.5", valor_unitario_ref: "4", valor_total: 8 },
    ];
    expect(resumoOrcamento(itens)).toEqual({
      totalReferencia: 39.3, // 29 + 0,30 + 0 + 10
      totalProposta: 28.2,
      descontoReal: 28.24, // 1 − 28,20 ÷ 39,30 = 28,2443%
      itensSemReferencia: 0,
      qtdItens: 4,
      qtdEtapas: 1,
    });
  });
  it("valor_total em texto inválido não vira dinheiro", () => {
    const itens = [
      {
        numero: "1.1",
        etapa: false,
        quantidade: 1,
        valor_unitario_ref: 10,
        valor_total: "1.234,56",
      },
    ];
    const r = resumoOrcamento(itens);
    expect(r.totalProposta).toBe(0);
    expect(r.totalReferencia).toBe(10);
  });
  it("sem referência, desconto real 0", () => {
    expect(resumoOrcamento([])).toEqual({
      totalReferencia: 0,
      totalProposta: 0,
      descontoReal: 0,
      itensSemReferencia: 0,
      qtdItens: 0,
      qtdEtapas: 0,
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/orcamento-desconto.test.js)
```

Esperado: `FAIL  src/lib/orcamento-desconto.test.js`, com `Error: Failed to load url ./orcamento-desconto ... Does the file exist?`, e `Test Files  1 failed (1)`.

- [ ] **Step 3: Implementar**

Crie `apps/web/src/lib/orcamento-desconto.js`:

<!-- prettier-ignore -->
```js
/**
 * Contas de dinheiro do orçamento importado da planilha da prefeitura
 * (spec docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §8).
 *
 * Tudo em inteiros: preço em décimos de milésimo (4 casas), quantidade em
 * milésimos (3 casas) e total em centavos. Os produtos usam BigInt porque
 * podem passar de 2^53. Assim 0,29 × 100 dá 29,00 (e não 28,99…) e 10,48 com
 * 12,35% de desconto dá 9,18: o unitário é CORTADO na 2ª casa, nunca arredondado
 * para cima. O total da linha é ARREDONDADO (meio para cima) em 2 casas.
 */

/** Texto numérico estrito: ponto decimal, sinal opcional; sem expoente, vírgula nem milhar. */
const NUMERO_ESTRITO = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;

/**
 * number finito, ou string numérica estrita ("12.5", ".5", "5.", " 2 ", "-3"); vazio, null,
 * undefined e qualquer outra coisa → null. Não lê prefixo: "12abc", "1,5" e "1.234,56" são
 * inválidos (parseFloat leria 12, 1 e 1,234 em silêncio).
 */
function paraNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "string" ? (NUMERO_ESTRITO.test(valor) ? Number(valor) : NaN) : valor;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Inteiro na escala pedida (100 = centavos), com o meio arredondado para longe do zero. */
function escalar(valor, escala) {
  return Math.sign(valor) * Math.round(Math.abs(valor) * escala);
}

/** Centavos inteiros de um valor em reais (null/vazio → 0). */
function centavos(valor) {
  const n = paraNumero(valor);
  return n === null ? 0 : escalar(n, 100);
}

/**
 * Unitário com desconto, cortado na 2ª casa.
 * `ref` com até 4 casas e `pct` com até 2 casas (0 a 99,99), os dois NUMBER.
 * Entrada inválida lança RangeError em vez de virar 0% (preço cheio gravado como proposta):
 * `pct` que não seja número finito de 0 a 99,99 e `ref` que não seja número finito ou seja
 * negativo (sem coerção: null, undefined e texto também lançam). Quem tem o texto do campo
 * converte antes com `validarDesconto(...).valor`.
 * Ex.: precoComDesconto(10.48, 12.35) → 9.18 (10,48 × 0,8765 = 9,18572).
 */
export function precoComDesconto(ref, pct) {
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 99.99) {
    throw new RangeError("Desconto fora de 0 a 99,99%");
  }
  if (typeof ref !== "number" || !Number.isFinite(ref) || ref < 0) {
    throw new RangeError("Preço de referência inválido");
  }
  const refDezmil = BigInt(escalar(ref, 10000));
  const fator = BigInt(10000 - escalar(pct, 100));
  // refDezmil × fator está em unidades de 1e-8; ÷ 1e6 → centavos. A divisão de
  // BigInt descarta a fração: é o corte (ref ≥ 0).
  const cents = (refDezmil * fator) / 1000000n;
  return Number(cents) / 100;
}

/** Total da linha em CENTAVOS inteiros (a conta de `totalLinha`); null se faltar um dos dois. */
function totalLinhaCentavos(quantidade, unitario) {
  const q = paraNumero(quantidade);
  const u = paraNumero(unitario);
  if (q === null || u === null) return null;
  const p = BigInt(escalar(q, 1000)) * BigInt(escalar(u, 10000)); // unidades de 1e-7
  const negativo = p < 0n;
  const abs = negativo ? -p : p;
  const cents = (abs + 50000n) / 100000n;
  return Number(negativo ? -cents : cents);
}

/**
 * Total da linha = arredondar(quantidade × unitário, 2), meio para cima.
 * `quantidade` até 3 casas, `unitario` até 4 (number ou string numérica estrita).
 * null se faltar um dos dois ou se um deles for texto inválido.
 * Ex.: totalLinha(125.5, 9.18) → 1152.09.
 */
export function totalLinha(quantidade, unitario) {
  const cents = totalLinhaCentavos(quantidade, unitario);
  return cents === null ? null : cents / 100;
}

/**
 * Total da linha para as telas antigas, que ainda têm BDI e imposto por linha.
 * Substitui as fórmulas `q * u * (1 + bdi/100) * (1 + imp/100)` espalhadas.
 * Sem BDI e sem imposto (todo item importado), é exatamente `totalLinha`.
 */
export function totalLinhaLegado({ quantidade, valor_unitario, bdi, imposto } = {}) {
  const b = paraNumero(bdi) ?? 0;
  const i = paraNumero(imposto) ?? 0;
  if (b === 0 && i === 0) return totalLinha(quantidade, valor_unitario) ?? 0;
  const q = paraNumero(quantidade) ?? 0;
  const u = paraNumero(valor_unitario) ?? 0;
  return Math.round((q * u * (1 + b / 100) * (1 + i / 100) + Number.EPSILON) * 100) / 100;
}

/**
 * Valida o campo "Desconto (%)": aceita "12,35", "12.35", 12.35, espaços e um "%" no fim.
 * Faixa de 0 a 99,99, no máximo 2 casas (zeros à direita não contam: "12,350" vale).
 */
export function validarDesconto(entrada) {
  const texto = String(entrada ?? "")
    .replace(/\s+/g, "")
    .replace(/%$/, "");
  if (texto === "") return { ok: false, erro: "Informe o desconto em %" };
  if (!/^-?\d+([.,]\d+)?$/.test(texto)) return { ok: false, erro: "Desconto inválido" };
  const [inteira, decimais = ""] = texto.replace(",", ".").split(".");
  const valor = Number(`${inteira}.${decimais || "0"}`);
  if (valor < 0 || valor > 99.99) return { ok: false, erro: "O desconto vai de 0 a 99,99%" };
  if (decimais.replace(/0+$/, "").length > 2) {
    return { ok: false, erro: "Use no máximo 2 casas decimais" };
  }
  return { ok: true, valor: Math.round(valor * 100) / 100 || 0 }; // `|| 0`: "-0" não vira −0
}

/**
 * Recalcula os itens importados (os que têm preço de referência) com o desconto.
 * Etapas e itens sem referência (incluídos à mão) ficam de fora.
 * Devolve só o que muda: [{ id, valor_unitario, valor_total }].
 * `pct` precisa ser um number de 0 a 99,99 (use `validarDesconto` antes): um valor inválido
 * lança RangeError (de `precoComDesconto`), nunca grava o preço cheio.
 */
export function aplicarDesconto(itens, pct) {
  const saida = [];
  for (const item of itens || []) {
    if (!item || item.etapa) continue;
    const ref = paraNumero(item.valor_unitario_ref);
    if (ref === null) continue;
    const valor_unitario = precoComDesconto(ref, pct);
    const valor_total = totalLinha(item.quantidade, valor_unitario) ?? 0;
    saida.push({ id: item.id, valor_unitario, valor_total });
  }
  return saida;
}

/**
 * Subtotal de cada etapa: soma (em centavos) dos `valor_total` dos itens (não etapas)
 * cujo `numero` começa com `<numero da etapa>.`. Etapas aninhadas somam os mesmos
 * itens (a "1" soma os itens da "1.2"). Chave = `numero` da etapa.
 * Percorre os prefixos de cada item ("1.2.1" → "1", "1.2"), o que é o mesmo que o
 * `startsWith` para números no padrão 1, 1.1, 1.1.2 e não confunde "1.2" com "1.20".
 */
export function subtotaisEtapas(itens) {
  const somas = new Map();
  for (const item of itens || []) {
    if (item?.etapa && item.numero) somas.set(String(item.numero), 0);
  }
  for (const item of itens || []) {
    if (!item || item.etapa || !item.numero) continue;
    const partes = String(item.numero).split(".");
    for (let k = 1; k < partes.length; k++) {
      const prefixo = partes.slice(0, k).join(".");
      if (somas.has(prefixo)) somas.set(prefixo, somas.get(prefixo) + centavos(item.valor_total));
    }
  }
  const resultado = {};
  for (const [numero, cents] of somas) resultado[numero] = cents / 100;
  return resultado;
}

/**
 * Resumo da aba Orçamento:
 * - totalReferencia: Σ totalLinha(quantidade, valor_unitario_ref) dos itens com referência;
 * - totalProposta: Σ valor_total de todos os itens (não etapas);
 * - descontoReal: % com 2 casas, 1 − Σ valor_total(itens com referência) ÷ totalReferencia
 *   (0 se não houver referência);
 * - itensSemReferencia: QUANTOS itens (não etapas) não têm valor_unitario_ref;
 * - qtdItens e qtdEtapas: contagens.
 */
export function resumoOrcamento(itens) {
  let refCents = 0;
  let propostaCents = 0;
  let propostaComRefCents = 0;
  let itensSemReferencia = 0;
  let qtdItens = 0;
  let qtdEtapas = 0;
  for (const item of itens || []) {
    if (!item) continue;
    if (item.etapa) {
      qtdEtapas++;
      continue;
    }
    qtdItens++;
    const total = centavos(item.valor_total);
    propostaCents += total;
    if (paraNumero(item.valor_unitario_ref) === null) {
      itensSemReferencia++;
      continue;
    }
    refCents += totalLinhaCentavos(item.quantidade, item.valor_unitario_ref) ?? 0;
    propostaComRefCents += total;
  }
  const descontoReal =
    refCents === 0 ? 0 : Math.round(((refCents - propostaComRefCents) * 10000) / refCents) / 100;
  return {
    totalReferencia: refCents / 100,
    totalProposta: propostaCents / 100,
    descontoReal,
    itensSemReferencia,
    qtdItens,
    qtdEtapas,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/orcamento-desconto.test.js)
```

Esperado: `Test Files  1 passed (1)` e `Tests  31 passed (31)`.

- [ ] **Step 5: Formatar e commitar**

```bash
npx prettier --write apps/web/src/lib/orcamento-desconto.js apps/web/src/lib/orcamento-desconto.test.js
git status --short
git add apps/web/src/lib/orcamento-desconto.js apps/web/src/lib/orcamento-desconto.test.js
git commit -F - -- apps/web/src/lib/orcamento-desconto.js apps/web/src/lib/orcamento-desconto.test.js <<'EOF'
feat(orcamento): contas do desconto em centavos (corte do unitário, total arredondado)

precoComDesconto corta o unitário na 2ª casa e totalLinha arredonda qtd × unitário em 2 casas,
com inteiros e BigInt (0,29 × 100 = 29,00). Também aplicarDesconto, subtotaisEtapas,
resumoOrcamento, validarDesconto e totalLinhaLegado para as telas com BDI por linha.
Spec 2026-09-29 §8. Desconto ou referência inválidos lançam RangeError (não viram 0%) e o texto
numérico é estrito, sem parseFloat: "1,5", "12abc" e "1e3" contam como vazio.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Esperado: o Prettier não muda nada (`unchanged`), o commit sai e o `git log` mostra `feat(orcamento): contas do desconto em centavos (corte do unitário, total arredondado)`.

---

### Task 2: Modelo SIGO de orçamento — gerar, ler e validar (`orcamento-modelo.js`)

**Files:**

- Create: `apps/web/src/lib/orcamento-modelo.js`
- Test: `apps/web/src/lib/orcamento-modelo.test.js`

**Interfaces:**

- Consumes:
  - `totalLinha(quantidade, unitario): number|null` (Task 1, `@/lib/orcamento-desconto`);
  - `normalizarTexto(s): string` (já existe em `@/lib/busca`);
  - `xlsx` 0.18.5 (já instalado), `import * as XLSX from "xlsx"`.
- Produces:
  - constantes `ABA_ORCAMENTO`, `ABA_INFORMACOES`, `CABECALHOS_MODELO`, `ROTULOS_INFO`, `CHAVES_INFO`, `LIMITE_LINHAS` (valores exatos do contrato);
  - `lerNumeroBR(valor): number|null` (NaN quando inválido);
  - `gerarModelo(): XLSX.WorkBook` — abas `Orçamento` (cabeçalho, `A2:A501` com `z: "@"`, `!ref` `A1:H501`, `!cols`) e `Informações` (rótulos na coluna A; `B1:B6` e `B8` vazias com `z: "@"`, o total em `B7` fica sem formato Texto; `!ref` `A1:B8`);
  - `lerPlanilhaModelo(wb): { itens: ItemModelo[], info: InfoOrcamento, erros: string[], avisos: string[], totais: { referencia, prefeitura, qtdEtapas, qtdItens } }`;
  - `lerArquivoModelo(buffer: ArrayBuffer|Uint8Array)` — mesmo retorno. Lê com `XLSX.read(buffer, { type: "array", sheetStubs: true, cellNF: true })` e devolve o erro "Não foi possível ler o arquivo como planilha Excel (.xlsx)." se o SheetJS lançar.
  - `ItemModelo = { linha, numero, etapa, codigo, fonte, descricao, unidade, quantidade, valor_unitario_ref, total_informado }`. `linha` é a linha do Excel. Na etapa, `quantidade` e `valor_unitario_ref` são `null`; `unidade`, `codigo` e `fonte` vêm como estão (a Task 4 zera a unidade da etapa). `quantidade` já vem arredondada a 3 casas e o preço a 4.

**Regras que o contrato não detalhava e que este código fixa** (os testes cobrem cada uma):

- Colunas obrigatórias no cabeçalho: `Item`, `Descrição`, `Unidade`, `Quantidade` e `Preço unitário (R$)` (as marcadas "sim" ou "item" no §4 da spec). `Código`, `Fonte` e `Total (R$)` são opcionais.
- `Descrição` vazia numa linha é erro (a coluna é obrigatória no §4).
- `Unidade` vazia numa linha de **item** (não de etapa) é **aviso**, não erro: `Linha N: item sem unidade.` A spec §4 marca a Unidade como obrigatória no item, mas a §7 não lista esse caso entre os erros; o aviso deixa a importação seguir e o usuário corrigir depois.
- As linhas com dado são achadas pelas células que existem, não pelo `!ref` (um `!ref` até a linha 1.048.576 não trava o navegador). Linha em branco no meio é pulada e as mensagens mantêm o número da linha do Excel.
- `Item` numérico: aviso só quando o número tem casas (`1.1`, que pode ter sido `1.10`); inteiro (`1`, `2`) não avisa. `Item` que o Excel transformou em data é erro, em qualquer formato de data (`m/d/yy`, `d-mmm`, `mmm-yy`, `mm/yyyy`...): vale o formato da célula (`XLSX.SSF.is_date(z)`, por isso o `cellNF`) e o texto exibido (`10/1/26`) só serve de reserva quando a célula não tem `z`. Quantidade e Preço com formato de data são erro também; `Total (R$)`, aviso.
- Fórmula sem valor salvo (o openpyxl grava assim) em Quantidade ou Preço é erro; sem o `sheetStubs` a célula sumiria e a linha viraria etapa em silêncio.
- `Total (R$)` não numérico é aviso (a coluna só serve para conferir). Diferença de exatamente R$ 0,01 não avisa; acima disso, avisa.
- "Numeração fora de sequência": depois de `1.1` o esperado é o filho `1.1.1`, o irmão `1.2` ou o próximo de um nível acima (`2`). Qualquer outro número avisa.
- "Item sem etapa acima": o item avisa se nenhum prefixo dele (`1`, `1.2`) for uma etapa que já apareceu. Se a planilha não tiver nenhuma etapa, sai um aviso único ("A planilha não tem linhas de etapa; os itens ficam sem subtotal.") em vez de um por linha.
- Sem a aba `Informações`: aviso (não bloqueia). Na aba, vale a primeira ocorrência de cada rótulo e só as 200 primeiras linhas são lidas. `Data-base` em data do Excel vira `dd/mm/aaaa` (formato com dia) ou `mm/aaaa` (formato sem dia, como `mmm-yy`); `Data-base` em número puro (`General`) vira o texto do número, com o aviso `Informações, linha N: Data-base numérica (45901) — confira.`; `BDI (%)` numérico com formato de % vira `"23,96%"`; outros números viram texto pt-BR (`"23,96"`).
- Tetos do banco: `Quantidade` ≥ 1e11, `Preço unitário` ≥ 1e10 ou total da linha ≥ 1e12 é **erro** (`Linha N: Quantidade acima do limite (menos de 100.000.000.000).`, `Preço unitário acima do limite (menos de 10.000.000.000)` e `Total da linha acima do limite (menos de 1.000.000.000.000)`), e o `totalLinha` não roda com valor acima do teto. São as colunas `numeric(14,3)`, `numeric(14,4)` e `numeric(14,2)`.
- Ruído de ponto flutuante de fórmula (`10.48 * 1.1` = 11.528000000000002) sai antes de contar as casas: quantidade e preço passam por 15 dígitos significativos, e só então vale o aviso de "mais de 3 (ou 4) casas".
- Linha sem `Quantidade` e `Preço unitário`, mas com `Unidade` ou `Total (R$)`, vira etapa **com aviso** (`Linha N: linha sem quantidade e preço tratada como etapa — confira.`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/lib/orcamento-modelo.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  ABA_ORCAMENTO,
  ABA_INFORMACOES,
  CABECALHOS_MODELO,
  ROTULOS_INFO,
  CHAVES_INFO,
  LIMITE_LINHAS,
  lerNumeroBR,
  gerarModelo,
  lerPlanilhaModelo,
  lerArquivoModelo,
} from "./orcamento-modelo";

const CAB = CABECALHOS_MODELO;
const NBSP = String.fromCharCode(0xa0);

/** Workbook em memória com as abas Orçamento e Informações. */
function montarWb(linhas, info = [["Órgão", "Prefeitura de Teste"]]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), ABA_INFORMACOES);
  return wb;
}

/** Bytes do .xlsx, como o `await file.arrayBuffer()` do navegador entrega. */
function comoArquivo(wb) {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

const INFO_OK = [
  ["Órgão", "Prefeitura Municipal de Itatinga"],
  ["Objeto", "Iluminação pública"],
  ["Edital/Processo", "PE 12/2026"],
  ["Data-base", "09/2025"],
  ["BDI (%)", "23,96"],
  ["Fonte de preços", "SINAPI 09/2025"],
  ["Total da prefeitura (R$)", 19434.76],
  ["Observações", ""],
];

const ORC_OK = [
  CAB,
  ["1", null, null, "SERVIÇOS PRELIMINARES"],
  ["1.1", "93358", "SINAPI", "Escavação manual", "m³", 125.5, 10.48, 1315.24],
  ["1.2", null, null, "Placa de obra", "m²", "2,88", "400,00", "1.152,00"],
  ["2", null, null, "ILUMINAÇÃO"],
  ["2.1", 41210, "SINAPI", "Poste 12/1000", "un", 6, 2827.92, 16967.52],
];

describe("constantes", () => {
  it("nomes do modelo", () => {
    expect(ABA_ORCAMENTO).toBe("Orçamento");
    expect(ABA_INFORMACOES).toBe("Informações");
    expect(CAB).toHaveLength(8);
    expect(Object.keys(CHAVES_INFO)).toEqual(ROTULOS_INFO);
    expect(LIMITE_LINHAS).toBe(3000);
  });
});

describe("lerNumeroBR", () => {
  it("números e textos pt-BR", () => {
    expect(lerNumeroBR(12.5)).toBe(12.5);
    expect(lerNumeroBR(-3)).toBe(-3);
    expect(lerNumeroBR("1.234,56")).toBe(1234.56);
    expect(lerNumeroBR("12,5")).toBe(12.5);
    expect(lerNumeroBR("1234.56")).toBe(1234.56);
    expect(lerNumeroBR(" R$ 1.234,56 ")).toBe(1234.56);
    expect(lerNumeroBR(`R$${NBSP}1.234,56`)).toBe(1234.56); // formatBRL usa espaço não separável
    expect(lerNumeroBR("1.234.567,89")).toBe(1234567.89);
    expect(lerNumeroBR("1.234.567")).toBe(1234567);
    expect(lerNumeroBR("1,234.56")).toBe(1234.56);
    expect(lerNumeroBR("-3,5")).toBe(-3.5);
  });
  it("vazio → null; inválido → NaN", () => {
    expect(lerNumeroBR(null)).toBeNull();
    expect(lerNumeroBR(undefined)).toBeNull();
    expect(lerNumeroBR("")).toBeNull();
    expect(lerNumeroBR("   ")).toBeNull();
    expect(lerNumeroBR("abc")).toBeNaN();
    expect(lerNumeroBR("1,2,3")).toBeNaN();
    expect(lerNumeroBR(Infinity)).toBeNaN();
    expect(lerNumeroBR(true)).toBeNaN();
  });
});

describe("gerarModelo", () => {
  it("duas abas, cabeçalho, coluna A como Texto e rótulos", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    expect(wb.SheetNames).toEqual([ABA_ORCAMENTO, ABA_INFORMACOES]);
    const orc = wb.Sheets[ABA_ORCAMENTO];
    expect(XLSX.utils.sheet_to_json(orc, { header: 1 })[0]).toEqual(CAB);
    expect(orc.A2.z).toBe("@");
    expect(orc.A501.z).toBe("@");
    expect(orc["!ref"]).toBe("A1:H501");
    const info = XLSX.utils.sheet_to_json(wb.Sheets[ABA_INFORMACOES], { header: 1 });
    expect(info.map((l) => l[0])).toEqual(ROTULOS_INFO);
  });
  it("o modelo em branco não tem item (e o cabeçalho passa)", () => {
    const r = lerPlanilhaModelo(gerarModelo());
    expect(r.erros).toEqual([`Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`]);
  });
  it("aba Informações: coluna B como Texto, exceto o total da prefeitura", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    const info = wb.Sheets[ABA_INFORMACOES];
    const linhaTotal = ROTULOS_INFO.indexOf("Total da prefeitura (R$)") + 1;
    ROTULOS_INFO.forEach((_, i) => {
      if (i + 1 === linhaTotal) expect(info[`B${i + 1}`]?.z).not.toBe("@");
      else expect(info[`B${i + 1}`].z).toBe("@");
    });
  });
});

describe("lerPlanilhaModelo — caminho feliz", () => {
  it("etapas, itens, info e totais (arquivo gravado e relido)", () => {
    const r = lerArquivoModelo(comoArquivo(montarWb(ORC_OK, INFO_OK)));
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.totais).toEqual({
      referencia: 19434.76,
      prefeitura: 19434.76,
      qtdEtapas: 2,
      qtdItens: 3,
    });
    expect(r.itens).toHaveLength(5);
    expect(r.itens[0]).toEqual({
      linha: 2,
      numero: "1",
      etapa: true,
      codigo: null,
      fonte: null,
      descricao: "SERVIÇOS PRELIMINARES",
      unidade: null,
      quantidade: null,
      valor_unitario_ref: null,
      total_informado: null,
    });
    expect(r.itens[2]).toEqual({
      linha: 4,
      numero: "1.2",
      etapa: false,
      codigo: null,
      fonte: null,
      descricao: "Placa de obra",
      unidade: "m²",
      quantidade: 2.88,
      valor_unitario_ref: 400,
      total_informado: 1152,
    });
    expect(r.itens[4].codigo).toBe("41210");
    expect(r.info).toEqual({
      orgao: "Prefeitura Municipal de Itatinga",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "09/2025",
      bdi: "23,96",
      fonte: "SINAPI 09/2025",
      total_prefeitura: 19434.76,
      observacoes: null,
    });
  });
  it("cabeçalho sem acento, em maiúsculas, com espaços e em outra ordem", () => {
    const wb = montarWb([
      ["  descricao ", "ITEM", "Preco Unitario  (R$)", "quantidade", "UNIDADE", "codigo"],
      ["Etapa", "1"],
      ["Serviço", "1.1", 10.48, 125.5, "m", "123"],
    ]);
    const r = lerPlanilhaModelo(wb);
    expect(r.erros).toEqual([]);
    expect(r.itens[1]).toMatchObject({ numero: "1.1", codigo: "123", quantidade: 125.5 });
    expect(r.totais.referencia).toBe(1315.24);
  });
  it("linha em branco no meio mantém o número da linha do Excel", () => {
    const r = lerPlanilhaModelo(
      montarWb([CAB, ["1", null, null, "Etapa"], [], ["1.1", null, null, "Serviço", "m", 1, 2]])
    );
    expect(r.itens.map((i) => i.linha)).toEqual([2, 4]);
  });
  it("data e percentual numéricos na aba Informações", () => {
    const wb = montarWb(ORC_OK, [
      ["Data-base", 0],
      ["BDI (%)", 0],
    ]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 45901, z: "m/d/yy" };
    wb.Sheets[ABA_INFORMACOES].B2 = { t: "n", v: 0.2396, z: "0.00%" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe("01/09/2025");
    expect(r.info.bdi).toBe("23,96%");
  });
  // O formato (z) decide: com dia → dd/mm/aaaa; sem dia (tabela de preços é mês/ano) → mm/aaaa.
  it.each([
    ["m/d/yy", "01/09/2025"],
    ["dd/mm/yyyy", "01/09/2025"],
    ["d-mmm-yy", "01/09/2025"],
    ["d-mmm", "01/09/2025"],
    ["mm-dd-yy", "01/09/2025"],
    ["[$-416]d/m/yyyy", "01/09/2025"],
    ["mm/yyyy", "09/2025"],
    ["mmm-yy", "09/2025"],
    ["mmm/yy", "09/2025"],
    ['mmmm" de "yyyy', "09/2025"],
  ])("Data-base numérica com formato %s vira %s", (z, esperado) => {
    const wb = montarWb(ORC_OK, [["Data-base", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 45901, z };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe(esperado);
    expect(r.avisos).toEqual([]);
  });
  it("Data-base em número puro (General) vira o texto do número e avisa", () => {
    const wb = montarWb(ORC_OK, [
      ["Órgão", "Prefeitura"],
      ["Data-base", 0],
    ]);
    wb.Sheets[ABA_INFORMACOES].B2 = { t: "n", v: 45901, z: "General" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe("45901");
    expect(r.avisos).toEqual(["Informações, linha 2: Data-base numérica (45901) — confira."]);
  });
  it("Data-base digitada como texto fica como está, sem aviso", () => {
    const wb = montarWb(ORC_OK, [["Data-base", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "s", v: "09/2025", z: "@" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe("09/2025");
    expect(r.avisos).toEqual([]);
  });
  it("Data-base numérica sem formato salvo (workbook em memória) segue o texto exibido", () => {
    const wb = montarWb(ORC_OK, [["Data-base", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 45901, w: "9/1/25" };
    expect(lerPlanilhaModelo(wb).info.data_base).toBe("01/09/2025");
  });
  it("ruído de ponto flutuante de fórmula não gera aviso de casas decimais", () => {
    // Os produtos de fórmula vêm com resto: 11.528000000000002, 1320988.2950000002 (cortar em
    // 10 casas fixas não limparia este, de 7 dígitos inteiros) e 109.89000000000001.
    expect(10.48 * 1.1).not.toBe(11.528);
    expect(1234568.5 * 1.07).not.toBe(1320988.295);
    expect(99.9 * 1.1).not.toBe(109.89);
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", "m", 10.48 * 1.1, 0.1 + 0.2],
        ["1.2", null, null, "B", "m", 1234568.5 * 1.07, 99.9 * 1.1],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.itens[1]).toMatchObject({ quantidade: 11.528, valor_unitario_ref: 0.3 });
    expect(r.itens[2]).toMatchObject({ quantidade: 1320988.295, valor_unitario_ref: 109.89 });
  });
  it("mais de 3 (ou 4) casas de verdade continuam avisando, com o ruído já limpo", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", "m", 2.3456 * 1.1, 0.00005],
      ])
    );
    expect(r.avisos).toEqual([
      "Linha 3: Quantidade com mais de 3 casas; arredondada para 2,58.",
      "Linha 3: Preço unitário com mais de 4 casas; arredondado para 0,0001.",
    ]);
  });
});

describe("lerPlanilhaModelo — erros", () => {
  it("sem a aba Orçamento", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB]), "Planilha1");
    expect(lerPlanilhaModelo(wb).erros[0]).toContain('não tem a aba "Orçamento"');
  });
  it("cabeçalho sem coluna obrigatória", () => {
    const r = lerPlanilhaModelo(montarWb([["Item", "Descrição", "Unidade", "Total (R$)"]]));
    expect(r.erros).toEqual([
      "Linha 1: faltam as colunas obrigatórias: Quantidade, Preço unitário (R$).",
    ]);
  });
  it("nenhum item (só etapas)", () => {
    const r = lerPlanilhaModelo(montarWb([CAB, ["1", null, null, "Etapa"]]));
    expect(r.erros).toEqual([`Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`]);
  });
  it("Item vazio, fora do padrão e repetido; Descrição vazia", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1.1", null, null, "A", "m", 1, 1],
        [null, null, null, "B", "m", 1, 1],
        ["1.a", null, null, "C", "m", 1, 1],
        ["1.", null, null, "D", "m", 1, 1],
        ["1.1", null, null, "E", "m", 1, 1],
        ["1.2", null, null, "", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([
      "Linha 3: Item vazio.",
      'Linha 4: Item "1.a" fora do padrão (use 1, 1.1, 1.1.2).',
      'Linha 5: Item "1." fora do padrão (use 1, 1.1, 1.1.2).',
      "Linha 6: Item 1.1 repetido (já está na linha 2).",
      "Linha 7: Descrição vazia.",
    ]);
  });
  it("Item que o Excel transformou em data", () => {
    const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
    wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 46296, z: "m/d/yy" };
    expect(lerArquivoModelo(comoArquivo(wb)).erros).toEqual([
      'Linha 3: Item virou data no Excel ("10/1/26"); formate a coluna A como Texto e digite de novo.',
      `Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`,
    ]);
  });
  // O Excel decide pelo formato da célula: d-mmm ("1/10" → 1-Oct) e mmm-yy não passam por
  // `w` com três números, então é o `z` (cellNF) que vale.
  it.each(["m/d/yy", "dd/mm/yyyy", "d-mmm", "d-mmm-yy", "mmm-yy", "mm/yyyy"])(
    "Item que o Excel transformou em data (formato %s)",
    (z) => {
      const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
      wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 46296, z };
      const erros = lerArquivoModelo(comoArquivo(wb)).erros;
      expect(erros[0]).toMatch(/^Linha 3: Item virou data no Excel \(".+"\); formate a coluna A/);
    }
  );
  it.each(["General", "0.00", "0%", "@", '0 "dias"'])(
    "Item numérico com formato %s não é data",
    (z) => {
      const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
      wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 2, z };
      const r = lerArquivoModelo(comoArquivo(wb));
      expect(r.erros.join("\n")).not.toContain("virou data");
    }
  );
  it("Item em data sem formato salvo (workbook em memória): vale o texto exibido", () => {
    const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
    wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 46296, w: "10/1/26" };
    expect(lerPlanilhaModelo(wb).erros[0]).toBe(
      'Linha 3: Item virou data no Excel ("10/1/26"); formate a coluna A como Texto e digite de novo.'
    );
  });
  it("Quantidade e Preço com formato de data são erro (e Total é só aviso)", () => {
    const wb = montarWb([
      CAB,
      ["1", null, null, "Etapa"],
      ["1.1", null, null, "A", "m", 0, 0, 0],
      ["1.2", null, null, "B", "m", 1, 1, 0],
    ]);
    const orc = wb.Sheets[ABA_ORCAMENTO];
    orc.F3 = { t: "n", v: 46023, z: "d-mmm" }; // 1/1 digitado como quantidade
    orc.G3 = { t: "n", v: 46023, z: "mmm-yy" };
    orc.H4 = { t: "n", v: 46023, z: "dd/mm/yyyy" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.erros).toEqual([
      'Linha 3: Quantidade virou data no Excel ("1-Jan"); formate como Número e digite de novo.',
      'Linha 3: Preço unitário virou data no Excel ("Jan-26"); formate como Número e digite de novo.',
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([2, 4]); // o item da linha 4 segue, sem o Total
    expect(r.avisos[0]).toMatch(
      /^Linha 4: Total \(R\$\) virou data no Excel \(".+"\);.*foi ignorado\.$/
    );
  });
  // Os tetos são os das colunas do banco (numeric 14,3 / 14,4 / 14,2): acima deles o INSERT da
  // importação estoura depois de o orçamento antigo já ter sido apagado.
  it("Quantidade acima do limite (1e11) é erro, sem lançar", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 1e11, 1],
        ["2", null, null, "B", "m", 1e308, 1e308],
        ["3", null, null, "C", "m", 99999999999.9996, 1], // arredondada a 3 casas dá 1e11
        ["4", null, null, "D", "m", 99999999999.999, 0.01], // a maior que cabe: passa
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Quantidade acima do limite (menos de 100.000.000.000).",
      "Linha 3: Quantidade acima do limite (menos de 100.000.000.000).",
      "Linha 3: Preço unitário acima do limite (menos de 10.000.000.000).",
      "Linha 4: Quantidade acima do limite (menos de 100.000.000.000).",
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([5]);
  });
  it("Preço unitário acima do limite (1e10) é erro, sem lançar", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 1, 1e10],
        ["2", null, null, "B", "m", 1, 1e308],
        ["3", null, null, "C", "m", 0.001, 9999999999.99995], // arredondado a 4 casas dá 1e10
        ["4", null, null, "D", "m", 0.001, 9999999999.9999], // o maior que cabe: passa
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Preço unitário acima do limite (menos de 10.000.000.000).",
      "Linha 3: Preço unitário acima do limite (menos de 10.000.000.000).",
      "Linha 4: Preço unitário acima do limite (menos de 10.000.000.000).",
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([5]);
  });
  it("Total da linha acima do limite (1e12) é erro, sem lançar", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 1e6, 1e6], // total 1e12 exato
        ["2", null, null, "B", "m", 5e10, 5e9], // cada um abaixo do limite, total 2,5e20
        ["3", null, null, "C", "m", 99999999999.999, 9999999999.9999], // os dois no máximo
        ["4", null, null, "D", "m", 999999.999, 999999.9999], // total logo abaixo de 1e12: passa
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Total da linha acima do limite (menos de 1.000.000.000.000).",
      "Linha 3: Total da linha acima do limite (menos de 1.000.000.000.000).",
      "Linha 4: Total da linha acima do limite (menos de 1.000.000.000.000).",
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([5]);
    expect(r.totais.referencia).toBeLessThan(1e12);
  });
  it("quantidade ≤ 0, preço < 0, texto não numérico e só um dos dois", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 0, 1],
        ["2", null, null, "B", "m", -1, 1],
        ["3", null, null, "C", "m", 1, -0.01],
        ["4", null, null, "D", "m", "abc", 1],
        ["5", null, null, "E", "m", 1, "dez"],
        ["6", null, null, "F", "m", 1, null],
        ["7", null, null, "G", "m", null, 1],
        ["8", null, null, "H", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Quantidade deve ser maior que zero.",
      "Linha 3: Quantidade deve ser maior que zero.",
      "Linha 4: Preço unitário negativo.",
      'Linha 5: Quantidade não é um número ("abc").',
      'Linha 6: Preço unitário não é um número ("dez").',
      "Linha 7: Quantidade sem Preço unitário.",
      "Linha 8: Preço unitário sem Quantidade.",
    ]);
  });
  it("fórmula sem valor salvo (como o openpyxl grava) não vira etapa", () => {
    const wb = montarWb([CAB, ["1", null, null, "A", "m", 1, 1]]);
    wb.Sheets[ABA_ORCAMENTO].F2 = { t: "n", f: "2*3" };
    wb.Sheets[ABA_ORCAMENTO].G2 = { t: "n", f: "10/4" };
    expect(lerArquivoModelo(comoArquivo(wb)).erros).toEqual([
      "Linha 2: Quantidade é uma fórmula sem valor salvo; grave o número.",
      "Linha 2: Preço unitário é uma fórmula sem valor salvo; grave o número.",
      `Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`,
    ]);
  });
  it("mais de 3.000 linhas", () => {
    const linhas = [CAB];
    for (let i = 1; i <= LIMITE_LINHAS + 1; i++) {
      linhas.push([String(i), null, null, "x", "m", 1, 1]);
    }
    const r = lerPlanilhaModelo(montarWb(linhas));
    expect(r.erros).toEqual([`A aba "Orçamento" tem 3.001 linhas preenchidas; o limite é 3.000.`]);
    expect(r.itens).toEqual([]);
  });
  it("arquivo que não é o modelo, ou nem é planilha", () => {
    const pdf = lerArquivoModelo(new TextEncoder().encode("%PDF-1.7 lixo"));
    expect(pdf.erros).toEqual([
      'A planilha não tem a aba "Orçamento". Use o modelo do SIGO (botão Baixar modelo).',
    ]);
    const zipQuebrado = lerArquivoModelo(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
    expect(zipQuebrado.erros).toEqual([
      "Não foi possível ler o arquivo como planilha Excel (.xlsx).",
    ]);
  });
});

describe("lerPlanilhaModelo — avisos", () => {
  it("Total da linha diferente em mais de R$ 0,01 (0,01 exato não avisa)", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", "m", 125.5, 10.48, 1315.3],
        ["1.2", null, null, "B", "m", 125.5, 10.48, 1315.25],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([
      "Linha 3: Total (R$) informado 1.315,30 difere do calculado 1.315,24.",
    ]);
  });
  it("soma diferente do Total da prefeitura", () => {
    const r = lerPlanilhaModelo(montarWb(ORC_OK, [["Total da prefeitura (R$)", "R$ 19.500,00"]]));
    expect(r.totais.prefeitura).toBe(19500);
    expect(r.avisos).toEqual([
      "Soma dos itens (R$ 19.434,76) difere do Total da prefeitura (R$ 19.500,00) em R$ 65,24.",
    ]);
  });
  it("Total da prefeitura que o Excel transformou em data é ignorado, com aviso", () => {
    const wb = montarWb(ORC_OK, [["Total da prefeitura (R$)", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 46023, z: "d-mmm" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.total_prefeitura).toBeNull();
    expect(r.avisos).toEqual([
      'Informações: Total da prefeitura (R$) virou data no Excel ("1-Jan"); formate como Número e digite de novo; foi ignorado.',
    ]);
  });
  it("quantidade com mais de 3 casas e preço com mais de 4 casas são arredondados", () => {
    const r = lerPlanilhaModelo(
      montarWb([CAB, ["1", null, null, "Etapa"], ["1.1", null, null, "A", "m", 2.3456, 10.48475]])
    );
    expect(r.itens[1]).toMatchObject({ quantidade: 2.346, valor_unitario_ref: 10.4848 });
    expect(r.avisos).toEqual([
      "Linha 3: Quantidade com mais de 3 casas; arredondada para 2,346.",
      "Linha 3: Preço unitário com mais de 4 casas; arredondado para 10,4848.",
    ]);
  });
  it("Item lido como número (1.1): usa o valor e avisa; inteiro não avisa", () => {
    const r = lerArquivoModelo(
      comoArquivo(montarWb([CAB, [1, null, null, "Etapa"], [1.1, null, null, "A", "m", 1, 2]]))
    );
    expect(r.erros).toEqual([]);
    expect(r.itens.map((i) => i.numero)).toEqual(["1", "1.1"]);
    expect(r.avisos).toEqual([
      "Linha 3: Item lido como número (1.1); se era 1.10, formate a coluna A como Texto e digite de novo.",
    ]);
  });
  it("item sem etapa acima e numeração fora de sequência", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa 1"],
        ["1.1", null, null, "A", "m", 1, 1],
        ["1.3", null, null, "B", "m", 1, 1],
        ["2.1", null, null, "C", "m", 1, 1],
      ])
    );
    expect(r.avisos).toEqual([
      "Linha 4: Item 1.3 fora de sequência (depois de 1.1).",
      "Linha 5: Item 2.1 fora de sequência (depois de 1.3).",
      "Linha 5: item 2.1 sem etapa acima.",
    ]);
  });
  it("item sem unidade avisa (vazio ou só espaços); etapa sem unidade não", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", null, 1, 1],
        ["1.2", null, null, "B", "  ", 1, 1],
        ["1.3", null, null, "C", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual(["Linha 3: item sem unidade.", "Linha 4: item sem unidade."]);
    expect(r.itens.map((i) => i.unidade)).toEqual([null, null, null, "m"]);
    expect(r.totais).toMatchObject({ qtdEtapas: 1, qtdItens: 3 });
  });
  it("linha sem quantidade e preço, mas com Unidade ou Total, vira etapa e avisa", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa só com texto"],
        ["1.1", null, null, "Tem unidade", "un"],
        ["1.2", null, null, "Tem total", null, null, null, 100],
        ["1.3", null, null, "Item", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([
      "Linha 3: linha sem quantidade e preço tratada como etapa — confira.",
      "Linha 4: linha sem quantidade e preço tratada como etapa — confira.",
    ]);
    expect(r.itens.map((i) => i.etapa)).toEqual([true, true, true, false]);
  });
  it("sequência normal com etapas aninhadas não avisa", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "E1"],
        ["1.1", null, null, "E1.1"],
        ["1.1.1", null, null, "A", "m", 1, 1],
        ["1.1.2", null, null, "B", "m", 1, 1],
        ["1.2", null, null, "C", "m", 1, 1],
        ["2", null, null, "E2"],
        ["2.1", null, null, "D", "m", 1, 1],
      ])
    );
    expect(r.avisos).toEqual([]);
  });
  it("lista sem etapas: um aviso só; sem a aba Informações: aviso", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        CAB,
        ["1", null, null, "A", "m", 1, 1],
        ["2", null, null, "B", "m", 1, 1],
      ]),
      ABA_ORCAMENTO
    );
    expect(lerPlanilhaModelo(wb).avisos).toEqual([
      'A planilha não tem a aba "Informações"; órgão, objeto e total da prefeitura ficam em branco.',
      "A planilha não tem linhas de etapa; os itens ficam sem subtotal.",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/orcamento-modelo.test.js)
```

Esperado: `FAIL  src/lib/orcamento-modelo.test.js`, com `Error: Failed to load url ./orcamento-modelo ... Does the file exist?`, e `Test Files  1 failed (1)`.

- [ ] **Step 3: Implementar**

Crie `apps/web/src/lib/orcamento-modelo.js`:

<!-- prettier-ignore -->
```js
/**
 * Modelo SIGO de orçamento (.xlsx): fonte ÚNICA dos nomes das abas, colunas e rótulos,
 * a geração do modelo em branco e a leitura/validação da planilha preenchida
 * (spec docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §4 e §7).
 *
 * A skill do Claude (public/skills/orcamento-prefeitura-sigo/SKILL.md) escreve exatamente
 * esses textos; o teste de lib/skill-orcamento.test.js garante isso.
 *
 * Funções puras: recebem o workbook do SheetJS (ou o ArrayBuffer do arquivo) e devolvem
 * { itens, info, erros, avisos, totais }. Mensagens por linha usam a linha do Excel.
 */
import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/busca";
import { totalLinha } from "@/lib/orcamento-desconto";

export const ABA_ORCAMENTO = "Orçamento";
export const ABA_INFORMACOES = "Informações";
export const CABECALHOS_MODELO = [
  "Item",
  "Código",
  "Fonte",
  "Descrição",
  "Unidade",
  "Quantidade",
  "Preço unitário (R$)",
  "Total (R$)",
];
export const ROTULOS_INFO = [
  "Órgão",
  "Objeto",
  "Edital/Processo",
  "Data-base",
  "BDI (%)",
  "Fonte de preços",
  "Total da prefeitura (R$)",
  "Observações",
];
export const CHAVES_INFO = {
  Órgão: "orgao",
  Objeto: "objeto",
  "Edital/Processo": "edital",
  "Data-base": "data_base",
  "BDI (%)": "bdi",
  "Fonte de preços": "fonte",
  "Total da prefeitura (R$)": "total_prefeitura",
  Observações: "observacoes",
};
export const LIMITE_LINHAS = 3000;

/** Linhas da coluna A já formatadas como Texto no modelo em branco. */
const LINHAS_MODELO = 500;
/** A aba Informações é curta; não varre além disso. */
const LIMITE_LINHAS_INFO = 200;

/**
 * Tetos das colunas do banco (orcamento_item): quantidade numeric(14,3), valor_unitario e
 * valor_unitario_ref numeric(14,4), valor_total numeric(14,2). Acima disso o INSERT estoura
 * depois de a importação já ter apagado o orçamento antigo.
 */
const LIMITE_QUANTIDADE = 1e11;
const LIMITE_PRECO = 1e10;
const LIMITE_TOTAL = 1e12;
/**
 * Dígitos significativos que um número do Excel guarda sem ruído. Os valores dentro dos tetos
 * acima têm no máximo 14 dígitos (99999999999,999), então cortar em 15 nunca mexe num valor
 * legítimo e limpa o resto de uma fórmula, em qualquer tamanho (10.48 * 1.1 = 11.528000000000002;
 * 1234568.5 * 1.07 = 1320988.2950000002, que um corte em casas fixas não limparia).
 */
const CIFRAS_RUIDO = 15;

const CAMPO_POR_CABECALHO = {
  Item: "item",
  Código: "codigo",
  Fonte: "fonte",
  Descrição: "descricao",
  Unidade: "unidade",
  Quantidade: "quantidade",
  "Preço unitário (R$)": "preco",
  "Total (R$)": "total",
};
const OBRIGATORIOS = ["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário (R$)"];
const PADRAO_ITEM = /^\d+(\.\d+)*$/;

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

function semValor(cel) {
  return !cel || cel.t === "z" || cel.v === undefined || cel.v === null;
}

function vazia(cel) {
  if (formulaSemValor(cel)) return false;
  if (semValor(cel)) return true;
  return typeof cel.v === "string" && cel.v.trim() === "";
}

/** Texto das colunas de texto. Número inteiro vira "93358" (o `w` podia vir "9.3E+4"). */
function textoCelula(cel) {
  if (semValor(cel)) return "";
  if (cel.t === "n" && Number.isInteger(cel.v)) return String(cel.v);
  return String(cel.w ?? cel.v).trim();
}

function textoOuNull(cel) {
  return textoCelula(cel) || null;
}

/** Valor bruto para as colunas numéricas; célula de erro (#DIV/0!) vira texto → NaN. */
function valorDaCelula(cel) {
  if (semValor(cel)) return null;
  if (cel.t === "e") return String(cel.w ?? "#ERRO");
  return cel.v;
}

/**
 * Número que o Excel formatou como data (digitar 1/10 vira 1-Oct). Com `cellNF` a célula traz
 * o formato (`z`) e quem decide é o SSF (d-mmm, mmm-yy, dd/mm/yyyy...): o texto exibido (`w`)
 * só casa com alguns deles. Sem `z` (workbook em memória), `w` com três números separados por
 * / ou - fica como reserva.
 */
function formatoData(cel) {
  if (cel?.t !== "n" || typeof cel.v !== "number") return false;
  if (typeof cel.z === "string") return XLSX.SSF.is_date(cel.z);
  return /\d+[/-]\d+[/-]\d+/.test(String(cel.w ?? ""));
}

function lerCampoNumerico(cel, rotulo) {
  if (formulaSemValor(cel)) {
    return { valor: null, erro: `${rotulo} é uma fórmula sem valor salvo; grave o número` };
  }
  if (formatoData(cel)) {
    return {
      valor: null,
      erro: `${rotulo} virou data no Excel ("${cel.w ?? cel.v}"); formate como Número e digite de novo`,
    };
  }
  const bruto = valorDaCelula(cel);
  const valor = lerNumeroBR(bruto);
  if (Number.isNaN(valor)) return { valor: null, erro: `${rotulo} não é um número ("${bruto}")` };
  return { valor, erro: null };
}

/** Casas decimais pela representação mais curta do número (0.1 → 1; 1e-7 → 7). */
function casasDecimais(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(String(Math.abs(v)));
  if (!m) return 0;
  return Math.max(0, (m[2] || "").length - Number(m[3] || 0));
}

/** Tira o ruído de ponto flutuante de uma fórmula (11.528000000000002 → 11.528). */
function semRuido(v) {
  return Number(v.toPrecision(CIFRAS_RUIDO));
}

/** Arredonda (meio para cima) sem o erro de 1.005 × 100 = 100.49999… */
function arredondarCasas(v, casas) {
  const s = String(v);
  if (/e/i.test(s)) return Math.round(v * 10 ** casas) / 10 ** casas;
  return Number(`${Math.round(Number(`${s}e${casas}`))}e-${casas}`);
}

function formatar(v, minimo, maximo, agrupar = true) {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
    useGrouping: agrupar,
  });
}

const moeda = (v) => formatar(v, 2, 2);

/** "1.2" pode vir depois de "1.1" (irmão), "1" (filho .1) ou "1.1.3" (irmão de um ancestral). */
function sequenciaValida(anterior, atual) {
  const a = anterior.split(".").map(Number);
  const b = atual.split(".").map(Number);
  const mesmoInicio = (n) => b.slice(0, n).every((s, i) => s === a[i]);
  if (b.length === a.length + 1 && mesmoInicio(a.length) && b[b.length - 1] === 1) return true;
  const k = b.length;
  return k <= a.length && mesmoInicio(k - 1) && b[k - 1] === a[k - 1] + 1;
}

function temEtapaAcima(numero, etapasVistas) {
  const partes = numero.split(".");
  for (let k = partes.length - 1; k >= 1; k--) {
    if (etapasVistas.has(partes.slice(0, k).join("."))) return true;
  }
  return false;
}

function infoVazia() {
  return {
    orgao: null,
    objeto: null,
    edital: null,
    data_base: null,
    bdi: null,
    fonte: null,
    total_prefeitura: null,
    observacoes: null,
  };
}

/**
 * Data do Excel como texto: dd/mm/aaaa, ou mm/aaaa quando o formato não mostra o dia (mmm-yy,
 * mm/yyyy), porque a data-base de uma tabela de preços é mês/ano e não se inventa um "01/".
 * Sem formato salvo (workbook em memória) fica dd/mm/aaaa.
 */
function dataComoTexto(cel) {
  const d = XLSX.SSF.parse_date_code(cel.v);
  const dois = (n) => String(n).padStart(2, "0");
  // Tira "textos entre aspas", [locale] e \escapes antes de procurar o d de dia.
  const semLiterais = String(cel.z ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return typeof cel.z !== "string" || /d/i.test(semLiterais)
    ? `${dois(d.d)}/${dois(d.m)}/${d.y}`
    : `${dois(d.m)}/${d.y}`;
}

/** Texto da aba Informações: data do Excel vira dd/mm/aaaa (ou mm/aaaa); % e número em pt-BR. */
function textoInfo(cel) {
  if (semValor(cel)) return "";
  if (cel.t === "n") {
    if (formatoData(cel)) return dataComoTexto(cel);
    if (String(cel.w ?? "").endsWith("%")) return `${formatar(cel.v * 100, 0, 4, false)}%`;
    return formatar(cel.v, 0, 10, false);
  }
  return textoCelula(cel);
}

function lerInformacoes(wb, avisos) {
  const info = infoVazia();
  const nome = acharAba(wb, ABA_INFORMACOES);
  if (!nome) {
    avisos.push(
      `A planilha não tem a aba "${ABA_INFORMACOES}"; órgão, objeto e total da prefeitura ficam em branco.`
    );
    return info;
  }
  const ws = wb.Sheets[nome];
  if (!ws["!ref"]) return info;
  const chavePorRotulo = new Map(ROTULOS_INFO.map((r) => [normalizarRotulo(r), CHAVES_INFO[r]]));
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const ultima = Math.min(faixa.e.r, LIMITE_LINHAS_INFO - 1);
  for (let r = 0; r <= ultima; r++) {
    const chave = chavePorRotulo.get(normalizarRotulo(textoCelula(celula(ws, r, 0))));
    if (!chave || info[chave] !== null) continue;
    const cel = celula(ws, r, 1);
    if (chave === "total_prefeitura") {
      const { valor, erro } = lerCampoNumerico(cel, "Total da prefeitura (R$)");
      if (erro) avisos.push(`Informações: ${erro}; foi ignorado.`);
      else info.total_prefeitura = valor;
    } else {
      info[chave] = textoInfo(cel) || null;
      // Número puro na Data-base (45901): não dá para saber se era data; vai como o número.
      if (chave === "data_base" && info[chave] !== null && cel?.t === "n" && !formatoData(cel)) {
        avisos.push(`Informações, linha ${r + 1}: Data-base numérica (${info[chave]}) — confira.`);
      }
    }
  }
  return info;
}

// ---------------------------------------------------------------- API

/**
 * Número de uma célula: number finito → ele mesmo; texto pt-BR ("1.234,56", "12,5",
 * "R$ 1.234,56") ou com ponto decimal ("1234.56") → number; vazio/null/undefined → null;
 * qualquer outra coisa → NaN.
 */
export function lerNumeroBR(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor !== "string") return NaN;
  let s = valor.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (s === "") return null;
  const virgula = s.includes(",");
  const ponto = s.includes(".");
  if (virgula && ponto) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".") // 1.234,56
        : s.replace(/,/g, ""); // 1,234.56
  } else if (virgula) {
    s = s.replace(",", "."); // 12,5 (duas vírgulas não passam no teste abaixo)
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, ""); // 1.234.567
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Modelo em branco: aba Orçamento (cabeçalho + coluna A como Texto) e aba Informações. */
export function gerarModelo() {
  const orcamento = XLSX.utils.aoa_to_sheet([CABECALHOS_MODELO]);
  for (let r = 1; r <= LINHAS_MODELO; r++) {
    orcamento[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: "", z: "@" };
  }
  orcamento["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: LINHAS_MODELO, c: CABECALHOS_MODELO.length - 1 },
  });
  orcamento["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 70 },
    { wch: 9 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
  ];
  const informacoes = XLSX.utils.aoa_to_sheet(ROTULOS_INFO.map((rotulo) => [rotulo]));
  // Coluna B como Texto (menos o total, que é número): "09/2025" não vira data no Excel.
  ROTULOS_INFO.forEach((rotulo, r) => {
    if (CHAVES_INFO[rotulo] === "total_prefeitura") return;
    informacoes[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "s", v: "", z: "@" };
  });
  informacoes["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: ROTULOS_INFO.length - 1, c: 1 },
  });
  informacoes["!cols"] = [{ wch: 26 }, { wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, orcamento, ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, informacoes, ABA_INFORMACOES);
  return wb;
}

/**
 * Lê e valida o modelo preenchido (regras da spec §7). Com `erros` não vazio a
 * importação fica bloqueada; `avisos` só informam.
 */
export function lerPlanilhaModelo(wb) {
  const erros = [];
  const avisos = [];
  const itens = [];
  const info = wb?.SheetNames ? lerInformacoes(wb, avisos) : infoVazia();
  const totais = { referencia: 0, prefeitura: info.total_prefeitura, qtdEtapas: 0, qtdItens: 0 };
  const resultado = () => ({ itens, info, erros, avisos, totais });

  const nomeAba = acharAba(wb, ABA_ORCAMENTO);
  if (!nomeAba) {
    erros.push(
      `A planilha não tem a aba "${ABA_ORCAMENTO}". Use o modelo do SIGO (botão Baixar modelo).`
    );
    return resultado();
  }
  const ws = wb.Sheets[nomeAba];

  // Cabeçalho na linha 1, em qualquer ordem, sem acento/maiúsculas/espaços extras.
  const campoPorRotulo = new Map(
    Object.entries(CAMPO_POR_CABECALHO).map(([cab, campo]) => [normalizarRotulo(cab), campo])
  );
  const col = {};
  if (ws["!ref"]) {
    const faixa = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      const campo = campoPorRotulo.get(normalizarRotulo(textoCelula(celula(ws, 0, c))));
      if (campo && col[campo] === undefined) col[campo] = c;
    }
  }
  const faltando = OBRIGATORIOS.filter((cab) => col[CAMPO_POR_CABECALHO[cab]] === undefined);
  if (faltando.length > 0) {
    erros.push(`Linha 1: faltam as colunas obrigatórias: ${faltando.join(", ")}.`);
    return resultado();
  }

  // Linhas com algum dado nas colunas do modelo (pelas células que existem, não pelo !ref).
  const colunasUsadas = new Set(Object.values(col));
  const comDados = new Set();
  for (const endereco of Object.keys(ws)) {
    if (endereco[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(endereco);
    if (r > 0 && colunasUsadas.has(c) && !vazia(ws[endereco])) comDados.add(r);
  }
  const linhas = [...comDados].sort((a, b) => a - b);
  if (linhas.length > LIMITE_LINHAS) {
    erros.push(
      `A aba "${ABA_ORCAMENTO}" tem ${formatar(linhas.length, 0, 0)} linhas preenchidas; ` +
        `o limite é ${formatar(LIMITE_LINHAS, 0, 0)}.`
    );
    return resultado();
  }

  const linhaDoNumero = new Map();
  let refCents = 0;
  for (const r of linhas) {
    const n = r + 1;
    const errosAntes = erros.length;

    const celItem = celula(ws, r, col.item);
    const itemNumerico = celItem?.t === "n" && typeof celItem.v === "number";
    const virouData = itemNumerico && formatoData(celItem);
    let numero = textoCelula(celItem);
    if (itemNumerico && !virouData && !Number.isInteger(celItem.v)) {
      numero = String(celItem.v);
      avisos.push(
        `Linha ${n}: Item lido como número (${numero}); se era ${numero}0, ` +
          `formate a coluna A como Texto e digite de novo.`
      );
    }
    if (virouData) {
      erros.push(
        `Linha ${n}: Item virou data no Excel ("${celItem.w ?? celItem.v}"); ` +
          `formate a coluna A como Texto e digite de novo.`
      );
    } else if (!numero) {
      erros.push(`Linha ${n}: Item vazio.`);
    } else if (!PADRAO_ITEM.test(numero)) {
      erros.push(`Linha ${n}: Item "${numero}" fora do padrão (use 1, 1.1, 1.1.2).`);
    } else if (linhaDoNumero.has(numero)) {
      erros.push(
        `Linha ${n}: Item ${numero} repetido (já está na linha ${linhaDoNumero.get(numero)}).`
      );
    } else {
      linhaDoNumero.set(numero, n);
    }

    const descricao = textoCelula(celula(ws, r, col.descricao));
    if (!descricao) erros.push(`Linha ${n}: Descrição vazia.`);

    const qtd = lerCampoNumerico(celula(ws, r, col.quantidade), "Quantidade");
    const preco = lerCampoNumerico(celula(ws, r, col.preco), "Preço unitário");
    if (qtd.erro) erros.push(`Linha ${n}: ${qtd.erro}.`);
    if (preco.erro) erros.push(`Linha ${n}: ${preco.erro}.`);

    const etapa = !qtd.erro && !preco.erro && qtd.valor === null && preco.valor === null;
    let quantidade = null;
    let ref = null;
    if (!etapa && !qtd.erro && !preco.erro) {
      if (preco.valor === null) erros.push(`Linha ${n}: Quantidade sem Preço unitário.`);
      else if (qtd.valor === null) erros.push(`Linha ${n}: Preço unitário sem Quantidade.`);
      else {
        // O ruído de fórmula sai antes de contar as casas, senão vira aviso falso. Acima do teto
        // não se arredonda nem se avisa: o valor já é erro de limite (e 1e30 não tem "3 casas").
        quantidade = semRuido(qtd.valor);
        ref = semRuido(preco.valor);
        if (Math.abs(quantidade) < LIMITE_QUANTIDADE && casasDecimais(quantidade) > 3) {
          quantidade = arredondarCasas(quantidade, 3);
          avisos.push(
            `Linha ${n}: Quantidade com mais de 3 casas; arredondada para ${formatar(quantidade, 0, 3)}.`
          );
        }
        if (Math.abs(ref) < LIMITE_PRECO && casasDecimais(ref) > 4) {
          ref = arredondarCasas(ref, 4);
          avisos.push(
            `Linha ${n}: Preço unitário com mais de 4 casas; arredondado para ${formatar(ref, 2, 4)}.`
          );
        }
        if (quantidade >= LIMITE_QUANTIDADE) {
          erros.push(
            `Linha ${n}: Quantidade acima do limite (menos de ${formatar(LIMITE_QUANTIDADE, 0, 0)}).`
          );
        } else if (quantidade <= 0) {
          erros.push(`Linha ${n}: Quantidade deve ser maior que zero.`);
        }
        if (ref >= LIMITE_PRECO) {
          erros.push(
            `Linha ${n}: Preço unitário acima do limite (menos de ${formatar(LIMITE_PRECO, 0, 0)}).`
          );
        } else if (ref < 0) {
          erros.push(`Linha ${n}: Preço unitário negativo.`);
        }
      }
    }

    const tot = lerCampoNumerico(celula(ws, r, col.total), "Total (R$)");
    if (tot.erro) avisos.push(`Linha ${n}: ${tot.erro}; foi ignorado.`);
    const totalInformado = tot.erro ? null : tot.valor;

    if (erros.length > errosAntes) continue;

    const unidade = textoOuNull(celula(ws, r, col.unidade));
    if (etapa && (unidade !== null || totalInformado !== null)) {
      avisos.push(`Linha ${n}: linha sem quantidade e preço tratada como etapa — confira.`);
    }
    if (!etapa) {
      // Quantidade e preço já estão abaixo dos tetos: a conta em BigInt não lança.
      const calculado = totalLinha(quantidade, ref);
      if (calculado >= LIMITE_TOTAL) {
        erros.push(
          `Linha ${n}: Total da linha acima do limite (menos de ${formatar(LIMITE_TOTAL, 0, 0)}).`
        );
        continue;
      }
      if (unidade === null) avisos.push(`Linha ${n}: item sem unidade.`);
      refCents += Math.round(calculado * 100);
      if (
        totalInformado !== null &&
        Math.abs(Math.round(totalInformado * 100) - Math.round(calculado * 100)) > 1
      ) {
        avisos.push(
          `Linha ${n}: Total (R$) informado ${moeda(totalInformado)} difere do calculado ` +
            `${moeda(calculado)}.`
        );
      }
    }

    itens.push({
      linha: n,
      numero,
      etapa,
      codigo: textoOuNull(celula(ws, r, col.codigo)),
      fonte: textoOuNull(celula(ws, r, col.fonte)),
      descricao,
      unidade,
      quantidade: etapa ? null : quantidade,
      valor_unitario_ref: etapa ? null : ref,
      total_informado: totalInformado,
    });
  }

  totais.referencia = refCents / 100;
  totais.qtdEtapas = itens.filter((i) => i.etapa).length;
  totais.qtdItens = itens.length - totais.qtdEtapas;

  if (totais.qtdItens === 0) {
    erros.push(`Nenhum item com Quantidade e Preço unitário na aba "${ABA_ORCAMENTO}".`);
    return resultado();
  }

  // Estrutura: sequência da numeração e etapa acima de cada item.
  const etapasVistas = new Set();
  let anterior = null;
  for (const item of itens) {
    if (anterior !== null && !sequenciaValida(anterior, item.numero)) {
      avisos.push(
        `Linha ${item.linha}: Item ${item.numero} fora de sequência (depois de ${anterior}).`
      );
    }
    if (!item.etapa && totais.qtdEtapas > 0 && !temEtapaAcima(item.numero, etapasVistas)) {
      avisos.push(`Linha ${item.linha}: item ${item.numero} sem etapa acima.`);
    }
    if (item.etapa) etapasVistas.add(item.numero);
    anterior = item.numero;
  }
  if (totais.qtdEtapas === 0) {
    avisos.push("A planilha não tem linhas de etapa; os itens ficam sem subtotal.");
  }

  if (info.total_prefeitura !== null) {
    const diferenca = Math.abs(refCents - Math.round(info.total_prefeitura * 100));
    if (diferenca > 1) {
      avisos.push(
        `Soma dos itens (R$ ${moeda(totais.referencia)}) difere do Total da prefeitura ` +
          `(R$ ${moeda(info.total_prefeitura)}) em R$ ${moeda(diferenca / 100)}.`
      );
    }
  }

  return resultado();
}

/**
 * Lê o arquivo (ArrayBuffer/Uint8Array de `await file.arrayBuffer()`) e valida.
 * `sheetStubs` mantém a célula de fórmula sem valor salvo, para acusar o erro em vez
 * de tratar a linha como etapa. `cellNF` traz o formato (`z`) de cada célula, que é como se
 * reconhece o número que o Excel transformou em data (Item, Quantidade, Preço, Data-base).
 */
export function lerArquivoModelo(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", sheetStubs: true, cellNF: true });
  } catch {
    return {
      itens: [],
      info: infoVazia(),
      erros: ["Não foi possível ler o arquivo como planilha Excel (.xlsx)."],
      avisos: [],
      totais: { referencia: 0, prefeitura: null, qtdEtapas: 0, qtdItens: 0 },
    };
  }
  return lerPlanilhaModelo(wb);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/orcamento-modelo.test.js src/lib/orcamento-desconto.test.js)
```

Esperado: `Test Files  2 passed (2)` e `Tests  91 passed (91)` (60 do modelo + 31 da Task 1).

- [ ] **Step 5: Formatar e commitar**

```bash
npx prettier --write apps/web/src/lib/orcamento-modelo.js apps/web/src/lib/orcamento-modelo.test.js
git status --short
git add apps/web/src/lib/orcamento-modelo.js apps/web/src/lib/orcamento-modelo.test.js
git commit -F - -- apps/web/src/lib/orcamento-modelo.js apps/web/src/lib/orcamento-modelo.test.js <<'EOF'
feat(orcamento): modelo SIGO de orçamento (.xlsx) — gerar em branco, ler e validar

Fonte única dos nomes das abas, colunas e rótulos. lerPlanilhaModelo aplica as regras da
spec §7 (erros bloqueiam, avisos não): Item como texto (avisa se veio número), número pt-BR,
limite de 3.000 linhas, fórmula sem valor salvo, total da linha e da prefeitura conferidos.
Data do Excel reconhecida pelo formato da célula (cellNF), tetos do banco como erro de linha.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Esperado: o commit sai e o `git log` mostra `feat(orcamento): modelo SIGO de orçamento (.xlsx) — gerar em branco, ler e validar`.

---

### Task 3: Skill do Claude `orcamento-prefeitura-sigo` (SKILL.md + `skill-orcamento.js`)

**Files:**

- Create: `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md`
- Create: `apps/web/src/lib/skill-orcamento.js`
- Test: `apps/web/src/lib/skill-orcamento.test.js`

**Interfaces:**

- Consumes:
  - `ABA_ORCAMENTO`, `ABA_INFORMACOES`, `CABECALHOS_MODELO`, `ROTULOS_INFO` (Task 2; só no teste);
  - `jszip` 3.10.1 (já instalado). No navegador, a Task 5 passa `(await import("jszip")).default`; no teste, `import JSZip from "jszip"`.
- Produces:
  - `NOME_SKILL = "orcamento-prefeitura-sigo"`;
  - `CAMINHO_SKILL = "/skills/orcamento-prefeitura-sigo/SKILL.md"`;
  - `textoSkillValido(texto: string): boolean` — começa com `---` (aceita um BOM antes) e contém `name: orcamento-prefeitura-sigo`; `false` para o `index.html` que o Apache devolve com 200 quando o arquivo falta;
  - `montarZipSkill(JSZip, texto: string, tipo = "blob"): Promise<Blob|Uint8Array|...>` — uma única entrada `orcamento-prefeitura-sigo/SKILL.md`, sem entrada de pasta (`createFolders: false`), compressão DEFLATE.
- O arquivo `SKILL.md` é a única fonte da skill. Ele foi conferido assim: o código Python do próprio documento gerou um `.xlsx` que o `lerArquivoModelo` da Task 2 leu com 0 erros e 0 avisos, com o preço com BDI calculado (`preco_com_bdi(2827.92, 23.96)` = 3.505,49) e o total da prefeitura batendo. A `description` tem 601 caracteres (o limite do Claude é 1.024) e não tem `<` nem `>`.
- O teste `usa exatamente os nomes do modelo do SIGO` confere o texto inteiro do documento **e** o bloco Python: as listas `CABECALHOS` e `ROTULOS_INFO` (com a ordem) e `ws.title`/`create_sheet(...)` têm de ser iguais aos de `orcamento-modelo.js`. Só procurar as strings no documento não basta (elas já aparecem nas tabelas da prosa). Conferido trocando listas e abas do Python em memória: o teste falha em cada troca.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/lib/skill-orcamento.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { NOME_SKILL, CAMINHO_SKILL, textoSkillValido, montarZipSkill } from "./skill-orcamento";
import {
  ABA_ORCAMENTO,
  ABA_INFORMACOES,
  CABECALHOS_MODELO,
  ROTULOS_INFO,
} from "./orcamento-modelo";

const skill = readFileSync(
  new URL("../../public/skills/orcamento-prefeitura-sigo/SKILL.md", import.meta.url),
  "utf8"
);

describe("SKILL.md", () => {
  it("frontmatter com name e description válidos para o Claude", () => {
    expect(skill.startsWith("---\nname: orcamento-prefeitura-sigo\ndescription: ")).toBe(true);
    const description = /^description: (.+)$/m.exec(skill)[1];
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
    expect(skill.indexOf("\n---\n", 4)).toBeGreaterThan(0);
  });
  it("usa exatamente os nomes do modelo do SIGO", () => {
    // Tabelas e prosa do documento (o Claude lê o texto inteiro).
    for (const texto of [ABA_ORCAMENTO, ABA_INFORMACOES, ...CABECALHOS_MODELO, ...ROTULOS_INFO]) {
      expect(skill).toContain(texto);
    }
    // O que realmente grava o .xlsx é o bloco Python: as listas e os nomes das abas têm de ser
    // iguais aos de orcamento-modelo.js, na mesma ordem (o toContain acima acharia as strings
    // na prosa mesmo com o código errado).
    const python = /```python\n([\s\S]*?)\n```/.exec(skill)[1];
    const lista = (nome) =>
      JSON.parse(new RegExp(`^${nome} = (\\[[^\\]]*\\])`, "m").exec(python)[1]);
    expect(lista("CABECALHOS")).toEqual(CABECALHOS_MODELO);
    expect(lista("ROTULOS_INFO")).toEqual(ROTULOS_INFO);
    expect(python).toContain(`ws.title = "${ABA_ORCAMENTO}"`);
    expect(python).toContain(`create_sheet("${ABA_INFORMACOES}")`);
  });
});

describe("textoSkillValido", () => {
  it("aceita a skill e recusa o index.html do fallback", () => {
    expect(textoSkillValido(skill)).toBe(true);
    expect(textoSkillValido(String.fromCharCode(0xfeff) + skill)).toBe(true); // com BOM
    expect(textoSkillValido("<!doctype html><html><body>SIGO</body></html>")).toBe(false);
    expect(textoSkillValido("---\nname: outra-skill\n---\n")).toBe(false);
    expect(textoSkillValido("")).toBe(false);
    expect(textoSkillValido(null)).toBe(false);
  });
});

describe("montarZipSkill", () => {
  it("zip só com orcamento-prefeitura-sigo/SKILL.md, texto íntegro", async () => {
    const bytes = await montarZipSkill(JSZip, skill, "uint8array");
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual([`${NOME_SKILL}/SKILL.md`]);
    expect(await zip.file(`${NOME_SKILL}/SKILL.md`).async("string")).toBe(skill);
  });
  it("caminho público da skill", () => {
    expect(CAMINHO_SKILL).toBe(`/skills/${NOME_SKILL}/SKILL.md`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar (módulo ausente)**

```bash
(cd apps/web && npx vitest run src/lib/skill-orcamento.test.js)
```

Esperado: `FAIL  src/lib/skill-orcamento.test.js`, com `Error: Cannot find module './skill-orcamento'` (`Failed to load url ./skill-orcamento ... Does the file exist?`), e `Test Files  1 failed (1)`.

- [ ] **Step 3: Implementar o módulo**

Crie `apps/web/src/lib/skill-orcamento.js`:

```js
/**
 * Skill do Claude "orcamento-prefeitura-sigo": converte a planilha orçamentária da
 * prefeitura (PDF/Excel) para o modelo do SIGO (lib/orcamento-modelo.js).
 * O texto vive em public/skills/orcamento-prefeitura-sigo/SKILL.md (fonte única); o botão
 * "Skill do Claude" busca esse arquivo e monta o .zip no navegador.
 */

export const NOME_SKILL = "orcamento-prefeitura-sigo";
export const CAMINHO_SKILL = "/skills/orcamento-prefeitura-sigo/SKILL.md";

/**
 * O Apache do Hostgator devolve o index.html com HTTP 200 quando o arquivo não existe
 * (fallback do SPA). Só aceita o texto se for mesmo a skill.
 */
export function textoSkillValido(texto) {
  if (typeof texto !== "string") return false;
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  return semBom.startsWith("---") && semBom.includes(`name: ${NOME_SKILL}`);
}

/**
 * Zip com uma única entrada `orcamento-prefeitura-sigo/SKILL.md` (sem entrada de pasta),
 * o formato que o Claude aceita em Configurações → Capacidades → Skills.
 * `JSZip` é a classe (default de "jszip"); `tipo` vai para generateAsync ("blob" no navegador).
 */
export async function montarZipSkill(JSZip, texto, tipo = "blob") {
  const zip = new JSZip();
  zip.file(`${NOME_SKILL}/SKILL.md`, texto, { createFolders: false });
  return zip.generateAsync({ type: tipo, compression: "DEFLATE" });
}
```

- [ ] **Step 4: Rodar e ver falhar (SKILL.md ausente)**

```bash
(cd apps/web && npx vitest run src/lib/skill-orcamento.test.js)
```

Esperado: `FAIL  src/lib/skill-orcamento.test.js`, com `Error: ENOENT: no such file or directory, open '...\apps\web\public\skills\orcamento-prefeitura-sigo\SKILL.md'`, e `Test Files  1 failed (1)`.

- [ ] **Step 5: Escrever o SKILL.md**

Crie `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md` com exatamente o conteúdo abaixo (tudo o que está entre as cercas de 4 crases, começando pela linha `---`):

````markdown
---
name: orcamento-prefeitura-sigo
description: Converte a planilha orçamentária de uma licitação de prefeitura (PDF ou Excel; SINAPI, SETOP, SICRO, CDHU, ORSE, GOINFRA etc.) para o modelo de importação do SIGO Obras, um .xlsx com as abas "Orçamento" e "Informações". Use quando o usuário anexar a planilha orçamentária, planilha de preços ou orçamento sintético de um edital e pedir para converter, transcrever ou montar no modelo do SIGO, para importar no SIGO, ou disser "orçamento SIGO" ou "planilha para o SIGO". Copia fielmente etapas, itens, quantidades e preços de referência com BDI, confere com o total da prefeitura e não aplica desconto.
---

# Planilha da prefeitura → modelo de orçamento do SIGO

Você recebe a planilha orçamentária de um edital (PDF ou Excel) e devolve um `.xlsx` no **modelo do SIGO Obras**. O usuário importa esse arquivo no SIGO (Oportunidade → aba Orçamento → **Importar planilha**), que o lê sem IA: os nomes das abas, os cabeçalhos e os rótulos têm de ser **exatamente** os deste documento. O desconto da proposta é aplicado depois, dentro do SIGO.

## Resultado

- Arquivo `Orcamento SIGO - <órgão>.xlsx` (ex.: `Orcamento SIGO - PM Itatinga.xlsx`), sem `\ / : * ? " < > |` no nome.
- No claude.ai e no Claude Desktop, ofereça o arquivo para baixar. No Claude Code, grave na pasta que o usuário indicar (ou ao lado do arquivo de origem) e informe o caminho.
- Uma resposta curta com a conferência (modelo no fim deste documento).

## O modelo (formato exato)

### Aba `Orçamento`

A linha 1 é o cabeçalho, com estes textos, nesta ordem (colunas A a H):

| Coluna | Cabeçalho             | Conteúdo                                                                         |
| ------ | --------------------- | -------------------------------------------------------------------------------- |
| A      | `Item`                | número hierárquico em **texto**: `1`, `1.1`, `1.1.2`                             |
| B      | `Código`              | código na fonte (ex.: `93358`); vazio se não houver                              |
| C      | `Fonte`               | `SINAPI`, `SETOP`, `SICRO`, `CDHU`, `ORSE`, `GOINFRA`, `Próprio`…                |
| D      | `Descrição`           | texto do serviço ou título da etapa                                              |
| E      | `Unidade`             | `m`, `m²`, `m³`, `un`, `kg`, `vb`… (vazio na etapa)                              |
| F      | `Quantidade`          | número, até 3 casas (vazio na etapa)                                             |
| G      | `Preço unitário (R$)` | preço unitário **com BDI** da prefeitura, até 4 casas (vazio na etapa)           |
| H      | `Total (R$)`          | total da linha com BDI, como está na planilha da prefeitura, só para conferência |

- **Linha de etapa** (título de grupo): só `Item` e `Descrição`; quantidade e preço vazios. Pode ser de qualquer nível (`1`, `1.2`).
- **Linha de item:** `Quantidade` e `Preço unitário (R$)` sempre preenchidos, como **números** (não texto, não fórmula).
- A coluna A é gravada como **texto** (formato `@`), para `1.10` não virar `1.1`.
- Uma linha da planilha da prefeitura = uma linha do modelo, na mesma ordem. Não entram linhas de subtotal, de total geral, cabeçalhos repetidos de página nem linhas em branco no meio.

### Aba `Informações`

Rótulo na coluna A, valor na coluna B, uma linha por rótulo:

| Rótulo (coluna A)          | Valor (coluna B)                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `Órgão`                    | ex.: `Prefeitura Municipal de Itatinga`                                                |
| `Objeto`                   | objeto da licitação, como no edital                                                    |
| `Edital/Processo`          | ex.: `Pregão Eletrônico 12/2026 — Processo 345/2026`                                   |
| `Data-base`                | data-base dos preços, em texto (ex.: `09/2025`)                                        |
| `BDI (%)`                  | BDI da prefeitura em %, em texto (ex.: `23,96`); com dois BDIs, os dois, identificados |
| `Fonte de preços`          | ex.: `SINAPI 09/2025 desonerado; SETOP 07/2025`                                        |
| `Total da prefeitura (R$)` | valor global da planilha da prefeitura (com BDI), como **número**                      |
| `Observações`              | tudo o que foi calculado, normalizado, criado, ilegível ou ambíguo                     |

Deixe a coluna B vazia quando a planilha não trouxer a informação. Não invente.

## Passo a passo

1. **Leia o arquivo inteiro**, todas as páginas ou abas.
   - Excel: abra com `openpyxl` e `data_only=True` (valores, não fórmulas). Use a aba do orçamento sintético, não a de composições analíticas nem a do cronograma. A tabela quase nunca começa na linha 1: localize o cabeçalho pelos rótulos (Item, Código, Descrição, Unid., Quant., Preço/Valor unitário, Total).
   - PDF: extraia as tabelas página a página (ex.: `pdfplumber`). Se o PDF for imagem (escaneado), leia cada página visualmente. Cuidado com descrições quebradas em várias linhas e com o cabeçalho repetido em cada página.
2. **Mapeie as colunas** da prefeitura para as do modelo. Nomes comuns: `Item`/`Nº`; `Código`/`Cód.`/`SINAPI`; `Fonte`/`Banco`/`Referência`; `Descrição`/`Serviços`/`Discriminação`; `Und`/`Unid.`; `Quant.`/`Qtde`; `Preço unitário`/`Valor unit. c/ BDI`; `Total`/`Valor total`. Quando uma coluna junta código e fonte (ex.: `4813-SINAPI-08/2025`), separe: `Código` = `4813`, `Fonte` = `SINAPI`.
3. **Numeração e etapas.**
   - Copie o número do item como está. Só normalize o zero final de título: `1.0` → `1`, `2.0` → `2`, mantendo o resto (`1.1`, `1.1.2`), e anote em Observações.
   - Linhas de grupo ou título (em geral em maiúsculas, sem quantidade e sem preço) viram **etapa**.
   - Linhas de subtotal ("TOTAL SERVIÇOS PRELIMINARES", ou só um valor solto) **não** entram; use o valor delas só para conferir.
   - Planilha sem numeração: numere na ordem (`1`, `2`, `3`…; com grupos, `1` para o grupo e `1.1`, `1.2`… para os itens) e anote em Observações: "Numeração criada na conversão: a planilha da prefeitura não numera os itens."
4. **Preço unitário com BDI** (coluna G):
   - A planilha tem o preço unitário com BDI: copie-o.
   - Só tem o preço sem BDI e um BDI geral: calcule `arredondar(preço sem BDI × (1 + BDI), 2)`, meio para cima, como a prefeitura faz (função `preco_com_bdi` abaixo). Anote em Observações, ex.: "Preço com BDI calculado: sem BDI × (1 + 23,96%), arredondado em 2 casas."
   - Exemplo real (Itatinga-SP): unitário sem BDI 2.827,92 e BDI 23,96% → 3.505,49; 6 un → 21.032,94, o mesmo total com BDI da planilha da prefeitura.
   - Dois BDIs (material/equipamento e serviço/mão de obra): use o BDI de cada linha e anote a regra usada.
   - BDI embutido e não mostrado: copie o preço como está.
   - No Excel, se a célula guarda mais casas do que mostra (fórmula sem arredondar), use o valor exibido, com as casas do formato da célula (`arred`), e anote em Observações.
5. **Não aplique desconto.** O SIGO aplica o desconto da proposta.
6. **Grave o `.xlsx`** com `gravar_modelo_sigo` (valores, não fórmulas).
7. **Confira** com `conferir_modelo_sigo`, corrija o que der erro e responda ao usuário.

## Regras de fidelidade

- Copie número, código, fonte, descrição, unidade e quantidade **exatamente** como na planilha, na mesma ordem. Não resuma nem "corrija" descrições; não troque unidades.
- **Nunca invente** item, quantidade, preço ou código. Valor ilegível, célula cortada ou linha duvidosa: use a leitura mais provável **e** registre em `Observações` e na resposta, com o número do item e a página.
- Não junte, não separe e não reordene itens.
- Quantidade até 3 casas e preço até 4 casas, como na planilha; não arredonde além disso.
- Colunas F, G e H e o `Total da prefeitura (R$)` são **números** (`125.5`, não `"125,50"`).
- Não crie outras abas, colunas, fórmulas, células mescladas nem linhas de total.

## Conferência (obrigatória)

- Some `arredondar(quantidade × preço unitário, 2)` de todos os itens e compare com o **total geral da prefeitura**. Diferença acima de R$ 0,01 indica item faltando, número lido errado ou arredondamento diferente: procure a causa e informe.
- Se a planilha tiver subtotal por etapa, compare também cada etapa.
- Linha a linha: `Total (R$)` diferente de `arredondar(quantidade × preço, 2)` em mais de R$ 0,01 vai para a resposta, com o número do item.

## Código (Python + openpyxl)

```python
import re
from decimal import Decimal, ROUND_HALF_UP

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

CABECALHOS = ["Item", "Código", "Fonte", "Descrição", "Unidade", "Quantidade",
              "Preço unitário (R$)", "Total (R$)"]
ROTULOS_INFO = ["Órgão", "Objeto", "Edital/Processo", "Data-base", "BDI (%)",
                "Fonte de preços", "Total da prefeitura (R$)", "Observações"]
LARGURAS = {"A": 10, "B": 12, "C": 12, "D": 70, "E": 9, "F": 12, "G": 20, "H": 16}


def arred(valor, casas=2):
    """Arredonda meio para cima. O round() do Python arredonda 0,125 para 0,12."""
    passo = Decimal(1).scaleb(-casas)
    return float(Decimal(str(valor)).quantize(passo, rounding=ROUND_HALF_UP))


def preco_com_bdi(sem_bdi, bdi_pct):
    """Preço com BDI como a prefeitura calcula: arredondar(sem BDI × (1 + BDI/100), 2)."""
    valor = Decimal(str(sem_bdi)) * (1 + Decimal(str(bdi_pct)) / 100)
    return float(valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def gravar_modelo_sigo(linhas, info, caminho):
    """linhas: lista de dicts com item, codigo, fonte, descricao, unidade, quantidade,
    preco e total. Etapa: só item e descricao. info: {rótulo de ROTULOS_INFO: valor}."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Orçamento"
    ws.append(CABECALHOS)
    for celula in ws[1]:
        celula.font = Font(bold=True)
    for n, l in enumerate(linhas, start=2):
        codigo = l.get("codigo")
        valores = [str(l["item"]), str(codigo) if codigo not in (None, "") else None,
                   l.get("fonte") or None, l["descricao"], l.get("unidade") or None,
                   l.get("quantidade"), l.get("preco"), l.get("total")]
        for c, valor in enumerate(valores, start=1):
            celula = ws.cell(row=n, column=c, value=valor)
            if isinstance(valor, str) and valor.startswith("="):
                celula.data_type = "s"  # texto que começa com "=" não vira fórmula
        ws.cell(row=n, column=1).number_format = "@"  # coluna A como Texto
    for coluna, largura in LARGURAS.items():
        ws.column_dimensions[coluna].width = largura
    wi = wb.create_sheet("Informações")
    for rotulo in ROTULOS_INFO:
        wi.append([rotulo, info.get(rotulo)])
    wi.column_dimensions["A"].width = 26
    wi.column_dimensions["B"].width = 80
    wb.save(caminho)


def conferir_modelo_sigo(caminho):
    """Relê o arquivo e aplica as regras do importador do SIGO.
    Devolve (erros, avisos, soma_dos_itens). Com erros, o SIGO recusa a importação."""
    wb = load_workbook(caminho)
    erros, avisos = [], []
    if wb.sheetnames != ["Orçamento", "Informações"]:
        erros.append(f"As abas devem ser Orçamento e Informações: {wb.sheetnames}")
        return erros, avisos, 0.0
    ws = wb["Orçamento"]
    cabecalho = [c.value for c in ws[1]][:8]
    if cabecalho != CABECALHOS:
        erros.append(f"Cabeçalho diferente do modelo: {cabecalho}")
    vistos, soma, itens = {}, Decimal("0"), 0
    for linha in ws.iter_rows(min_row=2, max_col=8):
        item, _, _, descricao, _, qtd, preco, total = [c.value for c in linha]
        n = linha[0].row
        if all(v in (None, "") for v in (item, descricao, qtd, preco, total)):
            continue
        if not isinstance(item, str) or not re.fullmatch(r"\d+(\.\d+)*", item):
            erros.append(f"Linha {n}: Item {item!r} tem de ser texto no padrão 1, 1.1, 1.1.2")
        elif item in vistos:
            erros.append(f"Linha {n}: Item {item} repetido (linha {vistos[item]})")
        else:
            vistos[item] = n
        if not descricao:
            erros.append(f"Linha {n}: Descrição vazia")
        if any(isinstance(v, str) for v in (qtd, preco, total)):
            erros.append(f"Linha {n}: Quantidade, Preço e Total têm de ser números")
        elif (qtd is None) != (preco is None):
            erros.append(f"Linha {n}: Quantidade e Preço unitário vão juntos (etapa: os dois vazios)")
        elif qtd is not None:
            if qtd <= 0 or preco < 0:
                erros.append(f"Linha {n}: Quantidade tem de ser maior que zero e Preço, positivo")
            itens += 1
            calculado = (Decimal(str(qtd)) * Decimal(str(preco))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP)
            soma += calculado
            if total is not None and abs(Decimal(str(total)) - calculado) > Decimal("0.01"):
                avisos.append(f"Linha {n}: Total {total} difere de qtd × preço = {calculado}")
    if itens == 0:
        erros.append("Nenhum item com Quantidade e Preço unitário")
    info = {r[0].value: r[1].value for r in wb["Informações"].iter_rows(max_col=2) if r[0].value}
    total_prefeitura = info.get("Total da prefeitura (R$)")
    if total_prefeitura is None:
        avisos.append("Sem o Total da prefeitura (R$): a soma não foi conferida")
    elif abs(soma - Decimal(str(total_prefeitura))) > Decimal("0.01"):
        avisos.append(f"Soma dos itens {soma} difere do total da prefeitura {total_prefeitura} "
                      f"em {soma - Decimal(str(total_prefeitura))}")
    return erros, avisos, float(soma)


# Exemplo
linhas = [
    {"item": "1", "descricao": "SERVIÇOS PRELIMINARES"},
    {"item": "1.1", "codigo": "93358", "fonte": "SINAPI", "descricao": "ESCAVAÇÃO MANUAL DE VALA",
     "unidade": "m³", "quantidade": 125.5, "preco": 10.48, "total": 1315.24},
    {"item": "2", "descricao": "POSTES"},
    {"item": "2.1", "codigo": "41210", "fonte": "SINAPI", "descricao": "Poste 12/1000",
     "unidade": "un", "quantidade": 6, "preco": preco_com_bdi(2827.92, 23.96), "total": 21032.94},
]
info = {"Órgão": "Prefeitura Municipal de Exemplo", "Data-base": "09/2025", "BDI (%)": "23,96",
        "Total da prefeitura (R$)": 22348.18,
        "Observações": "Item 2.1: preço com BDI calculado, 2.827,92 × (1 + 23,96%) = 3.505,49."}
gravar_modelo_sigo(linhas, info, "Orcamento SIGO - PM Exemplo.xlsx")
print(conferir_modelo_sigo("Orcamento SIGO - PM Exemplo.xlsx"))
```

## Resposta ao usuário (modelo)

> Planilha convertida para o modelo do SIGO: **N etapas e M itens**.
>
> - Soma dos itens: R$ X · Total da prefeitura: R$ Y · Diferença: R$ Z (explique se não for zero).
> - Preço com BDI: copiado da planilha / calculado com BDI de B% (ver Observações).
> - Pontos de atenção: itens ilegíveis, numeração criada ou normalizada, linhas com total diferente.
>
> Para importar: SIGO → Oportunidade → aba **Orçamento** → **Importar planilha**. Confira a prévia e confirme; depois aplique o desconto no campo **Desconto (%)**.
````

- [ ] **Step 6: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/skill-orcamento.test.js)
```

Esperado: `Test Files  1 passed (1)` e `Tests  5 passed (5)`.

- [ ] **Step 7: Conferir o código Python da skill (se houver Python com openpyxl na máquina)**

O bloco Python do SKILL.md grava `Orcamento SIGO - PM Exemplo.xlsx` e imprime a conferência. Rode numa pasta temporária, fora do repositório:

```bash
(cd "$(mktemp -d)" && py -3 - <<'EOF'
cerca = chr(96) * 3
caminho = "C:/Users/javer/sigoobras-base/apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md"
texto = open(caminho, encoding="utf-8").read()
exec(texto.split(cerca + "python" + chr(10))[1].split(cerca)[0])
EOF
)
```

Esperado: `([], [], 22348.18)` (sem erros, sem avisos, soma igual ao total da prefeitura do exemplo). Sem `py`/openpyxl na máquina, pule este passo e registre isso no relatório da task.

- [ ] **Step 8: Suíte inteira, cópia para o build e formatação**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npm run build > /dev/null && ls dist/skills/orcamento-prefeitura-sigo/ && echo BUILD_OK)
npx prettier --check apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md apps/web/src/lib/skill-orcamento.js apps/web/src/lib/skill-orcamento.test.js
```

Esperado:

- vitest: `N + 3` arquivos e `M + 96` testes da linha de base, todos passando;
- `SKILL.md` e `BUILD_OK` (o Vite copia `public/**` para `dist/`, que o deploy publica; `dist/` está no `.gitignore`);
- `All matched files use Prettier code style!` (o CI roda `format:check`, que cobre `.md`).

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md apps/web/src/lib/skill-orcamento.js apps/web/src/lib/skill-orcamento.test.js
git commit -F - -- apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md apps/web/src/lib/skill-orcamento.js apps/web/src/lib/skill-orcamento.test.js <<'EOF'
feat(orcamento): skill do Claude orcamento-prefeitura-sigo e zip para instalar

SKILL.md em public/skills (fonte única) com o formato exato do modelo do SIGO, regras de
fidelidade, conferência do total e código openpyxl. skill-orcamento.js valida o texto buscado
(o fallback do SPA devolve o index.html com 200) e monta o .zip só com a pasta da skill.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Esperado: o commit sai e o `git log` mostra `feat(orcamento): skill do Claude orcamento-prefeitura-sigo e zip para instalar`.

---

## Parte B — Tasks 4 e 5: migração 0127, registros e importação da planilha na oportunidade

### Task 4: Migração 0127 e `lib/orcamento-registros.js`

**Files:**

- Create: `supabase/migrations/0127_orcamento_planilha_prefeitura.sql`
- Create: `apps/web/src/lib/orcamento-registros.js`
- Test: `apps/web/src/lib/orcamento-registros.test.js`

**Interfaces:**

- Consumes (Task 1, `apps/web/src/lib/orcamento-desconto.js`):
  - `precoComDesconto(ref: number, pct: number): number` (unitário cortado na 2ª casa; lança `RangeError` se `pct` não for number de 0 a 99,99 ou se `ref` não for number finito não negativo);
  - `totalLinha(quantidade: number|null, unitario: number|null): number|null` (arredondado em 2 casas; `null` se faltar um dos dois).
- Consumes (tipos do contrato): `ItemModelo = { linha, numero, etapa, codigo, fonte, descricao, unidade, quantidade, valor_unitario_ref, total_informado }` (Task 2) e `InfoOrcamento = { orgao, objeto, edital, data_base, bdi, fonte, total_prefeitura, observacoes }`.
- Produces (`apps/web/src/lib/orcamento-registros.js`, tudo export nomeado):
  - `montarRegistrosImportacao(itensModelo: ItemModelo[], { empresaId, oportunidadeId, descontoPct }): object[]` — `descontoPct` nulo ou ausente vale 0 (`?? 0` explícito); qualquer outro valor que não seja number de 0 a 99,99 faz o `precoComDesconto` lançar `RangeError` (não vira 0%). 17 chaves em **todos** os registros: `empresa_id, oportunidade_id, numero, item, etapa, tipo, codigo, fonte, descricao, unidade, quantidade, valor_unitario_ref, valor_unitario, bdi, imposto, valor_total, ordem`;
  - `montarInfoOrcamento(info: InfoOrcamento, { arquivoNome, importadoEm }): object` — as 8 chaves de `InfoOrcamento` + `arquivo_nome` + `importado_em`;
  - `emLotes(lista, tamanho = 200): Array<Array>`;
  - `proximaOrdem(itens): number`;
  - `compararNumeroItem(a: string, b: string): number`;
  - `rotuloItem(item, indice): string`;
  - `ordenarItensProjeto(itens): ItemOrc[]`;
  - `semEtapas(itens): ItemOrc[]`;
  - **extras (não estão no contrato; usados nas Tasks 5 e 7):** `ordenarItensOportunidade(itens): ItemOrc[]` (mesma ordem do `loadOrcamentoData` da oportunidade, `ordem ?? 0`, desempate por `numero`, e `item = rotuloItem`) e `cancelarGravacoesPendentes(ref): number` (cancela os timers de `updateTimeoutRef.current` e zera o mapa).

- [ ] **Step 1: Linha de base**

Na raiz do repositório (`C:\Users\javer\sigoobras-base`):

```bash
git status --short
cd apps/web && npx vitest run 2>&1 | tail -4
```

Anote o número de arquivos e de testes da suíte (muda com outras sessões; em 29/09 havia 20 arquivos e 199 testes antes das Tasks 1–3). `git status` pode mostrar arquivos de outras sessões: **não** mexa neles e não use `git add -A`.

- [ ] **Step 2: Criar a migração 0127 (NÃO aplicar agora; é aplicada só na Task 12, com OK do Javerson)**

Crie `supabase/migrations/0127_orcamento_planilha_prefeitura.sql`:

```sql
-- 0127 — Orçamento pela planilha da prefeitura: etapas, preço de referência, desconto e representante
--
-- orcamento_item:
--   numero              número hierárquico da planilha ("1", "1.2", "1.2.3"), em texto;
--   etapa               linha de título (sem quantidade nem preço; o subtotal é calculado na tela);
--   fonte               SINAPI, SETOP, SICRO, CDHU, Próprio…;
--   valor_unitario_ref  preço unitário da prefeitura COM BDI e SEM desconto (até 4 casas).
--   valor_unitario continua sendo o preço da proposta (com o desconto aplicado).
-- oportunidade:
--   desconto_proposta_pct  desconto linear da proposta, de 0 a 99,99%;
--   orcamento_info         aba "Informações" da planilha + arquivo_nome e importado_em.
-- empresa:
--   representante_nome/cargo/cpf  representante legal que assina a proposta.
--
-- Só aditiva e idempotente. A RLS não muda (mesmas tabelas).
-- Ordem do deploy: aplicar ESTA migração ANTES do push do front. A importação
-- (bulkCreate) e o Salvar da aba Empresa mandam as colunas novas; sem elas o
-- PostgREST responde PGRST204.
-- Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md, §6.

alter table public.orcamento_item add column if not exists numero text;
alter table public.orcamento_item add column if not exists etapa boolean not null default false;
alter table public.orcamento_item add column if not exists fonte text;
alter table public.orcamento_item add column if not exists valor_unitario_ref numeric(14,4);
alter table public.oportunidade add column if not exists desconto_proposta_pct numeric(5,2) not null default 0;
alter table public.oportunidade add column if not exists orcamento_info jsonb not null default '{}'::jsonb;
alter table public.empresa add column if not exists representante_nome text;
alter table public.empresa add column if not exists representante_cargo text;
alter table public.empresa add column if not exists representante_cpf text;
notify pgrst, 'reload schema';

select 'ok' as res;
```

Confira que o SQL é exatamente o do §6 da spec (Git Bash, na raiz):

````bash
diff <(sed -n '/^```sql$/,/^```$/p' docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md | sed '1d;$d') \
     <(grep -E '^(alter|notify) ' supabase/migrations/0127_orcamento_planilha_prefeitura.sql) && echo SQL_IGUAL_A_SPEC
tail -n 1 supabase/migrations/0127_orcamento_planilha_prefeitura.sql
````

Expected:

```
SQL_IGUAL_A_SPEC
select 'ok' as res;
```

- [ ] **Step 3: Escrever o teste que falha**

Crie `apps/web/src/lib/orcamento-registros.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  montarRegistrosImportacao,
  montarInfoOrcamento,
  emLotes,
  proximaOrdem,
  compararNumeroItem,
  rotuloItem,
  ordenarItensProjeto,
  ordenarItensOportunidade,
  semEtapas,
  cancelarGravacoesPendentes,
} from "./orcamento-registros";

const ETAPA = {
  linha: 2,
  numero: "1",
  etapa: true,
  codigo: null,
  fonte: null,
  descricao: "SERVIÇOS PRELIMINARES",
  unidade: "vb",
  quantidade: null,
  valor_unitario_ref: null,
  total_informado: null,
};
const ITEM = {
  linha: 3,
  numero: "1.1",
  etapa: false,
  codigo: "93358",
  fonte: "SINAPI",
  descricao: "Escavação manual de vala",
  unidade: "m³",
  quantidade: 125.5,
  valor_unitario_ref: 10.48,
  total_informado: 1315.24,
};
const CTX = { empresaId: "emp-1", oportunidadeId: "op-1", descontoPct: 12.35 };

describe("montarRegistrosImportacao", () => {
  it("etapa e item com o exemplo do §8 da spec (10,48 com 12,35% → 9,18; × 125,5 → 1.152,09)", () => {
    const [etapa, item] = montarRegistrosImportacao([ETAPA, ITEM], CTX);
    expect(etapa).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
      numero: "1",
      item: "1",
      etapa: true,
      tipo: null,
      codigo: null,
      fonte: null,
      descricao: "SERVIÇOS PRELIMINARES",
      unidade: null,
      quantidade: null,
      valor_unitario_ref: null,
      valor_unitario: null,
      bdi: 0,
      imposto: 0,
      valor_total: null,
      ordem: 0,
    });
    expect(item).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
      numero: "1.1",
      item: "1.1",
      etapa: false,
      tipo: null,
      codigo: "93358",
      fonte: "SINAPI",
      descricao: "Escavação manual de vala",
      unidade: "m³",
      quantidade: 125.5,
      valor_unitario_ref: 10.48,
      valor_unitario: 9.18,
      bdi: 0,
      imposto: 0,
      valor_total: 1152.09,
      ordem: 1,
    });
  });

  it("todos os registros têm exatamente as mesmas chaves (o insert em lote grava NULL na ausente)", () => {
    const regs = montarRegistrosImportacao([ETAPA, ITEM, { ...ITEM, numero: "1.2" }], CTX);
    const chaves = Object.keys(regs[0]).sort();
    expect(chaves).toHaveLength(17);
    for (const r of regs) expect(Object.keys(r).sort()).toEqual(chaves);
    for (const r of regs) {
      expect(r).not.toHaveProperty("linha");
      expect(r).not.toHaveProperty("total_informado");
      expect(r).not.toHaveProperty("projeto_id");
    }
  });

  it("desconto 0, nulo ou ausente grava o preço de referência cortado em 2 casas", () => {
    const [a] = montarRegistrosImportacao([ITEM], { ...CTX, descontoPct: 0 });
    expect(a.valor_unitario).toBe(10.48);
    expect(a.valor_total).toBe(1315.24);
    const [b] = montarRegistrosImportacao([ITEM], { empresaId: "e", oportunidadeId: "o" });
    expect(b.valor_unitario).toBe(10.48);
    const [c] = montarRegistrosImportacao([{ ...ITEM, valor_unitario_ref: 7.1299 }], {
      ...CTX,
      descontoPct: null,
    });
    expect(c.valor_unitario).toBe(7.12);
    expect(c.valor_unitario_ref).toBe(7.1299);
  });

  it("desconto inválido lança em vez de gravar o preço cheio (só nulo ou ausente vale 0)", () => {
    const monta = (descontoPct) => () => montarRegistrosImportacao([ITEM], { ...CTX, descontoPct });
    for (const ruim of ["12,35", "abc", NaN, 100, -1]) expect(monta(ruim)).toThrow(RangeError);
  });

  it("código e fonte ausentes viram null; ordem segue a posição na planilha", () => {
    const semCodigo = { ...ITEM, codigo: undefined, fonte: undefined };
    const regs = montarRegistrosImportacao([ETAPA, ITEM, semCodigo], CTX);
    expect(regs.map((r) => r.ordem)).toEqual([0, 1, 2]);
    expect(regs[2].codigo).toBeNull();
    expect(regs[2].fonte).toBeNull();
  });

  it("lista vazia ou nula devolve []", () => {
    expect(montarRegistrosImportacao([], CTX)).toEqual([]);
    expect(montarRegistrosImportacao(null, CTX)).toEqual([]);
  });
});

describe("montarInfoOrcamento", () => {
  it("grava as 8 chaves da aba Informações + arquivo e data, e descarta chave desconhecida", () => {
    const info = {
      orgao: "Prefeitura Municipal de Itatinga",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "08/2026",
      bdi: "25,00",
      fonte: "SINAPI 08/2026",
      total_prefeitura: 1315.24,
      observacoes: null,
      extra: "ignorar",
    };
    expect(
      montarInfoOrcamento(info, {
        arquivoNome: "Orcamento SIGO - Itatinga.xlsx",
        importadoEm: "2026-09-29T18:00:00.000Z",
      })
    ).toEqual({
      orgao: "Prefeitura Municipal de Itatinga",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "08/2026",
      bdi: "25,00",
      fonte: "SINAPI 08/2026",
      total_prefeitura: 1315.24,
      observacoes: null,
      arquivo_nome: "Orcamento SIGO - Itatinga.xlsx",
      importado_em: "2026-09-29T18:00:00.000Z",
    });
  });

  it("info ausente vira chaves nulas", () => {
    const r = montarInfoOrcamento(undefined, { arquivoNome: "a.xlsx", importadoEm: "x" });
    expect(r.orgao).toBeNull();
    expect(r.total_prefeitura).toBeNull();
    expect(Object.keys(r)).toHaveLength(10);
  });
});

describe("emLotes", () => {
  it("fatia na ordem, com o último lote menor", () => {
    expect(emLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("padrão de 200", () => {
    const lista = Array.from({ length: 450 }, (_, i) => i);
    expect(emLotes(lista).map((l) => l.length)).toEqual([200, 200, 50]);
    expect(emLotes(lista).flat()).toEqual(lista);
  });
  it("lista vazia ou nula → []", () => {
    expect(emLotes([], 10)).toEqual([]);
    expect(emLotes(null, 10)).toEqual([]);
  });
  it("tamanho inválido lança", () => {
    expect(() => emLotes([1], 0)).toThrow("Tamanho de lote inválido");
    expect(() => emLotes([1], 2.5)).toThrow("Tamanho de lote inválido");
  });
});

describe("proximaOrdem", () => {
  it("0 com a lista vazia ou nula", () => {
    expect(proximaOrdem([])).toBe(0);
    expect(proximaOrdem(undefined)).toBe(0);
  });
  it("max(ordem) + 1, com ordem nula contando como 0", () => {
    expect(proximaOrdem([{ ordem: 3 }, { ordem: 7 }, { ordem: null }])).toBe(8);
    expect(proximaOrdem([{ ordem: null }])).toBe(1);
    expect(proximaOrdem([{ ordem: 0 }])).toBe(1);
  });
});

describe("compararNumeroItem", () => {
  it("ordem natural por segmento", () => {
    const lista = ["1.10", "2", "1.2", "10", "1", "1.1.2", "1.1"];
    expect([...lista].sort(compararNumeroItem)).toEqual([
      "1",
      "1.1",
      "1.1.2",
      "1.2",
      "1.10",
      "2",
      "10",
    ]);
  });
  it("iguais dão 0; nulo vem antes", () => {
    expect(compararNumeroItem("1.2", "1.2")).toBe(0);
    expect(compararNumeroItem(null, "1")).toBeLessThan(0);
    expect(compararNumeroItem("1", null)).toBeGreaterThan(0);
  });
});

describe("rotuloItem", () => {
  it("numero quando existe, senão a posição", () => {
    expect(rotuloItem({ numero: "1.2" }, 5)).toBe("1.2");
    expect(rotuloItem({ numero: null }, 4)).toBe("5");
    expect(rotuloItem({}, 0)).toBe("1");
  });
});

describe("ordenarItensProjeto", () => {
  it("com numero: por ordem (nula por último), desempate por numero, sem mutar a entrada", () => {
    const itens = [
      { id: "a", numero: "1.10", ordem: 2 },
      { id: "b", numero: null, ordem: null },
      { id: "c", numero: "1", ordem: 0 },
      { id: "d", numero: "1.2", ordem: 2 },
      { id: "e", numero: "1.1", ordem: 1 },
    ];
    const copia = itens.map((i) => i.id);
    expect(ordenarItensProjeto(itens).map((i) => i.id)).toEqual(["c", "e", "d", "a", "b"]);
    expect(itens.map((i) => i.id)).toEqual(copia);
  });
  it("sem numero: ordem alfabética por descrição, como hoje", () => {
    const itens = [
      { id: "1", descricao: "cabo", ordem: 0 },
      { id: "2", descricao: "Abraçadeira", ordem: 1 },
      { id: "3", descricao: null, ordem: 2 },
      { id: "4", descricao: "Braço", ordem: 3 },
    ];
    expect(ordenarItensProjeto(itens).map((i) => i.id)).toEqual(["3", "2", "4", "1"]);
  });
});

describe("ordenarItensOportunidade", () => {
  it("por ordem (nula como 0), desempate por numero, rótulo item = numero ou posição", () => {
    const itens = [
      { id: "a", numero: "1.1", ordem: 1, item: "9" },
      { id: "b", numero: null, ordem: 3, item: "9" },
      { id: "c", numero: "1", ordem: 0, item: "9" },
      { id: "d", numero: "1.2", ordem: 1, item: "9" },
    ];
    const r = ordenarItensOportunidade(itens);
    expect(r.map((i) => i.id)).toEqual(["c", "a", "d", "b"]);
    expect(r.map((i) => i.item)).toEqual(["1", "1.1", "1.2", "4"]);
    expect(itens[0].item).toBe("9");
  });
  it("lista nula → []", () => {
    expect(ordenarItensOportunidade(null)).toEqual([]);
  });
});

describe("semEtapas", () => {
  it("tira só as linhas de etapa", () => {
    const itens = [{ id: 1, etapa: true }, { id: 2, etapa: false }, { id: 3 }];
    expect(semEtapas(itens).map((i) => i.id)).toEqual([2, 3]);
    expect(semEtapas(undefined)).toEqual([]);
  });
});

describe("cancelarGravacoesPendentes", () => {
  afterEach(() => vi.useRealTimers());

  it("cancela os timers pendentes e zera o mapa", () => {
    vi.useFakeTimers();
    const gravar = vi.fn();
    const ref = { current: {} };
    ref.current["i1-quantidade"] = setTimeout(gravar, 1500);
    ref.current["i2-valor_unitario"] = setTimeout(gravar, 1500);
    expect(cancelarGravacoesPendentes(ref)).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(gravar).not.toHaveBeenCalled();
    expect(ref.current).toEqual({});
  });

  it("ref ausente ou vazio não lança", () => {
    expect(cancelarGravacoesPendentes(undefined)).toBe(0);
    expect(cancelarGravacoesPendentes({ current: null })).toBe(0);
    expect(cancelarGravacoesPendentes({ current: {} })).toBe(0);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

```bash
cd apps/web && npx vitest run src/lib/orcamento-registros.test.js
```

Expected: FAIL, porque o módulo ainda não existe (saída conferida com o Vitest 3.2.6 do repositório):

```
FAIL  src/lib/orcamento-registros.test.js
Error: Failed to load url ./orcamento-registros (resolved id: ./orcamento-registros) in .../apps/web/src/lib/orcamento-registros.test.js. Does the file exist?
Test Files  1 failed (1)
     Tests  no tests
```

- [ ] **Step 5: Implementar `apps/web/src/lib/orcamento-registros.js`**

A comparação sem `numero` em `ordenarItensProjeto` é a de `pages/Projetos.jsx:210-214`, copiada literalmente (a Task 11 troca o `sort` de lá por esta função).

```js
/**
 * Registros do orçamento importado da planilha da prefeitura (modelo SIGO) e
 * utilitários de ordem/rótulo dos itens (oportunidade e projeto).
 *
 * Funções puras (sem sigoClient), testadas em orcamento-registros.test.js.
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md (§6, §7, §11).
 */
import { precoComDesconto, totalLinha } from "./orcamento-desconto";

/**
 * Converte os itens lidos do modelo (ItemModelo) em linhas de `orcamento_item`.
 *
 * Todas as chaves vão em todos os registros: o insert em lote do PostgREST
 * grava NULL na chave ausente (não o default da coluna), e `etapa` é NOT NULL.
 * `linha` e `total_informado` não são colunas: ficam de fora.
 */
export function montarRegistrosImportacao(itensModelo, { empresaId, oportunidadeId, descontoPct }) {
  // nulo ou ausente = sem desconto; o resto vai direto ao precoComDesconto, que recusa (RangeError)
  // o que não for number de 0 a 99,99 em vez de gravar o preço cheio como se fosse a proposta
  const pct = descontoPct ?? 0;
  return (itensModelo || []).map((it, indice) => {
    const etapa = it.etapa === true;
    const ref = etapa ? null : (it.valor_unitario_ref ?? null);
    const quantidade = etapa ? null : (it.quantidade ?? null);
    const valorUnitario = ref == null ? null : precoComDesconto(ref, pct);
    return {
      empresa_id: empresaId,
      oportunidade_id: oportunidadeId,
      numero: it.numero,
      item: it.numero,
      etapa,
      tipo: null,
      codigo: it.codigo ?? null,
      fonte: it.fonte ?? null,
      descricao: it.descricao,
      unidade: etapa ? null : (it.unidade ?? null),
      quantidade,
      valor_unitario_ref: ref,
      valor_unitario: valorUnitario,
      bdi: 0,
      imposto: 0,
      valor_total: etapa ? null : totalLinha(quantidade, valorUnitario),
      ordem: indice,
    };
  });
}

const CHAVES_INFO_ORCAMENTO = [
  "orgao",
  "objeto",
  "edital",
  "data_base",
  "bdi",
  "fonte",
  "total_prefeitura",
  "observacoes",
];

/** InfoOrcamento + nome do arquivo e data da importação, para `oportunidade.orcamento_info`. */
export function montarInfoOrcamento(info, { arquivoNome, importadoEm }) {
  const origem = info || {};
  const saida = {};
  for (const chave of CHAVES_INFO_ORCAMENTO) saida[chave] = origem[chave] ?? null;
  saida.arquivo_nome = arquivoNome;
  saida.importado_em = importadoEm;
  return saida;
}

/** Fatia a lista em lotes de `tamanho` (padrão 200, o do bulkCreate do repositório). */
export function emLotes(lista, tamanho = 200) {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new Error(`Tamanho de lote inválido: ${tamanho}`);
  }
  const itens = lista || [];
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** `ordem` do próximo item: max(ordem) + 1 (ordem nula conta como 0), ou 0 com a lista vazia. */
export function proximaOrdem(itens) {
  const lista = itens || [];
  if (lista.length === 0) return 0;
  return lista.reduce((max, i) => Math.max(max, Number(i.ordem) || 0), 0) + 1;
}

/** Ordem natural de número hierárquico: "1.2" antes de "1.10", "1" antes de "1.1". */
export function compararNumeroItem(a, b) {
  const sa = String(a ?? "").split(".");
  const sb = String(b ?? "").split(".");
  const n = Math.max(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    if (sa[i] === undefined) return -1;
    if (sb[i] === undefined) return 1;
    const na = Number(sa[i]);
    const nb = Number(sb[i]);
    const ambosNumeros = sa[i] !== "" && sb[i] !== "" && Number.isFinite(na) && Number.isFinite(nb);
    const c = ambosNumeros ? na - nb : sa[i].localeCompare(sb[i]);
    if (c !== 0) return c < 0 ? -1 : 1;
  }
  return 0;
}

/** Rótulo da coluna Nº: o `numero` do item importado, senão a posição (1, 2, 3…). */
export function rotuloItem(item, indice) {
  return item.numero ?? String(indice + 1);
}

const temNumero = (itens) => itens.some((i) => !!i.numero);

/**
 * Ordem dos itens no Projeto. Com `numero` (orçamento importado): por `ordem`
 * (nula por último), desempate por `numero`. Sem `numero`: a ordem alfabética
 * por descrição de sempre (comparação copiada de pages/Projetos.jsx).
 * Devolve uma lista nova; não altera a recebida.
 */
export function ordenarItensProjeto(itens) {
  const lista = [...(itens || [])];
  if (temNumero(lista)) {
    return lista.sort((a, b) => {
      const oa = a.ordem ?? null;
      const ob = b.ordem ?? null;
      if (oa === null && ob !== null) return 1;
      if (oa !== null && ob === null) return -1;
      if (oa !== null && ob !== null && oa !== ob) return oa - ob;
      return compararNumeroItem(a.numero, b.numero);
    });
  }
  return lista.sort((a, b) => {
    const descA = (a.descricao || "").toLowerCase();
    const descB = (b.descricao || "").toLowerCase();
    return descA.localeCompare(descB);
  });
}

/**
 * Ordem dos itens na Oportunidade (a mesma de loadOrcamentoData em
 * pages/Oportunidades.jsx: `ordem`, nula como 0), desempate por `numero`, e
 * rótulo `item` = `numero` ou a posição. Devolve objetos novos.
 */
export function ordenarItensOportunidade(itens) {
  return [...(itens || [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || compararNumeroItem(a.numero, b.numero))
    .map((item, i) => ({ ...item, item: rotuloItem(item, i) }));
}

/** Tira as linhas de etapa (título), para compras, relatórios e somas. */
export function semEtapas(itens) {
  return (itens || []).filter((i) => !i.etapa);
}

/**
 * Cancela as gravações por campo ainda pendentes (debounce de 1,5 s do
 * handleUpdateItem, que regrava a LINHA INTEIRA). Chamar antes de importar ou
 * aplicar o desconto, senão a linha antiga volta por cima. Devolve quantas havia.
 */
export function cancelarGravacoesPendentes(ref) {
  const pendentes = ref?.current;
  if (!pendentes || typeof pendentes !== "object") return 0;
  const timers = Object.values(pendentes);
  timers.forEach((t) => clearTimeout(t));
  ref.current = {};
  return timers.length;
}
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd apps/web && npx vitest run src/lib/orcamento-registros.test.js
```

Expected:

```
✓ src/lib/orcamento-registros.test.js (24 tests)
Test Files  1 passed (1)
     Tests  24 passed (24)
```

- [ ] **Step 7: Suíte inteira e formatação**

```bash
cd apps/web && npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/lib/orcamento-registros.js apps/web/src/lib/orcamento-registros.test.js
```

Expected: a suíte com **1 arquivo e 24 testes a mais** que a linha de base do Step 1, todos passando; Prettier `All matched files use Prettier code style!`.

- [ ] **Step 8: Commit (só os 3 caminhos da task)**

```bash
git status --short
git add supabase/migrations/0127_orcamento_planilha_prefeitura.sql apps/web/src/lib/orcamento-registros.js apps/web/src/lib/orcamento-registros.test.js
git commit -F - -- supabase/migrations/0127_orcamento_planilha_prefeitura.sql apps/web/src/lib/orcamento-registros.js apps/web/src/lib/orcamento-registros.test.js <<'EOF'
feat(orcamento): migração 0127 e registros da importação da planilha da prefeitura

- 0127 (só aditiva e idempotente): orcamento_item.numero/etapa/fonte/valor_unitario_ref,
  oportunidade.desconto_proposta_pct/orcamento_info e empresa.representante_*; aplicada só
  na publicação, antes do push do front
- lib/orcamento-registros: linhas do orcamento_item a partir do modelo SIGO (todas as chaves
  em todos os registros, porque o insert em lote grava NULL na chave ausente),
  orcamento_info, lotes, próxima ordem, ordem natural do número (1.2 antes de 1.10), rótulo,
  ordem do projeto e da oportunidade, filtro de etapas e cancelamento das gravações pendentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `3 files changed`, só esses três caminhos.

---

### Task 5: Barra do orçamento da licitação e importação na oportunidade

**Files:**

- Create: `apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx`
- Create: `apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx`
- Modify: `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx` (imports `:56` e `:60`; estado `:175`; permissão `:180-181`; efeito `:183-185`; `handleTabChange` `:187-190`; aba Orçamento `:788-791`; card do estado vazio `:934`)
- Test: sem teste de componente (Vitest em ambiente node, sem DOM). A lógica está testada nas Tasks 1–4; os componentes são verificados por ESLint e build.

**Interfaces:**

- Consumes (Task 1, `@/lib/orcamento-desconto`): `validarDesconto(entrada): { ok: true, valor } | { ok: false, erro }`, `aplicarDesconto(itens, pct): Array<{ id, valor_unitario, valor_total }>` (`pct` = o `valor` number do `validarDesconto`; fora de 0 a 99,99, ou com referência negativa num item, lança `RangeError`), `resumoOrcamento(itens): { totalReferencia, totalProposta, descontoReal, itensSemReferencia, qtdItens, qtdEtapas }` (`itensSemReferencia` é **quantidade**, número).
- Consumes (Task 2, `@/lib/orcamento-modelo`, por **import dinâmico** para não pôr o `xlsx` no chunk do Dashboard): `gerarModelo(): XLSX.WorkBook`, `lerArquivoModelo(buffer): { itens, info, erros, avisos, totais: { referencia, prefeitura, qtdEtapas, qtdItens } }`.
- Consumes (Task 3, `@/lib/skill-orcamento`): `CAMINHO_SKILL`, `textoSkillValido(texto): boolean`, `montarZipSkill(JSZip, texto, tipo = "blob")`.
- Consumes (Task 4, `@/lib/orcamento-registros`): `montarRegistrosImportacao`, `montarInfoOrcamento`, `emLotes`, `ordenarItensOportunidade`, `cancelarGravacoesPendentes`.
- Produces:
  - `OrcamentoLicitacaoBarra` (default export), props `{ selectedOp, setSelectedOp, setOportunidades, orcamentoItens, setOrcamentoItens, empresaAtiva, updateTimeoutRef, podeEditar, importarAberto?, onImportarAbertoChange? }`. As duas últimas são **opcionais** (sem elas a barra usa estado próprio). Contém a linha-âncora `{/* Exportar proposta: botão e diálogo entram aqui (Task 9) */}`. Não recebe `user` (a Task 9 acrescenta a prop e passa `user={user}` no `OportunidadeDetalhe`, logo depois de `podeEditar={podeEditarOrcamento}`).
  - `ImportarPlanilhaOrcamentoDialog` (default export), props `{ open, onOpenChange, selectedOp, empresaAtiva, orcamentoItens, updateTimeoutRef, onImportado }`; `onImportado(itensGravadosOrdenados, orcamentoInfo | null)`.
  - Em `OportunidadeDetalhe.jsx`: `const [importarAberto, setImportarAberto] = useState(false)`, `const podeEditarOrcamento` e `abrirImportacaoPlanilha()`.

**Decisão (card "Importar" do estado vazio):** o estado de abertura do diálogo é **elevado ao `OportunidadeDetalhe`** (`importarAberto`/`setImportarAberto`) e passado à barra por `importarAberto` + `onImportarAbertoChange`. O card "Importar" chama `abrirImportacaoPlanilha()` (confere `podeEditarOrcamento`, senão toast de erro) em vez de `onNovoOrcamentoSelect("importar")` (o CSV antigo). Os cards "Começar do zero" e "Utilizar modelo" não mudam. O `CalendarioConsolidado` usa o mesmo `OportunidadeDetalhe` e não precisa de prop nova: a barra grava direto pelo `sigo.entities` e atualiza o estado pelos setters que o `CC` já passa (`setSelectedOp={setOportunidadeDetalhe}`, `setOportunidades={setOportunidadesDoDetalhe}`, `setOrcamentoItens`, `updateTimeoutRef`). O dropdown "Ações" antigo (CSV) continua até a Task 9.

**Sem `Select` nos componentes novos** (o desconto é um `Input`), então não há problema de `z-index` do `SelectContent` dentro do `Dialog`.

**Entrada inválida nas contas (correção da Task 1, 01/10):** `precoComDesconto`/`aplicarDesconto` lançam `RangeError` em vez de tratar desconto ou referência inválidos como 0%. A barra já chamava `validarDesconto` antes e passa só o `valor` (number); o `aplicarDesconto` agora fica num `try/catch` que mostra o erro e sai sem gravar nada (uma referência negativa vinda do banco, por exemplo). No diálogo, a montagem dos registros também fica num `try/catch`, **antes** de apagar os itens atuais: se o desconto salvo na oportunidade estiver fora de 0 a 99,99% (a coluna é `numeric(5,2)`, sem CHECK), a importação para com um aviso e nada é apagado nem gravado.

**Edição pendente no Aplicar (correção da revisão 1, 05/10):** o `handleUpdateItem` põe a edição no estado local na hora e só grava a linha inteira 1,5 s depois. Cancelar esse timer no Aplicar perderia a edição (o `aplicarDesconto` usa a quantidade do estado local e grava só `valor_unitario`/`valor_total`: o banco ficaria com a quantidade antiga e o total novo; numa linha sem referência, a edição se perderia inteira). Por isso o `handleAplicar` começa conferindo `Object.keys(updateTimeoutRef?.current || {}).length > 0` (a chave só sai do mapa depois do `await` da gravação, então cobre também a gravação em voo) e, havendo pendência, mostra `toast.info("Aguarde a gravação da última edição e aplique de novo")` e sai. O `cancelarGravacoesPendentes` continua depois, como proteção. Na importação descartar está certo (tudo é substituído).

- [ ] **Step 1: Linha de base do lint**

```bash
cd apps/web && npx eslint src/components/oportunidades --quiet; echo "exit $?"
```

Expected: nenhuma saída e `exit 0`. (Sem `--quiet`, o `OportunidadeDetalhe.jsx` já tem 1 aviso antigo: `'cronogramaEtapas' is defined but never used`. Ele continua depois desta task.)

- [ ] **Step 2: Criar `apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx`**

<!-- prettier-ignore -->
```jsx
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, Loader2, XCircle } from "lucide-react";
import { sigo } from "@/api/sigoClient";
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
import { formatBRL } from "@/lib/formatters";
import {
  cancelarGravacoesPendentes,
  emLotes,
  montarInfoOrcamento,
  montarRegistrosImportacao,
  ordenarItensOportunidade,
} from "@/lib/orcamento-registros";

const MAX_LISTADAS = 50;

function ListaMensagens({ titulo, mensagens, tom }) {
  if (!mensagens?.length) return null;
  const Icone = tom === "erro" ? XCircle : AlertTriangle;
  const cores =
    tom === "erro"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`rounded-md border p-3 text-sm ${cores}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Icone className="w-4 h-4" />
        {titulo} ({mensagens.length})
      </p>
      <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
        {mensagens.slice(0, MAX_LISTADAS).map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      {mensagens.length > MAX_LISTADAS && (
        <p className="mt-1 text-xs">{`… e mais ${mensagens.length - MAX_LISTADAS}`}</p>
      )}
    </div>
  );
}

/**
 * Importa o .xlsx no modelo do SIGO (feito pela skill do Claude ou à mão) no
 * orçamento da oportunidade: prévia com totais, erros e avisos; ao confirmar,
 * APAGA os itens atuais (soft delete) e grava os novos em lotes de 200, com o
 * desconto atual da oportunidade já aplicado.
 *
 * onImportado(itensGravadosOrdenados, orcamentoInfo): orcamentoInfo = null
 * quando a gravação falhou no meio (a lista vem recarregada do banco) ou
 * quando só as informações da planilha não foram gravadas.
 */
export default function ImportarPlanilhaOrcamentoDialog({
  open,
  onOpenChange,
  selectedOp,
  empresaAtiva,
  orcamentoItens,
  updateTimeoutRef,
  onImportado,
}) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState("");

  // fechou (ou trocou de oportunidade): começa do zero na próxima vez
  useEffect(() => {
    if (!open) {
      setArquivoNome("");
      setResultado(null);
      setProgresso("");
    }
  }, [open, selectedOp?.id]);

  const descontoPct = Number(selectedOp?.desconto_proposta_pct) || 0;
  const qtdAtuais = (orcamentoItens || []).length;
  const podeConfirmar =
    !!resultado &&
    resultado.erros.length === 0 &&
    resultado.itens.length > 0 &&
    !lendo &&
    !gravando;

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
      const { lerArquivoModelo } = await import("@/lib/orcamento-modelo");
      setResultado(lerArquivoModelo(await file.arrayBuffer()));
    } catch (err) {
      console.error("Erro ao ler a planilha:", err);
      toast.error(`Não foi possível ler a planilha: ${err?.message || "arquivo inválido"}`);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!podeConfirmar || !selectedOp?.id || !empresaAtiva?.id) return;
    if (qtdAtuais > 0 && !window.confirm(`Substituir os ${qtdAtuais} itens atuais?`)) return;

    cancelarGravacoesPendentes(updateTimeoutRef);
    const empresaId = empresaAtiva.id;
    const oportunidadeId = selectedOp.id;
    let lotes;
    try {
      const registros = montarRegistrosImportacao(resultado.itens, {
        empresaId,
        oportunidadeId,
        descontoPct,
      });
      lotes = emLotes(registros, 200);
    } catch (err) {
      // desconto salvo fora de 0 a 99,99% ou preço de referência inválido (RangeError):
      // ainda não apagou nem gravou nada
      console.error("Erro ao montar os registros da importação:", err);
      toast.error(
        `Não foi possível importar: ${err?.message || "dados inválidos"}. Nada foi alterado.`
      );
      return;
    }

    setGravando(true);
    const idToast = toast.loading("Importando o orçamento…");
    let gravados = [];
    try {
      setProgresso("Apagando os itens atuais…");
      await sigo.entities.OrcamentoItem.deleteMany({
        empresa_id: empresaId,
        oportunidade_id: oportunidadeId,
      });
      for (let i = 0; i < lotes.length; i++) {
        setProgresso(`Gravando os itens: lote ${i + 1} de ${lotes.length}…`);
        gravados = gravados.concat(await sigo.entities.OrcamentoItem.bulkCreate(lotes[i]));
      }
    } catch (err) {
      console.error("Erro ao importar o orçamento:", err);
      toast.error(
        `Erro ao importar: ${err?.message || "erro desconhecido"}. A lista foi recarregada; importe de novo.`,
        { id: idToast }
      );
      try {
        const lista = await sigo.entities.OrcamentoItem.filter({
          empresa_id: empresaId,
          oportunidade_id: oportunidadeId,
        });
        onImportado?.(ordenarItensOportunidade(lista), null);
      } catch (e2) {
        console.error("Erro ao recarregar o orçamento:", e2);
      }
      setGravando(false);
      setProgresso("");
      return;
    }

    const itensOrdenados = ordenarItensOportunidade(gravados);
    const orcamentoInfo = montarInfoOrcamento(resultado.info, {
      arquivoNome,
      importadoEm: new Date().toISOString(),
    });
    try {
      await sigo.entities.Oportunidade.update(oportunidadeId, { orcamento_info: orcamentoInfo });
      onImportado?.(itensOrdenados, orcamentoInfo);
      toast.success(
        `Orçamento importado: ${resultado.totais.qtdEtapas} etapas e ${resultado.totais.qtdItens} itens`,
        { id: idToast }
      );
    } catch (err) {
      console.error("Erro ao gravar as informações da planilha:", err);
      onImportado?.(itensOrdenados, null);
      toast.warning(
        `Itens importados, mas as informações da planilha (órgão, objeto, edital) não foram gravadas: ${err?.message || "erro desconhecido"}`,
        { id: idToast }
      );
    }
    setGravando(false);
    setProgresso("");
    onOpenChange(false);
  };

  const totais = resultado?.totais;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!gravando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha (modelo SIGO)</DialogTitle>
          <DialogDescription>
            {
              "Escolha o .xlsx no modelo do SIGO (gerado pela Skill do Claude ou preenchido no Baixar modelo). A importação substitui todo o orçamento desta oportunidade."
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

          {resultado && totais && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                {arquivoNome}
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Etapas</p>
                  <p className="font-semibold">{totais.qtdEtapas}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Itens</p>
                  <p className="font-semibold">{totais.qtdItens}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total de referência</p>
                  <p className="font-semibold">{formatBRL(totais.referencia)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total da prefeitura</p>
                  <p className="font-semibold">
                    {totais.prefeitura != null ? formatBRL(totais.prefeitura) : "não informado"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                {`Os itens são gravados com o desconto atual da oportunidade: ${descontoPct.toLocaleString("pt-BR")}%.`}
                {qtdAtuais > 0 && ` Os ${qtdAtuais} itens atuais serão apagados.`}
              </p>
              <ListaMensagens
                titulo="Erros (corrija a planilha e escolha de novo)"
                mensagens={resultado.erros}
                tom="erro"
              />
              <ListaMensagens titulo="Avisos" mensagens={resultado.avisos} tom="aviso" />
            </div>
          )}

          {gravando && progresso && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progresso}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {gravando
              ? "Importando…"
              : resultado?.itens?.length
                ? `Importar ${resultado.itens.length} linhas`
                : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Criar `apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx`**

<!-- prettier-ignore -->
```jsx
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/formatters";
import { aplicarDesconto, resumoOrcamento, validarDesconto } from "@/lib/orcamento-desconto";
import {
  cancelarGravacoesPendentes,
  emLotes,
  ordenarItensOportunidade,
} from "@/lib/orcamento-registros";
import { CAMINHO_SKILL, montarZipSkill, textoSkillValido } from "@/lib/skill-orcamento";
import ImportarPlanilhaOrcamentoDialog from "./ImportarPlanilhaOrcamentoDialog";

const AVISO_APLICAR =
  "Recalcula todos os itens importados a partir do preço da prefeitura; ajustes feitos à mão nesses itens serão substituídos.";

// 12.35 → "12,35" (campo de digitação, sem casas forçadas)
const pctParaCampo = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(n).replace(".", ",") : "0";
};
// 12.3 → "12,30" (exibição)
const formatPct = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Barra da aba Orçamento da oportunidade (licitação): Baixar modelo, Skill do
 * Claude, Importar planilha, Desconto (%) + Aplicar e o resumo dos totais.
 *
 * Autocontida: grava direto pelo sigo.entities e atualiza o estado pelos
 * setters recebidos (o CalendarioConsolidado passa callbacks vazios para as
 * ações antigas do OportunidadeDetalhe; esta barra não depende delas).
 * `importarAberto`/`onImportarAbertoChange` são opcionais: o
 * OportunidadeDetalhe os passa para o card "Importar" do estado vazio abrir o
 * mesmo diálogo; sem eles a barra usa estado próprio.
 */
export default function OrcamentoLicitacaoBarra({
  selectedOp,
  setSelectedOp,
  setOportunidades,
  orcamentoItens,
  setOrcamentoItens,
  empresaAtiva,
  updateTimeoutRef,
  podeEditar,
  importarAberto,
  onImportarAbertoChange,
}) {
  const [importarInterno, setImportarInterno] = useState(false);
  const dialogoAberto = importarAberto ?? importarInterno;
  const mudarDialogo = onImportarAbertoChange ?? setImportarInterno;

  const opId = selectedOp?.id;
  const pctSalvo = selectedOp?.desconto_proposta_pct ?? 0;
  const [desconto, setDesconto] = useState(() => pctParaCampo(pctSalvo));
  useEffect(() => {
    setDesconto(pctParaCampo(pctSalvo));
  }, [opId, pctSalvo]);

  const [aplicando, setAplicando] = useState(false);
  const [baixandoSkill, setBaixandoSkill] = useState(false);

  const resumo = useMemo(() => resumoOrcamento(orcamentoItens || []), [orcamentoItens]);
  const qtdSemReferencia = resumo.itensSemReferencia;

  const atualizarOportunidadeLocal = (patch) => {
    setSelectedOp?.((prev) => (prev?.id === opId ? { ...prev, ...patch } : prev));
    setOportunidades?.((prev) => prev.map((o) => (o.id === opId ? { ...o, ...patch } : o)));
  };

  const recarregarItens = async () => {
    try {
      const lista = await sigo.entities.OrcamentoItem.filter({
        empresa_id: empresaAtiva.id,
        oportunidade_id: opId,
      });
      setOrcamentoItens(ordenarItensOportunidade(lista));
    } catch (e) {
      console.error("Erro ao recarregar o orçamento:", e);
    }
  };

  const handleBaixarModelo = async () => {
    try {
      const [XLSX, { gerarModelo }] = await Promise.all([
        import("xlsx"),
        import("@/lib/orcamento-modelo"),
      ]);
      XLSX.writeFile(gerarModelo(), "Modelo de orcamento SIGO.xlsx");
    } catch (e) {
      console.error("Erro ao gerar o modelo:", e);
      toast.error(`Erro ao gerar o modelo: ${e?.message || "erro desconhecido"}`);
    }
  };

  const handleBaixarSkill = async () => {
    setBaixandoSkill(true);
    try {
      const resp = await fetch(CAMINHO_SKILL, { cache: "no-cache" });
      const texto = resp.ok ? await resp.text() : "";
      // o .htaccess devolve o index.html com 200 quando o arquivo não existe
      if (!textoSkillValido(texto)) throw new Error("arquivo da skill não encontrado no site");
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import("jszip"),
        import("file-saver"),
      ]);
      const blob = await montarZipSkill(JSZip, texto);
      saveAs(blob, "orcamento-prefeitura-sigo.zip");
      toast.success(
        "Skill baixada. Para instalar: Claude → Configurações → Capacidades → Skills → Enviar (escolha o .zip).",
        { duration: 12000 }
      );
    } catch (e) {
      console.error("Erro ao baixar a skill:", e);
      toast.error(`Erro ao baixar a skill: ${e?.message || "erro desconhecido"}`);
    } finally {
      setBaixandoSkill(false);
    }
  };

  const handleAplicar = async () => {
    if (!opId || !empresaAtiva?.id) return;
    // Edição por campo ainda no debounce de 1,5 s (ou gravando: a chave só sai do mapa depois do
    // await). Cancelar o timer perderia a edição, e o desconto recalculado a partir do estado
    // local deixaria o banco com a quantidade antiga e o total novo. Espera gravar e aplica de novo.
    if (Object.keys(updateTimeoutRef?.current || {}).length > 0) {
      toast.info("Aguarde a gravação da última edição e aplique de novo");
      return;
    }
    const validacao = validarDesconto(desconto);
    if (!validacao.ok) {
      toast.error(validacao.erro);
      return;
    }
    const pct = validacao.valor; // number de 0 a 99,99, o que o aplicarDesconto exige
    let alteracoes;
    try {
      alteracoes = aplicarDesconto(orcamentoItens || [], pct);
    } catch (e) {
      // preço de referência inválido (ex.: negativo) em algum item: nada foi gravado
      console.error("Erro ao calcular o desconto:", e);
      toast.error(`Nada foi alterado: ${e?.message || "erro ao calcular o desconto"}`);
      return;
    }
    if (alteracoes.length > 0 && !window.confirm(AVISO_APLICAR)) return;

    cancelarGravacoesPendentes(updateTimeoutRef);
    setAplicando(true);
    const idToast = toast.loading("Aplicando o desconto…");
    try {
      let feitos = 0;
      for (const lote of emLotes(alteracoes, 10)) {
        await Promise.all(
          lote.map((a) =>
            sigo.entities.OrcamentoItem.update(a.id, {
              valor_unitario: a.valor_unitario,
              valor_total: a.valor_total,
            })
          )
        );
        feitos += lote.length;
        toast.loading(`Aplicando o desconto… ${feitos} de ${alteracoes.length}`, { id: idToast });
      }
      const porId = new Map(alteracoes.map((a) => [a.id, a]));
      setOrcamentoItens((prev) =>
        prev.map((i) => {
          const a = porId.get(i.id);
          return a ? { ...i, valor_unitario: a.valor_unitario, valor_total: a.valor_total } : i;
        })
      );
      const patch = { desconto_proposta_pct: pct };
      await sigo.entities.Oportunidade.update(opId, patch);
      atualizarOportunidadeLocal(patch);
      toast.success(
        alteracoes.length > 0
          ? `Desconto de ${formatPct(pct)}% aplicado em ${alteracoes.length} itens`
          : `Desconto de ${formatPct(pct)}% gravado; nenhum item tem preço de referência`,
        { id: idToast }
      );
    } catch (e) {
      console.error("Erro ao aplicar o desconto:", e);
      toast.error(`Erro ao aplicar o desconto: ${e?.message || "erro desconhecido"}`, {
        id: idToast,
      });
      await recarregarItens();
    } finally {
      setAplicando(false);
    }
  };

  // Depois da importação (ou da recarga, se ela falhou no meio)
  const handleImportado = (itensGravados, orcamentoInfo) => {
    setOrcamentoItens(itensGravados);
    if (orcamentoInfo) atualizarOportunidadeLocal({ orcamento_info: orcamentoInfo });
  };

  const temItens = (orcamentoItens || []).length > 0;

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBaixarModelo}>
            <Download className="w-4 h-4" />
            Baixar modelo
          </Button>
          <Button variant="outline" size="sm" onClick={handleBaixarSkill} disabled={baixandoSkill}>
            {baixandoSkill ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Skill do Claude
          </Button>
          {podeEditar && (
            <Button size="sm" onClick={() => mudarDialogo(true)} disabled={aplicando}>
              <Upload className="w-4 h-4" />
              Importar planilha
            </Button>
          )}
          {/* Exportar proposta: botão e diálogo entram aqui (Task 9) */}
        </div>
        {podeEditar && (
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="desconto-proposta" className="text-xs text-slate-600">
                Desconto (%)
              </Label>
              <Input
                id="desconto-proposta"
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAplicar();
                }}
                disabled={aplicando}
                className="mt-1 h-9 w-24 bg-white"
              />
            </div>
            <Button size="sm" className="h-9" onClick={handleAplicar} disabled={aplicando}>
              {aplicando ? "Aplicando…" : "Aplicar"}
            </Button>
          </div>
        )}
      </div>

      {temItens && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
          <span>
            {"Total de referência: "}
            <strong>{formatBRL(resumo.totalReferencia)}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {"Total da proposta: "}
            <strong className="text-green-700">{formatBRL(resumo.totalProposta)}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {"Desconto real: "}
            <strong>{formatPct(resumo.descontoReal)}%</strong>
          </span>
          {qtdSemReferencia > 0 && (
            <span className="w-full text-amber-700">
              {qtdSemReferencia === 1
                ? "1 item sem preço de referência não recebe o desconto"
                : `${qtdSemReferencia} itens sem preço de referência não recebem o desconto`}
            </span>
          )}
        </div>
      )}

      {podeEditar && (
        <ImportarPlanilhaOrcamentoDialog
          open={dialogoAberto}
          onOpenChange={mudarDialogo}
          selectedOp={selectedOp}
          empresaAtiva={empresaAtiva}
          orcamentoItens={orcamentoItens}
          updateTimeoutRef={updateTimeoutRef}
          onImportado={handleImportado}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lint dos dois componentes novos**

```bash
cd apps/web && npx eslint src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx src/components/oportunidades/OrcamentoLicitacaoBarra.jsx; echo "exit $?"
```

Expected: nenhuma saída e `exit 0` (nem avisos).

- [ ] **Step 5: Ligar no `OportunidadeDetalhe.jsx` (8 trocas old→new com a ferramenta Edit)**

Aplique cada troca com a ferramenta **Edit** (não com `sed`/script): o arquivo e as âncoras estão em LF (`.gitattributes` com `eol=lf`) e o Edit só troca o que casar exatamente. Cada `old` abaixo aparece **uma única vez** no arquivo atual (conferido). Nenhuma âncora contém escape `\u00..`.

5.1 — import do hook de permissão (`:56`)

old:

```jsx
import PermissionGate from "../PermissionGate";
```

new:

```jsx
import PermissionGate, { usePermission } from "../PermissionGate";
```

5.2 — import da barra (`:60`)

old:

```jsx
import PropostasOportunidade from "./PropostasOportunidade";
```

new:

```jsx
import PropostasOportunidade from "./PropostasOportunidade";
import OrcamentoLicitacaoBarra from "./OrcamentoLicitacaoBarra";
```

5.3 — estado do diálogo (`:175`)

old:

<!-- prettier-ignore -->
```jsx
  const [showLerEdital, setShowLerEdital] = useState(false);
```

new:

<!-- prettier-ignore -->
```jsx
  const [showLerEdital, setShowLerEdital] = useState(false);
  // Diálogo "Importar planilha" do orçamento: o estado fica aqui porque a barra
  // do orçamento E o card "Importar" do estado vazio abrem o mesmo diálogo.
  const [importarAberto, setImportarAberto] = useState(false);
```

5.4 — permissão do orçamento (`:180-181`; o `usePermission` usa a sessão real, como o `sessao` logo acima)

old:

<!-- prettier-ignore -->
```jsx
    sessao.perfil === "Admin" || sessao.temPermissao("Oportunidades", "Lista", "editar");
```

new:

<!-- prettier-ignore -->
```jsx
    sessao.perfil === "Admin" || sessao.temPermissao("Oportunidades", "Lista", "editar");
  // Orçamento (barra da licitação e card "Importar"): permissão REAL da sessão,
  // aceitando "Orçamento" (catálogo) e "Orcamento" (grafia antiga do trigger).
  const { can, isAdmin } = usePermission();
  const podeEditarOrcamento =
    isAdmin ||
    can("Oportunidades", "Orçamento", "editar") ||
    can("Oportunidades", "Orcamento", "editar");
```

5.5 — fechar o detalhe fecha o diálogo (`:183-185`)

old:

<!-- prettier-ignore -->
```jsx
  useEffect(() => {
    if (!open) setShowLerEdital(false);
  }, [open]);
```

new:

<!-- prettier-ignore -->
```jsx
  useEffect(() => {
    if (!open) {
      setShowLerEdital(false);
      setImportarAberto(false);
    }
  }, [open]);
```

5.6 — handler do card "Importar" (`:187-190`)

old:

<!-- prettier-ignore -->
```jsx
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set([...prev, tab]));
  };
```

new:

<!-- prettier-ignore -->
```jsx
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set([...prev, tab]));
  };

  // Card "Importar" do estado vazio: abre o diálogo da planilha (modelo SIGO)
  // da barra do orçamento, no lugar do seletor de CSV antigo.
  const abrirImportacaoPlanilha = () => {
    if (!podeEditarOrcamento) {
      toast.error("Sem permissão para editar o orçamento");
      return;
    }
    setImportarAberto(true);
  };
```

5.7 — a barra logo depois do input oculto do CSV, **fora** de `orcamentoItens.length > 0` (`:788-791`)

old:

```jsx
                          onChange={onImportarOrcamento}
                        />

                        {orcamentoItens.length > 0 && (
```

new:

```jsx
                          onChange={onImportarOrcamento}
                        />

                        <OrcamentoLicitacaoBarra
                          selectedOp={selectedOp}
                          setSelectedOp={setSelectedOp}
                          setOportunidades={setOportunidades}
                          orcamentoItens={orcamentoItens}
                          setOrcamentoItens={setOrcamentoItens}
                          empresaAtiva={empresaAtiva}
                          updateTimeoutRef={updateTimeoutRef}
                          podeEditar={podeEditarOrcamento}
                          importarAberto={importarAberto}
                          onImportarAbertoChange={setImportarAberto}
                        />

                        {orcamentoItens.length > 0 && (
```

5.8 — o card "Importar" do estado vazio abre o diálogo novo (`:934`)

old:

```jsx
                                  onClick={() => onNovoOrcamentoSelect(tipo)}
```

new:

```jsx
                                  onClick={() =>
                                    tipo === "importar"
                                      ? abrirImportacaoPlanilha()
                                      : onNovoOrcamentoSelect(tipo)
                                  }
```

Confira:

```bash
cd apps/web && grep -c "OrcamentoLicitacaoBarra\|abrirImportacaoPlanilha\|podeEditarOrcamento\|setImportarAberto" src/components/oportunidades/OportunidadeDetalhe.jsx
```

Expected: `11` (as linhas do import da barra, do `useState`, de `podeEditarOrcamento =`, de `setImportarAberto(false)`, de `abrirImportacaoPlanilha = `, de `if (!podeEditarOrcamento)`, de `setImportarAberto(true)`, de `<OrcamentoLicitacaoBarra`, de `podeEditar={podeEditarOrcamento}`, de `onImportarAbertoChange={setImportarAberto}` e de `? abrirImportacaoPlanilha()`).

- [ ] **Step 6: Lint e build**

```bash
cd apps/web && npx eslint src/components/oportunidades --quiet; echo "exit $?"
npx eslint src/components/oportunidades/OportunidadeDetalhe.jsx
npm run build > /dev/null && echo BUILD_OK
```

Expected:

- 1º comando: nenhuma saída e `exit 0`;
- 2º comando: só o aviso antigo `'cronogramaEtapas' is defined but never used` (`0 errors, 1 warning`);
- 3º comando: `BUILD_OK` (neste PC leva uns 5 minutos). O `xlsx`, o `orcamento-modelo`, o `jszip` e o `file-saver` saem em chunks próprios, carregados só no clique.

- [ ] **Step 7: Suíte e formatação**

```bash
cd apps/web && npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx
```

Expected: a suíte igual ao fim da Task 4 (esta task não acrescenta teste), toda passando; Prettier `All matched files use Prettier code style!`.

Não teste Importar/Aplicar no `npm run dev` antes da Task 12: o dev aponta para o Supabase de produção, e sem a 0127 as colunas novas não existem (PGRST204). "Baixar modelo" e "Skill do Claude" não gravam nada e podem ser clicados no dev, se quiser (a skill só baixa depois que a Task 3 criou o `public/skills/.../SKILL.md`).

- [ ] **Step 8: Commit (só os 3 caminhos da task)**

```bash
git status --short
git add apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx
git commit -F - -- apps/web/src/components/oportunidades/ImportarPlanilhaOrcamentoDialog.jsx apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx <<'EOF'
feat(oportunidades): barra do orçamento com modelo, skill do Claude, importação e desconto

- OrcamentoLicitacaoBarra: Baixar modelo (.xlsx do SIGO), Skill do Claude (.zip montado no
  navegador), Importar planilha, Desconto (%) com Aplicar (confirmação e lotes de 10) e o
  resumo: total de referência, total da proposta, desconto real e itens sem referência
- ImportarPlanilhaOrcamentoDialog: prévia com totais, erros e avisos; substitui os itens
  (deleteMany + bulkCreate em lotes de 200) com o desconto atual e grava orcamento_info
- OportunidadeDetalhe: barra fora da condição de itens (serve para a primeira importação) e
  card "Importar" do estado vazio abrindo o diálogo novo; permissão aceita Orçamento e
  Orcamento
- importar e aplicar cancelam as gravações por campo pendentes antes de gravar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `3 files changed`, só esses três caminhos.

---

## Parte C — Task 6: tabela do orçamento da oportunidade

### Task 6: Tabela do orçamento da oportunidade (Nº, etapas, total arredondado, templates)

**Files:**

- Create: `apps/web/src/lib/orcamento-template.js`
- Test: `apps/web/src/lib/orcamento-template.test.js`
- Modify: `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx` (números **depois da Task 5**: import `:7`; `handleUpdateItem` `:326`; constantes depois de `textoDiasAlerta` `:456`; trigger da aba `:640`; filtro de tipo `:842-857`; `PermissionGate` `:860-864` e `:918-922`; as 5 expressões do filtro `:1018`, `:1024`, `:1032`, `:1077` e `:1429`; linha da tabela `:1081-1103`; as 4 fórmulas `:1281-1375`). Outras sessões podem deslocar as linhas: use sempre o texto das âncoras.
- Modify: `apps/web/src/pages/Oportunidades.jsx` (import `:8`; `loadOrcamentoData` `:553`; importação CSV `:1178`; Novo item `:1222-1225`; Aplicar Template `:1255-1269`; `RelatoriosOrcamento` `:1853-1855`)

**Interfaces:**

- Consumes (Task 1, `@/lib/orcamento-desconto`):
  - `totalLinhaLegado({ quantidade, valor_unitario, bdi, imposto }): number` — sem BDI e sem imposto, é `totalLinha(q, u) ?? 0`;
  - `subtotaisEtapas(itens): Record<string, number>` — chave = `numero` da etapa, valor em **reais** (a soma é feita em centavos).
- Consumes (Task 4, `@/lib/orcamento-registros`): `rotuloItem(item, indice): string`, `proximaOrdem(itens): number`, `semEtapas(itens): ItemOrc[]`.
- Consumes (Task 5): o `OportunidadeDetalhe.jsx` já tem a barra (`<OrcamentoLicitacaoBarra`), `usePermission`, `podeEditarOrcamento` e `abrirImportacaoPlanilha`. Nenhuma âncora desta task toca nessas linhas.
- Produces (`apps/web/src/lib/orcamento-template.js`, export nomeado): `montarRegistroTemplate(item, indice, dono): object`. Converte um item salvo em template de orçamento (`campos_padrao`, que guarda a linha inteira) em registro de `orcamento_item`, com as 17 chaves sempre presentes. `dono` = `{ empresa_id, oportunidade_id }` ou `{ empresa_id, projeto_id }`. A Task 11 usa a mesma função no Projeto.

**Decisões desta task (o contrato não cobria):**

- **Filtro efetivo.** Com orçamento numerado, o filtro de tipo some **e** passa a valer "Todos": `filtroTipoEfetivo = orcamentoNumerado ? "all" : filtroTipoOrcamento`. Sem isso, um filtro "Material" escolhido antes da importação esconderia os itens importados, que têm tipo nulo, e não haveria como desfazer.
- **Linha de etapa.** Colunas: 1ª vazia (sem checkbox, porque a etapa não tem inputs), Nº, a descrição com `colSpan={7}` (de Descrição a Imp. %), o subtotal em Vlr Total e a lixeira. Total: 1 + 1 + 7 + 1 + 1 = 11 colunas, como o cabeçalho. O "selecionar todos" continua marcando as etapas, e assim "selecionar todos + Excluir" limpa o orçamento inteiro.
- **Template.** O "salvar" já grava a linha inteira (`JSON.stringify(orcamentoItens)`). Só o "aplicar" muda, e passa a usar `montarRegistroTemplate`:
  - item antigo: o mapeamento de hoje, mais as 4 colunas novas nulas;
  - item importado: mantém `numero`, `fonte`, `valor_unitario_ref` e o tipo nulo;
  - etapa: fica sem unidade, quantidade e valores, como na importação.
- **Observação (conferência M4; sem mudança de código).** A troca 7.3 (e o import de `totalLinhaLegado` da 7.1) põe o arredondamento na importação CSV antiga do `Oportunidades.jsx`, e a Task 9 apaga esse handler inteiro (trocas 5.5 e 5.6). É um passo que se desfaz depois, mas cada commit fica coerente e as contagens de `grep` abaixo foram conferidas nesse estado intermediário.
- **Observação (conferência das contas estritas da Task 1, 01/10; sem mudança de código).** O `totalLinhaLegado` usa o mesmo `paraNumero` estrito do `totalLinha`: texto como `"1,5"`, `"12abc"` ou `"1e3"` conta como vazio (0), em vez de ser lido pelo prefixo. Nesta task isso não aparece: o `onChange` converte com `parseFloat(e.target.value) || 0` (number); no `handleUpdateItem`, `qtd`, `vlrUnit`, `bdi` e `imp` são `parseFloat(...) || 0` ou o valor do item; e a importação CSV usa `parseFloat(...) || 0`. O que o `handleUpdateItem` guarda no estado (`{ ...item, [field]: value }`) é o texto do `<input type="number">`, que usa ponto, nunca vírgula (`"125.5"`, `".5"`, `""`), e o `paraNumero` lê. Resta uma única diferença: se alguém digitar um expoente à mão (`1e3`) num campo numérico, o texto fica no estado e a linha vale 0 no `totalLinhaLegado` até o campo ser digitado de novo; antes o JS multiplicava `"1e3"` como 1000. Se isso incomodar, a saída é converter no `handleUpdateItem` como o `OrcamentoTab` já faz (`processedValue = parseFloat(value) || 0`), o que fica fora do escopo.

- [ ] **Step 1: Linha de base**

Na raiz do repositório (`C:\Users\javer\sigoobras-base`):

```bash
git status --short
cd apps/web && npx vitest run 2>&1 | tail -4
npx eslint src/components/oportunidades/OportunidadeDetalhe.jsx src/pages/Oportunidades.jsx 2>&1 | tail -2
```

Anote o número de arquivos e de testes da suíte e o total do ESLint. Em 29/09, antes do plano, o ESLint dava `✖ 9 problems (0 errors, 9 warnings)`: 1 aviso antigo no `OportunidadeDetalhe` (`cronogramaEtapas`) e 8 no `Oportunidades`. Outras sessões mexem no repositório: **não** use `git add -A`.

- [ ] **Step 2: Escrever o teste que falha**

Crie `apps/web/src/lib/orcamento-template.test.js`:

```js
import { describe, it, expect } from "vitest";
import { montarRegistroTemplate } from "./orcamento-template";

const DONO_OP = { empresa_id: "emp-1", oportunidade_id: "op-1" };
const DONO_PROJ = { empresa_id: "emp-1", projeto_id: "proj-1" };

// Linhas como ficam salvas no template (linha inteira do orcamento_item)
const ETAPA = {
  id: "e1",
  numero: "1",
  etapa: true,
  tipo: null,
  descricao: "SERVIÇOS PRELIMINARES",
  codigo: null,
  fonte: null,
  unidade: null,
  quantidade: null,
  valor_unitario_ref: null,
  valor_unitario: null,
  bdi: 0,
  imposto: 0,
  valor_total: null,
  ordem: 0,
};
const IMPORTADO = {
  id: "i1",
  numero: "1.10",
  etapa: false,
  tipo: null,
  descricao: "Escavação manual de vala",
  codigo: "93358",
  fonte: "SINAPI",
  unidade: "m³",
  quantidade: 125.5,
  valor_unitario_ref: 10.48,
  valor_unitario: 9.18,
  bdi: 0,
  imposto: 0,
  valor_total: 1152.09,
  ordem: 12,
};

describe("montarRegistroTemplate", () => {
  it("item antigo (sem numero/etapa): o mapeamento de antes, com as colunas novas nulas", () => {
    const salvo = {
      id: "velho-id",
      empresa_id: "outra-empresa",
      oportunidade_id: "outra-op",
      item: "7",
      tipo: "Mão de Obra",
      descricao: "Eletricista",
      codigo: "MO1",
      unidade: "h",
      quantidade: 8,
      valor_unitario: 50,
      bdi: 25,
      imposto: 0,
      valor_total: 500,
      ordem: 3,
    };
    expect(montarRegistroTemplate(salvo, 2, DONO_OP)).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
      item: "3",
      numero: null,
      etapa: false,
      tipo: "Mão de Obra",
      descricao: "Eletricista",
      codigo: "MO1",
      fonte: null,
      unidade: "h",
      quantidade: 8,
      valor_unitario_ref: null,
      valor_unitario: 50,
      bdi: 25,
      imposto: 0,
      valor_total: 500,
      ordem: 2,
    });
  });

  it("item antigo vazio: tipo Material, unidade UN e zeros, como antes", () => {
    expect(montarRegistroTemplate({ descricao: null }, 0, DONO_PROJ)).toEqual({
      empresa_id: "emp-1",
      projeto_id: "proj-1",
      item: "1",
      numero: null,
      etapa: false,
      tipo: "Material",
      descricao: "",
      codigo: "",
      fonte: null,
      unidade: "UN",
      quantidade: 0,
      valor_unitario_ref: null,
      valor_unitario: 0,
      bdi: 0,
      imposto: 0,
      valor_total: 0,
      ordem: 0,
    });
  });

  it("etapa: número e título, sem unidade, quantidade nem valores (como na importação)", () => {
    expect(montarRegistroTemplate(ETAPA, 0, DONO_OP)).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
      item: "1",
      numero: "1",
      etapa: true,
      tipo: null,
      descricao: "SERVIÇOS PRELIMINARES",
      codigo: "",
      fonte: null,
      unidade: null,
      quantidade: null,
      valor_unitario_ref: null,
      valor_unitario: null,
      bdi: 0,
      imposto: 0,
      valor_total: null,
      ordem: 0,
    });
  });

  it("item importado: leva numero, fonte e preço de referência; o tipo continua nulo", () => {
    expect(montarRegistroTemplate(IMPORTADO, 5, DONO_PROJ)).toEqual({
      empresa_id: "emp-1",
      projeto_id: "proj-1",
      item: "1.10",
      numero: "1.10",
      etapa: false,
      tipo: null,
      descricao: "Escavação manual de vala",
      codigo: "93358",
      fonte: "SINAPI",
      unidade: "m³",
      quantidade: 125.5,
      valor_unitario_ref: 10.48,
      valor_unitario: 9.18,
      bdi: 0,
      imposto: 0,
      valor_total: 1152.09,
      ordem: 5,
    });
  });

  it("todos os registros têm as mesmas 17 chaves e nada da linha salva vaza", () => {
    const salvos = [
      ETAPA,
      IMPORTADO,
      {},
      { id: "x", created_by: "u", deleted_at: null, projeto_id: "velho", material_id: "m" },
    ];
    const regs = salvos.map((s, i) => montarRegistroTemplate(s, i, DONO_OP));
    const chaves = Object.keys(regs[0]).sort();
    expect(chaves).toHaveLength(17);
    for (const r of regs) expect(Object.keys(r).sort()).toEqual(chaves);
    for (const campo of ["id", "created_by", "deleted_at", "projeto_id", "material_id"]) {
      expect(regs[3]).not.toHaveProperty(campo);
    }
    expect(regs.map((r) => r.ordem)).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/web && npx vitest run src/lib/orcamento-template.test.js
```

Expected: FAIL, porque o módulo ainda não existe (saída conferida com o Vitest 3.2.6 do repositório):

```
FAIL  src/lib/orcamento-template.test.js
Caused by: Error: Failed to load url ./orcamento-template (resolved id: ./orcamento-template) in .../apps/web/src/lib/orcamento-template.test.js. Does the file exist?
Test Files  1 failed (1)
     Tests  no tests
```

- [ ] **Step 4: Implementar `apps/web/src/lib/orcamento-template.js`**

Crie `apps/web/src/lib/orcamento-template.js`:

```js
/**
 * "Aplicar Template" do orçamento (oportunidade e projeto): converte um item
 * salvo no template (TemplateOportunidade/TemplateProjeto.campos_padrao, que
 * guarda a linha inteira do orcamento_item) no registro a gravar.
 *
 * - Item antigo (sem `numero`/`etapa`): o mapeamento de sempre (tipo "Material"
 *   e unidade "UN" por padrão, números nulos viram 0), com as colunas novas nulas.
 * - Orçamento importado da planilha da prefeitura: leva `numero`, `etapa`,
 *   `fonte` e `valor_unitario_ref`; o item mantém o tipo nulo e a etapa fica sem
 *   unidade, quantidade e valores, como na importação.
 *
 * Todas as chaves vão em todos os registros (o insert em lote grava NULL na
 * chave ausente). Nada da linha salva vaza (id, created_by, deleted_at, dono antigo).
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md (§11).
 */
import { rotuloItem } from "./orcamento-registros";

/**
 * @param {object} item linha salva no template
 * @param {number} indice posição na lista do template (vira `ordem`)
 * @param {object} dono { empresa_id, oportunidade_id } ou { empresa_id, projeto_id }
 */
export function montarRegistroTemplate(item, indice, dono) {
  const etapa = item.etapa === true;
  const numero = item.numero || null;
  return {
    ...dono,
    item: rotuloItem({ numero }, indice),
    numero,
    etapa,
    tipo: item.tipo || (numero ? null : "Material"),
    descricao: item.descricao || "",
    codigo: item.codigo || "",
    fonte: item.fonte || null,
    unidade: etapa ? null : item.unidade || "UN",
    quantidade: etapa ? null : item.quantidade || 0,
    valor_unitario_ref: etapa ? null : (item.valor_unitario_ref ?? null),
    valor_unitario: etapa ? null : item.valor_unitario || 0,
    bdi: item.bdi || 0,
    imposto: item.imposto || 0,
    valor_total: etapa ? null : item.valor_total || 0,
    ordem: indice,
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/web && npx vitest run src/lib/orcamento-template.test.js
```

Expected:

```
✓ src/lib/orcamento-template.test.js (5 tests)
Test Files  1 passed (1)
     Tests  5 passed (5)
```

- [ ] **Step 6: Editar `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx` (16 trocas old→new com a ferramenta Edit)**

Aplique cada troca com a ferramenta **Edit**, e não com `sed` nem com script: o arquivo e as âncoras abaixo estão em LF (`.gitattributes` com `eol=lf`), e o Edit só troca o que casar exatamente. Cada `old` aparece **uma única vez** no arquivo depois da Task 5, exceto nas trocas 6.8 e 6.9, que usam `replace_all: true`.

**Atenção às âncoras 6.5, 6.6 e 6.7:** elas contêm o texto **literal** `\u00e3`/`\u00e7`, com a barra invertida, como está no arquivo hoje (é esse o erro herdado). Copie a barra como está.

6.1 — imports (`:7`)

old:

```jsx
import { analisarAtende } from "@/lib/edital-ia";
```

new:

```jsx
import { analisarAtende } from "@/lib/edital-ia";
import { subtotaisEtapas, totalLinhaLegado } from "@/lib/orcamento-desconto";
import { rotuloItem } from "@/lib/orcamento-registros";
```

6.2 — total da linha na edição por campo (`handleUpdateItem`, `:326`)

old:

<!-- prettier-ignore -->
```jsx
      updatedData.valor_total = qtd * vlrUnit * (1 + bdi / 100) * (1 + imp / 100);
```

new:

<!-- prettier-ignore -->
```jsx
      updatedData.valor_total = totalLinhaLegado({
        quantidade: qtd,
        valor_unitario: vlrUnit,
        bdi,
        imposto: imp,
      });
```

6.3 — constantes da aba Orçamento, depois do `if (!open) return null;`, porque não são hooks (`:456`)

old:

```jsx
      : String(diasAlerta[0]);

  return (
```

new:

```jsx
      : String(diasAlerta[0]);

  // Aba Orçamento: com orçamento importado (itens com `numero`), o filtro de tipo
  // some e vale "Todos" (item importado tem tipo nulo), e cada etapa mostra o
  // subtotal dos seus itens.
  const orcamentoNumerado = (orcamentoItens || []).some((i) => i.numero);
  const filtroTipoEfetivo = orcamentoNumerado ? "all" : filtroTipoOrcamento;
  const subtotalPorEtapa = orcamentoNumerado ? subtotaisEtapas(orcamentoItens) : {};

  return (
```

6.4 — trigger da aba: aceita as duas grafias (`:640`)

old:

```jsx
                      {(perfil === "Admin" || temPermissao("Oportunidades", "Orcamento")) && (
```

new:

```jsx
                      {(perfil === "Admin" ||
                        temPermissao("Oportunidades", "Orçamento") ||
                        temPermissao("Oportunidades", "Orcamento")) && (
```

6.5 — filtro de tipo escondido no orçamento numerado, com `value` como expressão JS (`:842-857`)

old:

<!-- prettier-ignore -->
```jsx
                              <Select
                                value={filtroTipoOrcamento}
                                onValueChange={setFiltroTipoOrcamento}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Todos</SelectItem>
                                  <SelectItem value="Material">Material</SelectItem>
                                  <SelectItem value="M\u00e3o de Obra">
                                    {"M\u00e3o de Obra"}
                                  </SelectItem>
                                  <SelectItem value="Ferramental">Ferramental</SelectItem>
                                </SelectContent>
                              </Select>
```

new:

<!-- prettier-ignore -->
```jsx
                              {!orcamentoNumerado && (
                                <Select
                                  value={filtroTipoOrcamento}
                                  onValueChange={setFiltroTipoOrcamento}
                                >
                                  <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Tipo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="Material">Material</SelectItem>
                                    <SelectItem value={"Mão de Obra"}>Mão de Obra</SelectItem>
                                    <SelectItem value="Ferramental">Ferramental</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
```

6.6 — `aba` do dropdown "Ações" como expressão JS (`:860-864`)

old:

```jsx
                              <PermissionGate
                                modulo="Oportunidades"
                                aba="Or\u00e7amento"
                                funcao="editar"
                              >
```

new:

```jsx
                              <PermissionGate
                                modulo="Oportunidades"
                                aba={"Orçamento"}
                                funcao="editar"
                              >
```

6.7 — `aba` do botão "Relatórios" como expressão JS (`:918-922`)

old:

```jsx
                              <PermissionGate
                                modulo="Oportunidades"
                                aba="Or\u00e7amento"
                                funcao="gerar_pdf"
                              >
```

new:

```jsx
                              <PermissionGate
                                modulo="Oportunidades"
                                aba={"Orçamento"}
                                funcao="gerar_pdf"
                              >
```

6.8 — as 5 expressões do filtro usam o filtro efetivo, 1ª parte (**replace_all: true**; 5 ocorrências: checkbox do cabeçalho ×3, corpo e rodapé)

old:

```jsx
filtroTipoOrcamento === "all" ||
```

new:

```jsx
filtroTipoEfetivo === "all" ||
```

6.9 — as mesmas 5 expressões, 2ª parte (**replace_all: true**; 5 ocorrências: `i.tipo` ×4 e `item.tipo` ×1)

old:

```jsx
.tipo === filtroTipoOrcamento
```

new:

```jsx
.tipo === filtroTipoEfetivo
```

6.10 — o filtro do corpo da tabela cabe numa linha agora (`:1076-1078`; o Prettier junta, e sem isso o `--check` falha)

old:

<!-- prettier-ignore -->
```jsx
                                    (item) =>
                                      filtroTipoEfetivo === "all" ||
                                      item.tipo === filtroTipoEfetivo
```

new:

<!-- prettier-ignore -->
```jsx
                                    (item) =>
                                      filtroTipoEfetivo === "all" || item.tipo === filtroTipoEfetivo
```

6.11 — linha de etapa: novo ramo no começo do `.map` da tabela (`:1081-1089`)

old:

```jsx
                                    const podeEditar =
                                      perfil === "Admin" ||
                                      !item.created_by ||
                                      item.created_by === user?.email;
                                    return (
                                      <tr
                                        key={item.id}
                                        className={`border-b hover:bg-slate-50 ${itensSelecionados.has(item.id) ? "bg-amber-50" : ""}`}
                                      >
```

new:

```jsx
                                    const podeEditar =
                                      perfil === "Admin" ||
                                      !item.created_by ||
                                      item.created_by === user?.email;
                                    // Etapa (título do orçamento importado): número, descrição,
                                    // subtotal dos itens e lixeira, sem inputs. 11 colunas, como o
                                    // cabeçalho: a descrição ocupa de Descrição a Imp. %.
                                    if (item.etapa) {
                                      return (
                                        <tr
                                          key={item.id}
                                          className="border-b bg-slate-100 font-semibold"
                                        >
                                          <td className="px-3 py-2"></td>
                                          <td className="px-3 py-2 text-center text-xs text-slate-700">
                                            {rotuloItem(item, index)}
                                          </td>
                                          <td
                                            colSpan={7}
                                            className="px-3 py-2 text-xs text-slate-800"
                                          >
                                            {item.descricao || ""}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <span className="text-xs text-slate-800 whitespace-nowrap">
                                              {formatCurrency(subtotalPorEtapa[item.numero] ?? 0)}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              title="Excluir etapa"
                                              onClick={() => onDeleteOrcamentoItem(item.id)}
                                              disabled={!podeEditar}
                                            >
                                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                            </Button>
                                          </td>
                                        </tr>
                                      );
                                    }
                                    return (
                                      <tr
                                        key={item.id}
                                        className={`border-b hover:bg-slate-50 ${itensSelecionados.has(item.id) ? "bg-amber-50" : ""}`}
                                      >
```

6.12 — coluna Nº do item (`:1101-1103`)

old:

<!-- prettier-ignore -->
```jsx
                                        <td className="px-3 py-2 text-center text-xs text-slate-500">
                                          {index + 1}
                                        </td>
```

new:

<!-- prettier-ignore -->
```jsx
                                        <td className="px-3 py-2 text-center text-xs text-slate-500">
                                          {rotuloItem(item, index)}
                                        </td>
```

6.13 — total da linha ao digitar a Qtd (`:1281-1289`)

old:

<!-- prettier-ignore -->
```jsx
                                              const u = {
                                                ...item,
                                                quantidade: v,
                                                valor_total:
                                                  v *
                                                  (item.valor_unitario || 0) *
                                                  (1 + (item.bdi || 0) / 100) *
                                                  (1 + (item.imposto || 0) / 100),
                                              };
```

new:

<!-- prettier-ignore -->
```jsx
                                              const u = { ...item, quantidade: v };
                                              u.valor_total = totalLinhaLegado(u);
```

6.14 — total da linha ao digitar o Vlr Unit. (`:1311-1319`)

old:

<!-- prettier-ignore -->
```jsx
                                              const u = {
                                                ...item,
                                                valor_unitario: v,
                                                valor_total:
                                                  (item.quantidade || 0) *
                                                  v *
                                                  (1 + (item.bdi || 0) / 100) *
                                                  (1 + (item.imposto || 0) / 100),
                                              };
```

new:

<!-- prettier-ignore -->
```jsx
                                              const u = { ...item, valor_unitario: v };
                                              u.valor_total = totalLinhaLegado(u);
```

6.15 — total da linha ao digitar o BDI (`:1341-1349`)

old:

<!-- prettier-ignore -->
```jsx
                                              const u = {
                                                ...item,
                                                bdi: v,
                                                valor_total:
                                                  (item.quantidade || 0) *
                                                  (item.valor_unitario || 0) *
                                                  (1 + v / 100) *
                                                  (1 + (item.imposto || 0) / 100),
                                              };
```

new:

<!-- prettier-ignore -->
```jsx
                                              const u = { ...item, bdi: v };
                                              u.valor_total = totalLinhaLegado(u);
```

6.16 — total da linha ao digitar o imposto (`:1367-1375`)

old:

<!-- prettier-ignore -->
```jsx
                                              const u = {
                                                ...item,
                                                imposto: v,
                                                valor_total:
                                                  (item.quantidade || 0) *
                                                  (item.valor_unitario || 0) *
                                                  (1 + (item.bdi || 0) / 100) *
                                                  (1 + v / 100),
                                              };
```

new:

<!-- prettier-ignore -->
```jsx
                                              const u = { ...item, imposto: v };
                                              u.valor_total = totalLinhaLegado(u);
```

Confira (em `apps/web`):

```bash
F=src/components/oportunidades/OportunidadeDetalhe.jsx
grep -c "filtroTipoEfetivo" $F
grep -c "filtroTipoOrcamento" $F
grep -c "totalLinhaLegado" $F
grep -c "rotuloItem" $F
grep -cF -e 'aba="Or\u00e7amento"' -e 'value="M\u00e3o de Obra"' $F
grep -c "(1 + imp / 100)\|(1 + v / 100)" $F
```

Expected, nesta ordem: `10`, `3`, `6`, `3`, `0` e `0`.

- `filtroTipoEfetivo`: 1 linha da definição + 9 linhas de uso (as 5 expressões têm 10 usos; a do corpo da tabela ficou numa linha só, na 6.10).
- `filtroTipoOrcamento`: a prop, a definição do efetivo e o `value` do `Select`.
- `totalLinhaLegado`: import + `handleUpdateItem` + 4 fórmulas.
- `rotuloItem`: import + etapa + item.

- [ ] **Step 7: Editar `apps/web/src/pages/Oportunidades.jsx` (6 trocas old→new com a ferramenta Edit)**

Use a ferramenta **Edit**, como no Step 6. Cada `old` é único no arquivo.

7.1 — imports (`:8`)

old:

```jsx
import { normalizarTexto } from "@/lib/busca";
```

new:

```jsx
import { normalizarTexto } from "@/lib/busca";
import { totalLinhaLegado } from "@/lib/orcamento-desconto";
import { proximaOrdem, rotuloItem, semEtapas } from "@/lib/orcamento-registros";
import { montarRegistroTemplate } from "@/lib/orcamento-template";
```

7.2 — `loadOrcamentoData`: rótulo `item` = `numero` quando existe (`:553`)

old:

```jsx
      .map((item, i) => ({ ...item, item: (i + 1).toString() }));
```

new:

```jsx
      .map((item, i) => ({ ...item, item: rotuloItem(item, i) }));
```

7.3 — importação CSV antiga: total da linha arredondado (`:1178`)

old:

```jsx
              valor_total: qtd * vlr * (1 + bdi / 100) * (1 + imp / 100),
```

new:

```jsx
              valor_total: totalLinhaLegado({
                quantidade: qtd,
                valor_unitario: vlr,
                bdi,
                imposto: imp,
              }),
```

7.4 — "Novo item" vai para o fim da lista (`:1222-1225`)

old:

```jsx
        valor_total: 0,
        ordem: 0,
      });
      loadOrcamentoData(selectedOp.id);
```

new:

```jsx
        valor_total: 0,
        // no fim da lista, e não no meio de um orçamento importado
        ordem: proximaOrdem(orcamentoItens),
      });
      loadOrcamentoData(selectedOp.id);
```

7.5 — "Aplicar Template" leva `numero`, `etapa`, `fonte` e `valor_unitario_ref` (`:1255-1269`)

old:

<!-- prettier-ignore -->
```jsx
        itens.map((item, i) => ({
          empresa_id: empresaAtiva.id,
          oportunidade_id: selectedOp.id,
          item: (i + 1).toString(),
          tipo: item.tipo || "Material",
          descricao: item.descricao || "",
          codigo: item.codigo || "",
          unidade: item.unidade || "UN",
          quantidade: item.quantidade || 0,
          valor_unitario: item.valor_unitario || 0,
          bdi: item.bdi || 0,
          imposto: item.imposto || 0,
          valor_total: item.valor_total || 0,
          ordem: i,
        }))
```

new:

<!-- prettier-ignore -->
```jsx
        itens.map((item, i) =>
          montarRegistroTemplate(item, i, {
            empresa_id: empresaAtiva.id,
            oportunidade_id: selectedOp.id,
          })
        )
```

7.6 — Relatórios do orçamento sem as linhas de etapa (`:1853-1855`)

old:

```jsx
            <RelatoriosOrcamento
              orcamentoItens={orcamentoItens || []}
              nomeOrcamento={selectedOp?.nome || selectedOp?.titulo || ""}
```

new:

```jsx
            <RelatoriosOrcamento
              orcamentoItens={semEtapas(orcamentoItens)}
              nomeOrcamento={selectedOp?.nome || selectedOp?.titulo || ""}
```

Confira (em `apps/web`):

```bash
F=src/pages/Oportunidades.jsx
grep -c "totalLinhaLegado\|proximaOrdem\|rotuloItem\|semEtapas\|montarRegistroTemplate" $F
grep -c "(1 + imp / 100)" $F
```

Expected: `8` e `0`. As 8 linhas são as 3 de import e os usos em 7.2, 7.3, 7.4, 7.5 e 7.6.

- [ ] **Step 8: Lint, build, suíte e formatação**

```bash
cd apps/web && npx eslint src/components/oportunidades/OportunidadeDetalhe.jsx src/pages/Oportunidades.jsx 2>&1 | tail -2
npm run build > /dev/null && echo BUILD_OK
npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/lib/orcamento-template.js apps/web/src/lib/orcamento-template.test.js apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/pages/Oportunidades.jsx
```

Expected:

- **ESLint:** o mesmo total do Step 1 (em 29/09: `✖ 9 problems (0 errors, 9 warnings)`), sem aviso novo;
- **Build:** `BUILD_OK`, que neste PC leva uns 5 minutos;
- **Suíte:** a do Step 1 com **1 arquivo e 5 testes a mais**, toda passando;
- **Prettier:** `All matched files use Prettier code style!`.

Não teste a tabela no `npm run dev` antes da Task 12: o dev aponta para o Supabase de produção, onde as colunas da 0127 ainda não existem. O roteiro da Task 12 cobre etapas, Nº, subtotal e filtro.

- [ ] **Step 9: Commit (só os 4 caminhos da task)**

```bash
git status --short
git add apps/web/src/lib/orcamento-template.js apps/web/src/lib/orcamento-template.test.js apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/pages/Oportunidades.jsx
git commit -F - -- apps/web/src/lib/orcamento-template.js apps/web/src/lib/orcamento-template.test.js apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/pages/Oportunidades.jsx <<'EOF'
feat(oportunidades): etapas, numeração e total arredondado na tabela do orçamento

- coluna Nº mostra o número da planilha (1, 1.1, 1.10); a etapa sai em negrito, só com a
  descrição, o subtotal dos itens e a lixeira
- filtro de tipo some no orçamento importado (item importado tem tipo nulo) e vale "Todos"
- total da linha por totalLinhaLegado (2 casas) nas 5 fórmulas da tabela e no CSV antigo
- loadOrcamentoData: rótulo item = numero; Novo item vai para o fim (proximaOrdem)
- Aplicar Template leva numero, etapa, fonte e preço de referência (lib/orcamento-template,
  que o Projeto também vai usar)
- aba Orçamento aceita "Orçamento" e "Orcamento"; aba/value com escape unicode em atributo
  JSX viram expressão JS (o texto literal com a barra nunca casava)
- Relatórios do orçamento recebem a lista sem as linhas de etapa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `4 files changed`, só esses quatro caminhos.

---

## Parte D — Tasks 7 a 9: dados da proposta, PDF/Excel, exportação e versão

Convenções desta parte:

- Comandos com `cd apps/web` partem da raiz do repositório (`C:\Users\javer\sigoobras-base`); os de `git` e `npx prettier`, da raiz.
- Trocas old→new: aplique com a ferramenta **Edit** (os arquivos estão em LF, pelo `.gitattributes` com `eol=lf`, e o Edit só troca o que casar exatamente). Cada `old` abaixo foi conferido como **único** no arquivo no estado em que as Tasks 5 e 6 o deixam.
- Outras sessões mexem no repositório: nunca `git add -A`; commit só dos caminhos da task.
- O código abaixo foi rodado em 29/09 numa pasta temporária fora do repositório (Vitest 3.2.6 do repo, jspdf 2.5.2, jspdf-autotable 3.8.4, xlsx 0.18.5), com as libs das Tasks 1 e 4 já criadas (a Task 1 ainda sem as correções de 01/10, que não mudam nada do que esta parte usa): 31 testes passando, Prettier sem mudança, ESLint sem aviso novo.

---

### Task 7: CPF e dados da proposta (`lib/cpf.js` e `lib/proposta-orcamento.js`)

**Files:**

- Create: `apps/web/src/lib/cpf.js`
- Create: `apps/web/src/lib/proposta-orcamento.js`
- Test: `apps/web/src/lib/cpf.test.js`
- Test: `apps/web/src/lib/proposta-orcamento.test.js`

**Interfaces:**

- Consumes (Task 1, `./orcamento-desconto`): `subtotaisEtapas(itens): Record<string, number>` (chave = `numero` da etapa, valor em reais, somado em centavos).
- Consumes (Task 4, `./orcamento-registros`): `ordenarItensOportunidade(itens): ItemOrc[]` (a ordem e o rótulo `item` que a tela do orçamento usa).
- Consumes (já existem, puras): `formatarCpfCnpj(valor)` de `./ler-documento` (só importa `./cnpj`) e `formatarTelefone(valor)` de `./telefone`.
- Produces (`apps/web/src/lib/cpf.js`):
  - `validarCpf(cpf: string): boolean` — 11 dígitos, recusa todos iguais, confere os 2 dígitos verificadores; aceita com ou sem máscara; letras invalidam;
  - `formatarCpf(cpf): string` — `000.000.000-00`, **progressiva** (serve de máscara no campo: `"5299"` → `"529.9"`), corta em 11 dígitos, vazio → `""`.
- Produces (`apps/web/src/lib/proposta-orcamento.js`):
  - `valorPorExtenso(valor: number): string` (port de `supabase/functions/_shared/recibo-pdf.ts:50-158`);
  - `nomeArquivoProposta(nomeOportunidade: string, dataISO: string, ext: "pdf"|"xlsx"): string`;
  - `validarRepresentante({ nome, cargo, cpf }): { ok: boolean, erros: string[] }`;
  - `montarDadosProposta({ itens, info, oportunidade, empresa, representante, opcoes: { validadeDias, local, dataISO } }): DadosProposta`, com `DadosProposta = { empresa: { nome, cnpj, endereco, contato }, titulo: "Proposta de preços", orgao, objeto, edital, dataBase, bdi, linhas: LinhaProposta[], totalGeral, totalExtenso, validade, localData, representante: { nome, cargo, cpf } }` e `LinhaProposta = { tipo: "etapa"|"item", numero, codigo, fonte, descricao, unidade, quantidade, valorUnitario, total, nivel }`. Textos da empresa e do representante vêm `""` quando faltam; `orgao`, `objeto`, `edital`, `dataBase` e `bdi` vêm `null`;
  - **extra (não está no contrato; usado na Task 9):** `descricaoVersaoProposta({ descontoPct, descontoReal, qtdItens }): string` → `"Orçamento com desconto de 12,35% (real 12,40%) — 57 itens"`.

**Decisões desta task (o contrato não cobria):**

- **Órgão, objeto e edital** (decisão C3, aceita; ajusta a spec §9 e o contrato, que mandavam usar o nome da oportunidade quando faltasse a informação). Vêm de `orcamento_info`; se faltar, dos campos da licitação que a oportunidade já tem: `orgao` ← `oportunidade.orgao`; `edital` ← `"Edital <licitacao_numero> - Processo <licitacao_processo>"`. O **objeto cai por último no nome da oportunidade**: `objeto` ← `orcamento_info.objeto`, senão `oportunidade.nome` (ou `titulo`, se não houver nome), que é o "nome da oportunidade" da spec §9. Dado que não existe não aparece: sem nada, fica `null` e a linha não sai no PDF/Excel (em vez de repetir o nome da oportunidade três vezes).
- **Ordem das linhas:** a de `ordenarItensOportunidade` (`ordem ?? 0` com desempate por `compararNumeroItem`), a mesma da tela da oportunidade (`loadOrcamentoData`). A função **chama** `ordenarItensOportunidade` em vez de repetir o comparador (a proposta não diverge da tela se a tela mudar); ela devolve lista nova, então não depende de a lista chegar ordenada nem altera a recebida. Um teste compara os números das linhas com `ordenarItensOportunidade(lista).map(i => i.item)`, com a lista invertida e sem `ordem`.
- **Rótulo:** o `item.item` que `ordenarItensOportunidade` já calcula (`numero`, ou a posição), igual à coluna Nº da Task 6 (item incluído à mão sai com a posição).
- **Totais:** `total` do item = `valor_total` gravado (nulo → 0), somado em centavos; `totalGeral` = Σ dos itens (sem etapas), o mesmo número do "Total da proposta" da barra (`resumoOrcamento`).
- **Local/data:** `"<local>, dd de <mês> de aaaa"`, dia com 2 dígitos (como o certificado do EAD), lido do texto `aaaa-mm-dd` sem `new Date` (não cai 1 dia no fuso). Sem local, só a data.
- **BDI:** ganha `%` no fim se não tiver (`"25,00"` → `"25,00%"`).
- **Nome do arquivo:** junta espaços, corta em 120 caracteres e usa `Oportunidade` quando o nome vem vazio.
- **`validarCpf` recusa letras** (`"529.982.247-25a"`): o campo do diálogo e o de Configurações aceitam colagem livre.

- [ ] **Step 1: Linha de base da suíte**

```bash
cd apps/web && npx vitest run 2>&1 | tail -4
```

Anote o número de arquivos e de testes (muda com outras sessões). Todos devem estar passando.

- [ ] **Step 2: Escrever o teste do CPF**

Crie `apps/web/src/lib/cpf.test.js`:

```js
import { describe, expect, it } from "vitest";
import { formatarCpf, validarCpf } from "./cpf";

describe("validarCpf", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
    expect(validarCpf("123.456.789-09")).toBe(true);
    expect(validarCpf(" 529.982.247-25 ")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCpf("529.982.247-15")).toBe(false);
    expect(validarCpf("123.456.789-00")).toBe(false);
  });

  it("recusa todos os dígitos iguais", () => {
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("00000000000")).toBe(false);
  });

  it("recusa tamanho errado, vazio, null e letras", () => {
    expect(validarCpf("5299822472")).toBe(false);
    expect(validarCpf("529982247255")).toBe(false);
    expect(validarCpf("")).toBe(false);
    expect(validarCpf(null)).toBe(false);
    expect(validarCpf(undefined)).toBe(false);
    expect(validarCpf("529.982.247-25a")).toBe(false);
  });
});

describe("formatarCpf", () => {
  it("formata 11 dígitos", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarCpf("529.982.247-25")).toBe("529.982.247-25");
  });

  it("é progressivo enquanto digita", () => {
    expect(formatarCpf("529")).toBe("529");
    expect(formatarCpf("5299")).toBe("529.9");
    expect(formatarCpf("529982")).toBe("529.982");
    expect(formatarCpf("5299822")).toBe("529.982.2");
    expect(formatarCpf("529982247")).toBe("529.982.247");
    expect(formatarCpf("5299822472")).toBe("529.982.247-2");
    // apagar o último dígito de um CPF mascarado volta à máscara parcial
    expect(formatarCpf("529.982.247-")).toBe("529.982.247");
    expect(formatarCpf("529.982.247-2")).toBe("529.982.247-2");
  });

  it("corta em 11 dígitos e trata vazio", () => {
    expect(formatarCpf("5299822472599")).toBe("529.982.247-25");
    expect(formatarCpf("abc")).toBe("");
    expect(formatarCpf("")).toBe("");
    expect(formatarCpf(null)).toBe("");
    expect(formatarCpf(undefined)).toBe("");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/web && npx vitest run src/lib/cpf.test.js
```

Expected: `FAIL  src/lib/cpf.test.js`, com `Error: Failed to load url ./cpf (resolved id: ./cpf) in .../src/lib/cpf.test.js. Does the file exist?`, e `Test Files  1 failed (1)`.

- [ ] **Step 4: Implementar `apps/web/src/lib/cpf.js`**

```js
/**
 * CPF: validação pelos dígitos verificadores e máscara 000.000.000-00.
 * Mesmo estilo de validarCnpj (lib/cnpj.js). Usado no representante legal da
 * empresa (Configurações → Empresa) e no diálogo "Exportar proposta".
 */

function soDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * true se o CPF tem 11 dígitos, não são todos iguais e os dois dígitos
 * verificadores conferem. Aceita com ou sem máscara; letras invalidam.
 */
export function validarCpf(cpf) {
  const texto = String(cpf ?? "").trim();
  if (/[^\d.\-\s]/.test(texto)) return false;
  const d = soDigitos(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  // pesos 10..2 (1º dígito) e 11..2 (2º dígito); resto 10 vira 0
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/**
 * Máscara 000.000.000-00, progressiva (serve para o campo enquanto digita):
 * "5299" → "529.9". Corta em 11 dígitos; vazio/null → "".
 */
export function formatarCpf(cpf) {
  const d = soDigitos(cpf).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/web && npx vitest run src/lib/cpf.test.js
```

Expected: `✓ src/lib/cpf.test.js (7 tests)`, `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

- [ ] **Step 6: Escrever o teste dos dados da proposta**

Casos: os 4 valores por extenso da spec (e mais 9), o nome do arquivo com os caracteres proibidos, o representante, e `montarDadosProposta` com um orçamento importado fora de ordem (etapas `1`, `1.1`, `2`), um item incluído à mão sem `numero`, os fallbacks sem `orcamento_info` e a igualdade da ordem e do rótulo com `ordenarItensOportunidade`. Conta do fixture: 1.1 = 1.152,09 + 438,20 = **1.590,29**; 1 = 1.590,29 + 200,00 = **1.790,29**; 2 = **3.001,50**; total = 1.790,29 + 3.001,50 + 99,99 = **4.891,78**.

Crie `apps/web/src/lib/proposta-orcamento.test.js`:

<!-- prettier-ignore -->
```js
import { describe, expect, it } from "vitest";
import { ordenarItensOportunidade } from "./orcamento-registros";
import {
  descricaoVersaoProposta,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
  valorPorExtenso,
} from "./proposta-orcamento";

// Orçamento importado (fora de ordem de propósito) + 1 item incluído à mão.
// 1.1.2: ref 50,00 com 12,35% → 43,82 (cortado); 10 × 43,82 = 438,20.
const ITENS = [
  { id: "e2", numero: "2", etapa: true, descricao: "Iluminação", ordem: 5 },
  {
    id: "i111",
    numero: "1.1.1",
    etapa: false,
    codigo: "93358",
    fonte: "SINAPI",
    descricao: "Escavação manual",
    unidade: "m³",
    quantidade: 125.5,
    valor_unitario_ref: 10.48,
    valor_unitario: 9.18,
    valor_total: 1152.09,
    ordem: 2,
  },
  { id: "e1", numero: "1", etapa: true, descricao: "Serviços preliminares", ordem: 0 },
  { id: "e11", numero: "1.1", etapa: true, descricao: "Movimento de terra", ordem: 1 },
  {
    id: "i112",
    numero: "1.1.2",
    etapa: false,
    codigo: "93382",
    fonte: "SINAPI",
    descricao: "Reaterro",
    unidade: "m³",
    quantidade: 10,
    valor_unitario_ref: 50,
    valor_unitario: 43.82,
    valor_total: 438.2,
    ordem: 3,
  },
  {
    id: "i12",
    numero: "1.2",
    etapa: false,
    codigo: null,
    fonte: "Próprio",
    descricao: "Placa de obra",
    unidade: "un",
    quantidade: 2,
    valor_unitario_ref: 114.1,
    valor_unitario: 100,
    valor_total: 200,
    ordem: 4,
  },
  {
    id: "i21",
    numero: "2.1",
    etapa: false,
    codigo: "C-01",
    fonte: "SETOP",
    descricao: "Luminária LED 100 W",
    unidade: "un",
    quantidade: 3,
    valor_unitario_ref: 1141.5,
    valor_unitario: 1000.5,
    valor_total: 3001.5,
    ordem: 6,
  },
  {
    id: "m1",
    numero: null,
    etapa: false,
    codigo: "",
    fonte: null,
    descricao: "Item incluído à mão",
    unidade: "un",
    quantidade: 1,
    valor_unitario_ref: null,
    valor_unitario: 99.99,
    valor_total: 99.99,
    ordem: 7,
  },
];

const EMPRESA = {
  razao_social: "Empresa Teste Ltda",
  nome: "Teste",
  cnpj: "11222333000181",
  endereco: "Rua A",
  numero: "100",
  bairro: "Centro",
  cidade: "Araxá",
  estado: "MG",
  cep: "38180000",
  telefone: "34999998888",
  email: "contato@teste.com.br",
};

const INFO = {
  orgao: "Prefeitura Municipal de Itatinga",
  objeto: "Iluminação pública da Praça Central",
  edital: "Pregão Eletrônico 12/2026",
  data_base: "03/2026",
  bdi: "25,00",
  fonte: "SINAPI",
  total_prefeitura: 5000,
  observacoes: null,
};

const OPORTUNIDADE = { id: "op1", nome: "PM Itatinga - LED", orgao: "PM Itatinga" };

function dados(extra = {}) {
  return montarDadosProposta({
    itens: ITENS,
    info: INFO,
    oportunidade: OPORTUNIDADE,
    empresa: EMPRESA,
    representante: { nome: " Fulano de Tal ", cargo: "Sócio-administrador", cpf: "52998224725" },
    opcoes: { validadeDias: 60, local: "Araxá/MG", dataISO: "2026-10-05" },
    ...extra,
  });
}

describe("valorPorExtenso", () => {
  it("casos da spec", () => {
    expect(valorPorExtenso(0.01)).toBe("um centavo");
    expect(valorPorExtenso(1)).toBe("um real");
    expect(valorPorExtenso(1000000.1)).toBe("um milhão de reais e dez centavos");
    expect(valorPorExtenso(2345678.9)).toBe(
      "dois milhões trezentos e quarenta e cinco mil seiscentos e setenta e oito reais e noventa centavos"
    );
  });

  it("outros valores", () => {
    expect(valorPorExtenso(1152.09)).toBe("mil cento e cinquenta e dois reais e nove centavos");
    expect(valorPorExtenso(1100)).toBe("mil e cem reais");
    expect(valorPorExtenso(2500)).toBe("dois mil e quinhentos reais");
    expect(valorPorExtenso(1000000)).toBe("um milhão de reais");
    expect(valorPorExtenso(100)).toBe("cem reais");
    expect(valorPorExtenso(101)).toBe("cento e um reais");
    expect(valorPorExtenso(21.21)).toBe("vinte e um reais e vinte e um centavos");
    expect(valorPorExtenso(0.5)).toBe("cinquenta centavos");
    expect(valorPorExtenso(0)).toBe("zero reais");
  });
});

describe("nomeArquivoProposta", () => {
  it("monta o nome com a data", () => {
    expect(nomeArquivoProposta("PM Itatinga - LED", "2026-09-29", "pdf")).toBe(
      "Proposta - PM Itatinga - LED - 2026-09-29.pdf"
    );
    expect(nomeArquivoProposta("PM Itatinga - LED", "2026-09-29T10:00:00Z", "xlsx")).toBe(
      "Proposta - PM Itatinga - LED - 2026-09-29.xlsx"
    );
  });

  it('troca \\ / : * ? " < > | e controles por "-"', () => {
    expect(nomeArquivoProposta("PM Itatinga: LED/Praça *01*", "2026-09-29", "pdf")).toBe(
      "Proposta - PM Itatinga- LED-Praça -01- - 2026-09-29.pdf"
    );
    expect(nomeArquivoProposta('A\\B"C<D>E|F?G', "2026-09-29", "pdf")).toBe(
      "Proposta - A-B-C-D-E-F-G - 2026-09-29.pdf"
    );
    expect(nomeArquivoProposta("Linha1\nLinha2\t", "2026-09-29", "pdf")).toBe(
      "Proposta - Linha1-Linha2- - 2026-09-29.pdf"
    );
  });

  it("nome vazio vira Oportunidade", () => {
    expect(nomeArquivoProposta("  ", "2026-09-29", "xlsx")).toBe(
      "Proposta - Oportunidade - 2026-09-29.xlsx"
    );
    expect(nomeArquivoProposta(null, "2026-09-29", "pdf")).toBe(
      "Proposta - Oportunidade - 2026-09-29.pdf"
    );
  });
});

describe("validarRepresentante", () => {
  it("nome preenchido e CPF vazio ou válido passam", () => {
    expect(validarRepresentante({ nome: "Fulano", cargo: "", cpf: "" })).toEqual({
      ok: true,
      erros: [],
    });
    expect(validarRepresentante({ nome: "Fulano", cargo: "Sócio", cpf: "529.982.247-25" })).toEqual(
      { ok: true, erros: [] }
    );
  });

  it("nome vazio e CPF inválido dão erro", () => {
    expect(validarRepresentante({ nome: "  ", cargo: "Sócio", cpf: "" })).toEqual({
      ok: false,
      erros: ["Informe o nome do representante legal"],
    });
    expect(validarRepresentante({ nome: "Fulano", cpf: "111.111.111-11" })).toEqual({
      ok: false,
      erros: ["CPF do representante legal inválido"],
    });
    expect(validarRepresentante({ nome: "", cpf: "123" }).erros).toHaveLength(2);
    expect(validarRepresentante(undefined).ok).toBe(false);
  });
});

describe("montarDadosProposta", () => {
  it("linhas: todos os itens, na ordem de `ordem`, com número e nível", () => {
    const d = dados();
    expect(d.linhas.map((l) => l.numero)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.1.2",
      "1.2",
      "2",
      "2.1",
      "8",
    ]);
    expect(d.linhas.map((l) => l.tipo)).toEqual([
      "etapa",
      "etapa",
      "item",
      "item",
      "item",
      "etapa",
      "item",
      "item",
    ]);
    expect(d.linhas.map((l) => l.nivel)).toEqual([1, 2, 3, 3, 2, 1, 2, 1]);
  });

  it("ordem e rótulo são os de ordenarItensOportunidade (a mesma da tela)", () => {
    // lista embaralhada (a ordem inversa) e outra sem `ordem`, só com o desempate pelo número
    const invertidos = [...ITENS].reverse();
    const semOrdem = ITENS.map((i) => ({ ...i, ordem: null }));
    for (const lista of [invertidos, semOrdem]) {
      const { linhas } = dados({ itens: lista });
      expect(linhas.map((l) => l.numero)).toEqual(
        ordenarItensOportunidade(lista).map((i) => i.item)
      );
    }
  });

  it("etapa leva o subtotal; item leva quantidade, unitário e total", () => {
    const d = dados();
    expect(d.linhas[1]).toEqual({
      tipo: "etapa",
      numero: "1.1",
      codigo: null,
      fonte: null,
      descricao: "Movimento de terra",
      nivel: 2,
      unidade: null,
      quantidade: null,
      valorUnitario: null,
      total: 1590.29,
    });
    expect(d.linhas[0].total).toBe(1790.29);
    expect(d.linhas[5].total).toBe(3001.5);
    expect(d.linhas[2]).toEqual({
      tipo: "item",
      numero: "1.1.1",
      codigo: "93358",
      fonte: "SINAPI",
      descricao: "Escavação manual",
      nivel: 3,
      unidade: "m³",
      quantidade: 125.5,
      valorUnitario: 9.18,
      total: 1152.09,
    });
    // item sem referência (incluído à mão) também sai, com o rótulo da posição
    expect(d.linhas[7]).toMatchObject({ numero: "8", codigo: null, total: 99.99 });
  });

  it("total geral em centavos, por extenso, validade, local/data e representante", () => {
    const d = dados();
    expect(d.totalGeral).toBe(4891.78);
    expect(d.totalExtenso).toBe(
      "quatro mil oitocentos e noventa e um reais e setenta e oito centavos"
    );
    expect(d.validade).toBe("Validade da proposta: 60 dias");
    expect(d.localData).toBe("Araxá/MG, 05 de outubro de 2026");
    expect(d.representante).toEqual({
      nome: "Fulano de Tal",
      cargo: "Sócio-administrador",
      cpf: "529.982.247-25",
    });
  });

  it("cabeçalho: empresa formatada e dados da planilha", () => {
    const d = dados();
    expect(d.empresa).toEqual({
      nome: "Empresa Teste Ltda",
      cnpj: "11.222.333/0001-81",
      endereco: "Rua A, 100 - Centro - Araxá/MG - CEP 38180-000",
      contato: "Telefone: (34) 99999-8888 | E-mail: contato@teste.com.br",
    });
    expect(d.titulo).toBe("Proposta de preços");
    expect(d.orgao).toBe("Prefeitura Municipal de Itatinga");
    expect(d.objeto).toBe("Iluminação pública da Praça Central");
    expect(d.edital).toBe("Pregão Eletrônico 12/2026");
    expect(d.dataBase).toBe("03/2026");
    expect(d.bdi).toBe("25,00%");
  });

  it("sem orcamento_info: campos da licitação e, por último, o nome como objeto", () => {
    const d = dados({
      info: {},
      oportunidade: {
        nome: "PM Teste - LED",
        orgao: "Prefeitura de Teste",
        licitacao_numero: "12/2026",
        licitacao_processo: "345/2026",
      },
    });
    expect(d.orgao).toBe("Prefeitura de Teste");
    expect(d.objeto).toBe("PM Teste - LED");
    expect(d.edital).toBe("Edital 12/2026 - Processo 345/2026");
    expect(d.dataBase).toBeNull();
    expect(d.bdi).toBeNull();

    const s = dados({ info: null, oportunidade: { nome: "Só o nome" } });
    expect([s.orgao, s.objeto, s.edital]).toEqual([null, "Só o nome", null]);

    // o objeto da planilha (quando existe) vale mais que o nome; em branco, cai no nome
    const o = dados({ info: { objeto: "Objeto da planilha" }, oportunidade: { nome: "Nome" } });
    expect(o.objeto).toBe("Objeto da planilha");
    const b = dados({ info: { objeto: "  " }, oportunidade: { nome: "Nome", titulo: "Título" } });
    expect(b.objeto).toBe("Nome");
  });

  it("desempate pelo número natural e soma sem erro de ponto flutuante", () => {
    const d = montarDadosProposta({
      itens: [
        {
          id: "a",
          numero: "1.10",
          etapa: false,
          quantidade: 1,
          valor_unitario: 0.1,
          valor_total: 0.1,
        },
        {
          id: "b",
          numero: "1.2",
          etapa: false,
          quantidade: 1,
          valor_unitario: 0.1,
          valor_total: 0.1,
        },
        {
          id: "c",
          numero: "1.1",
          etapa: false,
          quantidade: 1,
          valor_unitario: 0.1,
          valor_total: 0.1,
        },
      ],
      info: {},
      oportunidade: { nome: "X" },
      empresa: {},
      representante: { nome: "Fulano" },
      opcoes: { validadeDias: 1, local: "", dataISO: "2026-01-02" },
    });
    expect(d.linhas.map((l) => l.numero)).toEqual(["1.1", "1.2", "1.10"]);
    expect(d.totalGeral).toBe(0.3);
    expect(d.validade).toBe("Validade da proposta: 1 dia");
    expect(d.localData).toBe("02 de janeiro de 2026");
    expect(d.empresa).toEqual({ nome: "", cnpj: "", endereco: "", contato: "" });
  });

  it("não altera a lista recebida", () => {
    const antes = ITENS.map((i) => i.id);
    dados();
    expect(ITENS.map((i) => i.id)).toEqual(antes);
  });
});

describe("descricaoVersaoProposta", () => {
  it("usa vírgula decimal e o plural certo", () => {
    expect(descricaoVersaoProposta({ descontoPct: 12.35, descontoReal: 12.4, qtdItens: 57 })).toBe(
      "Orçamento com desconto de 12,35% (real 12,40%) — 57 itens"
    );
    expect(descricaoVersaoProposta({ descontoPct: 0, descontoReal: 0, qtdItens: 1 })).toBe(
      "Orçamento com desconto de 0,00% (real 0,00%) — 1 item"
    );
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

```bash
cd apps/web && npx vitest run src/lib/proposta-orcamento.test.js
```

Expected: `FAIL  src/lib/proposta-orcamento.test.js`, com `Error: Failed to load url ./proposta-orcamento ... Does the file exist?`, e `Test Files  1 failed (1)`.

- [ ] **Step 8: Implementar `apps/web/src/lib/proposta-orcamento.js`**

O bloco "valor por extenso" é o de `supabase/functions/_shared/recibo-pdf.ts:50-158` sem as anotações de tipo (mesmas tabelas, mesma regra do "e" antes do último grupo e do "de reais" no milhão redondo).

<!-- prettier-ignore -->
```js
/**
 * Dados da proposta de preços (PDF e Excel) a partir do orçamento da
 * oportunidade: linhas com etapas e subtotais, total geral, valor por
 * extenso, validade, local/data e representante legal.
 *
 * Funções puras; a geração dos arquivos fica em lib/proposta-export.js.
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §9.
 */
import { formatarCpf, validarCpf } from "./cpf";
import { formatarCpfCnpj } from "./ler-documento";
import { formatarTelefone } from "./telefone";
import { subtotaisEtapas } from "./orcamento-desconto";
import { ordenarItensOportunidade } from "./orcamento-registros";

// ------------------------------------------------------ valor por extenso
// Port de supabase/functions/_shared/recibo-pdf.ts (valorPorExtenso), sem os tipos.
const UNID = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CEM = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n) {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100),
    r = n % 100;
  const partes = [];
  if (c) partes.push(CEM[c]);
  if (r)
    partes.push(
      r < 20 ? UNID[r] : [DEZ[Math.floor(r / 10)], UNID[r % 10]].filter(Boolean).join(" e ")
    );
  return partes.join(" e ");
}

const ESCALAS = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

function inteiroPorExtenso(n) {
  if (n === 0) return "zero";
  const grupos = [];
  for (let escala = 0; n > 0 && escala < ESCALAS.length; escala++) {
    grupos.unshift({ g: n % 1000, escala });
    n = Math.floor(n / 1000);
  }
  const partes = grupos
    .filter((p) => p.g)
    .map((p) => ({
      ...p,
      texto:
        p.escala === 1 && p.g === 1
          ? "mil"
          : [ate999(p.g), ESCALAS[p.escala][p.g === 1 ? 0 : 1]].filter(Boolean).join(" "),
    }));
  // "dois mil e quinhentos", "mil e cem", "dois mil quinhentos e trinta":
  // "e" antes do último grupo só quando ele é < 100 ou centena redonda
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      return (ultimo && (p.g < 100 || p.g % 100 === 0) ? " e " : " ") + p.texto;
    })
    .join("");
}

/** 1152.09 → "mil cento e cinquenta e dois reais e nove centavos". */
export function valorPorExtenso(valor) {
  const centavosTotais = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const cent = centavosTotais % 100;
  const partes = [];
  if (reais) {
    const milhao = reais % 1_000_000 === 0 && reais >= 1_000_000;
    partes.push(
      `${inteiroPorExtenso(reais)}${milhao ? " de" : ""} ${reais === 1 ? "real" : "reais"}`
    );
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}

// --------------------------------------------------------------- arquivo

/**
 * "Proposta - <nome> - <aaaa-mm-dd>.<ext>". Troca \ / : * ? " < > | e
 * caracteres de controle por "-" (inválidos no Windows) e junta os espaços.
 */
export function nomeArquivoProposta(nomeOportunidade, dataISO, ext) {
  const nome =
    String(nomeOportunidade ?? "")
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim() || "Oportunidade";
  return `Proposta - ${nome} - ${String(dataISO ?? "").slice(0, 10)}.${ext}`;
}

// ---------------------------------------------------------- representante

/** { nome, cargo, cpf }: nome obrigatório; CPF opcional, mas, se informado, válido; cargo livre. */
export function validarRepresentante({ nome, cpf } = {}) {
  const erros = [];
  if (!String(nome ?? "").trim()) erros.push("Informe o nome do representante legal");
  const cpfTexto = String(cpf ?? "").trim();
  if (cpfTexto && !validarCpf(cpfTexto)) erros.push("CPF do representante legal inválido");
  return { ok: erros.length === 0, erros };
}

// ----------------------------------------------------------------- dados

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const texto = (v) => String(v ?? "").trim();

/** "2026-10-05" → "05 de outubro de 2026" (sem new Date: não cai 1 dia no fuso). */
function dataPorExtenso(dataISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(dataISO));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return "";
  return `${m[3]} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

function formatarCep(cep) {
  const d = texto(cep).replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : texto(cep);
}

function montarEmpresa(e) {
  const emp = e || {};
  const logradouro = [emp.endereco, emp.numero].map(texto).filter(Boolean).join(", ");
  const cidadeUf = [emp.cidade, emp.estado].map(texto).filter(Boolean).join("/");
  const cep = texto(emp.cep) ? `CEP ${formatarCep(emp.cep)}` : "";
  return {
    nome: texto(emp.razao_social) || texto(emp.nome) || texto(emp.nome_fantasia),
    cnpj: texto(emp.cnpj) ? formatarCpfCnpj(emp.cnpj) : "",
    endereco: [logradouro, emp.complemento, emp.bairro, cidadeUf, cep]
      .map(texto)
      .filter(Boolean)
      .join(" - "),
    contato: [
      texto(emp.telefone) ? `Telefone: ${formatarTelefone(texto(emp.telefone))}` : "",
      texto(emp.email) ? `E-mail: ${texto(emp.email)}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

/** number, ou null para vazio/inválido. */
function numeroOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const centavos = (v) => Math.round((numeroOuNull(v) ?? 0) * 100);

/** "25" → "25%"; "25,00%" fica como está; vazio → null. */
function bdiComPercentual(bdi) {
  const t = texto(bdi);
  if (!t) return null;
  return t.endsWith("%") ? t : `${t}%`;
}

/**
 * Tudo o que o PDF e o Excel mostram, já calculado (DadosProposta):
 * { empresa: { nome, cnpj, endereco, contato }, titulo, orgao, objeto, edital,
 *   dataBase, bdi, linhas, totalGeral, totalExtenso, validade, localData,
 *   representante: { nome, cargo, cpf } }
 *
 * - linhas: todos os itens (com ou sem preço de referência), na ordem e com o rótulo de
 *   ordenarItensOportunidade (a mesma da tela: `ordem`, desempate pelo número), como
 *   LinhaProposta { tipo: "etapa"|"item", numero, codigo, fonte, descricao, unidade,
 *   quantidade, valorUnitario, total, nivel }.
 *   Na etapa, total = subtotal (subtotaisEtapas) e nivel = nº de segmentos do número.
 * - totalGeral = Σ valor_total dos itens (sem as etapas), somado em centavos.
 * - órgão/objeto/edital: de orcamento_info; se faltar, dos campos da licitação da
 *   oportunidade (orgao; licitacao_numero/licitacao_processo). O objeto cai por último no
 *   nome da oportunidade (nome, ou titulo). O que não existir fica null e não sai.
 */
export function montarDadosProposta({ itens, info, oportunidade, empresa, representante, opcoes }) {
  const inf = info || {};
  const op = oportunidade || {};
  const opc = opcoes || {};
  const rep = representante || {};

  // Mesma ordem e mesmo rótulo (`item.item`) da tela; devolve lista nova, `itens` fica intacta.
  const ordenados = ordenarItensOportunidade(itens);
  const subtotais = subtotaisEtapas(ordenados);

  let totalCentavos = 0;
  const linhas = ordenados.map((item) => {
    const numero = item.item;
    const nivel = String(numero).split(".").length;
    const base = {
      numero,
      codigo: texto(item.codigo) || null,
      fonte: texto(item.fonte) || null,
      descricao: texto(item.descricao),
      nivel,
    };
    if (item.etapa) {
      return {
        tipo: "etapa",
        ...base,
        unidade: null,
        quantidade: null,
        valorUnitario: null,
        total: subtotais[item.numero] ?? 0,
      };
    }
    const cents = centavos(item.valor_total);
    totalCentavos += cents;
    return {
      tipo: "item",
      ...base,
      unidade: texto(item.unidade) || null,
      quantidade: numeroOuNull(item.quantidade),
      valorUnitario: numeroOuNull(item.valor_unitario),
      total: cents / 100,
    };
  });

  const totalGeral = totalCentavos / 100;
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

/**
 * Descrição da versão registrada na aba Geral (proposta_oportunidade):
 * "Orçamento com desconto de 12,35% (real 12,40%) — 57 itens".
 */
export function descricaoVersaoProposta({ descontoPct, descontoReal, qtdItens }) {
  const pct = (v) =>
    (Number(v) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const n = Number(qtdItens) || 0;
  return `Orçamento com desconto de ${pct(descontoPct)}% (real ${pct(descontoReal)}%) — ${n} ${
    n === 1 ? "item" : "itens"
  }`;
}
```

- [ ] **Step 9: Rodar e ver passar**

```bash
cd apps/web && npx vitest run src/lib/proposta-orcamento.test.js
```

Expected: `✓ src/lib/proposta-orcamento.test.js (16 tests)`, `Test Files  1 passed (1)`, `Tests  16 passed (16)`.

- [ ] **Step 10: Suíte inteira e formatação**

```bash
cd apps/web && npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/lib/cpf.js apps/web/src/lib/cpf.test.js apps/web/src/lib/proposta-orcamento.js apps/web/src/lib/proposta-orcamento.test.js
```

Expected: a suíte do Step 1 com **2 arquivos e 23 testes a mais**, toda passando; Prettier `All matched files use Prettier code style!`. (`src/lib/**` fica fora do ESLint do projeto, por isso não há passo de lint.)

- [ ] **Step 11: Commit (só os 4 caminhos da task)**

```bash
git status --short
git add apps/web/src/lib/cpf.js apps/web/src/lib/cpf.test.js apps/web/src/lib/proposta-orcamento.js apps/web/src/lib/proposta-orcamento.test.js
git commit -F - -- apps/web/src/lib/cpf.js apps/web/src/lib/cpf.test.js apps/web/src/lib/proposta-orcamento.js apps/web/src/lib/proposta-orcamento.test.js <<'EOF'
feat(orcamento): dados da proposta de preços, valor por extenso e validação de CPF

- lib/cpf: validarCpf (dígitos verificadores, recusa repetidos e letras) e formatarCpf
  (máscara progressiva, serve para o campo enquanto digita)
- lib/proposta-orcamento: montarDadosProposta (todas as linhas na ordem da planilha, etapas
  com subtotal, total em centavos, cabeçalho da empresa e da licitação, validade, local/data
  e representante), valorPorExtenso (port do recibo-pdf.ts), nomeArquivoProposta,
  validarRepresentante e descricaoVersaoProposta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `4 files changed`, só esses quatro caminhos.

---

### Task 8: Proposta em Excel e PDF (`lib/proposta-export.js`) e a dependência `jspdf-autotable`

**Files:**

- Modify: `apps/web/package.json` (dependência nova)
- Modify: `package-lock.json` (raiz do monorepo)
- Create: `apps/web/src/lib/proposta-export.js`
- Test: `apps/web/src/lib/proposta-export.test.js`

**Interfaces:**

- Consumes (Task 1, `./orcamento-desconto`): `totalLinha(quantidade, unitario): number|null`.
- Consumes (Task 7): o formato `DadosProposta`/`LinhaProposta`; o teste monta os dados com `montarDadosProposta` de `./proposta-orcamento`.
- Produces (`apps/web/src/lib/proposta-export.js`):
  - `montarPlanilhaProposta(dados: DadosProposta): XLSX.WorkBook` — aba `Proposta`;
  - `gerarPdfProposta(dados: DadosProposta, { jsPDF, autoTable }): jsPDF`;
  - `baixarPropostaPdf(dados, nomeArquivo): Promise<void>` — import dinâmico de `jspdf` e `jspdf-autotable`, depois `doc.save(nomeArquivo)`;
  - `baixarPropostaExcel(dados, nomeArquivo): Promise<void>` — `XLSX.writeFile`.

**Conferido em 29/09, em pasta temporária fora do repositório:**

- `jspdf-autotable@3.8.4` é UMD/CommonJS (`exports["."]` → `dist/jspdf.plugin.autotable.js`, peer `jspdf ^2.5.1`). No Vitest (ambiente node), `import autoTable from "jspdf-autotable"` e `(await import("jspdf-autotable")).default` já são a **função** (interop do Vitest); no build do Vite também (`getDefaultExportFromCjs`, conferido no chunk gerado). Só no Node ESM puro ela vem em `.default.default`; o `baixarPropostaPdf` aceita as duas formas.
- `autoTable(doc, {...})` com jspdf 2.5.2 gera, quebra página e preenche `doc.lastAutoTable.finalY`.
- As fontes padrão do jsPDF só têm WinAnsi: um `≤` ou `Ω` na linha faz o jsPDF gravar a linha **inteira** como lixo UTF-16 (conferido no PDF). Latin-1 (`ç`, `ã`, `²`, `Ø`) e os extras do cp1252 (`—`, `“`, `•`) saem certos. Por isso o `textoPdf` troca `≤`/`≥`/`Ω`/`⌀` e põe `?` no resto.
- SheetJS 0.18.5 grava e relê `f` + `v` + `z` (formato de número); não grava negrito.
- `npm install jspdf-autotable@^3.8.4 --workspace=apps/web --package-lock-only` numa cópia dos `package.json` + `package-lock.json`: +1 linha em `apps/web/package.json` e +10 no lock.

**Decisões desta task (o contrato não cobria):**

- **Bloco da etapa no Excel:** as linhas logo abaixo cujo número começa com `<número da etapa>.`. Numa planilha bem formada é exatamente "até a próxima etapa de nível ≤ o dela"; com um item sem número no fim (incluído à mão), ele não entra no bloco da última etapa, igual ao `subtotaisEtapas` da tela e do PDF. Etapa sem nada embaixo: `0` sem fórmula.
- **Total do item com fórmula só quando confere:** `ROUND(Fn*Gn,2)` quando `totalLinha(qtd, unit) === total`; item antigo com BDI/imposto por linha (orçamento feito à mão) sai com o valor fixo, para o Excel recalcular igual ao PDF.
- **Cabeçalho do documento:** linhas vazias (sem órgão, sem data-base…) não saem. Rodapé do PDF: nome da empresa à esquerda e "Página X de Y" à direita. O bloco final (total, extenso, validade, local/data e assinatura) vai inteiro para a página seguinte se sobrarem menos de 70 mm.
- **Formatos no Excel:** Qtd. `#,##0.00#`, Preço unit. `#,##0.00##`, Total `#,##0.00`. Colunas com largura; sem mesclar células.

- [ ] **Step 1: Instalar a dependência (na raiz do repositório)**

Antes, confirme que ninguém deixou alteração pendente nesses dois arquivos:

```bash
git status --short -- package-lock.json apps/web/package.json
```

Expected: nenhuma saída. Se aparecer algo, **pare** e pergunte ao Javerson (não misture a alteração de outra sessão no commit).

```bash
npm install jspdf-autotable@^3.8.4 --workspace=apps/web
git diff --stat -- package-lock.json apps/web/package.json
node -p "require('jspdf-autotable/package.json').version"
```

Expected: o `npm install` termina com `added 1 package` (e o resumo de auditoria); o `diff --stat` mostra `2 files changed, 11 insertions(+)` (`"jspdf-autotable": "^3.8.4"` nas dependências de `apps/web/package.json` e no bloco da workspace no lock, mais o bloco `node_modules/jspdf-autotable`); a versão impressa é `3.8.4`. Se o lock mudar muito mais que isso (outra versão do npm reescrevendo o arquivo), pare e mostre o `git diff --stat` ao Javerson antes de seguir.

- [ ] **Step 2: Escrever o teste**

Fixture: etapa `1` > etapa `1.1` > itens `1.1.1` e `1.1.2`; item `1.2`; etapa `2` > item `2.1`; etapa `3` vazia; e um item antigo sem número com BDI 10% (2 × 100,00 = 200,00, gravado 220,00). O teste acha a linha do cabeçalho da tabela (A = `Item`, D = `Descrição`) e confere as posições relativas a ela.

Crie `apps/web/src/lib/proposta-export.test.js`:

<!-- prettier-ignore -->
```js
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { montarDadosProposta } from "./proposta-orcamento";
import { gerarPdfProposta, montarPlanilhaProposta } from "./proposta-export";

const item = (id, numero, ordem, quantidade, valor_unitario, valor_total, extra = {}) => ({
  id,
  numero,
  etapa: false,
  codigo: null,
  fonte: "SINAPI",
  descricao: `Serviço ${numero ?? id}`,
  unidade: "m²",
  quantidade,
  valor_unitario_ref: valor_unitario,
  valor_unitario,
  valor_total,
  ordem,
  ...extra,
});
const etapa = (id, numero, ordem, descricao) => ({ id, numero, etapa: true, descricao, ordem });

// 1 > 1.1 > (1.1.1, 1.1.2); 1.2; 2 > 2.1; etapa 3 vazia; item antigo com BDI (sem número)
const ITENS = [
  etapa("e1", "1", 0, "Serviços preliminares"),
  etapa("e11", "1.1", 1, "Movimento de terra"),
  item("i111", "1.1.1", 2, 125.5, 9.18, 1152.09),
  item("i112", "1.1.2", 3, 10, 43.82, 438.2),
  item("i12", "1.2", 4, 2, 100, 200),
  etapa("e2", "2", 5, "Iluminação"),
  item("i21", "2.1", 6, 3, 1000.5, 3001.5),
  etapa("e3", "3", 7, "Etapa sem itens"),
  item("leg", null, 8, 2, 100, 220, { bdi: 10, valor_unitario_ref: null }),
];

function dados(itens = ITENS) {
  return montarDadosProposta({
    itens,
    info: {
      orgao: "Prefeitura Municipal de Teste",
      objeto: "Iluminação pública",
      edital: "Pregão 12/2026",
      data_base: "03/2026",
      bdi: "25%",
    },
    oportunidade: { nome: "PM Teste" },
    empresa: {
      razao_social: "Empresa Teste Ltda",
      cnpj: "11222333000181",
      endereco: "Rua A",
      numero: "100",
      cidade: "Araxá",
      estado: "MG",
      telefone: "34999998888",
      email: "contato@teste.com.br",
    },
    representante: { nome: "Fulano de Tal", cargo: "Sócio-administrador", cpf: "52998224725" },
    opcoes: { validadeDias: 60, local: "Araxá/MG", dataISO: "2026-10-05" },
  });
}

/** linha (1-based) do cabeçalho da tabela: A = "Item" e D = "Descrição" */
function linhaCabecalho(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    if (ws[`A${r + 1}`]?.v === "Item" && ws[`D${r + 1}`]?.v === "Descrição") return r + 1;
  }
  throw new Error("cabeçalho da tabela não encontrado");
}

function textosColunaA(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const saida = [];
  for (let r = faixa.s.r; r <= faixa.e.r; r++) if (ws[`A${r + 1}`]) saida.push(ws[`A${r + 1}`].v);
  return saida;
}

describe("montarPlanilhaProposta", () => {
  const wb = montarPlanilhaProposta(dados());
  const ws = wb.Sheets.Proposta;
  const h = linhaCabecalho(ws); // itens a partir de h + 1

  it("aba Proposta com o cabeçalho do documento e da tabela", () => {
    expect(wb.SheetNames).toEqual(["Proposta"]);
    expect(ws.A1.v).toBe("Empresa Teste Ltda");
    expect(ws.A2.v).toBe("CNPJ: 11.222.333/0001-81");
    const textos = textosColunaA(ws);
    expect(textos).toContain("PROPOSTA DE PREÇOS");
    expect(textos).toContain("Órgão: Prefeitura Municipal de Teste");
    expect(textos).toContain("Objeto: Iluminação pública");
    expect(textos).toContain("Edital/Processo: Pregão 12/2026");
    expect(textos).toContain("Data-base: 03/2026 | BDI de referência: 25%");
    expect(["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => ws[`${c}${h}`].v)).toEqual([
      "Item",
      "Código",
      "Fonte",
      "Descrição",
      "Unid.",
      "Qtd.",
      "Preço unit. (R$)",
      "Total (R$)",
    ]);
  });

  it("item: número como texto e total ROUND(Fn*Gn,2) com o valor em cache", () => {
    const n = h + 3; // 1.1.1
    expect(ws[`A${n}`]).toMatchObject({ t: "s", v: "1.1.1" });
    expect(ws[`F${n}`].v).toBe(125.5);
    expect(ws[`G${n}`].v).toBe(9.18);
    expect(ws[`H${n}`]).toMatchObject({ t: "n", v: 1152.09, f: `ROUND(F${n}*G${n},2)` });
    expect(ws[`H${h + 4}`]).toMatchObject({ v: 438.2, f: `ROUND(F${h + 4}*G${h + 4},2)` });
  });

  it("etapas: descrição em maiúsculas e SUBTOTAL do bloco, aninhado", () => {
    const e1 = h + 1;
    const e11 = h + 2;
    const e2 = h + 6;
    expect(ws[`D${e1}`].v).toBe("SERVIÇOS PRELIMINARES");
    expect(ws[`H${e1}`]).toMatchObject({ v: 1790.29, f: `SUBTOTAL(9,H${e1 + 1}:H${e1 + 4})` });
    expect(ws[`H${e11}`]).toMatchObject({ v: 1590.29, f: `SUBTOTAL(9,H${e11 + 1}:H${e11 + 2})` });
    expect(ws[`H${e2}`]).toMatchObject({ v: 3001.5, f: `SUBTOTAL(9,H${e2 + 1}:H${e2 + 1})` });
    expect(ws[`F${e1}`]).toBeUndefined();
    expect(ws[`G${e1}`]).toBeUndefined();
  });

  it("etapa sem itens: 0 sem fórmula; item antigo com BDI: valor fixo", () => {
    const e3 = h + 8;
    expect(ws[`H${e3}`]).toMatchObject({ t: "n", v: 0 });
    expect(ws[`H${e3}`].f).toBeUndefined();
    expect(ws[`A${e3 + 1}`].v).toBe("9");
    expect(ws[`H${e3 + 1}`]).toMatchObject({ t: "n", v: 220 });
    expect(ws[`H${e3 + 1}`].f).toBeUndefined();
  });

  it("total geral: SUBTOTAL de toda a tabela; depois extenso, validade, local e assinatura", () => {
    const t = h + 10;
    expect(ws[`D${t}`].v).toBe("VALOR GLOBAL DA PROPOSTA (R$)");
    expect(ws[`H${t}`]).toMatchObject({ v: 5011.79, f: `SUBTOTAL(9,H${h + 1}:H${h + 9})` });
    const textos = textosColunaA(ws);
    expect(textos).toContain(
      "Valor global por extenso: cinco mil e onze reais e setenta e nove centavos"
    );
    expect(textos).toContain("Validade da proposta: 60 dias");
    expect(textos).toContain("Araxá/MG, 05 de outubro de 2026");
    expect(textos.slice(-3)).toEqual([
      "Fulano de Tal",
      "Sócio-administrador",
      "CPF: 529.982.247-25",
    ]);
  });

  it("grava e relê o .xlsx com fórmulas e valores", () => {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const ws2 = XLSX.read(buf, { type: "buffer" }).Sheets.Proposta;
    expect(ws2[`H${h + 1}`]).toMatchObject({ v: 1790.29, f: `SUBTOTAL(9,H${h + 2}:H${h + 5})` });
    expect(ws2[`H${h + 10}`]).toMatchObject({ v: 5011.79 });
    expect(ws2[`A${h + 2}`].v).toBe("1.1");
  });
});

// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;

describe("gerarPdfProposta", () => {
  it(
    "gera o PDF com uma página e o rodapé",
    () => {
      const doc = gerarPdfProposta(dados(), { jsPDF, autoTable });
      expect(doc.getNumberOfPages()).toBe(1);
      const saida = doc.output();
      expect(saida.startsWith("%PDF-")).toBe(true);
      expect(saida).toContain("Página 1 de 1");
      expect(saida).toContain("PROPOSTA DE PREÇOS");
    },
    LIMITE_PDF
  );

  it(
    "quebra páginas com muitos itens e numera todas",
    () => {
      const muitos = [etapa("e1", "1", 0, "Etapa única")];
      for (let i = 1; i <= 150; i++) muitos.push(item(`i${i}`, `1.${i}`, i, 1, 10, 10));
      const doc = gerarPdfProposta(dados(muitos), { jsPDF, autoTable });
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(1);
      expect(doc.output()).toContain(`Página ${n} de ${n}`);
    },
    LIMITE_PDF
  );

  it(
    "não lança com caracteres fora da fonte do PDF",
    () => {
      const estranhos = [
        etapa("e1", "1", 0, "Etapa ≤ 3 😀"),
        item("i1", "1.1", 1, 1, 10, 10, { descricao: "Tubo ≤ 3m Ω" }),
      ];
      const doc = gerarPdfProposta(dados(estranhos), { jsPDF, autoTable });
      expect(doc.output()).toContain("Tubo <= 3m ohm");
    },
    LIMITE_PDF
  );
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/web && npx vitest run src/lib/proposta-export.test.js
```

Expected: `FAIL  src/lib/proposta-export.test.js`, com `Error: Failed to load url ./proposta-export ... Does the file exist?`, e `Test Files  1 failed (1)`.

- [ ] **Step 4: Implementar `apps/web/src/lib/proposta-export.js`**

<!-- prettier-ignore -->
```js
/**
 * Arquivos da proposta de preços a partir de DadosProposta
 * (lib/proposta-orcamento.js → montarDadosProposta):
 *   - Excel (SheetJS): aba "Proposta" com fórmulas E o valor já calculado;
 *   - PDF (jsPDF + jspdf-autotable): A4 paisagem, etapas em negrito, "Página X de Y".
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §9.
 *
 * O SheetJS 0.18.5 (versão gratuita) não grava estilo: no Excel a etapa sai com
 * a descrição em MAIÚSCULAS e o subtotal; o negrito fica só no PDF.
 */
import * as XLSX from "xlsx";
import { totalLinha } from "./orcamento-desconto";

const ABA = "Proposta";
const CABECALHO = [
  "Item",
  "Código",
  "Fonte",
  "Descrição",
  "Unid.",
  "Qtd.",
  "Preço unit. (R$)",
  "Total (R$)",
];
const FMT_MOEDA = "#,##0.00";
const FMT_UNIT = "#,##0.00##";
const FMT_QTD = "#,##0.00#";

const somaCentavos = (valores) =>
  valores.reduce((s, v) => s + Math.round((Number(v) || 0) * 100), 0) / 100;

/**
 * Última linha (índice em `linhas`) do bloco da etapa `i`: as linhas logo abaixo
 * cujo número começa com "<número da etapa>.". Numa planilha bem formada é o
 * mesmo que "até a próxima etapa de nível ≤ o dela", e bate com subtotaisEtapas.
 * Devolve `i` quando a etapa não tem nada embaixo.
 */
function fimDoBloco(linhas, i) {
  const prefixo = `${linhas[i].numero}.`;
  let j = i;
  while (j + 1 < linhas.length && String(linhas[j + 1].numero).startsWith(prefixo)) j++;
  return j;
}

function cabecalhoDoDocumento(dados) {
  const emp = dados.empresa || {};
  const referencia = [
    dados.dataBase ? `Data-base: ${dados.dataBase}` : "",
    dados.bdi ? `BDI de referência: ${dados.bdi}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  return {
    empresa: [emp.nome, emp.cnpj ? `CNPJ: ${emp.cnpj}` : "", emp.endereco, emp.contato].filter(
      Boolean
    ),
    licitacao: [
      dados.orgao ? `Órgão: ${dados.orgao}` : "",
      dados.objeto ? `Objeto: ${dados.objeto}` : "",
      dados.edital ? `Edital/Processo: ${dados.edital}` : "",
      referencia,
    ].filter(Boolean),
  };
}

function linhasAssinatura(rep) {
  return [rep?.nome || "", rep?.cargo || "", rep?.cpf ? `CPF: ${rep.cpf}` : ""].filter(Boolean);
}

// ------------------------------------------------------------------ Excel

/**
 * Pasta de trabalho com a aba "Proposta": cabeçalho da empresa e da licitação,
 * a tabela (Item · Código · Fonte · Descrição · Unid. · Qtd. · Preço unit. · Total),
 * o valor global, o extenso, a validade, local/data e a assinatura.
 *
 * Fórmulas, sempre com o valor em cache (`v`), para abrir certo mesmo sem recalcular:
 *   - total do item: ROUND(Fn*Gn,2) — só quando confere com o total gravado; item antigo
 *     com BDI/imposto por linha sai com o valor fixo, para o Excel bater com o PDF;
 *   - subtotal da etapa: SUBTOTAL(9,H<i>:H<j>) sobre o bloco da etapa;
 *   - total geral: SUBTOTAL(9,H<primeira>:H<última>), que ignora os SUBTOTAL de dentro
 *     do intervalo (as etapas aninhadas não contam duas vezes).
 */
export function montarPlanilhaProposta(dados) {
  const ws = {};
  let r = 0; // próxima linha (0-based)
  const gravar = (linha, coluna, celula) => {
    ws[XLSX.utils.encode_cell({ r: linha, c: coluna })] = celula;
  };
  const linhaDeTexto = (valor) => {
    if (valor) gravar(r, 0, { t: "s", v: String(valor) });
    r++;
  };

  const cab = cabecalhoDoDocumento(dados);
  cab.empresa.forEach(linhaDeTexto);
  r++;
  linhaDeTexto(String(dados.titulo || "Proposta de preços").toUpperCase());
  cab.licitacao.forEach(linhaDeTexto);
  r++;

  CABECALHO.forEach((h, c) => gravar(r, c, { t: "s", v: h }));
  r++;

  const linhas = dados.linhas || [];
  const primeira = r;
  linhas.forEach((l, i) => {
    const lin = primeira + i;
    const n = lin + 1; // número da linha no Excel
    gravar(lin, 0, { t: "s", v: String(l.numero ?? "") });
    if (l.codigo) gravar(lin, 1, { t: "s", v: String(l.codigo) });
    if (l.fonte) gravar(lin, 2, { t: "s", v: String(l.fonte) });
    const descricao = String(l.descricao ?? "");
    gravar(lin, 3, { t: "s", v: l.tipo === "etapa" ? descricao.toUpperCase() : descricao });

    if (l.tipo === "etapa") {
      const fim = fimDoBloco(linhas, i);
      if (fim === i) {
        gravar(lin, 7, { t: "n", v: 0, z: FMT_MOEDA });
      } else {
        const valor = somaCentavos(
          linhas
            .slice(i + 1, fim + 1)
            .filter((x) => x.tipo !== "etapa")
            .map((x) => x.total)
        );
        gravar(lin, 7, {
          t: "n",
          v: valor,
          f: `SUBTOTAL(9,H${n + 1}:H${primeira + fim + 1})`,
          z: FMT_MOEDA,
        });
      }
      return;
    }

    if (l.unidade) gravar(lin, 4, { t: "s", v: String(l.unidade) });
    if (l.quantidade != null) gravar(lin, 5, { t: "n", v: l.quantidade, z: FMT_QTD });
    if (l.valorUnitario != null) gravar(lin, 6, { t: "n", v: l.valorUnitario, z: FMT_UNIT });
    const confere = totalLinha(l.quantidade, l.valorUnitario) === l.total;
    gravar(
      lin,
      7,
      confere
        ? { t: "n", v: l.total, f: `ROUND(F${n}*G${n},2)`, z: FMT_MOEDA }
        : { t: "n", v: l.total, z: FMT_MOEDA }
    );
  });
  r = primeira + linhas.length;

  gravar(r, 3, { t: "s", v: "VALOR GLOBAL DA PROPOSTA (R$)" });
  gravar(
    r,
    7,
    linhas.length
      ? {
          t: "n",
          v: dados.totalGeral,
          f: `SUBTOTAL(9,H${primeira + 1}:H${primeira + linhas.length})`,
          z: FMT_MOEDA,
        }
      : { t: "n", v: dados.totalGeral, z: FMT_MOEDA }
  );
  r += 2;
  linhaDeTexto(`Valor global por extenso: ${dados.totalExtenso}`);
  linhaDeTexto(dados.validade);
  linhaDeTexto(dados.localData);
  r += 2;
  linhaDeTexto("_______________________________________");
  linhasAssinatura(dados.representante).forEach(linhaDeTexto);

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, 0), c: 7 } });
  ws["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 70 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ABA);
  return wb;
}

// -------------------------------------------------------------------- PDF

// Fontes padrão do PDF (helvetica) só têm WinAnsi: o jsPDF embaralha a linha
// inteira quando aparece outro caractere. Troca os comuns e o resto vira "?".
const EXTRAS_WINANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const TROCAS_PDF = { "≤": "<=", "≥": ">=", Ω: "ohm", "⌀": "Ø", "′": "'", "″": '"', "\t": " " };

function textoPdf(valor) {
  return Array.from(String(valor ?? "").normalize("NFC"))
    .map((ch) => {
      if (TROCAS_PDF[ch] !== undefined) return TROCAS_PDF[ch];
      const c = ch.codePointAt(0);
      if (ch === "\n" || ch === "\r") return " ";
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRAS_WINANSI.includes(ch)) {
        return ch;
      }
      return "?";
    })
    .join("");
}

const fmt = (v, min, max) =>
  v == null || v === ""
    ? ""
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

/**
 * PDF da proposta (A4 paisagem). `jsPDF` e `autoTable` vêm de fora (import
 * dinâmico no navegador; import normal no teste).
 */
export function gerarPdfProposta(dados, { jsPDF, autoTable }) {
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

  const cab = cabecalhoDoDocumento(dados);
  cab.empresa.forEach((t, i) =>
    escrever(t, i === 0 ? { tamanho: 12, negrito: true, entre: 5.5 } : { tamanho: 8.5 })
  );
  y += 3;
  escrever(String(dados.titulo || "Proposta de preços").toUpperCase(), {
    tamanho: 13,
    negrito: true,
    alinhar: "center",
    entre: 7,
  });
  cab.licitacao.forEach((t) => escrever(t, { tamanho: 9 }));
  y += 2;

  const linhas = dados.linhas || [];
  autoTable(doc, {
    startY: y,
    head: [CABECALHO],
    body: linhas.map((l) => [
      textoPdf(l.numero),
      textoPdf(l.codigo),
      textoPdf(l.fonte),
      textoPdf(l.tipo === "etapa" ? String(l.descricao ?? "").toUpperCase() : l.descricao),
      textoPdf(l.unidade),
      fmt(l.quantidade, 2, 3),
      fmt(l.valorUnitario, 2, 4),
      fmt(l.total, 2, 2),
    ]),
    theme: "grid",
    margin: { left: M, right: M, bottom: 16 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 18 },
      2: { cellWidth: 16 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 26, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 4) {
        data.cell.styles.halign = data.column.index === 4 ? "center" : "right";
      }
      if (data.section === "body" && linhas[data.row.index]?.tipo === "etapa") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 7;
  // bloco final (total, extenso, validade, local/data, assinatura) não se parte
  if (y > alt - 70) {
    doc.addPage();
    y = 20;
  }
  escrever(`Valor global da proposta: R$ ${fmt(dados.totalGeral, 2, 2)}`, {
    tamanho: 10,
    negrito: true,
    entre: 5,
  });
  escrever(`(${dados.totalExtenso})`, { tamanho: 9, entre: 4.5 });
  y += 2;
  escrever(dados.validade, { tamanho: 9 });
  if (dados.localData) escrever(dados.localData, { tamanho: 9 });

  y += 18;
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

/** Gera e baixa o Excel. */
export async function baixarPropostaExcel(dados, nomeArquivo) {
  XLSX.writeFile(montarPlanilhaProposta(dados), nomeArquivo);
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/web && npx vitest run src/lib/proposta-export.test.js
```

Expected: `✓ src/lib/proposta-export.test.js (9 tests)`, `Test Files  1 passed (1)`, `Tests  9 passed (9)` (os testes de PDF levam de 0,5 a 2 s neste PC; têm tempo-limite de 20 s).

- [ ] **Step 6: Suíte inteira e formatação**

```bash
cd apps/web && npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/lib/proposta-export.js apps/web/src/lib/proposta-export.test.js apps/web/package.json
```

Expected: a suíte do fim da Task 7 com **1 arquivo e 9 testes a mais**, toda passando; Prettier `All matched files use Prettier code style!`. (O `package-lock.json` está no `.prettierignore`.) O build fica para a Task 9: até lá nenhum componente importa o `proposta-export`.

- [ ] **Step 7: Commit (só os 4 caminhos da task)**

```bash
git status --short
git add package-lock.json apps/web/package.json apps/web/src/lib/proposta-export.js apps/web/src/lib/proposta-export.test.js
git commit -F - -- package-lock.json apps/web/package.json apps/web/src/lib/proposta-export.js apps/web/src/lib/proposta-export.test.js <<'EOF'
feat(orcamento): proposta em PDF (jspdf-autotable) e em Excel com fórmulas

- jspdf-autotable ^3.8.4 na workspace apps/web
- montarPlanilhaProposta: aba Proposta com ROUND(Fn*Gn,2) nos itens e SUBTOTAL(9,...) nas
  etapas e no total geral, sempre com o valor em cache; etapa em maiúsculas (o SheetJS CE
  não grava negrito)
- gerarPdfProposta: A4 paisagem, cabeçalho da tabela repetido, etapas em negrito, valor por
  extenso, validade, local/data, assinatura e "Página X de Y"; texto fora do WinAnsi trocado
- baixarPropostaPdf/baixarPropostaExcel carregam jspdf e jspdf-autotable só no clique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `4 files changed`, só esses quatro caminhos.

---

### Task 9: Diálogo "Exportar proposta", versão em Rascunho e limpeza do CSV antigo

**Files:**

- Create: `apps/web/src/components/oportunidades/ExportarPropostaDialog.jsx`
- Modify: `apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx` (criado na Task 5: import `:3` e `:16`, props `:50-51`, estado `:65`, âncora do botão `:210`)
- Modify: `apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx` (import do ícone `:36`; props `:119-122` e `:136`; input oculto do CSV `:783-789`, que a Task 5 deixa logo acima da barra; itens do menu "Ações" `:850-869`)
- Modify: `apps/web/src/pages/Oportunidades.jsx` (import da Task 6 `:9`; ref `:249`; handlers `:1056-1195`; ramo "importar" `:1227-1230`; props `:1804-1807` e `:1821`)
- Modify: `apps/web/src/components/dashboard/CalendarioConsolidado.jsx` (ref `:98`; props `:714-717` e `:729`)
- Modify: `apps/web/src/components/oportunidades/PropostasOportunidade.jsx` (ícones `:6`; data `:156-158`; botões `:171`)
- Test: sem teste de componente (Vitest em node, sem DOM). A lógica está nas Tasks 1, 7 e 8; os componentes são verificados por ESLint, build e o roteiro da Task 12.

Os números de linha são do HEAD de 29/09 (antes das Tasks 5 e 6) e só orientam: use sempre o texto das âncoras.

**Interfaces:**

- Consumes (Task 1, `@/lib/orcamento-desconto`): `resumoOrcamento(itens): { totalReferencia, totalProposta, descontoReal, itensSemReferencia, qtdItens, qtdEtapas }`.
- Consumes (Task 7): `formatarCpf(cpf)` (`@/lib/cpf`); `validarRepresentante`, `montarDadosProposta`, `nomeArquivoProposta`, `descricaoVersaoProposta` (`@/lib/proposta-orcamento`).
- Consumes (Task 8, **import dinâmico** de `@/lib/proposta-export`): `baixarPropostaPdf(dados, nomeArquivo)`, `baixarPropostaExcel(dados, nomeArquivo)`.
- Consumes (Task 5): a barra com a linha-âncora `{/* Exportar proposta: botão e diálogo entram aqui (Task 9) */}`, `temItens`, `aplicando`, `Button`; no `OportunidadeDetalhe`, o `<OrcamentoLicitacaoBarra` logo depois do `<input ... onChange={onImportarOrcamento} />` e o card "Importar" já abrindo o diálogo novo (`abrirImportacaoPlanilha`).
- Consumes (Task 6): em `Oportunidades.jsx`, a linha `import { totalLinhaLegado } from "@/lib/orcamento-desconto";` (troca 7.1), usada só na importação CSV (troca 7.3), que esta task apaga.
- Produces:
  - `ExportarPropostaDialog` (default export), props `{ open, onOpenChange, selectedOp, empresaAtiva, orcamentoItens, user }`;
  - `OrcamentoLicitacaoBarra` ganha a prop `user` (o `OportunidadeDetalhe` passa `user={user}`);
  - `OportunidadeDetalhe` **perde** as props `onExportarExcel`, `onExportarPDF`, `onBaixarModelo`, `onImportarOrcamento` e `fileInputOrcamentoRef` (os dois chamadores, `Oportunidades.jsx` e `CalendarioConsolidado.jsx`, deixam de passá-las).

**Decisões desta task (o contrato não cobria):**

- **`data_envio` (conferido na `0066_proposta_versionada.sql`):** o `tg_proposta_imutavel` levanta erro com `old.data_envio is distinct from new.data_envio`, e `null` → data também é "distinct": **não** pode ir de nulo para uma data. Além disso, a coluna tem `default current_date`, então a versão em Rascunho já nasce com a data do registro. O "Marcar enviada" grava **só o `status`** (reusa o `handleStatus` que já existe). Na lista, a data (" em dd/mm/aaaa") deixa de aparecer enquanto a versão está em Rascunho, porque ali ela é a data do registro, não a do envio.
  - **Observação (conferência M9; sem mudança de código):** depois do "Marcar enviada", a lista volta a mostrar " em dd/mm/aaaa", mas essa data continua sendo a do **registro** da versão (a do `default current_date`, que o trigger da `0066` não deixa mudar), não a do envio. O modelo não guarda a data real do envio; fica aceito e anotado.
- **"Marcar enviada"** aparece em toda versão em Rascunho (não só na mais recente), com `window.confirm`, porque a tela não tem como voltar para Rascunho.
- **"Registrar como nova versão"** vem **marcado** (o ☑ da spec). Depois de registrar, ele se desmarca sozinho e o diálogo **continua aberto**, para gerar o outro formato sem criar uma versão repetida; o diálogo fecha no "Fechar". Ao reabrir, volta tudo ao padrão.
- **Representante:** lido de `Empresa.get(empresaAtiva.id)` ao abrir (o `empresaAtiva` da sessão pode ser anterior à 0127); enquanto carrega, os três campos e o "Gerar" ficam desabilitados (a resposta não apaga o que o usuário digitou). O nome vazio mostra o `responsavel_principal` como placeholder. O CPF é mascarado com `formatarCpf` ao digitar.
- **Validações no "Gerar":** orçamento sem itens, `validarRepresentante`, validade inteira de 1 a 365 dias, data preenchida. Erros em toast.
- **Botão "Exportar proposta"** aparece para quem vê a aba, quando há itens (`temItens`): não grava nada sem o "Registrar", e o card de Propostas já deixa qualquer usuário do tenant criar versão.
- **`@/lib/proposta-export` por import dinâmico** no "Gerar": `xlsx`, `jspdf` e `jspdf-autotable` ficam fora dos chunks do Dashboard e da página de Oportunidades.
- **Limpeza do CSV antigo (decisão do contrato, detalhada):** saem do menu "Ações" os 4 itens (Baixar Modelo, Importar Planilha, Exportar Excel, Exportar PDF). Com eles saem: o `<input type="file" accept=".csv">` oculto; as props `onExportarExcel`, `onExportarPDF`, `onBaixarModelo`, `onImportarOrcamento` e `fileInputOrcamentoRef` (no componente e nos dois chamadores); os 4 handlers de `Oportunidades.jsx`; o `fileInputOrcamentoRef` da página e o `fileInputRef` do `CalendarioConsolidado`; o ramo `"importar"` de `handleNovoOrcamentoSelect` (desde a Task 5 o card "Importar" abre o diálogo novo); o ícone `Download` do `OportunidadeDetalhe` (só esses itens o usavam); e o import `totalLinhaLegado` que a Task 6 pôs na página só para a importação CSV. O menu fica com Salvar como Template, Aplicar Template e Apagar Lista Completa.
- **Os 4 handlers saem por script, não por Edit:** são ~146 linhas contíguas (depois da Task 6) e a Task 6 mudou uma linha no meio delas (7.3). O script corta do começo de `handleExportarOrcamentoExcel` até o começo de `handleLimparOrcamento`, e recusa se algum dos dois marcadores não for único.

- [ ] **Step 1: Linha de base do lint**

```bash
cd apps/web && npx eslint src/components/oportunidades/OportunidadeDetalhe.jsx src/components/oportunidades/OrcamentoLicitacaoBarra.jsx src/components/oportunidades/PropostasOportunidade.jsx src/pages/Oportunidades.jsx src/components/dashboard/CalendarioConsolidado.jsx 2>&1 | tail -2
```

Anote o total. Em 29/09 (e depois das Tasks 5 e 6, que não acrescentam aviso) era `✖ 11 problems (0 errors, 11 warnings)`: 1 no `OportunidadeDetalhe` (`cronogramaEtapas`), 8 no `Oportunidades` e 2 no `CalendarioConsolidado` (`setMateriais`, `setUploadingFile`), todos antigos.

- [ ] **Step 2: Criar `apps/web/src/components/oportunidades/ExportarPropostaDialog.jsx`**

<!-- prettier-ignore -->
```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { resumoOrcamento } from "@/lib/orcamento-desconto";
import {
  descricaoVersaoProposta,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
} from "@/lib/proposta-orcamento";

const localDaEmpresa = (e) =>
  [e?.cidade, e?.estado]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join("/");

const formatPct = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Exportar proposta" (PDF ou Excel) do orçamento da oportunidade, com a opção
 * de registrar a versão (proposta_oportunidade, status Rascunho) na aba Geral.
 *
 * O representante legal vem de `empresa.representante_*` (lido de novo ao
 * abrir: o empresaAtiva da sessão pode ser anterior à migração 0127) e pode ser
 * editado aqui só para esta exportação: em produção só o super admin grava na
 * tabela `empresa` (RLS), então o Admin de uma empresa cliente ajusta por aqui.
 */
export default function ExportarPropostaDialog({
  open,
  onOpenChange,
  selectedOp,
  empresaAtiva,
  orcamentoItens,
  user,
}) {
  const [formato, setFormato] = useState("pdf");
  const [validade, setValidade] = useState("60");
  const [local, setLocal] = useState("");
  const [data, setData] = useState("");
  const [representante, setRepresentante] = useState({ nome: "", cargo: "", cpf: "" });
  const [registrar, setRegistrar] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [versaoRegistrada, setVersaoRegistrada] = useState(null);

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
    setValidade("60");
    setData(format(new Date(), "yyyy-MM-dd"));
    setRegistrar(true);
    setVersaoRegistrada(null);
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

  const resumo = useMemo(() => resumoOrcamento(orcamentoItens || []), [orcamentoItens]);
  const descontoPct = Number(selectedOp?.desconto_proposta_pct) || 0;

  const gerar = async () => {
    if (!selectedOp?.id || !empresaId) return;
    if (resumo.qtdItens === 0) {
      toast.error("O orçamento não tem itens para exportar");
      return;
    }
    const validacao = validarRepresentante(representante);
    if (!validacao.ok) {
      toast.error(validacao.erros.join(". "));
      return;
    }
    const dias = Number(validade);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      toast.error("Validade: informe de 1 a 365 dias");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      toast.error("Informe a data da proposta");
      return;
    }

    setGerando(true);
    try {
      const dados = montarDadosProposta({
        itens: orcamentoItens || [],
        info: selectedOp.orcamento_info,
        oportunidade: selectedOp,
        empresa: empresa || empresaAtiva,
        representante,
        opcoes: { validadeDias: dias, local, dataISO: data },
      });
      const nomeOp = selectedOp.nome || selectedOp.titulo || "";
      // import dinâmico: xlsx, jspdf e jspdf-autotable só descem no clique
      const { baixarPropostaExcel, baixarPropostaPdf } = await import("@/lib/proposta-export");
      if (formato === "pdf") {
        await baixarPropostaPdf(dados, nomeArquivoProposta(nomeOp, data, "pdf"));
      } else {
        await baixarPropostaExcel(dados, nomeArquivoProposta(nomeOp, data, "xlsx"));
      }

      if (!registrar) {
        toast.success("Proposta gerada");
        return;
      }
      try {
        const criada = await sigo.entities.PropostaOportunidade.create({
          empresa_id: empresaId,
          oportunidade_id: selectedOp.id,
          valor: dados.totalGeral,
          descricao: descricaoVersaoProposta({
            descontoPct,
            descontoReal: resumo.descontoReal,
            qtdItens: resumo.qtdItens,
          }),
          status: "Rascunho",
          criado_por_email: user?.email || null,
          criado_por_nome: user?.full_name || user?.email || null,
        });
        // gerar o outro formato em seguida não registra a mesma versão de novo
        setRegistrar(false);
        setVersaoRegistrada(criada?.versao ?? null);
        toast.success(
          `Proposta gerada e registrada como versão v${criada?.versao ?? "?"} (Rascunho), na aba Geral`
        );
      } catch (err) {
        console.error("Erro ao registrar a versão da proposta:", err);
        toast.error(
          `Arquivo gerado, mas a versão não foi registrada: ${err?.message || "erro desconhecido"}`
        );
      }
    } catch (err) {
      console.error("Erro ao gerar a proposta:", err);
      toast.error(`Erro ao gerar a proposta: ${err?.message || "erro desconhecido"}`);
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
          <DialogTitle>Exportar proposta</DialogTitle>
          <DialogDescription>
            {`Total da proposta: ${formatBRL(resumo.totalProposta)} · ${resumo.qtdItens} ${
              resumo.qtdItens === 1 ? "item" : "itens"
            } · desconto de ${formatPct(descontoPct)}% (real ${formatPct(resumo.descontoReal)}%)`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="proposta-validade" className="text-xs text-slate-600">
                Validade (dias)
              </Label>
              <Input
                id="proposta-validade"
                inputMode="numeric"
                value={validade}
                onChange={(e) => setValidade(e.target.value.replace(/\D/g, ""))}
                disabled={gerando}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="proposta-local" className="text-xs text-slate-600">
                Local
              </Label>
              <Input
                id="proposta-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Cidade/UF"
                disabled={gerando}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="proposta-data" className="text-xs text-slate-600">
                Data
              </Label>
              <Input
                id="proposta-data"
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
                <Label htmlFor="proposta-rep-nome" className="text-xs text-slate-600">
                  Nome *
                </Label>
                <Input
                  id="proposta-rep-nome"
                  value={representante.nome}
                  onChange={mudarRep("nome")}
                  placeholder={empresa?.responsavel_principal || ""}
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="proposta-rep-cargo" className="text-xs text-slate-600">
                  Cargo
                </Label>
                <Input
                  id="proposta-rep-cargo"
                  value={representante.cargo}
                  onChange={mudarRep("cargo")}
                  placeholder="Sócio-administrador"
                  disabled={gerando || carregando}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="proposta-rep-cpf" className="text-xs text-slate-600">
                  CPF
                </Label>
                <Input
                  id="proposta-rep-cpf"
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="proposta-registrar"
              checked={registrar}
              onCheckedChange={(v) => setRegistrar(v === true)}
              disabled={gerando}
            />
            <Label htmlFor="proposta-registrar" className="text-sm font-normal">
              Registrar como nova versão da proposta
            </Label>
          </div>
          {versaoRegistrada != null && (
            <p className="text-xs text-green-700">
              {`Versão v${versaoRegistrada} registrada como Rascunho (aba Geral → Propostas).`}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Fechar
          </Button>
          <Button onClick={gerar} disabled={gerando || carregando}>
            {gerando && <Loader2 className="w-4 h-4 animate-spin" />}
            {formato === "pdf" ? "Gerar PDF" : "Gerar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Botão e diálogo na barra (`OrcamentoLicitacaoBarra.jsx`, 5 trocas com Edit)**

  3.1 — ícone

old:

```jsx
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
```

new:

```jsx
import { Download, FileDown, Loader2, Sparkles, Upload } from "lucide-react";
```

3.2 — import do diálogo

old:

```jsx
import ImportarPlanilhaOrcamentoDialog from "./ImportarPlanilhaOrcamentoDialog";
```

new:

```jsx
import ImportarPlanilhaOrcamentoDialog from "./ImportarPlanilhaOrcamentoDialog";
import ExportarPropostaDialog from "./ExportarPropostaDialog";
```

3.3 — prop `user`

old:

```jsx
  importarAberto,
  onImportarAbertoChange,
}) {
```

new:

```jsx
  importarAberto,
  onImportarAbertoChange,
  user,
}) {
```

3.4 — estado do diálogo

old:

<!-- prettier-ignore -->
```jsx
  const [baixandoSkill, setBaixandoSkill] = useState(false);
```

new:

<!-- prettier-ignore -->
```jsx
  const [baixandoSkill, setBaixandoSkill] = useState(false);
  const [exportarAberto, setExportarAberto] = useState(false);
```

3.5 — o botão e o diálogo no lugar da âncora da Task 5 (o `Dialog` do Radix não desenha nada no lugar: abre em portal)

old:

<!-- prettier-ignore -->
```jsx
          {/* Exportar proposta: botão e diálogo entram aqui (Task 9) */}
```

new:

<!-- prettier-ignore -->
```jsx
          {temItens && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportarAberto(true)}
              disabled={aplicando}
            >
              <FileDown className="w-4 h-4" />
              Exportar proposta
            </Button>
          )}
          <ExportarPropostaDialog
            open={exportarAberto}
            onOpenChange={setExportarAberto}
            selectedOp={selectedOp}
            empresaAtiva={empresaAtiva}
            orcamentoItens={orcamentoItens}
            user={user}
          />
```

Confira:

```bash
cd apps/web && grep -c "ExportarPropostaDialog\|setExportarAberto\|user={user}\|FileDown" src/components/oportunidades/OrcamentoLicitacaoBarra.jsx
grep -c "entram aqui (Task 9)" src/components/oportunidades/OrcamentoLicitacaoBarra.jsx
```

Expected: `8` (os 2 imports, o `useState`, o `onClick`, o `<FileDown`, o `<ExportarPropostaDialog`, o `onOpenChange` e o `user={user}`) e `0`.

- [ ] **Step 4: `OportunidadeDetalhe.jsx` (6 trocas com Edit)**

  4.1 — tirar as 4 props do CSV antigo da assinatura

old:

```jsx
  onLimparOrcamento,
  onExportarExcel,
  onExportarPDF,
  onBaixarModelo,
  onImportarOrcamento,
  onDeleteOrcamentoItem,
```

new:

```jsx
  onLimparOrcamento,
  onDeleteOrcamentoItem,
```

4.2 — tirar a prop `fileInputOrcamentoRef`

old:

```jsx
  fileInputOrcamentoRef,
  uploadingFile,
  onReloadArquivos,
}) {
```

new:

```jsx
  uploadingFile,
  onReloadArquivos,
}) {
```

4.3 — tirar o input oculto do CSV (a barra da Task 5 fica)

old:

```jsx
                        <input
                          ref={fileInputOrcamentoRef}
                          type="file"
                          className="hidden"
                          accept=".csv"
                          onChange={onImportarOrcamento}
                        />

                        <OrcamentoLicitacaoBarra
```

new:

```jsx
                        <OrcamentoLicitacaoBarra
```

4.4 — `user` para a barra (registrar a versão com quem criou)

old:

<!-- prettier-ignore -->
```jsx
                          podeEditar={podeEditarOrcamento}
                          importarAberto={importarAberto}
```

new:

<!-- prettier-ignore -->
```jsx
                          podeEditar={podeEditarOrcamento}
                          user={user}
                          importarAberto={importarAberto}
```

4.5 — tirar os 4 itens do menu "Ações" (fica um separador antes de "Apagar Lista Completa")

old:

```jsx
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onBaixarModelo} className="gap-2">
                                      <Download className="w-4 h-4 text-purple-600" />
                                      Baixar Modelo
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => fileInputOrcamentoRef.current?.click()}
                                      className="gap-2"
                                    >
                                      <Download className="w-4 h-4 text-blue-600" />
                                      Importar Planilha
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onExportarExcel} className="gap-2">
                                      <FileText className="w-4 h-4 text-green-600" />
                                      Exportar Excel
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onExportarPDF} className="gap-2">
                                      <FileText className="w-4 h-4 text-red-600" />
                                      Exportar PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
```

new:

<!-- prettier-ignore -->
```jsx
                                    <DropdownMenuSeparator />
```

4.6 — o ícone `Download` ficou sem uso. Antes, confira:

```bash
cd apps/web && grep -c "<Download" src/components/oportunidades/OportunidadeDetalhe.jsx
```

Expected: `0`. (Se der mais que 0, outra alteração passou a usar o ícone: pule a 4.6.)

old:

```jsx
  FileText,
  Download,
  Plus,
```

new:

```jsx
  FileText,
  Plus,
```

- [ ] **Step 5: `pages/Oportunidades.jsx` (4 trocas com Edit, 1 script e o import órfão)**

  5.1 — o ref do input do CSV

old:

<!-- prettier-ignore -->
```jsx
  const updateTimeoutRef = React.useRef({});
  const fileInputOrcamentoRef = React.useRef(null);
```

new:

<!-- prettier-ignore -->
```jsx
  const updateTimeoutRef = React.useRef({});
```

5.2 — o ramo `"importar"` de `handleNovoOrcamentoSelect` (o card chama `abrirImportacaoPlanilha` desde a Task 5). O ramo `"zero"`, acima, já tem o `proximaOrdem` da Task 6 e não entra na âncora.

old:

```jsx
    } else if (tipo === "modelo") {
      setShowAplicarTemplate(true);
    } else if (tipo === "importar") {
      fileInputOrcamentoRef.current?.click();
    }
  };
```

new:

```jsx
    } else if (tipo === "modelo") {
      setShowAplicarTemplate(true);
    }
  };
```

5.3 — as 4 props do CSV antigo no `<OportunidadeDetalhe`

old:

<!-- prettier-ignore -->
```jsx
        onLimparOrcamento={handleLimparOrcamento}
        onExportarExcel={handleExportarOrcamentoExcel}
        onExportarPDF={handleExportarOrcamentoPDF}
        onBaixarModelo={handleBaixarModeloOrcamento}
        onImportarOrcamento={handleImportarOrcamento}
```

new:

<!-- prettier-ignore -->
```jsx
        onLimparOrcamento={handleLimparOrcamento}
```

5.4 — a prop `fileInputOrcamentoRef`

old:

<!-- prettier-ignore -->
```jsx
        fileInputOrcamentoRef={fileInputOrcamentoRef}
        uploadingFile={uploadingFile}
```

new:

<!-- prettier-ignore -->
```jsx
        uploadingFile={uploadingFile}
```

5.5 — apagar os 4 handlers (`handleExportarOrcamentoExcel`, `handleExportarOrcamentoPDF`, `handleBaixarModeloOrcamento`, `handleImportarOrcamento`), que ficam contíguos entre `formatModalidade` e `handleLimparOrcamento`. Em `apps/web`:

```bash
cd apps/web && node - <<'EOF'
const fs = require("fs");
const arq = "src/pages/Oportunidades.jsx";
const t = fs.readFileSync(arq, "utf8");
const ini = "  const handleExportarOrcamentoExcel = () => {";
const fim = "  const handleLimparOrcamento = async () => {";
const conta = (s) => t.split(s).length - 1;
if (conta(ini) !== 1 || conta(fim) !== 1) {
  throw new Error(`marcadores: início ${conta(ini)}x, fim ${conta(fim)}x (esperado 1 e 1)`);
}
const a = t.indexOf(ini);
const b = t.indexOf(fim);
const trecho = t.slice(a, b);
for (const nome of [
  "handleExportarOrcamentoPDF",
  "handleBaixarModeloOrcamento",
  "handleImportarOrcamento",
]) {
  if (!trecho.includes(`const ${nome} =`)) throw new Error(`${nome} fora do trecho`);
}
fs.writeFileSync(arq, t.slice(0, a) + t.slice(b));
console.log(`removidas ${trecho.split("\n").length - 1} linhas`);
EOF
```

Expected: `removidas 146 linhas` (141 no HEAD de 29/09 + as 5 que a troca 7.3 da Task 6 acrescentou). Um número um pouco diferente só indica outra formatação da 7.3; erro de marcador significa que o texto mudou: pare e confira.

5.6 — o import que a Task 6 pôs só para a importação CSV ficou órfão. Confira:

```bash
cd apps/web && grep -n "totalLinhaLegado" src/pages/Oportunidades.jsx
```

Expected: **uma** linha, a do import (`9:import { totalLinhaLegado } from "@/lib/orcamento-desconto";`). Tire-a:

old:

```jsx
import { normalizarTexto } from "@/lib/busca";
import { totalLinhaLegado } from "@/lib/orcamento-desconto";
```

new:

```jsx
import { normalizarTexto } from "@/lib/busca";
```

(Se o `grep` mostrar outro uso além do import, pule a 5.6.)

- [ ] **Step 6: `components/dashboard/CalendarioConsolidado.jsx` (3 trocas com Edit)**

  6.1 — o ref que só servia ao input do CSV

old:

<!-- prettier-ignore -->
```jsx
  const updateTimeoutRef = useRef({});
  const fileInputRef = useRef(null);
```

new:

<!-- prettier-ignore -->
```jsx
  const updateTimeoutRef = useRef({});
```

6.2 — as 4 props vazias do CSV antigo

old:

```jsx
        onLimparOrcamento={async () => {}}
        onExportarExcel={() => {}}
        onExportarPDF={async () => {}}
        onBaixarModelo={() => {}}
        onImportarOrcamento={async () => {}}
```

new:

```jsx
        onLimparOrcamento={async () => {}}
```

6.3 — a prop `fileInputOrcamentoRef`

old:

<!-- prettier-ignore -->
```jsx
        fileInputOrcamentoRef={fileInputRef}
        uploadingFile={uploadingFile}
```

new:

<!-- prettier-ignore -->
```jsx
        uploadingFile={uploadingFile}
```

- [ ] **Step 7: `PropostasOportunidade.jsx` — "Marcar enviada" (3 trocas com Edit)**

  7.1 — ícone `Send` (a lista quebra em várias linhas: o Prettier passa de 100 colunas com ele)

old:

```jsx
import { FileSignature, Loader2, Plus, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
```

new:

<!-- prettier-ignore -->
```jsx
import {
  FileSignature,
  Loader2,
  Plus,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Send,
} from "lucide-react";
```

7.2 — sem data na versão em Rascunho (é a data do registro)

old:

<!-- prettier-ignore -->
```jsx
                {p.data_envio
                  ? ` em ${new Date(p.data_envio + "T12:00:00").toLocaleDateString("pt-BR")}`
                  : ""}
```

new:

<!-- prettier-ignore -->
```jsx
                {p.data_envio && p.status !== "Rascunho"
                  ? ` em ${new Date(p.data_envio + "T12:00:00").toLocaleDateString("pt-BR")}`
                  : ""}
```

7.3 — o botão, antes dos de Aceita/Recusada

old:

```jsx
                {i === 0 && p.status === "Enviada" && (
```

new:

```jsx
                {p.status === "Rascunho" && (
                  <button
                    title="Marcar enviada"
                    onClick={() => {
                      if (window.confirm(`Marcar a proposta v${p.versao} como enviada?`)) {
                        handleStatus(p, "Enviada");
                      }
                    }}
                    className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-blue-700 hover:bg-blue-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Marcar enviada
                  </button>
                )}
                {i === 0 && p.status === "Enviada" && (
```

- [ ] **Step 8: Conferir que não sobrou nada do CSV antigo**

```bash
cd apps/web && grep -n "fileInputOrcamentoRef\|onImportarOrcamento\|onBaixarModelo\|onExportarExcel\|onExportarPDF\|handleExportarOrcamento\|handleBaixarModeloOrcamento\|handleImportarOrcamento\|fileInputRef" src/pages/Oportunidades.jsx src/components/oportunidades/OportunidadeDetalhe.jsx src/components/dashboard/CalendarioConsolidado.jsx; echo "exit $?"
grep -c "Marcar enviada\|Send\|p.status !== \"Rascunho\"" src/components/oportunidades/PropostasOportunidade.jsx
grep -c "user={user}" src/components/oportunidades/OportunidadeDetalhe.jsx
```

Expected: nenhuma linha e `exit 1` no primeiro; `5` no segundo (o import do `Send`, a condição da data, o `title`, o `<Send` e o texto do botão); `4` no terceiro (os 3 que já existiam + o da barra).

- [ ] **Step 9: Lint, build, chunks, suíte e formatação**

```bash
cd apps/web && npx eslint src/components/oportunidades/ExportarPropostaDialog.jsx; echo "exit $?"
npx eslint src/components/oportunidades/OportunidadeDetalhe.jsx src/components/oportunidades/OrcamentoLicitacaoBarra.jsx src/components/oportunidades/PropostasOportunidade.jsx src/pages/Oportunidades.jsx src/components/dashboard/CalendarioConsolidado.jsx 2>&1 | tail -2
npm run build > /dev/null && echo BUILD_OK
ls dist/assets | grep -E "autotable|proposta-export"
npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/components/oportunidades/ExportarPropostaDialog.jsx apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/components/oportunidades/PropostasOportunidade.jsx apps/web/src/pages/Oportunidades.jsx apps/web/src/components/dashboard/CalendarioConsolidado.jsx
```

Expected:

- ESLint do diálogo: nenhuma saída e `exit 0`;
- ESLint dos outros 5: **o mesmo total do Step 1** (em 29/09, `✖ 11 problems (0 errors, 11 warnings)`), sem aviso novo. Um `error` de `unused-imports/no-unused-imports` indica import órfão (ex.: a 4.6 ou a 5.6 puladas sem motivo);
- `BUILD_OK` (neste PC, uns 5 minutos);
- `ls`: duas linhas, `jspdf.plugin.autotable-<hash>.js` e `proposta-export-<hash>.js` (chunks próprios, baixados só no "Gerar");
- suíte igual ao fim da Task 8 (esta task não acrescenta teste), toda passando;
- Prettier: `All matched files use Prettier code style!`.

Não teste no `npm run dev` antes da Task 12: o dev aponta para o Supabase de produção, onde a 0127 ainda não existe, e o "Registrar" grava de verdade em `proposta_oportunidade`. O roteiro da Task 12 cobre exportar PDF e Excel, registrar a versão e "Marcar enviada".

- [ ] **Step 10: Commit (só os 6 caminhos da task)**

```bash
git status --short
git add apps/web/src/components/oportunidades/ExportarPropostaDialog.jsx apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/components/oportunidades/PropostasOportunidade.jsx apps/web/src/pages/Oportunidades.jsx apps/web/src/components/dashboard/CalendarioConsolidado.jsx
git commit -F - -- apps/web/src/components/oportunidades/ExportarPropostaDialog.jsx apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/components/oportunidades/OportunidadeDetalhe.jsx apps/web/src/components/oportunidades/PropostasOportunidade.jsx apps/web/src/pages/Oportunidades.jsx apps/web/src/components/dashboard/CalendarioConsolidado.jsx <<'EOF'
feat(oportunidades): exportar proposta em PDF/Excel, registrar versão e marcar enviada

- ExportarPropostaDialog: formato, validade, local, data, representante legal (lido da
  empresa e editável só para a exportação) e "Registrar como nova versão" (Rascunho)
- barra do orçamento ganha o botão "Exportar proposta"
- saem do menu Ações os itens CSV antigos (Baixar Modelo, Importar Planilha, Exportar Excel
  e Exportar PDF), o input oculto do CSV e os handlers e props que só serviam a eles
  (Oportunidades, OportunidadeDetalhe e CalendarioConsolidado)
- Propostas: "Marcar enviada" na versão em Rascunho; muda só o status, porque a data_envio
  é imutável no trigger da 0066

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `6 files changed`, só esses seis caminhos.

---

## Parte E — Task 10: representante legal em Configurações → Empresa

**Regras desta parte:**

- Comandos a partir da raiz do repositório (`C:/Users/javer/sigoobras-base`), no Git Bash; os que precisam de `apps/web` entram lá num subshell `( ... )`.
- Arquivo novo: crie com a ferramenta Write, copiando o bloco como está. Arquivo existente: aplique cada troca **old → new com a ferramenta Edit** (as âncoras abaixo são únicas no arquivo atual, que está em LF pelo `.gitattributes` com `eol=lf`). Não reescreva arquivo existente inteiro.
- **Commit parcial:** outras sessões mexem no repositório. `git add` só dos arquivos da task e `git commit -F - -- <caminhos>`. Se o hook do lint-staged recusar o commit com caminhos, confira com `git diff --cached --name-only` que só os arquivos da task estão no índice e rode o mesmo `git commit -F -` sem o `-- <caminhos>`.
- Os blocos desta parte já passaram, numa cópia fora do repositório, no Prettier do repositório, no ESLint do `apps/web` e no Vitest (junto com o `cpf.js` da Task 7).

---

### Task 10: Representante legal em Configurações → Empresa

**Files:**

- Create: `apps/web/src/lib/representante-empresa.js`
- Test: `apps/web/src/lib/representante-empresa.test.js`
- Modify: `apps/web/src/pages/Configuracoes.jsx` (import; `empresaData` dentro do `loadData`; `handleSaveEmpresa`)
- Modify: `apps/web/src/components/configuracoes/EmpresaTab.jsx` (import; seção nova entre o bloco "Responsável" e o `</CardContent>`)

**Interfaces:**

- Consumes (Task 7, `apps/web/src/lib/cpf.js`):
  - `validarCpf(cpf: string): boolean` (11 dígitos, dígitos verificadores, recusa todos iguais);
  - `formatarCpf(cpf): string` → `000.000.000-00`, **progressiva** (`"5299"` → `"529.9"`), que corta em 11 dígitos, ignora o que não é dígito e devolve `""` para vazio/`null`.
  - `validarCpf` é chamada aqui só com a string de dígitos (`"52998224725"`). `formatarCpf` é chamada também com o texto do campo enquanto se digita (`EmpresaTab`), sem função de máscara própria: a máscara do campo **é** a `formatarCpf` da Task 7.
- Consumes (Task 4): colunas `empresa.representante_nome`, `representante_cargo` e `representante_cpf` (text) da `0127`, aplicada só na Task 12.
- Produces (`apps/web/src/lib/representante-empresa.js`, exports nomeados; **não estão no contrato**, são desta task):
  - `ERRO_CPF_REPRESENTANTE: string` = `"CPF do representante legal inválido. Corrija ou deixe em branco."`;
  - `prepararRepresentanteEmpresa(empresaData): { ok: true, dados: object } | { ok: false, erro: string }`: cópia de `empresaData` com **todas** as chaves, nome e cargo sem espaços nas pontas, CPF `000.000.000-00` ou `""`; erro se o CPF informado for inválido.
- Produces (dados, para a Task 9): `Empresa.get(id).representante_nome/cargo/cpf` com nome e cargo aparados e CPF formatado ou `""` (nunca CPF inválido gravado por esta tela).

> **Não clique em Salvar na aba Empresa no `npm run dev` antes da Task 12.** O dev aponta para o Supabase de produção e, sem a `0127`, o Salvar manda as colunas novas e o PostgREST responde PGRST204 (erro, nada gravado). Esta task é verificada por teste, lint e build; a tela é conferida no roteiro da Task 12.

- [ ] **Step 1: Linha de base e dependência da Task 7**

```bash
git status --short -- apps/web/src/pages/Configuracoes.jsx apps/web/src/components/configuracoes/EmpresaTab.jsx
grep -nE "^export function (validarCpf|formatarCpf)\(" apps/web/src/lib/cpf.js
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Expected:

- `git status`: nenhuma linha. Se aparecer `M` num dos dois arquivos, outra sessão está mexendo neles: **pare** e avise o Javerson;
- `grep`: duas linhas (`export function validarCpf(` e `export function formatarCpf(`). Sem elas, a Task 7 ainda não foi feita: faça a Task 7 antes;
- Vitest: anote `Test Files  N passed` e `Tests  M passed`. Ao fim desta task devem ser `N + 1` e `M + 7`, sem falhas.

- [ ] **Step 2: Escrever o teste que falha**

Crie `apps/web/src/lib/representante-empresa.test.js`:

<!-- prettier-ignore -->
```js
import { describe, it, expect } from "vitest";
import { ERRO_CPF_REPRESENTANTE, prepararRepresentanteEmpresa } from "./representante-empresa";

describe("prepararRepresentanteEmpresa", () => {
  const base = {
    nome: "Sinergia",
    cnpj: "28182842000120",
    responsavel_principal: "Javerson",
    tema_cores: { primaria: "#f59e0b" },
  };

  it("CPF válido sem máscara é gravado formatado; nome e cargo sem espaços nas pontas", () => {
    const r = prepararRepresentanteEmpresa({
      ...base,
      representante_nome: "  Javerson Rodrigues ",
      representante_cargo: " Sócio-administrador ",
      representante_cpf: "52998224725",
    });
    expect(r.ok).toBe(true);
    expect(r.dados.representante_nome).toBe("Javerson Rodrigues");
    expect(r.dados.representante_cargo).toBe("Sócio-administrador");
    expect(r.dados.representante_cpf).toBe("529.982.247-25");
  });

  it("mantém as outras chaves do formulário (o Salvar manda todas)", () => {
    const r = prepararRepresentanteEmpresa({ ...base, representante_cpf: "529.982.247-25" });
    expect(r.ok).toBe(true);
    expect(r.dados.nome).toBe("Sinergia");
    expect(r.dados.cnpj).toBe("28182842000120");
    expect(r.dados.responsavel_principal).toBe("Javerson");
    expect(r.dados.tema_cores).toEqual({ primaria: "#f59e0b" });
  });

  it("não altera o objeto recebido", () => {
    const entrada = { ...base, representante_nome: " Ana ", representante_cpf: "52998224725" };
    prepararRepresentanteEmpresa(entrada);
    expect(entrada.representante_nome).toBe(" Ana ");
    expect(entrada.representante_cpf).toBe("52998224725");
  });

  it("CPF é opcional: vazio, só espaços ou ausente grava texto vazio", () => {
    for (const cpf of ["", "   ", null, undefined]) {
      const r = prepararRepresentanteEmpresa({ ...base, representante_cpf: cpf });
      expect(r.ok).toBe(true);
      expect(r.dados.representante_cpf).toBe("");
    }
  });

  it("sem os campos do representante (empresa antiga) grava os três vazios", () => {
    const r = prepararRepresentanteEmpresa(base);
    expect(r.ok).toBe(true);
    expect(r.dados.representante_nome).toBe("");
    expect(r.dados.representante_cargo).toBe("");
    expect(r.dados.representante_cpf).toBe("");
  });

  it("CPF com dígito verificador errado, incompleto ou repetido → erro", () => {
    for (const cpf of ["529.982.247-24", "529.982.247-2", "111.111.111-11", "5299822472599"]) {
      const r = prepararRepresentanteEmpresa({ ...base, representante_cpf: cpf });
      expect(r).toEqual({ ok: false, erro: ERRO_CPF_REPRESENTANTE });
    }
  });

  it("a mensagem de erro diz o que fazer", () => {
    expect(ERRO_CPF_REPRESENTANTE).toBe(
      "CPF do representante legal inválido. Corrija ou deixe em branco."
    );
  });
});
```

(`529.982.247-25` é um CPF de exemplo com dígitos verificadores corretos; não é de ninguém do cadastro.)

- [ ] **Step 3: Rodar e ver falhar**

```bash
(cd apps/web && npx vitest run src/lib/representante-empresa.test.js 2>&1 | tail -12)
```

Expected: `FAIL  src/lib/representante-empresa.test.js`, com `Error: Failed to load url ./representante-empresa (resolved id: ./representante-empresa) in .../representante-empresa.test.js. Does the file exist?`, e `Test Files  1 failed (1)`.

- [ ] **Step 4: Implementar `apps/web/src/lib/representante-empresa.js`**

<!-- prettier-ignore -->
```js
/**
 * Representante legal da empresa (Configurações → Empresa): conferência do CPF
 * no Salvar. A máscara do campo enquanto digita é a formatarCpf de lib/cpf, usada
 * direto no EmpresaTab. O representante assina a proposta de preços exportada
 * pelo orçamento das oportunidades (spec 2026-09-29 §10).
 *
 * O CPF é opcional; se informado, precisa ter os dígitos verificadores certos.
 * Grava formatado (000.000.000-00), como o resto do sistema grava CPF.
 */
import { formatarCpf, validarCpf } from "@/lib/cpf";

export const ERRO_CPF_REPRESENTANTE =
  "CPF do representante legal inválido. Corrija ou deixe em branco.";

const soDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");
const texto = (valor) => String(valor ?? "").trim();

/**
 * Confere e normaliza os campos do representante antes do Salvar da aba Empresa.
 * Devolve uma cópia de `empresaData` (todas as chaves) com nome e cargo sem
 * espaços nas pontas e o CPF formatado, ou o erro quando o CPF é inválido.
 * @returns {{ ok: true, dados: object } | { ok: false, erro: string }}
 */
export function prepararRepresentanteEmpresa(empresaData) {
  const cpf = soDigitos(empresaData?.representante_cpf);
  if (cpf && !validarCpf(cpf)) return { ok: false, erro: ERRO_CPF_REPRESENTANTE };
  return {
    ok: true,
    dados: {
      ...empresaData,
      representante_nome: texto(empresaData?.representante_nome),
      representante_cargo: texto(empresaData?.representante_cargo),
      representante_cpf: cpf ? formatarCpf(cpf) : "",
    },
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
(cd apps/web && npx vitest run src/lib/representante-empresa.test.js 2>&1 | tail -6)
```

Expected: `✓ src/lib/representante-empresa.test.js (7 tests)`, `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

- [ ] **Step 6: `pages/Configuracoes.jsx` — carregar os campos e conferir o CPF no Salvar**

Três trocas com a ferramenta Edit.

Troca 1 (import):

old:

```jsx
import { safeParseJSON } from "@/lib/json-utils";
```

new:

```jsx
import { safeParseJSON } from "@/lib/json-utils";
import { prepararRepresentanteEmpresa } from "@/lib/representante-empresa";
```

Troca 2 (`empresaData` montado no `loadData`; sem isto o formulário abre vazio mesmo com o representante gravado):

old:

```jsx
      responsavel_principal: empresaAtiva.responsavel_principal || "",
      observacoes: empresaAtiva.observacoes || "",
```

new:

```jsx
      responsavel_principal: empresaAtiva.responsavel_principal || "",
      representante_nome: empresaAtiva.representante_nome || "",
      representante_cargo: empresaAtiva.representante_cargo || "",
      representante_cpf: empresaAtiva.representante_cpf || "",
      observacoes: empresaAtiva.observacoes || "",
```

Troca 3 (`handleSaveEmpresa`: CPF inválido → toast e não grava; grava os dados normalizados e mostra o CPF formatado na tela):

old:

```jsx
  const handleSaveEmpresa = async () => {
    setSavingEmpresa(true);
    try {
      await sigo.entities.Empresa.update(empresaAtiva.id, empresaData);
      await reloadEmpresaAtiva();
```

new:

```jsx
  const handleSaveEmpresa = async () => {
    // representante legal: CPF opcional, mas com dígitos verificadores certos
    const conferido = prepararRepresentanteEmpresa(empresaData);
    if (!conferido.ok) {
      toast.error(conferido.erro, { duration: 5000 });
      return;
    }
    setSavingEmpresa(true);
    try {
      await sigo.entities.Empresa.update(empresaAtiva.id, conferido.dados);
      setEmpresaData(conferido.dados);
      await reloadEmpresaAtiva();
```

(`toast` já é importado de `sonner` no arquivo. O `loadData` não roda de novo depois do `reloadEmpresaAtiva`, porque depende só de `empresaAtiva?.id` e `user?.email`; por isso o `setEmpresaData(conferido.dados)`.)

- [ ] **Step 7: `components/configuracoes/EmpresaTab.jsx` — seção "Representante legal"**

Duas trocas com a ferramenta Edit. Não há prop nova: `empresaData` e `setEmpresaData` já chegam ao componente, e o mesmo botão Salvar do topo do card grava tudo.

Troca 1 (import):

old:

```jsx
import TemaCustomizacao from "@/components/configuracoes/TemaCustomizacao";
import ImgStorage from "@/components/ImgStorage";
```

new:

```jsx
import TemaCustomizacao from "@/components/configuracoes/TemaCustomizacao";
import ImgStorage from "@/components/ImgStorage";
import { formatarCpf } from "@/lib/cpf";
```

Troca 2 (a seção entra depois do campo "Responsável Principal", antes do `</CardContent>`):

old:

```jsx
                setEmpresaData({ ...empresaData, responsavel_principal: e.target.value })
              }
              className="mt-1.5"
            />
          </div>
        </CardContent>
```

new:

```jsx
                setEmpresaData({ ...empresaData, responsavel_principal: e.target.value })
              }
              className="mt-1.5"
            />
          </div>

          {/* Representante legal: assina a proposta de preços do orçamento */}
          <div>
            <h4 className="font-medium text-slate-700">Representante legal</h4>
            <p className="text-xs text-slate-500 mb-3">
              Assina a proposta de preços exportada no orçamento das oportunidades.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={empresaData.representante_nome || ""}
                  onChange={(e) =>
                    setEmpresaData({ ...empresaData, representante_nome: e.target.value })
                  }
                  placeholder={empresaData.responsavel_principal || "Nome completo"}
                  className="mt-1.5"
                />
                {!empresaData.representante_nome && empresaData.responsavel_principal && (
                  <button
                    type="button"
                    onClick={() =>
                      setEmpresaData({
                        ...empresaData,
                        representante_nome: empresaData.responsavel_principal,
                      })
                    }
                    className="mt-1 text-xs text-amber-700 hover:underline"
                  >
                    Usar o responsável principal
                  </button>
                )}
              </div>
              <div>
                <Label>Cargo</Label>
                <Input
                  value={empresaData.representante_cargo || ""}
                  onChange={(e) =>
                    setEmpresaData({ ...empresaData, representante_cargo: e.target.value })
                  }
                  placeholder="Sócio-administrador"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>CPF</Label>
                <Input
                  value={empresaData.representante_cpf || ""}
                  onChange={(e) =>
                    setEmpresaData({
                      ...empresaData,
                      representante_cpf: formatarCpf(e.target.value),
                    })
                  }
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
        </CardContent>
```

Notas:

- O placeholder só **mostra** o responsável principal; não grava. Para gravar, o usuário digita ou clica em "Usar o responsável principal", que copia o texto para o campo.
- O CPF não usa `maxLength`: a máscara já corta em 11 dígitos, e um `maxLength` cortaria um CPF colado com espaços antes da máscara.

- [ ] **Step 8: Prettier, ESLint e build**

```bash
npx prettier --write apps/web/src/lib/representante-empresa.js apps/web/src/lib/representante-empresa.test.js apps/web/src/pages/Configuracoes.jsx apps/web/src/components/configuracoes/EmpresaTab.jsx
(cd apps/web && npx eslint --quiet src/pages/Configuracoes.jsx src/components/configuracoes/EmpresaTab.jsx && echo ESLINT_OK)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
git diff --stat -- apps/web/src/pages/Configuracoes.jsx apps/web/src/components/configuracoes/EmpresaTab.jsx
```

Expected:

- Prettier: os 4 arquivos com `(unchanged)`;
- `ESLINT_OK`. Sem `--quiet`, o `Configuracoes.jsx` mostra 6 avisos que já existiam (`empresas`, `setEmpresaAtiva`, `exhaustive-deps` do `loadData`, que agora lista também os 3 campos novos, e outros 3); nenhum erro;
- `BUILD_OK`;
- `git diff --stat`: `Configuracoes.jsx` com 13 linhas mudadas (12 inserções, 1 remoção) e `EmpresaTab.jsx` com 62 inserções.

- [ ] **Step 9: Suíte do front**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
```

Expected: `Test Files  N+1 passed` e `Tests  M+7 passed` (N e M do Step 1), sem `failed`.

- [ ] **Step 10: Commit**

```bash
git status --short
git add apps/web/src/lib/representante-empresa.js apps/web/src/lib/representante-empresa.test.js
git commit -F - -- apps/web/src/lib/representante-empresa.js apps/web/src/lib/representante-empresa.test.js apps/web/src/pages/Configuracoes.jsx apps/web/src/components/configuracoes/EmpresaTab.jsx <<'EOF'
feat(configuracoes): representante legal da empresa (nome, cargo e CPF) na aba Empresa

- EmpresaTab: seção "Representante legal" abaixo do Responsável Principal; com o nome vazio,
  sugere o responsável principal (placeholder e botão "Usar o responsável principal");
  CPF com máscara enquanto digita
- Configuracoes: empresaData carrega representante_nome/cargo/cpf; o Salvar recusa CPF com
  dígito verificador errado (toast, sem gravar) e grava o CPF formatado
- lib/representante-empresa: conferência do CPF no Salvar, com testes
Depende da 0127 (empresa.representante_*): a migração sobe antes do push. Spec 2026-09-29 §10.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1 && git show --stat --format= HEAD
```

Expected: o commit `feat(configuracoes): representante legal da empresa (nome, cargo e CPF) na aba Empresa`, com exatamente os 4 arquivos (2 novos, 2 modificados). O cabeçalho tem 86 caracteres e o commitlint aceita a mensagem (conferido).

---

## Parte F — Task 11: Projeto e consumidores

### Task 11: Projeto e consumidores (ordem da planilha, etapas, compras)

**Files:**

- Modify: `apps/web/src/pages/Projetos.jsx` (import `:6`; `loadOrcamentoData` `:209-216`; `onCreateSolicitacao` `:1401-1403`)
- Modify: `apps/web/src/components/projetos/OrcamentoTab.jsx` (import `:5`; `handleUpdate` `:96`; exportação CSV `:162-172`; exportação PDF `:214-220`; importação CSV `:377`; Aplicar Template `:425-439`; `itensFiltrados` `:449-451`; filtro `:496-506`; `.map` da tabela `:694-705`; Nº `:722`; autocomplete `:791-798`; `RelatoriosOrcamento` `:949-951`)
- Modify: `apps/web/src/components/compras/SolicitacaoModal.jsx` (import `:3`; `carregarOrcamentoProjeto` `:213-226`; `carregarOrcamentosMultiProjetos` `:310`)
- Test: sem teste novo. A lógica pura é das Tasks 1, 4 e 6 (`ordenarItensProjeto`, `rotuloItem`, `semEtapas`, `subtotaisEtapas`, `totalLinhaLegado` e `montarRegistroTemplate`, todas testadas). Aqui o gate é ESLint, build e a suíte inteira.

**Interfaces:**

- Consumes (Task 1, `@/lib/orcamento-desconto`): `totalLinhaLegado({ quantidade, valor_unitario, bdi, imposto }): number` e `subtotaisEtapas(itens): Record<string, number>` (em reais).
- Consumes (Task 4, `@/lib/orcamento-registros`):
  - `ordenarItensProjeto(itens): ItemOrc[]` — lista nova, sem mutar a entrada;
  - `rotuloItem(item, indice): string`;
  - `semEtapas(itens): ItemOrc[]` — aceita `null`/`undefined` e devolve `[]`.
- Consumes (Task 6, `@/lib/orcamento-template`): `montarRegistroTemplate(item, indice, dono): object`.
- Produces: nada novo exportado.

**Decisões desta task (o contrato não cobria):**

- **Conversão em projeto ("Ganho"), conferida (conferência M6; sem mudança de código).** `migrarOportunidadeParaProjeto` (`pages/Oportunidades.jsx`, por volta das linhas 429 a 497) **move** os itens com `OrcamentoItem.update(id, { projeto_id, oportunidade_id: null })`, na mesma linha. Por isso `numero`, `etapa`, `fonte`, `valor_unitario_ref` e `ordem` vão junto para o projeto, e nada nessa função precisa mudar. O roteiro H da Task 12 (Step 13) confere na tela.
- **Contas estritas da Task 1 (conferência de 01/10; sem mudança de código).** O `handleUpdate` do `OrcamentoTab` já converte com `parseFloat(value) || 0` (number) antes de chamar o `totalLinhaLegado`, a importação CSV (`:377`) usa `parseFloat(...) || 0` e o autocomplete (`:791-798`) passa `item.quantidade || 0` (number no estado desta aba) e o preço do material (number do banco). O `item.valor_total` que o `subtotaisEtapas` e o `resumoOrcamento` somam também vem como number. Nada a ajustar.
- **`loadOrcamentoData`.** Troca o `sort` e o `forEach` que **mutavam** os itens por `ordenarItensProjeto(itens).map((item, index) => ({ ...item, item: rotuloItem(item, index) }))`. Sem `numero`, `rotuloItem` devolve `String(index + 1)`: é o mesmo rótulo de hoje, na mesma ordem alfabética.
- **Linha de etapa e filtro.** São iguais aos da Task 6, inclusive o filtro efetivo, e a tabela do Projeto também tem 11 colunas. A etapa usa o `handleDelete` do próprio `OrcamentoTab`.
- **Exportações CSV e PDF do Projeto.**
  - A etapa sai como **título, sem zeros**. No CSV, só o Nº e a descrição, com as outras colunas vazias; o subtotal não entra, para a soma da coluna no Excel não contar em dobro. No PDF, a linha vai em negrito, sem valores.
  - O Nº passa a ser `rotuloItem`.
- **Autocomplete do Projeto.** A fórmula do total que ele grava (`:794-798`, a 3ª cópia no arquivo, fora da lista `:96,377`) também passa a usar `totalLinhaLegado`.
- **Materiais do autocomplete.** O `filteredMats` passa a ser calculado **só na linha em edição**. Hoje o `materiais.filter` (com mais de 2.000 materiais e 4 `normalizarTexto` por material) roda em **toda** linha a cada render. Com um orçamento importado de centenas a milhares de linhas, isso custa linhas × materiais a cada tecla. Ele só é usado dentro do bloco `showSuggestions && editingItemId === item.id && itemSearchTerm`, então o resultado na tela é o mesmo.
- **`SolicitacaoModal`.** No `carregarOrcamentoProjeto`, o resultado do `filter` é renomeado para `orcamentoTodos` e `orcamentoItens = semEtapas(orcamentoTodos)`. Assim os índices de preço, os itens e o "sem itens" já ignoram as etapas.

- [ ] **Step 1: Linha de base**

```bash
git status --short
cd apps/web && npx vitest run 2>&1 | tail -4
npx eslint src/pages/Projetos.jsx src/components/projetos/OrcamentoTab.jsx src/components/compras/SolicitacaoModal.jsx 2>&1 | tail -2
```

Anote a suíte e o total do ESLint. Em 29/09 dava `✖ 17 problems (0 errors, 17 warnings)`: 13 avisos antigos no `Projetos`, 3 no `OrcamentoTab` e 1 no `SolicitacaoModal`.

- [ ] **Step 2: Editar `apps/web/src/pages/Projetos.jsx` (3 trocas old→new com a ferramenta Edit)**

Use a ferramenta **Edit**: o arquivo e as âncoras abaixo estão em LF. Cada `old` é único no arquivo.

2.1 — import (`:6`)

old:

```jsx
import { salvarDraftSC } from "@/lib/sc-draft";
```

new:

```jsx
import { salvarDraftSC } from "@/lib/sc-draft";
import { ordenarItensProjeto, rotuloItem, semEtapas } from "@/lib/orcamento-registros";
```

2.2 — `loadOrcamentoData`: ordem da planilha quando há `numero` e rótulo `item` = `numero` (`:209-216`)

old:

<!-- prettier-ignore -->
```jsx
    const sortedItens = itens.sort((a, b) => {
      const descA = (a.descricao || "").toLowerCase();
      const descB = (b.descricao || "").toLowerCase();
      return descA.localeCompare(descB);
    });
    sortedItens.forEach((item, index) => {
      item.item = (index + 1).toString();
    });
```

new:

<!-- prettier-ignore -->
```jsx
    // Orçamento importado (itens com `numero`): na ordem da planilha, com o rótulo
    // `item` = `numero`. Sem numeração: a ordem alfabética e o rótulo de sempre.
    const sortedItens = ordenarItensProjeto(itens).map((item, index) => ({
      ...item,
      item: rotuloItem(item, index),
    }));
```

2.3 — solicitação de compra sem as linhas de etapa (`:1401-1403`)

old:

```jsx
                      onCreateSolicitacao={(itensOrc) => {
                        // Exige seleção explícita (decisão UX: "só itens marcados").
                        if (!itensOrc || itensOrc.length === 0) {
```

new:

```jsx
                      onCreateSolicitacao={(itensMarcados) => {
                        // Linha de etapa (título do orçamento importado) não se compra.
                        const itensOrc = semEtapas(itensMarcados);
                        // Exige seleção explícita (decisão UX: "só itens marcados").
                        if (itensOrc.length === 0) {
```

- [ ] **Step 3: Editar `apps/web/src/components/projetos/OrcamentoTab.jsx` (12 trocas old→new com a ferramenta Edit)**

Use a ferramenta **Edit**. Cada `old` é único no arquivo.

3.1 — imports (`:5`)

old:

```jsx
import { safeParseJSON } from "@/lib/json-utils";
```

new:

```jsx
import { safeParseJSON } from "@/lib/json-utils";
import { subtotaisEtapas, totalLinhaLegado } from "@/lib/orcamento-desconto";
import { rotuloItem, semEtapas } from "@/lib/orcamento-registros";
import { montarRegistroTemplate } from "@/lib/orcamento-template";
```

3.2 — total da linha na edição (`handleUpdate`, `:96`)

old:

<!-- prettier-ignore -->
```jsx
      updatedData.valor_total = qtd * vlrUnit * (1 + bdi / 100) * (1 + imp / 100);
```

new:

<!-- prettier-ignore -->
```jsx
      updatedData.valor_total = totalLinhaLegado({
        quantidade: qtd,
        valor_unitario: vlrUnit,
        bdi,
        imposto: imp,
      });
```

3.3 — exportação CSV: Nº = `numero` e etapa como título, sem zeros (`:162-172`)

old:

```jsx
      ...orcamentoItens.map((item, idx) => [
        idx + 1,
        item.descricao || "",
        item.codigo || "",
        item.unidade || "",
        item.quantidade || 0,
        item.valor_unitario || 0,
        item.bdi || 0,
        item.imposto || 0,
        item.valor_total || 0,
      ]),
```

new:

```jsx
      // Etapa (orçamento importado): só o número e o título. Sem o subtotal, para a
      // soma da coluna no Excel não contar em dobro.
      ...orcamentoItens.map((item, idx) =>
        item.etapa
          ? [rotuloItem(item, idx), item.descricao || "", "", "", "", "", "", "", ""]
          : [
              rotuloItem(item, idx),
              item.descricao || "",
              item.codigo || "",
              item.unidade || "",
              item.quantidade || 0,
              item.valor_unitario || 0,
              item.bdi || 0,
              item.imposto || 0,
              item.valor_total || 0,
            ]
      ),
```

3.4 — exportação PDF: etapa em negrito, sem valores, e Nº = `numero` (`:214-220`)

old:

```jsx
    orcamentoItens.forEach((item, idx) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      doc.text((idx + 1).toString(), 14, y);
```

new:

```jsx
    orcamentoItens.forEach((item, idx) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }
      if (item.etapa) {
        // Etapa (orçamento importado): título em negrito, sem quantidade nem valores
        doc.setFont(undefined, "bold");
        doc.text(rotuloItem(item, idx), 14, y);
        doc.text((item.descricao || "").substring(0, 120), 25, y);
        doc.setFont(undefined, "normal");
        y += 6;
        return;
      }
      doc.text(rotuloItem(item, idx), 14, y);
```

3.5 — importação CSV antiga do Projeto: total da linha arredondado (`:377`)

old:

```jsx
            valor_total: quantidade * valor_unitario * (1 + bdi / 100) * (1 + imposto / 100),
```

new:

```jsx
            valor_total: totalLinhaLegado({ quantidade, valor_unitario, bdi, imposto }),
```

3.6 — "Aplicar Template" leva `numero`, `etapa`, `fonte` e `valor_unitario_ref` (`:425-439`)

old:

<!-- prettier-ignore -->
```jsx
        itens.map((item, idx) => ({
          empresa_id: empresaAtiva.id,
          projeto_id: selectedProj.id,
          item: (idx + 1).toString(),
          tipo: item.tipo || "Material",
          descricao: item.descricao || "",
          codigo: item.codigo || "",
          unidade: item.unidade || "UN",
          quantidade: item.quantidade || 0,
          valor_unitario: item.valor_unitario || 0,
          bdi: item.bdi || 0,
          imposto: item.imposto || 0,
          valor_total: item.valor_total || 0,
          ordem: idx,
        }))
```

new:

<!-- prettier-ignore -->
```jsx
        itens.map((item, idx) =>
          montarRegistroTemplate(item, idx, {
            empresa_id: empresaAtiva.id,
            projeto_id: selectedProj.id,
          })
        )
```

3.7 — filtro efetivo e subtotais (`:449-451`; não há `return` antecipado antes deste ponto e nada aqui é hook)

old:

<!-- prettier-ignore -->
```jsx
  const itensFiltrados = orcamentoItens.filter(
    (i) => filtroTipo === "all" || i.tipo === filtroTipo
  );
```

new:

<!-- prettier-ignore -->
```jsx
  // Orçamento importado (itens com `numero`): sem filtro de tipo (vale "Todos",
  // porque o item importado tem tipo nulo) e com o subtotal de cada etapa.
  const orcamentoNumerado = orcamentoItens.some((i) => i.numero);
  const filtroTipoEfetivo = orcamentoNumerado ? "all" : filtroTipo;
  const itensFiltrados = orcamentoItens.filter(
    (i) => filtroTipoEfetivo === "all" || i.tipo === filtroTipoEfetivo
  );
  const subtotalPorEtapa = orcamentoNumerado ? subtotaisEtapas(orcamentoItens) : {};
```

3.8 — filtro de tipo escondido no orçamento numerado (`:496-506`)

old:

<!-- prettier-ignore -->
```jsx
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="Material">Material</SelectItem>
                <SelectItem value="Mão de Obra">Mão de Obra</SelectItem>
                <SelectItem value="Ferramental">Ferramental</SelectItem>
              </SelectContent>
            </Select>
```

new:

<!-- prettier-ignore -->
```jsx
            {!orcamentoNumerado && (
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="Material">Material</SelectItem>
                  <SelectItem value="Mão de Obra">Mão de Obra</SelectItem>
                  <SelectItem value="Ferramental">Ferramental</SelectItem>
                </SelectContent>
              </Select>
            )}
```

3.9 — linha de etapa e materiais do autocomplete só na linha em edição (`:694-705`)

old:

```jsx
                {itensFiltrados.map((item, index) => {
                  const podeEditar = true; // todos podem editar itens do orçamento do projeto
                  const filteredMats = materiais.filter(
                    (m) =>
                      normalizarTexto(m.nome_item).includes(
                        normalizarTexto(itemSearchTerm.toLowerCase())
                      ) ||
                      normalizarTexto(m.codigo).includes(
                        normalizarTexto(itemSearchTerm.toLowerCase())
                      )
                  );
                  return (
```

new:

```jsx
                {itensFiltrados.map((item, index) => {
                  const podeEditar = true; // todos podem editar itens do orçamento do projeto
                  // Etapa (título do orçamento importado): número, descrição, subtotal dos
                  // itens e lixeira, sem inputs. 11 colunas, como o cabeçalho: a descrição
                  // ocupa de Descrição a Imp. %.
                  if (item.etapa) {
                    return (
                      <tr key={item.id} className="border-b bg-slate-100 font-semibold">
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-center text-xs text-slate-700">
                          {rotuloItem(item, index)}
                        </td>
                        <td colSpan={7} className="px-3 py-2 text-xs text-slate-800">
                          {item.descricao || ""}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-xs text-slate-800 whitespace-nowrap">
                            {formatCurrency(subtotalPorEtapa[item.numero] ?? 0)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Excluir etapa"
                            onClick={() => handleDelete(item.id)}
                            disabled={!podeEditar}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  // Materiais do autocomplete: só na linha em edição. Em toda linha, custava
                  // linhas × materiais a cada tecla (orçamento importado tem milhares de linhas).
                  const filteredMats =
                    showSuggestions && editingItemId === item.id && itemSearchTerm
                      ? materiais.filter(
                          (m) =>
                            normalizarTexto(m.nome_item).includes(
                              normalizarTexto(itemSearchTerm.toLowerCase())
                            ) ||
                            normalizarTexto(m.codigo).includes(
                              normalizarTexto(itemSearchTerm.toLowerCase())
                            )
                        )
                      : [];
                  return (
```

3.10 — coluna Nº do item (`:722`)

old:

<!-- prettier-ignore -->
```jsx
                      <td className="px-3 py-2 text-center text-xs text-slate-500">{index + 1}</td>
```

new:

<!-- prettier-ignore -->
```jsx
                      <td className="px-3 py-2 text-center text-xs text-slate-500">
                        {rotuloItem(item, index)}
                      </td>
```

3.11 — total gravado pelo autocomplete de material (`:791-798`)

old:

<!-- prettier-ignore -->
```jsx
                                            const qtd = item.quantidade || 0;
                                            const bdi = item.bdi || 0;
                                            const imp = item.imposto || 0;
                                            const valor_total =
                                              qtd *
                                              valorUnitario *
                                              (1 + bdi / 100) *
                                              (1 + imp / 100);
```

new:

<!-- prettier-ignore -->
```jsx
                                            const valor_total = totalLinhaLegado(updated);
```

3.12 — Relatórios do orçamento sem as linhas de etapa (`:949-951`)

old:

```jsx
            <RelatoriosOrcamento
              orcamentoItens={orcamentoItens || []}
              nomeOrcamento={selectedProj?.nome || ""}
```

new:

```jsx
            <RelatoriosOrcamento
              orcamentoItens={semEtapas(orcamentoItens)}
              nomeOrcamento={selectedProj?.nome || ""}
```

- [ ] **Step 4: Editar `apps/web/src/components/compras/SolicitacaoModal.jsx` (3 trocas old→new com a ferramenta Edit)**

  4.1 — import (`:3`)

old:

```jsx
import { safeParseJSON } from "@/lib/json-utils";
```

new:

```jsx
import { safeParseJSON } from "@/lib/json-utils";
import { semEtapas } from "@/lib/orcamento-registros";
```

4.2 — `carregarOrcamentoProjeto` sem as linhas de etapa (`:213-226`)

old:

<!-- prettier-ignore -->
```jsx
      const [orcamentoItens, todosPedidosItems, reservasAtivas] = await Promise.all([
        sigo.entities.OrcamentoItem.filter({
          empresa_id: empresaAtiva.id,
          projeto_id: projetoId,
        }),
        sigo.entities.PedidoCompraItem.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.ReservaMaterial.filter({
          empresa_id: empresaAtiva.id,
          projeto_id: projetoId,
          status: "Ativa",
        }),
      ]);

      // Index dos preços do orçamento pra sugerir em edições futuras
```

new:

<!-- prettier-ignore -->
```jsx
      const [orcamentoTodos, todosPedidosItems, reservasAtivas] = await Promise.all([
        sigo.entities.OrcamentoItem.filter({
          empresa_id: empresaAtiva.id,
          projeto_id: projetoId,
        }),
        sigo.entities.PedidoCompraItem.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.ReservaMaterial.filter({
          empresa_id: empresaAtiva.id,
          projeto_id: projetoId,
          status: "Ativa",
        }),
      ]);
      // Linha de etapa (título do orçamento importado) não vira item de compra
      const orcamentoItens = semEtapas(orcamentoTodos);

      // Index dos preços do orçamento pra sugerir em edições futuras
```

4.3 — `carregarOrcamentosMultiProjetos` sem as linhas de etapa (`:310`)

old:

```jsx
      todosOrcamentos.flat().forEach((item) => {
```

new:

```jsx
      // Linha de etapa (título do orçamento importado) não vira item de compra
      semEtapas(todosOrcamentos.flat()).forEach((item) => {
```

- [ ] **Step 5: Conferir as trocas**

```bash
cd apps/web
grep -c "ordenarItensProjeto\|rotuloItem\|semEtapas" src/pages/Projetos.jsx
grep -c "item.item = " src/pages/Projetos.jsx
grep -c "rotuloItem\|semEtapas\|subtotaisEtapas\|totalLinhaLegado\|montarRegistroTemplate" src/components/projetos/OrcamentoTab.jsx
grep -c "(1 + imp / 100)\|(1 + imposto / 100)" src/components/projetos/OrcamentoTab.jsx
grep -c "semEtapas" src/components/compras/SolicitacaoModal.jsx
```

Expected, nesta ordem: `4`, `0`, `15`, `0` e `3`.

**`Projetos.jsx` (4 linhas):** o import, as 2 linhas do `loadOrcamentoData` (`ordenarItensProjeto` e `rotuloItem`) e o `semEtapas` do `onCreateSolicitacao`.

**`OrcamentoTab.jsx` (15 linhas):**

| Onde               | Linhas |
| ------------------ | ------ |
| imports            | 3      |
| `handleUpdate`     | 1      |
| CSV (etapa e item) | 2      |
| PDF (etapa e item) | 2      |
| importação CSV     | 1      |
| template           | 1      |
| `subtotalPorEtapa` | 1      |
| Nº da etapa        | 1      |
| Nº do item         | 1      |
| autocomplete       | 1      |
| Relatórios         | 1      |
| **Total**          | **15** |

Se der outro número, confira com `grep -n` se cada troca do Step 3 está lá, uma vez cada.

**`SolicitacaoModal.jsx` (3):** 1 import e as 2 chamadas.

- [ ] **Step 6: Lint, build, suíte e formatação**

```bash
cd apps/web && npx eslint src/pages/Projetos.jsx src/components/projetos/OrcamentoTab.jsx src/components/compras/SolicitacaoModal.jsx 2>&1 | tail -2
npm run build > /dev/null && echo BUILD_OK
npx vitest run 2>&1 | tail -4
cd ../.. && npx prettier --check apps/web/src/pages/Projetos.jsx apps/web/src/components/projetos/OrcamentoTab.jsx apps/web/src/components/compras/SolicitacaoModal.jsx
```

Expected:

- **ESLint:** o mesmo total do Step 1 (em 29/09: `✖ 17 problems (0 errors, 17 warnings)`), sem aviso novo;
- **Build:** `BUILD_OK`;
- **Suíte:** igual à do Step 1 (esta task não acrescenta teste), toda passando;
- **Prettier:** `All matched files use Prettier code style!`.

O comportamento na tela (ordem da planilha depois do "Ganho", etapas com subtotal, solicitação de compra sem etapas) é conferido no roteiro da Task 12. Antes da 0127, o dev não tem as colunas novas.

- [ ] **Step 7: Commit (só os 3 caminhos da task)**

```bash
git status --short
git add apps/web/src/pages/Projetos.jsx apps/web/src/components/projetos/OrcamentoTab.jsx apps/web/src/components/compras/SolicitacaoModal.jsx
git commit -F - -- apps/web/src/pages/Projetos.jsx apps/web/src/components/projetos/OrcamentoTab.jsx apps/web/src/components/compras/SolicitacaoModal.jsx <<'EOF'
feat(projetos): orçamento na ordem da planilha, com etapas e sem etapas nas compras

- Projetos: com numero (orçamento importado), ordena por ordem e numero e o rótulo item vira
  o numero; sem numero, a ordem alfabética de sempre, agora sem mutar os itens
- OrcamentoTab: Nº = numero, etapa em negrito com subtotal e só a lixeira, filtro de tipo
  escondido no orçamento importado, total da linha por totalLinhaLegado (edição, CSV antigo
  e autocomplete), templates com numero/etapa/fonte/preço de referência, exportações CSV e
  PDF com a etapa como título sem zeros, Relatórios sem etapas
- autocomplete: materiais filtrados só na linha em edição (não em toda linha a cada tecla)
- solicitação de compra (Projeto e SolicitacaoModal) ignora as linhas de etapa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git show --stat --format=%s HEAD
```

Expected: `3 files changed`, só esses três caminhos.

---

## Parte G — Task 12: 0127 em produção, teste ponta a ponta com o Javerson e publicação

**Regras desta parte:**

- **Produção:** todo passo que mexe em produção (migração, push, revert) começa com "Pedir OK ao Javerson" e só segue com um "sim" explícito dele, no chat. O roteiro de teste com ele roda **antes do push**, no servidor local (`npm run dev`, que usa o banco de produção), depois de a `0127` estar aplicada (Task 12).

### Task 12: 0127 em produção, teste ponta a ponta com o Javerson no servidor local e publicação

**Files:**

- Nenhum arquivo do repositório é criado ou alterado nesta task. As consultas SQL vão para arquivos em `$TEMP` (fora do repo).
- Exceção: se o Prettier do Step 2 apontar arquivo **deste plano** fora do padrão, `npx prettier --write <arquivo>` e um commit `style(orcamento): formata <arquivo>` só com ele.

**Interfaces:**

- Consumes:
  - os commits das Tasks 1 a 11 em `master` (não publicados). Assuntos usados no plano de volta: Task 1 `feat(orcamento): contas do desconto em centavos (...)`; Task 5 `feat(oportunidades): barra do orçamento com modelo, skill do Claude, importação e desconto`; Task 6 `feat(oportunidades): etapas, numeração e total arredondado na tabela do orçamento`; Task 10 `feat(configuracoes): representante legal da empresa (...)`; Task 11 `feat(projetos): orçamento na ordem da planilha, com etapas e sem etapas nas compras`; Task 9 (assunto definido no commit da própria Task 9; é achado pelo grep por `proposta`/`orçamento` e pelos caminhos das telas);
  - `supabase/migrations/0127_orcamento_planilha_prefeitura.sql` (Task 4), terminando em `select 'ok' as res;`;
  - `public/skills/orcamento-prefeitura-sigo/SKILL.md` (Task 3), servido em `https://www.sigoobras.com.br/skills/orcamento-prefeitura-sigo/SKILL.md`.
- Produces: `0127` aplicada em produção (9 colunas); o roteiro de teste conferido com o Javerson **no servidor local, antes do push**; e só então o front publicado (workflow "Deploy frontend to Hostgator").

**Ordem obrigatória (decisão C1; a spec §13 pede "ponta a ponta, antes do push"):** aplicar a `0127` (Steps 3 e 4) → rodar o roteiro completo com o Javerson no servidor local, `npm run dev` (Steps 5 a 13) → só então pedir o OK e fazer o push (Step 14), com um teste rápido no site publicado (Step 15).

- A `0127` sobe **antes** de qualquer tela nova tocar o banco de produção: o Salvar da aba Empresa manda todas as chaves de `empresaData` (agora com `representante_*`) e a importação manda `numero`, `etapa`, `fonte` e `valor_unitario_ref`; sem as colunas, o PostgREST responde PGRST204 e a aba Empresa inteira deixa de salvar.
- O servidor local lê o `apps/web/.env.local`, que aponta para o **mesmo** Supabase do site publicado. Com a `0127` aplicada, o dev já enxerga as colunas novas e grava os mesmos dados de teste que o site publicado gravaria. O `SKILL.md` também é servido pelo dev (o Vite serve `apps/web/public/`).
- Nada deste plano vai para o site publicado antes de o roteiro passar. Se o roteiro achar defeito, a correção entra antes do push.

- [ ] **Step 1: Pré-checagem (nada foi publicado sem a 0127?)**

Outras sessões também fazem `git push origin master` deste mesmo repositório. Se uma delas publicou antes desta task, os commits deste plano já estão no ar **sem** a `0127`.

```bash
git fetch -q origin
git status -sb | head -1
git status --short
git log --oneline origin/master -- apps/web/src/components/oportunidades/OrcamentoLicitacaoBarra.jsx apps/web/src/lib/representante-empresa.js apps/web/src/lib/orcamento-desconto.js
```

Expected:

- `## master...origin/master [ahead K]`, sem `behind`. Com `behind` ou `diverged`, **pare** e mostre ao Javerson (alguém publicou de outro lugar);
- `git status --short`: arquivos de outras sessões podem aparecer; não mexa neles (o push não os leva, só commits);
- o último `git log`: **nenhuma linha**. Se aparecer alguma, o front novo já está no ar sem a `0127`: avise o Javerson na hora ("o orçamento novo já foi publicado junto com o push de outra sessão; a aba Empresa e a importação falham até a 0127 subir") e vá direto aos Steps 3 e 4 (com o OK dele); depois volte ao Step 2.

- [ ] **Step 2: Suíte completa**

```bash
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npm run lint && echo LINT_OK)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
git diff -z --name-only --diff-filter=ACMR origin/master...HEAD | xargs -0 npx prettier --check --ignore-unknown
```

Expected:

- Vitest: `Test Files  X passed`, `Tests  Y passed`, sem `failed` (X e Y = linha de base anotada antes da Task 1 mais os testes das Tasks 1 a 11);
- `LINT_OK` (`eslint . --quiet`: zero erros; em 29/09 o `apps/web` estava sem erros);
- `BUILD_OK`;
- Prettier: `All matched files use Prettier code style!` (o `.sql` é ignorado pelo `--ignore-unknown`; o `package-lock.json`, pelo `.prettierignore`).

Se algo falhar em arquivo deste plano, corrija na task de origem (commit `fix(...)` só com ele) e rode o Step 2 de novo. Se falhar em arquivo de outra sessão, **não** corrija: mostre ao Javerson e combine antes de publicar.

- [ ] **Step 3: Pedir OK ao Javerson e aplicar a 0127**

Pergunte: "Posso aplicar a migração 0127 em produção? Ela só acrescenta 9 colunas (orcamento_item: numero, etapa, fonte, valor_unitario_ref; oportunidade: desconto_proposta_pct, orcamento_info; empresa: representante_nome, representante_cargo, representante_cpf), com valor padrão, sem mexer em dado existente." Só com o "sim":

```bash
tail -n 1 supabase/migrations/0127_orcamento_planilha_prefeitura.sql
supabase db query --linked -f supabase/migrations/0127_orcamento_planilha_prefeitura.sql
```

Expected: a primeira linha é `select 'ok' as res;`; a consulta devolve uma linha com `"res": "ok"` (em JSON, dentro do aviso de dados não confiáveis que o CLI põe quando roda por agente). **Nunca** `supabase db push`.

- [ ] **Step 4: Conferir as 9 colunas**

```bash
cat > "$TEMP/conferir_0127.sql" <<'EOF'
select table_name, column_name, data_type, numeric_precision, numeric_scale,
       is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (table_name::text, column_name::text) in (
     ('orcamento_item', 'numero'), ('orcamento_item', 'etapa'),
     ('orcamento_item', 'fonte'), ('orcamento_item', 'valor_unitario_ref'),
     ('oportunidade', 'desconto_proposta_pct'), ('oportunidade', 'orcamento_info'),
     ('empresa', 'representante_nome'), ('empresa', 'representante_cargo'),
     ('empresa', 'representante_cpf')
   )
 order by table_name, column_name;
EOF
supabase db query --linked -o table -f "$TEMP/conferir_0127.sql"
```

Expected: **9 linhas**:

| table_name     | column_name           | data_type | numeric_precision | numeric_scale | is_nullable | column_default |
| -------------- | --------------------- | --------- | ----------------- | ------------- | ----------- | -------------- |
| empresa        | representante_cargo   | text      |                   |               | YES         |                |
| empresa        | representante_cpf     | text      |                   |               | YES         |                |
| empresa        | representante_nome    | text      |                   |               | YES         |                |
| oportunidade   | desconto_proposta_pct | numeric   | 5                 | 2             | NO          | 0              |
| oportunidade   | orcamento_info        | jsonb     |                   |               | NO          | '{}'::jsonb    |
| orcamento_item | etapa                 | boolean   |                   |               | NO          | false          |
| orcamento_item | fonte                 | text      |                   |               | YES         |                |
| orcamento_item | numero                | text      |                   |               | YES         |                |
| orcamento_item | valor_unitario_ref    | numeric   | 14                | 4             | YES         |                |

Menos de 9 linhas: **pare**, não siga para o roteiro nem publique o front, mostre ao Javerson.

- [ ] **Step 5: Servidor local e preparação do roteiro**

Com a `0127` conferida (Step 4), suba o servidor local, em segundo plano para o terminal continuar livre:

```bash
(cd apps/web && npm run dev)
```

Expected: a saída mostra `Local:   http://localhost:5173/` (se a porta 5173 estiver ocupada, o Vite usa a próxima; vale a que a saída mostrar). Abra a página no navegador e confirme que a tela de login carrega antes de chamar o Javerson.

O servidor local usa o **mesmo banco de produção** do site publicado: o que o roteiro gravar fica de verdade no banco. O Javerson faz os cliques em `http://localhost:5173` (a sessão do site publicado não vale no localhost: ele entra de novo com o login dele; você não digita nem guarda senha; **Ctrl+F5** antes de começar); você acompanha e roda as consultas de conferência. As consultas são **só de leitura**: peça o OK dele uma vez, aqui, para rodá-las durante o roteiro. O roteiro cria dados de teste em produção (duas oportunidades e um projeto), que ele apaga no Step 15 se quiser. Se quiserem simular rede lenta (F12 → Network → Slow 3G), é aqui, no dev; nunca no site publicado.

Se o roteiro achar um defeito: corrija na task de origem (commit `fix(...)` só com os arquivos dela; o Vite recarrega sozinho), repita o passo do roteiro e, antes do push, refaça o Step 2.

Nomes usados nas consultas: oportunidades **`TESTE orçamento Itatinga`** e **`TESTE orçamento PDF`** (criadas por ele em Oportunidades → Nova, com esses nomes exatos).

- [ ] **Step 6: Roteiro A — representante legal (Configurações → Empresa)**

Fazer antes da exportação, para o diálogo já vir preenchido.

| #   | Ação do Javerson                                                                                                         | Resultado esperado                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Configurações → aba **Empresa**                                                                                          | Abaixo de "Responsável Principal", a seção **Representante legal** com Nome, Cargo e CPF. Com o nome vazio, o campo mostra em cinza o responsável principal e aparece o link "Usar o responsável principal". |
| 2   | Clicar em "Usar o responsável principal"                                                                                 | O nome é copiado para o campo e o link some.                                                                                                                                                                 |
| 3   | Cargo: o dele (ex.: Sócio-administrador). CPF: digitar os 11 dígitos do CPF dele, trocando o **último** dígito por outro | Enquanto digita, a máscara `000.000.000-00` aparece aos poucos; não aceita letras nem mais de 11 dígitos.                                                                                                    |
| 4   | **Salvar**                                                                                                               | Toast vermelho "CPF do representante legal inválido. Corrija ou deixe em branco."; nada é gravado.                                                                                                           |
| 5   | Corrigir o último dígito e **Salvar**                                                                                    | Toast "✅ Dados da empresa salvos com sucesso".                                                                                                                                                              |
| 6   | **F5** e voltar à aba Empresa                                                                                            | Nome, cargo e CPF (formatado) continuam lá; os outros campos da empresa, iguais.                                                                                                                             |

Se o passo 5 der "❌ Erro ao salvar dados da empresa": abra o console (F12). Com `PGRST204`, a 0127 não está visível para o PostgREST (volte ao Step 4); com `PGRST116`/0 linhas, o usuário não é super admin: pela RLS só o super admin grava em `empresa` (spec §9), e o diálogo de exportação cobre o caso com o representante digitado na hora.

Conferência (sem mostrar o CPF):

```bash
cat > "$TEMP/representante.sql" <<'EOF'
select nome, representante_nome, representante_cargo, length(representante_cpf) as tam_cpf
  from public.empresa
 where coalesce(representante_nome, '') <> '' or coalesce(representante_cpf, '') <> '';
EOF
supabase db query --linked -o table -f "$TEMP/representante.sql"
```

Expected: uma linha, da empresa ativa dele, com o nome, o cargo e `tam_cpf = 14`.

- [ ] **Step 7: Roteiro B — instalar a skill no Claude**

| #   | Ação do Javerson                                                         | Resultado esperado                                                                                                                                                   |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir a oportunidade **TESTE orçamento Itatinga** → aba **Orçamento**    | Barra no topo com **Baixar modelo**, **Skill do Claude**, **Importar planilha** e **Desconto (%)** + **Aplicar** (aparece mesmo com o orçamento vazio).              |
| 2   | **Baixar modelo**                                                        | Baixa `Modelo de orcamento SIGO.xlsx`: aba `Orçamento` com os 8 cabeçalhos (Item … Total (R$)) e aba `Informações` com os 8 rótulos.                                 |
| 3   | **Skill do Claude**                                                      | Baixa `orcamento-prefeitura-sigo.zip` e mostra o toast "Skill baixada. Para instalar: Claude → Configurações → Capacidades → Skills → Enviar (escolha o .zip)."      |
| 4   | No claude.ai: Configurações → Capacidades → Skills → **Enviar** → o .zip | A skill `orcamento-prefeitura-sigo` aparece na lista, ligada. Se a seção Skills não aparecer, ligar antes "Execução de código e criação de arquivos" em Capacidades. |

Conferência do .zip (opcional, no PC dele):

```bash
py -3 -c "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).namelist())" "$USERPROFILE/Downloads/orcamento-prefeitura-sigo.zip"
```

Expected: `['orcamento-prefeitura-sigo/SKILL.md']`.

- [ ] **Step 8: Roteiro C — converter as planilhas no Claude**

1. **Itatinga (Excel original).** Numa conversa nova no claude.ai, anexar `D:\OneDrive\SINERGIA\LICITAÇÕES\SINERGIA SERVIÇOS\Licitações\2026\101- PM Itatinga - SP\01- Arquivo\Planilha Orcamentaria (original Excel).xlsx` e pedir "Converta para o modelo do SIGO".
   Expected (conferido em 29/09 numa cópia da planilha):
   - a skill é usada e devolve `Orcamento SIGO - PM Itatinga.xlsx` (ou nome parecido com o órgão);
   - **56 itens**, na ordem da aba "Orçamento Sintético", com a numeração **criada** (a planilha não numera; a resposta e as Observações dizem isso). Etapas: a planilha não tem títulos de grupo, então é normal vir **0 etapas**;
   - preço com BDI **calculado** (BDI 23,96%, anotado em Observações). Ex.: "Poste 12/1000", 6 un, sem BDI 2.827,92 → **3.505,49**, total 21.032,94;
   - soma dos itens **R$ 1.617.244,73** contra o total da prefeitura **R$ 1.617.259,46**: diferença de **R$ 14,73**, porque a prefeitura não arredonda o unitário com BDI (usa o valor cheio) e a proposta precisa de unitário em 2 casas. A resposta deve explicar essa diferença;
   - Informações: Órgão "Prefeitura Municipal de Itatinga", Objeto "Distrito Industrial de Itatinga" (ou como no cabeçalho), BDI 23,96, Total da prefeitura 1617259,46.
     Guardar o arquivo em `...\101- PM Itatinga - SP\03- SIGO\` (ou onde ele preferir).
2. **Uma planilha só em PDF**, de outro processo: escolher com o Javerson um processo com a planilha orçamentária só em PDF, de preferência com etapas numeradas (`1`, `1.1`…). Pedir a conversão.
   Expected: `.xlsx` com etapas (só Item e Descrição) e itens na ordem do PDF; soma conferida contra o total geral do PDF, com a diferença (se houver) explicada; itens ilegíveis listados na resposta e em Observações.

- [ ] **Step 9: Roteiro D — importar a planilha de Itatinga**

| #   | Ação do Javerson                                                                                         | Resultado esperado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Na aba Orçamento de **TESTE orçamento Itatinga**: **Importar planilha** → escolher o `.xlsx` do Step 8.1 | Prévia: Etapas 0 · Itens 56 · Total de referência **R$ 1.617.244,73** · Total da prefeitura **R$ 1.617.259,46**. "Os itens são gravados com o desconto atual da oportunidade: 0%." **Erros: nenhum.** Avisos (não bloqueiam): "A planilha não tem linhas de etapa; os itens ficam sem subtotal."; "Soma dos itens (R$ 1.617.244,73) difere do Total da prefeitura (R$ 1.617.259,46) em R$ 14,73."; e, se a coluna Total veio com o total cheio da prefeitura, cerca de 27 avisos "Linha N: Total (R$) informado … difere do calculado …" de alguns centavos (mesma causa). Nenhum aviso "Linha N: item sem unidade.": os 56 itens da planilha de Itatinga têm unidade (conferido na planilha original). |
| 2   | **Importar 56 linhas**                                                                                   | Toast "Orçamento importado: 0 etapas e 56 itens". A tabela mostra Nº 1 a 56 na ordem da planilha; o filtro de tipo some; Vlr Unit = preço de referência (desconto 0%). O resumo mostra referência = proposta = R$ 1.617.244,73 e desconto real 0,00%.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3   | **Importar planilha** de novo, com o mesmo arquivo, e confirmar                                          | Pergunta "Substituir os 56 itens atuais?"; com OK, a tabela volta igual (56 itens, sem duplicar).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

- [ ] **Step 10: Roteiro E — aplicar 12,35%**

| #   | Ação do Javerson                                      | Resultado esperado                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Desconto (%) = `12,35` → **Aplicar**                  | Confirmação: "Recalcula todos os itens importados a partir do preço da prefeitura; ajustes feitos à mão nesses itens serão substituídos."                                                                                                                                                      |
| 2   | OK                                                    | Toast "Desconto de 12,35% aplicado em 56 itens". Resumo: Total de referência **R$ 1.617.244,73** · Total da proposta **R$ 1.417.472,96** · Desconto real **12,35%**. Item 1 (Poste 12/1000): Vlr Unit **R$ 3.072,56** (3.505,49 × 0,8765 = 3.072,561985, cortado), Vlr Total **R$ 18.435,36**. |
| 3   | Desconto `100` → Aplicar; depois `12,355` → Aplicar   | Toasts "O desconto vai de 0 a 99,99%" e "Use no máximo 2 casas decimais"; nada muda. Voltar o campo para `12,35` (não precisa aplicar de novo).                                                                                                                                                |
| 4   | **F5** e voltar à aba Orçamento                       | O campo mostra 12,35 e os totais continuam os mesmos.                                                                                                                                                                                                                                          |
| 5   | Editar uma quantidade e clicar **Aplicar** em < 1,5 s | Toast "Aguarde a gravação da última edição e aplique de novo"; nada é gravado. Depois de 2 s, **Aplicar** de novo funciona. Para a conferência abaixo, restaurar a quantidade e aplicar 12,35 outra vez.                                                                                       |

Conferência (todo unitário = corte de referência × 0,8765 em 2 casas; todo total = arredondar(qtd × unit, 2)):

```bash
cat > "$TEMP/desconto_itatinga.sql" <<'EOF'
with op as (
  select id, desconto_proposta_pct,
         orcamento_info->>'orgao' as orgao, orcamento_info->>'arquivo_nome' as arquivo
    from public.oportunidade
   where nome = 'TESTE orçamento Itatinga' and deleted_at is null
   order by created_at desc
   limit 1
)
select op.desconto_proposta_pct, op.orgao, op.arquivo,
       count(*) filter (where not i.etapa) as itens,
       count(*) filter (where i.etapa) as etapas,
       count(*) filter (where not i.etapa and i.valor_unitario_ref is not null
         and i.valor_unitario <> trunc(i.valor_unitario_ref * (1 - op.desconto_proposta_pct / 100), 2)
       ) as unit_fora_da_regra,
       count(*) filter (where not i.etapa
         and i.valor_total <> round(i.quantidade * i.valor_unitario, 2)) as total_fora_da_regra,
       sum(i.valor_total) filter (where not i.etapa) as total_proposta,
       sum(round(i.quantidade * i.valor_unitario_ref, 2)) filter (where not i.etapa) as total_referencia
  from op
  join public.orcamento_item i on i.oportunidade_id = op.id and i.deleted_at is null
 group by op.desconto_proposta_pct, op.orgao, op.arquivo;
EOF
supabase db query --linked -o table -f "$TEMP/desconto_itatinga.sql"
```

Expected: `desconto_proposta_pct 12.35`, `orgao` preenchido, `arquivo` = nome do .xlsx importado, `itens 56`, `etapas 0`, `unit_fora_da_regra 0`, `total_fora_da_regra 0`, `total_proposta 1417472.96`, `total_referencia 1617244.73`.

- [ ] **Step 11: Roteiro F — exportar PDF e Excel**

| #   | Ação do Javerson                            | Resultado esperado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Exportar proposta** (na barra)            | Diálogo com formato (PDF/Excel), validade 60, local = cidade/UF da empresa, data = hoje, representante (nome, cargo, CPF) já preenchido com o do Step 6 e ☑ "Registrar como nova versão da proposta".                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2   | Apagar o nome do representante → exportar   | Erro de validação (nome obrigatório); nada é baixado. Desfazer (restaurar o nome).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | PDF, ☑ registrar → exportar                 | Baixa `Proposta - TESTE orçamento Itatinga - <aaaa-mm-dd>.pdf`. A4 paisagem; cabeçalho com razão social, CNPJ, endereço, telefone e e-mail; "Proposta de preços"; órgão, objeto e edital da aba Informações; tabela Item · Código · Fonte · Descrição · Unid. · Qtd. · Preço unit. · Total com os 56 itens; valor global **R$ 1.417.472,96** e, por extenso, "um milhão quatrocentos e dezessete mil quatrocentos e setenta e dois reais e noventa e seis centavos"; "Validade da proposta: 60 dias"; "<Cidade>/<UF>, <dd> de <mês> de <aaaa>"; linha de assinatura com nome, cargo e CPF; rodapé "Página X de Y" em todas as páginas, com o cabeçalho da tabela repetido. |
| 4   | Excel, **desmarcar** ☐ registrar → exportar | Baixa `Proposta - TESTE orçamento Itatinga - <aaaa-mm-dd>.xlsx`. No Excel: aba `Proposta`; coluna Total com fórmula `ROUND(Fn*Gn,2)`; total geral `SUBTOTAL(9,…)` = **1.417.472,96**, igual ao PDF. **Ctrl+Alt+F9** (recalcular tudo) não muda nenhum valor. Mudar uma quantidade recalcula a linha e o total; fechar **sem salvar**.                                                                                                                                                                                                                                                                                                                                      |

(Com a planilha do PDF, no Step 13, repetir só o PDF para ver etapas em negrito com subtotal e, no Excel, a etapa em maiúsculas com `SUBTOTAL(9,…)` do bloco dela.)

- [ ] **Step 12: Roteiro G — versão da proposta e "Marcar enviada"**

| #   | Ação do Javerson                                  | Resultado esperado                                                                                                                                                                                                         |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Aba **Geral** da oportunidade → card de propostas | Uma versão nova (v1, ou a próxima), **R$ 1.417.472,96**, selo **Rascunho**, descrição "Orçamento com desconto de … (real …) — 56 itens" e o botão **Marcar enviada**. A exportação do Excel (desmarcada) não criou versão. |
| 2   | **Marcar enviada**                                | Selo **Enviada**; aparecem os botões Aceita/Recusada (como nas versões registradas à mão). O valor não muda.                                                                                                               |

```bash
cat > "$TEMP/proposta_itatinga.sql" <<'EOF'
select p.versao, p.valor, p.status, p.descricao, p.data_envio
  from public.proposta_oportunidade p
  join public.oportunidade o on o.id = p.oportunidade_id
 where o.nome = 'TESTE orçamento Itatinga' and o.deleted_at is null and p.deleted_at is null
 order by p.versao desc;
EOF
supabase db query --linked -o table -f "$TEMP/proposta_itatinga.sql"
```

Expected: uma linha, `valor 1417472.96`, `status Enviada`, `descricao` "Orçamento com desconto de … — 56 itens", `data_envio` preenchida.

- [ ] **Step 13: Roteiro H — planilha do PDF, "Ganho" e ordem no Projeto**

| #   | Ação do Javerson                                                                                                                                                  | Resultado esperado                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Oportunidade **TESTE orçamento PDF** → aba Orçamento → Importar o `.xlsx` do Step 8.2                                                                             | Prévia sem erros; Etapas e Itens batem com o PDF; Total de referência = total do PDF (ou a diferença explicada pelo Claude). Após importar: Nº com a numeração da planilha (`1`, `1.1`, `1.2`, `2`…); cada etapa em negrito, só com a descrição, o subtotal na coluna Vlr Total e só a lixeira. |
| 2   | Desconto `12,35` → Aplicar                                                                                                                                        | Unitários com 2 casas; subtotais das etapas = soma dos itens de cada uma; desconto real ≥ 12,35%.                                                                                                                                                                                               |
| 3   | (Opcional) Exportar proposta em PDF, ☐ sem registrar                                                                                                              | Etapas em negrito com o subtotal na coluna Total.                                                                                                                                                                                                                                               |
| 4   | Marcar a oportunidade como **Ganho**: ação "Ganhamos - migrar para Projetos" no card da oportunidade, ou arrastar no Kanban para a coluna de status do tipo ganho | Cria o projeto; a aba Orçamento da oportunidade fica vazia (os itens são movidos para o projeto, não copiados).                                                                                                                                                                                 |
| 5   | Projetos → o projeto novo → aba **Orçamento**                                                                                                                     | Itens **na ordem da planilha** (não em ordem alfabética), Nº = numeração da planilha, etapas em negrito com subtotal, unitários com o desconto; o total bate com o da oportunidade. Relatórios do orçamento não listam as etapas.                                                               |
| 6   | (Opcional) Nova solicitação de compra a partir do orçamento desse projeto                                                                                         | A lista não traz as linhas de etapa. Não precisa salvar.                                                                                                                                                                                                                                        |

```bash
cat > "$TEMP/projeto_ordem.sql" <<'EOF'
select i.ordem, i.numero, i.etapa, left(i.descricao, 50) as descricao, i.valor_total
  from public.orcamento_item i
  join public.projeto p on p.id = i.projeto_id
  join public.oportunidade o on o.id = p.oportunidade_origem_id
 where o.nome = 'TESTE orçamento PDF' and i.deleted_at is null
 order by i.ordem
 limit 15;
EOF
supabase db query --linked -o table -f "$TEMP/projeto_ordem.sql"
```

Expected: `ordem` 0, 1, 2… com `numero` na mesma sequência da planilha e da tela do projeto; `etapa = true` e `valor_total` vazio nas linhas de título.

Anote no fim do roteiro o que passou e o que não passou, e mostre ao Javerson. Diferença de total por arredondamento do unitário com BDI (como os R$ 14,73 de Itatinga) é esperada; qualquer outra diferença é defeito. Com tudo passando e o visto dele, siga para o Step 14 (push); com defeito, corrija antes (Step 5).

- [ ] **Step 14: Pedir OK ao Javerson e publicar o front (push em master)**

O roteiro dos Steps 5 a 13 já passou no servidor local, com o visto do Javerson. Se ele gerou commits `fix(...)`, rode o Step 2 de novo (suíte, lint, build e Prettier) antes do push. Encerre o servidor local do Step 5 (Ctrl+C no terminal dele, ou pare o processo em segundo plano).

```bash
git fetch -q origin
git status -sb | head -1
git log --oneline origin/master..master
```

Mostre a lista ao Javerson, separando os commits deste plano (Tasks 1 a 11 e eventuais `fix`/`style` delas) dos de outras sessões. Se houver commit de outra sessão, pergunte se ele pode ir junto: pode depender de migração que ainda não subiu (ex.: a `0125` das pastas). Pergunte: "O roteiro passou no servidor local. Posso publicar o front (push em master)? Vão junto estes N commits: …". Só com o "sim":

```bash
git push origin master
git rev-parse --short HEAD
gh run list --workflow deploy-hostgator.yml --branch master --limit 3
```

Expected: o push termina com `master -> master`. Na lista, a linha mais nova é do `HEAD` recém-publicado (se ainda for a anterior, rode o `gh run list` de novo em alguns segundos). Pegue o `ID` dessa linha:

```bash
gh run watch <ID> --exit-status
gh run list --workflow ci.yml --branch master --limit 1
```

Expected:

- `gh run watch`: todos os passos com ✓ e `Run Deploy frontend to Hostgator (<ID>) completed with 'success'` (código de saída 0). Se falhar, mostre o log (`gh run view <ID> --log-failed`) ao Javerson; o site continua na versão anterior;
- CI: `completed success` (se falhar só por arquivo de outra sessão, informe; não bloqueia o deploy).

- [ ] **Step 15: Teste rápido no site publicado**

O roteiro completo já passou no servidor local; em produção confira só que o deploy entregou tudo:

```bash
curl -s https://www.sigoobras.com.br/skills/orcamento-prefeitura-sigo/SKILL.md | head -2
```

Expected: `---` e `name: orcamento-prefeitura-sigo`. Se vier `<!doctype html>`, o `SKILL.md` não foi publicado (o `.htaccess` devolveu o `index.html`) e o botão "Skill do Claude" vai dar erro: confira `apps/web/public/skills/` no commit da Task 3.

O Javerson, em https://www.sigoobras.com.br, com **Ctrl+F5**:

| #   | Ação do Javerson                                                                            | Resultado esperado                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir uma oportunidade (a `TESTE orçamento Itatinga`, se ainda existir) → aba **Orçamento** | A barra nova aparece: **Baixar modelo**, **Skill do Claude**, **Importar planilha**, **Desconto (%)** + **Aplicar** e **Exportar proposta**.                    |
| 2   | **Baixar modelo**                                                                           | Baixa `Modelo de orcamento SIGO.xlsx` com as abas `Orçamento` e `Informações`.                                                                                  |
| 3   | **Skill do Claude**                                                                         | Baixa `orcamento-prefeitura-sigo.zip` e mostra o toast "Skill baixada. Para instalar: Claude → Configurações → Capacidades → Skills → Enviar (escolha o .zip)." |
| 4   | Configurações → aba **Empresa**                                                             | O representante legal gravado no Step 6 aparece, com o CPF formatado.                                                                                           |

**Limpeza (o Javerson decide):** apagar pelo sistema o projeto de teste e as duas oportunidades `TESTE orçamento …` (exclusão lógica). A versão de proposta de teste fica no banco, ligada à oportunidade apagada, e sai das telas junto com ela. O representante legal fica gravado (é dado real).

**Aviso para a sessão de segurança (fora desta entrega):** o Portal do cliente (`portal-cliente-dados` e `ClientePortal.jsx`) não foi alterado aqui. Com orçamento importado pela planilha, ele mostra as etapas como R$ 0,00 e corta a lista em 1.000 linhas (o orçamento aceita até 3.000). Leve isso à sessão de segurança ao fechar a entrega.

- [ ] **Step 16: Plano de volta (só se o Javerson pedir)**

A `0127` é só aditiva e **não volta**. A volta é das **telas**: revert dos commits deste plano que mexem em componentes e páginas (Tasks 5, 6, 9, 10 e 11 e eventuais `fix` delas). As libs (Tasks 1 a 4, 7 e 8) ficam sem uso, sem efeito para o usuário, e a dependência `jspdf-autotable` fica.

Pergunte: "Posso desfazer as telas do orçamento pela planilha da prefeitura (revert) e publicar? A migração 0127 fica; os itens já importados continuam no banco." Só com o "sim":

```bash
git fetch -q origin && git status -sb | head -1 && git status --short
PRIMEIRO=$(git log --format=%H --diff-filter=A origin/master -- apps/web/src/lib/orcamento-desconto.js | tail -1)
git log -1 --format='%h %s' "$PRIMEIRO"
TELAS="apps/web/src/components/oportunidades apps/web/src/pages/Oportunidades.jsx apps/web/src/pages/Projetos.jsx apps/web/src/components/projetos/OrcamentoTab.jsx apps/web/src/components/compras/SolicitacaoModal.jsx apps/web/src/pages/Configuracoes.jsx apps/web/src/components/configuracoes/EmpresaTab.jsx"
git log --format='%h %s' "$PRIMEIRO"^..origin/master -i -E --grep='orçamento|orcamento|proposta|representante' -- $TELAS
```

Expected: `PRIMEIRO` = o commit da Task 1 (o que criou `orcamento-desconto.js`; assunto `feat(orcamento): contas do desconto em centavos …`), início do intervalo; a lista traz os commits de tela deste plano, do mais novo para o mais antigo (Task 11, Task 10, Task 9, Task 6, Task 5 e `fix` deles). Mostre ao Javerson; se entrou commit de **outra sessão** (ex.: pastas da oportunidade), pare e combine, porque o revert desfaria o trabalho dela. Se `git status --short` mostrar alteração não commitada em algum desses arquivos, o revert recusa: combine com a outra sessão antes.

Com a lista confirmada:

```bash
LISTA=$(git log --format=%H "$PRIMEIRO"^..origin/master -i -E --grep='orçamento|orcamento|proposta|representante' -- $TELAS)
git revert --no-commit $LISTA
git diff --cached --stat
(cd apps/web && npx vitest run 2>&1 | tail -5)
(cd apps/web && npm run lint && echo LINT_OK)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
```

Expected: `git revert` sem conflito (a lista vem do mais novo para o mais antigo, a ordem certa); o `--stat` só com arquivos das telas e os que esses commits criaram (`OrcamentoLicitacaoBarra.jsx`, `ImportarPlanilhaOrcamentoDialog.jsx`, `ExportarPropostaDialog.jsx`, `lib/orcamento-template.js`, `lib/representante-empresa.js` e testes); vitest sem `failed`, `LINT_OK`, `BUILD_OK`. Com conflito ou falha: `git revert --abort`, e mostre ao Javerson.

```bash
git commit -F - <<'EOF'
revert(orcamento): tira das telas o orçamento pela planilha da prefeitura

Desfaz as telas do plano 2026-09-29 (barra, importação, desconto, etapas na tabela,
exportação da proposta, Marcar enviada, representante legal e ordem no Projeto).
As libs ficam sem uso e a 0127 continua aplicada (só aditiva; os itens já importados
ficam no banco e as etapas aparecem na tabela antiga como linhas sem quantidade).

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

Expected: `Run Deploy frontend to Hostgator (<ID>) completed with 'success'`. Com Ctrl+F5, a aba Orçamento volta ao que era (sem a barra), a aba Empresa sem o representante e o Projeto volta à ordem alfabética. Os orçamentos importados durante o teste mostram as etapas como linhas sem quantidade e sem preço (R$ 0,00).
