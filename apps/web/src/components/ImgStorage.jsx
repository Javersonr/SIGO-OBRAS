import React, { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { resolveStorageUrl } from "@/api/sigoClient";
import { ehBase44 } from "@/lib/anexo-ref";
import { cn } from "@/lib/utils";

/**
 * Caixa no lugar da imagem que não dá para mostrar. Herda o `className` da
 * imagem (mesmo tamanho/borda); o texto só aparece se couber (≥ 96px de
 * largura) — em miniaturas fica o ícone, com o texto no title.
 */
export function ArquivoIndisponivel({ legado = false, className }) {
  const texto = legado ? "Arquivo do sistema antigo, indisponível" : "Arquivo indisponível";
  return (
    <div
      role="img"
      aria-label={texto}
      title={texto}
      className={cn(
        "flex min-h-8 min-w-8 flex-col items-center justify-center gap-1 overflow-hidden bg-slate-100 p-1 text-center text-slate-400 [container-type:inline-size]",
        className
      )}
    >
      <ImageOff className="h-5 w-5 shrink-0" />
      <span className="hidden text-[11px] leading-tight [@container(min-width:96px)]:block">
        {texto}
      </span>
    </div>
  );
}

/**
 * <img> que aceita a referência estável "bucket/caminho" do Storage OU uma
 * URL completa (legado). A URL assinada expira em 1h, então nunca guardamos
 * ela no banco — guardamos a referência e resolvemos na hora de exibir.
 *
 * Sem arquivo para mostrar (Base44 apagado, objeto sumido do Storage ou
 * imagem que não carrega) → <ArquivoIndisponivel> no lugar, ou `fallback`
 * se for passado (fallback={null} = não mostra nada). Com `onError` próprio,
 * quem chamou decide o que fazer quando a imagem não carrega.
 */
export default function ImgStorage({ referencia, alt = "", fallback, onError, ...props }) {
  const legado = ehBase44(referencia);
  const [url, setUrl] = useState(null);
  // carregando | ok | indisponivel
  const [estado, setEstado] = useState("carregando");

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    if (!referencia || legado) {
      setEstado("indisponivel");
      return undefined;
    }
    setEstado("carregando");
    resolveStorageUrl(referencia).then((u) => {
      if (!vivo) return;
      setUrl(u);
      setEstado(u ? "ok" : "indisponivel");
    });
    return () => {
      vivo = false;
    };
  }, [referencia, legado]);

  if (!referencia) return null;
  if (estado === "indisponivel") {
    if (fallback !== undefined) return fallback;
    return <ArquivoIndisponivel legado={legado} className={props.className} />;
  }
  if (!url) return null;
  return (
    <img
      {...props}
      src={url}
      alt={alt}
      onError={(e) => {
        if (onError) onError(e);
        else setEstado("indisponivel");
      }}
    />
  );
}
