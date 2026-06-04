/**
 * config-licitacao — lê/grava a configuração de busca de licitações.
 *
 * A tela de Configurações usa esta função (em vez de escrever direto na
 * tabela) porque a RLS de licitacao_busca exige empresa_id = empresa do JWT,
 * e a troca de empresa na UI não regenera o JWT — o insert direto era barrado.
 * Aqui usamos service role (bypassa RLS) e gravamos no empresa_id informado.
 *
 * Ações:
 *   { action: "get",  empresa_id } → devolve a config (ou null)
 *   { action: "save", empresa_id, ufs[], palavras_chave, criar_oportunidade_auto, ativo, id? }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { getCallerFromJWT, empresaIdEfetivo } from "../_shared/auth-jwt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let body: {
    action?: string;
    empresa_id?: string;
    id?: string;
    ufs?: string[];
    palavras_chave?: string;
    criar_oportunidade_auto?: boolean;
    ativo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const action = body.action ?? "get";

  // empresa_id vem do JWT do chamador (não do body) — fecha cross-tenant.
  const caller = await getCallerFromJWT(req);
  if (!caller) return fail("Sessão inválida", 401);
  const empresa_id = empresaIdEfetivo(caller, body.empresa_id);
  if (!empresa_id) return fail("Token sem empresa associada", 401);

  const supabase = createAdminClient();

  // Confirma que a empresa existe (guarda básica)
  const { data: emp } = await supabase
    .from("empresa")
    .select("id")
    .eq("id", empresa_id)
    .maybeSingle();
  if (!emp) return fail("Empresa inválida", 404);

  if (action === "get") {
    const { data, error } = await supabase
      .from("licitacao_busca")
      .select("*")
      .eq("empresa_id", empresa_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return fail("Erro ao ler config: " + error.message, 500);
    return ok({ config: (data || [])[0] || null });
  }

  if (action === "save") {
    const ufs = Array.isArray(body.ufs)
      ? body.ufs.map((u) => String(u).toUpperCase().trim()).filter(Boolean)
      : [];
    if (ufs.length === 0) return fail("Informe ao menos uma UF", 400);
    if (!body.palavras_chave || !body.palavras_chave.trim()) {
      return fail("Informe ao menos uma palavra-chave", 400);
    }

    const payload = {
      empresa_id,
      ufs,
      palavras_chave: body.palavras_chave.trim(),
      criar_oportunidade_auto: Boolean(body.criar_oportunidade_auto),
      ativo: body.ativo !== false,
      updated_at: new Date().toISOString(),
    };

    // Já existe config pra essa empresa? atualiza; senão cria.
    const { data: existente } = await supabase
      .from("licitacao_busca")
      .select("id")
      .eq("empresa_id", empresa_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const existId = (existente || [])[0]?.id || body.id || null;

    let saved;
    if (existId) {
      const { data, error } = await supabase
        .from("licitacao_busca")
        .update(payload)
        .eq("id", existId)
        .select("*")
        .single();
      if (error) return fail("Erro ao atualizar: " + error.message, 500);
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("licitacao_busca")
        .insert({ nome: "Busca padrão", ...payload })
        .select("*")
        .single();
      if (error) return fail("Erro ao criar: " + error.message, 500);
      saved = data;
    }

    return ok({ config: saved });
  }

  return fail("Ação desconhecida: " + action, 400);
});
