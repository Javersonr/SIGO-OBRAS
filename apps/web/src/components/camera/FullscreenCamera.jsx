import React, { useRef, useState, useEffect } from "react";
import { Camera, Upload, X, Loader, RotateCcw, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export default function FullscreenCamera({
  onCaptura,
  onCancel,
  loading,
  title = "Câmera",
  subtitle,
  showUpload = true,
  fileAccept = "image/*,.pdf",
  extraAction = null, // { label, onClick }
}) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [step, setStep] = useState("camera"); // 'camera' | 'preview'
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [fotoCapturada, setFotoCapturada] = useState(null);
  const [videoAspect, setVideoAspect] = useState(null);

  useEffect(() => {
    iniciarCamera();
    return () => pararCamera();
  }, []);

  const iniciarCamera = async () => {
    try {
      setCameraAtiva(false);
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      await new Promise((r) => setTimeout(r, 100));

      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera não suportada");

      let stream;
      const constraints = [
        {
          video: {
            facingMode: { exact: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];

      for (const c of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e) {
          /* continuar */
        }
      }

      if (!stream) throw new Error("Nenhuma câmera encontrada");

      videoRef.current.srcObject = stream;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout câmera")), 8000);
        if (videoRef.current.readyState >= 1) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        videoRef.current.addEventListener(
          "loadedmetadata",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });
      await videoRef.current.play();
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      if (vw && vh) setVideoAspect((vh / vw) * 100);
      setCameraAtiva(true);
    } catch (error) {
      let msg = "Erro ao acessar câmera";
      if (error.name === "NotAllowedError")
        msg = "Permissão negada — autorize a câmera no navegador";
      else if (error.name === "NotFoundError") msg = "Nenhuma câmera encontrada";
      else if (error.name === "NotReadableError") msg = "Câmera em uso por outro app";
      else msg = error.message || msg;
      toast.error(msg);
      onCancel?.();
    }
  };

  const pararCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
    }
    setCameraAtiva(false);
  };

  const capturarFoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error("Câmera não está pronta");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    pararCamera();
    setFotoCapturada(dataUrl);
    setStep("preview");
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // PDFs: upload direto sem passar pelo preview de imagem
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      try {
        pararCamera();
        toast.loading("Fazendo upload do PDF...", { id: "camera-upload" });
        const { sigo } = await import("@/api/sigoClient");
        const result = await sigo.integrations.Core.UploadFile({ file });
        toast.dismiss("camera-upload");
        if (!result?.file_url) throw new Error("Falha no upload");
        toast.success("PDF enviado com sucesso!");
        onCaptura(result.file_url);
        onCancel?.();
      } catch (err) {
        toast.dismiss("camera-upload");
        toast.error("Erro ao enviar PDF: " + err.message);
        iniciarCamera();
      }
      e.target.value = "";
      return;
    }

    // Imagens: preview normal
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFotoCapturada(ev.target.result);
      setStep("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const refazer = () => {
    setFotoCapturada(null);
    setStep("camera");
    iniciarCamera();
  };

  const voltar = () => {
    setFotoCapturada(null);
    setStep("camera");
    onCancel?.();
  };

  const handleConfirm = async () => {
    if (!fotoCapturada) return;
    try {
      toast.loading("Processando imagem...", { id: "camera-upload" });
      const blob = await fetch(fotoCapturada).then((r) => r.blob());
      const { sigo } = await import("@/api/sigoClient");
      const result = await sigo.integrations.Core.UploadFile({
        file: new File([blob], "captura.jpg", { type: "image/jpeg" }),
      });
      toast.dismiss("camera-upload");
      if (!result?.file_url) throw new Error("Falha no upload");
      toast.success("Imagem enviada com sucesso!");
      // Voltar para câmera para permitir múltiplas fotos
      setFotoCapturada(null);
      setStep("camera");
      iniciarCamera();
      onCaptura(result.file_url);
    } catch (err) {
      toast.dismiss("camera-upload");
      toast.error("Erro ao enviar: " + err.message);
    }
  };

  // TELA INTEIRA - Câmera
  if (step === "camera") {
    return (
      <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4 z-10 flex items-center justify-between">
          <button
            onClick={voltar}
            className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <div className="text-center flex-1">
            <h2 className="text-white font-semibold">{title}</h2>
            {subtitle && <p className="text-white/70 text-xs mt-1">{subtitle}</p>}
          </div>
          <div className="w-10" />
        </div>

        {/* Vídeo fullscreen */}
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          {!cameraAtiva && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center text-white">
                <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm">Iniciando câmera...</p>
              </div>
            </div>
          )}
        </div>

        {/* Botão transparente no centro (estilo WhatsApp) */}
        <div className="absolute inset-0 flex items-end justify-center pb-32 pointer-events-none">
          <button
            onClick={capturarFoto}
            disabled={!cameraAtiva}
            className="pointer-events-auto w-20 h-20 rounded-full border-4 border-white/60 hover:border-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
          >
            <div className="w-full h-full rounded-full bg-white/20 flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
          </button>
        </div>

        {/* Footer com botões */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 flex gap-3 justify-center items-center">
          {showUpload && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <Upload className="w-5 h-5 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={fileAccept}
                onChange={handleUpload}
                className="hidden"
              />
            </>
          )}
          <button
            onClick={voltar}
            className="px-6 py-2 rounded-full bg-red-600/80 hover:bg-red-700 text-white font-medium transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancelar
          </button>
          {extraAction && (
            <button
              onClick={extraAction.onClick}
              className="px-6 py-2 rounded-full bg-green-600/90 hover:bg-green-700 text-white font-medium transition-colors"
            >
              {extraAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  // PREVIEW - Tela cheia
  if (step === "preview" && fotoCapturada) {
    return (
      <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-b from-black/60 to-transparent p-4 flex items-center justify-between">
          <h2 className="text-white font-semibold">{title} — Preview</h2>
          <button
            onClick={voltar}
            className="p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Imagem */}
        <div className="flex-1 flex items-center justify-center overflow-auto">
          <img src={fotoCapturada} alt="Preview" className="max-w-full max-h-full object-contain" />
        </div>

        {/* Botões */}
        <div className="bg-gradient-to-t from-black/60 to-transparent p-4 flex gap-3">
          <button
            onClick={refazer}
            disabled={loading}
            className="flex-1 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Refazer
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : "✓"}
            {loading ? "Processando..." : "Confirmar"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
