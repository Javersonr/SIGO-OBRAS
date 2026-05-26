#!/usr/bin/env node
/**
 * inspect-xlsx.mjs
 *
 * Inspeciona o backup multi-empresa e gera um relatório de cobertura:
 *   - Quantas empresas distintas estão no arquivo
 *   - Quantas entidades por empresa
 *   - Quais entidades do schema (100) estão presentes / ausentes
 *   - Volume total de registros
 *
 * Uso:
 *   XLSX_PATH=/caminho/para/backup.xlsx node tools/inspect-xlsx.mjs
 */

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs/promises";

const xlsxPath = path.resolve(process.env.XLSX_PATH || process.argv[2] || "./backup.xlsx");

try {
  await fs.access(xlsxPath);
} catch {
  console.error(`✗ Arquivo não encontrado: ${xlsxPath}`);
  process.exit(1);
}

console.log("=== Inspeção do backup XLSX ===");
console.log("Arquivo:", xlsxPath);
const stat = await fs.stat(xlsxPath);
console.log("Tamanho:", (stat.size / 1024 / 1024).toFixed(2), "MB");
console.log("");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);

// -----------------------------------------------------------------------------
// 100 entidades esperadas (mesmo inventário do docs/SCHEMA.md)
// -----------------------------------------------------------------------------
const ENTIDADES_ESPERADAS = {
  "Auth & Multi-tenant": [
    "Empresa",
    "GrupoEmpresarial",
    "UsuarioEmpresa",
    "UsuarioCustom",
    "User",
    "ClientePortalUsuario",
    "FornecedorAcesso",
    "TokenClienteOportunidade",
  ],
  "Permissões & Auditoria": [
    "PermissaoDetalhada",
    "PerfilPermissao",
    "NivelAprovacao",
    "RegraAprovacao",
    "GestorAprovacao",
    "AprovacaoSolicitacao",
    "AuditLog",
  ],
  "CRM / Oportunidades": [
    "Oportunidade",
    "StatusOportunidade",
    "OrigemOportunidade",
    "OportunidadeAtualizacao",
    "ArquivoOportunidade",
    "TemplateOportunidade",
  ],
  Projetos: ["Projeto", "TarefaProjeto", "CronogramaEtapa", "DiarioObra", "OrcamentoColunaConfig"],
  "Compras & Cotação": [
    "SolicitacaoCompra",
    "ItemSolicitacaoCompra",
    "Cotacao",
    "ItemCotacao",
    "RespostaCotacao",
    "FornecedorCotacao",
    "ArquivoCotacao",
    "PedidoCompra",
    "ItemPedidoCompra",
  ],
  Estoque: [
    "Material",
    "Almoxarifado",
    "LocalAlmoxarifado",
    "EstoqueMovimento",
    "EstoqueSaldo",
    "RetiradaEstoque",
    "ItemRetiradaEstoque",
    "ReservaMaterial",
    "Kit",
    "ItemKit",
  ],
  Orçamento: ["OrcamentoItem", "MaoDeObra"],
  "Ferramental / EPI": [
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
  ],
  Frota: ["Caminhao", "CaminhaoCampoObrigatorio"],
  "RH / SST": [
    "Funcionario",
    "Funcao",
    "Treinamento",
    "DocumentoEmpresa",
    "Vencimento",
    "HistoricoDocumentoAssinado",
  ],
  Financeiro: [
    "ContaFinanceira",
    "CategoriaFinanceira",
    "CentroCusto",
    "TransacaoFinanceira",
    "AnexoTransacao",
    "TransferenciaFinanceira",
    "TransacaoRecorrente",
    "IntegracaoBancaria",
    "UploadOFX",
    "ExtratoBancario",
    "RegraConciliacao",
    "PreLancamento",
    "FechamentoCaixa",
    "BoletoBancario",
    "NotaFiscalDevolucao",
  ],
  "SaaS comercial": ["Plano", "Assinatura", "Pagamento", "PropostaComercial"],
  "Cadastros gerais": ["Cliente", "Fornecedor", "Etiqueta"],
  "Notificações & Chat": ["Notificacao", "PreferenciaNotificacao", "CanalChat", "MensagemChat"],
  Relatórios: ["RelatorioCustomizado"],
  Catálogos: ["CategoriaMaterial", "UnidadeMedida", "CategoriaMaoDeObra"],
};

const TOTAL_ESPERADO = Object.values(ENTIDADES_ESPERADAS).flat().length;

// -----------------------------------------------------------------------------
// Coleta de dados
// -----------------------------------------------------------------------------
const sheets = wb.worksheets.map((ws) => ({
  name: ws.name,
  rowCount: Math.max(0, ws.rowCount - 1), // -1 pra descontar header
}));

console.log(`📋 Total de abas no arquivo: ${sheets.length}`);
console.log("");

// Parse cada aba: "NomeEmpresa_NomeEntidade" → { empresa, entidade }
// Mas como o Excel trunca em ~31 chars, vamos pegar o último "_" como separador.
// Também trata casos sem underscore.
const parsed = sheets.map((s) => {
  const idx = s.name.lastIndexOf("_");
  if (idx === -1) {
    return { empresa: "(sem prefixo)", entidade: s.name, ...s };
  }
  return {
    empresa: s.name.slice(0, idx).trim(),
    entidade: s.name.slice(idx + 1).trim(),
    ...s,
  };
});

// Agrupa por empresa
const porEmpresa = {};
for (const p of parsed) {
  if (!porEmpresa[p.empresa]) porEmpresa[p.empresa] = [];
  porEmpresa[p.empresa].push(p);
}

const empresas = Object.keys(porEmpresa).sort();
console.log(`🏢 Empresas distintas detectadas: ${empresas.length}`);
console.log("");
for (const e of empresas) {
  const sheetsEmp = porEmpresa[e];
  const totalLinhas = sheetsEmp.reduce((acc, s) => acc + s.rowCount, 0);
  console.log(
    `  ${e.padEnd(45)} ${String(sheetsEmp.length).padStart(3)} abas, ${String(totalLinhas).padStart(7)} linhas`
  );
}
console.log("");

// Agrupa por entidade (qual entidade aparece em quais empresas)
const porEntidade = {};
for (const p of parsed) {
  if (!porEntidade[p.entidade]) porEntidade[p.entidade] = [];
  porEntidade[p.entidade].push(p);
}

const entidadesNoBackup = Object.keys(porEntidade).sort();
console.log(`📊 Entidades distintas no backup: ${entidadesNoBackup.length}`);
console.log("");

// -----------------------------------------------------------------------------
// Cobertura: comparar nomes esperados vs nomes no backup
// -----------------------------------------------------------------------------
// Os nomes no backup costumam estar:
//   - Em português ("Funcionários", "Clientes", "Projetos", "Materiais")
//   - Truncados pelo Excel
// Já o schema usa PascalCase em inglês/português técnico ("Funcionario", "Cliente").
// Criamos um mapa heurístico nome português → entidade técnica.
const PT_TO_ENT = {
  Funcionários: "Funcionario",
  Clientes: "Cliente",
  Fornecedores: "Fornecedor",
  Projetos: "Projeto",
  Oportunidades: "Oportunidade",
  Assinaturas: "Assinatura",
  Materiais: "Material",
  Almoxarifados: "Almoxarifado",
  Ferramentais: "Ferramental",
  Ferramentas: "Ferramenta",
  EPIs: "EPI",
  Cotações: "Cotacao",
  Pedidos: "PedidoCompra",
  Tarefas: "TarefaProjeto",
  Categorias: "CategoriaFinanceira",
  Etiquetas: "Etiqueta",
  Caminhões: "Caminhao",
  Funções: "Funcao",
  Treinamentos: "Treinamento",
  Vencimentos: "Vencimento",
  Notificações: "Notificacao",
  Empresas: "Empresa",
  Usuários: "UsuarioCustom",
  Planos: "Plano",
  Pagamentos: "Pagamento",
  "Propostas Co": "PropostaComercial",
  "Usuários de Em": "UsuarioEmpresa",
  "Usuários de Po": "ClientePortalUsuario",
  "Acessos de For": "FornecedorAcesso",
  "Tokens de Acesso de Clientes": "TokenClienteOportunidade",
  "Permissões De": "PermissaoDetalhada",
  "Perfis de Pe": "PerfilPermissao",
  "Níveis de Aprovação": "NivelAprovacao",
  "Regras de Aprovação": "RegraAprovacao",
  "Gestores de Aprovação": "GestorAprovacao",
  "Aprovações de Solicitação": "AprovacaoSolicitacao",
  "Logs de Auditoria": "AuditLog",
  "Status de Oportunidade": "StatusOportunidade",
  "Origens de Oportunidade": "OrigemOportunidade",
  "Atualizações d": "OportunidadeAtualizacao",
  "Arquivos de Op": "ArquivoOportunidade",
  "Templates de Oportunidade": "TemplateOportunidade",
  "Etapas de Cronograma": "CronogramaEtapa",
  "Diário de Obra": "DiarioObra",
  "Configurações de Coluna de Orçamento": "OrcamentoColunaConfig",
  "Solicitações d": "SolicitacaoCompra",
  "Itens de Solicitação": "ItemSolicitacaoCompra",
  "Itens de Cotação": "ItemCotacao",
  "Respostas de Cotação": "RespostaCotacao",
  "Fornecedores de Cotação": "FornecedorCotacao",
  "Arquivos de Cotação": "ArquivoCotacao",
  "Itens de Pedido": "ItemPedidoCompra",
  "Locais de Almoxarifado": "LocalAlmoxarifado",
  "Movimentos de": "EstoqueMovimento",
  "Saldos de Estoque": "EstoqueSaldo",
  "Retiradas de Estoque": "RetiradaEstoque",
  "Itens de Retirada": "ItemRetiradaEstoque",
  "Reservas de Material": "ReservaMaterial",
  Kits: "Kit",
  "Itens de Kit": "ItemKit",
  "Itens de Orçamento": "OrcamentoItem",
  "Mão de Obra": "MaoDeObra",
  "Movimentações de Ferramenta": "MovimentacaoFerramenta",
  "Entregas de Ferramental": "EntregaFerramental",
  "Laudos de Ferramenta": "LaudoFerramenta",
  "Manutenções de Ferramenta": "ManutencaoFerramenta",
  "Notas de Ferramenta": "FerramentaNota",
  "Checklists de Inspeção de Campo": "ChecklistInspecaoCampo",
  "Inspeções de Campo": "InspecaoCampo",
  "Inspeções de Ferramenta": "InspecaoFerramenta",
  "Inspeções de Ferramental": "InspecaoFerramental",
  "Inspeções de Caminhão": "InspecaoCaminhao",
  "Históricos de Inspeção": "InspecaoHistorico",
  "Históricos de Inventário": "InventarioHistorico",
  "Campos Obrigatórios de Caminhão": "CaminhaoCampoObrigatorio",
  "Documentos de Empresa": "DocumentoEmpresa",
  "Históricos de Documento Assinado": "HistoricoDocumentoAssinado",
  "Contas Finance": "ContaFinanceira",
  "Categorias Fin": "CategoriaFinanceira",
  "Centros de Cus": "CentroCusto",
  "Transações Fin": "TransacaoFinanceira",
  "Anexos de Transação": "AnexoTransacao",
  "Transferências Financeiras": "TransferenciaFinanceira",
  "Transações Recorrentes": "TransacaoRecorrente",
  "Integrações Bancárias": "IntegracaoBancaria",
  "Uploads de OFX": "UploadOFX",
  "Extrato Bancár": "ExtratoBancario",
  "Regras de Conciliação": "RegraConciliacao",
  "Pré-Lançamento": "PreLancamento",
  "Fechamentos de Caixa": "FechamentoCaixa",
  "Boletos Bancários": "BoletoBancario",
  "Notas Fiscais de Devolução": "NotaFiscalDevolucao",
  "Preferências de Notificação": "PreferenciaNotificacao",
  "Canais de Chat": "CanalChat",
  "Mensagens de Chat": "MensagemChat",
  "Relatórios Customizados": "RelatorioCustomizado",
  "Categorias de Material": "CategoriaMaterial",
  "Unidades de Medida": "UnidadeMedida",
  "Categorias de Mão de Obra": "CategoriaMaoDeObra",
  "Grupos Empresariais": "GrupoEmpresarial",
};

// Para cada nome técnico esperado, ver se aparece (direto ou via mapa PT)
function resolveEntidadeBackup(entidade) {
  // Tenta match direto
  if (porEntidade[entidade]) return { found: true, key: entidade };
  // Tenta match no mapa PT (compara o nome técnico contra os valores)
  for (const [pt, tech] of Object.entries(PT_TO_ENT)) {
    if (tech === entidade && porEntidade[pt]) {
      return { found: true, key: pt };
    }
  }
  return { found: false, key: null };
}

console.log("=".repeat(80));
console.log("📦 COBERTURA POR DOMÍNIO");
console.log("=".repeat(80));
console.log("");

let presentes = 0;
let ausentes = 0;
const ausentesList = [];

for (const [dominio, ents] of Object.entries(ENTIDADES_ESPERADAS)) {
  const linhas = [];
  for (const ent of ents) {
    const r = resolveEntidadeBackup(ent);
    if (r.found) {
      const total = porEntidade[r.key].reduce((acc, s) => acc + s.rowCount, 0);
      linhas.push(`  ✓ ${ent.padEnd(30)} → "${r.key}"  (${total} reg)`);
      presentes++;
    } else {
      linhas.push(`  ✗ ${ent.padEnd(30)} (AUSENTE)`);
      ausentes++;
      ausentesList.push(ent);
    }
  }
  const ok = linhas.filter((l) => l.startsWith("  ✓")).length;
  console.log(`\n[${dominio}] (${ok}/${ents.length} cobertas)`);
  for (const l of linhas) console.log(l);
}

console.log("");
console.log("=".repeat(80));
console.log("📊 RESUMO");
console.log("=".repeat(80));
console.log(`Total esperado:     ${TOTAL_ESPERADO} entidades`);
console.log(`Presentes:          ${presentes}`);
console.log(`Ausentes:           ${ausentes}`);
console.log(`Cobertura:          ${((presentes / TOTAL_ESPERADO) * 100).toFixed(1)}%`);
console.log("");

const totalLinhasGlobal = parsed.reduce((acc, p) => acc + p.rowCount, 0);
console.log(`Total de registros: ${totalLinhasGlobal.toLocaleString("pt-BR")}`);
console.log(`Total de abas:      ${sheets.length}`);
console.log(`Empresas:           ${empresas.length}`);

// Lista as abas que estão no backup mas NÃO mapeamos para nenhuma entidade
const entidadesMapeadas = new Set([
  ...Object.values(PT_TO_ENT),
  ...Object.values(ENTIDADES_ESPERADAS).flat(),
]);
const naoMapeadas = entidadesNoBackup.filter((e) => !PT_TO_ENT[e] && !entidadesMapeadas.has(e));

if (naoMapeadas.length > 0) {
  console.log("");
  console.log("=".repeat(80));
  console.log("⚠️  ENTIDADES NO BACKUP QUE NÃO RECONHECEMOS (precisam mapeamento)");
  console.log("=".repeat(80));
  for (const e of naoMapeadas) {
    const t = porEntidade[e].reduce((acc, s) => acc + s.rowCount, 0);
    console.log(`  "${e}"  (${porEntidade[e].length} abas, ${t} reg)`);
  }
}

if (ausentesList.length > 0) {
  console.log("");
  console.log("=".repeat(80));
  console.log("🔴 ENTIDADES DO SCHEMA AUSENTES DO BACKUP");
  console.log("=".repeat(80));
  console.log("(podem estar nas truncadas acima, ou realmente sem dados/sem export)");
  for (const e of ausentesList) {
    console.log(`  - ${e}`);
  }
}

console.log("");
console.log("=== Fim da inspeção ===");
