import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../../Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, FileCheck, Eye, Wrench } from 'lucide-react';

export default function WidgetSeguranca() {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState({
    examesVencendo: 0,
    documentosPendentes: 0,
    vistoriaPendentes: 0,
    totalFuncionarios: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    try {
      const [funcionarios] = await Promise.all([
        base44.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }, null, null)
      ]);

      const hoje = new Date();
      let examesVencendo = 0;
      let documentosPendentes = 0;
      let vistoriaPendentes = 0;

      funcionarios.forEach(f => {
        // Contar ASOs vencendo (até 30 dias)
        if (f.aso_vencimento) {
          const dataAso = new Date(f.aso_vencimento);
          const diasRestantes = Math.ceil((dataAso - hoje) / (1000 * 60 * 60 * 24));
          if (diasRestantes >= 0 && diasRestantes <= 30) {
            examesVencendo++;
          }
        }

        // Documentos obrigatórios pendentes
        if (f.documentos_obrigatorios) {
          try {
            const docs = JSON.parse(f.documentos_obrigatorios);
            documentosPendentes += docs.filter(d => !d.anexado).length;
          } catch (e) {}
        }

        // Vistorias pendentes (assumir como registros de inspeção)
        if (!f.documentos_pessoais || f.documentos_pessoais === '[]') {
          vistoriaPendentes++;
        }
      });

      setData({
        examesVencendo,
        documentosPendentes,
        vistoriaPendentes,
        totalFuncionarios: funcionarios.length
      });
    } catch (error) {
      console.error('Erro ao carregar dados de segurança:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="h-48 animate-pulse bg-slate-100" />
    );
  }

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-500" />
            Segurança e Ferramental
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Exames Vencendo */}
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="text-sm text-slate-600 mb-1">Exames Vencendo</div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-red-600">{data.examesVencendo}</span>
              {data.examesVencendo > 0 && (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
            <p className="text-xs text-red-600 mt-1">próximos 30 dias</p>
          </div>

          {/* Documentos Pendentes */}
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="text-sm text-slate-600 mb-1">Documentos</div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-yellow-600">{data.documentosPendentes}</span>
              {data.documentosPendentes > 0 && (
                <AlertCircle className="w-4 h-4 text-yellow-500" />
              )}
            </div>
            <p className="text-xs text-yellow-600 mt-1">pendentes</p>
          </div>

          {/* Vistorias Pendentes */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-slate-600 mb-1">Vistorias</div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-blue-600">{data.vistoriaPendentes}</span>
              {data.vistoriaPendentes > 0 && (
                <Eye className="w-4 h-4 text-blue-500" />
              )}
            </div>
            <p className="text-xs text-blue-600 mt-1">pendentes</p>
          </div>

          {/* Total de Funcionários */}
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-sm text-slate-600 mb-1">Funcionários</div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-green-600">{data.totalFuncionarios}</span>
              <FileCheck className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-xs text-green-600 mt-1">no total</p>
          </div>
        </div>

        {/* Status Geral */}
        <div className="pt-2 border-t">
          <div className="flex gap-2 flex-wrap">
            {data.examesVencendo > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200">
                {data.examesVencendo} exames vencendo
              </Badge>
            )}
            {data.documentosPendentes > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                {data.documentosPendentes} docs
              </Badge>
            )}
            {data.vistoriaPendentes > 0 && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {data.vistoriaPendentes} vistorias
              </Badge>
            )}
            {data.examesVencendo === 0 && data.documentosPendentes === 0 && data.vistoriaPendentes === 0 && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                Tudo em dia ✓
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}