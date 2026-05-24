#!/usr/bin/env node
/**
 * seed-from-xlsx.mjs
 *
 * Importa o backup multi-empresa `backup_todas_empresas_*.xlsx` (Base44)
 * para o Supabase. Cada aba do xlsx tem o padrão "<NomeEmpresa>_<NomeEntidade>".
 *
 * O script:
 *   1. Lê todas as abas, agrupa por empresa
 *   2. Cria/atualiza GrupoEmpresarial (se houver) + Empresa
 *   3. Faz upsert dos demais registros mapeando empresa_nome → empresa_id real
 *   4. Preserva os IDs originais do Base44 (campo `id`) para integridade FK
 *
 * Uso:
 *   cp .env.example .env  # preencha SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   npm install
 *   XLSX_PATH=/caminho/para/backup.xlsx npm run seed:from-xlsx
 *
 * Pode ser rodado contra Supabase local (`supabase start`) ou hosted.
 *
 * ATENÇÃO:
 *   - Use SERVICE_ROLE_KEY (bypass RLS) — NUNCA exponha essa chave
 *   - Rodar antes de aplicar 0014_rls_policies.sql, OU usar service role
 *   - Backup contém dados produtivos — não commitar exports nem dumps
 */

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  XLSX_PATH = "./backup.xlsx",
  DRY_RUN = "false",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const xlsxPath = path.resolve(XLSX_PATH);
try {
  await fs.access(xlsxPath);
} catch {
  console.error(`✗ Arquivo não encontrado: ${xlsxPath}`);
  process.exit(1);
}

const dryRun = DRY_RUN === "true";
console.log("=== Seed from XLSX ===");
console.log("Supabase:", SUPABASE_URL);
console.log("XLSX:    ", xlsxPath);
console.log("Dry run: ", dryRun);
console.log("");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Mapa: nome de aba (do xlsx) → nome da tabela no Postgres
// ---------------------------------------------------------------------------
// As abas vêm truncadas em ~15 caracteres pelo Excel, então usamos o
// prefixo após o '_' como chave. Veja README para a lista completa.
const ABA_TO_TABLE = {
  "Usuários de Em": "usuario_empresa",
  "Assinaturas": "assinatura",
  "Oportunidades": "oportunidade",
  "Pré-Lançamento": "pre_lancamento",
  "Funcionários": "funcionario",
  "Clientes": "cliente",
  "Fornecedores": "fornecedor",
  "Projetos": "projeto",
  "Transações Fin": "transacao_financeira",
  "Contas Finance": "conta_financeira",
  "Categorias Fin": "categoria_financeira",
  "Solicitações d": "solicitacao_compra",
  "Cotações": "cotacao",
  "Almoxarifados": "almoxarifado",
  "Movimentos de": "estoque_movimento",
  "Ferramentais": "ferramental",
  "Materiais": "material",
  "Centros de Cus": "centro_custo",
  "Extrato Bancár": "extrato_bancario",
  "Diário de Obra": "diario_obra",
};

// ---------------------------------------------------------------------------
// Parse: extrai empresa e entidade do nome da aba
// ---------------------------------------------------------------------------
function parseSheetName(name) {
  const idx = name.lastIndexOf("_");
  if (idx === -1) return null;
  const empresaPrefix = name.slice(0, idx).trim();
  const entidadeKey = name.slice(idx + 1).trim();
  const tabela = ABA_TO_TABLE[entidadeKey];
  if (!tabela) return null;
  return { empresaPrefix, entidadeKey, tabela };
}

// ---------------------------------------------------------------------------
// Lê uma aba como array de objetos {col: valor}
// ---------------------------------------------------------------------------
function rowsToObjects(worksheet) {
  const headers = [];
  worksheet.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value || "").trim();
  });
  const rows = [];
  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    row.eachCell((cell, col) => {
      const key = headers[col];
      if (!key) return;
      let value = cell.value;
      // ExcelJS pode devolver datas como Date e fórmulas como objeto
      if (value && typeof value === "object" && "result" in value) {
        value = value.result;
      }
      if (value === undefined) value = null;
      obj[key] = value;
    });
    rows.push(obj);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Normaliza campos vazios para null e converte jsonb-strings para objetos
// ---------------------------------------------------------------------------
const JSONB_FIELDS = new Set([
  "responsaveis_ids", "responsaveis_nomes", "responsaveis_emails",
  "etiquetas_ids", "projetos_ids", "projetos_nomes",
  "permissoes", "permissoes_json", "tema_cores", "dependentes",
  "modulos_liberados", "campos_padrao", "recursos", "preferencias",
  "dados_extraidos", "dados_anteriores", "dados_novos",
  "itens", "itens_inspecao", "ferramentas_inspecionadas",
  "ferramentas_obrigatorias", "ferramenta_ids", "pre_lancamentos_ids",
  "anexos", "fotos", "arquivos_anexados",
  "modelo_epi", "modelo_ferramentas", "modelo_treinamentos",
  "modelo_autorizacao_formal_opcoes",
  "abas_liberadas", "perfis_aprovadores", "niveis_ids",
  "documentos_pessoais", "documentos_obrigatorios", "documentos_rh_estruturados",
  "documentos_demissionais", "treinamentos_anexos", "ferramentais_anexos",
  "epis_anexos", "documentos_rh_anexos", "ordem_servicos_anexos",
  "autorizacao_formal_anexos", "direito_recusa_anexos",
  "filtros", "metricas", "configuracao_grafico",
  "config", "erros", "parcelas", "mao_de_obra",
  "campos_customizados", "opcoes", "categorias", "tags",
  "dados_extra", "lida_por", "mencoes", "participantes", "participantes_emails",
  "dependencias", "pecas_substituidas", "localizacao",
]);

function normalize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    let val = v;
    if (val === "" || val === undefined) val = null;
    if (JSONB_FIELDS.has(k) && typeof val === "string" && val.trim()) {
      try { val = JSON.parse(val); } catch { /* deixa string */ }
    }
    out[k] = val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Upsert em lote via Supabase (preserva IDs do Base44)
// ---------------------------------------------------------------------------
async function upsertBatch(tabela, registros) {
  if (!registros.length) return { count: 0 };
  if (dryRun) {
    console.log(`  [dry-run] ${tabela}: ${registros.length} registros`);
    return { count: registros.length };
  }
  const { data, error } = await supabase
    .from(tabela)
    .upsert(registros, { onConflict: "id" })
    .select("id");
  if (error) {
    console.error(`  ✗ ${tabela}: ${error.message}`);
    return { count: 0, error };
  }
  return { count: data?.length || 0 };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);

const empresas = new Map(); // prefix → { nome, dados: {tabela: [linhas]} }

for (const ws of wb.worksheets) {
  const parsed = parseSheetName(ws.name);
  if (!parsed) {
    console.log(`  ⚠ aba ignorada: ${ws.name}`);
    continue;
  }
  const { empresaPrefix, tabela } = parsed;
  const rows = rowsToObjects(ws).map(normalize);
  if (!empresas.has(empresaPrefix)) {
    empresas.set(empresaPrefix, { nome: empresaPrefix, dados: {} });
  }
  empresas.get(empresaPrefix).dados[tabela] = rows;
}

console.log(`Encontrei ${empresas.size} empresas no xlsx:`);
for (const [prefix, e] of empresas) {
  const total = Object.values(e.dados).reduce((a, b) => a + b.length, 0);
  console.log(`  - ${prefix}: ${total} registros em ${Object.keys(e.dados).length} entidades`);
}
console.log("");

// Ordem de import (respeitando FKs)
const ORDEM_IMPORT = [
  "empresa", // sempre primeiro
  "centro_custo", "categoria_material", "unidade_medida", "categoria_mao_de_obra",
  "cliente", "fornecedor", "etiqueta",
  "almoxarifado", "material", "ferramental",
  "funcao", "funcionario",
  "conta_financeira", "categoria_financeira",
  "oportunidade", "projeto",
  "solicitacao_compra", "cotacao",
  "transacao_financeira", "extrato_bancario",
  "pre_lancamento",
  "diario_obra",
  "usuario_empresa", "assinatura",
  "estoque_movimento",
];

const stats = { total: 0, byTable: {} };

for (const [prefix, empresa] of empresas) {
  console.log(`\n=== ${prefix} ===`);

  // Garante que a Empresa existe primeiro
  const dadosEmpresa = empresa.dados["empresa"] || [];
  if (dadosEmpresa.length === 0) {
    // Cria empresa a partir do prefix do nome da aba
    const novaEmpresa = {
      nome: prefix,
      ativo: true,
    };
    const r = await upsertBatch("empresa", [novaEmpresa]);
    console.log(`  empresa (gerada): ${r.count}`);
  }

  for (const tabela of ORDEM_IMPORT) {
    const rows = empresa.dados[tabela];
    if (!rows || rows.length === 0) continue;
    const r = await upsertBatch(tabela, rows);
    stats.total += r.count;
    stats.byTable[tabela] = (stats.byTable[tabela] || 0) + r.count;
    console.log(`  ${tabela}: ${r.count}/${rows.length}`);
  }
}

console.log(`\n=== RESUMO ===`);
console.log(`Empresas:           ${empresas.size}`);
console.log(`Registros inseridos: ${stats.total}`);
console.log(`\nPor tabela:`);
for (const [t, c] of Object.entries(stats.byTable).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(30)} ${c}`);
}
