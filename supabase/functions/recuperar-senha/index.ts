/**
 * recuperar-senha — passo 1 da recuperação por WhatsApp
 *
 * Recebe { email } e responde SEMPRE a mesma mensagem genérica (200), exista o
 * e-mail ou não, tenha telefone ou não, esteja em cooldown ou não — e no mesmo
 * tempo: a emissão e o envio rodam em segundo plano (EdgeRuntime.waitUntil).
 * Só o limite de pedidos (429) pode mudar a resposta, e ele conta por IP e
 * por e-mail digitado, cadastrado ou não — então também não revela nada.
 *
 * Em segundo plano, se o usuário existir, estiver ativo e tiver telefone:
 *   1. Gera código de 6 dígitos (crypto) e grava bcrypt(código) em reset_token
 *      com validade de 10 min — num UPDATE condicional (cooldown de 60s atômico)
 *   2. Envia o código por WhatsApp (canal em _shared/whatsapp-envio.ts)
 *
 * Tentativas erradas (reset_tentativas) NÃO zeram a cada código novo: somam
 * para todos os códigos pedidos dentro de 1h do último pedido. Esgotadas as 5,
 * nenhum código novo é emitido até a janela passar — sem isso, pedir código
 * novo a cada minuto renovava as 5 tentativas indefinidamente.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { enviarWhatsAppTexto, normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";

const VALIDADE_MIN = 10;
const COOLDOWN_SEG = 60;
const MAX_TENTATIVAS = 5; // mesmo teto do redefinir-senha-codigo
const JANELA_TENTATIVAS_MIN = 60;
const JANELA_PEDIDOS_SEG = 60 * 60;
const MAX_PEDIDOS_POR_IP = 10;
const MAX_PEDIDOS_POR_CONTA = 5;

const RESPOSTA_GENERICA =
  "Se o e-mail estiver cadastrado com um telefone, enviamos um código por WhatsApp. " +
  "Se não chegar em alguns minutos, peça ao administrador para redefinir sua senha.";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// deno-lint-ignore no-explicit-any
type Db = any;

interface UsuarioReset {
  id: string;
  reset_token_expira: string | null;
  reset_tentativas: number | null;
}

function gerarCodigo(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, "0");
}

/** Roda depois da resposta; sem EdgeRuntime (teste local) só aguarda. */
async function emSegundoPlano(tarefa: Promise<void>): Promise<void> {
  const segura = tarefa.catch((e) =>
    console.error("[recuperar-senha] segundo plano:", (e as Error)?.message)
  );
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(segura);
    return;
  }
  await segura;
}

async function emitirEEnviarCodigo(supabase: Db, usuario: UsuarioReset, email: string) {
  const agora = Date.now();
  const emitidoEm = usuario.reset_token_expira
    ? Date.parse(usuario.reset_token_expira) - VALIDADE_MIN * 60_000
    : null;
  const desde = emitidoEm == null ? Infinity : agora - emitidoEm;
  if (desde < COOLDOWN_SEG * 1000) return;

  const janelaAtiva = desde < JANELA_TENTATIVAS_MIN * 60_000;
  if (janelaAtiva && (usuario.reset_tentativas ?? 0) >= MAX_TENTATIVAS) {
    console.warn("[recuperar-senha] tentativas esgotadas na janela — código não emitido");
    return;
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
  if (vincErr) throw new Error(`usuario_empresa: ${vincErr.message}`);

  let telefone: string | null = null;
  for (const v of vinculos ?? []) {
    telefone = normalizarTelefoneBR(v.telefone);
    if (telefone) break;
  }
  if (!telefone) {
    console.warn("[recuperar-senha] usuário sem telefone válido — código não emitido");
    return;
  }

  const codigo = gerarCodigo();
  const tokenHash = await hashPassword(codigo);
  const expira = new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString();
  // expira < corte  ⇔  o código vigente foi emitido há mais de COOLDOWN_SEG
  const corte = new Date(Date.now() + VALIDADE_MIN * 60_000 - COOLDOWN_SEG * 1000).toISOString();

  const patch: Record<string, unknown> = {
    reset_token: tokenHash,
    reset_token_expira: expira,
    updated_at: new Date().toISOString(),
  };
  // Só zera fora da janela; dentro dela o campo nem é escrito, para não
  // sobrescrever um incremento feito em paralelo pelo redefinir-senha-codigo.
  if (!janelaAtiva) patch.reset_tentativas = 0;

  const { data: gravado, error: upErr } = await supabase
    .from("usuario_custom")
    .update(patch)
    .eq("id", usuario.id)
    .or(`reset_token_expira.is.null,reset_token_expira.lt."${corte}"`)
    .select("id");
  if (upErr) throw new Error(`update token: ${upErr.message}`);
  if (!gravado || gravado.length === 0) return; // outro pedido ganhou a corrida

  try {
    await enviarWhatsAppTexto(
      telefone,
      `🔐 SIGO Obras\n\nSeu código de recuperação de senha é: *${codigo}*\n\nVale por ${VALIDADE_MIN} minutos. Se você não pediu, ignore esta mensagem.`
    );
  } catch (e) {
    // Não deixa código válido órfão; mantém a validade p/ o cooldown e a janela
    await supabase.from("usuario_custom").update({ reset_token: null }).eq("id", usuario.id);
    throw new Error(`envio WhatsApp: ${(e as Error)?.message}`);
  }
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

    const limite = await consumirTentativa(supabase, "recuperar-senha", JANELA_PEDIDOS_SEG, [
      { tipo: "ip", valor: ipDaRequisicao(req), max: MAX_PEDIDOS_POR_IP },
      { tipo: "conta", valor: email, max: MAX_PEDIDOS_POR_CONTA },
    ]);
    if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429);

    const { data: usuario, error } = await supabase
      .from("usuario_custom")
      .select("id, ativo, reset_token_expira, reset_tentativas")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[recuperar-senha] usuario_custom:", error);
      return fail("Erro interno", 500);
    }

    if (usuario?.ativo) {
      await emSegundoPlano(emitirEEnviarCodigo(supabase, usuario, email));
    }

    return ok({ message: RESPOSTA_GENERICA });
  })
);
