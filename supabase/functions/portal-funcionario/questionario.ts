/**
 * Questionário do módulo no portal-funcionario (A2: estudo guiado): o que a matrícula precisa para abrir ou enviar o
 * questionário de uma aula, as mensagens do envio e a resposta da correção.
 *
 * Fora do `index.ts` (que não é importável no Node) para ser testado com um banco injetado (`questionario.test.ts`),
 * como `prova.ts`. Sem `Deno.*` e sem import de URL. O sorteio, o início gravado na trilha, a validação do envio e a
 * correção são os da prova final (`sortearProva`, `detalheDaProvaIniciada`, `inicioDaProva`, `validarEnvio`,
 * `corrigirProva`, em regras.ts). O que muda é o alcance: as questões são as DA AULA (`aula_id`), a nota mínima é a
 * dos módulos (`treinamento_curso.nota_minima_modulo`, padrão 80), as tentativas são livres (sem limite e sem
 * intervalo), numeradas por matrícula e aula (`treinamento_questionario_tentativa`), e a correção comentada vai
 * também a quem não atingiu a nota (é estudo; a cobrança é a prova final).
 *
 * O postgrest-js NÃO lança em falha de rede ou de banco: devolve `data: null` com `error`. Cada leitura confere o seu
 * `error`, manda a causa ao log e, com qualquer uma ilegível, o questionário não é preparado (503): nem aberto, nem
 * corrigido, nem gravado.
 */

import { causa, trilhaDoCurso } from "./conclusao.ts";
import { aulaLiberada, MSG_TRILHA_INDISPONIVEL, opcoesDaQuestao } from "./regras.ts";
import type { RecusaDaProva } from "./prova.ts";

// A nota mínima dos módulos mora em regras.ts (Task 4): o resumo do certificado também a usa, e regras.ts não pode
// importar este arquivo (ciclo). Aqui só se reexporta, para os consumidores do contrato C4.
export { NOTA_MINIMA_MODULO_PADRAO, notaMinimaDoModulo } from "./regras.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const LOG = "[portal-funcionario]";

/** Eventos do questionário na trilha (C2): gravados só pelo servidor, nunca pela ação `evento`. */
export const EVENTO_QUESTIONARIO_INICIADO = "questionario_iniciado";
export const EVENTO_QUESTIONARIO_ENVIO = "questionario_envio";

/** A leitura do questionário (questões, curso ou tentativas) falhou: o aluno só precisa tentar de novo. */
export const MSG_QUESTIONARIO_INDISPONIVEL =
  "Não foi possível conferir o questionário agora. Tente de novo em instantes.";

/** O RH criou a aula do questionário e ainda não cadastrou as questões dela. */
export const MSG_QUESTIONARIO_VAZIO = "Este questionário ainda não tem questões — avise o RH";

/** A aula como `trilhaDoCurso` a lê (`id, ordem, tipo, duracao_seg`). */
export type AulaDaTrilha = {
  id: string;
  ordem?: unknown;
  tipo?: string | null;
  duracao_seg?: unknown;
};

const NOME_DO_TIPO = { questionario: "um questionário", caso: "um caso" } as const;

export type AulaDaAtividade =
  | { falha: RecusaDaProva }
  | { falha: null; aula: AulaDaTrilha; concluida: boolean };

/**
 * A aula de uma atividade (questionário ou caso) nesta matrícula: do curso da matrícula, na empresa da sessão, do
 * tipo pedido e liberada (todas as anteriores concluídas). Serve ao questionário e ao caso (caso-aluno.ts). Trilha
 * ilegível é 503, nunca "aula de outro curso" nem "aula bloqueada" (A7). `concluida` = a aula já está concluída.
 */
export async function aulaDaAtividade(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  aulaId: unknown,
  empresaId: string,
  tipo: keyof typeof NOME_DO_TIPO
): Promise<AulaDaAtividade> {
  const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
  if (!trilha.lida) return { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } };
  const aula = (trilha.aulas as AulaDaTrilha[]).find((a) => a.id === aulaId);
  if (!aula) return { falha: { mensagem: "Aula não pertence ao curso", status: 400 } };
  if (aula.tipo !== tipo) {
    return { falha: { mensagem: `Esta aula não é ${NOME_DO_TIPO[tipo]}`, status: 400 } };
  }
  if (!aulaLiberada(trilha, aula.id)) {
    return {
      falha: {
        mensagem: "Conclua a aula anterior primeiro",
        status: 409,
        extra: { codigo: "AULA_BLOQUEADA" },
      },
    };
  }
  return { falha: null, aula, concluida: trilha.feitas.has(aula.id) };
}

/** O que `prepararQuestionario` devolve: a recusa, ou o que o questionário precisa (`falha: null`). */
export type PreparoDoQuestionario =
  | { falha: RecusaDaProva }
  | {
      falha: null;
      aula: AulaDaTrilha;
      // deno-lint-ignore no-explicit-any
      questoes: any[];
      // deno-lint-ignore no-explicit-any
      curso: any;
      /** a maior tentativa já feita nesta aula (a próxima é `usadas + 1`) */
      usadas: number;
      concluida: boolean;
      melhorNota: number | null;
      /**
       * Há tentativa APROVADA gravada e a aula não está concluída: o envio aprovado gravou a tentativa (imutável) e a
       * conclusão não saiu. `questionario_abrir` conclui a aula nesse caso, em vez de sortear outra tentativa.
       */
      conclusaoPendente: boolean;
    };

/**
 * A conclusão que ficou pendente: a aula NÃO está concluída, mas alguma tentativa dela já foi aprovada. Acontece
 * quando o envio gravou a tentativa aprovada (imutável) e a gravação do progresso concluído falhou em seguida. Vale
 * o `aprovada` que o servidor gravou na correção (só o booleano verdadeiro), que é o veredito daquele envio mesmo
 * que o RH mude a nota mínima depois.
 */
export function conclusaoPendente(
  tentativas: { aprovada?: unknown }[] | null | undefined,
  concluida: boolean
): boolean {
  if (concluida || !Array.isArray(tentativas)) return false;
  return tentativas.some((t) => t?.aprovada === true);
}

/**
 * O tempo de tela com que a aula do questionário é concluída: o maior das duas leituras (antes de gravar a tentativa
 * e logo antes de concluir), para um sinal do `progresso` no meio do caminho não fazer o tempo voltar atrás. Se a
 * segunda leitura falhou (`null`), vale a primeira: a tentativa já está gravada e a conclusão não pode depender dela.
 */
export function tempoParaConcluir(antes: number, depois: number | null): number {
  return Math.max(antes, depois ?? antes);
}

/**
 * Confere se a matrícula pode abrir ou enviar o questionário desta aula AGORA e traz o que ele precisa: a aula (do
 * curso, do tipo `questionario`, liberada), as questões dela, a nota mínima do curso e as tentativas desta matrícula
 * nesta aula. `comGabarito`: só a correção lê `correta` e `comentario`. Recusas: 503 (leitura), 400 (aula de fora
 * do curso ou de outro tipo), 409 `AULA_BLOQUEADA` e 409 `QUESTIONARIO_VAZIO`. Aula já concluída devolve
 * `concluida: true` com a melhor nota, mesmo sem questões (o RH pode tê-las apagado depois).
 */
export async function prepararQuestionario(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  aulaId: string,
  empresaId: string,
  comGabarito: boolean
): Promise<PreparoDoQuestionario> {
  const atividade = await aulaDaAtividade(supabase, mat, aulaId, empresaId, "questionario");
  if (atividade.falha) return { falha: atividade.falha };
  const { aula, concluida } = atividade;
  const [
    { data: questoes, error: erroQuestoes },
    { data: curso, error: erroCurso },
    { data: tentativas, error: erroTentativas },
  ] = await Promise.all([
    supabase
      .from("treinamento_questao")
      .select(
        comGabarito
          ? "id, ordem, pergunta, opcoes, correta, comentario"
          : "id, ordem, pergunta, opcoes"
      )
      .eq("curso_id", mat.curso_id)
      .eq("aula_id", aula.id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true }),
    supabase
      .from("treinamento_curso")
      .select("nota_minima_modulo")
      .eq("id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("treinamento_questionario_tentativa")
      .select("numero, nota, aprovada")
      .eq("matricula_id", mat.id)
      .eq("aula_id", aula.id)
      .eq("empresa_id", empresaId)
      .order("numero", { ascending: false }),
  ]);
  const falhas: [string, unknown][] = [
    ["questões", erroQuestoes],
    ["curso", erroCurso],
    ["tentativas", erroTentativas],
  ];
  let ilegivel = false;
  for (const [leitura, erro] of falhas) {
    if (!erro) continue;
    ilegivel = true;
    console.error(`${LOG} prepararQuestionario: ${leitura}:`, causa(erro));
  }
  if (ilegivel) return { falha: { mensagem: MSG_QUESTIONARIO_INDISPONIVEL, status: 503 } };

  // deno-lint-ignore no-explicit-any
  const feitas: any[] = tentativas ?? [];
  const usadas = feitas.reduce((maior, t) => Math.max(maior, Number(t.numero) || 0), 0);
  const notas = feitas.map((t) => Number(t.nota)).filter((n) => Number.isFinite(n));
  const melhorNota = notas.length ? Math.max(...notas) : null;
  if (concluida) {
    return {
      falha: null,
      aula,
      questoes: questoes ?? [],
      curso,
      usadas,
      concluida,
      melhorNota,
      conclusaoPendente: false,
    };
  }
  if (!questoes?.length) {
    return {
      falha: {
        mensagem: MSG_QUESTIONARIO_VAZIO,
        status: 409,
        extra: { codigo: "QUESTIONARIO_VAZIO" },
      },
    };
  }
  return {
    falha: null,
    aula,
    questoes,
    curso,
    usadas,
    concluida,
    melhorNota,
    conclusaoPendente: conclusaoPendente(feitas, concluida),
  };
}

/** As mensagens de `validarEnvio` que falam em "prova", reescritas para o questionário. */
const MENSAGENS_DO_ENVIO: Record<string, string> = {
  PROVA_NAO_INICIADA:
    "Abra o questionário de novo para enviar as respostas: esta tentativa não foi iniciada.",
  PROVA_ALTERADA:
    "As questões deste questionário foram alteradas pelo RH enquanto você respondia. Abra o questionário de novo.",
};

/** A mensagem de uma recusa do envio (`validarEnvio`) no questionário; código sem troca passa a mensagem como veio. */
export function mensagemDoEnvio(codigo: string, mensagemPadrao: string): string {
  return Object.hasOwn(MENSAGENS_DO_ENVIO, codigo) ? MENSAGENS_DO_ENVIO[codigo] : mensagemPadrao;
}

export type RevisaoDaQuestao = {
  questao_id: string;
  acertou: boolean;
  resposta_correta: string | null;
  comentario: string | null;
};

/**
 * A correção comentada de cada questão (a alternativa certa e o comentário), na ordem recebida. `opcoes` é lido
 * como `sortearProva` o lê (lista ou texto JSON do legado), para o texto da certa ser o que o aluno viu.
 */
export function revisaoDoQuestionario(
  questoes: { id: string; opcoes?: unknown; correta?: unknown; comentario?: unknown }[],
  acertou: (q: { id: string; correta: number }) => boolean
): RevisaoDaQuestao[] {
  return questoes.map((q) => {
    const certa = Number.isInteger(q.correta)
      ? opcoesDaQuestao(q.opcoes)[q.correta as number]
      : undefined;
    return {
      questao_id: q.id,
      acertou: acertou(q as { id: string; correta: number }),
      resposta_correta: typeof certa === "string" ? certa : null,
      comentario: typeof q.comentario === "string" ? q.comentario : null,
    };
  });
}

/**
 * A resposta de `questionario_enviar` (C4). Diferente da prova final (D10), o resultado vai inteiro aprovado ou não:
 * nota, acertos, total e a correção comentada (A2: é estudo). `aula_concluida` = aprovou (o `index.ts` só responde
 * depois de concluir a aula); `curso_concluido` só com a aprovação.
 */
export function respostaDoQuestionario(p: {
  aprovada: boolean;
  nota: number;
  acertos: number;
  total: number;
  notaMinima: number;
  tentativa: number;
  cursoConcluido: boolean;
  revisao: RevisaoDaQuestao[];
}) {
  return {
    resultado: p.aprovada ? ("satisfatorio" as const) : ("insatisfatorio" as const),
    aprovada: p.aprovada,
    nota: p.nota,
    acertos: p.acertos,
    total: p.total,
    nota_minima: p.notaMinima,
    tentativa: p.tentativa,
    aula_concluida: p.aprovada,
    curso_concluido: p.aprovada && p.cursoConcluido,
    revisao: p.revisao,
  };
}
