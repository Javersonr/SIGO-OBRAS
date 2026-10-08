# Conector do Claude: orçamento, proposta e cronograma pela conversa

- **Data:** 08/10/2026.
- **Status:** aprovado pelo Javerson no chat em 08/10.
- **Complementa:**
  - `2026-09-25-conector-claude-editais-design.md`, a etapa 1 do conector;
  - `2026-09-29-orcamento-planilha-prefeitura-design.md`;
  - `2026-10-05-cronograma-fisico-financeiro-design.md`.
- **Entra no Plano 2 do conector** como uma parte própria.

## 1. Objetivo

Quem monta o orçamento, a proposta e o cronograma da licitação é o **Claude do cliente**, pelo conector:

1. O Claude lê as planilhas da prefeitura no chat (planilha orçamentária e cronograma).
2. Ele monta os Excel de trabalho, com a skill `orcamento-prefeitura-sigo`, que já gera o modelo SIGO com 3 abas.
3. Ele **grava direto no SIGO**, sem o usuário importar arquivo pela tela.

O PDF ou Excel **oficial** da proposta e do cronograma, com o cabeçalho da empresa, o representante legal e a
assinatura, continua saindo da tela. São 1 clique em **Exportar proposta** e outro em **Exportar cronograma**, que já
existem. A escolha foi do Javerson em 08/10. Gerar o PDF no servidor fica fora do escopo.

## 2. Ferramentas novas do conector

Todas são de gravação (`readOnlyHint: false`, `destructiveHint: false`), recebem `oportunidade_id` e usam a empresa da
chave do conector. As regras são as **mesmas da tela**, e a mesma entrada dá o mesmo resultado.

| Ferramenta                | Faz                                                                                                                                                                                                                             | Permissão (mesmos nomes das telas)              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `importar_orcamento`      | Grava etapas e itens no orçamento da oportunidade, a partir das linhas do modelo SIGO enviadas como JSON.                                                                                                                       | Oportunidades → editar e aba Orçamento → editar |
| `aplicar_desconto`        | Aplica o desconto linear em % a todos os itens importados.                                                                                                                                                                      | Idem                                            |
| `importar_cronograma`     | Grava `oportunidade.cronograma_ff` (meses e % por etapa de nível 1).                                                                                                                                                            | Idem                                            |
| `registrar_proposta`      | Cria a versão da proposta em `proposta_oportunidade`, status **Rascunho**, com o total da proposta e a descrição "Orçamento com desconto de … — N itens".                                                                       | Oportunidades → editar                          |
| `ler_orcamento` (leitura) | Devolve etapas, itens (número, descrição, unidade, quantidade, preço de referência, preço com desconto, total), subtotais, total de referência, total da proposta, desconto e cronograma (meses, % e se cada linha fecha 100%). | Oportunidades → visualizar                      |

### `importar_orcamento`

- **Entrada:**
  - `linhas`: lista de `{item, codigo, fonte, descricao, unidade, quantidade, preco_unitario, total}`, com os mesmos
    campos e as mesmas regras da aba Orçamento do modelo;
  - `informacoes`: `{orgao, objeto, edital, data_base, bdi, fonte_precos, total_prefeitura, observacoes}`;
  - `substituir`: booleano.
- **Validação:** as regras de `lerPlanilhaModelo` (`apps/web/src/lib/orcamento-modelo.js`), sem a leitura do xlsx.
  - **Bloqueiam:** Item repetido, item sem etapa, número inválido e acima de 3.000 linhas.
  - **Viram avisos:** diferenças de Total e a soma diferente do total da prefeitura.
  - Com erro, nada é gravado e a ferramenta devolve a lista de erros, para o Claude corrigir.
- **Orçamento que já existe:** se a oportunidade já tem itens e `substituir` não é `true`, nada é gravado. A ferramenta
  devolve quantos itens existem, para o Claude perguntar ao usuário, como o "Substituir os N itens atuais?" da tela.
- **Gravação:**
  - mesmos registros de `montarRegistrosImportacao` e `montarInfoOrcamento` (`orcamento-registros.js`), em lotes de 200;
  - o orçamento é substituído de forma atômica: troca toda a lista ou nada, com RPC transacional;
  - grava `oportunidade.orcamento_info` e registra `oportunidade_atualizacao` (tipo "Sistema", "via Claude").
- **Retorno:** número de etapas e de itens, total de referência, avisos e o link `?openId=`.

### `aplicar_desconto`

- **Entrada:** `desconto_pct`, de 0 a 99,99 com até 2 casas, a mesma `validarDesconto`.
- **Conta:** `aplicarDesconto` e `precoComDesconto`:
  - unitário = TRUNCAR(referência × (1 − d), 2);
  - total = ARREDONDAR(quantidade × unitário, 2);
  - aritmética inteira.
- **Gravação:** só nos itens importados (com preço de referência) e em `oportunidade.desconto_proposta_pct`, de forma
  atômica.
- **Retorno:** total de referência, total da proposta e desconto real.

### `importar_cronograma`

- **Entrada:** `meses` (1 a 60) e `linhas`, uma lista de `{item, pct: [..]}`, um item por etapa de nível 1.
- **Validação:** as regras de `lerAbaCronograma` e `normalizarCronograma` (`cronograma-modelo.js` e `cronograma-ff.js`),
  sem o xlsx.
  - **Bloqueiam:** etapa que não existe no orçamento e % fora de 0 a 100.
  - **Viram avisos:** linha que não fecha 100,00% e etapa do orçamento sem linha.
- **Já existe cronograma:** se `substituir` não é `true`, nada é gravado e o Claude pergunta.
- **Gravação:** grava `{meses, pct, origem: "importado", arquivo_nome: "via Claude", atualizado_em}`.
- **Retorno:** o resumo do cronograma (`resumoCronograma`): R$ por mês, acumulados e as linhas que não fecham.

### `registrar_proposta`

- **Gravação:** grava como o "Registrar como nova versão" do `ExportarPropostaDialog`, com status Rascunho, a próxima
  versão e o valor do total da proposta atual.
- **Recusa:** sem orçamento importado, não registra.

## 3. Regras compartilhadas entre a tela e o servidor

As regras puras do front (`orcamento-modelo.js`, sem a parte de xlsx, `orcamento-desconto.js`, `orcamento-registros.js`
e `cronograma-ff.js`) passam a ter uma versão do servidor em `supabase/functions/_shared/orcamento/` (TypeScript, sem
`Deno.*`). Testes de paridade no Vitest importam as duas e rodam a mesma lista de casos: mesma entrada, mesmo
resultado. A tela continua usando as libs dela; nada muda para quem importa pela tela.

## 4. Roteiro e instruções

- **Prompt MCP "Orçamento e cronograma da licitação":**
  1. ler a planilha orçamentária e o cronograma da prefeitura;
  2. montar as linhas no formato do modelo (as regras da skill: etapa de nível 1 sem quantidade, numeração da
     prefeitura, preço com BDI, data-base);
  3. mostrar o resumo ao usuário: etapas, itens, total e diferença para o total da prefeitura;
  4. perguntar o desconto;
  5. chamar `importar_orcamento`, depois `aplicar_desconto`, `importar_cronograma` e `registrar_proposta`;
  6. gerar os Excel com a skill e anexar nos Arquivos da oportunidade pelo link de envio (pasta Proposta).
- **No fim, o Claude avisa** o usuário para baixar o PDF oficial em **Exportar proposta** e **Exportar cronograma**,
  com o link da oportunidade.
- **Skill `orcamento-prefeitura-sigo`:** quando o conector SIGO está disponível, ela grava pelas ferramentas em vez de
  pedir a importação manual.
- **Pedido no chat que não dá para fazer:** o Claude diz que não dá e não inventa.

## 5. Segurança

- Mesmas checagens do `mcp`: chave presa à empresa, permissão por ferramenta, limite, auditoria em `mcp_auditoria` e
  anti-injeção. As planilhas da prefeitura são dados, nunca instruções.
- Toda gravação filtra pela empresa da chave, nunca por um `empresa_id` vindo da entrada.
- Nenhuma ferramenta apaga a oportunidade nem mexe em financeiro. "Substituir o orçamento" só acontece com
  `substituir: true`, depois de o usuário confirmar no chat.

## 6. Testes e aceite

- **Unitários (`node --test`):** validação das linhas, desconto, cronograma e os retornos de recusa (sem permissão,
  orçamento existente sem `substituir`, erro de validação).
- **Paridade (Vitest):** os casos de Itatinga e Imbé de Minas, que já estão nos testes das libs, dão o mesmo resultado
  no servidor. Itatinga com desconto de 12,35%: total de R$ 1.417.472,96 e item 1.1 com unitário de R$ 3.072,56.
  Cronograma 20/35/30/15: R$ 283.494,59, 496.115,54, 425.241,89 e 212.620,94.
- **Aceite manual (Javerson, com o Claude real):** numa oportunidade TESTE, o Claude importa Itatinga, aplica 12,35%,
  grava o cronograma, registra a proposta e anexa os Excel. Na tela, o "Exportar proposta" e o "Exportar cronograma"
  saem com os mesmos números.
