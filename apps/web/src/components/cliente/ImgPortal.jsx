import React, { useEffect, useState } from "react";
import ImgStorage, { ArquivoIndisponivel } from "@/components/ImgStorage";
import { ehBase44 } from "@/lib/anexo-ref";

/**
 * Imagem do portal do cliente nos dois modos:
 * - externo (cliente sem sessão da empresa): usa a URL que a Edge Function
 *   portal-cliente-dados já assinou (`assinada`). Não passa pelo ImgStorage:
 *   ele assinaria de novo com a sessão do visitante e o Storage negaria.
 * - interno (admin logado / preview): ImgStorage assina a ref com a sessão.
 * Sem imagem (Base44, arquivo sumido) → <ArquivoIndisponivel>, ou `fallback`.
 */
export default function ImgPortal({ referencia, assinada, externo, fallback, alt = "", ...props }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [assinada]);

  if (!externo) {
    return <ImgStorage referencia={referencia} alt={alt} fallback={fallback} {...props} />;
  }
  if (!referencia && !assinada) return null;
  if (!assinada || falhou) {
    if (fallback !== undefined) return fallback;
    return <ArquivoIndisponivel legado={ehBase44(referencia)} className={props.className} />;
  }
  return <img {...props} src={assinada} alt={alt} onError={() => setFalhou(true)} />;
}

/**
 * Logo da empresa. `logo_url_assinada` só vem das Edge Functions do portal
 * (null quando não há logo exibível); sem a chave, é a empresa lida pelo app
 * logado → assina com a sessão. Sem logo → `fallback` (ex.: o nome).
 */
export function LogoEmpresa({ empresa, fallback = null, ...props }) {
  if (!empresa?.logo_url && !empresa?.logo_url_assinada) return fallback;
  return (
    <ImgPortal
      referencia={empresa.logo_url}
      assinada={empresa.logo_url_assinada}
      externo={empresa.logo_url_assinada !== undefined}
      fallback={fallback}
      alt={empresa.nome || ""}
      {...props}
    />
  );
}
