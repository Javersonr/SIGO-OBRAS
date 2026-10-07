// Projeto pedagógico do curso no portal (T25; NR-1, Anexo II, 3.1 itens j e k). Regra pura, sem `Deno.*` nem
// rede: o `index.ts` liga o banco. Teste em projeto.test.ts.
//
// O curso guarda o projeto inteiro em colunas próprias (migração 0141), mas o ALUNO só recebe o que precisa para
// se organizar: o prazo para concluir (`prazo_conclusao_dias`, em dias a partir da matrícula) e a estimativa de
// dedicação diária (`dedicacao_diaria_min`). O texto do projeto (objetivo, estratégia, validação...) chega ao
// aluno só dentro do PDF do projeto, que ele abre pelo botão "Projeto pedagógico".

/** Prazo máximo e dedicação máxima aceitos (iguais ao CHECK da migração 0141 e à tela do RH). */
export const MAX_PRAZO_CONCLUSAO_DIAS = 3650;
export const MAX_DEDICACAO_DIARIA_MIN = 1440;

function inteiroNoLimite(valor: unknown, maximo: number): number | null {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= maximo ? n : null;
}

/** O que o aluno recebe do projeto em `dados`: prazo e dedicação (inteiro válido ou null). Nada mais. */
export function projetoParaOAluno(
  curso: { prazo_conclusao_dias?: unknown; dedicacao_diaria_min?: unknown } | null | undefined
): { prazo_conclusao_dias: number | null; dedicacao_diaria_min: number | null } {
  return {
    prazo_conclusao_dias: inteiroNoLimite(curso?.prazo_conclusao_dias, MAX_PRAZO_CONCLUSAO_DIAS),
    dedicacao_diaria_min: inteiroNoLimite(curso?.dedicacao_diaria_min, MAX_DEDICACAO_DIARIA_MIN),
  };
}
