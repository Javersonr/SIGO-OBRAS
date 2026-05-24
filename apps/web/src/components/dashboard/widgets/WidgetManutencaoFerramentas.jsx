import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, Wrench, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function WidgetManutencaoFerramentas() {
  const { empresaAtiva } = useEmpresa();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState({ atrasadas: [], proximas: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadAlertas();
    }
  }, [empresaAtiva?.id]);

  const loadAlertas = async () => {
    setLoading(true);
    try {
      const ferramentas = await base44.entities.Ferramenta.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
        alerta_manutencao: true
      });

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const seteDiasFrente = new Date(hoje);
      seteDiasFrente.setDate(seteDiasFrente.getDate() + 7);

      const atrasadas = [];
      const proximas = [];

      ferramentas.forEach(f => {
        if (f.proxima_manutencao) {
          const proxManut = new Date(f.proxima_manutencao);
          proxManut.setHours(0, 0, 0, 0);

          if (proxManut < hoje) {
            atrasadas.push(f);
          } else if (proxManut <= seteDiasFrente) {
            proximas.push(f);
          }
        }
      });

      setAlertas({ atrasadas, proximas });
    } catch (error) {
      console.error('Erro ao carregar alertas:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalAlertas = alertas.atrasadas.length + alertas.proximas.length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            <div className="h-8 bg-slate-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalAlertas === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <Wrench className="w-5 h-5" />
          Alertas de Manutenção
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Atrasadas */}
        {alertas.atrasadas.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-700">
                {alertas.atrasadas.length} Manutenção{alertas.atrasadas.length !== 1 ? 'ões' : ''} Atrasada{alertas.atrasadas.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {alertas.atrasadas.slice(0, 3).map(f => {
                const diasAtraso = Math.floor((new Date() - new Date(f.proxima_manutencao)) / (1000 * 60 * 60 * 24));
                return (
                  <div key={f.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-red-800">{f.codigo}</p>
                      <p className="text-red-600 text-xs">{f.descricao}</p>
                    </div>
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                      {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'}
                    </Badge>
                  </div>
                );
              })}
              {alertas.atrasadas.length > 3 && (
                <p className="text-xs text-red-600">
                  +{alertas.atrasadas.length - 3} mais...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Próximas */}
        {alertas.proximas.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-700">
                {alertas.proximas.length} Próxima{alertas.proximas.length !== 1 ? 's' : ''} (7 dias)
              </span>
            </div>
            <div className="space-y-2">
              {alertas.proximas.slice(0, 3).map(f => {
                const diasRestantes = Math.ceil((new Date(f.proxima_manutencao) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={f.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-amber-800">{f.codigo}</p>
                      <p className="text-amber-600 text-xs">{f.descricao}</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'}
                    </Badge>
                  </div>
                );
              })}
              {alertas.proximas.length > 3 && (
                <p className="text-xs text-amber-600">
                  +{alertas.proximas.length - 3} mais...
                </p>
              )}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(createPageUrl('Ferramental'))}
        >
          Ver Todas as Manutenções
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}