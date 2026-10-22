/**
 * Ferramentas do conector do Claude: documentos da licitação GERADOS pelo servidor (spec
 * 2026-10-09 §3 e §4) — proposta e cronograma em PDF e Excel, e declarações em PDF e .docx, com o
 * bloco de assinatura do representante legal. O Claude manda só dados; o SIGO gera com as mesmas
 * contas e o mesmo desenho da tela e grava nos Arquivos da oportunidade. Todo PDF nasce "pendente"
 * de assinatura; o que já foi assinado não é gerado de novo.
 *
 * O CPF do representante entra nos documentos, mas nunca na saída da ferramenta nem nos logs. Nenhuma
 * ref de Storage, caminho ou URL assinada sai daqui (só ids, nomes e o link da oportunidade).
 */
import {
  baixarObjeto,
  caminhoDaEmpresa,
  ErroArquivo,
  gravarNaOportunidade,
  nomeParaExibir,
  PASTA_CREDENCIAMENTO,
  PASTA_HABILITACAO,
  registrarNoHistorico,
  type TipoArquivoServidor,
} from "../_shared/conector/arquivo-servidor.ts";
import { uuidOuNull } from "../_shared/conector/entrada.ts";
import { PASTA_PROPOSTA } from "../_shared/conector/envio-regras.ts";
import { jsonbComoObjeto } from "../_shared/conector/jsonb-objeto.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import {
  montarDadosCronograma,
  nomeArquivoCronograma,
} from "../_shared/documentos/dados-cronograma.ts";
import {
  localDaEmpresa,
  montarCabecalhoLicitacao,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
} from "../_shared/documentos/dados-proposta.ts";
import { gerarDocxDeclaracao } from "../_shared/documentos/declaracao-docx.ts";
import type { LogoDocumento } from "../_shared/documentos/declaracao-comum.ts";
import { gerarPdfDeclaracao, sondarLogoNoPdf } from "../_shared/documentos/declaracao-pdf.ts";
import {
  chaveDoItem,
  MAX_ITENS_DECLARACAO,
  LIMITE_TEXTO_DECLARACAO,
  LIMITE_TITULO_DECLARACAO,
  modelosDaEmpresa,
  montarDadosDeclaracao,
  nomeArquivoDeclaracao,
  preencherModelo,
  validarItensDeclaracao,
  variaveisDaDeclaracao,
  type ModeloDeclaracao,
} from "../_shared/documentos/declaracoes.ts";
import { dataPorExtenso } from "../_shared/documentos/formatos.ts";
import { conferirImagem, lerImagem } from "../_shared/documentos/imagem.ts";
import {
  bytesDaPlanilha,
  bytesDoPdf,
  gerarPdfProposta,
  moedaBR,
  montarPlanilhaProposta,
  type LibsDocumentos,
} from "../_shared/documentos/proposta-export.ts";
import {
  gerarPdfCronograma,
  montarPlanilhaCronograma,
} from "../_shared/documentos/cronograma-export.ts";
import { hojeBR } from "../_shared/edital/acervo.ts";
import { diasAte } from "../_shared/habilitacao/documentos-regras.ts";
import {
  etapasDoOrcamento,
  normalizarCronograma,
  resumoCronograma,
} from "../_shared/orcamento/cronograma.ts";
import { resumoOrcamento, type ItemOrcamento } from "../_shared/orcamento/desconto.ts";
import {
  GRAVACAO,
  ID_OPORTUNIDADE,
  logarErro,
  nomeDoUsuario,
  plural,
} from "./ferramentas-comum.ts";
import {
  falha,
  naoEncontrado,
  sucesso,
  type DepsFerramenta,
  type Ferramenta,
  type ResultadoFerramenta,
} from "./registro.ts";

export const MSG_SEM_REPRESENTANTE =
  "Cadastre o representante legal (nome, cargo e CPF) em Configurações → Empresa antes de gerar os documentos.";
export const MSG_SEM_GERADOR =
  "O SIGO não conseguiu preparar o gerador de documentos agora. Tente de novo.";
export const LEMBRETE_ASSINATURA =
  'Os PDFs saem com o bloco de assinatura e ficam como "falta assinar". Assine no gov.br e use "Enviar assinado" na aba Arquivos da oportunidade.';

/**
 * Linhas do orçamento (etapas e itens: cada uma é uma linha da tabela do PDF e do Excel) que o conector gera.
 * Edge Function tem limite de CPU por chamada (~2 s). Medido em 14/10/2026 no PC de desenvolvimento (i3 de 2
 * núcleos, mais lento que o servidor; 3 rodadas), PDF + Excel da proposta sozinhos: 500 linhas ≈ 0,43 a
 * 0,65 s; 1000 ≈ 0,75 a 1,15 s; 2000 ≈ 1,5 a 2,7 s; 3000 ≈ 2,5 a 2,9 s. O limite sai do pior caso SOMADO de
 * uma chamada (proposta e cronograma do mesmo orçamento): 800 linhas com 2400 células de cronograma ≈ 1,1 a
 * 1,4 s aqui (1000 linhas com 3000 células chegava a 1,9 s, perto demais do limite).
 */
export const MAX_ITENS_DOCUMENTO = 800;
/**
 * Etapas × meses do cronograma (cada célula é R$ e % no PDF). Medido no mesmo PC, PDF + Excel do cronograma
 * sozinho: 2400 células (24 meses × 100 etapas) ≈ 0,5 a 0,8 s; 3000 (60 × 50) ≈ 0,6 a 0,9 s; 7200 (24 × 300) ≈
 * 1,5 a 2,7 s. Acima do limite o cronograma não é gerado pelo conector: a proposta sai, e o aviso manda usar a
 * tela.
 */
export const MAX_CELULAS_CRONOGRAMA = 2400;

/**
 * Logo do papel timbrado. O jsPDF decodifica o PNG com transparência inteiro em CADA PDF (e a ferramenta gera até
 * 12 declarações), então o PNG é limitado por pixels; o JPEG vai como veio e só tem limite de lado. O logo é
 * impresso numa caixa de 50 × 18 mm (a 300 dpi são 591 × 213 px, ~126 mil pixels): 300 mil pixels não perdem
 * qualidade nenhuma no papel.
 *
 * Medido em 14/10/2026 no PC de desenvolvimento (i3 de 2 núcleos, mais lento que o servidor), a CHAMADA INTEIRA de
 * `gerar_declaracoes` com 12 declarações: conferência do arquivo, sonda, 12 PDFs e 12 .docx, logo PNG RGBA, quente
 * e fria (processo novo; a carga das bibliotecas, ~0,2 s, entra na primeira chamada de uma instância nova):
 *   - antes, no limite de 700 mil pixels (836 × 837, plano): quente 1,6 a 1,9 s, fria ~2,0 s (+ 0,2 s de carga);
 *   - agora, no limite de 300 mil pixels (548 × 547), logo plano (com a compressão "FAST" de `compressaoDoLogo`):
 *     quente 0,65 a 0,86 s, fria 1,0 a 1,15 s (+ 0,2 s de carga = 1,2 a 1,4 s);
 *   - agora, PNG de ruído puro no limite (1 MB, mais de meio byte por pixel: sem compressão): quente 0,9 a 1,3 s,
 *     fria 1,1 a 1,3 s (+ 0,2 s de carga = 1,3 a 1,5 s);
 *   - 1000 × 300 (o lado no limite): plano 0,6 a 0,8 s quente, 1,0 s fria; ruído 0,9 a 1,0 s quente, 1,2 s fria.
 * Com 300 mil pixels a pior chamada medida fica em ~1,5 s, com folga para os ~2 s de CPU da Edge Function.
 */
export const LOGO_BYTES_MAXIMOS = 2 * 1024 * 1024;
export const LOGO_PNG_PIXELS_MAXIMOS = 300_000;
export const LOGO_PNG_LADO_MAXIMO = 1000;
const LOGO_JPEG_LADO_MAXIMO = 4000;
/** O logo é cadastrado em Configurações → aba Empresa ("Logo da Empresa", EmpresaTab.jsx). */
const AVISO_LOGO =
  "O logo da empresa não foi incluído: use um PNG de até 500×500 pixels (300 mil pixels no total) ou um JPG de até 2 MB, salvo de novo como imagem comum, em Configurações → Empresa.";
const AVISO_REPRESENTANTE_INCOMPLETO =
  "O representante legal está sem cargo ou CPF no cadastro: o bloco de assinatura saiu sem essa informação.";
const SUFIXO_CRONOGRAMA_ANTIGO = " Os arquivos de cronograma gerados antes continuam na pasta.";

/** Colunas de `oportunidade` que as duas ferramentas usam (cabeçalho do edital e cronograma). */
export const COLUNAS_OPORTUNIDADE =
  "id, nome, orgao, licitacao_numero, licitacao_processo, orcamento_info, cronograma_ff";
/** Colunas de `empresa` dos documentos: papel timbrado, logo e representante legal. */
export const COLUNAS_EMPRESA =
  "id, nome, razao_social, nome_fantasia, cnpj, endereco, numero, complemento, bairro, cidade, estado, cep, telefone, email, logo_url, representante_nome, representante_cargo, representante_cpf";
/** Colunas de `orcamento_item`: as chaves do `ItemOrcamento` que os módulos da Parte B leem (mais o `id`). */
export const COLUNAS_ORCAMENTO =
  "id, numero, etapa, descricao, codigo, fonte, unidade, quantidade, valor_unitario_ref, valor_unitario, valor_total, ordem";
const PASTAS_DECLARACAO = [PASTA_HABILITACAO, PASTA_CREDENCIAMENTO, PASTA_PROPOSTA] as const;

const DATA = { type: "string", description: "AAAA-MM-DD; padrão hoje" };
const LOCAL = {
  type: "string",
  maxLength: 120,
  description:
    'cidade/UF que sai acima da assinatura, ex.: "Cidade/UF"; padrão: cidade e UF da empresa',
};
/** Por que um arquivo não foi gerado ou gravado (o `motivo` de cada entrada de `falhas`). */
export type MotivoDaFalhaDeDocumento = ErroArquivo["codigo"] | "erro_interno";

/**
 * Texto curto, em português, de cada motivo: vai em `falhas[].mensagem` para o Claude explicar ao usuário. É o
 * mapa ÚNICO das duas ferramentas; o tipo `Record` obriga a ter uma frase para cada código de `ErroArquivo`.
 */
export const MENSAGEM_DA_FALHA_DOCUMENTO: Record<MotivoDaFalhaDeDocumento, string> = {
  nao_encontrado: "O arquivo não foi encontrado no armazenamento.",
  tipo_nao_aceito: "O tipo do arquivo não é aceito.",
  grande_demais: "O arquivo gerado passa do limite de 50 MB.",
  vazio: "O arquivo gerado saiu vazio.",
  storage: "O armazenamento não respondeu ao gravar o arquivo. Tente de novo.",
  erro_interno: "Erro inesperado ao gerar este arquivo. Tente de novo.",
};

/**
 * Uma entrada de `falhas`: a identificação do arquivo (documento, ou chave/título/formato) e o motivo. Falha de
 * UM arquivo não derruba a chamada: quem chama segue com os demais. Erro conhecido (`ErroArquivo`) vira o
 * próprio código; o resto vira `erro_interno`, com o erro no log. O log nunca leva ref, caminho nem CPF.
 */
function falhaDoArquivo(
  ferramenta: string,
  identificacao: Record<string, unknown>,
  e: unknown
): Record<string, unknown> {
  let motivo: MotivoDaFalhaDeDocumento;
  if (e instanceof ErroArquivo) {
    motivo = e.codigo;
    console.error(`[conector] ${ferramenta}: arquivo não gerado (${motivo})`);
  } else {
    motivo = "erro_interno";
    logarErro(ferramenta, "erro inesperado ao gerar um arquivo", e);
  }
  return { ...identificacao, motivo, mensagem: MENSAGEM_DA_FALHA_DOCUMENTO[motivo] };
}

/** "N arquivo(s) não puderam ser gerados: veja falhas." (singular: "1 arquivo não pôde ser gerado: ..."). */
const avisoDasFalhas = (n: number): string =>
  `${n === 1 ? "1 arquivo não pôde ser gerado" : `${n} arquivos não puderam ser gerados`}: veja falhas.`;

/** Representante sem cargo ou sem CPF no cadastro: o bloco de assinatura sai sem essa linha. */
const representanteIncompleto = (r: { cargo: unknown; cpf: unknown }): boolean =>
  !String(r.cargo ?? "").trim() || !String(r.cpf ?? "").trim();

// ─── partes comuns ──────────────────────────────────────────────────────────────────────────

interface OportunidadeLida {
  id: string;
  nome: string | null;
  orgao: string | null;
  licitacao_numero: string | null;
  licitacao_processo: string | null;
  orcamento_info: unknown;
  cronograma_ff: unknown;
}

interface EmpresaLida {
  logo_url?: string | null;
  representante_nome?: string | null;
  representante_cargo?: string | null;
  representante_cpf?: string | null;
  [coluna: string]: unknown;
}

const CARACTERE_DE_CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

type PedidoComum =
  | { ok: true; data: string; local: string | null; validadeDias: number }
  | { ok: false; erros: string[] };

/**
 * `data` (AAAA-MM-DD, data real; padrão hoje em Brasília), `local` (1 a 120 caracteres, sem controle; padrão
 * a cidade/UF da empresa) e, só na proposta, `validade_dias` (inteiro de 1 a 365; padrão 60). O despacho não
 * confere tipos: aqui se confere.
 */
function lerPedidoComum(
  args: Record<string, unknown>,
  deps: DepsFerramenta,
  comValidade: boolean
): PedidoComum {
  const erros: string[] = [];
  let data = hojeBR(deps.agora);
  if (args.data !== undefined && args.data !== null) {
    const d = args.data;
    if (
      typeof d === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      dataPorExtenso(d) !== "" &&
      diasAte(d, d) === 0
    ) {
      data = d;
    } else {
      erros.push("data deve ser uma data real no formato AAAA-MM-DD.");
    }
  }
  let local: string | null = null;
  if (args.local !== undefined && args.local !== null) {
    const t = typeof args.local === "string" ? args.local.trim() : "";
    if (t.length >= 1 && t.length <= 120 && !CARACTERE_DE_CONTROLE.test(t)) local = t;
    else erros.push("local deve ter de 1 a 120 caracteres, sem quebra de linha.");
  }
  let validadeDias = 60;
  if (comValidade && args.validade_dias !== undefined && args.validade_dias !== null) {
    const n = args.validade_dias;
    if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 365) validadeDias = n;
    else erros.push("validade_dias deve ser um número inteiro de 1 a 365.");
  }
  return erros.length ? { ok: false, erros } : { ok: true, data, local, validadeDias };
}

type EmpresaERepresentante =
  | {
      ok: true;
      empresa: EmpresaLida;
      representante: { nome: unknown; cargo: unknown; cpf: unknown };
    }
  | { ok: false; resultado: ResultadoFerramenta };

/** A empresa da chave (só as colunas do documento) e o representante legal cadastrado nela. */
async function lerEmpresaERepresentante(
  deps: DepsFerramenta,
  id: string
): Promise<EmpresaERepresentante> {
  const empresa = await deps.db.empresa<EmpresaLida>(COLUNAS_EMPRESA);
  const representante = {
    nome: empresa?.representante_nome,
    cargo: empresa?.representante_cargo,
    cpf: empresa?.representante_cpf,
  };
  const v = validarRepresentante(representante);
  if (!empresa || !v.ok) {
    return {
      ok: false,
      // os erros dizem o que falta, nunca o valor do CPF
      resultado: falha(
        MSG_SEM_REPRESENTANTE,
        "sem_representante",
        { erros: empresa ? v.erros : ["Empresa não encontrada."] },
        id
      ),
    };
  }
  return { ok: true, empresa, representante };
}

/** Sem `deps.libs`, ou se ela lançar → falha clara; a causa vai ao log. */
async function carregarLibsOuFalha(
  deps: DepsFerramenta,
  ferramenta: string,
  id: string
): Promise<{ ok: true; libs: LibsDocumentos } | { ok: false; resultado: ResultadoFerramenta }> {
  const indisponivel = () => ({
    ok: false as const,
    resultado: falha(MSG_SEM_GERADOR, "gerador_indisponivel", {}, id),
  });
  if (!deps.libs) {
    console.error(`[conector] ${ferramenta}: gerador de documentos não configurado`);
    return indisponivel();
  }
  try {
    return { ok: true, libs: await deps.libs() };
  } catch (e) {
    // erro de carga de biblioteca (URL do registro do npm etc.): não tem dado do usuário, vai inteiro
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[conector] ${ferramenta}: carregar as bibliotecas de documento: ${msg.slice(0, 500)}`
    );
    return indisponivel();
  }
}

/** Arquivo vivo da oportunidade, só com o que as ferramentas conferem. */
interface ArquivoExistente {
  nome: string;
  origem: string;
  assinatura: string | null;
}

/** Os arquivos vivos da oportunidade que têm uma das `origens` (nome, origem e se estão assinados). */
async function arquivosPorOrigem(
  deps: DepsFerramenta,
  id: string,
  origens: string[]
): Promise<ArquivoExistente[]> {
  const linhas = await deps.db.lerTodos<{
    id: string;
    nome: string | null;
    origem: string | null;
    assinatura: string | null;
  }>("arquivo_oportunidade", "id, nome, origem, assinatura", (q) =>
    q.eq("oportunidade_id", id).in("origem", origens)
  );
  return linhas
    .filter((l) => typeof l.origem === "string" && origens.includes(l.origem))
    .map((l) => ({
      nome: nomeParaExibir(String(l.nome ?? "")),
      origem: l.origem as string,
      assinatura: l.assinatura,
    }));
}

/** O nome (para exibir) do primeiro arquivo JÁ assinado de cada origem. */
function assinadosDe(arquivos: ArquivoExistente[]): Map<string, { nome: string }> {
  const mapa = new Map<string, { nome: string }>();
  for (const a of arquivos) {
    if (a.assinatura === "assinado" && !mapa.has(a.origem)) mapa.set(a.origem, { nome: a.nome });
  }
  return mapa;
}

/** O nome do arquivo assinado que a gravação manteve (corrida: ele chegou depois da leitura). Falhou → o `plano`. */
async function nomeDoMantido(
  deps: DepsFerramenta,
  ferramenta: string,
  arquivoId: string,
  plano: string
): Promise<string> {
  try {
    const l = await deps.db.porId<{ id: string; nome: string | null }>(
      "arquivo_oportunidade",
      arquivoId,
      "id, nome"
    );
    if (l && typeof l.nome === "string" && l.nome.trim()) return nomeParaExibir(l.nome);
  } catch (e) {
    logarErro(ferramenta, "ler o nome do arquivo assinado", e);
  }
  return plano;
}

// ─── gerar_documentos_proposta ──────────────────────────────────────────────────────────────

const ROTULO_DOCUMENTO: Record<string, string> = {
  proposta_pdf: "o PDF da proposta",
  proposta_xlsx: "o Excel da proposta",
  cronograma_pdf: "o PDF do cronograma",
  cronograma_xlsx: "o Excel do cronograma",
};

interface ArquivoDaProposta {
  documento: string;
  origem: string;
  nome: string;
  tipo: TipoArquivoServidor;
  assinatura: "pendente" | null;
  /** Só roda se o arquivo vai ser gravado: PDF assinado não é gerado de novo. */
  bytes: () => Uint8Array;
}

/** A proposta ou o cronograma: o PDF (assinável) e o Excel dele, nesta ordem. O PDF assinado segura os dois. */
interface DocumentoDaProposta {
  /** O título que o próprio PDF leva ("Proposta de preços"), para o aviso do PDF de antes que continua na pasta. */
  titulo: string;
  arquivos: ArquivoDaProposta[];
}

/** Um PDF novo que falhou não troca o de antes: o aviso diz que o da geração anterior (com os dados antigos) continua. */
const avisoPdfAntigoNaPasta = (titulo: string): string =>
  `${titulo}: o PDF novo não foi gravado; o da geração anterior continua na pasta.`;

/** As origens dos quatro arquivos que a ferramenta grava (contrato §3). */
const ORIGENS_DA_PROPOSTA = [
  "gerado:proposta:pdf",
  "gerado:proposta:xlsx",
  "gerado:cronograma:pdf",
  "gerado:cronograma:xlsx",
];

const GERAR_DOCUMENTOS_PROPOSTA: Ferramenta = {
  def: {
    name: "gerar_documentos_proposta",
    title: "Gerar a proposta de preços e o cronograma da oportunidade",
    description:
      'Gera no SIGO a proposta de preços e o cronograma físico-financeiro, em PDF e em Excel, a partir do orçamento e do cronograma gravados na oportunidade, com o cabeçalho da empresa e o bloco de assinatura do representante legal, e grava na pasta "Envelope 01 – Proposta". Chame depois de importar_orcamento, aplicar_desconto e importar_cronograma. Repetir troca os arquivos no lugar; se o PDF da proposta (ou do cronograma) já foi assinado, o documento inteiro (PDF e Excel) é mantido. Um arquivo que falha não impede os outros: leia sempre avisos e falhas e repasse ao usuário.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        local: LOCAL,
        data: DATA,
        validade_dias: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "validade da proposta; padrão 60",
        },
      },
      required: ["oportunidade_id"],
    },
    annotations: GRAVACAO,
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const pedido = lerPedidoComum(args, deps, true);
    if (!pedido.ok) return falha("Pedido inválido.", "validacao", { erros: pedido.erros }, id);

    const op = id
      ? await deps.db.porId<OportunidadeLida>("oportunidade", id, COLUNAS_OPORTUNIDADE)
      : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    const rep = await lerEmpresaERepresentante(deps, id);
    if (!rep.ok) return rep.resultado;
    const { empresa, representante } = rep;

    const itens = await deps.db.lerTodos<ItemOrcamento>("orcamento_item", COLUNAS_ORCAMENTO, (q) =>
      q.eq("oportunidade_id", id)
    );
    if (resumoOrcamento(itens).qtdItens === 0) {
      return falha(
        "A oportunidade não tem orçamento. Grave com importar_orcamento antes.",
        "sem_orcamento",
        {},
        id
      );
    }
    if (itens.length > MAX_ITENS_DOCUMENTO) {
      return falha(
        `O orçamento tem ${itens.length} linhas (itens e etapas); o SIGO gera pelo conector até ${MAX_ITENS_DOCUMENTO} linhas. Gere a proposta pela tela do Orçamento (botão "Exportar proposta").`,
        "orcamento_grande_demais",
        { itens: itens.length, limite: MAX_ITENS_DOCUMENTO },
        id
      );
    }

    const carga = await carregarLibsOuFalha(deps, "gerar_documentos_proposta", id);
    if (!carga.ok) return carga.resultado;
    const libs = carga.libs;

    const { data, validadeDias } = pedido;
    const opcoes = { validadeDias, local: pedido.local ?? localDaEmpresa(empresa), dataISO: data };
    const info = jsonbComoObjeto(op.orcamento_info) ?? {};
    const dados = montarDadosProposta({
      itens,
      info,
      oportunidade: op,
      empresa,
      representante,
      opcoes,
    });

    const avisos: string[] = [];
    if (representanteIncompleto(representante)) avisos.push(AVISO_REPRESENTANTE_INCOMPLETO);

    // o que a oportunidade já tem destas ferramentas: o PDF assinado de um documento segura o documento inteiro,
    // e qualquer arquivo de cronograma que já exista continua na pasta mesmo quando este não é gerado agora
    const existentes = await arquivosPorOrigem(deps, id, ORIGENS_DA_PROPOSTA);
    const assinados = assinadosDe(existentes);
    const cronogramaJaGravado = existentes.some((a) => a.origem.startsWith("gerado:cronograma:"));
    const semCronograma = (aviso: string) =>
      avisos.push(cronogramaJaGravado ? `${aviso}${SUFIXO_CRONOGRAMA_ANTIGO}` : aviso);

    const documentos: DocumentoDaProposta[] = [
      {
        titulo: dados.titulo,
        arquivos: [
          {
            documento: "proposta_pdf",
            origem: "gerado:proposta:pdf",
            nome: nomeParaExibir(nomeArquivoProposta(op.nome, data, "pdf")),
            tipo: "pdf",
            assinatura: "pendente",
            bytes: () => bytesDoPdf(gerarPdfProposta(dados, libs)),
          },
          {
            documento: "proposta_xlsx",
            origem: "gerado:proposta:xlsx",
            nome: nomeParaExibir(nomeArquivoProposta(op.nome, data, "xlsx")),
            tipo: "xlsx",
            assinatura: null,
            bytes: () => bytesDaPlanilha(montarPlanilhaProposta(dados, libs.XLSX), libs.XLSX),
          },
        ],
      },
    ];

    // cronograma: só sai quando existe, cabe no limite e todas as etapas fecham 100,00% (como a tela)
    const cron = normalizarCronograma(jsonbComoObjeto(op.cronograma_ff) ?? {});
    if (cron.meses === 0) {
      semCronograma(
        "A oportunidade não tem cronograma: só a proposta foi gerada. Grave com importar_cronograma e chame de novo."
      );
    } else {
      const etapas = etapasDoOrcamento(itens);
      if (etapas.length === 0) {
        semCronograma(
          "O orçamento não tem etapas de nível 1: o cronograma não foi gerado. Cadastre as etapas e chame de novo."
        );
      } else if (etapas.length * cron.meses > MAX_CELULAS_CRONOGRAMA) {
        semCronograma(
          `O cronograma tem ${etapas.length} etapas x ${cron.meses} meses; o SIGO gera pelo conector até ${MAX_CELULAS_CRONOGRAMA} células (etapas x meses). Gere o cronograma pela tela (botão "Exportar" do cronograma físico-financeiro).`
        );
      } else if (!resumoCronograma(etapas, cron).todasFecham) {
        semCronograma(
          "O cronograma tem etapa que não fecha 100,00%: os arquivos do cronograma não foram gerados. Corrija com importar_cronograma."
        );
      } else {
        const dadosCron = montarDadosCronograma({
          etapas,
          cronograma: cron,
          info,
          oportunidade: op,
          empresa,
          representante,
          opcoes,
        });
        documentos.push({
          titulo: dadosCron.titulo,
          arquivos: [
            {
              documento: "cronograma_pdf",
              origem: "gerado:cronograma:pdf",
              nome: nomeParaExibir(nomeArquivoCronograma(op.nome, data, "pdf")),
              tipo: "pdf",
              assinatura: "pendente",
              bytes: () => bytesDoPdf(gerarPdfCronograma(dadosCron, libs)),
            },
            {
              documento: "cronograma_xlsx",
              origem: "gerado:cronograma:xlsx",
              nome: nomeParaExibir(nomeArquivoCronograma(op.nome, data, "xlsx")),
              tipo: "xlsx",
              assinatura: null,
              bytes: () =>
                bytesDaPlanilha(montarPlanilhaCronograma(dadosCron, libs.XLSX), libs.XLSX),
            },
          ],
        });
      }
    }

    const gerados: Record<string, unknown>[] = [];
    const mantidos: { documento: string; nome: string }[] = [];
    const falhas: Record<string, unknown>[] = [];
    const pdfsAntigosNaPasta: string[] = [];
    try {
      for (const doc of documentos) {
        // o PDF assinado manda no documento: o Excel dele também fica (senão o Excel traria os valores de
        // hoje e o PDF assinado, os antigos, sem aviso nenhum)
        const pdf = doc.arquivos[0];
        const assinado = assinados.get(pdf.origem);
        if (assinado) {
          mantidos.push({ documento: pdf.documento, nome: assinado.nome });
          continue;
        }
        for (const a of doc.arquivos) {
          try {
            const g = await gravarNaOportunidade(
              { db: deps.db, storage: deps.storage, agora: deps.agora },
              {
                oportunidadeId: id,
                origem: a.origem,
                nome: a.nome,
                bytes: a.bytes(),
                tipo: a.tipo,
                pasta: PASTA_PROPOSTA,
                categoria: null,
                assinatura: a.assinatura,
                usuarioNome: nomeDoUsuario(deps),
              }
            );
            // só "a oportunidade sumiu" interrompe tudo; erro de UM arquivo vira falha e a chamada segue
            if (!g) return naoEncontrado("oportunidade", id);
            if (g.mantido_assinado) {
              // o assinado chegou entre a leitura e a gravação: nada foi trocado, a saída não diz que gerou,
              // e o Excel do mesmo documento também não é gerado
              const nome = await nomeDoMantido(
                deps,
                "gerar_documentos_proposta",
                g.arquivo_id,
                a.nome
              );
              mantidos.push({ documento: a.documento, nome });
              break;
            }
            gerados.push({
              documento: a.documento,
              nome: g.nome,
              arquivo_id: g.arquivo_id,
              tamanho: g.tamanho,
              assinatura: a.assinatura,
              substituiu: g.substituiu,
            });
          } catch (e) {
            falhas.push(falhaDoArquivo("gerar_documentos_proposta", { documento: a.documento }, e));
            // o PDF de antes (pendente: o assinado nem chega aqui) segue na pasta, com os dados antigos
            if (a.tipo === "pdf" && existentes.some((x) => x.origem === a.origem)) {
              pdfsAntigosNaPasta.push(doc.titulo);
            }
          }
        }
      }
    } finally {
      // só o que foi gravado entra no histórico, mesmo que um arquivo dê erro ou a oportunidade suma no meio
      if (gerados.length > 0) {
        await registrarNoHistorico(
          deps.db,
          id,
          nomeDoUsuario(deps),
          `Documentos da proposta gerados pelo Claude: ${gerados.map((g) => g.nome).join(", ")}`
        );
      }
    }

    // o aviso do documento mantido só cita o Excel se ele existe na pasta (senão só o PDF assinado foi mantido)
    const mantidoComExcel = (excel: string) =>
      existentes.some((a) => a.origem === excel) ? "PDF e Excel" : "PDF";
    for (const m of mantidos) {
      if (m.documento === "proposta_pdf") {
        avisos.push(
          `A proposta já está assinada e foi mantida (${mantidoComExcel("gerado:proposta:xlsx")}). O total atual do orçamento é ${moedaBR(dados.totalGeral)}; se mudou, exclua o PDF assinado na aba Arquivos e gere de novo.`
        );
      } else if (m.documento === "cronograma_pdf") {
        avisos.push(
          `O cronograma já está assinado e foi mantido (${mantidoComExcel("gerado:cronograma:xlsx")}). Se o cronograma mudou, exclua o PDF assinado na aba Arquivos e gere de novo.`
        );
      } else {
        // um Excel marcado como assinado (não é o fluxo normal: só o PDF nasce "pendente")
        const rotulo = ROTULO_DOCUMENTO[m.documento] ?? m.documento;
        avisos.push(
          `${rotulo[0].toUpperCase()}${rotulo.slice(1)} já está assinado e foi mantido, sem troca.`
        );
      }
    }
    avisos.push(...pdfsAntigosNaPasta.map(avisoPdfAntigoNaPasta));
    if (falhas.length > 0) avisos.push(avisoDasFalhas(falhas.length));
    return sucesso(
      {
        oportunidade_id: id,
        pasta: PASTA_PROPOSTA,
        gerados,
        mantidos_assinados: mantidos,
        falhas,
        total_proposta: dados.totalGeral,
        validade_dias: validadeDias,
        local_data: dados.localData,
        avisos,
        lembrete: LEMBRETE_ASSINATURA,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

// ─── gerar_declaracoes ──────────────────────────────────────────────────────────────────────

/**
 * Logo do papel timbrado (melhor esforço, nunca derruba a ferramenta): PNG ou JPEG da pasta da empresa, ou
 * `null` com o aviso. O mesmo `logo` vai para o PDF e para o .docx: se QUALQUER conferência falha, os dois
 * saem sem logo (nunca um com e o outro sem). A ordem vai do barato ao caro: o cabeçalho e os limites, o
 * arquivo inteiro (`conferirImagem`: CRC, dados que descompactam, EOI do JPEG) e, por fim, a sonda (o jsPDF
 * embute a imagem num PDF descartável, uma vez por chamada).
 */
async function lerLogo(
  deps: DepsFerramenta,
  empresa: EmpresaLida,
  libs: LibsDocumentos
): Promise<{ logo: LogoDocumento | null; aviso: string | null }> {
  const ref = empresa.logo_url;
  if (ref === null || ref === undefined || (typeof ref === "string" && !ref.trim())) {
    return { logo: null, aviso: null };
  }
  try {
    const caminho = caminhoDaEmpresa(ref, "logos-empresa", deps.db.empresaId);
    if (!caminho) throw new Error("a ref do logo não é da pasta da empresa");
    const bytes = await baixarObjeto(deps.storage, "logos-empresa", caminho, LOGO_BYTES_MAXIMOS);
    const img = lerImagem(bytes);
    if (!img) throw new Error("o logo não é PNG nem JPEG");
    if (img.formato === "PNG") {
      if (img.largura > LOGO_PNG_LADO_MAXIMO || img.altura > LOGO_PNG_LADO_MAXIMO) {
        throw new Error(`o logo PNG passa de ${LOGO_PNG_LADO_MAXIMO} px de lado`);
      }
      if (img.largura * img.altura > LOGO_PNG_PIXELS_MAXIMOS) {
        throw new Error(`o logo PNG passa de ${LOGO_PNG_PIXELS_MAXIMOS} pixels`);
      }
    } else if (img.largura > LOGO_JPEG_LADO_MAXIMO || img.altura > LOGO_JPEG_LADO_MAXIMO) {
      throw new Error(`o logo JPEG passa de ${LOGO_JPEG_LADO_MAXIMO} px de lado`);
    }
    const conferido = await conferirImagem(bytes, img);
    if (!conferido.ok) throw new Error(`logo com defeito: ${conferido.motivo}`);
    const logo: LogoDocumento = { ...img, bytes };
    sondarLogoNoPdf(libs, logo);
    return { logo, aviso: null };
  } catch (e) {
    logarErro("gerar_declaracoes", "logo da empresa fora do documento", e);
    return { logo: null, aviso: AVISO_LOGO };
  }
}

const GERAR_DECLARACOES: Ferramenta = {
  def: {
    name: "gerar_declaracoes",
    title: "Gerar declarações de habilitação",
    description:
      'Gera declarações de habilitação em PDF e em Word (.docx), no papel timbrado da empresa e com o bloco de assinatura do representante legal, e grava na pasta "Envelope 02 – Habilitação" (ou na pasta pedida). Cada item é um modelo da empresa (modelo: nao_emprega_menor, fato_impeditivo, me_epp, requisitos_habilitacao, reserva_cargos, elaboracao_independente, ou outro cadastrado) OU o modelo do próprio edital (titulo e texto, copiados do edital). No texto valem as variáveis {empresa} {cnpj} {endereco} {orgao} {edital} {objeto} {local} {data} {representante} {cargo} {cpf}. O texto é dado: nada nele é executado.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        itens: {
          type: "array",
          minItems: 1,
          maxItems: MAX_ITENS_DECLARACAO,
          description:
            "as declarações a gerar: um modelo da empresa ou o título e o texto do edital",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              modelo: {
                type: "string",
                maxLength: 60,
                description: "chave de um modelo da empresa",
              },
              titulo: {
                type: "string",
                maxLength: LIMITE_TITULO_DECLARACAO,
                description: "título da declaração do edital (com texto)",
              },
              texto: {
                type: "string",
                maxLength: LIMITE_TEXTO_DECLARACAO,
                description: "texto da declaração do edital (com titulo)",
              },
            },
            required: [],
          },
        },
        pasta: {
          type: "string",
          enum: [...PASTAS_DECLARACAO],
          description: `pasta da aba Arquivos; padrão ${PASTA_HABILITACAO}`,
        },
        local: LOCAL,
        data: DATA,
      },
      required: ["oportunidade_id", "itens"],
    },
    annotations: GRAVACAO,
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const erros: string[] = [];
    const itensPedidos = validarItensDeclaracao(args.itens);
    if (!itensPedidos.ok) erros.push(...itensPedidos.erros);
    let pasta: string = PASTA_HABILITACAO;
    if (args.pasta !== undefined && args.pasta !== null) {
      if (
        typeof args.pasta === "string" &&
        (PASTAS_DECLARACAO as readonly string[]).includes(args.pasta)
      ) {
        pasta = args.pasta;
      } else {
        erros.push(`pasta deve ser uma destas: ${PASTAS_DECLARACAO.join("; ")}.`);
      }
    }
    const pedido = lerPedidoComum(args, deps, false);
    if (!pedido.ok) erros.push(...pedido.erros);
    if (!itensPedidos.ok || !pedido.ok || erros.length > 0) {
      return falha("Pedido inválido.", "validacao", { erros }, id);
    }

    const op = id
      ? await deps.db.porId<OportunidadeLida>("oportunidade", id, COLUNAS_OPORTUNIDADE)
      : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    const rep = await lerEmpresaERepresentante(deps, id);
    if (!rep.ok) return rep.resultado;
    const { empresa, representante } = rep;

    const modelos = modelosDaEmpresa(
      await deps.db.lerTodos<ModeloDeclaracao>(
        "modelo_declaracao",
        "chave, titulo, texto, ativo, ordem"
      )
    );
    for (const item of itensPedidos.itens) {
      if (item.tipo === "modelo" && !modelos.some((m) => m.chave === item.chave)) {
        return falha(
          `Modelo de declaração desconhecido: "${item.chave}".`,
          "modelo_desconhecido",
          { modelos_disponiveis: modelos.map(({ chave, titulo }) => ({ chave, titulo })) },
          id
        );
      }
    }

    const carga = await carregarLibsOuFalha(deps, "gerar_declaracoes", id);
    if (!carga.ok) return carga.resultado;
    const libs = carga.libs;

    const { data } = pedido;
    const localFinal = pedido.local ?? localDaEmpresa(empresa);
    const cab = montarCabecalhoLicitacao({
      info: jsonbComoObjeto(op.orcamento_info) ?? {},
      oportunidade: op,
      empresa,
      representante,
      opcoes: { local: localFinal, dataISO: data },
    });
    const vars = variaveisDaDeclaracao(cab, localFinal, data);

    const avisos: string[] = [];
    if (representanteIncompleto(representante)) avisos.push(AVISO_REPRESENTANTE_INCOMPLETO);
    const { logo, aviso: avisoLogo } = await lerLogo(deps, empresa, libs);
    if (avisoLogo) avisos.push(avisoLogo);

    // o que foi pedido, já com título, texto e chave (modelo da empresa ou texto do edital)
    const declaracoes = itensPedidos.itens.map((item) => {
      const chave = chaveDoItem(item);
      const m = item.tipo === "modelo" ? modelos.find((x) => x.chave === item.chave) : undefined;
      return {
        chave,
        titulo: item.tipo === "modelo" ? String(m?.titulo ?? "") : item.titulo,
        texto: item.tipo === "modelo" ? String(m?.texto ?? "") : item.texto,
      };
    });
    const pdfsDeAntes = await arquivosPorOrigem(
      deps,
      id,
      declaracoes.map((d) => `declaracao:${d.chave}:pdf`)
    );
    const assinados = assinadosDe(pdfsDeAntes);
    // o PDF de uma geração anterior (pendente: o assinado nem chega ao laço) que continua na pasta se o novo falhar
    const temPdfDeAntes = (chave: string) =>
      pdfsDeAntes.some((a) => a.origem === `declaracao:${chave}:pdf`);

    const geradas: Record<string, unknown>[] = [];
    const mantidas: { chave: string; titulo: string }[] = [];
    const falhas: Record<string, unknown>[] = [];
    const pdfsAntigosNaPasta: string[] = [];
    try {
      for (const d of declaracoes) {
        if (assinados.has(`declaracao:${d.chave}:pdf`)) {
          mantidas.push({ chave: d.chave, titulo: d.titulo });
          continue;
        }
        const identificacao = { chave: d.chave, titulo: d.titulo };
        let p: ReturnType<typeof preencherModelo>;
        let formatos: {
          formato: "pdf" | "docx";
          assinatura: "pendente" | null;
          bytes: () => Uint8Array;
        }[];
        try {
          p = preencherModelo(d.texto, vars);
          // sempre por montarDadosDeclaracao: ele tira os parágrafos vazios, de que os geradores dependem
          const dados = montarDadosDeclaracao({ titulo: d.titulo, texto: p.texto, cabecalho: cab });
          formatos = [
            {
              formato: "pdf",
              assinatura: "pendente",
              bytes: () => bytesDoPdf(gerarPdfDeclaracao(dados, libs, logo)),
            },
            { formato: "docx", assinatura: null, bytes: () => gerarDocxDeclaracao(dados, logo) },
          ];
        } catch (e) {
          // nem o PDF nem o .docx foram gerados
          falhas.push(falhaDoArquivo("gerar_declaracoes", identificacao, e));
          if (temPdfDeAntes(d.chave)) pdfsAntigosNaPasta.push(d.titulo);
          continue;
        }
        const arquivos: Record<string, unknown>[] = [];
        let mantida = false;
        for (const f of formatos) {
          try {
            const nome = nomeParaExibir(nomeArquivoDeclaracao(d.titulo, f.formato));
            const g = await gravarNaOportunidade(
              { db: deps.db, storage: deps.storage, agora: deps.agora },
              {
                oportunidadeId: id,
                origem: `declaracao:${d.chave}:${f.formato}`,
                nome,
                bytes: f.bytes(),
                tipo: f.formato,
                pasta,
                categoria: null,
                assinatura: f.assinatura,
                usuarioNome: nomeDoUsuario(deps),
              }
            );
            // só "a oportunidade sumiu" interrompe tudo; erro de UM arquivo vira falha e a chamada segue
            if (!g) return naoEncontrado("oportunidade", id);
            if (g.mantido_assinado) {
              // o assinado chegou entre a leitura e a gravação: o que falta desta declaração não é gerado
              mantida = true;
              break;
            }
            arquivos.push({
              formato: f.formato,
              nome: g.nome,
              arquivo_id: g.arquivo_id,
              assinatura: f.assinatura,
              substituiu: g.substituiu,
            });
          } catch (e) {
            falhas.push(
              falhaDoArquivo("gerar_declaracoes", { ...identificacao, formato: f.formato }, e)
            );
            if (f.formato === "pdf" && temPdfDeAntes(d.chave)) pdfsAntigosNaPasta.push(d.titulo);
          }
        }
        if (arquivos.length === 0) {
          // nada foi gravado: ou o assinado chegou agora, ou os dois formatos falharam (já estão em `falhas`)
          if (mantida) mantidas.push({ chave: d.chave, titulo: d.titulo });
          continue;
        }
        geradas.push({ ...identificacao, arquivos, variaveis_sem_valor: p.sem_valor });
        if (p.sem_valor.length > 0) {
          avisos.push(
            `"${d.titulo}": sem valor para ${p.sem_valor.join(", ")}; ficou um espaço em branco para preencher.`
          );
        }
        if (p.desconhecidas.length > 0) {
          const lista = p.desconhecidas.map((x) => `{${x}}`).join(", ");
          avisos.push(
            p.desconhecidas.length === 1
              ? `"${d.titulo}": ${lista} não é uma variável do SIGO; ficou como está.`
              : `"${d.titulo}": ${lista} não são variáveis do SIGO; ficaram como estão.`
          );
        }
      }
    } finally {
      // só as declarações com ao menos um arquivo gravado entram no histórico
      if (geradas.length > 0) {
        await registrarNoHistorico(
          deps.db,
          id,
          nomeDoUsuario(deps),
          `Declarações geradas pelo Claude: ${geradas.map((g) => g.titulo).join("; ")}`
        );
      }
    }

    if (mantidas.length > 0) {
      avisos.push(
        `${plural(mantidas.length, "declaração já tem o PDF assinado e foi mantida", "declarações já têm o PDF assinado e foram mantidas")}, sem troca (veja mantidas_assinadas).`
      );
    }
    avisos.push(...pdfsAntigosNaPasta.map(avisoPdfAntigoNaPasta));
    if (falhas.length > 0) avisos.push(avisoDasFalhas(falhas.length));
    return sucesso(
      {
        oportunidade_id: id,
        pasta,
        geradas,
        mantidas_assinadas: mantidas,
        falhas,
        avisos,
        lembrete: LEMBRETE_ASSINATURA,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

export const FERRAMENTAS_DOCUMENTOS: Ferramenta[] = [GERAR_DOCUMENTOS_PROPOSTA, GERAR_DECLARACOES];
