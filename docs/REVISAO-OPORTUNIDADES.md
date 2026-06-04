# Revisão do Módulo Oportunidades — Profissionalização para comercialização

> Varredura de **segurança/vulnerabilidades** + **lógica** + **benchmark** (VOBI,
> Effecti/Edital Express, Sienge, RD Station) do módulo Oportunidades do SIGO Obras.
> Data: 2026-06-04. Parte do esforço módulo-a-módulo de profissionalização SaaS.

## Intenção do dono (fluxo desejado)

Pesquisar licitações por palavra-chave (Alerta + PNCP) → identificar potenciais →
criar Oportunidade → analisar o edital (na descrição) → gestor decide quais
participar → **Ganhou = vira Projeto**; **Perdeu = arquivada**.

---

## 1. 🔴 SEGURANÇA (vulnerabilidades)

### CRÍTICO — sem isolamento multi-tenant (bloqueia a venda como SaaS)

Causa-raiz combinada:

- **RLS desligada** em todas as tabelas (`migrations/0026_disable_rls_temporarily.sql`), nunca reativada (verificado até a 0046; só `licitacao_busca/encontrada` têm RLS, mas dependem de JWT que não existe).
- **Login não emite JWT** (`functions/login-custom/index.ts` devolve só JSON; sessão em `sessionStorage('custom_auth')`). O front opera como role **`anon`**.
- **Confirmado em runtime:** com a anon key (pública, no bundle) é possível **LER e ESCREVER** dados de qualquer empresa via `/rest/v1/...`. Filtros `empresa_id` no front são cosméticos.
- **Impacto:** cliente A vê/edita dados do cliente B (pipeline, valores, licitações). Incidente de LGPD.
- **Correção (pré-requisito de comercialização):** `login-custom` emite JWT assinado com `app_metadata.empresa_id`; front passa o JWT ao supabase-js; **reabilitar RLS** (rodar `apply_tenant_rls` em todas as tabelas, revertendo a 0026). Remover grants a `anon` (`0031:299` v_nfe_resumo_mensal; `0034:158` criar_transferencia_atomica).

### CRÍTICO — Edge Functions confiam no `empresa_id` do body

`licitacoes-triagem`, `config-licitacao`, `vincular-pasta-oportunidade` usam service-role e `--no-verify-jwt`, recebendo `empresa_id` no body sem validar vínculo do usuário → cross-tenant. `vincular-pasta-oportunidade` (`listar_pendentes`) vaza oportunidades de TODAS as empresas. CORS `Access-Control-Allow-Origin: *`.

- **Correção:** validar JWT + `usuario_empresa` ativo, ou derivar `empresa_id` do JWT. Restringir CORS às origens do SaaS.

### CRÍTICO/ALTA — Autorização só no front + fallback "Admin"

`Layout.jsx` usa `perfil || "Admin"` (default vira Admin); `perfil` vem do sessionStorage (editável no DevTools). `PermissionGate` libera tudo p/ Admin. Ações na view "Lista" (`Oportunidades.jsx` ~1449-1460) **sem** PermissionGate. Como o backend não checa nada, qualquer um executa qualquer ação via REST.

- **Correção:** autorização no backend (RLS + checagem de perfil em RPC/Edge Functions); default = negar.

### ALTA — Filter injection no `q`

`licitacoes-triagem/index.ts` (~66-70): `q` do usuário interpolado cru em `query.or(...)`. Permite reescrever as condições do `or` do PostgREST.

- **Correção:** sanitizar/escapar `, ( ) \`` no `q`ou usar`.textSearch()`.

### MÉDIA — Links sem validação de protocolo

`link_externo` (LicitacoesInbox) e `arquivo.url` (VisualizarArquivoModal — `fetch`, `<img>`, `window.open` sem `noopener`) renderizados sem validar `http/https` → risco `javascript:`/tabnabbing (valor plantável via as falhas acima).

- **Correção:** allowlist de protocolo; `rel="noopener noreferrer"` nos `window.open`.

### ✅ OK — XSS na descrição já corrigido

`OportunidadeDetalhe.jsx` renderiza descrição como texto (`whitespace-pre-wrap`); `dangerouslySetInnerHTML` foi removido. Sem XSS aí. (Os 2 `dangerouslySetInnerHTML` restantes injetam CSS estático.)

### BAIXA

Mensagens de erro do Postgres devolvidas cruas ao cliente (vazamento menor de detalhe interno).

---

## 2. 🟡 LÓGICA — o fluxo bate com a intenção?

| Passo do dono                          | Estado          | Evidência                                                                                                                                            |
| -------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Buscar licitações por palavra-chave | ✅ Implementado | aba Licitações (LicitacoesInbox) + buscar-licitacoes/-pncp                                                                                           |
| 2. Virar Oportunidade                  | ✅ Implementado | "Virar oportunidade" → `licitacoes-triagem` virar_oportunidade                                                                                       |
| 3. Análise do edital na descrição      | ⚠️ Fraco        | editor rich-text (`FormularioOportunidade`) mas exibição em texto puro (`OportunidadeDetalhe`) → perde formatação; descrição já vem com o objeto cru |
| 4. Gestor decide quais participar      | ⚠️ Parcial      | só arrastar no Kanban; sem decisão go/no-go formal nem registro de quem decidiu                                                                      |
| 5a. Ganhou → Projeto                   | ✅ Robusto      | `handleMigrarParaProjeto` + RPC `sincronizar_projeto_com_oportunidade` (0029/0030) + trigger (0040)                                                  |
| 5b. Perdeu → arquiva com motivo        | ❌ Sem motivo   | `arquivado` é flag binário; **coluna `motivo_perda` não existe** (schema 0004); sem ação "Marcar Perdido"                                            |

### 🐞 Bug crítico de lógica

Na conversão licitação→oportunidade, grava-se só `status_nome` (texto "Triagem Licitação") e **não `status_id`**. O Kanban agrupa por `status_id` → **a oportunidade some do funil** (aparece só na Lista). Quebra o passo 4.

### Outras lacunas

- Pipeline padrão é genérico (Novo Lead → Em Negociação → Ganho → Perdido), **não o ritual de licitação**; e `status_oportunidade.tipo` só aceita aberto/ganho/perdido (sem fases intermediárias semânticas).
- Faltam campos próprios de licitação: nº edital/processo/PNCP, órgão, portal/UF; na conversão, `orgao/municipio/link_externo/fonte` **não são copiados** para a oportunidade (link vai cru em observações).
- Modalidade desatualizada (lista Lei 8.666 revogada; falta Pregão Eletrônico/Diálogo Competitivo/Credenciamento da 14.133).
- Sem checklist de habilitação; sem parecer go/no-go; sem campos de resultado (valor adjudicado, colocação, motivo de perda).
- Timeline parcial: status via drag registra; edição de campos não; sem tarefas/atividades de pré-venda.

---

## 3. 🟢 MELHORIAS (benchmark VOBI / Effecti / RD)

### Essencial (vira "CRM de licitação", justifica preço)

- **E1.** Corrigir o bug do `status_id` na conversão (oportunidade nasce na 1ª coluna do funil).
- **E2.** Pipeline pré-configurado de licitação: Triagem → Em análise → Go/No-Go → Proposta em elaboração → Proposta enviada → Em disputa → Habilitação → Ganho/Perdido.
- **E3.** Campos estruturados de licitação + copiar órgão/município/portal/link na conversão; modalidades da 14.133.
- **E4.** Ação **"Marcar Perdido" com motivo** (+ coluna `motivo_perda`). Sem isso, sem win-rate.
- **E5.** Ação explícita **"Ganhou → criar Projeto"** (já existe a mecânica; falta rótulo + captura de valor adjudicado).
- **E6.** **Checklist de documentos de habilitação** (template por empresa, com vencimento) — diferencial nº 1 do Effecti.

### Importante

- **I1.** Parecer go/no-go pontuado (margem, distância, exigências, garantia, capacidade) + quem decidiu.
- **I2.** Dashboard de **win-rate** (ganhas×perdidas, valor ganho×participado, por modalidade/órgão/motivo).
- **I3.** Funil ponderado por probabilidade×valor (campos já existem; Kanban só soma bruto).
- **I4.** Alertas de prazo do certame (abertura, impugnação, limite de proposta).
- **I5.** Tarefas/atividades de pré-venda com responsável e prazo.
- **I6.** Render fiel da descrição rich-text (sanitizar com DOMPurify em vez de descartar) — viabiliza a análise estruturada do edital na descrição.

### Nice-to-have

- IA pra resumir edital/risco de habilitação (tarefa #126); anexar PDF do edital direto da oportunidade (do PNCP); histórico de relacionamento por órgão; automação de etapa; comparativo proposta×valor de referência.

---

## 4. Plano sugerido (ordem)

1. **🔒 Segurança primeiro (gate de comercialização):** JWT no login + reabilitar RLS + checagem de empresa nas Edge Functions. (Afeta o ERP inteiro, não só Oportunidades — é a base.)
2. **🐞 Bug do `status_id`** na conversão (rápido, destrava o Kanban).
3. **Lógica de fechamento:** "Marcar Perdido (com motivo)" + rótulo "Ganhou → Projeto" + coluna `motivo_perda`.
4. **CRM de licitação:** pipeline padrão + campos estruturados + checklist de habilitação.
5. **Inteligência:** win-rate + go/no-go + alertas de prazo.

> Observação: o item 1 é pré-requisito para vender. Os demais são incrementos de valor que podem ser feitos módulo a módulo.
