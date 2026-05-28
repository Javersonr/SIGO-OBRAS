import React, { useState } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, Download, X, FileText } from "lucide-react";

export default function EPIListaModelo({
  modeloEpi,
  allFerramentas,
  onChangeModeloEpi,
  onBaixarModelo,
  onImportar,
  fileInputRef,
}) {
  const [searchValue, setSearchValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const epis = safeParseJSON(modeloEpi, []);

  const updateEpis = (newList) => onChangeModeloEpi(JSON.stringify(newList));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-slate-800">Modelo de Lista de EPIs</h4>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx"
              onChange={onImportar}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onBaixarModelo}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Modelo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <FileText className="w-4 h-4 mr-2" />
                  Importar Lista
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm("Deseja limpar todos os EPIs?")) updateEpis([]);
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar Todos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {epis.length === 0 && (
          <div className="text-center py-4 text-slate-500 text-sm">Nenhum EPI adicionado.</div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-white">
          {epis.length > 0 && (
            <div
              className="grid gap-2 items-center p-2 bg-slate-100 rounded font-semibold text-xs sticky top-0"
              style={{ gridTemplateColumns: "2.5fr 1fr 0.6fr 1fr 0.4fr" }}
            >
              <span>Item EPI</span>
              <span>CA</span>
              <span>Qtd</span>
              <span>Validade</span>
              <span></span>
            </div>
          )}
          {epis.map((epi, idx) => (
            <div
              key={idx}
              className="grid gap-2 items-center p-2 bg-slate-50 rounded"
              style={{ gridTemplateColumns: "2.5fr 1fr 0.6fr 1fr 0.4fr" }}
            >
              <Input
                placeholder="Nome do EPI..."
                value={epi.item || ""}
                onChange={(e) => {
                  const itens = [...epis];
                  itens[idx].item = e.target.value;
                  updateEpis(itens);
                }}
                className="text-xs h-8"
              />
              <Input
                placeholder="CA"
                value={epi.ca || ""}
                onChange={(e) => {
                  const itens = [...epis];
                  itens[idx].ca = e.target.value;
                  updateEpis(itens);
                }}
                className="text-xs h-8"
              />
              <Input
                placeholder="Qtd"
                type="number"
                value={epi.quantidade || ""}
                onChange={(e) => {
                  const itens = [...epis];
                  itens[idx].quantidade = e.target.value;
                  updateEpis(itens);
                }}
                className="text-xs h-8"
              />
              <Input
                placeholder="Validade"
                value={epi.validade || ""}
                onChange={(e) => {
                  const itens = [...epis];
                  itens[idx].validade = e.target.value;
                  updateEpis(itens);
                }}
                className="text-xs h-8"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const itens = [...epis];
                  itens.splice(idx, 1);
                  updateEpis(itens);
                }}
              >
                <X className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          ))}

          {/* Adicionar novo */}
          <div className="relative">
            <Input
              placeholder="Buscar EPI do estoque ou digitar para adicionar..."
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                if (e.target.value.trim()) {
                  setSuggestions(
                    allFerramentas.filter((f) =>
                      f.descricao?.toLowerCase().includes(e.target.value.toLowerCase())
                    )
                  );
                  setShowSuggestions(true);
                } else {
                  setShowSuggestions(false);
                }
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="text-xs h-8 border-dashed"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="fixed mt-1 border rounded bg-white shadow-lg z-[9999] max-h-48 overflow-y-auto min-w-[300px]">
                {suggestions.map((f) => (
                  <button
                    key={f.id}
                    onMouseDown={() => {
                      updateEpis([
                        ...epis,
                        { item: f.descricao || "", ca: f.ca || "", quantidade: 1, validade: "" },
                      ]);
                      setSearchValue("");
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b last:border-b-0 text-xs"
                  >
                    <p className="font-medium">{f.descricao}</p>
                    <p className="text-slate-500">CA: {f.ca || "-"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border-dashed"
            onClick={() => {
              if (searchValue.trim()) {
                updateEpis([
                  ...epis,
                  { item: searchValue.trim(), ca: "", quantidade: 1, validade: "" },
                ]);
                setSearchValue("");
              }
            }}
          >
            <Plus className="w-3 h-3 mr-1" /> Adicionar EPI manualmente
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
