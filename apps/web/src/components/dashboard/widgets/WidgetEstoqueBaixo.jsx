import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../../Layout";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../../utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WidgetEstoqueBaixo() {
  const { empresaAtiva } = useEmpresa();
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empresaAtiva) {
      loadMateriais();
    }
  }, [empresaAtiva]);

  const loadMateriais = async () => {
    try {
      const mats = await sigo.entities.Material.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });

      const estoqueBaixo = mats
        .filter((m) => (m.estoque || 0) <= (m.estoque_minimo || 0))
        .slice(0, 5);

      setMateriais(estoqueBaixo);
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow border-red-200 bg-red-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Estoque Baixo
          </div>
          <Link to={createPageUrl("Estoque")}>
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todos
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {materiais.length === 0 ? (
          <p className="text-sm text-green-600 text-center py-4">
            ✓ Todos os materiais em níveis adequados
          </p>
        ) : (
          materiais.map((mat) => (
            <div
              key={mat.id}
              className="flex items-center justify-between p-2 bg-white rounded border border-red-100"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{mat.nome}</p>
                <p className="text-xs text-slate-500">{mat.categoria}</p>
              </div>
              <div className="text-right ml-2">
                <p className="text-xs font-semibold text-red-600">
                  {mat.estoque || 0} {mat.unidade}
                </p>
                <p className="text-xs text-slate-500">Mín: {mat.estoque_minimo || 0}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
