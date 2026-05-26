# Schema — modelo de dados do SIGO Obras

**Fonte da verdade:** [`legacy/base44/SCHEMA-COMPLETO-API.md`](../legacy/base44/SCHEMA-COMPLETO-API.md) (100 entidades, copiado direto da API doc oficial do Base44 em 2026-05-24).

**Implementação alvo:** `supabase/migrations/*.sql`.

## Inventário rápido (100 entidades por domínio)

| Domínio                | # entidades | Entidades                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth & Multi-tenant    | 7           | Empresa, GrupoEmpresarial, UsuarioEmpresa, UsuarioCustom, User, ClientePortalUsuario, FornecedorAcesso, TokenClienteOportunidade                                                                                                                                          |
| Permissões & Auditoria | 7           | PermissaoDetalhada, PerfilPermissao, NivelAprovacao, RegraAprovacao, GestorAprovacao, AprovacaoSolicitacao, AuditLog                                                                                                                                                      |
| CRM / Oportunidades    | 6           | Oportunidade, StatusOportunidade, OrigemOportunidade, OportunidadeAtualizacao, ArquivoOportunidade, TemplateOportunidade                                                                                                                                                  |
| Projetos               | 5           | Projeto, TarefaProjeto, CronogramaEtapa, DiarioObra, OrcamentoColunaConfig                                                                                                                                                                                                |
| Compras & Cotação      | 9           | SolicitacaoCompra(+Item), Cotacao(+Item+Resposta+Fornecedor+Arquivo), PedidoCompra(+Item)                                                                                                                                                                                 |
| Estoque                | 10          | Material, Almoxarifado(+Local), EstoqueMovimento, EstoqueSaldo, RetiradaEstoque(+Item), ReservaMaterial, Kit(+Item)                                                                                                                                                       |
| Orçamento              | 2           | OrcamentoItem, MaoDeObra                                                                                                                                                                                                                                                  |
| Ferramental / EPI      | 15          | Ferramenta, Ferramental, EPI, MovimentacaoFerramenta, EntregaFerramental, LaudoFerramenta, ManutencaoFerramenta, FerramentaNota, ChecklistInspecaoCampo, InspecaoCampo, InspecaoFerramenta, InspecaoFerramental, InspecaoCaminhao, InspecaoHistorico, InventarioHistorico |
| Frota                  | 2           | Caminhao, CaminhaoCampoObrigatorio                                                                                                                                                                                                                                        |
| RH / SST               | 6           | Funcionario, Funcao, Treinamento, DocumentoEmpresa, Vencimento, HistoricoDocumentoAssinado                                                                                                                                                                                |
| Financeiro             | 13          | ContaFinanceira, CategoriaFinanceira, CentroCusto, TransacaoFinanceira(+Anexo+Transferencia+Recorrente), IntegracaoBancaria, UploadOFX, ExtratoBancario, RegraConciliacao, PreLancamento, FechamentoCaixa, BoletoBancario, NotaFiscalDevolucao                            |
| SaaS comercial         | 4           | Plano, Assinatura, Pagamento, PropostaComercial                                                                                                                                                                                                                           |
| Cadastros gerais       | 3           | Cliente, Fornecedor, Etiqueta                                                                                                                                                                                                                                             |
| Notificações & Chat    | 4           | Notificacao, PreferenciaNotificacao, CanalChat, MensagemChat                                                                                                                                                                                                              |
| Relatórios             | 1           | RelatorioCustomizado                                                                                                                                                                                                                                                      |
| Catálogos              | 3           | CategoriaMaterial, UnidadeMedida, CategoriaMaoDeObra                                                                                                                                                                                                                      |

**Total: 100 entidades.**

## Padrões globais a aplicar nas migrations

1. **`id uuid primary key default gen_random_uuid()`**
2. **`empresa_id uuid not null`** em todas EXCETO: `User`, `Plano`, `PermissaoDetalhada`, `PerfilPermissao` (quando global), `GrupoEmpresarial`, `PropostaComercial` (lado SaaS), `BoletoBancario` (lado SaaS).
3. **`created_at`, `updated_at`** automáticos. Trigger `set_updated_at()`.
4. **`deleted_at timestamptz`** + view `*_active` em vez de DELETE físico (preserva o `/restore`).
5. **Arrays JSON do Base44** (ex: `responsaveis_ids`, `etiquetas_ids`) viram `jsonb` ou `uuid[]`.
6. **Enums** (ex: `tipo_pessoa`, `status_*`) viram CHECK constraints com a lista exata documentada.
7. **Denormalização** (`*_nome` ao lado de `*_id`) via trigger que copia o nome quando o `_id` muda.
8. **RLS por `empresa_id`** habilitada após bootstrap (ver Fase 2).

## Pontos de atenção que precisam decisão

| Tema                              | Pergunta                                                                                                                                     | Sugestão                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **`User` Base44**                 | É a entidade nativa do Base44 (sem `empresa_id`, com `role`, `dashboard_config`). Substituir por Supabase Auth (`auth.users`)?               | Sim. Migrar `dashboard_config` e `telefone` para tabela `public.profiles` ligada a `auth.users.id`.                                |
| **`Ferramenta` vs `Ferramental`** | Existem 2 entidades. `Ferramenta` é completa (manutenção, laudo, QR); `Ferramental` é um catálogo simples (categoria+estoque). Confundem-se. | Confirmar no app: `Ferramental` pode ser legado/duplicado. Provavelmente migra só `Ferramenta`.                                    |
| **4 entidades de Inspeção**       | `InspecaoCampo`, `InspecaoFerramenta`, `InspecaoFerramental`, `InspecaoCaminhao` — uso distinto?                                             | Cada uma tem propósito separado (checklist EPI, ferramentas individuais, ferramental geral, ferramentas no caminhão). Manter as 4. |
| **Senhas plain-text em campos**   | `senha_acesso` em `FornecedorAcesso` é descrito como "senha gerada automaticamente". Está em plain?                                          | Migrar para hash bcrypt no cutover; nunca expor via RLS.                                                                           |
| **Tokens de integração**          | `token_acesso` em `ContaFinanceira` e `IntegracaoBancaria`                                                                                   | Mover para Vault do Supabase (`vault.secrets`) em vez de coluna comum.                                                             |
| **`SolicitacaoCompra.origem`**    | Doc diz `Manual, Orcamento, Estoque` (sem cedilha). Snapshot tinha `Orçamento`.                                                              | Conferir no banco real (export) qual valor está em uso.                                                                            |

## Status das migrations

| Arquivo                         | Cobertura                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `0001_entidades_conhecidas.sql` | **OBSOLETO** — 5 entidades. Vai ser substituído.                                                                                |
| `0002_*.sql` (a criar)          | Entidades base: GrupoEmpresarial, Empresa, UsuarioCustom, UsuarioEmpresa, ClientePortalUsuario, FornecedorAcesso, User/profiles |
| `0003_*.sql` (a criar)          | Permissões, AuditLog                                                                                                            |
| `0004_*.sql` (a criar)          | Cadastros (Cliente, Fornecedor, Etiqueta, Caminhao) e catálogos                                                                 |
| `0005_*.sql` (a criar)          | CRM (Oportunidade + dependentes)                                                                                                |
| `0006_*.sql` (a criar)          | Projetos + Tarefas + Cronograma                                                                                                 |
| `0007_*.sql` (a criar)          | Estoque (Material, Almoxarifado, Movimento, Saldo, Reserva, Retirada, Kit)                                                      |
| `0008_*.sql` (a criar)          | Compras (Solicitação → Cotação → Pedido)                                                                                        |
| `0009_*.sql` (a criar)          | Ferramental + Inspeções                                                                                                         |
| `0010_*.sql` (a criar)          | RH + Funcionário + Vencimentos                                                                                                  |
| `0011_*.sql` (a criar)          | Financeiro (contas, transações, recorrências, conciliação)                                                                      |
| `0012_*.sql` (a criar)          | PreLancamento + FechamentoCaixa + Boleto + NF-e                                                                                 |
| `0013_*.sql` (a criar)          | SaaS (Plano, Assinatura, Pagamento, Proposta)                                                                                   |
| `0014_*.sql` (a criar)          | Notificações + Chat + Relatórios                                                                                                |
| `0015_*.sql` (a criar)          | RLS habilitada + policies por `empresa_id`                                                                                      |

## Antes de gerar SQL

Rodar `npm run export:base44` ajuda a:

- Confirmar tipos reais dos campos (ex: se `empresa_id` é UUID ou string)
- Capturar valores reais de enums em uso
- Dimensionar volume por entidade
- Coletar todos os arquivos referenciados (storage)
