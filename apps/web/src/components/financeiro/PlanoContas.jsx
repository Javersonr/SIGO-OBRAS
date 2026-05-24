import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Plus, ChevronRight, ChevronDown, FolderTree, Edit, Trash2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PlanoContas({ empresaAtiva, contas, onReload }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState({
    nome: '',
    codigo_contabil: '',
    tipo: 'Banco',
    tipo_natureza: 'Ativo',
    conta_pai_id: null,
    nivel: 1
  });

  const toggleNode = (id) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const handleOpen = (conta = null, contaPai = null) => {
    if (conta) {
      setForm({
        nome: conta.nome || '',
        codigo_contabil: conta.codigo_contabil || '',
        tipo: conta.tipo || 'Banco',
        tipo_natureza: conta.tipo_natureza || 'Ativo',
        conta_pai_id: conta.conta_pai_id || null,
        nivel: conta.nivel || 1
      });
      setSelectedItem(conta);
    } else {
      setForm({
        nome: '',
        codigo_contabil: '',
        tipo: 'Banco',
        tipo_natureza: contaPai?.tipo_natureza || 'Ativo',
        conta_pai_id: contaPai?.id || null,
        nivel: contaPai ? (contaPai.nivel || 1) + 1 : 1
      });
      setSelectedItem(null);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nome) {
      alert('Preencha o nome da conta');
      return;
    }

    const data = {
      empresa_id: empresaAtiva.id,
      ...form,
      saldo_inicial: 0,
      saldo_atual: 0,
      ativo: true
    };

    if (selectedItem) {
      await base44.entities.ContaFinanceira.update(selectedItem.id, data);
    } else {
      await base44.entities.ContaFinanceira.create(data);
    }

    setShowModal(false);
    onReload();
  };

  const handleDelete = async (conta) => {
    // Verificar se tem subcontas
    const subcontas = contas.filter(c => c.conta_pai_id === conta.id);
    if (subcontas.length > 0) {
      alert('Esta conta possui subcontas. Exclua as subcontas primeiro.');
      return;
    }

    if (!confirm(`Excluir conta "${conta.nome}"?`)) return;

    await base44.entities.ContaFinanceira.delete(conta.id);
    onReload();
  };

  // Organizar contas em hierarquia
  const buildTree = (parentId = null) => {
    return contas
      .filter(c => c.conta_pai_id === parentId)
      .sort((a, b) => (a.codigo_contabil || '').localeCompare(b.codigo_contabil || ''));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const getNaturezaColor = (natureza) => {
    switch (natureza) {
      case 'Ativo': return 'bg-blue-100 text-blue-700';
      case 'Passivo': return 'bg-red-100 text-red-700';
      case 'Receita': return 'bg-green-100 text-green-700';
      case 'Despesa': return 'bg-orange-100 text-orange-700';
      case 'Patrimônio Líquido': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const renderConta = (conta, depth = 0) => {
    const subcontas = buildTree(conta.id);
    const hasChildren = subcontas.length > 0;
    const isExpanded = expandedNodes.has(conta.id);

    return (
      <div key={conta.id}>
        <div
          className={cn(
            "flex items-center gap-2 p-3 hover:bg-slate-50 rounded-lg group transition-colors",
            depth > 0 && "ml-8"
          )}
          style={{ paddingLeft: `${depth * 32 + 12}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleNode(conta.id)} className="p-1 hover:bg-slate-200 rounded">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-600" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="flex-1 flex items-center gap-3">
            <div className={`w-8 h-8 rounded flex items-center justify-center ${
              hasChildren ? 'bg-amber-100' : 'bg-blue-100'
            }`}>
              {hasChildren ? (
                <FolderTree className="w-4 h-4 text-amber-600" />
              ) : (
                <FileText className="w-4 h-4 text-blue-600" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                {conta.codigo_contabil && (
                  <span className="text-xs font-mono text-slate-500">{conta.codigo_contabil}</span>
                )}
                <span className="font-medium text-slate-800">{conta.nome}</span>
                {conta.tipo_natureza && (
                  <Badge className={getNaturezaColor(conta.tipo_natureza)} variant="outline">
                    {conta.tipo_natureza}
                  </Badge>
                )}
              </div>
              {!hasChildren && (
                <span className="text-sm text-slate-500">{conta.tipo}</span>
              )}
            </div>

            {!hasChildren && (
              <div className="text-right">
                <p className="font-semibold text-slate-800">
                  {formatCurrency(conta.saldo_atual || conta.saldo_inicial || 0)}
                </p>
              </div>
            )}

            <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleOpen(null, conta)}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleOpen(conta)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(conta)}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {subcontas.map(subconta => renderConta(subconta, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const contasRaiz = buildTree(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Plano de Contas</h2>
          <p className="text-sm text-slate-500">Estrutura hierárquica de contas contábeis</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Conta Principal
        </Button>
      </div>

      {contasRaiz.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderTree className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-2">Nenhuma conta cadastrada</h3>
            <p className="text-slate-500 mb-4">Crie a estrutura do seu plano de contas</p>
            <Button onClick={() => handleOpen()}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeira Conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-1">
              {contasRaiz.map(conta => renderConta(conta))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Criação/Edição */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedItem ? 'Editar Conta' : 'Nova Conta'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Código Contábil</Label>
                <Input
                  value={form.codigo_contabil}
                  onChange={(e) => setForm({ ...form, codigo_contabil: e.target.value })}
                  placeholder="Ex: 1.1.01"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Nível</Label>
                <Input
                  type="number"
                  value={form.nivel}
                  disabled
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Nome da Conta *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Bancos, Caixa, Fornecedores"
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Banco">Banco</SelectItem>
                    <SelectItem value="Caixa">Caixa</SelectItem>
                    <SelectItem value="Cartão">Cartão</SelectItem>
                    <SelectItem value="Investimento">Investimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Natureza Contábil</Label>
                <Select value={form.tipo_natureza} onValueChange={(v) => setForm({ ...form, tipo_natureza: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Passivo">Passivo</SelectItem>
                    <SelectItem value="Receita">Receita</SelectItem>
                    <SelectItem value="Despesa">Despesa</SelectItem>
                    <SelectItem value="Patrimônio Líquido">Patrimônio Líquido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                💡 Você pode adicionar subcontas clicando no botão + ao lado de qualquer conta
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.nome}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}