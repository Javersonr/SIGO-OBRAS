import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";
import "@/index.css";
import ErrorBoundary from "@/components/ErrorBoundary";

// ---------------------------------------------------------------------------
// Auto-recuperação de "tela branca" pós-deploy.
//
// Quando publicamos uma versão nova, o deploy (lftp --delete) remove os chunks
// JS antigos do servidor. Se o navegador ainda estiver com o index.html velho
// em cache, ou com uma aba aberta da versão anterior, um import() de chunk vai
// falhar com 404 — e o resultado é tela branca, sem ação pro usuário.
//
// O Vite dispara o evento `vite:preloadError` exatamente nesse caso. Em vez de
// deixar a tela branca, recarregamos a página UMA vez para puxar o index.html
// novo (que aponta pros chunks atuais). O guard de tempo em sessionStorage
// evita loop de reload caso o erro persista por outro motivo.
// ---------------------------------------------------------------------------
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "sigo_chunk_reload_ts";
  const now = Date.now();
  const last = Number(sessionStorage.getItem(KEY) || 0);
  // Só recarrega se não recarregou nos últimos 10s (anti-loop).
  if (now - last > 10000) {
    sessionStorage.setItem(KEY, String(now));
    event.preventDefault?.();
    window.location.reload();
  }
});

// ErrorBoundary no topo de TUDO: se o Layout/auth/Router quebrar no render,
// o usuário vê um card com "Recarregar página" em vez de tela 100% branca.
// (Há também boundaries por página dentro do App, pra isolar telas pesadas.)
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary scope="Aplicativo">
    <App />
  </ErrorBoundary>
);
