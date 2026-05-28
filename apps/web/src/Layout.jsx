import React, { useState, useEffect, createContext, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sigo } from "@/api/sigoClient";
import { createPageUrl } from "./utils";
import { safeParseJSON } from "@/lib/json-utils";
import {
  Building2,
  LayoutDashboard,
  Target,
  FolderKanban,
  ShoppingCart,
  Package,
  Calculator,
  Settings,
  Menu,
  ChevronDown,
  LogOut,
  User,
  Bell,
  HardHat,
  MessageSquare,
  BarChart3,
  Wrench,
  DollarSign,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import NotificationsPanel from "./components/NotificationsPanel";
import ChatPanel from "./components/chat/ChatPanel";
import MeuPerfilSheet from "./components/MeuPerfilSheet";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Context para empresa ativa
export const EmpresaContext = createContext(null);

export const useEmpresa = () => {
  const context = useContext(EmpresaContext);
  if (!context) {
    return {
      empresaAtiva: null,
      setEmpresaAtiva: () => {},
      perfil: null,
      reloadEmpresaAtiva: () => {},
      temPermissao: () => false,
    };
  }
  return context;
};

// Função auxiliar para ajustar cor
const adjustColor = (hex, amount) => {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
};

// Função auxiliar para converter hex para rgba
const hexToRgba = (hex, alpha) => {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard, path: "Dashboard", modulo: null },
  { name: "Oportunidades", icon: Target, path: "Oportunidades", modulo: "Oportunidades" },
  { name: "Projetos", icon: FolderKanban, path: "Projetos", modulo: "Projetos" },

  { name: "Compras", icon: ShoppingCart, path: "Compras", modulo: "Compras" },
  { name: "Estoque", icon: Package, path: "Estoque", modulo: "Estoque" },
  { name: "Ferramental", icon: Wrench, path: "Ferramental", modulo: "Ferramental e EPI" },
  { name: "Segurança", icon: Shield, path: "SegurancaTrabalho", modulo: "Segurança do Trabalho" },
  { name: "Financeiro", icon: DollarSign, path: "Financeiro", modulo: "Financeiro" },
  { name: "Contabilidade", icon: Calculator, path: "Contabilidade", modulo: "Contabilidade" },
  { name: "Relatórios", icon: BarChart3, path: "Relatorios", modulo: null },
  { name: "Configurações", icon: Settings, path: "Configuracoes", adminOnly: true },
  { name: "SAAS Admin", icon: Building2, path: "SaasAdmin", superAdminOnly: true },
];

// Tempo máximo (ms) que o spinner "Carregando seus dados..." pode ficar travado
// antes de o sistema desistir e mandar o usuário pro login. Evita tela branca
// permanente se loadCustomUserData ficar pendurado por bug/timeout silencioso.
const USER_LOAD_TIMEOUT_MS = 8000;

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [empresaAtiva, setEmpresaAtiva] = useState(null);
  const [vinculo, setVinculo] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showMeuPerfil, setShowMeuPerfil] = useState(false);
  const [modulosLibertados, setModulosLiberados] = useState({});
  const [showMinhasEmpresas, setShowMinhasEmpresas] = useState(false);
  const [grupoAtivo, setGrupoAtivo] = useState(null);
  const [empresasDoGrupo, setEmpresasDoGrupo] = useState([]);

  // Páginas de fornecedor - NÃO requerem autenticação do sistema principal
  const fornecedorPages = ["FornecedorLogin", "AcessoFornecedor", "HistoricoCotacoes"];

  // Outras páginas públicas
  const publicPages = [
    "ClientePortal",
    "AcessoNegado",
    "PrimeiroAcesso",
    "EntrarSistema",
    "Registro",
    "EsqueciSenha",
    "RedefinirSenha",
    "index",
    "Index",
  ];

  const isFornecedorPage = fornecedorPages.includes(currentPageName);
  const isPublicPage = publicPages.includes(currentPageName) || isFornecedorPage;

  useEffect(() => {
    let isMounted = true;

    // Recomputamos isPublicPage/isFornecedorPage aqui dentro pra não depender
    // de referências instáveis nas deps (que causavam initAuth rodar 2x).
    const _isFornecedor = fornecedorPages.includes(currentPageName);
    const _isPublic = publicPages.includes(currentPageName) || _isFornecedor;

    const initAuth = async () => {
      try {
        if (_isPublic) {
          setLoading(false);
          return;
        }
        setLoading(true);

        // APENAS autenticação customizada - usar sessionStorage (limpa ao fechar navegador)
        const customAuth = sessionStorage.getItem("custom_auth");

        // Se não está autenticado e não é página pública, redireciona para login
        if (!customAuth) {
          if (isMounted) {
            sessionStorage.clear();
            setLoading(false);
            navigate(createPageUrl("EntrarSistema"), { replace: true });
          }
          return;
        }

        // Validar dados de autenticação
        try {
          const userData = JSON.parse(customAuth);
          if (!userData.id || !userData.empresa_id || !userData.email) {
            throw new Error("Dados de autenticação inválidos");
          }

          // Se tem grupo_id, carregar empresas do grupo
          if (userData.grupo_id) {
            setGrupoAtivo(userData.grupo_id);
            try {
              const empresasGrupo = await sigo.asServiceRole.entities.Empresa.filter({
                grupo_id: userData.grupo_id,
                ativo: true,
              });
              setEmpresasDoGrupo(empresasGrupo);
            } catch (grupoErr) {
              // Qualquer erro carregando empresas do grupo: limpa array pra
              // não deixar grupoAtivo setado com lista vazia (trava o seletor).
              console.warn("[Layout] Erro carregando empresas do grupo:", grupoErr);
              setEmpresasDoGrupo([]);
            }
          }

          if (isMounted) {
            await loadCustomUserData(userData);
          }
        } catch (e) {
          // Erros NÃO devem deixar a página em branco. Logamos com detalhe
          // e redirecionamos pro login com sessionStorage limpo — usuário
          // sabe o que está acontecendo. Rate limit (429) também redireciona
          // porque o sistema fica inutilizável com user=null sem feedback.
          console.error("[Layout] Erro carregando dados do usuário:", e);
          sessionStorage.clear();
          if (isMounted) {
            setLoading(false);
            navigate(createPageUrl("EntrarSistema"), { replace: true });
          }
        }
      } catch (error) {
        console.error("Erro na autenticação:", error);
        if (isMounted) {
          sessionStorage.clear();
          setLoading(false);
          navigate(createPageUrl("EntrarSistema"), { replace: true });
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
    // Deps mínimas e estáveis. fornecedorPages/publicPages são constantes
    // declaradas no escopo do componente (não-reativas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageName, navigate]);

  // Safety net: se loading=false mas user=null (loadCustomUserData engasgou),
  // espera USER_LOAD_TIMEOUT_MS e força redirect pro login em vez de deixar
  // o usuário olhando spinner pra sempre.
  useEffect(() => {
    if (loading || user) return;
    if (publicPages.includes(currentPageName)) return;
    const timer = setTimeout(() => {
      console.warn("[Layout] user=null após timeout, redirecionando pro login");
      sessionStorage.clear();
      navigate(createPageUrl("EntrarSistema"), { replace: true });
    }, USER_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, currentPageName, navigate]);

  // Polling para notificações não lidas - apenas quando painel está aberto
  useEffect(() => {
    if (!empresaAtiva || !user || !showNotifications) {
      setNotificacoesNaoLidas(0);
      return;
    }

    const loadNotificacoesNaoLidas = async () => {
      try {
        const notifs = await sigo.entities.Notificacao.filter({
          empresa_id: empresaAtiva.id,
          usuario_email: user.email,
          lida: false,
        });
        setNotificacoesNaoLidas(notifs.length);
      } catch (error) {
        console.error("Erro ao carregar notificações:", error);
      }
    };

    loadNotificacoesNaoLidas();
    const interval = setInterval(loadNotificacoesNaoLidas, 30000);

    return () => clearInterval(interval);
  }, [empresaAtiva?.id, user?.email, showNotifications]);

  const handleSelectEmpresa = async (empresa, redirectUrl = null) => {
    try {
      // CRÍTICO: Buscar vínculo ANTES de mudar a empresa ativa
      const vinculos = await sigo.entities.UsuarioEmpresa.filter({
        empresa_id: empresa.id,
        usuario_email: user?.email,
        ativo: true,
      });

      if (vinculos.length === 0) {
        console.error("[Layout] Usuário não tem vínculo ativo com esta empresa");
        alert("Você não tem acesso a esta empresa");
        return;
      }

      const vinculoEmpresa = vinculos[0];

      // Atualizar sessionStorage com empresa e vínculo
      const authData = JSON.parse(sessionStorage.getItem("custom_auth") || "{}");
      authData.empresa_id = empresa.id;
      authData.perfil = vinculoEmpresa.perfil;
      sessionStorage.setItem("custom_auth", JSON.stringify(authData));
      sessionStorage.setItem("empresa_ativa", empresa.id);

      // Atualizar estado
      setEmpresaAtiva(empresa);
      setVinculo(vinculoEmpresa);

      // Carregar módulos liberados da nova empresa
      try {
        const todasAssinaturas = await sigo.entities.Assinatura.filter({
          empresa_id: empresa.id,
        });
        const assinaturas = todasAssinaturas.filter(
          (a) => a.status === "Ativa" || a.status === "Trial"
        );

        if (assinaturas.length > 0) {
          const assinatura = assinaturas[0];
          const planos = await sigo.entities.Plano.filter({ id: assinatura.plano_id });

          if (planos.length > 0) {
            // modulos_liberados é JSONB no Supabase → vem como objeto, não string.
            // safeParseJSON aceita ambos sem lançar.
            const modulos = safeParseJSON(planos[0].modulos_liberados, {});
            setModulosLiberados(modulos);
          }
        } else {
          setModulosLiberados({});
        }
      } catch (error) {
        console.error("Erro ao buscar assinatura/plano da nova empresa:", error);
        setModulosLiberados({});
      }

      navigate(redirectUrl || createPageUrl("Dashboard"));
    } catch (error) {
      console.error("[Layout] Erro ao trocar empresa:", error);
      alert("Erro ao trocar de empresa");
    }
  };

  const reloadEmpresaAtiva = async () => {
    if (!empresaAtiva?.id) return;
    try {
      const empresas = await sigo.entities.Empresa.filter({ id: empresaAtiva.id });
      if (empresas.length > 0) {
        setEmpresaAtiva(empresas[0]);
      }
    } catch (error) {
      console.error("Erro ao recarregar empresa:", error);
    }
  };

  const loadCustomUserData = async (userData) => {
    try {
      // Configurar usuário PRIMEIRO
      setUser({
        id: userData.id,
        email: userData.email,
        full_name: userData.nome_completo,
        role: userData.perfil === "Admin" ? "admin" : "user",
      });

      // Buscar TODAS as empresas do usuário (não apenas a selecionada)
      const vinculosUsuario = await sigo.entities.UsuarioEmpresa.filter({
        usuario_email: userData.email,
        ativo: true,
      });

      if (vinculosUsuario.length === 0) {
        throw new Error("Usuário não possui vínculo com nenhuma empresa ativa");
      }

      // Buscar dados de todas as empresas
      const empresaIds = vinculosUsuario.map((v) => v.empresa_id);
      const todasEmpresas = await Promise.all(
        empresaIds.map((id) => sigo.entities.Empresa.filter({ id, ativo: true }))
      );
      const empresasAtivas = todasEmpresas.flat();

      if (empresasAtivas.length === 0) {
        throw new Error("Nenhuma empresa ativa encontrada");
      }

      // Configurar empresas disponíveis
      setEmpresas(empresasAtivas);

      // Buscar empresa ESPECÍFICA do login
      const empresaLogin = empresasAtivas.find((e) => e.id === userData.empresa_id);
      if (!empresaLogin) {
        throw new Error("Empresa do login não encontrada");
      }

      setEmpresaAtiva(empresaLogin);

      // Buscar assinatura e plano da empresa para obter módulos liberados
      try {
        const todasAssinaturas = await sigo.entities.Assinatura.filter({
          empresa_id: empresaLogin.id,
        });
        const assinaturas = todasAssinaturas.filter(
          (a) => a.status === "Ativa" || a.status === "Trial"
        );

        if (assinaturas.length > 0) {
          const assinatura = assinaturas[0];
          const planos = await sigo.entities.Plano.filter({ id: assinatura.plano_id });

          if (planos.length > 0) {
            // modulos_liberados é JSONB → vem como objeto pelo supabase-js.
            const modulos = safeParseJSON(planos[0].modulos_liberados, {});
            console.log("[Layout] Módulos liberados setados:", modulos);
            setModulosLiberados(modulos);
          } else {
            console.log("[Layout] Nenhum plano encontrado");
            setModulosLiberados({});
          }
        } else {
          console.log("[Layout] Nenhuma assinatura ativa encontrada");
          setModulosLiberados({});
        }
      } catch (error) {
        console.error("Erro ao buscar assinatura/plano:", error);
        setModulosLiberados({});
      }

      // Buscar vínculo ESPECÍFICO da empresa selecionada
      const vinculoEmpresa = vinculosUsuario.find((v) => v.empresa_id === empresaLogin.id);

      if (!vinculoEmpresa) {
        throw new Error("Vínculo com empresa não encontrado");
      }

      setVinculo(vinculoEmpresa);

      // Se for cliente, redirecionar para ClientePortal
      if (vinculoEmpresa.perfil === "Cliente" && vinculoEmpresa.projeto_id) {
        setLoading(false);
        navigate(createPageUrl("ClientePortal"), { replace: true });
        return;
      }

      setLoading(false);
    } catch (error) {
      // Rate limit (429) NÃO deve redirecionar para login
      if (error?.status === 429 || error?.message?.includes("Rate limit")) {
        console.warn("[Layout] Rate limit ao carregar dados do usuário - mantendo sessão");
        setLoading(false);
        return;
      }
      console.error("Erro ao carregar dados do usuário:", error);
      sessionStorage.removeItem("custom_auth");
      sessionStorage.removeItem("empresa_ativa");
      setLoading(false);
      navigate(createPageUrl("EntrarSistema"), { replace: true });
    }
  };

  const handleLogout = () => {
    // Limpar todos os dados de autenticação
    sessionStorage.clear();

    // Forçar redirecionamento para login customizado
    navigate(createPageUrl("EntrarSistema"), { replace: true });
  };

  // TODOS OS HOOKS ANTES DE QUALQUER EARLY RETURN
  const temPermissao = React.useCallback(
    (modulo, aba = null, funcao = null) => {
      const currentPerfil = vinculo?.perfil || "Admin";

      // Admin ou Owner tem acesso total
      if (currentPerfil === "Admin" || vinculo?.is_owner === true) return true;

      // Dashboard sempre acessível
      if (modulo === "Dashboard") return true;

      // Usuário inativo não tem permissão
      if (vinculo && vinculo.ativo === false) return false;

      // permissoes é JSONB → objeto pelo supabase-js (não string)
      const currentPermissoes = safeParseJSON(vinculo?.permissoes, {});

      // Se não há permissões granulares definidas, nega acesso (o filteredMenu vai liberar por módulos contratados)
      if (
        !currentPermissoes ||
        typeof currentPermissoes !== "object" ||
        Object.keys(currentPermissoes).length === 0
      ) {
        return false;
      }

      const moduloPerm = currentPermissoes[modulo];
      if (!moduloPerm) return false;

      // Caso 1: Verificar apenas se tem acesso ao MÓDULO
      if (!aba && !funcao) {
        return Object.values(moduloPerm).some((abaPerm) => {
          if (typeof abaPerm === "object") {
            return Object.values(abaPerm).some((v) => v === true);
          }
          return false;
        });
      }

      // Caso 2: Verificar acesso a uma ABA específica
      if (aba && !funcao) {
        const abaPerm = moduloPerm[aba];
        // Se for booleano direto, retorna o valor
        if (typeof abaPerm === "boolean") return abaPerm;
        // Se for objeto com funções granulares
        if (typeof abaPerm === "object" && abaPerm !== null) {
          return Object.values(abaPerm).some((v) => v === true);
        }
        return false;
      }

      // Caso 3: Verificar acesso a uma FUNÇÃO específica
      if (aba && funcao) {
        const abaPerm = moduloPerm[aba];
        if (!abaPerm || typeof abaPerm !== "object") return false;
        return abaPerm[funcao] === true;
      }

      return false;
    },
    [vinculo]
  );

  const filteredMenu = React.useMemo(() => {
    if (!user || !empresaAtiva) return [];

    const currentPerfil = vinculo?.perfil || "Admin";
    let customAuth = {};
    try {
      customAuth = JSON.parse(sessionStorage.getItem("custom_auth") || "{}");
    } catch (e) {
      console.error("[Layout] sessionStorage.custom_auth corrompido:", e);
      customAuth = {};
    }
    const isSuperAdmin = customAuth.is_super_admin === true;

    return menuItems.filter((item) => {
      // Itens apenas para super admin
      if (item.superAdminOnly) return isSuperAdmin;

      // Admin ou Owner vê: Dashboard, Configurações, Relatórios, Contabilidade + módulos contratados
      if (currentPerfil === "Admin" || vinculo?.is_owner === true) {
        if (
          item.path === "Dashboard" ||
          item.path === "Configuracoes" ||
          item.path === "Relatorios" ||
          item.path === "Contabilidade" ||
          item.path === "Vencimentos"
        ) {
          return true;
        }
        // Módulos contratados (somente se módulo está liberado no plano)
        if (item.modulo && modulosLibertados[item.modulo]) {
          return true;
        }
        return false;
      }

      // Itens apenas para admin
      if (item.adminOnly) return false;

      // Dashboard e Vencimentos sempre visíveis
      if (item.path === "Dashboard") return true;
      if (item.path === "Vencimentos") return true;

      // Configurações: admin OU com permissão granular
      if (item.path === "Configuracoes")
        return currentPerfil === "Admin" || temPermissao("Configurações");

      // Relatórios: admin OU com permissão granular
      if (item.path === "Relatorios")
        return currentPerfil === "Admin" || temPermissao("Relatórios");

      // Para módulos: se é módulo contratado no plano, verificar permissões granulares
      if (item.modulo) {
        const moduloContratado = modulosLibertados[item.modulo];

        // Se módulo NÃO está contratado, não mostra
        if (!moduloContratado) return false;

        // Módulo está contratado: verificar se tem permissões granulares definidas
        const permissoesGranulares = safeParseJSON(vinculo?.permissoes, {});

        // Se NÃO tem permissões granulares definidas (ou objeto vazio), assume acesso total ao módulo contratado
        if (
          !permissoesGranulares ||
          typeof permissoesGranulares !== "object" ||
          Object.keys(permissoesGranulares).length === 0
        ) {
          return true;
        }

        // Se TEM permissões granulares definidas, verificar se tem acesso a este módulo específico
        return temPermissao(item.modulo);
      }

      return false;
    });
  }, [user, vinculo, temPermissao, empresaAtiva, modulosLibertados]);

  const temaCores = React.useMemo(() => {
    try {
      if (empresaAtiva?.tema_cores) {
        return JSON.parse(empresaAtiva.tema_cores);
      }
      return {};
    } catch {
      return {};
    }
  }, [empresaAtiva?.tema_cores]);

  // EARLY RETURNS APÓS TODOS OS HOOKS
  if (isPublicPage || isFornecedorPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Antes retornava null e renderizava página branca. Agora mostramos
    // uma mensagem clara + botão de voltar pro login pra usuário poder agir.
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-700 font-medium">Carregando seus dados...</p>
          <p className="text-slate-500 text-sm">
            Se ficar travado aqui, abra o DevTools (F12) → Console pra ver o erro, ou volte pro
            login.
          </p>
          <button
            onClick={() => {
              sessionStorage.clear();
              localStorage.removeItem("login_email_salvo");
              window.location.href = "/EntrarSistema";
            }}
            className="text-amber-600 hover:text-amber-700 text-sm underline"
          >
            Voltar para o login
          </button>
        </div>
      </div>
    );
  }

  const perfil = vinculo?.perfil || "Admin";

  return (
    <EmpresaContext.Provider
      value={{
        empresaAtiva,
        setEmpresaAtiva: handleSelectEmpresa,
        perfil,
        user,
        empresas,
        reloadEmpresaAtiva,
        temPermissao,
        vinculo,
      }}
    >
      <>
        <style>
          {`
            /* Ajustar modais para respeitar sidebar */
            @media (min-width: 1024px) {
              /* Modais que respeitam sidebar */
              [data-radix-dialog-content] {
                left: 256px !important;
                right: 0 !important;
                top: 64px !important;
                bottom: 0 !important;
                width: calc(100% - 256px) !important;
                height: calc(100vh - 64px) !important;
                max-width: none !important;
                max-height: none !important;
                border-radius: 0 !important;
                transform: none !important;
              }

              /* Modais fullscreen respeitam sidebar no desktop */
              [data-radix-sheet-content][data-fullscreen-modal] {
                left: 256px !important;
                top: 64px !important;
                right: 0 !important;
                bottom: 0 !important;
                width: calc(100% - 256px) !important;
                height: calc(100vh - 64px) !important;
                max-width: none !important;
                max-height: none !important;
                border-radius: 0 !important;
                transform: none !important;
              }

              /* Sheets normais respeitam sidebar */
              [data-radix-sheet-content] {
                left: 256px !important;
                right: 0 !important;
                top: 64px !important;
                bottom: 0 !important;
                width: calc(100% - 256px) !important;
                height: calc(100vh - 64px) !important;
                max-width: none !important;
                max-height: none !important;
                border-radius: 0 !important;
                transform: none !important;
              }

              /* Dropdown respeitando sidebar */
              [data-radix-dropdown-menu-content] {
                position: fixed !important;
                left: 256px !important;
                right: auto !important;
                max-width: calc(100% - 256px) !important;
              }
            }

            /* MOBILE: Sheets e Dialogs começam abaixo do header (64px) */
            @media (max-width: 1023px) {
              [data-radix-sheet-content] {
                left: 0 !important;
                right: 0 !important;
                top: 64px !important;
                bottom: 0 !important;
                width: 100vw !important;
                max-width: 100vw !important;
                height: calc(100vh - 64px) !important;
                max-height: calc(100vh - 64px) !important;
                border-radius: 0 !important;
                transform: none !important;
              }
              [data-radix-dialog-content]:not([data-fullscreen-modal]) {
                left: 0 !important;
                right: 0 !important;
                top: 64px !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: calc(100vh - 64px) !important;
                max-width: 100vw !important;
                max-height: calc(100vh - 64px) !important;
                border-radius: 0 !important;
                transform: none !important;
              }

              /* Textos maiores dentro de modais no mobile */
              [data-radix-sheet-content] p,
              [data-radix-dialog-content] p {
                font-size: 0.9rem !important;
                line-height: 1.5 !important;
              }
              [data-radix-sheet-content] label,
              [data-radix-dialog-content] label,
              [data-radix-sheet-content] [class*="text-xs"],
              [data-radix-dialog-content] [class*="text-xs"] {
                font-size: 0.8rem !important;
              }
              [data-radix-sheet-content] input,
              [data-radix-dialog-content] input,
              [data-radix-sheet-content] textarea,
              [data-radix-dialog-content] textarea,
              [data-radix-sheet-content] select,
              [data-radix-dialog-content] select {
                font-size: 1rem !important;
              }

              /* Abas (tabs) dentro de modais: scroll horizontal no mobile */
              [data-radix-sheet-content] [role="tablist"],
              [data-radix-dialog-content] [role="tablist"] {
                display: flex !important;
                flex-wrap: nowrap !important;
                overflow-x: auto !important;
                -webkit-overflow-scrolling: touch !important;
                scrollbar-width: none !important;
                height: auto !important;
                padding-bottom: 2px !important;
              }
              [data-radix-sheet-content] [role="tablist"]::-webkit-scrollbar,
              [data-radix-dialog-content] [role="tablist"]::-webkit-scrollbar {
                display: none !important;
              }
              [data-radix-sheet-content] [role="tab"],
              [data-radix-dialog-content] [role="tab"] {
                flex-shrink: 0 !important;
                white-space: nowrap !important;
                font-size: 0.8rem !important;
                padding: 0.4rem 0.75rem !important;
              }
            }

            :root {
              --cor-primaria: ${temaCores["cor-primaria"] || "#f59e0b"};
              --cor-primaria-hover: ${temaCores["cor-primaria-hover"] || "#d97706"};
              --cor-primaria-active: ${temaCores["cor-primaria-active"] || "#b45309"};
              --cor-secundaria: ${temaCores["cor-secundaria"] || "#10b981"};
              --cor-secundaria-hover: ${temaCores["cor-secundaria-hover"] || "#059669"};
              --cor-secundaria-active: ${temaCores["cor-secundaria-active"] || "#047857"};
              --bg-principal: ${temaCores["bg-principal"] || "#ffffff"};
              --bg-secundario: ${temaCores["bg-secundario"] || "#f8fafc"};
              --bg-terciario: ${temaCores["bg-terciario"] || "#f1f5f9"};
              --bg-hover: ${temaCores["bg-hover"] || "#f1f5f9"};
              --bg-active: ${temaCores["bg-active"] || "#e2e8f0"};
              --texto-principal: ${temaCores["texto-principal"] || "#1e293b"};
              --texto-secundario: ${temaCores["texto-secundario"] || "#64748b"};
              --texto-terciario: ${temaCores["texto-terciario"] || "#94a3b8"};
              --cor-sucesso: ${temaCores["cor-sucesso"] || "#10b981"};
              --cor-erro: ${temaCores["cor-erro"] || "#ef4444"};
              --cor-aviso: ${temaCores["cor-aviso"] || "#f59e0b"};
              --cor-info: ${temaCores["cor-info"] || "#3b82f6"};
            }
          `}
        </style>
        <div className="min-h-screen bg-slate-50">
          {/* Header */}
          <header className="fixed top-0 left-0 right-0 h-16 md:h-16 bg-white border-b border-slate-200 z-50">
            <div className="flex items-center justify-between h-full px-3 md:px-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
                >
                  <Menu className="w-5 h-5 text-slate-600" />
                </button>

                <Link to={createPageUrl("Dashboard")} className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}
                  >
                    <HardHat className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-base sm:text-xl font-bold text-slate-800 hidden sm:block">
                    SIGO OBRAS
                  </span>
                </Link>
              </div>

              <div className="flex items-center gap-3">
                {/* Filtro de Empresa (quando em grupo) */}
                {grupoAtivo && empresasDoGrupo.length > 0 && (
                  <div className="hidden md:block">
                    <Select
                      value={empresaAtiva?.id || ""}
                      onValueChange={(empresaId) => {
                        const emp = empresasDoGrupo.find((e) => e.id === empresaId);
                        if (emp) handleSelectEmpresa(emp);
                      }}
                    >
                      <SelectTrigger className="w-56 h-10 bg-slate-100 border-slate-200">
                        <SelectValue placeholder="Selecione empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {empresasDoGrupo.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.razao_social || emp.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Chat */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => setShowChat(true)}
                >
                  <MessageSquare className="w-5 h-5 text-slate-600" />
                </Button>

                {/* Notificações */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => setShowNotifications(true)}
                >
                  <Bell className="w-5 h-5 text-slate-600" />
                  {notificacoesNaoLidas > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
                      {notificacoesNaoLidas > 9 ? "9+" : notificacoesNaoLidas}
                    </span>
                  )}
                </Button>

                {/* Menu do Usuário */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2 pl-2 pr-2 md:pr-3">
                      <Avatar className="w-7 md:w-8 h-7 md:h-8">
                        <AvatarFallback className="bg-amber-100 text-amber-700 text-xs md:text-sm">
                          {user?.full_name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden md:block text-xs md:text-sm font-medium text-slate-700">
                        {user?.full_name?.split(" ")[0]}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 md:w-56">
                    <div className="px-3 py-2">
                      <p className="text-xs md:text-sm font-medium text-slate-900 truncate">
                        {user?.full_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                      <p className="text-xs text-amber-600 mt-1">{perfil}</p>
                      {empresaAtiva && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
                          <p className="text-xs text-slate-500">Empresa Ativa</p>
                          <p className="text-xs font-medium text-slate-700 truncate">
                            {empresaAtiva.nome}
                          </p>
                        </div>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowMeuPerfil(true)}>
                      <User className="w-4 h-4 mr-2" />
                      Meu Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowMinhasEmpresas(true)}>
                      <Building2 className="w-4 h-4 mr-2" />
                      Trocar Empresa
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Sidebar */}
          <aside
            className={cn(
              "fixed top-16 left-0 bottom-0 w-64 z-40 transition-transform duration-300 overflow-y-auto",
              sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
            style={{ backgroundColor: "#1a2332", borderRightColor: "#334155" }}
          >
            <nav className="p-2 md:p-4 space-y-1">
              {filteredMenu.map((item) => {
                const isActive = currentPageName === item.path;
                return (
                  <Link
                    key={item.path}
                    to={createPageUrl(item.path)}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                      isActive ? "font-medium" : "hover:text-slate-100"
                    )}
                    style={{
                      backgroundColor: isActive ? "#2d3a52" : "transparent",
                      color: isActive ? "#f1f5f9" : "#cbd5e1",
                    }}
                  >
                    <item.icon
                      className={cn("w-4 md:w-5 h-4 md:h-5")}
                      style={{ color: isActive ? "#f1f5f9" : "#94a3b8" }}
                    />
                    <span className="text-sm md:text-base">{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Info da Empresa no rodapé */}
            {empresaAtiva && (
              <div
                className="absolute bottom-0 left-0 right-0 p-2 md:p-4"
                style={{ borderTopColor: "#334155", backgroundColor: "#1a2332" }}
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-8 md:w-10 h-8 md:h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 md:w-5 h-4 md:h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium text-slate-800 truncate">
                      {empresaAtiva.razao_social || empresaAtiva.nome_fantasia || empresaAtiva.nome}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{empresaAtiva.cnpj}</p>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Overlay mobile */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Main Content */}
          <main className="pt-16 lg:pl-64 min-h-screen">
            <div className="p-3 sm:p-4 md:p-6">{children}</div>
          </main>

          {/* Painel de Notificações */}
          <NotificationsPanel open={showNotifications} onOpenChange={setShowNotifications} />

          {/* Painel de Chat */}
          <ChatPanel
            open={showChat}
            onOpenChange={setShowChat}
            empresaAtiva={empresaAtiva}
            user={user}
          />

          {/* Meu Perfil */}
          <MeuPerfilSheet open={showMeuPerfil} onOpenChange={setShowMeuPerfil} />

          {/* Modal Minhas Empresas */}
          <Sheet open={showMinhasEmpresas} onOpenChange={setShowMinhasEmpresas}>
            <SheetContent
              side="right"
              className="w-full h-full overflow-y-auto !p-0"
              data-fullscreen-modal
            >
              <SheetHeader className="p-6 border-b border-slate-200 sticky top-0 bg-white">
                <SheetTitle>Minhas Empresas</SheetTitle>
              </SheetHeader>
              <div className="py-6 px-6 space-y-4">
                {empresas.map((empresa) => (
                  <Card
                    key={empresa.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      empresaAtiva?.id === empresa.id ? "border-2 border-amber-500 bg-amber-50" : ""
                    }`}
                    onClick={() => {
                      handleSelectEmpresa(empresa);
                      setShowMinhasEmpresas(false);
                    }}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            {empresa.logo_url ? (
                              <img
                                src={empresa.logo_url}
                                alt="Logo"
                                className="w-full h-full object-contain rounded-lg"
                              />
                            ) : (
                              <Building2 className="w-8 h-8 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg text-slate-800 truncate">
                              {empresa.razao_social || empresa.nome_fantasia || empresa.nome}
                            </h3>
                            {empresa.cnpj && (
                              <p className="text-sm text-slate-500 mt-1">CNPJ: {empresa.cnpj}</p>
                            )}
                            {empresa.cidade && empresa.estado && (
                              <p className="text-sm text-slate-500">
                                {empresa.cidade}/{empresa.estado}
                              </p>
                            )}
                          </div>
                        </div>
                        {empresaAtiva?.id === empresa.id && (
                          <Badge className="bg-amber-500 text-white flex-shrink-0">Ativa</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </>
    </EmpresaContext.Provider>
  );
}
