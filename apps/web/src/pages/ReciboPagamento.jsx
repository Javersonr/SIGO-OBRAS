import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ReceiptText, CheckCircle2, XCircle, ShieldCheck, Download } from "lucide-react";

const fmtMoeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtCnpj = (c) => {
  const d = (c || "").replace(/\D/g, "");
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return c || "";
};

/**
 * Página PÚBLICA do recibo de pagamento: o fornecedor abre pelo link do
 * WhatsApp e dá QUITAÇÃO (assinatura eletrônica simples, Lei 14.063/2020).
 */
export default function ReciboPagamento() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token"));
  const [recibo, setRecibo] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [contestando, setContestando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const chamar = async (acao, extra = {}) => {
    const { data } = await sigo.functions.invoke("reciboFornecedor", { acao, token, ...extra });
    if (data?.success === false) throw new Error(data.error || "Erro ao carregar o recibo");
    return data.recibo;
  };

  useEffect(() => {
    if (!token) {
      setErro("Link inválido — peça um novo à empresa.");
      return;
    }
    chamar("dados")
      .then(setRecibo)
      .catch((e) => setErro(e.message));
  }, [token]);

  const agir = async (acao, extra) => {
    setOcupado(true);
    setErro("");
    try {
      setRecibo(await chamar(acao, extra));
      setContestando(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  // PDF do recibo quitado (gerado no servidor) — cópia para o favorecido
  const baixarPdf = async () => {
    setOcupado(true);
    setErro("");
    try {
      const { data } = await sigo.functions.invoke("reciboFornecedor", { acao: "pdf", token });
      if (data?.success === false || !data?.url) throw new Error(data?.error || "Erro no PDF");
      window.location.href = data.url; // URL com ?download= → baixa sem sair da página
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (erro && !recibo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-10 text-center space-y-3">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="font-medium text-slate-700">{erro}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!recibo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando recibo...
        </div>
      </div>
    );
  }

  const d = recibo.dados || {};
  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-1">
          <ReceiptText className="w-10 h-10 mx-auto text-slate-700" />
          <h1 className="text-xl font-semibold text-slate-900">Recibo de pagamento</h1>
          <p className="text-sm text-slate-500">{d.empresa?.nome}</p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Pagador</dt>
              <dd className="font-medium text-slate-900">
                {d.empresa?.nome}
                {d.empresa?.cnpj ? ` · CNPJ ${fmtCnpj(d.empresa.cnpj)}` : ""}
              </dd>
              <dt className="text-slate-500">Favorecido</dt>
              <dd className="font-medium text-slate-900">
                {d.fornecedor?.nome}
                {d.fornecedor?.cnpj ? ` · ${fmtCnpj(d.fornecedor.cnpj)}` : ""}
              </dd>
              <dt className="text-slate-500">Valor</dt>
              <dd className="text-lg font-bold text-emerald-700">{fmtMoeda(d.pagamento?.valor)}</dd>
              <dt className="text-slate-500">Data do pagamento</dt>
              <dd>{fmtData(d.pagamento?.data_pagamento)}</dd>
              <dt className="text-slate-500">Referente a</dt>
              <dd>{d.pagamento?.descricao || "—"}</dd>
              {d.pagamento?.forma_pagamento && (
                <>
                  <dt className="text-slate-500">Forma</dt>
                  <dd>{d.pagamento.forma_pagamento}</dd>
                </>
              )}
              {d.pagamento?.numero_documento && (
                <>
                  <dt className="text-slate-500">Documento</dt>
                  <dd>{d.pagamento.numero_documento}</dd>
                </>
              )}
              <dt className="text-slate-500">Código</dt>
              <dd className="font-mono">{recibo.codigo}</dd>
            </dl>
            <p className="text-[10px] text-slate-400 break-all">SHA-256: {recibo.hash_sha256}</p>
          </CardContent>
        </Card>

        {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}

        {recibo.status === "confirmada" ? (
          <Card className="border-emerald-300">
            <CardContent className="p-5 text-center space-y-1">
              <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="font-semibold text-emerald-800">Quitação registrada</p>
              <p className="text-sm text-slate-600">
                em {new Date(recibo.confirmada_em).toLocaleString("pt-BR")}
              </p>
              <Button variant="outline" className="mt-3" disabled={ocupado} onClick={baixarPdf}>
                {ocupado ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Baixar recibo (PDF)
              </Button>
            </CardContent>
          </Card>
        ) : recibo.status === "contestada" ? (
          <Card className="border-amber-300">
            <CardContent className="p-5 text-center space-y-1">
              <XCircle className="w-8 h-8 text-amber-600 mx-auto" />
              <p className="font-semibold text-amber-800">Contestação registrada</p>
              <p className="text-sm text-slate-600">“{recibo.contestacao}”</p>
              <p className="text-xs text-slate-500">A empresa foi avisada e vai retornar.</p>
            </CardContent>
          </Card>
        ) : contestando ? (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-slate-700">O que está errado?</p>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: valor diferente do combinado, pagamento não localizado…"
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setContestando(false)}
                  disabled={ocupado}
                >
                  Voltar
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  disabled={ocupado || motivo.trim().length < 3}
                  onClick={() => agir("contestar", { motivo: motivo.trim() })}
                >
                  Enviar contestação
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-base"
              disabled={ocupado}
              onClick={() => agir("confirmar")}
            >
              {ocupado ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5 mr-2" />
              )}
              Confirmo o recebimento (dou quitação)
            </Button>
            <button
              type="button"
              className="w-full text-sm text-slate-500 hover:text-slate-800 underline"
              onClick={() => setContestando(true)}
              disabled={ocupado}
            >
              Algo errado? Contestar
            </button>
            <p className="text-[11px] text-slate-500 text-center">
              Ao confirmar, ficam registrados data/hora, IP e aparelho — vale como assinatura
              eletrônica (Lei 14.063/2020 e MP 2.200-2/2001).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
