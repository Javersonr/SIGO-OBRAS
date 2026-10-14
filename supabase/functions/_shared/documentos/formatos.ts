/**
 * Formatos dos documentos da licitação (CPF, CNPJ, telefone, CEP, data e valor por extenso) — porte
 * linha a linha de apps/web/src/lib/{cpf,ler-documento,cnpj,telefone,proposta-orcamento}.js para o
 * servidor (spec 2026-10-09 §3). A tela continua com as libs dela; a paridade (mesma entrada, mesmo
 * resultado) é conferida no Vitest (apps/web/src/lib/documentos-paridade.test.js).
 * Puro: sem Deno e sem import de URL.
 */

// ------------------------------------------------------------------- CPF
// Porte de apps/web/src/lib/cpf.js

export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * true se o CPF tem 11 dígitos, não são todos iguais e os dois dígitos
 * verificadores conferem. Aceita com ou sem máscara; letras invalidam.
 */
export function validarCpf(cpf: unknown): boolean {
  const texto = String(cpf ?? "").trim();
  if (/[^\d.\-\s]/.test(texto)) return false;
  const d = soDigitos(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  // pesos 10..2 (1º dígito) e 11..2 (2º dígito); resto 10 vira 0
  const dv = (base: string): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/**
 * Máscara 000.000.000-00, progressiva (serve para o campo enquanto digita):
 * "5299" → "529.9". Corta em 11 dígitos; vazio/null → "".
 */
export function formatarCpf(cpf: unknown): string {
  const d = soDigitos(cpf).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ------------------------------------------------------------------ CNPJ
// Porte de formatarCpfCnpj (apps/web/src/lib/ler-documento.js) e limparCnpj (cnpj.js)

/** Só os dígitos. Atenção: `valor || ""` (e não `?? ""`), como o limparCnpj da tela. */
function limparCnpj(valor: unknown): string {
  return String(valor || "").replace(/\D/g, "");
}

/** CNPJ (14 dígitos) e CPF (11) com pontuação; o resto fica como veio. */
export function formatarCpfCnpj(v: unknown): string {
  const d = limparCnpj(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(v ?? "").trim();
}

// -------------------------------------------------------------- telefone
// Porte de apps/web/src/lib/telefone.js

/**
 * Só os dígitos, sem o +55 e sem o 0 de discagem interurbana ("(017)...").
 * Cuidado com números que só PARECEM ter prefixo:
 *  - "(55) 99999-9999" é DDD 55 (RS): com o texto já mascarado ("(" no início)
 *    um 12º dígito digitado NÃO faz o "55" virar código do país;
 *  - 0800/0300/0500/0900 são números de serviço: ficam como estão (e inválidos).
 */
function digitosTelefone(valor: unknown): string {
  const bruto = String(valor ?? "").trim();
  let d = bruto.replace(/\D/g, "");
  if (/^0[3589]00/.test(d)) return d;
  const mascarado = bruto.startsWith("(");
  if (d.startsWith("55") && (d.length === 13 || (d.length === 12 && !mascarado))) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  return d;
}

/** Máscara progressiva para digitação (no máximo 11 dígitos). */
function mascaraTelefone(valor: unknown): string {
  const d = digitosTelefone(valor).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Vazio conta como válido (campo opcional). DDD não tem 0; celular (11 dígitos) começa com 9. */
function telefoneValido(valor: unknown): boolean {
  const d = digitosTelefone(valor);
  if (!d) return true;
  if (d[0] === "0" || d[1] === "0") return false;
  if (d.length === 11) return d[2] === "9";
  return d.length === 10;
}

/** Formata para exibir/salvar; valor irreconhecível volta como veio (não esconde o erro). */
export function formatarTelefone(v: unknown): string {
  const d = digitosTelefone(v);
  return d && telefoneValido(v) ? mascaraTelefone(d) : String(v ?? "");
}

// ------------------------------------------------------- CEP e data
// Porte de apps/web/src/lib/proposta-orcamento.js:157-189

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const texto = (v: unknown): string => String(v ?? "").trim();

/** "2026-10-05" → "05 de outubro de 2026" (sem new Date: não cai 1 dia no fuso). */
export function dataPorExtenso(dataISO: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(dataISO));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return "";
  return `${m[3]} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

export function formatarCep(cep: unknown): string {
  const d = texto(cep).replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : texto(cep);
}

// ------------------------------------------------------ valor por extenso
// Porte de apps/web/src/lib/proposta-orcamento.js:15-125 (que vem de _shared/recibo-pdf.ts)

const UNID = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CEM = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100),
    r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]);
  if (r)
    partes.push(
      r < 20 ? UNID[r] : [DEZ[Math.floor(r / 10)], UNID[r % 10]].filter(Boolean).join(" e ")
    );
  return partes.join(" e ");
}

const ESCALAS = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: { g: number; escala: number }[] = [];
  for (let escala = 0; n > 0 && escala < ESCALAS.length; escala++) {
    grupos.unshift({ g: n % 1000, escala });
    n = Math.floor(n / 1000);
  }
  const partes = grupos
    .filter((p) => p.g)
    .map((p) => ({
      ...p,
      texto:
        p.escala === 1 && p.g === 1
          ? "mil"
          : [ate999(p.g), ESCALAS[p.escala][p.g === 1 ? 0 : 1]].filter(Boolean).join(" "),
    }));
  // "dois mil e quinhentos", "mil e cem", "dois mil quinhentos e trinta":
  // "e" antes do último grupo só quando ele é < 100 ou centena redonda
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      return (ultimo && (p.g < 100 || p.g % 100 === 0) ? " e " : " ") + p.texto;
    })
    .join("");
}

/** 1152.09 → "mil cento e cinquenta e dois reais e nove centavos". */
export function valorPorExtenso(valor: unknown): string {
  const centavosTotais = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const cent = centavosTotais % 100;
  const partes: string[] = [];
  if (reais) {
    const milhao = reais % 1_000_000 === 0 && reais >= 1_000_000;
    partes.push(
      `${inteiroPorExtenso(reais)}${milhao ? " de" : ""} ${reais === 1 ? "real" : "reais"}`
    );
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}
