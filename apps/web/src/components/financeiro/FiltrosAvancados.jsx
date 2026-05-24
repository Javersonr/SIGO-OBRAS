import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../Layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, X, Save, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function FiltrosAvancados({ 
  filtros, 
  onFiltrosChange, 
  categorias = [],
  onSalvarTemplate 
}) {
  const { empresaAtiva, user } = useEmpresa();
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [contasContabeis, setContasContabeis] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [nomeTemplate, setNomeTemplate] = useState('');

  useEffect(() => {
    if (empresaAtiva) {
      loadData();
    }
  }, [empresaAtiva]);

  const loadData = async () => {
    try {
      const [ccs, contas, projs] = await Promise.all([
        base44.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.ContaFinanceira.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        base44.entities.Projeto.filter({ empresa_id: empresaAtiva.id })
      ]);
      
      setCentrosCusto(ccs);
      setContasContabeis(contas);
      setProjetos(projs);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleSalvarTemplate = async () => {
    if (!nomeTemplate.trim()) {
      alert('Digite um nome para o template');
      return;
    }

    await onSalvarTemplate(nomeTemplate);
    setShowSaveDialog(false);
    setNomeTemplate('');
  };

  const limparFiltros = () => {
    onFiltrosChange({
      dataInicio: '',
      dataFim: '',
      categoriaId: 'all',
      centroCustoId: 'all',
      contaId: 'all',
      projetoId: 'all',
      versao: 'real'
    });
  };

  const hasFilters = Object.values(filtros).some(v => 
    v && v !== 'all' && v !== 'real'
  );

  return (
    <Card className="border-2 border-amber-200 bg-amber-50/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-slate-800">Filtros Avançados</h3>
          </div>
          <div className="flex gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={limparFiltros}>
                <X className="w-4 h-4 mr-2" />
                Limpar
              </Button>
            )}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Filtros
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Salvar Template de Filtros</DialogTitle>
                  <DialogDescription>
                    Dê um nome para este conjunto de filtros para reutilizá-lo depois
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome do Template</Label>
                    <Input
                      value={nomeTemplate}
                      onChange={(e) => setNomeTemplate(e.target.value)}
                      placeholder="Ex: Relatório Mensal Detalhado"
                    />
                  </div>
                  <Button onClick={handleSalvarTemplate} className="w-full">
                    Salvar Template
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Data Início</Label>
            <Input
              type="date"
              value={filtros.dataInicio || ''}
              onChange={(e) => onFiltrosChange({ ...filtros, dataInicio: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Data Fim</Label>
            <Input
              type="date"
              value={filtros.dataFim || ''}
              onChange={(e) => onFiltrosChange({ ...filtros, dataFim: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Categoria</Label>
            <Select 
              value={filtros.categoriaId || 'all'} 
              onValueChange={(v) => onFiltrosChange({ ...filtros, categoriaId: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categorias.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Centro de Custo</Label>
            <Select 
              value={filtros.centroCustoId || 'all'} 
              onValueChange={(v) => onFiltrosChange({ ...filtros, centroCustoId: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {centrosCusto.map(cc => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.codigo ? `${cc.codigo} - ${cc.nome}` : cc.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Conta</Label>
            <Select 
              value={filtros.contaId || 'all'} 
              onValueChange={(v) => onFiltrosChange({ ...filtros, contaId: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {contasContabeis.map(conta => (
                  <SelectItem key={conta.id} value={conta.id}>{conta.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Projeto</Label>
            <Select 
              value={filtros.projetoId || 'all'} 
              onValueChange={(v) => onFiltrosChange({ ...filtros, projetoId: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {projetos.map(proj => (
                  <SelectItem key={proj.id} value={proj.id}>{proj.titulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}