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
 *   { acao:"pdf", token }             [público]  → URL do PDF do recibo QUITADO
 *   { acao:"pdf_quitado", transacao_id } [STAFF] → idem, pelo detalhe da despesa
 *
 * Ao confirmar, o servidor gera o PDF do recibo quitado (dados + evidência),
 * salva no Storage e ANEXA à despesa (transacao_anexo) — ver _shared/recibo-pdf.ts.
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
import { BUCKET_RECIBOS, garantirPdfQuitado, type ReciboRow } from "../_shared/recibo-pdf.ts";

const TTL_LINK = 60 * 60 * 24 * 30; // 30 dias
const COLUNAS_RECIBO =
  "id, empresa_id, transacao_id, codigo, hash_sha256, dados, status, confirmada_em, evidencia, contestacao, pdf_ref";

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

    /** PDF quitado (gera/anexa se faltar) → URL assinada curta que já baixa. */
    const urlDoPdfQuitado = async (recibo: ReciboRow) => {
      const ref = await garantirPdfQuitado(supabase, recibo);
      const caminho = ref.slice(BUCKET_RECIBOS.length + 1);
      const { data, error } = await supabase.storage
        .from(BUCKET_RECIBOS)
        .createSignedUrl(caminho, 600, { download: `recibo-quitado-${recibo.codigo}.pdf` });
      if (error || !data?.signedUrl) throw new Error("Falha ao gerar o link do PDF");
      return { ref, url: data.signedUrl };
    };

    // ----------------------------------------------------------- pdf (staff)
    if (body.acao === "pdf_quitado") {
      const staff = await usuarioDaRequisicao(req);
      if (!staff) return fail("Sessão inválida", 401);
      if (!body.transacao_id) return fail("transacao_id é obrigatório", 400);
      const { data: rec } = await supabase
        .from("recibo_pagamento")
        .select(COLUNAS_RECIBO)
        .eq("transacao_id", body.transacao_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!rec || rec.status !== "confirmada") return fail("SEM_RECIBO_QUITADO", 404);
      if (!staff.is_super_admin && rec.empresa_id !== staff.empresa_id) {
        return fail("Recibo de outra empresa", 403);
      }
      try {
        return ok(await urlDoPdfQuitado(rec as ReciboRow));
      } catch (e) {
        console.error("[recibo-fornecedor] pdf_quitado:", (e as Error)?.message);
        return fail("Erro ao gerar o PDF do recibo quitado", 500);
      }
    }

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
        .eq("empresa_id", tx.empresa_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existente) {
        return ok({
          recibo: existente,
          url_path: await linkDoRecibo(existente.id, tx.empresa_id),
          reemitido: true,
        });
      }

      // Fornecedor SÓ da empresa da despesa: a RLS confere o empresa_id da
      // despesa, não o fornecedor_id — despesa apontando para fornecedor de
      // outra empresa não pode vazar nome/CNPJ/telefone dele (fica sem cadastro).
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
              .eq("empresa_id", tx.empresa_id)
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
            fornecedor_id: forn?.id ?? null, // só o fornecedor validado acima
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
          .eq("empresa_id", tx.empresa_id)
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
    if (
      !payload ||
      payload.scope !== "recibo_fornecedor" ||
      !payload.recibo_id ||
      !payload.empresa_id
    ) {
      return fail("Link inválido ou expirado — peça um novo à empresa", 401);
    }
    // escopo = recibo E empresa do token (assinado pelo servidor)
    const { data: reciboCompleto } = await supabase
      .from("recibo_pagamento")
      .select(COLUNAS_RECIBO)
      .eq("id", payload.recibo_id as string)
      .eq("empresa_id", payload.empresa_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!reciboCompleto) return fail("Recibo não encontrado", 404);
    // página pública: só o necessário (sem IP/aparelho/ids internos)
    const {
      empresa_id: _e,
      transacao_id: _t,
      evidencia: _ev,
      pdf_ref: _p,
      ...recibo
    } = reciboCompleto as ReciboRow & { contestacao: string | null };

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
      // .neq: duas confirmações simultâneas → só a primeira grava a evidência
      const { data: gravou, error } = await supabase
        .from("recibo_pagamento")
        .update({ status: "confirmada", confirmada_em: evidencia.confirmado_em, evidencia })
        .eq("id", recibo.id)
        .neq("status", "confirmada")
        .select("id");
      if (error) return fail("Erro ao registrar a quitação", 500);
      if (!gravou?.length) {
        const { data: atual } = await supabase
          .from("recibo_pagamento")
          .select("status, confirmada_em")
          .eq("id", recibo.id)
          .maybeSingle();
        return ok({ recibo: { ...recibo, ...atual }, message: "Quitação já registrada" });
      }
      // PDF do recibo quitado + anexo na despesa. Falhar aqui NÃO desfaz a
      // quitação (já registrada); o detalhe da despesa gera de novo se faltar.
      try {
        await garantirPdfQuitado(supabase, {
          ...(reciboCompleto as ReciboRow),
          status: "confirmada",
          confirmada_em: evidencia.confirmado_em,
          evidencia,
        });
      } catch (e) {
        console.error("[recibo-fornecedor] pdf ao confirmar:", (e as Error)?.message);
      }
      return ok({
        recibo: { ...recibo, status: "confirmada", confirmada_em: evidencia.confirmado_em },
        message: "Quitação registrada",
      });
    }

    if (body.acao === "pdf") {
      if (reciboCompleto.status !== "confirmada") return fail("Recibo ainda não quitado", 409);
      try {
        const { url } = await urlDoPdfQuitado(reciboCompleto as ReciboRow);
        return ok({ url });
      } catch (e) {
        console.error("[recibo-fornecedor] pdf:", (e as Error)?.message);
        return fail("Erro ao gerar o PDF — tente de novo", 500);
      }
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
      // .neq: se uma confirmação gravou no meio, a contestação não a apaga
      const { data: gravou, error } = await supabase
        .from("recibo_pagamento")
        .update({ status: "contestada", contestacao: motivo, evidencia })
        .eq("id", recibo.id)
        .neq("status", "confirmada")
        .select("id");
      if (error) return fail("Erro ao registrar a contestação", 500);
      if (!gravou?.length) return fail("Este recibo já foi quitado — fale com a empresa", 409);
      return ok({ recibo: { ...recibo, status: "contestada", contestacao: motivo } });
    }

    return fail("Ação desconhecida", 400);
  })
);
