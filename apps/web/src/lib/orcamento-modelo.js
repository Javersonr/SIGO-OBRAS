/**
 * Modelo SIGO de orçamento (.xlsx): fonte ÚNICA dos nomes das abas, colunas e rótulos,
 * a geração do modelo em branco e a leitura/validação da planilha preenchida
 * (spec docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §4 e §7).
 *
 * A skill do Claude (public/skills/orcamento-prefeitura-sigo/SKILL.md) escreve exatamente
 * esses textos; o teste de lib/skill-orcamento.test.js garante isso.
 *
 * Funções puras: recebem o workbook do SheetJS (ou o ArrayBuffer do arquivo) e devolvem
 * { itens, info, erros, avisos, totais }. Mensagens por linha usam a linha do Excel.
 */
import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/busca";
import { totalLinha } from "@/lib/orcamento-desconto";

export const ABA_ORCAMENTO = "Orçamento";
export const ABA_INFORMACOES = "Informações";
export const CABECALHOS_MODELO = [
  "Item",
  "Código",
  "Fonte",
  "Descrição",
  "Unidade",
  "Quantidade",
  "Preço unitário (R$)",
  "Total (R$)",
];
export const ROTULOS_INFO = [
  "Órgão",
  "Objeto",
  "Edital/Processo",
  "Data-base",
  "BDI (%)",
  "Fonte de preços",
  "Total da prefeitura (R$)",
  "Observações",
];
export const CHAVES_INFO = {
  Órgão: "orgao",
  Objeto: "objeto",
  "Edital/Processo": "edital",
  "Data-base": "data_base",
  "BDI (%)": "bdi",
  "Fonte de preços": "fonte",
  "Total da prefeitura (R$)": "total_prefeitura",
  Observações: "observacoes",
};
export const LIMITE_LINHAS = 3000;

/** Linhas da coluna A já formatadas como Texto no modelo em branco. */
const LINHAS_MODELO = 500;
/** A aba Informações é curta; não varre além disso. */
const LIMITE_LINHAS_INFO = 200;

const CAMPO_POR_CABECALHO = {
  Item: "item",
  Código: "codigo",
  Fonte: "fonte",
  Descrição: "descricao",
  Unidade: "unidade",
  Quantidade: "quantidade",
  "Preço unitário (R$)": "preco",
  "Total (R$)": "total",
};
const OBRIGATORIOS = ["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário (R$)"];
const PADRAO_ITEM = /^\d+(\.\d+)*$/;

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

function semValor(cel) {
  return !cel || cel.t === "z" || cel.v === undefined || cel.v === null;
}

function vazia(cel) {
  if (formulaSemValor(cel)) return false;
  if (semValor(cel)) return true;
  return typeof cel.v === "string" && cel.v.trim() === "";
}

/** Texto das colunas de texto. Número inteiro vira "93358" (o `w` podia vir "9.3E+4"). */
function textoCelula(cel) {
  if (semValor(cel)) return "";
  if (cel.t === "n" && Number.isInteger(cel.v)) return String(cel.v);
  return String(cel.w ?? cel.v).trim();
}

function textoOuNull(cel) {
  return textoCelula(cel) || null;
}

/** Valor bruto para as colunas numéricas; célula de erro (#DIV/0!) vira texto → NaN. */
function valorDaCelula(cel) {
  if (semValor(cel)) return null;
  if (cel.t === "e") return String(cel.w ?? "#ERRO");
  return cel.v;
}

function lerCampoNumerico(cel, rotulo) {
  if (formulaSemValor(cel)) {
    return { valor: null, erro: `${rotulo} é uma fórmula sem valor salvo; grave o número` };
  }
  const bruto = valorDaCelula(cel);
  const valor = lerNumeroBR(bruto);
  if (Number.isNaN(valor)) return { valor: null, erro: `${rotulo} não é um número ("${bruto}")` };
  return { valor, erro: null };
}

/** Casas decimais pela representação mais curta do número (0.1 → 1; 1e-7 → 7). */
function casasDecimais(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(String(Math.abs(v)));
  if (!m) return 0;
  return Math.max(0, (m[2] || "").length - Number(m[3] || 0));
}

/** Arredonda (meio para cima) sem o erro de 1.005 × 100 = 100.49999… */
function arredondarCasas(v, casas) {
  const s = String(v);
  if (/e/i.test(s)) return Math.round(v * 10 ** casas) / 10 ** casas;
  return Number(`${Math.round(Number(`${s}e${casas}`))}e-${casas}`);
}

function formatar(v, minimo, maximo, agrupar = true) {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
    useGrouping: agrupar,
  });
}

const moeda = (v) => formatar(v, 2, 2);

/** "1.2" pode vir depois de "1.1" (irmão), "1" (filho .1) ou "1.1.3" (irmão de um ancestral). */
function sequenciaValida(anterior, atual) {
  const a = anterior.split(".").map(Number);
  const b = atual.split(".").map(Number);
  const mesmoInicio = (n) => b.slice(0, n).every((s, i) => s === a[i]);
  if (b.length === a.length + 1 && mesmoInicio(a.length) && b[b.length - 1] === 1) return true;
  const k = b.length;
  return k <= a.length && mesmoInicio(k - 1) && b[k - 1] === a[k - 1] + 1;
}

function temEtapaAcima(numero, etapasVistas) {
  const partes = numero.split(".");
  for (let k = partes.length - 1; k >= 1; k--) {
    if (etapasVistas.has(partes.slice(0, k).join("."))) return true;
  }
  return false;
}

function infoVazia() {
  return {
    orgao: null,
    objeto: null,
    edital: null,
    data_base: null,
    bdi: null,
    fonte: null,
    total_prefeitura: null,
    observacoes: null,
  };
}

/** Valor de texto da aba Informações: data curta do Excel vira dd/mm/aaaa; % e número em pt-BR. */
function textoInfo(cel) {
  if (semValor(cel)) return "";
  if (cel.t === "n") {
    const w = String(cel.w ?? "");
    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(w)) {
      const d = XLSX.SSF.parse_date_code(cel.v);
      const dois = (n) => String(n).padStart(2, "0");
      return `${dois(d.d)}/${dois(d.m)}/${d.y}`;
    }
    if (w.endsWith("%")) return `${formatar(cel.v * 100, 0, 4, false)}%`;
    return formatar(cel.v, 0, 10, false);
  }
  return textoCelula(cel);
}

function lerInformacoes(wb, avisos) {
  const info = infoVazia();
  const nome = acharAba(wb, ABA_INFORMACOES);
  if (!nome) {
    avisos.push(
      `A planilha não tem a aba "${ABA_INFORMACOES}"; órgão, objeto e total da prefeitura ficam em branco.`
    );
    return info;
  }
  const ws = wb.Sheets[nome];
  if (!ws["!ref"]) return info;
  const chavePorRotulo = new Map(ROTULOS_INFO.map((r) => [normalizarRotulo(r), CHAVES_INFO[r]]));
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const ultima = Math.min(faixa.e.r, LIMITE_LINHAS_INFO - 1);
  for (let r = 0; r <= ultima; r++) {
    const chave = chavePorRotulo.get(normalizarRotulo(textoCelula(celula(ws, r, 0))));
    if (!chave || info[chave] !== null) continue;
    const cel = celula(ws, r, 1);
    if (chave === "total_prefeitura") {
      const { valor, erro } = lerCampoNumerico(cel, "Total da prefeitura (R$)");
      if (erro) avisos.push(`Informações: ${erro}; foi ignorado.`);
      else info.total_prefeitura = valor;
    } else {
      info[chave] = textoInfo(cel) || null;
    }
  }
  return info;
}

// ---------------------------------------------------------------- API

/**
 * Número de uma célula: number finito → ele mesmo; texto pt-BR ("1.234,56", "12,5",
 * "R$ 1.234,56") ou com ponto decimal ("1234.56") → number; vazio/null/undefined → null;
 * qualquer outra coisa → NaN.
 */
export function lerNumeroBR(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor !== "string") return NaN;
  let s = valor.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (s === "") return null;
  const virgula = s.includes(",");
  const ponto = s.includes(".");
  if (virgula && ponto) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".") // 1.234,56
        : s.replace(/,/g, ""); // 1,234.56
  } else if (virgula) {
    s = s.replace(",", "."); // 12,5 (duas vírgulas não passam no teste abaixo)
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, ""); // 1.234.567
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Modelo em branco: aba Orçamento (cabeçalho + coluna A como Texto) e aba Informações. */
export function gerarModelo() {
  const orcamento = XLSX.utils.aoa_to_sheet([CABECALHOS_MODELO]);
  for (let r = 1; r <= LINHAS_MODELO; r++) {
    orcamento[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: "", z: "@" };
  }
  orcamento["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: LINHAS_MODELO, c: CABECALHOS_MODELO.length - 1 },
  });
  orcamento["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 70 },
    { wch: 9 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
  ];
  const informacoes = XLSX.utils.aoa_to_sheet(ROTULOS_INFO.map((rotulo) => [rotulo]));
  informacoes["!cols"] = [{ wch: 26 }, { wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, orcamento, ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, informacoes, ABA_INFORMACOES);
  return wb;
}

/**
 * Lê e valida o modelo preenchido (regras da spec §7). Com `erros` não vazio a
 * importação fica bloqueada; `avisos` só informam.
 */
export function lerPlanilhaModelo(wb) {
  const erros = [];
  const avisos = [];
  const itens = [];
  const info = wb?.SheetNames ? lerInformacoes(wb, avisos) : infoVazia();
  const totais = { referencia: 0, prefeitura: info.total_prefeitura, qtdEtapas: 0, qtdItens: 0 };
  const resultado = () => ({ itens, info, erros, avisos, totais });

  const nomeAba = acharAba(wb, ABA_ORCAMENTO);
  if (!nomeAba) {
    erros.push(
      `A planilha não tem a aba "${ABA_ORCAMENTO}". Use o modelo do SIGO (botão Baixar modelo).`
    );
    return resultado();
  }
  const ws = wb.Sheets[nomeAba];

  // Cabeçalho na linha 1, em qualquer ordem, sem acento/maiúsculas/espaços extras.
  const campoPorRotulo = new Map(
    Object.entries(CAMPO_POR_CABECALHO).map(([cab, campo]) => [normalizarRotulo(cab), campo])
  );
  const col = {};
  if (ws["!ref"]) {
    const faixa = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      const campo = campoPorRotulo.get(normalizarRotulo(textoCelula(celula(ws, 0, c))));
      if (campo && col[campo] === undefined) col[campo] = c;
    }
  }
  const faltando = OBRIGATORIOS.filter((cab) => col[CAMPO_POR_CABECALHO[cab]] === undefined);
  if (faltando.length > 0) {
    erros.push(`Linha 1: faltam as colunas obrigatórias: ${faltando.join(", ")}.`);
    return resultado();
  }

  // Linhas com algum dado nas colunas do modelo (pelas células que existem, não pelo !ref).
  const colunasUsadas = new Set(Object.values(col));
  const comDados = new Set();
  for (const endereco of Object.keys(ws)) {
    if (endereco[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(endereco);
    if (r > 0 && colunasUsadas.has(c) && !vazia(ws[endereco])) comDados.add(r);
  }
  const linhas = [...comDados].sort((a, b) => a - b);
  if (linhas.length > LIMITE_LINHAS) {
    erros.push(
      `A aba "${ABA_ORCAMENTO}" tem ${formatar(linhas.length, 0, 0)} linhas preenchidas; ` +
        `o limite é ${formatar(LIMITE_LINHAS, 0, 0)}.`
    );
    return resultado();
  }

  const linhaDoNumero = new Map();
  let refCents = 0;
  for (const r of linhas) {
    const n = r + 1;
    const errosAntes = erros.length;

    const celItem = celula(ws, r, col.item);
    const itemNumerico = celItem?.t === "n" && typeof celItem.v === "number";
    const virouData = itemNumerico && /\d+[/-]\d+[/-]\d+/.test(String(celItem.w ?? ""));
    let numero = textoCelula(celItem);
    if (itemNumerico && !virouData && !Number.isInteger(celItem.v)) {
      numero = String(celItem.v);
      avisos.push(
        `Linha ${n}: Item lido como número (${numero}); se era ${numero}0, ` +
          `formate a coluna A como Texto e digite de novo.`
      );
    }
    if (virouData) {
      erros.push(
        `Linha ${n}: Item virou data no Excel ("${celItem.w}"); ` +
          `formate a coluna A como Texto e digite de novo.`
      );
    } else if (!numero) {
      erros.push(`Linha ${n}: Item vazio.`);
    } else if (!PADRAO_ITEM.test(numero)) {
      erros.push(`Linha ${n}: Item "${numero}" fora do padrão (use 1, 1.1, 1.1.2).`);
    } else if (linhaDoNumero.has(numero)) {
      erros.push(
        `Linha ${n}: Item ${numero} repetido (já está na linha ${linhaDoNumero.get(numero)}).`
      );
    } else {
      linhaDoNumero.set(numero, n);
    }

    const descricao = textoCelula(celula(ws, r, col.descricao));
    if (!descricao) erros.push(`Linha ${n}: Descrição vazia.`);

    const qtd = lerCampoNumerico(celula(ws, r, col.quantidade), "Quantidade");
    const preco = lerCampoNumerico(celula(ws, r, col.preco), "Preço unitário");
    if (qtd.erro) erros.push(`Linha ${n}: ${qtd.erro}.`);
    if (preco.erro) erros.push(`Linha ${n}: ${preco.erro}.`);

    const etapa = !qtd.erro && !preco.erro && qtd.valor === null && preco.valor === null;
    let quantidade = null;
    let ref = null;
    if (!etapa && !qtd.erro && !preco.erro) {
      if (preco.valor === null) erros.push(`Linha ${n}: Quantidade sem Preço unitário.`);
      else if (qtd.valor === null) erros.push(`Linha ${n}: Preço unitário sem Quantidade.`);
      else {
        quantidade = qtd.valor;
        ref = preco.valor;
        if (casasDecimais(quantidade) > 3) {
          quantidade = arredondarCasas(quantidade, 3);
          avisos.push(
            `Linha ${n}: Quantidade com mais de 3 casas; arredondada para ${formatar(quantidade, 0, 3)}.`
          );
        }
        if (casasDecimais(ref) > 4) {
          ref = arredondarCasas(ref, 4);
          avisos.push(
            `Linha ${n}: Preço unitário com mais de 4 casas; arredondado para ${formatar(ref, 2, 4)}.`
          );
        }
        if (quantidade <= 0) erros.push(`Linha ${n}: Quantidade deve ser maior que zero.`);
        if (ref < 0) erros.push(`Linha ${n}: Preço unitário negativo.`);
      }
    }

    const tot = lerCampoNumerico(celula(ws, r, col.total), "Total (R$)");
    if (tot.erro) avisos.push(`Linha ${n}: ${tot.erro}; foi ignorado.`);
    const totalInformado = tot.erro ? null : tot.valor;

    if (erros.length > errosAntes) continue;

    const unidade = textoOuNull(celula(ws, r, col.unidade));
    if (!etapa) {
      if (unidade === null) avisos.push(`Linha ${n}: item sem unidade.`);
      const calculado = totalLinha(quantidade, ref);
      refCents += Math.round(calculado * 100);
      if (
        totalInformado !== null &&
        Math.abs(Math.round(totalInformado * 100) - Math.round(calculado * 100)) > 1
      ) {
        avisos.push(
          `Linha ${n}: Total (R$) informado ${moeda(totalInformado)} difere do calculado ` +
            `${moeda(calculado)}.`
        );
      }
    }

    itens.push({
      linha: n,
      numero,
      etapa,
      codigo: textoOuNull(celula(ws, r, col.codigo)),
      fonte: textoOuNull(celula(ws, r, col.fonte)),
      descricao,
      unidade,
      quantidade: etapa ? null : quantidade,
      valor_unitario_ref: etapa ? null : ref,
      total_informado: totalInformado,
    });
  }

  totais.referencia = refCents / 100;
  totais.qtdEtapas = itens.filter((i) => i.etapa).length;
  totais.qtdItens = itens.length - totais.qtdEtapas;

  if (totais.qtdItens === 0) {
    erros.push(`Nenhum item com Quantidade e Preço unitário na aba "${ABA_ORCAMENTO}".`);
    return resultado();
  }

  // Estrutura: sequência da numeração e etapa acima de cada item.
  const etapasVistas = new Set();
  let anterior = null;
  for (const item of itens) {
    if (anterior !== null && !sequenciaValida(anterior, item.numero)) {
      avisos.push(
        `Linha ${item.linha}: Item ${item.numero} fora de sequência (depois de ${anterior}).`
      );
    }
    if (!item.etapa && totais.qtdEtapas > 0 && !temEtapaAcima(item.numero, etapasVistas)) {
      avisos.push(`Linha ${item.linha}: item ${item.numero} sem etapa acima.`);
    }
    if (item.etapa) etapasVistas.add(item.numero);
    anterior = item.numero;
  }
  if (totais.qtdEtapas === 0) {
    avisos.push("A planilha não tem linhas de etapa; os itens ficam sem subtotal.");
  }

  if (info.total_prefeitura !== null) {
    const diferenca = Math.abs(refCents - Math.round(info.total_prefeitura * 100));
    if (diferenca > 1) {
      avisos.push(
        `Soma dos itens (R$ ${moeda(totais.referencia)}) difere do Total da prefeitura ` +
          `(R$ ${moeda(info.total_prefeitura)}) em R$ ${moeda(diferenca / 100)}.`
      );
    }
  }

  return resultado();
}

/**
 * Lê o arquivo (ArrayBuffer/Uint8Array de `await file.arrayBuffer()`) e valida.
 * `sheetStubs` mantém a célula de fórmula sem valor salvo, para acusar o erro em vez
 * de tratar a linha como etapa.
 */
export function lerArquivoModelo(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", sheetStubs: true });
  } catch {
    return {
      itens: [],
      info: infoVazia(),
      erros: ["Não foi possível ler o arquivo como planilha Excel (.xlsx)."],
      avisos: [],
      totais: { referencia: 0, prefeitura: null, qtdEtapas: 0, qtdItens: 0 },
    };
  }
  return lerPlanilhaModelo(wb);
}
