#!/usr/bin/env node
/**
 * export-base44.mjs
 *
 * Exporta TODAS as entidades + dados + arquivos do Base44 para a pasta local.
 *
 * Uso:
 *   cp .env.example .env  # preencha BASE44_APP_ID, BASE44_API_KEY, BASE44_APP_BASE_URL
 *   npm install
 *   npm run export:base44
 *
 * Saída:
 *   dump/_meta.json                 — metadados da execução (lista de entities, contagens)
 *   dump/<entidade>.json            — 1 arquivo por entidade, array completo
 *   dump/_files/<entidade>/<id>/... — arquivos baixados (foto_url, laudo_url, etc.)
 *
 * IMPORTANTE: dump/ está no .gitignore — não commitar dados produtivos.
 */

import { createClient } from "@base44/sdk";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

dotenv.config();

const {
  BASE44_APP_ID,
  BASE44_APP_BASE_URL,
  BASE44_API_KEY,
  BASE44_ENTITIES,
  DUMP_DIR = "./dump",
  DOWNLOAD_FILES = "true",
} = process.env;

if (!BASE44_APP_ID || !BASE44_API_KEY || !BASE44_APP_BASE_URL) {
  console.error("✗ Faltam vars no .env: BASE44_APP_ID, BASE44_API_KEY, BASE44_APP_BASE_URL");
  process.exit(1);
}

const PAGE_SIZE = 200;
const downloadFiles = DOWNLOAD_FILES === "true";
const dumpDir = path.resolve(DUMP_DIR);
const filesDir = path.join(dumpDir, "_files");

await fs.mkdir(dumpDir, { recursive: true });
if (downloadFiles) await fs.mkdir(filesDir, { recursive: true });

console.log("=== Base44 Export ===");
console.log("App ID:    ", BASE44_APP_ID);
console.log("Base URL:  ", BASE44_APP_BASE_URL);
console.log("Dump dir:  ", dumpDir);
console.log("Files:     ", downloadFiles ? "ON" : "OFF");
console.log("");

const base44 = createClient({
  appId: BASE44_APP_ID,
  token: BASE44_API_KEY,
  appBaseUrl: BASE44_APP_BASE_URL,
  requiresAuth: false,
});

// ---------------------------------------------------------------------------
// 1. Descobrir lista de entidades
// ---------------------------------------------------------------------------

async function discoverEntities() {
  if (BASE44_ENTITIES) {
    return BASE44_ENTITIES.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Lista COMPLETA das 100 entidades — extraída do schema oficial da API Base44
  // (ver legacy/base44/SCHEMA-COMPLETO-API.md). Ordem segue dependências:
  // tenants → catálogos → entidades de domínio → filhas/atualizações.
  return [
    // --- Multi-tenant / Auth (base) ---
    "GrupoEmpresarial",
    "Empresa",
    "UsuarioCustom",
    "UsuarioEmpresa",
    "ClientePortalUsuario",
    "FornecedorAcesso",
    "User",

    // --- Permissões / Auditoria ---
    "PermissaoDetalhada",
    "PerfilPermissao",
    "NivelAprovacao",
    "RegraAprovacao",
    "GestorAprovacao",
    "AprovacaoSolicitacao",
    "AuditLog",

    // --- Cadastros gerais ---
    "Cliente",
    "Fornecedor",
    "Etiqueta",
    "Caminhao",
    "CaminhaoCampoObrigatorio",

    // --- Catálogos ---
    "CategoriaMaterial",
    "UnidadeMedida",
    "CategoriaMaoDeObra",
    "CategoriaFinanceira",
    "CentroCusto",

    // --- CRM / Oportunidades ---
    "StatusOportunidade",
    "OrigemOportunidade",
    "TemplateOportunidade",
    "Oportunidade",
    "OportunidadeAtualizacao",
    "ArquivoOportunidade",
    "TokenClienteOportunidade",

    // --- Projetos ---
    "Projeto",
    "TarefaProjeto",
    "CronogramaEtapa",
    "DiarioObra",
    "OrcamentoColunaConfig",
    "OrcamentoItem",
    "MaoDeObra",

    // --- Estoque ---
    "Material",
    "Almoxarifado",
    "AlmoxarifadoLocal",
    "EstoqueMovimento",
    "EstoqueSaldo",
    "RetiradaEstoque",
    "RetiradaEstoqueItem",
    "ReservaMaterial",
    "Kit",
    "KitItem",

    // --- Compras ---
    "SolicitacaoCompra",
    "SolicitacaoCompraItem",
    "Cotacao",
    "CotacaoFornecedor",
    "CotacaoItem",
    "CotacaoResposta",
    "ArquivoCotacaoFornecedor",
    "PedidoCompra",
    "PedidoCompraItem",

    // --- Ferramental / EPI / Inspeções ---
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

    // --- RH / Segurança do Trabalho ---
    "Funcao",
    "Treinamento",
    "Funcionario",
    "HistoricoDocumentoAssinado",
    "DocumentoEmpresa",
    "Vencimento",

    // --- Financeiro ---
    "ContaFinanceira",
    "IntegracaoBancaria",
    "TransacaoFinanceira",
    "TransacaoAnexo",
    "TransacaoTransferencia",
    "TransacaoRecorrente",
    "UploadOFX",
    "ExtratoBancario",
    "RegraConciliacao",
    "PreLancamento",
    "FechamentoCaixa",
    "BoletoBancario",
    "NotaFiscalDevolucao",

    // --- SaaS comercial ---
    "Plano",
    "PropostaComercial",
    "Assinatura",
    "Pagamento",

    // --- Notificações / Chat / Relatórios ---
    "Notificacao",
    "PreferenciaNotificacao",
    "CanalChat",
    "MensagemChat",
    "RelatorioCustomizado",
  ];
}

// ---------------------------------------------------------------------------
// 2. Paginar entidade até esgotar
// ---------------------------------------------------------------------------

async function dumpEntity(name) {
  const entity = base44.asServiceRole.entities[name];
  if (!entity) {
    console.warn(`  ⚠ Entity ${name} não existe no SDK (talvez não exista no app)`);
    return { name, count: 0, skipped: true };
  }

  const all = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page += 1;
    let chunk;
    try {
      // Base44 SDK aceita filter() com paginação via skip/limit em algumas versões
      // ou cursor em outras. Tentamos a mais comum.
      chunk = await entity.list({ limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
    } catch (err) {
      console.warn(`  ⚠ Erro paginando ${name}:`, err.message);
      break;
    }

    if (!Array.isArray(chunk) || chunk.length === 0) break;
    all.push(...chunk);
    process.stdout.write(`  ${name}: ${all.length} registros\r`);

    if (chunk.length < PAGE_SIZE) break;
    if (page > 1000) {
      console.warn(`\n  ⚠ Stopping ${name} after 1000 pages (>200k records) for safety`);
      break;
    }
  }

  const outPath = path.join(dumpDir, `${name}.json`);
  await fs.writeFile(outPath, JSON.stringify(all, null, 2), "utf8");
  console.log(`  ✓ ${name}: ${all.length} registros → ${path.relative(process.cwd(), outPath)}`);

  return { name, count: all.length };
}

// ---------------------------------------------------------------------------
// 3. Baixar arquivos referenciados em campos *_url
// ---------------------------------------------------------------------------

const URL_FIELD_REGEX = /(url|arquivo|anexo|foto|laudo|documento|comprovante)/i;

async function downloadFilesForEntity(name) {
  if (!downloadFiles) return 0;

  const dumpPath = path.join(dumpDir, `${name}.json`);
  let records;
  try {
    records = JSON.parse(await fs.readFile(dumpPath, "utf8"));
  } catch {
    return 0;
  }

  let downloaded = 0;
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const id = rec.id || rec._id;
    if (!id) continue;

    const recDir = path.join(filesDir, name, String(id));

    for (const [field, value] of Object.entries(rec)) {
      if (!URL_FIELD_REGEX.test(field)) continue;
      if (typeof value !== "string") continue;
      if (!/^https?:\/\//i.test(value)) continue;

      try {
        const resp = await fetch(value);
        if (!resp.ok) {
          console.warn(`    ✗ ${name}/${id}/${field}: HTTP ${resp.status}`);
          continue;
        }
        await fs.mkdir(recDir, { recursive: true });
        const filename = path.basename(new URL(value).pathname) || `${field}.bin`;
        const outFile = path.join(recDir, `${field}__${filename}`);
        await pipeline(Readable.fromWeb(resp.body), (await fs.open(outFile, "w")).createWriteStream());
        downloaded += 1;
      } catch (err) {
        console.warn(`    ✗ ${name}/${id}/${field}:`, err.message);
      }
    }
  }
  if (downloaded) console.log(`  ⬇ ${name}: ${downloaded} arquivos baixados`);
  return downloaded;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

(async () => {
  const entities = await discoverEntities();
  console.log(`Vou tentar exportar ${entities.length} entidades:\n  ${entities.join(", ")}\n`);

  const results = [];
  for (const name of entities) {
    try {
      const r = await dumpEntity(name);
      results.push(r);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      results.push({ name, error: err.message });
    }
  }

  if (downloadFiles) {
    console.log("\n=== Baixando arquivos ===");
    let totalFiles = 0;
    for (const r of results) {
      if (r.error || r.skipped) continue;
      totalFiles += await downloadFilesForEntity(r.name);
    }
    console.log(`\nTotal arquivos baixados: ${totalFiles}`);
  }

  const meta = {
    exportedAt: new Date().toISOString(),
    appId: BASE44_APP_ID,
    entities: results,
    totalRecords: results.reduce((acc, r) => acc + (r.count || 0), 0),
  };
  await fs.writeFile(path.join(dumpDir, "_meta.json"), JSON.stringify(meta, null, 2), "utf8");

  console.log("\n=== RESUMO ===");
  console.log(`Entidades processadas: ${results.length}`);
  console.log(`Registros totais:      ${meta.totalRecords}`);
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.log(`Falhas:                ${failed.length}`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
  }
  console.log(`\nVeja: ${path.relative(process.cwd(), path.join(dumpDir, "_meta.json"))}`);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
