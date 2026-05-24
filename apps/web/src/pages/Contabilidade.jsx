import React, { useState } from 'react';
import { useEmpresa } from '../Layout';
import { 
  Calculator, FileText, Calendar, Building2, Users,
  AlertCircle, CheckCircle2, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Contabilidade() {
  const { empresaAtiva, perfil, temPermissao } = useEmpresa();

  if (!empresaAtiva) return null;

  const rotinas = [
    { nome: 'Apuração de Impostos', status: 'Pendente', vencimento: '2024-02-10', icon: Calculator },
    { nome: 'Conciliação Bancária', status: 'Concluído', vencimento: '2024-02-05', icon: FileText },
    { nome: 'Balancete Mensal', status: 'Em Andamento', vencimento: '2024-02-15', icon: Calendar },
    { nome: 'DCTF', status: 'Pendente', vencimento: '2024-02-20', icon: FileText },
    { nome: 'EFD Contribuições', status: 'Pendente', vencimento: '2024-02-25', icon: FileText },
  ];

  const statusColors = {
    'Pendente': 'bg-amber-100 text-amber-700',
    'Em Andamento': 'bg-blue-100 text-blue-700',
    'Concluído': 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Contabilidade</h1>
        <p className="text-slate-500">Gestão contábil e obrigações fiscais</p>
      </div>

      {/* Cards Resumo */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-amber-200">
          <CardContent className="p-5">
            <AlertCircle className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-2xl font-bold text-amber-600">3</p>
            <p className="text-sm text-slate-500">Rotinas Pendentes</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200">
          <CardContent className="p-5">
            <Clock className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-2xl font-bold text-blue-600">1</p>
            <p className="text-sm text-slate-500">Em Andamento</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-5">
            <CheckCircle2 className="w-5 h-5 text-green-600 mb-2" />
            <p className="text-2xl font-bold text-green-600">1</p>
            <p className="text-sm text-slate-500">Concluídas no Mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Users className="w-5 h-5 text-slate-500 mb-2" />
            <p className="text-2xl font-bold text-slate-800">-</p>
            <p className="text-sm text-slate-500">Contador Vinculado</p>
          </CardContent>
        </Card>
      </div>

      {/* Rotinas */}
      <Card>
        <CardHeader>
          <CardTitle>Rotinas Contábeis do Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rotinas.map((rotina, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <rotina.icon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{rotina.nome}</p>
                    <p className="text-sm text-slate-500">
                      Vencimento: {new Date(rotina.vencimento).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <Badge className={statusColors[rotina.status]}>{rotina.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Contador */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações Contábeis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">Configure seu Contador</h3>
            <p className="text-slate-500 mb-4">Vincule seu escritório de contabilidade para facilitar a gestão</p>
            <Button variant="outline">
              Configurar Contador
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}