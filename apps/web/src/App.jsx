import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import EntrarSistema from "./pages/EntrarSistema";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

// Fallback exibido enquanto o chunk da rota é baixado (split por React.lazy)
const RouteSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// Toda a autenticação acontece dentro do Layout (sessionStorage custom_auth).
// Esse wrapper só fornece o shell de rotas + React Query.
const AuthenticatedApp = () => (
  <Suspense fallback={<RouteSpinner />}>
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        }
      />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <Router>
      <Routes>
        {/* Rotas públicas (FORA de AuthenticatedApp) */}
        <Route path="/EntrarSistema" element={<EntrarSistema />} />

        {/* Rotas autenticadas */}
        <Route
          path="/*"
          element={
            <QueryClientProvider client={queryClientInstance}>
              <NavigationTracker />
              <AuthenticatedApp />
              <Toaster />
            </QueryClientProvider>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
