import React, { useEffect } from "react";
import { useNitgen } from "./useNitgen";
import { Button } from "@/components/ui/button";
import { Fingerprint, CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";

export default function NitgenCapture({ onCapture, onError }) {
  const { status, deviceInfo, image, error, checkDevice, capture, reset } = useNitgen();

  useEffect(() => {
    checkDevice();
  }, []);

  const handleCapture = async () => {
    const result = await capture();
    if (result) {
      onCapture?.(result);
    } else {
      onError?.(error);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
      {/* Ícone central */}
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
          status === "captured"
            ? "bg-green-100"
            : status === "error"
              ? "bg-red-100"
              : status === "capturing"
                ? "bg-blue-100 animate-pulse"
                : "bg-slate-100"
        }`}
      >
        {status === "captured" ? (
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        ) : status === "error" ? (
          <AlertCircle className="w-10 h-10 text-red-500" />
        ) : status === "capturing" ? (
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        ) : (
          <Fingerprint
            className={`w-10 h-10 ${status === "ready" ? "text-slate-600" : "text-slate-400"}`}
          />
        )}
      </div>

      {/* Status text */}
      <div className="text-center">
        {status === "checking" && (
          <p className="text-sm text-slate-500">Verificando leitor biométrico...</p>
        )}
        {status === "ready" && (
          <>
            <p className="text-sm font-medium text-green-700">Leitor conectado: {deviceInfo}</p>
            <p className="text-xs text-slate-500 mt-1">
              Clique para capturar a digital do funcionário
            </p>
          </>
        )}
        {status === "capturing" && (
          <p className="text-sm text-blue-600 font-medium">Posicione o dedo no leitor...</p>
        )}
        {status === "captured" && (
          <p className="text-sm text-green-600 font-medium">Biometria capturada com sucesso!</p>
        )}
        {status === "error" && (
          <>
            <p className="text-sm text-red-600 font-medium">Erro no leitor biométrico</p>
            <p className="text-xs text-red-500 mt-1">{error}</p>
            {error?.includes("Serviço Nitgen") && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 text-left">
                <strong>Como ativar:</strong>
                <br />
                1. Execute <code className="bg-amber-100 px-1">NitgenService.exe</code> como
                Administrador
                <br />
                2. Aguarde aparecer "Serviço iniciado na porta 7777"
                <br />
                3. Clique em "Tentar novamente"
              </div>
            )}
          </>
        )}
        {status === "idle" && <p className="text-sm text-slate-400">Iniciando...</p>}
      </div>

      {/* Imagem da digital (preview) */}
      {image && status === "captured" && (
        <div className="w-16 h-16 border border-green-300 rounded overflow-hidden">
          <img
            src={`data:image/png;base64,${image}`}
            alt="Digital"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2">
        {status === "ready" && (
          <Button
            onClick={handleCapture}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Fingerprint className="w-4 h-4" />
            Capturar Digital
          </Button>
        )}
        {status === "captured" && (
          <Button onClick={reset} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Recapturar
          </Button>
        )}
        {status === "error" && (
          <Button onClick={checkDevice} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
