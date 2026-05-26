import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sigo } from "@/api/sigoClient";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardHat, Lock } from "lucide-react";
import { toast } from "sonner";

export default function FornecedorLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  // Começa como true para bloquear qualquer render até o redirect acontecer
  const [redirecting, setRedirecting] = useState(true);

  // Se vier com token, redirecionar para AcessoFornecedor
  React.useEffect(() => {
    const hash = window.location.hash;
    const searchString = hash.includes("?")
      ? hash.split("?")[1]
      : window.location.search.substring(1);
    const params = new URLSearchParams(searchString);
    const urlToken = params.get("token");

    if (urlToken) {
      navigate(createPageUrl("AcessoFornecedor") + `?token=${urlToken}`, { replace: true });
    } else {
      setRedirecting(false); // Mostrar formulário de login
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !senha) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);

    try {
      const { data } = await sigo.functions.invoke("autenticarFornecedor", {
        email: email.toLowerCase(),
        senha,
      });

      if (data.success) {
        // Salvar dados do fornecedor no sessionStorage
        sessionStorage.setItem(
          "fornecedor_auth",
          JSON.stringify({
            fornecedor_id: data.fornecedor_id,
            fornecedor_nome: data.fornecedor_nome,
            email: data.email,
            empresa_id: data.empresa_id,
          })
        );

        toast.success("Login realizado com sucesso!");
        navigate(createPageUrl("HistoricoCotacoes"));
      } else {
        toast.error(data.error || "Credenciais inválidas");
      }
    } catch (error) {
      console.error("Erro no login:", error);
      toast.error("Erro ao fazer login. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  // Nunca renderizar nada — sempre redireciona
  if (redirecting) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white">
      <Card className="w-full max-w-md shadow-lg bg-white border border-slate-200">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-slate-900 to-slate-800">
            <HardHat className="w-9 h-9 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            Acesso para Fornecedores
          </CardTitle>
          <p className="text-sm mt-2 text-slate-600">
            Entre com suas credenciais para acessar as cotações
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="mt-1.5"
                autoComplete="email"
              />
            </div>

            <div>
              <Label htmlFor="senha">Senha de Acesso</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite a senha recebida por email"
                  className="pl-10"
                  autoComplete="current-password"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                A senha foi enviada no email de convite para cotação
              </p>
            </div>

            <Button
              type="submit"
              className="w-full text-white bg-slate-900 hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>

            <div className="text-center pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                Problemas para acessar? Entre em contato com a empresa que enviou a cotação
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
