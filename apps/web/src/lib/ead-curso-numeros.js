/**
 * Números do curso EAD conferidos ANTES de gravar (A6, T32) — regra pura, sem DOM e sem rede.
 *
 * O banco recusa o que não faz sentido (CHECK da migração 0139: nota de 0 a 100, tentativas e intervalo >= 0,
 * carga > 0, validade >= 0) e todas essas colunas são `integer`. Sem esta conferência o RH via o texto cru do
 * Postgres no toast ("new row for relation ... violates check constraint ...", "invalid input syntax for type
 * integer"). Aqui o erro sai em português, com o campo que está errado.
 *
 * Campo vazio vale: a tela grava o padrão (nota 70, 3 tentativas, 30 minutos) ou nulo (curso sem carga ou sem
 * validade é pendência de requisito, não erro). Carga e validade de curso LIGADO ao cadastro central não são
 * conferidas: os campos ficam travados na tela e o gatilho do banco as sobrescreve com as do modelo.
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx (`salvarCurso`). Testes em ead-curso-numeros.test.js.
 */

const vazio = (v) => v === null || v === undefined || String(v).trim() === "";
const inteiro = (v) => {
  const n = Number(typeof v === "string" ? v.trim() : v);
  return Number.isInteger(n) ? n : null;
};

// Ordem da tela. `minimo`/`maximo` são inclusivos; `herdavel`: o campo vem do cadastro central quando há vínculo.
const REGRAS = [
  {
    campo: "nota_minima",
    valido: (n) => n >= 0 && n <= 100,
    erro: "A nota mínima da avaliação precisa ser um número inteiro de 0 a 100.",
  },
  {
    campo: "max_tentativas",
    valido: (n) => n >= 0,
    erro: "O máximo de tentativas na prova precisa ser um número inteiro, 0 ou mais (0 = sem limite).",
  },
  {
    campo: "intervalo_tentativa_min",
    valido: (n) => n >= 0,
    erro: "O intervalo entre as tentativas precisa ser um número inteiro de minutos, 0 ou mais.",
  },
  {
    campo: "carga_horaria_horas",
    herdavel: true,
    valido: (n) => n > 0,
    erro: "A carga horária precisa ser um número inteiro de horas, maior que zero (deixe em branco se ainda não foi definida).",
  },
  {
    campo: "validade_meses",
    herdavel: true,
    valido: (n) => n >= 0,
    erro: "A validade precisa ser um número inteiro de meses, 0 ou mais (deixe em branco ou 0 se o certificado não vence).",
  },
];

/**
 * Confere os números do formulário do curso. Devolve `{ ok: true }` ou `{ ok: false, campo, erro }` com o
 * PRIMEIRO problema, na ordem da tela. Entrada ausente vale (nada a conferir).
 */
export function validarNumerosDoCurso(curso) {
  const c = curso ?? {};
  for (const regra of REGRAS) {
    if (regra.herdavel && c.modelo_treinamento_id) continue;
    const valor = c[regra.campo];
    if (vazio(valor)) continue;
    const n = inteiro(valor);
    if (n === null || !regra.valido(n)) return { ok: false, campo: regra.campo, erro: regra.erro };
  }
  return { ok: true };
}

/** Nota mínima quando o curso não define uma (a mesma `NOTA_MINIMA_PADRAO` do portal-funcionario). */
const NOTA_MINIMA_PADRAO = 70;

/**
 * A nota mínima que a tela grava (A7): campo vazio vale o padrão (70); qualquer outro valor vira número, e 0
 * continua 0. A tela gravava `nota_minima ? Number(nota_minima) : 70`, que transformava 0 em 70 ao salvar; o
 * servidor usa `nota_minima ?? 70` e aceita 0 (o CHECK da 0139 vai de 0 a 100). Quem confere a faixa antes de gravar
 * é `validarNumerosDoCurso`.
 */
export function notaMinimaParaGravar(valor) {
  return vazio(valor) ? NOTA_MINIMA_PADRAO : Number(String(valor).trim());
}
