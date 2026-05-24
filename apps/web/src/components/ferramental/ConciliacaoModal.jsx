import React from 'react';
import SheetModalComponent from '@/components/ui/sheet-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ConciliacaoModal({ open, onOpenChange, itensConciliacao, setItensConciliacao, onConfirmar }) {
  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title="Conciliação de Entradas"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirmar} className="bg-amber-500 hover:bg-amber-600">
            Confirmar Entradas ({itensConciliacao.filter(i => i.ferramentaSelecionada).length})
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Associe cada item importado com uma ferramenta do banco de dados:
        </p>
        {itensConciliacao.map((item, idx) => (
          <Card key={idx} className="p-4">
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-slate-800">{item.descricao}</p>
                <p className="text-sm text-slate-500">Código: {item.codigo || 'N/A'} | Marca: {item.marca || 'N/A'}</p>
                <p className="text-sm text-amber-600">Quantidade: {item.quantidade} | Valor Unit.: R$ {item.valorUnitario.toFixed(2)}</p>
              </div>
              <div>
                <Label>Ferramenta no Sistema</Label>
                <Select
                  value={item.ferramentaSelecionada || ''}
                  onValueChange={(v) => {
                    const novoItens = [...itensConciliacao];
                    novoItens[idx].ferramentaSelecionada = v;
                    setItensConciliacao(novoItens);
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione a ferramenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {item.candidatos.map((c, i) => (
                      <SelectItem key={i} value={c.ferramenta.id}>
                        {c.ferramenta.codigo} - {c.ferramenta.descricao}
                        {c.similaridade < 1 && ` (${Math.round(c.similaridade * 100)}% similar)`}
                      </SelectItem>
                    ))}
                    <SelectItem value="ignorar">❌ Ignorar este item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </SheetModalComponent>
  );
}