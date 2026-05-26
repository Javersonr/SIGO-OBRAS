import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Edit2,
  Image,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";

export default function ChecklistManagerModal({ open, onOpenChange, empresaAtiva }) {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState(null); // null = lista, objeto = editar
  const [form, setForm] = useState({ nome: "", descricao: "", categoria: "", itens: [] });
  const [novoItem, setNovoItem] = useState({ nome: "", descricao: "", obrigatorio: true });
  const [uploadingFoto, setUploadingFoto] = useState(null); // index do item

  useEffect(() => {
    if (open && empresaAtiva?.id) loadChecklists();
  }, [open, empresaAtiva?.id]);

  const loadChecklists = async () => {
    setLoading(true);
    try {
      const data = await sigo.entities.ChecklistInspecaoCampo.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setChecklists(data);
    } catch {
      toast.error("Erro ao carregar checklists");
    } finally {
      setLoading(false);
    }
  };

  const handleNovo = () => {
    setForm({ nome: "", descricao: "", categoria: "", itens: [] });
    setEditando("novo");
  };

  const handleEditar = (cl) => {
    setForm({
      nome: cl.nome || "",
      descricao: cl.descricao || "",
      categoria: cl.categoria || "",
      itens: cl.itens ? JSON.parse(cl.itens) : [],
    });
    setEditando(cl);
  };

  const handleExcluir = async (cl) => {
    if (!confirm(`Excluir checklist "${cl.nome}"?`)) return;
    try {
      await sigo.entities.ChecklistInspecaoCampo.update(cl.id, { ativo: false });
      toast.success("Checklist excluído");
      loadChecklists();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const handleSalvar = async () => {
    if (!form.nome) {
      toast.error("Informe o nome do checklist");
      return;
    }
    if (form.itens.length === 0) {
      toast.error("Adicione ao menos um item");
      return;
    }
    try {
      const data = {
        empresa_id: empresaAtiva.id,
        nome: form.nome,
        descricao: form.descricao,
        categoria: form.categoria,
        itens: JSON.stringify(
          form.itens.map((it, i) => ({ ...it, id: it.id || `item_${i}_${Date.now()}` }))
        ),
        total_itens: form.itens.length,
        ativo: true,
      };
      if (editando === "novo") {
        await sigo.entities.ChecklistInspecaoCampo.create(data);
        toast.success("Checklist criado");
      } else {
        await sigo.entities.ChecklistInspecaoCampo.update(editando.id, data);
        toast.success("Checklist atualizado");
      }
      setEditando(null);
      loadChecklists();
    } catch {
      toast.error("Erro ao salvar");
    }
  };

  const handleAdicionarItem = () => {
    if (!novoItem.nome) {
      toast.error("Informe o nome do item");
      return;
    }
    setForm((prev) => ({
      ...prev,
      itens: [...prev.itens, { ...novoItem, id: `item_${Date.now()}`, foto_referencia_url: "" }],
    }));
    setNovoItem({ nome: "", descricao: "", obrigatorio: true });
  };

  const handleRemoverItem = (idx) => {
    setForm((prev) => ({ ...prev, itens: prev.itens.filter((_, i) => i !== idx) }));
  };

  const handleUploadFotoReferencia = async (e, idx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(idx);
    try {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      setForm((prev) => {
        const itens = [...prev.itens];
        itens[idx] = { ...itens[idx], foto_referencia_url: file_url };
        return { ...prev, itens };
      });
      toast.success("Foto de referência enviada");
    } catch {
      toast.error("Erro ao enviar foto");
    } finally {
      setUploadingFoto(null);
      e.target.value = "";
    }
  };

  const handleDuplicarChecklist = async (cl) => {
    try {
      const itens = cl.itens ? JSON.parse(cl.itens) : [];
      const copia = {
        empresa_id: empresaAtiva.id,
        nome: `${cl.nome} (cópia)`,
        descricao: cl.descricao || "",
        categoria: cl.categoria || "",
        itens: JSON.stringify(itens.map((it, i) => ({ ...it, id: `item_${i}_${Date.now()}` }))),
        total_itens: itens.length,
        ativo: true,
      };
      await sigo.entities.ChecklistInspecaoCampo.create(copia);
      toast.success("Checklist duplicado");
      loadChecklists();
    } catch {
      toast.error("Erro ao duplicar");
    }
  };

  const handleExportarChecklist = async (cl) => {
    const XLSX = await import("xlsx");
    const itens = cl.itens ? JSON.parse(cl.itens) : [];
    const rows = itens.map((it, i) => ({
      Ordem: i + 1,
      "Nome do Item": it.nome,
      Descrição: it.descricao || "",
      Obrigatório: it.obrigatorio ? "Sim" : "Não",
      "Foto Referência": it.foto_referencia_url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    XLSX.writeFile(wb, `checklist_${cl.nome.replace(/\s+/g, "_")}.xlsx`);
    toast.success("Excel exportado");
  };

  const handleImportarItens = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const novosItens = rows
        .map((row, i) => ({
          id: `item_${i}_${Date.now()}`,
          nome: row["Nome do Item"] || row["nome"] || row["NOME"] || "",
          descricao: row["Descrição"] || row["descricao"] || "",
          obrigatorio:
            (row["Obrigatório"] || row["obrigatorio"] || "").toString().toLowerCase() !== "não",
          foto_referencia_url: row["Foto Referência"] || row["foto_referencia_url"] || "",
        }))
        .filter((it) => it.nome);
      if (novosItens.length === 0) {
        toast.error("Nenhum item válido encontrado");
        return;
      }
      setForm((prev) => ({ ...prev, itens: [...prev.itens, ...novosItens] }));
      toast.success(`${novosItens.length} itens importados`);
    } catch {
      toast.error("Erro ao importar arquivo");
    } finally {
      e.target.value = "";
    }
  };

  const handleMoverItem = (idx, dir) => {
    const itens = [...form.itens];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= itens.length) return;
    [itens[idx], itens[newIdx]] = [itens[newIdx], itens[idx]];
    setForm((prev) => ({ ...prev, itens }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-fullscreen-modal
        className="p-0 flex flex-col !rounded-none !border-0"
        style={{
          position: "fixed",
          left: "256px",
          top: "64px",
          right: 0,
          bottom: 0,
          width: "calc(100vw - 256px)",
          height: "calc(100vh - 64px)",
          maxWidth: "none",
          maxHeight: "none",
          transform: "none",
        }}
      >
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>
              {editando
                ? editando === "novo"
                  ? "Novo Checklist"
                  : `Editar: ${editando.nome}`
                : "Modelos de Checklist"}
            </DialogTitle>
            {!editando && (
              <Button onClick={handleNovo} className="bg-amber-500 hover:bg-amber-600 gap-2">
                <Plus className="w-4 h-4" /> Novo Checklist
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Lista de checklists */}
          {!editando && (
            <div className="space-y-3">
              {loading ? (
                <p className="text-center text-slate-400">Carregando...</p>
              ) : checklists.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">Nenhum checklist cadastrado</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Crie um modelo de checklist para usar nas inspeções
                  </p>
                </div>
              ) : (
                checklists.map((cl) => (
                  <div
                    key={cl.id}
                    className="border rounded-lg p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800">{cl.nome}</p>
                      {cl.categoria && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {cl.categoria}
                        </Badge>
                      )}
                      <p className="text-sm text-slate-500 mt-1">{cl.total_itens || 0} itens</p>
                      {cl.descricao && (
                        <p className="text-xs text-slate-400 mt-1">{cl.descricao}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEditar(cl)}
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDuplicarChecklist(cl)}
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleExportarChecklist(cl)}
                        title="Exportar Excel"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleExcluir(cl)}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Formulário de edição */}
          {editando && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nome do Checklist *</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Ex: Inspeção de EPI"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input
                    value={form.categoria}
                    onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
                    placeholder="Ex: EPI, Veículos, Campo"
                    className="mt-1.5"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    rows={2}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Itens */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800">
                    Itens do Checklist ({form.itens.length})
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={async () => {
                        try {
                          const response = await sigo.functions.invoke("gerarModeloChecklistExcel");
                          const blob = new Blob([response.data], {
                            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          });
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "modelo_checklist_inspecao.xlsx";
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          a.remove();
                          toast.success("Modelo baixado");
                        } catch (e) {
                          toast.error("Erro ao baixar modelo");
                        }
                      }}
                    >
                      <Download className="w-4 h-4" />
                      Modelo
                    </Button>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" className="gap-2" asChild>
                        <span>
                          <FileSpreadsheet className="w-4 h-4" />
                          Importar de Excel
                        </span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportarItens}
                      />
                    </label>
                  </div>
                </div>

                {/* Adicionar novo item */}
                <div className="border rounded-lg p-4 bg-slate-50 mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Adicionar Item</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Input
                        value={novoItem.nome}
                        onChange={(e) => setNovoItem((p) => ({ ...p, nome: e.target.value }))}
                        placeholder="Nome do item *"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        value={novoItem.descricao}
                        onChange={(e) => setNovoItem((p) => ({ ...p, descricao: e.target.value }))}
                        placeholder="Descrição (opcional)"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="obrig"
                        checked={novoItem.obrigatorio}
                        onChange={(e) =>
                          setNovoItem((p) => ({ ...p, obrigatorio: e.target.checked }))
                        }
                        className="w-4 h-4"
                      />
                      <label htmlFor="obrig" className="text-sm text-slate-600">
                        Obrigatório
                      </label>
                    </div>
                    <Button
                      onClick={handleAdicionarItem}
                      className="bg-amber-500 hover:bg-amber-600 gap-2"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </Button>
                  </div>
                </div>

                {/* Lista de itens */}
                <div className="space-y-2">
                  {form.itens.map((item, idx) => (
                    <div key={idx} className="border rounded-lg p-3 flex items-start gap-3">
                      {/* Foto referência */}
                      <div className="flex-shrink-0">
                        {item.foto_referencia_url ? (
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                            <img
                              src={item.foto_referencia_url}
                              alt="Ref"
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() =>
                                setForm((p) => {
                                  const itens = [...p.itens];
                                  itens[idx] = { ...itens[idx], foto_referencia_url: "" };
                                  return { ...p, itens };
                                })
                              }
                              className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white flex items-center justify-center rounded-bl"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="w-16 h-16 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-amber-400 bg-slate-50">
                            {uploadingFoto === idx ? (
                              <span className="text-xs text-slate-400">...</span>
                            ) : (
                              <>
                                <Image className="w-5 h-5 text-slate-300" />
                                <span className="text-xs text-slate-400 mt-0.5">Foto</span>
                              </>
                            )}
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => handleUploadFotoReferencia(e, idx)}
                            />
                          </label>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800">{item.nome}</p>
                        {item.descricao && (
                          <p className="text-xs text-slate-500">{item.descricao}</p>
                        )}
                        {item.obrigatorio && (
                          <Badge className="text-xs mt-1 bg-red-100 text-red-700">
                            Obrigatório
                          </Badge>
                        )}
                        {item.foto_referencia_url && (
                          <p className="text-xs text-green-600 mt-1">✓ Foto referência</p>
                        )}
                      </div>
                      {/* Ações */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMoverItem(idx, -1)}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMoverItem(idx, 1)}
                          disabled={idx === form.itens.length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoverItem(idx)}
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {form.itens.length === 0 && (
                    <p className="text-center text-slate-400 py-4 text-sm">
                      Nenhum item adicionado
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0 flex gap-3 justify-end">
          {editando ? (
            <>
              <Button variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvar} className="bg-amber-500 hover:bg-amber-600">
                Salvar Checklist
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
