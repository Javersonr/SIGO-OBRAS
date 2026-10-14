/**
 * habilitacao-lembretes — envia por WhatsApp os lembretes de vencimento que o banco enfileirou
 * (alertar_documentos_habilitacao, migração 0155). Acionada pelo pg_cron via pg_net, sem
 * credencial, pelo alerta diário e pelo job de reenvio (a cada 30 minutos, enquanto houver mensagem
 * pendente). A função NÃO recebe nada (ignora o corpo) e só esvazia a fila: chamar de fora não envia
 * nada além do que o banco já decidiu. A resposta só traz contagens.
 * Cada mensagem sai uma vez: quem vai enviar reserva o item (reivindicado_em) por 10 minutos, e
 * outra execução que chegue nesse meio-tempo não o pega. A reserva é solta quando o envio termina
 * (com sucesso ou com erro); se a execução morrer no meio, ela vence sozinha.
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
  RESERVA_MINUTOS,
  VALIDADE_DA_FILA_HORAS,
  type ItemFila,
} from "../_shared/habilitacao/lembretes-nucleo.ts";

const FILA = "habilitacao_lembrete_fila";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const haMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

/** Filtro do PostgREST: item sem reserva, ou com a reserva vencida (quem reservou morreu no meio). */
const semReservaViva = () =>
  `reivindicado_em.is.null,reivindicado_em.lt."${haMinutos(RESERVA_MINUTOS)}"`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const admin = createAdminClient();
    const r = await esvaziarFila({
      pendentes: async (limite) => {
        const { data, error } = await admin
          .from(FILA)
          .select("id, telefone, texto, tentativas")
          .is("enviado_em", null)
          .lt("tentativas", MAX_TENTATIVAS)
          .gt("criado_em", haMinutos(VALIDADE_DA_FILA_HORAS * 60))
          .or(semReservaViva())
          .order("criado_em", { ascending: true })
          .limit(limite);
        if (error) throw new Error(error.message);
        return (data ?? []) as ItemFila[];
      },
      // As condições vão no próprio UPDATE: de duas execuções que leram o mesmo item, só uma o altera
      // (a outra não encontra mais tentativas = <lido> nem o item sem reserva) e recebe a lista vazia.
      reivindicar: async (item) => {
        const { data, error } = await admin
          .from(FILA)
          .update({ tentativas: item.tentativas + 1, reivindicado_em: new Date().toISOString() })
          .eq("id", item.id)
          .eq("tentativas", item.tentativas)
          .is("enviado_em", null)
          .or(semReservaViva())
          .select("id");
        if (error) throw new Error(error.message);
        return (data ?? []).length === 1;
      },
      normalizar: normalizarTelefoneBR,
      enviar: (numero, texto) => enviarWhatsAppTexto(numero, texto),
      // O supabase-js não lança: sem conferir `error`, a gravação que falha passaria por sucesso.
      marcarEnviado: async (id) => {
        const { error } = await admin
          .from(FILA)
          .update({ enviado_em: new Date().toISOString(), erro: null, reivindicado_em: null })
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      marcarErro: async (id, erro, definitivo) => {
        const { error } = await admin
          .from(FILA)
          .update(
            definitivo
              ? { erro, reivindicado_em: null, tentativas: MAX_TENTATIVAS }
              : { erro, reivindicado_em: null }
          )
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      canalForaDoAr: (e) => e instanceof CanalNaoConfiguradoError,
    });
    return json(200, { success: true, ...r });
  } catch (e) {
    console.error("[habilitacao-lembretes]", (e as Error)?.message ?? String(e));
    return json(500, { success: false, error: "Erro interno" });
  }
});
