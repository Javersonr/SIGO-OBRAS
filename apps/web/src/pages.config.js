/**
 * pages.config.js — Configuração de rotas
 *
 * Cada página é carregada de forma lazy (React.lazy) — o bundle inicial não
 * carrega o código das 33 páginas de uma vez. Cada rota baixa seu chunk só
 * quando o usuário navega pra ela.
 *
 * EntrarSistema (login) fica eager porque é a primeira tela que SEMPRE carrega.
 *
 * Para adicionar uma página nova:
 *   1. Crie `src/pages/MinhaPagina.jsx`
 *   2. Adicione `MinhaPagina: lazy(() => import("./pages/MinhaPagina"))` no PAGES
 *   3. (opcional) Se for a tela inicial, troque `mainPage` abaixo
 */

import { lazy } from "react";
import EntrarSistema from "./pages/EntrarSistema";
import __Layout from "./Layout.jsx";

// Eager (login): primeira tela do app, sem ganho em lazy
// Lazy (autenticado): cada chunk só baixa quando o usuário navega pra rota
const PAGES = {
  EntrarSistema,
  AcessoFornecedor: lazy(() => import("./pages/AcessoFornecedor")),
  AcessoNegado: lazy(() => import("./pages/AcessoNegado")),
  AuditLogs: lazy(() => import("./pages/AuditLogs")),
  CadastroFerramentas: lazy(() => import("./pages/CadastroFerramentas")),
  Chat: lazy(() => import("./pages/Chat")),
  ClientePortal: lazy(() => import("./pages/ClientePortal")),
  Compras: lazy(() => import("./pages/Compras")),
  Configuracoes: lazy(() => import("./pages/Configuracoes")),
  Contabilidade: lazy(() => import("./pages/Contabilidade")),
  Dashboard: lazy(() => import("./pages/Dashboard")),
  DashboardInspecoes: lazy(() => import("./pages/DashboardInspecoes")),
  EsqueciSenha: lazy(() => import("./pages/EsqueciSenha")),
  Estoque: lazy(() => import("./pages/Estoque")),
  Ferramental: lazy(() => import("./pages/Ferramental")),
  Financeiro: lazy(() => import("./pages/Financeiro")),
  FornecedorLogin: lazy(() => import("./pages/FornecedorLogin")),
  GrupoConsolidado: lazy(() => import("./pages/GrupoConsolidado")),
  MinhasPendencias: lazy(() => import("./pages/MinhasPendencias")),
  HistoricoCotacoes: lazy(() => import("./pages/HistoricoCotacoes")),
  HistoricoInspecoes: lazy(() => import("./pages/HistoricoInspecoes")),
  HistoricoInventario: lazy(() => import("./pages/HistoricoInventario")),
  InspecaoDetalhes: lazy(() => import("./pages/InspecaoDetalhes")),
  InspecaoFerramenta: lazy(() => import("./pages/InspecaoFerramenta")),
  Manufatura: lazy(() => import("./pages/Manufatura")),
  Oportunidades: lazy(() => import("./pages/Oportunidades")),
  PrimeiroAcesso: lazy(() => import("./pages/PrimeiroAcesso")),
  Projetos: lazy(() => import("./pages/Projetos")),
  RedefinirSenha: lazy(() => import("./pages/RedefinirSenha")),
  Registro: lazy(() => import("./pages/Registro")),
  RelatorioVencimentos: lazy(() => import("./pages/RelatorioVencimentos")),
  Relatorios: lazy(() => import("./pages/Relatorios")),
  ReservasEstoque: lazy(() => import("./pages/ReservasEstoque")),
  SaasAdmin: lazy(() => import("./pages/SaasAdmin")),
  SegurancaTrabalho: lazy(() => import("./pages/SegurancaTrabalho")),
  Vencimentos: lazy(() => import("./pages/Vencimentos")),
  index: lazy(() => import("./pages/index")),
};

export { PAGES };

export const pagesConfig = {
  mainPage: "EntrarSistema",
  Pages: PAGES,
  Layout: __Layout,
};
