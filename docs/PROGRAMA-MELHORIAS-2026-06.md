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
- [ ] CORS travado no domínio (SEG 4.2) — **precisa confirmar origens de produção** antes (risco de lockout). Redeploy de todas as Edge Functions.
- [ ] Índices únicos cientes de soft-delete (`where deleted_at is null`) — checar duplicatas antes.
- [ ] Checagem de permissão no **backend** (hoje só no front) — `check_permission` nas RPCs críticas.

### 🦺 Onda SST (compliance — risco legal)

- [x] **0057** — backend do bloqueio por ASO: tabela `liberacao_sst` + RPC
      `funcionario_apto_campo` + `liberar_sst` (só Admin/Gestor). _(feito, smoke OK)_
- [ ] Frontend: tela de entrega de ferramenta consulta `funcionario_apto_campo`,
      bloqueia se inapto e mostra botão "Liberar (Admin)" com justificativa.
- [ ] (Fase 2) Trigger airtight no `entrega_ferramental` — habilitar **após** limpar
      os ASOs nulos, pra não travar a operação no dia 1.
- [ ] (Fase 2) Matriz de treinamento por função (NR-10/NR-35) — exige estruturar a
      conclusão de treino por funcionário (hoje em jsonb `treinamentos_anexos`).

### 💰 Onda Comercial (o que faz vender)

- [ ] **Medição mensal** por obra (`medicao_mensal`): % físico/financeiro acumulado,
      retenção (% por contrato), valor medido/faturado, boletim PDF.
- [ ] **Margem por obra**: orçado × comprometido × realizado × faturado por projeto.
- [ ] **Retenções fiscais** (ISS/INSS) ligadas à receita.
- [ ] **Consolidação do grupo** (painel do dono): caixa/margem/despesa somados das 19.
- [ ] Proposta versionada + checklist de habilitação (licitação).
- [ ] Win-rate por órgão (propagar campos da licitação → oportunidade) + `motivo_perda` estruturado.

### 🧹 Onda Qualidade

- [ ] Plugar o **motor de fluxos** (0052/0053, já no banco) numa tela "Minhas Pendências".
- [ ] Quebrar os 5 arquivos de 2.000+ linhas (SegurancaTrabalho, FuncaoModal, DespesasTab, Ferramental, ReceitasTab).
- [ ] Primeiros testes automatizados (começar pelo Financeiro) + TypeScript gradual.
- [ ] Observabilidade (Sentry) + auditoria de alterações financeiras.

## Princípios de execução

- Cada onda: migration aditiva → smoke test → `db push` → verifica → commit.
- Nada destrutivo; nada que dependa de regra de negócio sem o dono confirmar.
- `[skip ci]` em migrations puras (não afetam o frontend).
