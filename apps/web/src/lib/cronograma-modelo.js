/**
 * Aba `Cronograma` do modelo SIGO (.xlsx): nome da aba, cabeçalho e a leitura/validação da
 * aba preenchida pela skill do Claude (spec
 * docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md §6).
 *
 * `orcamento-modelo.js` importa daqui o nome e o cabeçalho para o `gerarModelo`; por isso este
 * arquivo NÃO importa `orcamento-modelo.js` (sem dependência circular) e repete os poucos
 * utilitários de célula de que precisa.
 *
 * Funções puras: recebem o workbook do SheetJS (ou o ArrayBuffer do arquivo) e devolvem
 * { cronograma, erros, avisos, resumo }. Mensagens por linha usam a linha do Excel.
 */
import * as XLSX from "xlsx";
import { normalizarTexto } from "./busca";
import { MAX_MESES, lerPercentual, somaCentesimos } from "./cronograma-ff";

export const ABA_CRONOGRAMA = "Cronograma";

/** ["Item", "Descrição", "Mês 1", …, "Mês <meses>"]. */
export function cabecalhoCronograma(meses = 12) {
  return ["Item", "Descrição", ...Array.from({ length: meses }, (_, j) => `Mês ${j + 1}`)];
}

// ---------------------------------------------------------------- utilidades

function normalizarRotulo(s) {
  return normalizarTexto(s).replace(/\s+/g, " ").trim();
}

function acharAba(wb, nome) {
  const alvo = normalizarRotulo(nome);
  return (wb?.SheetNames || []).find((n) => normalizarRotulo(n) === alvo);
}

function celula(ws, r, c) {
  return c === undefined ? undefined : ws[XLSX.utils.encode_cell({ r, c })];
}

/** Fórmula gravada sem o valor calculado (openpyxl faz isso); com sheetStubs vem t "z". */
function formulaSemValor(cel) {
  return Boolean(cel?.f) && (cel.t === "z" || cel.v === undefined || cel.v === null);
}

function vazia(cel) {
  if (formulaSemValor(cel)) return false;
  if (!cel || cel.t === "z" || cel.v === undefined || cel.v === null) return true;
  return typeof cel.v === "string" && cel.v.trim() === "";
}

/** Texto do Item. Número inteiro vira "1" (o `w` podia vir "1.0" ou "1E+0"). */
function textoCelula(cel) {
  if (vazia(cel) || formulaSemValor(cel)) return "";
  if (cel.t === "n" && Number.isInteger(cel.v)) return String(cel.v);
  return String(cel.w ?? cel.v).trim();
}

/** Formato da célula sem "textos", [cores/locale] e \escapes (0"%" não é percentual). */
function formatoLimpo(cel) {
  return typeof cel?.z === "string" ? cel.z.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "") : null;
}

/** Célula com formato de % (0,2 exibido como 20%): o valor guardado é a fração. */
function formatoPercentual(cel) {
  const z = formatoLimpo(cel);
  if (z !== null) return z.includes("%");
  const exibido = String(cel?.w ?? "").trim();
  return exibido.endsWith("%");
}

function formatoData(cel) {
  return typeof cel?.z === "string" && XLSX.SSF.is_date(cel.z);
}

function formatar(v, minimo, maximo) {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
  });
}

const pct2 = (v) => formatar(v, 2, 2);

/**
 * % de uma célula de mês: { valor } (0 a 100, 2 casas), com `maisCasas` quando foi
 * arredondado, ou { erro }. Vazio = 0.
 */
function lerCelulaPct(cel) {
  if (formulaSemValor(cel)) return { erro: "fórmula sem valor salvo; grave o número" };
  if (vazia(cel)) return { valor: 0, maisCasas: false };
  if (cel.t === "n" && Number.isFinite(cel.v)) {
    if (formatoData(cel)) {
      return { erro: `virou data no Excel ("${cel.w ?? cel.v}"); formate como Número` };
    }
    // 0,07 × 100 = 7.000000000000001: tira o ruído antes de contar as casas
    const v = formatoPercentual(cel) ? Number((cel.v * 100).toPrecision(15)) : cel.v;
    // a faixa vale sobre o % já arredondado em 2 casas: 100,004 vira 100,00; 100,005 é erro
    const valor = lerPercentual(v);
    if (Number.isNaN(valor)) {
      return { erro: `% ${v < 0 ? "negativo" : "acima de 100"} (${formatar(v, 0, 4)})` };
    }
    return { valor, maisCasas: Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 };
  }
  if (cel.t === "s") {
    const texto = String(cel.v).trim();
    const valor = lerPercentual(texto);
    if (Number.isNaN(valor)) return { erro: `"${texto}" não é um % de 0 a 100` };
    const decimais = (/[.,](\d+)/.exec(texto)?.[1] ?? "").replace(/0+$/, "");
    return { valor: valor ?? 0, maisCasas: decimais.length > 2 };
  }
  return { erro: `"${cel.w ?? cel.v}" não é um número` };
}

function resumoVazio() {
  return { meses: 0, linhas: 0, ignoradas: 0, faltando: 0 };
}

// ---------------------------------------------------------------- API

/**
 * Lê e valida a aba `Cronograma` (regras da spec §6). `numerosEtapas` = números das etapas de
 * nível 1 do orçamento (`etapasDoOrcamento(...).map((e) => e.numero)`).
 * - cabeçalho na linha 1, comparado sem acento/maiúsculas/espaços extras; meses = maior n de
 *   "Mês n" (até MAX_MESES; colunas além disso são ignoradas);
 * - % como número 0–100, texto pt-BR ("12,5", "12,5%") ou célula com formato de % (× 100);
 *   vazio = 0;
 * - erros bloqueiam (`cronograma` null); avisos só informam;
 * - resumo: meses, linhas importadas, linhas ignoradas e etapas sem linha (`faltando`).
 * O cronograma sai com `origem: "importado"`; quem grava acrescenta `arquivo_nome` e
 * `atualizado_em`.
 */
export function lerAbaCronograma(wb, numerosEtapas) {
  const erros = [];
  const avisos = [];
  const resumo = resumoVazio();
  const pct = {};
  const resultado = () => ({
    cronograma: erros.length === 0 ? { meses: resumo.meses, pct, origem: "importado" } : null,
    erros,
    avisos,
    resumo,
  });

  const nomeAba = acharAba(wb, ABA_CRONOGRAMA);
  if (!nomeAba) {
    erros.push(
      `A planilha não tem a aba "${ABA_CRONOGRAMA}". Use o modelo do SIGO preenchido pela skill ` +
        `do Claude.`
    );
    return resultado();
  }
  const ws = wb.Sheets[nomeAba];

  // Cabeçalho na linha 1: Item, Descrição e Mês 1…Mês N, em qualquer ordem.
  let colItem;
  const colMes = new Map();
  let alemDoLimite = false;
  if (ws["!ref"]) {
    const faixa = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      const rotulo = normalizarRotulo(textoCelula(celula(ws, 0, c)));
      if (rotulo === "item") {
        if (colItem === undefined) colItem = c;
        continue;
      }
      const m = /^mes ?(\d+)$/.exec(rotulo);
      if (!m || Number(m[1]) < 1) continue;
      const n = Number(m[1]);
      if (n > MAX_MESES) {
        alemDoLimite = true;
      } else if (colMes.has(n)) {
        avisos.push(`Linha 1: a coluna Mês ${n} se repete; vale a primeira.`);
      } else {
        colMes.set(n, c);
      }
    }
  }
  if (colItem === undefined) erros.push("Linha 1: falta a coluna Item.");
  if (colMes.size === 0) {
    erros.push("Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).");
  }
  if (erros.length > 0) return resultado();

  const meses = Math.max(...colMes.keys());
  resumo.meses = meses;
  if (alemDoLimite) avisos.push(`Linha 1: colunas depois do Mês ${MAX_MESES} foram ignoradas.`);
  for (let n = 1; n <= meses; n++) {
    if (!colMes.has(n)) avisos.push(`Linha 1: falta a coluna Mês ${n}; o mês fica com 0%.`);
  }

  // Linhas com algum dado no Item ou nos meses (pelas células que existem, não pelo !ref).
  const colunasUsadas = new Set([colItem, ...colMes.values()]);
  const comDados = new Set();
  for (const endereco of Object.keys(ws)) {
    if (endereco[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(endereco);
    if (r > 0 && colunasUsadas.has(c) && !vazia(ws[endereco])) comDados.add(r);
  }
  const linhas = [...comDados].sort((a, b) => a - b);

  const etapas = new Set((numerosEtapas || []).map(String));
  const linhaDoNumero = new Map();
  for (const r of linhas) {
    const n = r + 1;
    const numero = textoCelula(celula(ws, r, colItem));
    if (!numero) {
      avisos.push(`Linha ${n}: linha sem Item; foi ignorada.`);
      resumo.ignoradas++;
      continue;
    }
    if (linhaDoNumero.has(numero)) {
      erros.push(
        `Linha ${n}: Item ${numero} repetido (já está na linha ${linhaDoNumero.get(numero)}).`
      );
      continue;
    }
    linhaDoNumero.set(numero, n);
    if (!etapas.has(numero)) {
      avisos.push(`Linha ${n}: Item ${numero} não é etapa do orçamento; foi ignorado.`);
      resumo.ignoradas++;
      continue;
    }
    const valores = [];
    let comErro = false;
    for (let j = 1; j <= meses; j++) {
      const { valor, maisCasas, erro } = lerCelulaPct(celula(ws, r, colMes.get(j)));
      if (erro) {
        erros.push(`Linha ${n}, Mês ${j}: ${erro}.`);
        comErro = true;
        continue;
      }
      if (maisCasas) {
        avisos.push(
          `Linha ${n}, Mês ${j}: % com mais de 2 casas; arredondado para ${pct2(valor)}.`
        );
      }
      valores.push(valor);
    }
    if (comErro) continue;
    pct[numero] = valores;
    resumo.linhas++;
    const soma = somaCentesimos(valores);
    if (soma !== 10000) {
      avisos.push(
        `Linha ${n}: a etapa ${numero} soma ${pct2(soma / 100)}%, e não 100,00%; ` +
          `fica vermelha até ser corrigida.`
      );
    }
  }

  if (erros.length === 0 && resumo.linhas === 0) {
    erros.push(
      linhas.length === 0
        ? `A aba "${ABA_CRONOGRAMA}" não tem linhas preenchidas.`
        : `Nenhuma linha da aba "${ABA_CRONOGRAMA}" tem o Item de uma etapa do orçamento.`
    );
    return resultado();
  }
  for (const numero of etapas) {
    if (linhaDoNumero.has(numero)) continue;
    avisos.push(`Etapa ${numero} do orçamento sem linha no cronograma; fica vazia.`);
    resumo.faltando++;
  }
  return resultado();
}

/**
 * Lê o arquivo (ArrayBuffer/Uint8Array de `await file.arrayBuffer()`) e valida a aba.
 * `cellNF` traz o formato (`z`) de cada célula, que é como se reconhece o % (0,2 = 20%);
 * `sheetStubs` mantém a fórmula sem valor salvo, para acusar o erro em vez de ler 0.
 */
export function lerArquivoCronograma(buffer, numerosEtapas) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", cellNF: true, sheetStubs: true });
  } catch {
    return {
      cronograma: null,
      erros: ["Não foi possível ler o arquivo como planilha Excel (.xlsx)."],
      avisos: [],
      resumo: resumoVazio(),
    };
  }
  return lerAbaCronograma(wb, numerosEtapas);
}
