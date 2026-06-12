# Programa de Melhorias — SIGO Obras (jun/2026)

> Objetivo do dono: "melhorar o sistema, ficar o mais comercial possível, corrigir
> tudo de errado no código". Executado em **ondas seguras** (cada onda = deploy
> isolado e verificado), porque é sistema financeiro em produção (19 empresas, sem
> testes). Baseado no parecer técnico de 6 frentes (jun/2026).

## Decisões do dono (travadas)

1. **SST — ASO/NR vencido:** bloqueia, **mas Admin/Gestor libera** com justificativa
   registrada + prazo de validade.
2. **Medição/Retenção:** contratos têm faturamento por medição mensal e retenção;
   **a % varia por contrato** → campos configuráveis por obra.
3. **Consolidação:** **sim** — painel do grupo (19 empresas) para o dono; demais
   usuários continuam vendo só a própria empresa.

## A crítica central (o "porquê" do programa)

O sistema modela **cadastros + caixa**, mas não modela o **CONTRATO DE OBRA** como
objeto central: falta o ciclo **medir → faturar a medição → reter → ver a margem
por obra**. Por isso hoje não responde "a obra X deu lucro?".

## Ondas

### 🔒 Onda Segurança

- [x] **0056** — revoga `anon` das 12 RPCs SECURITY DEFINER (SEG 5.3). _(feito, verificado)_
- [x] **CORS travado no domínio** (SEG 4.2): withCors() ecoa origem permitida (sigoobras.com.br ± www + dev local); 15 functions redeployadas; verificado ao vivo (origem maliciosa sem ACAO; login OK). _(feito)_
- [x] **0060** — índices únicos cientes de soft-delete nos 8 catálogos (recriar após apagar funciona; duplicado vivo segue bloqueado; estoque*saldo/licitacao mantidos por usarem ON CONFLICT). *(feito, smoke OK)\_
- [x] **0061** — identidade derivada do TOKEN no banco (current*user_email/perfil): liberar_sst + fluxo concluir/aprovar/reprovar não aceitam mais perfil declarado pelo cliente (spoof de "Admin" morto); fallback p/ contextos sem JWT. *(feito, smokes OK)\_ — **0062/0063**: Compras no mesmo padrão + fix de perfis*aprovadores jsonb-string (dado legado do import quebrava a aprovação) + smoke de Compras passou ponta a ponta. *(feito)\_

### 🦺 Onda SST (compliance — risco legal)

- [x] **0057** — backend do bloqueio por ASO: tabela `liberacao_sst` + RPC
      `funcionario_apto_campo` + `liberar_sst` (só Admin/Gestor). _(feito, smoke OK)_
- [x] Frontend: tela de entrega consulta `funcionario_apto_campo`, bloqueia se
      inapto e mostra "Liberar excepcionalmente" (Admin, justificativa). _(deploy cf4a912)_
- [x] **0071 — Auditoria + revogação da liberação**: liberar*sst notifica os
      gestores ao liberar (trilha no sino); `revogar_liberacao_sst` (Admin/Gestor,
      justificativa, identidade via token) volta a bloquear o funcionário e avisa.
      Nova aba **"Liberações SST"** lista as ativas e permite revogar. *(feito,
      smoke verde, deploy 8351920)\_
- [ ] (Fase 2) Trigger airtight no `entrega_ferramental` — habilitar **após** limpar
      os ASOs nulos, pra não travar a operação no dia 1.
- [ ] (Fase 2) Matriz de treinamento por função (NR-10/NR-35) — exige estruturar a
      conclusão de treino por funcionário (hoje em jsonb `treinamentos_anexos`).

### 💰 Onda Comercial (o que faz vender)

- [x] **0058 — Medição mensal** por obra (`medicao_obra`): % físico, valor medido,
      retenção % por contrato, RPC `faturar_medicao` (receita líquida + receita de
      retenção, trava dupla-faturação). _(feito, smoke OK)_ — boletim PDF pendente.
- [x] **Margem por obra**: view `v_margem_projeto` + aba **Medições** no projeto
      (card orçado × custo × faturado × recebido × retido × margem). _(frontend ok)_
- [x] **0064 — Retenções fiscais** (ISS/INSS, % por obra): faturar*medicao v3 desconta do líquido e lança os impostos como despesas fiscais vinculadas (custo da obra/DRE corretos, sem mexer no caixa bancário); campos ISS/INSS na config do contrato (aba Medições). *(feito, smoke OK)\_
- [x] **Consolidação do grupo** (0059 + página "Grupo"): caixa, recebido/pago no
      mês, a receber/pagar e atrasados — total e por empresa; guard no banco
      (só Admin Holding/super admin). _(feito, smoke OK)_
- [x] **0066 — Proposta versionada**: proposta*oportunidade com versão sequencial (trigger) e IMUTABILIDADE no banco (mudou valor → nova versão); seção Propostas na aba Geral da Oportunidade (registrar, Aceita/Recusada). *(feito, smoke OK)\_ — checklist de habilitação: próxima fase.
- [x] **0065 — Win-rate por órgão**: oportunidade.orgao + backfill (2.233/2.296 recuperadas), buscar-licitacoes propaga o órgão, view v*winrate_orgao + tabela no Relatório de Oportunidades. *(feito)\_ — `motivo_perda` estruturado fica p/ proposta versionada.
- [x] **0068/0069/0070 — Recebimento de Compra** (fecha o buraco do `quantidade_entregue` que nada atualizava): tabelas `recebimento_compra` + `_item`, RPC atômica `conferir_recebimento_pedido` (valida pendente, dá entrada no estoque, soma entregue, fecha pedido Entregue/Parcial, identidade do recebedor via token). Frontend: modal **"Conferir Recebimento"** no menu do pedido (recebimento parcial, exige almoxarifado p/ itens de estoque). Testado com empresa fictícia (parcial 6/10 → trava acima do pendente → total → Entregue + estoque 10). **2 bugs latentes corrigidos pelo smoke**: (a) **0069** — `estoque_saldo` único era NULLS DISTINCT → entrada com `local_id` nulo criava saldo órfão (fragmentava); recriado NULLS NOT DISTINCT (entrada volta a SOMAR). (b) **0070** — `gerar_pedido_direto` fazia `select nome` de fornecedor (coluna inexistente) → quebrava em runtime; trocado p/ `nome_razao`. + frontend: dropdown de fornecedor do Pedido Direto mostrava em branco (`f.nome`) → `nome_fantasia || nome_razao`. _(feito, smokes verdes, deploy fb01b86)_

### 🧹 Onda Qualidade

- [x] **Minhas Pendências** — tela liga o motor de fluxos aos usuários: listas "para executar" (com checklist) e "para aprovar" (aprovar/reprovar com motivo), chamando as RPCs endurecidas da 0061; item de menu visível a todos os perfis internos. _(feito)_
- [ ] Quebrar os 5 arquivos de 2.000+ linhas (SegurancaTrabalho, FuncaoModal, DespesasTab, Ferramental, ReceitasTab).
- [ ] Primeiros testes automatizados (começar pelo Financeiro) + TypeScript gradual.
- [ ] Observabilidade (Sentry) + auditoria de alterações financeiras.

## Princípios de execução

- Cada onda: migration aditiva → smoke test → `db push` → verifica → commit.
- Nada destrutivo; nada que dependa de regra de negócio sem o dono confirmar.
- `[skip ci]` em migrations puras (não afetam o frontend).
