/**
 * edital-schemas — tipos e JSON Schemas ESTRITOS (OpenAI structured outputs)
 * da leitura de edital e do "Atende?". Espelham o CONTRATO compartilhado com
 * o front (lib/edital-ia.js): EditalConsolidado/ParcialEdital e AtendeResultado.
 *
 * Estrito = todo objeto com additionalProperties:false e TODOS os campos em
 * required; "opcional" é expresso por tipo ["x","null"].
 */

// ─── Tipos do contrato ──────────────────────────────────────────────────────

export const MODALIDADES = [
  "concorrencia",
  "tomada_precos",
  "convite",
  "pregao",
  "dispensa",
  "inexigibilidade",
  "outra",
] as const;
export const FORMAS = ["eletronica", "presencial"] as const;
export const TIPOS_ECONOMICA = [
  "capital_social",
  "patrimonio_liquido",
  "capital_ou_pl",
  "ccl",
  "liquidez_corrente",
  "liquidez_geral",
  "solvencia_geral",
  "endividamento",
  "faturamento",
  "outro",
] as const;
export const TIPOS_REGISTRO = ["crea", "visto_crea", "cadastro_concessionaria", "outro"] as const;
export const STATUS_ATENDE = ["atende", "ressalva", "nao_atende", "verificar"] as const;

export type TipoEconomica = (typeof TIPOS_ECONOMICA)[number];
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number];
export type StatusAtende = (typeof STATUS_ATENDE)[number];

export interface DataHora {
  data: string | null; // AAAA-MM-DD
  hora: string | null; // HH:MM
  pagina: number | null;
}

export interface ExigenciaOperacional {
  id: string;
  descricao: string;
  servico: string | null;
  quantidade: number | null;
  unidade: string | null;
  percentual_minimo: number | null;
  somatorio_permitido: boolean | null;
  exige_execucao: boolean | null;
  pagina: number | null;
  trecho: string | null;
}

export interface ExigenciaProfissional {
  id: string;
  descricao: string;
  profissional: string | null;
  servico: string | null;
  quantidade: number | null;
  unidade: string | null;
  pagina: number | null;
  trecho: string | null;
}

export interface ExigenciaEconomica {
  id: string;
  tipo: TipoEconomica;
  valor_minimo: number | null;
  percentual_do_estimado: number | null;
  exercicio: string | null;
  descricao: string | null;
  pagina: number | null;
  trecho: string | null;
}

export interface ExigenciaRegistro {
  id: string;
  tipo: TipoRegistro;
  descricao: string | null;
  pagina: number | null;
}

export interface EditalConsolidado {
  orgao: string | null;
  cnpj_orgao: string | null;
  numero_edital: string | null;
  numero_processo: string | null;
  modalidade: (typeof MODALIDADES)[number] | null;
  forma: (typeof FORMAS)[number] | null;
  portal: string | null;
  objeto: string | null;
  titulo_sugerido: string | null;
  valor_estimado: number | null;
  criterio_julgamento: string | null;
  regime_execucao: string | null;
  prazo_execucao: string | null;
  vigencia: string | null;
  local: { cidade: string | null; uf: string | null; endereco: string | null };
  datas: {
    sessao: DataHora;
    proposta_limite: DataHora;
    impugnacao_limite: DataHora;
    esclarecimento_limite: DataHora;
    visita_tecnica: {
      obrigatoria: boolean | null;
      data: string | null;
      hora: string | null;
      descricao: string | null;
      pagina: number | null;
    };
  };
  garantia_proposta: {
    exigida: boolean | null;
    percentual: number | null;
    valor: number | null;
    pagina: number | null;
  };
  exclusiva_me_epp: boolean | null;
  consorcio_permitido: boolean | null;
  subcontratacao_permitida: boolean | null;
  habilitacao: {
    tecnica_operacional: ExigenciaOperacional[];
    tecnica_profissional: ExigenciaProfissional[];
    economica: ExigenciaEconomica[];
    registros: ExigenciaRegistro[];
    outros_documentos: { descricao: string; pagina: number | null }[];
  };
  itens: {
    lote: string | null;
    item: string | null;
    descricao: string | null;
    quantidade: number | null;
    unidade: string | null;
    valor_unitario: number | null;
    valor_total: number | null;
  }[];
  observacoes_importantes: { texto: string; pagina: number | null }[];
  paginas_lidas: number;
  avisos: string[];
}

/** ParcialEdital = mesmo formato, só com o que havia nas páginas da parte. */
export type ParcialEdital = EditalConsolidado;

export type GrupoAtende =
  | "tecnica_operacional"
  | "tecnica_profissional"
  | "economica"
  | "registros";

export interface ItemAtende {
  exigencia_id: string;
  grupo: GrupoAtende;
  exigencia: string;
  qtd_exigida: number | null;
  unidade: string | null;
  status: StatusAtende;
  comprovacao: string | null;
  atestados: { id: string; numero: string | null; contratante: string | null }[];
  justificativa: string;
}

export interface AtendeResultado {
  empresa: { id: string; nome: string | null };
  itens: ItemAtende[];
  veredito: "atende" | "atende_parcialmente" | "nao_atende";
  cats_anexar: { id: string; numero: string | null; motivo: string }[];
  pendencias: string[];
  riscos: string[];
  alertas: string[];
  analisado_em: string;
  modelo: string;
}

/** Resposta do modelo na parte técnica do "Atende?" ([AT1], [AT2]… = atestados). */
export interface RespostaTecnica {
  itens: {
    exigencia_id: string;
    status: StatusAtende;
    comprovacao: string | null;
    atestados: string[];
    justificativa: string;
  }[];
  cats_anexar: { atestado: string; motivo: string }[];
  pendencias: string[];
  riscos: string[];
}

// ─── Construtores de schema estrito ─────────────────────────────────────────

type Schema = Record<string, unknown>;

const comDescricao = (s: Schema, description?: string): Schema =>
  description ? { ...s, description } : s;
const texto = (d?: string) => comDescricao({ type: ["string", "null"] }, d);
const textoObrig = (d?: string) => comDescricao({ type: "string" }, d);
const numero = (d?: string) => comDescricao({ type: ["number", "null"] }, d);
const inteiro = (d?: string) => comDescricao({ type: ["integer", "null"] }, d);
const booleano = (d?: string) => comDescricao({ type: ["boolean", "null"] }, d);
const lista = (items: Schema, d?: string) => comDescricao({ type: "array", items }, d);
const opcoes = (valores: readonly string[], d?: string) =>
  comDescricao({ type: ["string", "null"], enum: [...valores, null] }, d);
const opcoesObrig = (valores: readonly string[], d?: string) =>
  comDescricao({ type: "string", enum: [...valores] }, d);
function objeto(properties: Record<string, Schema>, d?: string): Schema {
  return comDescricao(
    { type: "object", additionalProperties: false, required: Object.keys(properties), properties },
    d
  );
}

const PAGINA = inteiro("nº n do marcador '=== PÁGINA n ===' onde a informação aparece");
const DATA = texto("AAAA-MM-DD");
const HORA = texto("HH:MM (24 h)");
const TRECHO = texto("trecho curto do edital que fundamenta (até ~300 caracteres)");
const dataHora = (d: string) => objeto({ data: DATA, hora: HORA, pagina: PAGINA }, d);

/**
 * EditalConsolidado / ParcialEdital. semItens=true tira itens e paginas_lidas
 * (a consolidação junta os itens em código para não reescrevê-los no modelo).
 */
export function schemaEdital(opts: { semItens?: boolean } = {}): Schema {
  const props: Record<string, Schema> = {
    orgao: texto("órgão/entidade licitante"),
    cnpj_orgao: texto(),
    numero_edital: texto("nº do edital/aviso, ex.: 012/2026"),
    numero_processo: texto("nº do processo administrativo/licitatório"),
    modalidade: opcoes(MODALIDADES),
    forma: opcoes(FORMAS),
    portal: texto("plataforma/link onde ocorre a disputa (ex.: BLL, Licitanet, Compras.gov.br)"),
    objeto: texto("objeto da licitação, fiel ao edital"),
    titulo_sugerido: texto("título curto (até 80 caracteres) para o cartão da oportunidade"),
    valor_estimado: numero("valor total estimado da contratação em R$ (número)"),
    criterio_julgamento: texto("ex.: menor preço global, menor preço por lote"),
    regime_execucao: texto("ex.: empreitada por preço unitário"),
    prazo_execucao: texto("prazo de execução da obra/serviço, como escrito"),
    vigencia: texto("vigência do contrato/ata, como escrita"),
    local: objeto({
      cidade: texto("cidade da obra (ou do órgão, se a obra não for dita)"),
      uf: texto("sigla da UF, 2 letras"),
      endereco: texto(),
    }),
    datas: objeto({
      sessao: dataHora("abertura/sessão pública de disputa"),
      proposta_limite: dataHora("limite para cadastrar/enviar propostas"),
      impugnacao_limite: dataHora("limite para impugnar o edital"),
      esclarecimento_limite: dataHora("limite para pedidos de esclarecimento"),
      visita_tecnica: objeto({
        obrigatoria: booleano("true = obrigatória; false = facultativa; null = não há/não diz"),
        data: DATA,
        hora: HORA,
        descricao: texto("como/onde agendar, local, se aceita declaração de dispensa"),
        pagina: PAGINA,
      }),
    }),
    garantia_proposta: objeto({
      exigida: booleano(),
      percentual: numero("% do valor estimado, em pontos (1% = 1)"),
      valor: numero("valor em R$"),
      pagina: PAGINA,
    }),
    exclusiva_me_epp: booleano("licitação exclusiva para ME/EPP"),
    consorcio_permitido: booleano(),
    subcontratacao_permitida: booleano(),
    habilitacao: objeto({
      tecnica_operacional: lista(
        objeto({
          id: textoObrig("op1, op2…"),
          descricao: textoObrig("exigência como o edital descreve"),
          servico: texto("serviço/parcela de maior relevância"),
          quantidade: numero("quantidade MÍNIMA que o atestado deve comprovar"),
          unidade: texto(),
          percentual_minimo: numero("% citado pelo edital (50% = 50)"),
          somatorio_permitido: booleano(
            "true = aceita somar atestados; false = atestado único; null = não diz"
          ),
          exige_execucao: booleano("true = exige EXECUÇÃO (não basta projeto/fiscalização)"),
          pagina: PAGINA,
          trecho: TRECHO,
        }),
        "capacidade técnico-OPERACIONAL: atestados em nome da EMPRESA licitante"
      ),
      tecnica_profissional: lista(
        objeto({
          id: textoObrig("pr1, pr2…"),
          descricao: textoObrig(),
          profissional: texto("formação exigida, ex.: engenheiro eletricista"),
          servico: texto(),
          quantidade: numero(),
          unidade: texto(),
          pagina: PAGINA,
          trecho: TRECHO,
        }),
        "capacidade técnico-PROFISSIONAL: CAT/acervo do profissional do quadro da empresa"
      ),
      economica: lista(
        objeto({
          id: textoObrig("ec1, ec2…"),
          tipo: opcoesObrig(TIPOS_ECONOMICA),
          valor_minimo: numero(
            "R$ mínimo; nos índices, o índice mínimo (ex.: 1.0); em endividamento, o índice MÁXIMO"
          ),
          percentual_do_estimado: numero("% do valor estimado, em pontos (10% = 10)"),
          exercicio: texto("exercício/ano exigido, se houver"),
          descricao: texto(),
          pagina: PAGINA,
          trecho: TRECHO,
        }),
        "qualificação econômico-financeira"
      ),
      registros: lista(
        objeto({
          id: textoObrig("rg1, rg2…"),
          tipo: opcoesObrig(TIPOS_REGISTRO),
          descricao: texto(),
          pagina: PAGINA,
        }),
        "registro no CREA/CAU, visto no CREA local, cadastro em concessionária"
      ),
      outros_documentos: lista(
        objeto({ descricao: textoObrig(), pagina: PAGINA }),
        "demais documentos de habilitação relevantes (balanço, certidões específicas, declarações atípicas)"
      ),
    }),
    itens: lista(
      objeto({
        lote: texto(),
        item: texto(),
        descricao: texto(),
        quantidade: numero(),
        unidade: texto(),
        valor_unitario: numero(),
        valor_total: numero(),
      }),
      "lotes/itens da planilha (no máximo 80 linhas)"
    ),
    observacoes_importantes: lista(
      objeto({ texto: textoObrig(), pagina: PAGINA }),
      "só o que muda a decisão ou o preparo (no máximo 15)"
    ),
    paginas_lidas: inteiro(),
    avisos: lista({ type: "string" }, "problemas de leitura, conflitos resolvidos"),
  };
  if (opts.semItens) {
    delete props.itens;
    delete props.paginas_lidas;
  }
  return objeto(props);
}

/** Resposta do modelo na parte técnica/registros do "Atende?". */
export const SCHEMA_ATENDE_TECNICO: Schema = objeto({
  itens: lista(
    objeto({
      exigencia_id: textoObrig("id da exigência (op1, pr1, rg1…)"),
      status: opcoesObrig(STATUS_ATENDE),
      comprovacao: texto("qual CAT/atestado e qual quantidade comprova (cite o nº da CAT)"),
      atestados: lista({ type: "string" }, "códigos [AT1], [AT2]… dos atestados usados"),
      justificativa: textoObrig("raciocínio curto (1 a 3 frases)"),
    })
  ),
  cats_anexar: lista(
    objeto({
      atestado: textoObrig("código [AT1], [AT2]… do atestado"),
      motivo: textoObrig("quais exigências comprova"),
    })
  ),
  pendencias: lista({ type: "string" }),
  riscos: lista({ type: "string" }),
});
