# Schema — modelo de dados conhecido

Documenta as entidades já mapeadas. **Fonte da verdade:** `supabase/migrations/`.

## Conhecidas (5 — do snapshot Base44)

### Ferramenta
Gerenciamento de ferramentas e EPIs. Multi-tenant via `empresa_id`. Suporta controle individual ou por quantidade. Tem regras de manutenção (intervalo dias/horas), laudo técnico, foto, QR code.

Relacionamentos: `funcionario_id`, `fornecedor_id`, `campo_obrigatorio_id` (→ `CaminhaoCampoObrigatorio`).

### HistoricoDocumentoAssinado
Auditoria de upload/assinatura de documentos por funcionário.

Relacionamentos: `funcionario_id`.

### Oportunidade
CRM de oportunidades/licitações. Multi-responsável (`responsaveis_ids` em JSON), etiquetas, dados de licitação (modalidade, datas, garantia), endereço.

Relacionamentos: `cliente_id`, `status_id`, `origem_id`, `responsavel_id`.

### ReservaMaterial
Reserva de material em estoque para projeto ou caminhão. Agrupa via `grupo_id` (várias linhas = uma reserva).

Relacionamentos: `material_id`, `almoxarifado_id`, `projeto_id`, `caminhao_id`, `solicitante_id`.

### SolicitacaoCompra
Pedido de compra com fluxo de aprovação. Pode vincular múltiplos projetos.

Relacionamentos: `projeto_id`, `projetos_ids` (JSON array), `oportunidade_id`, `solicitante_id`.

## Referenciadas no código mas SEM schema documentado (~25-30)

Nomes vistos nas 83 functions e nos componentes. Precisam ser exportadas via `tools/export-base44.mjs`:

- `UsuarioCustom`, `UsuarioEmpresa`, `ClientePortalUsuario`, `Empresa`, `GrupoEmpresarial`
- `Material`, `Almoxarifado`, `Estoque`, `Kit`
- `Projeto`, `Funcionario`, `Fornecedor`, `Cliente`
- `Caminhao`, `CaminhaoCampoObrigatorio`
- `Etiqueta`
- `TransacaoFinanceira`, `PreLancamento`, `ContaFinanceira`, `BoletoBancario`
- `Cotacao`, `CotacaoFornecedor`, `CotacaoResposta`, `PedidoCompra`
- `NotificacaoEmail`, `Notificacao`
- `AuditLog`
- `Treinamento`, `Certificado`, `Inspecao`
- ...e provavelmente mais

## Padrões de schema observados

- **Multi-tenant:** `empresa_id` em TODAS as tabelas (chave de RLS)
- **Denormalização:** campos `_nome` ao lado dos `_id` (ex: `cliente_id` + `cliente_nome`) — Base44 evita JOIN, vamos preservar via trigger no Postgres
- **Arrays JSON:** `responsaveis_ids`, `etiquetas_ids`, `projetos_ids` como strings JSON — vamos converter para `jsonb` ou `uuid[]`
- **Soft delete:** vários `ativo: boolean` e `arquivado: boolean`
- **Auditoria:** `created_at`, `updated_at` automáticos via Supabase (já default)

## RLS — política recomendada

Para cada tabela:

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_<tabela> ON <tabela>
  FOR ALL
  USING (empresa_id = (auth.jwt() ->> 'empresa_id')::uuid)
  WITH CHECK (empresa_id = (auth.jwt() ->> 'empresa_id')::uuid);
```

`empresa_id` no JWT é injetado pelo nosso fluxo de login customizado (Edge Function `login-custom` define claims após autenticar via Supabase Auth e resolver vínculos `UsuarioEmpresa`).
