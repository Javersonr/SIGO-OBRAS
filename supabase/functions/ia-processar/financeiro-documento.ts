/**
 * financeiro-documento — "Ler documento" do Financeiro pela IA (ação
 * financeiro_ler_documento da ia-processar): o formato comum DocumentoFiscal
 * (o mesmo que o front monta do XML em apps/web/src/lib/nfe-xml.js), o JSON
 * Schema ESTRITO pedido à IA, o prompt e a normalização da resposta.
 *
 * A saída da IA é DADO, não verdade — tudo passa por normalizarDocumento:
 *   - CPF/CNPJ só dígitos, com 11 ou 14 dígitos (senão null e o campo vai
 *     para duvidosos);
 *   - chave de acesso só com 44 dígitos, UF e modelo (55/65) de NF-e/NFC-e e
 *     DV módulo 11 válido (chave inventada bateria no índice único de
 *     chave_nfe) — senão null com aviso;
 *   - datas reais em AAAA-MM-DD; valores ≥ 0;
 *   - vencimentos ordenados; soma ≠ total (> R$ 0,05) vira aviso.
 *
 * Estrito = todo objeto com additionalProperties:false e TODAS as chaves em
 * required; "opcional" é tipo ["x","null"] (enum anulável inclui null).
 *
 * Puro (sem imports, sem Deno): testado com node --test.
 */

// ─── Tipos do formato comum ─────────────────────────────────────────────────

export type TipoLancamento = "despesa" | "receita";

export const TIPOS_DOCUMENTO = [
  "nfe",
  "nfce",
  "nfse",
  "recibo",
  "cupom",
  "boleto",
  "comprovante_pix",
  "outro",
] as const;
export const FORMAS_PAGAMENTO = ["pix", "boleto", "cartao", "dinheiro", "transferencia"] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export interface VencimentoDocumento {
  numero: string | null;
  /** AAAA-MM-DD */
  data: string;
  valor: number;
}

export interface ItemDocumento {
  descricao: string;
  codigo: string | null;
  ean: string | null;
  ncm: string | null;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
}

export interface DocumentoFiscal {
  origem: "xml" | "ia";
  tipo: TipoDocumento;
  numero: string | null;
  /** 44 dígitos (DV conferido) */
  chave: string | null;
  /** AAAA-MM-DD */
  data_emissao: string | null;
  valor_total: number | null;
  emitente: {
    nome: string | null;
    /** só dígitos (11 ou 14) */
    documento: string | null;
    ie: string | null;
    endereco: string | null;
  };
  destinatario: { nome: string | null; documento: string | null };
  vencimentos: VencimentoDocumento[];
  forma_pagamento: FormaPagamento | null;
  descricao: string | null;
  itens: ItemDocumento[];
  avisos: string[];
  duvidosos: string[];
}

/** itens pedidos à IA (a resposta tem teto de tokens; o XML traz todos) */
export const MAX_ITENS_DOCUMENTO = 40;

// ─── Schema estrito pedido à IA ─────────────────────────────────────────────

type Schema = Record<string, unknown>;

const comDescricao = (s: Schema, description?: string): Schema =>
  description ? { ...s, description } : s;
const texto = (d?: string) => comDescricao({ type: ["string", "null"] }, d);
const numero = (d?: string) => comDescricao({ type: ["number", "null"] }, d);
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

const DOC_PESSOA = texto("CNPJ ou CPF, só dígitos");

/** O que a IA devolve: o DocumentoFiscal sem `origem` (quem põe é o servidor). */
export const SCHEMA_DOCUMENTO_FISCAL: Schema = objeto({
  tipo: opcoesObrig(
    TIPOS_DOCUMENTO,
    "nfe = DANFE de NF-e; nfce = NFC-e; nfse = nota de serviço; cupom; recibo; boleto; comprovante_pix = PIX ou transferência; outro"
  ),
  numero: texto("número da nota, do recibo ou do documento do boleto (sem a série)"),
  chave: texto("chave de acesso de 44 dígitos da NF-e/NFC-e, SOMENTE se impressa; senão null"),
  data_emissao: texto("AAAA-MM-DD (no comprovante de PIX, a data do pagamento)"),
  valor_total: numero("valor total do documento em R$ (número, ex.: 1234.56)"),
  emitente: objeto(
    {
      nome: texto("razão social ou nome"),
      documento: DOC_PESSOA,
      ie: texto("inscrição estadual"),
      endereco: texto("endereço completo em uma linha"),
    },
    "quem emitiu o documento / recebeu o pagamento"
  ),
  destinatario: objeto(
    { nome: texto("razão social ou nome"), documento: DOC_PESSOA },
    "destinatário / tomador / pagador"
  ),
  vencimentos: lista(
    objeto({
      numero: texto("nº da duplicata/parcela"),
      data: texto("AAAA-MM-DD"),
      valor: numero("R$"),
    }),
    "duplicatas/parcelas (quadro FATURA do DANFE) ou o vencimento do boleto"
  ),
  forma_pagamento: opcoes(FORMAS_PAGAMENTO, "só se o documento disser"),
  descricao: texto("resumo curto do que foi comprado/vendido ou do serviço (até 120 caracteres)"),
  itens: lista(
    objeto({
      descricao: texto(),
      codigo: texto("código do produto"),
      ean: texto("GTIN/EAN"),
      ncm: texto(),
      unidade: texto(),
      quantidade: numero(),
      valor_unitario: numero(),
      valor_total: numero(),
    }),
    `produtos/serviços discriminados (no máximo ${MAX_ITENS_DOCUMENTO})`
  ),
  avisos: lista(
    { type: "string" },
    "problemas de leitura: ilegível, cortado, mais de um documento"
  ),
  duvidosos: lista(
    { type: "string" },
    "campos lidos com dúvida, ex.: valor_total, data_emissao, emitente.documento"
  ),
});

// ─── Prompt ─────────────────────────────────────────────────────────────────

export function promptDocumento(tipo: TipoLancamento): string {
  const papel =
    tipo === "receita"
      ? [
          "Este documento é de uma RECEITA da empresa (dinheiro que ENTRA). A pessoa que interessa é quem PAGA:",
          "ponha em destinatario o destinatário da nota, o tomador do serviço (NFS-e), de quem foi recebido (recibo), o pagador/sacado do boleto ou quem enviou o PIX;",
          "em emitente vai quem emitiu o documento ou recebeu o pagamento (normalmente a própria empresa).",
        ]
      : [
          "Este documento é de uma DESPESA da empresa (dinheiro que SAI). A pessoa que interessa é quem VENDEU ou PRESTOU o serviço:",
          "ponha em emitente o emitente da nota, o prestador (NFS-e), quem assina o recibo, o beneficiário/cedente do boleto ou quem recebeu o PIX (favorecido);",
          "em destinatario vai quem comprou/pagou (normalmente a própria empresa).",
        ];
  return [
    "Você é especialista em documentos fiscais e financeiros brasileiros: DANFE de NF-e, NFC-e, NFS-e, cupom fiscal, recibo, boleto e comprovante de PIX/transferência.",
    "Leia o documento anexado e preencha o JSON pedido. NUNCA invente: o que não estiver no documento = null (listas vazias quando não houver).",
    ...papel,
    "Regras:",
    "- Datas em AAAA-MM-DD. Valores em número com ponto decimal, sem R$ (R$ 1.234,56 → 1234.56).",
    "- valor_total: o total a pagar do documento (VALOR TOTAL DA NOTA no DANFE, valor do documento no boleto, valor pago no recibo/PIX).",
    "- CNPJ/CPF só com dígitos.",
    "- numero: número da nota, do recibo ou do documento do boleto, sem a série.",
    "- chave: a chave de acesso de 44 dígitos da NF-e/NFC-e SOMENTE se estiver impressa no documento; senão null. A linha digitável do boleto NÃO é chave.",
    "- vencimentos: as duplicatas/parcelas (quadro FATURA/DUPLICATAS do DANFE) ou, no boleto, a data de vencimento com o valor — cada uma com número, data e valor.",
    "- forma_pagamento: pix, boleto, cartao, dinheiro ou transferencia, só se o documento disser; senão null.",
    `- itens: os produtos/serviços discriminados, no máximo ${MAX_ITENS_DOCUMENTO}; se houver mais, liste os ${MAX_ITENS_DOCUMENTO} primeiros e diga em avisos.`,
    "- duvidosos: nomes dos campos lidos com dúvida (borrado, cortado, manuscrito), como valor_total, data_emissao, emitente.documento, vencimentos.",
    "- avisos: problemas do documento (ilegível, incompleto, mais de um documento na mesma imagem).",
  ].join("\n");
}

// ─── Chave de acesso da NF-e ────────────────────────────────────────────────

/** códigos IBGE das UFs (2 primeiros dígitos da chave) */
const UFS_IBGE = new Set(
  "11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53".split(" ")
);

/**
 * Chave de 44 dígitos (sem espaços) com UF válida, modelo 55 (NF-e) ou 65
 * (NFC-e) e DV módulo 11: pesos 2..9 da direita para a esquerda sobre os 43
 * primeiros dígitos; resto = soma % 11; DV = resto < 2 ? 0 : 11 − resto.
 */
export function chaveNfeValida(chave: unknown): boolean {
  if (typeof chave !== "string" || !/^\d{44}$/.test(chave)) return false;
  if (!UFS_IBGE.has(chave.slice(0, 2))) return false;
  const modelo = chave.slice(20, 22);
  if (modelo !== "55" && modelo !== "65") return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

// ─── Normalização ───────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const MAX_AVISOS_IA = 10;
const MAX_DUVIDOSOS = 30;
const TOLERANCIA_SOMA = 0.05;

const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

/** texto de uma linha, aparado e limitado; vazio/não texto → null */
function textoLimpo(v: unknown, max: number): string | null {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

const soDigitos = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "";

/** "000.001.234" → "1234" (só quando é número puro); "123/2026" fica igual */
function numeroDocumento(v: unknown): string | null {
  const t = textoLimpo(v, 60);
  if (!t || !/^\d[\d. ]*$/.test(t)) return t;
  return t.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** número ≥ 0 (aceita "1.234,56" e "R$ 10"), arredondado em `casas` */
function numeroNaoNegativo(v: unknown, casas: number): number | null {
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string") {
    let s = v.replace(/[R$\s]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n < 0) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** "AAAA-MM-DD" (ou com hora) / "DD/MM/AAAA" → AAAA-MM-DD de uma data que existe */
function dataIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(s);
  const br = iso ? null : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!iso && !br) return null;
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : [br![3], br![2], br![1]];
  const ano = Number(a);
  const mes = Number(m);
  const dia = Number(d);
  if (ano < 1900 || ano > 2100) return null;
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) {
    return null;
  }
  return `${a}-${m}-${d}`;
}

const umDe = <T extends string>(valores: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (valores as readonly string[]).includes(v) ? (v as T) : null;

/** GTIN com 8, 12, 13 ou 14 dígitos ("SEM GTIN" → null) */
function ean(v: unknown): string | null {
  const d = soDigitos(v);
  return [8, 12, 13, 14].includes(d.length) ? d : null;
}

/** NCM tem 8 dígitos ("8544.49.00" → "85444900") */
function ncm(v: unknown): string | null {
  const d = soDigitos(v);
  return d.length === 8 ? d : null;
}

/** R$ 1.234,56 */
function brl(n: number): string {
  const [inteiro, centavos] = n.toFixed(2).split(".");
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}

function listaDeTextos(v: unknown, maxItens: number, maxTexto: number): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = textoLimpo(x, maxTexto);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxItens) break;
  }
  return out;
}

/** resposta bruta da IA → DocumentoFiscal (origem "ia") com as regras acima */
export function normalizarDocumento(bruto: unknown): DocumentoFiscal {
  const b = obj(bruto);
  const emit = obj(b.emitente);
  const dest = obj(b.destinatario);
  const avisos = listaDeTextos(b.avisos, MAX_AVISOS_IA, 300);
  const duvidosos = listaDeTextos(b.duvidosos, MAX_DUVIDOSOS, 60);
  const duvida = (campo: string) => {
    if (!duvidosos.includes(campo)) duvidosos.push(campo);
  };

  // CPF/CNPJ: 11 ou 14 dígitos; lido mas fora disso → null e campo em dúvida
  const pessoa = (v: unknown, campo: string): string | null => {
    const d = soDigitos(v);
    if (d.length === 11 || d.length === 14) return d;
    if (d) duvida(campo);
    return null;
  };

  const chaveLida = soDigitos(b.chave);
  let chave: string | null = null;
  if (chaveNfeValida(chaveLida)) chave = chaveLida;
  else if (chaveLida) {
    avisos.push(
      "A chave de acesso lida não é uma chave de NF-e válida (dígito verificador) e foi descartada — confira no documento."
    );
  }

  const data_emissao = dataIso(b.data_emissao);
  if (!data_emissao && textoLimpo(b.data_emissao, 40)) duvida("data_emissao");

  const valor_total = numeroNaoNegativo(b.valor_total, 2);
  if (valor_total === null && b.valor_total !== null && b.valor_total !== undefined) {
    duvida("valor_total");
  }

  // vencimentos: só os com data real e valor > 0; um só sem valor = o total
  const brutos = (Array.isArray(b.vencimentos) ? b.vencimentos : []).map(obj);
  const vencimentos: VencimentoDocumento[] = [];
  for (const v of brutos) {
    const data = dataIso(v.data);
    const valor = numeroNaoNegativo(v.valor, 2) ?? (brutos.length === 1 ? valor_total : null);
    if (data && valor !== null && valor > 0) {
      vencimentos.push({ numero: textoLimpo(v.numero, 30), data, valor });
    }
  }
  vencimentos.sort(
    (x, y) =>
      x.data.localeCompare(y.data) ||
      (x.numero ?? "").localeCompare(y.numero ?? "", "pt-BR", { numeric: true })
  );
  const ignorados = brutos.length - vencimentos.length;
  if (ignorados > 0) {
    avisos.push(
      `${ignorados} vencimento(s) sem data ou valor legível foram ignorados — confira as parcelas.`
    );
  }
  if (vencimentos.length && valor_total !== null) {
    const soma = Math.round(vencimentos.reduce((s, v) => s + v.valor, 0) * 100) / 100;
    if (Math.abs(soma - valor_total) > TOLERANCIA_SOMA) {
      avisos.push(
        `A soma das parcelas (${brl(soma)}) difere do valor total (${brl(valor_total)}) — confira.`
      );
    }
  }

  const itens: ItemDocumento[] = [];
  let itensDescartados = 0;
  for (const i of (Array.isArray(b.itens) ? b.itens : []).map(obj)) {
    const descricao = textoLimpo(i.descricao, 300);
    if (!descricao) continue;
    if (itens.length >= MAX_ITENS_DOCUMENTO) {
      itensDescartados++;
      continue;
    }
    itens.push({
      descricao,
      codigo: textoLimpo(i.codigo, 60),
      ean: ean(i.ean),
      ncm: ncm(i.ncm),
      unidade: textoLimpo(i.unidade, 10),
      quantidade: numeroNaoNegativo(i.quantidade, 4),
      valor_unitario: numeroNaoNegativo(i.valor_unitario, 4),
      valor_total: numeroNaoNegativo(i.valor_total, 2),
    });
  }
  if (itensDescartados > 0) {
    avisos.push(
      `Só os ${MAX_ITENS_DOCUMENTO} primeiros itens foram lidos — para trazer todos, use o XML da nota.`
    );
  }

  return {
    origem: "ia",
    tipo: umDe(TIPOS_DOCUMENTO, b.tipo) ?? "outro",
    numero: numeroDocumento(b.numero),
    chave,
    data_emissao,
    valor_total,
    emitente: {
      nome: textoLimpo(emit.nome, 200),
      documento: pessoa(emit.documento, "emitente.documento"),
      ie: textoLimpo(emit.ie, 30),
      endereco: textoLimpo(emit.endereco, 300),
    },
    destinatario: {
      nome: textoLimpo(dest.nome, 200),
      documento: pessoa(dest.documento, "destinatario.documento"),
    },
    vencimentos,
    forma_pagamento: umDe(FORMAS_PAGAMENTO, b.forma_pagamento),
    descricao: textoLimpo(b.descricao, 200),
    itens,
    avisos,
    duvidosos,
  };
}

/**
 * Leitura fraca (vale escalar para o nível forte): sem valor total ou sem o
 * nome da pessoa do lançamento — emitente na despesa (padrão), destinatário
 * na receita.
 */
export function documentoFraco(doc: DocumentoFiscal, tipo: TipoLancamento = "despesa"): boolean {
  const pessoa = tipo === "receita" ? doc.destinatario.nome : doc.emitente.nome;
  return doc.valor_total === null || !pessoa;
}
