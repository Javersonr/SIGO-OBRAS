import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { sigo } from "@/api/sigoClient";
import {
  Loader2,
  Package,
  CheckCheck,
  AlertCircle,
  Upload,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── helpers ────────────────────────────────────────────────────────────────
const parseDados = (pl) => {
  try {
    return typeof pl.dados_extraidos === "string"
      ? JSON.parse(pl.dados_extraidos || "{}")
      : pl.dados_extraidos || {};
  } catch {
    return {};
  }
};

const getValor = (pl) => parseFloat(parseDados(pl).valor) || 0;

const getDescricao = (pl) => {
  const d = parseDados(pl);
  return pl.descricao_caixa || d.descricao || d.fornecedor || "-";
};

const fmtBRL = (v) => (parseFloat(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// ─── Modal principal ─────────────────────────────────────────────────────────
export default function FechamentoCaixaModal({
  open,
  onOpenChange,
  fechamento, // objeto FechamentoCaixa já existente
  itens: itensProp, // pré-lançamentos carregados pelo pai
  empresaId,
  usuarioEmail,
  usuarioNome,
  onSucesso,
}) {
  const [itens, setItens] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [dataPagamento, setDataPagamento] = useState(new Date().toLocaleDateString("en-CA"));
  const [observacoes, setObservacoes] = useState("");
  const [comprovante, setComprovante] = useState(null);
  const [nomeComprovante, setNomeComprovante] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [erro, setErro] = useState(null);

  // Carregar empresa e itens ao abrir
  useEffect(() => {
    if (!open) return;
    setErro(null);
    setItens(itensProp || []);
    sigo.entities.Empresa.filter({ id: empresaId })
      .then((r) => setEmpresa(r[0] || null))
      .catch(() => {});
  }, [open, itensProp, empresaId]);

  const total = itens.reduce((s, pl) => s + getValor(pl), 0);
  const numeroCaixa = fechamento?.numero || "–";
  const nomeResponsavel =
    fechamento?.usuario_reposicao_nome || fechamento?.usuario_reposicao_email || "";
  const dataFechamento = fechamento?.data_fechamento
    ? new Date(fechamento.data_fechamento + "T12:00:00").toLocaleDateString("pt-BR")
    : "";

  // ── Planilha modelo (igual ao HistoricoFechamentosCaixa) ──────────────────
  const handleImprimirPlanilha = () => {
    const saldoAnt = 0;
    const saldoAtu = saldoAnt - total;

    const itensOrdenados = [...itens].sort((a, b) => getValor(a) - getValor(b));

    const linhasItens = itensOrdenados
      .map((pl, i) => {
        const d = parseDados(pl);
        const data = pl.data_competencia
          ? new Date(pl.data_competencia + "T12:00:00").toLocaleDateString("pt-BR")
          : d.data || "";
        const descricao = pl.descricao_caixa || d.descricao || d.fornecedor || "-";
        const documento = d.tipo_documento || d.numero_documento || "";
        const valor = parseFloat(d.valor) || 0;
        return `<tr>
        <td style="border:1px solid #999;padding:4px 8px;text-align:center;">${i + 1}</td>
        <td style="border:1px solid #999;padding:4px 8px;">${data}</td>
        <td style="border:1px solid #999;padding:4px 8px;">${descricao}</td>
        <td style="border:1px solid #999;padding:4px 8px;text-align:center;">${documento}</td>
        <td style="border:1px solid #999;padding:4px 8px;text-align:right;"></td>
        <td style="border:1px solid #999;padding:4px 8px;text-align:right;color:#c00;">R$ ${fmtBRL(valor)}</td>
      </tr>`;
      })
      .join("");

    const htmlContent = `<!DOCTYPE html><html><head><title>Fechamento #${numeroCaixa}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 8px}</style></head><body><h2>Fechamento de Caixa #${numeroCaixa}</h2><p>Responsável: ${nomeResponsavel} | Data: ${dataFechamento}</p><table><thead><tr><th>#</th><th>Data</th><th>Descrição</th><th>Documento</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>${linhasItens}</tbody><tfoot><tr><td colspan="5" style="text-align:right;font-weight:bold">Total Saídas:</td><td style="text-align:right;color:#c00;font-weight:bold">R$ ${fmtBRL(total)}</td></tr></tfoot></table></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(htmlContent);
    w.document.close();
    setTimeout(() => w.print(), 800);
  };

  // ── PDF com comprovantes (usa backend gerarPDFComprovantes) ───────────────
  const handleGerarPDF = async () => {
    setGerandoPDF(true);
    setErro(null);
    try {
      const itensOrdenados = [...itens].sort((a, b) => getValor(a) - getValor(b));
      const payload = {
        itens: itensOrdenados.map((pl, i) => {
          const d = parseDados(pl);
          return {
            idx: i,
            data: pl.data_competencia
              ? new Date(pl.data_competencia + "T12:00:00").toLocaleDateString("pt-BR")
              : d.data || "-",
            descricao: pl.descricao_caixa || d.fornecedor || d.descricao || "-",
            documento: d.tipo_documento || d.numero_documento || "",
            valor: parseFloat(d.valor) || 0,
            comprovante_url: pl.comprovante_url || null,
          };
        }),
        cabecalho: {
          numeroCaixa,
          nomeResponsavel,
          dataFormatada: dataFechamento,
          empresa: empresa?.razao_social || empresa?.nome || "",
          saldoAnterior: 0,
          saldoAtual: 0,
        },
      };

      const response = await sigo.functions.invoke("gerarPDFComprovantes", payload);
      if (response.data.error) throw new Error(response.data.error);
      const base64 = response.data.base64;
      const binary = atob(base64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fechamento-${numeroCaixa}-comprovantes.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      setErro("Erro ao gerar PDF: " + err.message);
    } finally {
      setGerandoPDF(false);
    }
  };

  // ── Confirmar pagamento ───────────────────────────────────────────────────
  const handleConfirmarPagamento = async () => {
    if (!dataPagamento) {
      setErro("Selecione a data do pagamento.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      let comprovante_url = null;
      if (comprovante) {
        const res = await sigo.integrations.Core.UploadFile({ file: comprovante });
        comprovante_url = res.file_url;
      }

      // Atualizar fechamento para "Pago"
      await sigo.entities.FechamentoCaixa.update(fechamento.id, {
        status: "Pago",
        usuario_pagamento_email: usuarioEmail,
        usuario_pagamento_nome: usuarioNome,
        data_pagamento: dataPagamento,
        observacoes_pagamento: observacoes || null,
        comprovante_pagamento_url: comprovante_url,
      });

      // Marcar todos os pré-lançamentos como "Conciliado"
      await Promise.all(
        itens.map(async (pl) => {
          await sigo.entities.PreLancamento.update(pl.id, { status: "Conciliado" });
          if (pl.transacao_id) {
            await sigo.entities.TransacaoFinanceira.update(pl.transacao_id, { status: "pago" });
          }
        })
      );

      onOpenChange(false);
      if (onSucesso) onSucesso();
    } catch (err) {
      setErro("Erro ao confirmar pagamento: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none !w-screen !h-screen !max-h-screen !rounded-none !top-0 !left-0 lg:!left-64 lg:!top-16 lg:!w-[calc(100vw-16rem)] lg:!h-[calc(100vh-4rem)] !translate-x-0 !translate-y-0 flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            Aprovar Pagamento – Fechamento #{numeroCaixa}
            {itens.length > 0 && (
              <Badge className="ml-1 bg-amber-100 text-amber-800">{itens.length} itens</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {erro && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800">{erro}</AlertDescription>
            </Alert>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border rounded-lg">
            <div>
              <p className="text-xs text-slate-500 mb-1">Responsável</p>
              <p className="font-semibold text-slate-800">{nomeResponsavel || "–"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Valor Total</p>
              <p className="text-2xl font-bold text-red-600">R$ {fmtBRL(total)}</p>
            </div>
          </div>

          {/* Lista de itens */}
          {itens.length > 0 && (
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Itens do Fechamento</Label>
              <div className="border rounded-lg max-h-[40vh] overflow-y-auto">
                {[...itens]
                  .sort((a, b) => getValor(a) - getValor(b))
                  .map((pl, idx) => {
                    const d = parseDados(pl);
                    return (
                      <div
                        key={pl.id}
                        className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-slate-50 gap-2"
                      >
                        <span className="text-xs text-slate-400 w-5 flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {getDescricao(pl)}
                          </p>
                          {pl.data_competencia && (
                            <p className="text-xs text-slate-400">
                              {new Date(pl.data_competencia + "T12:00:00").toLocaleDateString(
                                "pt-BR"
                              )}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-red-600 flex-shrink-0">
                          R$ {fmtBRL(getValor(pl))}
                        </p>
                        {pl.comprovante_url && (
                          <a
                            href={pl.comprovante_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-600 flex-shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Botões de exportação */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImprimirPlanilha}
              disabled={itens.length === 0}
              className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Imprimir Planilha
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGerarPDF}
              disabled={gerandoPDF || itens.length === 0}
              className="gap-2 text-purple-600 border-purple-200 hover:bg-purple-50"
            >
              {gerandoPDF ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              PDF com Comprovantes
            </Button>
          </div>

          <hr />

          {/* Data do pagamento */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Data do Pagamento *</Label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Observações</Label>
            <Input
              placeholder="Opcional..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          {/* Upload comprovante de pagamento */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Comprovante de Pagamento</Label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                id="upload-comprovante-fechamento"
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) {
                    setComprovante(f);
                    setNomeComprovante(f.name);
                  }
                }}
                accept="image/*,.pdf"
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("upload-comprovante-fechamento").click()}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                {nomeComprovante ? "Alterar arquivo" : "Selecionar arquivo"}
              </Button>
              {nomeComprovante && (
                <div className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-600 truncate max-w-[200px]">
                    {nomeComprovante}
                  </span>
                  <button
                    onClick={() => {
                      setComprovante(null);
                      setNomeComprovante("");
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Ações principais */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvando || gerandoPDF}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarPagamento}
              disabled={salvando || !dataPagamento || gerandoPDF}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4 mr-2" />
                  Confirmar Pagamento
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
