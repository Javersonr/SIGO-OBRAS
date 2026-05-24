import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  User, 
  Building2, 
  FileText,
  Wrench,
  Edit
} from 'lucide-react';

export default function ManutencaoDetalheModal({ open, onOpenChange, manutencao, onEdit }) {
  const getStatusColor = (status) => {
    const colors = {
      'Agendada': 'bg-blue-100 text-blue-800',
      'Em Andamento': 'bg-yellow-100 text-yellow-800',
      'Concluída': 'bg-green-100 text-green-800',
      'Cancelada': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Detalhes da Manutenção</DialogTitle>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações da Ferramenta */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Ferramenta
            </h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">Código:</span>
                <span className="text-sm font-medium">{manutencao.ferramenta_codigo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-600">Descrição:</span>
                <span className="text-sm font-medium">{manutencao.ferramenta_descricao}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Dados da Manutenção */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Dados da Manutenção</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FileText className="w-4 h-4" />
                  <span>Tipo:</span>
                </div>
                <p className="text-sm font-medium pl-6">{manutencao.tipo_manutencao}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Badge className={getStatusColor(manutencao.status)}>
                    {manutencao.status}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>Data Prevista:</span>
                </div>
                <p className="text-sm font-medium pl-6">
                  {manutencao.data_prevista 
                    ? new Date(manutencao.data_prevista).toLocaleDateString('pt-BR')
                    : '-'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>Data Realizada:</span>
                </div>
                <p className="text-sm font-medium pl-6">
                  {manutencao.data_manutencao 
                    ? new Date(manutencao.data_manutencao).toLocaleDateString('pt-BR')
                    : '-'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span>Horas de Uso:</span>
                </div>
                <p className="text-sm font-medium pl-6">
                  {manutencao.horas_uso_no_momento || 0}h
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <DollarSign className="w-4 h-4" />
                  <span>Custo:</span>
                </div>
                <p className="text-sm font-medium pl-6">
                  {manutencao.custo > 0 ? `R$ ${manutencao.custo.toFixed(2)}` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Fornecedor */}
          {manutencao.fornecedor_nome && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Fornecedor
                </h3>
                <p className="text-sm">{manutencao.fornecedor_nome}</p>
              </div>
            </>
          )}

          {/* Descrição */}
          {manutencao.descricao && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Descrição dos Serviços</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {manutencao.descricao}
                </p>
              </div>
            </>
          )}

          {/* Observações */}
          {manutencao.observacoes && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Observações</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {manutencao.observacoes}
                </p>
              </div>
            </>
          )}

          {/* Próxima Manutenção */}
          {manutencao.proxima_manutencao_prevista && (
            <>
              <Separator />
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-700">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Próxima Manutenção Prevista:</span>
                  <span className="text-sm font-bold">
                    {new Date(manutencao.proxima_manutencao_prevista).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}