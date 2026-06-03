---
name: lancamentos-financeiros-sigo
description: >
  Lê comprovantes (fotos, PDFs, prints de WhatsApp ou texto) de despesas e
  receitas e gera as PLANILHAS DE IMPORTAÇÃO EM LOTE no formato exato do SIGO
  Obras, para o usuário importar em Financeiro → Despesas/Receitas → Importar.
  Use quando pedirem "lançar despesas/receitas do WhatsApp", "processar esses
  comprovantes pro SIGO", "gerar a planilha de importação financeira" ou
  similar. NÃO cria pré-lançamento e NÃO lança direto no banco — só gera a
  planilha que a pessoa revisa e importa.
---

# Lançamentos financeiros em lote (WhatsApp/comprovantes → planilha SIGO)

## O que esta skill faz

1. Recebe um **lote de comprovantes** (cupom fiscal, nota, PIX, boleto pago,
   recibo, ou texto/print de WhatsApp). Podem vir anexados no chat ou numa pasta
   (ex.: `C:\Users\javer\OneDrive\SIGO Obras - Comprovantes\<empresa>\`).
2. Para cada um: **lê e extrai** os dados financeiros (OCR de imagem por visão;
   PDF via leitura de páginas; texto direto).
3. **Classifica** cada lançamento como **Despesa** (saída/pagamento) ou
   **Receita** (entrada/recebimento).
4. Gera **2 planilhas** no formato EXATO do importador do SIGO (uma de Despesas,
   uma de Receitas) numa pasta do OneDrive.
5. Mostra um **resumo** (quantos, total R$) e as instruções de import.

⚠️ **Nunca lança direto no banco.** O fluxo é: gerar planilha → usuário revisa →
usuário importa no SIGO. Isso evita erro de OCR ir parar no caixa.

## Onde salvar a saída

`C:\Users\javer\OneDrive\SIGO Obras - Importacao\<EMPRESA>\`
Nome dos arquivos: `Despesas_<AAAA-MM-DD>.csv` e `Receitas_<AAAA-MM-DD>.xlsx`.
(Empresas comuns: `SINERGIA SERVIÇOS`, `SINERGIA MATERIAIS ELETRICOS` — se não
souber a empresa, **pergunte** antes de gerar.)

## Formato da planilha de DESPESAS (arquivo .csv, separador `;`, UTF-8 com BOM)

O importador lê **pelo NOME da coluna** (a ordem é flexível, mas os nomes têm de
ser idênticos). Header obrigatório, exatamente:

```
Data Competência;Data Vencimento;Data Pagamento;Descrição;Fornecedor;Categoria;Conta;Projeto;Centro de Custo;Valor;Status;Forma Pagamento;Observações
```

- **Datas**: `DD/MM/AAAA` (o importador também aceita ISO `AAAA-MM-DD`).
- **Valor**: número com vírgula decimal, sem "R$" (ex.: `250,00`).
- **Status**: `Pago` | `Pendente` | `Atrasado`. Comprovante de pagamento ⇒ `Pago`
  e preenche `Data Pagamento`.
- **Forma Pagamento**: ex.: `PIX`, `Dinheiro`, `Cartão`, `Boleto`.
- **Dedup**: o importador deduplica por `Descrição | Valor | Data Vencimento`.

## Formato da planilha de RECEITAS (arquivo .xlsx, 1 aba "Modelo")

Colunas (também lidas por nome):

```
Descrição | Cliente | Oportunidade | Projeto | Categoria | Conta | Valor | Data Vencimento | Status | Data Pagamento | Observações
```

- **Status**: `Recebido` | `Pendente`. Recebido ⇒ preenche `Data Pagamento`.
- Sem "Fornecedor"/"Centro de Custo"/"Forma Pagamento"; tem **Cliente** e **Oportunidade**.
- (O .xlsx pode ser gerado com a skill `anthropic-skills:xlsx`. Se não for
  possível gerar .xlsx, gere `.csv` com as mesmas colunas — o importador de
  receitas também lê CSV.)

## Regras de extração (importante)

- **Não invente.** Campo incerto ⇒ deixe em branco (o usuário completa na revisão).
- **Categoria / Conta / Fornecedor / Cliente**: use nomes **claros e
  consistentes**. ⚠️ O importador **cria um novo registro** se o nome não bater
  com um existente — então evite variações ("Cimento" vs "cimentos") pra não
  duplicar. Quando souber os nomes que a empresa já usa, prefira-os.
- **Descrição**: curta e útil (ex.: "Cimento CP-II 50kg — Loja X"). Inclua o
  fornecedor/loja se ajudar.
- **Valor total** do comprovante (não item a item), salvo se pedirem detalhado.
- Uma **linha por comprovante** (ou por lançamento, se o comprovante tiver vários).
- Mantenha um rastro: na coluna Observações, pode pôr a origem (ex.: "WhatsApp 03/06").

## Passo a passo

1. **Descubra a empresa** (pergunte se não estiver claro).
2. **Junte os comprovantes** (anexos do chat ou a pasta indicada).
3. Para cada comprovante: leia → extraia → classifique despesa/receita.
4. Monte as 2 planilhas no formato acima.
5. Salve em `OneDrive\SIGO Obras - Importacao\<EMPRESA>\`.
6. **Reporte um resumo**: nº de despesas + total, nº de receitas + total, e
   quaisquer comprovantes que não deu pra ler (liste pra revisão manual).
7. Diga como importar:
   - **Despesas**: SIGO → Financeiro → **Despesas** → botão **Importar** →
     escolher o `Despesas_<data>.csv`.
   - **Receitas**: SIGO → Financeiro → **Receitas** → **Importar** →
     escolher o `Receitas_<data>.xlsx`.
   - Lembrar de **conferir** as linhas (categoria/conta/fornecedor) antes de confirmar.

## Relação com o resto

- A extração é a mesma da skill `anthropic-skills:fundo-fixo-sinergia` — a
  diferença é só o **formato de saída** (aqui é o do importador do SIGO).
- Futuro (opcional): automatizar no **bot do WhatsApp** (`C:\Users\javer\SIGO-WHATSAPP-BOT\`,
  Railway, Meta Cloud API 1:1) pra cada comprovante já cair na planilha sozinho.
  A API oficial da Meta **não lê grupos** — só 1:1; grupo exigiria lib não-oficial
  (risco de ban).
