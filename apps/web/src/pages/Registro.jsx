import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HardHat, Loader2, UserPlus } from 'lucide-react';

export default function Registro() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [form, setForm] = useState({
    nome_completo: '',
    email: '',
    senha: '',
    confirmar_senha: '',
    empresa_id: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmpresas();
  }, []);

  const loadEmpresas = async () => {
    try {
      const lista = await base44.entities.Empresa.filter({ ativo: true });
      setEmpresas(lista);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.senha !== form.confirmar_senha) {
      setError('As senhas não coincidem');
      return;
    }

    if (form.senha.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const { data } = await base44.functions.invoke('registrarUsuario', {
        nome_completo: form.nome_completo,
        email: form.email,
        senha: form.senha,
        empresa_id: form.empresa_id,
        perfil: 'Gestor'
      });

      if (data.success) {
        navigate(createPageUrl('EntrarSistema'));
      } else {
        setError(data.error || 'Erro ao cadastrar usuário');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HardHat className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl">Criar Conta</CardTitle>
          <CardDescription>Cadastre-se no SIGO OBRAS</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome Completo</Label>
              <Input
                value={form.nome_completo}
                onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                placeholder="Seu nome completo"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="seu@email.com"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label>Empresa</Label>
              <Select value={form.empresa_id} onValueChange={(value) => setForm({ ...form, empresa_id: value })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Senha</Label>
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
              disabled={loading || !form.empresa_id}
              className="w-full bg-amber-500 hover:bg-amber-600 h-12"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5 mr-2" />
                  Cadastrar
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Já tem conta?{' '}
            <a href={createPageUrl('EntrarSistema')} className="text-amber-600 hover:underline font-medium">
              Faça login
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}