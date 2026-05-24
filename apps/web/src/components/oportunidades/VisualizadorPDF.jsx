import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

export default function VisualizadorPDF({ fileUrl, fileName, onClose, onDownload }) {
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setIframeError(false);
    setIframeLoaded(false);
    if (!fileUrl || typeof fileUrl !== 'string') {
      setIframeError(true);
    }
  }, [fileUrl]);

  useEffect(() => {
    if (iframeLoaded || iframeError) return;
    timeoutRef.current = setTimeout(() => {
      if (!iframeLoaded) setIframeError(true);
    }, 8000);
    return () => clearTimeout(timeoutRef.current);
  }, [iframeLoaded, iframeError]);

  const handleIframeError = () => setIframeError(true);
  const handleIframeLoad = () => setIframeLoaded(true);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-full h-[90vh] p-0 flex flex-col" data-fullscreen-modal>
        <DialogHeader className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <DialogTitle>{fileName}</DialogTitle>
            <button
              onClick={onDownload}
              className="p-2 hover:bg-slate-100 rounded-lg"
              title="Baixar arquivo"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19m0 0l-6-6m6 6l6-6m-6 6V5" />
              </svg>
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-slate-100 relative">
          {!iframeError ? (
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
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
                className="w-full h-full border-none"
                title={fileName}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6">
              <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Erro ao exibir arquivo</h3>
              <p className="text-slate-600 text-center mb-6 max-w-sm">
                O navegador não conseguiu exibir este arquivo. Tente abrir em uma nova aba ou fazer o download.
              </p>
              <div className="flex gap-3">
                <Button onClick={onDownload} className="gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19m0 0l-6-6m6 6l6-6m-6 6V5" />
                  </svg>
                  Baixar arquivo
                </Button>
                <Button variant="outline" onClick={() => window.open(fileUrl, '_blank')} className="gap-2">
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