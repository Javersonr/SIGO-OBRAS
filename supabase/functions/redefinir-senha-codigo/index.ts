/**
 * redefinir-senha-codigo — passo 2 da recuperação por WhatsApp
 *
 * Recebe { email, codigo, nova_senha }:
 *   1. Valida política da nova senha (mesmas regras do alterar-senha)
 *   2. Limite por IP (várias contas a partir da mesma origem)
 *   3. CONSOME 1 tentativa do código de forma atômica (RPC
 *      reset_senha_consumir_tentativa, migração 0112) ANTES de comparar: o
 *      UPDATE condicional só passa com código ativo, dentro da validade e com
 *      menos de 5 tentativas — rajada paralela não testa mais que 5 códigos.
 *   4. bcrypt do código (reset_token); conta sem código paga um bcrypt fictício
 *   5. Grava senha_hash novo SÓ se o token ainda for o mesmo (uso único),
 *      limpa token/tentativas, senha_provisoria=false
 *   6. Sincroniza o Supabase Auth e derruba as sessões abertas (best-effort)
 *
 * Toda falha de código responde a MESMA mensagem (sem código, vencido,
 * errado, esgotado) — nada revela se o e-mail existe ou tem código ativo.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword, verificarSenhaFicticia } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { atualizarSenhaAuth } from "../_shared/auth-bridge.ts";
import { revogarSessoesAuth } from "../_shared/sessoes-auth.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";

const MAX_TENTATIVAS = 5;
const JANELA_IP_SEG = 15 * 60;
const MAX_POR_IP = 20;

const MSG_CODIGO_INVALIDO =
  "Código inválido ou expirado. Confira o código ou peça um novo (cada código aceita até 5 tentativas).";

function validarPolitica(senha: string): string | null {
  if (senha.length < 8) return "Senha deve ter ao menos 8 caracteres";
  if (!/[a-z]/.test(senha)) return "Senha precisa de pelo menos 1 letra minúscula";
  if (!/[A-Z]/.test(senha)) return "Senha precisa de pelo menos 1 letra maiúscula";
  if (!/[0-9]/.test(senha)) return "Senha precisa de pelo menos 1 número";
  const triviais = ["12345678", "abcdefgh", "qwertyui", "password", "senha"];
  if (triviais.some((t) => senha.toLowerCase().includes(t))) {
    return "Senha muito previsível, escolha outra";
  }
  return null;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: { email?: string; codigo?: string; nova_senha?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const email = (body.email ?? "").trim().toLowerCase();
    const codigo = (body.codigo ?? "").trim();
    const novaSenha = body.nova_senha ?? "";
    if (!email || !codigo || !novaSenha) {
      return fail("email, codigo e nova_senha são obrigatórios", 400);
    }
    if (!/^\d{6}$/.test(codigo)) return fail(MSG_CODIGO_INVALIDO, 401);

    const politicaErro = validarPolitica(novaSenha);
    if (politicaErro) return fail(politicaErro, 400);

    const supabase = createAdminClient();

    const limite = await consumirTentativa(supabase, "redefinir-codigo", JANELA_IP_SEG, [
      { tipo: "ip", valor: ipDaRequisicao(req), max: MAX_POR_IP },
    ]);
    if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429);

    const { data: linhas, error } = await supabase.rpc("reset_senha_consumir_tentativa", {
      p_email: email,
      p_max: MAX_TENTATIVAS,
    });
    if (error) {
      console.error("[redefinir-senha-codigo] consumir tentativa:", error);
      return fail("Erro interno", 500);
    }
    const usuario = (linhas ?? [])[0] as
      | { id: string; email: string; auth_user_id: string | null; reset_token: string }
      | undefined;

    if (!usuario) {
      await verificarSenhaFicticia(codigo);
      return fail(MSG_CODIGO_INVALIDO, 401);
    }

    const { ok: codigoOk } = await verifyPassword(codigo, usuario.reset_token);
    if (!codigoOk) return fail(MSG_CODIGO_INVALIDO, 401);

    // Uso único: só grava se o token conferido ainda for o vigente (duas
    // chamadas certas em paralelo → só a primeira troca a senha).
    const novoHash = await hashPassword(novaSenha);
    const { data: gravado, error: upErr } = await supabase
      .from("usuario_custom")
      .update({
        senha_hash: novoHash,
        senha_provisoria: false,
        reset_token: null,
        reset_token_expira: null,
        reset_tentativas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usuario.id)
      .eq("reset_token", usuario.reset_token)
      .select("id");
    if (upErr) {
      console.error("[redefinir-senha-codigo] update senha:", upErr);
      return fail("Erro ao salvar nova senha", 500);
    }
    if (!gravado || gravado.length === 0) return fail(MSG_CODIGO_INVALIDO, 401);

    try {
      await atualizarSenhaAuth(supabase, {
        email: usuario.email,
        senha: novaSenha,
        authUserId: usuario.auth_user_id,
      });
    } catch (e) {
      console.error("[redefinir-senha-codigo] sync Auth (não-fatal):", (e as Error)?.message);
    }

    // Quem estava logado (inclusive quem roubou a sessão) sai de todos os lugares
    try {
      await revogarSessoesAuth(supabase, {
        email: usuario.email,
        authUserId: usuario.auth_user_id,
        senhaNova: novaSenha,
      });
    } catch (e) {
      console.error("[redefinir-senha-codigo] revogar sessões (não-fatal):", (e as Error)?.message);
    }

    return ok({ message: "Senha redefinida com sucesso. Faça login com a nova senha." });
  })
);
