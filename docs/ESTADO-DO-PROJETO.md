# SIGO Obras — Estado do Projeto (arquivo de continuidade)

> **Para que serve este documento:** registrar tudo que já foi feito e o estado
> atual do projeto, para que **qualquer conversa futura** (ou um novo agente
> Cowork) consiga continuar de onde paramos sem redescobrir nada. Leia este
> arquivo primeiro ao retomar.
>
> **Última atualização:** 2026-06-03.

---

## 0. Como retomar (leia primeiro)

1. O código vive em `C:\Users\javer\sigoobras-base` (monorepo). Branch: **`master`**.
2. Frontend: `apps/web` (Vite + React). Backend: `supabase/` (migrations + Edge Functions).
3. Deploy do site é **automático**: `git push origin master` tocando `apps/web/**`
   → GitHub Actions (`.github/workflows/deploy-hostgator.yml`) builda e sobe via
   lftp pro Hostgator. Site: **https://sigoobras.com.br**.
4. Deploy de banco/função é **manual**: `supabase db push --linked` (migrations) e
   `supabase functions deploy <nome> --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt`.
5. Pendências em aberto estão na seção **9**. O bug mais quente é o **Financeiro → Despesas**.

---

## 1. O que é o SIGO Obras

ERP multi-empresa para **19 empresas** de construção/serviços (grupo que inclui
**Sinergia Serviços** e **Sinergia Materiais Elétricos**). Gerencia: Oportunidades
(CRM), Projetos/Orçamento, Estoque, Compras, Ferramental, Segurança do Trabalho
(SST), Financeiro, Contabilidade/NFe, e agora **Licitações**.

- **Origem:** estava no Base44 (no-code). Foi **migrado para stack própria**.
- **Stack atual:** Vite + React (frontend) · Supabase (Postgres + Auth + Edge
  Functions Deno + Storage) · Hostgator (hospeda o site estático) · GitHub Actions (deploy).
- **Domínio:** sigoobras.com.br (Hostgator). Hostgator também serve só e-mail.
- **Projeto Supabase:** ref **`fpyvdwpvxrubrkdwrqbs`**.

---

## 2. Arquitetura e convenções (IMPORTANTE)

### Multi-tenant

- Quase toda tabela tem `empresa_id`. O usuário só vê a empresa ativa.
- A empresa ativa na tela **não regenera o JWT** ao trocar — por isso operações
  sensíveis a RLS por empresa são feitas via **Edge Function com service role**
  (que bypassa RLS), recebendo `empresa_id` no body. Ex.: `config-licitacao`,
  `licitacoes-triagem`, `vincular-pasta-oportunidade`.

### RLS

- `apply_tenant_rls(tabela)` cria policies `to authenticated` usando
  `empresa_id = current_empresa_id()` (claim do JWT vindo do `login-custom`).
- **Service role bypassa RLS** — é o que as Edge Functions usam internamente
  (`createAdminClient()` em `supabase/functions/_shared/supabase-admin.ts`).

### Auth

- Login **custom** (não o Auth nativo): Edge Function `login-custom`. A sessão
  fica em **sessionStorage** (`custom_auth`) — por isso uma aba nova não está
  logada (não compartilha sessionStorage). `alterar-senha` e
  `redefinir-senha-admin` completam o fluxo.
- Perfis: `Admin Holding`, `Admin`, `Gestor`, `Compras`, `Estoque`, `Financeiro`, `Cliente`.

### Edge Functions (deploy com `--no-verify-jwt`, usam service role)

`login-custom`, `alterar-senha`, `redefinir-senha-admin`, `buscar-licitacoes`,
`buscar-licitacoes-pncp`, `config-licitacao`, `licitacoes-triagem`,
`vincular-pasta-oportunidade`.

- Helpers compartilhados em `supabase/functions/_shared/`: `supabase-admin.ts`
  (service role), `cors.ts` (`preflightResponse/ok/fail`), `keywords.ts`
  (parser de palavras-chave de licitação).

### Automação (pg_cron + pg_net)

- Jobs SQL agendados rodam em **UTC** (Brasil = UTC−3). Ver `select * from cron.job;`.
- Helpers em `0036`: `criar_notificacao_dedup`, `notificar_gestores(empresa, perfis, ...)`,
  `destinatarios_alerta`. Notificações caem no **sininho** (tabela `notificacao`),
  deduplicadas por dia via `dedup_key`.

### Deploy & convenções de commit

- **Não** dar `git push --force` em master sem pedido explícito. Sempre **novo
  commit** (não amend). Mensagens multiline via heredoc.
- Todo commit termina com `Co-Authored-By: Claude Opus ... <noreply@anthropic.com>`.
- O build de produção tem **`drop_console`** (remove `console.*`) → não dá pra
  depender de console em prod.
- O `.htaccess` (`apps/web/public/.htaccess`) faz SPA fallback + cache: `index.html`
  é `no-cache`, `/assets/*` (com hash) cacheia 1 ano. O `main.jsx` tem um handler
  de `vite:preloadError` que **recarrega sozinho** se um chunk sumir pós-deploy
  (evita tela branca), e um **ErrorBoundary no topo**.

### Segredos (NUNCA commitar valores)

- Anon key (pública) está em `apps/web/.env.production` e no bundle.
- Service role key e tokens (ALERTA_LICITACAO_TOKEN, etc.) ficam em
  `supabase secrets` (set via `supabase secrets set ... --project-ref fpyvdwpvxrubrkdwrqbs`).
- Secrets do deploy (FTP Hostgator, VITE\_\*) estão em GitHub Actions secrets.
- ⚠️ **Senha do Certificado Digital A1** está salva como **TEXTO** no banco —
  TODO: criptografar antes de ligar o worker de NFe/SEFAZ.

---

## 3. O que está no ar agora (estado)

- Site no ar em sigoobras.com.br, deploy automático funcionando.
- Banco com **migrations 0001 → 0046** aplicadas.
- 8 Edge Functions deployadas.
- Dados das 19 empresas importados (≈10.938 registros do dump original).
- Automações pg_cron ativas (financeiro, estoque, SST, compras/CRM/projetos, licitações).
- **Módulo de Licitações** completo e operando (ver seção 4).

---

## 4. Módulo de Licitações (o grande build desta jornada)

Objetivo: achar licitações públicas automaticamente, triá-las e transformá-las
em Oportunidades no CRM, com a pasta de documentos organizada.

### Fontes de busca (2)

- **Alerta Licitação** (API `alertalicitacao.com.br`) — filtra por UF +
  palavras-chave no servidor. Função `buscar-licitacoes`. Cron diário **08:30 BRT**
  (migration `0042`). Modo `{full:true}` = todas em aberto.
- **PNCP** (Portal Nacional, oficial — `pncp.gov.br/api/consulta`) — função
  `buscar-licitacoes-pncp`. Cron diário **08:45 BRT** (migration `0045`). Não
  filtra por texto: baixa por UF×modalidade e o filtro de palavra-chave é
  aplicado localmente (mesmo critério do Alerta, via `_shared/keywords.ts`).
  Modo `{aberto:true}` usa o endpoint `/contratacoes/proposta` (período em aberto,
  horizonte +90 dias). Usa User-Agent de navegador (WAF .gov.br bloqueia sem).

### Tela: aba "Licitações" dentro de Oportunidades

- Componente `apps/web/src/components/oportunidades/LicitacoesInbox.jsx`,
  ligado em `pages/Oportunidades.jsx` (5ª aba, ao lado de Kanban/Lista/Calendário/Relatórios).
- Backend: Edge Function `licitacoes-triagem`.
- **Botão "Buscar agora"** dispara as 2 fontes em paralelo, modo "todas em aberto"
  (~1 min, pois o PNCP baixa tudo pra filtrar).
- **Filtros**: Estado (UF), Valor (mín/máx), Data de abertura (de/até).
- Só mostra licitações **de hoje pra frente** (abertura ≥ hoje) nas abas de inbox.
- Cada card mostra **etiqueta de origem** (Alerta / PNCP).

### Modelo de 4 status (decisão final do usuário — SEM validador)

`Nova` → `Em análise` → **Convertida** (vira Oportunidade no pipeline) · **Excluída**

- Ações: **Analisar** (em_analise), **Virar oportunidade** (cria a Oportunidade
  direto, sem etapa de aprovação), **Excluir** (vai pra aba Excluídas, recuperável
  com **Restaurar**).
- **Excluir em lote** + **Selecionar todos** + **Limpar fora do filtro** (remove
  de vez as Novas que não casam com as palavras-chave ou já passaram).
- Migration `0046` consolidou de 6 → 4 status (tirou "Aguardando validação" e
  "Recusada"; uniu "Descartada/Recusada" em "Excluída").
- ⚠️ O toggle **"Criar oportunidade automaticamente"** foi **DESLIGADO** — com o
  fluxo manual ele floodava o pipeline. A ação `reverter_auto` desfez **1.407
  oportunidades-fantasma** que tinham sido criadas automaticamente.

### Tabelas (migrations 0041/0043/0044/0046)

- `licitacao_busca` — config por empresa: `ufs` (jsonb), `palavras_chave` (texto),
  `criar_oportunidade_auto` (agora false), `ativo`. Editável em **Configurações →
  Licitações** (componente `LicitacoesConfigTab.jsx`, salva via `config-licitacao`).
- `licitacao_encontrada` — inbox: `id_licitacao` (único por empresa, dedup),
  `titulo/orgao/uf/municipio/objeto/valor/tipo/abertura/link_externo`, `status`,
  `fonte` (Alerta/PNCP), `oportunidade_id`, campos de operador.

### Pasta de documentos → OneDrive (não Google Drive)

- **Decisão final:** as pastas de cada licitação ficam no **OneDrive** do usuário,
  na estrutura que a Sinergia já usa:
  `C:\Users\javer\OneDrive\SINERGIA\LICITAÇÕES\<EMPRESA>\Licitações\<ANO>\NNN- PM Município - UF`
- **Empresas:** `SINERGIA SERVIÇOS` (obra/serviço/engenharia) e
  `SINERGIA MATERIAIS ELETRICOS` (fornecimento de material elétrico).
- **Regra de roteamento:** obra/serviço → Serviços; material elétrico → Materiais.
- Numeração sequencial de 3 dígitos (a última em Serviços/2026 era `067`; criei a `068`).
- Quem cria a pasta é o **agente Cowork** (skill `.claude/skills/agente-licitacoes/SKILL.md`),
  porque a tela web não acessa o sistema de arquivos. O OneDrive sincroniza pro celular.
- ⚠️ **Limitação:** não tenho conector do OneDrive → não dá link clicável automático
  no SIGO. O Google Drive (pasta "Licitações", id `1EAKSq1jIi5FeBFTkihGWUNpxeyRv5VvE`,
  conta `javersonr@gmail.com`) + a função `vincular-pasta-oportunidade` ficaram como **legado**.

---

## 5. Automações pg_cron (o que roda sozinho)

| Migration | Módulo               | Jobs principais (horário BRT)                                                                   |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `0036`    | Infra                | helpers de notificação + scheduler (keystone do pg_cron)                                        |
| `0037`    | Financeiro           | recorrências vencidas (06:10), marcar atrasadas (06:20), alerta de vencimento (11:00 UTC)       |
| `0038`    | Estoque              | trigger alerta de estoque mínimo + liberar reservas vencidas                                    |
| `0039`    | SST/Ferramental      | ASO (08:05), treinamentos (08:10), ferramental/laudo/manutenção (08:15) + trigger de manutenção |
| `0040`    | Compras/CRM/Projetos | SC parada, oportunidade parada, projeto atrasado/orçamento, sync oportunidade→projeto           |
| `0042`    | Licitações Alerta    | busca diária 08:30 BRT                                                                          |
| `0045`    | Licitações PNCP      | busca diária 08:45 BRT                                                                          |

Detalhe do SST está em **`docs/MODULO-SEGURANCA.md`**.

---

## 6. Histórico resumido (antes desta jornada)

- **Migração Base44 → Supabase:** mapeamento de 100 entidades, 15 migrations
  iniciais (0001–0015) cobrindo todos os módulos, RLS, import de 10.938 registros.
- **Hosting:** migrou de Cloudflare Pages → Hostgator (lftp via GitHub Actions).
- **Rebranding:** removeu Base44/Mocha de 235 arquivos.
- **Auth Fase 2:** login-custom + alterar/redefinir senha (Edge Functions).
- **Ondas de bugfix (1–5):** tela branca, `safeParseJSON` em 100+ campos JSONB,
  unificação Receitas/Despesas, Error Boundary, e a varredura profunda do
  **Financeiro** (ondas 5A/5B/5C: DRE/Balanço case-insensitive, transferência
  atômica via RPC, timezone de parcelas, recalc de saldo, etc.).
- **Compras:** aprovação multi-nível + pedido direto (migration 0028, bloqueia auto-aprovação).
- **Estoque:** integridade de reservas + RPCs atômicas (migration 0027).
- **Contabilidade/NFe:** tabela NFe + config fiscal por empresa + upload de
  certificado A1 (migrations 0031–0033). Worker SEFAZ ainda **não** foi feito.
- **Automação (AUTO-0 a AUTO-4):** toda a fundação pg_cron + jobs por módulo.

---

## 7. Documentos de referência no repo (`docs/`)

- `ESTADO-DO-PROJETO.md` — **este arquivo**.
- `MODULO-SEGURANCA.md` — referência completa do módulo SST.
- `ROADMAP.md`, `SCHEMA.md`, `MIGRATION-CHECKLIST.md`, `DEPLOY-HOSTGATOR.md`,
  `DEPLOY-SUPABASE.md`, `DNS-CHECKLIST-HOSTGATOR.md`, `CUTOVER-PASSO-A-PASSO.md`.

---

## 8. Skills / agentes do Cowork

- `.claude/skills/agente-licitacoes/SKILL.md` — cria a pasta numerada da licitação
  no OneDrive (empresa/ano/sequência) e organiza. Acionar com "roda o agente de
  licitações" / "cria a pasta da licitação X".

---

## 9. Pendências em aberto (TODO)

### 🔴 Quente

- **Bug Financeiro → Despesas:** a aba Despesas crasha (em **todas as empresas**).
  Toda a varredura mostrou o render blindado; falta a **mensagem exata do erro**.
  Já subi melhoria no ErrorBoundary (commit `2ea734d`) que mostra o erro + o
  componente **direto na tela**. **Próximo passo:** o usuário recarrega Despesas,
  tira print do card de erro → corrigir o ponto exato.

### 🟡 Licitações — FASE 2

- Depois que os PDFs do edital estiverem na pasta do OneDrive, montar **dashboards**:
  análise financeira, risco de habilitação e análise de contrato/minuta (HTML na pasta).

### 🟡 Automação (faltam)

- **AUTO-6:** Edge Function de e-mail + disparo nas notificações urgentes (precisa `RESEND_API_KEY`).
- **AUTO-7:** Relatórios agendados + sugestão de classificação por OCR no pré-lançamento.
- **AUTO-8:** Chat em realtime (substituir o polling de 3s).
- **AUTO-5 (adiada):** conciliação bancária — a UI usa campos fantasma
  (`status_conciliacao`/`extrato_id`); precisa alinhar schema/UI antes.

### 🟢 Maiores (aguardando)

- **Worker de NFe/SEFAZ** (emissão) — adiado por decisão do usuário; antes,
  **criptografar a senha do certificado A1** (hoje em texto).
- **Bot WhatsApp (TIER 4)** — bot Node ESM + Hono + OpenAI + pdftoppm, deploy
  Railway, complementa o ERP. Aguardando.

---

## 10. Apêndice — commits-chave desta jornada (mais recentes no topo)

```
479e741 docs: referência do módulo Segurança (SST)
2ea734d feat(error-boundary): mostra erro + componente na tela
4afeaef feat(licitacoes): reverter_auto (desfaz 1.407 oportunidades-fantasma)
aad81eb feat(licitacoes): 4 status (sem validador) + filtros uf/valor/data
7455ff0 feat(licitacoes): só de hoje pra frente + reforça filtro/exclusão
24ddbb4 feat(licitacoes): "Buscar agora" varre TODAS em aberto (Alerta full + PNCP /proposta)
5f1ca79 feat(licitacoes): seleção múltipla + excluir lote + limpar fora do filtro
e31bcd3 chore(agente-licitacoes): migrar Google Drive → OneDrive (pastas numeradas)
4f54007 feat(licitacoes): 2ª fonte PNCP + etiqueta de origem
a2c4405 feat(licitacoes): aba "Licitações" em Oportunidades
55f1af9 fix(app): blindar contra tela branca pós-deploy (preloadError + ErrorBoundary)
45a7e93 fix(licitacoes): salvar config via Edge Function (corrige RLS)
f08d6ab feat(licitacoes): busca automática Alerta Licitação (backend + cron)
2124700/75ebdb6 feat(automacao): AUTO-0..3 (pg_cron + financeiro/estoque/SST)
0d7c7d1/332cd4d/0e8d502 fix(financeiro): ondas 5A/5B/5C
```

> Para o estado mais recente, sempre cheque `git log --oneline` e `select * from cron.job;`.
