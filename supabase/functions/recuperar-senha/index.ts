/**
 * recuperar-senha — passo 1 da recuperação por WhatsApp
 *
 * Recebe { email }. Se o usuário existir e tiver telefone no vínculo:
 *   1. Gera código de 6 dígitos (crypto)
 *   2. Grava bcrypt(código) em reset_token + validade 10 min + zera tentativas
 *   3. Envia o código por WhatsApp (canal em _shared/whatsapp-envio.ts)
 *   4. Responde com o telefone MASCARADO (•••• -1234)
 *
 * Proteções: cooldown de 60s entre pedidos; código de uso único com validade;
 * e-mail inexistente recebe a MESMA resposta de sucesso (não confirma cadastro).
 * Usuário sem telefone recebe erro explícito — sistema interno, UX > sigilo.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import {
  enviarWhatsAppTexto,
  normalizarTelefoneBR,
  CanalNaoConfiguradoError,
} from "../_shared/whatsapp-envio.ts";

const VALIDADE_MIN = 10;
const COOLDOWN_SEG = 60;

const RESPOSTA_GENERICA =
  "Se o e-mail estiver cadastrado, enviamos um código por WhatsApp para o telefone do cadastro.";

function gerarCodigo(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, "0");
}

function mascarar(tel: string): string {
  return `•••• -${tel.slice(-4)}`;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return fail("Informe o e-mail", 400);

    const supabase = createAdminClient();

    const { data: usuario, error } = await supabase
      .from("usuario_custom")
      .select("id, email, ativo, reset_token_expira")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[recuperar-senha] usuario_custom:", error);
      return fail("Erro interno", 500);
    }

    // E-mail não cadastrado/inativo: resposta idêntica à de sucesso.
    if (!usuario || !usuario.ativo) return ok({ message: RESPOSTA_GENERICA });

    // Cooldown: se um código foi emitido há menos de 60s, segura.
    if (usuario.reset_token_expira) {
      const emitidoEm = new Date(usuario.reset_token_expira).getTime() - VALIDADE_MIN * 60000;
      if (Date.now() - emitidoEm < COOLDOWN_SEG * 1000) {
        return fail("Aguarde um minuto antes de pedir outro código", 429);
      }
    }

    // Telefone: vínculo ativo mais recente que tenha telefone.
    const { data: vinculos, error: vincErr } = await supabase
      .from("usuario_empresa")
      .select("telefone, updated_at")
      .eq("usuario_email", email)
      .eq("ativo", true)
      .is("deleted_at", null)
      .not("telefone", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (vincErr) {
      console.error("[recuperar-senha] usuario_empresa:", vincErr);
      return fail("Erro interno", 500);
    }

    let telefone: string | null = null;
    for (const v of vinculos ?? []) {
      telefone = normalizarTelefoneBR(v.telefone);
      if (telefone) break;
    }
    if (!telefone) {
      return fail(
        "Não há telefone válido no seu cadastro. Peça ao administrador para redefinir sua senha.",
        400
      );
    }

    const codigo = gerarCodigo();
    const tokenHash = await hashPassword(codigo);
    const expira = new Date(Date.now() + VALIDADE_MIN * 60000).toISOString();

    const { error: upErr } = await supabase
      .from("usuario_custom")
      .update({
        reset_token: tokenHash,
        reset_token_expira: expira,
        reset_tentativas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usuario.id);
    if (upErr) {
      console.error("[recuperar-senha] update token:", upErr);
      return fail("Erro interno", 500);
    }

    try {
      await enviarWhatsAppTexto(
        telefone,
        `🔐 SIGO Obras\n\nSeu código de recuperação de senha é: *${codigo}*\n\nVale por ${VALIDADE_MIN} minutos. Se você não pediu, ignore esta mensagem.`
      );
    } catch (e) {
      // Não deixa token válido órfão se o envio falhou
      await supabase
        .from("usuario_custom")
        .update({ reset_token: null, reset_token_expira: null })
        .eq("id", usuario.id);
      if (e instanceof CanalNaoConfiguradoError) {
        return fail("Envio por WhatsApp indisponível no momento. Contate o administrador.", 503);
      }
      console.error("[recuperar-senha] envio:", (e as Error)?.message);
      return fail("Não foi possível enviar o código. Tente novamente.", 502);
    }

    return ok({ message: RESPOSTA_GENERICA, telefone: mascarar(telefone) });
  })
);
