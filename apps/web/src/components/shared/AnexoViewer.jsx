import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { resolveStorageUrl } from "@/api/sigoClient";

export default function AnexoViewer({ anexo, open, onOpenChange }) {
  const [imageZoom, setImageZoom] = useState(1);
  const [fileUrl, setFileUrl] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Referência guardada no banco: ou "bucket/path" (assinamos na hora) ou uma
  // URL já pronta (legado). Resolvemos só quando o viewer abre.
  const rawRef = anexo?.url || anexo?.file_url || anexo?.arquivo_url || "";
  const fileName = anexo?.nome || anexo?.name || anexo?.arquivo_nome || "arquivo";
  const fileType = anexo?.tipo || anexo?.type || "";

  useEffect(() => {
    let alive = true;
    if (!open || !rawRef) {
      setFileUrl("");
      return;
    }
    setCarregando(true);
    resolveStorageUrl(rawRef)
      .then((u) => {
        if (alive) setFileUrl(u || rawRef);
      })
      .finally(() => {
        if (alive) setCarregando(false);
      });
    return () => {
      alive = false;
    };
  }, [open, rawRef]);

  // Tipo é inferido do nome/ref (NÃO da URL assinada, que tem ?token=...).
  const isPDF =
    fileType.includes("pdf") ||
    fileName.toLowerCase().endsWith(".pdf") ||
    rawRef.toLowerCase().includes(".pdf");

  const isImage =
    fileType.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName) ||
    /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(rawRef);

  if (!anexo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl w-full h-[85vh] p-0 flex flex-col gap-0"
        aria-describedby="anexo-viewer-desc"
      >
        <div className="flex items-center justify-between p-4 border-b bg-white flex-shrink-0">
          <DialogTitle className="text-lg font-semibold truncate flex-1">{fileName}</DialogTitle>
        </div>
        <div id="anexo-viewer-desc" className="sr-only">
          Visualizador de anexos
        </div>

        <div className="flex-1 overflow-hidden bg-slate-50 flex items-center justify-center">
          {carregando || !fileUrl ? (
            <div className="text-center p-8 text-slate-500">
              {carregando ? "Carregando arquivo..." : "Não foi possível abrir o arquivo."}
            </div>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
              <img
                src={fileUrl}
                alt={fileName}
                className="cursor-zoom-in select-none"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  transform: `scale(${imageZoom})`,
                  transition: "transform 0.2s ease",
                }}
                onClick={() => setImageZoom(imageZoom < 2 ? imageZoom + 0.5 : 1)}
              />
            </div>
          ) : isPDF ? (
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
              className="w-full h-full border-0"
              title={fileName}
              allow="fullscreen"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-8">
                <p className="text-slate-600">Prévia não disponível para este tipo de arquivo.</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 underline text-sm mt-2 inline-block"
                >
                  Baixar arquivo
                </a>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
