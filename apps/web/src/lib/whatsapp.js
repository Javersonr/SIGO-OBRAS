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
  // valida o valor BRUTO (o mesmo que a tela valida) e normaliza UMA vez só:
  // digitosTelefone não é idempotente — "(55) 99999-99999" (12 dígitos,
  // inválido) viraria "(99) 9999-9999" numa 2ª passada
  const fone = digitosTelefone(telefone);
  if (!fone) return null;
  if (!telefoneValido(telefone)) {
    toast.error(`${mensagemTelefoneInvalido(telefone)} — corrija o cadastro e envie de novo.`, {
      duration: 10000,
    });
    return "invalido";
  }
  // válido ⇒ `fone` = DDD + número (10/11 dígitos, sem o 55): o servidor
  // (normalizarTelefoneBR) põe o 55 na frente — mesmo número do wa.me abaixo
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
  const aviso = `Envio automático falhou${motivo ? ` (${motivo})` : ""}.`;
  const url = `https://wa.me/55${fone}?text=${encodeURIComponent(texto)}`;
  // depois de await o navegador pode bloquear o pop-up (window.open → null):
  // aí o aviso fica fixo com um botão — o clique é um gesto novo e abre
  if (window.open(url, "_blank")) {
    toast.warning(`${aviso} Abrimos o WhatsApp para você enviar.`, { duration: 10000 });
  } else {
    toast.warning(`${aviso} O navegador bloqueou a janela do WhatsApp.`, {
      description: "Clique em “Abrir WhatsApp” para enviar a mensagem.",
      duration: Infinity,
      action: { label: "Abrir WhatsApp", onClick: () => window.open(url, "_blank") },
    });
  }
  return "wa.me";
}

/** Copia para a área de transferência; true = copiou. */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copia a mensagem (que pode ter a senha provisória recém-criada) e avisa.
 * Depois de awaits o Safari/Firefox negam a cópia (a ativação do clique
 * expirou): aí o aviso fica FIXO com o botão "Copiar mensagem" — o clique é
 * um gesto novo. Só diz "copiada" quando copiou de verdade.
 * `rotulo` = a situação, ex.: "Funcionário sem telefone".
 * @returns {Promise<boolean>} true = copiou agora
 */
export async function copiarOuOferecer(texto, rotulo) {
  if (await copiarTexto(texto)) {
    toast.info(`${rotulo} — mensagem copiada para você entregar`, { duration: 10000 });
    return true;
  }
  toast.warning(`${rotulo} — a mensagem ainda NÃO foi copiada`, {
    description: "Clique em “Copiar mensagem” e entregue ao destinatário.",
    duration: Infinity,
    action: {
      label: "Copiar mensagem",
      onClick: async () => {
        if (await copiarTexto(texto)) {
          toast.success("Mensagem copiada");
          return;
        }
        // último recurso: mostra o texto pra anotar (senão a senha se perde)
        toast.error("Não foi possível copiar — anote a mensagem:", {
          description: texto,
          duration: Infinity,
          closeButton: true,
          classNames: { description: "whitespace-pre-line select-text" },
        });
      },
    },
  });
  return false;
}
