# Módulo Segurança do Trabalho (SST) — SIGO Obras

> Documento de referência para o Cowork (e para humanos). Explica **o que o
> módulo faz, como os dados são organizados, quais são os fluxos e o que roda
> automático**. Escrito para ser lido sem ambiguidade.
>
> Fonte: código real em `apps/web/src/pages/SegurancaTrabalho.jsx`,
> `apps/web/src/components/seguranca/*`, e migrations
> `0009_rh_sst.sql`, `0008_ferramental_inspecoes.sql`, `0039_automacao_sst_ferramental.sql`.

---

## 1. Visão geral — para que serve

O módulo **Segurança do Trabalho** controla tudo que é SST de uma empresa de
obras/serviços:

- **Funcionários**: cadastro completo + documentos (RH, obrigatórios, demissionais).
- **Treinamentos (NR / TST)**: certificados, validade, assinatura, alertas de vencimento.
- **ASO e exames médicos**: controle de saúde ocupacional com vencimento.
- **EPI, Ferramentas e Caminhão**: solicitação → entrega com **biometria** do funcionário.
- **Inspeções**: de campo (checklist NR), de ferramental (fotos) e de caminhão.
- **Documentação da empresa**: PCMSO, PGR, Lista de Presença + central de **vencimentos**.
- **Automações**: alertas diários de ASO, treinamentos e ferramental vencendo.

Tudo é **multi-empresa** (cada registro tem `empresa_id`; o usuário vê só a empresa ativa).

---

## 2. Onde fica no código

| O quê                               | Caminho                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| Página (tela principal)             | `apps/web/src/pages/SegurancaTrabalho.jsx`               |
| Componentes                         | `apps/web/src/components/seguranca/*.jsx`                |
| Tabelas SST/RH                      | `supabase/migrations/0009_rh_sst.sql`                    |
| Tabelas de inspeção/ferramental/EPI | `supabase/migrations/0008_ferramental_inspecoes.sql`     |
| Automações (crons + trigger)        | `supabase/migrations/0039_automacao_sst_ferramental.sql` |

Acesso aos dados no front: `sigo.entities.<Entidade>.filter({ empresa_id })`
(ex.: `Funcionario`, `Treinamento`, `Funcao`, `InspecaoCampo`, `EntregaFerramental`).

---

## 3. Estrutura da tela

### 3.1 Abas da PÁGINA (nível topo)

| value                  | Label                   | Componente                                | Permissão (além de Admin) |
| ---------------------- | ----------------------- | ----------------------------------------- | ------------------------- |
| `funcionarios`         | Funcionários            | tabela inline + modal do funcionário      | "Funcionários"            |
| `inspecao_campo`       | Inspeção de Campo       | `InspecaoCampoTab`                        | "Inspeção de Campo"       |
| `inspecao_ferramental` | Inspeção de Ferramental | `InspecaoCampoTab` (variante ferramental) | "Inspeção de Ferramental" |
| `inspecao_caminhao`    | Inspeção de Caminhão    | `CaminhoesTab`                            | "Inspeção de Caminhão"    |
| `documentacao_empresa` | Documentação da Empresa | `DocumentacaoEmpresaTab`                  | "Documentação da Empresa" |
| `solicitacoes_entrega` | Solicitações de Entrega | `SolicitacoesEntregaTab`                  | (sempre visível)          |

A página inteira é bloqueada se o usuário não tem `temPermissao("Segurança do Trabalho")`.

### 3.2 Abas DENTRO do funcionário (modal, ao abrir um funcionário)

Quando você abre um funcionário na aba **Funcionários**, há sub-abas:

- **Dados Pessoais** — `DocumentacaoTab` + `BiometriaFuncionarioPanel` (CPF, RG, PIS, foto, biometria).
- **RH** — `RHTab`: ASO, exames médicos, registro de empregado, documentos obrigatórios e demissionais (com análise por IA Gemini).
- **TST** — `TSTTab`: treinamentos da função, certificados, importação por OCR, assinatura, e os botões que abrem EPI / Ferramentas / Autorização Formal / Direito de Recusa / Ordem de Serviço.

### 3.3 Dados carregados ao abrir a página

```
Funcionario (ativos) · Funcao (ativas) · InspecaoFerramental · InspecaoCaminhao · Caminhao
```

---

## 4. Modelo de dados (tabelas e colunas-chave)

> Apenas as colunas que importam para entender o módulo. Todas têm `empresa_id`,
> `ativo`, `created_at/updated_at` e `deleted_at` (soft-delete) salvo indicação.

### `funcao` — funções/cargos (0009)

Define os **modelos** de cada cargo: `nome`, `salario`, e os JSONBs que ditam o
que cada função exige:

- `modelo_epi` — EPIs obrigatórios da função
- `modelo_ferramentas` — ferramentas obrigatórias
- `modelo_treinamentos` — treinamentos obrigatórios (NRs)
- `modelo_autorizacao_formal` / `modelo_direito_recusa` / `modelo_ordem_servicos` — templates de documentos

### `funcionario` — colaborador (0009)

Cadastro completo. Campos-chave:

- Identificação: `nome_completo`, `cpf` (único por empresa), `rg`, `pis`, `data_nascimento`, `funcao_id`/`funcao_nome`, `data_admissao`, `foto_url`.
- **ASO**: `aso_vencimento` (date) — usado pelo alerta automático.
- **Biometria**: `biometria_capturada` (bool) + `biometria_template` (JSON `{ template, data_captura, qualidade }`).
- **Documentos** (todos JSONB, arrays de `{ nome, anexos[] }`):
  - `documentos_obrigatorios` (CPF, RG, PIS, título, comprovante de residência, antecedentes, CTPS… + condicionais por estado civil/dependentes)
  - `documentos_rh_estruturados` (ASO, Exames, Registro de Empregado)
  - `documentos_demissionais` (aviso prévio, TRCT, exame demissional, PPP…)
  - `treinamentos_anexos`, `epis_anexos`, `ferramentais_anexos`, `ordem_servicos_anexos`, `autorizacao_formal_anexos`, `direito_recusa_anexos`

### `treinamento` — treinamentos/NRs (0009)

`nome` (ex.: "NR-10"), `funcao_id`, `carga_horaria`, `validade_meses`,
`data_inicio`, `data_fim`, `aproveitamento`, responsáveis (técnico/instrutor/
engenheiro com CREA e URLs de assinatura), `usar_como_modelo`.
**Vencimento** = `(data_fim + validade_meses)`.

### `historico_documento_assinado` — trilha de documentos assinados (0009)

Cada certificado/ASO/OS assinado vira uma linha: `funcionario_id`,
`tipo_documento` (ex.: 'Certificado TST', 'Ordem de Serviço'), `url`, quem subiu.

### `documento_empresa` — docs da empresa (0009)

`tipo` ∈ {PCMSO, PGR, Lista de Presença, Outro}, `data_documento`,
`data_vencimento`, `responsavel_tecnico`/`crea_responsavel`, `anexos` (JSONB),
`status` ∈ {Rascunho, Vigente, Vencido, Arquivado}.

### `vencimento` — central de vencimentos (0009)

Controla qualquer prazo: `tipo` ∈ {CND, PGR, PCMSO, LTCAT, ASO, Treinamento NR,
ART, CAT, Contrato, Licença Ambiental, Alvará, Manutenção/Calibração, Seguro,
Outro}, `data_vencimento`, `status` ∈ {OK, A Vencer, Vencido}, `alerta_dias`
(default 30), `arquivo_url`.

### Inspeções e entregas (0008)

- `checklist_inspecao_campo` — modelos de checklist (`itens` JSONB; ex.: "NR-35 Altura").
- `inspecao_campo` — execução: `checklist_id`, `data_inspecao`, `local`, `itens_inspecao` (JSONB com conforme/não-conforme), `total_conformes`/`total_nao_conformes`, `status` ∈ {Em Andamento, Concluída, Não Conforme}.
- `inspecao_ferramenta` — inspeção diária por funcionário: `funcionario_id`, `ferramentas_inspecionadas` (JSONB com foto/status), `status` ∈ {em_andamento, concluida, cancelada}.
- `inspecao_caminhao` — inspeção de veículo: `caminhao_id`, `data_inspecao`, `status` ∈ {em_andamento, concluida, reprovada}.
- `entrega_ferramental` — entrega de EPI/ferramentas/caminhão (ver fluxo 5.3): `funcionario_id` ou `caminhao_id`, `tipo` ∈ {Ferramentas, EPIs, Ferramentas e EPIs}, `tipo_destinatario` ∈ {Funcionário, Caminhão}, `itens` (JSONB), `status` ∈ {Pendente, Entregue, Cancelada}, `biometria_capturada`, `data_entrega`.

---

## 5. Fluxos de trabalho (passo a passo)

### 5.1 Cadastrar funcionário + documentos

1. Aba **Funcionários** → novo funcionário (dados pessoais + função + `aso_vencimento`).
2. Sub-aba **Dados Pessoais**: documentos obrigatórios + foto + biometria.
3. Sub-aba **RH**: ASO, exames, registro (IA Gemini pode ler o PDF e extrair dados).
4. Se desligado: documentos demissionais.
5. Automático: alerta diário se ASO vence em ≤30 dias.

### 5.2 Treinamento / Certificado TST

1. Sub-aba **TST**: lista os treinamentos da função (de `modelo_treinamentos`).
2. Criar/editar treinamento (datas, carga, validade, responsáveis).
3. **Importar certificado por IA**: sobe PDF/foto → OCR extrai datas e aproveitamento (lote, 1 funcionário por vez).
4. **Assinar** → grava em `historico_documento_assinado` (tipo 'Certificado TST') + anexo em `funcionario.treinamentos_anexos`.
5. Automático: alerta se `(data_fim + validade_meses)` vence em ≤30 dias.

### 5.3 Entrega de EPI / Ferramentas / Caminhão (com biometria)

1. Solicitar (botões na aba TST ou em Caminhões): escolhe itens da função → cria `entrega_ferramental` com `status='Pendente'`.
2. Aba **Solicitações de Entrega**: o responsável marca **Entregue**, **captura a biometria** do funcionário (leitor Nitgen) → grava `biometria_capturada=true`, `data_entrega=now()`.
3. Pode cancelar/excluir solicitação. Filtros por status.
4. Automático: devolução atrasada (`data_prevista_devolucao < hoje` e sem `data_devolucao`) entra no alerta de ferramental.

### 5.4 Inspeção de Campo

1. Aba **Inspeção de Campo** → escolhe (ou cria) um checklist (`checklist_inspecao_campo`).
2. Executa: marca cada item Conforme/Não Conforme + foto/observação → salva em `inspecao_campo`.
3. Resultado: score = conformes/total; exporta Excel/PDF.

### 5.5 Inspeção de Ferramental / Caminhão

- **Ferramental**: funcionário fotografa e registra status de cada ferramenta da função → `inspecao_ferramenta`.
- **Caminhão**: aba **Inspeção de Caminhão** → checklist do veículo → `inspecao_caminhao`.
- Laudo de ferramenta com vencimento entra no alerta de ferramental.

### 5.6 Documentação da Empresa + Vencimentos

1. Aba **Documentação da Empresa**: cria PCMSO/PGR/Lista de Presença (`documento_empresa`) com data de vencimento e anexo.
2. Central de **vencimentos** (`vencimento`) acompanha todos os prazos (CND, ASO, treinamentos, ART, licenças…) com status OK / A Vencer / Vencido.

---

## 6. Automações (rodam sozinhas, no servidor)

Definidas em `0039_automacao_sst_ferramental.sql`. Os horários estão em **UTC**;
o Brasil é **UTC−3**, então some 3h não — **subtraia** 3h para o horário de Brasília.

| Job / Trigger                                   | Quando                                    | O que faz                                                                                                                                     | Notifica (sino)                                         |
| ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **`alertar_aso`** (cron)                        | `5 11 * * *` → **11:05 UTC = 08:05 BRT**  | Conta funcionários com `aso_vencimento` em ≤30 dias (e quantos já vencidos), por empresa.                                                     | Admin Holding, Admin, Gestor — "ASOs a vencer"          |
| **`alertar_treinamentos`** (cron)               | `10 11 * * *` → **11:10 UTC = 08:10 BRT** | Conta treinamentos com `(data_fim+validade_meses)` vencendo em ≤30 dias.                                                                      | Admin Holding, Admin, Gestor — "Treinamentos a vencer"  |
| **`alertar_ferramental`** (cron)                | `15 11 * * *` → **11:15 UTC = 08:15 BRT** | Marca `ferramenta.alerta_manutencao` quando `proxima_manutencao < hoje`; soma laudos vencendo + manutenções atrasadas + devoluções atrasadas. | Admin Holding, Admin, Gestor, Estoque — prioridade Alta |
| **`tg_ferramenta_agenda_manutencao`** (trigger) | BEFORE INSERT/UPDATE em `ferramenta`      | Calcula `proxima_manutencao = ultima_manutencao + intervalo_manutencao_dias`.                                                                 | —                                                       |

As notificações são **deduplicadas por dia** (uma por empresa por dia) e caem no
**sininho** do sistema (tabela `notificacao`). Para conferir os jobs ativos no
banco: `select * from cron.job;`.

---

## 7. Permissões

- Acesso ao módulo: `temPermissao("Segurança do Trabalho")` (ou perfil `Admin`).
- Cada aba tem uma subpermissão própria (ver tabela 3.1).
- Perfis do sistema: `Admin Holding`, `Admin`, `Gestor`, `Compras`, `Estoque`,
  `Financeiro`, `Cliente`. Os alertas de SST vão para Admin Holding/Admin/Gestor
  (ferramental também inclui Estoque).

---

## 8. O que o Cowork pode fazer aqui (referência rápida)

- **Entender/explicar** qualquer parte do módulo a partir deste doc.
- **Diagnosticar** dados via Edge Functions (service role) ou inspeção do código.
- **Estender automações**: novos alertas seguem o padrão de `0039` (cron + pg_net + `notificar_gestores`).
- **NÃO** alterar dados de produção sem pedido explícito; biometria e documentos
  são sensíveis (LGPD).

> Última atualização: gerado a partir do código atual do repositório.
