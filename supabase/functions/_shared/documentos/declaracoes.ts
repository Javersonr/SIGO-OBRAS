/**
 * Declarações de habilitação geradas pelo conector (spec 2026-10-09 §4): os seis modelos padrão, as
 * variáveis ({empresa}, {cnpj}...), a validação dos itens pedidos e os dados que o PDF e o .docx
 * desenham. Os modelos valem para toda empresa sem gravar linha; a linha de modelo_declaracao só
 * nasce quando a empresa edita um modelo ou cria um próprio (decisão 9 do plano).
 * A tela tem o espelho em apps/web/src/lib/declaracoes-modelos.js; a paridade dos textos e das
 * regras é conferida no Vitest (declaracoes-modelos-paridade.test.js): mudou aqui, mude lá.
 * Puro: sem Deno e sem import de URL.
 */
import type { CabecalhoLicitacao, EmpresaDocumento, Representante } from "./dados-proposta.ts";
import { dataPorExtenso } from "./formatos.ts";

export const CHAVES_MODELO_PADRAO = [
  "nao_emprega_menor",
  "fato_impeditivo",
  "me_epp",
  "requisitos_habilitacao",
  "reserva_cargos",
  "elaboracao_independente",
] as const;

export const VARIAVEIS_DECLARACAO = [
  "empresa",
  "cnpj",
  "endereco",
  "orgao",
  "edital",
  "objeto",
  "local",
  "data",
  "representante",
  "cargo",
  "cpf",
] as const;

export const LIMITE_TEXTO_DECLARACAO = 20000;
export const LIMITE_TITULO_DECLARACAO = 200;
export const MAX_ITENS_DECLARACAO = 12;

export interface ModeloDeclaracao {
  chave: string;
  titulo: string;
  texto: string;
  ativo?: boolean | null;
  ordem?: number | null;
}

/** Abertura comum dos seis modelos; o texto de cada um segue depois dela (começa com um espaço). */
const ABERTURA =
  "{empresa}, inscrita no CNPJ sob o nº {cnpj}, com sede em {endereco}, por intermédio de seu representante legal, {representante}, {cargo}, inscrito(a) no CPF sob o nº {cpf}, DECLARA, sob as penas da lei,";

const TEXTO_ELABORACAO_INDEPENDENTE = [
  ABERTURA + " em especial do art. 299 do Código Penal, que:",
  "a) a proposta apresentada para participar do {edital} foi elaborada de maneira independente, e o seu conteúdo não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato do certame, por qualquer meio ou por qualquer pessoa;",
  "b) a intenção de apresentar a proposta não foi informada, discutida ou recebida de qualquer outro participante potencial ou de fato do certame, por qualquer meio ou por qualquer pessoa;",
  "c) não tentou, por qualquer meio ou por qualquer pessoa, influir na decisão de qualquer outro participante potencial ou de fato do certame quanto a participar ou não dele;",
  "d) o conteúdo da proposta não será, no todo ou em parte, direta ou indiretamente, comunicado ou discutido com qualquer outro participante potencial ou de fato do certame antes da adjudicação do objeto;",
  "e) o conteúdo da proposta não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer integrante de {orgao} antes da abertura oficial das propostas; e",
  "f) está plenamente ciente do teor e da extensão desta declaração e detém plenos poderes e informações para firmá-la.",
].join("\n\n");

const m = (chave: string, titulo: string, texto: string, ordem: number): ModeloDeclaracao =>
  Object.freeze({ chave, titulo, texto, ativo: true, ordem });

/** Congelado (a lista e cada modelo): quem quiser alterar um modelo trabalha numa cópia de `modelosDaEmpresa`. */
export const MODELOS_PADRAO: readonly ModeloDeclaracao[] = Object.freeze([
  m(
    "nao_emprega_menor",
    "Declaração de que não emprega menor",
    ABERTURA +
      " para fins do disposto no inciso VI do art. 68 da Lei nº 14.133, de 1º de abril de 2021, e no inciso XXXIII do art. 7º da Constituição Federal, que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 (dezesseis) anos, salvo na condição de aprendiz, a partir de 14 (quatorze) anos.",
    1
  ),
  m(
    "fato_impeditivo",
    "Declaração de inexistência de fato impeditivo",
    ABERTURA +
      " que até a presente data inexistem fatos impeditivos para a sua habilitação no {edital}, promovido por {orgao}, que não foi declarada inidônea nem está impedida de licitar ou contratar com a Administração Pública, e que está ciente da obrigação de declarar ocorrências posteriores.",
    2
  ),
  m(
    "me_epp",
    "Declaração de enquadramento como microempresa ou empresa de pequeno porte",
    ABERTURA +
      " que se enquadra como microempresa ou empresa de pequeno porte, nos termos do art. 3º da Lei Complementar nº 123, de 14 de dezembro de 2006, que não incorre em nenhuma das vedações do § 4º do mesmo artigo e que, no ano-calendário de realização da licitação, ainda não celebrou contratos com a Administração Pública cujos valores somados extrapolem a receita bruta máxima admitida para fins de enquadramento como empresa de pequeno porte (art. 4º, § 2º, da Lei nº 14.133/2021), estando apta a usufruir do tratamento favorecido dos arts. 42 a 49 daquela Lei Complementar.",
    3
  ),
  m(
    "requisitos_habilitacao",
    "Declaração de cumprimento dos requisitos de habilitação",
    ABERTURA +
      " que cumpre plenamente os requisitos de habilitação exigidos no {edital} e que a sua proposta econômica compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega das propostas (art. 63, inciso I e § 1º, da Lei nº 14.133/2021).",
    4
  ),
  m(
    "reserva_cargos",
    "Declaração de reserva de cargos para pessoa com deficiência e reabilitado da Previdência Social",
    ABERTURA +
      " que cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, previstas em lei e em outras normas específicas (art. 63, inciso IV, da Lei nº 14.133/2021).",
    5
  ),
  m(
    "elaboracao_independente",
    "Declaração de elaboração independente de proposta",
    TEXTO_ELABORACAO_INDEPENDENTE,
    6
  ),
]);

/** Ordem do modelo; nula ou ausente vai por último. */
function ordemDe(modelo: ModeloDeclaracao): number {
  return typeof modelo.ordem === "number" && Number.isFinite(modelo.ordem)
    ? modelo.ordem
    : Number.POSITIVE_INFINITY;
}

/** Padrão sobreposto pelas linhas da empresa (mesma chave) + modelos próprios; só os ativos; por ordem e título. */
export function modelosDaEmpresa(linhas: ModeloDeclaracao[]): ModeloDeclaracao[] {
  const porChave = new Map<string, ModeloDeclaracao>(
    MODELOS_PADRAO.map((p) => [p.chave, { ...p }])
  );
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    if (!linha || typeof linha.chave !== "string" || !linha.chave) continue;
    const padrao = porChave.get(linha.chave);
    porChave.set(linha.chave, {
      chave: linha.chave,
      titulo: typeof linha.titulo === "string" ? linha.titulo : (padrao?.titulo ?? ""),
      texto: typeof linha.texto === "string" ? linha.texto : (padrao?.texto ?? ""),
      ativo: linha.ativo !== false,
      ordem: linha.ordem ?? padrao?.ordem ?? null,
    });
  }
  return [...porChave.values()]
    .filter((x) => x.ativo !== false)
    .sort((a, b) => {
      const oa = ordemDe(a);
      const ob = ordemDe(b);
      if (oa !== ob) return oa < ob ? -1 : 1;
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });
}

export function variaveisDaDeclaracao(
  cab: CabecalhoLicitacao,
  local: string,
  dataISO: string
): Record<string, string> {
  // Quebra de linha dentro de um valor (um {objeto} com linha em branco, por exemplo) partiria o
  // parágrafo do modelo em dois: cada valor vira uma linha só, com espaços simples.
  const limpa = (valor: unknown): string =>
    String(valor ?? "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    empresa: limpa(cab.empresa.nome),
    cnpj: limpa(cab.empresa.cnpj),
    endereco: limpa(cab.empresa.endereco),
    orgao: limpa(cab.orgao),
    edital: limpa(cab.edital),
    objeto: limpa(cab.objeto),
    local: limpa(local),
    data: limpa(dataPorExtenso(dataISO)),
    representante: limpa(cab.representante.nome),
    cargo: limpa(cab.representante.cargo),
    cpf: limpa(cab.representante.cpf),
  };
}

const CAMPO_VAZIO = "________";

/** Troca {variavel}; `sem_valor` = variáveis conhecidas que ficaram vazias; `desconhecidas` = {x} fora da lista. */
export function preencherModelo(
  texto: string,
  vars: Record<string, string>
): { texto: string; sem_valor: string[]; desconhecidas: string[] } {
  const semValor: string[] = [];
  const desconhecidas: string[] = [];
  const preenchido = String(texto ?? "").replace(/\{([a-z_]+)\}/g, (inteiro, nome: string) => {
    if (!(VARIAVEIS_DECLARACAO as readonly string[]).includes(nome)) {
      if (!desconhecidas.includes(nome)) desconhecidas.push(nome);
      return inteiro;
    }
    const valor = vars?.[nome];
    if (valor === undefined || valor === null || String(valor).trim() === "") {
      if (!semValor.includes(nome)) semValor.push(nome);
      return CAMPO_VAZIO;
    }
    return String(valor);
  });
  return { texto: preenchido, sem_valor: semValor, desconhecidas };
}

export type ItemDeclaracao =
  | { tipo: "modelo"; chave: string }
  | { tipo: "texto"; titulo: string; texto: string };

const CHAVE_MODELO = /^[a-z][a-z0-9_]{1,59}$/;

/** FNV-1a de 32 bits (offset 0x811c9dc5, primo 0x01000193) sobre os códigos dos caracteres; 8 dígitos hexadecimais. */
function hashFnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Título sem acento, em minúsculas, [^a-z0-9]+ → "_", sem "_" nas pontas. Até 40 caracteres é ele
 * mesmo; passando disso, os 31 primeiros (sem "_" no fim) + "_" + o hash FNV-1a do normalizado
 * INTEIRO, para dois títulos longos que só diferem no fim (Lote 1 × Lote 2) não darem a mesma chave.
 * Mesma regra de chaveDoTitulo em apps/web/src/lib/declaracoes-modelos.js (paridade no Vitest).
 */
function chaveDoTitulo(titulo: string): string {
  const normalizado = String(titulo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalizado.length <= 40) return normalizado;
  return `${normalizado.slice(0, 31).replace(/_+$/, "")}_${hashFnv1a(normalizado)}`;
}

/** modelo → a chave; texto → "edital_" + chaveDoTitulo (até 40 caracteres, com hash se o título é longo). */
export function chaveDoItem(item: ItemDeclaracao): string {
  if (item.tipo === "modelo") return item.chave;
  return `edital_${chaveDoTitulo(item.titulo) || "declaracao"}`;
}

const presente = (v: unknown): boolean => v !== undefined && v !== null;

export function validarItensDeclaracao(
  itens: unknown
): { ok: true; itens: ItemDeclaracao[] } | { ok: false; erros: string[] } {
  if (!Array.isArray(itens) || itens.length < 1) {
    return { ok: false, erros: [`itens: informe de 1 a ${MAX_ITENS_DECLARACAO} declarações`] };
  }
  if (itens.length > MAX_ITENS_DECLARACAO) {
    return {
      ok: false,
      erros: [`itens: no máximo ${MAX_ITENS_DECLARACAO} por chamada (vieram ${itens.length})`],
    };
  }
  const erros: string[] = [];
  const validos: ItemDeclaracao[] = [];
  const vistas = new Set<string>();
  itens.forEach((bruto: unknown, i: number) => {
    const onde = `itens[${i}]`;
    const o = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : {};
    const { modelo, titulo, texto } = o as Record<string, unknown>;
    let item: ItemDeclaracao | null = null;
    if (presente(modelo)) {
      if (presente(titulo) || presente(texto)) {
        erros.push(`${onde}: informe "modelo" OU "titulo" e "texto", não os dois`);
      } else if (typeof modelo !== "string" || !CHAVE_MODELO.test(modelo)) {
        erros.push(`${onde}.modelo: chave inválida`);
      } else {
        item = { tipo: "modelo", chave: modelo };
      }
    } else if (!presente(titulo) && !presente(texto)) {
      erros.push(`${onde}: informe "modelo" ou "titulo" e "texto"`);
    } else {
      const t = typeof titulo === "string" ? titulo.trim() : "";
      const x = typeof texto === "string" ? texto.trim() : "";
      const tituloOk = t.length >= 1 && t.length <= LIMITE_TITULO_DECLARACAO;
      const textoOk = x.length >= 1 && x.length <= LIMITE_TEXTO_DECLARACAO;
      if (!tituloOk) erros.push(`${onde}.titulo: de 1 a ${LIMITE_TITULO_DECLARACAO} caracteres`);
      if (!textoOk) erros.push(`${onde}.texto: de 1 a ${LIMITE_TEXTO_DECLARACAO} caracteres`);
      if (tituloOk && textoOk) item = { tipo: "texto", titulo: t, texto: x };
    }
    if (!item) return;
    const chave = chaveDoItem(item);
    if (vistas.has(chave)) {
      erros.push(`${onde}: declaração repetida (${chave})`);
      return;
    }
    vistas.add(chave);
    validos.push(item);
  });
  return erros.length > 0 ? { ok: false, erros } : { ok: true, itens: validos };
}

/**
 * "Declaração - <título>.<ext>"; o prefixo some quando o título já começa com "Declaração".
 * Caracteres proibidos em nome de arquivo, de controle (Cc) e de formato Unicode (Cf, como o U+202E
 * que inverte o sentido do texto) viram "-"; o título é cortado em 150 pontos de código (não em
 * unidades UTF-16, para não deixar meio emoji).
 */
export function nomeArquivoDeclaracao(titulo: string, ext: "pdf" | "docx"): string {
  const limpo = Array.from(
    String(titulo ?? "")
      .replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]/gu, "-")
      .replace(/\s+/g, " ")
      .trim()
  )
    .slice(0, 150)
    .join("")
    .trim();
  const semAcento = limpo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let nome = "Declaração";
  if (limpo) nome = semAcento.startsWith("declaracao") ? limpo : `Declaração - ${limpo}`;
  return `${nome}.${ext}`;
}

export interface DadosDeclaracao {
  empresa: EmpresaDocumento;
  titulo: string;
  destinatario: string | null; // órgão
  referencia: string | null; // "Ref.: <edital> — <objeto>"
  paragrafos: string[];
  localData: string;
  representante: Representante;
}

export function montarDadosDeclaracao(p: {
  titulo: string;
  texto: string;
  cabecalho: CabecalhoLicitacao;
}): DadosDeclaracao {
  const cab = p.cabecalho;
  const paragrafos = String(p.texto ?? "")
    .split(/\r?\n[ \t]*\r?\n/)
    .map((bloco) => bloco.replace(/[ \t]*\r?\n[ \t]*/g, " ").trim())
    .filter(Boolean);
  const partesReferencia = [
    (cab.edital ?? "").trim(),
    (cab.objeto ?? "").trim().slice(0, 300).trim(),
  ].filter(Boolean);
  return {
    empresa: { ...cab.empresa },
    titulo: p.titulo,
    destinatario: cab.orgao || null,
    referencia: partesReferencia.length > 0 ? `Ref.: ${partesReferencia.join(" — ")}` : null,
    paragrafos,
    localData: cab.localData,
    representante: { ...cab.representante },
  };
}
