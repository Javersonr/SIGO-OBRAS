/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AcessoFornecedor from './pages/AcessoFornecedor';
import AcessoNegado from './pages/AcessoNegado';
import AuditLogs from './pages/AuditLogs';
import CadastroFerramentas from './pages/CadastroFerramentas';
import Chat from './pages/Chat';
import ClientePortal from './pages/ClientePortal';
import Compras from './pages/Compras';
import Configuracoes from './pages/Configuracoes';
import Contabilidade from './pages/Contabilidade';
import Dashboard from './pages/Dashboard';
import DashboardInspecoes from './pages/DashboardInspecoes';
import EntrarSistema from './pages/EntrarSistema';
import EsqueciSenha from './pages/EsqueciSenha';
import Estoque from './pages/Estoque';
import Ferramental from './pages/Ferramental';
import Financeiro from './pages/Financeiro';
import FornecedorLogin from './pages/FornecedorLogin';
import HistoricoCotacoes from './pages/HistoricoCotacoes';
import HistoricoInspecoes from './pages/HistoricoInspecoes';
import HistoricoInventario from './pages/HistoricoInventario';
import InspecaoDetalhes from './pages/InspecaoDetalhes';
import InspecaoFerramenta from './pages/InspecaoFerramenta';
import Oportunidades from './pages/Oportunidades';
import PrimeiroAcesso from './pages/PrimeiroAcesso';
import Projetos from './pages/Projetos';
import RedefinirSenha from './pages/RedefinirSenha';
import Registro from './pages/Registro';
import RelatorioVencimentos from './pages/RelatorioVencimentos';
import Relatorios from './pages/Relatorios';
import SaasAdmin from './pages/SaasAdmin';
import SegurancaTrabalho from './pages/SegurancaTrabalho';
import Vencimentos from './pages/Vencimentos';
import index from './pages/index';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AcessoFornecedor": AcessoFornecedor,
    "AcessoNegado": AcessoNegado,
    "AuditLogs": AuditLogs,
    "CadastroFerramentas": CadastroFerramentas,
    "Chat": Chat,
    "ClientePortal": ClientePortal,
    "Compras": Compras,
    "Configuracoes": Configuracoes,
    "Contabilidade": Contabilidade,
    "Dashboard": Dashboard,
    "DashboardInspecoes": DashboardInspecoes,
    "EntrarSistema": EntrarSistema,
    "EsqueciSenha": EsqueciSenha,
    "Estoque": Estoque,
    "Ferramental": Ferramental,
    "Financeiro": Financeiro,
    "FornecedorLogin": FornecedorLogin,
    "HistoricoCotacoes": HistoricoCotacoes,
    "HistoricoInspecoes": HistoricoInspecoes,
    "HistoricoInventario": HistoricoInventario,
    "InspecaoDetalhes": InspecaoDetalhes,
    "InspecaoFerramenta": InspecaoFerramenta,
    "Oportunidades": Oportunidades,
    "PrimeiroAcesso": PrimeiroAcesso,
    "Projetos": Projetos,
    "RedefinirSenha": RedefinirSenha,
    "Registro": Registro,
    "RelatorioVencimentos": RelatorioVencimentos,
    "Relatorios": Relatorios,
    "SaasAdmin": SaasAdmin,
    "SegurancaTrabalho": SegurancaTrabalho,
    "Vencimentos": Vencimentos,
    "index": index,
}

export const pagesConfig = {
    mainPage: "EntrarSistema",
    Pages: PAGES,
    Layout: __Layout,
};