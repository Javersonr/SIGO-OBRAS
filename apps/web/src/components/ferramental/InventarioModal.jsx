import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import jsQR from "jsqr";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Camera,
  Loader,
  CheckCircle2,
  AlertCircle,
  QrCode,
  RotateCcw,
  Save,
  Trash2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import VerificacaoSerieModal from "./VerificacaoSerieModal";
import CadastroNovaFerramentaModal from "./CadastroNovaFerramentaModal";

export default function InventarioModal({
  open,
  onOpenChange,
  almoxarifados,
  ferramentas,
  empresaAtiva,
  user,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);

  const [step, setStep] = useState("selecionar_local"); // selecionar_local, selecionar_modo, camera, resultado
  const [modoCaptura, setModoCaptura] = useState(null); // 'foto' ou 'qrcode'
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [fotoCapturada, setFotoCapturada] = useState(null);
  const [localizacaoSelecionada, setLocalizacaoSelecionada] = useState("");
  const [itensInventario, setItensInventario] = useState([]);
  const [ferramentaIdentificada, setFerramentaIdentificada] = useState(null);
  const [quantidadeConfirmada, setQuantidadeConfirmada] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoFerramenta, setBuscandoFerramenta] = useState(false);
  const [ferramentasEncontradas, setFerramentasEncontradas] = useState([]);
  const [showVerificacaoSerie, setShowVerificacaoSerie] = useState(false);
  const [showCadastroNova, setShowCadastroNova] = useState(false);
  const [tipoIdentificado, setTipoIdentificado] = useState("");

  // Inicializar câmera
  React.useEffect(() => {
    if (open && step === "camera" && modoCaptura) {
      iniciarCamera();
    } else {
      // Limpar câmera ao sair do step camera
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      scanningRef.current = false;
      setCameraAtiva(false);
    }
  }, [open, step, modoCaptura]);

  // Ler QR code continuamente
  React.useEffect(() => {
    if (step !== "camera" || modoCaptura !== "qrcode" || !videoRef.current || !canvasRef.current)
      return;

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
          buscarFerramentaPorQR(code.data);
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
  }, [step, modoCaptura]);

  const iniciarCamera = async () => {
    try {
      console.log("[InventarioModal] Iniciando câmera...");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso à câmera");
      }

      if (videoRef.current?.srcObject) {
        console.log("[InventarioModal] Parando stream anterior");
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const constraints = [
        {
          video: {
            facingMode: { ideal: "environment" },
            focusMode: { ideal: "continuous" },
            autoFocus: true,
          },
          audio: false,
        },
        { video: { facingMode: "environment", focusMode: { ideal: "continuous" } }, audio: false },
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];

      let stream;
      for (let i = 0; i < constraints.length; i++) {
        try {
          console.log(`[InventarioModal] Tentativa ${i + 1}: ${JSON.stringify(constraints[i])}`);
          stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
          console.log(`[InventarioModal] ✓ Sucesso na tentativa ${i + 1}`);
          break;
        } catch (err) {
          console.error(`[InventarioModal] Tentativa ${i + 1} falhou:`, err.name, err.message);
          if (i === constraints.length - 1) throw err;
        }
      }

      if (!stream) throw new Error("Nenhuma stream de câmera foi obtida");
      if (!videoRef.current) throw new Error("Referência de vídeo não disponível");

      videoRef.current.srcObject = stream;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout ao carregar câmera")), 8000);
        const onLoadedMetadata = () => {
          clearTimeout(timeout);
          videoRef.current?.removeEventListener("loadedmetadata", onLoadedMetadata);
          resolve();
        };
        if (videoRef.current.readyState >= 1) {
          clearTimeout(timeout);
          resolve();
        } else {
          videoRef.current.addEventListener("loadedmetadata", onLoadedMetadata);
        }
      });

      try {
        await videoRef.current.play();
        console.log("[InventarioModal] ✓ Video playing");
      } catch (playErr) {
        console.error("[InventarioModal] Erro ao play, tentando novamente:", playErr);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await videoRef.current.play();
        console.log("[InventarioModal] ✓ Video playing (tentativa 2)");
      }

      setCameraAtiva(true);
      console.log("[InventarioModal] ✓ Câmera pronta");
      toast.success("✓ Câmera pronta");
    } catch (error) {
      console.error("[InventarioModal] Erro ao acessar câmera:", error);
      toast.error("Erro ao acessar a câmera: " + error.message);
      setCameraAtiva(false);
    }
  };

  const buscarFerramentaPorQR = async (qrCode) => {
    try {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        setCameraAtiva(false);
      }
      scanningRef.current = false;

      const ferramentasMatch = ferramentas.filter(
        (f) => f.qrcode_data === qrCode || f.codigo === qrCode
      );

      if (ferramentasMatch.length === 0) {
        toast.error("Ferramenta não encontrada");
        setStep("camera");
        iniciarCamera();
        return;
      }

      // Agrupar por descrição para contar quantidade
      const ferramentaGrupo = ferramentasMatch[0];
      setFerramentaIdentificada({
        codigo: ferramentaGrupo.codigo,
        descricao: ferramentaGrupo.descricao,
        marca: ferramentaGrupo.marca,
        modelo: ferramentaGrupo.modelo,
        foto_url: ferramentaGrupo.foto_url,
        quantidade_encontrada: ferramentasMatch.length,
      });
      setStep("resultado");
    } catch (error) {
      console.error("Erro ao buscar ferramenta:", error);
      toast.error("Erro ao buscar ferramenta");
      setStep("camera");
    }
  };

  const capturarFoto = async () => {
    if (!videoRef.current || !localizacaoSelecionada) {
      toast.error("Selecione um local primeiro");
      return;
    }

    setCapturando(true);

    try {
      const video = videoRef.current;

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        toast.error("Câmera não está pronta");
        setCapturando(false);
        return;
      }

      // Criar canvas e capturar imagem
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;

      const context = tempCanvas.getContext("2d");
      if (!context) throw new Error("Contexto canvas indisponível");

      context.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      const fotoDataUrl = tempCanvas.toDataURL("image/jpeg", 0.6);

      if (!fotoDataUrl || fotoDataUrl.length < 100) {
        throw new Error("Imagem vazia ou inválida");
      }

      // Parar câmera IMEDIATAMENTE
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      setCameraAtiva(false);
      setFotoCapturada(fotoDataUrl);
      setBuscandoFerramenta(true);
      setStep("resultado");
      setCapturando(false);

      // Fazer upload e busca DEPOIS de mudarem os estados
      setTimeout(async () => {
        try {
          const response = await fetch(fotoDataUrl);
          const blob = await response.blob();
          const file = new File([blob], "inventario.jpg", { type: "image/jpeg" });

          const uploadRes = await base44.integrations.Core.UploadFile({ file });
          const fotoUrl = uploadRes.file_url;

          const buscarRes = await base44.functions.invoke("buscarFerramentaPorFoto", {
            fotoUrl,
            empresaAtiva,
          });

          console.log("[InventarioModal] Resposta busca:", buscarRes.data);

          if (buscarRes.data?.ferramentas?.length > 0) {
            setFerramentasEncontradas(buscarRes.data.ferramentas);
          } else {
            toast.error(buscarRes.data?.motivo || "Nenhuma ferramenta encontrada");
            setFerramentasEncontradas([]);
          }
        } catch (error) {
          console.error("[InventarioModal] Erro na busca:", error);
          toast.error("Erro ao buscar ferramentas: " + error.message);
          setFerramentasEncontradas([]);
        } finally {
          setBuscandoFerramenta(false);
        }
      }, 50);
    } catch (error) {
      console.error("Erro ao capturar:", error);
      toast.error("Erro: " + error.message);
      setCapturando(false);
      setBuscandoFerramenta(false);
    }
  };

  const handleFerramentaSelecionada = (ferramenta) => {
    setFerramentaIdentificada(ferramenta);
    // Se tem número de série cadastrado, verificar
    if (ferramenta.numero_serie) {
      setShowVerificacaoSerie(true);
    } else {
      // Ir direto para quantidade
      setQuantidadeConfirmada("");
    }
  };

  const handleVerificacaoSerieConfirmada = (serie) => {
    toast.success(`Série verificada: ${serie}`);
    setShowVerificacaoSerie(false);
    setQuantidadeConfirmada("");
  };

  const handleVerificacaoSeriePulada = () => {
    toast.success("OK - continuando sem verificação de série");
    setShowVerificacaoSerie(false);
    setQuantidadeConfirmada("");
  };

  const adicionarItemInventario = async () => {
    if (!ferramentaIdentificada || !quantidadeConfirmada) {
      toast.error("Preencha a quantidade");
      return;
    }

    const novoItem = {
      id: Date.now(),
      ...ferramentaIdentificada,
      quantidade: parseInt(quantidadeConfirmada),
      localizacao: localizacaoSelecionada,
      data: new Date().toISOString(),
    };

    // Registrar no histórico
    try {
      const user = await base44.auth.me();
      await base44.entities.InventarioHistorico.create({
        empresa_id: empresaAtiva.id,
        ferramenta_id: ferramentaIdentificada.id,
        ferramenta_codigo: ferramentaIdentificada.codigo,
        ferramenta_descricao: ferramentaIdentificada.descricao,
        quantidade: parseInt(quantidadeConfirmada),
        localizacao: localizacaoSelecionada,
        usuario_email: user?.email,
        usuario_nome: user?.full_name,
        foto_url: fotoCapturada,
        tipo_operacao: "Entrada",
        confianca_ia: ferramentaIdentificada.confianca,
        metodo_identificacao: modoCaptura === "qrcode" ? "QR Code" : "Foto",
        numero_serie_verificado: ferramentaIdentificada.numero_serie,
        timestamp: new Date().toISOString(),
        ativo: true,
      });
    } catch (error) {
      console.error("Erro ao registrar histórico:", error);
    }

    setItensInventario([...itensInventario, novoItem]);
    setFerramentaIdentificada(null);
    setQuantidadeConfirmada("");
    setFotoCapturada(null);
    setFerramentasEncontradas([]);
    setStep("selecionar_modo");
    setModoCaptura(null);

    toast.success("Item adicionado ao inventário");
  };

  const handleCadastroNovaFerramenta = async (dados) => {
    try {
      const novaFerramenta = await base44.entities.Ferramenta.create({
        empresa_id: empresaAtiva.id,
        ...dados,
        status: "Disponível",
        quantidade_estoque: 0,
        ativo: true,
      });

      // Adicionar direto ao inventário
      const novoItem = {
        ...dados,
        id: novaFerramenta.id,
        quantidade: parseInt(quantidadeConfirmada || 1),
        localizacao: localizacaoSelecionada,
        data: new Date().toISOString(),
      };

      setItensInventario([...itensInventario, novoItem]);
      setShowCadastroNova(false);
      setFerramentaIdentificada(null);
      setQuantidadeConfirmada("");
      setFotoCapturada(null);
      setFerramentasEncontradas([]);
      setStep("selecionar_modo");
      setModoCaptura(null);

      toast.success("Ferramenta cadastrada e adicionada ao inventário");
    } catch (error) {
      console.error("Erro ao cadastrar ferramenta:", error);
      toast.error("Erro ao cadastrar ferramenta");
    }
  };

  const removerItem = (id) => {
    setItensInventario(itensInventario.filter((item) => item.id !== id));
    toast.success("Item removido");
  };

  const salvarInventario = async () => {
    if (itensInventario.length === 0) {
      toast.error("Nenhum item para salvar");
      return;
    }

    setSalvando(true);
    try {
      for (const item of itensInventario) {
        // Buscar ferramentas no estoque
        const ferramentasEstoque = ferramentas.filter(
          (f) => f.codigo === item.codigo && f.localizacao === item.localizacao
        );

        // Atualizar quantidade
        for (const ferrEstoque of ferramentasEstoque) {
          await base44.entities.Ferramenta.update(ferrEstoque.id, {
            quantidade_estoque: item.quantidade,
          });
        }

        // Registrar movimentação
        if (ferramentasEstoque.length > 0) {
          await base44.entities.MovimentacaoFerramenta.create({
            empresa_id: empresaAtiva.id,
            ferramenta_id: ferramentasEstoque[0].id,
            ferramenta_codigo: item.codigo,
            ferramenta_descricao: item.descricao,
            tipo_movimentacao: "Inventário",
            quantidade: item.quantidade,
            usuario_nome: user.full_name,
            usuario_email: user.email,
            destino: item.localizacao,
            observacoes: `Inventário - ${item.quantidade} unidades`,
            data_movimentacao: item.data.split("T")[0],
            status: "Realizada",
          });
        }
      }

      toast.success(`Inventário salvo com ${itensInventario.length} item(ns)`);
      setItensInventario([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar inventário");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title="Inventário de Ferramental"
      subtitle={`${itensInventario.length} item(ns) no inventário`}
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setItensInventario([]);
              setStep("selecionar_local");
              setModoCaptura(null);
              setLocalizacaoSelecionada("");
            }}
          >
            Cancelar
          </Button>
          {itensInventario.length > 0 && (
            <Button
              onClick={salvarInventario}
              disabled={salvando}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              <Save className="w-4 h-4" />
              {salvando ? "Salvando..." : `Salvar Inventário (${itensInventario.length})`}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Step: Selecionar Local */}
        {step === "selecionar_local" && (
          <div className="space-y-4">
            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="text-sm font-semibold text-blue-800 mb-3">
                Passo 1: Selecione o Local do Almoxarifado
              </p>
            </Card>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Locais disponíveis *</Label>
              {almoxarifados.length === 0 ? (
                <Card className="p-3 bg-slate-50 text-center">
                  <p className="text-sm text-slate-600">Nenhum almoxarifado cadastrado</p>
                </Card>
              ) : (
                almoxarifados.map((local) => (
                  <div
                    key={local}
                    className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-blue-50 transition"
                    onClick={() => setLocalizacaoSelecionada(local)}
                  >
                    <Checkbox
                      checked={localizacaoSelecionada === local}
                      onChange={() => setLocalizacaoSelecionada(local)}
                    />
                    <Label className="flex-1 cursor-pointer font-medium text-slate-800">
                      {local}
                    </Label>
                  </div>
                ))
              )}
            </div>

            {localizacaoSelecionada && (
              <Button
                onClick={() => setStep("selecionar_modo")}
                className="w-full bg-blue-600 hover:bg-blue-700 mt-4"
              >
                Continuar
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setItensInventario([]);
                setStep("selecionar_local");
                setModoCaptura(null);
                setLocalizacaoSelecionada("");
              }}
              className="w-full"
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* Debug */}
        {import.meta.env.DEV && (
          <Card className="p-2 bg-slate-50 border-slate-200">
            <p className="text-xs text-slate-600">
              Debug: step={step}, localizacao={localizacaoSelecionada}, modo={modoCaptura}, camera=
              {cameraAtiva}
            </p>
          </Card>
        )}

        {/* Step: Selecionar Modo */}
        {step === "selecionar_modo" && localizacaoSelecionada && modoCaptura === null && (
          <div className="space-y-4">
            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="text-sm font-semibold text-blue-800 mb-2">
                Passo 2: Como deseja capturar?
              </p>
              <p className="text-xs text-blue-700">
                Local: <span className="font-semibold">{localizacaoSelecionada}</span>
              </p>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setModoCaptura("foto");
                    setStep("camera");
                  }}
                  className="w-full justify-start gap-2 h-auto py-3"
                >
                  <Camera className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <p className="font-semibold">Capturar Foto</p>
                    <p className="text-xs text-slate-600">A IA identificará a ferramenta</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setModoCaptura("qrcode");
                    setStep("camera");
                  }}
                  className="w-full justify-start gap-2 h-auto py-3"
                >
                  <QrCode className="w-5 h-5 text-amber-600" />
                  <div className="text-left">
                    <p className="font-semibold">Ler QR Code</p>
                    <p className="text-xs text-slate-600">Digitalize o QR code da ferramenta</p>
                  </div>
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Step: Câmera - Capturar Foto */}
        {step === "camera" && modoCaptura === "foto" && (
          <div className="space-y-4">
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
                  setModoCaptura(null);
                  setStep("selecionar_modo");
                  if (videoRef.current?.srcObject) {
                    videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
                    setCameraAtiva(false);
                  }
                }}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                onClick={capturarFoto}
                disabled={capturando || !cameraAtiva}
                className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
              >
                {capturando ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Capturando...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Capturar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Câmera - QR Code */}
        {step === "camera" && modoCaptura === "qrcode" && (
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
                setModoCaptura(null);
                setStep("selecionar_modo");
                scanningRef.current = false;
                if (videoRef.current?.srcObject) {
                  videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
                  setCameraAtiva(false);
                }
              }}
              className="w-full"
            >
              Voltar
            </Button>
          </div>
        )}

        {/* Loading - Buscando Ferramenta */}
        {step === "resultado" && buscandoFerramenta && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-slate-600">Buscando ferramentas no banco de dados...</p>
          </div>
        )}

        {/* Step: Resultado - Selecionar Ferramenta */}
        {step === "resultado" &&
          !buscandoFerramenta &&
          ferramentasEncontradas.length > 0 &&
          !ferramentaIdentificada && (
            <div className="space-y-4">
              <Card className="p-4 bg-green-50 border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800">Ferramentas Encontradas</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Selecione a ferramenta identificada ou escolha outra
                    </p>
                  </div>
                </div>
              </Card>

              {fotoCapturada && (
                <Card className="p-2 bg-slate-50 border-slate-200">
                  <img
                    src={fotoCapturada}
                    alt="Foto capturada"
                    className="w-full h-32 object-contain rounded"
                  />
                </Card>
              )}

              <div className="space-y-2">
                {ferramentasEncontradas.map((ferr) => (
                  <Card
                    key={ferr.id}
                    onClick={() => handleFerramentaSelecionada(ferr)}
                    className="p-3 cursor-pointer border-2 hover:border-blue-500 transition"
                  >
                    <div className="flex gap-3">
                      {ferr.foto_url && (
                        <img
                          src={ferr.foto_url}
                          alt={ferr.descricao}
                          className="w-16 h-16 object-contain rounded border"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{ferr.descricao}</p>
                        <p className="text-xs text-slate-600">{ferr.codigo}</p>
                        {ferr.marca && <p className="text-xs text-slate-600">{ferr.marca}</p>}
                        <div className="flex gap-1 mt-2">
                          <Badge className="bg-blue-100 text-blue-800 text-xs">
                            {ferr.confianca}%
                          </Badge>
                          {ferr.numero_serie && (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">
                              Série: {ferr.numero_serie}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setFerramentasEncontradas([]);
                  setFotoCapturada(null);
                  setStep("selecionar_modo");
                  setModoCaptura(null);
                }}
                className="w-full gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Tentar Novamente
              </Button>
            </div>
          )}

        {/* Step: Resultado - Confirmar Item Selecionado */}
        {step === "resultado" && ferramentaIdentificada && (
          <div className="space-y-4">
            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-800">Ferramenta Identificada</p>
                  <p className="text-sm text-slate-600 mt-1">{ferramentaIdentificada.descricao}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge className="bg-green-200 text-green-800">
                      {ferramentaIdentificada.codigo}
                    </Badge>
                    <Badge className="bg-green-100 text-green-900">
                      Confiança: {ferramentaIdentificada.confianca}%
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>

            {ferramentaIdentificada.foto_url && fotoCapturada && (
              <Card className="p-3 bg-blue-50 border-blue-200">
                <p className="text-xs font-semibold text-blue-800 mb-2">Comparação:</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Banco</p>
                    <img
                      src={ferramentaIdentificada.foto_url}
                      alt="Referência"
                      className="w-full h-24 object-contain rounded border"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Capturada</p>
                    <img
                      src={fotoCapturada}
                      alt="Capturada"
                      className="w-full h-24 object-contain rounded border"
                    />
                  </div>
                </div>
              </Card>
            )}

            <div>
              <Label>Quantidade no Almoxarifado *</Label>
              <Input
                type="number"
                min="0"
                value={quantidadeConfirmada}
                onChange={(e) => setQuantidadeConfirmada(e.target.value)}
                placeholder="Ex: 5"
                className="mt-1.5"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFerramentaIdentificada(null);
                  setQuantidadeConfirmada("");
                  setFotoCapturada(null);
                  setFerramentasEncontradas([]);
                  setStep("resultado");
                }}
                className="flex-1 gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Outra Ferramenta
              </Button>
              <Button
                onClick={adicionarItemInventario}
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar ao Inventário
              </Button>
            </div>
          </div>
        )}

        {/* Resultado - Nenhuma encontrada */}
        {step === "resultado" &&
          !buscandoFerramenta &&
          ferramentasEncontradas.length === 0 &&
          !ferramentaIdentificada && (
            <div className="space-y-4">
              <Card className="p-4 bg-amber-50 border-amber-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">Ferramenta Não Encontrada</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Nenhuma ferramenta similar foi localizada no banco de dados
                    </p>
                  </div>
                </div>
              </Card>

              {fotoCapturada && (
                <Card className="p-2 bg-slate-50 border-slate-200">
                  <img
                    src={fotoCapturada}
                    alt="Foto capturada"
                    className="w-full h-32 object-contain rounded"
                  />
                </Card>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setShowCadastroNova(true);
                    setQuantidadeConfirmada("1");
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Como Nova Ferramenta
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setFerramentasEncontradas([]);
                    setFotoCapturada(null);
                    setStep("selecionar_modo");
                    setModoCaptura(null);
                  }}
                  className="w-full gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Tentar Novamente
                </Button>
              </div>
            </div>
          )}

        {/* Tabela de Items no Inventário */}
        {itensInventario.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">
              Itens no Inventário ({itensInventario.length})
            </h3>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-center">Qtd.</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead className="w-12">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensInventario.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium text-sm">{item.descricao}</TableCell>
                      <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{item.quantidade}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{item.localizacao}</TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removerItem(item.id)}
                          className="h-7 w-7"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* Modais adicionais */}
        <VerificacaoSerieModal
          open={showVerificacaoSerie}
          onOpenChange={setShowVerificacaoSerie}
          ferramenta={ferramentaIdentificada}
          onConfirm={handleVerificacaoSerieConfirmada}
          onSkip={handleVerificacaoSeriePulada}
        />

        <CadastroNovaFerramentaModal
          open={showCadastroNova}
          onOpenChange={setShowCadastroNova}
          fotoUrl={fotoCapturada}
          tipoIdentificado={tipoIdentificado}
          onCadastrar={handleCadastroNovaFerramenta}
          onCancelar={() => {
            setFerramentasEncontradas([]);
            setFotoCapturada(null);
            setStep("selecionar_modo");
            setModoCaptura(null);
          }}
        />
      </div>
    </SheetModalComponent>
  );
}
