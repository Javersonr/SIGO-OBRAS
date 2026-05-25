/**
 * Wrapper das integrações Core do Base44 (UploadFile, SendEmail, InvokeLLM, etc.)
 * sobre Supabase Storage + Edge Functions.
 */

/**
 * Inferi qual bucket usar a partir de pistas do arquivo ou contexto.
 * Pode ser sobrescrito passando `bucket` explicitamente.
 */
function inferBucket({ fileName = "", mimeType = "", context = "" }) {
  const lower = (fileName + " " + context).toLowerCase();
  if (lower.includes("foto") && lower.includes("ferramenta")) return "fotos-ferramentas";
  if (lower.includes("foto") && lower.includes("material")) return "fotos-materiais";
  if (lower.includes("foto") && lower.includes("funcionario")) return "fotos-funcionarios";
  if (lower.includes("logo")) return "logos-empresa";
  if (lower.includes("comprovante") && lower.includes("pagamento")) return "comprovantes-pagamento";
  if (lower.includes("comprovante")) return "comprovantes";
  if (lower.includes("laudo")) return "laudos";
  if (lower.includes("certificado")) return "certificados";
  if (lower.includes("assinad") || lower.includes("assinatura")) return "assinaturas";
  if (lower.includes("documento") && lower.includes("assinad")) return "documentos-assinados";
  if (lower.includes("inspecao") || lower.includes("inspeção")) return "inspecoes";
  if (lower.includes("diario") || lower.includes("diário")) return "diario-obra";
  if (lower.includes("nfe") && mimeType.includes("xml")) return "nfe-xml";
  if (lower.includes("nfe")) return "nfe-pdf";
  if (lower.includes("boleto")) return "boletos";
  if (lower.includes("biometria")) return "biometria";
  if (lower.includes("anexo") && lower.includes("cotacao")) return "anexos-cotacao";
  if (lower.includes("anexo") && lower.includes("oportunidade")) return "anexos-oportunidade";
  if (mimeType.startsWith("image/")) return "comprovantes"; // fallback razoável
  return "templates";
}

/**
 * Gera caminho seguro: <empresa_id>/<yyyy>/<mm>/<uuid>-<filename>
 * Path-based tenant isolation (RLS valida que primeiro segmento = empresa_id do JWT).
 */
function buildPath(empresaId, fileName) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uid = crypto.randomUUID();
  return `${empresaId}/${year}/${month}/${uid}-${safe}`;
}

export function createIntegrations(supabase) {
  return {
    Core: {
      /**
       * UploadFile({ file, fileName?, mimeType?, bucket?, context? })
       *
       * Faz upload no bucket apropriado (auto-detectado ou explícito) e
       * retorna { file_url } compatível com Base44.
       */
      async UploadFile({ file, fileName, mimeType, bucket: explicitBucket, context } = {}) {
        if (!file) throw new Error("UploadFile: parâmetro `file` obrigatório");

        // Pega empresa_id do JWT atual
        const { data: { user } } = await supabase.auth.getUser();
        const empresaId = user?.app_metadata?.empresa_id;
        if (!empresaId) {
          throw new Error("UploadFile: usuário sem empresa_id no JWT app_metadata");
        }

        const resolvedFileName = fileName || file.name || `upload-${Date.now()}`;
        const resolvedMime = mimeType || file.type || "application/octet-stream";
        const bucket = explicitBucket || inferBucket({
          fileName: resolvedFileName,
          mimeType: resolvedMime,
          context,
        });

        const path = buildPath(empresaId, resolvedFileName);

        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            contentType: resolvedMime,
            upsert: false,
          });

        if (error) throw error;

        // Pega URL pública (bucket é privado, então é URL assinada por 1 hora)
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 3600);

        if (signErr) throw signErr;

        return {
          file_url: signed.signedUrl,
          bucket,
          path,
          mime_type: resolvedMime,
        };
      },

      /**
       * SendEmail({ to, subject, body, attachments? })
       * Delega para Edge Function `send-email` (que vai usar Resend ou SES).
       */
      async SendEmail(payload) {
        const { data, error } = await supabase.functions.invoke("send-email", { body: payload });
        if (error) throw error;
        return data;
      },

      /**
       * InvokeLLM({ prompt, model?, ... })
       * Delega para Edge Function `invoke-llm` (que chama OpenAI/Gemini).
       */
      async InvokeLLM(payload) {
        const { data, error } = await supabase.functions.invoke("invoke-llm", { body: payload });
        if (error) throw error;
        return data;
      },

      /**
       * GenerateImage({ prompt, ... }) — futuro
       */
      async GenerateImage(payload) {
        const { data, error } = await supabase.functions.invoke("generate-image", { body: payload });
        if (error) throw error;
        return data;
      },

      /**
       * ExtractDataFromUploadedFile({ file_url, schema }) — OCR via Gemini/OpenAI
       */
      async ExtractDataFromUploadedFile(payload) {
        const { data, error } = await supabase.functions.invoke("extract-data-from-file", { body: payload });
        if (error) throw error;
        return data;
      },
    },
  };
}
