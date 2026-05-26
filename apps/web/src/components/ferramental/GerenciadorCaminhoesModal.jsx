import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Truck, Package, Search, ArrowRightLeft, FileText, Archive } from "lucide-react";
import SheetModalComponent from "@/components/ui/sheet-modal";
import MovimentacaoModal from "@/components/ferramental/MovimentacaoModal";
import { toast } from "sonner";
import { gerarListaFerramentalCaminhao } from "@/components/ferramental/ListaFerramentalCaminhao";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function GerenciadorCaminhoesModal({
  open,
  onOpenChange,
  ferramentas,
  onAlmoxarifadoUpdated,
}) {
  const { empresaAtiva } = useEmpresa();
  const [caminhoes, setCaminhoes] = useState([]);
  const [camposObrigatorios, setCamposObrigatorios] = useState([]);
  const [selectedCaminhao, setSelectedCaminhao] = useState(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [showMovimentacao, setShowMovimentacao] = useState(false);
  const [ferramentaSelecionada, setFerramentaSelecionada] = useState(null);

  useEffect(() => {
    if (open && empresaAtiva?.id) {
      base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true })
        .then((cams) =>
          setCaminhoes(cams.sort((a, b) => (a.placa || "").localeCompare(b.placa || "")))
        )
        .catch(() => {});
    }
  }, [open, empresaAtiva?.id]);

  useEffect(() => {
    if (showDetalhes && selectedCaminhao?.id && empresaAtiva?.id) {
      base44.entities.CaminhaoCampoObrigatorio.filter({
        empresa_id: empresaAtiva.id,
        caminhao_id: selectedCaminhao.id,
        ativo: true,
      })
        .then((c) =>
          setCamposObrigatorios(
            c.sort((a, b) => (a.nome_campo || "").localeCompare(b.nome_campo || ""))
          )
        )
        .catch(() => setCamposObrigatorios([]));
    } else {
      setCamposObrigatorios([]);
    }
  }, [showDetalhes, selectedCaminhao?.id, empresaAtiva?.id]);

  // Ferramentas vinculadas ao caminhão via caminhao_id
  const getFerramentasCaminhao = (caminhao) =>
    ferramentas.filter((f) => f.caminhao_id === caminhao.id);

  const ferramentasNoCaminhao = selectedCaminhao ? getFerramentasCaminhao(selectedCaminhao) : [];

  const handleExportarListaPDF = () => {
    if (ferramentasNoCaminhao.length === 0) {
      toast.error("Nenhuma ferramenta neste caminhão");
      return;
    }
    gerarListaFerramentalCaminhao(selectedCaminhao.placa, ferramentasNoCaminhao, empresaAtiva);
    toast.success("Lista exportada em PDF");
  };

  const handleExportarLaudosZip = async () => {
    const comLaudo = ferramentasNoCaminhao.filter((f) => f.laudo_url);
    if (comLaudo.length === 0) {
      toast.error("Nenhuma ferramenta possui laudo anexado");
      return;
    }
    toast.info(`Baixando ${comLaudo.length} laudo(s)...`);
    const zip = new JSZip();
    await Promise.all(
      comLaudo.map(async (ferr) => {
        try {
          const blob = await fetch(ferr.laudo_url).then((r) => r.blob());
          const ext = ferr.laudo_url.split(".").pop().split("?")[0] || "pdf";
          zip.file(
            `${(ferr.descricao || "ferramenta").replace(/[^a-zA-Z0-9 ]/g, "").trim()}_${ferr.numero_laudo || "sem_laudo"}.${ext}`,
            blob
          );
        } catch {}
      })
    );
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(
      zipBlob,
      `laudos_${selectedCaminhao.placa}_${new Date().toISOString().split("T")[0]}.zip`
    );
    toast.success("ZIP gerado com sucesso!");
  };

  const handleEditCell = (ferr, field) => {
    setEditingCell({ ferrId: ferr.id, field });
    setEditingValue(ferr[field] || "");
  };

  const handleSaveCell = async (ferr, field) => {
    try {
      await base44.entities.Ferramenta.update(ferr.id, { [field]: editingValue });
      toast.success("Alterado com sucesso!");
      setEditingCell(null);
      onAlmoxarifadoUpdated?.();
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  const statusColors = {
    Disponível: "bg-green-100 text-green-700",
    "Em Uso": "bg-blue-100 text-blue-700",
    "Em Manutenção": "bg-orange-100 text-orange-700",
    Danificado: "bg-red-100 text-red-700",
    Inativo: "bg-slate-100 text-slate-700",
    Sucata: "bg-red-100 text-red-700",
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

  const filteredCaminhoes = caminhoes.filter(
    (c) =>
      !searchTerm ||
      c.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.modelo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.motorista_padrao_nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title="Ferramental por Caminhão"
      subtitle="Visualize as ferramentas vinculadas a cada caminhão"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar caminhão por placa, modelo ou motorista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredCaminhoes.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum caminhão encontrado</p>
            <p className="text-sm mt-1">Cadastre caminhões em Configurações → Caminhões</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredCaminhoes.map((c) => {
              const ferrsDoC = getFerramentasCaminhao(c);
              return (
                <Card
                  key={c.id}
                  className="p-4 hover:border-slate-300 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedCaminhao(c);
                    setShowDetalhes(true);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl">
                        🚛
                      </div>
                      <div>
                        <p className="font-bold font-mono text-slate-800">{c.placa}</p>
                        <p className="text-sm text-slate-500">
                          {[c.marca, c.modelo].filter(Boolean).join(" ")}
                          {c.motorista_padrao_nome ? ` · ${c.motorista_padrao_nome}` : ""}
                        </p>
                        <p className="text-xs text-blue-600 font-medium mt-0.5">
                          {ferrsDoC.length} ferramenta(s) vinculada(s)
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Ver Ferramental
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Detalhes */}
      {selectedCaminhao && (
        <SheetModalComponent
          open={showDetalhes}
          onOpenChange={setShowDetalhes}
          title={`🚛 ${selectedCaminhao.placa} — Ferramental`}
          footer={
            <div className="flex justify-between items-center flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setFerramentaSelecionada(ferramentasNoCaminhao[0] || null);
                  setShowMovimentacao(true);
                }}
              >
                <ArrowRightLeft className="w-4 h-4" /> Movimentar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={handleExportarListaPDF}>
                  <FileText className="w-4 h-4" /> PDF
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleExportarLaudosZip}>
                  <Archive className="w-4 h-4" /> Laudos ZIP
                </Button>
                <Button variant="outline" onClick={() => setShowDetalhes(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold">{ferramentasNoCaminhao.length}</p>
                  <p className="text-xs text-slate-500">Unidades</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold">
                    {new Set(ferramentasNoCaminhao.map((f) => f.descricao?.toLowerCase())).size}
                  </p>
                  <p className="text-xs text-slate-500">Tipos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    R${" "}
                    {ferramentasNoCaminhao
                      .reduce((s, f) => s + (f.valor_unitario || 0), 0)
                      .toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500">Valor total</p>
                </CardContent>
              </Card>
            </div>

            {ferramentasNoCaminhao.length === 0 && camposObrigatorios.length === 0 && (
              <Card className="p-8 text-center text-slate-400">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma ferramenta vinculada a este caminhão</p>
                <p className="text-xs mt-1">
                  Use Movimentações → Movimentação para Caminhão para vincular
                </p>
              </Card>
            )}

            {/* Campos Obrigatórios com ferramentas */}
            {camposObrigatorios.length > 0 &&
              (() => {
                const todasEmCampos = new Set();
                const campos = camposObrigatorios.map((campo) => {
                  let ferrIds = [];
                  try {
                    ferrIds = JSON.parse(campo.ferramenta_ids || "[]");
                  } catch {}
                  const ferrsNoCampo = ferramentasNoCaminhao.filter((f) => ferrIds.includes(f.id));
                  ferrsNoCampo.forEach((f) => todasEmCampos.add(f.id));
                  return {
                    ...campo,
                    ferrsNoCampo,
                    conforme: ferrsNoCampo.length >= campo.quantidade_obrigatoria,
                  };
                });
                const semCampo = ferramentasNoCaminhao.filter((f) => !todasEmCampos.has(f.id));

                return (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                      Campos Obrigatórios
                    </h3>
                    {campos.map((campo) => (
                      <div key={campo.id} className="border rounded-lg overflow-hidden">
                        <div
                          className={`flex items-center justify-between px-4 py-2 ${campo.conforme ? "bg-green-50" : "bg-red-50"}`}
                        >
                          <div>
                            <span className="font-semibold text-sm">{campo.nome_campo}</span>
                            {campo.descricao && (
                              <span className="text-xs text-slate-500 ml-2">{campo.descricao}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">
                              {campo.ferrsNoCampo.length}/{campo.quantidade_obrigatoria}
                            </span>
                            <Badge
                              className={
                                campo.conforme
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {campo.conforme ? "✓ Conforme" : "✗ Pendente"}
                            </Badge>
                          </div>
                        </div>
                        {campo.ferrsNoCampo.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>N° Série</TableHead>
                                <TableHead>N° Laudo</TableHead>
                                <TableHead>Venc. Laudo</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {campo.ferrsNoCampo.map((ferr) => (
                                <TableRow
                                  key={ferr.id}
                                  className="hover:bg-slate-50 text-sm cursor-pointer"
                                  onClick={() => {
                                    setFerramentaSelecionada(ferr);
                                    setShowMovimentacao(true);
                                  }}
                                >
                                  <TableCell className="font-mono text-xs">{ferr.codigo}</TableCell>
                                  <TableCell>{ferr.descricao}</TableCell>
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
                                      className={
                                        statusColors[ferr.status] || "bg-slate-100 text-slate-700"
                                      }
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
                        ) : (
                          <p className="text-xs text-slate-400 italic px-4 py-2">
                            Nenhuma ferramenta vinculada a este campo
                          </p>
                        )}
                      </div>
                    ))}

                    {semCampo.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50">
                          <span className="font-semibold text-sm text-slate-600">
                            Sem Campo Vinculado ({semCampo.length})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {semCampo.map((ferr) => (
                              <TableRow
                                key={ferr.id}
                                className="hover:bg-slate-50 text-sm cursor-pointer"
                                onClick={() => {
                                  setFerramentaSelecionada(ferr);
                                  setShowMovimentacao(true);
                                }}
                              >
                                <TableCell className="font-mono text-xs">{ferr.codigo}</TableCell>
                                <TableCell>{ferr.descricao}</TableCell>
                                <TableCell>
                                  <Badge
                                    className={
                                      statusColors[ferr.status] || "bg-slate-100 text-slate-700"
                                    }
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
                );
              })()}

            {/* Sem campos obrigatórios - tabela simples */}
            {camposObrigatorios.length === 0 && ferramentasNoCaminhao.length > 0 && (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
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
                    {ferramentasNoCaminhao.map((ferr) => (
                      <TableRow
                        key={ferr.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          setFerramentaSelecionada(ferr);
                          setShowMovimentacao(true);
                        }}
                      >
                        <TableCell className="font-mono text-xs">{ferr.codigo}</TableCell>
                        <TableCell>{ferr.descricao}</TableCell>
                        <TableCell>{ferr.marca || "-"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <EditableCell ferr={ferr} field="numero_serie" />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <EditableCell ferr={ferr} field="numero_laudo" />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <EditableCell ferr={ferr} field="data_vencimento_laudo" type="date" />
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={statusColors[ferr.status] || "bg-slate-100 text-slate-700"}
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
              </Card>
            )}
          </div>
        </SheetModalComponent>
      )}

      {/* Modal Movimentação */}
      {showMovimentacao && (
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
              if (formData.ferramenta_id) {
                await base44.entities.Ferramenta.update(formData.ferramenta_id, {
                  localizacao: formData.destino,
                  caminhao_id:
                    formData.tipo_movimentacao === "Movimentação para Caminhão"
                      ? formData.almoxarifado_id
                      : "",
                });
              }
              setShowMovimentacao(false);
              onAlmoxarifadoUpdated?.();
            } catch (error) {
              console.error("Erro ao salvar movimentação:", error);
            }
          }}
        />
      )}
    </SheetModalComponent>
  );
}
