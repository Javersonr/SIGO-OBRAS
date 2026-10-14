/**
 * Caso com decisões no portal-funcionario (A3): o que as ações `caso_abrir`, `caso_escolher` e `caso_concluir`
 * leem do banco e o que respondem.
 *
 * A regra do roteiro (validar, refazer o caminho, etapa para o aluno, resultado do clique) é a de `caso.ts`, cópia
 * conferida do front (`lib/ead-caso.js`). Aqui fica a orquestração do lado do aluno, fora do `index.ts` (que não é
 * importável no Node) para ser testada: `prepararCaso` recebe o banco por parâmetro (`caso-aluno.test.ts` injeta um
 * banco de teste) e o resto é puro. Sem `Deno.*` e sem import de URL. O `index.ts` liga a rede, grava os eventos na
 * trilha e conclui a aula (`concluirAula`).
 *
 * O estado do caso não fica em tabela nenhuma: é refeito a cada pedido a partir das escolhas gravadas na trilha
 * (`caso_escolha` desta matrícula e aula, da rodada atual), sobre o roteiro de HOJE. Caminho que não confere mais (o
 * RH mudou o roteiro) recomeça a rodada (`caso_reiniciado`, motivo `caso_alterado`). Roteiro inválido (gravado sem
 * passar pela tela) é 409 `CASO_INVALIDO`, sem gravar nada. O navegador nunca recebe `segura`, `comentario` nem
 * `proxima` de uma opção antes do clique.
 */

import {
  escolhasDaRodada,
  estadoDoCaso,
  etapaParaAluno,
  resultadoDaEscolha,
  validarCaso,
} from "./caso.ts";
import type { EstadoDoCaso } from "./caso.ts";
import { causa } from "./conclusao.ts";
import type { RecusaDaProva } from "./prova.ts";
import { aulaDaAtividade } from "./questionario.ts";
import type { AulaDaTrilha } from "./questionario.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const LOG = "[portal-funcionario]";

/** Eventos do caso na trilha (C2): gravados só pelo servidor, nunca pela ação `evento`. */
export const EVENTO_CASO_ESCOLHA = "caso_escolha";
export const EVENTO_CASO_REINICIADO = "caso_reiniciado";
export const EVENTO_CASO_CONCLUIDO = "caso_concluido";
/** Por que a rodada recomeçou: o caminho gravado não confere com o roteiro de hoje. */
export const MOTIVO_CASO_ALTERADO = "caso_alterado";

/** A leitura do caso (roteiro ou trilha) falhou, ou o reinício não ficou gravado: o aluno só tenta de novo. */
export const MSG_CASO_INDISPONIVEL =
  "Não foi possível abrir o caso agora. Tente de novo em instantes.";

/** As recusas do caso (C5): status e o texto que o portal mostra. */
export const RECUSAS_DO_CASO = {
  CASO_INVALIDO: { status: 409, mensagem: "Este caso está com problema — avise o RH" },
  CASO_ENCERRADO: { status: 409, mensagem: "Este caso já chegou ao fim" },
  CASO_FORA_DE_ORDEM: {
    status: 409,
    mensagem: "O caso já está em outra etapa: continue de onde ele parou",
  },
  OPCAO_INVALIDA: { status: 400, mensagem: "Escolha uma das opções desta etapa" },
  CASO_INCOMPLETO: { status: 409, mensagem: "Chegue ao fim do caso para concluir" },
} as const;

export type CodigoDoCaso = keyof typeof RECUSAS_DO_CASO;

/** A recusa como o `index.ts` a devolve (`recusaDaProva`): o código vai no `extra`, junto com o que houver. */
export function recusaDoCaso(codigo: CodigoDoCaso, extra?: Record<string, unknown>): RecusaDaProva {
  const { status, mensagem } = RECUSAS_DO_CASO[codigo];
  return { mensagem, status, extra: { codigo, ...extra } };
}

export type EventoDoCaso = { evento: string; detalhe: unknown };

export type PreparoDoCaso =
  | { falha: RecusaDaProva }
  | {
      falha: null;
      aula: AulaDaTrilha;
      concluida: boolean;
      conteudo: unknown;
      eventos: EventoDoCaso[];
    };

/**
 * Confere a aula (do curso da matrícula, do tipo `caso` e liberada: `aulaDaAtividade`) e lê o roteiro (só o da
 * empresa da sessão, não apagado) e as escolhas e reinícios desta matrícula nesta aula, na ordem de gravação (o `id`
 * da trilha). Leitura com erro é 503: o caminho refeito sem a trilha toda mandaria o aluno para a etapa errada.
 * Roteiro ausente volta `conteudo: null` (a situação dele é `CASO_INVALIDO`).
 */
export async function prepararCaso(
  supabase: Db,
  // deno-lint-ignore no-explicit-any
  mat: any,
  aulaId: unknown,
  empresaId: string
): Promise<PreparoDoCaso> {
  const atividade = await aulaDaAtividade(supabase, mat, aulaId, empresaId, "caso");
  if (atividade.falha) return { falha: atividade.falha };
  const { aula, concluida } = atividade;
  const [{ data: roteiro, error: erroRoteiro }, { data: eventos, error: erroEventos }] =
    await Promise.all([
      supabase
        .from("treinamento_caso")
        .select("conteudo")
        .eq("aula_id", aula.id)
        .eq("curso_id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("treinamento_evento")
        .select("evento, detalhe")
        .eq("matricula_id", mat.id)
        .eq("aula_id", aula.id)
        .eq("empresa_id", empresaId)
        .in("evento", [EVENTO_CASO_ESCOLHA, EVENTO_CASO_REINICIADO])
        .order("id", { ascending: true }),
    ]);
  if (erroRoteiro) console.error(`${LOG} prepararCaso: roteiro:`, causa(erroRoteiro));
  if (erroEventos) console.error(`${LOG} prepararCaso: trilha:`, causa(erroEventos));
  if (erroRoteiro || erroEventos) {
    return { falha: { mensagem: MSG_CASO_INDISPONIVEL, status: 503 } };
  }
  return {
    falha: null,
    aula,
    concluida,
    conteudo: roteiro?.conteudo ?? null,
    eventos: eventos ?? [],
  };
}

export type SituacaoDoCaso =
  | { recusa: RecusaDaProva }
  | {
      recusa: null;
      rodada: number;
      escolhas: { etapa: string; opcao: number }[];
      estado: EstadoDoCaso;
      /** a rodada nova que o `index.ts` grava (`caso_reiniciado`) ANTES de responder; null = nada a gravar */
      reiniciar: { rodada: number; motivo: string } | null;
    };

/**
 * Onde o aluno está no caso, refeito das escolhas da rodada atual sobre o roteiro de hoje. Roteiro inválido: recusa
 * `CASO_INVALIDO`. Caminho gravado que não confere (o RH mudou o roteiro): a rodada seguinte começa da primeira etapa,
 * e `reiniciar` diz o que gravar na trilha.
 */
export function situacaoDoCaso(conteudo: unknown, eventos: EventoDoCaso[]): SituacaoDoCaso {
  if (validarCaso(conteudo).length > 0) return { recusa: recusaDoCaso("CASO_INVALIDO") };
  const { rodada, escolhas } = escolhasDaRodada(eventos);
  const estado = estadoDoCaso(conteudo, escolhas);
  if (estado.valido) return { recusa: null, rodada, escolhas, estado, reiniciar: null };
  if (estado.motivo !== "CAMINHO_DIVERGENTE") return { recusa: recusaDoCaso("CASO_INVALIDO") };
  const nova = rodada + 1;
  return {
    recusa: null,
    rodada: nova,
    escolhas: [],
    estado: estadoDoCaso(conteudo, []),
    reiniciar: { rodada: nova, motivo: MOTIVO_CASO_ALTERADO },
  };
}

/** `contexto` ou `reflexao` do roteiro (texto vazio se o roteiro não tem). */
const textoDo = (conteudo: unknown, campo: "contexto" | "reflexao"): string => {
  const valor =
    conteudo && typeof conteudo === "object"
      ? (conteudo as Record<string, unknown>)[campo]
      : undefined;
  return typeof valor === "string" ? valor : "";
};

/** A abertura de um caso já concluído: o aluno revê o contexto e a reflexão (não há rodada nova). */
export function respostaDoCasoConcluido(conteudo: unknown) {
  return {
    situacao: "concluido" as const,
    contexto: textoDo(conteudo, "contexto"),
    reflexao: textoDo(conteudo, "reflexao"),
  };
}

/**
 * A abertura de um caso em andamento (C5): no fim, o contexto, a reflexão e o último comentário; senão, o contexto e
 * a etapa atual só com os textos, embaralhada por `aleatorio` (o servidor passa `inteiroAleatorioSeguro`), com a
 * passagem atual por ela e o último comentário (a tela retoma de onde parou).
 */
export function respostaDaAbertura(
  conteudo: unknown,
  estado: EstadoDoCaso,
  aleatorio: (n: number) => number
) {
  const contexto = textoDo(conteudo, "contexto");
  if (estado.fim) {
    return {
      situacao: "fim" as const,
      contexto,
      reflexao: textoDo(conteudo, "reflexao"),
      ultimo: estado.ultimo,
    };
  }
  const etapaId = estado.etapaAtual as string;
  return {
    situacao: "etapa" as const,
    contexto,
    etapa: etapaParaAluno(conteudo, etapaId, aleatorio),
    passagem: estado.passagens[etapaId] ?? 1,
    ultimo: estado.ultimo,
  };
}

/**
 * O clique do aluno (C5): confere pela regra (`resultadoDaEscolha`) e devolve o detalhe do evento `caso_escolha`
 * (C2) e a resposta, ou a recusa. Fora de ordem (outra aba, página velha) leva o estado atual (`estado`, o mesmo
 * objeto da abertura) para a tela continuar de onde o caso está.
 */
export function escolhaNoCaso(
  conteudo: unknown,
  situacao: { rodada: number; estado: EstadoDoCaso },
  etapaId: string,
  opcao: unknown,
  aleatorio: (n: number) => number
) {
  const r = resultadoDaEscolha(conteudo, situacao.estado, etapaId, opcao);
  if (!r.ok) {
    const extra =
      r.codigo === "CASO_FORA_DE_ORDEM"
        ? { estado: respostaDaAbertura(conteudo, situacao.estado, aleatorio) }
        : undefined;
    return { recusa: recusaDoCaso(r.codigo, extra) };
  }
  return {
    recusa: null,
    detalhe: {
      rodada: situacao.rodada,
      etapa: etapaId,
      opcao: Number(opcao),
      segura: r.segura,
      proxima: r.proxima,
      passagem: r.passagem,
    },
    resposta: {
      comentario: r.comentario,
      segura: r.segura,
      passagem: r.passagem,
      fim: r.fim,
      etapa: r.fim || r.proxima === null ? null : etapaParaAluno(conteudo, r.proxima, aleatorio),
      reflexao: r.fim ? textoDo(conteudo, "reflexao") : null,
    },
  };
}

/**
 * Concluir o caso (C5): só com o caso no fim, nesta rodada e no roteiro de hoje; senão `CASO_INCOMPLETO`. Devolve o
 * evento extra que `concluirAula` grava antes do `aula_concluida` (`caso_concluido { rodada, escolhas }`).
 */
export function conclusaoDoCaso(situacao: {
  rodada: number;
  escolhas: unknown[];
  estado: EstadoDoCaso;
  reiniciar: unknown;
}) {
  if (situacao.reiniciar || !situacao.estado.fim) {
    return { recusa: recusaDoCaso("CASO_INCOMPLETO") };
  }
  return {
    recusa: null,
    eventoExtra: {
      evento: EVENTO_CASO_CONCLUIDO,
      detalhe: { rodada: situacao.rodada, escolhas: situacao.escolhas.length },
    },
  };
}
