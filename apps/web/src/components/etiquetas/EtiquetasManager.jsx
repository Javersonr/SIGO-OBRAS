import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";
import { sigo } from "@/api/sigoClient";

export default function EtiquetasManager({
  etiquetas,
  etiquetasSelecionadas = [],
  onEtiquetasChange,
  empresaAtiva,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [cores] = useState([
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#6366F1",
  ]);
  const [corSelecionada, setCorSelecionada] = useState(cores[0]);

  const filtroEtiquetas = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return etiquetas.filter(
      (e) => e.nome.toLowerCase().includes(search) && !etiquetasSelecionadas.includes(e.id)
    );
  }, [searchTerm, etiquetas, etiquetasSelecionadas]);

  const handleAddEtiqueta = async () => {
    if (!novaEtiqueta.trim()) return;

    const novaEtiq = await sigo.entities.Etiqueta.create({
      empresa_id: empresaAtiva.id,
      nome: novaEtiqueta,
      cor: corSelecionada,
    });

    onEtiquetasChange([...etiquetasSelecionadas, novaEtiq.id]);
    setNovaEtiqueta("");
  };

  const handleToggleEtiqueta = (etiquetaId) => {
    if (etiquetasSelecionadas.includes(etiquetaId)) {
      onEtiquetasChange(etiquetasSelecionadas.filter((id) => id !== etiquetaId));
    } else {
      onEtiquetasChange([...etiquetasSelecionadas, etiquetaId]);
    }
  };

  const etiquetasAtuais = etiquetas.filter((e) => etiquetasSelecionadas.includes(e.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {etiquetasAtuais.map((etiqueta) => (
          <Badge
            key={etiqueta.id}
            style={{ backgroundColor: etiqueta.cor }}
            className="text-white cursor-pointer flex items-center gap-1"
            onClick={() => handleToggleEtiqueta(etiqueta.id)}
          >
            {etiqueta.nome}
            <X className="w-3 h-3" />
          </Badge>
        ))}
      </div>

      <div className="relative">
        <Input
          placeholder="Buscar ou criar etiqueta..."
          value={searchTerm || novaEtiqueta}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setNovaEtiqueta(e.target.value);
          }}
          className="text-sm"
        />

        {(searchTerm || novaEtiqueta) && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filtroEtiquetas.length > 0 ? (
              <>
                {filtroEtiquetas.map((etiqueta) => (
                  <button
                    key={etiqueta.id}
                    type="button"
                    onClick={() => {
                      handleToggleEtiqueta(etiqueta.id);
                      setSearchTerm("");
                      setNovaEtiqueta("");
                    }}
                    className="w-full text-left p-2 hover:bg-slate-50 flex items-center gap-2 border-b last:border-b-0"
                  >
                    <Badge style={{ backgroundColor: etiqueta.cor }} className="text-white text-xs">
                      {etiqueta.nome}
                    </Badge>
                  </button>
                ))}
                <div className="p-2 border-t">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs gap-1"
                    onClick={handleAddEtiqueta}
                  >
                    <Plus className="w-3 h-3" />
                    Criar "{novaEtiqueta}"
                  </Button>
                </div>
              </>
            ) : (
              <div className="p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1"
                  onClick={handleAddEtiqueta}
                >
                  <Plus className="w-3 h-3" />
                  Criar "{novaEtiqueta}"
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {!searchTerm && !novaEtiqueta && (
        <div className="flex gap-1 flex-wrap">
          {cores.map((cor) => (
            <button
              key={cor}
              type="button"
              onClick={() => setCorSelecionada(cor)}
              className={`w-6 h-6 rounded-full border-2 ${corSelecionada === cor ? "border-slate-800" : "border-slate-300"}`}
              style={{ backgroundColor: cor }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
