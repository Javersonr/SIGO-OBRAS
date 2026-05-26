import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera, RotateCcw, Check, X, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";

// Desenha a assinatura pré-definida cursiva no canvas
function desenharAssinaturaPredefinida(canvas, nome) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Linha base
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, canvas.height - 25);
  ctx.lineTo(canvas.width - 20, canvas.height - 25);
  ctx.stroke();

  // Nome pré-preenchido em cursiva (estilo assinatura)
  if (nome) {
    ctx.save();
    ctx.font = `italic 38px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = "#1e3a8a";
    ctx.globalAlpha = 0.55;
    // Centraliza
    const tw = ctx.measureText(nome).width;
    const x = Math.max(15, (canvas.width - tw) / 2);
    ctx.fillText(nome, x, canvas.height - 35);
    ctx.restore();
  }

  // Label
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px Arial";
  ctx.fillText("Assine acima", 15, canvas.height - 8);

  // Configuração padrão para desenho
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

const STEPS = ["foto", "localizacao"];

export default function AssinaturaConfirmacaoModal({
  open,
  onClose,
  onConfirm,
  funcionarioNome,
  itens = [],
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [step, setStep] = useState("assinatura");
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [stream, setStream] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [localizacao, setLocalizacao] = useState(null);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);
  const [enderecoFormatado, setEnderecoFormatado] = useState("");
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) {
      setHasSignature(false);
      setFotoUrl(null);
      setStep("foto");
      setCameraAtiva(false);
      setLocalizacao(null);
      setEnderecoFormatado("");
      pararCamera();
    }
  }, [open]);

  useEffect(() => {
    if (open && step === "foto" && canvasRef.current) {
      desenharAssinaturaPredefinida(canvasRef.current, funcionarioNome);
    }
  }, [open, step, funcionarioNome]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX = e.clientX,
      clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasSignature(true);
    lastPos.current = getPos(e, canvasRef.current);
  };

  const draw = (e) => {
    if (!isDrawing && e.type === "mousemove") return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => setIsDrawing(false);

  const limparAssinatura = () => {
    desenharAssinaturaPredefinida(canvasRef.current, funcionarioNome);
    setHasSignature(false);
  };

  // CÂMERA
  const abrirCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(s);
      setCameraAtiva(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = s;
      }, 100);
    } catch {
      // tentar câmera frontal como fallback
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(s);
        setCameraAtiva(true);
        setTimeout(() => {
          if (videoRef.current) videoRef.current.srcObject = s;
        }, 100);
      } catch {
        toast.error("Não foi possível acessar a câmera");
      }
    }
  };

  const pararCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraAtiva(false);
  };

  const tirarFoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setFotoUrl(canvas.toDataURL("image/jpeg", 0.85));
    pararCamera();
  };

  // LOCALIZAÇÃO
  const buscarLocalizacao = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo");
      return;
    }
    setBuscandoLocalizacao(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocalizacao({ latitude, longitude, accuracy });
        // Tentar geocodificação reversa
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await resp.json();
          const addr = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setEnderecoFormatado(addr);
        } catch {
          setEnderecoFormatado(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        }
        setBuscandoLocalizacao(false);
      },
      (err) => {
        toast.error("Não foi possível obter a localização. Verifique as permissões.");
        setBuscandoLocalizacao(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // CONFIRMAR
  const confirmar = async () => {
    if (!fotoUrl) {
      toast.error("Foto de confirmação obrigatória");
      setStep("foto");
      return;
    }
    if (!localizacao) {
      toast.error("Localização obrigatória");
      setStep("localizacao");
      return;
    }

    setSalvando(true);
    try {
      // Upload foto
      const fotoBlob = await fetch(fotoUrl).then((r) => r.blob());
      const fotoFile = new File([fotoBlob], "foto_confirmacao.jpg", { type: "image/jpeg" });
      const { file_url: fotoUploadUrl } = await sigo.integrations.Core.UploadFile({
        file: fotoFile,
      });

      const dataHora = new Date().toISOString();
      const localizacaoStr = JSON.stringify({
        latitude: localizacao.latitude,
        longitude: localizacao.longitude,
        accuracy: localizacao.accuracy,
        endereco: enderecoFormatado,
        timestamp: dataHora,
      });

      toast.success("Foto e localização registradas!");
      onConfirm({
        assinatura_url: "",
        foto_confirmacao_url: fotoUploadUrl,
        data_hora_assinatura: dataHora,
        localizacao: localizacaoStr,
        endereco_confirmacao: enderecoFormatado,
      });
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar confirmação");
    } finally {
      setSalvando(false);
    }
  };

  const stepOk = { foto: !!fotoUrl, localizacao: !!localizacao };

  const stepLabel = (s) =>
    ({
      foto: "Foto",
      localizacao: "Localização",
    })[s];

  const stepIcon = (s) =>
    ({
      foto: <Camera className="w-3.5 h-3.5" />,
      localizacao: <MapPin className="w-3.5 h-3.5" />,
    })[s];

  const tudo_ok = stepOk.foto && stepOk.localizacao;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden rounded-xl">
        {/* Header */}
        <div className="bg-slate-800 text-white px-5 py-4">
          <h2 className="text-base font-semibold">Confirmação de Movimentação</h2>
          {funcionarioNome && (
            <p className="text-xs text-slate-300 mt-0.5">
              Responsável: <span className="font-medium text-white">{funcionarioNome}</span>
            </p>
          )}
        </div>

        {/* Itens resumo */}
        {itens.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 max-h-24 overflow-y-auto">
            <p className="text-xs font-medium text-slate-600 mb-1">Itens:</p>
            <div className="space-y-0.5">
              {itens.map((item, i) => (
                <div key={i} className="text-xs text-slate-700 flex gap-2">
                  <span className="text-slate-400">•</span>
                  <span>
                    {item.descricao || item.nome}
                    {item.codigo ? (
                      <span className="font-mono text-slate-500 ml-1">({item.codigo})</span>
                    ) : (
                      ""
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs de progresso */}
        <div className="flex border-b border-slate-200 bg-white">
          {STEPS.map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors relative ${
                step === s
                  ? "border-b-2 border-slate-800 text-slate-800"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {stepIcon(s)}
              {stepLabel(s)}
              {stepOk[s] && <span className="w-2 h-2 bg-green-500 rounded-full" />}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 min-h-[220px]">
          {/* ===== FOTO ===== */}
          {step === "foto" && (
            <div className="text-center">
              {!cameraAtiva && !fotoUrl && (
                <div className="py-4">
                  <Camera className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-1">Foto de Confirmação</p>
                  <p className="text-xs text-slate-400 mb-4">
                    Fotografe o funcionário/local para registrar a entrega
                  </p>
                  <Button onClick={abrirCamera} className="bg-slate-800 hover:bg-slate-700 gap-2">
                    <Camera className="w-4 h-4" /> Abrir Câmera
                  </Button>
                </div>
              )}

              {cameraAtiva && (
                <div>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-xl border-2 border-slate-200 max-h-56 object-cover"
                  />
                  <div className="flex gap-2 mt-3 justify-center">
                    <Button onClick={tirarFoto} className="bg-slate-800 hover:bg-slate-700 gap-2">
                      <Camera className="w-4 h-4" /> Capturar
                    </Button>
                    <Button onClick={pararCamera} variant="outline" size="sm">
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {fotoUrl && !cameraAtiva && (
                <div>
                  <img
                    src={fotoUrl}
                    alt="Confirmação"
                    className="w-full rounded-xl border-2 border-green-200 max-h-48 object-cover mb-3"
                  />
                  <div className="flex gap-2 justify-center mb-3">
                    <Button
                      onClick={() => {
                        setFotoUrl(null);
                        abrirCamera();
                      }}
                      variant="outline"
                      size="sm"
                      className="gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Nova Foto
                    </Button>
                  </div>
                  {/* Botão removido, pois a foto é a última etapa visível */}
                </div>
              )}
            </div>
          )}

          {/* ===== LOCALIZAÇÃO ===== */}
          {step === "localizacao" && (
            <div className="text-center py-2">
              {!localizacao && !buscandoLocalizacao && (
                <>
                  <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-1">Localização GPS</p>
                  <p className="text-xs text-slate-400 mb-4">
                    Registre o local onde a movimentação está sendo confirmada
                  </p>
                  <Button
                    onClick={buscarLocalizacao}
                    className="bg-slate-800 hover:bg-slate-700 gap-2"
                  >
                    <MapPin className="w-4 h-4" /> Capturar Localização
                  </Button>
                </>
              )}

              {buscandoLocalizacao && (
                <div className="py-6">
                  <Loader2 className="w-10 h-10 text-slate-400 mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-slate-500">Buscando localização GPS...</p>
                </div>
              )}

              {localizacao && !buscandoLocalizacao && (
                <div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left mb-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 mb-1">
                          Localização capturada
                        </p>
                        {enderecoFormatado && (
                          <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                            {enderecoFormatado}
                          </p>
                        )}
                        <div className="flex gap-3 text-xs text-slate-500 font-mono">
                          <span>Lat: {localizacao.latitude.toFixed(6)}</span>
                          <span>Lon: {localizacao.longitude.toFixed(6)}</span>
                        </div>
                        {localizacao.accuracy && (
                          <p className="text-xs text-slate-400 mt-1">
                            Precisão: ±{Math.round(localizacao.accuracy)}m
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLocalizacao(null);
                      setEnderecoFormatado("");
                      buscarLocalizacao();
                    }}
                    className="gap-1 text-xs mb-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Recapturar
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progresso visual */}
        <div className="px-5 pb-2">
          <div className="flex gap-2 mb-3">
            {STEPS.map((s) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-all ${stepOk[s] ? "bg-green-500" : "bg-slate-200"}`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center">
            {Object.values(stepOk).filter(Boolean).length}/2 etapas concluídas •{" "}
            {new Date().toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={salvando}>
            <X className="w-4 h-4 mr-1.5" /> Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={salvando || !tudo_ok}
            className={`flex-1 ${tudo_ok ? "bg-green-600 hover:bg-green-700" : "bg-slate-400"}`}
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" /> Confirmar e Enviar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
