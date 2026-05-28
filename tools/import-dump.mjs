#!/usr/bin/env node
/**
 * import-dump.mjs — importa os JSONs do dump da plataforma anterior pro Supabase
 *
 * Funcionamento:
 *   1. Lê os 100 arquivos em tools/dump/*.json (export do export-legacy.mjs)
 *   2. Converte IDs hex de 24 chars (Base44) → UUIDs determinísticos via
 *      padding de 8 zeros (`abc...xyz` → `00000000-abc...xyz` formatado).
 *      Mesmo input sempre gera mesmo output → FKs resolvem sozinhas, sem
 *      mapping table.
 *   3. Aliasa campos legados: created_date→created_at, updated_date→updated_at
 *   4. Detecta e converte strings JSONB pra objeto
 *   5. Insere em ORDEM TOPOLÓGICA (pais antes de filhos) pra FKs validarem
 *   6. Usa onConflict 'id' (upsert) — re-rodar é seguro, sobrescreve dados
 *
 * Uso:
 *   cd tools
 *   cp .env.example .env   # se ainda não tem
 *   # adicione SUPABASE_SERVICE_ROLE_KEY no .env
 *   npm install
 *   DRY_RUN=true npm run import:dump   # mostra o que faria, sem escrever
 *   npm run import:dump                # de fato importa
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL                — obrigatório (do .env do tools)
 *   SUPABASE_SERVICE_ROLE_KEY   — obrigatório (bypass RLS pra importar)
 *   DUMP_DIR                    — default ./dump
 *   DRY_RUN                     — true = não escreve, só lê e valida
 *   ENTITIES                    — limita a entidades específicas (csv)
 *   BATCH_SIZE                  — default 100 (registros por upsert)
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DUMP_DIR = "./dump",
  DRY_RUN = "false",
  ENTITIES,
  BATCH_SIZE = "100",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ Faltam vars no .env: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dryRun = DRY_RUN === "true";
const batchSize = Math.max(1, Number(BATCH_SIZE) || 100);
const dumpDir = path.resolve(DUMP_DIR);
const filter = ENTITIES ? new Set(ENTITIES.split(",").map((s) => s.trim())) : null;

console.log("=== Import dump → Supabase ===");
console.log("Supabase:    ", SUPABASE_URL);
console.log("Dump dir:    ", dumpDir);
console.log("Mode:        ", dryRun ? "🔍 DRY RUN (sem escrever)" : "💾 GRAVANDO");
console.log("Batch size:  ", batchSize);
if (filter) console.log("Filter:      ", [...filter].join(", "));
console.log("");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================================
// Conversão Base44 ID (24 hex) → UUID determinístico
// ============================================================================
function base44IdToUuid(legacyId) {
  if (!legacyId) return null;
  const str = String(legacyId);

  // Já é UUID? passa direto
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str.toLowerCase();
  }

  // Base44 ID: 24 hex chars → pad 8 zeros → format UUID
  if (/^[0-9a-f]{24}$/i.test(str)) {
    const padded = str.padStart(32, "0");
    return (
      padded.slice(0, 8) +
      "-" +
      padded.slice(8, 12) +
      "-" +
      padded.slice(12, 16) +
      "-" +
      padded.slice(16, 20) +
      "-" +
      padded.slice(20, 32)
    ).toLowerCase();
  }

  // Formato desconhecido
  return null;
}

// ============================================================================
// Mapeamento Entity (PascalCase) → tabela (snake_case)
// ============================================================================
const ENTITY_TO_TABLE = {
  GrupoEmpresarial: "grupo_empresarial",
  Empresa: "empresa",
  UsuarioCustom: "usuario_custom",
  UsuarioEmpresa: "usuario_empresa",
  ClientePortalUsuario: "cliente_portal_usuario",
  FornecedorAcesso: "fornecedor_acesso",
  User: null, // entidade nativa Base44, ignorada (usa Supabase Auth)
  PermissaoDetalhada: "permissao_detalhada",
  PerfilPermissao: "perfil_permissao",
  NivelAprovacao: "nivel_aprovacao",
  RegraAprovacao: null, // dropada na migration 0017
  GestorAprovacao: null, // dropada na migration 0017
  AprovacaoSolicitacao: "aprovacao_solicitacao",
  AuditLog: "audit_log",
  Cliente: "cliente",
  Fornecedor: "fornecedor",
  Etiqueta: "etiqueta",
  Caminhao: "caminhao",
  CaminhaoCampoObrigatorio: "caminhao_campo_obrigatorio",
  CategoriaMaterial: "categoria_material",
  UnidadeMedida: "unidade_medida",
  CategoriaMaoDeObra: "categoria_mao_de_obra",
  CategoriaFinanceira: "categoria_financeira",
  CentroCusto: "centro_custo",
  StatusOportunidade: "status_oportunidade",
  OrigemOportunidade: "origem_oportunidade",
  TemplateOportunidade: "template_oportunidade",
  Oportunidade: "oportunidade",
  OportunidadeAtualizacao: "oportunidade_atualizacao",
  ArquivoOportunidade: "arquivo_oportunidade",
  TokenClienteOportunidade: "token_cliente_oportunidade",
  Projeto: "projeto",
  TarefaProjeto: "tarefa_projeto",
  CronogramaEtapa: "cronograma_etapa",
  DiarioObra: "diario_obra",
  OrcamentoColunaConfig: "orcamento_coluna_config",
  OrcamentoItem: "orcamento_item",
  MaoDeObra: "mao_de_obra",
  Material: "material",
  Almoxarifado: "almoxarifado",
  AlmoxarifadoLocal: "almoxarifado_local",
  EstoqueMovimento: "estoque_movimento",
  EstoqueSaldo: "estoque_saldo",
  RetiradaEstoque: "retirada_estoque",
  RetiradaEstoqueItem: "retirada_estoque_item",
  ReservaMaterial: "reserva_material",
  Kit: "kit",
  KitItem: "kit_item",
  SolicitacaoCompra: "solicitacao_compra",
  SolicitacaoCompraItem: "solicitacao_compra_item",
  Cotacao: "cotacao",
  CotacaoFornecedor: "cotacao_fornecedor",
  CotacaoItem: "cotacao_item",
  CotacaoResposta: "cotacao_resposta",
  ArquivoCotacaoFornecedor: null, // dropada na migration 0017
  PedidoCompra: "pedido_compra",
  PedidoCompraItem: "pedido_compra_item",
  Ferramenta: "ferramenta",
  Ferramental: "ferramental",
  EPI: "epi",
  MovimentacaoFerramenta: "movimentacao_ferramenta",
  EntregaFerramental: "entrega_ferramental",
  LaudoFerramenta: "laudo_ferramenta",
  ManutencaoFerramenta: "manutencao_ferramenta",
  FerramentaNota: "ferramenta_nota",
  ChecklistInspecaoCampo: "checklist_inspecao_campo",
  InspecaoCampo: "inspecao_campo",
  InspecaoFerramenta: "inspecao_ferramenta",
  InspecaoFerramental: "inspecao_ferramental",
  InspecaoCaminhao: "inspecao_caminhao",
  InspecaoHistorico: "inspecao_historico",
  InventarioHistorico: "inventario_historico",
  Funcao: "funcao",
  Treinamento: "treinamento",
  Funcionario: "funcionario",
  HistoricoDocumentoAssinado: "historico_documento_assinado",
  DocumentoEmpresa: "documento_empresa",
  Vencimento: "vencimento",
  ContaFinanceira: "conta_financeira",
  IntegracaoBancaria: "integracao_bancaria",
  TransacaoFinanceira: "transacao_financeira",
  TransacaoAnexo: "transacao_anexo",
  TransacaoTransferencia: "transacao_transferencia",
  TransacaoRecorrente: "transacao_recorrente",
  UploadOFX: "upload_ofx",
  ExtratoBancario: "extrato_bancario",
  RegraConciliacao: "regra_conciliacao",
  PreLancamento: "pre_lancamento",
  FechamentoCaixa: "fechamento_caixa",
  BoletoBancario: "boleto_bancario",
  NotaFiscalDevolucao: "nota_fiscal_devolucao",
  Plano: "plano",
  PropostaComercial: "proposta_comercial",
  Assinatura: "assinatura",
  Pagamento: "pagamento",
  Notificacao: "notificacao",
  PreferenciaNotificacao: "preferencia_notificacao",
  CanalChat: "canal_chat",
  MensagemChat: "mensagem_chat",
  RelatorioCustomizado: "relatorio_customizado",
};

// ============================================================================
// Ordem topológica: pais antes de filhos pra FKs validarem
// ============================================================================
const INSERT_ORDER = [
  // 1. Tenant root
  "GrupoEmpresarial",
  "Empresa",
  // 2. Users e Auth
  "UsuarioCustom",
  "UsuarioEmpresa",
  "ClientePortalUsuario",
  "FornecedorAcesso",
  // 3. Permissões + Auditoria
  "PermissaoDetalhada",
  "PerfilPermissao",
  "NivelAprovacao",
  "AuditLog",
  // 4. Catálogos
  "CategoriaMaterial",
  "UnidadeMedida",
  "CategoriaMaoDeObra",
  "CategoriaFinanceira",
  "CentroCusto",
  // 5. Cadastros
  "Cliente",
  "Fornecedor",
  "Etiqueta",
  "Caminhao",
  "CaminhaoCampoObrigatorio",
  // 6. RH
  "Funcao",
  "Treinamento",
  "Funcionario",
  "DocumentoEmpresa",
  "Vencimento",
  "HistoricoDocumentoAssinado",
  // 7. Financeiro (contas antes de transações)
  "ContaFinanceira",
  "IntegracaoBancaria",
  "ExtratoBancario",
  "UploadOFX",
  "RegraConciliacao",
  // 8. CRM
  "StatusOportunidade",
  "OrigemOportunidade",
  "TemplateOportunidade",
  "Oportunidade",
  "OportunidadeAtualizacao",
  "ArquivoOportunidade",
  "TokenClienteOportunidade",
  // 9. Projetos
  "Projeto",
  "TarefaProjeto",
  "CronogramaEtapa",
  "DiarioObra",
  "OrcamentoColunaConfig",
  "OrcamentoItem",
  "MaoDeObra",
  // 10. Estoque
  "Almoxarifado",
  "AlmoxarifadoLocal",
  "Material",
  "EstoqueSaldo",
  "EstoqueMovimento",
  "ReservaMaterial",
  "RetiradaEstoque",
  "RetiradaEstoqueItem",
  "Kit",
  "KitItem",
  // 11. Compras
  "SolicitacaoCompra",
  "SolicitacaoCompraItem",
  "Cotacao",
  "CotacaoFornecedor",
  "CotacaoItem",
  "CotacaoResposta",
  "PedidoCompra",
  "PedidoCompraItem",
  "AprovacaoSolicitacao",
  // 12. Ferramental
  "Ferramenta",
  "Ferramental",
  "EPI",
  "MovimentacaoFerramenta",
  "EntregaFerramental",
  "LaudoFerramenta",
  "ManutencaoFerramenta",
  "FerramentaNota",
  "ChecklistInspecaoCampo",
  "InspecaoCampo",
  "InspecaoFerramenta",
  "InspecaoFerramental",
  "InspecaoCaminhao",
  "InspecaoHistorico",
  "InventarioHistorico",
  // 13. Financeiro transacional (depois de Cliente, Fornecedor, Projeto)
  "TransacaoFinanceira",
  "TransacaoAnexo",
  "TransacaoTransferencia",
  "TransacaoRecorrente",
  "PreLancamento",
  "FechamentoCaixa",
  "BoletoBancario",
  "NotaFiscalDevolucao",
  // 14. SaaS
  "Plano",
  "PropostaComercial",
  "Assinatura",
  "Pagamento",
  // 15. Notificações, Chat, Relatórios
  "Notificacao",
  "PreferenciaNotificacao",
  "CanalChat",
  "MensagemChat",
  "RelatorioCustomizado",
];

// ============================================================================
// Campos a ignorar/transformar do dump original
// ============================================================================
const IGNORE_FIELDS = new Set([
  "is_sample", // flag interna Base44
  "created_by", // email do criador (Base44) — pode reaparecer como text
  "created_by_id", // referência interna (campo no Base44 que aponta pro User)
]);

// Campos generated/computed por tabela — não dá pra inserir, Postgres calcula
const GENERATED_FIELDS_BY_TABLE = {
  estoque_saldo: new Set(["quantidade_disponivel"]),
};

const FIELD_ALIASES = {
  created_date: "created_at",
  updated_date: "updated_at",
};

// Campos JSONB no schema Supabase (do seed-from-xlsx.mjs original)
const JSONB_FIELDS = new Set([
  "responsaveis_ids",
  "responsaveis_nomes",
  "responsaveis_emails",
  "etiquetas_ids",
  "projetos_ids",
  "projetos_nomes",
  "permissoes",
  "permissoes_json",
  "tema_cores",
  "dependentes",
  "modulos_liberados",
  "campos_padrao",
  "recursos",
  "preferencias",
  "dados_extraidos",
  "dados_anteriores",
  "dados_novos",
  "itens",
  "itens_inspecao",
  "ferramentas_inspecionadas",
  "ferramentas_obrigatorias",
  "ferramenta_ids",
  "pre_lancamentos_ids",
  "anexos",
  "fotos",
  "arquivos_anexados",
  "modelo_epi",
  "modelo_ferramentas",
  "modelo_treinamentos",
  "modelo_autorizacao_formal_opcoes",
  "abas_liberadas",
  "perfis_aprovadores",
  "niveis_ids",
  "documentos_pessoais",
  "documentos_obrigatorios",
  "documentos_rh_estruturados",
  "documentos_demissionais",
  "treinamentos_anexos",
  "ferramentais_anexos",
  "epis_anexos",
  "documentos_rh_anexos",
  "ordem_servicos_anexos",
  "autorizacao_formal_anexos",
  "direito_recusa_anexos",
  "filtros",
  "metricas",
  "configuracao_grafico",
  "config",
  "erros",
  "parcelas",
  "mao_de_obra",
  "campos_customizados",
  "opcoes",
  "categorias",
  "tags",
  "dados_extra",
  "lida_por",
  "mencoes",
  "participantes",
  "participantes_emails",
  "dependencias",
  "pecas_substituidas",
  "fornecedores_convidados",
  "imagens",
  "fotos_evidencia",
  "fornecedores_emails",
  "fornecedores_ids",
  "materiais_inclusos",
]);

// ============================================================================
// Transforma 1 registro do dump pro formato da tabela Supabase
// ============================================================================
function transformRecord(record, tableName = null) {
  const out = {};
  const genFields = tableName ? GENERATED_FIELDS_BY_TABLE[tableName] : null;

  for (const [key, val] of Object.entries(record)) {
    if (IGNORE_FIELDS.has(key)) continue;
    if (genFields && genFields.has(key)) continue; // pula colunas geradas

    // Alias de campo
    const dstKey = FIELD_ALIASES[key] || key;

    // ID principal
    if (dstKey === "id") {
      const uuid = base44IdToUuid(val);
      if (uuid) out.id = uuid;
      continue;
    }

    // FK (qualquer campo terminando em _id)
    if (dstKey.endsWith("_id") && typeof val === "string") {
      const uuid = base44IdToUuid(val);
      out[dstKey] = uuid; // pode ser null se não bater no formato
      continue;
    }

    // JSONB — Base44 pode ter mandado como string serializada
    if (JSONB_FIELDS.has(dstKey) && typeof val === "string") {
      try {
        out[dstKey] = JSON.parse(val);
      } catch {
        out[dstKey] = val;
      }
      continue;
    }

    // Vazio → null
    if (val === "" || val === undefined) {
      out[dstKey] = null;
      continue;
    }

    out[dstKey] = val;
  }

  return out;
}

// ============================================================================
// Insere uma entidade em batches
// ============================================================================
async function importEntity(entityName) {
  const tableName = ENTITY_TO_TABLE[entityName];
  if (!tableName) {
    console.log(`  ⊘ ${entityName.padEnd(30)} (sem tabela alvo — ignorado)`);
    return { entity: entityName, skipped: true, reason: "no_target_table" };
  }

  const jsonPath = path.join(dumpDir, `${entityName}.json`);
  let records;
  try {
    records = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  } catch (err) {
    console.log(`  ⚠ ${entityName.padEnd(30)} dump file missing/illegal: ${err.message}`);
    return { entity: entityName, error: "no_dump_file" };
  }

  if (!Array.isArray(records) || records.length === 0) {
    console.log(`  ◌ ${entityName.padEnd(30)} (vazio)`);
    return { entity: entityName, count: 0 };
  }

  // Transform all records
  let transformed = records.map((r) => transformRecord(r, tableName)).filter((r) => r.id);

  // Dedupe por id (em caso de duplicatas no dump)
  const seenIds = new Set();
  transformed = transformed.filter((r) => {
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });

  if (dryRun) {
    console.log(
      `  🔍 ${entityName.padEnd(30)} → ${tableName.padEnd(35)} ${String(transformed.length).padStart(5)} regs (dry)`
    );
    return { entity: entityName, table: tableName, count: transformed.length, dry: true };
  }

  // Upsert em batches
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < transformed.length; i += batchSize) {
    const batch = transformed.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

    if (error) {
      failed += batch.length;
      console.log(`    ✗ batch ${i}-${i + batch.length}: ${error.message?.slice(0, 120)}`);
    } else {
      inserted += batch.length;
    }
  }

  const symbol = failed === 0 ? "✓" : "⚠";
  console.log(
    `  ${symbol} ${entityName.padEnd(30)} → ${tableName.padEnd(35)} ${String(inserted).padStart(5)}/${transformed.length}` +
      (failed > 0 ? ` (${failed} falharam)` : "")
  );
  return { entity: entityName, table: tableName, count: inserted, failed };
}

// ============================================================================
// MAIN
// ============================================================================
const t0 = Date.now();
const results = [];

const toProcess = filter ? INSERT_ORDER.filter((e) => filter.has(e)) : INSERT_ORDER;

console.log(`Processando ${toProcess.length} entidades em ordem topológica...\n`);

for (const entityName of toProcess) {
  try {
    const r = await importEntity(entityName);
    results.push(r);
  } catch (err) {
    console.error(`  ✗ ${entityName} EXCEPTION: ${err.message}`);
    results.push({ entity: entityName, error: err.message });
  }
}

const duration = ((Date.now() - t0) / 1000).toFixed(1);
const totalInserted = results.reduce((acc, r) => acc + (r.count || 0), 0);
const totalFailed = results.reduce((acc, r) => acc + (r.failed || 0), 0);
const entitiesProcessed = results.filter((r) => !r.error && !r.skipped).length;

console.log("\n=== RESUMO ===");
console.log(`Entidades processadas:  ${entitiesProcessed}`);
console.log(`Total inseridos:        ${totalInserted.toLocaleString("pt-BR")}`);
console.log(`Falhas:                 ${totalFailed}`);
console.log(`Duração:                ${duration}s`);
if (dryRun) console.log("\n🔍 DRY RUN — nada foi gravado. Rode sem DRY_RUN pra commitar.");
