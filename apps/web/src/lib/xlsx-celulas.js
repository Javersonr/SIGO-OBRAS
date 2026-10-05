/**
 * Utilitários de célula do SheetJS (.xlsx) comuns à leitura do orçamento
 * (`orcamento-modelo.js`) e da aba Cronograma (`cronograma-modelo.js`): achar a aba, comparar
 * rótulos, ler o texto de uma célula e reconhecer fórmula sem valor salvo, célula vazia e data.
 *
 * Módulo neutro: só importa o `xlsx` e a busca, para os dois lerem com a mesma regra sem
 * dependência circular (o `orcamento-modelo.js` importa o `cronograma-modelo.js` para o
 * `gerarModelo`).
 */
import * as XLSX from "xlsx";
import { normalizarTexto } from "./busca";

export function normalizarRotulo(s) {
  return normalizarTexto(s).replace(/\s+/g, " ").trim();
}

export function acharAba(wb, nome) {
  const alvo = normalizarRotulo(nome);
  return (wb?.SheetNames || []).find((n) => normalizarRotulo(n) === alvo);
}

export function celula(ws, r, c) {
  return c === undefined ? undefined : ws[XLSX.utils.encode_cell({ r, c })];
}

/** Fórmula gravada sem o valor calculado (openpyxl faz isso); com sheetStubs vem t "z". */
export function formulaSemValor(cel) {
  return Boolean(cel?.f) && (cel.t === "z" || cel.v === undefined || cel.v === null);
}

export function semValor(cel) {
  return !cel || cel.t === "z" || cel.v === undefined || cel.v === null;
}

export function vazia(cel) {
  if (formulaSemValor(cel)) return false;
  if (semValor(cel)) return true;
  return typeof cel.v === "string" && cel.v.trim() === "";
}

/** Texto das colunas de texto. Número inteiro vira "93358" (o `w` podia vir "9.3E+4"). */
export function textoCelula(cel) {
  if (semValor(cel)) return "";
  if (cel.t === "n" && Number.isInteger(cel.v)) return String(cel.v);
  return String(cel.w ?? cel.v).trim();
}

/**
 * Número que o Excel formatou como data (digitar 1/10 vira 1-Oct). Com `cellNF` a célula traz
 * o formato (`z`) e quem decide é o SSF (d-mmm, mmm-yy, dd/mm/yyyy...): o texto exibido (`w`)
 * só casa com alguns deles. Sem `z` (workbook em memória), `w` com três números separados por
 * / ou - fica como reserva.
 */
export function formatoData(cel) {
  if (cel?.t !== "n" || typeof cel.v !== "number") return false;
  if (typeof cel.z === "string") return XLSX.SSF.is_date(cel.z);
  return /\d+[/-]\d+[/-]\d+/.test(String(cel.w ?? ""));
}
