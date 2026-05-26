import React, { useState, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import jsQR from "jsqr";
import SheetModal from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Loader,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  QrCode,
  Eye,
  Edit,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export default function FotografarFerramentaStep({
  open,
  onOpenChange,
  ferramenta,
  onFotoSalva,
  onEditar,
  onExcluir,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const scanningRef = useRef(false);

  const [step, setStep] = useState("confirmacao"); // confirmacao, camera, preview, validando, resultado, lendo_qr
  const [modoCamera, setModoCamera] = useState(null); // null, 'capturar', 'qrcode'
  const [fotoCapturada, setFotoCapturada] = useState(null);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [ferramentaBuscada, setFerramentaBuscada] = useState(null);
  const [mostrarComparacao, setMostrarComparacao] = useState(false);
  const [mostrarConfirmacaoSerie, setMostrarConfirmacaoSerie] = useState(false);
  const [numeroSerieConfirmado, setNumeroSerieConfirmado] = useState("");

  // Inicializar câmera
  React.useEffect(() => {
    if (open && ((step === "camera" && modoCamera === "capturar") || step === "lendo_qr")) {
      iniciarCamera();
    }
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      scanningRef.current = false;
    };
  }, [open, step, modoCamera]);

  // Ler QR code continuamente
  React.useEffect(() => {
    if (step !== "lendo_qr" || !videoRef.current || !canvasRef.current) return;

    scanningRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const lerQR = () => {
      if (!scanningRef.current) return;

      try {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          const qrCode = code.data;
          console.log("QR Code lido:", qrCode);
          scanningRef.current = false;
          buscarFerramentaPorQR(qrCode);
          return;
        }
      } catch (error) {
        console.error("Erro ao ler QR:", error);
      }

      requestAnimationFrame(lerQR);
    };

    lerQR();

    return () => {
      scanningRef.current = false;
    };
  }, [step]);

  const iniciarCamera = async () => {
    try {
      setCameraAtiva(false);
      console.log("Iniciando câmera...");

      // Verificar se o navegador suporta mediaDevices
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso à câmera");
      }

      // Parar qualquer stream anterior
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }

      // Aguardar um momento antes de iniciar nova câmera
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Tentar com constraints progressivos
      let stream;
      const constraints = [
        // Primeiro: tentar câmera traseira com qualidade
        {
          video: {
            facingMode: { exact: "environment" },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
          audio: false,
        },
        // Segundo: tentar câmera traseira simples
        {
          video: { facingMode: "environment" },
          audio: false,
        },
        // Terceiro: qualquer câmera com qualidade
        {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        // Último: qualquer câmera
        {
          video: true,
          audio: false,
        },
      ];

      for (let i = 0; i < constraints.length; i++) {
        try {
          console.log(`Tentando constraint ${i + 1}...`);
          stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
          console.log(`✓ Sucesso com constraint ${i + 1}`);
          break;
        } catch (err) {
          console.warn(`Constraint ${i + 1} falhou:`, err);
          if (i === constraints.length - 1) throw err;
        }
      }

      if (!stream) {
        throw new Error("Nenhuma stream de câmera foi obtida");
      }

      if (!videoRef.current) {
        throw new Error("Referência de vídeo não disponível");
      }

      // Aplicar stream ao vídeo
      videoRef.current.srcObject = stream;

      // Aguardar carregamento dos metadados
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout ao carregar câmera"));
        }, 8000);

        const onLoadedMetadata = () => {
          clearTimeout(timeout);
          videoRef.current?.removeEventListener("loadedmetadata", onLoadedMetadata);
          console.log(
            "✓ Metadados carregados:",
            videoRef.current?.videoWidth,
            "x",
            videoRef.current?.videoHeight
          );
          resolve();
        };

        if (videoRef.current.readyState >= 1) {
          clearTimeout(timeout);
          resolve();
        } else {
          videoRef.current.addEventListener("loadedmetadata", onLoadedMetadata);
        }
      });

      // Reproduzir vídeo
      try {
        await videoRef.current.play();
        console.log("✓ Vídeo reproduzindo");
      } catch (playErr) {
        console.error("Erro ao reproduzir:", playErr);
        // Tentar forçar play após um delay
        await new Promise((resolve) => setTimeout(resolve, 300));
        await videoRef.current.play();
      }

      setCameraAtiva(true);
      toast.success("✓ Câmera pronta");
    } catch (error) {
      console.error("Erro ao acessar câmera:", error);

      let mensagem = "Erro ao acessar a câmera";
      if (error.name === "NotAllowedError") {
        mensagem = "Permissão negada - autorize o acesso à câmera";
      } else if (error.name === "NotFoundError") {
        mensagem = "Nenhuma câmera encontrada no dispositivo";
      } else if (error.name === "NotReadableError") {
        mensagem = "Câmera em uso por outro aplicativo";
      } else if (error.name === "OverconstrainedError") {
        mensagem = "Câmera não suporta as configurações solicitadas";
      } else {
        mensagem = error.message || mensagem;
      }

      toast.error(mensagem);
      setCameraAtiva(false);
    }
  };

  const buscarFerramentaPorQR = async (qrCode) => {
    try {
      // Parar câmera
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        setCameraAtiva(false);
      }

      setStep("confirmacao");
      const ferramentas = await sigo.entities.Ferramenta.filter({
        qrcode_data: qrCode,
      });

      if (ferramentas.length === 0) {
        toast.error("QR Code não encontrado no banco de dados");
        return;
      }

      const ferramFetched = ferramentas[0];
      setFerramentaBuscada(ferramFetched);
      toast.success(`Ferramenta encontrada: ${ferramFetched.descricao}`);
    } catch (error) {
      console.error("Erro ao buscar ferramenta:", error);
      toast.error("Erro ao buscar ferramenta");
    }
  };

  const capturarFoto = async () => {
    if (!videoRef.current) {
      toast.error("Câmera não inicializada");
      return;
    }

    const video = videoRef.current;

    try {
      console.log("Capturando foto...");
      console.log("Dimensões do vídeo:", video.videoWidth, "x", video.videoHeight);
      console.log("Estado do vídeo:", video.readyState);

      // Aguardar um frame completo
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error("Vídeo sem dimensões!");
        toast.error("Câmera não está pronta. Aguarde um momento e tente novamente.");
        return;
      }

      // Criar canvas dinamicamente
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;

      const context = tempCanvas.getContext("2d");
      if (!context) throw new Error("Contexto canvas indisponível");

      // Desenhar a imagem
      context.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

      // Converter para JPEG
      const fotoDataUrl = tempCanvas.toDataURL("image/jpeg", 0.95);

      console.log("Foto gerada:", fotoDataUrl.substring(0, 50) + "...");

      if (!fotoDataUrl || fotoDataUrl.length < 100) {
        throw new Error("Imagem vazia ou inválida");
      }

      // Parar câmera ANTES de atualizar estado
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }

      setCameraAtiva(false);
      setFotoCapturada(fotoDataUrl);

      // Dar prioridade ao step antes de exibir toast
      setTimeout(() => {
        setStep("preview");
        toast.success("✓ Foto capturada com sucesso!");
      }, 50);
    } catch (err) {
      console.error("Erro detalhado:", err);
      toast.error("Erro: " + err.message);
    }
  };

  const validarComIA = async () => {
    if (!fotoCapturada) return;

    setValidando(true);
    try {
      // Converter data URL para Blob
      const response = await fetch(fotoCapturada);
      const blob = await response.blob();

      console.log("Blob criado:", blob.type, "tamanho:", blob.size);

      if (!blob || blob.size === 0) {
        throw new Error("Falha ao converter imagem - blob vazio");
      }

      // Converter para File com tipo correto
      const file = new File([blob], "foto.jpg", { type: "image/jpeg" });
      console.log("File criado:", file.name, file.type, file.size);

      // Upload da foto
      const uploadRes = await sigo.integrations.Core.UploadFile({ file });
      console.log("Upload realizado:", uploadRes);
      const fotoUrl = uploadRes.file_url;
      console.log("URL da foto:", fotoUrl);

      // IA do Google valida a ferramenta
      const validacaoResponse = await sigo.functions.invoke("validarFotoComIA", {
        fotoUrl,
        fotoOriginalUrl: ferramenta.foto_url,
        ferramenta: {
          descricao: ferramenta.descricao,
          marca: ferramenta.marca,
          modelo: ferramenta.modelo,
          numero_serie: ferramenta.numero_serie || null,
        },
      });

      console.log("Resposta da validação:", validacaoResponse.data);

      const validacao = validacaoResponse.data;

      // Verificar se houve erro na API
      if (validacao.error) {
        console.error("Erro retornado pela API:", validacao.error);
        throw new Error(validacao.error);
      }

      // Validar estrutura da resposta
      if (
        typeof validacao.mesmaFerramenta === "undefined" &&
        typeof validacao.valido === "undefined"
      ) {
        console.error("Resposta inválida da IA:", validacao);
        throw new Error("Resposta da IA não contém campo de validação");
      }

      const confianca = validacao.confianca || 0;
      const mesmaFerramenta = validacao.mesmaFerramenta || validacao.valido || false;
      const validoComPrecisao = mesmaFerramenta && confianca >= 70;

      setResultado({
        valido: validoComPrecisao,
        confianca: confianca,
        motivo: validacao.motivo || "Sem motivo fornecido",
        fotoUrl,
        ferramentaId: ferramenta.itemId,
      });
      setStep("resultado");
    } catch (error) {
      console.error("Erro completo na validação:", error);
      console.error("Stack trace:", error.stack);
      console.error("Detalhes do erro:", error.response?.data || error.message);

      let mensagemErro = "Erro desconhecido ao validar foto";

      if (error.response?.data?.error) {
        mensagemErro = error.response.data.error;
      } else if (error.message) {
        mensagemErro = error.message;
      }

      toast.error(`Erro: ${mensagemErro}`);

      // Mostrar resultado de erro
      setResultado({
        valido: false,
        confianca: 0,
        motivo: `Erro ao processar: ${mensagemErro}`,
        fotoUrl: fotoCapturada,
      });
      setStep("resultado");
    } finally {
      setValidando(false);
    }
  };

  const salvarFoto = async () => {
    if (!resultado?.valido) {
      // Se a IA não validou, pedir confirmação do número de série
      setMostrarConfirmacaoSerie(true);
      return;
    }

    try {
      const datahora = new Date().toISOString();
      onFotoSalva({
        foto_url: resultado.fotoUrl,
        data_foto: datahora,
        confianca_validacao: resultado.confianca,
      });
      toast.success("✓ Ferramenta validada e foto arquivada com sucesso!");
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar foto. Tente novamente.");
    }
  };

  const confirmarComNumeroSerie = async () => {
    // Se não tem número de série no cadastro, pedir confirmação manual
    if (!ferramenta.numero_serie) {
      if (
        window.confirm(
          "Esta ferramenta não possui número de série cadastrado. Confirma que é a mesma ferramenta?"
        )
      ) {
        try {
          const datahora = new Date().toISOString();
          onFotoSalva({
            foto_url: resultado.fotoUrl,
            data_foto: datahora,
            confianca_validacao: 0,
            confirmada_manualmente: true,
          });
          toast.success("✓ Foto arquivada com confirmação manual!");
          onOpenChange(false);
        } catch (error) {
          console.error("Erro ao salvar:", error);
          toast.error("Erro ao salvar foto. Tente novamente.");
        }
      }
      return;
    }

    // Se tem número de série, pedir que o usuário confirme
    if (!numeroSerieConfirmado) {
      toast.error("Por favor, confirme o número de série da ferramenta");
      return;
    }

    if (
      numeroSerieConfirmado.trim().toUpperCase() === ferramenta.numero_serie.trim().toUpperCase()
    ) {
      try {
        const datahora = new Date().toISOString();
        onFotoSalva({
          foto_url: resultado.fotoUrl,
          data_foto: datahora,
          confianca_validacao: 0,
          confirmada_manualmente: true,
        });
        toast.success("✓ Foto arquivada com confirmação do número de série!");
        onOpenChange(false);
      } catch (error) {
        console.error("Erro ao salvar:", error);
        toast.error("Erro ao salvar foto. Tente novamente.");
      }
    } else {
      toast.error("Número de série não corresponde. Tente novamente.");
      setNumeroSerieConfirmado("");
    }
  };

  return (
    <SheetModal
      open={open}
      onOpenChange={onOpenChange}
      title="Fotografar Ferramenta"
      subtitle={ferramenta.descricao}
    >
      <div className="space-y-4">
        {/* Step: Confirmação */}
        {step === "confirmacao" && (
          <div className="space-y-4">
            {ferramentaBuscada && (
              <Card className="p-3 bg-green-50 border-green-200">
                <p className="text-sm font-semibold text-green-800 mb-2">
                  Ferramenta encontrada pelo QR Code:
                </p>
                <p className="text-sm text-slate-700">{ferramentaBuscada.descricao}</p>
              </Card>
            )}

            {!ferramenta.foto_url && !ferramentaBuscada?.foto_url ? (
              <Card className="p-4 bg-yellow-50 border-yellow-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-yellow-800">
                      Foto de Referência Não Encontrada
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Esta ferramenta não possui uma foto de referência cadastrada. Não será
                      possível validar automaticamente com IA.
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              (() => {
                const ferramDisplay = ferramentaBuscada || ferramenta;
                return (
                  <div className="space-y-3">
                    <Card className="p-3 bg-blue-50 border-blue-200">
                      <p className="text-sm font-semibold text-blue-800 mb-2">
                        Confirme se esta é a ferramenta:
                      </p>
                      <div className="space-y-2">
                        <p className="text-xs text-slate-600">
                          <strong>Descrição:</strong> {ferramDisplay.descricao}
                        </p>
                        <p className="text-xs text-slate-600">
                          <strong>Código:</strong> {ferramDisplay.codigo}
                        </p>
                        {ferramDisplay.numero_serie && (
                          <p className="text-xs text-slate-600">
                            <strong>Número de Série:</strong> {ferramDisplay.numero_serie}
                          </p>
                        )}
                      </div>
                    </Card>

                    <Card className="overflow-hidden">
                      <img
                        src={ferramDisplay.foto_url}
                        alt={ferramDisplay.descricao}
                        className="w-full h-48 object-contain bg-slate-100"
                      />
                    </Card>
                  </div>
                );
              })()
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const ferramDisplay = ferramentaBuscada || ferramenta;
                  const qrcodeData = ferramDisplay.qrcode_data || ferramDisplay.codigo;
                  navigator.clipboard.writeText(qrcodeData);
                  toast.success(`QR Code copiado: ${qrcodeData}`);
                }}
                title="Copiar código QR/Código"
              >
                <QrCode className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setFerramentaBuscada(null);
                  setModoCamera(null);
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  const ferramDisplay = ferramentaBuscada || ferramenta;
                  if (!ferramDisplay.foto_url) {
                    toast.error("Não é possível fotografar sem foto de referência");
                    return;
                  }
                  setModoCamera(null);
                  setStep("camera");
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar e Fotografar
              </Button>
            </div>
          </div>
        )}

        {/* Step: Camera - Escolher Modo */}
        {step === "camera" && modoCamera === null && (
          <div className="space-y-4">
            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="text-sm font-semibold text-blue-800 mb-3">
                Escolha como deseja proceder:
              </p>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => setModoCamera("capturar")}
                  className="w-full justify-start gap-2 h-auto py-3"
                >
                  <Camera className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <p className="font-semibold">Capturar Foto</p>
                    <p className="text-xs text-slate-600">
                      Tire uma foto da ferramenta com a câmera
                    </p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setModoCamera("qrcode");
                    setStep("lendo_qr");
                  }}
                  className="w-full justify-start gap-2 h-auto py-3"
                >
                  <QrCode className="w-5 h-5 text-amber-600" />
                  <div className="text-left">
                    <p className="font-semibold">Ler QR Code</p>
                    <p className="text-xs text-slate-600">Digitalize o QR Code da ferramenta</p>
                  </div>
                </Button>
              </div>
            </Card>

            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Cancelar
            </Button>
          </div>
        )}

        {/* Step: Camera - Capturar Foto */}
        {step === "camera" && modoCamera === "capturar" && (
          <div className="space-y-4">
            {ferramenta.foto_url && (
              <Card className="p-3 bg-blue-50 border-blue-200">
                <p className="text-xs font-semibold text-blue-800 mb-2">📸 Foto de Referência:</p>
                <img
                  src={ferramenta.foto_url}
                  alt={ferramenta.descricao}
                  className="w-full h-32 object-contain bg-white rounded border"
                />
              </Card>
            )}

            <Card className="overflow-hidden bg-slate-900">
              <div className="p-2 bg-slate-800 text-white text-xs font-semibold text-center">
                📷 Câmera Ao Vivo
              </div>
              <div className="relative w-full" style={{ paddingBottom: "75%" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />
              </div>
            </Card>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setModoCamera(null);
                  setStep("camera");
                  if (videoRef.current?.srcObject) {
                    videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
                    setCameraAtiva(false);
                  }
                }}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button onClick={capturarFoto} className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2">
                <Camera className="w-4 h-4" />
                Capturar
              </Button>
            </div>
          </div>
        )}

        {/* Step: Lendo QR Code */}
        {step === "lendo_qr" && (
          <div className="space-y-4">
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-3">
                <QrCode className="w-6 h-6 text-amber-600 animate-pulse" />
                <div>
                  <p className="font-semibold text-amber-800">Procurando QR Code...</p>
                  <p className="text-xs text-amber-700">Aponte a câmera para o código</p>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden bg-slate-900">
              <div className="relative w-full" style={{ paddingBottom: "75%" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </Card>

            <Button
              variant="outline"
              onClick={() => {
                setModoCamera(null);
                setStep("camera");
                scanningRef.current = false;
                if (videoRef.current?.srcObject) {
                  videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
                  setCameraAtiva(false);
                }
              }}
              className="w-full"
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="relative">
              <img
                src={fotoCapturada}
                alt="Prévia"
                className="w-full max-h-64 object-contain rounded-lg bg-slate-100"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFotoCapturada(null);
                  setResultado(null);
                  setStep("camera");
                  iniciarCamera();
                }}
                className="flex-1 gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Refazer
              </Button>
              <Button
                onClick={validarComIA}
                disabled={validando}
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              >
                {validando ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Validando...
                  </>
                ) : (
                  "Validar com IA"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Resultado */}
        {step === "resultado" && resultado && (
          <div className="space-y-4">
            <Card
              className={`p-4 ${resultado.valido ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
            >
              <div className="flex items-start gap-3">
                {resultado.valido ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p
                    className={`font-semibold ${resultado.valido ? "text-green-700" : "text-red-700"}`}
                  >
                    {resultado.valido ? "Ferramenta Validada!" : "Ferramenta Não Corresponde"}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{resultado.motivo}</p>
                  <Badge
                    className={`mt-2 ${resultado.valido ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}
                  >
                    Confiança: {resultado.confianca}%
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Comparação de Fotos */}
            {mostrarComparacao ? (
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Comparação de Fotos</h3>
                  <Button variant="ghost" size="icon" onClick={() => setMostrarComparacao(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Foto de Referência</p>
                    <img
                      src={ferramenta.foto_url}
                      alt="Referência"
                      className="w-full h-48 object-contain rounded bg-slate-100 border"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Foto Capturada</p>
                    <img
                      src={resultado.fotoUrl}
                      alt="Capturada"
                      className="w-full h-48 object-contain rounded bg-slate-100 border"
                    />
                  </div>
                </div>
              </Card>
            ) : (
              <div className="relative">
                <img
                  src={resultado.fotoUrl}
                  alt="Validada"
                  className="w-full max-h-64 object-contain rounded-lg bg-slate-100"
                />
              </div>
            )}

            {/* Botões de Ação */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={() => setMostrarComparacao(!mostrarComparacao)}
                className="gap-2"
              >
                <Eye className="w-4 h-4" />
                Comparar
              </Button>
              {onEditar && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onEditar(ferramenta);
                    onOpenChange(false);
                  }}
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Editar
                </Button>
              )}
              {onExcluir && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (window.confirm("Tem certeza que deseja excluir esta ferramenta?")) {
                      onExcluir(ferramenta);
                      onOpenChange(false);
                    }
                  }}
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </Button>
              )}
            </div>

            {mostrarConfirmacaoSerie ? (
              <div className="space-y-4">
                <Card className="p-4 bg-yellow-50 border-yellow-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-yellow-800">Confirmação Manual Necessária</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        A IA não conseguiu validar a ferramenta com certeza.
                        {ferramenta.numero_serie ? (
                          <>
                            <br />
                            Confirme o número de série: <strong>{ferramenta.numero_serie}</strong>
                          </>
                        ) : (
                          <>
                            <br />
                            Esta ferramenta não possui número de série cadastrado.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>

                {ferramenta.numero_serie && (
                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-2 block">
                      Digite o número de série para confirmar:
                    </label>
                    <input
                      type="text"
                      placeholder={`Ex: ${ferramenta.numero_serie}`}
                      value={numeroSerieConfirmado}
                      onChange={(e) => setNumeroSerieConfirmado(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMostrarConfirmacaoSerie(false);
                      setNumeroSerieConfirmado("");
                      setFotoCapturada(null);
                      setResultado(null);
                      setStep("camera");
                      iniciarCamera();
                    }}
                    className="flex-1"
                  >
                    Tirar Outra Foto
                  </Button>
                  <Button
                    onClick={confirmarComNumeroSerie}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFotoCapturada(null);
                    setResultado(null);
                    setMostrarComparacao(false);
                    setStep("camera");
                    iniciarCamera();
                  }}
                  className="flex-1"
                >
                  Refazer Foto
                </Button>
                <Button
                  onClick={salvarFoto}
                  className={`flex-1 gap-2 ${resultado.valido ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {resultado.valido ? "Arquivar Foto" : "Confirmar Manualmente"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </SheetModal>
  );
}
