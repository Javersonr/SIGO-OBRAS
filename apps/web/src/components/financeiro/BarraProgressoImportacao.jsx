import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function BarraProgressoImportacao({
  ativo,
  total,
  processados,
  erros,
  titulo = "Importando...",
}) {
  const percentual = total > 0 ? Math.round((processados / total) * 100) : 0;

  if (!ativo) return null;

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-amber-800">{titulo}</span>
          <span className="text-sm text-amber-700">{percentual}%</span>
        </div>

        <div className="w-full bg-amber-200 rounded-full h-2.5">
          <div
            className="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${percentual}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm text-amber-700">
          <span>
            {processados} de {total} itens
          </span>
          <div className="flex gap-4">
            {erros > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>
                  {erros} erro{erros !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {percentual === 100 && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>Concluído</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
