import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HardHat, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function PrimeiroAcesso() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [validando, setValidando] = useState(true);
  const [tokenValido, setTokenValido] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [form, setForm] = useState({
    senha: "",
    confirmar_senha: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    validarToken();
  }, []);

  const validarToken = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (!token) {
      setError("Token não encontrado");
      setValidando(false);
      return;
    }

    setValidando(true);
    try {
      const { data } = await sigo.functions.invoke("validarTokenConvite", { token });

      if (data.success) {
        setTokenValido(true);
        setUsuario(data.usuario);
      } else {
        setError(data.error || "Token inválido");
        setTokenValido(false);
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao validar token");
      setTokenValido(false);
    } finally {
      setValidando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.senha !== form.confirmar_senha) {
      setError("As senhas não coincidem");
      return;
    }

    if (form.senha.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");

      const { data } = await sigo.functions.invoke("concluirPrimeiroAcesso", {
        token,
        senha: form.senha,
      });

      if (data.success) {
        navigate(createPageUrl("EntrarSistema"));
      } else {
        setError(data.error || "Erro ao criar senha");
      }
    } catch (err) {
      setError("Erro ao conectar com o servidor");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (validando) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Validando convite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValido) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Link Inválido</h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <Button onClick={() => navigate(createPageUrl("EntrarSistema"))} variant="outline">
              Voltar para Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HardHat className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl">Primeiro Acesso</CardTitle>
          <CardDescription>
            Olá, {usuario?.nome_completo || usuario?.usuario_email}!<br />
            Crie sua senha para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={usuario?.usuario_email || ""}
                disabled
                className="mt-1 bg-slate-50"
              />
            </div>

            <div>
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label>Confirmar Senha</Label>
              <Input
                type="password"
                value={form.confirmar_senha}
                onChange={(e) => setForm({ ...form, confirmar_senha: e.target.value })}
                placeholder="Digite a senha novamente"
                required
                className="mt-1"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
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
                  Criando senha...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Criar Senha e Acessar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
