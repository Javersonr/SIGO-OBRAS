# Cronograma físico-financeiro na aba Planejamento da oportunidade

**Data:** 05/10/2026. **Aprovado por:** Javerson (desenho em 3 partes, aprovado na conversa).

É a Etapa 3 do programa de licitações (`2026-09-25-conector-claude-editais-design.md`, §11). Depende do Orçamento pela planilha da prefeitura (`2026-09-29-orcamento-planilha-prefeitura-design.md`), que cria as etapas (linhas `etapa = true` com `numero`), o desconto e o modelo SIGO de planilha.

## 1. Motivo e contexto

- Para a proposta, a Sinergia monta à mão o cronograma físico-financeiro: etapas × meses, com % e R$ ligados ao total da proposta com desconto. Muitas vezes **reperiodiza** o cronograma de referência do edital para o prazo da Ordem de Serviço (ex.: Imbé de Minas, 5 meses).
- **Hoje o SIGO não tem nada disso.**
  - A aba Planejamento mostra só tarefas (Kanban/Gantt).
  - A tabela `cronograma_etapa` existe, mas não tem R$ nem tela de criação.
  - Não há ligação com o orçamento.
- **Os editais trazem o cronograma em PDF ou Excel, em 3 layouts diferentes.** Por isso, como no orçamento, quem converte é a **skill do Claude**, e o SIGO importa um formato fixo.

## 2. Escopo

**Entra:**

1. **Quadro "Cronograma físico-financeiro"** na aba Planejamento da oportunidade (§4), acima das tarefas, que não mudam.
2. **Importação** da aba `Cronograma` do modelo SIGO, preenchida pela skill (§6).
3. **Edição** dos % na grade, **mudar o número de meses** e **reperiodizar** (§5).
4. **Exportar PDF ou Excel** do cronograma para a proposta (§7).

**Não entra (YAGNI):**

- geração de tarefas do Gantt a partir do cronograma;
- comparação com as Medições (planejado × medido);
- cronograma no Projeto depois do "Ganho": os dados ficam na oportunidade;
- curva S automática;
- cronograma por item (só por etapa de nível 1);
- datas de calendário nos meses (são "Mês 1… Mês N").

## 3. Dados — migração `0133_cronograma_fisico_financeiro.sql`

Só aditiva e idempotente, terminando em `select 'ok' as res;`:

```sql
alter table public.oportunidade
  add column if not exists cronograma_ff jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cronograma_ff) = 'object');
notify pgrst, 'reload schema';
```

**Formato de `cronograma_ff`:**

```json
{
  "meses": 4,
  "pct": { "1": [20, 35, 30, 15], "2": [0, 50, 50, 0] },
  "origem": "importado",
  "arquivo_nome": "Orcamento SIGO - PM Itatinga.xlsx",
  "atualizado_em": "2026-10-05T12:00:00.000Z"
}
```

- `meses`: inteiro de 1 a 60.
- `pct`: chave = `numero` da etapa de nível 1, valor = array com `meses` posições, cada uma um % de 0 a 100 com até 2 casas.
- `origem`: `importado` ou `manual`.
- **O R$ não é gravado.** É sempre calculado a partir do orçamento atual (§5), então muda junto com o desconto ou com uma reimportação do orçamento.
- Vazio (`{}`) = sem cronograma.
- A RLS não muda, porque é a mesma tabela `oportunidade`.

## 4. Tela (aba Planejamento da oportunidade)

**Linhas:** as **etapas de nível 1** do orçamento, ou seja, `etapa = true` e `numero` sem ponto, na ordem de `ordem`. Cada linha mostra:

- número e descrição;
- **valor da etapa**: o subtotal com desconto (`subtotaisEtapas` do Orçamento);
- **peso** no total da proposta (%).

**Colunas e rodapé:**

- **Mês 1 … Mês N**, cada célula com um campo de % (aceita `12,5`, `12.5` e `12,5%`).
- Abaixo de cada %, o **R$** daquela célula, em cinza.
- Coluna **Total %** da etapa: verde com 100,00; **vermelha com a diferença** quando não fecha.
- **Rodapé:** R$ do mês, % do mês sobre o total da proposta, acumulado em R$ e acumulado em %.

**Botões:**

- **Importar** (§6);
- **Meses** (número; §5);
- **Reperiodizar** (§5);
- **Exportar** (§7), habilitado só com todas as etapas em 100,00%.

**Comportamento:**

- **Gravação:** ao sair de uma célula, com espera de 1 s, grava o objeto inteiro com `Oportunidade.update(id, { cronograma_ff })`, no mesmo padrão `setSelectedOp`/`setOportunidades` do orçamento. Em caso de falha: toast, e o estado local volta.
- **Sem etapas no orçamento:**
  - sem itens: "Importe o orçamento com etapas para montar o cronograma.";
  - com itens mas sem etapas: "O orçamento não tem etapas. Reimporte a planilha com as etapas (a skill cria a etapa quando o edital tem uma só)."
- **Etapa do orçamento sem linha no cronograma:** aparece com as células vazias.
- **Linha do cronograma sem etapa no orçamento:** aparece em cinza, "Etapa não existe mais no orçamento", com a lixeira para apagar a linha.
- **Permissão:** quem edita o orçamento (aba "Orçamento"/"Orcamento", função `editar`) edita o cronograma. Os demais com acesso à aba só veem.

## 5. Contas, meses e reperiodização

Lógica pura em `apps/web/src/lib/cronograma-ff.js`, testada com Vitest. A aritmética é inteira: o % é tratado em centésimos (10000 = 100%) e o R$ em centavos.

**Valor de cada célula:**

- célula de uma etapa = arredondar(subtotal da etapa em centavos × % ÷ 100);
- o **último mês com % > 0** da etapa recebe a diferença, de modo que a linha some exatamente o subtotal **quando os % fecham 100,00**;
- se a linha não fecha 100%, não há ajuste e cada célula é só o arredondamento dela.

**Totais e validação:**

- **Mês:** R$ = soma da coluna; % do mês = R$ do mês ÷ total da proposta (2 casas).
- **Acumulados:** acumulado em R$ e acumulado em % (este, sobre o total da proposta).
- **Validação da linha:** soma dos % = 100,00 exatos, em centésimos. A tela mostra a diferença.

**Mudar meses (N → M), sem reperiodizar:**

- M > N acrescenta colunas com 0;
- M < N corta as colunas do fim. Se alguma cortada tiver % > 0, a tela pede confirmação: "Os meses M+1 a N têm valores. Cortar mesmo assim? (as linhas deixam de fechar 100%)".

**Reperiodizar (N → M), para cada etapa:**

1. Monta a curva acumulada C nos limites dos meses: C(0) = 0, C(k) = soma dos k primeiros meses, C(N) = soma de todos. Entre os limites, a curva é linear.
2. Os novos limites ficam em t = j × N ÷ M, para j = 0 … M. O novo % do mês j = C(j·N/M) − C((j−1)·N/M).
3. Arredonda em centésimos pelo **maior resto**, para que a soma da linha fique igual à de antes (100,00 se fechava).
4. Mantém a forma da curva. Ex.: 20/35/30/15 em 4 meses → 2 meses = 55/45.

O reperiodizar pede confirmação e grava o resultado como `origem: "manual"`.

## 6. Importação (aba `Cronograma` do modelo SIGO)

**Modelo:**

- O `gerarModelo` do Orçamento passa a criar uma **3ª aba, `Cronograma`**, opcional.
- **Cabeçalho na linha 1:** `Item` | `Descrição` | `Mês 1` | `Mês 2` | … | `Mês 12`. Pode ir até `Mês 60`; colunas a mais são ignoradas.
- **Linhas:** só as etapas de nível 1 (o mesmo `Item` da aba Orçamento), com o **%** de cada mês.

**Leitura** (`apps/web/src/lib/cronograma-modelo.js`, testada):

- O cabeçalho é comparado como no orçamento: sem acento, sem maiúsculas, espaços colapsados. Os meses são reconhecidos por `Mês <n>`, e o número de meses = maior n com coluna.
- **Formatos de valor aceitos:**
  - número 0–100 (ex.: `20`);
  - texto pt-BR (`12,5` ou `12,5%`);
  - célula com formato de % (`0,2` exibido como `20%`): o valor vira `× 100`.
  - Vazio = 0.
- **Erros, que bloqueiam:** sem a aba `Cronograma`; cabeçalho sem `Item` ou sem nenhum `Mês n`; `%` negativo ou acima de 100; `Item` repetido; texto não numérico numa célula de mês.
- **Avisos, que não bloqueiam:**
  - linha cuja soma ≠ 100,00 (importa assim mesmo, fica vermelha);
  - `Item` sem etapa no orçamento (ignorado);
  - etapa do orçamento sem linha (fica vazia);
  - % com mais de 2 casas (arredondado).
- **Na tela:**
  1. **Importar** pede o `.xlsx`, que pode ser o mesmo arquivo do orçamento, e mostra a prévia (meses, etapas, erros e avisos).
  2. Se já houver cronograma, confirma "Substituir o cronograma atual?".
  3. Grava `cronograma_ff` com `origem: "importado"` e o nome do arquivo.

**Skill do Claude** (`orcamento-prefeitura-sigo`, a mesma do orçamento):

- O SKILL.md ganha a seção **Cronograma**. Quando o edital tiver cronograma físico-financeiro, a skill preenche a aba `Cronograma` com os % por etapa e por mês, copiando os meses do edital sem reperiodizar.
- Se o edital trouxer só R$, a skill converte para % pelo valor da etapa no cronograma da prefeitura, com 2 casas, e anota em Observações.
- Se o orçamento da prefeitura não tiver etapas e o cronograma tiver **uma só** etapa (ex.: Itatinga, "1 SERVIÇOS DE ELÉTRICA"), a skill cria essa etapa 1 no orçamento e numera os itens 1.1, 1.2…
- **O código Python da skill passa a aceitar 3 abas.** Hoje, `conferir_modelo_sigo` exige exatamente Orçamento e Informações. Ele também passa a conferir a soma de cada linha do cronograma. O teste do SKILL.md (Orçamento, Task 3) é atualizado.

## 7. Exportar (PDF ou Excel)

**Diálogo "Exportar cronograma":**

- formato (PDF/Excel);
- local e data;
- **representante legal** (nome, cargo e CPF), preenchido com `empresa.representante_*` e editável sem gravar, com a mesma validação da proposta (`validarRepresentante`).

**Conteúdo:**

1. **Cabeçalho:** empresa (razão social, CNPJ, endereço), "Cronograma físico-financeiro", órgão, objeto e edital (`orcamento_info`, com o mesmo fallback da proposta), prazo em meses.
2. **Tabela:** Item · Etapa · Valor da etapa (R$) · % do total · Mês 1 … Mês N. **Cada etapa ocupa 2 linhas:** R$ em cima, % embaixo.
3. **Rodapé:** Total do mês (R$), % do mês, Acumulado (R$), Acumulado (%).
4. Local e data, e a assinatura do representante.

**PDF e Excel:**

- **PDF:** A4 paisagem, `jspdf` + `jspdf-autotable` (do Orçamento).
  - Com mais de 12 meses, a tabela quebra na horizontal repetindo Item e Etapa (`horizontalPageBreak` e `horizontalPageBreakRepeat`).
  - Rodapé "Página X de Y".
  - Nome: `Cronograma - <oportunidade> - <aaaa-mm-dd>.pdf`.
- **Excel (SheetJS):**
  - valores de R$ e % por célula, com as somas do rodapé e os acumulados em fórmula `SUM`, com o valor em cache;
  - sem negrito (limitação do SheetJS CE);
  - mesmo nome, com `.xlsx`.

Não há registro de versão do cronograma.

## 8. Organização do código

**Funções puras, com Vitest:**

- `apps/web/src/lib/cronograma-ff.js`: etapas do orçamento, normalização do objeto, células em R$, totais, acumulados, validação, mudar meses e reperiodizar;
- `apps/web/src/lib/cronograma-modelo.js`: leitura da aba `Cronograma` e a aba nova no `gerarModelo`;
- `apps/web/src/lib/cronograma-export.js`: dados da exportação, `montarPlanilhaCronograma` e `gerarPdfCronograma`, reaproveitando o padrão do `proposta-export.js`.

**Componentes (`apps/web/src/components/oportunidades/`):**

- `CronogramaFisicoFinanceiro.jsx`: o quadro;
- `ImportarCronogramaDialog.jsx`;
- `ExportarCronogramaDialog.jsx`.

**Onde ligar:**

- `OportunidadeDetalhe.jsx`, na aba Planejamento, acima do `DiarioObraTab`;
- o `CalendarioConsolidado` usa o mesmo detalhe, então as props novas são opcionais.

**Skill:**

- `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md`, seção Cronograma e código;
- `apps/web/src/lib/skill-orcamento.test.js`, que confere os textos da aba nova.

## 9. Testes

**Vitest em `cronograma-ff`:**

- células com absorção dos centavos: a linha soma exatamente o subtotal, inclusive com 33,33/33,33/33,34;
- totais e acumulados;
- validação de 100,00;
- mudar meses, para mais e para menos;
- reperiodizar:
  - 20/35/30/15 (4 meses) → 2 meses = 55,00/45,00 e → 8 meses, somando 100,00;
  - 8 → 5;
  - linha com meses zerados;
  - linha que não fecha 100 mantém a soma.

**Vitest em `cronograma-modelo`:**

- cabeçalho com variações;
- % como número, como texto e com formato de %;
- cada erro e cada aviso do §6;
- 60 meses;
- arquivo sem a aba.

**Vitest em `cronograma-export`:**

- fórmulas `SUM` e valores em cache;
- PDF com mais de 12 meses gera sem erro e com mais de uma página.

**Lint e build.**

**Aceite com casos reais:**

- **Itatinga:** a planilha convertida pela skill tem a aba Cronograma com a etapa 1 em 20/35/30/15. Importar, conferir o R$ de cada mês contra o subtotal com desconto, exportar PDF e Excel.
- **Imbé de Minas:** importar o cronograma de referência do edital, **reperiodizar para 5 meses** e comparar com a planilha feita à mão em `D:\OneDrive\SINERGIA\LICITAÇÕES\SINERGIA SERVIÇOS\Licitações\2026\098 - PM DE IMBE DE MINAS\03- Proposta\Cronograma Físico-Financeiro - reperiodizado (5 meses da OS).xlsx`. A diferença por mês tem de ser explicada (arredondamento ou critério diferente da planilha manual).

## 10. Publicação (cada passo com OK do Javerson)

1. Migração `0133` com `supabase db query --linked -f`. Ela vem antes do push, porque o front novo grava `cronograma_ff`.
2. Teste com o Javerson no `npm run dev`, depois do push do Orçamento.
3. Push em `master`.

Não há Edge Function nova nem alterada.

## 11. Critérios de aceite

- Com o orçamento de Itatinga importado (1 etapa) e o desconto de 12,35%, o cronograma importado em 20/35/30/15 mostra cada mês = subtotal × % (centavos fechando no último mês), acumulado de 100% e R$ igual ao total da proposta.
- Reperiodizar 4 → 2 dá 55/45; 2 → 4 volta a uma curva que soma 100,00.
- PDF e Excel exportados batem entre si e com a tela. O Excel recalcula igual (Ctrl+Alt+F9).
- Mudar o desconto do orçamento muda o R$ do cronograma sem mexer nos %.
