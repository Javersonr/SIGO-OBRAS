import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sigo, aplicarSessao } from "@/api/sigoClient";
import { createPageUrl } from "../utils";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KeyRound, Loader2 } from "lucide-react";

/**
 * Troca de senha OBRIGATÓRIA — o login-custom devolve must_change_password
 * (senha_provisoria) e o EntrarSistema/Layout mandam o usuário pra cá até ele
 * definir uma senha nova. A troca usa alterar-senha (JWT da sessão + senha
 * atual), que derruba as sessões antigas e devolve uma nova.
 *
 * Página "pública" no Layout só para não montar menu/sidebar; ela mesma exige
 * o custom_auth do login.
 */
export default function TrocarSenha() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dados = safeParseJSON(sessionStorage.getItem("custom_auth"), null);
    if (!dados?.id || !dados?.email) {
      navigate(createPageUrl("EntrarSistema"), { replace: true });
      return;
    }
    setUsuario(dados);
  }, [navigate]);

  const destino = (perfil) => (perfil === "Cliente" ? "ClientePortal" : "Dashboard");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (novaSenha.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError("As senhas não conferem");
      return;
    }
    if (novaSenha === senhaAtual) {
      setError("A nova senha precisa ser diferente da atual");
      return;
    }

    setLoading(true);
    try {
      const response = await sigo.functions.invoke("alterarSenha", {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      if (!response.data?.success) {
        setError(response.data?.error || "Erro ao alterar senha");
        return;
      }
      // A troca derruba todas as sessões, inclusive esta; a função devolve uma nova
      await aplicarSessao(response.data.session);
      const atualizado = { ...usuario, must_change_password: false };
      sessionStorage.setItem("custom_auth", JSON.stringify(atualizado));
      navigate(createPageUrl(destino(atualizado.perfil)), { replace: true });
    } catch (err) {
      console.error("[TrocarSenha] erro:", err);
      setError("Erro ao processar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const sair = async () => {
    await sigo.auth.logout();
    sessionStorage.clear();
    navigate(createPageUrl("EntrarSistema"), { replace: true });
  };

  if (!usuario) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl">Defina uma nova senha</CardTitle>
          <CardDescription>
            Por segurança, sua senha atual precisa ser trocada antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="senha-atual">Senha atual</Label>
              <Input
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                minLength={8}
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">Mínimo 8 caracteres</p>
            </div>

            <div>
              <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
              <Input
                id="confirmar-senha"
                type="password"
                autoComplete="new-password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 h-12"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar nova senha"
              )}
            </Button>

            <Button type="button" variant="ghost" onClick={sair} className="w-full">
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
