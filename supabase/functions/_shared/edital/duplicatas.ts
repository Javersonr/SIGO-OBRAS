/**
 * Possíveis duplicatas de uma oportunidade criada pelo conector do Claude (spec 25/09 §5):
 * (a) nº/ano do edital em licitacao_numero/licitacao_processo + mesmo local;
 * (b) nº/ano dentro do nome/descrição (as oportunidades antigas só têm o nº no nome) + mesmo local.
 * A busca no banco (conector_buscar_oportunidades, 0151) traz as que têm o nº/ano; aqui se
 * decide o "mesmo local" e se ordena. Puro: sem Deno, sem import de URL.
 */
import { normalizar, palavrasChave } from "./edital-regras.ts";
import type { EditalConsolidado } from "./edital-schemas.ts";
import { linkOportunidade } from "../conector/recurso.ts";

export interface NumeroAno {
  numero: number;
  ano: number;
}

/** "PE 012/2026", "12.2026", "nº 12 - 2026" → {numero: 12, ano: 2026}; sem zeros à esquerda, sem repetir. */
export function numerosAnoDoTexto(t: unknown): NumeroAno[] {
  const out: NumeroAno[] = [];
  const vistos = new Set<string>();
  for (const m of String(t ?? "").matchAll(/(?<!\d)(\d{1,6})\s*[/.-]\s*(20\d{2})\b/g)) {
    const numero = Number(m[1]);
    const ano = Number(m[2]);
    const k = `${numero}/${ano}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ numero, ano });
  }
  return out;
}

export function chaveNumeroAno(t: unknown): NumeroAno | null {
  return numerosAnoDoTexto(t)[0] ?? null;
}

/** Sem acento, minúsculo, espaço simples (o mesmo que sem_acento() + trim no banco). */
export function textoNormalizado(t: unknown): string {
  return normalizar(t);
}

export interface OportunidadeResumo {
  id: string;
  nome: string | null;
  descricao: string | null;
  licitacao_numero: string | null;
  licitacao_processo: string | null;
  orgao: string | null;
  cidade: string | null;
  estado: string | null;
  status_nome: string | null;
  licitacao_data: string | null;
  created_at: string | null;
}

export interface Candidata {
  id: string;
  nome: string | null;
  status_nome: string | null;
  licitacao_data: string | null;
  motivo: "numero_e_local" | "numero_no_texto_e_local";
  link: string;
}

/** Palavras de órgão que não distinguem um do outro ("Prefeitura Municipal de …"). */
const GENERICAS_ORGAO = new Set([
  "prefeitura",
  "pref",
  "municipal",
  "municipio",
  "camara",
  "secretaria",
  "estado",
  "estadual",
  "governo",
  "autarquia",
  "departamento",
  "fundacao",
  "consorcio",
  "intermunicipal",
  "publico",
  "publica",
]);

function chavesDoOrgao(orgao: unknown): Set<string> {
  return new Set([...palavrasChave(orgao)].filter((p) => !GENERICAS_ORGAO.has(p)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Mesmo local: cidades iguais; ou a cidade do edital aparece no nome/descrição/órgão da
 * oportunidade; ou os órgãos se parecem (jaccard ≥ 0,5 sem as palavras genéricas) e as
 * cidades informadas não são diferentes.
 */
export function mesmoLocal(
  edital: { orgao: string | null; local: { cidade: string | null } },
  op: OportunidadeResumo
): boolean {
  const cidadeEdital = textoNormalizado(edital.local?.cidade);
  const cidadeOp = textoNormalizado(op.cidade);
  if (cidadeEdital && cidadeOp && cidadeEdital === cidadeOp) return true;
  if (cidadeEdital) {
    const textoOp = textoNormalizado([op.nome, op.descricao, op.orgao].filter(Boolean).join(" "));
    const re = new RegExp(`(^|[^a-z0-9])${escaparRegex(cidadeEdital)}([^a-z0-9]|$)`);
    if (re.test(textoOp)) return true;
  }
  if (cidadeEdital && cidadeOp) return false; // cidades informadas e diferentes
  return jaccard(chavesDoOrgao(edital.orgao), chavesDoOrgao(op.orgao)) >= 0.5;
}

const chaveTexto = (n: NumeroAno) => `${n.numero}/${n.ano}`;

export function candidatasDuplicata(
  edital: Pick<EditalConsolidado, "numero_edital" | "numero_processo" | "orgao" | "local">,
  ops: OportunidadeResumo[]
): Candidata[] {
  const doEdital = new Set(
    [...numerosAnoDoTexto(edital.numero_edital), ...numerosAnoDoTexto(edital.numero_processo)].map(
      chaveTexto
    )
  );
  if (!doEdital.size) return [];
  const casa = (t: unknown) => numerosAnoDoTexto(t).some((n) => doEdital.has(chaveTexto(n)));
  const out: (Candidata & { _ordem: number; _criado: string })[] = [];
  for (const op of ops) {
    if (!mesmoLocal(edital, op)) continue;
    let motivo: Candidata["motivo"] | null = null;
    if (casa(op.licitacao_numero) || casa(op.licitacao_processo)) motivo = "numero_e_local";
    else if (casa(op.nome) || casa(op.descricao)) motivo = "numero_no_texto_e_local";
    if (!motivo) continue;
    out.push({
      id: op.id,
      nome: op.nome,
      status_nome: op.status_nome,
      licitacao_data: op.licitacao_data,
      motivo,
      link: linkOportunidade(op.id),
      _ordem: motivo === "numero_e_local" ? 0 : 1,
      _criado: op.created_at ?? "",
    });
  }
  return out
    .sort((a, b) => a._ordem - b._ordem || b._criado.localeCompare(a._criado))
    .slice(0, 10)
    .map(({ _ordem: _o, _criado: _c, ...c }) => c);
}
