import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HardHat, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function RedefinirSenha() {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [tokenValido, setTokenValido] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const tokenParam = params.get('token');
    
    if (!tokenParam) {
      setError('Link inválido ou expirado');
      setValidating(false);
      return;
    }

    setToken(tokenParam);
    validarToken(tokenParam);
  }, []);

  const validarToken = async (tokenParam) => {
    try {
      const response = await base44.functions.invoke('validarTokenReset', { token: tokenParam });
      
      if (response.data.valido) {
        setTokenValido(true);
      } else {
        setError('Link inválido ou expirado');
      }
    } catch (err) {
      setError('Erro ao validar link');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (novaSenha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setError('As senhas não conferem');
      return;
    }

    setLoading(true);

    try {
      const response = await base44.functions.invoke('redefinirSenha', {
        token,
        nova_senha: novaSenha
      });

      if (response.data.success) {
        setSuccess(true);
      } else {
        setError(response.data.error || 'Erro ao redefinir senha');
      }
    } catch (err) {
      console.error('Erro:', err);
      setError('Erro ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
              <p className="text-slate-600">Validando link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Senha Redefinida!</CardTitle>
            <CardDescription>Sua senha foi alterada com sucesso</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => window.location.href = createPageUrl('EntrarSistema')}
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              Fazer Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValido) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Link Inválido</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => window.location.href = createPageUrl('EsqueciSenha')}
              variant="outline"
              className="w-full"
            >
              Solicitar Novo Link
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
          <CardDescription>Digite sua nova senha</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="••••••"
                required
                minLength={6}
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">Mínimo 6 caracteres</p>
            </div>

            <div>
              <Label>Confirmar Nova Senha</Label>
              <Input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="••••••"
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
                  Redefinindo...
                </>
              ) : (
                'Redefinir Senha'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}