import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Wrench, Search, Plus, Edit, Trash2, Image as ImageIcon, Filter, X
} from 'lucide-react';
import { toast } from 'sonner';
import FerramentaModal from '@/components/ferramental/FerramentaModal';

export default function CadastroFerramentas() {
  const { empresaAtiva } = useEmpresa();
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingFerramenta, setEditingFerramenta] = useState(null);
  const [filtros, setFiltros] = useState({
    tipo: 'todos',
    status: 'todos'
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (empresaAtiva) {
      loadFerramentas();
    }
  }, [empresaAtiva]);

  const loadFerramentas = async () => {
    try {
      setLoading(true);
      const filtro = { empresa_id: empresaAtiva.id, ativo: true };
      
      if (filtros.tipo !== 'todos') {
        filtro.tipo = filtros.tipo;
      }
      
      if (filtros.status !== 'todos') {
        filtro.status = filtros.status;
      }
      
      const data = await base44.entities.Ferramenta.filter(filtro, '-created_date');
      setFerramentas(data);
    } catch (error) {
      console.error('Erro ao carregar ferramentas:', error);
      toast.error('Erro ao carregar ferramentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (empresaAtiva) {
      loadFerramentas();
    }
  }, [filtros]);

  const handleDelete = async (ferramenta) => {
    if (!confirm(`Deseja realmente excluir a ferramenta ${ferramenta.codigo}?`)) return;

    try {
      await base44.entities.Ferramenta.update(ferramenta.id, { ativo: false });
      toast.success('Ferramenta excluída com sucesso!');
      loadFerramentas();
    } catch (error) {
      console.error('Erro ao excluir ferramenta:', error);
      toast.error('Erro ao excluir ferramenta');
    }
  };

  const filteredFerramentas = ferramentas.filter(f => 
    f.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.marca?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.modelo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    const config = {
      'Disponível': 'bg-green-100 text-green-700',
      'Em Uso': 'bg-blue-100 text-blue-700',
      'Em Manutenção': 'bg-amber-100 text-amber-700',
      'Danificado': 'bg-red-100 text-red-700',
      'Inativo': 'bg-slate-100 text-slate-700',
      'Sucata': 'bg-slate-100 text-slate-700'
    };
    return config[status] || 'bg-slate-100 text-slate-700';
  };

  if (loading && ferramentas.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Carregando ferramentas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Wrench className="w-8 h-8 text-amber-600" />
            Cadastro de Ferramentas
          </h1>
          <p className="text-slate-600 mt-1">Gerencie o catálogo completo de ferramentas e EPIs</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filtros
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingFerramenta(null);
              setShowModal(true);
            }}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Ferramenta
          </Button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Filtros</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltros({ tipo: 'todos', status: 'todos' })}
              >
                Limpar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Tipo</label>
                <Select
                  value={filtros.tipo}
                  onValueChange={(value) => setFiltros({ ...filtros, tipo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Ferramenta">Ferramenta</SelectItem>
                    <SelectItem value="EPI">EPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Status</label>
                <Select
                  value={filtros.status}
                  onValueChange={(value) => setFiltros({ ...filtros, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Disponível">Disponível</SelectItem>
                    <SelectItem value="Em Uso">Em Uso</SelectItem>
                    <SelectItem value="Em Manutenção">Em Manutenção</SelectItem>
                    <SelectItem value="Danificado">Danificado</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800">{ferramentas.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Ferramentas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {ferramentas.filter(f => f.tipo === 'Ferramenta').length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">EPIs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {ferramentas.filter(f => f.tipo === 'EPI').length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Disponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {ferramentas.filter(f => f.status === 'Disponível').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por código, descrição, marca ou modelo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {filteredFerramentas.length === 0 ? (
            <div className="p-12 text-center">
              <Wrench className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-lg font-medium mb-2">
                {searchTerm ? 'Nenhuma ferramenta encontrada' : 'Nenhuma ferramenta cadastrada'}
              </p>
              <p className="text-slate-500 text-sm">
                {searchTerm ? 'Tente outro termo de busca' : 'Clique em "Nova Ferramenta" para começar'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Marca/Modelo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFerramentas.map((ferramenta) => (
                    <TableRow key={ferramenta.id} className="hover:bg-slate-50">
                      <TableCell>
                        {ferramenta.foto_url ? (
                          <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center overflow-hidden">
                            <img 
                              src={ferramenta.foto_url} 
                              alt={ferramenta.descricao}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold">
                        {ferramenta.codigo}
                      </TableCell>
                      <TableCell className="font-medium">{ferramenta.descricao}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ferramenta.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {ferramenta.marca && ferramenta.modelo 
                          ? `${ferramenta.marca} ${ferramenta.modelo}`
                          : ferramenta.marca || ferramenta.modelo || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(ferramenta.status)}>
                          {ferramenta.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {ferramenta.localizacao || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingFerramenta(ferramenta);
                              setShowModal(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(ferramenta)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <FerramentaModal
        open={showModal}
        onOpenChange={setShowModal}
        ferramenta={editingFerramenta}
        onSave={() => {
          setShowModal(false);
          setEditingFerramenta(null);
          loadFerramentas();
        }}
      />
    </div>
  );
}