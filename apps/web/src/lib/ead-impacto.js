/**
 * Impacto de uma edição do curso sobre quem já está fazendo (T30) — sem DOM e sem rede.
 *
 * Mudar o gabarito, a nota mínima ou as aulas de um curso com matrículas em andamento mexe no que o
 * aluno está vivendo. A tela do RH consulta as matrículas (e o progresso da aula, quando é o caso),
 * passa os dados para cá e mostra o aviso que voltar; aqui só se decide se há o que avisar e o que
 * dizer. Quem usa: components/seguranca/TreinamentosEadTab.jsx. Testes: ead-impacto.test.js.
 *
 * "Em andamento" é o status `em_andamento` da matrícula (o aluno já abriu o curso e ainda não
 * concluiu). Matrícula concluída não entra: o certificado e a conclusão dela não mudam com a edição.
 */

const lista = (valor) => (Array.isArray(valor) ? valor.filter(Boolean) : []);

/**
 * Resumo para avisar sobre UMA aula. `matriculas` são as do curso; `progressos` são as linhas de
 * `treinamento_progresso` da aula. Só conta quem ainda não concluiu o curso e de fato tem algo na
 * aula (tempo assistido ou aula concluída), uma vez por matrícula. Linha de matrícula que não está
 * na lista (removida) não conta.
 *
 * - `emAndamento`: matrículas do curso com status em andamento.
 * - `comProgresso`: matrículas abertas com progresso nesta aula.
 * - `concluiramAula`: dessas, as que já concluíram a aula.
 */
export function resumirProgressoAula(matriculas, progressos) {
  const todas = lista(matriculas);
  const abertas = new Set(todas.filter((m) => m.status !== "concluido").map((m) => m.id));
  const porMatricula = new Map(); // matricula_id -> concluiu a aula?
  for (const p of lista(progressos)) {
    if (!abertas.has(p.matricula_id)) continue;
    if (!p.concluida && !(Number(p.segundos_assistidos) > 0)) continue;
    porMatricula.set(p.matricula_id, porMatricula.get(p.matricula_id) || !!p.concluida);
  }
  return {
    emAndamento: todas.filter((m) => m.status === "em_andamento").length,
    comProgresso: porMatricula.size,
    concluiramAula: [...porMatricula.values()].filter(Boolean).length,
  };
}

const textoDaCorreta = (questao) => {
  const opcoes = Array.isArray(questao?.opcoes) ? questao.opcoes : [];
  return String(opcoes[Number(questao?.correta)] ?? "").trim();
};

/**
 * A edição muda o gabarito da questão? Sim quando a alternativa correta passa a ser outra (índice
 * diferente: a prova corrige por índice) ou quando o texto da correta muda. Mexer só no enunciado,
 * ou numa alternativa errada, não muda. Questão nova (sem `antes`) não é mudança.
 */
export function mudouGabarito(antes, depois) {
  if (!antes || !depois) return false;
  return (
    Number(antes.correta) !== Number(depois.correta) ||
    textoDaCorreta(antes) !== textoDaCorreta(depois)
  );
}

/**
 * A nota mínima do formulário (já convertida em número) é diferente da gravada? Curso ainda sem
 * cadastro (`antes` vazio) não é mudança. Nota gravada vazia vale 70, o padrão do curso.
 */
export function mudouNotaMinima(antes, nova) {
  if (!antes) return false;
  const gravada = Number(antes.nota_minima ?? 70);
  return Number(nova) !== (Number.isFinite(gravada) ? gravada : 70);
}

/** "1 matrícula em andamento" / "3 matrículas em andamento". */
export function quantidadeDeMatriculas(n) {
  return n === 1 ? "1 matrícula em andamento" : `${n} matrículas em andamento`;
}

/** "1 matrícula já tem progresso nesta aula (1 já a concluiu)" / "N matrículas já têm ... (K já a concluíram)". */
function fraseDeProgresso(comProgresso, concluiramAula) {
  const base =
    comProgresso === 1
      ? "1 matrícula já tem progresso nesta aula"
      : `${comProgresso} matrículas já têm progresso nesta aula`;
  if (!(concluiramAula > 0)) return base;
  return `${base} (${concluiramAula} ${concluiramAula === 1 ? "já a concluiu" : "já a concluíram"})`;
}

/**
 * Aviso a mostrar antes de salvar a mudança, ou null quando ninguém é afetado. `tipo`:
 *
 * - "gabarito" e "nota_minima": com matrícula em andamento no curso (`emAndamento`).
 * - "aula_nova": com matrícula em andamento no curso; a aula entra no fim da trilha.
 * - "aula_trocar" (arquivo ou link novo) e "aula_duracao" (tempo novo): quando alguém já tem
 *   progresso NESTA aula (`comProgresso`; `concluiramAula` dessas). `ehVideo` escolhe o texto.
 *
 * Devolve `{ titulo, texto, rotuloConfirmar }` no formato de `useConfirmar` (a remoção da aula tem
 * texto próprio: textoConfirmarRemocaoAula).
 */
export function avisoDeMudanca(
  tipo,
  { emAndamento = 0, comProgresso = 0, concluiramAula = 0, ehVideo = false } = {}
) {
  const curso = emAndamento > 0 ? `Este curso tem ${quantidadeDeMatriculas(emAndamento)}.` : "";

  if (tipo === "gabarito" && emAndamento > 0) {
    return {
      titulo: "Mudar o gabarito com alunos em andamento?",
      texto:
        `${curso} A mudança vale para as próximas provas: quem ainda não foi aprovado será ` +
        "corrigido com o gabarito novo. Notas e aprovações já registradas não mudam.",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  if (tipo === "nota_minima" && emAndamento > 0) {
    return {
      titulo: "Mudar a nota mínima com alunos em andamento?",
      texto:
        `${curso} A nova nota mínima vale para as próximas tentativas da prova. Notas e ` +
        "aprovações já registradas não mudam.",
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  if (tipo === "aula_nova" && emAndamento > 0) {
    return {
      titulo: "Adicionar aula com alunos em andamento?",
      texto:
        `${curso} A aula nova entra no fim da trilha e passa a ser exigida de quem ainda não ` +
        "concluiu o curso.",
      rotuloConfirmar: "Adicionar aula",
    };
  }
  if ((tipo === "aula_trocar" || tipo === "aula_duracao") && comProgresso > 0) {
    const ficam =
      concluiramAula > 0
        ? "quem já terminou a aula continua com ela concluída; quem está no meio"
        : "quem está no meio";
    if (tipo === "aula_trocar") {
      return {
        titulo: "Trocar o conteúdo da aula com progresso?",
        texto:
          `${fraseDeProgresso(comProgresso, concluiramAula)}. O conteúdo novo vale para todos os ` +
          `alunos: ${ficam} mantém o ` +
          (ehVideo
            ? "tempo já assistido, que passa a ser contado contra a duração nova."
            : "tempo de leitura já registrado."),
        rotuloConfirmar: "Trocar mesmo assim",
      };
    }
    return {
      titulo: "Mudar o tempo da aula com progresso?",
      texto:
        `${fraseDeProgresso(comProgresso, concluiramAula)}. ` +
        (ehVideo
          ? "A duração nova muda o tempo exigido para concluir a aula (90% do vídeo) para todos: "
          : "O tempo mínimo de leitura novo vale para todos: ") +
        `${ficam} mantém o tempo já registrado, agora contado contra o valor novo.`,
      rotuloConfirmar: "Salvar mesmo assim",
    };
  }
  return null;
}

/**
 * Texto da confirmação de remover uma aula. Sempre pergunta; quando há matrículas em andamento no
 * curso, ou alguém com progresso nesta aula, diz quantas e o que acontece. A exclusão é lógica: o
 * tempo assistido segue no banco, só deixa de contar para a conclusão.
 */
export function textoConfirmarRemocaoAula({
  tituloAula,
  emAndamento = 0,
  comProgresso = 0,
  concluiramAula = 0,
} = {}) {
  const pergunta = tituloAula
    ? `Remover a aula "${tituloAula}" deste curso?`
    : "Remover esta aula do curso?";
  if (!(emAndamento > 0) && !(comProgresso > 0)) return pergunta;

  const linhas = [pergunta, ""];
  if (comProgresso > 0) linhas.push(`${fraseDeProgresso(comProgresso, concluiramAula)}.`);
  if (emAndamento > 0) linhas.push(`O curso tem ${quantidadeDeMatriculas(emAndamento)}.`);
  linhas.push(
    "",
    "Ao remover, a aula some do curso para todos os alunos e deixa de contar para a conclusão."
  );
  if (comProgresso > 0) {
    linhas.push("O tempo já assistido fica guardado como registro de auditoria.");
  }
  return linhas.join("\n");
}
