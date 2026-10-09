/**
 * Despacho de uma chamada de ferramenta do conector do Claude: passos 6 a 10 das checagens
 * (os passos 1 a 5 já passaram em contexto.ts).
 *
 *   6. permissão da ferramenta (ANTES do limite: sem permissão, nenhuma tentativa é gasta);
 *   7. limite por usuário e ferramenta, com falha fechada;
 *   8. entrada grande e campos fora da lista (schema com additionalProperties:false);
 *   9. execução;
 *  10. auditoria, com alvo e motivo.
 *
 * Puro: o limite, a auditoria e as dependências entram injetados (o index.ts só liga a rede).
 */
import { MSG_MUITAS_TENTATIVAS, type Consumo } from "../_shared/limite-tentativas.ts";
import { ErroCamada } from "../_shared/conector/camada-empresa.ts";
import {
  camposForaDoSchema,
  LIMITE_JSON_ENTRADA,
  uuidOuNull,
} from "../_shared/conector/entrada.ts";
import {
  atendeExigencia,
  exigenciaDaFerramenta,
  rotuloExigencia,
} from "../_shared/conector/permissoes-ferramentas.ts";
import type { ResultadoTool } from "../_shared/mcp/protocolo.ts";
import {
  resultadoJson,
  type DepsFerramenta,
  type Ferramenta,
  type ResultadoFerramenta,
} from "./registro.ts";

export const LIMITE_LEITURA_HORA = 300;
export const LIMITE_GRAVACAO_HORA = 60;

export interface LinhaAuditoria {
  ferramenta: string;
  resultado: "ok" | "negado" | "erro";
  motivo?: string | null;
  alvo?: string | null;
}

export interface DepsDespacho {
  ferramentas: Ferramenta[];
  deps: DepsFerramenta;
  consumirLimite(nome: string, leitura: boolean): Promise<Consumo>;
  auditar(linha: LinhaAuditoria): Promise<void>; // o index acrescenta empresa_id, usuario_email, autorizacao_id, cliente e ip
}

const CHAVES_DE_ALVO = ["oportunidade_id", "atestado_id", "link_id", "arquivo_id"];

/** O primeiro de args.oportunidade_id | atestado_id | link_id | arquivo_id que for UUID. */
export function alvoDosArgs(args: Record<string, unknown>): string | null {
  for (const k of CHAVES_DE_ALVO) {
    const u = uuidOuNull(args?.[k]);
    if (u) return u;
  }
  return null;
}

function tamanhoJson(args: unknown): number {
  try {
    return JSON.stringify(args)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function despachar(
  nome: string,
  args: Record<string, unknown>,
  d: DepsDespacho
): Promise<ResultadoTool> {
  // a auditoria nunca derruba a resposta da ferramenta
  const auditar = async (linha: LinhaAuditoria) => {
    try {
      await d.auditar(linha);
    } catch (e) {
      console.error("[mcp] auditoria:", (e as Error)?.message ?? String(e));
    }
  };

  const f = d.ferramentas.find((x) => x.def.name === nome);
  if (!f) {
    await auditar({ ferramenta: nome, resultado: "erro", motivo: "desconhecida" });
    return resultadoJson(
      { erro: `Ferramenta desconhecida: ${nome}`, motivo: "desconhecida" },
      true
    );
  }

  const exigencia = exigenciaDaFerramenta(nome, args);
  if (!atendeExigencia(d.deps.ctx.vinculo, exigencia)) {
    const rotulo = rotuloExigencia(exigencia);
    await auditar({
      ferramenta: nome,
      resultado: "negado",
      motivo: "sem_permissao",
      alvo: alvoDosArgs(args),
    });
    return resultadoJson(
      {
        erro: `Seu usuário não tem a permissão ${rotulo} no SIGO.`,
        motivo: "sem_permissao",
        permissao_necessaria: rotulo,
      },
      true
    );
  }

  const lim = await d.consumirLimite(nome, f.def.annotations.readOnlyHint === true);
  if (lim.indisponivel) {
    // limitador fora do ar não é excesso de uso: sem auditoria com motivo falso
    return resultadoJson(
      { erro: "SIGO indisponível no momento. Tente de novo.", motivo: "indisponivel" },
      true
    );
  }
  if (!lim.permitido) {
    await auditar({
      ferramenta: nome,
      resultado: "negado",
      motivo: "limite",
      alvo: alvoDosArgs(args),
    });
    return resultadoJson({ erro: MSG_MUITAS_TENTATIVAS, motivo: "limite" }, true);
  }

  if (tamanhoJson(args) > LIMITE_JSON_ENTRADA) {
    await auditar({ ferramenta: nome, resultado: "erro", motivo: "entrada_grande" });
    return resultadoJson(
      {
        erro: "Entrada grande demais para o SIGO (até 3.000.000 caracteres). Divida o envio.",
        motivo: "entrada_grande",
      },
      true
    );
  }

  const campos = camposForaDoSchema(args, f.def.inputSchema);
  if (campos.length) {
    await auditar({
      ferramenta: nome,
      resultado: "erro",
      motivo: "campos_fora_da_lista",
      alvo: alvoDosArgs(args),
    });
    return resultadoJson(
      {
        erro: `Campos não aceitos pelo SIGO: ${campos.join(", ")}.`,
        motivo: "campos_fora_da_lista",
        campos,
      },
      true
    );
  }

  let r: ResultadoFerramenta;
  try {
    r = await f.executar(args, d.deps);
  } catch (e) {
    console.error("[mcp] ferramenta", nome, (e as Error)?.message ?? String(e));
    const motivo =
      e instanceof ErroCamada && e.codigo === "campo_proibido" ? "campo_proibido" : "excecao";
    await auditar({ ferramenta: nome, resultado: "erro", motivo, alvo: alvoDosArgs(args) });
    return resultadoJson(
      { erro: "Erro interno ao executar a ferramenta. Tente de novo.", motivo },
      true
    );
  }
  await auditar({
    ferramenta: nome,
    resultado: r.resultado.isError ? "erro" : "ok",
    motivo: r.motivo ?? null,
    alvo: r.alvo ?? alvoDosArgs(args),
  });
  return r.resultado;
}
