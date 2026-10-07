/**
 * Edição da resposta de uma dúvida do tutor (A6, T21): módulo PURO (sem `Deno.*`, banco injetado pelo
 * `index.ts`). Teste: `duvida.test.ts`, ao lado.
 *
 * A primeira resposta continua sendo gravada pela tela do RH (a dúvida só aceita `resposta`,
 * `respondida_por` e `respondida_em` de quem não é o servidor, gatilho `duvida_so_resposta` da 0130). Já
 * EDITAR uma resposta que o aluno pode ter lido passa pelo servidor: ele troca o texto e grava na trilha
 * (só de inclusão, migração 0135) o evento `duvida_resposta_editada` com a versão ANTERIOR inteira, o autor da
 * edição e a hora. Sem o evento a edição é desfeita (`registrarOuDesfazer`, em `regras.ts`).
 */
import type { Conferencia } from "./regras.ts";

/** Ações de `funcionario-acesso` que mexem na resposta de uma dúvida. */
export const ACOES_DE_DUVIDA = new Set(["editar_resposta_duvida"]);

/** Mensagem do 403 (a tela mostra o texto como veio). */
export const MENSAGEM_SEM_EDICAO_DA_RESPOSTA =
  "Sem permissão para editar a resposta: é preciso poder editar Funcionários em Segurança do Trabalho";

/**
 * Tamanho máximo da resposta. A versão anterior vai inteira para a trilha, que não se apaga: o teto evita que
 * um texto enorme infle o registro (4.000 caracteres é bem mais que uma resposta de tutor).
 */
export const RESPOSTA_MAX = 4000;

// uuid em qualquer caixa; evita mandar lixo ao banco (22P02 viraria 500)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarDuvidaId(bruto: unknown): Conferencia<{ id: string }> {
  const id = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  if (!UUID.test(id)) return { ok: false, status: 400, mensagem: "duvida_id inválido" };
  return { ok: true, id };
}

/** O texto novo: sem os espaços das pontas, com as quebras de linha dentro do texto como vieram. */
export function validarRespostaDaDuvida(bruto: unknown): Conferencia<{ resposta: string }> {
  const resposta = typeof bruto === "string" ? bruto.trim() : "";
  if (!resposta) return { ok: false, status: 400, mensagem: "Escreva a resposta" };
  if (resposta.length > RESPOSTA_MAX) {
    return {
      ok: false,
      status: 400,
      mensagem: `A resposta pode ter no máximo ${RESPOSTA_MAX} caracteres`,
    };
  }
  return { ok: true, resposta };
}

/** A versão da resposta que a edição substitui: é o que vai para a trilha. */
export interface VersaoDaResposta {
  resposta: string;
  respondida_por: string | null;
  respondida_em: string | null;
}

interface DuvidaParaEditar {
  resposta?: string | null;
  respondida_por?: string | null;
  respondida_em?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

/**
 * Pode editar? Dúvida inexistente ou excluída é 404. Sem resposta ainda (nada a editar: responder é pelo
 * campo da dúvida, sem evento) é 409 `SEM_RESPOSTA`. O mesmo texto (fora os espaços das pontas) não muda
 * nada. Com texto novo devolve a versão anterior e `lidaEm` (o `updated_at` lido): o servidor só grava se a
 * dúvida continua assim, para duas edições ao mesmo tempo não perderem uma versão da trilha.
 */
export function decidirEdicaoDaResposta(
  duvida: DuvidaParaEditar | null | undefined,
  respostaNova: string
): Conferencia<
  { mudou: false } | { mudou: true; anterior: VersaoDaResposta; lidaEm: string | null }
> {
  if (!duvida || duvida.deleted_at) {
    return { ok: false, status: 404, mensagem: "Dúvida não encontrada" };
  }
  const anterior = typeof duvida.resposta === "string" ? duvida.resposta : "";
  if (!anterior.trim()) {
    return {
      ok: false,
      status: 409,
      codigo: "SEM_RESPOSTA",
      mensagem: "Esta dúvida ainda não foi respondida: responda pelo campo da própria dúvida",
    };
  }
  if (anterior.trim() === respostaNova.trim()) return { ok: true, mudou: false };
  return {
    ok: true,
    mudou: true,
    anterior: {
      resposta: anterior,
      respondida_por: duvida.respondida_por ?? null,
      respondida_em: duvida.respondida_em ?? null,
    },
    lidaEm: duvida.updated_at ?? null,
  };
}

/** `detalhe` do evento `duvida_resposta_editada`: quem editou, a dúvida e a versão anterior inteira. */
export function detalheDaEdicao(p: { por: string; duvidaId: string; anterior: VersaoDaResposta }) {
  return {
    por: p.por,
    duvida_id: p.duvidaId,
    resposta_anterior: p.anterior.resposta,
    respondida_por_anterior: p.anterior.respondida_por,
    respondida_em_anterior: p.anterior.respondida_em,
  };
}

/** As três colunas que a edição grava (as mesmas que o gatilho `duvida_so_resposta` deixa passar). */
export function dadosDaEdicao(p: { resposta: string; por: string; agora: Date }) {
  return {
    resposta: p.resposta,
    respondida_por: p.por,
    respondida_em: p.agora.toISOString(),
  };
}

/** Devolve a dúvida à versão anterior (quando o registro na trilha não pôde ser gravado). */
export function dadosParaDesfazerEdicao(anterior: VersaoDaResposta) {
  return {
    resposta: anterior.resposta,
    respondida_por: anterior.respondida_por,
    respondida_em: anterior.respondida_em,
  };
}

/**
 * A resposta de erro para o RH quando o evento da edição não foi gravado. `desfeito`: a resposta anterior
 * continua valendo, é só tentar de novo. `sem_registro`: a edição ficou gravada SEM o evento e sem como
 * desfazer, então a versão anterior só existe no log do servidor; repetir a edição a sobrescreveria de vez.
 */
export function falhaDoRegistroDaEdicao(resultado: "desfeito" | "sem_registro"): {
  status: 500;
  codigo: "TRILHA_FALHOU" | "EFEITO_SEM_REGISTRO";
  mensagem: string;
} {
  if (resultado === "desfeito") {
    return {
      status: 500,
      codigo: "TRILHA_FALHOU",
      mensagem:
        "Não foi possível registrar a edição na trilha de auditoria: a resposta anterior foi mantida. " +
        "Tente de novo.",
    };
  }
  return {
    status: 500,
    codigo: "EFEITO_SEM_REGISTRO",
    mensagem:
      "A resposta foi alterada, mas o registro da versão anterior na trilha de auditoria falhou e a edição " +
      "não pôde ser desfeita. NÃO edite de novo: avise o suporte para guardar a versão anterior.",
  };
}
