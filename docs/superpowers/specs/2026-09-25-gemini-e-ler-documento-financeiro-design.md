# Gemini como IA padrão + "Ler documento" no Financeiro

**Data:** 25/09/2026 · **Status:** desenho aprovado em conversa; aguardando revisão desta spec

## 1. Objetivo

1. **Parte A:** o Gemini (Google) vira a IA padrão do SIGO, com o ChatGPT de reserva. A chave fica
   só no SaaS Admin (a Sinergia Digital paga), e o uso é registrado por empresa com custo estimado.
2. **Parte B:** na **nova despesa** e na **nova receita**, o botão **"Ler documento"** lê XML de NF-e/NFS-e
   (sem IA), PDF ou foto (DANFE, NFS-e, cupom, recibo, boleto, comprovante de PIX; com IA) e **preenche o
   formulário para o usuário conferir**. Nada é salvo automaticamente.

Fora do escopo: chave por empresa, leitura em lote (várias despesas de uma vez), mudar o pipeline de
leitura de edital (ele continua igual, só troca o motor), correção do `centro_custo_id` que a receita
não grava (bug separado, registrado).

## 2. Parte A: motor de IA

### 2.1 Configuração (SaaS Admin → Integrações)

- **Card novo "Google Gemini (IA padrão)"** em `components/saas/IntegracoesTab.jsx`. O card OpenAI passa a
  se chamar "OpenAI (reserva)".
- **Campos do card:**
  - chave (tipo senha, gravada no servidor, nunca volta ao navegador; o status mostra só os 4 finais);
  - **modelo padrão** e **modelo forte**;
  - botão **"Testar"**, que chama o Google com a chave salva e mostra OK ou o erro traduzido.
- **Aviso fixo no card:** use chave **nova** do AI Studio num projeto com **faturamento ativo**. Sem
  faturamento, o Google usa os dados enviados, e documentos de clientes não podem ir assim.
- **Modelos permitidos:**
  - padrão: `gemini-3.5-flash-lite` (default), `gemini-3.1-flash-lite`, `gemini-3.8-flash`;
  - forte: `gemini-3.8-flash` (default), `gemini-3.1-pro-preview`.
- **`saas_config`:** chaves `gemini_api_key`, `gemini_modelo` e `gemini_modelo_forte`. Também vale o
  secret `GEMINI_API_KEY`, se existir.
- **Função `saas-config` (só super admin):**
  - `status` passa a devolver também `gemini:{configurada, final, origem, modelo, modelo_forte}`;
  - `definir` aceita `chave_gemini` (sem espaços, ≥ 20 caracteres, **sem** checar prefixo), `gemini_modelo`
    e `gemini_modelo_forte`, validados contra a lista acima;
  - ação nova `testar_gemini`: `GET https://generativelanguage.googleapis.com/v1beta/models/<modelo>` com
    `x-goog-api-key` e timeout de 10 s. Mensagens:
    - 200 → "Gemini respondeu";
    - 400 `API_KEY_INVALID` → "Chave inválida";
    - 403 → "Chave sem permissão";
    - 402/429 → "Sem crédito ou limite atingido";
    - outros → "Google indisponível (código N)".

### 2.2 Cliente Gemini (`supabase/functions/_shared/gemini.ts` + regras puras em `gemini-regras.ts`)

- **Chamada:** `POST https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent`
  com o header `x-goog-api-key`.
- **Corpo:**
  - `systemInstruction` (opcional);
  - `contents:[{role:"user", parts}]`;
  - `generationConfig.maxOutputTokens`;
  - `thinkingConfig.thinkingLevel` quando pedido;
  - `store:false`;
  - **nunca** `temperature`/`topP`/`topK` (deprecated nos 3.x).
- **Partes:**
  - cada arquivo (`fileRefs`, mesmo `validarRef`/download que já existe) vira `inlineData{mimeType,data}` em
    base64, com `mediaResolution:{level:"MEDIA_RESOLUTION_MEDIUM"}` para PDF;
  - texto e XML viram parte de texto (como hoje);
  - o prompt vai **depois** das mídias;
  - `inputsExtras` no formato atual (`input_text`, `input_image` com data URL) são convertidos (data URL →
    `inlineData`).
- **Saída JSON:**
  - vai em `generationConfig.responseFormat.text = {mimeType:"application/json", schema}`;
  - se o Google responder 400 apontando esse campo, repete **uma vez** no formato legado
    `responseMimeType:"application/json"` + `responseJsonSchema`.
- **Conversão do schema (`paraSchemaGemini`, pura):**
  - remove `$schema`;
  - enum que aceita null vira `anyOf:[{type,enum sem null},{type:"null"}]`;
  - remove `pattern/minLength/maxLength/multipleOf/uniqueItems/default/examples/not/if/then/else`;
  - mantém `type:[x,"null"]`, `required`, `additionalProperties`, `enum`, `items`, `maxItems`, `description`.
- **Esforço (`thinkingLevel`):**
  - `esforco` mapeia para `minimal|low|medium|high`;
  - nos modelos `3.7/3.8-flash`, `minimal` vira `low` (o `minimal` dá erro neles);
  - sem `esforco`, o campo não é enviado.
- **Resposta:**
  - junta `candidates[0].content.parts[].text`, ignorando as partes `thought:true`;
  - `finishReason` `MAX_TOKENS` → `motivo:"cortada"`;
  - `SAFETY/RECITATION/BLOCKLIST/PROHIBITED_CONTENT/SPII` ou `promptFeedback.blockReason` → `"recusa"`;
  - JSON inválido → `"json"`;
  - uso: entrada = `promptTokenCount`, saída = `candidatesTokenCount + thoughtsTokenCount`.
- **Erros HTTP:**
  - 400/403 → `http` (não repete);
  - 402/429 → `http` com texto "sem crédito/limite";
  - 5xx/rede → `rede`;
  - `AbortSignal.timeout` → `timeout`.
- **Tipo de retorno:** o mesmo formato de `RespostaOpenAI`, acrescido de `provedor:"gemini"`.
- **Limite de arquivo:** mantém os 15 MB por arquivo de hoje (memória e CPU da Edge Function).

### 2.3 Porta única (`supabase/functions/_shared/ia.ts`)

- `chamarIA(opts & { nivel?: "padrao" | "forte" })` → resposta com `provedor` e `modelo`.
- **Configuração:** lê as duas configs uma vez por requisição (chaves e modelos do Gemini e do OpenAI).
- **Ordem de tentativa:**
  1. Gemini, se houver chave;
  2. OpenAI, se houver chave e o Gemini falhou (qualquer `ok:false`) ou não está configurado.
- **Modelo por nível:**
  - Gemini: `nivel:"padrao"` → `gemini_modelo`; `nivel:"forte"` → `gemini_modelo_forte`;
  - OpenAI: `openai_modelo` / `gpt-4o`.
- **Sem nenhuma chave:** devolve `IA_NAO_CONFIGURADA`, como hoje.
- **`chamarComEscalonamento`** (index.ts) e o laço de `edital_extrair_parte` (edital.ts) passam a usar
  `chamarIA` com `nivel` em vez de nomes de modelo. Os orçamentos de tempo atuais (100/110/120 s)
  continuam valendo.
- **Pontos migrados** (todos): `llm`, `extrair_documentos`, `validar_exames_pcmso`, `edital_extrair_parte`,
  `edital_consolidar`, `edital_atende` e a ação nova `financeiro_ler_documento`.
- **Mensagem sem chave:** "IA não configurada — defina a chave no SaaS Admin → Integrações" (como hoje).

### 2.4 Uso e custo

- **Migração `0123_ia_uso_provedor_custo.sql`:** `ia_uso` ganha `provedor text` e `custo_usd numeric(12,6)`.
- **Tabela de preços** (`_shared/ia-precos.ts`, US$ por 1M tokens de entrada/saída):

  | Modelo                                    | Entrada | Saída |
  | ----------------------------------------- | ------- | ----- |
  | `gemini-3.5-flash-lite`                   | 0,30    | 2,50  |
  | `gemini-3.1-flash-lite`                   | 0,25    | 1,50  |
  | `gemini-3.8-flash` até 31/12/2026         | 0,75    | 3,75  |
  | `gemini-3.8-flash` a partir de 01/01/2027 | 1,50    | 7,50  |
  | `gemini-3.1-pro-preview` (prompt ≤ 200k)  | 2       | 12    |
  | `gemini-3.1-pro-preview` (prompt > 200k)  | 4       | 18    |
  | `gpt-4o-mini`                             | 0,15    | 0,60  |
  | `gpt-4o`                                  | 2,50    | 10    |

  Modelo desconhecido → custo null.

- **Registro de todas as ações de IA** (não só as de edital): `novoMedidor`/`contabilizar`/`registrarUso`
  passam a guardar provedor e custo. A cota diária continua só para edital.

## 3. Parte B: "Ler documento"

### 3.1 Formato comum (`DocumentoFiscal`)

```
{ origem: "xml" | "ia",
  tipo: "nfe" | "nfce" | "nfse" | "recibo" | "cupom" | "boleto" | "comprovante_pix" | "outro",
  numero, chave (44 dígitos ou null), data_emissao (AAAA-MM-DD), valor_total (número),
  emitente: { nome, documento (só dígitos), ie, endereco },
  destinatario: { nome, documento },
  vencimentos: [{ numero, data, valor }],
  forma_pagamento: "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia" | null,
  descricao, itens: [{ descricao, codigo, ean, ncm, unidade, quantidade, valor_unitario, valor_total }],
  avisos: [texto], duvidosos: [nome do campo] }
```

### 3.2 XML sem IA (`apps/web/src/lib/nfe-xml.js`, puro)

- **`lerXmlFiscal(texto)`** extrai por leitura de tags. Não usa `DOMParser`, porque os testes rodam no Node.
  Tolera prefixo de namespace e decodifica entidades.
- **NF-e (4.0 e 2.0):**
  - `ide` (`nNF`, `dhEmi|dEmi`, `mod` 55/65 → nfe/nfce);
  - `emit` (`CNPJ|CPF`, `xNome`, `IE`, `enderEmit`) e `dest`;
  - `ICMSTot/vNF`;
  - chave (`protNFe/infProt/chNFe` ou `infNFe@Id`);
  - **`cobr/dup`** (`nDup`, `dVenc`, `vDup`);
  - `pag/detPag/tPag` (01 dinheiro, 03/04 cartão, 15 boleto, 17 pix);
  - itens `det/prod`.
- **NFS-e ABRASF:** `InfNfse`, `Numero`, `DataEmissao`, `ValorServicos`, `PrestadorServico` e `TomadorServico`
  (razão social e CNPJ/CPF).
- **Resultado:** XML inválido ou de outro tipo → `null` (quem chama avisa).
- **Unificação:** substitui os 3 parsers de hoje (`DespesaModal`, `DespesasTab`, `ReceitasTab`). As
  importações pela lista continuam criando direto, agora casando fornecedor e cliente **por dígitos do
  CNPJ** (fim do fornecedor duplicado) e gravando `chave_nfe` na despesa.

### 3.3 PDF e foto com IA (ação `financeiro_ler_documento` na `ia-processar`)

- **Entrada:**
  - `{ file_ref, tipo: "despesa" | "receita" }`;
  - a ref é da mesma empresa do token (validação atual);
  - aceita PDF, JPEG, PNG e WEBP; HEIC é recusado com o aviso "tire a foto em JPEG".
- **Prompt:**
  - especialista em documento fiscal brasileiro; não inventar; campos ausentes = null;
  - datas AAAA-MM-DD, valores em número;
  - na **despesa**, o emitente é quem vendeu ou prestou; na **receita**, a pessoa é o
    destinatário/tomador/pagador;
  - boleto: a data de vencimento vai em `vencimentos`;
  - chave de NF-e só se aparecer impressa;
  - lista em `duvidosos` os campos lidos com dúvida.
- **Chamada:** `chamarIA` com o schema estrito do `DocumentoFiscal`, `nivel:"padrao"` e `timeoutMs` 60 000.
  Se vier fraco (sem `valor_total` ou sem nome do emitente), repete com `nivel:"forte"` (escalonamento
  atual).
- **Normalização no servidor** (`financeiro-documento.ts`, puro e testado):
  - documento só dígitos, com 11 ou 14 dígitos (CPF ou CNPJ; senão null);
  - **chave** com 44 dígitos e **dígito verificador (módulo 11) válido**; senão null, com aviso;
  - datas válidas; valores ≥ 0;
  - vencimentos ordenados;
  - se a soma dos vencimentos divergir do total em mais de R$ 0,05, entra um aviso.
- **Retorno:** `{ documento: DocumentoFiscal }`, e o uso fica registrado (`acao:"financeiro_ler_documento"`).

### 3.4 Preenchimento (`apps/web/src/lib/documento-financeiro.js`, puro)

- **`montarPreenchimento(doc, { tipo, pessoas, categorias })`** devolve `{ patch, parcelas, itens, pessoaSugerida, avisos }`.
- **Regras do patch:**
  - `valor` = `valor_total`;
  - `data_competencia` = `data_emissao`;
  - `data_vencimento` = primeiro vencimento, senão a emissão;
  - `forma_pagamento` (na receita, só se for uma das opções dela);
  - `descricao` = "NF-e 123 - FORNECEDOR" / "Recibo - NOME" / etc.;
  - `numero_documento` = número ou chave;
  - `chave_nfe` só na despesa.
- **Pessoa:** fornecedor (despesa) ou cliente (receita) casado **pelos dígitos** do documento. Se não
  achar, cai para o nome normalizado (igual e sem acento). Achou → id e nome no patch. Não achou →
  `pessoaSugerida {nome, documento, endereco}`.
- **Categoria (despesa):** `categoriaDoFornecedor` (já existente) quando o fornecedor foi achado.
- **Parcelas:** com mais de um vencimento, parcelas no formato da tela
  `{numero, valor, data_vencimento, data_pagamento, status:"em_aberto"}`.
- **Regra de sobrescrita:** a leitura **sobrescreve** os campos que o documento trouxe e mantém os demais.

### 3.5 Tela

- **`components/financeiro/LerDocumentoButton.jsx`**
  - `accept=".xml,application/pdf,image/jpeg,image/png,image/webp"`.
  - **XML:** lê no navegador (`lerXmlFiscal`) e sobe como anexo no bucket `nfe-xml`.
  - **PDF ou foto:** `UploadFile({file, bucket:"comprovantes"})` (10 MB), depois
    `iaProcessar {acao:"financeiro_ler_documento"}`, mostrando "Lendo documento…".
  - **Retorno:** chama `onLido({documento, anexo:{nome,url:ref,tipo}})`; o arquivo sobe **uma vez só**.
  - **Erro:** toast com a mensagem; o formulário fica como estava.
- **Nova despesa** (`DespesaModal`, só quando o pai fornece `adicionarAnexoPronto` e é despesa nova):
  - o botão **substitui** o "Importar NFe (XML)";
  - aplica o patch com `setForm(prev => ...)`;
  - parcelas: `handleNumeroParcelasChange(n)` + `setParcelas` + liga o parcelamento na tela;
  - itens → `AssociarMateriaisModal`, como hoje;
  - o anexo entra via `adicionarAnexoPronto`;
  - a checagem de NF-e duplicada continua automática pela `chave_nfe`;
  - fornecedor não cadastrado → faixa "Fornecedor não cadastrado: NOME (CNPJ) [Cadastrar]", que abre
    `NovoFornecedorConfigSheet` com a **prop nova `dadosIniciais`**;
  - aviso "Confira os campos destacados" listando `duvidosos` e `avisos`.
- **`DespesasTab`**
  - passa `adicionarAnexoPronto`;
  - `handleSave` passa a gravar `numero_documento`.
- **Nova receita** (`ReceitasTab`, Sheet):
  - o botão **substitui** o "Importar XML ou NF-e" de dentro do Sheet, que hoje cria a receita direto;
  - aplica o patch;
  - parcelas no formato de receita;
  - anexo via `setAnexos`;
  - cliente não cadastrado → `NovoClienteModal` com a **prop nova `dadosIniciais`**.

## 4. Segurança e privacidade

- **Chave:** só no servidor (`saas_config`, sem acesso de cliente); só o super admin grava e testa.
- **Envio ao Google:** `store:false`; o card exige chave com faturamento.
- **Arquivos:** refs validadas como da empresa do usuário (regra atual); limite de 15 MB no servidor e
  10 MB no bucket.
- **Saída da IA:** tratada como dado e normalizada no servidor. A chave de NF-e só é aceita com dígito
  verificador válido (evita chave inventada, que o índice único de `chave_nfe` depois bloquearia).

## 5. Testes

- **Node (`node --test`):**
  - `gemini-regras.ts`: montagem do corpo, conversão do schema, leitura da resposta (STOP,
    MAX_TOKENS, recusa, partes de pensamento) e mapeamento de esforço;
  - `ia.ts`: ordem Gemini → OpenAI com chamadores falsos;
  - `ia-precos.ts`: custo por modelo e data;
  - `financeiro-documento.ts`: normalização e dígito verificador da chave.
- **Vitest:**
  - `nfe-xml.js` com amostras reais anonimizadas: NF-e 4.0 com `cobr/dup` e `pag`, NF-e sem `protNFe`,
    NF-e 2.0 com `dEmi`, NFC-e, NFS-e ABRASF e XML inválido;
  - `documento-financeiro.js`: pessoa por dígitos e por nome, categoria, parcelas, receita.
- **Produção, com o Javerson:**
  - ele cola a chave e clica em "Testar";
  - uma nota em PDF, uma foto de recibo e um boleto numa nova despesa;
  - uma NFS-e numa nova receita;
  - conferir os campos, as parcelas, o anexo e o registro em `ia_uso` (provedor e custo).

## 6. Critérios de aceite

1. Com a chave do Gemini salva e testada, as ações de IA do SIGO respondem pelo Gemini (`ia_uso.provedor =
gemini`). Sem chave do Gemini, tudo segue pelo ChatGPT como hoje.
2. O XML de NF-e preenche a nova despesa com fornecedor, valor, datas, chave, **parcelas das duplicatas**,
   itens e anexo, sem chamar IA.
3. O PDF de DANFE e a foto de recibo/boleto preenchem a nova despesa. Um cliente com NFS-e em PDF preenche
   a nova receita.
4. Fornecedor ou cliente inexistente pode ser cadastrado em um clique, com os dados lidos.
5. A importação de XML pela lista não cria fornecedor duplicado por formatação de CNPJ.
6. Todos os testes passam; nada é salvo sem o usuário clicar em Salvar.

## 7. Ordem de entrega

1. Parte A (motor + SaaS Admin + migração 0123). Sem a chave do Gemini, o comportamento é igual ao de
   hoje, então é seguro publicar.
2. O Javerson cola a chave e testa.
3. Parte B (XML unificado + leitura por IA + telas).
