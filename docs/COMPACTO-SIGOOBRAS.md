# Compacto SIGO Obras

Ultima revisao: 2026-07-09.

Este arquivo e o resumo de continuidade do SIGO Obras para retomar o projeto sem redescobrir contexto.

## Essencia

SIGO Obras e um ERP multiempresa para obras, servicos, materiais eletricos e operacoes relacionadas. O sistema saiu de uma plataforma low-code/Base44 para uma stack propria:

- Frontend: Vite, React 18, Tailwind, Radix UI.
- Backend: Supabase, Postgres, Auth, Storage e Edge Functions.
- Hospedagem: Hostgator para o site estatico, Supabase Cloud para backend, Railway para workers/bot.
- Monorepo principal: `C:\Users\javer\sigoobras-base`.
- Bot WhatsApp separado: `C:\Users\javer\SIGO-WHATSAPP-BOT`.
- Site: `https://sigoobras.com.br`.
- Supabase project ref: `fpyvdwpvxrubrkdwrqbs`.

## Regra de dominio importante

**Oportunidades e Projetos sao modulos totalmente independentes.**

Nao assumir que uma oportunidade vira projeto automaticamente, nem modelar Projeto como dependencia estrutural de Oportunidade. Se houver qualquer fluxo ligando os dois, ele deve ser uma acao explicita do usuario ou uma integracao pontual, nao uma premissa do dominio.

Licitações podem existir como dados manuais dentro de Oportunidades/Projetos, mas o antigo modulo de busca automatica de licitacoes foi removido.

## Estado atual mais recente observado

O documento `docs/ESTADO-DO-PROJETO.md` esta parcialmente desatualizado sobre licitacoes. Ele descreve o modulo de busca como completo, mas commits recentes e a migration `0083_remove_licitacoes.sql` mostram que a busca automatica foi aposentada.

Estado mais recente pelo `git log`:

- `e486f0e chore(licitacoes): remove backend da busca (cron + edge functions + tabelas)`.
- `8cb1b66 chore(licitacoes): remove UI da busca de licitação (Configurações + Inbox)`.
- `eb06063 chore(oportunidades): remove aba "Licitações" (busca redundante)`.
- Campos `licitacao_*` foram mantidos em `oportunidade` porque uma oportunidade pode ser uma licitacao cadastrada manualmente.

Portanto: nao reimplementar PNCP/Alerta Licitacao sem pedido explicito. O monitoramento passou a ocorrer fora do SIGO.

## Modulos principais

- Dashboard e calendario consolidado.
- Oportunidades/CRM, independente de Projetos.
- Projetos, cronograma, diario de obra, orcamento e dados proprios.
- Financeiro: receitas, despesas, extratos, conciliacao, recorrencias, anexos, DRE/balanco/relatorios.
- Compras: solicitacao, aprovacao, cotacao, pedido, recebimento.
- Estoque: materiais, almoxarifado, reservas, saldo, movimentacoes.
- Ferramental/EPI: entregas, laudos, manutencoes, biometria e relatorios.
- Seguranca do Trabalho/SST: funcionarios, vencimentos, treinamentos, ASO, documentos, solicitacoes de entrega.
- Contabilidade/NFe: estrutura iniciada, worker SEFAZ ainda pendente.
- Manufatura: modulo recente de manufatura discreta, engenharia, producao, custos, MRP, qualidade, manutencao e OEE.
- Configuracoes, auditoria, permississoes, portal cliente e portal fornecedor.

## Arquitetura

O frontend fica em `apps/web`. As telas principais estao em `apps/web/src/pages`, com componentes por dominio em `apps/web/src/components`.

O backend fica em `supabase`:

- `supabase/migrations`: migrations SQL, atualmente chegando pelo menos ate `0084_compras_colunas_frontend.sql`.
- `supabase/functions`: Edge Functions Deno.
- `_shared`: helpers comuns de auth, CORS, Supabase admin, portal e status.

Edge Functions observadas:

- `login-custom`
- `alterar-senha`
- `redefinir-senha-admin`
- `trocar-empresa`
- `portal-cliente-acao`
- `portal-cliente-dados`
- `portal-fornecedor-login`
- `portal-fornecedor-cotacoes`
- `portal-fornecedor-cotacao`
- `portal-fornecedor-resposta`
- `vincular-pasta-oportunidade`

## Auth e multiempresa

O plano mais seguro e o caminho atual recomendado e usar Supabase Auth nativo como ponte, com `login-custom` criando/sincronizando `auth.users`, setando `app_metadata.empresa_id` e devolvendo sessao real para o frontend.

Pontos importantes:

- O isolamento multiempresa deve vir de RLS por `empresa_id`.
- Troca de empresa precisa emitir/atualizar sessao, porque o JWT carrega `empresa_id`.
- Edge Functions sensiveis nao devem confiar cegamente em `empresa_id` vindo do body.
- Service role bypassa RLS, entao precisa validar o chamador quando aplicavel.

## Seguranca pendente/critica

- Reforcar RLS em todas as tabelas com `empresa_id`.
- Restringir CORS para as origens reais do SaaS.
- Revogar grants desnecessarios para `anon`, especialmente em RPCs `SECURITY DEFINER`.
- Mover tokens/senhas sensiveis para Vault/pgcrypto.
- Criptografar senha do certificado digital A1 antes de qualquer worker NFe/SEFAZ.
- Trocar defaults permissivos por deny-by-default em permississoes.

## Deploy

- Frontend: GitHub Actions builda e envia para Hostgator via lftp quando ha push em `master` tocando `apps/web/**`.
- Banco: `supabase db push --linked`.
- Edge Functions: `supabase functions deploy <nome> --project-ref fpyvdwpvxrubrkdwrqbs --no-verify-jwt`.
- O build de producao remove `console.*`, entao diagnostico em producao deve aparecer em UI/logs/observabilidade, nao depender de console.
- `apps/web/public/.htaccess` faz fallback SPA e cache correto.
- Handler de `vite:preloadError` recarrega automaticamente apos deploy com chunks novos.

## Divida tecnica prioritaria

Da revisao senior de junho de 2026:

1. Quebrar arquivos grandes: `Layout.jsx`, `SegurancaTrabalho.jsx`, `Ferramental.jsx`, `Estoque.jsx`, telas grandes de financeiro.
2. Reorganizar `components/financeiro` por feature.
3. Criar camada de dados com React Query em vez de `useEffect + load + setState` repetido.
4. Criar `EntityCombobox` reutilizavel.
5. Padronizar confirmacao/erro com AlertDialog/toast/helpers.
6. Usar `react-hook-form` nos formularios grandes.
7. Adicionar testes automatizados, primeiro nos RPCs financeiros.
8. Adicionar Sentry/observabilidade.
9. Ligar regras ESLint de hooks e console.
10. Organizar `docs` em oficial/arquivado/internal.

## Pendencias funcionais

- Financeiro/Despesas teve historico de crash; a orientacao antiga era capturar a mensagem exata exibida pelo ErrorBoundary. Verificar se o commit recente `342ca54` e trabalhos posteriores ja resolveram tudo antes de mexer.
- AUTO-6: e-mail para notificacoes urgentes, depende de `RESEND_API_KEY`.
- AUTO-7: relatorios agendados e OCR para pre-lancamento.
- AUTO-8: chat realtime substituindo polling.
- Conciliacao bancaria ainda precisa alinhar UI/schema antes de automatizar.
- Worker NFe/SEFAZ foi adiado.
- Bot WhatsApp existe em repo separado e aguarda integracao/uso conforme decisao.

## Bot WhatsApp

Repositorio: `C:\Users\javer\SIGO-WHATSAPP-BOT`.

Stack:

- Node ESM.
- Hono.
- Supabase JS.
- OpenAI.
- `pdf-parse`.
- OCR de imagem/PDF em `src/ocr`.

Arquivos centrais:

- `index.mjs`: sobe servidor Hono.
- `src/routes.mjs`: rotas.
- `src/config.mjs`: configuracao/env.
- `src/whatsapp.mjs`: integracao WhatsApp.
- `src/cidadao/*`: fluxo cidadao.

## Licitacoes

Historico:

- Houve modulo de busca automatica com Alerta Licitacao e PNCP.
- Houve inbox em Oportunidades, status de triagem e conversao manual.
- Houve rotina para desfazer oportunidades fantasmas criadas automaticamente.

Estado atual:

- Busca automatica removida.
- UI da aba Licitacoes removida.
- Crons e tabelas `licitacao_busca` e `licitacao_encontrada` removidos por migration.
- Campos manuais de licitacao permanecem em Oportunidades/Projetos quando fizer sentido.
- Processo operacional de licitacao -> obra ainda pode existir como documento/processo, mas nao como busca automatica dentro do sistema.

## Processo licitacao -> obra

Documentos de referencia ainda uteis:

- `docs/MAPA-PROCESSOS-LICITACAO-OBRA.md`
- `docs/REVISAO-FLUXO-LICITACAO-OBRA.md`
- `docs/SPEC-MOTOR-FLUXOS-APROVACAO.md`

Usar esses documentos como rascunho/processo, nao como prova de funcionalidade atual. Como Oportunidades e Projetos sao independentes, qualquer motor de fluxo deve respeitar essa separacao.

## Comandos uteis

```powershell
cd C:\Users\javer\sigoobras-base
npm run dev
npm run build
npm run lint
npm run typecheck
npm run supabase:db:push
npm run supabase:functions:deploy
git log --oneline -20
```

## Fontes locais consultadas para este compacto

- `README.md`
- `package.json`
- `apps/web/package.json`
- `docs/ESTADO-DO-PROJETO.md`
- `docs/ROADMAP.md`
- `docs/SCHEMA.md`
- `docs/REVISAO-SENIOR-2026-06.md`
- `docs/PLANO-SEGURANCA-MULTITENANT.md`
- `docs/MAPA-PROCESSOS-LICITACAO-OBRA.md`
- `supabase/migrations/0083_remove_licitacoes.sql`
- `git log --oneline -20`
- `C:\Users\javer\SIGO-WHATSAPP-BOT\package.json`
- `C:\Users\javer\SIGO-WHATSAPP-BOT\index.mjs`
