/**
 * habilitacao-lembretes — envia por WhatsApp os lembretes de vencimento que o banco enfileirou
 * (alertar_documentos_habilitacao, migração 0155). Chamada pelo pg_cron via pg_net, sem
 * credencial: a função NÃO recebe nada (ignora o corpo) e só esvazia a fila, uma vez por mensagem.
 * Chamar de fora não envia nada além do que o banco já decidiu. A resposta só traz contagens.
 * Deploy: --no-verify-jwt.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  CanalNaoConfiguradoError,
  enviarWhatsAppTexto,
  normalizarTelefoneBR,
} from "../_shared/whatsapp-envio.ts";
import {
  esvaziarFila,
  MAX_TENTATIVAS,
  VALIDADE_DA_FILA_HORAS,
  type ItemFila,
} from "../_shared/habilitacao/lembretes-nucleo.ts";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const admin = createAdminClient();
    const desde = new Date(Date.now() - VALIDADE_DA_FILA_HORAS * 3_600_000).toISOString();
    const r = await esvaziarFila({
      pendentes: async (limite) => {
        const { data, error } = await admin
          .from("habilitacao_lembrete_fila")
          .select("id, telefone, texto, tentativas")
          .is("enviado_em", null)
          .lt("tentativas", MAX_TENTATIVAS)
          .gt("criado_em", desde)
          .order("criado_em", { ascending: true })
          .limit(limite);
        if (error) throw new Error(error.message);
        return (data ?? []) as ItemFila[];
      },
      reivindicar: async (item) => {
        const { data, error } = await admin
          .from("habilitacao_lembrete_fila")
          .update({ tentativas: item.tentativas + 1 })
          .eq("id", item.id)
          .eq("tentativas", item.tentativas)
          .is("enviado_em", null)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        return !!data;
      },
      normalizar: normalizarTelefoneBR,
      enviar: (numero, texto) => enviarWhatsAppTexto(numero, texto),
      marcarEnviado: async (id) => {
        await admin
          .from("habilitacao_lembrete_fila")
          .update({ enviado_em: new Date().toISOString(), erro: null })
          .eq("id", id);
      },
      marcarErro: async (id, erro) => {
        await admin.from("habilitacao_lembrete_fila").update({ erro }).eq("id", id);
      },
      canalForaDoAr: (e) => e instanceof CanalNaoConfiguradoError,
    });
    return json(200, { success: true, ...r });
  } catch (e) {
    console.error("[habilitacao-lembretes]", (e as Error)?.message ?? String(e));
    return json(500, { success: false, error: "Erro interno" });
  }
});
