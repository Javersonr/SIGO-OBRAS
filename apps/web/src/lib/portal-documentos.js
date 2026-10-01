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
