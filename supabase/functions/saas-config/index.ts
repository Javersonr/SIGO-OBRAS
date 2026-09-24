/**
 * saas-config — configurações globais do SaaS (Sinergia Digital).
 *
 * Só SUPER ADMIN. Ações:
 *   { acao: "status" }  → { success, openai: { configurada, final, modelo } }
 *   { acao: "definir", chave_openai?, modelo? } → { success }
 *   { acao: "whatsapp_status" | "whatsapp_qr" | "whatsapp_desconectar" }
 *        → { success, whatsapp: { configurado, estado, numero?, nome?, qr? } }
 *
 * A chave NUNCA é retornada (só "configurada" + últimos 4 dígitos).
 * Precedência de leitura: env OPENAI_API_KEY > tabela saas_config.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { evolutionApi, CanalNaoConfiguradoError } from "../_shared/whatsapp-envio.ts";

const MODELOS_PERMITIDOS = ["gpt-4o-mini", "gpt-4o"];

async function estadoWhatsApp() {
  const { status, json } = await evolutionApi("/instance/fetchInstances?instanceName={i}");
  const inst = Array.isArray(json) ? json[0] : null;
  if (status === 404 || !inst) return { existe: false, estado: "close" };
  return {
    existe: true,
    estado: inst.connectionStatus || "close",
    numero: inst.connectionStatus === "open" ? (inst.ownerJid || "").split("@")[0] : null,
    nome: inst.connectionStatus === "open" ? inst.profileName || null : null,
  };
}

/**
 * Conexão do WhatsApp do SaaS (Evolution). O QR é pedido SEM número de
 * telefone: com número a Evolution troca o código de pareamento a cada ~45s
 * e o celular recusa o código vencido.
 */
async function acaoWhatsApp(acao: string): Promise<Response> {
  if (acao === "whatsapp_status") {
    return ok({ whatsapp: { configurado: true, ...(await estadoWhatsApp()) } });
  }

  if (acao === "whatsapp_qr") {
    const atual = await estadoWhatsApp();
    if (atual.estado === "open") return ok({ whatsapp: { configurado: true, ...atual } });
    if (!atual.existe) {
      const criada = await evolutionApi("/instance/create", {
        method: "POST",
        body: {
          instanceName: Deno.env.get("EVOLUTION_INSTANCE"),
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        },
      });
      if (criada.status >= 300) return fail("Não foi possível criar a instância do WhatsApp", 502);
    }
    const { status, json } = await evolutionApi("/instance/connect/{i}");
    if (status >= 300) return fail("Evolution não gerou o QR code", 502);
    return ok({ whatsapp: { configurado: true, estado: "connecting", qr: json?.base64 ?? null } });
  }

  if (acao === "whatsapp_desconectar") {
    await evolutionApi("/instance/logout/{i}", { method: "DELETE" });
    return ok({ whatsapp: { configurado: true, ...(await estadoWhatsApp()) } });
  }

  return fail("Ação desconhecida", 400);
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return fail("Sessão inválida", 401);
    if (!usuario.is_super_admin) return fail("Acesso restrito ao super admin", 403);

    let body: { acao?: string; chave_openai?: string; modelo?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    if (body.acao?.startsWith("whatsapp_")) {
      try {
        return await acaoWhatsApp(body.acao);
      } catch (e) {
        if (e instanceof CanalNaoConfiguradoError) {
          return ok({ whatsapp: { configurado: false, estado: "close" } });
        }
        console.error("[saas-config] whatsapp:", (e as Error)?.message);
        return fail("Servidor do WhatsApp indisponível", 502);
      }
    }

    const supabase = createAdminClient();

    if (body.acao === "status") {
      const { data } = await supabase
        .from("saas_config")
        .select("chave, valor")
        .in("chave", ["openai_api_key", "openai_modelo"]);
      const mapa = new Map((data ?? []).map((r) => [r.chave, r.valor]));
      const chave = Deno.env.get("OPENAI_API_KEY") || mapa.get("openai_api_key") || "";
      return ok({
        openai: {
          configurada: chave.length > 0,
          final: chave ? chave.slice(-4) : null,
          origem: Deno.env.get("OPENAI_API_KEY") ? "secret" : chave ? "painel" : null,
          modelo: mapa.get("openai_modelo") || "gpt-4o-mini",
        },
      });
    }

    if (body.acao === "definir") {
      const upserts: { chave: string; valor: string; updated_at: string }[] = [];
      const agora = new Date().toISOString();
      if (body.chave_openai !== undefined) {
        const chave = (body.chave_openai ?? "").trim();
        if (!chave.startsWith("sk-") || chave.length < 20) {
          return fail("Chave OpenAI inválida (deve começar com sk-)", 400);
        }
        upserts.push({ chave: "openai_api_key", valor: chave, updated_at: agora });
      }
      if (body.modelo !== undefined) {
        if (!MODELOS_PERMITIDOS.includes(body.modelo ?? "")) {
          return fail(`Modelo deve ser um de: ${MODELOS_PERMITIDOS.join(", ")}`, 400);
        }
        upserts.push({ chave: "openai_modelo", valor: body.modelo!, updated_at: agora });
      }
      if (upserts.length === 0) return fail("Nada para definir", 400);
      const { error } = await supabase.from("saas_config").upsert(upserts, { onConflict: "chave" });
      if (error) {
        console.error("[saas-config] upsert:", error);
        return fail("Erro ao salvar", 500);
      }
      return ok({ message: "Configuração salva" });
    }

    return fail("Ação desconhecida", 400);
  })
);
