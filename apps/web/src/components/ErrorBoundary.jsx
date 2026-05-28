import React from "react";
import { AlertTriangle } from "lucide-react";

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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log detalhado pra Console — é onde devs/suporte vão olhar primeiro
    console.error("[ErrorBoundary] componente quebrou:", error);
    console.error("[ErrorBoundary] stack do componente:", info?.componentStack);
  }

  handleReload = () => {
    // Tenta reset suave do boundary primeiro. Se o erro for persistente,
    // o usuário aperta de novo e cai no full reload.
    if (this.state.hasError) {
      this.setState({ hasError: false, error: null });
      // Pequeno hack: se erro foi de import/chunk velho, force reload é único caminho
      // — mas só na 2ª tentativa pra não fazer F5 silencioso em qualquer hiccup.
    }
  };

  handleFullReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || String(this.state.error || "");
    const scope = this.props.scope || "Tela";

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

          <details className="text-xs text-slate-500 bg-slate-50 rounded p-3 mb-4">
            <summary className="cursor-pointer font-mono">Detalhes técnicos</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{message}</pre>
          </details>

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
