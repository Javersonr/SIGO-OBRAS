import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  PackageCheck, Clock, CheckCircle2, XCircle, Search,
  Printer, Eye, RefreshCw, Fingerprint, Truck
} from 'lucide-react';
import ConfirmarEntregaModal from './ConfirmarEntregaModal';
import ImprimirFichaEntregaModal from './ImprimirFichaEntregaModal';

const STATUS_CONFIG = {
  'Pendente': { color: 'bg-amber-100 text-amber-700', icon: Clock },
  'Entregue': { color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  'Cancelada': { color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function EntregasTab({ empresaAtiva, user }) {
  const [entregas, setEntregas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('Pendente');
  const [entregaSelecionada, setEntregaSelecionada] = useState(null);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [showImprimir, setShowImprimir] = useState(false);

  useEffect(() => {
    if (empresaAtiva?.id) loadEntregas();
  }, [empresaAtiva?.id]);

  const loadEntregas = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.EntregaFerramental.filter(
        { empresa_id: empresaAtiva.id },
        '-created_date',
        100
      );
      setEntregas(data);
    } catch (err) {
      toast.error('Erro ao carregar entregas');
    } finally {
      setLoading(false);
    }
  };

  const handleEntregaConfirmada = async (statusNovaEntrega) => {
    await loadEntregas();
    // Se foi entregue 100%, muda pra aba "Entregue"
    // Se foi parcial (Pendente), mantém na aba "Pendente"
    if (statusNovaEntrega === 'Entregue') {
      setFiltroStatus('Entregue');
    }
  };

  const handleCancelar = async (entrega) => {
    const nomeDest = entrega.funcionario_nome || entrega.caminhao_placa || 'desconhecido';
    if (!confirm(`Cancelar solicitação de entrega para ${nomeDest}?`)) return;
    try {
      await base44.entities.EntregaFerramental.update(entrega.id, { status: 'Cancelada' });
      toast.success('Solicitação cancelada');
      loadEntregas();
    } catch {
      toast.error('Erro ao cancelar');
    }
  };

  const handleDesfazer = async (entrega) => {
    if (!confirm(`Desfazer entrega para ${entrega.funcionario_nome || entrega.caminhao_placa}? A entrega voltará para Pendente.`)) return;
    try {
      await base44.entities.EntregaFerramental.update(entrega.id, { 
        status: 'Pendente',
        data_entrega: '',
        responsavel_entrega_nome: '',
        responsavel_entrega_email: ''
      });
      toast.success('Entrega desfeita com sucesso');
      loadEntregas();
    } catch {
      toast.error('Erro ao desfazer entrega');
    }
  };

  const entregasFiltradas = entregas
    .filter(e => filtroStatus === 'Todas' || e.status === filtroStatus)
    .filter(e =>
      !busca ||
      e.funcionario_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      e.funcao_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      e.caminhao_placa?.toLowerCase().includes(busca.toLowerCase()) ||
      e.caminhao_modelo?.toLowerCase().includes(busca.toLowerCase())
    );

  const stats = {
    pendentes: entregas.filter(e => e.status === 'Pendente').length,
    entregues: entregas.filter(e => e.status === 'Entregue').length,
  };

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{stats.pendentes}</p>
                <p className="text-sm text-amber-600">Pendentes de Entrega</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{stats.entregues}</p>
                <p className="text-sm text-green-600">Entregas Realizadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Busca */}
       <div className="w-full">
         <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
           <Input
             placeholder="Buscar por funcionário, função, placa do caminhão..."
             value={busca}
             onChange={e => setBusca(e.target.value)}
             className="pl-10 py-2 h-10 text-sm"
           />
         </div>
       </div>

       {/* Filtros por Status */}
       <div className="flex flex-wrap gap-3 items-center">
         <div className="flex gap-2">
           {['Pendente', 'Entregue', 'Cancelada', 'Todas'].map(s => (
             <Button
               key={s}
               variant={filtroStatus === s ? 'default' : 'outline'}
               size="sm"
               onClick={() => setFiltroStatus(s)}
             >
               {s}
             </Button>
           ))}
         </div>
         <Button variant="ghost" size="sm" onClick={loadEntregas} className="gap-1">
           <RefreshCw className="w-4 h-4" />
           Atualizar
         </Button>
       </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Carregando...</div>
      ) : entregasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <PackageCheck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p>Nenhuma entrega {filtroStatus !== 'Todas' ? filtroStatus.toLowerCase() : ''} encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entregasFiltradas.map(entrega => {
            const statusCfg = STATUS_CONFIG[entrega.status] || STATUS_CONFIG['Pendente'];
            const StatusIcon = statusCfg.icon;
            const itens = (() => {
              try {
                const parsed = JSON.parse(entrega.itens || '[]');
                return Array.isArray(parsed) ? parsed : [];
              } catch (err) {
                console.error('Erro ao parsear itens da entrega:', err);
                return [];
              }
            })();

            return (
              <Card key={entrega.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 p-4">
                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {entrega.tipo_destinatario === 'Caminhão' ? (
                          <span className="flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <h3 className="font-semibold text-slate-800 truncate">{entrega.caminhao_placa}</h3>
                          </span>
                        ) : (
                          <h3 className="font-semibold text-slate-800 truncate">{entrega.funcionario_nome}</h3>
                        )}
                        <Badge className={`text-xs ${statusCfg.color} flex items-center gap-1 flex-shrink-0`}>
                          <StatusIcon className="w-3 h-3" />
                          {entrega.status}
                        </Badge>
                        {entrega.biometria_capturada && (
                          <Badge className="text-xs bg-purple-100 text-purple-700 flex items-center gap-1 flex-shrink-0">
                            <Fingerprint className="w-3 h-3" />
                            Biometria
                          </Badge>
                        )}
                        {entrega.tipo_destinatario === 'Caminhão' && (
                          <Badge className="text-xs bg-blue-100 text-blue-700 flex items-center gap-1 flex-shrink-0">
                            <Truck className="w-3 h-3" />
                            Caminhão
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {entrega.tipo_destinatario === 'Caminhão'
                          ? `${entrega.caminhao_modelo || ''} • ${itens.length} item(ns)`
                          : `${entrega.funcao_nome} • ${itens.length} item(ns)`
                        }
                      </p>
                      <div className="flex gap-4 mt-1 text-xs text-slate-400">
                        <span>Solicitado por: {entrega.solicitante_nome} em {entrega.data_solicitacao ? format(new Date(entrega.data_solicitacao + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</span>
                        {entrega.data_entrega && (
                          <span>Entregue em: {format(new Date(entrega.data_entrega + 'T12:00:00'), 'dd/MM/yyyy')} por {entrega.responsavel_entrega_nome}</span>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex gap-2 flex-shrink-0">
                      {entrega.status === 'Pendente' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => { setEntregaSelecionada(entrega); setShowConfirmar(true); }}
                            className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Fingerprint className="w-4 h-4" />
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancelar(entrega)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {entrega.status === 'Entregue' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setEntregaSelecionada(entrega); setShowImprimir(true); }}
                            className="gap-1"
                          >
                            <Printer className="w-4 h-4" />
                            Imprimir
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDesfazer(entrega)}
                            className="text-orange-500 hover:text-orange-700"
                            title="Desfazer entrega"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEntregaSelecionada(entrega); setShowImprimir(true); }}
                        title="Visualizar detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modais */}
      <ConfirmarEntregaModal
        open={showConfirmar}
        onOpenChange={setShowConfirmar}
        entrega={entregaSelecionada}
        user={user}
        empresaAtiva={empresaAtiva}
        onConfirmed={handleEntregaConfirmada}
      />
      <ImprimirFichaEntregaModal
        open={showImprimir}
        onOpenChange={setShowImprimir}
        entrega={entregaSelecionada}
        empresaAtiva={empresaAtiva}
      />
    </div>
  );
}