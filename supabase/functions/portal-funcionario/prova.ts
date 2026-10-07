/**
 * Preparação da prova no portal-funcionario: o que a matrícula precisa para abrir ou enviar a prova (A7, revisão 1).
 *
 * Saiu do `index.ts` (que não é importável no Node) para ser testada com um banco injetado (`prova.test.ts`). Sem
 * `Deno.*` e sem import de URL: o banco chega por parâmetro, as regras são as de `regras.ts` e a resposta de recusa
 * é um objeto simples (`RecusaDaProva`) que o `index.ts` transforma em `fail(...)`.
 *
 * O postgrest-js NÃO lança em falha de rede ou de banco: devolve `data: null` com `error`. Ler só o `data` fazia
 * uma leitura que falhou parecer uma resposta vazia, e a prova decidida assim é permanente: o `curso` ilegível virava
 * `null` e a prova era corrigida com a nota mínima padrão (70), sem limite de tentativas e sem intervalo; a
 * tentativa aprovada é imutável (0135) e a conclusão do curso decide a partir dela. Aqui cada leitura confere o seu
 * `error`, manda a causa ao log e, com qualquer uma ilegível, a prova não é preparada (503, tentar de novo): nem
 * aberta, nem corrigida, nem gravada.
 */

import { EVENTO_TENTATIVA_LIBERADA } from "../_shared/portal-funcionario.ts";
import { causa, trilhaDoCurso } from "./conclusao.ts";
import {
  horaDeBrasilia,
  MSG_TRILHA_INDISPONIVEL,
  situacaoDasTentativas,
  ultimaLiberacao,
} from "./regras.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const LOG = "[portal-funcionario]";

/** A leitura da prova (questões, curso, tentativas ou liberações) falhou: o aluno só precisa tentar de novo. */
export const MSG_PROVA_INDISPONIVEL =
  "Não foi possível conferir a prova agora. Tente de novo em instantes.";

/** A resposta de recusa da prova: o `index.ts` a devolve como `fail(mensagem, status, extra)`. */
export type RecusaDaProva = {
  mensagem: string;
  status: 400 | 403 | 409 | 429 | 503;
  extra?: Record<string, unknown>;
};

/** O que `prepararProva` devolve: a recusa, ou o que a prova precisa (`falha: null`). */
export type PreparoDaProva =
  | { falha: RecusaDaProva }
  | {
      falha: null;
      // deno-lint-ignore no-explicit-any
      questoes: any[];
      // deno-lint-ignore no-explicit-any
      curso: any;
      usadas: number;
      max: number | null;
    };

/**
 * Confere se a matrícula pode fazer a prova AGORA e traz o que ela precisa. As duas ações (`iniciar_avaliacao` e
 * `avaliacao`) recusam pelos mesmos motivos: já aprovado, aulas por concluir, sem questões, tentativas esgotadas e
 * intervalo correndo; e, com uma leitura que falhou (aulas, progresso, questões, curso, tentativas ou liberações),
 * 503 antes de qualquer regra. `comGabarito`: só a correção carrega `correta` e `comentario`; abrir a prova nunca
 * os lê. `agora` (ms) é o relógio da regra do intervalo.
 */
export async function prepararProva(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  empresaId: string,
  comGabarito: boolean,
  agora: number = Date.now()
): Promise<PreparoDaProva> {
  if (mat.avaliacao_aprovada) {
    return { falha: { mensagem: "Você já foi aprovado nesta avaliação", status: 409 } };
  }
  const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
  // a trilha ilegível parece vazia, e "todas as aulas de uma lista vazia" liberaria a prova (A7)
  if (!trilha.lida) return { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } };
  if (!trilha.aulas.every((a: { id: string }) => trilha.feitas.has(a.id))) {
    return { falha: { mensagem: "Conclua todas as aulas antes da avaliação", status: 409 } };
  }
  const [
    { data: questoes, error: erroQuestoes },
    { data: curso, error: erroCurso },
    { data: anteriores, error: erroAnteriores },
    { data: liberacoes, error: erroLiberacoes },
  ] = await Promise.all([
    supabase
      .from("treinamento_questao")
      .select(
        comGabarito
          ? "id, ordem, pergunta, opcoes, correta, comentario"
          : "id, ordem, pergunta, opcoes"
      )
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true }),
    supabase
      .from("treinamento_curso")
      .select("nota_minima, max_tentativas, intervalo_tentativa_min")
      .eq("id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("treinamento_tentativa")
      .select("numero, aprovada, created_at")
      .eq("matricula_id", mat.id)
      .order("numero", { ascending: false }),
    // liberação do RH (T18): depois da última tentativa, o intervalo não vale
    supabase
      .from("treinamento_evento")
      .select("created_at")
      .eq("matricula_id", mat.id)
      .eq("empresa_id", empresaId)
      .eq("evento", EVENTO_TENTATIVA_LIBERADA)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  // Leitura que falhou não decide a prova: sem o curso a correção usaria a nota mínima padrão e nenhum limite;
  // sem as tentativas, "0 usadas"; sem as questões, "este curso não tem avaliação"; sem as liberações, o intervalo
  // correria à toa. Todas as falhas vão ao log (uma linha por leitura) antes da resposta.
  const falhas: [string, unknown][] = [
    ["questões", erroQuestoes],
    ["curso", erroCurso],
    ["tentativas anteriores", erroAnteriores],
    ["liberações", erroLiberacoes],
  ];
  let ilegivel = false;
  for (const [leitura, erro] of falhas) {
    if (!erro) continue;
    ilegivel = true;
    console.error(`${LOG} prepararProva: ${leitura}:`, causa(erro));
  }
  if (ilegivel) return { falha: { mensagem: MSG_PROVA_INDISPONIVEL, status: 503 } };
  if (!questoes?.length) {
    return { falha: { mensagem: "Este curso não tem avaliação", status: 400 } };
  }

  const usadas = anteriores?.length ?? 0;
  const tentativas = situacaoDasTentativas({
    usadas,
    curso,
    matricula: mat,
    ultima: anteriores?.[0],
    liberadaEm: ultimaLiberacao(liberacoes),
    agora,
  });
  if (tentativas.esgotada) {
    return {
      falha: {
        mensagem: "Você usou todas as tentativas. Procure o RH para liberar uma nova.",
        status: 403,
        extra: { codigo: "LIMITE_TENTATIVAS" },
      },
    };
  }
  if (tentativas.aguardarAte !== null) {
    const libera = new Date(tentativas.aguardarAte).toISOString();
    return {
      falha: {
        mensagem: `Nova tentativa liberada às ${horaDeBrasilia(libera)}. Revise as aulas enquanto isso.`,
        status: 429,
        extra: { codigo: "AGUARDAR", liberada_em: libera },
      },
    };
  }
  return { falha: null, questoes, curso, usadas, max: tentativas.max };
}
