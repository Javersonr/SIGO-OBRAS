/**
 * Dados da proposta de preços (PDF e Excel) a partir do orçamento da
 * oportunidade: linhas com etapas e subtotais, total geral, valor por
 * extenso, validade, local/data e representante legal.
 *
 * Funções puras; a geração dos arquivos fica em lib/proposta-export.js.
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §9.
 */
import { formatarCpf, validarCpf } from "./cpf";
import { formatarCpfCnpj } from "./ler-documento";
import { formatarTelefone } from "./telefone";
import { subtotaisEtapas } from "./orcamento-desconto";
import { compararNumeroItem, rotuloItem } from "./orcamento-registros";

// ------------------------------------------------------ valor por extenso
// Port de supabase/functions/_shared/recibo-pdf.ts (valorPorExtenso), sem os tipos.
const UNID = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CEM = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n) {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100),
    r = n % 100;
  const partes = [];
  if (c) partes.push(CEM[c]);
  if (r)
    partes.push(
      r < 20 ? UNID[r] : [DEZ[Math.floor(r / 10)], UNID[r % 10]].filter(Boolean).join(" e ")
    );
  return partes.join(" e ");
}

const ESCALAS = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

function inteiroPorExtenso(n) {
  if (n === 0) return "zero";
  const grupos = [];
  for (let escala = 0; n > 0 && escala < ESCALAS.length; escala++) {
    grupos.unshift({ g: n % 1000, escala });
    n = Math.floor(n / 1000);
  }
  const partes = grupos
    .filter((p) => p.g)
    .map((p) => ({
      ...p,
      texto:
        p.escala === 1 && p.g === 1
          ? "mil"
          : [ate999(p.g), ESCALAS[p.escala][p.g === 1 ? 0 : 1]].filter(Boolean).join(" "),
    }));
  // "dois mil e quinhentos", "mil e cem", "dois mil quinhentos e trinta":
  // "e" antes do último grupo só quando ele é < 100 ou centena redonda
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      return (ultimo && (p.g < 100 || p.g % 100 === 0) ? " e " : " ") + p.texto;
    })
    .join("");
}

/** 1152.09 → "mil cento e cinquenta e dois reais e nove centavos". */
export function valorPorExtenso(valor) {
  const centavosTotais = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const cent = centavosTotais % 100;
  const partes = [];
  if (reais) {
    const milhao = reais % 1_000_000 === 0 && reais >= 1_000_000;
    partes.push(
      `${inteiroPorExtenso(reais)}${milhao ? " de" : ""} ${reais === 1 ? "real" : "reais"}`
    );
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}

// --------------------------------------------------------------- arquivo

/**
 * "Proposta - <nome> - <aaaa-mm-dd>.<ext>". Troca \ / : * ? " < > | e
 * caracteres de controle por "-" (inválidos no Windows) e junta os espaços.
 */
export function nomeArquivoProposta(nomeOportunidade, dataISO, ext) {
  const nome =
    String(nomeOportunidade ?? "")
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim() || "Oportunidade";
  return `Proposta - ${nome} - ${String(dataISO ?? "").slice(0, 10)}.${ext}`;
}

// ---------------------------------------------------------- representante

/** { nome, cargo, cpf }: nome obrigatório; CPF opcional, mas, se informado, válido; cargo livre. */
export function validarRepresentante({ nome, cpf } = {}) {
  const erros = [];
  if (!String(nome ?? "").trim()) erros.push("Informe o nome do representante legal");
  const cpfTexto = String(cpf ?? "").trim();
  if (cpfTexto && !validarCpf(cpfTexto)) erros.push("CPF do representante legal inválido");
  return { ok: erros.length === 0, erros };
}

// ----------------------------------------------------------------- dados

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const texto = (v) => String(v ?? "").trim();

/** "2026-10-05" → "05 de outubro de 2026" (sem new Date: não cai 1 dia no fuso). */
function dataPorExtenso(dataISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(dataISO));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return "";
  return `${m[3]} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

function formatarCep(cep) {
  const d = texto(cep).replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : texto(cep);
}

function montarEmpresa(e) {
  const emp = e || {};
  const logradouro = [emp.endereco, emp.numero].map(texto).filter(Boolean).join(", ");
  const cidadeUf = [emp.cidade, emp.estado].map(texto).filter(Boolean).join("/");
  const cep = texto(emp.cep) ? `CEP ${formatarCep(emp.cep)}` : "";
  return {
    nome: texto(emp.razao_social) || texto(emp.nome) || texto(emp.nome_fantasia),
    cnpj: texto(emp.cnpj) ? formatarCpfCnpj(emp.cnpj) : "",
    endereco: [logradouro, emp.complemento, emp.bairro, cidadeUf, cep]
      .map(texto)
      .filter(Boolean)
      .join(" - "),
    contato: [
      texto(emp.telefone) ? `Telefone: ${formatarTelefone(texto(emp.telefone))}` : "",
      texto(emp.email) ? `E-mail: ${texto(emp.email)}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

/** number, ou null para vazio/inválido. */
function numeroOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const centavos = (v) => Math.round((numeroOuNull(v) ?? 0) * 100);

/** "25" → "25%"; "25,00%" fica como está; vazio → null. */
function bdiComPercentual(bdi) {
  const t = texto(bdi);
  if (!t) return null;
  return t.endsWith("%") ? t : `${t}%`;
}

/**
 * Tudo o que o PDF e o Excel mostram, já calculado (DadosProposta):
 * { empresa: { nome, cnpj, endereco, contato }, titulo, orgao, objeto, edital,
 *   dataBase, bdi, linhas, totalGeral, totalExtenso, validade, localData,
 *   representante: { nome, cargo, cpf } }
 *
 * - linhas: todos os itens (com ou sem preço de referência), na ordem de `ordem`
 *   (desempate pelo número), como LinhaProposta { tipo: "etapa"|"item", numero,
 *   codigo, fonte, descricao, unidade, quantidade, valorUnitario, total, nivel }.
 *   Na etapa, total = subtotal (subtotaisEtapas) e nivel = nº de segmentos do número.
 * - totalGeral = Σ valor_total dos itens (sem as etapas), somado em centavos.
 * - órgão/objeto/edital: de orcamento_info; se faltar, dos campos da licitação da
 *   oportunidade (orgao; licitacao_numero/licitacao_processo). O objeto cai por último no
 *   nome da oportunidade (nome, ou titulo). O que não existir fica null e não sai.
 */
export function montarDadosProposta({ itens, info, oportunidade, empresa, representante, opcoes }) {
  const inf = info || {};
  const op = oportunidade || {};
  const opc = opcoes || {};
  const rep = representante || {};

  const ordenados = [...(itens || [])].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || compararNumeroItem(a.numero, b.numero)
  );
  const subtotais = subtotaisEtapas(ordenados);

  let totalCentavos = 0;
  const linhas = ordenados.map((item, indice) => {
    const numero = rotuloItem(item, indice);
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
        total: subtotais[item.numero] ?? 0,
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
  const data = dataPorExtenso(opc.dataISO);
  const local = texto(opc.local);
  const edital =
    texto(inf.edital) ||
    [
      texto(op.licitacao_numero) && `Edital ${texto(op.licitacao_numero)}`,
      texto(op.licitacao_processo) && `Processo ${texto(op.licitacao_processo)}`,
    ]
      .filter(Boolean)
      .join(" - ");

  return {
    empresa: montarEmpresa(empresa),
    titulo: "Proposta de preços",
    orgao: texto(inf.orgao) || texto(op.orgao) || null,
    objeto: texto(inf.objeto) || texto(op.nome) || texto(op.titulo) || null,
    edital: edital || null,
    dataBase: texto(inf.data_base) || null,
    bdi: bdiComPercentual(inf.bdi),
    linhas,
    totalGeral,
    totalExtenso: valorPorExtenso(totalGeral),
    validade: `Validade da proposta: ${dias} ${dias === 1 ? "dia" : "dias"}`,
    localData: [local, data].filter(Boolean).join(", "),
    representante: {
      nome: texto(rep.nome),
      cargo: texto(rep.cargo),
      cpf: texto(rep.cpf) ? formatarCpf(rep.cpf) : "",
    },
  };
}

/**
 * Descrição da versão registrada na aba Geral (proposta_oportunidade):
 * "Orçamento com desconto de 12,35% (real 12,40%) — 57 itens".
 */
export function descricaoVersaoProposta({ descontoPct, descontoReal, qtdItens }) {
  const pct = (v) =>
    (Number(v) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const n = Number(qtdItens) || 0;
  return `Orçamento com desconto de ${pct(descontoPct)}% (real ${pct(descontoReal)}%) — ${n} ${
    n === 1 ? "item" : "itens"
  }`;
}
