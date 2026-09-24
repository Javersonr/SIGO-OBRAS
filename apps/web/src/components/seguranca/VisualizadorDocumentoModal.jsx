import React from "react";
import AnexoViewer from "@/components/shared/AnexoViewer";

/**
 * Visualizador de documento do funcionário. `documento.url` guarda a
 * referência estável "bucket/caminho" (ou URL legada): o AnexoViewer assina na
 * hora, re-assina URL antiga do nosso Storage e avisa quando é arquivo do
 * Base44 (apagado). Antes usava o Google Docs Viewer com a URL crua, que
 * quebrava quando a URL assinada expirava.
 */
export default function VisualizadorDocumentoModal({ open, onOpenChange, documento }) {
  if (!open || !documento) return null;

  return (
    <AnexoViewer
      anexo={{
        url: documento.url || "",
        nome: documento.nome_arquivo || documento.nome || "Documento",
      }}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
