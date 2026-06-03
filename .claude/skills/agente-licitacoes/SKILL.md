---
name: agente-licitacoes
description: >
  Agente de Licitações do SIGO Obras. Use quando o usuário pedir para
  "processar licitações", "criar as pastas das licitações no Drive",
  "rodar o agente de licitações" ou em execução agendada diária. O agente
  pega as oportunidades de licitação recém-criadas no SIGO que ainda não têm
  pasta, cria a pasta no Google Drive e grava o link na aba Arquivos da
  oportunidade. Requer o conector do Google Drive conectado.
---

# Agente de Licitações — SIGO Obras

## O que este agente faz (Fase 1)

Diariamente (ou sob demanda), para cada oportunidade de licitação nova **sem
pasta**:

1. Cria uma subpasta no Google Drive (dentro da pasta-mãe "Licitações").
2. Grava o link dessa pasta na **aba Arquivos** da oportunidade no SIGO.

O download dos PDFs do edital é **manual** (a pessoa baixa dentro da pasta).
A análise (Fase 2) é um passo separado, sob demanda.

## Constantes

- Pasta-mãe no Drive ("Licitações"): id `1EAKSq1jIi5FeBFTkihGWUNpxeyRv5VvE`
  (se não existir/uso outra conta, busque por título `Licitações` em `parentId='root'`).
- Base das Edge Functions: `https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/`
- Header em toda chamada às functions (anon key pública do SIGO):
  `apikey: <VITE_SUPABASE_ANON_KEY>` e `Authorization: Bearer <mesma anon key>`
  (a anon key está em `apps/web/.env.production`).

## Passo a passo

### 1. (Opcional) Disparar a descoberta primeiro

Se quiser garantir que as licitações de hoje já entraram, chame:

```
POST {base}/buscar-licitacoes   body: {}
```

Isso acha as licitações novas e (se o toggle "criar oportunidade automática"
estiver ligado na config) cria as oportunidades.

### 2. Listar oportunidades sem pasta

```
POST {base}/vincular-pasta-oportunidade
body: { "action": "listar_pendentes", "limite": 50 }
```

Retorna `pendentes[]` com: `oportunidade_id, empresa_id, nome, valor_estimado,
licitacao_data, modalidade, uf, municipio, orgao, id_licitacao, link_externo`.

### 3. Para cada pendente, criar a subpasta no Drive

Use o conector do Google Drive (`create_file` com
`contentMimeType: application/vnd.google-apps.folder`,
`parentId: 1EAKSq1jIi5FeBFTkihGWUNpxeyRv5VvE`).

Nome da subpasta (padrão):

```
[<uf>] <municipio> - <modalidade> - <licitacao_data>
```

Ex: `[MG] Campo Florido - Pregão Eletrônico - 2026-06-10`
(se faltar algum campo, use o `nome` da oportunidade).

Guarde o `viewUrl` retornado.

### 4. Gravar o link na aba Arquivos da oportunidade

```
POST {base}/vincular-pasta-oportunidade
body: {
  "action": "vincular",
  "oportunidade_id": "<id>",
  "pasta_url": "<viewUrl da subpasta>",
  "pasta_nome": "Pasta da Licitação (Drive)"
}
```

É idempotente (não duplica o mesmo link).

### 5. Resumo

Reporte: quantas pastas criadas, quantas já tinham, e os links.

## Regras importantes

- **Idempotência:** só processe os que vierem em `listar_pendentes` (quem já
  tem pasta não volta). Nunca crie pasta duplicada para a mesma oportunidade.
- **Não baixe os editais** dos sites das prefeituras (decisão do projeto:
  download é manual). Só crie a pasta e o link.
- **Não crie oportunidades** aqui — isso é do `buscar-licitacoes`. Este agente
  só organiza as que já existem.
- Se o conector do Drive não estiver disponível (ex: execução headless sem
  login Google), **pare e avise** — não invente links.

## Fase 2 (futuro, sob demanda)

Quando os PDFs do edital já estiverem na subpasta, um segundo fluxo lê os
arquivos da pasta (read_file_content/download_file_content do Drive) e gera,
em HTML dentro da própria pasta: (1) dashboard financeiro, (2) risco de
habilitação, (3) análise do contrato — anexando os links na aba Arquivos.
