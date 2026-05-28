import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  CheckCircle2,
  Eye,
  Copy,
  Link2Off,
  Paperclip,
  Link2,
  Trash2,
  Edit,
  X,
} from "lucide-react";
import { sigo } from "@/api/sigoClient";
import AnexoViewer from "../shared/AnexoViewer";
import ModalPagamento from "./ModalPagamento";
import { STATUS_FINANCEIRO, normalizeStatus } from "@/lib/financeiro-utils";

const formatCurrency = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const formatDate = (d) =>
  d
    ? new Date(
        d + (typeof d === "string" && d.length === 10 ? "T12:00:00" : "")
      ).toLocaleDateString("pt-BR")
    : "-";

const formatDateTime = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR")}`;
};

const isStatusPago = (status) => {
  const s = normalizeStatus(status);
  return s === STATUS_FINANCEIRO.PAGO || s === STATUS_FINANCEIRO.REALIZADO;
};

/**
 * Modal de detalhes unificado para Receita e Despesa.
 *
 * Receita: parcelas/anexos/conciliação/excluir/emitir-recibo/duplicar não aparecem
 * (paridade preservada com a versão antiga). Use `tipo="despesa"` pra desbloquear.
 */
export default function DetalheTransacaoModal({
  tipo,
  open,
  onOpenChange,
  transacao,
  anexos = [],
  podeEditar,
  onEditar,
  onBaixar,
  empresaAtiva,
  onEmitirRecibo,
  onAdicionarAnexo,
  onDuplicar,
  onDesfazerConciliacao,
  onExcluir,
  somenteLeitura = false,
}) {
  const [anexoSelecionado, setAnexoSelecionado] = useState(null);
  const [showAnexoViewer, setShowAnexoViewer] = useState(false);
  const [showModalPagamento, setShowModalPagamento] = useState(false);
  const [despesaPagamento, setDespesaPagamento] = useState(null);

  if (!transacao) return null;

  const isReceita = tipo === "receita";
  const pago = isStatusPago(transacao.status);
  const labels = isReceita
    ? {
        titulo: "Detalhes da Receita",
        formaPagamento: "Forma de Recebimento",
        dataPagamento: "Data Recebimento",
        contraparte: "Cliente",
        contraparteValor: transacao.cliente_nome,
        valorCor: "text-green-600",
        badgePago: "Recebido",
        badgePendente: "Em aberto",
        botaoPago: "Desfazer Recebimento",
        botaoPendente: "Registrar Recebimento",
      }
    : {
        titulo: "Detalhes da Despesa",
        formaPagamento: "Forma de Pagamento",
        dataPagamento: "Data Pagamento",
        contraparte: "Fornecedor",
        contraparteValor: transacao.fornecedor_nome,
        valorCor: "text-red-600",
        badgePago: "Pago",
        badgePendente: "Em aberto",
        botaoPago: "Desfazer Pagamento",
        botaoPendente: "Registrar Pagamento",
      };

  const handleVisualizarAnexo = (anexo) => {
    setAnexoSelecionado(anexo);
    setShowAnexoViewer(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle className="flex items-center gap-3">
              <span>{labels.titulo}</span>
              {!isReceita && transacao.conciliado && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <Link2 className="w-4 h-4 mr-1" />
                  Conciliado
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!isReceita &&
            transacao.parcelado &&
            transacao.parcelas &&
            (() => {
              try {
                const parcelasData = JSON.parse(transacao.parcelas);
                return (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-800 mb-3">
                      Despesa Parcelada ({parcelasData.length}x)
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {parcelasData.map((parcela, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            parcela.status === STATUS_FINANCEIRO.PAGO
                              ? "bg-green-50 border-green-200"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {parcela.status === STATUS_FINANCEIRO.PAGO ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-orange-400" />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                Parcela {parcela.numero}/{parcelasData.length}
                              </p>
                              <p className="text-xs text-slate-500">
                                Vencimento: {formatDate(parcela.data_vencimento)}
                                {parcela.data_pagamento &&
                                  ` • Pago em: ${formatDate(parcela.data_pagamento)}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-800">
                                {formatCurrency(parcela.valor)}
                              </p>
                              <Badge
                                variant="outline"
                                className={
                                  parcela.status === STATUS_FINANCEIRO.PAGO
                                    ? "bg-green-100 text-green-700 border-green-300"
                                    : "bg-orange-100 text-orange-700 border-orange-300"
                                }
                              >
                                {parcela.status === STATUS_FINANCEIRO.PAGO ? "Pago" : "Pendente"}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant={
                                parcela.status === STATUS_FINANCEIRO.PAGO ? "outline" : "default"
                              }
                              className={
                                parcela.status === STATUS_FINANCEIRO.PAGO
                                  ? ""
                                  : "bg-green-600 hover:bg-green-700"
                              }
                              onClick={async () => {
                                if (parcela.status === STATUS_FINANCEIRO.PAGO) {
                                  if (!confirm("Desfazer pagamento desta parcela?")) return;
                                  const novasParcelas = [...parcelasData];
                                  novasParcelas[index].status = STATUS_FINANCEIRO.EM_ABERTO;
                                  novasParcelas[index].data_pagamento = null;
                                  novasParcelas[index].comprovante_url = null;
                                  await sigo.entities.TransacaoFinanceira.update(transacao.id, {
                                    parcelas: JSON.stringify(novasParcelas),
                                  });
                                  if (onBaixar) onBaixar(transacao);
                                } else {
                                  setDespesaPagamento({
                                    ...transacao,
                                    _parcelaIndex: index,
                                    _parcela: parcela,
                                    _parcelasData: parcelasData,
                                    valor: parcela.valor,
                                  });
                                  setShowModalPagamento(true);
                                }
                              }}
                            >
                              {parcela.status === STATUS_FINANCEIRO.PAGO ? "Desfazer" : "Pagar"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch {
                return null;
              }
            })()}

          <div>
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações Gerais
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-500">Descrição</Label>
                <p className="mt-1 text-slate-800 font-medium">{transacao.descricao || "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Valor Total</Label>
                  <p className={`mt-1 text-lg font-bold ${labels.valorCor}`}>
                    {formatCurrency(transacao.valor)}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">{labels.formaPagamento}</Label>
                  <p className="mt-1 text-slate-800">
                    {transacao.forma_pagamento ? (
                      <Badge variant="outline" className="capitalize">
                        {transacao.forma_pagamento}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-500">Data Competência</Label>
                  <p className="mt-1 text-slate-800">{formatDate(transacao.data)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Vencimento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(transacao.data_vencimento)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">{labels.dataPagamento}</Label>
                  <p className="mt-1 text-slate-800">{formatDate(transacao.data_pagamento)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">Relacionamentos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-500">{labels.contraparte}</Label>
                <p className="mt-1 text-slate-800">{labels.contraparteValor || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Categoria</Label>
                <p className="mt-1 text-slate-800">
                  {transacao.categoria_nome ? (
                    <Badge variant="outline">{transacao.categoria_nome}</Badge>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Conta</Label>
                <p className="mt-1 text-slate-800">{transacao.conta_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Centro de Custo</Label>
                <p className="mt-1 text-slate-800">
                  {transacao.centro_custo_nome || transacao.centro_custo || "-"}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Projeto</Label>
                <p className="mt-1 text-slate-800">{transacao.projeto_nome || "-"}</p>
              </div>
              {isReceita && (
                <div>
                  <Label className="text-slate-500">Oportunidade</Label>
                  <p className="mt-1 text-slate-800">{transacao.oportunidade_nome || "-"}</p>
                </div>
              )}
            </div>
          </div>

          {!isReceita && anexos.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
                Anexos ({anexos.length})
              </h3>
              <div className="space-y-2">
                {anexos.map((anexo) => {
                  const isPdf = anexo.tipo?.includes("pdf") || anexo.nome?.endsWith(".pdf");
                  const isImage =
                    anexo.tipo?.includes("image") || anexo.nome?.match(/\.(jpg|jpeg|png|gif)$/i);
                  return (
                    <div
                      key={anexo.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isImage ? (
                          <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                            <img
                              src={anexo.url}
                              alt={anexo.nome}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div
                            className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${
                              isPdf ? "bg-red-100" : "bg-slate-100"
                            }`}
                          >
                            <FileText
                              className={`w-5 h-5 ${isPdf ? "text-red-600" : "text-slate-500"}`}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {anexo.nome}
                          </p>
                          {anexo.tipo && <p className="text-xs text-slate-500">{anexo.tipo}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleVisualizarAnexo(anexo)}
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = anexo.url;
                            link.download = anexo.nome || "anexo";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          title="Baixar arquivo"
                        >
                          <Download className="w-4 h-4 text-blue-600" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações do Sistema
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <Label className="text-slate-500">Criado em</Label>
                <p className="mt-1 text-slate-800">
                  {isReceita
                    ? transacao.created_date
                      ? new Date(transacao.created_date).toLocaleString("pt-BR")
                      : "-"
                    : formatDateTime(transacao.created_date)}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Criado por</Label>
                <p className="mt-1 text-slate-800">{transacao.created_by || "-"}</p>
              </div>
              {!isReceita && (
                <>
                  <div>
                    <Label className="text-slate-500">Última atualização</Label>
                    <p className="mt-1 text-slate-800">{formatDateTime(transacao.updated_date)}</p>
                  </div>
                  <div>
                    <Label className="text-slate-500">Conciliado</Label>
                    <p className="mt-1 text-slate-800">
                      {transacao.conciliado ? (
                        <Badge className="bg-green-100 text-green-700">Sim</Badge>
                      ) : (
                        <Badge variant="outline">Não</Badge>
                      )}
                    </p>
                  </div>
                </>
              )}
              {isReceita && (
                <div>
                  <Label className="text-slate-500">Status</Label>
                  <p className="mt-1">
                    <Badge
                      className={pago ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}
                    >
                      {pago ? labels.badgePago : labels.badgePendente}
                    </Badge>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {isReceita ? (
          <div className="border-t p-4 space-y-3">
            {onBaixar && (
              <Button
                variant={pago ? "outline" : "default"}
                size="sm"
                onClick={() => onBaixar(transacao)}
                className={pago ? "text-blue-600 w-full" : "bg-green-600 hover:bg-green-700 w-full"}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {pago ? labels.botaoPago : labels.botaoPendente}
              </Button>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Fechar
              </Button>
              {podeEditar && onEditar && (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onEditar(transacao);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 flex-1"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 border-t pt-4">
            {!somenteLeitura && (
              <div className="flex flex-wrap gap-2 pb-3 border-b">
                {!transacao.parcelado && (
                  <Button
                    variant={pago ? "outline" : "default"}
                    size="sm"
                    onClick={() => {
                      if (pago) {
                        if (confirm("Desfazer pagamento desta despesa?")) {
                          onBaixar(transacao);
                        }
                      } else {
                        setShowModalPagamento(true);
                      }
                    }}
                    className={pago ? "text-blue-600" : "bg-green-600 hover:bg-green-700"}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {pago ? labels.botaoPago : labels.botaoPendente}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEmitirRecibo && onEmitirRecibo(transacao)}
                  className="text-blue-600"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Emitir Recibo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAdicionarAnexo && onAdicionarAnexo(transacao)}
                  className="text-green-600"
                >
                  <Paperclip className="w-4 h-4 mr-2" />
                  Adicionar Anexo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onDuplicar) {
                      onOpenChange(false);
                      onDuplicar(transacao);
                    }
                  }}
                  className="text-purple-600"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
                {transacao.conciliado && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (onDesfazerConciliacao) {
                        onOpenChange(false);
                        onDesfazerConciliacao(transacao);
                      }
                    }}
                    className="text-orange-600"
                  >
                    <Link2Off className="w-4 h-4 mr-2" />
                    Desfazer Conciliação
                  </Button>
                )}
              </div>
            )}
            <div className="flex gap-3">
              {podeEditar && onExcluir && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Deseja realmente excluir esta despesa?")) {
                      onOpenChange(false);
                      onExcluir(transacao);
                    }
                  }}
                  className="text-red-600 hover:bg-red-50 flex-1"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Fechar
              </Button>
              {podeEditar && (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onEditar(transacao);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 flex-1"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      {!isReceita && (
        <AnexoViewer
          anexo={anexoSelecionado}
          open={showAnexoViewer}
          onOpenChange={setShowAnexoViewer}
        />
      )}

      {!isReceita && (
        <ModalPagamento
          open={showModalPagamento}
          onOpenChange={setShowModalPagamento}
          despesa={despesaPagamento || transacao}
          empresaAtiva={empresaAtiva}
          onConfirm={async (dataPagamento, comprovanteUrl) => {
            try {
              if (despesaPagamento?._parcelaIndex !== undefined) {
                const novasParcelas = [...despesaPagamento._parcelasData];
                novasParcelas[despesaPagamento._parcelaIndex].status = STATUS_FINANCEIRO.PAGO;
                novasParcelas[despesaPagamento._parcelaIndex].data_pagamento = dataPagamento;
                novasParcelas[despesaPagamento._parcelaIndex].comprovante_url = comprovanteUrl;
                await sigo.entities.TransacaoFinanceira.update(transacao.id, {
                  parcelas: JSON.stringify(novasParcelas),
                });
              } else {
                await sigo.entities.TransacaoFinanceira.update(transacao.id, {
                  status: "Realizado",
                  data_pagamento: dataPagamento,
                });
                if (comprovanteUrl) {
                  await sigo.entities.TransacaoAnexo.create({
                    empresa_id: empresaAtiva.id,
                    transacao_id: transacao.id,
                    nome: "Comprovante de Pagamento",
                    url: comprovanteUrl,
                    tipo: "comprovante",
                  });
                }
              }
              setDespesaPagamento(null);
              setShowModalPagamento(false);
              if (onBaixar) onBaixar(transacao);
            } catch (err) {
              alert("Erro ao registrar pagamento: " + err.message);
            }
          }}
        />
      )}
    </Sheet>
  );
}
