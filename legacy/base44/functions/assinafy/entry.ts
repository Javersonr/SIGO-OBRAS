import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ASSINAFY_API_KEY = Deno.env.get("ASSINAFY_API_KEY");
const ASSINAFY_ACCOUNT_ID = Deno.env.get("ASSINAFY_ACCOUNT_ID");
const BASE_URL = "https://api.assinafy.com.br/v1";

const headers = {
    "X-Api-Key": ASSINAFY_API_KEY,
    "Content-Type": "application/json",
};

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    // ─── Criar signatário ─────────────────────────────────────────────────────
    if (action === "criar_signatario") {
        const { full_name, email } = body;

        const res = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/signers`, {
            method: "POST",
            headers,
            body: JSON.stringify({ full_name, email }),
        });

        const data = await res.json();
        return Response.json(data);
    }

    // ─── Upload de documento (base64) ─────────────────────────────────────────
    if (action === "upload_documento") {
        const { file_base64, filename } = body;

        // Converter base64 para Blob
        const binaryStr = atob(file_base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/pdf" });

        const formData = new FormData();
        formData.append("file", blob, filename || "documento.pdf");

        const res = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents`, {
            method: "POST",
            headers: { "X-Api-Key": ASSINAFY_API_KEY },
            body: formData,
        });

        const data = await res.json();
        return Response.json(data);
    }

    // ─── Solicitar assinatura (assignment) ────────────────────────────────────
    if (action === "solicitar_assinatura") {
        const { document_id, signer_id, message } = body;

        const res = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${document_id}/assignments`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                signer_id,
                message: message || "Por favor, assine este documento.",
            }),
        });

        const data = await res.json();
        return Response.json(data);
    }

    // ─── Listar documentos ────────────────────────────────────────────────────
    if (action === "listar_documentos") {
        const { page = 1, per_page = 25 } = body;

        const res = await fetch(
            `${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents?page=${page}&per-page=${per_page}`,
            { headers }
        );

        const data = await res.json();
        return Response.json(data);
    }

    // ─── Buscar documento ─────────────────────────────────────────────────────
    if (action === "buscar_documento") {
        const { document_id } = body;

        const res = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${document_id}`, {
            headers,
        });

        const data = await res.json();
        return Response.json(data);
    }

    // ─── Reenviar convite de assinatura ──────────────────────────────────────
    if (action === "reenviar_convite") {
        const { document_id, assignment_id } = body;

        const res = await fetch(
            `${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${document_id}/assignments/${assignment_id}/resend`,
            { method: "POST", headers }
        );

        const data = await res.json();
        return Response.json(data);
    }

    // ─── Deletar documento ────────────────────────────────────────────────────
    if (action === "deletar_documento") {
        const { document_id } = body;

        const res = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${document_id}`, {
            method: "DELETE",
            headers,
        });

        const data = await res.json();
        return Response.json(data);
    }

    return Response.json({ error: "Ação inválida" }, { status: 400 });
});