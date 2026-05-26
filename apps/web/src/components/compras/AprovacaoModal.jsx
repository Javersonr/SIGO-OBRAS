import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Printer,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AprovacaoModal({
  open,
  onOpenChange,
  solicitacao,
  empresaAtiva,
  user,
  onApproved,
}) {
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState([]);
  const [itensEnriquecidos, setItensEnriquecidos] = useState([]);
  const [comentarios, setComentarios] = useState("");
  const [processando, setProcessando] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [aprovarTodos, setAprovarTodos] = useState(true);

  useEffect(() => {
    if (open && solicitacao) {
      const loadApprovalData = async () => {
        setLoading(true);
        try {
          const [itensData, materiais, orcamentoItens] = await Promise.all([
            sigo.entities.SolicitacaoCompraItem.filter({ solicitacao_id: solicitacao.id }),
            sigo.entities.Material.filter({ empresa_id: empresaAtiva.id }, "-created_date", 9999),
            solicitacao.projeto_id
              ? sigo.entities.OrcamentoItem.filter({ projeto_id: solicitacao.projeto_id })
              : Promise.resolve([]),
          ]);

          const itensEnriquecidosData = itensData.map((item) => {
            const material = materiais.find(
              (m) =>
                (item.material_id && m.id === item.material_id) ||
                m.nome?.toLowerCase() === item.descricao?.toLowerCase()
            );
            // Buscar código no orçamento como fallback
            const orcItem = orcamentoItens.find(
              (o) => o.descricao?.toLowerCase() === item.descricao?.toLowerCase()
            );
            return {
              ...item,
              codigo: item.material_codigo || material?.codigo || orcItem?.codigo || "-",
              valor_medio: material?.preco || 0,
              quantidade_estoque: 0,
              quantidade_editavel: item.quantidade,
            };
          });

          const itensOrdenados = itensEnriquecidosData.sort((a, b) =>
            (a.descricao || "").localeCompare(b.descricao || "")
          );
          setItens(itensData);
          setItensEnriquecidos(itensOrdenados);
          setItensSelecionados(itensData.map((i) => i.id));
          setAprovarTodos(true);
        } catch (error) {
          console.error("Erro ao carregar itens:", error);
        } finally {
          setLoading(false);
        }
      };
      loadApprovalData();
    }
  }, [open, solicitacao, empresaAtiva]);

  const toggleItem = (itemId) => {
    if (itensSelecionados.includes(itemId)) {
      setItensSelecionados(itensSelecionados.filter((id) => id !== itemId));
      setAprovarTodos(false);
    } else {
      const novosItens = [...itensSelecionados, itemId];
      setItensSelecionados(novosItens);
      if (novosItens.length === itens.length) {
        setAprovarTodos(true);
      }
    }
  };

  const toggleTodos = () => {
    if (aprovarTodos) {
      setItensSelecionados([]);
      setAprovarTodos(false);
    } else {
      setItensSelecionados(itens.map((i) => i.id));
      setAprovarTodos(true);
    }
  };

  const updateQuantidade = (itemId, novaQuantidade) => {
    setItensEnriquecidos(
      itensEnriquecidos.map((item) =>
        item.id === itemId
          ? { ...item, quantidade_editavel: parseFloat(novaQuantidade) || 0 }
          : item
      )
    );
  };

  const handleDecisao = async (decisao) => {
    setProcessando(true);
    try {
      if (!solicitacao?.id) {
        alert("Erro: Dados inválidos");
        return;
      }

      // Atualizar quantidades apenas dos itens que mudaram, sequencialmente
      const itensAlterados = itensEnriquecidos.filter(
        (item) => item.quantidade_editavel !== item.quantidade
      );
      for (const item of itensAlterados) {
        await sigo.entities.SolicitacaoCompraItem.update(item.id, {
          quantidade: item.quantidade_editavel,
        });
      }

      const response = await sigo.functions.invoke("processarAprovacao", {
        decisao,
        comentarios,
        aprovador_id: user?.id,
        aprovador_nome: user?.full_name,
        empresa_id: empresaAtiva?.id,
        solicitacao_id: solicitacao.id,
      });

      if (response.data?.success) {
        alert(`✅ Solicitação ${decisao === "Aprovado" ? "aprovada" : "reprovada"} com sucesso!`);
        onApproved();
        onOpenChange(false);
      } else {
        throw new Error(response.data?.error || "Erro ao processar");
      }
    } catch (error) {
      alert("❌ " + (error.message || "Erro ao processar aprovação"));
    } finally {
      setProcessando(false);
    }
  };

  const getStatusIcon = (status) => {
    if (status === "Aprovado") {
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    }
    if (status === "Rejeitado") {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }
    return <Clock className="w-5 h-5 text-orange-600" />;
  };

  const getStatusBadge = (status) => {
    const classes = {
      Pendente: "bg-orange-100 text-orange-700 border-orange-200",
      Aprovado: "bg-green-100 text-green-700 border-green-200",
      Rejeitado: "bg-red-100 text-red-700 border-red-200",
    };
    return <Badge className={classes[status]}>{status}</Badge>;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full p-0 flex flex-col w-full md:w-[calc(100%-256px)] md:inset-auto md:right-0 md:left-256px md:top-16"
        data-fullscreen-modal
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <SheetTitle>Revisar Solicitação - {solicitacao?.numero}</SheetTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleDecisao("Aprovado")}
                    disabled={processando || (!aprovarTodos && itensSelecionados.length === 0)}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    Aprovar
                  </Button>
                  <Button
                    onClick={() => handleDecisao("Rejeitado")}
                    disabled={processando || (!aprovarTodos && itensSelecionados.length === 0)}
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <ThumbsDown className="w-4 h-4 mr-2" />
                    Reprovar
                  </Button>
                  <Button
                    onClick={async () => {
                      if (
                        !confirm(
                          "⚠️ Tem certeza que deseja EXCLUIR esta solicitação?\n\nEsta ação não pode ser desfeita!"
                        )
                      )
                        return;
                      try {
                        const delay = (ms) => new Promise((res) => setTimeout(res, ms));

                        // Excluir aprovações sequencialmente
                        const aprovs = await sigo.entities.AprovacaoSolicitacao.filter({
                          solicitacao_id: solicitacao.id,
                        });
                        for (const a of aprovs) {
                          await sigo.entities.AprovacaoSolicitacao.delete(a.id);
                          await delay(300);
                        }

                        // Excluir itens sequencialmente
                        const its = await sigo.entities.SolicitacaoCompraItem.filter({
                          solicitacao_id: solicitacao.id,
                        });
                        for (const i of its) {
                          await sigo.entities.SolicitacaoCompraItem.delete(i.id);
                          await delay(300);
                        }

                        // Excluir solicitação
                        await sigo.entities.SolicitacaoCompra.delete(solicitacao.id);

                        alert("✅ Solicitação excluída com sucesso!");
                        onOpenChange(false);
                        onApproved();
                      } catch (error) {
                        console.error("Erro:", error);
                        alert("❌ Erro ao excluir solicitação");
                      }
                    }}
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </Button>
                  <Button
                    onClick={() => {
                      const printContent = document.createElement("div");
                      printContent.innerHTML = `
                        <style>
                          @media print {
                            body { font-family: Arial, sans-serif; margin: 20px; }
                            h1 { font-size: 24px; margin-bottom: 10px; }
                            h2 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 5px; }
                            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                            th { background-color: #f5f5f5; font-weight: bold; }
                            .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
                            .label { font-weight: bold; }
                          }
                        </style>
                        <h1>Solicitação de Compra - ${solicitacao?.numero || ""}</h1>
                        
                        <div style="margin: 20px 0;">
                          <div class="info-row"><span class="label">Solicitante:</span> ${solicitacao?.solicitante_nome || ""}</div>
                          <div class="info-row"><span class="label">Projeto:</span> ${solicitacao?.projeto_nome || "-"}</div>
                          <div class="info-row"><span class="label">Valor Total:</span> R$ ${(solicitacao?.valor_total || 0).toFixed(2)}</div>
                          <div class="info-row"><span class="label">Prioridade:</span> ${solicitacao?.prioridade || "Normal"}</div>
                        </div>

                        <h2>Itens da Solicitação</h2>
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Descrição</th>
                              <th>Quantidade</th>
                              <th>Unidade</th>
                              <th>Valor Médio</th>
                              <th>Qtd. Estoque</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${itensEnriquecidos
                              .map(
                                (item) => `
                              <tr>
                                <td>${item.codigo}</td>
                                <td>${item.descricao}</td>
                                <td style="text-align: right;">${item.quantidade_editavel}</td>
                                <td>${item.unidade}</td>
                                <td style="text-align: right;">R$ ${item.valor_medio.toFixed(2)}</td>
                                <td style="text-align: right;">${item.quantidade_estoque.toFixed(2)}</td>
                              </tr>
                            `
                              )
                              .join("")}
                          </tbody>
                        </table>

                        ''
                      `;

                      const printWindow = window.open("", "", "width=800,height=600");
                      printWindow.document.write(printContent.innerHTML);
                      printWindow.document.close();
                      printWindow.focus();
                      setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                      }, 250);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir
                  </Button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="ml-2 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
                  >
                    <X className="w-5 h-5 text-slate-600" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-2 block">Comentários (opcional)</label>
                <Textarea
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  placeholder="Adicione observações sobre sua decisão..."
                  rows={2}
                  className="bg-white"
                />
              </div>
            </div>
          </SheetHeader>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Informações da Solicitação */}
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Solicitante:</span>
                    <span className="font-medium">{solicitacao.solicitante_nome}</span>
                  </div>
                  {solicitacao.projeto_nome && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Projeto:</span>
                      <span className="font-medium">{solicitacao.projeto_nome}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Status:</span>
                    <span className="font-medium">{solicitacao.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Prioridade:</span>
                    <Badge
                      variant="outline"
                      className={
                        solicitacao.prioridade === "Urgente"
                          ? "border-red-500 text-red-600"
                          : solicitacao.prioridade === "Alta"
                            ? "border-orange-500 text-orange-600"
                            : "border-blue-500 text-blue-600"
                      }
                    >
                      {solicitacao.prioridade}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Itens */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Itens da Solicitação</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="todos-itens"
                        checked={aprovarTodos}
                        onCheckedChange={toggleTodos}
                      />
                      <label htmlFor="todos-itens" className="text-sm font-medium cursor-pointer">
                        Selecionar Todos
                      </label>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead className="w-24">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-32 text-right">Valor Médio</TableHead>
                          <TableHead className="w-28">Quantidade</TableHead>
                          <TableHead className="w-28 text-right">Qtd. Estoque</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensEnriquecidos.map((item) => (
                          <TableRow
                            key={item.id}
                            className={cn(itensSelecionados.includes(item.id) && "bg-green-50")}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={itensSelecionados.includes(item.id)}
                                onCheckedChange={() => toggleItem(item.id)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              R$ {item.valor_medio.toFixed(2)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantidade_editavel}
                                  onChange={(e) => {
                                    updateQuantidade(item.id, e.target.value);
                                  }}
                                  className="w-20 h-8 text-sm"
                                />
                                <span className="text-xs text-slate-500">{item.unidade}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={
                                  item.quantidade_estoque < item.quantidade_editavel
                                    ? "border-red-500 text-red-600"
                                    : ""
                                }
                              >
                                {item.quantidade_estoque.toFixed(2)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {!aprovarTodos && (
                    <p className="text-xs text-slate-600 mt-3 bg-amber-50 p-2 rounded">
                      {itensSelecionados.length} de {itens.length} item(ns) selecionado(s)
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
