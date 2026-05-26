# Schema da API da plataforma anterior — SIGO Obras

> **Status:** ARQUIVADO — referência histórica.
>
> Este documento descreve o modelo de dados da plataforma low-code anterior, da qual o SIGO Obras está sendo migrado. Está aqui apenas como fonte de verdade do comportamento esperado enquanto a migração não termina. Será removido junto com `legacy/` após a estabilização do novo ambiente.

**Fonte:** export da documentação oficial da API da plataforma anterior, capturado em 2026-05-24.

Total: **100 entidades**.

Use este arquivo como referência ao escrever:
- Migrations Postgres em `supabase/migrations/`
- Edge Functions em `supabase/functions/`
- Wrapper em `shared/sdk/`

## Entidades por domínio

### Auth & Multi-tenant (8)
- `Empresa` — empresa cliente do SaaS
- `GrupoEmpresarial` — holding (agrupa várias empresas)
- `UsuarioEmpresa` — vínculo usuário ↔ empresa, com perfil (Admin Holding, Admin, Gestor, Compras, Estoque, Financeiro, Cliente)
- `UsuarioCustom` — credencial customizada (email + senha_hash + super_admin)
- `User` — entidade nativa do Base44 (admin/user, dashboard_config) ⚠️ **especial**
- `ClientePortalUsuario` — login do portal do cliente
- `FornecedorAcesso` — credencial para portal do fornecedor
- `TokenClienteOportunidade` — token de acesso temporário para clientes verem oportunidade

### Permissões & Auditoria (5)
- `PermissaoDetalhada` — catálogo de permissões por módulo/ação
- `PerfilPermissao` — perfis customizados com JSON de permissões
- `NivelAprovacao` — níveis de alçada por valor e tipo
- `RegraAprovacao` — regras de quem aprova o quê
- `GestorAprovacao` — gestores cadastrados como aprovadores
- `AprovacaoSolicitacao` — registros de aprovação/rejeição
- `AuditLog` — log de auditoria geral

### CRM / Oportunidades (6)
- `Oportunidade` — pipeline comercial
- `StatusOportunidade` — colunas do funil (aberto/ganho/perdido)
- `OrigemOportunidade` — origem do lead
- `OportunidadeAtualizacao` — timeline de mudanças
- `ArquivoOportunidade` — anexos
- `TemplateOportunidade` — pré-preenchimento

### Projetos (5)
- `Projeto`
- `TarefaProjeto` — tarefas com hierarquia (tarefa_pai_id), responsáveis, dependências
- `CronogramaEtapa` — etapas de cronograma
- `DiarioObra` — diário de obra com clima, mão de obra, fotos
- `OrcamentoColunaConfig` — colunas customizáveis do orçamento

### Compras & Cotação (8)
- `SolicitacaoCompra` + `SolicitacaoCompraItem`
- `Cotacao` + `CotacaoItem` + `CotacaoResposta`
- `CotacaoFornecedor` — convite enviado ao fornecedor com token
- `ArquivoCotacaoFornecedor`
- `PedidoCompra` + `PedidoCompraItem`

### Estoque (6)
- `Material` + `CategoriaMaterial` + `UnidadeMedida`
- `Almoxarifado` + `AlmoxarifadoLocal`
- `EstoqueMovimento` (Entrada/Saída/Ajuste/Transferência)
- `EstoqueSaldo` — saldo materializado por material/almoxarifado
- `RetiradaEstoque` + `RetiradaEstoqueItem`
- `ReservaMaterial` — reserva para projeto ou caminhão
- `Kit` + `KitItem` — kits de materiais reutilizáveis

### Orçamento (2)
- `OrcamentoItem` — itens do orçamento (Material/Mão de Obra/Kit) com BDI e impostos
- `MaoDeObra` + `CategoriaMaoDeObra`

### Ferramental / EPI (10)
- `Ferramenta` — ferramentas/EPIs com manutenção programada, laudo, QR code
- `Ferramental` — entidade SEPARADA (categoria + estoque simples) ⚠️ **dupla, conferir**
- `EPI`
- `MovimentacaoFerramenta` — entrega/empréstimo/manutenção/baixa
- `EntregaFerramental` — entrega para funcionário/caminhão com biometria
- `LaudoFerramenta` — laudos técnicos
- `ManutencaoFerramenta` — preventiva/corretiva/preditiva
- `InspecaoFerramenta` + `InspecaoFerramental` + `InspecaoCampo` + `InspecaoCaminhao` + `InspecaoHistorico` ⚠️ **4 entidades de inspeção, conferir relação**
- `ChecklistInspecaoCampo` — modelos de checklist
- `FerramentaNota` — notas livres por ferramenta
- `InventarioHistorico` — histórico de inventários (com IA)

### Frota (2)
- `Caminhao`
- `CaminhaoCampoObrigatorio` — slots obrigatórios de ferramentas por caminhão

### RH / Segurança do Trabalho (4)
- `Funcionario` — cadastro completo (CPF, RG, PIS, dependentes, banco, raça, instrução, treinamentos, documentos, EPIs, biometria)
- `Funcao` — cargo, salário, modelos de EPIs/ferramentas/treinamentos
- `Treinamento` — NRs, responsável técnico, instrutor, engenheiro
- `DocumentoEmpresa` — PCMSO/PGR/Lista de Presença
- `Vencimento` — controle de vencimentos (CNDs, FGTS, PGR, ART, contratos, alvarás, etc)

### Financeiro (15)
- `ContaFinanceira` — banco/caixa/cartão com plano de contas hierárquico
- `CategoriaFinanceira` (Receita/Despesa, com hierarquia)
- `CentroCusto`
- `TransacaoFinanceira` (Receita/Despesa) + `TransacaoAnexo` + `TransacaoTransferencia`
- `TransacaoRecorrente` — geração automática
- `IntegracaoBancaria` — Open Finance / API / Scraping
- `UploadOFX` + `ExtratoBancario`
- `RegraConciliacao` — regras (com IA opcional)
- `PreLancamento` — comprovantes via WhatsApp/upload (com OCR via IA)
- `FechamentoCaixa` — fluxo de fundo fixo (3 papéis: fechamento → pagamento → reposição)
- `BoletoBancario` — emissão (Asaas, Gerencianet, bancos)
- `NotaFiscalDevolucao` — emissão NF-e (Focus NF-e)

### SaaS / Comercial (5)
- `Plano` + `Assinatura` + `Pagamento` (cobrança das empresas no SaaS)
- `PropostaComercial` — pré-venda

### Cadastros gerais (3)
- `Cliente`
- `Fornecedor`
- `Etiqueta`

### Notificações & Chat (4)
- `Notificacao` + `PreferenciaNotificacao`
- `CanalChat` + `MensagemChat`

### Relatórios (2)
- `RelatorioCustomizado`
- `HistoricoDocumentoAssinado`

## Padrões observados (importantes para o schema Postgres)

1. **Todas as entidades de domínio têm `empresa_id`** (multi-tenant via RLS) — EXCETO:
   - `User` (nativa Base44)
   - `Plano` (catálogo global)
   - `PermissaoDetalhada` (catálogo global)
   - `PerfilPermissao` (pode ser global ou por empresa)
   - `GrupoEmpresarial` (é o "tenant pai" das empresas)
   - `PropostaComercial`, `BoletoBancario` (lado SaaS, opcional)

2. **`id`, `created_date`, `updated_date`, `created_by_id`** em TODAS — mapeiam para `id uuid`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid references auth.users`.

3. **Soft delete via endpoint `/restore`** — implica que Base44 tem `deleted_at` por baixo. No Supabase fazemos `deleted_at timestamptz` + `restore()` na função SDK.

4. **Denormalização sistemática** — `cliente_nome` ao lado de `cliente_id`, `material_codigo` ao lado de `material_id`, etc. Vamos preservar via trigger (atualiza o `_nome` quando o `_id` muda).

5. **Arrays como JSON string** — `responsaveis_ids`, `etiquetas_ids`, `projetos_ids`, `arquivos_anexados`, `dependencias`, `pecas_substituidas`, `dependentes`, etc. Migrar para **`jsonb`** ou **`uuid[]`** dependendo do caso.

6. **Enums fortemente tipados** — Base44 documenta valores válidos. Migrar para **CHECK constraints** ou tipos ENUM nativos do Postgres.

7. **Hierarquia em algumas entidades:**
   - `ContaFinanceira.conta_pai_id` (plano de contas)
   - `CategoriaFinanceira.categoria_pai_id`
   - `TarefaProjeto.tarefa_pai_id` (subtarefas)

8. **Tokens/credenciais sensíveis** — `senha_hash`, `token_acesso`, `refresh_token`, `senha_acesso`. Manter como `text` mas **NUNCA expor em policies RLS**.

## Próximos passos

1. Reescrever `supabase/migrations/0001_*.sql` para cobrir os 100 schemas em ordem topológica (Empresa → UsuarioEmpresa → ... → dependentes).
2. Decidir destino da entidade `User` Base44: substituir 100% por Supabase Auth + `UsuarioCustom`?
3. Conferir relação entre `Ferramenta` ↔ `Ferramental` e entre as 4 entidades de Inspeção (`InspecaoCampo`, `InspecaoFerramenta`, `InspecaoFerramental`, `InspecaoCaminhao`).
4. Gerar tipos TypeScript via `supabase gen types typescript` depois das migrations.
