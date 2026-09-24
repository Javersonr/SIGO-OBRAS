import React, { useEffect, useState } from "react";
import { resolveStorageUrl } from "@/api/sigoClient";

/**
 * <img> que aceita a referência estável "bucket/caminho" do Storage OU uma
 * URL completa (legado). A URL assinada expira em 1h, então nunca guardamos
 * ela no banco — guardamos a referência e resolvemos na hora de exibir.
 */
export default function ImgStorage({ referencia, alt = "", ...props }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (!referencia) {
      setUrl(null);
      return undefined;
    }
    resolveStorageUrl(referencia).then((u) => {
      if (vivo) setUrl(u);
    });
    return () => {
      vivo = false;
    };
  }, [referencia]);

  if (!url) return null;
  return <img {...props} src={url} alt={alt} />;
}
