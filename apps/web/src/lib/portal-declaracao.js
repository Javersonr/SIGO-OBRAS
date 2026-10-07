/**
 * Declaração de ambiente e horário na tela do ALUNO (T35; NR-1, Anexo II, 4.3 e 4.4) — regras puras, sem DOM e sem
 * rede. Quem usa: pages/PortalFuncionario.jsx e components/portal-funcionario/DeclaracaoAmbientePortal.jsx. Testes
 * em portal-declaracao.test.js.
 *
 * Na 1ª abertura de um curso em cada dia (dia de Brasília) o portal mostra a orientação do RT e três itens. Quem
 * confere a versão e os itens e grava a declaração na trilha é o SERVIDOR (ação `declarar_ambiente`); a tela só
 * decide quando mostrar e o que o botão exige. A decisão é tomada UMA vez, no clique que abre o curso (e não a cada
 * recarga dos dados): passar da meia-noite com o curso aberto não derruba a tela do aluno no meio da aula.
 */
import { ITENS_DA_DECLARACAO } from "./ead-declaracao-ambiente";
import { mensagemDeFalha } from "./portal-curso";

/** Os três itens, todos desmarcados (o aluno marca um por um). */
export const MARCADOS_VAZIOS = Object.freeze(
  Object.fromEntries(ITENS_DA_DECLARACAO.map((i) => [i.id, false]))
);

/**
 * Esta matrícula precisa da declaração ANTES de abrir o curso? Sim quando o aluno ainda não declarou hoje neste
 * curso. Não: na prévia do RT ("Ver como aluno", nada é gravado); curso concluído (só abre para o certificado);
 * sem o texto em `dados` ou sem o estado do curso (o servidor não conseguiu ler: o portal não trava o aluno, e o
 * relatório do RH mostra o dia sem declaração). A declaração dos dados vale só para o dia em que o servidor a
 * calculou: com o portal aberto desde ontem, ela conta como não feita.
 */
export function precisaDeclararAmbiente({ item, declaracao, hoje, previa = false } = {}) {
  if (previa || !declaracao || !item?.declaracao_hoje) return false;
  if (item.matricula?.status === "concluido") return false;
  const { declarada, dia } = item.declaracao_hoje;
  return !(declarada === true && dia === hoje);
}

/** Quantos itens ainda faltam marcar (0 a 3). */
export function itensFaltando(marcados) {
  return ITENS_DA_DECLARACAO.filter((i) => marcados?.[i.id] !== true).length;
}

/** Os três itens estão marcados? É o que libera o botão "Declarar e abrir o curso". */
export function todosMarcados(marcados) {
  return itensFaltando(marcados) === 0;
}

/**
 * O corpo do pedido `declarar_ambiente`: a matrícula, a versão do texto que o aluno LEU (o servidor recusa se o RT
 * salvou outra no meio do caminho) e os três itens como `true`. Sem os três marcados devolve null (não há pedido).
 */
export function corpoDaDeclaracao({ matriculaId, versao, marcados } = {}) {
  if (!todosMarcados(marcados)) return null;
  return {
    matricula_id: matriculaId,
    versao,
    ...Object.fromEntries(ITENS_DA_DECLARACAO.map((i) => [i.id, true])),
  };
}

/**
 * O que a tela faz com o erro da declaração. `sessao`: a sessão caiu ou a senha provisória ainda vale (o portal
 * volta ao login). `recarregar`: o RT salvou um texto novo (409 `TEXTO_MUDOU`); a tela busca os dados de novo, mostra
 * a versão nova e o aluno confirma de novo. `mostrar`: qualquer outro erro, em português.
 */
export function tratamentoDoErroDaDeclaracao(erro) {
  const codigo = erro?.codigo;
  if (codigo === "SESSAO" || codigo === "TROCAR_SENHA") return { acao: "sessao", texto: "" };
  if (codigo === "TEXTO_MUDOU") return { acao: "recarregar", texto: mensagemDeFalha(erro) };
  return { acao: "mostrar", texto: mensagemDeFalha(erro) };
}
