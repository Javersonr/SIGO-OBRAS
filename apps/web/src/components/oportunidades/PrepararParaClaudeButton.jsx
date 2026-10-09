import React, { useState } from "react";
import { toast } from "sonner";
import { resolveStorageUrl, sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { extrairPaginasPdf } from "@/lib/edital-ia";
import { gravarTextoPaginas } from "@/lib/envio-arquivos";

/**
 * "Preparar para o Claude" (spec 2026-09-25 §4.8): extrai no navegador o texto de cada página de um
 * PDF já anexado à oportunidade e grava em arquivo_texto_pagina, para o conector do Claude ler com
 * ler_edital_anexado. Serve para arquivos antigos e para os enviados pelo Claude Code (URL
 * assinada), que chegam sem texto. Página digitalizada fica marcada (sem texto legível).
 */
export default function PrepararParaClaudeButton({ arquivo }) {
  const [rodando, setRodando] = useState(false);

  const preparar = async () => {
    setRodando(true);
    const id = toast.loading(`Preparando "${arquivo.nome}" para o Claude…`);
    try {
      const url = await resolveStorageUrl(arquivo.url);
      if (!url) throw new Error("não foi possível abrir o arquivo");
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`download falhou (HTTP ${resp.status})`);
      const file = new File([await resp.blob()], arquivo.nome || "arquivo.pdf", {
        type: "application/pdf",
      });
      const { paginas } = await extrairPaginasPdf(file, (p) => toast.loading(p.texto, { id }), {
        renderizar: false,
        maxEscaneadas: Infinity,
      });
      const n = await gravarTextoPaginas(sigo.entities.ArquivoTextoPagina, {
        empresaId: arquivo.empresa_id,
        arquivoId: arquivo.id,
        paginas,
      });
      const escaneadas = paginas.filter((p) => p.escaneada).length;
      toast.success(
        `Pronto: ${n} página(s) disponíveis para o Claude` +
          (escaneadas ? ` (${escaneadas} digitalizada(s), sem texto legível).` : "."),
        { id }
      );
    } catch (e) {
      toast.error(`Não foi possível preparar "${arquivo.nome}": ${e?.message || "erro"}`, { id });
    } finally {
      setRodando(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      title="Preparar para o Claude (gravar o texto do PDF)"
      disabled={rodando}
      onClick={preparar}
    >
      {rodando ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4 text-violet-600" />
      )}
    </Button>
  );
}
