import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";

import { Plus, Trash2, ShieldCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export default function SelecionarEpisModal({
  open,
  onClose,
  onConfirm,
  empresaAtiva,
  funcao,
  episJaSelecionados = [],
}) {
  const [allEpis, setAllEpis] = useState([]);
  const [selectedEpis, setSelectedEpis] = useState(
    episJaSelecionados.length > 0 ? episJaSelecionados : []
  );
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);

  useEffect(() => {
    if (open && empresaAtiva) {
      loadEpis();
      setSelectedEpis(episJaSelecionados);
    }
  }, [open, empresaAtiva, episJaSelecionados]);

  const loadEpis = async () => {
    setLoading(true);
    try {
      const result = await base44.entities.Ferramental.filter({
        empresa_id: empresaAtiva.id,
        categoria: "EPI",
      });
      setAllEpis(result);
    } catch (error) {
      console.error("Erro ao carregar EPIs:", error);
      toast.error("Erro ao carregar EPIs");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchEpi = (value) => {
    setSearchTerm(value);
    if (value.trim()) {
      const filtered = allEpis.filter(
        (epi) =>
          epi.nome?.toLowerCase().includes(value.toLowerCase()) ||
          epi.codigo?.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const isLuvaDupla = (nome) => {
    const n = (nome || "").toLowerCase();
    return (
      (n.includes("luva") && n.includes("borracha")) || (n.includes("luva") && n.includes("couro"))
    );
  };

  const handleSelectEpi = (epi) => {
    const novoItem = {
      id: epi.id,
      item: epi.nome,
      codigo: epi.codigo || "",
      ca: epi.ca || "",
      quantidade: 1,
      validade: "",
    };
    if (isLuvaDupla(epi.nome)) {
      setSelectedEpis([...selectedEpis, { ...novoItem }, { ...novoItem }]);
      toast.success("2 peças adicionadas (1 por linha para nº série individual)");
    } else {
      setSelectedEpis([...selectedEpis, novoItem]);
      toast.success("EPI adicionado à lista");
    }
    setSearchTerm("");
    setShowSuggestions(false);
  };

  const handleRemoveEpi = (index) => {
    setSelectedEpis(selectedEpis.filter((_, i) => i !== index));
    toast.success("EPI removido da lista");
  };

  const handleEditEpi = (index) => {
    setEditingId(index);
    setEditingData(selectedEpis[index]);
  };

  const handleSaveEdit = () => {
    const updatedEpis = [...selectedEpis];
    updatedEpis[editingId] = editingData;
    setSelectedEpis(updatedEpis);
    setEditingId(null);
    toast.success("EPI atualizado");
  };

  const handleConfirm = () => {
    if (selectedEpis.length === 0) {
      toast.error("Selecione pelo menos um EPI");
      return;
    }
    onConfirm(selectedEpis, funcao);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b sticky top-0 bg-white">
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            Selecionador de EPIs {funcao && `- ${funcao}`}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Campo de Busca e Sugestões */}
          <div className="relative">
            <Label className="text-sm font-semibold text-slate-800 mb-2 block">
              Buscar e adicionar EPI
            </Label>
            <div className="relative">
              <Input
                placeholder="Digite a descrição do EPI..."
                value={searchTerm}
                onChange={(e) => handleSearchEpi(e.target.value)}
                onFocus={() => searchTerm.trim() && setShowSuggestions(true)}
                className="pr-10"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

              {/* Dropdown de Sugestões */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-white shadow-lg z-10">
                  <div className="max-h-64 overflow-y-auto">
                    {filteredSuggestions.map((epi) => (
                      <button
                        key={epi.id}
                        onClick={() => handleSelectEpi(epi)}
                        className="w-full text-left px-4 py-3 hover:bg-amber-50 border-b last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-sm text-slate-800">{epi.nome}</p>
                        <p className="text-xs text-slate-600">
                          Código: {epi.codigo} | CA: {epi.ca || "-"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* EPIs Selecionados - Padrão Orçamento */}
          <div>
            <Label className="text-sm font-semibold text-slate-800 mb-3 block">
              EPIs selecionados ({selectedEpis.length})
            </Label>
            {selectedEpis.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded text-sm text-slate-600 text-center">
                Nenhum EPI selecionado ainda
              </div>
            ) : (
              <div className="border rounded-lg overflow-auto">
                <table className="w-full">
                  <thead className="bg-slate-100 border-b-2">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 min-w-[200px]">
                        Descrição
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 w-24">
                        Código
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 w-20">
                        CA
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-slate-700 w-20">
                        Qtd
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700 w-32">
                        Validade
                      </th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEpis.map((epi, index) => (
                      <tr key={index} className="border-b hover:bg-slate-50">
                        {editingId === index ? (
                          <>
                            <td className="px-3 py-2">
                              <Input
                                value={editingData.item || ""}
                                onChange={(e) =>
                                  setEditingData({ ...editingData, item: e.target.value })
                                }
                                className="h-8 text-xs"
                                autoFocus
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={editingData.codigo || ""}
                                onChange={(e) =>
                                  setEditingData({ ...editingData, codigo: e.target.value })
                                }
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={editingData.ca || ""}
                                onChange={(e) =>
                                  setEditingData({ ...editingData, ca: e.target.value })
                                }
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                value={editingData.quantidade || 1}
                                onChange={(e) =>
                                  setEditingData({
                                    ...editingData,
                                    quantidade: parseInt(e.target.value) || 1,
                                  })
                                }
                                className="h-8 text-xs text-center"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="date"
                                value={editingData.validade || ""}
                                onChange={(e) =>
                                  setEditingData({ ...editingData, validade: e.target.value })
                                }
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2 text-right flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleSaveEdit}
                                className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                              >
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(null)}
                                className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100"
                              >
                                ✕
                              </Button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-xs font-medium text-slate-800">
                              {epi.item}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {epi.codigo || "-"}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">{epi.ca || "-"}</td>
                            <td className="px-3 py-2 text-xs text-center text-slate-600">
                              {epi.quantidade}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {epi.validade
                                ? new Date(epi.validade).toLocaleDateString("pt-BR")
                                : "-"}
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditEpi(index)}
                                className="h-7 text-xs text-slate-600 hover:text-slate-900"
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveEpi(index)}
                                className="h-7 text-xs text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="p-6 border-t sticky bottom-0 bg-white flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedEpis.length === 0}
            className="bg-amber-500 hover:bg-amber-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Confirmar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
