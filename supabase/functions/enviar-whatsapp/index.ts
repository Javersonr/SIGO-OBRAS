/**
 * enviar-whatsapp — disparo de mensagem 1:1 pelo canal do SaaS (Evolution API).
 *
 * Exige sessão de STAFF (usuário logado). Usado pelos fluxos do RH: link do
 * portal de treinamentos, ciência de entrega de EPI/ferramenta etc.
 *
 * { numero, texto } → { success } | 503 se a Evolution não estiver
 * configurada (o frontend cai no wa.me como plano B).
 *
 * O número é UM só para todas as empresas: um abuso (texto livre em massa)
 * bane o número e derruba o canal de todo mundo. Por isso há teto por usuário
 * e por empresa (429 → o frontend cai no wa.me) e cada envio fica no
 * audit_log (só tamanho e destino mascarado, nunca o texto).
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { consumirTentativa, ipDaRequisicao } from "../_shared/limite-tentativas.ts";
import {
  enviarWhatsAppTexto,
  normalizarTelefoneBR,
  CanalNaoConfiguradoError,
} from "../_shared/whatsapp-envio.ts";

// Os envios do app são 1 a 1, por clique (credenciais do portal, aviso de
// treinamento/ciência, recibo, resposta de dúvida): estes tetos sobram.
const JANELA_SEG = 60 * 60;
const MAX_POR_USUARIO = 60;
const MAX_POR_EMPRESA = 300;
const MAX_TEXTO = 4000;

/** 5538999448281 → 5538*****8281 (o log não guarda o número inteiro). */
function mascararNumero(n: string): string {
  return n.length > 8 ? n.slice(0, 4) + "*".repeat(n.length - 8) + n.slice(-4) : "****";
}

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
    if (!texto || texto.length > MAX_TEXTO) return fail("Texto inválido", 400);

    const supabase = createAdminClient();

    // Teto por usuário E por empresa (as duas chaves no mesmo consumo atômico).
    // Limitador fora do ar NEGA: o frontend cai no wa.me, e o canal não fica
    // sem freio.
    const limite = await consumirTentativa(
      supabase,
      "enviar-whatsapp",
      JANELA_SEG,
      [
        { tipo: "conta", valor: `usuario:${usuario.email}`, max: MAX_POR_USUARIO },
        {
          tipo: "conta",
          valor: usuario.empresa_id ? `empresa:${usuario.empresa_id}` : null,
          max: MAX_POR_EMPRESA,
        },
      ],
      { falharFechado: true }
    );
    if (!limite.permitido) {
      if (limite.indisponivel) return fail("Envio automático indisponível no momento", 503);
      console.warn("[enviar-whatsapp] limite por hora atingido:", usuario.email);
      return fail(
        "Limite de mensagens automáticas por hora atingido. Aguarde um pouco ou envie pelo seu WhatsApp.",
        429,
        { codigo: "LIMITE" }
      );
    }

    const destino = mascararNumero(numero);
    const ip = ipDaRequisicao(req);
    // audit_log (best-effort): quem, para onde (mascarado), tamanho e resultado
    const auditar = async (status: "sucesso" | "erro", erro?: string) => {
      if (!usuario.empresa_id) return; // audit_log.empresa_id é obrigatório
      const { error } = await supabase.from("audit_log").insert({
        empresa_id: usuario.empresa_id,
        usuario_email: usuario.email,
        tipo_acao: "enviar_whatsapp",
        entidade: "whatsapp",
        modulo: "WhatsApp",
        descricao: `WhatsApp automático para ${destino} (${texto.length} caracteres)`,
        dados_novos: { destino, tamanho: texto.length },
        status,
        mensagem_erro: erro ? erro.slice(0, 300) : null,
        // IP já normalizado (v4 ou prefixo /64); lixo no header não derruba o log
        endereco_ip: ip && /^[0-9a-f.:/]+$/i.test(ip) ? ip : null,
        user_agent: req.headers.get("user-agent")?.slice(0, 400) || null,
      });
      if (error) console.warn("[enviar-whatsapp] audit_log (não-fatal):", error.message);
    };

    try {
      await enviarWhatsAppTexto(numero, texto);
      await auditar("sucesso");
      return ok({ message: "Mensagem enviada", numero });
    } catch (e) {
      const msg = (e as Error)?.message || "";
      // no log só o código (o corpo da Evolution pode ecoar o texto)
      await auditar(
        "erro",
        e instanceof CanalNaoConfiguradoError
          ? "canal não configurado"
          : (msg.match(/^Evolution \d+/)?.[0] ?? "falha no envio")
      );
      if (e instanceof CanalNaoConfiguradoError) {
        return fail("EVOLUTION_NAO_CONFIGURADA", 503);
      }
      console.error("[enviar-whatsapp]", msg);
      return fail("Falha no envio: " + msg, 502);
    }
  })
);
