import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HardHat, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';

export default function EsqueciSenha() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await base44.functions.invoke('solicitarResetSenha', {
        email: email.trim()
      });

      if (response.data.success) {
        setSuccess(true);
      } else {
        setError(response.data.error || 'Erro ao enviar email');
      }
    } catch (err) {
      console.error('Erro:', err);
      setError('Erro ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Email Enviado!</CardTitle>
            <CardDescription>
              Enviamos um link para redefinir sua senha para <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 text-center mb-4">
              Verifique sua caixa de entrada e spam. O link expira em 1 hora.
            </p>
            <Button
              onClick={() => window.location.href = createPageUrl('EntrarSistema')}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Login
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
          <CardTitle className="text-2xl">Esqueci minha senha</CardTitle>
          <CardDescription>Digite seu email para receber o link de recuperação</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
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
              className="w-full bg-amber-500 hover:bg-amber-600 h-12"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Link de Recuperação'
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            <a href={createPageUrl('EntrarSistema')} className="text-amber-600 hover:underline font-medium">
              <ArrowLeft className="w-3 h-3 inline mr-1" />
              Voltar ao login
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}