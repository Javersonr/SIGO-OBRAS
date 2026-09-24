/**
 * recibo-fornecedor — recibo de pagamento com QUITAÇÃO eletrônica do fornecedor.
 *
 * Ações:
 *   { acao:"emitir", transacao_id }  [STAFF]
 *     → congela os dados do pagamento, gera código + hash e devolve o link
 *       público (token HMAC de 30 dias). Reemitir devolve o MESMO recibo com
 *       token novo — o conteúdo congelado nunca muda.
 *   { acao:"dados", token }          [público]  → recibo para a página pública
 *   { acao:"confirmar", token }      [público]  → quitação (Lei 14.063/2020):
 *       grava quando, IP e aparelho em `evidencia`. Idempotente.
 *   { acao:"contestar", token, motivo } [público] → status contestada
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken, verifyPortalToken } from "../_shared/portal-token.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import {
  origemDaRequisicao,
  gerarCodigoCertificado,
  sha256Hex,
} from "../_shared/portal-funcionario.ts";

const TTL_LINK = 60 * 60 * 24 * 30; // 30 dias

interface Body {
  acao?: string;
  transacao_id?: string;
  token?: string;
  motivo?: string;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const supabase = createAdminClient();

    const linkDoRecibo = async (reciboId: string, empresaId: string) => {
      const token = await signPortalToken(
        { scope: "recibo_fornecedor", empresa_id: empresaId, recibo_id: reciboId },
        TTL_LINK
      );
      return `/ReciboPagamento?token=${encodeURIComponent(token)}`;
    };

    // ---------------------------------------------------------------- emitir
    if (body.acao === "emitir") {
      const staff = await usuarioDaRequisicao(req);
      if (!staff) return fail("Sessão inválida", 401);
      if (!body.transacao_id) return fail("transacao_id é obrigatório", 400);

      const { data: tx } = await supabase
        .from("transacao_financeira")
        .select("*")
        .eq("id", body.transacao_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!tx) return fail("Despesa não encontrada", 404);
      if (!staff.is_super_admin && tx.empresa_id !== staff.empresa_id) {
        return fail("Despesa de outra empresa", 403);
      }
      const statusPago = ["pago", "realizado"].includes(String(tx.status || "").toLowerCase());
      if (!statusPago) return fail("Registre o pagamento antes de emitir o recibo", 409);

      // já existe? devolve o mesmo (conteúdo congelado não muda)
      const { data: existente } = await supabase
        .from("recibo_pagamento")
        .select("id, codigo, status, dados, confirmada_em")
        .eq("transacao_id", tx.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existente) {
        return ok({
          recibo: existente,
          url_path: await linkDoRecibo(existente.id, tx.empresa_id),
          reemitido: true,
        });
      }

      const [{ data: emp }, { data: forn }] = await Promise.all([
        supabase
          .from("empresa")
          .select("nome, razao_social, cnpj")
          .eq("id", tx.empresa_id)
          .maybeSingle(),
        tx.fornecedor_id
          ? supabase
              .from("fornecedor")
              .select("id, nome_razao, cnpj, telefone")
              .eq("id", tx.fornecedor_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const dados = {
        empresa: { nome: emp?.razao_social || emp?.nome || "", cnpj: emp?.cnpj ?? null },
        fornecedor: {
          nome: forn?.nome_razao || tx.fornecedor_nome || "",
          cnpj: forn?.cnpj ?? null,
        },
        pagamento: {
          descricao: tx.descricao,
          valor: tx.valor,
          data_pagamento: tx.data_pagamento,
          forma_pagamento: tx.forma_pagamento ?? null,
          numero_documento: tx.numero_documento ?? null,
          projeto: tx.projeto_nome ?? null,
        },
        emitido_em: new Date().toISOString(),
        emitido_por: staff.email,
      };

      for (let i = 0; i < 3; i++) {
        const codigo = gerarCodigoCertificado();
        const hash = await sha256Hex(JSON.stringify({ codigo, dados }));
        const { data: novo, error } = await supabase
          .from("recibo_pagamento")
          .insert({
            empresa_id: tx.empresa_id,
            transacao_id: tx.id,
            fornecedor_id: tx.fornecedor_id ?? null,
            codigo,
            hash_sha256: hash,
            dados,
            criado_por: staff.email,
          })
          .select("id, codigo, status, dados, confirmada_em")
          .single();
        if (!error) {
          return ok({
            recibo: novo,
            url_path: await linkDoRecibo(novo.id, tx.empresa_id),
            telefone_fornecedor: forn?.telefone ?? null,
          });
        }
        if (error.code !== "23505") {
          console.error("[recibo-fornecedor] emitir:", error);
          return fail("Erro ao emitir recibo", 500);
        }
        // colisão de código (sorteia outro) ou corrida na transacao_id
        const { data: corrida } = await supabase
          .from("recibo_pagamento")
          .select("id, codigo, status, dados, confirmada_em")
          .eq("transacao_id", tx.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (corrida) {
          return ok({
            recibo: corrida,
            url_path: await linkDoRecibo(corrida.id, tx.empresa_id),
            reemitido: true,
          });
        }
      }
      return fail("Erro ao gerar o código do recibo — tente de novo", 500);
    }

    // --------------------------------------------------------------- público
    const payload = body.token ? await verifyPortalToken(body.token) : null;
    if (!payload || payload.scope !== "recibo_fornecedor" || !payload.recibo_id) {
      return fail("Link inválido ou expirado — peça um novo à empresa", 401);
    }
    const { data: recibo } = await supabase
      .from("recibo_pagamento")
      .select("id, codigo, hash_sha256, dados, status, confirmada_em, contestacao")
      .eq("id", payload.recibo_id as string)
      .is("deleted_at", null)
      .maybeSingle();
    if (!recibo) return fail("Recibo não encontrado", 404);

    if (body.acao === "dados") {
      return ok({ recibo });
    }

    if (body.acao === "confirmar") {
      if (recibo.status === "confirmada") return ok({ recibo, message: "Quitação já registrada" });
      const evidencia = {
        metodo: "link_whatsapp_token",
        confirmado_em: new Date().toISOString(),
        ...origemDaRequisicao(req),
      };
      const { error } = await supabase
        .from("recibo_pagamento")
        .update({ status: "confirmada", confirmada_em: evidencia.confirmado_em, evidencia })
        .eq("id", recibo.id);
      if (error) return fail("Erro ao registrar a quitação", 500);
      return ok({
        recibo: { ...recibo, status: "confirmada", confirmada_em: evidencia.confirmado_em },
        message: "Quitação registrada",
      });
    }

    if (body.acao === "contestar") {
      const motivo = (body.motivo ?? "").trim();
      if (motivo.length < 3) return fail("Descreva o problema", 400);
      if (motivo.length > 2000) return fail("Texto longo demais", 400);
      if (recibo.status === "confirmada") {
        return fail("Este recibo já foi quitado — fale com a empresa", 409);
      }
      const evidencia = {
        metodo: "link_whatsapp_token",
        contestado_em: new Date().toISOString(),
        ...origemDaRequisicao(req),
      };
      const { error } = await supabase
        .from("recibo_pagamento")
        .update({ status: "contestada", contestacao: motivo, evidencia })
        .eq("id", recibo.id);
      if (error) return fail("Erro ao registrar a contestação", 500);
      return ok({ recibo: { ...recibo, status: "contestada", contestacao: motivo } });
    }

    return fail("Ação desconhecida", 400);
  })
);
