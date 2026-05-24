import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet';
import { Trash2, ShieldCheck, ChevronDown, Eye, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

export default function SelecionarFerramentasModal({ open, onClose, onConfirm, empresaAtiva, tipo = 'EPI', ferramentasJaSelecionadas = [] }) {
  const [allFerramentas, setAllFerramentas] = useState([]);
  const [selectedFerramentas, setSelectedFerramentas] = useState(ferramentasJaSelecionadas);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [searchFieldIndex, setSearchFieldIndex] = useState(null);

  useEffect(() => {
    if (open && empresaAtiva) {
      loadFerramentas();
      setSelectedFerramentas(ferramentasJaSelecionadas);
    }
  }, [open, empresaAtiva, ferramentasJaSelecionadas]);

  const loadFerramentas = async () => {
    setLoading(true);
    try {
      const result = await base44.entities.Ferramenta.filter({ 
        empresa_id: empresaAtiva.id,
        tipo: tipo,
        ativo: true
      });
      setAllFerramentas(result);
    } catch (error) {
      console.error('Erro ao carregar ferramentas:', error);
      toast.error('Erro ao carregar ferramentas');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchFerramenta = (value, rowIndex) => {
    setSearchTerm(value);
    setSearchFieldIndex(rowIndex);
    if (value.trim()) {
      const filtered = allFerramentas.filter(ferr =>
        ferr.descricao?.toLowerCase().includes(value.toLowerCase()) ||
        ferr.codigo?.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectFerramenta = (ferramenta, rowIndex) => {
    if (editingIndex !== null) {
      // Editando uma linha existente
      const updated = [...selectedFerramentas];
      updated[editingIndex] = {
        ...updated[editingIndex],
        id: ferramenta.id,
        descricao: ferramenta.descricao || '',
        codigo: ferramenta.codigo || '',
        tipo: ferramenta.tipo || '',
        unidade: ferramenta.unidade || 'UN',
        valor_aquisicao: ferramenta.valor_aquisicao || 0,
        quantidade_estoque: ferramenta.quantidade_estoque || 0,
        localizacao: ferramenta.localizacao || '',
        status: ferramenta.status || 'Disponível'
      };
      setSelectedFerramentas(updated);
      setEditingIndex(null);
    }
    setSearchTerm('');
    setShowSuggestions(false);
    setSearchFieldIndex(null);
  };

  const handleRemoveFerramenta = (index) => {
    setSelectedFerramentas(selectedFerramentas.filter((_, i) => i !== index));
    toast.success(`${tipo} removido da lista`);
  };

  const handleEditRow = (index) => {
    setEditingIndex(index);
    setEditingData(selectedFerramentas[index]);
  };

  const handleSaveEdit = () => {
    const updated = [...selectedFerramentas];
    updated[editingIndex] = editingData;
    setSelectedFerramentas(updated);
    setEditingIndex(null);
    toast.success(`${tipo} atualizado`);
  };

  const handleAddRow = () => {
    setSelectedFerramentas([...selectedFerramentas, {
      id: '',
      descricao: '',
      codigo: '',
      tipo: tipo,
      unidade: 'UN',
      valor_aquisicao: 0,
      quantidade: 1,
      quantidade_estoque: 0,
      localizacao: '',
      status: 'Disponível'
    }]);
  };

  const handleConfirm = () => {
    const hasValidRows = selectedFerramentas.every(f => f.descricao && f.descricao.trim());
    if (!hasValidRows) {
      toast.error('Todos os itens devem ter uma descrição');
      return;
    }
    onConfirm(selectedFerramentas);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col" style={{ inset: 'auto 0 0 256px', width: 'calc(100% - 256px)', maxWidth: 'none' }}>
        <SheetHeader className="p-6 border-b sticky top-0 bg-white z-20">
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            Selecionador de {tipo}s
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Busca */}
          <div className="p-4 border-b bg-slate-50">
            <Label className="text-xs text-slate-700 mb-2 block">Buscar {tipo}</Label>
            <div className="relative">
              <Input
                placeholder={`Buscar por descrição ou código...`}
                value={searchTerm}
                onChange={(e) => handleSearchFerramenta(e.target.value, -1)}
                onFocus={() => searchTerm && setShowSuggestions(true)}
                className="text-sm"
              />
              {showSuggestions && searchFieldIndex === -1 && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 border rounded bg-white shadow-lg z-30 max-h-56 overflow-y-auto">
                  {filteredSuggestions.map((ferr) => (
                    <button
                      key={ferr.id}
                      onClick={() => {
                        setSelectedFerramentas([...selectedFerramentas, {
                          id: ferr.id,
                          descricao: ferr.descricao || '',
                          codigo: ferr.codigo || '',
                          tipo: ferr.tipo || '',
                          unidade: ferr.unidade || 'UN',
                          valor_aquisicao: ferr.valor_aquisicao || 0,
                          quantidade_estoque: ferr.quantidade_estoque || 0,
                          localizacao: ferr.localizacao || '',
                          status: ferr.status || 'Disponível',
                          quantidade: 1
                        }]);
                        setSearchTerm('');
                        setShowSuggestions(false);
                        toast.success(`${tipo} adicionado`);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b last:border-b-0 flex justify-between items-center text-xs"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{ferr.descricao}</p>
                        <p className="text-xs text-slate-500">Código: {ferr.codigo} | Estoque: {ferr.quantidade_estoque} | R$ {(ferr.valor_aquisicao || 0).toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

           {/* Tabela de Seleção */}
           <div className="border-b">
             <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 w-8"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 min-w-[200px]">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 w-16">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 w-20">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 w-16">Unidade</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 w-24">Preço Ref.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-700 w-16">Estoque</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 w-20">Localização</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-700 w-16">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 w-16">Qtd</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-700 w-16">Ações</th>
                </tr>
              </thead>
              <tbody>
                {selectedFerramentas.map((ferramenta, index) => (
                  <tr key={index} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2">
                      <Checkbox checked={true} />
                    </td>
                    {editingIndex === index ? (
                      <>
                        <td className="px-4 py-2 relative">
                          <div className="relative">
                            <Input
                              value={editingData.descricao || ''}
                              onChange={(e) => {
                                setEditingData({ ...editingData, descricao: e.target.value });
                                handleSearchFerramenta(e.target.value, index);
                              }}
                              placeholder="Buscar..."
                              className="h-7 text-xs"
                              autoFocus
                            />
                            {showSuggestions && searchFieldIndex === index && filteredSuggestions.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 border rounded bg-white shadow-lg z-30 max-h-40 overflow-y-auto">
                                {filteredSuggestions.map((ferr) => (
                                  <button
                                    key={ferr.id}
                                    onClick={() => handleSelectFerramenta(ferr, index)}
                                    className="w-full text-left px-2 py-1 hover:bg-amber-50 text-xs border-b last:border-b-0"
                                  >
                                    <p className="font-medium text-slate-800">{ferr.descricao}</p>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600">{editingData.tipo || tipo}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">{editingData.codigo || '-'}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">{editingData.unidade || 'UN'}</td>
                        <td className="px-4 py-2 text-right text-xs text-slate-600">R$ {(editingData.valor_aquisicao || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-xs text-slate-600">{editingData.quantidade_estoque || 0}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">{editingData.localizacao || '-'}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Ativo</span>
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="1"
                            value={editingData.quantidade || 1}
                            onChange={(e) => setEditingData({ ...editingData, quantidade: parseInt(e.target.value) || 1 })}
                            className="h-7 text-xs text-center w-12"
                          />
                        </td>
                        <td className="px-4 py-2 flex gap-1 justify-center">
                          <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-6 w-6 p-0 text-green-600 hover:bg-green-50">
                            ✓
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)} className="h-6 w-6 p-0 text-slate-400 hover:bg-slate-100">
                            ✕
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-xs font-medium text-slate-900">{ferramenta.descricao || '-'}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">{ferramenta.tipo || tipo}</td>
                        <td className="px-4 py-2 text-xs text-slate-600 text-center">{ferramenta.codigo || '-'}</td>
                        <td className="px-4 py-2 text-xs text-slate-600 text-center">{ferramenta.unidade || 'UN'}</td>
                        <td className="px-4 py-2 text-right text-xs text-slate-600">R$ {(ferramenta.valor_aquisicao || 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-xs text-slate-600">{ferramenta.quantidade_estoque || 0}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">{ferramenta.localizacao || '-'}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Ativo</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-center font-medium text-slate-700">{ferramenta.quantidade || 1}</td>
                        <td className="px-4 py-2 flex gap-1 justify-center">
                          <Button size="sm" variant="ghost" onClick={() => handleEditRow(index)} className="h-6 w-6 p-0 text-slate-500 hover:bg-slate-100">
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRemoveFerramenta(index)} className="h-6 w-6 p-0 text-red-500 hover:bg-red-50">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedFerramentas.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">
              Nenhum {tipo} selecionado ainda
            </div>
          )}
        </div>

        <SheetFooter className="p-4 border-t bg-white flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} size="sm">
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedFerramentas.length === 0}
            className="bg-amber-500 hover:bg-amber-600"
            size="sm"
          >
            Confirmar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}