import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WifiOff, Upload, Loader, Wifi } from "lucide-react";
import { sigo, refDoStorage } from "@/api/sigoClient";
import { toast } from "sonner";
import { safeParseJSON } from "@/lib/json-utils";
import { refDoUpload } from "@/lib/anexo-ref";
import { useDiarioOffline } from "./useDiarioOffline";

export default function DiarioOfflineBanner({ empresaAtiva, onSincronizado }) {
  const { isOnline, entradasPendentes, marcarSincronizado, carregarPendentes } = useDiarioOffline();
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = async () => {
    if (!isOnline || sincronizando) return;
    setSincronizando(true);
    let ok = 0;
    try {
      for (const entrada of entradasPendentes) {
        // Fotos já enviadas antes de cair a internet (referências; URL assinada
        // antiga do nosso Storage vira referência) + upload das fotos offline.
        // Grava a REFERÊNCIA "bucket/caminho" — a file_url assinada expira em 1h.
        const fotosAnteriores = safeParseJSON(entrada.fotos, []);
        const fotosRefs = (Array.isArray(fotosAnteriores) ? fotosAnteriores : [])
          .filter(Boolean)
          .map((f) => refDoStorage(f) || f);
        if (entrada.fotos_offline && entrada.fotos_offline.length > 0) {
          for (const dataUrl of entrada.fotos_offline) {
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], "foto_obra.jpg", { type: "image/jpeg" });
            const ref = refDoUpload(await sigo.integrations.Core.UploadFile({ file }));
            if (!ref) throw new Error("Upload da foto sem referência do Storage");
            fotosRefs.push(ref);
          }
        }

        // Criar o DiarioObra no servidor
        await sigo.entities.DiarioObra.create({
          empresa_id: entrada.empresa_id,
          projeto_id: entrada.projeto_id,
          data: entrada.data,
          horario_inicio: entrada.horario_inicio || "",
          horario_fim: entrada.horario_fim || "",
          clima: entrada.clima || "Sol",
          temperatura: entrada.temperatura || "",
          atividades: entrada.atividades,
          observacoes: entrada.observacoes || "",
          problemas: entrada.problemas || "",
          mao_de_obra: entrada.mao_de_obra || "[]",
          fotos: JSON.stringify(fotosRefs),
        });

        await marcarSincronizado(entrada.id);
        ok++;
      }
      toast.success(`✅ ${ok} registro(s) do diário sincronizado(s)!`);
      onSincronizado?.();
    } catch (err) {
      console.error("Erro ao sincronizar diário:", err);
      toast.error("Erro ao sincronizar. Tente novamente.");
    } finally {
      setSincronizando(false);
      carregarPendentes();
    }
  };

  // Mostrar indicador de status online/offline sempre visível
  if (entradasPendentes.length === 0) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${isOnline ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"}`}
      >
        {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
        {isOnline ? "Online" : "Offline — registros salvos localmente"}
      </div>
    );
  }

  return (
    <Card className="p-3 border-orange-300 bg-orange-50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              {entradasPendentes.length} registro(s) offline aguardando envio
            </p>
            <p className="text-xs text-orange-600">Criados sem internet</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={sincronizar}
          disabled={!isOnline || sincronizando}
          className="bg-orange-500 hover:bg-orange-600 gap-1 shrink-0"
        >
          {sincronizando ? (
            <Loader className="w-3 h-3 animate-spin" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          {sincronizando ? "Enviando..." : isOnline ? "Sincronizar" : "Aguardando internet"}
        </Button>
      </div>
    </Card>
  );
}
