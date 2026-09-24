import React, { useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sigo, refDoStorage } from "@/api/sigoClient";
import { refDoUpload } from "@/lib/anexo-ref";
import FullscreenCamera from "../camera/FullscreenCamera";

/**
 * onCaptura(ref, urlAssinada): `ref` ("bucket/path") é o que se GRAVA no banco;
 * `urlAssinada` expira em 1h e serve só para pré-visualizar agora.
 */
export default function CapturaComprovanteCamera({ onCaptura, loading }) {
  const [step, setStep] = useState("opcoes"); // 'opcoes' | 'camera'
  const [enviando, setEnviando] = useState(false);
  const fileInputRef = React.useRef(null);

  // FullscreenCamera devolve a URL assinada: extrai a ref estável dela
  const handleCameraCaptura = (fileUrl) => {
    onCaptura(refDoStorage(fileUrl) || fileUrl, fileUrl);
    setStep("opcoes");
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEnviando(true);
      toast.loading("Fazendo upload do comprovante...", { id: "upload" });
      const result = await sigo.integrations.Core.UploadFile({ file });
      toast.dismiss("upload");
      const ref = refDoUpload(result);
      if (!ref) throw new Error("Falha no upload");
      toast.success("Comprovante enviado! Extraindo dados com IA...");
      onCaptura(ref, result.file_url);
    } catch (err) {
      toast.dismiss("upload");
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setEnviando(false);
      e.target.value = "";
    }
  };

  return (
    <>
      {/* Seleção de modo */}
      {step === "opcoes" && (
        <div className="space-y-3 pt-2">
          <Button
            onClick={() => setStep("camera")}
            className="w-full gap-2 h-14 text-base bg-amber-600 hover:bg-amber-700"
            disabled={loading}
          >
            <Camera className="w-5 h-5" />
            Tirar Foto com Câmera
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full gap-2 h-14 text-base"
            disabled={loading}
          >
            <Upload className="w-5 h-5" />
            Upload de Arquivo / Galeria
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Câmera Fullscreen */}
      {step === "camera" && (
        <FullscreenCamera
          onCaptura={handleCameraCaptura}
          onCancel={() => setStep("opcoes")}
          loading={loading}
          title="Comprovante"
          subtitle="Tire uma foto ou selecione da galeria"
          showUpload={true}
          fileAccept="image/*,.pdf"
        />
      )}
    </>
  );
}
