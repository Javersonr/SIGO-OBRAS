import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Trash2, CheckCircle2, X } from "lucide-react";
import { sigo } from "@/api/sigoClient";

export default function ConfirmacaoExclusaoModal({
  open,
  onOpenChange,
  tipo, // 'solicitacao' ou 'cotacao'
  registro,
  onConfirm,
}) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState({
    itens: [],
    cotacoes: [],
    pedidos: [],
    aprovacoes: [],
    respostas: [],
    fornecedores: [],
  });
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [excluirTudo, setExcluirTudo] = useState(false);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    if (open && registro) {
      carregarDados();
    }
  }, [open, registro]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      if (tipo === "solicitacao") {
        const [itens, cotacoes, pedidos, aprovacoes] = await Promise.all([
          sigo.entities.SolicitacaoCompraItem.filter({ solicitacao_id: registro.id }),
          sigo.entities.Cotacao.filter({ solicitacao_id: registro.id }),
          sigo.entities.PedidoCompra.filter({ solicitacao_id: registro.id }),
          sigo.entities.AprovacaoSolicitacao.filter({ solicitacao_id: registro.id }),
        ]);
        setDados({ itens, cotacoes, pedidos, aprovacoes, respostas: [], fornecedores: [] });
        setItensSelecionados(itens.map((i) => i.id));
      } else if (tipo === "cotacao") {
        const [itens, pedidos, respostas, fornecedores] = await Promise.all([
          sigo.entities.CotacaoItem.filter({ cotacao_id: registro.id }),
          sigo.entities.PedidoCompra.filter({ cotacao_id: registro.id }),
          sigo.entities.CotacaoResposta.filter({ cotacao_id: registro.id }),
          sigo.entities.CotacaoFornecedor.filter({ cotacao_id: registro.id }),
        ]);
        setDados({ itens, pedidos, respostas, fornecedores, cotacoes: [], aprovacoes: [] });
        setItensSelecionados(itens.map((i) => i.id));
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (itemId) => {
    if (itensSelecionados.includes(itemId)) {
      setItensSelecionados(itensSelecionados.filter((id) => id !== itemId));
    } else {
      setItensSelecionados([...itensSelecionados, itemId]);
    }
  };

  const toggleTodos = () => {
    if (itensSelecionados.length === dados.itens.length) {
      setItensSelecionados([]);
    } else {
      setItensSelecionados(dados.itens.map((i) => i.id));
    }
  };

  const handleConfirmar = async () => {
    // Verificações de bloqueio
    if (dados.pedidos.length > 0) {
      alert(
        "❌ Não é possível excluir!\n\n" +
          `Existem ${dados.pedidos.length} pedido(s) vinculado(s):\n` +
          dados.pedidos.map((p) => `• ${p.numero} - ${p.status}`).join("\n")
      );
      return;
    }

    if (tipo === "solicitacao" && dados.cotacoes.some((c) => c.status === "Aprovada")) {
      const cotAprovada = dados.cotacoes.find((c) => c.status === "Aprovada");
      alert("❌ Não é possível excluir!\n\n" + `A cotação ${cotAprovada.numero} foi APROVADA.`);
      return;
    }

    if (!excluirTudo && itensSelecionados.length === 0) {
      alert("Selecione pelo menos um item para excluir");
      return;
    }

    const mensagem = excluirTudo
      ? `⚠️ EXCLUIR TUDO\n\n` +
        `${tipo === "solicitacao" ? "Solicitação" : "Cotação"}: ${registro.numero}\n\n` +
        `Serão excluídos:\n` +
        `• ${dados.itens.length} item(ns)\n` +
        (tipo === "solicitacao"
          ? `• ${dados.aprovacoes.length} aprovação(ões)\n• ${dados.cotacoes.length} cotação(ões)\n`
          : "") +
        (tipo === "cotacao"
          ? `• ${dados.fornecedores.length} fornecedor(es)\n• ${dados.respostas.length} resposta(s)\n`
          : "") +
        `\nEsta ação NÃO pode ser desfeita!`
      : `⚠️ EXCLUIR ITENS SELECIONADOS\n\n` +
        `Serão excluídos ${itensSelecionados.length} de ${dados.itens.length} item(ns)\n\n` +
        `Esta ação NÃO pode ser desfeita!`;

    if (!confirm(mensagem)) return;

    setProcessando(true);
    try {
      await onConfirm(registro, excluirTudo, itensSelecionados);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro:", error);
      alert("❌ Erro ao excluir: " + error.message);
    } finally {
      setProcessando(false);
    }
  };

  if (loading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-full overflow-y-auto p-0 flex flex-col"
          style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
        >
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const temBloqueio =
    dados.pedidos.length > 0 ||
    (tipo === "solicitacao" && dados.cotacoes.some((c) => c.status === "Aprovada"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full p-0 flex flex-col w-full md:w-[calc(100%-256px)] md:inset-auto md:right-0 md:left-256px md:top-16"
        data-fullscreen-modal
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              Confirmar Exclusão - {registro?.numero}
            </SheetTitle>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Bloqueios */}
          {temBloqueio && (
            <Card className="border-2 border-red-200 bg-red-50">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-red-700 font-semibold">
                  <AlertCircle className="w-5 h-5" />
                  <span>Exclusão Bloqueada</span>
                </div>
                {dados.pedidos.length > 0 && (
                  <p className="text-sm text-red-600">
                    • {dados.pedidos.length} pedido(s) de compra vinculado(s)
                  </p>
                )}
                {tipo === "solicitacao" && dados.cotacoes.some((c) => c.status === "Aprovada") && (
                  <p className="text-sm text-red-600">• Cotação aprovada vinculada</p>
                )}
                <p className="text-xs text-red-600 mt-2">
                  Para excluir, primeiro remova os bloqueios acima.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Resumo */}
          {!temBloqueio && (
            <Card className="border-2 border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <h3 className="font-semibold text-amber-800 mb-2">Dados que serão excluídos:</h3>
                <div className="space-y-1 text-sm text-amber-700">
                  <p>• {dados.itens.length} item(ns)</p>
                  {tipo === "solicitacao" && (
                    <>
                      <p>• {dados.aprovacoes.length} aprovação(ões)</p>
                      <p>• {dados.cotacoes.length} cotação(ões)</p>
                    </>
                  )}
                  {tipo === "cotacao" && (
                    <>
                      <p>• {dados.fornecedores.length} fornecedor(es) convidado(s)</p>
                      <p>• {dados.respostas.length} resposta(s) recebida(s)</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Opção Excluir Tudo */}
          {!temBloqueio && (
            <Card className="border-2 border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="excluir-tudo"
                    checked={excluirTudo}
                    onCheckedChange={setExcluirTudo}
                  />
                  <label
                    htmlFor="excluir-tudo"
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    Excluir {tipo === "solicitacao" ? "solicitação" : "cotação"} completa (todos os
                    itens e dados relacionados)
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de Itens */}
          {!temBloqueio && !excluirTudo && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Selecione os itens para excluir:</h3>
                  <Button variant="outline" size="sm" onClick={toggleTodos}>
                    {itensSelecionados.length === dados.itens.length
                      ? "Desmarcar Todos"
                      : "Selecionar Todos"}
                  </Button>
                </div>

                <div className="space-y-2">
                  {dados.itens.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        itensSelecionados.includes(item.id)
                          ? "border-red-300 bg-red-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => toggleItem(item.id)}
                    >
                      <Checkbox
                        checked={itensSelecionados.includes(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">#{idx + 1}</span>
                          <p className="text-sm font-medium text-slate-800">{item.descricao}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {item.quantidade} {item.unidade}
                          </Badge>
                          {item.especificacoes && (
                            <span className="text-xs text-slate-500">{item.especificacoes}</span>
                          )}
                        </div>
                      </div>
                      {itensSelecionados.includes(item.id) && (
                        <CheckCircle2 className="w-5 h-5 text-red-600 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {itensSelecionados.length > 0 && (
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
                    <strong>{itensSelecionados.length}</strong> de{" "}
                    <strong>{dados.itens.length}</strong> item(ns) selecionado(s) para exclusão
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {!temBloqueio && (
            <Button
              onClick={handleConfirmar}
              disabled={processando || (!excluirTudo && itensSelecionados.length === 0)}
              className="bg-red-600 hover:bg-red-700"
            >
              {processando ? (
                "Excluindo..."
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  {excluirTudo ? `Excluir Tudo` : `Excluir ${itensSelecionados.length} Item(ns)`}
                </>
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
