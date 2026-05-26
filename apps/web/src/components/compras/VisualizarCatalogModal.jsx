import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function VisualizarCatalogModal({ open, onOpenChange, itemId, tipo }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && itemId && tipo) {
      loadItem();
    }
  }, [open, itemId, tipo]);

  const loadItem = async () => {
    setLoading(true);
    try {
      const entityMap = {
        material: "Material",
        maodeobra: "MaoDeObra",
        ferramental: "Ferramental",
      };

      const entity = entityMap[tipo];
      if (!entity) return;

      const items = await sigo.entities[entity].filter({ id: itemId });
      setItem(items[0] || null);
    } catch (error) {
      console.error("Erro ao carregar item:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTitulo = () => {
    if (tipo === "material") return "Visualizar Material";
    if (tipo === "maodeobra") return "Visualizar Mão de Obra";
    if (tipo === "ferramental") return "Visualizar Ferramenta";
    return "Visualizar Item";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{getTitulo()}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <p className="text-slate-500">Carregando...</p>
          </div>
        ) : item ? (
          <div className="space-y-4 py-4">
            {item.foto_url && (
              <Card>
                <CardContent className="p-4">
                  <img
                    src={item.foto_url}
                    alt={item.nome}
                    className="w-full h-64 object-cover rounded"
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                {item.codigo && (
                  <div>
                    <p className="text-xs text-slate-500">Código</p>
                    <p className="font-semibold text-slate-800">{item.codigo}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500">Nome</p>
                  <p className="font-semibold text-slate-800">{item.nome}</p>
                </div>
                {item.categoria && (
                  <div>
                    <p className="text-xs text-slate-500">Categoria</p>
                    <p className="font-semibold text-slate-800">{item.categoria}</p>
                  </div>
                )}
                {item.unidade && (
                  <div>
                    <p className="text-xs text-slate-500">Unidade</p>
                    <p className="font-semibold text-slate-800">{item.unidade}</p>
                  </div>
                )}
                {item.preco !== undefined && (
                  <div>
                    <p className="text-xs text-slate-500">Preço de Referência</p>
                    <p className="font-semibold text-slate-800">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(item.preco || 0)}
                    </p>
                  </div>
                )}
                {item.estoque !== undefined && (
                  <div>
                    <p className="text-xs text-slate-500">Estoque Atual</p>
                    <p className="font-semibold text-slate-800">{item.estoque}</p>
                  </div>
                )}
                {item.valor_unitario !== undefined && (
                  <div>
                    <p className="text-xs text-slate-500">Valor Unitário</p>
                    <p className="font-semibold text-slate-800">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(item.valor_unitario || 0)}
                    </p>
                  </div>
                )}
                {item.observacoes && (
                  <div>
                    <p className="text-xs text-slate-500">Observações</p>
                    <p className="text-sm text-slate-700">{item.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center justify-center h-96">
            <p className="text-slate-500">Nenhum item encontrado</p>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t pt-4 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
