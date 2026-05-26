import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { useEmpresa } from "../../../Layout";

export default function WidgetSolicitacoesPendentes() {
  const { empresaAtiva } = useEmpresa();
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    const load = async () => {
      try {
        const data = await sigo.entities.SolicitacaoCompra.filter(
          {
            empresa_id: empresaAtiva.id,
            status: "Pendente Aprovação",
          },
          "-created_date",
          5
        );
        setSolicitacoes(data);
      } catch (e) {
        console.error("Erro ao carregar solicitações:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [empresaAtiva?.id]);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
        <ShoppingCart className="w-4 h-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-400">Carregando...</div>
        ) : solicitacoes.length === 0 ? (
          <div className="text-sm text-slate-400">Nenhuma solicitação pendente</div>
        ) : (
          <div className="space-y-2">
            <div className="text-2xl font-bold">{solicitacoes.length}</div>
            <div className="text-xs text-slate-500">aguardando aprovação</div>
            <div className="space-y-1 mt-2">
              {solicitacoes.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-600">{s.projeto_nome || "Sem projeto"}</span>
                  <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                    #{s.numero || "—"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
