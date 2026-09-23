/**
 * Checklist de documentos da CONTRATAÇÃO (esteira do RH & Segurança).
 *
 * Itens marcados `obrigatorio` travam o avanço para a etapa de contabilidade
 * (documentação mínima para registro). Os demais são desejáveis: aparecem
 * como pendência para quem anexou, mas não bloqueiam.
 */
export const CHECKLIST_CONTRATACAO = [
  { id: "rg_cpf", nome: "RG e CPF (ou CNH)", obrigatorio: true },
  { id: "ctps", nome: "CTPS", obrigatorio: true },
  { id: "comprovante_endereco", nome: "Comprovante de endereço", obrigatorio: true },
  { id: "foto_3x4", nome: "Foto 3x4", obrigatorio: true },
  { id: "certidao", nome: "Certidão de nascimento/casamento", obrigatorio: false },
  { id: "titulo_eleitor", nome: "Título de eleitor", obrigatorio: false },
  { id: "reservista", nome: "Certificado de reservista", obrigatorio: false },
  { id: "escolaridade", nome: "Comprovante de escolaridade", obrigatorio: false },
  { id: "cartao_vacina", nome: "Cartão de vacina", obrigatorio: false },
  { id: "pis_nis", nome: "PIS/NIS", obrigatorio: false },
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
