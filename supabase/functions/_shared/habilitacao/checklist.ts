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

const semAcento = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * [padrão, tipo]: a ordem importa; o trecho casado some do texto antes da regra seguinte.
 * Dois cuidados contra falso positivo (que deixaria um documento a mais "faltando" para sempre):
 *  - "CRC" sozinho não é o SICAF: é, quase sempre, o Conselho Regional de Contabilidade ("balanço assinado por
 *    contador, com registro no CRC"). O cadastro é reconhecido por "SICAF" ou "Certificado de Registro Cadastral";
 *  - "Junta Comercial" sozinha não pede a certidão simplificada ("contrato social registrado na Junta Comercial"):
 *    só quando a palavra "certidão" vem antes, na mesma frase.
 */
const REGRAS_TIPO: [RegExp, string][] = [
  [/inscricao estadual|cadastro de contribuintes? estadua(l|is)/g, "inscricao_estadual"],
  [
    /inscricao municipal|cadastro de contribuintes? municipa(l|is)|cadastro mobiliario/g,
    "inscricao_municipal",
  ],
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
  [/\b(crea|cau)\b/g, "certidao_crea_pj"],
];

const REGRAS_DECLARACAO: [RegExp, string][] = [
  [
    /emprega\w* menor|trabalho (do|de) menor|menor(es)? de (18|dezoito|16|dezesseis)|xxxiii/,
    "nao_emprega_menor",
  ],
  [/fatos? impeditivos?|superveniente/, "fato_impeditivo"],
  [/microempresa|pequeno porte|me\/epp|lei complementar (n\S* ?)?123|\blc 123/, "me_epp"],
  [/requisitos de habilitacao/, "requisitos_habilitacao"],
  [/reserva de cargos|pessoas? com deficiencia|reabilitad/, "reserva_cargos"],
  [/elaboracao independente/, "elaboracao_independente"],
];

/** Na ordem de IDS_TIPO_DOCUMENTO, sem repetir. */
const naOrdemDosTipos = (tipos: Iterable<string>) => {
  const conjunto = new Set(tipos);
  return IDS_TIPO_DOCUMENTO.filter((t) => conjunto.has(t));
};

export function classificarExigencia(descricao: unknown): {
  tipos: string[];
  declaracoes: string[];
} {
  let t = semAcento(descricao);
  if (!t.trim()) return { tipos: [], declaracoes: [] };
  const declaracoes = REGRAS_DECLARACAO.filter(([re]) => re.test(t)).map(([, chave]) => chave);
  // uma declaração não é uma certidão: "declaração de ME/EPP" não pede documento da biblioteca
  if (/declarac/.test(t) && declaracoes.length) return { tipos: [], declaracoes };
  const tipos: string[] = [];
  for (const [re, tipo] of REGRAS_TIPO) {
    re.lastIndex = 0;
    if (re.test(t)) {
      tipos.push(tipo);
      re.lastIndex = 0;
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
  return { tipos: naOrdemDosTipos(tipos), declaracoes: tipos.length ? [] : declaracoes };
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
    situacao: "ok" | "falta" | "falta_assinar";
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
    const descricao = typeof item === "string" ? item : obj(item).descricao;
    if (typeof descricao !== "string" || !descricao.trim()) continue;
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
  if (
    lista(habilitacao.registros).some((r) => ["crea", "visto_crea"].includes(String(obj(r).tipo)))
  ) {
    exigidos.add("certidao_crea_pj");
  }
  if (extraido.exclusiva_me_epp === true) declExigidas.add("me_epp");

  // ── edital ──
  const doEdital = arquivos.filter(
    (a) => a.categoria !== null && CATEGORIAS_DO_EDITAL.has(a.categoria)
  );
  const edital: Checklist["edital"] = {
    situacao: doEdital.length > 0 ? "ok" : "falta",
    arquivos: doEdital.length,
  };

  // ── proposta e cronograma (o PDF é o que se assina) ──
  const proposta: Checklist["proposta"] = DOCUMENTOS_DA_PROPOSTA.map(([documento, origem]) => {
    const a = arquivos.find((x) => x.origem === origem);
    if (!a) return { documento, situacao: "falta", nome: null };
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
  const declaracoes: Checklist["declaracoes"] = [
    ...new Set([...declExigidas, ...pdfsDeDeclaracao.keys()]),
  ].map((chave) => {
    const pdf = pdfsDeDeclaracao.get(chave);
    const doNome = pdf
      ? String(pdf.nome ?? "")
          .replace(/\.[A-Za-z0-9]{1,5}$/, "")
          .trim()
      : "";
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
  const faltam =
    (edital.situacao === "falta" ? 1 : 0) +
    pdfEmFalta +
    doc("falta") +
    doc("nao_anexado") +
    acervo.filter((a) => a.situacao !== "anexado").length +
    declaracoes.filter((d) => d.situacao === "falta").length;
  const vencidos = doc("vencido") + doc("vence_antes_da_sessao");
  const verificar = outros.filter((o) => o.situacao === "verificar").length;
  const resumo: Checklist["resumo"] = {
    faltam,
    vencidos,
    falta_assinar: faltaAssinar.length,
    verificar,
    desatualizadas: desatualizadas.length,
    pronto:
      faltam === 0 &&
      vencidos === 0 &&
      faltaAssinar.length === 0 &&
      verificar === 0 &&
      desatualizadas.length === 0,
  };

  // ── próximos passos (só os que se aplicam, nesta ordem) ──
  const passos: string[] = [];
  if (edital.situacao === "falta") {
    passos.push(
      "Anexe o edital: anexar_edital_por_url (link público do arquivo) ou gerar_link_envio."
    );
  }
  if (pdfEmFalta > 0) passos.push("Gere a proposta e o cronograma: gerar_documentos_proposta.");
  if (doc("nao_anexado") > 0) {
    passos.push("Anexe a habilitação que já está na biblioteca: anexar_habilitacao.");
  }
  const aAtualizar = certidoes.filter((c) =>
    ["falta", "vencido", "vence_antes_da_sessao"].includes(c.situacao)
  );
  if (aAtualizar.length > 0) {
    passos.push(
      `Atualize em Acervo técnico → Documentos e certidões: ${aAtualizar.map((c) => c.rotulo).join("; ")}.`
    );
  }
  if (desatualizadas.length > 0) {
    passos.push(
      `Exclua da pasta do envelope as cópias desatualizadas: ${desatualizadas.map((c) => c.nome).join("; ")}.`
    );
  }
  if (acervo.some((a) => a.situacao === "nao_anexado")) {
    passos.push("Anexe as CATs do Atende?: anexar_acervo.");
  }
  const semPdf = acervo.filter((a) => a.situacao === "sem_pdf");
  if (semPdf.length > 0) {
    passos.push(
      `Envie no Acervo técnico o PDF destas CATs: ${semPdf.map((a) => a.numero ?? a.atestado_id).join("; ")}.`
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
