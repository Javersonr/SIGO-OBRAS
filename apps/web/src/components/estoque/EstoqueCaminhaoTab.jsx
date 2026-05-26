import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Truck, Package, ChevronDown, ChevronRight, FileText, Archive } from "lucide-react";
import { toast } from "sonner";
import { gerarListaFerramentalCaminhao } from "@/components/ferramental/ListaFerramentalCaminhao";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import MovimentacaoModal from "@/components/ferramental/MovimentacaoModal";

const STATUS_COLORS = {
  Disponível: "bg-green-100 text-green-700",
  "Em Uso": "bg-blue-100 text-blue-700",
  "Em Manutenção": "bg-orange-100 text-orange-700",
  Danificado: "bg-red-100 text-red-700",
  Inativo: "bg-slate-100 text-slate-700",
  Sucata: "bg-red-100 text-red-700",
};

export default function EstoqueCaminhaoTab({
  empresaAtiva,
  user,
  materiais,
  saldos,
  projetos,
  onRecarregar,
}) {
  const [caminhoes, setCaminhoes] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCaminhao, setExpandedCaminhao] = useState(null);
  const [showMovimentacao, setShowMovimentacao] = useState(false);
  const [ferramentaSelecionada, setFerramentaSelecionada] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const loadData = async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [cams, ferrs] = await Promise.all([
        base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
      ]);
      setCaminhoes(cams.sort((a, b) => (a.placa || "").localeCompare(b.placa || "")));
      setFerramentas(ferrs);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [empresaAtiva?.id]);

  // Ferramentas vinculadas ao caminhão (por placa na localização OU por caminhao_id)
  const getFerramentasCaminhao = (caminhao) => {
    return ferramentas.filter(
      (f) =>
        f.caminhao_id === caminhao.id ||
        (f.localizacao &&
          (f.localizacao === caminhao.placa ||
            f.localizacao.toLowerCase().includes(caminhao.placa?.toLowerCase())))
    );
  };

  const handleExportarPDF = (caminhao) => {
    const ferrs = getFerramentasCaminhao(caminhao);
    if (ferrs.length === 0) {
      toast.error("Nenhuma ferramenta neste caminhão");
      return;
    }
    gerarListaFerramentalCaminhao(caminhao.placa, ferrs, empresaAtiva);
    toast.success("PDF exportado");
  };

  const handleExportarLaudosZip = async (caminhao) => {
    const ferrs = getFerramentasCaminhao(caminhao).filter((f) => f.laudo_url);
    if (ferrs.length === 0) {
      toast.error("Nenhuma ferramenta possui laudo");
      return;
    }
    toast.info(`Baixando ${ferrs.length} laudo(s)...`);
    const zip = new JSZip();
    await Promise.all(
      ferrs.map(async (ferr) => {
        try {
          const response = await fetch(ferr.laudo_url);
          const blob = await response.blob();
          const ext = ferr.laudo_url.split(".").pop().split("?")[0] || "pdf";
          zip.file(
            `${(ferr.descricao || "ferramenta").replace(/[^a-zA-Z0-9 ]/g, "").trim()}_${ferr.numero_laudo || "sem_laudo"}.${ext}`,
            blob
          );
        } catch {}
      })
    );
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `laudos_${caminhao.placa}_${new Date().toISOString().split("T")[0]}.zip`);
    toast.success("ZIP gerado com sucesso!");
  };

  const handleEditCell = (ferr, field) => {
    setEditingCell({ ferrId: ferr.id, field });
    setEditingValue(ferr[field] || "");
  };

  const handleSaveCell = async (ferr, field) => {
    try {
      await base44.entities.Ferramenta.update(ferr.id, { [field]: editingValue });
      setFerramentas((prev) =>
        prev.map((f) => (f.id === ferr.id ? { ...f, [field]: editingValue } : f))
      );
      toast.success("Alterado com sucesso!");
      setEditingCell(null);
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  const EditableCell = ({ ferr, field, type = "text" }) => {
    const isEditing = editingCell?.ferrId === ferr.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
          <Input
            type={type}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            autoFocus
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCell(ferr, field);
              if (e.key === "Escape") setEditingCell(null);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1 text-green-600"
            onClick={() => handleSaveCell(ferr, field)}
          >
            ✓
          </Button>
        </div>
      );
    }
    const val = ferr[field];
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleEditCell(ferr, field);
        }}
        className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded text-xs hover:text-blue-600 min-w-[40px]"
      >
        {field === "data_vencimento_laudo"
          ? val
            ? new Date(val).toLocaleDateString("pt-BR")
            : "-"
          : val || "-"}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Carregando...</div>;
  }

  if (caminhoes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum caminhão cadastrado na aba Configurações</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {caminhoes.map((c) => {
          const ferrsDoC = getFerramentasCaminhao(c);
          const isExpanded = expandedCaminhao === c.id;
          const valorTotal = ferrsDoC.reduce((s, f) => s + (f.valor_unitario || 0), 0);

          return (
            <Card key={c.id} className="border border-slate-200">
              {/* Header do Caminhão */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpandedCaminhao(isExpanded ? null : c.id)}
              >
                <div className="flex items-center gap-4">
                  {c.foto_url ? (
                    <img
                      src={c.foto_url}
                      alt={c.placa}
                      className="w-14 h-14 rounded-lg object-cover border"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-2xl">
                      🚛
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base font-mono">{c.placa}</span>
                      {c.modelo && (
                        <span className="text-slate-500 text-sm">
                          {c.marca} {c.modelo}
                        </span>
                      )}
                      {c.ano && (
                        <Badge variant="outline" className="text-xs">
                          {c.ano}
                        </Badge>
                      )}
                    </div>
                    {c.motorista_padrao_nome && (
                      <p className="text-sm text-slate-500 mt-0.5">👤 {c.motorista_padrao_nome}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-blue-600 font-medium">
                        {ferrsDoC.length} ferramentas
                      </span>
                      {ferrsDoC.length > 0 && (
                        <span className="text-xs text-slate-500">R$ {valorTotal.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Ferramentas do Caminhão */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {/* Ações */}
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                    <p className="text-sm font-medium text-slate-700">Ferramental do Caminhão</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-8"
                        onClick={() => handleExportarPDF(c)}
                      >
                        <FileText className="w-3 h-3" /> Exportar PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-8"
                        onClick={() => handleExportarLaudosZip(c)}
                      >
                        <Archive className="w-3 h-3" /> Laudos ZIP
                      </Button>
                    </div>
                  </div>

                  {ferrsDoC.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma ferramenta vinculada</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      {/* Resumo */}
                      <div className="grid grid-cols-3 gap-3 p-4">
                        <Card>
                          <CardContent className="p-3">
                            <p className="text-xl font-bold">{ferrsDoC.length}</p>
                            <p className="text-xs text-slate-500">Unidades</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-3">
                            <p className="text-xl font-bold">
                              {
                                new Set(
                                  ferrsDoC.map((f) => f.codigo?.split("-").slice(0, 2).join("-"))
                                ).size
                              }
                            </p>
                            <p className="text-xs text-slate-500">Tipos</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-3">
                            <p className="text-xl font-bold text-green-600">
                              R$ {valorTotal.toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-500">Valor total</p>
                          </CardContent>
                        </Card>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead>N° Série</TableHead>
                            <TableHead>N° Laudo</TableHead>
                            <TableHead>Venc. Laudo</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ferrsDoC
                            .sort((a, b) => (a.descricao || "").localeCompare(b.descricao || ""))
                            .map((ferr) => (
                              <TableRow
                                key={ferr.id}
                                className="text-xs hover:bg-slate-50 cursor-pointer"
                                onClick={() => {
                                  setFerramentaSelecionada(ferr);
                                  setShowMovimentacao(true);
                                }}
                              >
                                <TableCell className="font-mono">{ferr.codigo}</TableCell>
                                <TableCell className="font-medium">{ferr.descricao}</TableCell>
                                <TableCell>{ferr.marca || "-"}</TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <EditableCell ferr={ferr} field="numero_serie" />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <EditableCell ferr={ferr} field="numero_laudo" />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <EditableCell
                                    ferr={ferr}
                                    field="data_vencimento_laudo"
                                    type="date"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={`text-xs ${STATUS_COLORS[ferr.status] || "bg-slate-100 text-slate-700"}`}
                                  >
                                    {ferr.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  R$ {(ferr.valor_unitario || 0).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Modal Movimentação */}
      {ferramentaSelecionada && (
        <MovimentacaoModal
          open={showMovimentacao}
          onClose={() => setShowMovimentacao(false)}
          empresaAtiva={empresaAtiva}
          movimentacao={null}
          onSave={async (formData) => {
            try {
              await base44.entities.MovimentacaoFerramenta.create({
                ...formData,
                empresa_id: empresaAtiva.id,
              });
              if (formData.destino && formData.ferramenta_id) {
                await base44.entities.Ferramenta.update(formData.ferramenta_id, {
                  localizacao: formData.destino,
                });
              }
              setShowMovimentacao(false);
              loadData();
            } catch {
              toast.error("Erro ao registrar movimentação");
            }
          }}
        />
      )}
    </>
  );
}
