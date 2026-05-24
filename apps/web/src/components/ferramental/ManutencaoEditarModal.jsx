import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import SheetModalComponent from '@/components/ui/sheet-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wrench, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function ManutencaoEditarModal({ open, onOpenChange, manutencao, extras = [], ferramentasList = [], onSave }) {
  const { empresaAtiva } = useEmpresa();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (manutencao) {
      setForm({
        tipo_manutencao: manutencao.tipo_manutencao || 'Corretiva',
        status: manutencao.status || 'Agendada',
        data_prevista: manutencao.data_prevista || '',
        data_manutencao: manutencao.data_manutencao || '',
        descricao: manutencao.descricao || '',
        observacoes: manutencao.observacoes || '',
        fornecedor_nome: manutencao.fornecedor_nome || '',
        custo: manutencao.custo || 0,
        horas_uso_no_momento: manutencao.horas_uso_no_momento || 0,
        proxima_manutencao_prevista: manutencao.proxima_manutencao_prevista || ''
      });
    }
  }, [manutencao]);

  const handleSalvar = async () => {
    setSaving(true);
    try {
      // Atualizar o registro principal
      await base44.entities.ManutencaoFerramenta.update(manutencao.id, form);

      // Atualizar todos os registros extras do grupo com o mesmo status
      if (extras.length > 0) {
        await Promise.all(extras.map(e =>
          base44.entities.ManutencaoFerramenta.update(e.id, { status: form.status })
        ));
      }

      // Coletar todos os ferramenta_ids do pedido (principal + extras + JSON)
      const ferramentaIds = [];
      if (manutencao.ferramenta_id) ferramentaIds.push(manutencao.ferramenta_id);
      extras.forEach(e => { if (e.ferramenta_id) ferramentaIds.push(e.ferramenta_id); });
      // Também buscar IDs do JSON ferramentas (novo fluxo)
      try {
        const jsonFerrs = manutencao.ferramentas ? JSON.parse(manutencao.ferramentas) : [];
        jsonFerrs.forEach(f => { if (f.ferramenta_id && !ferramentaIds.includes(f.ferramenta_id)) ferramentaIds.push(f.ferramenta_id); });
      } catch {}

      if (form.status === 'Concluída' && ferramentaIds.length > 0) {
        await Promise.all(ferramentaIds.map(fid =>
          base44.entities.Ferramenta.update(fid, {
            status: 'Disponível',
            ultima_manutencao: form.data_manutencao || new Date().toISOString().split('T')[0],
            ...(form.proxima_manutencao_prevista ? { proxima_manutencao: form.proxima_manutencao_prevista } : {})
          })
        ));
      }

      if (form.status === 'Cancelada' && ferramentaIds.length > 0) {
        await Promise.all(ferramentaIds.map(fid =>
          base44.entities.Ferramenta.update(fid, { status: 'Disponível' })
        ));
      }

      toast.success('Manutenção atualizada com sucesso');
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar manutenção:', error);
      toast.error('Erro ao salvar manutenção');
    } finally {
      setSaving(false);
    }
  };

  if (!manutencao) return null;

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title="Editar Manutenção"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Info da ferramenta */}
        <div className="bg-slate-50 rounded-lg p-4 flex items-center gap-3">
          <Wrench className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-800">{manutencao.ferramenta_codigo}</p>
            <p className="text-sm text-slate-500">{manutencao.ferramenta_descricao}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tipo de Manutenção</Label>
            <Select value={form.tipo_manutencao} onValueChange={v => setForm({ ...form, tipo_manutencao: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Preventiva">Preventiva</SelectItem>
                <SelectItem value="Corretiva">Corretiva</SelectItem>
                <SelectItem value="Preditiva">Preditiva</SelectItem>
                <SelectItem value="Inspeção">Inspeção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Agendada">Agendada</SelectItem>
                <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                <SelectItem value="Concluída">Concluída</SelectItem>
                <SelectItem value="Cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Data Prevista</Label>
            <Input type="date" value={form.data_prevista} onChange={e => setForm({ ...form, data_prevista: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Data Realizada</Label>
            <Input type="date" value={form.data_manutencao} onChange={e => setForm({ ...form, data_manutencao: e.target.value })} className="mt-1.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Fornecedor / Responsável</Label>
            <Input value={form.fornecedor_nome} onChange={e => setForm({ ...form, fornecedor_nome: e.target.value })} placeholder="Nome do fornecedor" className="mt-1.5" />
          </div>
          <div>
            <Label>Custo (R$)</Label>
            <Input type="number" step="0.01" min="0" value={form.custo} onChange={e => setForm({ ...form, custo: parseFloat(e.target.value) || 0 })} className="mt-1.5" />
          </div>
        </div>

        <div>
          <Label>Próxima Manutenção Prevista</Label>
          <Input type="date" value={form.proxima_manutencao_prevista} onChange={e => setForm({ ...form, proxima_manutencao_prevista: e.target.value })} className="mt-1.5" />
        </div>

        <div>
          <Label>Descrição dos Serviços</Label>
          <Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva os serviços realizados ou a realizar..." className="mt-1.5" rows={3} />
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Observações adicionais..." className="mt-1.5" rows={2} />
        </div>

        {(form.status === 'Concluída' || form.status === 'Cancelada') && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            {form.status === 'Concluída'
              ? `✅ Ao salvar como Concluída, todas as ferramentas do pedido (${ferramentasList.length || 1}) serão marcadas como Disponível.`
              : `⚠️ Ao salvar como Cancelada, todas as ferramentas do pedido (${ferramentasList.length || 1}) serão marcadas como Disponível.`}
          </div>
        )}
      </div>
    </SheetModalComponent>
  );
}