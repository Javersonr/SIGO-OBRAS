/**
 * Conclusão do curso no portal-funcionario: a leitura da trilha no banco e a decisão de concluir (A7).
 *
 * Saiu do `index.ts` (que não é importável no Node) para ser testada com um banco injetado
 * (`conclusao.test.ts`). Sem `Deno.*` e sem import de URL: o banco chega por parâmetro e a regra é a de
 * `regras.ts` (`situacaoDaTrilha`, `marcoDaTrilha`, `decisaoDeConclusao`).
 *
 * O postgrest-js NÃO lança em falha de rede ou de banco: devolve `data: null` com `error`. Ler só o `data` fazia
 * uma leitura que falhou parecer uma resposta vazia: questões ilegíveis viravam "curso sem prova" (conclusão
 * permanente sem aprovação) e aulas ilegíveis, "trilha incompleta" (sem conclusão e sem segunda chance). Aqui cada
 * leitura confere o seu `error`, manda a causa ao log e o resultado diz o que foi lido (`lida`).
 */

import { decisaoDeConclusao, marcoDaTrilha, situacaoDaTrilha } from "./regras.ts";
import type { MotivoDaConclusaoAdiada } from "./regras.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const LOG = "[portal-funcionario]";

/** A mensagem do erro do PostgREST (ou o próprio erro, se não for um objeto com `message`). */
export const causa = (erro: unknown) => (erro as { message?: unknown } | null)?.message ?? erro;

/** A pausa antes da segunda leitura da trilha (a queda passageira de conexão costuma passar nesse tempo). */
export const PAUSA_DA_SEGUNDA_LEITURA_MS = 300;
const pausaPadrao = () =>
  new Promise<void>((resolver) => setTimeout(resolver, PAUSA_DA_SEGUNDA_LEITURA_MS));

/**
 * Aulas do curso em ordem + quais estão concluídas nesta matrícula. Só aulas da empresa da sessão (curso_id de
 * outra empresa → trilha vazia). `lida: false` = a leitura das aulas ou do progresso falhou (a causa foi ao log):
 * a trilha devolvida não vale como resposta, e quem chama não decide nada com ela.
 */
export async function trilhaDoCurso(
  supabase: Db,
  cursoId: string,
  matriculaId: string,
  empresaId: string
) {
  const [{ data: aulas, error: erroAulas }, { data: progs, error: erroProgs }] = await Promise.all([
    supabase
      .from("treinamento_aula")
      .select("id, ordem, tipo, duracao_seg")
      .eq("curso_id", cursoId)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true }),
    supabase
      .from("treinamento_progresso")
      .select("aula_id, concluida, concluida_em")
      .eq("matricula_id", matriculaId),
  ]);
  if (erroAulas) console.error(`${LOG} trilhaDoCurso: aulas:`, causa(erroAulas));
  if (erroProgs) console.error(`${LOG} trilhaDoCurso: progresso:`, causa(erroProgs));
  // deno-lint-ignore no-explicit-any
  const concluidas = (progs ?? []).filter((p: any) => p.concluida);
  // deno-lint-ignore no-explicit-any
  const feitas = new Set(concluidas.map((p: any) => p.aula_id));
  // quando cada aula foi concluída (o dia da conclusão do curso vem do último marco: marcoDaTrilha)
  const concluidaEm = new Map<unknown, string | null>(
    // deno-lint-ignore no-explicit-any
    concluidas.map((p: any) => [p.aula_id, p.concluida_em ?? null])
  );
  return { aulas: aulas ?? [], feitas, concluidaEm, lida: !erroAulas && !erroProgs };
}

/**
 * Conclusão recalculada só com o que o SERVIDOR grava: todas as aulas da trilha concluídas no progresso e, se o
 * curso tem prova, uma tentativa APROVADA desta matrícula neste curso. Não usa matricula.status nem
 * avaliacao_aprovada (a empresa grava a matrícula pela API).
 *
 * Cada leitura confere o seu `error` (A7): `trilhaLida` = aulas e progresso lidos; `provaLida` = questões e
 * tentativa aprovada lidas; `lida` = as duas. Com qualquer uma ilegível, `concluido` é false: nenhuma ação conclui,
 * nem emite certificado, com uma leitura que falhou (a decisão de adiar fica com `decisaoDeConclusao`).
 */
// deno-lint-ignore no-explicit-any
export async function situacaoReal(supabase: Db, mat: any, empresaId: string) {
  const [
    trilha,
    { data: questoes, error: erroQuestoes },
    { data: aprovadas, error: erroAprovadas },
  ] = await Promise.all([
    trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId),
    supabase
      .from("treinamento_questao")
      .select("id")
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("treinamento_tentativa")
      .select("numero, nota, created_at")
      .eq("matricula_id", mat.id)
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .eq("aprovada", true)
      .order("numero", { ascending: false })
      .limit(1),
  ]);
  if (erroQuestoes) console.error(`${LOG} situacaoReal: questões:`, causa(erroQuestoes));
  if (erroAprovadas) console.error(`${LOG} situacaoReal: aprovação:`, causa(erroAprovadas));
  const trilhaLida = trilha.lida;
  const provaLida = !erroQuestoes && !erroAprovadas;
  const lida = trilhaLida && provaLida;
  const sit = situacaoDaTrilha({
    aulas: trilha.aulas,
    feitas: trilha.feitas,
    temAvaliacao: (questoes ?? []).length > 0,
    aprovacao: aprovadas?.[0] ?? null,
  });
  return {
    ...sit,
    // a conta feita com uma leitura que falhou não conclui nada
    concluido: lida && sit.concluido,
    trilhaLida,
    provaLida,
    lida,
    // quando a trilha ficou completa: a última aula concluída ou a aprovação, o que veio por último
    marco: marcoDaTrilha({
      aulas: trilha.aulas,
      concluidaEm: trilha.concluidaEm,
      aprovadaEm: aprovadas?.[0]?.created_at ?? null,
    }),
  };
}

/**
 * Conclui a matrícula se a trilha está completa e devolve o que isso deu. Quem chama: o progresso (em TODA aula
 * que passa a concluída, não só na última), a avaliação (em toda aprovação), o pedido de certificado e a retomada
 * do `dados`.
 *
 * A conclusão é permanente: só decide com tudo lido (aulas, progresso, questões, tentativa aprovada e curso).
 * Se alguma leitura falha, lê tudo de novo uma vez (depois de `esperar`): a queda passageira se resolve aqui. Se
 * ainda falha:
 * - aulas ou progresso ilegíveis: NÃO conclui e NÃO marca. Como o progresso chama isto em toda aula concluída, não
 *   dá para saber se era a última; marcar às cegas deixaria a retomada concluir uma trilha incompleta (a aula que o
 *   RH apagou e o aluno não fez). A causa vai ao log, e a conclusão fica para a próxima ação que a chame (outra
 *   aula, a aprovação ou o pedido de certificado). Se era a última aula de um curso sem prova e sem certificado
 *   (apoio), não há outra: a matrícula fica em andamento. É o preço de não marcar às cegas.
 * - aulas e progresso lidos e completos, e só a prova (questões ou aprovação) ou o curso ilegíveis: NÃO conclui e,
 *   se quem chamou passou `adiar`, grava o evento `conclusao_adiada` (`prova_nao_lida` ou `curso_nao_lido`).
 * Com erro ao gravar a conclusão, também não conclui e marca `gravacao_falhou`. Quem tenta de novo é
 * `retomarConclusoes` (regras.ts), que o `dados` chama a cada abertura do portal: relê tudo e conclui SÓ as
 * matrículas marcadas, com as duas travas (trilha completa pelo banco e "fez a prova e não passou"), então uma
 * trilha que apenas parece completa pelo estado de hoje do curso nunca é concluída por ali. `adiar` fica de fora do
 * pedido de certificado (o aluno vê o 503 e tenta de novo) e da própria retomada (a marca já existe). A
 * `data_conclusao` é o dia do último marco da trilha, não o de hoje.
 */
export async function concluirSeCompleto(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  empresaId: string,
  adiar?: (motivo: MotivoDaConclusaoAdiada) => Promise<unknown>,
  esperar: () => Promise<void> = pausaPadrao
) {
  const ler = () =>
    Promise.all([
      situacaoReal(supabase, mat, empresaId),
      supabase
        .from("treinamento_curso")
        .select("validade_meses, modalidade")
        .eq("id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
    ]);
  let [sit, { data: curso, error: erroCurso }] = await ler();
  if (!sit.lida || erroCurso) {
    if (erroCurso) console.error(`${LOG} concluirSeCompleto: curso:`, causa(erroCurso));
    // segunda leitura antes de desistir ou adiar
    await esperar();
    [sit, { data: curso, error: erroCurso }] = await ler();
  }
  if (erroCurso) console.error(`${LOG} concluirSeCompleto: curso:`, causa(erroCurso));
  if (!sit.trilhaLida) {
    console.error(
      `${LOG} concluirSeCompleto: trilha ilegível nas duas leituras; não conclui nem marca`,
      mat.id
    );
  }
  const { resultado, patch, motivo } = decisaoDeConclusao({
    sit,
    curso,
    cursoLido: !erroCurso,
    hoje: new Date(),
    marco: sit.marco,
  });
  if (patch) {
    const { error: erroGravacao } = await supabase
      .from("treinamento_matricula")
      .update(patch)
      .eq("id", mat.id)
      .eq("empresa_id", empresaId);
    if (erroGravacao) {
      // o UPDATE falhou: a matrícula segue aberta, e dizer que concluiu faria o portal e o certificado
      // seguirem como se a conclusão existisse
      console.error(`${LOG} concluirSeCompleto: gravação:`, causa(erroGravacao));
      await adiar?.("gravacao_falhou");
      return {
        status: "em_andamento",
        concluiu: false,
        precisaAvaliacao: false,
        data_conclusao: null as string | null,
      };
    }
  } else if (motivo) {
    await adiar?.(motivo);
  }
  return { ...resultado, data_conclusao: (patch?.data_conclusao as string | undefined) ?? null };
}
