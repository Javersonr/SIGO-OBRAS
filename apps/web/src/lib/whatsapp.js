/**
 * Disparo de WhatsApp dos fluxos internos (RH, recibo de fornecedor etc.).
 *
 * 1º tenta o envio AUTOMÁTICO pela Evolution API (edge function
 * enviar-whatsapp, canal do SaaS). Se a Evolution não estiver configurada
 * (503) ou falhar, cai no wa.me: abre o WhatsApp do usuário com a mensagem
 * pronta pra ele enviar manualmente — e AVISA o motivo, pra não parecer que
 * o automático "não existe".
 *
 * Telefone inválido (ex.: 12 dígitos) não vai nem pro automático nem pro
 * wa.me (mandaria pro número errado): avisa pra corrigir o cadastro.
 *
 * @returns {Promise<"evolution"|"wa.me"|"invalido"|null>} canal usado (null = sem telefone)
 */
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";
import { digitosTelefone, mensagemTelefoneInvalido, telefoneValido } from "@/lib/telefone";

export async function dispararWhatsApp(telefone, texto) {
  const fone = digitosTelefone(telefone);
  if (!fone) return null;
  if (!telefoneValido(fone)) {
    toast.error(`${mensagemTelefoneInvalido(fone)} — corrija o cadastro e envie de novo.`, {
      duration: 10000,
    });
    return "invalido";
  }
  let motivo = "";
  try {
    const { data } = await sigo.functions.invoke("enviarWhatsApp", {
      numero: fone,
      texto,
    });
    if (data?.success !== false) return "evolution";
    motivo =
      data?.error === "EVOLUTION_NAO_CONFIGURADA"
        ? "canal automático não configurado"
        : data?.error || "";
  } catch (e) {
    motivo = e?.message || "";
  }
  toast.warning(
    `Envio automático falhou${motivo ? ` (${motivo})` : ""}. Abrimos o WhatsApp para você enviar.`,
    { duration: 10000 }
  );
  window.open(`https://wa.me/55${fone}?text=${encodeURIComponent(texto)}`, "_blank");
  return "wa.me";
}
