import React from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AlertaTreinamentosVencidos({ treinamentos }) {
  const hoje = new Date();
  
  const verificarStatus = (dataFim) => {
    if (!dataFim) return null;
    
    const fim = new Date(dataFim);
    fim.setHours(0, 0, 0, 0);
    
    const diffDays = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { status: 'vencido', days: Math.abs(diffDays) };
    if (diffDays <= 30) return { status: 'proxima_vencimento', days: diffDays };
    return null;
  };

  const treinamentosAlerta = treinamentos
    .map(t => ({ ...t, alerta: verificarStatus(t.data_fim) }))
    .filter(t => t.alerta !== null)
    .sort((a, b) => a.alerta.days - b.alerta.days);

  if (treinamentosAlerta.length === 0) return null;

  const vencidos = treinamentosAlerta.filter(t => t.alerta.status === 'vencido');
  const proximos = treinamentosAlerta.filter(t => t.alerta.status === 'proxima_vencimento');

  return (
    <div className="space-y-3 mb-4">
      {vencidos.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 ml-2">
            <div className="font-medium mb-2">
              {vencidos.length} treinamento(s) vencido(s) - AÇÃO IMEDIATA NECESSÁRIA
            </div>
            <div className="space-y-1 text-sm">
              {vencidos.map(t => (
                <div key={t.id} className="flex items-center justify-between">
                  <span>{t.nome}</span>
                  <Badge variant="destructive" className="text-xs">
                    Vencido há {t.alerta.days} dia(s)
                  </Badge>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {proximos.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 ml-2">
            <div className="font-medium mb-2">
              {proximos.length} treinamento(s) vencendo em até 30 dias
            </div>
            <div className="space-y-1 text-sm">
              {proximos.map(t => (
                <div key={t.id} className="flex items-center justify-between">
                  <span>{t.nome}</span>
                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                    Vence em {t.alerta.days} dia(s) ({format(new Date(t.data_fim), 'dd/MM/yyyy')})
                  </Badge>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}