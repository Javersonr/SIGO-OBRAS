/**
 * Parser de CSV/TSV do importador financeiro (Despesas → Importar).
 *
 * Extraído de DespesasTab. Alimenta o fluxo que a skill de lançamentos gera,
 * então erra aqui = lançamento errado no caixa. Cobre:
 *   - detecção de separador (tab / ; / ,)
 *   - aspas: campo com separador ou quebra de linha dentro, e "" → " (escape)
 *   - \r\n e \n; BOM (UTF-8 com BOM, comum em export de Excel pt-BR)
 *   - campos trimados
 */

// Tab tem prioridade se aparece e é o mais frequente; senão ";", senão ",".
export function detectarSeparadorCSV(primeiraLinha) {
  const linha = String(primeiraLinha || "");
  const tabs = (linha.match(/\t/g) || []).length;
  const pontoVirg = (linha.match(/;/g) || []).length;
  const virg = (linha.match(/,/g) || []).length;
  if (tabs > 0 && tabs >= pontoVirg && tabs >= virg) return "\t";
  if (pontoVirg > 0) return ";";
  return ",";
}

// Parseia o texto inteiro em linhas de campos (string[][]) numa única passada.
//
// CORREÇÃO vs. a versão antiga (DespesasTab): ela fazia 2 passadas — a 1ª tirava
// as aspas, a 2ª dividia por separador. Resultado: um campo entre aspas com o
// separador dentro (ex.: "Cimento; cal e areia") era PARTIDO em dois,
// desalinhando todas as colunas do import. Aqui aspas e separador são tratados
// juntos, então o separador (e a quebra de linha) dentro de aspas é literal.
export function parseCSV(rawText, separator) {
  const texto = String(rawText ?? "");
  const rows = [];
  let field = "";
  let row = [];
  let inQ = false;

  const fechaLinha = () => {
    row.push(field.trim());
    rows.push(row);
    field = "";
    row = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const next = texto[i + 1];

    if (inQ) {
      if (c === '"') {
        if (next === '"') {
          field += '"'; // aspa escapada ("")
          i++;
        } else {
          inQ = false; // fecha o trecho citado
        }
      } else {
        field += c; // separador/quebra de linha aqui são literais
      }
      continue;
    }

    if (c === '"') {
      inQ = true;
    } else if (c === separator) {
      row.push(field.trim());
      field = "";
    } else if (c === "\r" && next === "\n") {
      fechaLinha();
      i++; // pula o \n do CRLF
    } else if (c === "\n" || c === "\r") {
      fechaLinha();
    } else {
      field += c;
    }
  }

  // última linha pendente; descarta se for totalmente vazia (arquivo termina em \n)
  row.push(field.trim());
  const ultimaVazia = row.length === 1 && row[0] === "";
  if (!ultimaVazia) rows.push(row);
  return rows;
}

/**
 * Conveniência ponta-a-ponta: tira BOM, detecta separador, parseia e mapeia
 * a 1ª linha como cabeçalho → array de objetos { coluna: valor }.
 * Retorna { separador, headers, data }.
 */
export function csvParaObjetos(text) {
  let texto = String(text ?? "");
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  const primeiraLinha = texto.split(/\r?\n/)[0] || "";
  const separador = detectarSeparadorCSV(primeiraLinha);
  const linhas = parseCSV(texto, separador);
  const headers = linhas[0] || [];
  const data = linhas.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] || "";
    });
    return obj;
  });
  return { separador, headers, data };
}
