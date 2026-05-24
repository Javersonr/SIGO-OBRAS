import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Trash2, X, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AdicionarItensCotacaoModal({ open, onOpenChange, empresaAtiva, onSave }) {
  const [numeroBusca, setNumeroBusca] = useState('');
  const [cotacaoEncontrada, setCotacaoEncontrada] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('manual');

  // Itens manuais
  const [itensManual, setItensManual] = useState([{ descricao: '', quantidade: 1, unidade: 'UN', especificacoes: '' }]);

  // Busca de solicitação
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [solicitacaoSelecionada, setSolicitacaoSelecionada] = useState(null);
  const [itensSolicitacao, setItensSolicitacao] = useState([]);
  const [itensSolSelecionados, setItensSolSelecionados] = useState([]);

  // Copiar de outra cotação
  const [cotacoes, setCotacoes] = useState([]);
  const [cotacaoOrigem, setCotacaoOrigem] = useState(null);
  const [itensCotacaoOrigem, setItensCotacaoOrigem] = useState([]);
  const [itensCotSelecionados, setItensCotSelecionados] = useState([]);

  const buscarCotacao = async () => {
    if (!numeroBusca.trim()) return;
    setBuscando(true);
    try {
      const results = await base44.entities.Cotacao.filter({ empresa_id: empresaAtiva.id, numero: numeroBusca.trim() });
      if (results.length > 0) {
        setCotacaoEncontrada(results[0]);
        // Carregar solicitações e cotações para as outras abas
        const [sols, cots] = await Promise.all([
          base44.entities.SolicitacaoCompra.filter({ empresa_id: empresaAtiva.id }),
          base44.entities.Cotacao.filter({ empresa_id: empresaAtiva.id })
        ]);
        setSolicitacoes(sols.filter(s => s.id !== results[0].solicitacao_id));
        setCotacoes(cots.filter(c => c.id !== results[0].id));
      } else {
        alert('Cotação não encontrada');
        setCotacaoEncontrada(null);
      }
    } catch (e) {
      alert('Erro ao buscar cotação');
    } finally {
      setBuscando(false);
    }
  };

  const selecionarSolicitacao = async (sol) => {
    setSolicitacaoSelecionada(sol);
    const itens = await base44.entities.SolicitacaoCompraItem.filter({ solicitacao_id: sol.id });
    setItensSolicitacao(itens);
    setItensSolSelecionados(itens.map(i => i.id));
  };

  const selecionarCotacaoOrigem = async (cot) => {
    setCotacaoOrigem(cot);
    const itens = await base44.entities.CotacaoItem.filter({ cotacao_id: cot.id });
    setItensCotacaoOrigem(itens);
    setItensCotSelecionados(itens.map(i => i.id));
  };

  const addItemManual = () => {
    setItensManual([...itensManual, { descricao: '', quantidade: 1, unidade: 'UN', especificacoes: '' }]);
  };

  const updateItemManual = (idx, field, value) => {
    const updated = [...itensManual];
    updated[idx] = { ...updated[idx], [field]: value };
    setItensManual(updated);
  };

  const removeItemManual = (idx) => {
    setItensManual(itensManual.filter((_, i) => i !== idx));
  };

  const handleSalvar = async () => {
    if (!cotacaoEncontrada) return;
    setSalvando(true);
    try {
      let itensParaAdicionar = [];

      if (abaAtiva === 'manual') {
        itensParaAdicionar = itensManual.filter(i => i.descricao.trim());
        if (itensParaAdicionar.length === 0) { alert('Adicione pelo menos um item'); setSalvando(false); return; }
        await Promise.all(itensParaAdicionar.map(item =>
          base44.entities.CotacaoItem.create({
            empresa_id: empresaAtiva.id,
            cotacao_id: cotacaoEncontrada.id,
            descricao: item.descricao,
            quantidade: Number(item.quantidade),
            unidade: item.unidade,
            especificacoes: item.especificacoes || ''
          })
        ));
      } else if (abaAtiva === 'solicitacao') {
        if (itensSolSelecionados.length === 0) { alert('Selecione pelo menos um item'); setSalvando(false); return; }
        const selecionados = itensSolicitacao.filter(i => itensSolSelecionados.includes(i.id));
        await Promise.all(selecionados.map(item =>
          base44.entities.CotacaoItem.create({
            empresa_id: empresaAtiva.id,
            cotacao_id: cotacaoEncontrada.id,
            solicitacao_item_id: item.id,
            descricao: item.descricao,
            material_codigo: item.material_codigo || '',
            quantidade: item.quantidade,
            unidade: item.unidade || 'UN',
            especificacoes: item.observacoes || ''
          })
        ));
      } else if (abaAtiva === 'copiar') {
        if (itensCotSelecionados.length === 0) { alert('Selecione pelo menos um item'); setSalvando(false); return; }
        const selecionados = itensCotacaoOrigem.filter(i => itensCotSelecionados.includes(i.id));
        await Promise.all(selecionados.map(item =>
          base44.entities.CotacaoItem.create({
            empresa_id: empresaAtiva.id,
            cotacao_id: cotacaoEncontrada.id,
            descricao: item.descricao,
            material_codigo: item.material_codigo || '',
            quantidade: item.quantidade,
            unidade: item.unidade || 'UN',
            especificacoes: item.especificacoes || ''
          })
        ));
      }

      alert('Itens adicionados com sucesso!');
      onSave();
      handleClose();
    } catch (e) {
      alert('Erro ao adicionar itens');
    } finally {
      setSalvando(false);
    }
  };

  const handleClose = () => {
    setNumeroBusca('');
    setCotacaoEncontrada(null);
    setItensManual([{ descricao: '', quantidade: 1, unidade: 'UN', especificacoes: '' }]);
    setSolicitacaoSelecionada(null);
    setItensSolicitacao([]);
    setItensSolSelecionados([]);
    setCotacaoOrigem(null);
    setItensCotacaoOrigem([]);
    setItensCotSelecionados([]);
    setAbaAtiva('manual');
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="h-full p-0 flex flex-col" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Adicionar Itens a Cotação Existente</SheetTitle>
          </SheetHeader>
          <button onClick={handleClose} className="ml-4 p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Busca por número */}
          <div>
            <Label className="mb-2 block">Número da Cotação</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: COT2026-0001"
                value={numeroBusca}
                onChange={e => setNumeroBusca(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarCotacao()}
                className="flex-1"
              />
              <Button onClick={buscarCotacao} disabled={buscando}>
                <Search className="w-4 h-4 mr-2" />
                {buscando ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>

          {cotacaoEncontrada && (
            <>
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-4">
                  <p className="font-semibold text-blue-800">{cotacaoEncontrada.numero}</p>
                  <p className="text-sm text-blue-600">{cotacaoEncontrada.projeto_nome || 'Sem projeto'}</p>
                  <Badge className="mt-1">{cotacaoEncontrada.status}</Badge>
                </CardContent>
              </Card>

              <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
                <TabsList>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                  <TabsTrigger value="solicitacao">De Solicitação</TabsTrigger>
                  <TabsTrigger value="copiar">Copiar de Cotação</TabsTrigger>
                </TabsList>

                {/* Manual */}
                <TabsContent value="manual" className="space-y-3 mt-4">
                  {itensManual.map((item, idx) => (
                    <Card key={idx}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <span className="text-sm text-slate-500 mt-2 w-6 flex-shrink-0">{idx + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <Input
                              placeholder="Descrição do item *"
                              value={item.descricao}
                              onChange={e => updateItemManual(idx, 'descricao', e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                placeholder="Qtd"
                                value={item.quantidade}
                                onChange={e => updateItemManual(idx, 'quantidade', e.target.value)}
                                className="w-24"
                              />
                              <Input
                                placeholder="Un"
                                value={item.unidade}
                                onChange={e => updateItemManual(idx, 'unidade', e.target.value)}
                                className="w-20"
                              />
                              <Input
                                placeholder="Especificações"
                                value={item.especificacoes}
                                onChange={e => updateItemManual(idx, 'especificacoes', e.target.value)}
                                className="flex-1"
                              />
                            </div>
                          </div>
                          {itensManual.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeItemManual(idx)} className="text-red-500 mt-1">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button variant="outline" onClick={addItemManual} className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Adicionar Item
                  </Button>
                </TabsContent>

                {/* De Solicitação */}
                <TabsContent value="solicitacao" className="space-y-3 mt-4">
                  {!solicitacaoSelecionada ? (
                    <div className="space-y-2">
                      <Label>Selecione uma Solicitação</Label>
                      {solicitacoes.map(sol => (
                        <button key={sol.id} onClick={() => selecionarSolicitacao(sol)}
                          className="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
                          <p className="font-medium text-sm">{sol.numero}</p>
                          <p className="text-xs text-slate-500">{sol.projeto_nome || 'Sem projeto'} • {sol.status}</p>
                        </button>
                      ))}
                      {solicitacoes.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Nenhuma solicitação disponível</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{solicitacaoSelecionada.numero}</p>
                        <Button variant="ghost" size="sm" onClick={() => { setSolicitacaoSelecionada(null); setItensSolicitacao([]); setItensSolSelecionados([]); }}>
                          Trocar
                        </Button>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <Button variant="outline" size="sm" onClick={() => setItensSolSelecionados(itensSolicitacao.map(i => i.id))}>Selecionar Todos</Button>
                        <Button variant="outline" size="sm" onClick={() => setItensSolSelecionados([])}>Limpar</Button>
                      </div>
                      {itensSolicitacao.map(item => (
                        <div key={item.id} onClick={() => setItensSolSelecionados(prev =>
                          prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]
                        )}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${itensSolSelecionados.includes(item.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex items-center gap-2">
                            {itensSolSelecionados.includes(item.id) && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.descricao}</p>
                              <p className="text-xs text-slate-500">{item.quantidade} {item.unidade}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Copiar de Cotação */}
                <TabsContent value="copiar" className="space-y-3 mt-4">
                  {!cotacaoOrigem ? (
                    <div className="space-y-2">
                      <Label>Selecione uma Cotação de Origem</Label>
                      {cotacoes.map(cot => (
                        <button key={cot.id} onClick={() => selecionarCotacaoOrigem(cot)}
                          className="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
                          <p className="font-medium text-sm">{cot.numero}</p>
                          <p className="text-xs text-slate-500">{cot.projeto_nome || 'Sem projeto'} • {cot.status}</p>
                        </button>
                      ))}
                      {cotacoes.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Nenhuma cotação disponível</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{cotacaoOrigem.numero}</p>
                        <Button variant="ghost" size="sm" onClick={() => { setCotacaoOrigem(null); setItensCotacaoOrigem([]); setItensCotSelecionados([]); }}>
                          Trocar
                        </Button>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <Button variant="outline" size="sm" onClick={() => setItensCotSelecionados(itensCotacaoOrigem.map(i => i.id))}>Selecionar Todos</Button>
                        <Button variant="outline" size="sm" onClick={() => setItensCotSelecionados([])}>Limpar</Button>
                      </div>
                      {itensCotacaoOrigem.map(item => (
                        <div key={item.id} onClick={() => setItensCotSelecionados(prev =>
                          prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]
                        )}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${itensCotSelecionados.includes(item.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex items-center gap-2">
                            {itensCotSelecionados.includes(item.id) && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.descricao}</p>
                              <p className="text-xs text-slate-500">{item.quantidade} {item.unidade}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!cotacaoEncontrada || salvando} className="bg-blue-600 hover:bg-blue-700">
            {salvando ? 'Salvando...' : 'Adicionar Itens'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}