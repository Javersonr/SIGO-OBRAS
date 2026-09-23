/**
 * Checklist de documentos da CONTRATAÇÃO (esteira do RH & Segurança).
 *
 * Itens marcados `obrigatorio` travam o avanço para a etapa de contabilidade
 * (documentação mínima para registro). Os demais são desejáveis: aparecem
 * como pendência para quem anexou, mas não bloqueiam.
 */
import { normalizarTexto } from "./busca";

// Espelho da seção "Documentos necessários" do Formulário para Registro
// (modelo oficial da contabilidade). Foto 3x4 removida a pedido do dono.
export const CHECKLIST_CONTRATACAO = [
  { id: "rg_cpf", nome: "Cédula de Identidade e CPF (ou CNH)", obrigatorio: true },
  { id: "ctps", nome: "CTPS (número/série, qualificação civil, alterações)", obrigatorio: true },
  { id: "comprovante_endereco", nome: "Comprovante de residência atualizado", obrigatorio: true },
  { id: "pis_nis", nome: "PIS", obrigatorio: false },
  { id: "titulo_eleitor", nome: "Título de eleitor", obrigatorio: false },
  { id: "reservista", nome: "Certificado de reservista (masculino)", obrigatorio: false },
  {
    id: "certidao_casamento",
    nome: "Certidão de casamento/convívio marital + RG e CPF do cônjuge",
    obrigatorio: false,
  },
  { id: "certidao_filhos", nome: "Certidão de nascimento dos filhos", obrigatorio: false },
  { id: "vacinacao_filhos", nome: "Caderneta de vacinação (filhos < 7 anos)", obrigatorio: false },
  {
    id: "frequencia_escolar",
    nome: "Declaração de frequência escolar (filhos < 14 anos)",
    obrigatorio: false,
  },
  { id: "antecedentes_criminais", nome: "Certidão de antecedentes criminais", obrigatorio: false },
  { id: "cartao_conta", nome: "Cartão da conta (portabilidade salário)", obrigatorio: false },
  {
    id: "doc_digital",
    nome: "Documento de identificação digital colorido (conta salário)",
    obrigatorio: false,
  },
];

/**
 * Status do checklist a partir dos anexos ([{item, ...}]).
 * @returns {{obrigatoriosFaltando: string[], desejaveisFaltando: string[],
 *            completoObrigatorio: boolean, itens: Array}}
 */
export function statusChecklist(anexos = []) {
  const anexados = new Set((anexos || []).map((a) => a.item).filter(Boolean));
  const itens = CHECKLIST_CONTRATACAO.map((c) => ({ ...c, anexado: anexados.has(c.id) }));
  const obrigatoriosFaltando = itens.filter((c) => c.obrigatorio && !c.anexado).map((c) => c.nome);
  const desejaveisFaltando = itens.filter((c) => !c.obrigatorio && !c.anexado).map((c) => c.nome);
  return {
    itens,
    obrigatoriosFaltando,
    desejaveisFaltando,
    completoObrigatorio: obrigatoriosFaltando.length === 0,
  };
}

/**
 * Classificação INSTANTÂNEA pelo nome do arquivo (sem IA) — roda no anexo.
 * Os scanners/celulares da equipe costumam nomear bem ("CNH - FULANO.pdf",
 * "CERTIDAO DE CASAMENTO...", "COMPROVANTE DE ENDERECO (COPASA)...").
 * A IA refina depois o que sobrar como null.
 */
const REGRAS_NOME_ARQUIVO = [
  ["ctps", /ctps|carteira\s+de\s+trabalho/],
  ["titulo_eleitor", /titulo.*eleitor|eleitor/],
  ["reservista", /reservista|alistamento|militar/],
  ["certidao_casamento", /casamento|convivio|marital/],
  [
    "certidao_filhos",
    /(nascimento|certidao).*(filh|dependente)|(filh[ao]s?).*(nascimento|certidao)/,
  ],
  ["vacinacao_filhos", /vacina/],
  ["frequencia_escolar", /frequencia|escolar/],
  ["antecedentes_criminais", /antecedente/],
  ["cartao_conta", /cartao.*(conta|banco)|portabilidade/],
  ["comprovante_endereco", /endere|resid|copasa|conta\s+de\s+(luz|agua|energia)/],
  ["pis_nis", /\bpis\b|\bnis\b/],
  ["rg_cpf", /\brg\b|\bcnh\b|identidade|habilitacao|\bcpf\b/],
  ["doc_digital", /(identificacao|documento).*digital/],
];

export function classificarPorNomeArquivo(nomeArquivo) {
  const n = normalizarTexto(String(nomeArquivo || "").replace(/\.[a-z0-9]+$/i, ""));
  if (!n) return null;
  for (const [id, regex] of REGRAS_NOME_ARQUIVO) {
    if (regex.test(n)) return id;
  }
  return null;
}

/** Mapeia o nome de item devolvido pela IA para o id do checklist. */
export function itemPorNome(nome) {
  if (!nome) return null;
  const alvo = String(nome).toLowerCase();
  const hit = CHECKLIST_CONTRATACAO.find((c) => c.nome.toLowerCase() === alvo || c.id === alvo);
  if (hit) return hit.id;
  // tolerância: match parcial (ex.: "CTPS digital" → ctps)
  const parcial = CHECKLIST_CONTRATACAO.find(
    (c) => alvo.includes(c.id.replace(/_/g, " ")) || alvo.includes(c.nome.toLowerCase().slice(0, 8))
  );
  return parcial?.id ?? null;
}
