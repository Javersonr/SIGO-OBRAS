import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Check,
  X,
  Edit,
  AlertCircle,
  FileText,
  Calendar,
  User,
  Loader,
  Eye,
} from "lucide-react";
import { format, startOfDay, endOfDay, parseISO } from "date-fns";
import { toast } from "sonner";

const tipoAcaoConfig = {
  inspecao_iniciada: {
    icon: Calendar,
    cor: "bg-blue-50 border-blue-200",
    texto: "Inspeção Iniciada",
    textoCor: "text-blue-700",
  },
  foto_capturada: {
    icon: Camera,
    cor: "bg-amber-50 border-amber-200",
    texto: "Foto Capturada",
    textoCor: "text-amber-700",
  },
  foto_validada: {
    icon: Check,
    cor: "bg-green-50 border-green-200",
    texto: "Foto Validada",
    textoCor: "text-green-700",
  },
  foto_rejeitada: {
    icon: X,
    cor: "bg-red-50 border-red-200",
    texto: "Foto Rejeitada",
    textoCor: "text-red-700",
  },
  confirmacao_desfeita: {
    icon: Edit,
    cor: "bg-purple-50 border-purple-200",
    texto: "Confirmação Desfeita",
    textoCor: "text-purple-700",
  },
  inspecao_concluida: {
    icon: Check,
    cor: "bg-green-50 border-green-200",
    texto: "Inspeção Concluída",
    textoCor: "text-green-700",
  },
  inspecao_cancelada: {
    icon: X,
    cor: "bg-slate-50 border-slate-200",
    texto: "Inspeção Cancelada",
    textoCor: "text-slate-700",
  },
  observacao_adicionada: {
    icon: FileText,
    cor: "bg-cyan-50 border-cyan-200",
    texto: "Observação Adicionada",
    textoCor: "text-cyan-700",
  },
};

export default function HistoricoInspecaoTab({ inspecaoId, empresaId }) {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [fotoSelecionada, setFotoSelecionada] = useState(null);

  useEffect(() => {
    loadHistorico();
  }, [inspecaoId, empresaId]);

  const loadHistorico = async () => {
    setLoading(true);
    try {
      const dados = await base44.entities.InspecaoHistorico.filter(
        {
          empresa_id: empresaId,
          inspecao_id: inspecaoId,
        },
        "timestamp",
        100
      );
      setHistorico(dados);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  const historicoFiltrado = historico.filter((item) => {
    if (filtroTipo && item.tipo_acao !== filtroTipo) return false;

    if (filtroDataInicio) {
      const dataInicio = startOfDay(parseISO(filtroDataInicio));
      const dataItem = parseISO(item.timestamp);
      if (dataItem < dataInicio) return false;
    }

    if (filtroDataFim) {
      const dataFim = endOfDay(parseISO(filtroDataFim));
      const dataItem = parseISO(item.timestamp);
      if (dataItem > dataFim) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Tipo de Ação</label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos</SelectItem>
              {Object.entries(tipoAcaoConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.texto}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1.5 block">De:</label>
          <Input
            type="date"
            value={filtroDataInicio}
            onChange={(e) => setFiltroDataInicio(e.target.value)}
            className="h-9"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Até:</label>
          <Input
            type="date"
            value={filtroDataFim}
            onChange={(e) => setFiltroDataFim(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* Resultado */}
      {historicoFiltrado.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-500">Nenhuma ação registrada com os filtros selecionados</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {historicoFiltrado.map((item, idx) => {
            const config = tipoAcaoConfig[item.tipo_acao] || tipoAcaoConfig.observacao_adicionada;
            const Icon = config.icon;

            return (
              <Card key={item.id} className={`p-3 sm:p-4 border ${config.cor}`}>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Icon className={`w-5 h-5 ${config.textoCor} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm ${config.textoCor}`}>{config.texto}</p>
                        <p className="text-xs text-slate-600 mt-0.5 break-words">
                          {item.descricao}
                        </p>

                        {item.ferramenta_descricao && (
                          <p className="text-xs text-slate-500 mt-1">
                            <strong>Ferramenta:</strong> {item.ferramenta_descricao} (
                            {item.ferramenta_codigo})
                          </p>
                        )}

                        {item.confianca_validacao !== undefined &&
                          item.confianca_validacao !== null && (
                            <Badge className="mt-2 text-xs">
                              Confiança: {item.confianca_validacao}%
                            </Badge>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(item.timestamp), "dd/MM/yyyy HH:mm:ss")}
                    </span>
                    {item.usuario_nome && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {item.usuario_nome}
                      </span>
                    )}
                  </div>

                  {item.foto_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFotoSelecionada(item.foto_url)}
                      className="w-full gap-2 text-xs h-8 mt-2"
                    >
                      <Eye className="w-3 h-3" />
                      Ver Foto
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Foto */}
      {fotoSelecionada && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-800">Visualizar Foto</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFotoSelecionada(null)}
                  className="h-8 w-8"
                >
                  ✕
                </Button>
              </div>
              <img src={fotoSelecionada} alt="Foto do histórico" className="w-full rounded-lg" />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
