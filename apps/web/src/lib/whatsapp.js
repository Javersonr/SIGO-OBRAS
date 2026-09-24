/**
 * Disparo de WhatsApp dos fluxos internos (RH etc.).
 *
 * 1º tenta o envio AUTOMÁTICO pela Evolution API (edge function
 * enviar-whatsapp, canal do SaaS). Se a Evolution não estiver configurada
 * (503) ou falhar, cai no wa.me: abre o WhatsApp do usuário com a mensagem
 * pronta pra ele enviar manualmente.
 *
 * @returns {Promise<"evolution"|"wa.me"|null>} canal usado (null = sem telefone)
 */
import { sigo } from "@/api/sigoClient";

export async function dispararWhatsApp(telefone, texto) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (!fone) return null;
  try {
    const { data } = await sigo.functions.invoke("enviarWhatsApp", {
      numero: fone,
      texto,
    });
    if (data?.success !== false) return "evolution";
  } catch {
    /* cai no plano B */
  }
  const completo = fone.startsWith("55") ? fone : `55${fone}`;
  window.open(`https://wa.me/${completo}?text=${encodeURIComponent(texto)}`, "_blank");
  return "wa.me";
}
