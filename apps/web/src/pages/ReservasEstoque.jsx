import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/lib/layout-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Check, Package } from 'lucide-react';
import BaixaReservaModal from '../components/estoque/BaixaReservaModal';

export default function ReservasEstoque() {
  const { empresaAtiva } = useEmpresa();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('Ativa');
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [reservaSelecionada, setReservaSelecionada] = useState(null);

  useEffect(() => {
    if (empresaAtiva?.id) loadReservas();
  }, [empresaAtiva?.id, filtro]);

  const loadReservas = async () => {
    setLoading(true);
    try {
      const query = { empresa_id: empresaAtiva.id };
      if (filtro !== 'Todas') query.status = filtro;
      const dados = await base44.entities.ReservaMaterial.filter(query);
      // Agrupar por numero de reserva
      const agrupadas = {};
      dados.forEach(r => {
        if (!agrupadas[r.numero]) {
          agrupadas[r.numero] = [];
        }
        agrupadas[r.numero].push(r);
      });
      setReservas(Object.entries(agrupadas).map(([numero, itens]) => ({ numero, itens })));
    } catch (error) {
      console.error('Erro ao carregar reservas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBaixa = async () => {
    await loadReservas();
    setShowBaixaModal(false);
  };

  const statusColor = (status) => {
    return { 'Ativa': 'bg-blue-100 text-blue-800', 'Utilizada': 'bg-green-100 text-green-800', 'Cancelada': 'bg-red-100 text-red-800' }[status] || 'bg-slate-100 text-slate-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800">Reservas de Materiais</h1>
      </div>

      <div className="flex gap-3">
        {['Ativa', 'Utilizada', 'Cancelada', 'Todas'].map(status => (
          <Button
            key={status}
            variant={filtro === status ? 'default' : 'outline'}
            onClick={() => setFiltro(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mx-auto"></div></div>
      ) : reservas.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-slate-500">Nenhuma reserva encontrada</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reservas.map(({ numero, itens }) => (
            <Card key={numero} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800 mb-1">{numero}</div>
                    <div className="text-sm text-slate-600">
                      Projeto: {itens[0]?.projeto_nome || '-'} • {itens.length} item(ns)
                    </div>
                  </div>
                  <Badge className={statusColor(itens[0]?.status)}>
                    {itens[0]?.status}
                  </Badge>
                </div>

                <div className="space-y-1 mb-4 bg-slate-50 p-3 rounded border border-slate-200">
                  {itens.map((item, idx) => (
                    <div key={idx} className="text-xs text-slate-700 flex justify-between">
                      <span>
                        <Package className="w-3 h-3 inline mr-1" />
                        {item.material_descricao}
                      </span>
                      <span className="font-medium">{item.quantidade_reservada} {item.unidade}</span>
                    </div>
                  ))}
                </div>

                {itens[0]?.status === 'Ativa' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setReservaSelecionada(itens[0]);
                      setShowBaixaModal(true);
                    }}
                    className="gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Dar Baixa
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BaixaReservaModal
        open={showBaixaModal}
        onOpenChange={setShowBaixaModal}
        reserva={reservaSelecionada}
        onSave={handleBaixa}
      />
    </div>
  );
}