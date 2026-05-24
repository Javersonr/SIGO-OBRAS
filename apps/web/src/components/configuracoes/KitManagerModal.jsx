import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function KitManagerModal({ open, onOpenChange, empresaId }) {
  const [kits, setKits] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [editandoKit, setEditandoKit] = useState(null);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [itens, setItens] = useState([]);
  const [materialSelecionado, setMaterialSelecionado] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  useEffect(() => {
    if (open) {
      carregarDados();
    }
  }, [open, empresaId]);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [kitsData, materiaisData] = await Promise.all([
        base44.entities.Kit.filter({ empresa_id: empresaId, ativo: true }),
        base44.entities.Material.filter({ empresa_id: empresaId, ativo: true })
      ]);
      setKits(kitsData || []);
      setMateriais(materiaisData || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setCarregando(false);
    }
  };

  const handleNovoKit = () => {
    setEditandoKit(null);
    setNome('');
    setCodigo('');
    setDescricao('');
    setItens([]);
  };

  const handleEditarKit = async (kit) => {
    setEditandoKit(kit);
    setNome(kit.nome);
    setCodigo(kit.codigo || '');
    setDescricao(kit.descricao || '');
    try {
      const itemsData = await base44.entities.KitItem.filter({ kit_id: kit.id });
      setItens(itemsData || []);
    } catch (err) {
      console.error('Erro ao carregar itens:', err);
    }
  };

  const handleAdicionarMaterial = () => {
    if (!materialSelecionado || !quantidade) return;
    const material = materiais.find(m => m.id === materialSelecionado);
    if (!material) return;

    const novoItem = {
      id: 'new_' + Date.now(),
      material_id: material.id,
      material_nome: material.nome,
      material_codigo: material.codigo,
      material_unidade: material.unidade,
      quantidade: parseFloat(quantidade),
      preco_unitario: material.preco || 0
    };

    setItens([...itens, novoItem]);
    setMaterialSelecionado('');
    setQuantidade('1');
  };

  const handleRemoverMaterial = (index) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  const handleSalvarKit = async () => {
    if (!nome || itens.length === 0) {
      alert('Preencha o nome e adicione pelo menos um material');
      return;
    }

    try {
      setCarregando(true);
      let kitId = editandoKit?.id;

      if (!kitId) {
        const novoKit = await base44.entities.Kit.create({
          empresa_id: empresaId,
          nome,
          codigo,
          descricao,
          total_itens: itens.length,
          ativo: true
        });
        kitId = novoKit.id;
      } else {
        await base44.entities.Kit.update(kitId, {
          nome,
          codigo,
          descricao,
          total_itens: itens.length
        });
      }

      // Deletar itens antigos se editando
      if (editandoKit) {
        const antigosItems = await base44.entities.KitItem.filter({ kit_id: kitId });
        for (const item of antigosItems) {
          await base44.entities.KitItem.delete(item.id);
        }
      }

      // Criar novos itens
      for (const item of itens) {
        if (item.id.startsWith('new_')) {
          await base44.entities.KitItem.create({
            empresa_id: empresaId,
            kit_id: kitId,
            material_id: item.material_id,
            material_nome: item.material_nome,
            material_codigo: item.material_codigo,
            material_unidade: item.material_unidade,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario
          });
        }
      }

      await carregarDados();
      setEditandoKit(null);
      setNome('');
      setCodigo('');
      setDescricao('');
      setItens([]);
    } catch (err) {
      alert('Erro ao salvar kit: ' + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const handleDeletarKit = async (kitId) => {
    if (!window.confirm('Deseja excluir este kit?')) return;
    try {
      await base44.entities.Kit.delete(kitId);
      await carregarDados();
    } catch (err) {
      alert('Erro ao deletar: ' + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar KITs de Materiais</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : editandoKit || !nome && codigo === '' ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome do KIT</label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Kit Escavação Básica" />
            </div>

            <div>
              <label className="text-sm font-medium">Código (opcional)</label>
              <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="KIT-001" />
            </div>

            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do kit..." />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Materiais do KIT</h3>

              <div className="flex gap-2 mb-3">
                <Select value={materialSelecionado} onValueChange={setMaterialSelecionado}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecionar material..." />
                  </SelectTrigger>
                  <SelectContent>
                    {materiais.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome} ({m.codigo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={quantidade}
                  onChange={e => setQuantidade(e.target.value)}
                  placeholder="Qtd"
                  className="w-20"
                />
                <Button onClick={handleAdicionarMaterial} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {itens.map((item, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <p className="font-medium">{item.material_nome}</p>
                        <p className="text-xs text-slate-500">{item.quantidade} {item.material_unidade}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoverMaterial(idx)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setEditandoKit(null);
                  setNome('');
                  setCodigo('');
                  setDescricao('');
                  setItens([]);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSalvarKit} className="bg-green-600 hover:bg-green-700">
                Salvar KIT
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={handleNovoKit} className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
              <Plus className="w-4 h-4" /> Novo KIT
            </Button>

            {kits.map(kit => (
              <Card key={kit.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold">{kit.nome}</h4>
                    {kit.codigo && <p className="text-xs text-slate-500">Código: {kit.codigo}</p>}
                    {kit.descricao && <p className="text-xs text-slate-600 mt-1">{kit.descricao}</p>}
                  </div>
                  <Badge variant="outline">{kit.total_itens} itens</Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditarKit(kit)}
                    className="flex-1"
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeletarKit(kit.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}