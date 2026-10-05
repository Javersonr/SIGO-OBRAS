/**
 * Apresentação da validação PÚBLICA do certificado EAD (página /ValidarCertificado), T10.
 * Puro (sem DOM, sem sigoClient), com teste ao lado. A decisão de verdade é do servidor
 * (supabase/functions/validar-certificado/regras.ts): ele devolve `situacao`, e aqui só viram texto e cor.
 *
 * Os quatro estados:
 *  - valido:     verde    "Autêntico e válido"
 *  - vencido:    âmbar    "Autêntico, vencido em DD/MM/AAAA"
 *  - revogado:   vermelho "Revogado"
 *  - divergente: vermelho "Dados não conferem com o registro" (o hash da emissão não bate com o banco)
 */

/** AAAA-MM-DD (ou timestamp) → DD/MM/AAAA; vazio → "—". */
export function dataBr(d) {
  return d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
}

/**
 * "valido" | "vencido" | "revogado" | "divergente", ou null se não há certificado.
 * Servidor ainda sem a T10 (resposta sem `situacao`): revogado ou válido, como era antes.
 */
export function situacaoDoResultado(resultado) {
  if (!resultado || resultado.encontrado === false) return null;
  if (resultado.situacao) return resultado.situacao;
  return resultado.revogado ? "revogado" : "valido";
}

/**
 * Título, cor (`tom`: "verde" | "ambar" | "vermelho") e, quando há, orientação. `validade` é a do
 * certificado (AAAA-MM-DD), usada no estado vencido.
 */
export function apresentacaoDoResultado(resultado, { validade } = {}) {
  const situacao = situacaoDoResultado(resultado);
  if (!situacao) return null;
  if (situacao === "vencido") {
    return {
      situacao,
      tom: "ambar",
      titulo: validade ? `Autêntico, vencido em ${dataBr(validade)}` : "Autêntico, vencido",
      detalhe:
        "O certificado é autêntico, mas passou da validade: o treinamento precisa ser renovado.",
    };
  }
  if (situacao === "revogado") {
    return { situacao, tom: "vermelho", titulo: "Revogado", detalhe: null };
  }
  if (situacao === "divergente") {
    return {
      situacao,
      tom: "vermelho",
      titulo: "Dados não conferem com o registro",
      detalhe:
        "O conteúdo gravado não bate com o selo de integridade (SHA-256) criado na emissão. " +
        "Não aceite este certificado sem confirmar com a empresa emissora.",
    };
  }
  return { situacao: "valido", tom: "verde", titulo: "Autêntico e válido", detalhe: null };
}

/**
 * Aviso discreto para certificado emitido antes do hash reproduzível: o servidor não consegue refazer o
 * SHA-256 dele (`integro: null`). Não reprova o certificado; só diz que a conferência não se aplica.
 * Servidor sem a T10 (campo `integro` ausente) não mostra aviso.
 */
export function avisoDeIntegridade(resultado) {
  if (!resultado || resultado.integro !== null) return null;
  return (
    "Certificado emitido antes do selo de integridade atual: a conferência automática do SHA-256 " +
    "não se aplica a ele."
  );
}
