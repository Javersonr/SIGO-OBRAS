/**
 * enviar-whatsapp — disparo de mensagem 1:1 pelo canal do SaaS (Evolution API).
 *
 * Exige sessão de STAFF (usuário logado). Usado pelos fluxos do RH: link do
 * portal de treinamentos, ciência de entrega de EPI/ferramenta etc.
 *
 * { numero, texto } → { success } | 503 se a Evolution não estiver
 * configurada (o frontend cai no wa.me como plano B).
 */
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import {
  enviarWhatsAppTexto,
  normalizarTelefoneBR,
  CanalNaoConfiguradoError,
} from "../_shared/whatsapp-envio.ts";

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return fail("Sessão inválida", 401);

    let body: { numero?: string; texto?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const numero = normalizarTelefoneBR(body.numero ?? "");
    const texto = (body.texto ?? "").trim();
    if (!numero) return fail("Telefone inválido", 400);
    if (!texto || texto.length > 4000) return fail("Texto inválido", 400);

    try {
      await enviarWhatsAppTexto(numero, texto);
      return ok({ message: "Mensagem enviada", numero });
    } catch (e) {
      if (e instanceof CanalNaoConfiguradoError) {
        return fail("EVOLUTION_NAO_CONFIGURADA", 503);
      }
      console.error("[enviar-whatsapp]", (e as Error)?.message);
      return fail("Falha no envio: " + ((e as Error)?.message || ""), 502);
    }
  })
);
