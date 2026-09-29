/**
 * Pastas da aba Arquivos da oportunidade (spec 2026-09-29-pastas-arquivos-oportunidade).
 *
 * Módulo PURO (sem React, sem banco). O arquivo guarda o nome da pasta em
 * `arquivo_oportunidade.pasta`; as pastas extras criadas pelo usuário ficam em
 * `oportunidade.pastas_arquivos` (jsonb). Arquivo sem pasta: categorias do
 * edital → "Edital"; o resto → "Outros". Comparação de nomes sem
 * maiúsculas/acento (normalizarTexto).
 */
import { normalizarTexto } from "@/lib/busca";
import { safeParseJSON } from "@/lib/json-utils";

export const PASTA_EDITAL = "Edital";
export const PASTA_OUTROS = "Outros";
export const PASTAS_PADRAO = [
  PASTA_EDITAL,
  "Credenciamento",
  "Envelope 01 – Proposta",
  "Envelope 02 – Habilitação",
  PASTA_OUTROS,
];

const CATEGORIAS_DO_EDITAL = new Set(["edital", "termo_referencia", "anexo_edital", "errata"]);
const MAX_NOME = 60;
const ORDEM = { sensitivity: "base", numeric: true };

const limpar = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
const chave = (s) => normalizarTexto(limpar(s));

export function ehPastaPadrao(nome) {
  const k = chave(nome);
  return PASTAS_PADRAO.some((p) => chave(p) === k);
}

/** Pasta de um arquivo: a gravada; senão Edital (categorias do edital) ou Outros. */
export function pastaDoArquivo(arq) {
  const p = limpar(arq?.pasta);
  if (p) return p;
  return CATEGORIAS_DO_EDITAL.has(arq?.categoria) ? PASTA_EDITAL : PASTA_OUTROS;
}

/** jsonb `oportunidade.pastas_arquivos` → nomes (aceita a string JSON do legado). */
export function lerPastasExtras(valor) {
  const arr = Array.isArray(valor) ? valor : safeParseJSON(valor, []);
  return (Array.isArray(arr) ? arr : []).map(limpar).filter(Boolean);
}

/** Padrão (sem Outros) → demais em ordem alfabética → Outros. Sem repetir. */
export function listarPastas(pastasExtras = [], arquivos = []) {
  const vistas = new Map(); // chave → nome exibido (o primeiro que aparecer)
  const add = (nome) => {
    const k = chave(nome);
    if (k && !vistas.has(k)) vistas.set(k, limpar(nome));
  };
  PASTAS_PADRAO.forEach(add);
  pastasExtras.forEach(add);
  arquivos.forEach((a) => add(pastaDoArquivo(a)));
  const extras = [...vistas.values()]
    .filter((n) => !ehPastaPadrao(n))
    .sort((a, b) => a.localeCompare(b, "pt-BR", ORDEM));
  return [...PASTAS_PADRAO.filter((p) => p !== PASTA_OUTROS), ...extras, PASTA_OUTROS];
}

/** Uma entrada por pasta (vazias também), arquivos em ordem de nome. */
export function agruparPorPasta(arquivos = [], pastas = []) {
  const grupos = pastas.map((pasta) => ({ pasta, arquivos: [] }));
  const porChave = new Map(grupos.map((g) => [chave(g.pasta), g]));
  const outros = porChave.get(chave(PASTA_OUTROS));
  for (const arq of arquivos) {
    const grupo = porChave.get(chave(pastaDoArquivo(arq))) || outros;
    if (grupo) grupo.arquivos.push(arq);
  }
  for (const g of grupos) {
    g.arquivos.sort((x, y) =>
      String(x.nome ?? "").localeCompare(String(y.nome ?? ""), "pt-BR", ORDEM)
    );
  }
  return grupos;
}

/** Valida o nome de uma pasta nova contra as existentes. */
export function nomePastaValido(nome, existentes = []) {
  const n = limpar(nome);
  if (!n) return { ok: false, erro: "Informe o nome da pasta" };
  if (n.length > MAX_NOME) return { ok: false, erro: `Use até ${MAX_NOME} caracteres` };
  const k = chave(n);
  if (existentes.some((e) => chave(e) === k)) {
    return { ok: false, erro: "Já existe uma pasta com esse nome" };
  }
  return { ok: true, nome: n };
}
