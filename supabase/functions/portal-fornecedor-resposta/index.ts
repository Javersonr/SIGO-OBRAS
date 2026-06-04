/**
 * portal-fornecedor-resposta — registra a resposta do fornecedor a uma cotação.
 *
 * Porte da função legada Base44 `salvarRespostaFornecedor` para o Supabase
 * (service role). Credential = `token` único da participação (cotacao_fornecedor).
 *
 * Ações (body.action):
 *   - "impossivel"     { motivo_recusa }
 *   - "upload_arquivo" { arquivo: { nome_arquivo, url_arquivo, tamanho, tipo } }
 *   - "responder"      { respostas: {[item_id]: {valor_unitario, prazo_entrega, observacoes}},
 *                        responsavel, itens: [{id, descricao, quantidade, unidade}] }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const { token, action } = body;
  if (!token) return fail("Token obrigatório", 400);

  const supabase = createAdminClient();

  const { data: cf } = await supabase
    .from("cotacao_fornecedor")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!cf) return fail("Cotação não encontrada", 404);

  const cotacaoId = cf.cotacao_id;
  const empresaId = cf.empresa_id;

  // --- Ação: Impossível Responder ---------------------------------------
  if (action === "impossivel") {
    await supabase
      .from("cotacao_fornecedor")
      .update({
        status: "Impossível Responder",
        motivo_recusa: body.motivo_recusa || "",
        data_resposta: new Date().toISOString(),
      })
      .eq("id", cf.id);
    return ok({});
  }

  // --- Ação: Upload de arquivo ------------------------------------------
  if (action === "upload_arquivo") {
    const a = body.arquivo || {};
    if (!a.nome_arquivo || !a.url_arquivo) {
      return fail("Arquivo incompleto", 400);
    }
    const { data: novo, error } = await supabase
      .from("arquivo_cotacao_fornecedor")
      .insert({
        empresa_id: empresaId,
        cotacao_id: cotacaoId,
        cotacao_fornecedor_id: cf.id,
        fornecedor_id: cf.fornecedor_id,
        fornecedor_nome: cf.fornecedor_nome,
        nome_arquivo: a.nome_arquivo,
        url_arquivo: a.url_arquivo,
        tamanho: a.tamanho ?? null,
        tipo: a.tipo ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error("[portal-fornecedor-resposta] upload erro:", error.message);
      return fail("Erro ao salvar arquivo", 500);
    }
    return ok({ arquivo: novo });
  }

  // --- Ação: Responder cotação ------------------------------------------
  if (action === "responder") {
    const { respostas, itens } = body;
    if (!respostas || !itens) return fail("Dados incompletos", 400);

    for (const item of itens) {
      const resp = respostas[item.id];
      if (!resp || !resp.valor_unitario) continue;

      const valorUnit = parseFloat(resp.valor_unitario);
      const respostaData = {
        empresa_id: empresaId,
        cotacao_id: cotacaoId,
        cotacao_fornecedor_id: cf.id,
        fornecedor_id: cf.fornecedor_id,
        item_id: item.id,
        item_descricao: item.descricao,
        valor_unitario: valorUnit,
        valor_total: valorUnit * Number(item.quantidade || 0),
        prazo_entrega_dias: parseInt(resp.prazo_entrega) || null,
        observacoes: resp.observacoes || "",
      };

      const { data: existente } = await supabase
        .from("cotacao_resposta")
        .select("id")
        .eq("cotacao_id", cotacaoId)
        .eq("cotacao_fornecedor_id", cf.id)
        .eq("item_id", item.id)
        .maybeSingle();

      if (existente) {
        await supabase.from("cotacao_resposta").update(respostaData).eq("id", existente.id);
      } else {
        await supabase.from("cotacao_resposta").insert(respostaData);
      }
    }

    // Status da participação
    // deno-lint-ignore no-explicit-any
    const todosRespondidos = itens.every((i: any) => respostas[i.id]?.valor_unitario);
    const novoStatus = todosRespondidos ? "Respondida Totalmente" : "Respondida Parcialmente";
    await supabase
      .from("cotacao_fornecedor")
      .update({ status: novoStatus, data_resposta: new Date().toISOString() })
      .eq("id", cf.id);

    // Se todos os fornecedores já responderam → cotação "Respostas Recebidas"
    const { data: todos } = await supabase
      .from("cotacao_fornecedor")
      .select("id, status")
      .eq("cotacao_id", cotacaoId)
      .is("deleted_at", null);

    const finais = ["Respondida Totalmente", "Respondida Parcialmente", "Impossível Responder"];
    // deno-lint-ignore no-explicit-any
    const todosResponderam = (todos ?? []).every((c: any) =>
      c.id === cf.id ? true : finais.includes(c.status)
    );
    if (todosResponderam) {
      await supabase.from("cotacao").update({ status: "Respostas Recebidas" }).eq("id", cotacaoId);
    }

    return ok({});
  }

  return fail("Ação não reconhecida", 400);
});
