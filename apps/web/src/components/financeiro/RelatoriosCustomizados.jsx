import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { useEmpresa } from "../../Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Trash2, Eye, Users, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function RelatoriosCustomizados({ onCarregarTemplate }) {
  const { empresaAtiva, user } = useEmpresa();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    if (empresaAtiva) {
      loadTemplates();
    }
  }, [empresaAtiva]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const result = await sigo.entities.RelatorioCustomizado.filter({
        empresa_id: empresaAtiva.id,
      });

      // Mostrar públicos e do usuário
      const meusTemplates = result.filter((t) => t.publico || t.usuario_id === user?.id);

      setTemplates(
        meusTemplates.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      );
    } catch (error) {
      console.error("Erro ao carregar templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorito = async (template) => {
    try {
      await sigo.entities.RelatorioCustomizado.update(template.id, {
        favorito: !template.favorito,
      });
      loadTemplates();
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const handleExcluir = async (template) => {
    if (!confirm("Excluir este template?")) return;

    try {
      await sigo.entities.RelatorioCustomizado.delete(template.id);
      loadTemplates();
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const handleCarregar = (template) => {
    const filtros = safeParseJSON(template.filtros, {});
    onCarregarTemplate(filtros);
    setShowDialog(false);
  };

  const favoritos = templates.filter((t) => t.favorito);
  const outros = templates.filter((t) => !t.favorito);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
        <Eye className="w-4 h-4 mr-2" />
        Meus Templates ({templates.length})
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Templates de Relatórios Salvos</DialogTitle>
            <DialogDescription>
              Carregue filtros e configurações salvas anteriormente
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>Nenhum template salvo ainda</p>
                <p className="text-sm mt-2">
                  Use o botão "Salvar Filtros" para criar seu primeiro template
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {favoritos.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      Favoritos
                    </h4>
                    <div className="space-y-2">
                      {favoritos.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onCarregar={handleCarregar}
                          onFavorito={handleToggleFavorito}
                          onExcluir={handleExcluir}
                          user={user}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {outros.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">
                      Todos os Templates
                    </h4>
                    <div className="space-y-2">
                      {outros.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onCarregar={handleCarregar}
                          onFavorito={handleToggleFavorito}
                          onExcluir={handleExcluir}
                          user={user}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateCard({ template, onCarregar, onFavorito, onExcluir, user }) {
  const isOwner = template.usuario_id === user?.id;
  const filtros = safeParseJSON(template.filtros, {});

  return (
    <Card className="hover:border-amber-300 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h5 className="font-semibold text-slate-800">{template.nome}</h5>
              <Badge variant="outline" className="text-xs">
                {template.tipo}
              </Badge>
              {template.publico ? (
                <Users className="w-3 h-3 text-blue-600" />
              ) : (
                <Lock className="w-3 h-3 text-slate-400" />
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {filtros.dataInicio && (
                <span className="bg-slate-100 px-2 py-0.5 rounded">
                  {new Date(filtros.dataInicio).toLocaleDateString("pt-BR")} -{" "}
                  {filtros.dataFim ? new Date(filtros.dataFim).toLocaleDateString("pt-BR") : "Hoje"}
                </span>
              )}
              {filtros.categoriaId && filtros.categoriaId !== "all" && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  Categoria filtrada
                </span>
              )}
              {filtros.centroCustoId && filtros.centroCustoId !== "all" && (
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                  Centro de Custo
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onFavorito(template)}
            >
              <Star
                className={`w-4 h-4 ${template.favorito ? "fill-amber-500 text-amber-500" : "text-slate-400"}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onCarregar(template)}
            >
              <Eye className="w-4 h-4 text-blue-600" />
            </Button>
            {isOwner && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onExcluir(template)}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
