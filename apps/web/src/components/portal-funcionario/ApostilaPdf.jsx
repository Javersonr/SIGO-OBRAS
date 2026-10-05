import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { carregarPdfjs } from "@/lib/pdfjs";
import {
  MEDIA_APOSTILA_NA_PAGINA,
  apostilaNaPagina,
  medidasDaPagina,
  mensagemFalhaPdf,
  urlApostilaValida,
} from "@/lib/apostila-pdf";

/**
 * Apostila em PDF do curso (a 1ª aula, que libera as demais).
 *
 * - Computador: <iframe> do próprio navegador.
 * - Celular, tablet ou janela estreita (`MEDIA_APOSTILA_NA_PAGINA`): o navegador costuma não
 *   mostrar PDF em iframe, então as páginas são desenhadas aqui com o pdf.js, uma a uma, numa
 *   área com rolagem. O PDF é baixado uma vez só, direto pelo pdf.js (sem passar por blob).
 * - Nos dois casos há "Abrir em outra aba" (o tempo de leitura fica parado enquanto o aluno
 *   estiver fora do portal).
 * - Sem URL válida: "Apostila indisponível — avise o RH".
 *
 * `onEstado("carregando" | "pronto" | "erro")` diz ao CursoPortal quando a apostila está de fato
 * na tela; só então o contador de leitura corre (regra em lib/apostila-pdf.js).
 * `obterUrlNova()` devolve uma URL assinada nova (a de 3 h pode vencer) para "Tentar de novo".
 */
export default function ApostilaPdf({ url, titulo, onEstado, obterUrlNova }) {
  const naPagina = useApostilaNaPagina();
  const [total, setTotal] = useState(null);

  // os callbacks do pai mudam a cada render (o contador de leitura re-renderiza a cada segundo):
  // guardados em ref para o leitor não recarregar nem re-renderizar por causa deles
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;
  const obterUrlNovaRef = useRef(obterUrlNova);
  obterUrlNovaRef.current = obterUrlNova;
  const avisar = useCallback((estado) => onEstadoRef.current?.(estado), []);
  const pedirUrlNova = useCallback(() => obterUrlNovaRef.current?.(), []);

  // A URL assinada muda a cada recarga dos dados do portal (concluir aula, dúvida...). A que
  // abriu a apostila fica travada: trocar o src do iframe ou recarregar o PDF no meio da
  // leitura baixaria o arquivo de novo e voltaria a rolagem ao topo.
  const atual = urlApostilaValida(url) ? url.trim() : null;
  const travadaRef = useRef(null);
  if (atual && !travadaRef.current) travadaRef.current = atual;
  const urlLeitura = travadaRef.current;

  useEffect(() => {
    if (!urlLeitura) avisar("erro");
  }, [urlLeitura, avisar]);

  if (!urlLeitura) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1"
      >
        <p className="font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Apostila indisponível — avise o RH
        </p>
        <p>O tempo de leitura não está sendo contado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {naPagina && total
            ? `Apostila em PDF · ${total} ${total === 1 ? "página" : "páginas"}`
            : "Apostila em PDF"}
        </span>
        <Button asChild variant="outline" size="sm">
          <a href={atual || urlLeitura} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Abrir em outra aba
          </a>
        </Button>
      </div>
      {naPagina ? (
        <PdfNaPagina
          url={urlLeitura}
          titulo={titulo}
          avisar={avisar}
          pedirUrlNova={pedirUrlNova}
          aoSaberTotal={setTotal}
        />
      ) : (
        <PdfIframe url={urlLeitura} titulo={titulo} avisar={avisar} />
      )}
      <p className="text-[11px] text-slate-500">Em outra aba, o tempo de leitura fica parado.</p>
    </div>
  );
}

const perguntarMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? (consulta) => window.matchMedia(consulta)
    : undefined;

/** true = celular/toque/janela estreita; acompanha girar a tela e redimensionar a janela. */
function useApostilaNaPagina() {
  const [naPagina, setNaPagina] = useState(() => apostilaNaPagina(perguntarMedia()));
  useEffect(() => {
    const mq = perguntarMedia()?.(MEDIA_APOSTILA_NA_PAGINA);
    if (!mq) return undefined;
    const aoMudar = () => setNaPagina(!!mq.matches);
    aoMudar();
    if (mq.addEventListener) mq.addEventListener("change", aoMudar);
    else mq.addListener?.(aoMudar); // Safari antigo
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", aoMudar);
      else mq.removeListener?.(aoMudar);
    };
  }, []);
  return naPagina;
}

function PdfIframe({ url, titulo, avisar }) {
  // o navegador não avisa se o PDF abriu: vale como aberto desde que a URL é válida
  useEffect(() => {
    avisar("pronto");
  }, [avisar]);
  return <iframe title={titulo} src={url} className="w-full h-[70vh] rounded-lg border bg-white" />;
}

const PdfNaPagina = memo(function PdfNaPagina({ url, titulo, avisar, pedirUrlNova, aoSaberTotal }) {
  const rolagemRef = useRef(null);
  const urlDaTentativaRef = useRef(url);
  const prontoRef = useRef(false);
  const [largura, setLargura] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const [renovando, setRenovando] = useState(false);
  const [doc, setDoc] = useState(null); // { pdf, total, base: { w, h } }
  const [falha, setFalha] = useState("");

  // largura da área de leitura: a página é desenhada nela (gira a tela = redesenha)
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return undefined;
    const medir = () => setLargura(Math.floor(el.clientWidth));
    medir();
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // abre o documento (o pdf.js baixa o arquivo; as páginas são desenhadas só quando aparecem)
  useEffect(() => {
    let vivo = true;
    let tarefa = null;
    prontoRef.current = false;
    setDoc(null);
    setFalha("");
    avisar("carregando");
    (async () => {
      try {
        const pdfjs = await carregarPdfjs();
        if (!vivo) return;
        tarefa = pdfjs.getDocument({ url: urlDaTentativaRef.current, isEvalSupported: false });
        const pdf = await tarefa.promise;
        const primeira = await pdf.getPage(1);
        const medida = primeira.getViewport({ scale: 1 });
        primeira.cleanup();
        if (!vivo) return;
        aoSaberTotal(pdf.numPages);
        setDoc({ pdf, total: pdf.numPages, base: { w: medida.width, h: medida.height } });
      } catch (e) {
        if (!vivo) return;
        setFalha(mensagemFalhaPdf(e));
        avisar("erro");
      }
    })();
    return () => {
      vivo = false;
      tarefa?.destroy?.(); // libera o documento e o que o worker guardou dele
    };
  }, [tentativa, avisar, aoSaberTotal]);

  // a apostila só vale como lida com a 1ª página na tela
  const aoDesenharPagina = useCallback(() => {
    if (prontoRef.current) return;
    prontoRef.current = true;
    avisar("pronto");
  }, [avisar]);

  const aoFalharPagina = useCallback(
    (n, erro) => {
      // falha numa página do meio não derruba a leitura (a página mostra "tentar de novo")
      if (n !== 1 || prontoRef.current) return;
      setFalha(mensagemFalhaPdf(erro));
      avisar("erro");
    },
    [avisar]
  );

  const tentarDeNovo = async () => {
    setRenovando(true);
    try {
      const nova = await pedirUrlNova?.();
      if (urlApostilaValida(nova)) urlDaTentativaRef.current = nova.trim();
    } catch {
      /* sem URL nova: tenta com a que já tinha */
    } finally {
      setRenovando(false);
    }
    setTentativa((t) => t + 1);
  };

  const paginas = doc ? Array.from({ length: doc.total }, (_, i) => i + 1) : [];
  return (
    <div className="relative">
      <div
        ref={rolagemRef}
        role="region"
        aria-label={titulo}
        tabIndex={0}
        className="h-[70vh] overflow-y-auto rounded-lg border bg-slate-200 py-2 space-y-2"
      >
        {paginas.map((n) => (
          <PaginaPdf
            key={n}
            pdf={doc.pdf}
            n={n}
            total={doc.total}
            base={doc.base}
            largura={largura}
            rolagemRef={rolagemRef}
            aoDesenhar={aoDesenharPagina}
            aoFalhar={aoFalharPagina}
          />
        ))}
      </div>
      {!doc && !falha && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-600 pointer-events-none">
          <Loader2 className="w-4 h-4 animate-spin" /> Abrindo a apostila...
        </div>
      )}
      {falha && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/95 p-4">
          <div className="max-w-xs text-center space-y-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
            <p role="alert" className="text-sm text-slate-700">
              {falha}
            </p>
            <Button className="w-full" onClick={tentarDeNovo} disabled={renovando}>
              {renovando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Tentar de novo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Uma página do PDF. Só fica desenhada perto da área visível (uma tela para cima e para baixo):
 * 100 páginas desenhadas ao mesmo tempo derrubariam a aba do iPhone por falta de memória.
 * Fora disso o canvas é zerado e a caixa mantém a altura, para a rolagem não pular.
 */
const PaginaPdf = memo(function PaginaPdf({
  pdf,
  n,
  total,
  base,
  largura,
  rolagemRef,
  aoDesenhar,
  aoFalhar,
}) {
  const caixaRef = useRef(null);
  const canvasRef = useRef(null);
  const [visivel, setVisivel] = useState(n === 1);
  const [tamanho, setTamanho] = useState(base);
  const [desenhada, setDesenhada] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || typeof IntersectionObserver !== "function") {
      setVisivel(true);
      return undefined;
    }
    const observador = new IntersectionObserver(
      (entradas) => setVisivel(entradas[entradas.length - 1].isIntersecting),
      { root: rolagemRef.current, rootMargin: "100% 0px" }
    );
    observador.observe(caixa);
    return () => observador.disconnect();
  }, [rolagemRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const liberar = () => {
      canvas.width = 0; // devolve a memória do canvas (Safari só solta assim)
      canvas.height = 0;
    };
    if (!visivel || !largura) {
      liberar();
      setDesenhada(false);
      return undefined;
    }
    let vivo = true;
    let tarefa = null;
    let pagina = null;
    setFalhou(false);
    (async () => {
      try {
        pagina = await pdf.getPage(n);
        if (!vivo) return;
        const real = pagina.getViewport({ scale: 1 });
        setTamanho((t) =>
          t.w === real.width && t.h === real.height ? t : { w: real.width, h: real.height }
        );
        const m = medidasDaPagina({
          paginaLargura: real.width,
          paginaAltura: real.height,
          larguraDisponivel: largura,
          dpr: window.devicePixelRatio,
        });
        const viewport = pagina.getViewport({ scale: m.escala });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        tarefa = pagina.render({ canvasContext: ctx, viewport });
        await tarefa.promise;
        if (!vivo) return;
        setDesenhada(true);
        aoDesenhar();
      } catch (e) {
        if (!vivo || e?.name === "RenderingCancelledException") return;
        setFalhou(true);
        aoFalhar(n, e);
      }
    })();
    return () => {
      vivo = false;
      tarefa?.cancel();
      pagina?.cleanup?.();
    };
  }, [visivel, largura, pdf, n, tentativa, aoDesenhar, aoFalhar]);

  // ao sair da tela (troca de aula, voltar), zera o canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  const m = medidasDaPagina({
    paginaLargura: tamanho.w,
    paginaAltura: tamanho.h,
    larguraDisponivel: largura,
  });
  return (
    <div
      ref={caixaRef}
      className="relative mx-auto bg-white shadow-sm"
      style={{ width: m.cssLargura, height: m.cssAltura }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Página ${n} de ${total}`}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {visivel && !desenhada && !falhou && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      {falhou && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-sm text-slate-600">
          <p>Não foi possível mostrar a página {n}.</p>
          <Button size="sm" variant="outline" onClick={() => setTentativa((t) => t + 1)}>
            <RefreshCw /> Tentar de novo
          </Button>
        </div>
      )}
    </div>
  );
});
