/**
 * Caso com decisões no portal do aluno (A3) — regras puras, sem DOM e sem rede.
 *
 * Quem decide a etapa atual, se a escolha foi segura e o fim é o SERVIDOR (ações `caso_abrir`, `caso_escolher` e
 * `caso_concluir`); a tela só passa de uma resposta para a próxima tela:
 * etapa (pergunta e opções só com o texto) → comentário da escolha (verde na segura, âmbar na insegura) →
 * "Continuar" → próxima etapa ou "Para refletir" → "Concluir caso" → concluído.
 * As opções nunca trazem `segura`, `comentario` ou `proxima` antes do clique; mesmo que viessem, a tela as
 * descarta (só `indice` e `texto` passam).
 * Quem usa: components/portal-funcionario/CasoPortal.jsx. Testes em portal-caso.test.js.
 */
import { mensagemDeFalha } from "./portal-curso";

export const MSG_CASO_RESPOSTA_INVALIDA =
  "O caso chegou incompleto. Tente de novo; se continuar, avise o RH.";
export const MSG_CASO_ATUALIZADO =
  "O caso andou em outra aba ou aparelho: a tela foi atualizada para a etapa atual.";
export const MSG_CASO_ENCERRADO = "Este caso já chegou ao fim: leia a reflexão e conclua.";
export const MSG_OPCAO_INVALIDA =
  "Essa opção não está mais no caso (o RH pode tê-lo alterado): a etapa foi aberta de novo.";

/** Recusas em que tentar de novo não adianta: o roteiro está com problema, ou falta a aula anterior. */
const CODIGOS_DEFINITIVOS = ["CASO_INVALIDO", "AULA_BLOQUEADA"];

const ehSessao = (erro) => erro?.codigo === "SESSAO" || erro?.codigo === "TROCAR_SENHA";
const texto = (v) => (typeof v === "string" ? v : "");

/** A etapa para a tela, só com o que o aluno pode ver; null se não tem a forma esperada. */
function etapaDaTela(etapa) {
  const valida =
    !!etapa &&
    typeof etapa.id === "string" &&
    etapa.id !== "" &&
    typeof etapa.pergunta === "string" &&
    Array.isArray(etapa.opcoes) &&
    etapa.opcoes.length > 0 &&
    etapa.opcoes.every(
      (o) => o && Number.isInteger(o.indice) && o.indice >= 0 && typeof o.texto === "string"
    );
  if (!valida) return null;
  return {
    id: etapa.id,
    pergunta: etapa.pergunta,
    opcoes: etapa.opcoes.map((o) => ({ indice: o.indice, texto: o.texto })),
  };
}

function ultimoDaTela(ultimo) {
  return ultimo && typeof ultimo.comentario === "string" && typeof ultimo.segura === "boolean"
    ? { comentario: ultimo.comentario, segura: ultimo.segura }
    : null;
}

/**
 * A resposta de `caso_abrir` (ou o `estado` de um `CASO_FORA_DE_ORDEM`) pronta para a tela, ou null:
 * - `{ fase: "etapa", contexto, etapa, passagem, ultimo }` (`passagem` = vezes nesta etapa nesta rodada);
 * - `{ fase: "fim", contexto, reflexao, ultimo }`;
 * - `{ fase: "concluido", contexto, reflexao }`.
 */
export function casoParaTela(resposta) {
  const r = resposta && typeof resposta === "object" ? resposta : null;
  if (!r) return null;
  const contexto = texto(r.contexto);
  if (r.situacao === "concluido") {
    return { fase: "concluido", contexto, reflexao: texto(r.reflexao) };
  }
  if (r.situacao === "fim") {
    return { fase: "fim", contexto, reflexao: texto(r.reflexao), ultimo: ultimoDaTela(r.ultimo) };
  }
  if (r.situacao !== "etapa") return null;
  const etapa = etapaDaTela(r.etapa);
  if (!etapa) return null;
  return {
    fase: "etapa",
    contexto,
    etapa,
    passagem: Number.isInteger(r.passagem) && r.passagem >= 1 ? r.passagem : null,
    ultimo: ultimoDaTela(r.ultimo),
  };
}

/**
 * Depois de `caso_escolher`: a tela do comentário (a pergunta respondida, a opção escolhida e o comentário,
 * em destaque) e, em `seguinte`, o que vem com o "Continuar" (a próxima etapa ou "Para refletir"). Voltar à
 * mesma etapa soma uma passagem; numa etapa nova a passagem fica desconhecida (null). null se a resposta não
 * tem a forma esperada ou se a tela não estava numa etapa.
 */
export function telaDepoisDaEscolha(tela, resposta, indice) {
  if (tela?.fase !== "etapa" || !tela.etapa) return null;
  const r = resposta && typeof resposta === "object" ? resposta : null;
  if (
    !r ||
    typeof r.comentario !== "string" ||
    typeof r.segura !== "boolean" ||
    typeof r.fim !== "boolean"
  ) {
    return null;
  }
  const contexto = texto(tela.contexto);
  let seguinte;
  if (r.fim) {
    seguinte = { fase: "fim", contexto, reflexao: texto(r.reflexao), ultimo: null };
  } else {
    const etapa = etapaDaTela(r.etapa);
    if (!etapa) return null;
    const mesma = etapa.id === tela.etapa.id;
    seguinte = {
      fase: "etapa",
      contexto,
      etapa,
      passagem: mesma ? (tela.passagem ?? 1) + 1 : null,
      ultimo: null,
    };
  }
  return {
    fase: "comentario",
    contexto,
    etapa: tela.etapa,
    escolhida: tela.etapa.opcoes.find((o) => o.indice === indice)?.texto ?? "",
    comentario: r.comentario,
    segura: r.segura,
    fim: r.fim,
    seguinte,
  };
}

/** Depois de `caso_concluir`: o caso concluído, com o contexto e a reflexão para rever. */
export function telaConcluida(tela) {
  return { fase: "concluido", contexto: texto(tela?.contexto), reflexao: texto(tela?.reflexao) };
}

/** Falha ao abrir o caso: a sessão vai ao portal; o resto vira mensagem, com ou sem "Tentar de novo". */
export function reacaoAoErroDaAberturaDoCaso(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  return {
    acao: "erro",
    mensagem: mensagemDeFalha(erro),
    definitivo: CODIGOS_DEFINITIVOS.includes(erro?.codigo),
  };
}

/**
 * Recusa de uma escolha ou da conclusão. O servidor é quem sabe onde o caso está:
 * - `CASO_FORA_DE_ORDEM`: a tela vai para o `estado` que ele mandou (sem estado legível, abre de novo);
 * - `CASO_ENCERRADO`, `OPCAO_INVALIDA`, `CASO_INCOMPLETO`: abre de novo, com o aviso;
 * - `CASO_INVALIDO`, `AULA_BLOQUEADA`: erro sem "Tentar de novo";
 * - sessão: o portal pede login; o resto (rede, resposta fora do formato): a mensagem fica e a tela não muda.
 */
export function reacaoAoErroDoCaso(erro) {
  if (ehSessao(erro)) return { acao: "sessao" };
  switch (erro?.codigo) {
    case "CASO_FORA_DE_ORDEM": {
      const tela = casoParaTela(erro.extra?.estado);
      return tela
        ? { acao: "tela", tela, aviso: MSG_CASO_ATUALIZADO }
        : { acao: "reabrir", aviso: MSG_CASO_ATUALIZADO };
    }
    case "CASO_ENCERRADO":
      return { acao: "reabrir", aviso: MSG_CASO_ENCERRADO };
    case "OPCAO_INVALIDA":
      return { acao: "reabrir", aviso: MSG_OPCAO_INVALIDA };
    case "CASO_INCOMPLETO":
      return { acao: "reabrir", aviso: mensagemDeFalha(erro) };
    default:
      if (CODIGOS_DEFINITIVOS.includes(erro?.codigo)) {
        return { acao: "erro", mensagem: mensagemDeFalha(erro), definitivo: true };
      }
      return { acao: "mensagem", mensagem: mensagemDeFalha(erro) };
  }
}
