import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import VisualizadorPDF from './VisualizadorPDF';

export default function VisualizarArquivoModal({ arquivo, open, onOpenChange }) {
  if (!arquivo?.url) return null;

  const nome = arquivo.nome || 'arquivo';
  const url = arquivo.url;
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(nome) || (arquivo.tipo && arquivo.tipo.startsWith('image/'));
  const isPdf = /\.pdf$/i.test(nome) || (arquivo.tipo && arquivo.tipo.includes('pdf'));

  const handleDownload = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  // PDFs: usar VisualizadorPDF direto
  if (isPdf) {
    return (
      <VisualizadorPDF
        fileUrl={url}
        fileName={nome}
        onClose={() => onOpenChange(false)}
        onDownload={handleDownload}
      />
    );
  }

  // Imagens
  if (isImage) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-full h-[90vh] p-0 flex flex-col" data-fullscreen-modal>
          <DialogHeader className="p-4 border-b border-slate-200 flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle>{nome}</DialogTitle>
              <button 
                onClick={handleDownload}
                className="p-2 hover:bg-slate-100 rounded-lg"
                title="Baixar"
              >
                <Download className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100">
            <img
              src={url}
              alt={nome}
              className="max-w-full max-h-full object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Outros arquivos
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-fullscreen-modal>
        <DialogHeader>
          <DialogTitle>{nome}</DialogTitle>
        </DialogHeader>
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-sm text-slate-500 mb-6">Este tipo de arquivo não pode ser visualizado diretamente.</p>
          <div className="flex flex-col gap-3">
            <Button onClick={handleDownload} className="gap-2 w-full">
              <Download className="w-4 h-4" />
              Baixar arquivo
            </Button>
            <Button variant="outline" onClick={() => window.open(url, '_blank')} className="gap-2 w-full">
              <ExternalLink className="w-4 h-4" />
              Abrir em nova aba
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}