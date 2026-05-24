import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../../Layout';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WidgetPedidosPendentes() {
  const { empresaAtiva } = useEmpresa();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadPedidos();
    } else {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  const loadPedidos = async () => {
    try {
      const peds = await base44.entities.PedidoCompra.filter(
        { empresa_id: empresaAtiva.id },
        '-created_date',
        5
      );
      setPedidos(peds.filter(p => !['Entregue', 'Cancelado'].includes(p.status)));
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusColors = {
    'Emitido': 'bg-blue-100 text-blue-700',
    'Enviado': 'bg-purple-100 text-purple-700',
    'Confirmado': 'bg-cyan-100 text-cyan-700',
    'Em Trânsito': 'bg-amber-100 text-amber-700',
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-purple-600" />
            Pedidos Pendentes
          </div>
          <Link to={createPageUrl('Compras')}>
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todos
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pedidos.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            Nenhum pedido pendente
          </p>
        ) : (
          pedidos.map(ped => (
            <div key={ped.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{ped.numero}</p>
                <p className="text-xs text-slate-500">{ped.fornecedor_nome}</p>
              </div>
              <Badge className={statusColors[ped.status] || 'bg-slate-100 text-slate-700'}>
                {ped.status}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}