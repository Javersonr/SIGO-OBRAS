/**
 * Permissão de cada ferramenta do conector do Claude (spec 25/09 §4.5 e spec 08/10 §2), com os
 * mesmos nomes das telas. Puro.
 *
 * Uma Exigencia é uma lista de grupos: TODOS os grupos precisam passar (E), e dentro de um grupo
 * basta UMA permissão (OU). [] = só as checagens de acesso; [[]] = nega sempre.
 * A conferência usa temPermissaoServidor (Admin e dono passam), e só roda DEPOIS das checagens de
 * acesso do contexto (chave, usuário, vínculo, empresa, plano).
 */
import { temPermissaoServidor, type Vinculo } from "./acesso.ts";

export type Permissao = readonly [modulo: string, aba: string | null, funcao: string | null];
/** E entre grupos; OU dentro do grupo. [] = só as checagens de acesso. [[]] = nega. */
export type Exigencia = readonly (readonly Permissao[])[];

export const LER: Exigencia = [[["Oportunidades", "Lista", null]]];
export const CRIAR_OPORTUNIDADE: Exigencia = [[["Oportunidades", "Lista", "criar"]]];
export const EDITAR_OPORTUNIDADE: Exigencia = [[["Oportunidades", "Lista", "editar"]]];
export const ANEXAR_OPORTUNIDADE: Exigencia = [[["Oportunidades", "Arquivos", "criar"]]];
/** Spec 08/10: "Oportunidades → editar e aba Orçamento → editar" (a tela aceita também "Orcamento"). */
export const EDITAR_ORCAMENTO: Exigencia = [
  [["Oportunidades", "Lista", "editar"]],
  [
    ["Oportunidades", "Orçamento", "editar"],
    ["Oportunidades", "Orcamento", "editar"],
  ],
];
export const NEGAR: Exigencia = [[]];

export const NOMES_FERRAMENTAS: readonly string[] = [
  "empresa_atual",
  "gerar_link_envio",
  "status_envio",
  "registrar_arquivos",
  "ler_edital_anexado",
  "buscar_oportunidades",
  "obter_oportunidade",
  "criar_ou_atualizar_oportunidade",
  "registrar_atende",
  "adicionar_nota",
  "ler_acervo",
  "cadastrar_atestado",
  "importar_orcamento",
  "aplicar_desconto",
  "importar_cronograma",
  "registrar_proposta",
  "ler_orcamento",
];

const DE_LEITURA = new Set([
  "ler_acervo",
  "buscar_oportunidades",
  "obter_oportunidade",
  "ler_edital_anexado",
  "status_envio",
  "ler_orcamento",
]);
const DE_EDICAO = new Set([
  "registrar_atende",
  "adicionar_nota",
  "cadastrar_atestado",
  "registrar_proposta",
]);
const DO_ORCAMENTO = new Set(["importar_orcamento", "aplicar_desconto", "importar_cronograma"]);

export function atendeExigencia(v: Vinculo, e: Exigencia): boolean {
  return e.every((grupo) =>
    grupo.some(([modulo, aba, funcao]) => temPermissaoServidor(v, modulo, aba, funcao))
  );
}

/** Oportunidade → ANEXAR_OPORTUNIDADE; atestado → EDITAR_OPORTUNIDADE (spec 25/09 §4.5). */
export function exigenciaDoAlvo(alvo: "oportunidade" | "atestado"): Exigencia {
  return alvo === "atestado" ? EDITAR_OPORTUNIDADE : ANEXAR_OPORTUNIDADE;
}

export function exigenciaDaFerramenta(nome: string, args: Record<string, unknown>): Exigencia {
  if (nome === "empresa_atual") return [];
  if (DE_LEITURA.has(nome)) return LER;
  if (nome === "criar_ou_atualizar_oportunidade") {
    const id = args?.oportunidade_id;
    return typeof id === "string" && id.trim() ? EDITAR_OPORTUNIDADE : CRIAR_OPORTUNIDADE;
  }
  if (DE_EDICAO.has(nome)) return EDITAR_OPORTUNIDADE;
  if (nome === "gerar_link_envio") {
    return exigenciaDoAlvo(args?.alvo === "atestado" ? "atestado" : "oportunidade");
  }
  if (nome === "registrar_arquivos") {
    // a do alvo do link é conferida por dentro da ferramenta
    return [
      [
        ["Oportunidades", "Arquivos", "criar"],
        ["Oportunidades", "Lista", "editar"],
      ],
    ];
  }
  if (DO_ORCAMENTO.has(nome)) return EDITAR_ORCAMENTO;
  return NEGAR;
}

const rotuloPermissao = ([modulo, aba, funcao]: Permissao) =>
  [modulo, aba, funcao].filter(Boolean).join(" → ");

/** "Oportunidades → Lista → editar e (Oportunidades → Orçamento → editar ou Oportunidades → Orcamento → editar)" */
export function rotuloExigencia(e: Exigencia): string {
  if (!e.length) return "nenhuma";
  return e
    .map((grupo) => {
      if (!grupo.length) return "nenhuma permissão libera esta ferramenta";
      const ou = grupo.map(rotuloPermissao).join(" ou ");
      return grupo.length > 1 && e.length > 1 ? `(${ou})` : ou;
    })
    .join(" e ");
}
