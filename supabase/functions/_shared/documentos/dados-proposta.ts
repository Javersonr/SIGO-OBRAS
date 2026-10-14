/**
 * Dados da proposta de preços e cabeçalho comum dos documentos da licitação — porte linha a linha de
 * apps/web/src/lib/proposta-orcamento.js para o servidor (spec 2026-10-09 §3). A tela continua com a
 * lib dela; a paridade (mesma entrada, mesmo resultado) é conferida no Vitest
 * (apps/web/src/lib/documentos-paridade.test.js). `descricaoVersaoProposta` não vem: já existe em
 * _shared/orcamento/proposta.ts.
 * Puro: sem Deno e sem import de URL.
 */
import { subtotaisEtapas, type ItemOrcamento } from "../orcamento/desconto.ts";
import { ordenarItensOportunidade } from "../orcamento/registros.ts";
import {
  dataPorExtenso,
  formatarCep,
  formatarCpf,
  formatarCpfCnpj,
  formatarTelefone,
  validarCpf,
  valorPorExtenso,
} from "./formatos.ts";

export interface EmpresaDocumento {
  nome: string;
  cnpj: string;
  endereco: string;
  contato: string;
}

export interface Representante {
  nome: string;
  cargo: string;
  cpf: string;
}

export interface CabecalhoLicitacao {
  empresa: EmpresaDocumento;
  orgao: string | null;
  objeto: string | null;
  edital: string | null;
  localData: string;
  representante: Representante;
}

export interface LinhaProposta {
  tipo: "etapa" | "item";
  numero: string;
  codigo: string | null;
  fonte: string | null;
  descricao: string;
  nivel: number;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  total: number;
}

export interface DadosProposta extends CabecalhoLicitacao {
  titulo: string;
  dataBase: string | null;
  bdi: string | null;
  linhas: LinhaProposta[];
  totalGeral: number;
  totalExtenso: string;
  validade: string;
}

// --------------------------------------------------------------- arquivo

/**
 * "Proposta - <nome> - <aaaa-mm-dd>.<ext>". Troca \ / : * ? " < > | e
 * caracteres de controle por "-" (inválidos no Windows) e junta os espaços.
 */
export function nomeArquivoProposta(
  nomeOportunidade: unknown,
  dataISO: unknown,
  ext: string
): string {
  const nome =
    String(nomeOportunidade ?? "")
      // deno-lint-ignore no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim() || "Oportunidade";
  return `Proposta - ${nome} - ${String(dataISO ?? "").slice(0, 10)}.${ext}`;
}

// ---------------------------------------------------------- representante

/** { nome, cargo, cpf }: nome obrigatório; CPF opcional, mas, se informado, válido; cargo livre. */
export function validarRepresentante({ nome, cpf }: { nome?: unknown; cpf?: unknown } = {}): {
  ok: boolean;
  erros: string[];
} {
  const erros: string[] = [];
  if (!String(nome ?? "").trim()) erros.push("Informe o nome do representante legal");
  const cpfTexto = String(cpf ?? "").trim();
  if (cpfTexto && !validarCpf(cpfTexto)) erros.push("CPF do representante legal inválido");
  return { ok: erros.length === 0, erros };
}

// ----------------------------------------------------------------- dados

/** Lê um campo de um objeto solto (qualquer outra coisa → undefined). */
const campo = (o: unknown, k: string): unknown =>
  o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;

const texto = (v: unknown): string => String(v ?? "").trim();

/** "Cidade/UF" da empresa (só uma das partes, se faltar a outra; "" sem nenhuma). */
export function localDaEmpresa(empresa: Record<string, unknown> | null): string {
  return [campo(empresa, "cidade"), campo(empresa, "estado")].map(texto).filter(Boolean).join("/");
}

function montarEmpresa(e: unknown): EmpresaDocumento {
  const emp: unknown = e || {};
  const logradouro = [campo(emp, "endereco"), campo(emp, "numero")]
    .map(texto)
    .filter(Boolean)
    .join(", ");
  const cidadeUf = localDaEmpresa(emp as Record<string, unknown>);
  const cep = texto(campo(emp, "cep")) ? `CEP ${formatarCep(campo(emp, "cep"))}` : "";
  return {
    nome:
      texto(campo(emp, "razao_social")) ||
      texto(campo(emp, "nome")) ||
      texto(campo(emp, "nome_fantasia")),
    cnpj: texto(campo(emp, "cnpj")) ? formatarCpfCnpj(campo(emp, "cnpj")) : "",
    endereco: [logradouro, campo(emp, "complemento"), campo(emp, "bairro"), cidadeUf, cep]
      .map(texto)
      .filter(Boolean)
      .join(" - "),
    contato: [
      texto(campo(emp, "telefone"))
        ? `Telefone: ${formatarTelefone(texto(campo(emp, "telefone")))}`
        : "",
      texto(campo(emp, "email")) ? `E-mail: ${texto(campo(emp, "email"))}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

/** number, ou null para vazio/inválido. */
function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const centavos = (v: unknown): number => Math.round((numeroOuNull(v) ?? 0) * 100);

/** "25" → "25%"; "25,00%" fica como está; vazio → null. */
function bdiComPercentual(bdi: unknown): string | null {
  const t = texto(bdi);
  if (!t) return null;
  return t.endsWith("%") ? t : `${t}%`;
}

/**
 * Cabeçalho comum aos documentos da licitação (proposta de preços e cronograma
 * físico-financeiro):
 * { empresa: { nome, cnpj, endereco, contato }, orgao, objeto, edital, localData,
 *   representante: { nome, cargo, cpf } }
 *
 * - órgão/objeto/edital: de orcamento_info; se faltar, dos campos da licitação da
 *   oportunidade (orgao; licitacao_numero/licitacao_processo). O objeto cai por último no
 *   nome da oportunidade (nome, ou titulo). O que não existir fica null e não sai.
 * - localData: "<local>, <dd de mês de aaaa>" (opcoes.local e opcoes.dataISO).
 */
export function montarCabecalhoLicitacao({
  info,
  oportunidade,
  empresa,
  representante,
  opcoes,
}: {
  info?: unknown;
  oportunidade?: unknown;
  empresa?: unknown;
  representante?: unknown;
  opcoes?: { local?: string; dataISO?: string; validadeDias?: number };
} = {}): CabecalhoLicitacao {
  const inf = info || {};
  const op = oportunidade || {};
  const opc = opcoes || {};
  const rep = representante || {};
  const data = dataPorExtenso(opc.dataISO);
  const local = texto(opc.local);
  const edital =
    texto(campo(inf, "edital")) ||
    [
      texto(campo(op, "licitacao_numero")) && `Edital ${texto(campo(op, "licitacao_numero"))}`,
      texto(campo(op, "licitacao_processo")) &&
        `Processo ${texto(campo(op, "licitacao_processo"))}`,
    ]
      .filter(Boolean)
      .join(" - ");

  return {
    empresa: montarEmpresa(empresa),
    orgao: texto(campo(inf, "orgao")) || texto(campo(op, "orgao")) || null,
    objeto:
      texto(campo(inf, "objeto")) || texto(campo(op, "nome")) || texto(campo(op, "titulo")) || null,
    edital: edital || null,
    localData: [local, data].filter(Boolean).join(", "),
    representante: {
      nome: texto(campo(rep, "nome")),
      cargo: texto(campo(rep, "cargo")),
      cpf: texto(campo(rep, "cpf")) ? formatarCpf(campo(rep, "cpf")) : "",
    },
  };
}

/**
 * Tudo o que o PDF e o Excel mostram, já calculado (DadosProposta):
 * { empresa: { nome, cnpj, endereco, contato }, titulo, orgao, objeto, edital,
 *   dataBase, bdi, linhas, totalGeral, totalExtenso, validade, localData,
 *   representante: { nome, cargo, cpf } }
 *
 * - linhas: todos os itens (com ou sem preço de referência), na ordem e com o rótulo de
 *   ordenarItensOportunidade (a mesma da tela: `ordem`, desempate pelo número), como
 *   LinhaProposta { tipo: "etapa"|"item", numero, codigo, fonte, descricao, unidade,
 *   quantidade, valorUnitario, total, nivel }.
 *   Na etapa, total = subtotal (subtotaisEtapas) e nivel = nº de segmentos do número.
 * - totalGeral = Σ valor_total dos itens (sem as etapas), somado em centavos.
 * - órgão/objeto/edital: de orcamento_info; se faltar, dos campos da licitação da
 *   oportunidade (orgao; licitacao_numero/licitacao_processo). O objeto cai por último no
 *   nome da oportunidade (nome, ou titulo). O que não existir fica null e não sai.
 */
export function montarDadosProposta({
  itens,
  info,
  oportunidade,
  empresa,
  representante,
  opcoes,
}: {
  itens: ItemOrcamento[];
  info?: unknown;
  oportunidade?: unknown;
  empresa?: unknown;
  representante?: unknown;
  opcoes?: { local?: string; dataISO?: string; validadeDias?: number };
}): DadosProposta {
  const inf = info || {};
  const opc = opcoes || {};

  // Mesma ordem e mesmo rótulo (`item.item`) da tela; devolve lista nova, `itens` fica intacta.
  const ordenados = ordenarItensOportunidade(itens);
  const subtotais = subtotaisEtapas(ordenados);

  let totalCentavos = 0;
  const linhas = ordenados.map((item): LinhaProposta => {
    const numero = item.item;
    const nivel = String(numero).split(".").length;
    const base = {
      numero,
      codigo: texto(item.codigo) || null,
      fonte: texto(item.fonte) || null,
      descricao: texto(item.descricao),
      nivel,
    };
    if (item.etapa) {
      return {
        tipo: "etapa",
        ...base,
        unidade: null,
        quantidade: null,
        valorUnitario: null,
        total: subtotais[String(item.numero)] ?? 0,
      };
    }
    const cents = centavos(item.valor_total);
    totalCentavos += cents;
    return {
      tipo: "item",
      ...base,
      unidade: texto(item.unidade) || null,
      quantidade: numeroOuNull(item.quantidade),
      valorUnitario: numeroOuNull(item.valor_unitario),
      total: cents / 100,
    };
  });

  const totalGeral = totalCentavos / 100;
  const dias = Number(opc.validadeDias) || 0;
  const cab = montarCabecalhoLicitacao({ info, oportunidade, empresa, representante, opcoes });

  return {
    empresa: cab.empresa,
    titulo: "Proposta de preços",
    orgao: cab.orgao,
    objeto: cab.objeto,
    edital: cab.edital,
    dataBase: texto(campo(inf, "data_base")) || null,
    bdi: bdiComPercentual(campo(inf, "bdi")),
    linhas,
    totalGeral,
    totalExtenso: valorPorExtenso(totalGeral),
    validade: `Validade da proposta: ${dias} ${dias === 1 ? "dia" : "dias"}`,
    localData: cab.localData,
    representante: cab.representante,
  };
}
