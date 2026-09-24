import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, ExternalLink, FileWarning } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { resolveStorageUrl } from "@/api/sigoClient";
import { ehBase44 } from "@/lib/anexo-ref";
import { baixarUrlPronta } from "@/lib/baixar-anexo";

// Chrome Android/WebView não renderiza PDF em iframe: oferece abrir em outra aba
const pdfSemIframe = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(max-width: 640px), (pointer: coarse)").matches;

/**
 * PDF em diálogo. `fileUrl` é o que está gravado no banco: ref "bucket/caminho"
 * (assinamos agora, com a sessão do usuário), URL antiga do nosso Storage
 * (re-assinada) ou link externo. O PDF abre direto no iframe — o Google Docs
 * Viewer não abre ref e receberia a URL assinada do nosso Storage.
 *
 * O download sai da URL assinada fresca (o `onDownload` de quem chama, que
 * usava a URL crua, não é mais usado).
 */
export default function VisualizadorPDF({ fileUrl, fileName, onClose }) {
  // carregando | ok | base44 | sem_arquivo
  const [estado, setEstado] = useState("carregando");
  const [urlPronta, setUrlPronta] = useState("");
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    setIframeError(false);
    setIframeLoaded(false);
    setUrlPronta("");
    if (!fileUrl || typeof fileUrl !== "string") {
      setEstado("sem_arquivo");
      return undefined;
    }
    // Base44: a plataforma antiga apagou os arquivos — nem tenta abrir
    if (ehBase44(fileUrl)) {
      setEstado("base44");
      return undefined;
    }
    setEstado("carregando");
    resolveStorageUrl(fileUrl).then((u) => {
      if (!vivo) return;
      setUrlPronta(u || "");
      setEstado(u ? "ok" : "sem_arquivo");
    });
    return () => {
      vivo = false;
    };
  }, [fileUrl]);

  // Se o onLoad demorar (PDF grande), tira só o "carregando" da frente
  useEffect(() => {
    if (estado !== "ok" || iframeLoaded) return undefined;
    timeoutRef.current = setTimeout(() => setIframeLoaded(true), 8000);
    return () => clearTimeout(timeoutRef.current);
  }, [estado, iframeLoaded]);

  const handleIframeError = () => setIframeError(true);
  const handleIframeLoad = () => setIframeLoaded(true);
  const baixar = () => baixarUrlPronta(urlPronta, fileName || "");
  const abrirEmNovaAba = () => urlPronta && window.open(urlPronta, "_blank", "noopener");

  const semIframe = estado === "ok" && pdfSemIframe();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-full h-[90vh] p-0 flex flex-col" data-fullscreen-modal>
        <DialogHeader className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <DialogTitle>{fileName}</DialogTitle>
            <button
              onClick={baixar}
              disabled={!urlPronta}
              className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-40"
              title="Baixar arquivo"
            >
              <svg
                className="w-4 h-4 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19m0 0l-6-6m6 6l6-6m-6 6V5"
                />
              </svg>
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-slate-100 relative">
          {estado === "carregando" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
              <div className="text-center p-4">
                <div className="w-12 h-12 border-4 border-slate-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-600 text-sm">Carregando arquivo...</p>
              </div>
            </div>
          ) : estado === "base44" || estado === "sem_arquivo" ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <FileWarning className="w-16 h-16 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {estado === "base44"
                  ? "Arquivo do sistema antigo, indisponível"
                  : "Arquivo indisponível"}
              </h3>
              <p className="text-slate-600 max-w-sm">
                {estado === "base44"
                  ? "Este arquivo foi anexado na plataforma anterior, que foi desligada, e não está mais disponível. Anexe-o de novo."
                  : "O arquivo não está mais no armazenamento. Anexe-o de novo."}
              </p>
            </div>
          ) : !iframeError && !semIframe ? (
            <>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 border-4 border-slate-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-slate-600 text-sm">Carregando arquivo...</p>
                  </div>
                </div>
              )}
              <iframe
                src={`${urlPronta}#view=FitH`}
                className="w-full h-full border-none bg-white"
                title={fileName}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6">
              <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {semIframe
                  ? "Visualização de PDF indisponível neste aparelho"
                  : "Erro ao exibir arquivo"}
              </h3>
              <p className="text-slate-600 text-center mb-6 max-w-sm">
                {semIframe
                  ? "O navegador do celular não mostra PDF dentro da página. Abra em uma nova aba ou faça o download."
                  : "O navegador não conseguiu exibir este arquivo. Tente abrir em uma nova aba ou fazer o download."}
              </p>
              <div className="flex gap-3">
                <Button onClick={baixar} className="gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19m0 0l-6-6m6 6l6-6m-6 6V5"
                    />
                  </svg>
                  Baixar arquivo
                </Button>
                <Button variant="outline" onClick={abrirEmNovaAba} className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Abrir em nova aba
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
