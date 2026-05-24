import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, Truck, Loader2, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, Minus, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function SolicitarEntregaCaminhaoModal({ open, onOpenChange, empresaAtiva, user, onSuccess }) {
  const [step, setStep] = useState(1);
  const [caminhaos, setCaminhaos] = useState([]);
  const [caminhaoSelecionado, setCaminhaoSelecionado] = useState(null);
  const [buscaCaminhao, setBuscaCaminhao] = useState('');
  const [ferramentasObrigatorias, setFerramentasObrigatorias] = useState([]); // {descricao, ferramenta_id, obrigatorio, vinculado: null|{id,descricao,...}}
  const [todasFerramentas, setTodasFerramentas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [itemAberto, setItemAberto] = useState(null); // idx do item com busca aberta
  const [buscas, setBuscas] = useState({}); // { [idx]: string }

  useEffect(() => {
    if (open && empresaAtiva?.id) loadCaminhaos();
  }, [open, empresaAtiva?.id]);

  useEffect(() => {
    if (caminhaoSelecionado && step === 2) loadItens();
  }, [caminhaoSelecionado, step]);

  const loadCaminhaos = async () => {
    try {
      const cams = await base44.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true });
      setCaminhaos(cams);
    } catch {
      toast.error('Erro ao carregar caminhões');
    }
  };

  const loadItens = async () => {
    setCarregandoItens(true);
    try {
      const [ferr, obrig] = await Promise.all([
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.CaminhaoCampoObrigatorio.filter({ caminhao_id: caminhaoSelecionado.id }),
      ]);
      setTodasFerramentas(ferr);

      // Montar lista de ferramentas obrigatórias
      const lista = [];
      const vistas = new Set();
      for (const campo of obrig) {
        let ids = [];
        try { ids = JSON.parse(campo.ferramenta_ids || '[]'); } catch {}
        for (const fid of ids) {
          if (vistas.has(fid)) continue;
          vistas.add(fid);
          const f = ferr.find(x => x.id === fid);
          lista.push({
            ferramenta_id: fid,
            descricao: f?.descricao || `ID: ${fid}`,
            tipo: f?.tipo || 'Ferramenta',
            obrigatorio: true,
            vinculado: null,
            quantidade: 1,
          });
        }
      }
      setFerramentasObrigatorias(lista);
    } catch {
      toast.error('Erro ao carregar itens');
    } finally {
      setCarregandoItens(false);
    }
  };

  const toggleItem = (idx) => {
    setItemAberto(prev => prev === idx ? null : idx);
    if (!buscas[idx]) {
      setBuscas(prev => ({ ...prev, [idx]: ferramentasObrigatorias[idx]?.descricao?.split(' ').slice(0, 3).join(' ') || '' }));
    }
  };

  const vincular = (idx, ferramenta) => {
    setFerramentasObrigatorias(prev =>
      prev.map((item, i) => i === idx ? { ...item, vinculado: ferramenta } : item)
    );
    setItemAberto(null);
  };

  const desvincular = (idx) => {
    setFerramentasObrigatorias(prev =>
      prev.map((item, i) => i === idx ? { ...item, vinculado: null } : item)
    );
  };

  const getDisponiveisParaItem = (idx) => {
    const item = ferramentasObrigatorias[idx];
    const busca = (buscas[idx] || '').toLowerCase();
    const descricaoExata = item?.descricao?.toLowerCase() || '';
    return todasFerramentas.filter(f => {
      const descricao = f.descricao?.toLowerCase() || '';
      // Filtra apenas ferramentas com descricao exatamente igual ao item obrigatório
      const matchNome = descricao === descricaoExata;
      // Refinamento extra pelo campo de busca (serie, codigo)
      const matchBusca = !busca || descricao.includes(busca) || f.codigo?.toLowerCase().includes(busca) || f.numero_serie?.toLowerCase().includes(busca);
      return matchNome && matchBusca;
    });
  };

  const handleSubmit = async () => {
    const itens = ferramentasObrigatorias.map(item => ({
      ferramenta_id: item.vinculado?.id || item.ferramenta_id,
      descricao: item.vinculado?.descricao || item.descricao,
      numero_serie: item.vinculado?.numero_serie || '',
      tipo: item.vinculado?.tipo || item.tipo,
      quantidade: item.quantidade,
      obrigatorio: item.obrigatorio,
    }));

    if (!caminhaoSelecionado || itens.length === 0) {
      toast.error('Selecione um caminhão e pelo menos um item');
      return;
    }

    setLoading(true);
    try {
      await base44.entities.EntregaFerramental.create({
        empresa_id: empresaAtiva.id,
        tipo_destinatario: 'Caminhão',
        caminhao_id: caminhaoSelecionado.id,
        caminhao_placa: caminhaoSelecionado.placa,
        caminhao_modelo: caminhaoSelecionado.modelo,
        status: 'Pendente',
        tipo: 'Ferramentas',
        itens: JSON.stringify(itens),
        solicitante_nome: user?.full_name || '',
        solicitante_email: user?.email || '',
        data_solicitacao: format(new Date(), 'yyyy-MM-dd'),
        observacoes,
      });
      toast.success('Solicitação criada com sucesso!');
      onSuccess?.();
      resetForm();
    } catch {
      toast.error('Erro ao criar solicitação');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setCaminhaoSelecionado(null);
    setBuscaCaminhao('');
    setFerramentasObrigatorias([]);
    setObservacoes('');
    setItemAberto(null);
    setBuscas({});
  };

  const caminhaofiltrados = caminhaos.filter(c =>
    !buscaCaminhao ||
    c.placa?.toLowerCase().includes(buscaCaminhao.toLowerCase()) ||
    c.modelo?.toLowerCase().includes(buscaCaminhao.toLowerCase())
  );

  const totalVinculados = ferramentasObrigatorias.filter(i => i.vinculado).length;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <SheetContent side="right" className="w-full h-full overflow-y-auto p-0" data-fullscreen-modal>
        <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-white z-10">
          <SheetTitle>Solicitar Entrega para Caminhão</SheetTitle>
          {step === 2 && caminhaoSelecionado && (
            <div className="flex items-center gap-2 mt-1">
              <Truck className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">{caminhaoSelecionado.placa}</span>
              {caminhaoSelecionado.modelo && <span className="text-sm text-slate-500">— {caminhaoSelecionado.modelo}</span>}
              <button onClick={() => setStep(1)} className="ml-auto text-xs text-blue-600 underline">Trocar</button>
            </div>
          )}
        </SheetHeader>

        <div className="p-6 space-y-5">
          {step === 1 ? (
            <>
              <label className="text-sm font-semibold text-slate-700 block mb-3">Selecione o Caminhão</label>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por placa ou modelo..."
                  value={buscaCaminhao}
                  onChange={e => setBuscaCaminhao(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {caminhaofiltrados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setCaminhaoSelecionado(c); setStep(2); }}
                    className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all text-left"
                  >
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Truck className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{c.placa}</p>
                      <p className="text-sm text-slate-500">{c.modelo || 'Sem modelo'}</p>
                    </div>
                  </button>
                ))}
                {caminhaofiltrados.length === 0 && (
                  <p className="text-center text-slate-400 py-8">Nenhum caminhão encontrado</p>
                )}
              </div>
            </>
          ) : (
            <>
              {carregandoItens ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mr-2" />
                  <span className="text-slate-500">Carregando ferramentas obrigatórias...</span>
                </div>
              ) : ferramentasObrigatorias.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma ferramenta obrigatória cadastrada para este caminhão.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">
                      Ferramentas Obrigatórias ({ferramentasObrigatorias.length})
                    </p>
                    <Badge className={totalVinculados === ferramentasObrigatorias.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                      {totalVinculados}/{ferramentasObrigatorias.length} vinculadas
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {ferramentasObrigatorias.map((item, idx) => {
                      const aberto = itemAberto === idx;
                      const disponiveis = getDisponiveisParaItem(idx);
                      return (
                        <div key={idx} className={`border rounded-lg overflow-hidden transition-all ${item.vinculado ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
                          {/* Header do item */}
                          <div
                            className="flex items-center gap-3 p-3 cursor-pointer"
                            onClick={() => toggleItem(idx)}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.vinculado ? 'bg-green-200' : 'bg-slate-100'}`}>
                              {item.vinculado
                                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                : <Search className="w-4 h-4 text-slate-400" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{item.descricao}</p>
                              {item.vinculado ? (
                                <p className="text-xs text-green-700 truncate">
                                  ✓ {item.vinculado.descricao}
                                  {item.vinculado.numero_serie && ` · Série: ${item.vinculado.numero_serie}`}
                                  {item.vinculado.codigo && ` · ${item.vinculado.codigo}`}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400">Clique para buscar no estoque</p>
                              )}
                              {/* Indicador de laudo */}
                              {(() => {
                                const fonte = item.vinculado || todasFerramentas.find(f => f.id === item.ferramenta_id);
                                if (!fonte) return null;
                                const temLaudo = fonte.laudo_url || fonte.numero_laudo;
                                const laudoVencido = fonte.data_vencimento_laudo && new Date(fonte.data_vencimento_laudo) < new Date();
                                return (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    !temLaudo ? 'bg-red-100 text-red-600' :
                                    laudoVencido ? 'bg-amber-100 text-amber-700' :
                                    'bg-green-100 text-green-700'
                                  }`}>
                                    {!temLaudo ? '⚠ Sem laudo' : laudoVencido ? '⚠ Laudo vencido' : '✓ Laudo OK'}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {item.vinculado && (
                                <button
                                  onClick={e => { e.stopPropagation(); desvincular(idx); }}
                                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:bg-red-50"
                                >
                                  Remover
                                </button>
                              )}
                              {aberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {/* Quantidade */}
                          <div className="flex items-center gap-2 px-3 pb-2" onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-slate-500">Quantidade:</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setFerramentasObrigatorias(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: Math.max(1, it.quantidade - 1) } : it))}
                                disabled={item.quantidade <= 1}
                                className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-30"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantidade}
                                onChange={e => setFerramentasObrigatorias(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: parseInt(e.target.value) || 1 } : it))}
                                className="w-12 text-center text-sm border border-slate-300 rounded px-1 py-0.5"
                              />
                              <button
                                onClick={() => setFerramentasObrigatorias(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: it.quantidade + 1 } : it))}
                                className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-100"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Busca inline */}
                          {aberto && (
                            <div className="border-t border-slate-200 bg-slate-50 p-3" onClick={e => e.stopPropagation()}>
                              <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                  type="text"
                                  placeholder="Buscar por descrição, código ou série..."
                                  value={buscas[idx] || ''}
                                  onChange={e => setBuscas(prev => ({ ...prev, [idx]: e.target.value }))}
                                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {disponiveis.length === 0 ? (
                                  <p className="text-xs text-slate-400 text-center py-3">Nenhum item encontrado</p>
                                ) : disponiveis.map(f => (
                                  <button
                                    key={f.id}
                                    onClick={() => vincular(idx, f)}
                                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-white hover:border-slate-300 border border-transparent text-left text-xs transition-all"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-800 truncate">{f.descricao}</p>
                                      <div className="flex gap-2 text-slate-400 mt-0.5">
                                        {f.codigo && <span>Cód: {f.codigo}</span>}
                                        {f.numero_serie && <span>Série: {f.numero_serie}</span>}
                                        {f.status && (
                                          <span className={f.status === 'Disponível' ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                                            {f.status}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <CheckCircle2 className="w-4 h-4 text-slate-300 flex-shrink-0" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Observações (opcional)</label>
                    <textarea
                      value={observacoes}
                      onChange={e => setObservacoes(e.target.value)}
                      placeholder="Adicione observações sobre a solicitação..."
                      className="w-full p-3 border border-slate-300 rounded-lg text-sm"
                      rows="3"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                      Voltar
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || ferramentasObrigatorias.length === 0}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {loading ? 'Criando...' : 'Criar Solicitação'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}