import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveStorageUrl } from "@/api/sigoClient";
import { ehBase44, ehImagem, ehPdf, extensaoDoArquivo } from "@/lib/anexo-ref";
import { ATRIBUTO_JANELA_FLUTUANTE } from "@/components/ui/janela-flutuante";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Download,
  Loader2,
  FileWarning,
  GripHorizontal,
} from "lucide-react";

/**
 * Visualizador de anexos em JANELA FLUTUANTE: não bloqueia a tela, arrasta
 * pelo título, redimensiona pelo canto e pode ser destacada numa janela
 * própria do navegador (para levar a outro monitor). Mesma API do antigo
 * diálogo: <AnexoViewer anexo open onOpenChange />.
 *
 * Esc fecha a janela. Se houver Sheet/Dialog Radix aberto por baixo, o Esc
 * também chega nele e ele fecha junto (a janela fecha primeiro; ver o efeito
 * do Esc abaixo).
 */

const CHAVE_GEOMETRIA = "sigo_anexo_janela";
const MIN_W = 360;
const MIN_H = 260;
const MARGEM = 8;

const combina = (media) => typeof window !== "undefined" && !!window.matchMedia?.(media).matches;
/** Celular: a janela abre maximizada (arrastar/redimensionar não compensa). */
const telaPequena = () => combina("(max-width: 640px), (max-height: 480px)");
/** Chrome Android/WebView não renderiza PDF em iframe: oferece abrir em outra aba. */
const pdfSemIframe = () => combina("(max-width: 640px), (pointer: coarse)");

function geometriaInicial() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const padrao = {
    w: Math.min(820, vw - 2 * MARGEM),
    h: Math.min(640, vh - 2 * MARGEM),
  };
  padrao.x = Math.max(MARGEM, Math.round((vw - padrao.w) / 2));
  padrao.y = Math.max(MARGEM, Math.round((vh - padrao.h) / 2));
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_GEOMETRIA) || "null");
    if (salvo && salvo.w && salvo.h) return limitar(salvo);
  } catch {
    /* sem storage: usa o padrão */
  }
  return padrao;
}

/** Mantém a janela dentro da tela (a barra de título sempre alcançável). */
function limitar(g) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(g.w, MIN_W), vw - 2 * MARGEM);
  const h = Math.min(Math.max(g.h, MIN_H), vh - 2 * MARGEM);
  return {
    w,
    h,
    x: Math.min(Math.max(g.x, MARGEM), vw - w - MARGEM),
    y: Math.min(Math.max(g.y, MARGEM), vh - h - MARGEM),
  };
}

function Botao({ titulo, onClick, children, disabled }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Mensagem centralizada no lugar da prévia (erro, formato sem prévia...). */
function Aviso({ titulo, children, acoes }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <FileWarning className="w-10 h-10 text-amber-500" />
      <p className="font-medium text-slate-700">{titulo}</p>
      {children && <p className="text-sm text-slate-500 max-w-sm">{children}</p>}
      {acoes && <div className="mt-1 flex flex-wrap justify-center gap-2">{acoes}</div>}
    </div>
  );
}

function BotaoAcao({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export default function AnexoViewer({ anexo, open, onOpenChange }) {
  const [geo, setGeo] = useState(null);
  const [maximizada, setMaximizada] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotacao, setRotacao] = useState(0);
  const [fileUrl, setFileUrl] = useState("");
  // carregando | ok | base44 | sem_arquivo (não está no Storage) | falha_exibir (imagem não carregou)
  const [estado, setEstado] = useState("carregando");
  // estado (não só ref): ao soltar, o overlay anti-iframe precisa sair da tela
  const [arrastando, setArrastando] = useState(false);
  const arrasto = useRef(null);
  const raiz = useRef(null);
  const areaImagem = useRef(null);
  // tamanho real da imagem: o zoom parte do tamanho "ajustado à janela"
  const [natural, setNatural] = useState(null);

  // Referência guardada no banco: "bucket/path" (assinamos na hora), URL
  // assinada antiga do nosso Storage (re-assinamos) ou URL externa (legado).
  const rawRef = anexo?.url || anexo?.file_url || anexo?.arquivo_url || "";
  const fileName = anexo?.nome || anexo?.name || anexo?.arquivo_nome || "arquivo";
  const fileType = anexo?.tipo || anexo?.type || "";

  useEffect(() => {
    if (!open) return;
    setGeo((g) => g || geometriaInicial());
    if (telaPequena()) setMaximizada(true);
  }, [open]);

  useEffect(() => {
    let vivo = true;
    setZoom(1);
    setRotacao(0);
    setNatural(null);
    setFileUrl("");
    if (!open || !rawRef) {
      setEstado(rawRef ? "carregando" : "sem_arquivo");
      return undefined;
    }
    // Base44: a plataforma antiga apagou os arquivos — nem tenta abrir
    if (ehBase44(rawRef)) {
      setEstado("base44");
      return undefined;
    }
    setEstado("carregando");
    resolveStorageUrl(rawRef).then((u) => {
      if (!vivo) return;
      setFileUrl(u || "");
      setEstado(u ? "ok" : "sem_arquivo");
    });
    return () => {
      vivo = false;
    };
  }, [open, rawRef]);

  // Esc fecha. Captura na window = roda antes do Esc do Radix (captura no
  // document). A marca no evento faz o Sheet/Dialog de baixo ignorar esse Esc
  // (ui/janela-flutuante.js) — fecha só a janela, sem perder o formulário.
  useEffect(() => {
    if (!open) return undefined;
    const aoTeclar = (e) => {
      if (e.key !== "Escape" || e.isComposing) return;
      // marca o evento: um onEscapeKeyDown do Radix pode checar isto e não fechar a gaveta
      e.fechouJanelaFlutuante = true;
      onOpenChange?.(false);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [open, onOpenChange]);

  // Aberta por cima de um Sheet/Dialog modal, o react-remove-scroll (listener
  // no document) cancelaria a roda do mouse e o arrasto por toque aqui dentro:
  // a imagem ampliada não rolaria. Parar a propagação na janela resolve.
  const temJanela = !!geo;
  useEffect(() => {
    const el = raiz.current;
    if (!open || !temJanela || !el) return undefined;
    const parar = (e) => e.stopPropagation();
    el.addEventListener("wheel", parar, { passive: true });
    el.addEventListener("touchmove", parar, { passive: true });
    return () => {
      el.removeEventListener("wheel", parar);
      el.removeEventListener("touchmove", parar);
    };
  }, [open, temJanela]);

  // Zoom: largura = tamanho ajustado à área × zoom (não o tamanho natural,
  // que numa foto de celular é 4–7× maior). Centralizar com margin:auto (e não
  // flex center) deixa o topo/esquerda ampliados alcançáveis pela rolagem.
  const estiloImagem = () => {
    const area = areaImagem.current;
    if (zoom === 1 || !natural || !area) return { maxWidth: "100%", maxHeight: "100%" };
    const livreW = Math.max(1, area.clientWidth - 24); // p-3 dos dois lados
    const livreH = Math.max(1, area.clientHeight - 24);
    const ajuste = Math.min(1, livreW / natural.w, livreH / natural.h);
    return { width: Math.round(natural.w * ajuste * zoom), maxWidth: "none", maxHeight: "none" };
  };

  // mantém dentro da tela se o navegador for redimensionado
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setGeo((g) => (g ? limitar(g) : g));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const salvarGeometria = useCallback((g) => {
    try {
      localStorage.setItem(CHAVE_GEOMETRIA, JSON.stringify(g));
    } catch {
      /* ok */
    }
  }, []);

  // arrastar (pela barra de título) e redimensionar (pelo canto)
  const iniciar = (modo) => (e) => {
    if (maximizada || e.button !== 0) return;
    if (modo === "mover" && e.target.closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { modo, x0: e.clientX, y0: e.clientY, g0: geo };
    setArrastando(true);
  };
  const mover = (e) => {
    const a = arrasto.current;
    if (!a) return;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    setGeo(
      limitar(
        a.modo === "mover"
          ? { ...a.g0, x: a.g0.x + dx, y: a.g0.y + dy }
          : { ...a.g0, w: a.g0.w + dx, h: a.g0.h + dy }
      )
    );
  };
  const soltar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    setArrastando(false);
    setGeo((g) => {
      if (g) salvarGeometria(g);
      return g;
    });
  };

  const destacar = () => {
    if (!fileUrl) return;
    const w = Math.round(window.screen.availWidth * 0.6);
    const h = Math.round(window.screen.availHeight * 0.8);
    const jan = window.open(fileUrl, "sigo_anexo", `popup=yes,width=${w},height=${h}`);
    if (jan) {
      jan.opener = null;
      onOpenChange?.(false);
    } else {
      window.open(fileUrl, "_blank", "noopener");
    }
  };

  const baixar = () => {
    if (!fileUrl) return;
    // URL assinada do Storage aceita &download= para forçar o download
    const url = /[?&]token=/.test(fileUrl)
      ? `${fileUrl}&download=${encodeURIComponent(fileName)}`
      : fileUrl;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    a.target = "_blank";
    a.click();
  };

  // celular: o PDF abre no visualizador do próprio aparelho, em outra aba
  const abrirEmOutraAba = () => {
    if (fileUrl) window.open(fileUrl, "_blank", "noopener");
  };

  if (!open || !anexo || !geo) return null;

  // tipo pela extensão da ref ("bucket/caminho.ext") ou, se ela não tiver, do nome
  const refTipo = extensaoDoArquivo(rawRef) ? rawRef : fileName;
  const isPDF = ehPdf(refTipo, fileType);
  const isImage = ehImagem(refTipo, fileType); // HEIC não: o navegador não exibe
  const extensao = extensaoDoArquivo(refTipo);
  const botaoBaixar = (
    <BotaoAcao onClick={baixar}>
      <Download className="w-4 h-4" /> Baixar arquivo
    </BotaoAcao>
  );

  const estilo = maximizada
    ? {
        left: MARGEM,
        top: MARGEM,
        width: window.innerWidth - 2 * MARGEM,
        height: window.innerHeight - 2 * MARGEM,
      }
    : { left: geo.x, top: geo.y, width: geo.w, height: geo.h };

  const janela = (
    <div
      {...{ [ATRIBUTO_JANELA_FLUTUANTE]: "" }}
      ref={raiz}
      role="dialog"
      aria-label={`Anexo: ${fileName}`}
      className="fixed z-[10000] flex flex-col rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden"
      style={{ ...estilo, pointerEvents: "auto" }}
    >
      {/* barra de título = alça de arrasto (touch-none: no toque, arrasta em vez de rolar a página) */}
      <div
        className={`flex items-center gap-1 border-b bg-slate-50 pl-3 pr-1 py-1 select-none ${
          maximizada ? "" : "cursor-move touch-none"
        }`}
        onPointerDown={iniciar("mover")}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onLostPointerCapture={soltar}
        onDoubleClick={(e) => {
          if (!e.target.closest("button")) setMaximizada((m) => !m);
        }}
      >
        <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="flex-1 truncate text-sm font-medium text-slate-800" title={fileName}>
          {fileName}
        </span>
        {isImage && estado === "ok" && (
          <>
            <Botao titulo="Diminuir" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
              <ZoomOut className="w-4 h-4" />
            </Botao>
            <span className="text-xs text-slate-500 w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Botao titulo="Aumentar" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
              <ZoomIn className="w-4 h-4" />
            </Botao>
            <Botao titulo="Girar" onClick={() => setRotacao((r) => (r + 90) % 360)}>
              <RotateCw className="w-4 h-4" />
            </Botao>
          </>
        )}
        <Botao titulo="Baixar" onClick={baixar} disabled={!fileUrl}>
          <Download className="w-4 h-4" />
        </Botao>
        <Botao
          titulo="Destacar em janela própria (arraste para outro monitor)"
          onClick={destacar}
          disabled={!fileUrl}
        >
          <ExternalLink className="w-4 h-4" />
        </Botao>
        <Botao
          titulo={maximizada ? "Restaurar" : "Maximizar"}
          onClick={() => setMaximizada((m) => !m)}
        >
          {maximizada ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Botao>
        <Botao titulo="Fechar" onClick={() => onOpenChange?.(false)}>
          <X className="w-4 h-4" />
        </Botao>
      </div>

      {/* conteúdo */}
      <div className="relative flex-1 min-h-0 bg-slate-100">
        {estado === "carregando" ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando arquivo...
          </div>
        ) : estado === "base44" ? (
          <Aviso titulo="Arquivo do sistema antigo (Base44)">
            Este arquivo foi anexado na plataforma anterior, que foi desligada, e não está mais
            disponível. Anexe-o de novo neste lançamento.
          </Aviso>
        ) : estado === "sem_arquivo" ? (
          <Aviso titulo="Arquivo não encontrado">
            O arquivo não está mais no armazenamento. Anexe-o de novo.
          </Aviso>
        ) : estado === "falha_exibir" ? (
          <Aviso titulo="Não foi possível exibir a imagem" acoes={botaoBaixar}>
            O arquivo existe, mas o navegador não conseguiu mostrá-lo (pode estar corrompido). Baixe
            para conferir.
          </Aviso>
        ) : isImage ? (
          <div ref={areaImagem} className="absolute inset-0 overflow-auto flex p-3">
            <img
              src={fileUrl}
              alt={fileName}
              draggable={false}
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              onError={() => setEstado("falha_exibir")}
              onClick={() => setZoom((z) => (z < 2 ? z + 0.5 : 1))}
              className="m-auto cursor-zoom-in select-none"
              style={{
                ...estiloImagem(),
                transform: `rotate(${rotacao}deg)`,
                transition: "transform 0.15s ease",
              }}
            />
          </div>
        ) : isPDF && pdfSemIframe() ? (
          <Aviso
            titulo="Visualização de PDF indisponível neste aparelho"
            acoes={
              <>
                <BotaoAcao onClick={abrirEmOutraAba}>
                  <ExternalLink className="w-4 h-4" /> Abrir PDF
                </BotaoAcao>
                {botaoBaixar}
              </>
            }
          >
            O navegador do celular não mostra PDF dentro da página. Abra em outra aba.
          </Aviso>
        ) : isPDF ? (
          <iframe
            src={`${fileUrl}#view=FitH`}
            className="absolute inset-0 w-full h-full border-0 bg-white"
            title={fileName}
          />
        ) : (
          <Aviso
            titulo={`Pré-visualização indisponível para este formato${
              extensao ? ` (.${extensao.toUpperCase()})` : ""
            }`}
            acoes={botaoBaixar}
          >
            Baixe o arquivo para abri-lo no seu computador ou celular.
          </Aviso>
        )}
        {/* durante arrasto, o iframe engoliria o movimento do mouse */}
        {arrastando && <div className="absolute inset-0" />}
      </div>

      {/* alça de redimensionar */}
      {!maximizada && (
        <div
          title="Redimensionar"
          className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize touch-none"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, rgb(148 163 184) 50%, rgb(148 163 184) 60%, transparent 60%, transparent 75%, rgb(148 163 184) 75%, rgb(148 163 184) 85%, transparent 85%)",
          }}
          onPointerDown={iniciar("redimensionar")}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onLostPointerCapture={soltar}
        />
      )}
    </div>
  );

  return createPortal(janela, document.body);
}
