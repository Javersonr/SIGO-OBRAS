import React, { useEffect, useState } from "react";
import { chamarPortal, fmtData } from "./api";
import { safeUrl } from "@/lib/safe-url";
import { TIPOS_DOCUMENTO_PORTAL } from "@/lib/portal-documentos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, RefreshCw, ExternalLink } from "lucide-react";

export default function DocumentosPortal({ token, categoria, onErroSessao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    chamarPortal("documentos", {}, token)
      .then((resposta) => {
        if (ativo) setDados(resposta);
      })
      .catch((e) => {
        if (!ativo) return;
        if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") onErroSessao(e);
        else setErro(e.message || "Não foi possível carregar seus documentos");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [token, versao, onErroSessao]);

  const advertencias = categoria === "advertencias";
  const itens = advertencias
    ? dados?.advertencias || []
    : (dados?.documentos || []).filter((d) => d.tipo === categoria);
  const nome = advertencias ? "Advertências" : TIPOS_DOCUMENTO_PORTAL[categoria];
  return (
    <section className="space-y-3" aria-label={nome}>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{nome}</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={carregando}
          onClick={() => setVersao((v) => v + 1)}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>
      {carregando && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </p>
      )}
      {erro && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {erro}
        </p>
      )}
      {!carregando && !erro && itens.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            <FileText className="w-8 h-8 mx-auto mb-2" />
            Nenhum registro disponível. O RH disponibiliza seus documentos aqui.
          </CardContent>
        </Card>
      )}
      {!carregando &&
        !erro &&
        itens.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="font-semibold break-words">{advertencias ? item.tipo : item.nome}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {advertencias
                    ? fmtData(item.data)
                    : item.competencia
                      ? `Competência: ${item.competencia.split("-").reverse().join("/")}`
                      : `Enviado em ${fmtData(item.data_upload)}`}
                </p>
              </div>
              {advertencias && (
                <p className="text-sm whitespace-pre-wrap break-words">{item.motivo}</p>
              )}
              {item.url && safeUrl(item.url) !== "#" ? (
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" /> Abrir PDF
                  </a>
                </Button>
              ) : !advertencias || item.url ? (
                <p className="text-xs text-amber-700">
                  Arquivo indisponível. Atualize a lista ou fale com o RH.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      <p className="text-xs text-slate-500">
        Para salvar o PDF no celular, abra o arquivo e use a opção de download do navegador. Se o
        link expirar, toque em Atualizar.
      </p>
    </section>
  );
}
