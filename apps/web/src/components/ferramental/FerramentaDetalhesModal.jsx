import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Edit, Trash2, Package, History, QrCode, User, Copy, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { toast } from "sonner";
import { useEmpresa } from "@/Layout";

const statusColors = {
  Disponível: "bg-green-100 text-green-700",
  "Em Uso": "bg-blue-100 text-blue-700",
  "Em Manutenção": "bg-orange-100 text-orange-700",
  Danificado: "bg-red-100 text-red-700",
  Inativo: "bg-slate-100 text-slate-700",
  Sucata: "bg-red-100 text-red-700",
};

const movimentacaoBadgeClasses = {
  "Entrada Estoque": "bg-teal-50 text-teal-700 border-teal-200",
  "Entrega para Funcionário": "bg-blue-50 text-blue-700 border-blue-200",
  Empréstimo: "bg-purple-50 text-purple-700 border-purple-200",
  Manutenção: "bg-orange-50 text-orange-700 border-orange-200",
  "Baixa para Sucata": "bg-red-50 text-red-700 border-red-200",
  default: "bg-green-50 text-green-700 border-green-200",
};

export default function FerramentaDetalhesModal({
  open,
  onOpenChange,
  ferramentaDetalhes,
  ferramentas,
  historicoMovimentacoes,
  editandoCampoItem,
  setEditandoCampoItem,
  onEditItem,
  onDeleteItem,
  onShowQRCode,
  onDuplicarItem,
  loadData,
}) {
  const { user } = useEmpresa();
  const [showKitModal, setShowKitModal] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [salvandoKit, setSalvandoKit] = useState(false);

  if (!ferramentaDetalhes) return null;

  const itens = ferramentaDetalhes.itens || [];

  const toggleItem = (itemId) => {
    setItensSelecionados((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleAbrirKit = () => {
    setItensSelecionados([]);
    setShowKitModal(true);
  };

  const handleFormarKit = async () => {
    if (itensSelecionados.length < 2) {
      toast.error("Selecione ao menos 2 unidades para formar um kit");
      return;
    }

    setSalvandoKit(true);
    try {
      // Pegar a primeira ferramenta selecionada como base
      const ferramentasBase = ferramentas.filter((f) => itensSelecionados.includes(f.id));
      const base = ferramentasBase[0];
      const quantidade = itensSelecionados.length;

      // Atualizar a primeira unidade para representar o kit (quantidade = N, sem numero_serie)
      await sigo.entities.Ferramenta.update(base.id, {
        quantidade_estoque: quantidade,
        numero_serie: "",
        observacoes: `Kit de ${quantidade} unidades (agrupado em ${new Date().toLocaleDateString("pt-BR")})`,
      });

      // Deletar as demais unidades selecionadas (exceto a base)
      const paraExcluir = itensSelecionados.filter((id) => id !== base.id);
      for (const id of paraExcluir) {
        await sigo.entities.Ferramenta.delete(id);
      }

      toast.success(`Kit formado com ${quantidade} unidades de "${ferramentaDetalhes.descricao}"`);
      setShowKitModal(false);
      setItensSelecionados([]);
      loadData();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao formar kit");
    } finally {
      setSalvandoKit(false);
    }
  };

  return (
    <>
      {/* Modal de formar kit */}
      <SheetModalComponent
        open={showKitModal}
        onOpenChange={(v) => {
          setShowKitModal(v);
          if (!v) setItensSelecionados([]);
        }}
        title="Formar Kit"
        subtitle={`Selecione as unidades de "${ferramentaDetalhes.descricao}" para agrupar`}
        footer={
          <div className="flex justify-between items-center w-full">
            <p className="text-sm text-slate-500">
              {itensSelecionados.length} unidade(s) selecionada(s)
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowKitModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleFormarKit}
                disabled={salvandoKit || itensSelecionados.length < 2}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {salvandoKit ? "Agrupando..." : `Agrupar ${itensSelecionados.length} unidades`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 p-1">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-semibold mb-1">⚠️ Como funciona o Kit</p>
            <p>
              As unidades selecionadas serão <strong>agrupadas em um único registro</strong> com
              quantidade total. Útil para itens sem número de série (ex: bandeirolas, cones, cabos).
              As unidades individuais serão deletadas e substituídas por um único registro com
              quantidade.
            </p>
          </div>

          <p className="text-sm font-semibold text-slate-700">
            Selecione as unidades para agrupar:
          </p>

          <div className="space-y-2">
            {itens.map((item) => {
              const ferramentaCompleta = ferramentas.find((f) => f.id === item.id);
              const selecionado = itensSelecionados.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selecionado
                      ? "border-amber-400 bg-amber-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => toggleItem(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-semibold text-blue-600">
                      {ferramentaCompleta?.codigo || item.id.slice(-8)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.localizacao || "Sem localização"}
                      {item.numero_serie ? ` · Série: ${item.numero_serie}` : ""}
                    </p>
                  </div>
                  <Badge className={statusColors[item.status] + " text-xs"}>
                    {item.status || "Disponível"}
                  </Badge>
                </div>
              );
            })}
          </div>

          {itens.length < 2 && (
            <p className="text-center text-slate-400 text-sm py-4">
              São necessárias ao menos 2 unidades para formar um kit.
            </p>
          )}
        </div>
      </SheetModalComponent>

      {/* Modal principal */}
      <SheetModalComponent
        open={open}
        onOpenChange={onOpenChange}
        title={`Ferramenta: ${ferramentaDetalhes?.descricao || ""}`}
        subtitle={
          ferramentaDetalhes?.controle_individual
            ? `${ferramentaDetalhes?.itens?.length || 0} unidade(s) cadastrada(s) (controle individual)`
            : `Quantidade total: ${(ferramentaDetalhes?.itens || []).reduce((s, i) => s + (i.quantidade_estoque || 1), 0)} unidade(s)`
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        {ferramentaDetalhes && ferramentaDetalhes.itens && (
          <div className="space-y-6">
            <Card className="p-4 bg-slate-50">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Código Base</p>
                  <p className="font-semibold text-slate-800">{ferramentaDetalhes.codigo}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Tipo</p>
                  <p className="font-semibold text-slate-800">
                    {ferramentaDetalhes.tipo || "Ferramenta"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-slate-500">Descrição</p>
                  <p className="font-semibold text-slate-800">{ferramentaDetalhes.descricao}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Marca</p>
                  <p className="font-semibold text-slate-800">{ferramentaDetalhes.marca || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Quantidade Total</p>
                  <p className="font-semibold text-amber-600 text-lg">
                    {ferramentaDetalhes.controle_individual
                      ? ferramentaDetalhes.itens?.length || 0
                      : (ferramentaDetalhes.itens || []).reduce(
                          (s, i) => s + (i.quantidade_estoque || 1),
                          0
                        )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Valor Unitário</p>
                  <p className="font-semibold text-slate-800">
                    R$ {(ferramentaDetalhes.valor_unitario || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Valor Total</p>
                  <p className="font-semibold text-green-600 text-lg">
                    R${" "}
                    {(
                      (ferramentaDetalhes.valor_unitario || 0) *
                      (ferramentaDetalhes.itens?.length || 0)
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
            </Card>

            <Tabs defaultValue="unidades" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="unidades" className="gap-2">
                  <Package className="w-4 h-4" />
                  Unidades ({ferramentaDetalhes.itens?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-2">
                  <History className="w-4 h-4" />
                  Histórico ({historicoMovimentacoes.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="unidades" className="space-y-3">
                {/* Botão Formar Kit */}
                {itens.length >= 2 && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                      onClick={handleAbrirKit}
                    >
                      <Layers className="w-4 h-4" />
                      Formar Kit (agrupar unidades)
                    </Button>
                  </div>
                )}

                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sub-Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Nº Série</TableHead>
                        <TableHead>N° Laudo</TableHead>
                        <TableHead>Vencimento Laudo</TableHead>
                        <TableHead>CA</TableHead>
                        <TableHead className="w-32">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ferramentaDetalhes.itens || []).map((item) => {
                        const ferramentaCompleta = ferramentas.find((f) => f.id === item.id);
                        let localizacaoDisplay = "-";
                        if (item.funcionario_nome) {
                          localizacaoDisplay = `👤 ${item.funcionario_nome}`;
                        } else if (item.status === "Em Manutenção" && item.fornecedor_nome) {
                          localizacaoDisplay = `🔧 ${item.fornecedor_nome}`;
                        } else if (item.localizacao) {
                          const loc = item.localizacao.toLowerCase();
                          localizacaoDisplay =
                            loc.includes("caminhão") || loc.includes("caminhao")
                              ? `🚛 ${item.localizacao}`
                              : `📦 ${item.localizacao}`;
                        }

                        return (
                          <TableRow key={item.id} className="hover:bg-slate-50">
                            <TableCell className="font-mono text-sm font-medium">
                              {ferramentaCompleta?.codigo || "-"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {ferramentaDetalhes.descricao}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{localizacaoDisplay}</div>
                            </TableCell>
                            <TableCell>
                              {item.status && (
                                <Badge className={statusColors[item.status] + " text-xs"}>
                                  {item.status}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell
                              className="font-mono text-sm cursor-pointer hover:bg-amber-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditandoCampoItem({
                                  itemId: item.id,
                                  campo: "numero_serie",
                                  valor: item.numero_serie || "",
                                });
                              }}
                            >
                              {editandoCampoItem.itemId === item.id &&
                              editandoCampoItem.campo === "numero_serie" ? (
                                <Input
                                  autoFocus
                                  value={editandoCampoItem.valor}
                                  onChange={(e) =>
                                    setEditandoCampoItem({
                                      ...editandoCampoItem,
                                      valor: e.target.value,
                                    })
                                  }
                                  onBlur={async () => {
                                    try {
                                      await sigo.entities.Ferramenta.update(item.id, {
                                        numero_serie: editandoCampoItem.valor,
                                      });
                                      toast.success("Nº de série atualizado");
                                      setEditandoCampoItem({});
                                      loadData();
                                    } catch (error) {
                                      toast.error("Erro ao atualizar");
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.target.blur();
                                    if (e.key === "Escape") setEditandoCampoItem({});
                                  }}
                                  className="h-7 text-sm"
                                />
                              ) : (
                                item.numero_serie || "-"
                              )}
                            </TableCell>
                            <TableCell
                              className="font-mono text-sm cursor-pointer hover:bg-amber-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditandoCampoItem({
                                  itemId: ferramentaCompleta?.id,
                                  campo: "numero_laudo",
                                  valor: ferramentaCompleta?.numero_laudo || "",
                                });
                              }}
                            >
                              {editandoCampoItem.itemId === ferramentaCompleta?.id &&
                              editandoCampoItem.campo === "numero_laudo" ? (
                                <Input
                                  autoFocus
                                  value={editandoCampoItem.valor}
                                  onChange={(e) =>
                                    setEditandoCampoItem({
                                      ...editandoCampoItem,
                                      valor: e.target.value,
                                    })
                                  }
                                  onBlur={async () => {
                                    try {
                                      await sigo.entities.Ferramenta.update(ferramentaCompleta.id, {
                                        numero_laudo: editandoCampoItem.valor,
                                      });
                                      toast.success("Nº de laudo atualizado");
                                      setEditandoCampoItem({});
                                      loadData();
                                    } catch (error) {
                                      toast.error("Erro ao atualizar");
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.target.blur();
                                    if (e.key === "Escape") setEditandoCampoItem({});
                                  }}
                                  className="h-7 text-sm"
                                />
                              ) : (
                                ferramentaCompleta?.numero_laudo || "-"
                              )}
                            </TableCell>
                            <TableCell
                              className="text-sm cursor-pointer hover:bg-amber-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditandoCampoItem({
                                  itemId: ferramentaCompleta?.id,
                                  campo: "data_vencimento_laudo",
                                  valor: ferramentaCompleta?.data_vencimento_laudo || "",
                                });
                              }}
                            >
                              {editandoCampoItem.itemId === ferramentaCompleta?.id &&
                              editandoCampoItem.campo === "data_vencimento_laudo" ? (
                                <Input
                                  type="date"
                                  autoFocus
                                  value={editandoCampoItem.valor}
                                  onChange={(e) =>
                                    setEditandoCampoItem({
                                      ...editandoCampoItem,
                                      valor: e.target.value,
                                    })
                                  }
                                  onBlur={async () => {
                                    try {
                                      await sigo.entities.Ferramenta.update(ferramentaCompleta.id, {
                                        data_vencimento_laudo: editandoCampoItem.valor,
                                      });
                                      toast.success("Data de vencimento atualizada");
                                      setEditandoCampoItem({});
                                      loadData();
                                    } catch (error) {
                                      toast.error("Erro ao atualizar");
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.target.blur();
                                    if (e.key === "Escape") setEditandoCampoItem({});
                                  }}
                                  className="h-7 text-sm"
                                />
                              ) : ferramentaCompleta?.data_vencimento_laudo ? (
                                new Date(
                                  ferramentaCompleta.data_vencimento_laudo
                                ).toLocaleDateString("pt-BR")
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {ferramentaCompleta?.ca || "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onShowQRCode(ferramentaCompleta, item)}
                                  title="Ver QR Code"
                                  className="h-7 w-7"
                                >
                                  <QrCode className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onEditItem(ferramentaCompleta)}
                                  title="Editar"
                                  className="h-7 w-7"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onDuplicarItem(ferramentaCompleta)}
                                  title="Duplicar com novo código"
                                  className="h-7 w-7"
                                >
                                  <Copy className="w-3 h-3 text-blue-500" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onDeleteItem(item.id)}
                                  title="Excluir"
                                  className="h-7 w-7"
                                >
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              <TabsContent value="historico">
                {historicoMovimentacoes.length === 0 ? (
                  <Card className="p-8">
                    <div className="text-center text-slate-500">
                      <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Nenhuma movimentação registrada</p>
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Sub-Código</TableHead>
                          <TableHead>Qtd.</TableHead>
                          <TableHead>Nº Série</TableHead>
                          <TableHead>Origem/Destino</TableHead>
                          <TableHead>Usuário</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historicoMovimentacoes.map((mov) => {
                          const ferramentaLocal = ferramentaDetalhes?.itens?.find(
                            (item) => item.id === mov.ferramenta_id
                          );
                          const ferramentaCompleta = ferramentas.find(
                            (f) => f.id === mov.ferramenta_id
                          );
                          return (
                            <TableRow key={mov.id} className="hover:bg-slate-50">
                              <TableCell>
                                <Badge
                                  className={`border text-xs ${movimentacaoBadgeClasses[mov.tipo_movimentacao] || movimentacaoBadgeClasses["default"]}`}
                                >
                                  {mov.tipo_movimentacao}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {new Date(
                                  mov.data_movimentacao || mov.created_date
                                ).toLocaleDateString("pt-BR")}
                                <br />
                                <span className="text-xs text-slate-500">
                                  {new Date(
                                    mov.data_movimentacao || mov.created_date
                                  ).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {ferramentaCompleta?.codigo || mov.ferramenta_codigo || "-"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">
                                  {mov.quantidade || 1}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm font-mono">
                                {ferramentaLocal?.numero_serie || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                <div className="flex flex-col gap-0.5">
                                  {mov.origem && (
                                    <div className="text-xs text-slate-500">De: {mov.origem}</div>
                                  )}
                                  {mov.destino && (
                                    <div className="text-xs">Para: {mov.destino}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span className="truncate max-w-[120px]" title={mov.usuario_nome}>
                                    {mov.usuario_nome || "-"}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            {ferramentaDetalhes.foto_url && (
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Imagem</h3>
                <Card className="p-4">
                  <img
                    src={ferramentaDetalhes.foto_url}
                    alt={ferramentaDetalhes.descricao}
                    className="w-full rounded-lg object-contain max-h-64"
                  />
                </Card>
              </div>
            )}
          </div>
        )}
      </SheetModalComponent>
    </>
  );
}
