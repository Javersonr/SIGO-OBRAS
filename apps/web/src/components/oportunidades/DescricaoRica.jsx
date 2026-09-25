import React, { useMemo } from "react";
import { safeUrl } from "@/lib/safe-url";

/**
 * Descrição da oportunidade: HTML do editor rico (react-quill) ou texto puro
 * (legado / preenchido pela IA). O HTML NÃO vai para dangerouslySetInnerHTML:
 * é lido com DOMParser (documento inerte — não roda script nem carrega imagem)
 * e remontado como elementos React só com as tags do editor. Atributos são
 * descartados, exceto href seguro (safeUrl), recuo/alinhamento do Quill e
 * cor em rgb()/#hex.
 */

// tag → classes (Tailwind zera o estilo de listas e títulos)
const TAGS = {
  p: "my-1",
  div: "",
  span: "",
  br: "",
  strong: "font-semibold",
  b: "font-semibold",
  em: "italic",
  i: "italic",
  u: "underline",
  s: "line-through",
  strike: "line-through",
  ul: "my-1 list-disc pl-5",
  ol: "my-1 list-decimal pl-5",
  li: "",
  h1: "mb-1 mt-2 text-lg font-semibold text-slate-800",
  h2: "mb-1 mt-2 text-base font-semibold text-slate-800",
  h3: "mb-1 mt-2 font-semibold text-slate-800",
  blockquote: "my-1 border-l-2 border-slate-200 pl-3 text-slate-600",
  pre: "my-1 whitespace-pre-wrap rounded bg-slate-100 p-2 font-mono text-xs",
  code: "rounded bg-slate-100 px-1 font-mono text-xs",
  a: "text-amber-700 underline",
};

// Some com o conteúdo (não vira nem texto)
const DESCARTAR = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "head",
  "title",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "select",
  "textarea",
]);

const COR =
  /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const ALINHAMENTO = { center: "center", right: "right", justify: "justify" };

const pareceHtml = (s) => /<\/?[a-z][a-z0-9]*[\s>/]/i.test(s);

/** Só cor/fundo em formato simples e recuo/alinhamento das classes do Quill. */
function estiloSeguro(el) {
  const estilo = {};
  const cor = el.style?.color?.trim();
  if (cor && COR.test(cor)) estilo.color = cor;
  const fundo = el.style?.backgroundColor?.trim();
  if (fundo && COR.test(fundo)) estilo.backgroundColor = fundo;
  const classes = el.getAttribute("class") || "";
  const recuo = classes.match(/ql-indent-(\d)/);
  if (recuo) estilo.paddingLeft = `${Number(recuo[1]) * 1.5}em`;
  const alinha = classes.match(/ql-align-(center|right|justify)/);
  if (alinha) estilo.textAlign = ALINHAMENTO[alinha[1]];
  return Object.keys(estilo).length ? estilo : undefined;
}

function paraReact(no, chave) {
  if (no.nodeType === 3) return no.nodeValue; // texto
  if (no.nodeType !== 1) return null; // comentário etc.
  const tag = no.tagName.toLowerCase();
  if (DESCARTAR.has(tag)) return null;
  if (tag === "br") return <br key={chave} />;
  const filhos = Array.from(no.childNodes).map((f, i) => paraReact(f, `${chave}.${i}`));
  // tag fora da lista (img, table, font…): fica só o conteúdo
  if (!(tag in TAGS)) return <React.Fragment key={chave}>{filhos}</React.Fragment>;
  const props = { key: chave, className: TAGS[tag] || undefined, style: estiloSeguro(no) };
  if (tag === "a") {
    props.href = safeUrl(no.getAttribute("href"));
    props.target = "_blank";
    props.rel = "noopener noreferrer";
  }
  return React.createElement(tag, props, filhos.length ? filhos : undefined);
}

export default function DescricaoRica({ valor, className = "" }) {
  const texto = typeof valor === "string" ? valor : "";
  const html = pareceHtml(texto);

  const conteudo = useMemo(() => {
    if (!html || typeof DOMParser === "undefined") return null;
    try {
      const doc = new DOMParser().parseFromString(texto, "text/html");
      // editor "vazio" (<p><br></p>) não vira caixa em branco
      if (!doc.body.textContent.trim()) return [];
      return Array.from(doc.body.childNodes).map((n, i) => paraReact(n, String(i)));
    } catch {
      return null;
    }
  }, [texto, html]);

  if (!texto.trim() || conteudo?.length === 0) return null;

  // Texto puro (ou HTML que não deu para ler): React escapa; pre-wrap mantém as quebras
  if (!html || !conteudo) {
    return (
      <div className={`whitespace-pre-wrap break-words ${className}`}>
        {html ? texto.replace(/<[^>]*>/g, " ") : texto}
      </div>
    );
  }
  return <div className={`break-words ${className}`}>{conteudo}</div>;
}
