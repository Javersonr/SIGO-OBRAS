import React, { useEffect, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReceiptText, MessageCircle, Copy, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { dispararWhatsApp } from "@/lib/whatsapp";
import { urlPublica } from "@/lib/url-publica";
import { baixarReciboQuitado, urlReciboQuitado } from "@/lib/recibo-quitado";

const fmtMoeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

const STATUS = {
  pendente: ["Aguardando quitação", "bg-amber-100 text-amber-700 border-amber-200"],
  confirmada: ["Quitação confirmada", "bg-emerald-100 text-emerald-700 border-emerald-200"],
  contestada: ["CONTESTADA", "bg-red-100 text-red-700 border-red-200"],
};

/**
 * Recibo de pagamento com quitação eletrônica do fornecedor — aparece no
 * detalhe da despesa PAGA. Emite (conteúdo congelado + código), envia o link
 * pelo WhatsApp oficial e mostra o status da quitação. Quitado → o PDF do
 * recibo quitado (gerado pelo servidor e anexado à despesa) fica para baixar.
 */
export default function ReciboQuitacaoCard({ despesa, onAnexosAlterados }) {
  const [recibo, setRecibo] = useState(undefined); // undefined = carregando
  const [ocupado, setOcupado] = useState(false);
  const pdfPedido = useRef(null);

  const pago = ["pago", "realizado"].includes(String(despesa?.status || "").toLowerCase());

  useEffect(() => {
    let vivo = true;
    setRecibo(undefined);
    if (!despesa?.id || !pago) return undefined;
    sigo.entities.ReciboPagamento.filter({ transacao_id: despesa.id })
      .then((rs) => vivo && setRecibo(rs[0] || null))
      .catch(() => vivo && setRecibo(null));
    return () => {
      vivo = false;
    };
  }, [despesa?.id, pago]);

  // Quitado antes de existir o PDF automático (ou se a geração falhou na
  // confirmação): gera agora e anexa — uma vez por recibo.
  useEffect(() => {
    if (recibo?.status !== "confirmada" || recibo.pdf_ref || pdfPedido.current === recibo.id)
      return;
    pdfPedido.current = recibo.id;
    // ocupado: não deixa clicar "Baixar"/"Emitir" enquanto o servidor gera
    setOcupado(true);
    urlReciboQuitado(despesa.id)
      .then((url) => {
        if (!url) return;
        setRecibo((r) => (r?.id === recibo.id ? { ...r, pdf_ref: r.pdf_ref || "gerado" } : r));
        onAnexosAlterados?.();
      })
      .catch(() => {})
      .finally(() => setOcupado(false));
  }, [recibo, despesa?.id, onAnexosAlterados]);

  if (!pago || recibo === undefined) return null;

  const baixarPdf = async () => {
    setOcupado(true);
    try {
      if (!(await baixarReciboQuitado(despesa.id))) toast.error("Recibo ainda não quitado");
      else onAnexosAlterados?.();
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setOcupado(false);
    }
  };

  const textoWhatsApp = (r, url) =>
    `🧾 Recibo de pagamento — ${r.dados?.empresa?.nome || ""}\n` +
    `${fmtMoeda(r.dados?.pagamento?.valor)} em ${fmtData(r.dados?.pagamento?.data_pagamento)}` +
    ` · referente a: ${r.dados?.pagamento?.descricao || ""}\n\n` +
    `Confira e dê quitação neste link:\n${url}\n\nCódigo: ${r.codigo}`;

  const emitirEEnviar = async (porWhatsApp) => {
    setOcupado(true);
    try {
      const { data } = await sigo.functions.invoke("reciboFornecedor", {
        acao: "emitir",
        transacao_id: despesa.id,
      });
      if (data?.success === false) throw new Error(data.error);
      const r = data.recibo;
      setRecibo(r);
      const url = urlPublica(data.url_path);
      const texto = textoWhatsApp(r, url);
      await navigator.clipboard.writeText(texto).catch(() => {});
      if (porWhatsApp) {
        // telefone do cadastro do fornecedor (a emissão devolve; reemissão não)
        let tel = data.telefone_fornecedor;
        if (!tel && despesa.fornecedor_id) {
          const f = await sigo.entities.Fornecedor.get(despesa.fornecedor_id).catch(() => null);
          tel = f?.telefone;
        }
        if (!tel) {
          toast.info("Fornecedor sem telefone no cadastro — mensagem copiada para você enviar");
          return;
        }
        // "wa.me"/"invalido": o próprio dispararWhatsApp já avisou o motivo
        const via = await dispararWhatsApp(tel, texto);
        if (via === "evolution") toast.success("📲 Recibo enviado pelo WhatsApp");
      } else {
        toast.success("Mensagem com o link copiada");
      }
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setOcupado(false);
    }
  };

  const [rotulo, classe] = STATUS[recibo?.status] || [];

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <ReceiptText className="w-4 h-4 text-slate-500" /> Recibo com quitação do fornecedor
        </p>
        {recibo && (
          <Badge variant="outline" className={classe}>
            {rotulo}
            {recibo.status === "confirmada" && recibo.confirmada_em
              ? ` · ${new Date(recibo.confirmada_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
              : ""}
          </Badge>
        )}
      </div>

      {recibo?.status === "contestada" && (
        <p className="text-sm text-red-700">Motivo do fornecedor: “{recibo.contestacao}”</p>
      )}
      {recibo && (
        <p className="text-xs text-slate-500">
          Código <span className="font-mono">{recibo.codigo}</span>
          {recibo.evidencia?.ip ? ` · confirmado do IP ${recibo.evidencia.ip}` : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {recibo?.status === "confirmada" ? (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={ocupado}
            onClick={baixarPdf}
          >
            {ocupado ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1" />
            )}
            Baixar recibo quitado (PDF)
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={ocupado}
            onClick={() => emitirEEnviar(true)}
          >
            {ocupado ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 mr-1" />
            )}
            {recibo ? "Reenviar por WhatsApp" : "Emitir e enviar por WhatsApp"}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => emitirEEnviar(false)}>
          <Copy className="w-4 h-4 mr-1" /> Copiar link
        </Button>
      </div>
      {!recibo && (
        <p className="text-[11px] text-slate-500">
          O fornecedor toca em “Confirmo o recebimento (dou quitação)” e ficam registrados
          data/hora, IP e aparelho (Lei 14.063/2020).
        </p>
      )}
    </div>
  );
}
