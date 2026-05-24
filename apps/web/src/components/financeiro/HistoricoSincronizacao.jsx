import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function HistoricoSincronizacao({ empresaId }) {
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarHistorico();
    const interval = setInterval(carregarHistorico, 60000); // Atualizar a cada minuto
    return () => clearInterval(interval);
  }, [empresaId]);

  const carregarHistorico = async () => {
    try {
      setCarregando(true);

      // Buscar audit logs de sincronização
      const logs = await base44.entities.AuditLog.filter({
        empresa_id: empresaId,
        entidade: 'PreLancamento'
      }, '-created_date', 10);

      setHistorico(logs || []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setCarregando(false);
    }
  };

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </CardContent>
      </Card>
    );
  }

  if (historico.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-slate-500">Nenhuma sincronização registrada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de Operações</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {historico.map((log, idx) => (
            <div key={idx} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {log.status === 'sucesso' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  )}
                  <span className="font-medium text-slate-900 text-sm">
                    {log.tipo_acao === 'criar' && 'Criado'}
                    {log.tipo_acao === 'editar' && 'Atualizado'}
                    {log.tipo_acao === 'deletar' && 'Deletado'}
                  </span>
                  <span className="text-slate-600 text-sm">- {log.entidade_nome}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Por: {log.usuario_nome || log.usuario_email}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(log.created_date).toLocaleString('pt-BR')}
                </p>
              </div>
              <Badge
                className={log.status === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
              >
                {log.status === 'sucesso' ? 'OK' : 'Erro'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}