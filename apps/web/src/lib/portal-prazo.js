/**
 * Prazo para concluir e dedicação diária, como o aluno os lê no portal (T25) — regras puras, sem DOM e
 * sem rede. Quem usa: components/portal-funcionario/PrazoDoCurso.jsx e lib/ead-projeto.js. Testes em
 * portal-prazo.test.js.
 *
 * Os dois dados são do projeto pedagógico do curso (Anexo II, 3.1, itens j e k): a estimativa de tempo
 * mínimo de dedicação por dia (`dedicacao_diaria_min`) e o prazo máximo para concluir, em dias contados da
 * matrícula (`prazo_conclusao_dias`). O prazo só INFORMA: o portal não tranca o aluno depois do limite (quem
 * decide o que fazer com o atraso é o RH, que o vê na tabela de matrículas).
 */
import { prazoDaMatricula } from "./ead-matriculas";
import { diasParaVencer } from "./ead-vencimentos";

const fmtData = (dia) => String(dia).slice(0, 10).split("-").reverse().join("/");

/** Últimos dias do prazo em que o aviso pede atenção. */
export const DIAS_DE_ATENCAO_DO_PRAZO = 7;

/**
 * "45 min", "1 h", "1 h 30 min". Só minuto inteiro e positivo (número ou texto numérico); o resto vira
 * texto vazio, para a tela não escrever "NaN min".
 */
export function formatarMinutos(minutos) {
  const n = typeof minutos === "string" && minutos.trim() !== "" ? Number(minutos) : minutos;
  if (!Number.isInteger(n) || n <= 0) return "";
  const horas = Math.floor(n / 60);
  const resto = n % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** "Dedicação mínima estimada: 30 min por dia", ou null quando o curso não tem a estimativa. */
export function textoDaDedicacao(curso) {
  const texto = formatarMinutos(curso?.dedicacao_diaria_min);
  return texto ? `Dedicação mínima estimada: ${texto} por dia` : null;
}

/**
 * O prazo da matrícula aberta, em texto para o aluno: `{ texto, limite, tom }` ou null (sem prazo no curso,
 * matrícula concluída ou sem data). `tom`: "normal", "atencao" (faltam 7 dias ou menos) ou "atraso" (passou
 * do limite). `hoje` é o dia de Brasília ("AAAA-MM-DD").
 */
export function prazoParaOAluno({ matricula, curso, hoje } = {}) {
  // só vale o prazo do próprio curso: o padrão da tela do RH é uma preferência daquele navegador
  const prazo = prazoDaMatricula({ matricula, curso, prazoPadraoDias: null, hoje });
  if (!prazo || prazo.origem !== "curso") return null;
  const limite = fmtData(prazo.limite);
  if (prazo.atrasada) {
    return {
      texto: `O prazo para concluir terminou em ${limite}. Fale com o RH.`,
      limite: prazo.limite,
      tom: "atraso",
    };
  }
  const faltam = diasParaVencer(prazo.limite, hoje);
  const complemento =
    faltam === 0 ? "termina hoje" : faltam === 1 ? "falta 1 dia" : `faltam ${faltam} dias`;
  return {
    texto: `Prazo para concluir: até ${limite} (${complemento})`,
    limite: prazo.limite,
    tom: faltam <= DIAS_DE_ATENCAO_DO_PRAZO ? "atencao" : "normal",
  };
}
