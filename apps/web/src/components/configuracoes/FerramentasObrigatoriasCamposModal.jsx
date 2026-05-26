import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import CaminhaoCamposObrigatoriosManager from "./CaminhaoCamposObrigatoriosManager";

export default function FerramentasObrigatoriasCamposModal({
  open,
  onOpenChange,
  empresaAtiva,
  onSave,
}) {
  const [caminhaos, setCaminhaos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [caminhaaoSelecionado, setCaminhaaoSelecionado] = useState(null);
  const [showCamposManager, setShowCamposManager] = useState(false);

  useEffect(() => {
    if (open) {
      loadCaminhaos();
    }
  }, [open]);

  const loadCaminhaos = async () => {
    try {
      setLoading(true);
      const dados = await sigo.entities.Caminhao.filter({
        empresa_id: empresaAtiva?.id,
        ativo: true,
      });
      setCaminhaos(dados);
    } catch (error) {
      console.error("Erro ao carregar caminhões:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditarCampos = (caminhao) => {
    setCaminhaaoSelecionado(caminhao);
    setShowCamposManager(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full h-full overflow-y-auto !p-0"
          data-fullscreen-modal
        >
          <SheetHeader className="p-6 border-b border-slate-200 sticky top-0 bg-white">
            <SheetTitle>Gerenciar Campos Obrigatórios por Caminhão</SheetTitle>
          </SheetHeader>

          <div className="p-6">
            {loading ? (
              <p className="text-sm text-slate-500">Carregando caminhões...</p>
            ) : caminhaos.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Nenhum caminhão cadastrado</p>
            ) : (
              <div className="space-y-2">
                {caminhaos.map((caminhao) => (
                  <Card key={caminhao.id} className="hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-900">{caminhao.placa}</h3>
                          <p className="text-sm text-slate-500">
                            {caminhao.marca} {caminhao.modelo}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEditarCampos(caminhao)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de gerenciar campos do caminhão */}
      {caminhaaoSelecionado && (
        <CaminhaoCamposObrigatoriosManager
          caminhao={caminhaaoSelecionado}
          open={showCamposManager}
          onOpenChange={setShowCamposManager}
          empresaAtiva={empresaAtiva}
          onSave={loadCaminhaos}
        />
      )}
    </>
  );
}
