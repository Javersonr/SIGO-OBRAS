import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const tipoAcaoColors = {
  criar: "bg-green-100 text-green-800",
  editar: "bg-blue-100 text-blue-800",
  deletar: "bg-red-100 text-red-800",
  arquivar: "bg-yellow-100 text-yellow-800",
};

export default function HistoricoRegistroWidget({ entidade, entidadeId, nomeCurto = "Registro" }) {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadHistorico();
  }, [entidade, entidadeId]);

  const loadHistorico = async () => {
    if (!entidade || !entidadeId) return;
    setLoading(true);
    try {
      const logs = await sigo.entities.AuditLog.filter(
        { entidade, entidade_id: entidadeId },
        "-created_date",
        50
      );
      setHistorico(logs);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-slate-500 text-sm">
          Carregando histórico...
        </CardContent>
      </Card>
    );
  }

  if (historico.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-slate-500 text-sm">
          Nenhum histórico de alterações
        </CardContent>
      </Card>
    );
  }

  const criacao = historico.find((h) => h.tipo_acao === "criar");
  const ultimaModificacao = historico[0];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Histórico de {nomeCurto}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {criacao && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <p className="font-medium text-slate-700">
                    ✅ Criado por <span className="text-green-700">{criacao.usuario_nome}</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {new Date(criacao.created_date).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {ultimaModificacao.tipo_acao !== "criar" && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <p className="font-medium text-slate-700">
                    ✏️ Modificado por{" "}
                    <span className="text-blue-700">{ultimaModificacao.usuario_nome}</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {new Date(ultimaModificacao.created_date).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedLog(ultimaModificacao);
                    setShowDetail(true);
                  }}
                  className="text-xs"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Ver
                </Button>
              </div>
            </div>
          )}

          {historico.length > 2 && (
            <div className="text-xs text-slate-600 p-2 bg-slate-50 rounded">
              Total de {historico.length} alterações registradas
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent className="overflow-y-auto max-w-md">
          {selectedLog && (
            <>
              <SheetHeader>
                <SheetTitle>Detalhes da Alteração</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-6">
                <div>
                  <label className="text-xs text-slate-500 font-medium">Tipo de Ação</label>
                  <Badge className={tipoAcaoColors[selectedLog.tipo_acao] + " mt-2"}>
                    {selectedLog.tipo_acao}
                  </Badge>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium">Usuário</label>
                  <p className="text-sm font-medium text-slate-800 mt-1">
                    {selectedLog.usuario_nome}
                  </p>
                  <p className="text-xs text-slate-600">{selectedLog.usuario_email}</p>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium">Data/Hora</label>
                  <p className="text-sm text-slate-700 mt-1">
                    {new Date(selectedLog.created_date).toLocaleString("pt-BR")}
                  </p>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium">Descrição</label>
                  <p className="text-sm text-slate-700 mt-1">{selectedLog.descricao}</p>
                </div>

                {selectedLog.dados_anteriores && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Dados Anteriores</label>
                    <pre className="bg-red-50 p-2 rounded text-xs mt-1 overflow-auto max-h-32 text-red-700 border border-red-200">
                      {JSON.stringify(safeParseJSON(selectedLog.dados_anteriores, {}), null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.dados_novos && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Dados Novos</label>
                    <pre className="bg-green-50 p-2 rounded text-xs mt-1 overflow-auto max-h-32 text-green-700 border border-green-200">
                      {JSON.stringify(safeParseJSON(selectedLog.dados_novos, {}), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
