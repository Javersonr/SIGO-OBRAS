/**
 * licitacoes-triagem — fila de triagem das licitações encontradas + fluxo
 * operador → validador. Usada pela aba "Licitações" dentro de Oportunidades.
 *
 * Service role (--no-verify-jwt): a tela passa empresa_id + identidade do
 * usuário logado (email/nome/perfil), igual ao resto das functions do SIGO
 * (config-licitacao, vincular-pasta-oportunidade). O bloqueio de
 * auto-validação compara operador_email × validador_email.
 *
 * Fluxo (4 status, sem validador): Nova → Em análise → Convertida · Excluída
 *
 * Ações (campo "action"):
 *   listar             { empresa_id, status?, q?, uf?, valor_min?, valor_max?, data_ini?, data_fim?, limite? }
 *   em_analise         { empresa_id, id, operador_email, operador_nome }
 *   virar_oportunidade { empresa_id, id, operador_email, operador_nome }   → cria Oportunidade
 *   excluir_lote       { empresa_id, ids[] }     → status Excluída (recuperável)
 *   restaurar_lote     { empresa_id, ids[] }     → volta pra Nova
 *   limpar_fora_do_filtro { empresa_id }         → soft-delete (some de vez)
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { parseKeywords, matchKeywords } from "../_shared/keywords.ts";

const PERFIS_GESTOR = ["Admin", "Admin Holding", "Gestor"];
const ORIGEM_LICITACAO = "Licitação (Alerta Licitação)";
const STATUS_LIST = ["Nova", "Em análise", "Convertida", "Excluída"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const action = String(body.action || "listar");
  const empresa_id = body.empresa_id ? String(body.empresa_id) : "";
  if (!empresa_id) return fail("empresa_id é obrigatório", 400);

  const supabase = createAdminClient();

  // -------------------------------------------------------------------------
  // LISTAR — lista filtrada + contagem por status (pros badges das abas)
  // -------------------------------------------------------------------------
  if (action === "listar") {
    const status = body.status ? String(body.status) : null;
    const q = body.q ? String(body.q).trim() : "";
    const limite = Math.min(Math.max(Number(body.limite) || 100, 1), 300);

    let query = supabase
      .from("licitacao_encontrada")
      .select(
        "id, id_licitacao, titulo, orgao, uf, municipio, objeto, valor, tipo, abertura, " +
          "abertura_datetime, link_externo, status, fonte, oportunidade_id, operador_email, " +
          "operador_nome, marcado_participar_em, validador_email, validador_nome, " +
          "validado_em, decisao, justificativa, created_at"
      )
      .eq("empresa_id", empresa_id)
      .is("deleted_at", null);

    if (status && STATUS_LIST.includes(status)) query = query.eq("status", status);
    if (q) {
      // busca em título/órgão/objeto/município
      query = query.or(
        `titulo.ilike.%${q}%,orgao.ilike.%${q}%,objeto.ilike.%${q}%,municipio.ilike.%${q}%`
      );
    }
    // filtros: estado (uf), valor (faixa), data de abertura (faixa)
    if (body.uf) query = query.eq("uf", String(body.uf).toUpperCase());
    if (body.valor_min !== undefined && body.valor_min !== null && body.valor_min !== "") {
      query = query.gte("valor", Number(body.valor_min));
    }
    if (body.valor_max !== undefined && body.valor_max !== null && body.valor_max !== "") {
      query = query.lte("valor", Number(body.valor_max));
    }
    if (body.data_ini) query = query.gte("abertura", String(body.data_ini));
    if (body.data_fim) query = query.lte("abertura", String(body.data_fim));

    // "de hoje pra frente": nas abas de inbox, esconde abertura já passada (mantém sem data),
    // a menos que o usuário tenha posto um filtro de data próprio. Abas terminais mostram tudo.
    const hojeLista = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const INBOX = ["Nova", "Em análise"];
    if ((!status || INBOX.includes(status)) && !body.data_ini) {
      query = query.or(`abertura.gte.${hojeLista},abertura.is.null`);
    }

    const { data, error } = await query
      .order("abertura", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) return fail("Erro ao listar: " + error.message, 500);

    // contagem por status (head counts — barato e independe do volume)
    const contagens: Record<string, number> = {};
    for (const s of STATUS_LIST) {
      const { count } = await supabase
        .from("licitacao_encontrada")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa_id)
        .is("deleted_at", null)
        .eq("status", s);
      contagens[s] = count || 0;
    }

    return ok({ licitacoes: data || [], contagens });
  }

  // -------------------------------------------------------------------------
  // EXCLUIR EM LOTE — manda pra aba "Excluídas" (status Excluída, recuperável).
  // Não exclui as já Convertidas (são oportunidades reais no pipeline).
  // -------------------------------------------------------------------------
  if (action === "excluir_lote") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (ids.length === 0) return fail("Nenhum id informado", 400);
    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({ status: "Excluída" })
      .eq("empresa_id", empresa_id)
      .in("id", ids)
      .neq("status", "Convertida")
      .is("deleted_at", null)
      .select("id");
    if (error) return fail("Erro ao excluir: " + error.message, 500);
    return ok({ excluidas: (data || []).length });
  }

  // -------------------------------------------------------------------------
  // RESTAURAR EM LOTE — volta as Excluídas pra "Nova" (limpa rastros do fluxo).
  // -------------------------------------------------------------------------
  if (action === "restaurar_lote") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (ids.length === 0) return fail("Nenhum id informado", 400);
    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({
        status: "Nova",
        operador_email: null,
        operador_nome: null,
        marcado_participar_em: null,
        validador_email: null,
        validador_nome: null,
        validado_em: null,
        decisao: null,
        justificativa: null,
      })
      .eq("empresa_id", empresa_id)
      .in("id", ids)
      .neq("status", "Convertida")
      .is("deleted_at", null)
      .select("id");
    if (error) return fail("Erro ao restaurar: " + error.message, 500);
    return ok({ restauradas: (data || []).length });
  }

  // -------------------------------------------------------------------------
  // LIMPAR FORA DO FILTRO — soft-delete das "Nova" que NÃO casam com as
  // palavras-chave atuais da config. Usado depois de refinar o filtro.
  // -------------------------------------------------------------------------
  if (action === "limpar_fora_do_filtro") {
    const { data: busca } = await supabase
      .from("licitacao_busca")
      .select("palavras_chave")
      .eq("empresa_id", empresa_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const palavras = (busca || [])[0]?.palavras_chave || "";
    const kw = parseKeywords(palavras);
    if (kw.includes.length === 0 && kw.excludes.length === 0) {
      return fail("Sem palavras-chave na config — nada a filtrar.", 400);
    }

    // pega só as Novas (id + textos + abertura) e decide quais NÃO casam
    const { data: novas, error: nErr } = await supabase
      .from("licitacao_encontrada")
      .select("id, titulo, objeto, orgao, abertura")
      .eq("empresa_id", empresa_id)
      .eq("status", "Nova")
      .is("deleted_at", null)
      .limit(5000);
    if (nErr) return fail("Erro lendo Novas: " + nErr.message, 500);

    // remove as que NÃO casam com as palavras-chave OU que já têm abertura no passado
    const hojeLimpa = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const fora = (novas || [])
      .filter(
        (l) =>
          !matchKeywords(`${l.titulo || ""} ${l.objeto || ""} ${l.orgao || ""}`, kw) ||
          (l.abertura && String(l.abertura) < hojeLimpa)
      )
      .map((l) => l.id);

    let removidas = 0;
    // remove em blocos de 200 ids
    for (let i = 0; i < fora.length; i += 200) {
      const bloco = fora.slice(i, i + 200);
      const { data, error } = await supabase
        .from("licitacao_encontrada")
        .update({ deleted_at: new Date().toISOString() })
        .eq("empresa_id", empresa_id)
        .in("id", bloco)
        .select("id");
      if (error) return fail("Erro ao limpar: " + error.message, 500);
      removidas += (data || []).length;
    }
    return ok({ removidas, mantidas: (novas || []).length - removidas });
  }

  // -------------------------------------------------------------------------
  // Helpers comuns das mutações (single)
  // -------------------------------------------------------------------------
  const id = body.id ? String(body.id) : "";
  if (!id) return fail("id é obrigatório", 400);

  const { data: lic, error: licErr } = await supabase
    .from("licitacao_encontrada")
    .select("*")
    .eq("id", id)
    .eq("empresa_id", empresa_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (licErr) return fail("Erro lendo licitação: " + licErr.message, 500);
  if (!lic) return fail("Licitação não encontrada", 404);

  // -------------------------------------------------------------------------
  // EM ANÁLISE — operador sinaliza que está estudando
  // -------------------------------------------------------------------------
  if (action === "em_analise") {
    if (!["Nova", "Em análise"].includes(lic.status)) {
      return fail(`Não dá para analisar uma licitação "${lic.status}".`, 409);
    }
    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({
        status: "Em análise",
        operador_email: body.operador_email ?? lic.operador_email ?? null,
        operador_nome: body.operador_nome ?? lic.operador_nome ?? null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return fail("Erro ao atualizar: " + error.message, 500);
    return ok({ licitacao: data });
  }

  // -------------------------------------------------------------------------
  // VIRAR OPORTUNIDADE — operador converte direto (sem validador): cria a
  // Oportunidade no pipeline e marca a licitação como Convertida.
  // -------------------------------------------------------------------------
  if (action === "virar_oportunidade") {
    if (lic.status === "Convertida") {
      return ok({ licitacao: lic, ja_convertida: true, oportunidade_id: lic.oportunidade_id });
    }

    // nome do status da oportunidade vem da config (fallback padrão)
    const { data: busca } = await supabase
      .from("licitacao_busca")
      .select("status_oportunidade_nome")
      .eq("empresa_id", empresa_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const statusOp = (busca || [])[0]?.status_oportunidade_nome || "Triagem Licitação";

    const { data: op, error: opErr } = await supabase
      .from("oportunidade")
      .insert({
        empresa_id,
        nome: String(lic.titulo || lic.objeto || "Licitação").slice(0, 200),
        valor_estimado: lic.valor != null ? Number(lic.valor) : null,
        descricao: lic.objeto ?? null,
        origem_nome: ORIGEM_LICITACAO,
        status_nome: statusOp,
        data_fechamento_prevista: lic.abertura ?? null,
        licitacao_modalidade: lic.tipo ?? null,
        licitacao_data: lic.abertura ?? null,
        observacoes: lic.link_externo ?? null,
      })
      .select("id")
      .single();
    if (opErr) return fail("Erro criando oportunidade: " + opErr.message, 500);

    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({
        status: "Convertida",
        decisao: "aprovada",
        operador_email: body.operador_email ?? lic.operador_email ?? null,
        operador_nome: body.operador_nome ?? lic.operador_nome ?? null,
        validado_em: new Date().toISOString(),
        oportunidade_id: op.id,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return fail("Erro ao converter: " + error.message, 500);

    // notifica gestores (e o agente do Drive/OneDrive cria a pasta depois)
    try {
      await supabase.rpc("notificar_gestores", {
        p_empresa_id: empresa_id,
        p_perfis: PERFIS_GESTOR,
        p_titulo: "Licitação virou oportunidade",
        p_mensagem: `"${(lic.titulo || lic.objeto || "Licitação").slice(0, 80)}" entrou no pipeline.`,
        p_link: "/Oportunidades",
        p_tipo: "Sistema",
        p_prioridade: "Normal",
        p_dedup_key: `lic-op:${id}`,
      });
    } catch (_) {
      /* best-effort */
    }

    return ok({ licitacao: data, oportunidade_id: op.id });
  }

  return fail("Ação desconhecida: " + action, 400);
});
