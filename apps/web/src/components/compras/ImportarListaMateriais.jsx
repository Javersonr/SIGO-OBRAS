import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FileText } from 'lucide-react';

export default function ImportarListaMateriais({ open, onOpenChange, empresaId, oportunidadeId, projetoId, onSucesso }) {
  const [carregando, setCarregando] = useState(false);

  const handleImportar = async () => {
    setCarregando(true);
    try {
      const response = await base44.functions.invoke('gerarListaMaterialesDoOrcamento', {
        empresaId,
        oportunidadeId,
        projetoId
      });

      if (response.data.status !== 'sucesso') {
        alert('Erro ao gerar lista de materiais');
        return;
      }

      const materiais = response.data.materiais || [];

      // Criar itens de solicitação de compra a partir dos materiais
      const itens = materiais.map((m, idx) => ({
        material_id: m.material_id,
        material_nome: m.material_nome,
        material_codigo: m.material_codigo,
        quantidade: m.quantidade,
        unidade: m.material_unidade,
        ordem: idx + 1
      }));

      // Retornar dados para o componente pai processar
      if (onSucesso) {
        onSucesso({
          materiais: materiais,
          itens: itens,
          valor_total: response.data.valor_total
        });
      }

      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao importar:', err);
      alert('Erro ao importar lista de materiais: ' + err.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Lista de Materiais</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600">
            Esta ação irá gerar uma lista consolidada de materiais do orçamento (incluindo expansão de KITs) para criar uma solicitação de compra.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            <FileText className="w-4 h-4 inline mr-2" />
            Os KITs serão expandidos em seus materiais constituintes com as quantidades multiplicadas.
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={carregando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImportar}
              disabled={carregando}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {carregando && <Loader2 className="w-4 h-4 animate-spin" />}
              Importar Materiais
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}