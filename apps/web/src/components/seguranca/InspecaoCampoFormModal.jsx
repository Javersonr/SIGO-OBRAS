import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function InspecaoCampoFormModal({ open, onOpenChange, empresaAtiva, inspecao, onSaved }) {
  const [checklists, setChecklists] = useState([]);
  const [form, setForm] = useState({
    checklist_id: '',
    checklist_nome: '',
    data_inspecao: new Date().toISOString().split('T')[0],
    local: '',
    responsavel_nome: '',
    responsavel_email: '',
    projeto_nome: '',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && empresaAtiva?.id) loadChecklists();
  }, [open, empresaAtiva?.id]);

  useEffect(() => {
    if (inspecao) {
      setForm({
        checklist_id: inspecao.checklist_id || '',
        checklist_nome: inspecao.checklist_nome || '',
        data_inspecao: inspecao.data_inspecao || new Date().toISOString().split('T')[0],
        local: inspecao.local || '',
        responsavel_nome: inspecao.responsavel_nome || '',
        responsavel_email: inspecao.responsavel_email || '',
        projeto_nome: inspecao.projeto_nome || '',
        observacoes: inspecao.observacoes || '',
      });
    } else {
      setForm({
        checklist_id: '', checklist_nome: '',
        data_inspecao: new Date().toISOString().split('T')[0],
        local: '', responsavel_nome: '', responsavel_email: '', projeto_nome: '', observacoes: '',
      });
    }
  }, [inspecao, open]);

  const loadChecklists = async () => {
    try {
      const data = await base44.entities.ChecklistInspecaoCampo.filter({ empresa_id: empresaAtiva.id, ativo: true });
      setChecklists(data);
    } catch { toast.error('Erro ao carregar checklists'); }
  };

  const handleSalvar = async () => {
    if (!form.checklist_id) { toast.error('Selecione um checklist'); return; }
    if (!form.data_inspecao) { toast.error('Informe a data'); return; }
    setSaving(true);
    try {
      const cl = checklists.find(c => c.id === form.checklist_id);
      const itensChecklist = cl?.itens ? JSON.parse(cl.itens) : [];
      const itensInspecao = itensChecklist.map(it => ({
        item_id: it.id,
        nome: it.nome,
        descricao: it.descricao || '',
        foto_referencia_url: it.foto_referencia_url || '',
        obrigatorio: it.obrigatorio !== false,
        foto_inspecao_url: '',
        status: 'pendente', // pendente | conforme | nao_conforme
        resultado_ia: '',
        observacao: ''
      }));

      const data = {
        empresa_id: empresaAtiva.id,
        checklist_id: form.checklist_id,
        checklist_nome: form.checklist_nome,
        data_inspecao: form.data_inspecao,
        local: form.local,
        responsavel_nome: form.responsavel_nome,
        responsavel_email: form.responsavel_email,
        projeto_nome: form.projeto_nome,
        observacoes: form.observacoes,
        itens_inspecao: JSON.stringify(itensInspecao),
        total_itens: itensInspecao.length,
        total_inspecionados: 0,
        total_conformes: 0,
        total_nao_conformes: 0,
        status: 'Em Andamento',
        ativo: true
      };

      if (inspecao?.id) {
        // Editar: apenas campos de cabeçalho, não resetar itens se já inspecionados
        const updateData = {
          checklist_id: form.checklist_id,
          checklist_nome: form.checklist_nome,
          data_inspecao: form.data_inspecao,
          local: form.local,
          responsavel_nome: form.responsavel_nome,
          responsavel_email: form.responsavel_email,
          projeto_nome: form.projeto_nome,
          observacoes: form.observacoes,
        };
        await base44.entities.InspecaoCampo.update(inspecao.id, updateData);
        toast.success('Inspeção atualizada');
      } else {
        await base44.entities.InspecaoCampo.create(data);
        toast.success('Inspeção criada! Acesse para inspecionar os itens.');
      }
      onSaved();
    } catch { toast.error('Erro ao salvar inspeção'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-fullscreen-modal className="p-0 flex flex-col !rounded-none !border-0"
        style={{ position: 'fixed', left: '256px', top: '64px', right: 0, bottom: 0, width: 'calc(100vw - 256px)', height: 'calc(100vh - 64px)', maxWidth: 'none', maxHeight: 'none', transform: 'none' }}>
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle>{inspecao ? 'Editar Inspeção' : 'Nova Inspeção de Campo'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-4">
            <div>
              <Label>Checklist / Modelo *</Label>
              <Select value={form.checklist_id} onValueChange={v => {
                const cl = checklists.find(c => c.id === v);
                setForm(p => ({ ...p, checklist_id: v, checklist_nome: cl?.nome || '' }));
              }}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o modelo de checklist" />
                </SelectTrigger>
                <SelectContent>
                  {checklists.map(cl => (
                    <SelectItem key={cl.id} value={cl.id}>{cl.nome} ({cl.total_itens || 0} itens)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {checklists.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Nenhum checklist cadastrado. Crie um em "Gerenciar Checklists".</p>
              )}
            </div>

            <div>
              <Label>Data da Inspeção *</Label>
              <Input type="date" value={form.data_inspecao} onChange={e => setForm(p => ({ ...p, data_inspecao: e.target.value }))} className="mt-1.5" />
            </div>

            <div>
              <Label>Local / Endereço</Label>
              <Input value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))} placeholder="Ex: Rua X, Obra Y" className="mt-1.5" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Responsável</Label>
                <Input value={form.responsavel_nome} onChange={e => setForm(p => ({ ...p, responsavel_nome: e.target.value }))} placeholder="Nome" className="mt-1.5" />
              </div>
              <div>
                <Label>Email do Responsável</Label>
                <Input type="email" value={form.responsavel_email} onChange={e => setForm(p => ({ ...p, responsavel_email: e.target.value }))} placeholder="email@..." className="mt-1.5" />
              </div>
            </div>

            <div>
              <Label>Projeto / Obra</Label>
              <Input value={form.projeto_nome} onChange={e => setForm(p => ({ ...p, projeto_nome: e.target.value }))} placeholder="Nome do projeto ou obra" className="mt-1.5" />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={3} className="mt-1.5" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex-shrink-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
            {saving ? 'Salvando...' : inspecao ? 'Atualizar' : 'Criar Inspeção'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}