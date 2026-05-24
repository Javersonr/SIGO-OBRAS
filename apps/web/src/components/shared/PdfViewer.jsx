/**
 * PdfViewer - Componente utilitário para renderizar PDFs usando Google Docs Viewer.
 * Use este componente em qualquer lugar que precise exibir um iframe de PDF.
 */
import React from 'react';

export default function PdfViewer({ url, title = 'PDF', className = '', style = {} }) {
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  return (
    <iframe
      src={googleViewerUrl}
      title={title}
      className={`w-full h-full border-0 ${className}`}
      style={style}
      allow="fullscreen"
    />
  );
}