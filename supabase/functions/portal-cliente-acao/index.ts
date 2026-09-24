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
 *   - { action: "preparar_upload", nome }  → { bucket, path, token, ref }
 *   - { action: "upload_arquivo", arquivo: { nome, url, tipo, tamanho } }  (url = ref)
 *   - { action: "add_nota", descricao }
 *
 * Upload do cliente: sem sessão da empresa, a RLS do Storage barra o envio
 * direto. "preparar_upload" devolve um upload ASSINADO para um caminho gerado
 * aqui, na pasta da empresa do escopo; o navegador envia o arquivo
 * (uploadToSignedUrl) e grava a ref com "upload_arquivo".
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { resolveClienteScope } from "../_shared/portal-cliente-scope.ts";
import { refDaEmpresa } from "../_shared/storage-assinar.ts";

// Mesmo bucket do upload interno de arquivos sem tipo específico (UploadFile →
// "templates"): aceita qualquer formato até 50 MB. O anexos-oportunidade só
// aceita PDF/JPEG/PNG e barraria planilha, DWG etc.
const BUCKET_UPLOAD_CLIENTE = "templates";

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

    // --- Preparar upload (URL de envio assinada) ---------------------------
    if (body.action === "preparar_upload") {
      const nome = String(body.nome ?? "").slice(0, 150);
      const seguro = nome.replace(/[^a-zA-Z0-9._-]/g, "_") || "arquivo";
      const agora = new Date();
      const mes = String(agora.getMonth() + 1).padStart(2, "0");
      // <empresa_id>/<aaaa>/<mm>/<uuid>-<nome>: mesmo formato do UploadFile
      const caminho = `${empresa_id}/${agora.getFullYear()}/${mes}/${crypto.randomUUID()}-${seguro}`;
      const { data, error: upErr } = await supabase.storage
        .from(BUCKET_UPLOAD_CLIENTE)
        .createSignedUploadUrl(caminho);
      if (upErr || !data?.token) {
        console.error("[portal-cliente-acao] preparar_upload erro:", upErr?.message);
        return fail("Não foi possível preparar o envio do arquivo", 500);
      }
      return ok({
        bucket: BUCKET_UPLOAD_CLIENTE,
        path: caminho,
        token: data.token,
        ref: `${BUCKET_UPLOAD_CLIENTE}/${caminho}`,
      });
    }

    // --- Upload de arquivo -------------------------------------------------
    if (body.action === "upload_arquivo") {
      const a = body.arquivo || {};
      if (!a.nome || !a.url) return fail("Arquivo incompleto", 400);
      // Só ref do bucket de upload do cliente, na pasta desta empresa: o portal
      // assina com service role o que estiver gravado — URL solta, caminho de
      // outra empresa ou de outro bucket (RH, biometria...) viraria vazamento.
      const ref = refDaEmpresa(a.url, empresa_id);
      if (!ref || !ref.startsWith(`${BUCKET_UPLOAD_CLIENTE}/`)) {
        return fail("Arquivo inválido", 400);
      }
      const { data, error: insErr } = await supabase
        .from("arquivo_oportunidade")
        .insert({
          empresa_id,
          oportunidade_id,
          nome: a.nome,
          url: ref,
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
