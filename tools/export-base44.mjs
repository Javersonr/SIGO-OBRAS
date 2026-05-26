#!/usr/bin/env node
/**
 * export-base44.mjs
 *
 * Exporta TODAS as entidades + dados + arquivos da plataforma anterior
 * (Base44 REST API) usando fetch direto com header `api_key`.
 *
 * O SDK oficial ignora silenciosamente o api_key passado via `headers`
 * (retorna [] em vez de erro), então usamos a REST API direto. Endpoint:
 *
 *   GET https://base44.app/api/apps/<APP_ID>/entities/<EntityName>?limit=N&skip=N
 *   Headers: { api_key: <ADMIN_KEY> }
 *
 * Uso:
 *   cp .env.example .env  # preencha BASE44_APP_ID, BASE44_API_KEY
 *   npm install
 *   npm run export:base44
 *
 * Saída:
 *   dump/_meta.json                 — metadados (lista de entities, contagens, falhas)
 *   dump/<entidade>.json            — 1 arquivo por entidade, array completo
 *   dump/_files/<entidade>/<id>/... — arquivos baixados de URLs em campos *_url
 *
 * IMPORTANTE: dump/ está no .gitignore — não commitar dados produtivos.
 */

import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

dotenv.config();

const {
  BASE44_APP_ID,
  BASE44_API_KEY,
  BASE44_SERVER_URL = "https://base44.app",
  BASE44_ENTITIES,
  DUMP_DIR = "./dump",
  DOWNLOAD_FILES = "true",
  CONCURRENCY = "4",
  RATE_DELAY_MS = "350", // delay entre requests pra entidades (evita 429)
  RESUME = "true", // pula entidades cujo .json já existe
  MAX_RETRIES = "6", // tentativas em 429 com backoff
} = process.env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!BASE44_APP_ID || !BASE44_API_KEY) {
  console.error("✗ Faltam vars no .env: BASE44_APP_ID e BASE44_API_KEY são obrigatórios");
  process.exit(1);
}

const PAGE_SIZE = 200;
const downloadFiles = DOWNLOAD_FILES === "true";
const fileConcurrency = Math.max(1, Number(CONCURRENCY) || 4);
const dumpDir = path.resolve(DUMP_DIR);
const filesDir = path.join(dumpDir, "_files");

await fs.mkdir(dumpDir, { recursive: true });
if (downloadFiles) await fs.mkdir(filesDir, { recursive: true });

console.log("=== Export da plataforma anterior ===");
console.log("App ID:    ", BASE44_APP_ID);
console.log("Server URL:", BASE44_SERVER_URL);
console.log("Dump dir:  ", dumpDir);
console.log("Files:     ", downloadFiles ? `ON (concurrency=${fileConcurrency})` : "OFF");
console.log("");

const apiBase = `${BASE44_SERVER_URL}/api/apps/${BASE44_APP_ID}/entities`;
const headers = { api_key: BASE44_API_KEY };

// ---------------------------------------------------------------------------
// 1. Lista de entidades (100 oficiais do schema)
// ---------------------------------------------------------------------------
function getEntitiesList() {
  if (BASE44_ENTITIES) {
    return BASE44_ENTITIES.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [
    // Multi-tenant / Auth
    "GrupoEmpresarial",
    "Empresa",
    "UsuarioCustom",
    "UsuarioEmpresa",
    "ClientePortalUsuario",
    "FornecedorAcesso",
    "User",
    // Permissões / Auditoria
    "PermissaoDetalhada",
    "PerfilPermissao",
    "NivelAprovacao",
    "RegraAprovacao",
    "GestorAprovacao",
    "AprovacaoSolicitacao",
    "AuditLog",
    // Cadastros gerais
    "Cliente",
    "Fornecedor",
    "Etiqueta",
    "Caminhao",
    "CaminhaoCampoObrigatorio",
    // Catálogos
    "CategoriaMaterial",
    "UnidadeMedida",
    "CategoriaMaoDeObra",
    "CategoriaFinanceira",
    "CentroCusto",
    // CRM / Oportunidades
    "StatusOportunidade",
    "OrigemOportunidade",
    "TemplateOportunidade",
    "Oportunidade",
    "OportunidadeAtualizacao",
    "ArquivoOportunidade",
    "TokenClienteOportunidade",
    // Projetos
    "Projeto",
    "TarefaProjeto",
    "CronogramaEtapa",
    "DiarioObra",
    "OrcamentoColunaConfig",
    "OrcamentoItem",
    "MaoDeObra",
    // Estoque
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
    // Compras
    "SolicitacaoCompra",
    "SolicitacaoCompraItem",
    "Cotacao",
    "CotacaoFornecedor",
    "CotacaoItem",
    "CotacaoResposta",
    "ArquivoCotacaoFornecedor",
    "PedidoCompra",
    "PedidoCompraItem",
    // Ferramental / Inspeções
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
    // RH / Segurança do Trabalho
    "Funcao",
    "Treinamento",
    "Funcionario",
    "HistoricoDocumentoAssinado",
    "DocumentoEmpresa",
    "Vencimento",
    // Financeiro
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
    // SaaS comercial
    "Plano",
    "PropostaComercial",
    "Assinatura",
    "Pagamento",
    // Notificações / Chat / Relatórios
    "Notificacao",
    "PreferenciaNotificacao",
    "CanalChat",
    "MensagemChat",
    "RelatorioCustomizado",
  ];
}

// ---------------------------------------------------------------------------
// 2. Fetch paginado de uma entidade
// ---------------------------------------------------------------------------
async function fetchPage(name, skip, limit) {
  const url = `${apiBase}/${encodeURIComponent(name)}?limit=${limit}&skip=${skip}`;
  const maxRetries = Number(MAX_RETRIES) || 6;
  let attempt = 0;
  while (true) {
    const r = await fetch(url, { headers });
    if (r.ok) {
      // Throttle bem suave entre requests pra evitar 429
      if (Number(RATE_DELAY_MS) > 0) await sleep(Number(RATE_DELAY_MS));
      return r.json();
    }
    if (r.status === 429 && attempt < maxRetries) {
      attempt += 1;
      // Backoff exponencial: 2, 4, 8, 16, 32, 60 s
      const wait = Math.min(60_000, 2000 * 2 ** (attempt - 1));
      process.stdout.write(
        `\n  ⏳ ${name}: 429, aguardando ${wait / 1000}s (tentativa ${attempt}/${maxRetries})...\n`
      );
      await sleep(wait);
      continue;
    }
    const body = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText} :: ${body.slice(0, 200)}`);
  }
}

async function dumpEntity(name) {
  // Modo resume: se já tem o .json salvo (e não está vazio array []), pula
  const outPath = path.join(dumpDir, `${name}.json`);
  if (RESUME === "true") {
    try {
      const existing = await fs.readFile(outPath, "utf8");
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed)) {
        console.log(
          `  ↩ ${name.padEnd(35)} ${String(parsed.length).padStart(6)} registros (cached, pulado)`
        );
        return { name, count: parsed.length, cached: true };
      }
    } catch {
      /* arquivo não existe, segue */
    }
  }

  const all = [];
  let skip = 0;

  for (let page = 0; ; page += 1) {
    let chunk;
    try {
      chunk = await fetchPage(name, skip, PAGE_SIZE);
    } catch (err) {
      // Se a entidade não existe, a API costuma devolver 404 ou 400.
      // Aborta esta entidade mas não pra o export inteiro.
      if (/HTTP 4(00|04)/.test(err.message)) {
        return { name, count: 0, skipped: true, reason: err.message.split("::")[0].trim() };
      }
      throw err;
    }

    if (!Array.isArray(chunk)) {
      // API pode devolver { data: [...], total: N } em algumas versões
      if (chunk && Array.isArray(chunk.data)) chunk = chunk.data;
      else break;
    }
    if (chunk.length === 0) break;

    all.push(...chunk);
    process.stdout.write(`  ${name}: ${all.length} registros\r`);

    if (chunk.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    if (page > 1000) {
      console.warn(`\n  ⚠ Stopping ${name} after 1000 pages (>200k records) for safety`);
      break;
    }
  }

  await fs.writeFile(outPath, JSON.stringify(all, null, 2), "utf8");
  console.log(`  ✓ ${name.padEnd(35)} ${String(all.length).padStart(6)} registros`);
  return { name, count: all.length };
}

// ---------------------------------------------------------------------------
// 3. Download de arquivos (campos *_url, *_arquivo, *_foto, etc.)
// ---------------------------------------------------------------------------
const URL_FIELD_REGEX = /(url|arquivo|anexo|foto|laudo|documento|comprovante)/i;

async function downloadOne(entityName, id, field, value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    const resp = await fetch(value);
    if (!resp.ok) return false;
    const recDir = path.join(filesDir, entityName, String(id));
    await fs.mkdir(recDir, { recursive: true });
    const filename = path.basename(new URL(value).pathname) || `${field}.bin`;
    const outFile = path.join(recDir, `${field}__${filename}`);
    const fh = await fs.open(outFile, "w");
    await pipeline(Readable.fromWeb(resp.body), fh.createWriteStream());
    await fh.close().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function downloadFilesForEntity(name) {
  if (!downloadFiles) return 0;
  const dumpPath = path.join(dumpDir, `${name}.json`);
  let records;
  try {
    records = JSON.parse(await fs.readFile(dumpPath, "utf8"));
  } catch {
    return 0;
  }

  // Coleta todos os jobs primeiro
  const jobs = [];
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const id = rec.id || rec._id;
    if (!id) continue;
    for (const [field, value] of Object.entries(rec)) {
      if (!URL_FIELD_REGEX.test(field)) continue;
      if (typeof value === "string") jobs.push({ id, field, value });
      else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === "string")
            jobs.push({ id, field: `${field}_${i}`, value: value[i] });
        }
      }
    }
  }
  if (jobs.length === 0) return 0;

  // Pool de concorrência
  let done = 0;
  let downloaded = 0;
  let idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      const my = idx++;
      const j = jobs[my];
      const ok = await downloadOne(name, j.id, j.field, j.value);
      if (ok) downloaded++;
      done++;
      if (done % 10 === 0)
        process.stdout.write(`  ⬇ ${name}: ${downloaded}/${done}/${jobs.length}\r`);
    }
  }
  const workers = Array.from({ length: fileConcurrency }, worker);
  await Promise.all(workers);

  if (downloaded)
    console.log(
      `  ⬇ ${name.padEnd(35)} ${String(downloaded).padStart(4)} arquivos baixados (de ${jobs.length})`
    );
  return downloaded;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
const t0 = Date.now();
const entities = getEntitiesList();
console.log(`Tentando exportar ${entities.length} entidades...\n`);

const results = [];
for (const name of entities) {
  try {
    const r = await dumpEntity(name);
    results.push(r);
  } catch (err) {
    console.error(`  ✗ ${name.padEnd(35)} ERRO: ${err.message}`);
    results.push({ name, error: err.message });
  }
}

if (downloadFiles) {
  console.log("\n=== Baixando arquivos referenciados ===");
  let totalFiles = 0;
  for (const r of results) {
    if (r.error || r.skipped) continue;
    if (!r.count) continue;
    totalFiles += await downloadFilesForEntity(r.name);
  }
  console.log(`\nTotal arquivos baixados: ${totalFiles}`);
}

const meta = {
  exportedAt: new Date().toISOString(),
  appId: BASE44_APP_ID,
  serverUrl: BASE44_SERVER_URL,
  durationMs: Date.now() - t0,
  totalEntities: results.length,
  totalRecords: results.reduce((acc, r) => acc + (r.count || 0), 0),
  entities: results,
};
await fs.writeFile(path.join(dumpDir, "_meta.json"), JSON.stringify(meta, null, 2), "utf8");

console.log("\n=== RESUMO ===");
console.log(`Entidades processadas:  ${results.length}`);
console.log(`Registros totais:       ${meta.totalRecords.toLocaleString("pt-BR")}`);
console.log(`Duração:                ${(meta.durationMs / 1000).toFixed(1)}s`);

const erros = results.filter((r) => r.error);
const vazios = results.filter((r) => !r.error && !r.skipped && (r.count || 0) === 0);
const skipados = results.filter((r) => r.skipped);

if (erros.length) {
  console.log(`\nFalhas: ${erros.length}`);
  for (const f of erros) console.log(`  ✗ ${f.name}: ${f.error}`);
}
if (skipados.length) {
  console.log(`\nNão existem no app (404/400): ${skipados.length}`);
  for (const f of skipados) console.log(`  - ${f.name} (${f.reason || "skipped"})`);
}
if (vazios.length) {
  console.log(`\nVazios (0 registros): ${vazios.length}`);
  for (const f of vazios) console.log(`  - ${f.name}`);
}

console.log(`\nVeja: ${path.relative(process.cwd(), path.join(dumpDir, "_meta.json"))}`);
