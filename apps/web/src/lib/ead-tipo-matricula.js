/**
 * Tipo do treinamento (inicial, periódico, eventual) na matrícula EAD (T23) — regras puras, sem DOM e sem rede.
 *
 * NR-1, 1.7.1.2 a 1.7.1.2.3.1: o treinamento é inicial (antes de começar a atividade), periódico (no prazo da norma)
 * ou eventual (mudança de ambiente, equipamento ou procedimento, ocorrência grave, retorno de afastamento
 * longo...). O RH escolhe ao matricular; o banco guarda em `treinamento_matricula.tipo` e `motivo_eventual`
 * (migração 0142); na emissão o servidor congela os dois em `dados` do certificado
 * (`supabase/functions/portal-funcionario/tipo-treinamento.ts`, o espelho desta regra).
 *
 * Quem usa: lib/ead-gestao.js (`matriculasNovas`), a tela de matrícula (MatricularEadSheet), a tabela e os
 * detalhes da matrícula, o PDF do certificado e a consulta pública. Os testes ficam em ead-tipo-matricula.test.js.
 *
 * Este arquivo não importa nada: o teste do servidor (node:test) o carrega direto, sem o resolvedor do Vite.
 */

/** Os três tipos que o banco aceita (CHECK `treinamento_matricula_tipo_chk`). */
export const TIPOS_DE_TREINAMENTO = ["inicial", "periodico", "eventual"];

/** A escolha da tela que decide o tipo de cada pessoa da lista (ver `tipoDaNovaMatricula`). */
export const TIPO_AUTOMATICO = "automatico";

/** Limites do motivo do treinamento eventual (CHECK `treinamento_matricula_motivo_eventual_chk`). */
export const MOTIVO_EVENTUAL_MIN = 3;
export const MOTIVO_EVENTUAL_MAX = 200;

const ROTULOS = { inicial: "Inicial", periodico: "Periódico", eventual: "Eventual" };

/** Opções do seletor da tela de matrícula. */
export const OPCOES_DE_TIPO = [
  {
    valor: TIPO_AUTOMATICO,
    rotulo: "Automático",
    explicacao:
      "Inicial para quem nunca fez este curso e periódico para quem já o concluiu antes (renovação).",
  },
  {
    valor: "inicial",
    rotulo: ROTULOS.inicial,
    explicacao: "Treinamento feito antes de o funcionário começar a atividade.",
  },
  {
    valor: "periodico",
    rotulo: ROTULOS.periodico,
    explicacao: "Reciclagem: o funcionário refaz o treinamento no prazo que a norma pede.",
  },
  {
    valor: "eventual",
    rotulo: ROTULOS.eventual,
    explicacao:
      "Fora do prazo normal: mudança de procedimento, equipamento ou ambiente, ocorrência grave, " +
      "retorno de afastamento longo. Exige o motivo.",
  },
];

/** "Inicial", "Periódico" ou "Eventual"; vazio para o que não é um dos três (nada de rótulo inventado). */
export function rotuloDoTipo(tipo) {
  return Object.hasOwn(ROTULOS, tipo) ? ROTULOS[tipo] : "";
}

/**
 * Confere o que o RH escolheu ao matricular. Devolve `{ ok: true, tipo, motivo }` (o motivo só existe no eventual,
 * já sem os espaços das pontas; nos outros tipos é `null`) ou `{ ok: false, erro }` com o texto para a tela.
 */
export function validarEscolhaDeTipo({ tipo, motivo } = {}) {
  if (tipo !== TIPO_AUTOMATICO && !TIPOS_DE_TREINAMENTO.includes(tipo)) {
    return { ok: false, erro: "Escolha o tipo do treinamento" };
  }
  if (tipo !== "eventual") return { ok: true, tipo, motivo: null };
  const texto = String(motivo ?? "").trim();
  // em caracteres, como o char_length do banco (o .length do JS conta um emoji como 2)
  const tamanho = [...texto].length;
  if (tamanho < MOTIVO_EVENTUAL_MIN) {
    return {
      ok: false,
      erro: `Informe o motivo do treinamento eventual (pelo menos ${MOTIVO_EVENTUAL_MIN} caracteres)`,
    };
  }
  if (tamanho > MOTIVO_EVENTUAL_MAX) {
    return {
      ok: false,
      erro: `O motivo do treinamento eventual tem no máximo ${MOTIVO_EVENTUAL_MAX} caracteres`,
    };
  }
  return { ok: true, tipo, motivo: texto };
}

const viva = (linha) => !!linha && !linha.deleted_at;

/**
 * O tipo e o motivo que uma matrícula nova grava, como colunas (`tipo`, `motivo_eventual`).
 * - Escolha explícita (inicial, periódico, eventual): vale para todos; só o eventual leva o motivo.
 * - Automático (ou sem escolha): periódico para quem já CONCLUIU este curso antes, mesmo que o certificado tenha
 *   vencido ou sido revogado (ele fez o curso); inicial para quem nunca o concluiu. Matrícula aberta, excluída, de
 *   outro curso ou de outra pessoa não conta.
 * `matriculas` são as que a tela conhece (as da empresa, ou só as do par funcionário x curso).
 */
export function tipoDaNovaMatricula({
  tipo = TIPO_AUTOMATICO,
  motivo = null,
  funcionarioId,
  cursoId,
  matriculas = [],
} = {}) {
  if (tipo === "eventual") return { tipo, motivo_eventual: String(motivo ?? "").trim() || null };
  if (tipo === "inicial" || tipo === "periodico") return { tipo, motivo_eventual: null };
  const jaFez = (Array.isArray(matriculas) ? matriculas : []).some(
    (m) =>
      viva(m) &&
      m.funcionario_id === funcionarioId &&
      m.curso_id === cursoId &&
      m.status === "concluido"
  );
  return { tipo: jaFez ? "periodico" : "inicial", motivo_eventual: null };
}

/**
 * O tipo como o certificado (`dados`) e a consulta pública o trazem: `{ tipo, rotulo, motivo }`, ou null quando o
 * certificado não diz o tipo (os emitidos antes da T23, ou um valor que não é um dos três). O motivo só vale no
 * eventual.
 */
export function tipoPublicoDoCertificado(dados) {
  const tipo = dados?.tipo_treinamento;
  if (!TIPOS_DE_TREINAMENTO.includes(tipo)) return null;
  const motivo = typeof dados?.motivo_eventual === "string" ? dados.motivo_eventual.trim() : "";
  return {
    tipo,
    rotulo: ROTULOS[tipo],
    motivo: tipo === "eventual" && motivo ? motivo : null,
  };
}

/** As linhas que o PDF do certificado imprime sobre o tipo (nenhuma em certificado que não o diz). */
export function linhasDoTipoNoCertificado(dados) {
  const t = tipoPublicoDoCertificado(dados);
  if (!t) return [];
  return [`Tipo de treinamento: ${t.rotulo}`, ...(t.motivo ? [`Motivo: ${t.motivo}`] : [])];
}

/** O tipo da matrícula para a tela do RH ("Periódico", "Eventual: motivo"); vazio se a matrícula não o traz. */
export function textoDoTipoDaMatricula(matricula) {
  const rotulo = rotuloDoTipo(matricula?.tipo);
  if (!rotulo) return "";
  const motivo = String(matricula?.motivo_eventual ?? "").trim();
  return matricula.tipo === "eventual" && motivo ? `${rotulo}: ${motivo}` : rotulo;
}
