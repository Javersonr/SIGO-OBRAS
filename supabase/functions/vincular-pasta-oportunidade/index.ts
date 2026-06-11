/**
 * vincular-pasta-oportunidade — ponte usada pelo Agente de Licitações (Cowork).
 *
 * O agente não tem a service key; chama esta função (anon key, --no-verify-jwt)
 * que faz a escrita no SIGO com service role.
 *
 * Ações (campo "action" no body):
 *   1. { action: "listar_pendentes", limite? } →
 *        devolve oportunidades de licitação SEM pasta do Drive vinculada,
 *        com os dados pra nomear a pasta (uf, município, órgão, data, valor).
 *   2. { action: "vincular", oportunidade_id, pasta_url, pasta_nome? } →
 *        grava o link da pasta em arquivo_oportunidade (aba Arquivos).
 *        Idempotente: não duplica o mesmo url.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";

const ORIGEM_LICITACAO = "Licitação (Alerta Licitação)";

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: {
      action?: string;
      limite?: number;
      oportunidade_id?: string;
      pasta_url?: string;
      pasta_nome?: string;
    };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const supabase = createAdminClient();
    const action = body.action || "listar_pendentes";

    // ---- AÇÃO 1: listar oportunidades de licitação sem pasta ----------------
    if (action === "listar_pendentes") {
      const limite = Math.min(Math.max(Number(body.limite) || 50, 1), 200);

      // Oportunidades de origem licitação, não arquivadas
      const { data: ops, error: opErr } = await supabase
        .from("oportunidade")
        .select(
          "id, empresa_id, nome, valor_estimado, licitacao_data, licitacao_modalidade, observacoes, status_nome, created_at"
        )
        .eq("origem_nome", ORIGEM_LICITACAO)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (opErr) return fail("Erro lendo oportunidades: " + opErr.message, 500);

      const ids = (ops || []).map((o) => o.id);
      if (ids.length === 0) return ok({ pendentes: [] });

      // Quais já têm pasta do Drive vinculada?
      const { data: arqs } = await supabase
        .from("arquivo_oportunidade")
        .select("oportunidade_id, url")
        .in("oportunidade_id", ids)
        .is("deleted_at", null);
      const comPasta = new Set(
        (arqs || [])
          .filter((a) => (a.url || "").includes("drive.google"))
          .map((a) => a.oportunidade_id)
      );

      // Cruza com licitacao_encontrada pra ter uf/município/órgão
      const { data: lics } = await supabase
        .from("licitacao_encontrada")
        .select("oportunidade_id, uf, municipio, orgao, id_licitacao, tipo, link_externo, abertura")
        .in("oportunidade_id", ids)
        .is("deleted_at", null);
      const licByOp = new Map((lics || []).map((l) => [l.oportunidade_id, l]));

      const pendentes = (ops || [])
        .filter((o) => !comPasta.has(o.id))
        .slice(0, limite)
        .map((o) => {
          const l = licByOp.get(o.id) || {};
          return {
            oportunidade_id: o.id,
            empresa_id: o.empresa_id,
            nome: o.nome,
            valor_estimado: o.valor_estimado,
            licitacao_data: o.licitacao_data,
            modalidade: o.licitacao_modalidade,
            uf: l.uf ?? null,
            municipio: l.municipio ?? null,
            orgao: l.orgao ?? null,
            id_licitacao: l.id_licitacao ?? null,
            link_externo: l.link_externo ?? null,
          };
        });

      return ok({ pendentes });
    }

    // ---- AÇÃO 2: vincular a pasta criada no Drive ---------------------------
    if (action === "vincular") {
      const { oportunidade_id, pasta_url } = body;
      const pasta_nome = body.pasta_nome || "Pasta da Licitação (Google Drive)";
      if (!oportunidade_id || !pasta_url) {
        return fail("oportunidade_id e pasta_url são obrigatórios", 400);
      }

      const { data: op, error: opErr } = await supabase
        .from("oportunidade")
        .select("id, empresa_id")
        .eq("id", oportunidade_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (opErr) return fail("Erro lendo oportunidade: " + opErr.message, 500);
      if (!op) return fail("Oportunidade não encontrada", 404);

      // Idempotência: já existe esse url vinculado?
      const { data: existente } = await supabase
        .from("arquivo_oportunidade")
        .select("id")
        .eq("oportunidade_id", oportunidade_id)
        .eq("url", pasta_url)
        .is("deleted_at", null)
        .maybeSingle();
      if (existente) {
        return ok({ ja_vinculado: true, arquivo_id: existente.id });
      }

      const { data: arq, error: arqErr } = await supabase
        .from("arquivo_oportunidade")
        .insert({
          empresa_id: op.empresa_id,
          oportunidade_id,
          nome: pasta_nome,
          url: pasta_url,
          tipo: "Link Google Drive",
          usuario_nome: "Agente de Licitações",
        })
        .select("id")
        .single();
      if (arqErr) return fail("Erro vinculando pasta: " + arqErr.message, 500);

      return ok({ vinculado: true, arquivo_id: arq.id });
    }

    return fail("Ação desconhecida: " + action, 400);
  })
);
