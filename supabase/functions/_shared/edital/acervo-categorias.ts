/**
 * Listas do acervo técnico para o conector do Claude: categorias dos quantitativos, tipos de
 * documento e atividades. Cópia de apps/web/src/components/acervo/acervo-utils.js (CATEGORIAS,
 * TIPOS_DOC e ATIVIDADES); o teste de paridade apps/web/src/lib/acervo-categorias-paridade.test.js
 * acusa qualquer diferença entre as duas.
 *
 * Puro: sem Deno e sem import de URL.
 */
import { normalizar } from "./edital-regras.ts";

export const CATEGORIAS_ACERVO: readonly { id: string; label: string; unidade: string }[] = [
  { id: "potencia_kva", label: "Potência (kVA)", unidade: "kVA" },
  { id: "transformador", label: "Transformadores", unidade: "un" },
  { id: "poste", label: "Postes", unidade: "un" },
  { id: "luminaria_ip", label: "Luminárias de IP", unidade: "un" },
  { id: "refletor", label: "Refletores", unidade: "un" },
  { id: "substituicao_luminaria", label: "Substituição de luminárias", unidade: "un" },
  { id: "cabo_mt_protegido", label: "Cabo MT protegido", unidade: "m" },
  { id: "cabo_bt_multiplexado", label: "Cabo BT multiplexado", unidade: "m" },
  { id: "cabo_cobre_bt", label: "Cabo de cobre BT", unidade: "m" },
  { id: "rede_subterranea", label: "Rede subterrânea", unidade: "m" },
  { id: "rede_aerea", label: "Rede aérea", unidade: "m" },
  { id: "spda", label: "SPDA", unidade: "conj" },
  { id: "rele_fotoeletrico", label: "Relés fotoelétricos", unidade: "un" },
  { id: "chave_fusivel", label: "Chaves fusíveis", unidade: "un" },
  { id: "para_raios", label: "Para-raios", unidade: "un" },
  { id: "haste_aterramento", label: "Hastes de aterramento", unidade: "un" },
  { id: "eletroduto", label: "Eletroduto", unidade: "m" },
  { id: "escavacao", label: "Escavação", unidade: "m³" },
  { id: "topografia", label: "Topografia", unidade: "" },
  { id: "terraplenagem", label: "Terraplenagem", unidade: "m²" },
  { id: "calcamento", label: "Calçamento", unidade: "m²" },
  { id: "servico_concessionaria", label: "Serviços na concessionária", unidade: "" },
  { id: "mao_de_obra", label: "Mão de obra", unidade: "" },
  { id: "outro", label: "Outro", unidade: "" },
];

export const TIPOS_DOC_ACERVO = ["cat", "atestado", "cao", "cat_profissional"] as const;
export type TipoDocAcervo = (typeof TIPOS_DOC_ACERVO)[number];

export const ATIVIDADES_ACERVO = [
  "execucao",
  "projeto",
  "consultoria",
  "fiscalizacao",
  "assessoria",
] as const;

const ID_DA_CHAVE = new Map<string, string>();
for (const c of CATEGORIAS_ACERVO) {
  ID_DA_CHAVE.set(c.id, c.id);
  ID_DA_CHAVE.set(normalizar(c.label), c.id);
}

/**
 * Id da lista, senão "outro". Aceita o id com outra caixa, acento ou espaço no lugar do "_"
 * ("Cabo MT protegido" → "cabo_mt_protegido") e o rótulo da tela ("Postes" → "poste").
 */
export function categoriaValida(c: unknown): string {
  if (typeof c !== "string") return "outro";
  const texto = normalizar(c);
  return ID_DA_CHAVE.get(texto) ?? ID_DA_CHAVE.get(texto.replace(/[\s-]+/g, "_")) ?? "outro";
}

/** Unidade padrão da categoria ("" quando a categoria não tem uma). */
export function unidadeDaCategoria(id: string): string {
  return CATEGORIAS_ACERVO.find((c) => c.id === id)?.unidade ?? "";
}
