/**
 * Registro das ferramentas do conector do Claude: o formato de uma ferramenta e os helpers de
 * resultado. Cada parte do Plano 2 (arquivos, edital, acervo, orçamento) exporta do próprio arquivo
 * FERRAMENTAS_<PARTE>, INSTRUCOES_<PARTE> e PROMPTS_<PARTE>; o ferramentas.ts junta tudo.
 *
 * Uma ferramenta só recebe `db` (CamadaEmpresa) e `storage`, nunca o admin: todo acesso a tabela
 * fica preso à empresa da chave. Puro (importável no Node).
 */
import type { PromptDef, ResultadoTool, ToolDef } from "../_shared/mcp/protocolo.ts";
import type { CamadaEmpresa, StorageConector } from "../_shared/conector/camada-empresa.ts";
import { uuidOuNull } from "../_shared/conector/entrada.ts";
import type { ContextoMcp } from "./contexto.ts";

export type { PromptDef };

export interface DepsFerramenta {
  ctx: ContextoMcp;
  db: CamadaEmpresa;
  storage: StorageConector;
  fetchFn: typeof fetch;
  agora: Date; // um instante por chamada
}

export interface ResultadoFerramenta {
  resultado: ResultadoTool;
  alvo?: string | null; // vai para mcp_auditoria.alvo (id da oportunidade/atestado/link)
  motivo?: string | null; // vai para mcp_auditoria.motivo
}

export interface Ferramenta {
  def: ToolDef;
  executar(args: Record<string, unknown>, deps: DepsFerramenta): Promise<ResultadoFerramenta>;
}

export function resultadoJson(obj: Record<string, unknown>, isError = false): ResultadoTool {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
    structuredContent: obj,
    isError,
  };
}

export function sucesso(
  obj: Record<string, unknown>,
  extras: { alvo?: string | null; motivo?: string | null } = {}
): ResultadoFerramenta {
  return {
    resultado: resultadoJson(obj, false),
    alvo: extras.alvo ?? null,
    motivo: extras.motivo ?? null,
  };
}

/** structuredContent = { erro: mensagem, motivo, ...detalhes }, isError true. */
export function falha(
  mensagem: string,
  motivo: string,
  detalhes: Record<string, unknown> = {},
  alvo: string | null = null
): ResultadoFerramenta {
  return { resultado: resultadoJson({ erro: mensagem, motivo, ...detalhes }, true), alvo, motivo };
}

export type Coisa = "oportunidade" | "atestado" | "arquivo" | "link";

const NAO_ENCONTRADO: Record<Coisa, string> = {
  oportunidade: "Oportunidade não encontrada nesta empresa.",
  atestado: "Atestado não encontrado nesta empresa.",
  arquivo: "Arquivo não encontrado nesta oportunidade.",
  link: "Link de envio não encontrado nesta empresa.",
};

/** O mesmo texto para inexistente e para outra empresa (não revela o que existe fora dela). */
export function naoEncontrado(coisa: Coisa, id?: string | null): ResultadoFerramenta {
  return falha(NAO_ENCONTRADO[coisa], "nao_encontrado", {}, uuidOuNull(id));
}
