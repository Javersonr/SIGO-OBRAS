import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, User, Bell } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusColors = {
  OK: "bg-green-100 text-green-700 border-green-200",
  "A Vencer": "bg-yellow-100 text-yellow-700 border-yellow-200",
  Vencido: "bg-red-100 text-red-700 border-red-200",
};

const tipoColors = {
  "Certidão Federal (CND)": "border-l-blue-500",
  "Certidão Estadual": "border-l-blue-400",
  "Certidão Municipal": "border-l-blue-300",
  "Certidão FGTS": "border-l-indigo-500",
  "Certidão Trabalhista": "border-l-indigo-400",
  PGR: "border-l-orange-500",
  PCMSO: "border-l-orange-400",
  LTCAT: "border-l-orange-300",
  ASO: "border-l-amber-500",
  "Treinamento NR": "border-l-amber-400",
  Contrato: "border-l-purple-500",
  "Licença Ambiental": "border-l-green-500",
  Alvará: "border-l-green-400",
  "Manutenção/Calibração": "border-l-slate-500",
  Seguro: "border-l-cyan-500",
};

export default function VencimentoCard({ vencimento, onEdit, onVerDocumento, onNotificar }) {
  const diasRestantes = differenceInDays(
    new Date(vencimento.data_vencimento + "T00:00:00"),
    new Date()
  );
  const borderColor = tipoColors[vencimento.tipo] || "border-l-slate-400";

  return (
    <Card className={`border-l-4 ${borderColor} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={`text-xs ${statusColors[vencimento.status]}`}>
                {vencimento.status}
              </Badge>
              <span className="text-xs text-slate-500">{vencimento.tipo}</span>
              {vencimento.empresa_nome && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {vencimento.empresa_nome}
                </span>
              )}
            </div>

            <h4 className="font-semibold text-slate-800 truncate">{vencimento.titulo}</h4>

            <div className="flex items-center gap-4 mt-1 flex-wrap">
              <span className="text-sm text-slate-600">
                Vence:{" "}
                <strong>
                  {format(new Date(vencimento.data_vencimento + "T00:00:00"), "dd/MM/yyyy", {
                    locale: ptBR,
                  })}
                </strong>
              </span>
              {diasRestantes >= 0 ? (
                <span
                  className={`text-sm font-medium ${diasRestantes <= 7 ? "text-red-600" : diasRestantes <= 30 ? "text-yellow-600" : "text-green-600"}`}
                >
                  {diasRestantes === 0 ? "Vence hoje!" : `em ${diasRestantes} dias`}
                </span>
              ) : (
                <span className="text-sm font-medium text-red-600">
                  Vencido há {Math.abs(diasRestantes)} dias
                </span>
              )}
              {vencimento.responsavel_nome && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {vencimento.responsavel_nome}
                </span>
              )}
            </div>

            {vencimento.observacao && (
              <p className="text-xs text-slate-500 mt-1 truncate">{vencimento.observacao}</p>
            )}
          </div>

          <div className="flex gap-1 flex-shrink-0">
            {vencimento.arquivo_url && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onVerDocumento(vencimento)}
                title="Ver documento"
              >
                <Eye className="w-4 h-4 text-blue-500" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(vencimento)}
              title="Editar"
            >
              <Edit className="w-4 h-4 text-slate-500" />
            </Button>
            {vencimento.responsavel_email && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onNotificar(vencimento)}
                title="Notificar responsável"
              >
                <Bell className="w-4 h-4 text-amber-500" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
