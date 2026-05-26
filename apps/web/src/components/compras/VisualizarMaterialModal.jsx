import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function VisualizarMaterialModal({ open, onOpenChange, solicitacaoItemId }) {
  const [material, setMaterial] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && solicitacaoItemId) {
      loadMaterial();
    }
  }, [open, solicitacaoItemId]);

  const loadMaterial = async () => {
    setLoading(true);
    try {
      const solicitacaoItem = await base44.entities.SolicitacaoCompraItem.filter({
        id: solicitacaoItemId,
      });

      if (solicitacaoItem.length > 0 && solicitacaoItem[0].material_id) {
        const materiais = await base44.entities.Material.filter({
          id: solicitacaoItem[0].material_id,
        });
        setMaterial(materiais[0] || null);
      }
    } catch (error) {
      console.error("Erro ao carregar material:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Visualizar Material</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <p className="text-slate-500">Carregando...</p>
          </div>
        ) : material ? (
          <div className="space-y-4 py-4">
            {material.foto_url && (
              <Card>
                <CardContent className="p-4">
                  <img
                    src={material.foto_url}
                    alt={material.nome}
                    className="w-full h-64 object-cover rounded"
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Código</p>
                  <p className="font-semibold text-slate-800">{material.codigo || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Nome</p>
                  <p className="font-semibold text-slate-800">{material.nome}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Categoria</p>
                  <p className="font-semibold text-slate-800">{material.categoria || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Unidade</p>
                  <p className="font-semibold text-slate-800">{material.unidade}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Preço de Referência</p>
                  <p className="font-semibold text-slate-800">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                      material.preco || 0
                    )}
                  </p>
                </div>
                {material.estoque !== undefined && (
                  <div>
                    <p className="text-xs text-slate-500">Estoque Atual</p>
                    <p className="font-semibold text-slate-800">{material.estoque}</p>
                  </div>
                )}
                {material.observacoes && (
                  <div>
                    <p className="text-xs text-slate-500">Observações</p>
                    <p className="text-sm text-slate-700">{material.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center justify-center h-96">
            <p className="text-slate-500">Nenhum material encontrado</p>
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
