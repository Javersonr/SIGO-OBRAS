/**
 * portal-fornecedor-resposta — registra a resposta do fornecedor a uma cotação.
 *
 * Porte da função legada Base44 `salvarRespostaFornecedor` para o Supabase
 * (service role). Credential = `token` único da participação (cotacao_fornecedor);
 * formato/validação em _shared/cotacao-portal.ts.
 *
 * Toda ação exige cotação viva, não encerrada (Aprovada/Cancelada) e dentro do
 * prazo (data_limite, dia inteiro de Brasília) — senão 409 COTACAO_ENCERRADA.
 *
 * Ações (body.action):
 *   - "impossivel"     { motivo_recusa }
 *   - "upload_arquivo" { arquivo: { nome_arquivo, url_arquivo, tamanho, tipo } }
 *                      url_arquivo = ref "bucket/caminho" (nunca a URL assinada, que expira)
 *   - "responder"      { respostas: {[item_id]: {valor_unitario, prazo_entrega, observacoes}} }
 *                      Itens, descrição e quantidade vêm de cotacao_item (o body
 *                      `itens` do front antigo é ignorado): valor_total = unitário
 *                      × quantidade real; item de outra cotação não é gravado.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { refDaEmpresa } from "../_shared/storage-assinar.ts";
import {
  motivoCotacaoFechada,
  participacaoPorToken,
  validarRespostas,
} from "../_shared/cotacao-portal.ts";

const MAX_MOTIVO = 2000;

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

    const { token, action } = body ?? {};
    const supabase = createAdminClient();

    const achou = await participacaoPorToken(
      supabase,
      token,
      "id, cotacao_id, empresa_id, fornecedor_id, fornecedor_nome"
    );
    if ("erro" in achou) {
      return fail(achou.erro, achou.status, achou.codigo ? { codigo: achou.codigo } : undefined);
    }
    const cf = achou.cf;
    const cotacaoId = cf.cotacao_id;
    const empresaId = cf.empresa_id;

    const { data: cotacao } = await supabase
      .from("cotacao")
      .select("id, status, data_limite")
      .eq("id", cotacaoId)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!cotacao) return fail("Cotação não encontrada", 404);

    const bloqueio = motivoCotacaoFechada(cotacao);
    if (bloqueio) return fail(bloqueio, 409, { codigo: "COTACAO_ENCERRADA" });

    // --- Ação: Impossível Responder ---------------------------------------
    if (action === "impossivel") {
      const motivo = typeof body.motivo_recusa === "string" ? body.motivo_recusa : "";
      await supabase
        .from("cotacao_fornecedor")
        .update({
          status: "Impossível Responder",
          motivo_recusa: motivo.slice(0, MAX_MOTIVO),
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
      // Só ref na pasta da empresa da cotação: o fornecedor não pode apontar
      // para arquivo de outra empresa (quem exibir vai assinar com service role).
      const ref = refDaEmpresa(a.url_arquivo, empresaId);
      if (!ref) return fail("Arquivo inválido", 400);
      const { data: novo, error } = await supabase
        .from("arquivo_cotacao_fornecedor")
        .insert({
          empresa_id: empresaId,
          cotacao_id: cotacaoId,
          cotacao_fornecedor_id: cf.id,
          fornecedor_id: cf.fornecedor_id,
          fornecedor_nome: cf.fornecedor_nome,
          nome_arquivo: a.nome_arquivo,
          url_arquivo: ref,
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
      const [itensRes, existentesRes] = await Promise.all([
        supabase
          .from("cotacao_item")
          .select("id, descricao, quantidade")
          .eq("cotacao_id", cotacaoId)
          .is("deleted_at", null),
        supabase
          .from("cotacao_resposta")
          .select("id, item_id")
          .eq("cotacao_fornecedor_id", cf.id)
          .is("deleted_at", null),
      ]);
      if (itensRes.error || existentesRes.error) {
        console.error(
          "[portal-fornecedor-resposta] leitura:",
          itensRes.error?.message ?? existentesRes.error?.message
        );
        return fail("Erro ao salvar resposta", 500);
      }
      const itens = itensRes.data ?? [];

      const v = validarRespostas(body.respostas, itens);
      if (!v.ok) return fail(v.erro, 400);
      if (v.linhas.length === 0) return fail("Preencha pelo menos um item", 400);
      if (v.ignorados > 0) {
        console.warn(
          `[portal-fornecedor-resposta] ${v.ignorados} chave(s) fora da cotação ignorada(s) (cf ${cf.id})`
        );
      }

      const existentePorItem = new Map<string, string>();
      for (const r of existentesRes.data ?? []) {
        if (!existentePorItem.has(r.item_id)) existentePorItem.set(r.item_id, r.id);
      }

      for (const linha of v.linhas) {
        const respostaData = {
          empresa_id: empresaId,
          cotacao_id: cotacaoId,
          cotacao_fornecedor_id: cf.id,
          fornecedor_id: cf.fornecedor_id,
          ...linha,
        };
        const idExistente = existentePorItem.get(linha.item_id);
        const { error } = idExistente
          ? await supabase.from("cotacao_resposta").update(respostaData).eq("id", idExistente)
          : await supabase.from("cotacao_resposta").insert(respostaData);
        if (error) {
          console.error("[portal-fornecedor-resposta] gravar item:", error.message);
          return fail("Erro ao salvar resposta", 500);
        }
      }

      // Status da participação: todos os itens da cotação com preço (agora ou antes)
      const respondidos = new Set([...existentePorItem.keys(), ...v.linhas.map((l) => l.item_id)]);
      const todosRespondidos = itens.every((i: { id: string }) => respondidos.has(i.id));
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
        // não rebaixa uma cotação que a empresa encerrou nesse meio-tempo
        await supabase
          .from("cotacao")
          .update({ status: "Respostas Recebidas" })
          .eq("id", cotacaoId)
          .in("status", ["Aberta", "Enviada aos Fornecedores", "Aguardando Respostas"]);
      }

      return ok({});
    }

    return fail("Ação não reconhecida", 400);
  })
);
