import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import VencimentosContratos from '@/components/vencimentos/VencimentosContratos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';

export default function RelatorioVencimentos() {
  const { empresaAtiva } = useEmpresa();
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!empresaAtiva?.id) return;
      try {
        setLoading(true);
        const projetosData = await base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id });
        setProjetos(projetosData);
      } catch (error) {
        console.error('Erro ao carregar projetos:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [empresaAtiva?.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Relatório de Vencimentos de Contratos</h1>
        <p className="text-slate-600">Acompanhe o vencimento de todos os contratos dos projetos</p>
      </div>

      {projetos.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertTriangle className="w-10 h-10 text-amber-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900">Nenhum projeto registrado</h3>
              <p className="text-sm text-amber-700">Crie projetos com dados de contrato para visualizar este relatório</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <VencimentosContratos projetos={projetos} />
      )}
    </div>
  );
}