import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';

const TIPOS = [
  'Certidão Federal (CND)', 'Certidão Estadual', 'Certidão Municipal',
  'Certidão FGTS', 'Certidão Trabalhista', 'PGR', 'PCMSO', 'LTCAT',
  'ASO', 'Treinamento NR', 'ART', 'CAT', 'Contrato',
  'Licença Ambiental', 'Alvará', 'Manutenção/Calibração', 'Seguro', 'Outro'
];

const ALERTA_OPCOES = [1, 3, 7, 15, 30, 60, 90];

export default function VencimentoModal({ open, onOpenChange, vencimento, empresaAtiva, onSuccess }) {
  const [form, setForm] = useState({
    titulo: '', tipo: 'Certidão Federal (CND)', data_vencimento: '', data_emissao: '',
    alerta_dias: 30, responsavel_nome: '', responsavel_email: '',
    observacao: '', arquivo_url: '', arquivo_nome: '', renovacao_automatica: false,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vencimento) {
      setForm({ ...vencimento });
    } else {
      setForm({
        titulo: '', tipo: 'Certidão Federal (CND)', data_vencimento: '', data_emissao: '',
        alerta_dias: 30, responsavel_nome: '', responsavel_email: '',
        observacao: '', arquivo_url: '', arquivo_nome: '', renovacao_automatica: false,
      });
    }
  }, [vencimento, open]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, arquivo_url: file_url, arquivo_nome: file.name }));
      toast.success('Arquivo anexado');
    } catch { toast.error('Erro ao anexar arquivo'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const calcularStatus = (dataVenc, alertaDias) => {
    if (!dataVenc) return 'OK';
    const diff = Math.ceil((new Date(dataVenc + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Vencido';
    if (diff <= alertaDias) return 'A Vencer';
    return 'OK';
  };

  const handleSave = async () => {
    if (!form.titulo || !form.data_vencimento || !form.tipo) {
      toast.error('Preencha título, tipo e data de vencimento');
      return;
    }
    setSaving(true);
    try {
      const status = calcularStatus(form.data_vencimento, form.alerta_dias);
      const data = {
        ...form,
        status,
        empresa_id: empresaAtiva.id,
        empresa_nome: empresaAtiva.razao_social || empresaAtiva.nome_fantasia || empresaAtiva.nome,
        grupo_id: empresaAtiva.grupo_id || null,
      };
      if (vencimento?.id) {
        await base44.entities.Vencimento.update(vencimento.id, data);
        toast.success('Vencimento atualizado');
      } else {
        await base44.entities.Vencimento.create(data);
        toast.success('Vencimento cadastrado');
      }
      onSuccess();
      onOpenChange(false);
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col w-full sm:max-w-xl" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>{vencimento ? 'Editar Vencimento' : 'Novo Vencimento'}</SheetTitle>
          </SheetHeader>
          <button onClick={() => onOpenChange(false)} className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: CND Federal - Receita Federal" className="mt-1.5" />
          </div>

          <div>
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Vencimento *</Label>
              <Input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Data de Emissão</Label>
              <Input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label>Alertar com antecedência de</Label>
            <Select value={String(form.alerta_dias)} onValueChange={v => setForm(f => ({ ...f, alerta_dias: Number(v) }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{ALERTA_OPCOES.map(d => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Responsável</Label>
              <Input value={form.responsavel_nome} onChange={e => setForm(f => ({ ...f, responsavel_nome: e.target.value }))} placeholder="Nome" className="mt-1.5" />
            </div>
            <div>
              <Label>Email do Responsável</Label>
              <Input type="email" value={form.responsavel_email} onChange={e => setForm(f => ({ ...f, responsavel_email: e.target.value }))} placeholder="email@..." className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="mt-1.5" rows={2} />
          </div>

          {/* Upload arquivo */}
          <div>
            <Label>Documento Anexado</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {form.arquivo_url ? (
                <div className="flex items-center gap-2 flex-1 min-w-0 p-2 bg-slate-50 border rounded-lg">
                  <span className="text-sm text-slate-700 truncate flex-1">{form.arquivo_nome || 'Arquivo anexado'}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => window.open(form.arquivo_url, '_blank')}>
                    <Upload className="w-3 h-3 text-blue-500" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setForm(f => ({ ...f, arquivo_url: '', arquivo_nome: '' }))}>
                    <X className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              ) : (
                <label className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-2" disabled={uploading} asChild>
                    <span><Upload className="w-4 h-4" />{uploading ? 'Enviando...' : 'Anexar Documento'}</span>
                  </Button>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} />
                </label>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.renovacao_automatica} onCheckedChange={v => setForm(f => ({ ...f, renovacao_automatica: v }))} />
            <Label>Notificar responsável automaticamente</Label>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 flex-1">
            {saving ? 'Salvando...' : vencimento ? 'Atualizar' : 'Cadastrar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}