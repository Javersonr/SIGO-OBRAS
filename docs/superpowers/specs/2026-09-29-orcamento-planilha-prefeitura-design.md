# Orçamento pela planilha da prefeitura, com desconto e proposta em PDF/Excel

**Data:** 29/09/2026. **Aprovado por:** Javerson (desenho em 3 partes, aprovado na conversa).

É a Etapa 2 do programa de licitações (`2026-09-25-conector-claude-editais-design.md`, §11). A Etapa 3 (cronograma físico-financeiro) vem depois e usa as etapas criadas aqui. As pastas nos Arquivos estão em outra spec (`2026-09-29-pastas-arquivos-oportunidade-design.md`), tocada por outra sessão.

## 1. Motivo e contexto

- Para montar a proposta, a Sinergia redigita a planilha orçamentária da prefeitura, aplica o desconto e gera o Excel/PDF à mão.
- Levantamento de 29/09 (pastas de licitação de 2025–2026, cerca de 340 processos):
  - 83% das planilhas orçamentárias vêm **só em PDF**;
  - os Excel mudam de colunas a cada edital, a numeração vai de 0 a 4 níveis e o BDI aparece de 4 jeitos diferentes.
  - Por isso, quem converte a planilha da prefeitura é o **Claude**, por uma skill. O SIGO importa **um único formato fixo**.
- Como está o SIGO hoje:
  - `orcamento_item` é uma lista plana: sem número hierárquico, sem etapa, sem fonte e sem preço de referência;
  - o BDI é por linha e não há desconto;
  - a aba Orçamento do Projeto reordena os itens em ordem alfabética (`Projetos.jsx:209-216`);
  - `proposta_oportunidade` guarda um valor digitado à mão, sem ligação com o orçamento.

## 2. Escopo

**Entra:**

1. **Baixar modelo:** Excel em branco no modelo do SIGO (§4).
2. **Skill do Claude:** um .zip com a skill `orcamento-prefeitura-sigo` (§5), para qualquer Claude (claude.ai, Claude Desktop, Claude Code).
3. **Importar planilha (modelo SIGO):** leitura no navegador, sem IA, com prévia, avisos e confirmação. Substitui os itens do orçamento da oportunidade (§7).
4. **Desconto (%):** campo fixo, linear em todos os itens importados. Unitário cortado na 2ª casa (§8).
5. **Exportar PDF ou Excel** da proposta, com a opção de registrar uma nova versão na aba Proposta (§9).
6. **Representante legal** da empresa (nome, cargo e CPF) em Configurações → Empresa (§10).
7. **Etapas visíveis** na aba Orçamento da oportunidade e do projeto, e **ordem respeitada no projeto** (§11).

**Não entra (YAGNI):**

- cronograma físico-financeiro (Etapa 3);
- ferramenta do conector ("preencher orçamento");
- leitura da planilha da prefeitura pelo Gemini dentro do SIGO;
- composição do BDI e planilha de composições;
- upload do PDF da proposta para o Storage;
- pastas;
- desconto diferente por item ou por etapa;
- informar o valor final do lance e calcular o %.

## 3. Fluxo do usuário (aba Orçamento da oportunidade)

1. **Baixar modelo** ou **Skill do Claude**.
2. Com a skill instalada, o usuário manda ao Claude a planilha da prefeitura (PDF ou Excel). O Claude devolve o Excel no modelo do SIGO, com os preços de referência sem desconto.
3. **Importar planilha** → escolhe o arquivo → **prévia**, com:
   - número de etapas e de itens;
   - total de referência calculado e o total informado pela prefeitura;
   - lista de erros, que bloqueiam, e de avisos, que não bloqueiam.
4. **Confirmar.** Se o orçamento já tiver itens: "Substituir os N itens atuais?". Os itens são gravados com o desconto atual da oportunidade já aplicado (0% na primeira vez).
5. Digita o **Desconto (%)** e clica em **Aplicar**. A tela mostra: total de referência · total da proposta · desconto real.
6. **Exportar** → PDF ou Excel (§9).

## 4. Modelo SIGO de orçamento (formato exato)

Arquivo `.xlsx` com duas abas. **Fonte única dos nomes:** `apps/web/src/lib/orcamento-modelo.js`. Um teste garante que a skill usa os mesmos textos.

**Aba `Orçamento`.** A linha 1 é o cabeçalho, com estes textos e nesta ordem:

| Coluna | Cabeçalho             | Obrigatório | Conteúdo                                              |
| ------ | --------------------- | ----------- | ----------------------------------------------------- |
| A      | `Item`                | sim         | número hierárquico em **texto**: `1`, `1.1`, `1.1.2`  |
| B      | `Código`              | não         | código na fonte (ex.: `93358`)                        |
| C      | `Fonte`               | não         | `SINAPI`, `SETOP`, `SICRO`, `CDHU`, `Próprio`…        |
| D      | `Descrição`           | sim         | texto do serviço ou da etapa                          |
| E      | `Unidade`             | item        | `m`, `m²`, `un`…                                      |
| F      | `Quantidade`          | item        | número, até 3 casas                                   |
| G      | `Preço unitário (R$)` | item        | preço unitário **com BDI** da prefeitura, até 4 casas |
| H      | `Total (R$)`          | não         | total da prefeitura, só para conferência              |

- **Linha de etapa (título):** Item e Descrição preenchidos, Quantidade e Preço vazios. Pode ter qualquer nível (`1`, `1.2`).
- **Linha de item:** Quantidade e Preço preenchidos.
- A coluna A tem formato Texto (`@`) no modelo, para o Excel não transformar `1.10` em `1.1`.

**Aba `Informações`.** Rótulo na coluna A, valor na coluna B. Rótulos desconhecidos são ignorados:

- `Órgão`
- `Objeto`
- `Edital/Processo`
- `Data-base`
- `BDI (%)`
- `Fonte de preços`
- `Total da prefeitura (R$)`
- `Observações`

## 5. Skill do Claude `orcamento-prefeitura-sigo`

- **Arquivo:** `apps/web/public/skills/orcamento-prefeitura-sigo/SKILL.md`, a única fonte.
- **Botão "Skill do Claude":**
  - lê esse arquivo e monta no navegador (JSZip, já no projeto) o `orcamento-prefeitura-sigo.zip`, com a pasta `orcamento-prefeitura-sigo/SKILL.md`;
  - mostra um texto curto de como instalar: "Claude → Configurações → Capacidades → Skills → Enviar". O Javerson também instala por ali.
- **Regras da skill:**
  - **Entrada:** PDF ou Excel da planilha orçamentária do edital. **Saída:** `.xlsx` no modelo do §4, nome `Orcamento SIGO - <órgão>.xlsx`.
  - Copiar fielmente número, código, fonte, descrição, unidade e quantidade, na ordem da planilha. Normalizar `1.0` → `1` e manter o resto da numeração.
  - **Preço unitário com BDI.** Se a planilha só tiver o preço sem BDI e um BDI geral: calcular com BDI = arredondar(sem BDI × (1 + BDI), 2), como a prefeitura faz, e anotar em `Observações`. Com dois BDIs (material e serviço), usar o da linha e anotar.
  - Linhas de etapa: só número e descrição.
  - **Não aplicar desconto** (o SIGO aplica).
  - Nunca inventar: o que estiver ilegível ou ambíguo vai para `Observações` e para a resposta ao usuário.
  - Conferir Σ arredondar(quantidade × preço, 2) contra o total geral da prefeitura e informar a diferença; o total da prefeitura vai em `Total da prefeitura (R$)`.
  - Escrever o `.xlsx` com código, a coluna A como texto e, no claude.ai, oferecer o arquivo para baixar.

## 6. Dados — migração `0127_orcamento_planilha_prefeitura.sql`

Só aditiva e idempotente, terminando em `select 'ok' as res;`. A 0125 é das pastas e a 0130 do EAD, de outras sessões.

```sql
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
```

**Item importado:**

- `numero`, `etapa`, `codigo`, `fonte`, `descricao`, `unidade`, `quantidade` e `valor_unitario_ref` vêm do modelo;
- `valor_unitario` = preço com desconto (§8);
- `bdi = 0`, `imposto = 0`;
- `valor_total` = arredondar(quantidade × valor_unitario, 2);
- `ordem` = posição na planilha; `item` = `numero` (rótulo legado);
- `tipo` fica nulo.

Assim a conta de hoje (quantidade × unitário × (1+bdi) × (1+imposto)) dá o mesmo valor nas telas que já a fazem.

**Etapa:** `etapa = true`, com quantidade, valores e `valor_unitario_ref` nulos. O subtotal não é gravado: é a soma dos `valor_total` dos itens cujo `numero` começa com `<numero da etapa>.`.

**Outros pontos:**

- A RLS não muda, porque são as mesmas tabelas.
- Na passagem da oportunidade para projeto ("Ganho"), as colunas novas vão junto. O plano confere o código da conversão.
- `oportunidade.orcamento_info` guarda a aba Informações: `{orgao, objeto, edital, data_base, bdi, fonte, total_prefeitura, observacoes, arquivo_nome, importado_em}`.

## 7. Importação

- Leitura no navegador com a biblioteca `xlsx` (SheetJS, já no projeto). A lógica fica em funções puras em `lib/orcamento-modelo.js`.
- Números aceitos como número ou como texto pt-BR (`1.234,56`).
- **Erros, que bloqueiam:**
  - sem a aba `Orçamento`;
  - cabeçalho sem alguma coluna obrigatória. A comparação ignora maiúsculas, acentos e espaços; a ordem das colunas não importa;
  - nenhum item;
  - `Item` vazio, ou fora do padrão `^\d+(\.\d+)*$`;
  - `Item` repetido;
  - Quantidade ≤ 0, Preço < 0 ou texto não numérico nessas colunas;
  - só um dos dois preenchido (Quantidade sem Preço, ou o contrário);
  - mais de 3.000 linhas.
- **Avisos, que não bloqueiam:**
  - `Total (R$)` diferente de arredondar(quantidade × preço, 2) em mais de R$ 0,01 (lista as linhas);
  - Σ dos itens diferente do `Total da prefeitura (R$)` em mais de R$ 0,01;
  - Quantidade com mais de 3 casas (é arredondada a 3);
  - Preço com mais de 4 casas;
  - `Item` lido como número (a linha pode ter virado `1.1` em vez de `1.10`);
  - item sem etapa acima;
  - numeração fora de sequência.
- **Gravação:**
  - apaga os `orcamento_item` da oportunidade e insere os novos em lotes, na ordem da planilha;
  - grava `orcamento_info` com o nome do arquivo e a data;
  - se falhar no meio: toast de erro e recarga da lista. Os itens antigos já apagados não voltam; o usuário importa de novo.
  - A prévia avisa que a importação substitui o orçamento.

## 8. Desconto e arredondamento

- **Campo `Desconto (%)`:** de 0 a 99,99, com até 2 casas. O botão **Aplicar** grava `oportunidade.desconto_proposta_pct` e recalcula os itens que têm `valor_unitario_ref`.
- **Por item:**
  - `valor_unitario` = **truncar**(`valor_unitario_ref` × (1 − d/100), 2), ou seja, corte na 2ª casa, nunca para cima;
  - `valor_total` = **arredondar**(quantidade × valor_unitario, 2), arredondamento normal, meio para cima.
  - A multiplicação é feita em centavos inteiros, sem erro de ponto flutuante: é isso que os testes cobrem.
- **Totais:** subtotal da etapa = Σ dos seus itens; total da proposta = Σ de todos os itens. O total de referência é a mesma conta com `valor_unitario_ref`.
- **Desconto real** = 1 − total da proposta ÷ total de referência (itens com referência), exibido com 2 casas. Por causa do corte, fica ≥ o digitado.
- **Exemplo:** referência 10,48, desconto 12,35% → 10,48 × 0,8765 = 9,18572 → **9,18**. Com quantidade 125,5, o total é **1.152,09**.
- **Itens sem referência** (incluídos à mão) não mudam. A tela mostra "N itens sem preço de referência não recebem o desconto".
- **Aviso no Aplicar:** "Recalcula todos os itens importados a partir do preço da prefeitura; ajustes feitos à mão nesses itens serão substituídos."
- Os itens são gravados em lote. Em caso de falha: toast e recarga.

## 9. Exportar a proposta (PDF ou Excel)

**Diálogo "Exportar proposta":**

- formato (**PDF** / **Excel**);
- validade em dias (padrão 60);
- local (padrão: cidade/UF da empresa);
- data (padrão: hoje);
- ☑ "Registrar como nova versão da proposta".

Sem o representante legal preenchido, o diálogo avisa e aponta para Configurações → Empresa, e não exporta.

**Conteúdo (o mesmo nos dois formatos):**

1. **Cabeçalho:**
   - razão social, CNPJ, endereço, telefone e e-mail da empresa;
   - "Proposta de preços";
   - órgão, objeto e edital/processo (de `orcamento_info`; se faltar, o nome da oportunidade);
   - data-base e BDI de referência, se houver.
2. **Tabela:** Item · Código · Fonte · Descrição · Unid. · Qtd. · Preço unit. (R$) · Total (R$). As etapas saem em negrito, com o subtotal na coluna Total.
3. **Valor global** da proposta em número e **por extenso** ("… reais e … centavos").
4. Validade da proposta, local e data.
5. **Assinatura:** linha, nome, cargo e CPF do representante legal.

**PDF:**

- A4 paisagem, com `jspdf` (já no projeto) e **`jspdf-autotable`** (dependência nova), que quebra páginas e repete o cabeçalho da tabela;
- número da página no rodapé;
- nome do arquivo: `Proposta - <nome da oportunidade> - <aaaa-mm-dd>.pdf`, com os caracteres inválidos trocados.

**Excel (SheetJS):**

- aba `Proposta` com o cabeçalho e a tabela;
- **fórmulas com o valor já calculado junto:**
  - total do item = `ROUND(Fn*Gn,2)`;
  - subtotal da etapa = `SUBTOTAL(9, H<primeira>:H<última>)`, cobrindo o bloco contíguo da etapa;
  - total geral = `SUBTOTAL(9, H<todas>)`. O `SUBTOTAL` ignora os subtotais de dentro do intervalo, então as etapas aninhadas não contam duas vezes.
- Mesmo nome de arquivo, com `.xlsx`.

**Registrar versão:** cria `proposta_oportunidade` com:

- `valor` = total da proposta;
- `descricao` = `Orçamento com desconto de X% (real Y%) — N itens`;
- `status` = `Rascunho`.

O trigger de imutabilidade da tabela não muda.

## 10. Representante legal (Configurações → Empresa)

- Seção nova "Representante legal" no `EmpresaTab.jsx`: Nome, Cargo e CPF (com máscara e validação de dígitos).
- Se o nome estiver vazio, o campo sugere o `responsavel_principal`.
- Grava em `empresa.representante_*`. Quem pode editar é quem já edita os dados da empresa.
- As declarações da etapa das pastas vão reaproveitar esses campos.

## 11. Etapas nas telas e ordem no Projeto

- **Oportunidade e Projeto:**
  - quando os itens têm `numero`, a coluna Nº mostra o `numero`, e não a posição;
  - linha de etapa em negrito, sem quantidade e sem preço, com o subtotal;
  - ações de editar ou apagar uma etapa ficam só no apagar;
  - os totais das telas ignoram as linhas de etapa.
- **Projeto (`Projetos.jsx:209-216`):** se algum item tiver `numero` ou `ordem`, ordenar por `ordem`. Se não tiver (dados antigos), mantém a ordem alfabética de hoje.
- **Portal do cliente:** o plano confere como o portal mostra itens com valores nulos. `portal-cliente-dados` e `ClientePortal.jsx` estão com a sessão de segurança; qualquer ajuste ali é combinado com ela.

## 12. Organização do código

- **Funções puras, testadas com Vitest:**
  - `apps/web/src/lib/orcamento-modelo.js`: cabeçalhos, gerar modelo em branco, ler e validar o `.xlsx` → `{itens, info, erros, avisos, totais}`;
  - `apps/web/src/lib/orcamento-desconto.js`: truncar e arredondar em centavos, aplicar desconto, subtotais de etapa, totais, desconto real;
  - `apps/web/src/lib/proposta-orcamento.js`: montar as linhas e os dados da proposta, valor por extenso, nome do arquivo.
- **Geração dos arquivos:** `apps/web/src/lib/proposta-export.js` (PDF com jspdf-autotable e Excel com SheetJS, a partir dos dados de `proposta-orcamento.js`).
- **Componentes (`apps/web/src/components/oportunidades/`):**
  - `OrcamentoLicitacaoBarra.jsx`: botões, campo de desconto e resumo;
  - `ImportarPlanilhaOrcamentoDialog.jsx`;
  - `ExportarPropostaDialog.jsx`.
- **Ligação nas telas:** `OportunidadeDetalhe.jsx` e `Oportunidades.jsx`, na aba Orçamento; `Projetos.jsx` e `OrcamentoTab.jsx`, com a ordem e as etapas; `EmpresaTab.jsx`.

## 13. Testes

- **Vitest:**
  - `orcamento-modelo`: cabeçalho com variações de acento e ordem, etapas e itens, cada erro e cada aviso do §7, número pt-BR, `Item` numérico, limite de linhas;
  - `orcamento-desconto`: o exemplo do §8, corte e não arredondamento, casos de ponto flutuante (ex.: 0,29 × 100), itens sem referência, desconto 0 e 99,99, subtotais aninhados, desconto real;
  - `proposta-orcamento`: linhas com subtotal, valor por extenso (0,01; 1,00; 1.000.000,10; 2.345.678,90), nome do arquivo;
  - a skill contém exatamente os cabeçalhos de `orcamento-modelo.js`.
- `npm run lint` e `npm run build`.
- **Ponta a ponta, antes do push:**
  1. rodar a skill com a planilha de **Itatinga** (Excel original) e com uma planilha em **PDF** de outro processo;
  2. importar na oportunidade;
  3. aplicar 12,35%;
  4. exportar PDF e Excel;
  5. conferir os totais no Excel aberto e a numeração no Projeto depois da conversão, numa oportunidade de teste.

## 14. Publicação (cada passo com OK do Javerson)

1. Migração `0127` com `supabase db query --linked -f` (nunca db push).
2. Push em `master` (publica o site).

Não há Edge Function nova nem alterada.

## 15. Critérios de aceite

- O modelo baixado, preenchido pela skill a partir da planilha de Itatinga, importa sem erros. Etapas, itens e total batem com a planilha da prefeitura.
- Com 12,35% aplicado, todo preço unitário tem 2 casas e é ≤ referência × 0,8765. Todo total de item = arredondar(qtd × unit., 2). O total da proposta = Σ dos itens.
- O PDF e o Excel saem com cabeçalho, etapas com subtotal, valor por extenso e assinatura do representante. O Excel recalcula igual ao PDF.
- "Registrar versão" cria a versão na aba Proposta com o total exportado.
- Depois de "Ganho", o orçamento do projeto mostra os itens na ordem da planilha, com as etapas.
