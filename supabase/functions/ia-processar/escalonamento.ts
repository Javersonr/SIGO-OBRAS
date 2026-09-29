/**
 * escalonamento — "trocar automático os modelos quando tiver dificuldade"
 * (pedido do dono): chama a IA no nível PADRÃO; se o resultado vier fraco
 * (heurística da ação) ou com erro, refaz no nível FORTE e devolve a resposta
 * mais completa (mais campos preenchidos). Sem chave nenhuma, para na 1ª.
 *
 * O provedor e o modelo de cada nível são decididos pelo chamarIA
 * (_shared/ia.ts: Gemini e, se falhar, OpenAI). Toda chamada — inclusive
 * erro e fallback de provedor — entra no medidor de uso.
 *
 * Puro: o chamarIA vem por parâmetro (o index passa o de _shared/ia.ts) —
 * testável em Node.
 */
import type { NivelIA, OpcoesIA, ProvedorIA, RespostaIA } from "../_shared/ia-tipos.ts";
import { contarPreenchidos } from "./edital-regras.ts";
import { contabilizar, type MedidorUso } from "./ia-uso.ts";

export type ChamarIA = (o: OpcoesIA) => Promise<RespostaIA>;

export type RespostaEscalonada =
  | { ok: true; resultado: unknown; modelo: string; provedor: ProvedorIA; nivel: NivelIA }
  | { ok: false; erro: string };

const NIVEIS: NivelIA[] = ["padrao", "forte"];

export async function chamarComEscalonamento(
  chamar: ChamarIA,
  opts: Omit<OpcoesIA, "nivel">,
  // deno-lint-ignore no-explicit-any
  estaFraco?: (resultado: any) => boolean,
  medidor?: MedidorUso
): Promise<RespostaEscalonada> {
  let melhor: {
    resultado: unknown;
    pontos: number;
    modelo: string;
    provedor: ProvedorIA;
    nivel: NivelIA;
  } | null = null;
  let ultimoErro = "IA indisponível";
  for (const nivel of NIVEIS) {
    const r = await chamar({ ...opts, nivel });
    contabilizar(medidor, r);
    if (!r.ok) {
      ultimoErro = r.erro;
      if (r.erro === "IA_NAO_CONFIGURADA") return { ok: false, erro: r.erro };
      continue; // erro/JSON inválido → tenta o nível forte
    }
    const pontos = contarPreenchidos(r.resultado);
    if (!melhor || pontos > melhor.pontos) {
      melhor = { resultado: r.resultado, pontos, modelo: r.modelo, provedor: r.provedor, nivel };
    }
    if (!estaFraco || !estaFraco(r.resultado)) break; // bom o suficiente, para aqui
  }
  if (!melhor) return { ok: false, erro: ultimoErro };
  const { pontos: _p, ...resposta } = melhor;
  return { ok: true, ...resposta };
}
