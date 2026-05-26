// Utilitários compartilhados para o módulo financeiro

export const parseData = (dataStr) => {
  if (!dataStr) return new Date().toISOString().split("T")[0];

  // Converter para string caso seja número ou objeto Date (data serial do Excel)
  if (dataStr instanceof Date) {
    return dataStr.toISOString().split("T")[0];
  }

  dataStr = dataStr.toString().trim();

  // Se for número (data serial do Excel: dias desde 1900-01-01)
  if (/^\d+(\.\d+)?$/.test(dataStr)) {
    const numero = parseFloat(dataStr);

    // Validação: número muito pequeno ou muito grande não é data válida
    if (numero < 1 || numero > 100000) {
      return new Date().toISOString().split("T")[0];
    }

    // Excel serial date: 1 = 1900-01-01, 2 = 1900-01-02, etc
    // Ajuste: Excel considera 1900 como bissexto erroneamente
    const dataBase = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899 em UTC
    const milissegundos = numero * 24 * 60 * 60 * 1000;
    const dataCalculada = new Date(dataBase.getTime() + milissegundos);

    // Retornar formato ISO
    const ano = dataCalculada.getUTCFullYear();
    const mes = String(dataCalculada.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(dataCalculada.getUTCDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
  }

  // Se já é uma data válida no formato ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) return dataStr;

  // Tentar DD/MM/YYYY ou DD/MM/YY
  let match = dataStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    let [, dia, mes, ano] = match;
    if (ano.length === 2) ano = "20" + ano;
    return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  // Tentar YYYY/MM/DD ou YYYY-MM-DD
  match = dataStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (match) {
    let [, ano, mes, dia] = match;
    return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  // Tentar MM/DD/YYYY
  match = dataStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (match) {
    let [, mes, dia, ano] = match;
    // Se dia > 12, assumir que é DD/MM/YYYY
    if (parseInt(dia) > 12) {
      return `${ano}-${dia.padStart(2, "0")}-${mes.padStart(2, "0")}`;
    }
    return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  return new Date().toISOString().split("T")[0];
};

export const formatCurrency = (value) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
};

export const parseValor = (valorStr) => {
  if (!valorStr) return 0;

  // Converter para string e remover espaços
  valorStr = valorStr.toString().trim();

  // Remover símbolos de moeda (R$, $, etc)
  valorStr = valorStr.replace(/[R$€£¥]/g, "");

  // Detectar se usa vírgula como decimal
  const temVirgula = valorStr.includes(",");
  const temPonto = valorStr.includes(".");

  if (temVirgula && temPonto) {
    // Tem ambos - determinar qual é o separador decimal
    const ultimaVirgula = valorStr.lastIndexOf(",");
    const ultimoPonto = valorStr.lastIndexOf(".");

    if (ultimaVirgula > ultimoPonto) {
      // Vírgula é o decimal: 1.234,56
      valorStr = valorStr.replace(/\./g, "").replace(",", ".");
    } else {
      // Ponto é o decimal: 1,234.56
      valorStr = valorStr.replace(/,/g, "");
    }
  } else if (temVirgula) {
    // Só vírgula - pode ser decimal ou milhar
    const partesVirgula = valorStr.split(",");
    if (partesVirgula[partesVirgula.length - 1].length === 2) {
      // Provavelmente decimal: 1234,56
      valorStr = valorStr.replace(",", ".");
    } else {
      // Provavelmente milhar: 1,234
      valorStr = valorStr.replace(/,/g, "");
    }
  }

  // Remover qualquer caractere não numérico exceto ponto e sinal
  valorStr = valorStr.replace(/[^\d.-]/g, "");

  return Math.abs(parseFloat(valorStr) || 0);
};
