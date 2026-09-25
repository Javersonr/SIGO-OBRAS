import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HardHat, Loader2, ArrowLeft, CheckCircle, MessageCircle } from "lucide-react";

/**
 * Recuperação de senha em 2 passos via WhatsApp:
 *   1) e-mail → recebe código de 6 dígitos no telefone do cadastro
 *   2) código + senha nova → redefine e volta pro login
 */
export default function EsqueciSenha() {
  const [etapa, setEtapa] = useState(1); // 1=email, 2=código+senha, 3=sucesso
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const pedirCodigo = async (e) => {
    e?.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const response = await sigo.functions.invoke("recuperarSenha", {
        email: email.trim(),
      });
      // A resposta é a mesma para e-mail cadastrado ou não (não confirma cadastro)
      if (response.data.success !== false) {
        setEtapa(2);
        setInfo(response.data.message || "Se o e-mail estiver cadastrado, enviamos um código.");
      } else {
        setError(response.data.error || "Não foi possível enviar o código");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao processar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const redefinir = async (e) => {
    e.preventDefault();
    setError("");
    if (novaSenha !== confirmarSenha) {
      setError("As senhas não coincidem");
      return;
    }
    if (novaSenha.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      const response = await sigo.functions.invoke("redefinirSenhaCodigo", {
        email: email.trim(),
        codigo: codigo.trim(),
        nova_senha: novaSenha,
      });
      if (response.data.success !== false) {
        setEtapa(3);
      } else {
        setError(response.data.error || "Não foi possível redefinir a senha");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao processar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (etapa === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Senha Redefinida!</CardTitle>
            <CardDescription>Sua senha foi alterada com sucesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => (window.location.href = createPageUrl("EntrarSistema"))}
              className="w-full bg-slate-900 hover:bg-slate-800 h-12"
            >
              Ir para o Login
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
          <CardTitle className="text-2xl">Redefinir Senha</CardTitle>
          <CardDescription>
            {etapa === 1
              ? "Digite seu e-mail para receber um código por WhatsApp"
              : "Digite o código de 6 dígitos que chegou no WhatsApp do seu cadastro"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {etapa === 1 ? (
            <form onSubmit={pedirCodigo} className="space-y-4">
              <div>
                <Label>E-mail corporativo</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
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
                className="w-full bg-slate-900 hover:bg-slate-800 h-12"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando código...
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Enviar código por WhatsApp
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={redefinir} className="space-y-4">
              {info && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm text-emerald-700">{info}</p>
                </div>
              )}

              <div>
                <Label>Código recebido</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  className="mt-1 text-center text-2xl tracking-[0.5em] font-mono"
                />
              </div>

              <div>
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mín. 8, com maiúscula, minúscula e número"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
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
                className="w-full bg-slate-900 hover:bg-slate-800 h-12"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Redefinindo...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Redefinir senha
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={pedirCodigo}
                disabled={loading}
                className="w-full text-sm text-slate-500 hover:text-slate-700"
              >
                Não recebeu? Reenviar código
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => (window.location.href = createPageUrl("EntrarSistema"))}
            className="w-full mt-4 text-sm text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao Login
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
