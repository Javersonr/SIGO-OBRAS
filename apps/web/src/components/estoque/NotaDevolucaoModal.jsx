import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Trash2, FileText, RefreshCw, ExternalLink } from 'lucide-react';

const CFOP_OPTIONS = [
  { value: '5202', label: '5202 - Dev. compra mercadoria (mesmo estado)' },
  { value: '6202', label: '6202 - Dev. compra mercadoria (outro estado)' },
  { value: '5201', label: '5201 - Dev. compra insumo (mesmo estado)' },
  { value: '6201', label: '6201 - Dev. compra insumo (outro estado)' },
  { value: '5410', label: '5410 - Dev. compra mercadoria st (mesmo estado)' },
  { value: '6410', label: '6410 - Dev. compra mercadoria st (outro estado)' },
];

export default function NotaDevolucaoModal({ open, onOpenChange, empresaAtiva, user, saldos, materiais, almoxarifados }) {
  const [step, setStep] = useState(1); // 1=Destinatário, 2=Itens, 3=Revisão
  const [saving, setSaving] = useState(false);
  const [notaEmitida, setNotaEmitida] = useState(null);
  const [focusResult, setFocusResult] = useState(null);
  const [despesasComNFe, setDespesasComNFe] = useState([]);
  const [loadingDespesas, setLoadingDespesas] = useState(false);

  const [form, setForm] = useState({
    almoxarifado_id: '',
    destinatario_nome: '',
    destinatario_cnpj: '',
    destinatario_ie: '',
    destinatario_email: '',
    destinatario_endereco: '',
    destinatario_numero: '',
    destinatario_bairro: '',
    destinatario_cidade: '',
    destinatario_uf: 'SP',
    destinatario_cep: '',
    nfe_referenciada: '',
    informacoes_adicionais: '',
    itens: []
  });

  const [novoItem, setNovoItem] = useState({
    material_id: '',
    descricao: '',
    codigo: '',
    ncm: '',
    cfop: '5202',
    unidade: 'UN',
    quantidade: 1,
    valor_unitario: 0
  });

  // Carregar despesas com NF-e ao abrir
  useEffect(() => {
    if (!open || !empresaAtiva?.id) return;
    setLoadingDespesas(true);
    base44.entities.TransacaoFinanceira.filter({ empresa_id: empresaAtiva.id, tipo: 'Despesa' }, '-created_date', 200)
      .then(despesas => {
        // Filtrar apenas as que têm chave NF-e (numero_documento com 44 dígitos)
        const comNFe = despesas.filter(d => d.numero_documento && d.numero_documento.replace(/\D/g, '').length === 44);
        setDespesasComNFe(comNFe);
      })
      .catch(console.error)
      .finally(() => setLoadingDespesas(false));
  }, [open, empresaAtiva?.id]);

  const handleSelecionarDespesa = (despesa) => {
    // Tentar recuperar dados do emitente do sessionStorage
    const emit = JSON.parse(sessionStorage.getItem(`nfe_emit_${despesa.numero_documento}`) || 'null');
    setForm(prev => ({
      ...prev,
      nfe_referenciada: despesa.numero_documento,
      destinatario_nome: emit?.nome || despesa.fornecedor_nome || '',
      destinatario_cnpj: emit?.cnpj || '',
      destinatario_ie: emit?.ie || '',
      destinatario_endereco: emit?.logradouro || '',
      destinatario_numero: emit?.numero || '',
      destinatario_bairro: emit?.bairro || '',
      destinatario_cidade: emit?.municipio || '',
      destinatario_uf: emit?.uf || 'SP',
      destinatario_cep: emit?.cep || '',
    }));
  };

  const handleClose = () => {
    setStep(1);
    setNotaEmitida(null);
    setFocusResult(null);
    setForm({
      almoxarifado_id: '',
      destinatario_nome: '', destinatario_cnpj: '', destinatario_ie: '',
      destinatario_email: '', destinatario_endereco: '', destinatario_numero: '',
      destinatario_bairro: '', destinatario_cidade: '', destinatario_uf: 'SP',
      destinatario_cep: '', nfe_referenciada: '', informacoes_adicionais: '', itens: []
    });
    onOpenChange(false);
  };

  const handleSelectMaterial = (materialId) => {
    const material = materiais.find(m => m.id === materialId);
    if (!material) return;
    const saldo = saldos.find(s => s.material_id === materialId);
    setNovoItem(prev => ({
      ...prev,
      material_id: materialId,
      descricao: material.nome || material.descricao || '',
      codigo: material.codigo || '',
      ncm: material.ncm || '',
      unidade: material.unidade || 'UN',
      valor_unitario: saldo?.valor_medio || 0
    }));
  };

  const handleAddItem = () => {
    if (!novoItem.descricao || novoItem.quantidade <= 0) return;
    setForm(prev => ({
      ...prev,
      itens: [...prev.itens, { ...novoItem, id: Date.now().toString() }]
    }));
    setNovoItem({
      material_id: '', descricao: '', codigo: '', ncm: '',
      cfop: '5202', unidade: 'UN', quantidade: 1, valor_unitario: 0
    });
  };

  const handleRemoveItem = (id) => {
    setForm(prev => ({ ...prev, itens: prev.itens.filter(i => i.id !== id) }));
  };

  const totalNota = form.itens.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);

  const handleEmitir = async () => {
    if (!form.destinatario_cnpj || !form.itens.length) return;
    setSaving(true);

    try {
      const almox = almoxarifados.find(a => a.id === form.almoxarifado_id);

      // Salvar rascunho no banco
      const nota = await base44.entities.NotaFiscalDevolucao.create({
        empresa_id: empresaAtiva.id,
        status: 'Enviando',
        almoxarifado_id: form.almoxarifado_id || null,
        almoxarifado_nome: almox?.nome || '',
        destinatario_nome: form.destinatario_nome,
        destinatario_cnpj: form.destinatario_cnpj,
        destinatario_ie: form.destinatario_ie,
        destinatario_email: form.destinatario_email,
        destinatario_endereco: form.destinatario_endereco,
        destinatario_numero: form.destinatario_numero,
        destinatario_bairro: form.destinatario_bairro,
        destinatario_cidade: form.destinatario_cidade,
        destinatario_uf: form.destinatario_uf,
        destinatario_cep: form.destinatario_cep,
        nfe_referenciada: form.nfe_referenciada,
        itens: JSON.stringify(form.itens),
        valor_total: totalNota,
        informacoes_adicionais: form.informacoes_adicionais,
        usuario_nome: user?.full_name || '',
        data_emissao: new Date().toISOString().split('T')[0]
      });

      setNotaEmitida(nota);

      // Emitir via Focus NF-e
      const res = await base44.functions.invoke('emitirNotaDevolucao', {
        action: 'emitir',
        nota_id: nota.id,
        payload: {
          empresa_id: empresaAtiva.id,
          almoxarifado_nome: almox?.nome || '',
          ...form,
          itens: form.itens
        }
      });

      setFocusResult(res.data);
      setStep(4); // Resultado
    } catch (error) {
      console.error('Erro ao emitir:', error);
      alert('Erro ao emitir nota: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConsultar = async () => {
    if (!notaEmitida?.focus_ref) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke('emitirNotaDevolucao', {
        action: 'consultar',
        nota_id: notaEmitida.id,
        payload: { focus_ref: notaEmitida.focus_ref }
      });
      setFocusResult(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const UFs = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col w-full" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-4 z-10 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle className="text-base">Emitir NF-e de Devolução</SheetTitle>
          </SheetHeader>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps indicator */}
        {step <= 3 && (
          <div className="flex border-b">
            {[{ n: 1, label: 'Destinatário' }, { n: 2, label: 'Itens' }, { n: 3, label: 'Revisão' }].map(s => (
              <button
                key={s.n}
                onClick={() => step > s.n && setStep(s.n)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  step === s.n ? 'border-amber-500 text-amber-600' :
                  step > s.n ? 'border-green-500 text-green-600 cursor-pointer' :
                  'border-transparent text-slate-400'
                }`}
              >
                {s.n}. {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* STEP 1: Destinatário */}
          {step === 1 && (
            <>
              {/* Seletor de NF-e das Despesas */}
              {despesasComNFe.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800 mb-2">📎 NF-e das Despesas Financeiras</p>
                  <p className="text-xs text-blue-600 mb-3">Selecione uma nota fiscal importada nas despesas para pré-preencher os dados do destinatário e a chave NF-e referenciada.</p>
                  <select
                    className="w-full border rounded-md p-2 text-sm bg-white border-blue-300"
                    onChange={e => {
                      if (!e.target.value) return;
                      const despesa = despesasComNFe.find(d => d.id === e.target.value);
                      if (despesa) handleSelecionarDespesa(despesa);
                    }}
                    defaultValue=""
                  >
                    <option value="">Selecionar NF-e de uma despesa...</option>
                    {despesasComNFe.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.descricao} — Chave: {d.numero_documento.slice(0, 20)}...
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label>Almoxarifado de origem</Label>
                <Select value={form.almoxarifado_id} onValueChange={v => setForm({ ...form, almoxarifado_id: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {almoxarifados.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t pt-4">
                <p className="font-medium text-slate-700 mb-3">Destinatário (Fornecedor)</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>CNPJ *</Label>
                      <Input value={form.destinatario_cnpj} onChange={e => setForm({ ...form, destinatario_cnpj: e.target.value })} placeholder="00.000.000/0001-00" className="mt-1" />
                    </div>
                    <div>
                      <Label>Inscrição Estadual</Label>
                      <Input value={form.destinatario_ie} onChange={e => setForm({ ...form, destinatario_ie: e.target.value })} placeholder="ISENTO" className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>Razão Social *</Label>
                    <Input value={form.destinatario_nome} onChange={e => setForm({ ...form, destinatario_nome: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input type="email" value={form.destinatario_email} onChange={e => setForm({ ...form, destinatario_email: e.target.value })} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label>Logradouro</Label>
                      <Input value={form.destinatario_endereco} onChange={e => setForm({ ...form, destinatario_endereco: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>Número</Label>
                      <Input value={form.destinatario_numero} onChange={e => setForm({ ...form, destinatario_numero: e.target.value })} className="mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Bairro</Label>
                      <Input value={form.destinatario_bairro} onChange={e => setForm({ ...form, destinatario_bairro: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>Cidade</Label>
                      <Input value={form.destinatario_cidade} onChange={e => setForm({ ...form, destinatario_cidade: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>UF</Label>
                      <Select value={form.destinatario_uf} onValueChange={v => setForm({ ...form, destinatario_uf: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{UFs.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>CEP</Label>
                      <Input value={form.destinatario_cep} onChange={e => setForm({ ...form, destinatario_cep: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>Chave NF-e Original (ref.)</Label>
                      <Input value={form.nfe_referenciada} onChange={e => setForm({ ...form, nfe_referenciada: e.target.value })} placeholder="44 dígitos" className="mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Itens */}
          {step === 2 && (
            <>
              <div className="bg-slate-50 rounded-lg p-4 space-y-3 border">
                <p className="font-medium text-slate-700 text-sm">Adicionar item</p>
                <div>
                  <Label className="text-xs">Material (do estoque)</Label>
                  <Select value={novoItem.material_id} onValueChange={handleSelectMaterial}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Selecionar material..." /></SelectTrigger>
                    <SelectContent>
                      {materiais.map(m => <SelectItem key={m.id} value={m.id}>{m.nome || m.descricao}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Descrição *</Label>
                  <Input value={novoItem.descricao} onChange={e => setNovoItem({ ...novoItem, descricao: e.target.value })} className="mt-1 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">NCM</Label>
                    <Input value={novoItem.ncm} onChange={e => setNovoItem({ ...novoItem, ncm: e.target.value })} placeholder="ex: 3926.90.90" className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">CFOP</Label>
                    <Select value={novoItem.cfop} onValueChange={v => setNovoItem({ ...novoItem, cfop: v })}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CFOP_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Qtd *</Label>
                    <Input type="number" value={novoItem.quantidade} onChange={e => setNovoItem({ ...novoItem, quantidade: parseFloat(e.target.value) || 0 })} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Vlr Unit.</Label>
                    <Input type="number" value={novoItem.valor_unitario} onChange={e => setNovoItem({ ...novoItem, valor_unitario: parseFloat(e.target.value) || 0 })} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Unid.</Label>
                    <Select value={novoItem.unidade} onValueChange={v => setNovoItem({ ...novoItem, unidade: v })}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['UN','KG','M','M2','M3','L','CX','PC','SC','TN'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" onClick={handleAddItem} disabled={!novoItem.descricao || novoItem.quantidade <= 0} className="w-full gap-2">
                  <Plus className="w-4 h-4" /> Adicionar Item
                </Button>
              </div>

              {form.itens.length > 0 && (
                <div className="space-y-2">
                  {form.itens.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.descricao}</p>
                        <p className="text-xs text-slate-500">
                          {item.quantidade} {item.unidade} × R$ {item.valor_unitario.toFixed(2)} = 
                          <span className="font-semibold text-slate-700"> R$ {(item.quantidade * item.valor_unitario).toFixed(2)}</span>
                          {' • '}CFOP {item.cfop}
                          {item.ncm && ` • NCM ${item.ncm}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="ml-2" onClick={() => handleRemoveItem(item.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <div className="text-right font-semibold text-slate-800 pt-2">
                    Total: R$ {totalNota.toFixed(2)}
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 3: Revisão */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1">
                <p className="font-semibold text-blue-800">Destinatário</p>
                <p className="text-sm">{form.destinatario_nome}</p>
                <p className="text-sm text-slate-600">CNPJ: {form.destinatario_cnpj}</p>
                <p className="text-sm text-slate-600">{form.destinatario_cidade}/{form.destinatario_uf}</p>
                {form.nfe_referenciada && <p className="text-xs text-slate-500">NF-e ref: {form.nfe_referenciada}</p>}
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-700">Itens ({form.itens.length})</p>
                {form.itens.map(item => (
                  <div key={item.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <span>{item.descricao} ({item.quantidade} {item.unidade})</span>
                    <span className="font-medium">R$ {(item.quantidade * item.valor_unitario).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t">
                  <span>Total</span>
                  <span>R$ {totalNota.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <Label>Informações adicionais</Label>
                <Textarea
                  value={form.informacoes_adicionais}
                  onChange={e => setForm({ ...form, informacoes_adicionais: e.target.value })}
                  placeholder="Informações complementares da nota..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">⚠️ Esta nota será emitida em <strong>ambiente de homologação</strong> (testes). Para produção, altere a URL na função backend.</p>
              </div>
            </div>
          )}

          {/* STEP 4: Resultado */}
          {step === 4 && (
            <div className="space-y-4">
              {focusResult && (
                <>
                  <div className={`p-4 rounded-lg border ${
                    focusResult.status === 'autorizado' ? 'bg-green-50 border-green-200' :
                    focusResult.status === 'processando_autorizacao' ? 'bg-blue-50 border-blue-200' :
                    'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <FileText className={`w-8 h-8 ${
                        focusResult.status === 'autorizado' ? 'text-green-600' :
                        focusResult.status === 'processando_autorizacao' ? 'text-blue-600' :
                        'text-red-600'
                      }`} />
                      <div>
                        <p className="font-semibold">
                          {focusResult.status === 'autorizado' ? '✅ NF-e Autorizada!' :
                           focusResult.status === 'processando_autorizacao' ? '⏳ Processando...' :
                           '❌ Erro na emissão'}
                        </p>
                        {focusResult.chave_nfe && <p className="text-xs text-slate-600 mt-1 font-mono">{focusResult.chave_nfe}</p>}
                        {focusResult.protocolo && <p className="text-xs text-slate-600">Protocolo: {focusResult.protocolo}</p>}
                      </div>
                    </div>
                  </div>

                  {focusResult.erros && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-700">Erros:</p>
                      <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap">{JSON.stringify(focusResult.erros, null, 2)}</pre>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {focusResult.status === 'processando_autorizacao' && (
                      <Button variant="outline" onClick={handleConsultar} disabled={saving} className="gap-2">
                        <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                        Consultar Status
                      </Button>
                    )}
                    {focusResult.caminho_danfe && (
                      <Button variant="outline" onClick={() => window.open(focusResult.caminho_danfe, '_blank')} className="gap-2">
                        <ExternalLink className="w-4 h-4" /> Ver DANFE
                      </Button>
                    )}
                    {focusResult.caminho_xml_nota_fiscal && (
                      <Button variant="outline" onClick={() => window.open(focusResult.caminho_xml_nota_fiscal, '_blank')} className="gap-2">
                        <ExternalLink className="w-4 h-4" /> Baixar XML
                      </Button>
                    )}
                  </div>
                </>
              )}

              <Badge className={
                focusResult?.status === 'autorizado' ? 'bg-green-100 text-green-700' :
                'bg-blue-100 text-blue-700'
              }>
                {focusResult?.status || 'Processando'}
              </Badge>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t p-4 flex justify-between gap-3">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={() => setStep(2)} disabled={!form.destinatario_cnpj || !form.destinatario_nome}>
                Próximo: Itens →
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>← Voltar</Button>
              <Button onClick={() => setStep(3)} disabled={form.itens.length === 0}>
                Revisar →
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>← Voltar</Button>
              <Button onClick={handleEmitir} disabled={saving} className="bg-green-600 hover:bg-green-700 gap-2">
                <FileText className="w-4 h-4" />
                {saving ? 'Emitindo...' : 'Emitir NF-e'}
              </Button>
            </>
          )}
          {step === 4 && (
            <Button onClick={handleClose} className="w-full">Fechar</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}