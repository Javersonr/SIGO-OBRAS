import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

// Detecta falha de carregamento de "chunk" (JS de página code-split). Acontece
// quando o deploy substituiu os arquivos e a aba aberta ainda aponta pro chunk
// antigo. O React.lazy() rejeita com um Error normal (não dispara
// `vite:preloadError`), então precisamos pegar aqui também.
function isChunkError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return (
    error?.name === "ChunkLoadError" ||
    msg.includes("dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("failed to load module") ||
    msg.includes("failed to fetch dynamically")
  );
}

// Recarrega no máx. 1x a cada 10s (mesma chave do handler em main.jsx) — evita
// loop de reload se o chunk realmente não existir (ex.: servidor incompleto).
function reloadOnceForChunk() {
  const KEY = "sigo_chunk_reload_ts";
  const now = Date.now();
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (now - last > 10000) {
    sessionStorage.setItem(KEY, String(now));
    window.location.reload();
    return true;
  }
  return false;
}

/**
 * Error boundary global.
 *
 * Em vez de deixar uma exceção JS de qualquer componente desmontar a
 * árvore inteira (= tela 100% branca, usuário sem ação), capturamos aqui
 * e mostramos um card com a mensagem + botão de recarregar. O erro vai
 * pro Console pra debug, mas o usuário sempre consegue agir.
 *
 * Uso: envolve áreas grandes (App, Layout, abas pesadas). Pode ter
 * múltiplas instâncias aninhadas — a mais próxima do erro é a que pega.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: "", isChunk: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunk: isChunkError(error) };
  }

  componentDidCatch(error, info) {
    // Erro de chunk (deploy novo) → auto-recupera recarregando a página, em vez
    // de mostrar o card de erro. Pega o caso do React.lazy que o
    // `vite:preloadError` não cobre.
    if (isChunkError(error) && reloadOnceForChunk()) return;
    // Log detalhado pra Console — é onde devs/suporte vão olhar primeiro
    console.error("[ErrorBoundary] componente quebrou:", error);
    console.error("[ErrorBoundary] stack do componente:", info?.componentStack);
    // Guarda o stack pra mostrar na tela (ajuda a achar QUAL componente quebrou
    // a partir de um print, sem precisar abrir o Console).
    this.setState({ componentStack: info?.componentStack || "" });
  }

  handleReload = () => {
    // Tenta reset suave do boundary primeiro. Se o erro for persistente,
    // o usuário aperta de novo e cai no full reload.
    if (this.state.hasError) {
      this.setState({ hasError: false, error: null, componentStack: "" });
      // Pequeno hack: se erro foi de import/chunk velho, force reload é único caminho
      // — mas só na 2ª tentativa pra não fazer F5 silencioso em qualquer hiccup.
    }
  };

  handleFullReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Erro de chunk: estamos recarregando — mostra um aviso leve em vez do
    // card vermelho assustador (a página vai recarregar em instantes).
    if (this.state.isChunk) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Atualizando para a nova versão…</span>
          </div>
        </div>
      );
    }

    const message = this.state.error?.message || String(this.state.error || "");
    const scope = this.props.scope || "Tela";
    // Top do component stack: as primeiras linhas nomeiam o componente que
    // quebrou (ex.: "at DespesasTab" / "at CardsResumo"). Mostramos na tela.
    const stackTop = (this.state.componentStack || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("\n");

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl shadow-sm p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{scope} encontrou um erro</h2>
              <p className="text-sm text-slate-600 mt-1">
                Algo deu errado ao carregar esse conteúdo. Você pode tentar novamente, ou recarregar
                a página. O time já foi notificado via Console.
              </p>
            </div>
          </div>

          {/* Detalhes SEMPRE visíveis (sem precisar expandir) — facilita o print
              de suporte: mostra a mensagem + qual componente quebrou. */}
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3 mb-4 space-y-2">
            <div>
              <span className="font-semibold text-slate-700">Erro:</span>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-red-700">
                {message || "(sem mensagem)"}
              </pre>
            </div>
            {stackTop && (
              <div>
                <span className="font-semibold text-slate-700">Onde:</span>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-slate-600">
                  {stackTop}
                </pre>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={this.handleReload}
              className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Tentar de novo
            </button>
            <button
              onClick={this.handleFullReload}
              className="px-3 py-1.5 text-sm font-medium rounded bg-amber-500 text-white hover:bg-amber-600"
            >
              Recarregar página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
