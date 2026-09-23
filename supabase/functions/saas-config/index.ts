/**
 * saas-config — configurações globais do SaaS (Sinergia Digital).
 *
 * Só SUPER ADMIN. Ações:
 *   { acao: "status" }  → { success, openai: { configurada, final, modelo } }
 *   { acao: "definir", chave_openai?, modelo? } → { success }
 *
 * A chave NUNCA é retornada (só "configurada" + últimos 4 dígitos).
 * Precedência de leitura: env OPENAI_API_KEY > tabela saas_config.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";

const MODELOS_PERMITIDOS = ["gpt-4o-mini", "gpt-4o"];

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
