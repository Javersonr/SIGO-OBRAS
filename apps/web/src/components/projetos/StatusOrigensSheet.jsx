import React from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Edit, Trash2 } from 'lucide-react';

export default function StatusOrigensSheet({ open, onOpenChange, statusList, origensList, empresaAtiva, onReload }) {
  const [statusForm, setStatusForm] = React.useState({ nome: '', cor: '#3B82F6', ordem: 0, tipo: 'aberto' });
  const [editingStatus, setEditingStatus] = React.useState(null);
  const [novaOrigem, setNovaOrigem] = React.useState('');

  const handleSaveStatus = async () => {
    if (!statusForm.nome) return;
    if (editingStatus) {
      await base44.entities.StatusOportunidade.update(editingStatus.id, statusForm);
    } else {
      await base44.entities.StatusOportunidade.create({ empresa_id: empresaAtiva.id, ...statusForm });
    }
    setStatusForm({ nome: '', cor: '#3B82F6', ordem: 0, tipo: 'aberto' });
    setEditingStatus(null);
    onReload();
  };

  const handleDeleteStatus = async (s) => {
    if (!confirm('Excluir este status?')) return;
    await base44.entities.StatusOportunidade.delete(s.id);
    onReload();
  };

  const handleCriarOrigem = async () => {
    if (!novaOrigem.trim()) return;
    await base44.entities.OrigemOportunidade.create({ empresa_id: empresaAtiva.id, nome: novaOrigem });
    setNovaOrigem('');
    onReload();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader><SheetTitle>Gerenciar Status e Origens</SheetTitle></SheetHeader>
        </div>
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <Tabs defaultValue="status">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="origens">Origens</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="space-y-4 mt-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label>Nome do Status</Label>
                    <Input value={statusForm.nome} onChange={e => setStatusForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Em Análise" className="mt-1.5" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Cor</Label>
                      <Input type="color" value={statusForm.cor} onChange={e => setStatusForm(p => ({ ...p, cor: e.target.value }))} className="mt-1.5 h-10" />
                    </div>
                    <div>
                      <Label>Ordem</Label>
                      <Input type="number" value={statusForm.ordem} onChange={e => setStatusForm(p => ({ ...p, ordem: parseInt(e.target.value) || 0 }))} className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={statusForm.tipo} onValueChange={v => setStatusForm(p => ({ ...p, tipo: v }))}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aberto">Aberto</SelectItem>
                          <SelectItem value="ganho">Ganho</SelectItem>
                          <SelectItem value="perdido">Perdido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleSaveStatus} className="w-full bg-amber-500 hover:bg-amber-600">
                    <Plus className="w-4 h-4 mr-2" />
                    {editingStatus ? 'Atualizar Status' : 'Adicionar Status'}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Status Cadastrados</Label>
                {statusList.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: s.cor }} />
                      <div>
                        <p className="font-medium">{s.nome}</p>
                        <p className="text-xs text-slate-500">Ordem: {s.ordem} • Tipo: {s.tipo}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => { setStatusForm(s); setEditingStatus(s); }}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteStatus(s)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="origens" className="space-y-4 mt-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label>Nova Origem</Label>
                    <div className="flex gap-2 mt-1.5">
                      <Input value={novaOrigem} onChange={e => setNovaOrigem(e.target.value)} placeholder="Ex: Indicação, Site, Licitação..." />
                      <Button onClick={handleCriarOrigem} disabled={!novaOrigem.trim()} className="bg-amber-500 hover:bg-amber-600"><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Origens Cadastradas</Label>
                {origensList.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="font-medium">{o.nome}</p>
                    <Button variant="ghost" size="icon" onClick={async () => { if (!confirm('Excluir esta origem?')) return; await base44.entities.OrigemOportunidade.delete(o.id); onReload(); }}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                {origensList.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Nenhuma origem cadastrada</p>}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <div className="sticky bottom-0 bg-white border-t p-6 z-10 flex-shrink-0 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}