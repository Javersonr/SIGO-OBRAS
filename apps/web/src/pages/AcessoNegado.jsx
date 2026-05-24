import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, HardHat, Mail, Home } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Link } from 'react-router-dom';
export default function AcessoNegado() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (error) {
        console.error('Erro ao carregar usuário:', error);
      }
    };
    loadUser();
  }, []);

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-12">
          <div className="text-center space-y-6">
            {/* Logo */}
            <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <HardHat className="w-10 h-10 text-white" />
            </div>

            {/* Ícone de Alerta */}
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>

            {/* Mensagem */}
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-3">
                Acesso Pendente
              </h1>
              <p className="text-slate-600 mb-6">
                Olá, <strong>{user?.full_name || 'Usuário'}</strong>!
              </p>
              <p className="text-slate-600 mb-2">
                Seu cadastro foi realizado com sucesso, mas você ainda não está vinculado a nenhuma empresa no sistema.
              </p>
              <p className="text-slate-600">
                Para acessar o SIGO OBRAS, você precisa ser convidado por um administrador de uma empresa.
              </p>
            </div>

            {/* Informações de Contato */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-left">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 mb-2">Como obter acesso?</p>
                  <ul className="text-sm text-blue-700 space-y-2">
                    <li>• Entre em contato com o administrador da sua empresa</li>
                    <li>• Solicite um convite para o email: <strong>{user?.email}</strong></li>
                    <li>• Após o convite, você terá acesso imediato ao sistema</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLogout}
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                Fazer Logout
              </Button>
            </div>

            {/* Rodapé */}
            <div className="pt-8 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                Precisa de ajuda? Entre em contato com o suporte da sua empresa.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}