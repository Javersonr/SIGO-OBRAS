import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  HardHat,
  Loader2,
  Building2,
  Shield,
  BarChart3,
  Zap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  WifiOff,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function EntrarSistema() {
  const navigate = useNavigate();

  // Se já há sessão ativa, redirecionar para Dashboard
  React.useEffect(() => {
    const customAuth = sessionStorage.getItem("custom_auth");
    if (customAuth) {
      try {
        const userData = JSON.parse(customAuth);
        if (userData && userData.id && userData.empresa_id) {
          navigate(createPageUrl("Dashboard"), { replace: true });
        }
      } catch (e) {
        console.warn(
          "[EntrarSistema] custom_auth no sessionStorage está corrompido, limpando:",
          e?.message
        );
        sessionStorage.clear();
      }
    }
  }, [navigate]);

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(() => localStorage.getItem("login_email_salvo") || "");
  const [senha, setSenha] = useState("");
  const [lembrarEmail, setLembrarEmail] = useState(
    () => !!localStorage.getItem("login_email_salvo")
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");

  React.useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState(null);
  const [usuarioBase, setUsuarioBase] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showEsqueciSenha, setShowEsqueciSenha] = useState(false);
  const [emailReset, setEmailReset] = useState("");
  const [loadingReset, setLoadingReset] = useState(false);
  const [messageReset, setMessageReset] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Tentar login de fornecedor PRIMEIRO
      try {
        const fornResp = await sigo.functions.invoke("autenticarFornecedor", {
          email: email.trim().toLowerCase(),
          senha,
        });
        if (fornResp.data.success) {
          sessionStorage.setItem(
            "custom_auth",
            JSON.stringify({
              id: fornResp.data.fornecedor_id,
              fornecedor_id: fornResp.data.fornecedor_id,
              nome_completo: fornResp.data.fornecedor_nome,
              email: fornResp.data.email,
              empresa_id: fornResp.data.empresa_id,
              perfil: "Fornecedor",
            })
          );
          navigate(createPageUrl("HistoricoCotacoes"), { replace: true });
          return;
        }
      } catch (fornErr) {
        // Falha normal se o usuário não for fornecedor — não é erro.
        // Mas logamos pra debug em caso de erro de rede/CORS/etc.
        if (fornErr?.message && !/credenciais|inv[áa]lid/i.test(fornErr.message)) {
          console.warn(
            "[EntrarSistema] autenticarFornecedor falhou (esperado se o user não é fornecedor):",
            fornErr.message
          );
        }
      }

      // Se não for fornecedor, tentar login interno
      const response = await sigo.functions.invoke("loginCustom", {
        email: email.trim(),
        senha,
      });

      if (response.data.success) {
        if (response.data.multiplas_empresas) {
          setEmpresasDisponiveis(response.data.empresas);
          setUsuarioBase({
            ...response.data.usuario_base,
            grupos: response.data.grupos || [],
          });
          setLoading(false);
          return;
        }

        sessionStorage.setItem("custom_auth", JSON.stringify(response.data.usuario));
        sessionStorage.setItem("empresa_ativa", response.data.usuario.empresa_id);
        if (lembrarEmail) {
          localStorage.setItem("login_email_salvo", email.trim());
        } else {
          localStorage.removeItem("login_email_salvo");
        }

        navigate(createPageUrl("Dashboard"), { replace: true });
      } else {
        setError(response.data.error || "Credenciais inválidas");
      }
    } catch (err) {
      console.error("Erro no login:", err);
      setError("Erro ao conectar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelecionarEmpresa = async (empresa) => {
    setLoading(true);
    setError("");

    try {
      // Validação: certificar que temos os dados necessários
      if (!usuarioBase || !usuarioBase.id || !usuarioBase.email) {
        setError("Erro: dados do usuário incompletos");
        setLoading(false);
        return;
      }

      // Reutilizar dados do login para garantir consistência
      const usuarioCompleto = {
        id: usuarioBase.id,
        email: usuarioBase.email,
        nome_completo: usuarioBase.nome_completo,
        perfil: usuarioBase.perfil,
        tipo_usuario: "interno",
        empresa_id: empresa.id,
        empresa_nome: empresa.nome,
      };

      // Salvar no sessionStorage (não logamos os dados — privacidade/segurança)
      const authData = {
        ...usuarioCompleto,
        grupo_id: usuarioBase?.grupo_selecionado || usuarioBase?.grupo_id || null,
      };

      sessionStorage.setItem("custom_auth", JSON.stringify(authData));
      sessionStorage.setItem("empresa_ativa", empresa.id);

      // Se for fornecedor, redirecionar para área de cotações
      if (usuarioCompleto.perfil === "Fornecedor") {
        navigate(createPageUrl("HistoricoCotacoes"), { replace: true });
      } else {
        navigate(createPageUrl("Dashboard"), { replace: true });
      }
    } catch (err) {
      console.error("Erro ao selecionar empresa:", err);
      setError("Erro ao acessar empresa: " + err.message);
      setLoading(false);
    }
  };

  const handleEsqueciSenha = async (e) => {
    e.preventDefault();
    setLoadingReset(true);
    setMessageReset("");

    try {
      const response = await sigo.functions.invoke("redefinirSenhaUsuario", {
        usuario_email: emailReset.trim(),
      });

      if (response.data.success) {
        setMessageReset("✓ Nova senha enviada para seu email!");
        setEmailReset("");
        setTimeout(() => {
          setShowEsqueciSenha(false);
          setMessageReset("");
        }, 2000);
      } else {
        setMessageReset(response.data.error || "Erro ao enviar");
      }
    } catch (err) {
      console.error("Erro:", err);
      setMessageReset("Erro ao processar. Verifique se o email existe.");
    } finally {
      setLoadingReset(false);
    }
  };

  // Modal de "Esqueci minha senha"
  if (showEsqueciSenha) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)" }}
      >
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <HardHat className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Redefinir Senha</CardTitle>
            <CardDescription>Digite seu email para receber uma nova senha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {messageReset && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  messageReset.includes("✓")
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {messageReset}
              </div>
            )}

            <form onSubmit={handleEsqueciSenha} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">E-mail corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="seu.email@empresa.com"
                    value={emailReset}
                    onChange={(e) => setEmailReset(e.target.value)}
                    className="h-12 pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loadingReset}
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-medium"
              >
                {loadingReset ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar nova senha"
                )}
              </Button>
            </form>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowEsqueciSenha(false);
                setEmailReset("");
                setMessageReset("");
              }}
            >
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se há empresas disponíveis, mostrar seleção de empresa e grupo juntos
  if (empresasDisponiveis) {
    const grupos = usuarioBase?.grupos || [];

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: "#f8fafc" }}
      >
        <Card className="w-full max-w-3xl bg-white">
          <CardHeader className="text-center border-b border-slate-200 p-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-blue-600">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-slate-900">Selecione a Empresa</CardTitle>
            <CardDescription className="text-slate-600">
              Olá, {usuarioBase?.nome_completo}! Você tem acesso a {empresasDisponiveis.length}{" "}
              empresa(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {error && (
              <div className="border border-red-200 rounded-lg p-3 mb-4 bg-red-50">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-6">
              {/* Seção de Empresas */}
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Empresas</h3>
                <div className="grid gap-3">
                  {empresasDisponiveis.map((empresa) => (
                    <button
                      key={empresa.id}
                      onClick={() => {
                        setUsuarioBase({ ...usuarioBase, empresa_selecionada: empresa.id });
                        handleSelecionarEmpresa(empresa);
                      }}
                      disabled={loading}
                      className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg transition-all text-left disabled:opacity-50 hover:border-slate-300"
                    >
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
                        {empresa.logo_url ? (
                          <img
                            src={empresa.logo_url}
                            alt={empresa.nome}
                            className="w-full h-full object-contain rounded-lg"
                          />
                        ) : (
                          <Building2 className="w-6 h-6 text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-800">{empresa.nome}</h3>
                      </div>
                      {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seção de Grupos (se houver) */}
              {grupos.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-3">Grupos Empresariais</h3>
                  <div className="grid gap-3">
                    {grupos.map((grupo) => (
                      <button
                        key={grupo.id}
                        onClick={() => {
                          setUsuarioBase({ ...usuarioBase, grupo_selecionado: grupo.id });
                          handleSelecionarEmpresa(empresasDisponiveis[0]);
                        }}
                        disabled={loading}
                        className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg transition-all text-left disabled:opacity-50 hover:border-slate-300"
                      >
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
                          {grupo.logo_url ? (
                            <img
                              src={grupo.logo_url}
                              alt={grupo.nome}
                              className="w-full h-full object-contain rounded-lg"
                            />
                          ) : (
                            <Building2 className="w-6 h-6 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-800">{grupo.nome}</h3>
                          <p className="text-sm text-slate-500">
                            {grupo.cnpj_principal || "Sem CNPJ"}
                          </p>
                        </div>
                        {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 text-center">
              <Button
                variant="ghost"
                onClick={() => {
                  setEmpresasDisponiveis(null);
                  setUsuarioBase(null);
                  setSenha("");
                }}
                disabled={loading}
                className="text-slate-600 hover:text-slate-900"
              >
                Voltar ao Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tela de login normal
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#ffffff" }}>
      {/* Lado Esquerdo - Login */}
      <div
        className="w-full lg:w-1/2 flex items-center justify-center p-8"
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg flex items-center justify-center">
              <HardHat className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-900">SIGO OBRAS</div>
              <div className="text-xs text-slate-600">Sistema Integrado de Gestão</div>
            </div>
          </div>

          {/* Formulário */}
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesse sua conta</h1>
              <p className="text-slate-600">Entre com suas credenciais para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">E-mail corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="engenharia@suaempresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-10"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Senha de acesso</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="h-12 pl-10 pr-10"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {!isOnline && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <WifiOff className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  <p className="text-sm text-orange-700">
                    Sem conexão — conecte-se para fazer login
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="lembrar"
                  checked={lembrarEmail}
                  onCheckedChange={(v) => setLembrarEmail(!!v)}
                />
                <label htmlFor="lembrar" className="text-sm text-slate-600 cursor-pointer">
                  Lembrar meu e-mail neste dispositivo
                </label>
              </div>

              <Button
                type="submit"
                disabled={loading || !isOnline}
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Acessando...
                  </>
                ) : (
                  "Acessar sistema"
                )}
              </Button>

              <button
                type="button"
                onClick={() => setShowEsqueciSenha(true)}
                className="w-full text-center text-sm text-slate-600 hover:text-slate-900 font-medium py-2"
              >
                Esqueceu sua senha?
              </button>
            </form>

            <p className="text-xs text-center text-slate-500">
              © 2024 SIGO OBRAS. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>

      {/* Lado Direito - Informações */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-12 items-center justify-center">
        <div className="max-w-lg space-y-8 text-white">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-white/90">Sistema 100% operacional</span>
          </div>

          {/* Título */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold leading-tight">
              Gestão profissional
              <br />
              para suas obras
            </h2>
            <p className="text-lg text-white/70">
              Plataforma completa para gerenciar projetos, equipes, orçamentos e muito mais com
              total controle e eficiência.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <div className="flex items-start gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Segurança garantida</h3>
                <p className="text-sm text-white/60">
                  Seus dados protegidos com criptografia de ponta e backups automáticos
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Relatórios inteligentes</h3>
                <p className="text-sm text-white/60">
                  Dashboards e análises em tempo real para decisões mais assertivas
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Performance otimizada</h3>
                <p className="text-sm text-white/60">
                  Sistema rápido e responsivo, executável de qualquer dispositivo
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
