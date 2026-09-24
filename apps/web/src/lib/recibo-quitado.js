/**
 * PDF do recibo QUITADO (gerado no servidor quando o fornecedor confirma a
 * quitação pelo link do WhatsApp; também fica anexado à despesa).
 */
import { sigo } from "@/api/sigoClient";

/**
 * Garante o PDF (gera e anexa se faltar) e devolve a URL assinada que já baixa.
 * @returns {Promise<string|null>} null = despesa sem recibo quitado
 */
export async function urlReciboQuitado(transacaoId) {
  const { data } = await sigo.functions.invoke("reciboFornecedor", {
    acao: "pdf_quitado",
    transacao_id: transacaoId,
  });
  if (data?.success === false) {
    if (data.error === "SEM_RECIBO_QUITADO") return null;
    throw new Error(data.error || "Erro ao gerar o recibo quitado");
  }
  return data?.url || null;
}

/** Baixa o recibo quitado. @returns {Promise<boolean>} false = não há recibo quitado */
export async function baixarReciboQuitado(transacaoId) {
  const url = await urlReciboQuitado(transacaoId);
  if (!url) return false;
  const link = document.createElement("a");
  link.href = url; // URL assinada com ?download= → baixa sem sair da tela
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
