# Habilitação e documentos da licitação gerados e anexados pelo SIGO (sem upload do Claude)

- **Data:** 09/10/2026.
- **Status:** desenho aprovado pelo Javerson no chat em 09/10/2026.
- **Complementa:** `2026-09-25-conector-claude-editais-design.md`, `2026-10-08-conector-orcamento-cronograma-design.md` e o
  Plano 2 do conector (publicado em 09/10, master `2421c2e`).

## 1. Problema e objetivo

O Javerson manda o edital ao Claude, e o Claude prepara tudo da licitação: planilha, proposta, cronograma, declarações,
certidões e acervo. Tudo isso tem de ficar nos **Arquivos da oportunidade** sem ninguém fazer upload, login ou dar
permissão.

**Por que não dá com upload:** em 09/10 o Claude gerou 18 links de envio e não conseguiu usar nenhum. Os logs do Supabase
mostram as 18 URLs assinadas criadas (POST 200) e **nenhum PUT** chegando ao Storage. O 403 vem da rede do ambiente
do Claude, que só libera alguns domínios. A liberação de domínio nas configurações do Claude tem relatos de falha. Por
isso o caminho escolhido (abordagem A) é este:

- O Claude manda só **dados pequenos** pelo conector, que já funciona.
- O **servidor do SIGO gera, copia ou baixa** os arquivos e grava nos Arquivos da oportunidade.

## 2. Biblioteca de habilitação (Acervo Técnico → aba nova "Documentos e certidões")

- **Tabela `acervo_documento`:**
  - Colunas: `empresa_id`, `tipo`, `nome`, `arquivo_ref` (`"bucket/caminho"`), `numero`, `orgao_emissor`, `emissao`,
    `validade`, `observacao`, `substitui_id`, `ativo`, além de `id`, `created_at`, `updated_at` e `deleted_at`.
  - Segurança: RLS tenant, trigger `referencias_da_empresa` em `substitui_id` e permissão da aba Acervo Técnico.
- **Tipos** (lista fechada, com `outro`):
  - certidões: `cnd_federal` (Receita/PGFN), `cnd_estadual`, `cnd_municipal`, `crf_fgts`, `cndt_trabalhista`,
    `certidao_falencia`, `certidao_crea_pj`;
  - documentos: `contrato_social`, `cartao_cnpj`, `inscricao_estadual`, `inscricao_municipal`, `balanco_dre`,
    `alvara`, `procuracao`, `documento_representante`.
- **Versões:** enviar a versão nova de um tipo marca a anterior como substituída (`ativo = false`, `substitui_id`). O
  histórico fica visível.
- **Rotina mensal:**
  - a aba mostra o "pacote do mês", com o que vence nos próximos 30 dias e o que já venceu;
  - lembrete no sino e por WhatsApp para os usuários escolhidos em Configurações (decisão de 25/09), N dias antes da
    validade (padrão 10), pelo cron diário que já existe para alertas.
- **Arquivos:** ficam num bucket próprio (`habilitacao`, PDF e imagem, 50 MB), na pasta da empresa, com a mesma regra
  de ref.
- **"Atende?":** passa a ler tipo, validade e situação (válida ou vencida) das certidões em `acervo_documento`. Se não
  houver nada lá, cai no `acervo_perfil.certidoes`, que continua existindo.

## 3. Documentos gerados pelo servidor

- **Proposta e cronograma (PDF e Excel):**
  - a lógica de `proposta-export.js` e `cronograma-export.js` vai para `supabase/functions/_shared/documentos/`, com
    `jspdf`, `jspdf-autotable` e `xlsx` nas mesmas versões do front;
  - teste de paridade: mesmos dados de entrada, mesmas linhas e totais;
  - mesmo cabeçalho da empresa (logo, razão social, CNPJ e endereço) e o mesmo representante legal.
- **Declarações:**
  - **Modelos padrão editáveis** (tabela `modelo_declaracao`, por empresa, com seis modelos semeados):
    - não emprega menor (CF art. 7º, XXXIII);
    - inexistência de fato impeditivo;
    - enquadramento como ME/EPP;
    - cumprimento dos requisitos de habilitação;
    - reserva de cargos para PcD e reabilitados;
    - elaboração independente da proposta.
  - **Variáveis:** `{empresa}`, `{cnpj}`, `{endereco}`, `{orgao}`, `{edital}`, `{objeto}`, `{local}`, `{data}`,
    `{representante}`, `{cargo}` e `{cpf}`.
  - **Texto do edital:** quando o edital traz modelo próprio, o Claude manda título e texto, e o SIGO gera o documento
    no mesmo papel timbrado.
  - **Saída:** PDF e Word (.docx).
- **Assinatura:**
  - todo documento gerado sai com o bloco de assinatura (nome, cargo e CPF da representante) e com
    `assinatura: "pendente"`;
  - na oportunidade, **"Enviar assinado"** grava a versão assinada (gov.br ou certificado) no lugar da pendente;
  - o checklist mostra "falta assinar".

## 4. Ferramentas novas do conector

Todas passam pela camada da empresa, com permissão por ferramenta, limite e auditoria, e **nenhuma recebe bytes de
arquivo**.

| Ferramenta                  | Entrada                                                                 | Faz                                                                                                                                              | Pasta                           |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `anexar_habilitacao`        | `oportunidade_id`, `tipos?` (padrão: todos os ativos)                   | copia no Storage, pelo servidor, os documentos válidos da biblioteca; devolve os vencidos e os que faltam, sem anexar o vencido                  | Envelope 02 – Habilitação       |
| `anexar_acervo`             | `oportunidade_id`, `atestado_ids?` (padrão: `cats_anexar` do "Atende?") | copia os PDFs de CAT e atestado (`acervo_atestado.arquivo_ref`)                                                                                  | Envelope 02 – Habilitação       |
| `gerar_documentos_proposta` | `oportunidade_id`, `local?`, `data?`                                    | gera a proposta e o cronograma em PDF e Excel a partir do orçamento e do cronograma gravados                                                     | Envelope 01 – Proposta          |
| `gerar_declaracoes`         | `oportunidade_id`, `itens: [{modelo} \| {titulo, texto}]`, `pasta?`     | gera em PDF e .docx com o bloco de assinatura                                                                                                    | Envelope 02 (ou Credenciamento) |
| `anexar_edital_por_url`     | `oportunidade_id`, `url`, `nome`, `categoria`                           | o servidor baixa o arquivo pelo link público                                                                                                     | Edital                          |
| `checklist_habilitacao`     | `oportunidade_id`                                                       | cruza as exigências do edital (`edital_analise`) com os arquivos da oportunidade e devolve o que falta, o que está vencido e o que falta assinar | —                               |

- **Prompt MCP "Montar a licitação completa":** analisar o edital; criar ou atualizar a oportunidade; registrar o
  "Atende?"; montar orçamento, desconto e cronograma; gerar os documentos da proposta; anexar habilitação e acervo;
  gerar as declarações; baixar o edital pelo link; devolver o checklist ao usuário.
- **Repetição:** se o mesmo documento já está na pasta (mesma origem e nome), grava uma versão nova no lugar e não
  duplica.

## 5. Segurança

- **Download por link (`anexar_edital_por_url`):**
  - só `https`, porta 443, sem credencial na URL;
  - DNS que resolva para IP privado, loopback ou link-local é recusado, e o redirecionamento é conferido de novo a cada
    salto (no máximo 3);
  - até 50 MB, `content-type` e extensão em PDF, ZIP, DOC(X) ou XLS(X), tempo-limite de 30 s.
- **Cópias:** origem e destino sempre na pasta da empresa da chave; nenhuma ref vem da entrada do Claude, só ids que o
  servidor confere.
- **Conteúdo:** texto de declaração vindo do Claude é dado e só preenche o modelo. Ele não executa nada e tem limite
  de tamanho (20 mil caracteres).

## 6. Testes e aceite

- **Unitários (`node --test`):** variáveis dos modelos, validador de URL (casos de SSRF), checklist, regra de versão,
  escolha de pasta e vencidos.
- **Paridade (Vitest):** os dados da proposta e do cronograma gerados no servidor iguais aos da tela, com o caso
  Itatinga.
- **Smoke SQL:** cada migração nova, em `begin ... rollback`.
- **Aceite (Javerson, com o Claude real):** CE 009/2026 do começo ao fim, só mandando o edital. Os Arquivos ficam com o
  edital, a proposta e o cronograma (PDF e Excel), as declarações, as certidões válidas e as CATs, e o checklist volta
  no chat.

## 7. Fora do escopo

- Emitir certidões automaticamente nos sites dos órgãos (muitos têm captcha).
- Assinar pelo servidor com certificado ICP.
- Baixar o ZIP do envelope: a aba Arquivos já baixa por arquivo; fica para depois, se pedirem.
