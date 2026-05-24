import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';

export default function EtapaModal({ 
  open, 
  onOpenChange, 
  etapaForm, 
  setEtapaForm, 
  onSave,
  usuariosEmpresa 
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="h-full overflow-y-auto p-0 flex flex-col" 
        style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader>
            <SheetTitle>Nova Etapa</SheetTitle>
          </SheetHeader>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <Label>Nome da Etapa *</Label>
            <Input
              value={etapaForm.etapa}
              onChange={(e) => setEtapaForm({ ...etapaForm, etapa: e.target.value })}
              placeholder="Ex: Fundação, Estrutura, Elétrica..."
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Responsáveis</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex -space-x-2">
                  {etapaForm.responsaveis_ids.map((respId, idx) => {
                    const resp = usuariosEmpresa.find(u => (u.usuario_id || u.id) === respId);
                    if (!resp) return null;
                    return (
                      <div
                        key={respId}
                        className="relative group"
                        style={{ zIndex: etapaForm.responsaveis_ids.length - idx }}
                      >
                        <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-sm font-bold text-white border-2 border-white cursor-pointer">
                          {resp.usuario_email?.substring(0, 2).toUpperCase()}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEtapaForm({
                            ...etapaForm,
                            responsaveis_ids: etapaForm.responsaveis_ids.filter(id => id !== respId)
                          })}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-white text-xs">×</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!etapaForm.responsaveis_ids.includes(v)) {
                      setEtapaForm({
                        ...etapaForm,
                        responsaveis_ids: [...etapaForm.responsaveis_ids, v]
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-10 p-0 border-2 border-dashed border-slate-300 hover:border-teal-600 bg-white">
                    <Plus className="w-5 h-5 text-slate-400" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuariosEmpresa
                      .filter(u => !etapaForm.responsaveis_ids.includes(u.usuario_id || u.id))
                      .map(u => (
                        <SelectItem key={u.id} value={u.usuario_id || u.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">
                              {u.usuario_email?.substring(0, 2).toUpperCase()}
                            </div>
                            <span>{u.usuario_email}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={etapaForm.status} onValueChange={(v) => setEtapaForm({ ...etapaForm, status: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A Fazer">A Fazer</SelectItem>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Concluída">Concluída</SelectItem>
                  <SelectItem value="Atrasada">Atrasada</SelectItem>
                  <SelectItem value="Pausada">Pausada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data Início Planejada</Label>
              <Input
                type="date"
                value={etapaForm.data_inicio_planejada}
                onChange={(e) => setEtapaForm({ ...etapaForm, data_inicio_planejada: e.target.value })}
                className="mt-1.5"
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div>
              <Label>Data Fim Planejada</Label>
              <Input
                type="date"
                value={etapaForm.data_fim_planejada}
                onChange={(e) => setEtapaForm({ ...etapaForm, data_fim_planejada: e.target.value })}
                className="mt-1.5"
                placeholder="dd/mm/aaaa"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data Início Real</Label>
              <Input
                type="date"
                value={etapaForm.data_inicio_real}
                onChange={(e) => setEtapaForm({ ...etapaForm, data_inicio_real: e.target.value })}
                className="mt-1.5"
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div>
              <Label>Data Fim Real</Label>
              <Input
                type="date"
                value={etapaForm.data_fim_real}
                onChange={(e) => setEtapaForm({ ...etapaForm, data_fim_real: e.target.value })}
                className="mt-1.5"
                placeholder="dd/mm/aaaa"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>% Conclusão</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={etapaForm.percentual_conclusao}
                onChange={(e) => setEtapaForm({ ...etapaForm, percentual_conclusao: parseInt(e.target.value) || 0 })}
                className="mt-1.5"
                placeholder="0"
              />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={etapaForm.prioridade} onValueChange={(v) => setEtapaForm({ ...etapaForm, prioridade: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={etapaForm.descricao}
              onChange={(e) => setEtapaForm({ ...etapaForm, descricao: e.target.value })}
              placeholder="Observações sobre a etapa..."
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={onSave} 
            disabled={!etapaForm.etapa}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Salvar Etapa
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}