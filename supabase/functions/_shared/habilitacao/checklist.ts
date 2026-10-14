/**
 * Checklist da habilitação de uma licitação (spec 2026-10-09 §4): cruza o que o edital exige com
 * os Arquivos da oportunidade e a biblioteca de documentos, e diz o que falta, o que está vencido e
 * o que falta assinar. O edital lido não tem lista estruturada de certidões e declarações: elas
 * ficam em habilitacao.outros_documentos (texto livre), que aqui é classificado por palavras-chave;
 * o que não for reconhecido volta como "verificar". Puro: sem Deno e sem import de URL.
 *
 * Também guarda o núcleo da conferência das cópias da biblioteca que ficaram na pasta do envelope
 * (`copiasDaBiblioteca` e `conferirCopiasComOsAtivos`), usado por este checklist e pela ferramenta
 * `anexar_habilitacao`.
 */
import { CATEGORIAS_EDITAL } from "../conector/envio-regras.ts";
import { dataDaSessao } from "./data-sessao.ts";
import {
  diasAte,
  IDS_TIPO_DOCUMENTO,
  rotuloDoTipo,
  situacaoDaValidade,
  TIPOS_ESSENCIAIS,
  type DocumentoBiblioteca,
} from "./documentos-regras.ts";

const CATEGORIAS_DO_EDITAL = new Set<string>(CATEGORIAS_EDITAL);

/** Origem dos arquivos copiados da biblioteca: `biblioteca:<acervo_documento.id>`. */
export const PREFIXO_BIBLIOTECA = "biblioteca:";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** A lista tem ao menos um item (nulo não é item). */
const temItem = (v: unknown): boolean => lista(v).some((x) => x !== null && x !== undefined);
/** O texto de uma linha de `outros_documentos` (texto solto ou `{ descricao }`), sem as pontas em branco; null se vazio. */
const descricaoDaLinha = (item: unknown): string | null => {
  const d = typeof item === "string" ? item : obj(item).descricao;
  return typeof d === "string" && d.trim() ? d : null;
};

const semAcento = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * A pasta "Edital" é comparada como a tela faz (apps/web/src/lib/pastas-arquivo.js, `pastaDoArquivo`): vale a pasta
 * gravada, sem maiúsculas, acento nem espaço sobrando (`normalizarTexto` da tela). O upload manual grava só a pasta
 * "Edital", sem categoria. A tela, sem pasta gravada, manda a categoria do edital para essa mesma pasta: isso o
 * checklist já cobre pela categoria.
 *
 * O servidor, porém, conta o edital por categoria OU por pasta, e a tela decide por uma regra só: um arquivo com
 * categoria de edital que foi movido para outra pasta conta aqui, e a tela o mostra na outra pasta. A diferença é de
 * propósito: o arquivo existe nos Arquivos da oportunidade, então contá-lo é inofensivo (o contrário mandaria anexar
 * de novo um edital que já está lá).
 */
const chaveDaPasta = (v: unknown) =>
  semAcento(
    String(v ?? "")
      .trim()
      .replace(/\s+/g, " ")
  );
const CHAVE_PASTA_EDITAL = chaveDaPasta("Edital");
const estaNaPastaEdital = (a: { pasta?: unknown }) => chaveDaPasta(a.pasta) === CHAVE_PASTA_EDITAL;

/**
 * Inscrição estadual e municipal: cada uma casa de forma INDEPENDENTE da outra, porque o edital as junta
 * ("inscrição estadual e municipal", "estadual ou municipal", "estadual e/ou municipal"). Depois de "inscrição" (ou
 * "cadastro de contribuintes") só passam palavras de ligação, para "inscrição no CNPJ ... débitos municipais" não virar
 * a inscrição municipal.
 */
const LIGACAO_INSCRICAO =
  "(?: (?:no|na|nos|nas|do|da|dos|das|de|em|e|ou|e\\/ou|cadastro|contribuintes?|estadua(?:l|is)|municipa(?:l|is)|\\(i[em]\\))){0,8}";
const RE_INSCRICAO_ESTADUAL = new RegExp(
  `(?:inscri\\w*|cadastro de contribuintes?)${LIGACAO_INSCRICAO} estadua(?:l|is)`,
  "g"
);
const RE_INSCRICAO_MUNICIPAL = new RegExp(
  `(?:inscri\\w*|cadastro de contribuintes?)${LIGACAO_INSCRICAO} municipa(?:l|is)|cadastro mobiliario`,
  "g"
);

/**
 * [padrão, tipo, não vale se a linha casar com]: a ordem importa; o trecho casado some do texto antes da regra seguinte.
 * Cuidados contra falso positivo (que deixaria um documento a mais "faltando" para sempre):
 *  - "CRC" sozinho não é o SICAF: é, quase sempre, o Conselho Regional de Contabilidade ("balanço assinado por
 *    contador, com registro no CRC"). O cadastro é reconhecido por "SICAF" ou "Certificado de Registro Cadastral";
 *  - "Junta Comercial" sozinha não pede a certidão simplificada ("contrato social registrado na Junta Comercial"):
 *    só quando a palavra "certidão" vem antes, na mesma frase;
 *  - "CREA" em linha de atestado, CAT ou acervo é o registro do atestado, não a certidão de registro da empresa.
 */
const SO_DO_ACERVO = /atestado|acervo|\bcat\b/;
const REGRAS_TIPO: [RegExp, string, RegExp?][] = [
  [/fgts|fundo de garantia/g, "crf_fgts"],
  [/trabalhista|cndt/g, "cndt_trabalhista"],
  [/falencia|recuperacao judicial|concordata/g, "certidao_falencia"],
  [/certidao simplificada|certidao[^,.;]{0,60}junta comercial/g, "certidao_junta"],
  [/sicaf|certificado de registro cadastral/g, "sicaf"],
  [/cnpj|cadastro nacional d[ae] pessoa juridica/g, "cartao_cnpj"],
  [/contrato social|ato constitutivo|estatuto|requerimento de empresario/g, "contrato_social"],
  [/balanco patrimonial|demonstracoes contabeis|demonstracao do resultado/g, "balanco_dre"],
  [/alvara/g, "alvara"],
  [/procuracao/g, "procuracao"],
  [/\b(crea|cau)\b/g, "certidao_crea_pj", SO_DO_ACERVO],
];

/**
 * Exigência condicional ("quando for o caso"): o SIGO não sabe se vale para esta empresa, então não classifica.
 * O texto já chegou sem acento e em minúsculas ("quando aplicável" e "quando aplicavel" viram a mesma coisa).
 */
const CONDICIONAL =
  /quando for o caso|se for o caso|se houver|caso exista|quando houver|se couber|quando aplicavel|se existir/;

/** Só valem em texto com "declaração": sem ela, "ME/EPP" é o prazo de regularização e "menor" é outra coisa. */
const REGRAS_DECLARACAO: [RegExp, string][] = [
  [
    /emprega\w* menor|trabalho (do|de) menor|menor(es)? de (18|dezoito|16|dezesseis)|xxxiii/,
    "nao_emprega_menor",
  ],
  [/fatos? impeditivos?|superveniente/, "fato_impeditivo"],
  [/microempresa|pequeno porte|me\/epp|lei complementar (n\S* ?)?123|\blc 123/, "me_epp"],
  [/requisitos de habilitacao/, "requisitos_habilitacao"],
  // "reabilitada" sozinho é outra coisa (a reabilitação da idoneidade): só o reabilitado da Previdência vale
  [
    /reserva de cargos|pessoas? com deficiencia|reabilitad[oa]s? (?:d|pel)a previdencia/,
    "reserva_cargos",
  ],
  [/elaboracao independente/, "elaboracao_independente"],
];

/**
 * O edital exige qualificação técnica (operacional ou profissional) quando alguma das duas listas tem item. É o que
 * faz o "Atende?" (e as CATs) entrarem na conta.
 */
export function exigeQualificacaoTecnica(extraido: unknown): boolean {
  const h = obj(obj(extraido).habilitacao);
  return temItem(h.tecnica_operacional) || temItem(h.tecnica_profissional);
}

/** Registros do CREA: a certidão de registro da empresa (certidao_crea_pj) é o documento que os cobre. */
const TIPOS_REGISTRO_CREA = ["crea", "visto_crea"];

/**
 * Registro que NENHUM documento da biblioteca cobre (cadastro em concessionária, "outro" e qualquer tipo que não seja
 * o do CREA): não gera linha de documento nem de "verificar", então só o Atende? o confere. Item nulo não conta;
 * tipo ilegível conta (o `sanearEdital` o transformaria em "outro").
 */
export function temRegistroForaDoCrea(extraido: unknown): boolean {
  return lista(obj(obj(extraido).habilitacao).registros).some(
    (r) => r !== null && r !== undefined && !TIPOS_REGISTRO_CREA.includes(String(obj(r).tipo))
  );
}

/**
 * O Atende? é parte da conta quando o edital exige qualificação técnica, registro que nenhum documento cobre
 * (`registrar_atende` trata os `registros` como técnica) OU qualificação econômico-financeira (o Atende? confere os
 * índices e o patrimônio líquido com o balanço da empresa). Com técnica exige veredito e CAT citada; só com registro ou
 * só com a parte econômica exige o veredito (nenhuma CAT).
 */
export function exigeAtende(extraido: unknown): boolean {
  const h = obj(obj(extraido).habilitacao);
  return (
    exigeQualificacaoTecnica(extraido) || temRegistroForaDoCrea(extraido) || temItem(h.economica)
  );
}

export type SituacaoDaAnalise = "ausente" | "sem_exigencias" | "com_exigencias";

/**
 * O que a análise gravada do edital diz:
 *  - `ausente`: não há análise (ausente, vazia `{}` ou que não é objeto);
 *  - `sem_exigencias`: há análise, mas NENHUMA exigência de habilitação (`outros_documentos` com texto, as técnicas, a
 *    econômica e os registros vazios): o edital pode ter a habilitação noutro anexo, e o `sanearEdital` devolve sempre
 *    todas as chaves, então `{}` não basta para reconhecer a análise vazia. `exclusiva_me_epp` sozinho NÃO é exigência de
 *    habilitação (é a modalidade da licitação; a declaração ME/EPP continua exigida por `declExigidas`);
 *  - `com_exigencias`: o checklist tem o que conferir.
 */
export function situacaoDaAnalise(extraido: unknown): SituacaoDaAnalise {
  const e = obj(extraido);
  if (Object.keys(e).length === 0) return "ausente";
  const h = obj(e.habilitacao);
  const temExigencia =
    lista(h.outros_documentos).some((item) => descricaoDaLinha(item) !== null) ||
    ["tecnica_operacional", "tecnica_profissional", "economica", "registros"].some((k) =>
      temItem(h[k])
    );
  return temExigencia ? "com_exigencias" : "sem_exigencias";
}

/** O veredito gravado no Atende? ("atende", "atende_parcialmente" ou "nao_atende"); null se não há texto. */
export function vereditoDoAtende(atende: unknown): string | null {
  const v = obj(atende).veredito;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Na ordem de IDS_TIPO_DOCUMENTO, sem repetir. */
const naOrdemDosTipos = (tipos: Iterable<string>) => {
  const conjunto = new Set(tipos);
  return IDS_TIPO_DOCUMENTO.filter((t) => conjunto.has(t));
};

/**
 * O que uma linha de exigência do edital pede: tipos de documento da biblioteca e/ou declarações com modelo.
 * Errar para "não reconheci" é seguro (a linha cai em "verificar" e o checklist não fica pronto); errar para
 * "reconheci" não é. Por isso:
 *  - exigência condicional ("quando for o caso", "se houver") → nada reconhecido;
 *  - texto sem "declaração": só documentos (as regras de declaração não valem);
 *  - texto com "declaração": se algum modelo é reconhecido, vale a declaração E os documentos que a mesma linha
 *    também pede ("alvará e declaração de que não emprega menor"); se nenhum modelo é reconhecido, é uma declaração
 *    que o SIGO não tem, e palavras soltas ("trabalhistas", "CREA") NÃO viram documento;
 *  - mais ocorrências de "declaração" do que modelos reconhecidos ("não emprega menor e declaração de normas de
 *    segurança do trabalho"): sobrou uma declaração sem modelo e a linha não pode ficar "coberta" → nada reconhecido.
 */
export function classificarExigencia(descricao: unknown): {
  tipos: string[];
  declaracoes: string[];
} {
  const original = semAcento(descricao).replace(/\s+/g, " ").trim();
  if (!original || CONDICIONAL.test(original)) return { tipos: [], declaracoes: [] };
  const comDeclaracao = original.includes("declarac");
  const declaracoes = comDeclaracao
    ? REGRAS_DECLARACAO.filter(([re]) => re.test(original)).map(([, chave]) => chave)
    : [];
  const ocorrenciasDeDeclaracao = original.split("declarac").length - 1;
  if (comDeclaracao && (declaracoes.length === 0 || ocorrenciasDeDeclaracao > declaracoes.length)) {
    return { tipos: [], declaracoes: [] };
  }
  let t = original;
  const tipos: string[] = [];
  // as duas inscrições são lidas no texto inteiro (uma não pode consumir a outra) e só depois somem dele
  if (t.search(RE_INSCRICAO_ESTADUAL) >= 0) tipos.push("inscricao_estadual");
  if (t.search(RE_INSCRICAO_MUNICIPAL) >= 0) tipos.push("inscricao_municipal");
  t = t.replace(RE_INSCRICAO_MUNICIPAL, " ").replace(RE_INSCRICAO_ESTADUAL, " ");
  for (const [re, tipo, exceto] of REGRAS_TIPO) {
    if (t.search(re) >= 0 && !exceto?.test(original)) {
      tipos.push(tipo);
      t = t.replace(re, " ");
    }
  }
  // regularidade fiscal: federal, estadual e municipal podem vir na mesma frase
  if (
    /fazenda|tribut|debitos?|regularidade fiscal|divida ativa|certidao (negativa|positiva)/.test(t)
  ) {
    // quem emite (prefeitura, tribunal) não é a esfera do tributo: "falência... Justiça Estadual" não pede a CND estadual
    const semLugar = t.replace(
      /prefeitura municipal|camara municipal|governo estadual|secretaria (municipal|estadual)|justica (estadual|federal|do trabalho)|tribunal (de justica|regional federal)/g,
      " "
    );
    if (/federa(l|is)|uniao|pgfn|seguridade social|\binss\b/.test(semLugar))
      tipos.push("cnd_federal");
    if (/estadua(l|is)/.test(semLugar)) tipos.push("cnd_estadual");
    if (/municipa(l|is)/.test(semLugar)) tipos.push("cnd_municipal");
  }
  return { tipos: naOrdemDosTipos(tipos), declaracoes };
}

// ─── cópias da biblioteca que ficaram na pasta do envelope ─────────────────────────────────────

/** Um arquivo da oportunidade copiado da biblioteca (origem `biblioteca:<documento_id>`). */
export interface CopiaDaBiblioteca {
  arquivoId: string;
  nome: string;
  documentoId: string;
}

/**
 * Os arquivos de origem `biblioteca:<documento_id>`. Os de outra origem (`acervo:`, `gerado:`, `declaracao:`,
 * `url:`), os sem origem e os de origem que não é texto ficam de fora.
 */
export function copiasDaBiblioteca(
  arquivos: readonly { id: string; nome?: unknown; origem?: unknown }[]
): CopiaDaBiblioteca[] {
  return arquivos
    .filter((a) => typeof a.origem === "string" && a.origem.startsWith(PREFIXO_BIBLIOTECA))
    .map((a) => ({
      arquivoId: a.id,
      nome: String(a.nome ?? ""),
      documentoId: String(a.origem).slice(PREFIXO_BIBLIOTECA.length),
    }));
}

/** A validade já passou em `hojeISO` (vencer hoje ainda vale; sem data ou data inválida, não venceu). */
export const documentoVencido = (validade: unknown, hojeISO: string): boolean =>
  situacaoDaValidade(validade, hojeISO).situacao === "vencido";

/**
 * Separa as cópias pelo que a biblioteca de documentos ATIVOS diz:
 *  - `vencidas`: o documento está entre os ativos e já venceu;
 *  - `foraDosAtivos`: o documento não está entre os ativos (foi substituído por uma versão nova, removido ou nunca
 *    existiu). Quem tem acesso aos inativos decide qual dos três é; quem só lê os ativos não distingue.
 * As cópias de documento ativo e em vigor somem da conferência: estão certas.
 */
export function conferirCopiasComOsAtivos(
  copias: readonly CopiaDaBiblioteca[],
  ativos: ReadonlyMap<string, { validade?: unknown }>,
  hojeISO: string
): { vencidas: CopiaDaBiblioteca[]; foraDosAtivos: CopiaDaBiblioteca[] } {
  const vencidas: CopiaDaBiblioteca[] = [];
  const foraDosAtivos: CopiaDaBiblioteca[] = [];
  for (const c of copias) {
    const d = ativos.get(c.documentoId);
    if (!d) foraDosAtivos.push(c);
    else if (documentoVencido(d.validade, hojeISO)) vencidas.push(c);
  }
  return { vencidas, foraDosAtivos };
}

// ─── o checklist ───────────────────────────────────────────────────────────────────────────────

export interface ArquivoChecklist {
  id: string;
  nome: string;
  pasta: string | null;
  categoria: string | null;
  origem: string | null;
  assinatura: string | null;
}

export interface EntradaChecklist {
  extraido: unknown; // edital_analise.extraido (ou null)
  atende: unknown; // edital_analise.atende (ou null)
  /** A coluna oportunidade.licitacao_data (a "Sessão" da tela): vale mais que a data do edital. */
  licitacaoData?: unknown;
  /**
   * A oportunidade tem cronograma físico-financeiro gravado (ou já tem arquivo de cronograma gerado). Padrão `true`.
   * Com `false`, o cronograma que ainda não existe não conta como falta (`sem_cronograma`): nem todo edital o pede.
   */
  temCronograma?: boolean;
  arquivos: ArquivoChecklist[];
  documentos: DocumentoBiblioteca[]; // os ativos da biblioteca
  atestados: { id: string; numero: string | null; arquivo_ref: string | null }[]; // os de cats_anexar que existem
  modelos: { chave: string; titulo: string }[];
  hojeISO: string;
}

export type SituacaoDocumento =
  | "anexado"
  | "nao_anexado"
  | "vencido"
  | "falta"
  | "vence_antes_da_sessao";

export interface CopiaDesatualizadaChecklist {
  arquivo_id: string;
  nome: string;
  /**
   * `vencido`: o documento está ativo na biblioteca e já venceu. `substituido_ou_removido`: o documento não está
   * entre os ativos (renovado pela tela, com versão nova, ou removido): o checklist só lê os ativos e não distingue.
   */
  motivo: "vencido" | "substituido_ou_removido";
}

export interface Checklist {
  sessao: string | null;
  edital: { situacao: "ok" | "falta"; arquivos: number };
  proposta: {
    documento: string;
    /** `sem_cronograma`: só nas linhas do cronograma, quando a oportunidade não tem cronograma gravado. */
    situacao: "ok" | "falta" | "falta_assinar" | "sem_cronograma";
    nome: string | null;
  }[];
  certidoes: {
    tipo: string;
    rotulo: string;
    exigido_no_edital: boolean;
    situacao: SituacaoDocumento;
    validade: string | null;
    documentos: number;
  }[];
  acervo: {
    atestado_id: string;
    numero: string | null;
    situacao: "anexado" | "nao_anexado" | "sem_pdf" | "nao_encontrado";
  }[];
  declaracoes: {
    chave: string;
    titulo: string;
    exigida_no_edital: boolean;
    situacao: "ok" | "falta" | "falta_assinar";
  }[];
  outros_documentos: {
    descricao: string;
    pagina: number | null;
    classificado_como: string[];
    situacao: "coberto" | "verificar";
  }[];
  falta_assinar: { arquivo_id: string; nome: string; pasta: string | null }[];
  copias_desatualizadas: CopiaDesatualizadaChecklist[];
  resumo: {
    faltam: number;
    vencidos: number;
    falta_assinar: number;
    verificar: number;
    desatualizadas: number;
    /** 1 quando a oportunidade não tem a análise do edital gravada (conta em `faltam`), senão 0. */
    sem_analise: number;
    /** 1 quando o edital exige qualificação técnica e o Atende? não foi gravado, ou não citou CAT (conta em `faltam`). */
    sem_atende: number;
    /** 1 quando o veredito gravado do Atende? é "nao_atende" (trava o `pronto`; não conta em `faltam`), senão 0. */
    atende_negativo: number;
    /** Quantas exigências do edital o SIGO não reconheceu e o usuário confere à mão (= `verificar`). */
    conferir_a_mao: number;
    /**
     * Todos os contadores do SIGO em zero, EXCETO `verificar`: o SIGO não achou pendência; só restam as exigências a
     * conferir à mão (`conferir_a_mao`). `pronto` continua estrito: exige também `verificar` = 0.
     */
    sem_pendencia_do_sigo: boolean;
    pronto: boolean;
  };
  proximos_passos: string[];
}

const DOCUMENTOS_DA_PROPOSTA: [string, string][] = [
  ["proposta_pdf", "gerado:proposta:pdf"],
  ["proposta_xlsx", "gerado:proposta:xlsx"],
  ["cronograma_pdf", "gerado:cronograma:pdf"],
  ["cronograma_xlsx", "gerado:cronograma:xlsx"],
];

const LIMITE_DESCRICAO = 300;
/** Quantos nomes de arquivo o passo de exclusão lista; o resto vira "e mais N". */
const MAX_NOMES_NO_PASSO = 10;
const ordemDosNomes = (
  a: { nome: string; arquivo_id: string },
  b: { nome: string; arquivo_id: string }
) =>
  a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) ||
  a.arquivo_id.localeCompare(b.arquivo_id);

export function montarChecklist(p: EntradaChecklist): Checklist {
  const hoje = p.hojeISO;
  const extraido = obj(p.extraido);
  const atende = obj(p.atende);
  const habilitacao = obj(extraido.habilitacao);
  const arquivos = lista(p.arquivos).filter(
    (a): a is ArquivoChecklist => !!a && typeof a === "object"
  );

  // A mesma data da sessão da anexar_habilitacao: a coluna da oportunidade (vale até no passado), senão a do edital
  const sessaoLida = dataDaSessao(
    { licitacao_data: p.licitacaoData, edital_analise: { extraido: p.extraido } },
    hoje
  );
  const sessao = sessaoLida.data;
  const sessaoFutura = sessaoLida.futura;

  // ── o que o edital exige ──
  const exigidos = new Set<string>();
  const declExigidas = new Set<string>();
  const outros: Checklist["outros_documentos"] = [];
  for (const item of lista(habilitacao.outros_documentos)) {
    const descricao = descricaoDaLinha(item);
    if (descricao === null) continue;
    const c = classificarExigencia(descricao);
    c.tipos.forEach((t) => exigidos.add(t));
    c.declaracoes.forEach((d) => declExigidas.add(d));
    const pagina = typeof item === "string" ? null : obj(item).pagina;
    const classificado = [...c.tipos, ...c.declaracoes.map((d) => `declaracao:${d}`)];
    outros.push({
      descricao: descricao.trim().slice(0, LIMITE_DESCRICAO),
      pagina: typeof pagina === "number" && Number.isFinite(pagina) ? pagina : null,
      classificado_como: classificado,
      situacao: classificado.length ? "coberto" : "verificar",
    });
  }
  if (lista(habilitacao.economica).length > 0) exigidos.add("balanco_dre");
  if (lista(habilitacao.registros).some((r) => TIPOS_REGISTRO_CREA.includes(String(obj(r).tipo)))) {
    exigidos.add("certidao_crea_pj");
  }
  if (extraido.exclusiva_me_epp === true) declExigidas.add("me_epp");

  // ── edital: a categoria do edital (arquivo do conector) ou a pasta "Edital" (upload da tela, sem categoria) ──
  const doEdital = arquivos.filter(
    (a) => (a.categoria !== null && CATEGORIAS_DO_EDITAL.has(a.categoria)) || estaNaPastaEdital(a)
  );
  const edital: Checklist["edital"] = {
    situacao: doEdital.length > 0 ? "ok" : "falta",
    arquivos: doEdital.length,
  };

  // ── proposta e cronograma (o PDF é o que se assina) ──
  // Sem cronograma gravado, o cronograma que não existe não é falta: nem todo edital o pede (o arquivo que já existe
  // mostra a situação real)
  const temCronograma = p.temCronograma !== false;
  const proposta: Checklist["proposta"] = DOCUMENTOS_DA_PROPOSTA.map(([documento, origem]) => {
    const a = arquivos.find((x) => x.origem === origem);
    if (!a) {
      const semCronograma = !temCronograma && documento.startsWith("cronograma_");
      return { documento, situacao: semCronograma ? "sem_cronograma" : "falta", nome: null };
    }
    return {
      documento,
      situacao: a.assinatura === "pendente" ? "falta_assinar" : "ok",
      nome: String(a.nome ?? ""),
    };
  });

  // ── certidões e documentos da biblioteca ──
  const ativos = lista(p.documentos).filter(
    (d): d is DocumentoBiblioteca =>
      !!d && typeof d === "object" && (d as DocumentoBiblioteca).ativo !== false
  );
  const copias = copiasDaBiblioteca(arquivos);
  const idsAnexados = new Set(copias.map((c) => c.documentoId));
  /** A validade como "AAAA-MM-DD" real, ou null (sem validade ou data inválida). */
  const validadeDe = (d: DocumentoBiblioteca): string | null => {
    const v = typeof d.validade === "string" ? d.validade.slice(0, 10) : null;
    return v !== null && diasAte(v, hoje) !== null ? v : null;
  };
  const datasDe = (docs: DocumentoBiblioteca[]) =>
    docs
      .map(validadeDe)
      .filter((v): v is string => v !== null)
      .sort();
  /**
   * Tipos que vencem antes da sessão mas já têm OUTRO documento ativo, válido até a sessão, só não anexado: o
   * remédio é anexar (passo 3), não atualizar a biblioteca (passo 4).
   */
  const resolveAnexando = new Set<string>();
  const certidoes: Checklist["certidoes"] = naOrdemDosTipos([...TIPOS_ESSENCIAIS, ...exigidos]).map(
    (tipo) => {
      const docs = ativos.filter((d) => d.tipo === tipo);
      const cabeca = { tipo, rotulo: rotuloDoTipo(tipo), exigido_no_edital: exigidos.has(tipo) };
      if (!docs.length) return { ...cabeca, situacao: "falta", validade: null, documentos: 0 };
      const validos = docs.filter((d) => !documentoVencido(d.validade, hoje));
      const anexados = validos.filter((d) => idsAnexados.has(String(d.id)));
      if (anexados.length) {
        // vence antes da sessão só quando TODOS os anexados têm validade e todas passam antes dela (um sem validade
        // nunca vence, e um que ainda vale na sessão também cobre o tipo)
        const venceAntes =
          !!sessaoFutura &&
          anexados.every((d) => {
            const v = validadeDe(d);
            return v !== null && (diasAte(v, sessaoFutura) ?? 0) < 0;
          });
        if (venceAntes && sessaoFutura) {
          const serve = validos.some((d) => {
            const v = validadeDe(d);
            return (
              !idsAnexados.has(String(d.id)) && (v === null || (diasAte(v, sessaoFutura) ?? 0) >= 0)
            );
          });
          if (serve) resolveAnexando.add(tipo);
        }
        return {
          ...cabeca,
          situacao: venceAntes ? "vence_antes_da_sessao" : "anexado",
          validade: datasDe(anexados)[0] ?? null,
          documentos: docs.length,
        };
      }
      if (validos.length) {
        return {
          ...cabeca,
          situacao: "nao_anexado",
          validade: datasDe(validos)[0] ?? null,
          documentos: docs.length,
        };
      }
      return {
        ...cabeca,
        situacao: "vencido",
        validade: datasDe(docs).at(-1) ?? null,
        documentos: docs.length,
      };
    }
  );

  // ── acervo técnico (as CATs que o Atende? mandou anexar) ──
  const atestadosPorId = new Map(
    lista(p.atestados)
      .filter((a): a is EntradaChecklist["atestados"][number] => !!a && typeof a === "object")
      .map((a) => [String(a.id).toLowerCase(), a])
  );
  const idsNaPasta = new Set(
    arquivos
      .map((a) => a.origem)
      .filter((o): o is string => typeof o === "string" && o.startsWith("acervo:"))
      .map((o) => o.slice("acervo:".length).toLowerCase())
  );
  const acervo: Checklist["acervo"] = [];
  const vistos = new Set<string>();
  for (const item of lista(atende.cats_anexar)) {
    const bruto = obj(item).id;
    const id = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const a = atestadosPorId.get(id);
    const numeroDoAtende = obj(item).numero;
    const numero =
      (typeof a?.numero === "string" && a.numero ? a.numero : null) ??
      (typeof numeroDoAtende === "string" && numeroDoAtende ? numeroDoAtende : null);
    let situacao: Checklist["acervo"][number]["situacao"];
    if (idsNaPasta.has(id)) situacao = "anexado";
    else if (!a) situacao = "nao_encontrado";
    else if (typeof a.arquivo_ref !== "string" || !a.arquivo_ref.trim()) situacao = "sem_pdf";
    else situacao = "nao_anexado";
    acervo.push({ atestado_id: id, numero, situacao });
  }

  // ── declarações: as que o edital pede e as que já estão na pasta (só o PDF vale como a declaração) ──
  const pdfsDeDeclaracao = new Map<string, ArquivoChecklist>();
  for (const a of arquivos) {
    const m = typeof a.origem === "string" ? /^declaracao:([^:]+):pdf$/.exec(a.origem) : null;
    if (m && !pdfsDeDeclaracao.has(m[1])) pdfsDeDeclaracao.set(m[1], a);
  }
  const modelosPorChave = new Map(
    lista(p.modelos)
      .filter((m): m is EntradaChecklist["modelos"][number] => !!m && typeof m === "object")
      .map((m) => [m.chave, m.titulo])
  );
  const nomeSemExtensao = (a: ArquivoChecklist) =>
    String(a.nome ?? "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .trim();
  // A declaração gerada com o texto do edital (`declaracao:edital_<título>:pdf`) tem a chave do TÍTULO, não a do
  // modelo. Se o título é uma declaração que o SIGO reconhece (a mesma classificação das exigências do edital), o PDF
  // cobre essa chave também, com o estado de assinatura dele; sem isso o edital exigiria "nao_emprega_menor", o PDF
  // "edital_declaracao_de_que_nao_emprega_menor" estaria na pasta, e o checklist mandaria gerar a declaração de novo.
  const coberturaDoEdital = new Map<string, ArquivoChecklist>();
  for (const [chavePdf, pdf] of pdfsDeDeclaracao) {
    if (!chavePdf.startsWith("edital_")) continue;
    // O título é o nome do arquivo; o servidor só acrescenta o prefixo "Declaração - " quando o título NÃO começa com
    // "Declaração" (nomeArquivoDeclaracao), e a chave mostra qual foi o caso: "edital_declaracao…" = título puro.
    let titulo = semAcento(nomeSemExtensao(pdf));
    if (!chavePdf.startsWith("edital_declaracao")) {
      titulo = titulo.replace(/^declaracao\s*-\s*/, "");
    }
    for (const chave of classificarExigencia(titulo).declaracoes) {
      const atual = coberturaDoEdital.get(chave);
      // com dois PDFs do edital para a mesma chave, o que já está assinado resolve
      if (!atual || (atual.assinatura === "pendente" && pdf.assinatura !== "pendente")) {
        coberturaDoEdital.set(chave, pdf);
      }
    }
  }
  const declaracoes: Checklist["declaracoes"] = [
    ...new Set([...declExigidas, ...pdfsDeDeclaracao.keys()]),
  ].map((chave) => {
    // o PDF da própria chave vale antes; sem ele, o PDF do texto do edital que cobre a chave
    const pdf = pdfsDeDeclaracao.get(chave) ?? coberturaDoEdital.get(chave);
    const doNome = pdfsDeDeclaracao.has(chave) ? nomeSemExtensao(pdfsDeDeclaracao.get(chave)!) : "";
    return {
      chave,
      titulo: modelosPorChave.get(chave) || doNome || chave,
      exigida_no_edital: declExigidas.has(chave),
      situacao: !pdf ? "falta" : pdf.assinatura === "pendente" ? "falta_assinar" : "ok",
    };
  });

  // ── assinaturas pendentes ──
  const faltaAssinar: Checklist["falta_assinar"] = arquivos
    .filter((a) => a.assinatura === "pendente")
    .map((a) => ({ arquivo_id: a.id, nome: String(a.nome ?? ""), pasta: a.pasta ?? null }));

  // ── cópias da biblioteca que ficaram na pasta e hoje não valem ──
  const { vencidas, foraDosAtivos } = conferirCopiasComOsAtivos(
    copias,
    new Map(ativos.map((d) => [String(d.id), d])),
    hoje
  );
  const desatualizadas: CopiaDesatualizadaChecklist[] = [
    ...vencidas.map((c) => ({ arquivo_id: c.arquivoId, nome: c.nome, motivo: "vencido" as const })),
    ...foraDosAtivos.map((c) => ({
      arquivo_id: c.arquivoId,
      nome: c.nome,
      motivo: "substituido_ou_removido" as const,
    })),
  ].sort(ordemDosNomes);

  // ── resumo ──
  const doc = (situacao: string) => certidoes.filter((c) => c.situacao === situacao).length;
  const pdfEmFalta = proposta.filter(
    (x) => x.documento.endsWith("_pdf") && x.situacao === "falta"
  ).length;
  // Sem a análise do edital o SIGO não sabe o que ele exige: nunca "pronto". Vale para a análise ausente e para a
  // gravada sem NENHUMA exigência de habilitação (a habilitação pode estar noutro anexo que ninguém leu).
  const situacaoDaAnaliseGravada = situacaoDaAnalise(p.extraido);
  const semAnalise = situacaoDaAnaliseGravada === "com_exigencias" ? 0 : 1;
  // O Atende? entra na conta quando o edital exige técnica, registro que nenhum documento cobre ou qualificação
  // econômico-financeira (`exigeAtende`). Com técnica ele precisa de veredito E de ao menos uma CAT citada; só com
  // registro ou só com a parte econômica basta o veredito. Veredito que não é "atende" não é falta:
  // "atende_parcialmente" é aviso da ferramenta e "nao_atende" é o `atende_negativo` abaixo (o veredito existe; pedir
  // para gravar de novo não resolveria).
  const veredito = vereditoDoAtende(atende);
  const semAtende =
    exigeAtende(extraido) &&
    (veredito === null ||
      (veredito !== "nao_atende" && exigeQualificacaoTecnica(extraido) && acervo.length === 0))
      ? 1
      : 0;
  // Resposta clara de "a empresa NÃO atende": o checklist nunca fica pronto, qualquer que seja o edital.
  const atendeNegativo = veredito === "nao_atende" ? 1 : 0;
  const faltam =
    (edital.situacao === "falta" ? 1 : 0) +
    pdfEmFalta +
    doc("falta") +
    doc("nao_anexado") +
    acervo.filter((a) => a.situacao !== "anexado").length +
    declaracoes.filter((d) => d.situacao === "falta").length +
    semAnalise +
    semAtende;
  const vencidos = doc("vencido") + doc("vence_antes_da_sessao");
  const verificar = outros.filter((o) => o.situacao === "verificar").length;
  // o que é pendência do SIGO (tudo, menos as exigências em "verificar", que só o usuário confere)
  const semPendenciaDoSigo =
    faltam === 0 &&
    vencidos === 0 &&
    faltaAssinar.length === 0 &&
    desatualizadas.length === 0 &&
    semAnalise === 0 &&
    semAtende === 0 &&
    atendeNegativo === 0;
  const resumo: Checklist["resumo"] = {
    faltam,
    vencidos,
    falta_assinar: faltaAssinar.length,
    verificar,
    desatualizadas: desatualizadas.length,
    sem_analise: semAnalise,
    sem_atende: semAtende,
    atende_negativo: atendeNegativo,
    conferir_a_mao: verificar,
    sem_pendencia_do_sigo: semPendenciaDoSigo,
    pronto: semPendenciaDoSigo && verificar === 0,
  };

  // ── próximos passos (só os que se aplicam, nesta ordem) ──
  const passos: string[] = [];
  if (edital.situacao === "falta") {
    passos.push(
      "Anexe o edital: anexar_edital_por_url (link público do arquivo) ou gerar_link_envio."
    );
  }
  if (semAnalise) {
    passos.push(
      situacaoDaAnaliseGravada === "ausente"
        ? "Grave a análise do edital (ler_edital_anexado e criar_ou_atualizar_oportunidade) para o SIGO conferir as exigências."
        : "Releia a parte de habilitação do edital (ler_edital_anexado, roteiro analisar_edital) e grave com criar_ou_atualizar_oportunidade passando o oportunidade_id desta oportunidade: a análise gravada não tem nenhuma exigência de habilitação."
    );
  }
  if (pdfEmFalta > 0) {
    passos.push(
      temCronograma
        ? "Gere a proposta e o cronograma: gerar_documentos_proposta."
        : "Gere a proposta: gerar_documentos_proposta."
    );
  }
  if (!temCronograma) {
    passos.push(
      "Se o edital pede cronograma físico-financeiro, grave com importar_cronograma e chame gerar_documentos_proposta de novo."
    );
  }
  if (doc("nao_anexado") > 0 || resolveAnexando.size > 0) {
    passos.push("Anexe a habilitação que já está na biblioteca: anexar_habilitacao.");
  }
  // o tipo que vence antes da sessão mas tem outro documento válido na biblioteca se resolve anexando (passo acima)
  const aAtualizar = certidoes.filter(
    (c) =>
      ["falta", "vencido"].includes(c.situacao) ||
      (c.situacao === "vence_antes_da_sessao" && !resolveAnexando.has(c.tipo))
  );
  if (aAtualizar.length > 0) {
    passos.push(
      `Atualize em Acervo técnico → Documentos e certidões: ${aAtualizar.map((c) => c.rotulo).join("; ")}.`
    );
  }
  if (desatualizadas.length > 0) {
    const nomes = desatualizadas.slice(0, MAX_NOMES_NO_PASSO).map((c) => c.nome);
    const resto = desatualizadas.length - nomes.length;
    passos.push(
      `Exclua da pasta do envelope as cópias desatualizadas: ${nomes.join("; ")}${resto > 0 ? ` e mais ${resto}` : ""}.`
    );
  }
  if (semAtende) {
    passos.push(
      "Confira o acervo técnico contra o edital e grave com registrar_atende (num edital só com qualificação econômica, a chamada vai com itens: [])."
    );
  }
  if (atendeNegativo) {
    passos.push(
      "O Atende? concluiu que a empresa NÃO atende a uma exigência do edital (técnica, de registro ou econômico-financeira): revise com o usuário antes de seguir; se o acervo mudou, grave de novo com registrar_atende."
    );
  }
  if (acervo.some((a) => a.situacao === "nao_anexado")) {
    passos.push("Anexe as CATs do Atende?: anexar_acervo.");
  }
  const semPdf = acervo.filter((a) => a.situacao === "sem_pdf");
  if (semPdf.length > 0) {
    // o PDF da CAT é enviado na aba "Documentos (n)" do Acervo técnico (a aba das CATs e atestados)
    passos.push(
      `Envie o PDF destas CATs em Acervo técnico → Documentos: ${semPdf.map((a) => a.numero ?? a.atestado_id).join("; ")}.`
    );
  }
  const sumidas = acervo.filter((a) => a.situacao === "nao_encontrado");
  if (sumidas.length > 0) {
    passos.push(
      `Refaça o Atende? desta oportunidade (ler_acervo e registrar_atende): ${sumidas.length} CAT(s) citada(s) não estão mais no acervo técnico: ${sumidas.map((a) => a.numero ?? a.atestado_id).join("; ")}.`
    );
  }
  const declaracoesEmFalta = declaracoes.filter((d) => d.situacao === "falta");
  if (declaracoesEmFalta.length > 0) {
    passos.push(
      `Gere as declarações: gerar_declaracoes (${declaracoesEmFalta.map((d) => d.chave).join(", ")}).`
    );
  }
  if (faltaAssinar.length > 0) {
    passos.push(
      `Assine no gov.br e use "Enviar assinado" na aba Arquivos: ${faltaAssinar.length} arquivo(s).`
    );
  }
  if (verificar > 0) {
    passos.push(
      `Confira à mão ${verificar} exigência(s) do edital que o SIGO não reconheceu (outros_documentos em "verificar").`
    );
  }

  return {
    sessao,
    edital,
    proposta,
    certidoes,
    acervo,
    declaracoes,
    outros_documentos: outros,
    falta_assinar: faltaAssinar,
    copias_desatualizadas: desatualizadas,
    resumo,
    proximos_passos: passos,
  };
}
