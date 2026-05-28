/**
 * Templates default de documentos do funcionário.
 *
 * Antes: o mesmo JSON literal aparecia ≥4 vezes em SegurancaTrabalho.jsx
 * (init de form, abrir treinamentos, abrir gerenciar, avançar próximo
 * funcionário). 200+ linhas duplicadas → divergência se alguém edita um
 * lugar e esquece os outros.
 *
 * Agora: 1 arquivo, importado em todos os pontos.
 */

const docVazio = (nome) => ({
  nome,
  anexado: false,
  url: "",
  data_upload: "",
  anexos: [],
});

export const TEMPLATE_DOCS_RH = [
  docVazio("ASO - Atestado de Saúde Ocupacional *"),
  docVazio("Exames Médicos"),
  docVazio("Registro de Empregado"),
];

export const TEMPLATE_DOCS_DEMISSIONAIS = [
  docVazio("Aviso Prévio"),
  docVazio("Comprovante de Acordo Judicial"),
  docVazio("Declaração de Empregado Desligado do Contrato"),
  docVazio("Declaração de Pedido de Demissão"),
  docVazio("Demonstrativo do Trabalhador de Recolhimento FGTS Rescisório"),
  docVazio("Exame Demissional"),
  docVazio("GRRF - Guia de Recolhimento Rescisório do FGTS e Comprovante de Pagamento"),
  docVazio("PPP - Perfil Profissiográfico Previdenciário"),
  docVazio("TRCT - Termo de Rescisão de Contrato de Trabalho"),
];

/**
 * Dado o valor cru do banco (que pode ser null, string JSON ou objeto/array),
 * devolve um array com os documentos. Cai pro template se valor for vazio.
 */
export function parseDocsOrTemplate(rawValue, template) {
  if (!rawValue) return template;
  try {
    const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // valor corrompido — cai pro template
  }
  return template;
}
