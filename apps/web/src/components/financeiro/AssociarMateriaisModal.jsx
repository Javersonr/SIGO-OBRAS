import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Plus, ChevronDown, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Componente de busca inline que NÃO usa portal/popover para evitar abrir fora do modal
function BuscaMaterialInline({ materiais, value, onChange, onCriar }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selected = materiais.find(m => m.id === value);

  const filtrados = materiais
    .filter(m => !search || m.nome?.toLowerCase().includes(search.toLowerCase()) || m.codigo?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative mt-1.5" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-white text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? `${selected.nome}${selected.codigo ? ` (${selected.codigo})` : ''}` : 'Selecione o material...'}
        </span>
        <div className="flex items-center gap-1">
          {value && <X className="w-3 h-3 text-slate-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); onChange(''); }} />}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 flex flex-col">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="Buscar material..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-sm"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtrados.length === 0 && <p className="text-sm text-slate-400 p-3 text-center">Nenhum material encontrado</p>}
            {filtrados.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onChange(m.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${value === m.id ? 'bg-blue-50 text-blue-700' : ''}`}
              >
                <span>{m.nome}</span>
                {m.codigo && <span className="text-xs text-slate-400 ml-2 shrink-0">{m.codigo}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onCriar} className="mt-2 w-full">
        <Plus className="w-4 h-4 mr-2" /> Criar Novo Material
      </Button>
    </div>
  );
}

export default function AssociarMateriaisModal({ 
  open, 
  onOpenChange, 
  itensNota, 
  empresaAtiva,
  onConfirm 
}) {
  const [materiais, setMateriais] = useState([]);
  const [associacoes, setAssociacoes] = useState({});

  const [criandoMaterial, setCriandoMaterial] = useState(null);
  const [novoMaterial, setNovoMaterial] = useState({
    nome: '',
    codigo: '',
    unidade: 'UN',
    categoria: '',
    preco: 0
  });

  React.useEffect(() => {
    if (open && empresaAtiva) {
      loadMateriais();
    }
  }, [open, empresaAtiva]);

  const loadMateriais = async () => {
    const mats = await base44.entities.Material.filter({ 
      empresa_id: empresaAtiva.id, 
      ativo: true 
    });
    setMateriais(mats);

    // Auto-match por código exato ou nome similar
    const autoAssoc = {};
    itensNota.forEach((item, index) => {
      // 1. Tentar match por código exato
      const porCodigo = item.codigo && mats.find(m => 
        m.codigo && m.codigo.toLowerCase().trim() === item.codigo.toLowerCase().trim()
      );
      if (porCodigo) { autoAssoc[index] = porCodigo.id; return; }

      // 2. Tentar match por nome (contains)
      const descNorm = item.descricao?.toLowerCase().trim() || '';
      const porNome = mats.find(m => {
        const nomeNorm = m.nome?.toLowerCase().trim() || '';
        return nomeNorm && descNorm && (nomeNorm === descNorm || descNorm.includes(nomeNorm) || nomeNorm.includes(descNorm));
      });
      if (porNome) autoAssoc[index] = porNome.id;
    });
    if (Object.keys(autoAssoc).length > 0) setAssociacoes(autoAssoc);
  };

  const handleAssociar = (indexItem, materialId) => {
    setAssociacoes(prev => ({
      ...prev,
      [indexItem]: materialId
    }));
  };

  const handleCriarMaterial = async () => {
    if (!novoMaterial.nome) return;

    try {
      const materialCriado = await base44.entities.Material.create({
        empresa_id: empresaAtiva.id,
        nome: novoMaterial.nome,
        codigo: novoMaterial.codigo,
        unidade: novoMaterial.unidade,
        categoria: novoMaterial.categoria,
        preco: parseFloat(novoMaterial.preco) || 0,
        estoque: 0,
        ativo: true
      });

      // Atualizar lista de materiais
      setMateriais(prev => [...prev, materialCriado]);
      
      // Associar automaticamente com o item da nota
      if (criandoMaterial !== null) {
        handleAssociar(criandoMaterial, materialCriado.id);
      }

      // Resetar form
      setNovoMaterial({
        nome: '',
        codigo: '',
        unidade: 'UN',
        categoria: '',
        preco: 0
      });
      setCriandoMaterial(null);
    } catch (error) {
      console.error('Erro ao criar material:', error);
      alert('Erro ao criar material');
    }
  };

  const handleConfirmar = () => {
    const itensAssociados = itensNota.map((item, index) => ({
      ...item,
      material_id: associacoes[index] || null,
      material_nome: associacoes[index] ? materiais.find(m => m.id === associacoes[index])?.nome : null
    }));
    onConfirm(itensAssociados);
    onOpenChange(false);
  };

  const todosAssociados = true; // Permitir confirmar mesmo sem associar todos

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-4xl overflow-y-auto" style={{ left: '256px', right: 0, width: 'calc(100% - 256px)', maxWidth: 'none' }}>
        <SheetHeader>
          <SheetTitle>Associar Materiais da Nota Fiscal</SheetTitle>
          <p className="text-sm text-slate-500">
            Associe cada item da nota fiscal com os materiais do seu estoque
          </p>
        </SheetHeader>

        <div className="space-y-4 py-6">
          {itensNota.map((item, index) => {
            const materialAssociado = materiais.find(m => m.id === associacoes[index]);
            
            return (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">Item {index + 1}</Badge>
                      {associacoes[index] && (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <h4 className="font-medium text-slate-800">{item.descricao}</h4>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-sm text-slate-600">
                      <div>
                        <span className="text-xs text-slate-500">Código:</span>
                        <p className="font-medium">{item.codigo || '-'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Unidade:</span>
                        <p className="font-medium">{item.unidade}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Quantidade:</span>
                        <p className="font-medium">{item.quantidade}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Valor Unit.:</span>
                        <p className="font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Associar com Material do Sistema</Label>
                  
                  {criandoMaterial === index ? (
                    <div className="border rounded-lg p-4 bg-blue-50 space-y-3 mt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Criar Novo Material</Label>
                        <Button variant="ghost" size="sm" onClick={() => setCriandoMaterial(null)}>Cancelar</Button>
                      </div>
                      <div>
                        <Label className="text-xs">Nome *</Label>
                        <Input value={novoMaterial.nome} onChange={(e) => setNovoMaterial({ ...novoMaterial, nome: e.target.value })} placeholder={item.descricao} className="mt-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Código</Label>
                          <Input value={novoMaterial.codigo} onChange={(e) => setNovoMaterial({ ...novoMaterial, codigo: e.target.value })} placeholder={item.codigo} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Unidade</Label>
                          <Input value={novoMaterial.unidade} onChange={(e) => setNovoMaterial({ ...novoMaterial, unidade: e.target.value })} placeholder={item.unidade} className="mt-1" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Categoria</Label>
                          <Input value={novoMaterial.categoria} onChange={(e) => setNovoMaterial({ ...novoMaterial, categoria: e.target.value })} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Preço</Label>
                          <Input type="number" value={novoMaterial.preco} onChange={(e) => setNovoMaterial({ ...novoMaterial, preco: e.target.value })} className="mt-1" step="0.01" />
                        </div>
                      </div>
                      <Button onClick={handleCriarMaterial} disabled={!novoMaterial.nome} className="w-full bg-green-600 hover:bg-green-700" size="sm">Criar e Associar</Button>
                    </div>
                  ) : (
                    <BuscaMaterialInline
                      materiais={materiais}
                      value={associacoes[index] || ''}
                      onChange={(v) => handleAssociar(index, v)}
                      onCriar={() => {
                        setNovoMaterial({ nome: item.descricao, codigo: item.codigo || '', unidade: item.unidade, categoria: '', preco: item.valor_unitario });
                        setCriandoMaterial(index);
                      }}
                    />
                  )}
                  
                  {materialAssociado && criandoMaterial !== index && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                      <p className="text-sm text-green-800">
                        ✓ Associado com: <strong>{materialAssociado.nome}</strong>
                        {materialAssociado.codigo && ` (${materialAssociado.codigo})`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center border-t pt-4">
          <div className="text-sm text-slate-600">
            {Object.keys(associacoes).length} de {itensNota.length} itens associados
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmar}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirmar ({Object.keys(associacoes).length}/{itensNota.length} associados)
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}