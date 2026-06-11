/**
 * portal-cliente-acao — escritas do portal do cliente (upload de arquivo e
 * anotação), com o escopo re-derivado no servidor a partir da credencial.
 *
 * O cliente opera como `anon`; sob RLS as escritas diretas (sigo.entities.*)
 * falhariam. Aqui o service role grava em nome do cliente, mas SEMPRE no
 * empresa_id/oportunidade_id derivado do token — o client não escolhe o destino.
 *
 * Credencial: { token } (magic link) OU { portal_token } (login).
 * Ações:
 *   - { action: "upload_arquivo", arquivo: { nome, url, tipo, tamanho } }
 *   - { action: "add_nota", descricao }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { resolveClienteScope } from "../_shared/portal-cliente-scope.ts";

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const supabase = createAdminClient();
    const { scope, error, status } = await resolveClienteScope(supabase, body);
    if (!scope) return fail(error ?? "Acesso negado", status ?? 401);

    const { empresa_id, oportunidade_id, email_cliente } = scope;
    const autor = email_cliente || "Cliente";

    // --- Upload de arquivo -------------------------------------------------
    if (body.action === "upload_arquivo") {
      const a = body.arquivo || {};
      if (!a.nome || !a.url) return fail("Arquivo incompleto", 400);
      const { data, error: insErr } = await supabase
        .from("arquivo_oportunidade")
        .insert({
          empresa_id,
          oportunidade_id,
          nome: a.nome,
          url: a.url,
          tipo: a.tipo ?? null,
          tamanho: a.tamanho ?? null,
          usuario_nome: autor,
          enviado_por_cliente: true,
        })
        .select()
        .single();
      if (insErr) {
        console.error("[portal-cliente-acao] upload erro:", insErr.message);
        return fail("Erro ao salvar arquivo", 500);
      }
      return ok({ arquivo: data });
    }

    // --- Adicionar nota ----------------------------------------------------
    if (body.action === "add_nota") {
      const descricao = (body.descricao ?? "").trim();
      if (!descricao) return fail("Anotação vazia", 400);
      const { data, error: insErr } = await supabase
        .from("oportunidade_atualizacao")
        .insert({
          empresa_id,
          oportunidade_id,
          usuario_id: null,
          usuario_nome: autor,
          tipo: "Nota",
          descricao,
        })
        .select()
        .single();
      if (insErr) {
        console.error("[portal-cliente-acao] nota erro:", insErr.message);
        return fail("Erro ao salvar anotação", 500);
      }
      return ok({ nota: data });
    }

    return fail("Ação não reconhecida", 400);
  })
);
