import { safeParseJSON } from "./json-utils";

export const TIPOS_DOCUMENTO_PORTAL = {
  documentacao: "Documentação",
  contracheque: "Contracheque",
  folha_ponto: "Folha de ponto",
};

export function listaAnexosRH(valor) {
  const lista = safeParseJSON(valor, []);
  return Array.isArray(lista) ? lista : [];
}

export function validarPdfPortal(file, tipo, competencia) {
  if (!file || !/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
    return "Escolha um arquivo PDF";
  }
  if (file.size <= 0 || file.size > 20 * 1024 * 1024)
    return "O PDF deve ter até 20 MB e não pode estar vazio";
  if (!Object.hasOwn(TIPOS_DOCUMENTO_PORTAL, tipo)) return "Escolha o tipo do documento";
  if (tipo !== "documentacao" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia || "")) {
    return "Informe a competência (mês e ano)";
  }
  return null;
}

/**
 * Os parâmetros da RPC `portal_documento_publicar` (migração 0147, T33). O banco monta o item (id, origem,
 * publicado, data e quem publicou) e o grava num UPDATE só; a tela só manda o que o RH escolheu e o arquivo enviado.
 */
export function parametrosDaPublicacao({ funcionarioId, tipo, competencia, ref, nomeArquivo }) {
  return {
    p_funcionario_id: funcionarioId,
    p_tipo: tipo,
    p_competencia: tipo === "documentacao" ? null : competencia || null,
    p_ref: ref,
    p_nome_arquivo: nomeArquivo,
  };
}

/**
 * Quem publica e quem retira PDF do portal (P2 do spec da T33): aba RH de Segurança do Trabalho, `criar` publica e
 * `deletar` retira. Só interface: quem confere é o banco (as RPC).
 */
export function permissoesDocumentosPortal(temPermissao) {
  const tem = (funcao) => {
    try {
      return (
        typeof temPermissao === "function" &&
        temPermissao("Segurança do Trabalho", "RH", funcao) === true
      );
    } catch {
      return false;
    }
  };
  return { publicar: tem("criar"), retirar: tem("deletar") };
}

/** Mantém anexos legados e recusa alterar um item de outro funcionário. */
export function retirarDocumentoPortal(lista, id, funcionarioId) {
  return lista.filter(
    (doc) =>
      !(
        doc?.origem === "portal_funcionario" &&
        doc.id === id &&
        doc.funcionario_id === funcionarioId
      )
  );
}
