import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, HardHat } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function UserNotRegisteredError() {
  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto">
              <HardHat className="w-8 h-8 text-white" />
            </div>
            
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Acesso Pendente</h1>
              <p className="text-slate-600 text-sm">
                Você ainda não está vinculado a nenhuma empresa. Entre em contato com o administrador para solicitar acesso.
              </p>
            </div>

            <Button onClick={handleLogout} className="w-full">
              Fazer Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}