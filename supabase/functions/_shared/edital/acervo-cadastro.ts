/**
 * Regras do cadastro de CAT/atestado pelo conector do Claude (spec 25/09 §5, cadastrar_atestado):
 * - valida e normaliza a entrada (datas AAAA-MM-DD, UF, listas fechadas de tipo, atividade e
 *   categoria; categoria fora da lista vira "outro" com aviso);
 * - marca exatamente UMA linha "síntese" por categoria no atestado (a obra); as demais são
 *   "detalhe" — o Resumo e o "Atende?" somam só as sínteses;
 * - normaliza o nº da CAT para a deduplicação (a mesma regra da RPC conector_cadastrar_atestado).
 *
 * O valor do contrato não existe na entrada (o schema da ferramenta não tem o campo). A gravação é
 * da RPC (0152), numa transação. Puro: sem Deno e sem import de URL.
 */
import { booleanoOuNull, textoCurto } from "../conector/entrada.ts";
import {
  ATIVIDADES_ACERVO,
  categoriaValida,
  TIPOS_DOC_ACERVO,
  unidadeDaCategoria,
  type TipoDocAcervo,
} from "./acervo-categorias.ts";
import { dataDoEdital, ufDoEdital } from "./campos-oportunidade.ts";
import { normalizar, normalizarUnidade, numero } from "./edital-regras.ts";

export interface QuantitativoNormalizado {
  categoria: string;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  especificacao: string | null;
  na_atividade_tecnica: boolean;
  observacao: "síntese" | "detalhe";
  ordem: number;
}

export interface AtestadoNormalizado {
  tipo: "cat" | "atestado" | "cao" | "cat_profissional";
  numero: string | null;
  conselho: string | null;
  art_numero: string | null;
  contratante: string | null;
  contratante_cnpj: string | null;
  contrato: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  objeto: string;
  cidade: string | null;
  uf: string | null;
  atividades: string[];
  com_execucao: boolean | null;
  situacao: "concluida" | "em_andamento";
  empresa_executora: string | null;
  cobre_arts: string[];
  riscos: string | null;
  observacoes: string | null;
  profissional_nome: string | null;
}

export interface ProfissionalEntrada {
  nome: string;
  registro: string | null;
  titulos: string | null;
}

type QuantitativoEntrada = Omit<QuantitativoNormalizado, "observacao" | "ordem"> & {
  sintese?: boolean;
};

export const MSG_SEM_CONFIRMACAO =
  "Mostre a conferência ao usuário e envie confirmado_pelo_usuario: true";
export const MAX_QUANTITATIVOS = 200;

/** Tamanhos máximos (caracteres) dos textos gravados; o que passar é cortado. */
const MAX = {
  numero: 60,
  conselho: 40,
  art: 60,
  contratante: 300,
  cnpj: 30,
  contrato: 120,
  objeto: 4000,
  cidade: 120,
  empresa: 300,
  longo: 2000,
  nome: 200,
  registro: 60,
  titulos: 300,
  descricao: 1000,
  unidade: 20,
  especificacao: 300,
} as const;

/** Texto aparado e cortado; número vira texto (ex.: numero 123); vazio → null. */
const txt = (v: unknown, max: number): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v).slice(0, max) : textoCurto(v, max);

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Valor recebido repetido num aviso: no máximo 60 caracteres (a entrada pode ter milhares). */
const eco = (v: unknown): string => {
  const s = String(v ?? "");
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

/** Chave de lista fechada: sem acento, minúscula, espaço/hífen → "_" ("Em andamento" → "em_andamento"). */
const chave = (v: unknown) => normalizar(v).replace(/[\s-]+/g, "_");

/**
 * Nº da CAT/CAO só com dígitos e "/" ("CAT nº 3.239.747/2025" → "3239747/2025"). Sem nenhum dígito
 * ("s/n", vazio) → null: não há nº para deduplicar. A RPC 0152 aplica a mesma regra.
 */
export function numeroCatNormalizado(n: unknown): string | null {
  if (typeof n !== "string" && typeof n !== "number") return null;
  const s = String(n).replace(/[^0-9/]/g, "");
  return /[0-9]/.test(s) ? s : null;
}

/** Quantidade comparável dentro da categoria: unidade canônica (2 km = 2000 m); sem número → -∞. */
const quantidadeCanonica = (q: QuantitativoEntrada) =>
  q.quantidade === null
    ? Number.NEGATIVE_INFINITY
    : q.quantidade * normalizarUnidade(q.unidade).fator;

/**
 * Uma síntese por categoria: a única marcada com sintese:true; se nenhuma ou várias, a de maior
 * quantidade em unidade canônica (entre as marcadas, quando há várias; senão entre todas); empate →
 * a primeira. As demais ficam "detalhe". ordem = posição original + 1 (a tela começa em 1).
 */
export function marcarSinteses(
  qs: Omit<QuantitativoNormalizado, "observacao" | "ordem">[] & { sintese?: boolean }[]
): QuantitativoNormalizado[] {
  const lista = qs as QuantitativoEntrada[];
  const porCategoria = new Map<string, number[]>();
  lista.forEach((q, i) =>
    porCategoria.set(q.categoria, [...(porCategoria.get(q.categoria) ?? []), i])
  );

  const sintese = new Set<number>();
  for (const indices of porCategoria.values()) {
    const marcadas = indices.filter((i) => lista[i].sintese === true);
    const candidatas = marcadas.length ? marcadas : indices;
    let melhor = candidatas[0];
    for (const i of candidatas.slice(1)) {
      if (quantidadeCanonica(lista[i]) > quantidadeCanonica(lista[melhor])) melhor = i;
    }
    sintese.add(melhor);
  }

  return lista.map((q, i) => ({
    categoria: q.categoria,
    descricao: q.descricao,
    quantidade: q.quantidade,
    unidade: q.unidade,
    especificacao: q.especificacao,
    na_atividade_tecnica: q.na_atividade_tecnica,
    observacao: sintese.has(i) ? "síntese" : "detalhe",
    ordem: i + 1,
  }));
}

export function validarAtestado(args: Record<string, unknown>):
  | {
      ok: true;
      atestado: AtestadoNormalizado;
      profissional: ProfissionalEntrada | null;
      quantitativos: QuantitativoNormalizado[];
      avisos: string[];
    }
  | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (args.confirmado_pelo_usuario !== true) erros.push(MSG_SEM_CONFIRMACAO);

  const tipo = chave(args.tipo);
  if (!(TIPOS_DOC_ACERVO as readonly string[]).includes(tipo)) {
    erros.push(`tipo: use ${TIPOS_DOC_ACERVO.join(", ")}`);
  }

  const objeto = txt(args.objeto, MAX.objeto);
  if (!objeto) erros.push("objeto: obrigatório (objeto ou obra do atestado)");

  const data = (campo: "data_inicio" | "data_fim") => {
    if (vazio(args[campo])) return null;
    const d = dataDoEdital(args[campo]);
    if (!d) erros.push(`${campo}: data inválida (use AAAA-MM-DD)`);
    return d;
  };
  const dataInicio = data("data_inicio");
  const dataFim = data("data_fim");
  if (dataInicio && dataFim && dataFim < dataInicio) {
    erros.push("data_fim: anterior à data_inicio");
  }

  const uf = vazio(args.uf) ? null : ufDoEdital(args.uf);
  if (!vazio(args.uf) && !uf) erros.push("uf: use a sigla do estado com 2 letras (ex.: MG)");

  const atividades: string[] = [];
  const brutas = Array.isArray(args.atividades)
    ? args.atividades
    : vazio(args.atividades)
      ? []
      : [args.atividades];
  for (const a of brutas) {
    const id = chave(a);
    if ((ATIVIDADES_ACERVO as readonly string[]).includes(id)) {
      if (!atividades.includes(id)) atividades.push(id);
    } else {
      avisos.push(
        `atividades: "${eco(a)}" fora da lista (${ATIVIDADES_ACERVO.join(", ")}); não gravada`
      );
    }
  }

  const comExecucao = booleanoOuNull(args.com_execucao);
  if (!vazio(args.com_execucao) && comExecucao === null) {
    erros.push("com_execucao: use true, false ou null");
  }

  const situacao = vazio(args.situacao) ? "concluida" : chave(args.situacao);
  if (situacao !== "concluida" && situacao !== "em_andamento") {
    erros.push("situacao: use concluida ou em_andamento");
  }

  let profissional: ProfissionalEntrada | null = null;
  if (ehObjeto(args.profissional)) {
    const nome = txt(args.profissional.nome, MAX.nome);
    if (!nome) erros.push("profissional.nome: obrigatório (ou envie profissional: null)");
    else {
      profissional = {
        nome,
        registro: txt(args.profissional.registro, MAX.registro),
        titulos: txt(args.profissional.titulos, MAX.titulos),
      };
    }
  } else if (!vazio(args.profissional)) {
    erros.push("profissional: envie { nome, registro, titulos } ou null");
  }

  const cobreArts: string[] = [];
  for (const art of Array.isArray(args.cobre_arts) ? args.cobre_arts : []) {
    const t = txt(art, MAX.art);
    if (t && !cobreArts.includes(t)) cobreArts.push(t);
  }

  const entrada = Array.isArray(args.quantitativos) ? args.quantitativos : [];
  if (!entrada.length || entrada.length > MAX_QUANTITATIVOS) {
    erros.push(`quantitativos: informe de 1 a ${MAX_QUANTITATIVOS} linhas`);
  }
  const quantitativos: QuantitativoEntrada[] = [];
  entrada.slice(0, MAX_QUANTITATIVOS).forEach((bruto: unknown, i: number) => {
    const onde = `quantitativos[${i}]`;
    if (!ehObjeto(bruto)) {
      erros.push(`${onde}: deve ser um objeto`);
      return;
    }
    const categoria = categoriaValida(bruto.categoria);
    if (categoria === "outro" && chave(bruto.categoria) !== "outro") {
      avisos.push(
        `${onde}.categoria "${eco(bruto.categoria)}" fora da lista: gravada como "outro"`
      );
    }
    const descricao = txt(bruto.descricao, MAX.descricao);
    if (!descricao) erros.push(`${onde}.descricao: obrigatória`);
    let quantidade: number | null = null;
    if (!vazio(bruto.quantidade)) {
      quantidade = numero(bruto.quantidade);
      if (quantidade === null || quantidade < 0 || quantidade >= 1e15) {
        erros.push(`${onde}.quantidade: número maior ou igual a zero`);
      }
    }
    const naAtividade = vazio(bruto.na_atividade_tecnica)
      ? false
      : booleanoOuNull(bruto.na_atividade_tecnica);
    if (naAtividade === null) erros.push(`${onde}.na_atividade_tecnica: use true ou false`);
    const marcada = vazio(bruto.sintese) ? false : booleanoOuNull(bruto.sintese);
    if (marcada === null) erros.push(`${onde}.sintese: use true ou false`);
    quantitativos.push({
      categoria,
      descricao: descricao ?? "",
      quantidade,
      unidade: txt(bruto.unidade, MAX.unidade) ?? (unidadeDaCategoria(categoria) || null),
      especificacao: txt(bruto.especificacao, MAX.especificacao),
      na_atividade_tecnica: naAtividade === true,
      sintese: marcada === true,
    });
  });

  if (erros.length) return { ok: false, erros };

  const numeroDoc = txt(args.numero, MAX.numero);
  if (tipo !== "atestado" && !numeroCatNormalizado(numeroDoc)) {
    avisos.push("numero: sem o nº do documento o SIGO não confere se ele já foi cadastrado");
  }

  const marcados = marcarSinteses(quantitativos);
  const categorias = [...new Set(quantitativos.map((q) => q.categoria))];
  for (const categoria of categorias) {
    const linhas = quantitativos.filter((q) => q.categoria === categoria);
    const nMarcadas = linhas.filter((q) => q.sintese).length;
    if (linhas.length > 1 && nMarcadas !== 1) {
      const escolhida = marcados.find(
        (q) => q.categoria === categoria && q.observacao === "síntese"
      )!;
      avisos.push(
        `categoria ${categoria}: ${nMarcadas ? `${nMarcadas} linhas marcadas` : "nenhuma linha marcada"} como síntese; ficou quantitativos[${escolhida.ordem - 1}] (a de maior quantidade)`
      );
    }
  }

  return {
    ok: true,
    atestado: {
      tipo: tipo as TipoDocAcervo,
      numero: numeroDoc,
      conselho: txt(args.conselho, MAX.conselho),
      art_numero: txt(args.art_numero, MAX.art),
      contratante: txt(args.contratante, MAX.contratante),
      contratante_cnpj: txt(args.contratante_cnpj, MAX.cnpj),
      contrato: txt(args.contrato, MAX.contrato),
      data_inicio: dataInicio,
      data_fim: dataFim,
      objeto: objeto as string,
      cidade: txt(args.cidade, MAX.cidade),
      uf,
      atividades,
      com_execucao: comExecucao,
      situacao: situacao as "concluida" | "em_andamento",
      empresa_executora: txt(args.empresa_executora, MAX.empresa),
      cobre_arts: cobreArts,
      riscos: txt(args.riscos, MAX.longo),
      observacoes: txt(args.observacoes, MAX.longo),
      profissional_nome: profissional?.nome ?? null,
    },
    profissional,
    quantitativos: marcados,
    avisos,
  };
}
