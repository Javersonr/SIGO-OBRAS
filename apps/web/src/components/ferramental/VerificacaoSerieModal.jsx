import React, { useState } from "react";
import SheetModal from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function VerificacaoSerieModal({
  open,
  onOpenChange,
  ferramenta,
  onConfirm,
  onSkip,
}) {
  const [serieDigitada, setSerieDigitada] = useState("");
  const [verificando, setVerificando] = useState(false);

  const handleConfirmar = async () => {
    if (!serieDigitada.trim()) {
      toast.error("Digite o número de série");
      return;
    }

    setVerificando(true);
    try {
      // Simular verificação
      await new Promise((r) => setTimeout(r, 500));

      if (onConfirm) {
        onConfirm(serieDigitada);
      }
      setSerieDigitada("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao verificar série");
    } finally {
      setVerificando(false);
    }
  };

  const handlePular = () => {
    if (onSkip) {
      onSkip();
    }
    setSerieDigitada("");
    onOpenChange(false);
  };

  return (
    <SheetModal
      open={open}
      onOpenChange={onOpenChange}
      title="Verificação de Número de Série"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" onClick={handlePular} className="flex-1">
            Pular / OK
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={!serieDigitada.trim() || verificando}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {verificando ? "Verificando..." : "Confirmar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">Ferramenta Identificada</p>
              <p className="text-sm text-blue-700 mt-1">{ferramenta?.descricao}</p>
              <Badge className="mt-2 bg-blue-200 text-blue-900">{ferramenta?.codigo}</Badge>
            </div>
          </div>
        </Card>

        {ferramenta?.numero_serie && (
          <Card className="p-3 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">
                  Esta ferramenta possui número de série cadastrado
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Confirme o número de série no equipamento para validação
                </p>
              </div>
            </div>
          </Card>
        )}

        <div>
          <Label className="text-sm font-semibold">Número de Série *</Label>
          <Input
            placeholder="Digite o número de série"
            value={serieDigitada}
            onChange={(e) => setSerieDigitada(e.target.value)}
            className="mt-2"
          />
          <p className="text-xs text-slate-500 mt-2">
            Deixe em branco e clique "Pular / OK" se não conseguir confirmar o número
          </p>
        </div>
      </div>
    </SheetModal>
  );
}
