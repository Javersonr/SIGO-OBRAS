import React, { useState, useEffect } from "react";
import { ehBase44, nomeDoArquivo, refDoUpload } from "@/lib/anexo-ref";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sigo, supabase } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import {
  dataDoFechamento,
  mensagemErroFechamento,
  sugerirContaFundo,
  valorDoPreLancamento,
} from "@/lib/fechamento-caixa";
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
  Eye,
  FileWarning,
  ArrowRight,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── helpers ────────────────────────────────────────────────────────────────
const parseDados = (pl) => safeParseJSON(pl.dados_extraidos, {});

// mesmo critério do banco (valor_total do fechamento): "1.234,56" não vira 1,234
const getValor = (pl) => valorDoPreLancamento(pl);

const SEM_CONTA = "__none__";

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
  usuarioNome,
  onSucesso,
}) {
  const [itens, setItens] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [contas, setContas] = useState([]);
  const [contaPagadoraId, setContaPagadoraId] = useState(""); // "" = só baixar as despesas
  const [contaFundoId, setContaFundoId] = useState("");
  const [dataPagamento, setDataPagamento] = useState(new Date().toLocaleDateString("en-CA"));
  const [observacoes, setObservacoes] = useState("");
  const [comprovante, setComprovante] = useState(null);
  const [nomeComprovante, setNomeComprovante] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [erro, setErro] = useState(null);
  const [anexoAberto, setAnexoAberto] = useState(null);

  // Carregar empresa, contas e itens ao abrir
  useEffect(() => {
    if (!open) {
      setAnexoAberto(null); // fecha o comprovante junto com o modal
      return;
    }
    setErro(null);
    setItens(itensProp || []);
    setContaPagadoraId("");
    sigo.entities.Empresa.filter({ id: empresaId })
      .then((r) => setEmpresa(r[0] || null))
      .catch((err) => {
        console.warn("[FechamentoCaixa] falha carregando empresa:", err);
        setEmpresa(null);
      });
    // contas para a reposição do fundo fixo (conta pagadora → fundo)
    sigo.entities.ContaFinanceira.filter({ empresa_id: empresaId, ativo: true })
      .then((r) => {
        const lista = (r || []).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
        setContas(lista);
        setContaFundoId(sugerirContaFundo(lista, itensProp, fechamento?.conta_financeira_id));
      })
      .catch((err) => {
        console.warn("[FechamentoCaixa] falha carregando contas:", err);
        setContas([]);
        setContaFundoId("");
      });
  }, [open, itensProp, empresaId, fechamento?.conta_financeira_id]);

  const total = itens.reduce((s, pl) => s + getValor(pl), 0);
  // valor do fechamento (a reposição é calculada no banco: o que saiu do fundo)
  const valorReposicao = Number(fechamento?.valor_total) || 0;
  const totalDifereDoFechamento = itens.length > 0 && Math.abs(total - valorReposicao) >= 0.005;
  const itensSemDespesa = itens.filter((pl) => !pl.transacao_id).length;
  const contaPagadora = contas.find((c) => c.id === contaPagadoraId) || null;
  const contaFundo = contas.find((c) => c.id === contaFundoId) || null;
  const numeroCaixa = fechamento?.numero || "–";
  const nomeResponsavel =
    fechamento?.usuario_reposicao_nome || fechamento?.usuario_reposicao_email || "";
  // data_fechamento é timestamptz (o fechar_caixa grava now())
  const dataFechamento = fechamento?.data_fechamento
    ? dataDoFechamento(fechamento.data_fechamento)
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
        const valor = getValor(pl);
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
            valor: getValor(pl),
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
      // função ainda não migrada do Base44: volta { success:false, error } sem PDF
      const base64 = response?.data?.base64;
      if (response?.data?.success === false || response?.data?.error || !base64) {
        throw new Error(
          response?.data?.error || "o servidor não devolveu o PDF. Use Imprimir Planilha."
        );
      }
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
    if (salvando) return;
    if (!dataPagamento) {
      setErro("Selecione a data do pagamento.");
      return;
    }
    if (contaPagadoraId && !contaFundoId) {
      setErro("Escolha a conta do fundo fixo que recebe a reposição.");
      return;
    }
    if (contaPagadoraId && contaPagadoraId === contaFundoId) {
      setErro("A conta pagadora e a conta do fundo fixo precisam ser diferentes.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // grava a ref estável "bucket/caminho" — a file_url assinada vence em 1h
      let comprovante_url = null;
      if (comprovante) {
        const res = await sigo.integrations.Core.UploadFile({ file: comprovante });
        comprovante_url = refDoUpload(res);
        if (!comprovante_url) throw new Error("o envio do comprovante não retornou o arquivo");
      }

      // aprovar_pagamento_fechamento (0158), numa transação só: itens →
      // "Conciliado"; despesas dos itens → pagas (o extrato sai da conta de cada
      // despesa pelo trigger da 0155); com conta pagadora, a reposição vira
      // transferência conta pagadora → fundo fixo, no valor das despesas pagas
      // PELA CONTA DO FUNDO (despesa lançada em outra conta já saiu dela: repor
      // também a debitaria duas vezes).
      const { data, error } = await supabase.rpc("aprovar_pagamento_fechamento", {
        p_fechamento_id: fechamento.id,
        p_data: dataPagamento,
        p_observacoes: observacoes || null,
        p_comprovante_url: comprovante_url,
        p_usuario_nome: usuarioNome || null,
        p_conta_pagadora_id: contaPagadoraId || null,
        // o fundo só vai junto com a conta pagadora (sem ela o campo nem aparece,
        // e o banco mantém a conta já gravada no fechamento)
        p_conta_fundo_id: contaPagadoraId ? contaFundoId || null : null,
      });
      if (error) throw error;

      const avisos = [];
      if (Number(data?.despesas_fora_do_fundo) > 0) {
        avisos.push(
          `${data.despesas_fora_do_fundo} despesa(s) estão em outra conta e não entram na reposição`
        );
      }
      if (Number(data?.parceladas_ignoradas) > 0) {
        avisos.push(
          `${data.parceladas_ignoradas} despesa(s) parcelada(s) não foram baixadas: pague parcela a parcela`
        );
      }
      toast.success(
        (data?.transferencia_id
          ? `Pagamento do fechamento #${numeroCaixa} aprovado. Reposição de R$ ${fmtBRL(Number(data.valor_reposicao) || 0)} transferida de ${contaPagadora?.nome || "conta pagadora"} para ${contaFundo?.nome || "o fundo fixo"}.`
          : `Pagamento do fechamento #${numeroCaixa} aprovado: despesas dos itens baixadas.`) +
          (avisos.length ? ` Atenção: ${avisos.join("; ")}.` : "")
      );
      onOpenChange(false);
      if (onSucesso) onSucesso();
    } catch (err) {
      setErro("Erro ao confirmar pagamento: " + mensagemErroFechamento(err));
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
              <p className="text-2xl font-bold text-red-600">R$ {fmtBRL(valorReposicao)}</p>
            </div>
            {totalDifereDoFechamento && (
              <p className="col-span-2 text-xs text-amber-700">
                A soma dos itens hoje é R$ {fmtBRL(total)} (algum item mudou depois do fechamento).
              </p>
            )}
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
                          <button
                            type="button"
                            title={
                              ehBase44(pl.comprovante_url)
                                ? "Comprovante do sistema antigo (indisponível)"
                                : "Ver comprovante"
                            }
                            onClick={() =>
                              setAnexoAberto({
                                url: pl.comprovante_url,
                                nome: nomeDoArquivo(pl.comprovante_url, "Comprovante"),
                              })
                            }
                            className={`flex-shrink-0 ${
                              ehBase44(pl.comprovante_url)
                                ? "text-slate-300 hover:text-slate-500"
                                : "text-blue-400 hover:text-blue-600"
                            }`}
                          >
                            {ehBase44(pl.comprovante_url) ? (
                              <FileWarning className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
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
            <p className="text-xs text-slate-500">
              Data do pagamento do fechamento e da reposição. Cada despesa fica paga na data dela (a
              do comprovante).
            </p>
          </div>

          {/* Reposição do fundo fixo: conta pagadora (opcional) → fundo fixo */}
          <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Conta pagadora da reposição (opcional)
              </Label>
              <Select
                value={contaPagadoraId || SEM_CONTA}
                onValueChange={(v) => setContaPagadoraId(v === SEM_CONTA ? "" : v)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Nenhuma: só baixar as despesas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CONTA}>Nenhuma: só baixar as despesas</SelectItem>
                  {contas
                    .filter((c) => c.id !== contaFundoId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                        {c.tipo ? ` (${c.tipo})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {contaPagadoraId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Conta do fundo fixo (recebe a reposição) *
                </Label>
                <Select value={contaFundoId} onValueChange={setContaFundoId}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione o fundo fixo" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...contas]
                      .filter((c) => c.id !== contaPagadoraId)
                      // fundos fixos primeiro
                      .sort((a, b) => (b.tipo === "Fundo Fixo") - (a.tipo === "Fundo Fixo"))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                          {c.tipo ? ` (${c.tipo})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* efeito da aprovação, em palavras */}
            {contaPagadoraId && contaFundo ? (
              <p className="text-sm text-slate-700">
                A reposição sai da conta <strong>{contaPagadora?.nome}</strong>{" "}
                <ArrowRight className="inline w-3.5 h-3.5 text-slate-400 align-[-2px]" /> para o
                fundo fixo <strong>{contaFundo.nome}</strong> (transferência na data do pagamento),
                no valor das despesas deste fechamento pagas pela conta do fundo — despesa lançada
                em outra conta já saiu dela e não é reposta.
              </p>
            ) : contaPagadoraId ? (
              <p className="text-sm text-amber-700">
                Escolha a conta do fundo fixo que recebe a reposição.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Sem conta pagadora: só as despesas dos itens ficam pagas (a saída fica na conta de
                cada despesa). Nenhuma reposição do fundo fixo é lançada.
              </p>
            )}
            {itensSemDespesa > 0 && (
              <p className="text-xs text-amber-700">
                {itensSemDespesa} item(ns) sem despesa vinculada: ficam conciliados, mas não lançam
                saída em conta nenhuma. Para lançar, use &quot;Conciliar&quot; no item antes de
                aprovar.
              </p>
            )}
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

      {/* comprovante em janela flutuante (portal no body, por cima do diálogo) */}
      <AnexoViewer
        anexo={anexoAberto}
        open={!!anexoAberto}
        onOpenChange={(v) => !v && setAnexoAberto(null)}
      />
    </Dialog>
  );
}
