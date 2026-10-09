/**
 * Carga do acervo técnico da empresa para o "Atende?" (ia-processar e conector do Claude).
 * Movido do ia-processar/edital.ts: mesmas colunas e mesmas ordens. A consulta chega por uma
 * FonteAcervo já presa à empresa e sem os excluídos — a CamadaEmpresa do conector cumpre esse
 * formato, e fonteDoAdmin() monta a mesma coisa sobre o service role da ia-processar.
 * Puro: sem Deno e sem import de URL (o banco entra injetado).
 */
import {
  renumerarIds,
  type Acervo,
  type AcervoAtestado,
  type AcervoPerfil,
  type AcervoProfissional,
  type AcervoQuantitativo,
} from "./edital-regras.ts";
import type { EditalConsolidado } from "./edital-schemas.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;
// deno-lint-ignore no-explicit-any
type Consulta = any; // PostgrestFilterBuilder do supabase-js
type Obj = Record<string, unknown>;

export type TabelaAcervo =
  | "acervo_perfil"
  | "acervo_profissional"
  | "acervo_atestado"
  | "acervo_quantitativo";

/** select(colunas) já filtrado pela empresa e por deleted_at is null. */
export interface FonteAcervo {
  ler(tabela: TabelaAcervo, colunas: string): Consulta;
}

export function fonteDoAdmin(admin: Admin, empresaId: string): FonteAcervo {
  return {
    ler: (tabela, colunas) =>
      admin.from(tabela).select(colunas).eq("empresa_id", empresaId).is("deleted_at", null),
  };
}

const COLUNAS_PROFISSIONAL =
  "id, nome, registro, titulos, atribuicoes, restricoes, vinculo_desde, responsavel_tecnico, ativo, observacoes";
const COLUNAS_ATESTADO =
  "id, tipo, numero, conselho, art_numero, contratante, valor, data_inicio, data_fim, objeto, cidade, uf, codigos_crea, atividades, com_execucao, situacao, profissional_nome, empresa_executora, cobre_arts, riscos, ordem";
const COLUNAS_QUANTITATIVO =
  "atestado_id, categoria, descricao, quantidade, unidade, especificacao, na_atividade_tecnica, observacao, ordem";

type Pagina = (
  de: number,
  ate: number
) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** PostgREST devolve no máx. 1000 linhas por chamada: pagina até acabar */
async function buscarTodos(consulta: Pagina): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(`Falha ao ler o acervo: ${error.message}`);
    out.push(...((data ?? []) as Obj[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function carregarAcervo(fonte: FonteAcervo): Promise<Acervo> {
  const [perfilR, profissionais, atestados, quantitativos] = await Promise.all([
    fonte.ler("acervo_perfil", "*").order("updated_at", { ascending: false }).limit(1),
    buscarTodos((de, ate) =>
      fonte
        .ler("acervo_profissional", COLUNAS_PROFISSIONAL)
        .order("nome")
        .order("id")
        .range(de, ate)
    ),
    buscarTodos((de, ate) =>
      fonte
        .ler("acervo_atestado", COLUNAS_ATESTADO)
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("id")
        .range(de, ate)
    ),
    buscarTodos((de, ate) =>
      fonte
        .ler("acervo_quantitativo", COLUNAS_QUANTITATIVO)
        .order("atestado_id")
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("id")
        .range(de, ate)
    ),
  ]);
  if (perfilR.error) throw new Error(`Falha ao ler o acervo: ${perfilR.error.message}`);
  const atestadosDaEmpresa = atestados as unknown as AcervoAtestado[];
  const ids = new Set(atestadosDaEmpresa.map((a) => a.id));
  return {
    perfil: ((perfilR.data ?? [])[0] as AcervoPerfil | undefined) ?? null,
    profissionais: profissionais as unknown as AcervoProfissional[],
    atestados: atestadosDaEmpresa,
    // quantitativo só de atestado desta empresa (defesa extra)
    quantitativos: (quantitativos as unknown as AcervoQuantitativo[]).filter((q) =>
      ids.has(q.atestado_id)
    ),
  };
}

/** "AAAA-MM-DD" no fuso de Brasília (validade de certidão, sessão) */
export function hojeBR(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** ids vindos do front: se faltarem/repetirem, renumera (senão preserva p/ casar com o front) */
export function garantirIds(e: EditalConsolidado): void {
  const h = e.habilitacao;
  const todos = [
    ...h.tecnica_operacional,
    ...h.tecnica_profissional,
    ...h.economica,
    ...h.registros,
  ].map((x) => x.id);
  if (todos.some((id) => !id) || new Set(todos).size !== todos.length) renumerarIds(e);
}
