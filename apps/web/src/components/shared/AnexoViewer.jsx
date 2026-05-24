import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function AnexoViewer({ anexo, open, onOpenChange }) {
  const [imageZoom, setImageZoom] = useState(1);

  const fileUrl = anexo?.url || anexo?.file_url || anexo?.arquivo_url || '';
  const fileName = anexo?.nome || anexo?.name || anexo?.arquivo_nome || 'arquivo';
  const fileType = anexo?.tipo || anexo?.type || '';

  const isPDF = fileUrl.toLowerCase().endsWith('.pdf') ||
    fileType.includes('pdf') ||
    fileName.toLowerCase().endsWith('.pdf');

  const isImage = fileType.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileUrl) ||
    /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName);

  if (!anexo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-full h-[85vh] p-0 flex flex-col gap-0" aria-describedby="anexo-viewer-desc">
        <div className="flex items-center justify-between p-4 border-b bg-white flex-shrink-0">
          <DialogTitle className="text-lg font-semibold truncate flex-1">
            {fileName}
          </DialogTitle>
        </div>
        <div id="anexo-viewer-desc" className="sr-only">Visualizador de anexos</div>

        <div className="flex-1 overflow-hidden bg-slate-50 flex items-center justify-center">
           {isImage ? (
             <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
               <img
                 src={fileUrl}
                 alt={fileName}
                 className="cursor-zoom-in select-none"
                 style={{
                   maxWidth: '100%',
                   maxHeight: '100%',
                   objectFit: 'contain',
                   transform: `scale(${imageZoom})`,
                   transition: 'transform 0.2s ease'
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
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}