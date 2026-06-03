/**
 * licitacoes-triagem — fila de triagem das licitações encontradas + fluxo
 * operador → validador. Usada pela aba "Licitações" dentro de Oportunidades.
 *
 * Service role (--no-verify-jwt): a tela passa empresa_id + identidade do
 * usuário logado (email/nome/perfil), igual ao resto das functions do SIGO
 * (config-licitacao, vincular-pasta-oportunidade). O bloqueio de
 * auto-validação compara operador_email × validador_email.
 *
 * Ações (campo "action"):
 *   listar            { empresa_id, status?, q?, limite? }
 *   marcar_participar { empresa_id, id, operador_email, operador_nome }
 *   em_analise        { empresa_id, id, operador_email, operador_nome }
 *   descartar         { empresa_id, id, operador_email, operador_nome, justificativa? }
 *   validar           { empresa_id, id, perfil, validador_email, validador_nome,
 *                       decisao: "aprovar"|"recusar", justificativa? }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { parseKeywords, matchKeywords } from "../_shared/keywords.ts";

const PERFIS_VALIDADOR = ["Admin", "Admin Holding", "Gestor"];
const ORIGEM_LICITACAO = "Licitação (Alerta Licitação)";
const STATUS_LIST = [
  "Nova",
  "Em análise",
  "Aguardando validação",
  "Convertida",
  "Recusada",
  "Descartada",
];

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
    // "de hoje pra frente": nas abas de inbox, esconde as com abertura já passada
    // (mantém as sem data). Abas terminais (Convertida/Recusada/Descartada) mostram tudo.
    const hojeLista = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const INBOX = ["Nova", "Em análise", "Aguardando validação"];
    if (!status || INBOX.includes(status)) {
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
  // EXCLUIR EM LOTE — soft-delete dos ids informados (some da lista).
  // Não exclui as já Convertidas (são oportunidades reais no pipeline).
  // -------------------------------------------------------------------------
  if (action === "excluir_lote") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (ids.length === 0) return fail("Nenhum id informado", 400);
    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({ deleted_at: new Date().toISOString() })
      .eq("empresa_id", empresa_id)
      .in("id", ids)
      .neq("status", "Convertida")
      .is("deleted_at", null)
      .select("id");
    if (error) return fail("Erro ao excluir: " + error.message, 500);
    return ok({ excluidas: (data || []).length });
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
  // MARCAR PARTICIPAR — operador manda pra fila do validador
  // -------------------------------------------------------------------------
  if (action === "marcar_participar") {
    if (!["Nova", "Em análise"].includes(lic.status)) {
      return fail(`Licitação já está em "${lic.status}".`, 409);
    }
    const operador_email = body.operador_email ? String(body.operador_email) : null;
    if (!operador_email) return fail("operador_email é obrigatório", 400);

    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({
        status: "Aguardando validação",
        operador_email,
        operador_nome: body.operador_nome ?? null,
        marcado_participar_em: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return fail("Erro ao marcar: " + error.message, 500);

    // avisa os validadores no sino
    try {
      await supabase.rpc("notificar_gestores", {
        p_empresa_id: empresa_id,
        p_perfis: PERFIS_VALIDADOR,
        p_titulo: "Licitação aguardando validação",
        p_mensagem: `"${(lic.titulo || lic.objeto || "Licitação").slice(0, 80)}" foi marcada para participar e precisa da sua aprovação.`,
        p_link: "/Oportunidades",
        p_tipo: "Sistema",
        p_prioridade: "Alta",
        p_dedup_key: `lic-validar:${id}`,
      });
    } catch (_) {
      /* best-effort */
    }
    return ok({ licitacao: data });
  }

  // -------------------------------------------------------------------------
  // DESCARTAR — operador descarta (terminal)
  // -------------------------------------------------------------------------
  if (action === "descartar") {
    if (["Convertida"].includes(lic.status)) {
      return fail("Licitação já virou oportunidade; não dá para descartar.", 409);
    }
    const { data, error } = await supabase
      .from("licitacao_encontrada")
      .update({
        status: "Descartada",
        operador_email: body.operador_email ?? lic.operador_email ?? null,
        operador_nome: body.operador_nome ?? lic.operador_nome ?? null,
        justificativa: body.justificativa ? String(body.justificativa) : lic.justificativa,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return fail("Erro ao descartar: " + error.message, 500);
    return ok({ licitacao: data });
  }

  // -------------------------------------------------------------------------
  // VALIDAR — validador aprova (cria oportunidade) ou recusa
  // -------------------------------------------------------------------------
  if (action === "validar") {
    const perfil = body.perfil ? String(body.perfil) : "";
    const validador_email = body.validador_email ? String(body.validador_email) : "";
    const decisao = String(body.decisao || ""); // "aprovar" | "recusar"

    if (!PERFIS_VALIDADOR.includes(perfil)) {
      return fail(
        `Seu perfil ("${perfil || "—"}") não pode validar licitações. Apenas Admin, Admin Holding ou Gestor.`,
        403
      );
    }
    if (!validador_email) return fail("validador_email é obrigatório", 400);
    if (lic.status !== "Aguardando validação") {
      return fail(
        `Só dá para validar licitações em "Aguardando validação" (atual: "${lic.status}").`,
        409
      );
    }
    // bloqueio de auto-validação (quem marcou participar ≠ quem valida)
    if (lic.operador_email && lic.operador_email.toLowerCase() === validador_email.toLowerCase()) {
      return fail("Quem marcou para participar não pode validar a própria licitação.", 409);
    }

    const nowIso = new Date().toISOString();

    // ----- RECUSAR -----
    if (decisao === "recusar") {
      const { data, error } = await supabase
        .from("licitacao_encontrada")
        .update({
          status: "Recusada",
          decisao: "recusada",
          validador_email,
          validador_nome: body.validador_nome ?? null,
          validado_em: nowIso,
          justificativa: body.justificativa ? String(body.justificativa) : lic.justificativa,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) return fail("Erro ao recusar: " + error.message, 500);
      return ok({ licitacao: data, decisao: "recusada" });
    }

    // ----- APROVAR -> cria oportunidade -----
    if (decisao === "aprovar") {
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
          validador_email,
          validador_nome: body.validador_nome ?? null,
          validado_em: nowIso,
          oportunidade_id: op.id,
          justificativa: body.justificativa ? String(body.justificativa) : lic.justificativa,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) return fail("Erro ao converter: " + error.message, 500);

      // notifica que virou oportunidade (e o agente do Drive cria a pasta depois)
      try {
        await supabase.rpc("notificar_gestores", {
          p_empresa_id: empresa_id,
          p_perfis: PERFIS_VALIDADOR,
          p_titulo: "Licitação aprovada → virou oportunidade",
          p_mensagem: `"${(lic.titulo || lic.objeto || "Licitação").slice(0, 80)}" foi aprovada e entrou no pipeline.`,
          p_link: "/Oportunidades",
          p_tipo: "Sistema",
          p_prioridade: "Normal",
          p_dedup_key: `lic-aprovada:${id}`,
        });
      } catch (_) {
        /* best-effort */
      }

      return ok({ licitacao: data, decisao: "aprovada", oportunidade_id: op.id });
    }

    return fail('decisao deve ser "aprovar" ou "recusar"', 400);
  }

  return fail("Ação desconhecida: " + action, 400);
});
