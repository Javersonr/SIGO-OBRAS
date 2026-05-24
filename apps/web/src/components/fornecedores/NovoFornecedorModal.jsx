import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const FORM_INICIAL = {
  nome_razao: '', nome_fantasia: '', tipo_pessoa: 'PJ', cnpj: '',
  inscricao_estadual: '', inscricao_municipal: '',
  contato_principal: '', email: '', telefone: '',
  categorias: [],
  cep: '', endereco: '', numero: '', complemento_bairro: '',
  cidade: '', estado: '', observacoes: ''
};

export default function NovoFornecedorModal({ open, onOpenChange, empresaAtiva, onFornecedorCriado, comSidebar = true }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const buscarCep = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({ ...f, endereco: data.logradouro || '', complemento_bairro: data.bairro || '', cidade: data.localidade || '', estado: data.uf || '' }));
      }
    } catch {}
    finally { setBuscandoCep(false); }
  };

  React.useEffect(() => {
    if (open) setForm(FORM_INICIAL);
  }, [open]);

  const handleSave = async () => {
    if (!form.nome_razao.trim()) return;
    setSaving(true);
    try {
      const fornecedor = await base44.entities.Fornecedor.create({
        empresa_id: empresaAtiva.id,
        ...form,
        ativo: true
      });
      toast.success('✅ Fornecedor criado com sucesso');
      if (onFornecedorCriado) onFornecedorCriado(fornecedor);
      onOpenChange(false);
    } catch (error) {
      toast.error('❌ Erro ao criar fornecedor');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      {/* Overlay que bloqueia cliques no modal pai */}
      <div
        className="fixed inset-0 z-[99998]"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Novo Fornecedor */}
      <div
        className={`fixed z-[99999] bg-white flex flex-col`}
        style={{
          top: comSidebar ? 'max(0px, 64px)' : 0,
          left: comSidebar ? 'max(0px, 256px)' : 0,
          right: 0,
          bottom: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Novo Fornecedor</h2>
            <p className="text-sm text-slate-500">Preencha os dados do fornecedor</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Dados Básicos */}
            <div className="space-y-4">
              <div>
                <Label>Nome/Razão Social *</Label>
                <Input value={form.nome_razao} onChange={(e) => setForm({ ...form, nome_razao: e.target.value })} placeholder="Nome completo ou razão social" className="mt-1.5" />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} placeholder="Nome fantasia" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.tipo_pessoa} onValueChange={(v) => setForm({ ...form, tipo_pessoa: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PF">Pessoa Física</SelectItem>
                      <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>CPF/CNPJ</Label>
                  <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder={form.tipo_pessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} className="mt-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Inscrição Estadual</Label>
                  <Input value={form.inscricao_estadual} onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Inscrição Municipal</Label>
                  <Input value={form.inscricao_municipal} onChange={(e) => setForm({ ...form, inscricao_municipal: e.target.value })} className="mt-1.5" />
                </div>
              </div>
            </div>

            {/* Contato */}
            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium text-slate-700">Contato</h4>
              <div>
                <Label>Contato Principal</Label>
                <Input value={form.contato_principal} onChange={(e) => setForm({ ...form, contato_principal: e.target.value })} placeholder="Nome da pessoa de contato" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" className="mt-1.5" />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" className="mt-1.5" />
                </div>
              </div>
            </div>

            {/* Categorias */}
            <div className="border-t pt-4">
              <Label>Categorias de Produtos/Serviços</Label>
              <Input
                value={form.categorias?.join(', ') || ''}
                onChange={(e) => setForm({ ...form, categorias: e.target.value.split(',').map(c => c.trim()).filter(Boolean) })}
                placeholder="Ex: Elétrica, Hidráulica, Materiais"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-500 mt-1">Separe as categorias com vírgula</p>
            </div>

            {/* Endereço */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium text-slate-700">Endereço</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>CEP</Label>
                  <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={(e) => buscarCep(e.target.value)} placeholder="00000-000" className="mt-1.5" />
                  {buscandoCep && <p className="text-xs text-slate-400 mt-1">Buscando endereço...</p>}
                </div>
                <div className="col-span-2">
                  <Label>Endereço</Label>
                  <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} placeholder="Rua, Avenida..." className="mt-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="123" className="mt-1.5" />
                </div>
                <div className="col-span-2">
                  <Label>Complemento/Bairro</Label>
                  <Input value={form.complemento_bairro} onChange={(e) => setForm({ ...form, complemento_bairro: e.target.value })} placeholder="Sala 101, Centro" className="mt-1.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="São Paulo" className="mt-1.5" />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} placeholder="SP" maxLength={2} className="mt-1.5" />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="border-t pt-4">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Informações adicionais sobre o fornecedor..." className="mt-1.5" rows={3} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex-shrink-0">
          <div className="max-w-2xl mx-auto flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.nome_razao} className="bg-amber-500 hover:bg-amber-600">
              {saving ? 'Salvando...' : 'Salvar Fornecedor'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}