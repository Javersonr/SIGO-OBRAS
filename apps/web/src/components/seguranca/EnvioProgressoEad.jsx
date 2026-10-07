import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatarTamanho } from "@/lib/ead-upload";

/**
 * Barra de progresso do envio de um arquivo de aula, com o botão Cancelar (T30). Só mostra algo
 * quando o envio é de um arquivo (`envio.arquivo`). Na fase "gravando" o arquivo já subiu e a aula
 * está sendo gravada: não há mais o que cancelar.
 *
 * `envio`: { arquivo, fase: "lendo" | "enviando" | "gravando", percentual, enviado, total }.
 */
function textoDaFase({ fase, percentual, enviado, total }) {
  if (fase === "lendo") return "Lendo a duração do vídeo...";
  if (fase === "gravando") return "Arquivo enviado. Gravando a aula...";
  if (percentual == null) return "Enviando...";
  if (percentual >= 100) return "Finalizando o envio...";
  const bytes = total ? ` · ${formatarTamanho(enviado)} de ${formatarTamanho(total)}` : "";
  return `${percentual}%${bytes}`;
}

export default function EnvioProgressoEad({ envio, onCancelar }) {
  if (!envio?.arquivo) return null;
  const podeCancelar = envio.fase !== "gravando";
  const valor = envio.fase === "gravando" ? 100 : (envio.percentual ?? 0);
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-slate-700">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={envio.arquivo}>
          {envio.arquivo}
        </span>
        {podeCancelar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2"
            onClick={onCancelar}
          >
            Cancelar
          </Button>
        )}
      </div>
      <Progress
        value={valor}
        aria-label="Progresso do envio do arquivo"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 bg-sky-100"
      />
      <p className="text-xs text-slate-500">{textoDaFase(envio)}</p>
    </div>
  );
}
