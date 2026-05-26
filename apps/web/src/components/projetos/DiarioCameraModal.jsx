import React, { useState } from "react";
import { toast } from "sonner";
import FullscreenCamera from "@/components/camera/FullscreenCamera";

// Chave para armazenar fotos offline no localStorage
const OFFLINE_KEY = "diario_fotos_offline";

export function getFotosOffline() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function salvarFotoOffline(fotoDataUrl, metadata) {
  const fotos = getFotosOffline();
  fotos.push({
    id: Date.now(),
    dataUrl: fotoDataUrl,
    metadata,
    timestamp: new Date().toISOString(),
    enviada: false,
  });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(fotos));
}

export function marcarFotoEnviada(id) {
  const fotos = getFotosOffline();
  const atualizadas = fotos.map((f) => (f.id === id ? { ...f, enviada: true } : f));
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(atualizadas));
}

export function removerFotosEnviadas() {
  const fotos = getFotosOffline().filter((f) => !f.enviada);
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(fotos));
}

export default function DiarioCameraModal({
  open,
  onOpenChange,
  onFotosSalvas,
  projetoId,
  empresaId,
}) {
  const [fotosCapturadas, setFotosCapturadas] = useState([]);
  const [loading, setLoading] = useState(false);
  const isOnline = navigator.onLine;

  if (!open) return null;

  const handleCaptura = async (fileUrl) => {
    // fileUrl já foi feito upload pelo FullscreenCamera
    setFotosCapturadas((prev) => [...prev, { url: fileUrl, offline: false }]);
    toast.success(`✓ Foto ${fotosCapturadas.length + 1} salva! Tire mais ou conclua.`);
    // Não fecha — deixa o usuário tirar mais fotos (o FullscreenCamera reinicia a câmera automaticamente)
  };

  const handleConcluir = () => {
    const urls = fotosCapturadas.filter((f) => f.url).map((f) => f.url);
    onFotosSalvas(urls, 0);
    setFotosCapturadas([]);
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (fotosCapturadas.length > 0) {
      handleConcluir();
    } else {
      setFotosCapturadas([]);
      onOpenChange(false);
    }
  };

  return (
    <FullscreenCamera
      onCaptura={handleCaptura}
      onCancel={handleCancel}
      loading={loading}
      title="Diário de Obra"
      subtitle={
        fotosCapturadas.length > 0
          ? `${fotosCapturadas.length} foto(s) — tire mais ou cancele para concluir`
          : "Tire uma foto para o diário"
      }
      showUpload={true}
      fileAccept="image/*"
      extraAction={
        fotosCapturadas.length > 0
          ? {
              label: `Concluir (${fotosCapturadas.length})`,
              onClick: handleConcluir,
            }
          : null
      }
    />
  );
}
