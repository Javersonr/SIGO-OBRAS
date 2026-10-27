/**
 * Questionário do módulo no portal do aluno (A2) — regras puras, sem DOM e sem rede.
 *
 * O questionário é do SERVIDOR (ações `questionario_abrir` e `questionario_enviar` do portal-funcionario): ele
 * sorteia as questões e as alternativas a cada tentativa, corrige com a nota mínima do módulo e devolve a
 * correção comentada ao aprovado E ao não aprovado (é estudo; a cobrança é a prova final). Tentativas livres,
 * sem intervalo. Aula concluída: a abertura devolve a melhor nota e quantas tentativas houve.
 *
 * A tela reaproveita as regras da prova final (lib/portal-curso.js): `provaParaTela` (questões na ordem do
 * servidor, resposta pelo índice ORIGINAL da alternativa) e o rascunho das respostas no aparelho, com um id
 * próprio por questionário para não se misturar com o da prova final.
 * Quem usa: components/portal-funcionario/QuestionarioPortal.jsx. Testes em portal-questionario.test.js.
 */
import { mensagemDeFalha, provaParaTela, provaPrecisaReabrir } from "./portal-curso";

export const MSG_QUESTIONARIO_INVALIDO =
  "O questionário chegou incompleto. Tente de novo; se continuar, avise o RH.";

/** Recusas da abertura em que tentar de novo não adianta: falta o RH cadastrar questões, ou a aula anterior. */
export const CODIGOS_SEM_NOVA_TENTATIVA = ["QUESTIONARIO_VAZIO", "AULA_BLOQUEADA"];

const ehSessao = (erro) => erro?.codigo === "SESSAO" || erro?.codigo === "TROCAR_SENHA";
const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * "Matrícula" usada nas chaves do rascunho (`guardarRascunhoProva`/`lerRascunhoProva` de portal-curso.js). A
 * chave da prova final é `sigo_portal_prova:<matrícula>:<tentativa>`; a do questionário fica
 * `sigo_portal_prova:<matrícula>:questionario:<aula>:<tentativa>`: nada se mistura, e sair do portal apaga as
 * duas pelo mesmo prefixo.
 */
export function idDoRascunhoDoQuestionario(matriculaId, aulaId) {
  return `${matriculaId}:questionario:${aulaId}`;
}

/**
 * A resposta de `questionario_abrir` pronta para a tela, ou null se não tem a forma esperada:
 * - aula concluída: `{ fase: "concluido", notaMinima, melhorNota, tentativas }`;
 * - tentativa aberta: `{ fase: "respondendo", prova }` (`prova` de `provaParaTela`: gabarito e comentário só
 *   na prévia do RT, `previa: true`).
 */
export function questionarioParaTela(resposta, { previa = false } = {}) {
  if (resposta?.concluida === true) {
    return {
      fase: "concluido",
      notaMinima: numero(resposta.nota_minima),
      melhorNota: numero(resposta.melhor_nota),
      tentativas: Number.isInteger(resposta.tentativas) ? resposta.tentativas : null,
    };
  }
  const prova = provaParaTela(resposta, { previa });
  return prova ? { fase: "respondendo", prova } : null;
}

/** "Nota mínima 80% · tentativa 2 · a correção comentada aparece depois de enviar". */
export function detalheDaTentativa(prova) {
  const partes = [];
  if (numero(prova?.notaMinima) !== null) partes.push(`Nota mínima ${prova.notaMinima}%`);
  if (Number.isInteger(prova?.tentativa)) partes.push(`tentativa ${prova.tentativa}`);
  partes.push("a correção comentada aparece depois de enviar");
  const texto = partes.join(" · ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Menor número de acertos que atinge a nota mínima, com a conta do servidor (nota inteira arredondada):
 * 8 questões e 80% pedem 7 (6/8 = 75%).
 */
export function acertosNecessarios(total, notaMinima) {
  if (!Number.isInteger(total) || total <= 0) return 0;
  const minima = numero(notaMinima) ?? 0;
  for (let acertos = 0; acertos <= total; acertos++) {
    if (Math.round((acertos / total) * 100) >= minima) return acertos;
  }
  return total;
}

/** O que a tela diz depois do envio: o placar e o próximo passo (o aprovado segue; o outro tenta de novo). */
export function resultadoDoQuestionario(resultado) {
  const r = resultado && typeof resultado === "object" ? resultado : {};
  const aprovada = r.aprovada === true;
  const nota = numero(r.nota);
  const acertos = Number.isInteger(r.acertos) ? r.acertos : null;
  const total = Number.isInteger(r.total) ? r.total : null;
  let titulo;
  if (nota === null) titulo = aprovada ? "Resultado: satisfatório" : "Resultado: insatisfatório";
  else if (acertos !== null && total !== null) titulo = `Nota: ${nota}% (${acertos}/${total})`;
  else titulo = `Nota: ${nota}%`;
  if (aprovada) {
    return {
      aprovada,
      titulo,
      mensagem: "Questionário concluído. Confira abaixo a correção comentada.",
    };
  }
  const minima = numero(r.nota_minima);
  const meta =
    minima !== null && total
      ? `Para concluir, acerte pelo menos ${acertosNecessarios(total, minima)} de ${total} (nota mínima ${minima}%).`
      : "Você ainda não atingiu a nota mínima.";
  return { aprovada, titulo, mensagem: `${meta} Confira a correção comentada e tente de novo.` };
}

/** "Questionário concluído · melhor nota 88% · 2 tentativas · nota mínima 80%". */
export function textoDoQuestionarioConcluido({ melhorNota, tentativas, notaMinima } = {}) {
  const partes = ["Questionário concluído"];
  if (numero(melhorNota) !== null) partes.push(`melhor nota ${melhorNota}%`);
  if (Number.isInteger(tentativas) && tentativas > 0) {
    partes.push(tentativas === 1 ? "1 tentativa" : `${tentativas} tentativas`);
  }
  if (numero(notaMinima) !== null) partes.push(`nota mínima ${notaMinima}%`);
  return partes.join(" · ");
}

/** Aviso depois de abrir o questionário de novo porque o envio não valia mais (mesmos códigos da prova). */
export function avisoDoQuestionarioReaberto(erro) {
  if (erro?.codigo === "PROVA_ALTERADA") {
    return "O RH alterou as questões enquanto você respondia: o questionário foi aberto de novo. Confira suas respostas e envie.";
  }
  return "Este questionário não estava mais aberto: ele foi aberto de novo. Confira suas respostas e envie.";
}

/** "Responda todas as questões antes de enviar: falta 1 (a primeira sem resposta é a questão 3)." */
export function textoDasFaltas({ faltam, primeiraSemResposta } = {}) {
  const quantas = faltam === 1 ? "falta 1" : `faltam ${faltam}`;
  return `Responda todas as questões antes de enviar: ${quantas} (a primeira sem resposta é a questão ${
    primeiraSemResposta + 1
  }).`;
}

/** Falha ao abrir: a sessão vai para o portal; o resto vira mensagem, com ou sem "Tentar de novo". */
export function reacaoAoErroDaAbertura(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  return {
    acao: "erro",
    mensagem: mensagemDeFalha(erro),
    definitivo: CODIGOS_SEM_NOVA_TENTATIVA.includes(erro?.codigo),
  };
}

/**
 * Recusa do envio:
 * - sessão: o portal pede login de novo;
 * - questionário que não vale mais (`PROVA_NAO_INICIADA`, `PROVA_ALTERADA`): abre de novo, e as respostas que
 *   ainda valem continuam marcadas (rascunho);
 * - `QUESTIONARIO_CONCLUIDO` (concluído em outra aba): a lista é atualizada e a tela mostra a melhor nota;
 * - o resto (rede, respostas incompletas, tentativa repetida): a mensagem fica e o aluno envia de novo.
 */
export function reacaoAoErroDoEnvio(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  if (provaPrecisaReabrir(erro)) {
    return { acao: "reabrir", aviso: avisoDoQuestionarioReaberto(erro) };
  }
  if (erro?.codigo === "QUESTIONARIO_CONCLUIDO") return { acao: "concluido" };
  return { acao: "mensagem", mensagem: mensagemDeFalha(erro) };
}
