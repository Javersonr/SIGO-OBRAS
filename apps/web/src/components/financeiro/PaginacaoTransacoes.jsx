import React from "react";
import { Button } from "@/components/ui/button";

export default function PaginacaoTransacoes({
  paginaAtual,
  totalPaginas,
  indiceInicio,
  indiceFim,
  totalItens,
  rotuloItens,
  setPaginaAtual,
  wrapper = "card",
}) {
  if (totalPaginas <= 1) return null;

  const containerClass =
    wrapper === "card"
      ? "flex items-center justify-between px-4 py-3 border rounded-lg bg-white"
      : "flex items-center justify-between px-4 py-3 border-t";

  return (
    <div className={containerClass}>
      <div className="text-sm text-slate-600">
        Mostrando {indiceInicio + 1} a {Math.min(indiceFim, totalItens)} de {totalItens}{" "}
        {rotuloItens}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaginaAtual(Math.max(1, paginaAtual - 1))}
          disabled={paginaAtual === 1}
        >
          Anterior
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
            let pageNum;
            if (totalPaginas <= 5) {
              pageNum = i + 1;
            } else if (paginaAtual <= 3) {
              pageNum = i + 1;
            } else if (paginaAtual >= totalPaginas - 2) {
              pageNum = totalPaginas - 4 + i;
            } else {
              pageNum = paginaAtual - 2 + i;
            }
            return (
              <Button
                key={pageNum}
                variant={paginaAtual === pageNum ? "default" : "outline"}
                size="sm"
                className={paginaAtual === pageNum ? "bg-amber-500 hover:bg-amber-600" : ""}
                onClick={() => setPaginaAtual(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaginaAtual(Math.min(totalPaginas, paginaAtual + 1))}
          disabled={paginaAtual === totalPaginas}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
