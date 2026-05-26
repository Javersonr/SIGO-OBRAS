import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "@/Layout";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function AgendarManutencaoModal({ open, onOpenChange, ferramenta, onSave }) {
  const { empresaAtiva } = useEmpresa();
  const [intervalo, setIntervalo] = useState(ferramenta?.intervalo_manutencao_dias || 30);
  const [proximaData, setProximaData] = useState("");
  const [loading, setLoading] = useState(false);

  const calcularProximaManutencao = () => {
    if (!intervalo || intervalo <= 0) {
      toast.error("Informe um intervalo válido");
      return;
    }

    const hoje = new Date();
    const proxData = new Date(hoje);
    proxData.setDate(proxData.getDate() + parseInt(intervalo));
    setProximaData(proxData.toISOString().split("T")[0]);
  };

  const handleSalvar = async () => {
    if (!proximaData) {
      toast.error("Calcule a próxima data de manutenção");
      return;
    }

    setLoading(true);
    try {
      // Atualizar ferramenta
      await sigo.entities.Ferramenta.update(ferramenta.id, {
        intervalo_manutencao_dias: parseInt(intervalo),
        proxima_manutencao: proximaData,
        alerta_manutencao: false,
      });

      // Criar agendamento
      await sigo.entities.ManutencaoFerramenta.create({
        empresa_id: empresaAtiva.id,
        ferramenta_id: ferramenta.id,
        ferramenta_codigo: ferramenta.codigo,
        ferramenta_descricao: ferramenta.descricao,
        tipo_manutencao: "Preventiva",
        data_prevista: proximaData,
        status: "Agendada",
        descricao: `Manutenção preventiva programada (intervalo: ${intervalo} dias)`,
      });

      toast.success("Manutenção preventiva agendada");
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao agendar manutenção");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title="Agendar Manutenção Preventiva"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={loading || !proximaData}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {loading ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Info da Ferramenta */}
        <div className="bg-slate-50 p-3 rounded-lg">
          <p className="text-sm text-slate-600">Ferramenta</p>
          <p className="font-semibold text-slate-900">{ferramenta?.codigo}</p>
          <p className="text-sm text-slate-600">{ferramenta?.descricao}</p>
        </div>

        {/* Intervalo */}
        <div>
          <Label>Intervalo de Manutenção (dias)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
              min="1"
              className="flex-1"
            />
            <Button variant="outline" onClick={calcularProximaManutencao}>
              <Clock className="w-4 h-4 mr-2" />
              Calcular
            </Button>
          </div>
        </div>

        {/* Próxima Data */}
        {proximaData && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-amber-600" />
              <p className="font-semibold text-amber-900">Próxima Manutenção</p>
            </div>
            <p className="text-2xl font-bold text-amber-700">
              {new Date(proximaData).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        )}

        {/* Alerta */}
        <div className="flex items-start gap-2 text-sm text-slate-600 bg-blue-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p>
            O sistema enviará notificações automáticas 7 dias antes da data prevista e quando a
            manutenção estiver atrasada.
          </p>
        </div>
      </div>
    </SheetModalComponent>
  );
}
