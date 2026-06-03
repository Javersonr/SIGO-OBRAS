---
name: agente-licitacoes
description: >
  Agente de Licitações do SIGO Obras. Use quando o usuário pedir para
  "processar licitações", "criar a pasta da licitação", "rodar o agente de
  licitações" ou ao decidir participar de uma licitação. O agente cria a pasta
  NUMERADA da licitação na estrutura do OneDrive da Sinergia (por empresa, ano e
  sequência) para a pessoa baixar o edital ali. Roda no Cowork (acesso ao
  sistema de arquivos local; o OneDrive sincroniza pra nuvem sozinho).
---

# Agente de Licitações — SIGO Obras (pastas no OneDrive)

## O que este agente faz (Fase 1)

Para cada licitação que o usuário decidir tocar (aprovada na aba Licitações, ou
sob demanda), cria a **próxima pasta numerada** na estrutura do OneDrive, na
empresa correta. O download dos PDFs do edital é **manual** (a pessoa baixa
dentro da pasta criada). NÃO cria oportunidade (isso é do `buscar-licitacoes` /
da validação na aba Licitações).

## Estrutura e constantes

- **Base:** `C:\Users\javer\OneDrive\SINERGIA\LICITAÇÕES`
- **Empresas (subpasta):**
  - `SINERGIA SERVIÇOS`
  - `SINERGIA MATERIAIS ELETRICOS`
- **Caminho da pasta do ano:** `<Base>\<EMPRESA>\Licitações\<ANO>`
- **Padrão do nome:** `NNN- PM <Município> - <UF>`
  (NNN = sequencial de 3 dígitos com zero à esquerda; ex: `068- PM São Paulo - SP`).
  Variações de PM existem (ex: `038- Cemig - Belo Horizonte - MG`); quando não
  for prefeitura, use o nome do órgão no lugar de "PM <Município>".

## Regra de roteamento (qual empresa)

- **Execução de obra / serviço / engenharia / manutenção / instalação** →
  `SINERGIA SERVIÇOS`.
- **Fornecimento de material elétrico** (refletores, luminárias, cabos,
  transformadores, postes, etc.) → `SINERGIA MATERIAIS ELETRICOS`.
- Na dúvida, **pergunte** ao usuário antes de criar.

## Ano

Use o **ano de abertura** da licitação se houver; senão, o **ano corrente**.
(As pastas são organizadas pelo ano em que a empresa trabalha a licitação.)

## Passo a passo (para cada licitação)

1. **Decida a empresa** pela regra de roteamento (a partir do objeto da licitação).
2. **Monte o caminho do ano:** `<Base>\<EMPRESA>\Licitações\<ANO>`.
3. **Descubra o próximo número:** liste a pasta do ano, pegue o maior `NNN`
   existente e some 1 (mantendo 3 dígitos). Ex.: se a última é `067-…`, a nova é
   `068`.
4. **Idempotência:** antes de criar, confira se já não existe pasta para ESTA
   licitação (mesmo município/UF criada recentemente para o mesmo edital). Se já
   existe, **não duplique** — só reporte a existente.
5. **Crie a pasta:** `mkdir -p` em
   `<Base>\<EMPRESA>\Licitações\<ANO>\<NNN>- PM <Município> - <UF>`.
6. **Reporte:** número atribuído, empresa e o caminho completo. O usuário baixa
   os PDFs do edital nessa pasta (o OneDrive sincroniza sozinho).

## Regras importantes

- **NÃO baixe os editais** dos portais — o download é manual (decisão do projeto).
- **NÃO crie oportunidade** aqui — isso é da aba Licitações (fluxo
  operador→validador) / `buscar-licitacoes`.
- **Sem link automático no SIGO:** não há conector do OneDrive, então o agente
  só cria a pasta local. O cruzamento com o SIGO é pelo **número** da pasta
  (ex.: "068"). Se quiser, o usuário cola o link do OneDrive manualmente na aba
  Arquivos da oportunidade.
- Se o caminho base do OneDrive não existir/estiver sem sincronizar, **pare e
  avise** — não invente caminho.

## Fase 2 (futuro, sob demanda)

Quando os PDFs do edital já estiverem na pasta numerada, um segundo fluxo lê os
arquivos da pasta (Read/PDF local) e gera, em HTML dentro da própria pasta:
(1) dashboard financeiro, (2) risco de habilitação, (3) análise do
contrato/minuta.

## Histórico

- Antes este agente criava pastas no **Google Drive** (pasta-mãe "Licitações",
  id `1EAKSq1jIi5FeBFTkihGWUNpxeyRv5VvE`) e gravava o link via a Edge Function
  `vincular-pasta-oportunidade`. Migramos para o **OneDrive** (estrutura
  numerada por empresa/ano que a Sinergia já usa). Aquela função e a pasta do
  Google Drive ficam como legado.
