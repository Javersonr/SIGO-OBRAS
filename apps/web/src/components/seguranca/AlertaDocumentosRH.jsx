import React from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AlertaDocumentosRH({ documentosRH }) {
  const verificarDocumento = (docs) => {
    if (!docs || docs.length === 0) return { status: "faltando", dias: null };

    const doc = docs[0];

    // Se há inconsistências, alertar
    if (doc.analise?.inconsistencias?.length > 0) {
      return { status: "inconsistencia", inconsistencias: doc.analise.inconsistencias };
    }

    // Se há data de validade, verificar
    if (doc.analise?.data_validade) {
      try {
        const partes = doc.analise.data_validade.split("/");
        if (partes.length === 3) {
          const dataValidade = new Date(partes[2], parseInt(partes[1]) - 1, partes[0]);
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((dataValidade - hoje) / (1000 * 60 * 60 * 24));

          if (diffDays < 0) return { status: "vencido", dias: Math.abs(diffDays) };
          if (diffDays <= 30) return { status: "proxima_vencimento", dias: diffDays };
        }
      } catch (e) {
        // Se não conseguir parsear a data, continuar
      }
    }

    return { status: "ok", dias: null };
  };

  const asoStatus = verificarDocumento(documentosRH?.aso);
  const examesStatus = verificarDocumento(documentosRH?.exames);
  const registroStatus = verificarDocumento(documentosRH?.registro);

  const temAlerta =
    asoStatus.status !== "ok" || examesStatus.status !== "ok" || registroStatus.status !== "ok";

  if (!temAlerta) return null;

  const alertas = [
    { nome: "ASO", status: asoStatus },
    { nome: "Exames Médicos", status: examesStatus },
    { nome: "Registro de Empregado", status: registroStatus },
  ].filter((item) => item.status.status !== "ok");

  return (
    <div className="space-y-2 mb-4">
      {alertas.map((item) => (
        <Alert
          key={item.nome}
          className={`${
            item.status.status === "vencido"
              ? "border-red-200 bg-red-50"
              : item.status.status === "proximaVencimento" ||
                  item.status.status === "proxima_vencimento"
                ? "border-amber-200 bg-amber-50"
                : "border-orange-200 bg-orange-50"
          }`}
        >
          {item.status.status === "vencido" ? (
            <AlertCircle className="h-4 w-4 text-red-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          )}
          <AlertDescription
            className={`ml-2 ${
              item.status.status === "vencido" ? "text-red-800" : "text-amber-800"
            }`}
          >
            <div className="font-medium">{item.nome}</div>
            {item.status.status === "vencido" && (
              <div className="text-sm">Documento vencido há {item.status.dias} dia(s)</div>
            )}
            {item.status.status === "proxima_vencimento" && (
              <div className="text-sm">Vence em {item.status.dias} dia(s)</div>
            )}
            {item.status.status === "inconsistencia" && (
              <div className="text-sm space-y-1">
                <div>Inconsistências detectadas:</div>
                {item.status.inconsistencias.map((inc, idx) => (
                  <div key={idx} className="text-xs">
                    • {inc}
                  </div>
                ))}
              </div>
            )}
            {item.status.status === "faltando" && (
              <div className="text-sm">Documento não anexado</div>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
