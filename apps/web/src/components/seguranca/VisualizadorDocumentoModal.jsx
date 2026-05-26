import React from "react";
import ReactDOM from "react-dom";
import { Button } from "@/components/ui/button";
import { Download, X, ExternalLink } from "lucide-react";

export default function VisualizadorDocumentoModal({ open, onOpenChange, documento }) {
  if (!open || !documento) return null;

  const url = documento.url || "";
  const nomeExibicao = documento.nome_arquivo || documento.nome || "Documento";
  const nomeLower = nomeExibicao.toLowerCase();
  const urlBase = url.split("?")[0].toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].some(
    (ext) => urlBase.endsWith("." + ext) || nomeLower.endsWith("." + ext)
  );
  // Google Viewer URL - funciona para PDF, DOCX, XLSX e outros
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

  const content = (
    <>
      {/* Overlay para fechar ao clicar fora */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          backgroundColor: "#ffffff",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ zIndex: 100000, backgroundColor: "#1e293b", borderColor: "#334155" }}
        >
          <h2
            className="text-sm font-medium truncate max-w-lg"
            style={{ color: "#f1f5f9" }}
            title={nomeExibicao}
          >
            {nomeExibicao}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(url, "_blank")}
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const link = document.createElement("a");
                link.href = url;
                link.download = nomeExibicao;
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              title="Baixar"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            background: "#f1f5f9",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {isImage ? (
            <div className="flex items-center justify-center p-6 h-full overflow-auto">
              <img
                src={url}
                alt={nomeExibicao}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
              />
            </div>
          ) : (
            <iframe
              key={url}
              src={googleViewerUrl}
              style={{ flex: 1, width: "100%", height: "100%", border: "none" }}
              title={nomeExibicao}
              allow="fullscreen"
            />
          )}
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(content, document.body);
}
