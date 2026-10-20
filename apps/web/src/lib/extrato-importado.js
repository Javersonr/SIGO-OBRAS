/**
 * Leitura do extrato bancário importado na Conciliação (OFX e CSV).
 *
 * Função pura: recebe o TEXTO do arquivo e devolve as linhas já no formato de
 * `p_linhas` da RPC `importar_extrato_bancario` (migração 0156):
 *
 *   { data: "AAAA-MM-DD", valor: número COM sinal (débito negativo),
 *     descricao, fitid, documento }
 *
 * mais quantas linhas do arquivo foram DESCARTADAS (sem data válida, sem valor
 * válido ou com valor zero — a RPC também recusaria essas).
 *
 * O que a versão antiga (dentro de ConciliacaoBancaria.jsx) fazia de errado:
 *   - OFX: Math.abs(TRNAMT) — débito entrava POSITIVO; só lia linha a linha
 *     com tag de fechamento (OFX 1.x SGML sem </TRNAMT> e arquivo numa linha
 *     só não eram lidos); ignorava FITID/CHECKNUM/NAME.
 *   - CSV: dividia por /[,;]/ — "1.234,56" virava dois campos e o valor 1.234.
 *   - parseFloat em valor monetário (erro de ponto flutuante).
 *
 * Formatos aceitos (os mesmos que a tela já aceitava):
 *   - OFX 1.x (SGML, tags de valor sem fechamento) e OFX 2.x (XML);
 *   - CSV "Data; Descrição; Valor [; Tipo]" com ; , ou tab, cabeçalho opcional.
 */
import { detectarSeparadorCSV, parseCSV } from "./csv";
import { normalizarTexto } from "./busca";

// ---------------------------------------------------------------------------
// Arquivo → texto
// ---------------------------------------------------------------------------

/**
 * Bytes do arquivo → texto. Banco brasileiro costuma gerar OFX em Windows-1252
 * (CHARSET:1252); lido como UTF-8, "PAGAMENTO CONCESSIONÁRIA" vira "CONCESSION�RIA".
 * Tenta UTF-8 estrito e, se os bytes não forem UTF-8 válido, cai para 1252.
 */
export function decodificarArquivoExtrato(bytes) {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let texto;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(dados);
  } catch {
    texto = new TextDecoder("windows-1252").decode(dados);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

// ---------------------------------------------------------------------------
// Valor monetário
// ---------------------------------------------------------------------------

// Parte inteira com separador de milhar: só vale com grupos de 3 dígitos.
function inteiroSemMilhar(inteiro, milhar) {
  if (inteiro === "") return "0";
  if (/^\d+$/.test(inteiro)) return inteiro;
  if (!milhar) return null;
  const sep = milhar === "." ? "\\." : ",";
  if (!new RegExp(`^\\d{1,3}(${sep}\\d{3})+$`).test(inteiro)) return null;
  return inteiro.split(milhar).join("");
}

/**
 * Texto de valor → número com 2 casas, ou null se não for um valor.
 *
 * Arredonda a partir da STRING (meio para longe do zero), sem passar por
 * parseFloat: "0,125" → 0.13, "1.234,565" → 1234.57. O número devolvido é
 * centavos / 100, que o JSON serializa exatamente ("1234.57").
 *
 * Aceita: "-123.45", "1.234,56", "1,234.56", "R$ 1.234,56", "(1.234,56)" e
 * "1.234,56-" (negativos), "150,00 D" / "150,00 C" (sufixo de débito/crédito).
 * Com um separador só, ele é o decimal ("1,5" e "1.5" = 1,50); repetido, é
 * milhar ("1.234.567").
 */
export function valorMonetario(entrada) {
  if (entrada == null) return null;
  let s = String(entrada).trim();
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1).trim();
  }
  const sufixo = s.match(/\s*([DC])$/i);
  if (sufixo) {
    if (sufixo[1].toUpperCase() === "D") negativo = true;
    s = s.slice(0, sufixo.index);
  }
  s = s.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negativo = true;
    s = s.slice(0, -1);
  }

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const virgulas = (s.match(/,/g) || []).length;
  const pontos = (s.match(/\./g) || []).length;
  let decimal = null;
  if (virgulas && pontos) decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  else if (virgulas === 1) decimal = ",";
  else if (pontos === 1) decimal = ".";

  let inteiro = s;
  let fracao = "";
  let milhar = virgulas && !pontos ? "," : pontos && !virgulas ? "." : null;
  if (decimal) {
    const i = s.lastIndexOf(decimal);
    inteiro = s.slice(0, i);
    fracao = s.slice(i + 1);
    milhar = decimal === "," ? "." : ",";
  }
  if (!/^\d*$/.test(fracao)) return null;
  const inteiroLimpo = inteiroSemMilhar(inteiro, milhar);
  if (inteiroLimpo == null) return null;

  let centavos = Number(inteiroLimpo) * 100 + Number(fracao.padEnd(2, "0").slice(0, 2));
  if (fracao.length > 2 && Number(fracao[2]) >= 5) centavos += 1;
  if (!Number.isSafeInteger(centavos)) return null;
  if (centavos === 0) return 0;
  return (negativo ? -centavos : centavos) / 100;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

function dataIso(ano, mes, dia) {
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null; // 31/02 etc.
  }
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * DTPOSTED do OFX → "AAAA-MM-DD". Formato: AAAAMMDD[HHMMSS[.XXX]][[±h:TZ]],
 * ex. "20260929120000[-3:BRT]". Usa a DATA como o banco escreveu, sem converter
 * fuso: é o dia do lançamento no extrato (converter "20260929000000[0:GMT]"
 * para BRT jogaria a linha para o dia 28).
 */
export function dataDoOFX(texto) {
  const m = String(texto ?? "")
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? dataIso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/**
 * Data do CSV → "AAAA-MM-DD". Aceita DD/MM/AAAA, DD/MM/AA, DD-MM-AAAA,
 * DD.MM.AAAA, AAAA-MM-DD e AAAA/MM/DD (com ou sem hora depois). Dia antes do
 * mês, como no Brasil (a versão antiga fazia o mesmo).
 */
export function dataDoCSV(texto) {
  const s = String(texto ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return dataIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\s.*)?$/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dataIso(ano, Number(m[2]), Number(m[1]));
  }
  return null;
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

// TRNTYPE que é saída de dinheiro: usado só quando o TRNAMT vem SEM sinal.
const TRNTYPE_DEBITO = new Set([
  "DEBIT",
  "PAYMENT",
  "CHECK",
  "FEE",
  "SRVCHG",
  "ATM",
  "POS",
  "CASH",
  "DIRECTDEBIT",
  "REPEATPMT",
]);

function decodificarEntidades(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function textoLimpo(s) {
  const t = decodificarEntidades(String(s ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
}

// Campos de um <STMTTRN>. Vale para SGML ("<TRNAMT>-10.00" e a próxima tag na
// linha seguinte ou colada) e XML ("<TRNAMT>-10.00</TRNAMT>"): o valor é o
// texto até o próximo "<". Fica a 1ª ocorrência de cada tag.
function camposDoBloco(bloco) {
  const campos = {};
  const re = /<([A-Za-z0-9_.]+)>([^<]*)/g;
  let m;
  while ((m = re.exec(bloco))) {
    const tag = m[1].toUpperCase();
    if (!(tag in campos)) campos[tag] = m[2].trim();
  }
  return campos;
}

function descricaoOFX(memo, nome) {
  if (memo && nome) {
    const m = normalizarTexto(memo);
    const n = normalizarTexto(nome);
    if (m.includes(n)) return memo;
    if (n.includes(m)) return nome;
    return `${memo} - ${nome}`;
  }
  return memo || nome || null;
}

// FITID repetido no MESMO arquivo (alguns bancos repetem para lançamentos
// diferentes): a RPC deduplica por FITID e descartaria o 2º como "já existente".
// Nesses casos o FITID vira FITID|data|valor|n — continua estável ao reimportar
// o mesmo arquivo.
function desambiguarFitid(linhas) {
  const contagem = new Map();
  for (const l of linhas) {
    if (l.fitid) contagem.set(l.fitid, (contagem.get(l.fitid) || 0) + 1);
  }
  const vistos = new Map();
  return linhas.map((l) => {
    if (!l.fitid || contagem.get(l.fitid) < 2) return l;
    const base = `${l.fitid}|${l.data}|${l.valor}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return { ...l, fitid: `${base}|${n}` };
  });
}

/** Texto OFX (1.x SGML ou 2.x XML) → { linhas, descartadas }. */
export function lerOFX(texto) {
  const conteudo = String(texto ?? "");
  const linhas = [];
  let descartadas = 0;

  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
  let m;
  while ((m = re.exec(conteudo))) {
    const c = camposDoBloco(m[1]);
    const data = dataDoOFX(c.DTPOSTED) || dataDoOFX(c.DTUSER);
    const bruto = c.TRNAMT ?? "";
    let valor = valorMonetario(bruto);
    if (!data || valor == null || valor === 0) {
      descartadas += 1;
      continue;
    }
    const semSinal = !/^\s*[-+(]/.test(bruto) && !/-\s*$/.test(bruto);
    if (semSinal && valor > 0 && TRNTYPE_DEBITO.has(String(c.TRNTYPE || "").toUpperCase())) {
      valor = -valor;
    }
    linhas.push({
      data,
      valor,
      descricao: descricaoOFX(textoLimpo(c.MEMO), textoLimpo(c.NAME)),
      fitid: textoLimpo(c.FITID),
      documento: textoLimpo(c.CHECKNUM) || textoLimpo(c.REFNUM),
    });
  }

  return { linhas: desambiguarFitid(linhas), descartadas };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Coluna "Tipo": +1 crédito, -1 débito, 0 não reconhecido (vale o sinal do valor).
function sinalDoTipo(tipo) {
  const t = normalizarTexto(tipo).trim();
  if (!t) return 0;
  if (t === "c" || t === "+" || t.startsWith("cred") || t.startsWith("entrada")) return 1;
  if (t === "d" || t === "-" || t.startsWith("deb") || t.startsWith("saida")) return -1;
  return 0;
}

const linhaVazia = (campos) => campos.every((c) => !String(c ?? "").trim());

/**
 * Texto CSV → { linhas, descartadas }. Colunas por posição, como a tela sempre
 * aceitou: Data, Descrição, Valor e (opcional) Tipo. O valor pode vir com sinal
 * ("-50,00", "50,00-", "50,00 D"); se houver coluna Tipo reconhecível
 * (C/D, Crédito/Débito, Entrada/Saída, +/-), ela manda no sinal.
 */
export function lerCSVExtrato(texto) {
  let conteudo = String(texto ?? "");
  if (conteudo.charCodeAt(0) === 0xfeff) conteudo = conteudo.slice(1);

  const amostra = conteudo.split(/\r?\n/).find((l) => /[\t;,]/.test(l)) || "";
  const linhasCSV = parseCSV(conteudo, detectarSeparadorCSV(amostra));

  const linhas = [];
  let descartadas = 0;
  let cabecalhoVisto = false;

  for (const campos of linhasCSV) {
    if (linhaVazia(campos)) continue;
    const data = dataDoCSV(campos[0]);

    // 1ª linha preenchida sem data e com "data"/"date": é o cabeçalho
    if (!cabecalhoVisto) {
      cabecalhoVisto = true;
      const t = normalizarTexto(campos.join(" "));
      if (!data && (t.includes("data") || t.includes("date"))) continue;
    }

    let valor = campos.length >= 3 ? valorMonetario(campos[2]) : null;
    if (!data || valor == null || valor === 0) {
      descartadas += 1;
      continue;
    }
    const sinal = sinalDoTipo(campos[3]);
    if (sinal) valor = sinal * Math.abs(valor);

    linhas.push({
      data,
      valor,
      descricao: textoLimpo(campos[1]),
      fitid: null,
      documento: null,
    });
  }

  return { linhas, descartadas };
}

// ---------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------

const pareceOFX = (texto) => /OFXHEADER|<OFX[\s>]/i.test(String(texto ?? "").slice(0, 4000));

/**
 * Texto + nome do arquivo → { formato: "ofx" | "csv" | null, linhas, descartadas }.
 * formato null = arquivo que não é OFX nem CSV (nada é lido).
 */
export function lerExtrato(texto, nomeArquivo = "") {
  const nome = String(nomeArquivo || "").toLowerCase();
  if (nome.endsWith(".ofx") || pareceOFX(texto)) return { formato: "ofx", ...lerOFX(texto) };
  if (nome.endsWith(".csv")) return { formato: "csv", ...lerCSVExtrato(texto) };
  return { formato: null, linhas: [], descartadas: 0 };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Mensagem do resultado da importação. `resultado` é o jsonb devolvido por
 * importar_extrato_bancario ({ total, importadas, duplicadas, invalidas });
 * `descartadasNoArquivo` são as que o leitor já tirou antes de enviar.
 */
export function resumoDaImportacao(resultado, descartadasNoArquivo = 0) {
  const importadas = Number(resultado?.importadas) || 0;
  const duplicadas = Number(resultado?.duplicadas) || 0;
  const invalidas = (Number(resultado?.invalidas) || 0) + (Number(descartadasNoArquivo) || 0);

  const partes = [plural(importadas, "linha nova importada", "linhas novas importadas")];
  if (duplicadas) {
    partes.push(
      duplicadas === 1
        ? "1 linha já existia e não foi duplicada"
        : `${duplicadas} linhas já existiam e não foram duplicadas`
    );
  }
  if (invalidas) {
    partes.push(
      `${plural(invalidas, "linha descartada", "linhas descartadas")} (data ou valor inválido)`
    );
  }
  return `Extrato importado: ${partes.join("; ")}.`;
}
