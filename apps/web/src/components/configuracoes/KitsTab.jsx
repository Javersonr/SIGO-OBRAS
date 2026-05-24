import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function KitsTab({ empresaAtiva }) {
  const [kits, setKits] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editandoKit, setEditandoKit] = useState(null);
  const [busca, setBusca] = useState('');
  const [selectedKitIds, setSelectedKitIds] = useState([]);

  // Form
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [itens, setItens] = useState([]);
  const [materialSelecionado, setMaterialSelecionado] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  useEffect(() => {
    if (empresaAtiva?.id) {
      carregarDados();
    }
  }, [empresaAtiva?.id]);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [kitsData, materiaisData] = await Promise.all([
        base44.entities.Kit.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Material.filter({ empresa_id: empresaAtiva.id, ativo: true })
      ]);
      setKits(kitsData || []);
      setMateriais(materiaisData || []);
    } catch (err) {
      console.error('Erro ao carregar:', err);
      toast.error('Erro ao carregar dados');
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
    setShowModal(true);
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
      console.error('Erro:', err);
    }
    setShowModal(true);
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
      toast.error('Preencha o nome e adicione pelo menos um material');
      return;
    }

    try {
      setCarregando(true);
      let kitId = editandoKit?.id;

      if (!kitId) {
        const novoKit = await base44.entities.Kit.create({
          empresa_id: empresaAtiva.id,
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
            empresa_id: empresaAtiva.id,
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
      setShowModal(false);
      toast.success(editandoKit ? '✅ KIT atualizado' : '✅ KIT criado');
    } catch (err) {
      toast.error('Erro: ' + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const handleDeletarKit = async (kitId) => {
    if (!window.confirm('Deseja excluir este KIT?')) return;
    try {
      await base44.entities.Kit.delete(kitId);
      await carregarDados();
      toast.success('✅ KIT deletado');
    } catch (err) {
      toast.error('Erro: ' + err.message);
    }
  };

  const filteredKits = kits.filter(k => 
    k.nome.toLowerCase().includes(busca.toLowerCase()) ||
    k.codigo?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>KITs de Materiais</CardTitle>
          <Button onClick={handleNovoKit}>
            <Plus className="w-4 h-4 mr-2" /> Novo KIT
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar KIT por nome ou código..."
              className="pl-10"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedKitIds.length === filteredKits.length && filteredKits.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedKitIds(filteredKits.map(k => k.id));
                        } else {
                          setSelectedKitIds([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      Nenhum KIT criado ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredKits.map(kit => (
                    <TableRow key={kit.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKitIds.includes(kit.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedKitIds([...selectedKitIds, kit.id]);
                            } else {
                              setSelectedKitIds(selectedKitIds.filter(id => id !== kit.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{kit.nome}</TableCell>
                      <TableCell>{kit.codigo || '-'}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{kit.descricao || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{kit.total_itens}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditarKit(kit)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeletarKit(kit.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>{editandoKit ? 'Editar KIT' : 'Novo KIT'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-6 flex-1">
            <div>
              <Label>Nome do KIT *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Kit Escavação Básica"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Código (opcional)</Label>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="KIT-001"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição do kit..."
                className="mt-1.5"
                rows={3}
              />
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
                  onChange={(e) => setQuantidade(e.target.value)}
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
          </div>

          <div className="flex justify-end gap-3 p-6 border-t">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSalvarKit} disabled={carregando} className="bg-green-600 hover:bg-green-700">
              {carregando ? 'Salvando...' : 'Salvar KIT'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}