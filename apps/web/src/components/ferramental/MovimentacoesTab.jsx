import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, CheckCircle2, Clock, AlertCircle, Printer, Edit, Trash2, Upload } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import MovimentacaoModal from './MovimentacaoModal';
import { gerarReciboMovimentacao } from './ReciboMovimentacao';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function MovimentacoesTab({ empresaAtiva }) {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [editingMovimentacao, setEditingMovimentacao] = useState(null);
  const [selectedMovimentacoes, setSelectedMovimentacoes] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    if (empresaAtiva?.id) {
      loadMovimentacoes();
    }
  }, [empresaAtiva?.id]);

  const loadMovimentacoes = async () => {
    setLoading(true);
    try {
      const result = await base44.entities.MovimentacaoFerramenta.filter({
        empresa_id: empresaAtiva.id
      });
      setMovimentacoes(result.sort((a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao)));
    } catch (error) {
      console.error('Erro ao carregar movimentacões:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editingMovimentacao) {
        await base44.entities.MovimentacaoFerramenta.update(editingMovimentacao.id, formData);
        toast.success('Movimentação atualizada com sucesso');
      } else {
        // Se for Entrada Estoque, sempre processar item por item
        if (formData.tipo_movimentacao === 'Entrada Estoque') {
          const quantidade = formData.quantidade || 1;
          
          // Buscar ferramenta modelo
          const ferramentaModelo = await base44.entities.Ferramenta.filter({
            empresa_id: empresaAtiva.id,
            id: formData.ferramenta_id
          });
          
          if (!ferramentaModelo || ferramentaModelo.length === 0) {
            toast.error('Ferramenta não encontrada');
            return;
          }
          
          const modelo = ferramentaModelo[0];
          
          // Criar cada item individual
          for (let i = 0; i < quantidade; i++) {
            const novoItem = await base44.entities.Ferramenta.create({
              empresa_id: empresaAtiva.id,
              descricao: modelo.descricao,
              codigo: modelo.codigo,
              tipo: modelo.tipo,
              marca: modelo.marca,
              ca: modelo.ca,
              status: 'Disponível',
              localizacao: formData.destino || 'Almoxarifado',
              valor_unitario: modelo.valor_unitario || 0,
              quantidade_estoque: 1,
              numero_serie: '',
              observacoes: formData.observacoes || '',
              ativo: true
            });
            
            // Criar movimentação individual - SEMPRE criar uma movimentação
            await base44.entities.MovimentacaoFerramenta.create({
              empresa_id: empresaAtiva.id,
              ferramenta_id: novoItem.id,
              ferramenta_codigo: novoItem.codigo,
              ferramenta_descricao: novoItem.descricao,
              tipo_movimentacao: 'Entrada Estoque',
              status: 'Realizada',
              data_movimentacao: formData.data_movimentacao,
              quantidade: 1,
              origem: formData.origem || 'Compra',
              destino: formData.destino || 'Almoxarifado',
              observacoes: formData.observacoes || '',
              usuario_nome: formData.usuario_nome || 'Sistema',
              usuario_id: formData.usuario_id || '',
              usuario_email: formData.usuario_email || ''
            });
          }
          
          toast.success(`${quantidade} ${quantidade === 1 ? 'unidade criada' : 'unidades criadas'} com sucesso`);
        } else {
          // Outros tipos de movimentação
          // O MovimentacaoModal já cuida de atualizar status/localização da ferramenta
          // Este handleSave só cria o registro e retorna o objeto (para o modal pegar o id)
          const criada = await base44.entities.MovimentacaoFerramenta.create(formData);
          return criada;
        }
      }

      // Fechar modal apenas para entrada de estoque ou edição direta
      // Para outros tipos, o MovimentacaoModal controla o fechamento via onClose()
      if (editingMovimentacao || formData.tipo_movimentacao === 'Entrada Estoque') {
        setShowModal(false);
        setEditingMovimentacao(null);
        toast.success('Movimentação registrada com sucesso');
      }
      loadMovimentacoes();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao processar entrada: ' + error.message);
    }
  };

  const handleEdit = (mov) => {
    setEditingMovimentacao(mov);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Deseja excluir esta movimentação? Esta ação não pode ser desfeita.')) return;
    try {
      await base44.entities.MovimentacaoFerramenta.delete(id);
      toast.success('Movimentação excluída com sucesso');
      loadMovimentacoes();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir movimentação');
    }
  };

  const handleToggleSelect = (id) => {
    const newSelected = new Set(selectedMovimentacoes);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedMovimentacoes(newSelected);
    setSelectAll(newSelected.size === filteredMovimentacoes.length && filteredMovimentacoes.length > 0);
  };

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedMovimentacoes(new Set());
      setSelectAll(false);
    } else {
      setSelectedMovimentacoes(new Set(filteredMovimentacoes.map(m => m.id)));
      setSelectAll(true);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedMovimentacoes.size === 0) {
      toast.error('Selecione pelo menos uma movimentação');
      return;
    }
    if (!confirm(`Deseja excluir ${selectedMovimentacoes.size} movimentação(ções)? Esta ação não pode ser desfeita.`)) return;
    
    try {
      await Promise.all(Array.from(selectedMovimentacoes).map(id => 
        base44.entities.MovimentacaoFerramenta.delete(id)
      ));
      toast.success(`${selectedMovimentacoes.size} movimentação(ções) excluída(s)`);
      setSelectedMovimentacoes(new Set());
      setSelectAll(false);
      loadMovimentacoes();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir movimentações');
    }
  };

  const handleConcluirTodosPendentes = async () => {
    const pendentes = filteredMovimentacoes.filter(m => m.status === 'Pendente');
    if (pendentes.length === 0) {
      toast.error('Nenhuma movimentação pendente');
      return;
    }
    if (!confirm(`Deseja concluir ${pendentes.length} movimentação(ções) pendente(s)?`)) return;
    
    try {
      await Promise.all(pendentes.map(m =>
        base44.entities.MovimentacaoFerramenta.update(m.id, { status: 'Realizada' })
      ));
      toast.success(`${pendentes.length} movimentação(ções) concluída(s)`);
      loadMovimentacoes();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao concluir movimentações');
    }
  };

  const handleImportarExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const { output } = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            data_movimentacao: { type: 'string' },
            ferramenta_codigo: { type: 'string' },
            ferramenta_descricao: { type: 'string' },
            tipo_movimentacao: { type: 'string' },
            status: { type: 'string' },
            funcionario_nome: { type: 'string' },
            caminhao_placa: { type: 'string' },
            destino: { type: 'string' },
            observacoes: { type: 'string' }
          }
        }
      });

      if (!Array.isArray(output)) {
        toast.error('Formato de arquivo inválido');
        return;
      }

      let sucesso = 0;
      for (const item of output) {
        try {
          // Buscar a ferramenta pelo código
          const ferramentas = await base44.entities.Ferramenta.filter({
            empresa_id: empresaAtiva.id,
            codigo: item.ferramenta_codigo
          });

          const ferramenta = ferramentas.length > 0 ? ferramentas[0] : null;
          const destino = item.destino || item.caminhao_placa || item.funcionario_nome || 'Almoxarifado';

          // Criar movimentação
          await base44.entities.MovimentacaoFerramenta.create({
            empresa_id: empresaAtiva.id,
            ferramenta_id: ferramenta?.id || '',
            data_movimentacao: item.data_movimentacao,
            ferramenta_codigo: item.ferramenta_codigo,
            ferramenta_descricao: item.ferramenta_descricao,
            tipo_movimentacao: item.tipo_movimentacao || 'Entrada Estoque',
            status: item.status || 'Realizada',
            funcionario_nome: item.funcionario_nome || '',
            destino: destino,
            observacoes: item.observacoes || '',
            usuario_nome: 'Importado',
            usuario_id: '',
            usuario_email: ''
          });

          // Se a ferramenta foi encontrada, atualizar sua localização
          if (ferramenta?.id) {
            await base44.entities.Ferramenta.update(ferramenta.id, {
              localizacao: destino
            });
          }

          sucesso++;
        } catch (error) {
          console.error('Erro ao importar item:', error);
        }
      }

      toast.success(`${sucesso} movimentação(ções) importada(s) com sucesso`);
      loadMovimentacoes();
    } catch (error) {
      console.error('Erro ao importar:', error);
      toast.error('Erro ao importar arquivo Excel');
    }
  };

  const handleImprimirRecibo = (mov) => {
    const tiposComRecibo = ['Entrega para Funcionário', 'Empréstimo', 'Baixa para Sucata', 'Entrada Estoque'];
    if (!tiposComRecibo.includes(mov.tipo_movimentacao)) {
      toast.error('Recibo disponível apenas para Entrega, Empréstimo, Baixa ou Entrada de Estoque');
      return;
    }
    gerarReciboMovimentacao(mov, empresaAtiva);
    toast.success('Recibo gerado com sucesso');
  };

  const statusColors = {
    'Pendente': 'bg-yellow-100 text-yellow-700',
    'Realizada': 'bg-green-100 text-green-700',
    'Cancelada': 'bg-red-100 text-red-700'
  };

  const typeColors = {
    'Entrega para Funcionário': 'bg-blue-50 text-blue-700 border-blue-200',
    'Empréstimo': 'bg-purple-50 text-purple-700 border-purple-200',
    'Manutenção': 'bg-orange-50 text-orange-700 border-orange-200',
    'Baixa para Sucata': 'bg-red-50 text-red-700 border-red-200',
    'Devolução': 'bg-green-50 text-green-700 border-green-200',
    'Entrada Estoque': 'bg-teal-50 text-teal-700 border-teal-200'
  };

  const filteredMovimentacoes = movimentacoes.filter(m => {
    const matchSearch = m.ferramenta_descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       m.ferramenta_codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       m.funcionario_nome?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'todas' || m.status === filterStatus;
    const matchTipo = filterTipo === 'todos' || m.tipo_movimentacao === filterTipo;
    return matchSearch && matchStatus && matchTipo;
  });

  const stats = {
    pendentes: movimentacoes.filter(m => m.status === 'Pendente').length,
    realizadas: movimentacoes.filter(m => m.status === 'Realizada').length,
    total: movimentacoes.length
  };

  return (
    <div className="space-y-6">
      {/* Cards Resumo */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <Clock className="w-5 h-5 text-yellow-600 mb-2" />
            <p className="text-2xl font-bold text-yellow-600">{stats.pendentes}</p>
            <p className="text-sm text-slate-500">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <CheckCircle2 className="w-5 h-5 text-green-600 mb-2" />
            <p className="text-2xl font-bold text-green-600">{stats.realizadas}</p>
            <p className="text-sm text-slate-500">Realizadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <AlertCircle className="w-5 h-5 text-slate-500 mb-2" />
            <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-sm text-slate-500">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar movimentações..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos Status</SelectItem>
            <SelectItem value="Pendente">Pendente</SelectItem>
            <SelectItem value="Realizada">Realizada</SelectItem>
            <SelectItem value="Cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Tipos</SelectItem>
            <SelectItem value="Entrega para Funcionário">Entrega para Funcionário</SelectItem>
            <SelectItem value="Empréstimo">Empréstimo</SelectItem>
            <SelectItem value="Movimentação para Caminhão">Movimentação para Caminhão</SelectItem>
            <SelectItem value="Manutenção">Manutenção</SelectItem>
            <SelectItem value="Baixa para Sucata">Baixa para Sucata</SelectItem>
            <SelectItem value="Devolução">Devolução</SelectItem>
            <SelectItem value="Entrada Estoque">Entrada Estoque</SelectItem>
          </SelectContent>
        </Select>
        
        <Button onClick={() => {
          setEditingMovimentacao(null);
          setShowModal(true);
        }} className="bg-amber-500 hover:bg-amber-600 whitespace-nowrap">
          <Plus className="w-4 h-4 mr-2" />
          Nova Movimentação
        </Button>

        <label>
          <Button variant="outline" className="gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Importar Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportarExcel}
              className="hidden"
            />
          </Button>
        </label>

        {filteredMovimentacoes.some(m => m.status === 'Pendente') && (
          <Button 
            onClick={handleConcluirTodosPendentes}
            className="bg-green-600 hover:bg-green-700 whitespace-nowrap gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Concluir Pendentes
          </Button>
        )}
      </div>

      {selectedMovimentacoes.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-700">
            {selectedMovimentacoes.size} selecionada(s)
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDeleteSelected}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Excluir Selecionadas
          </Button>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox 
                  checked={selectAll}
                  onCheckedChange={handleToggleSelectAll}
                />
              </TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ferramenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Funcionário / Projeto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredMovimentacoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  Nenhuma movimentação encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredMovimentacoes.map(mov => (
                <TableRow key={mov.id} className={selectedMovimentacoes.has(mov.id) ? 'bg-blue-50' : ''}>
                  <TableCell className="w-10">
                    <Checkbox 
                      checked={selectedMovimentacoes.has(mov.id)}
                      onCheckedChange={() => handleToggleSelect(mov.id)}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(mov.data_movimentacao), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-slate-500">{mov.ferramenta_codigo}</div>
                    <div className="font-medium text-sm">{mov.ferramenta_descricao}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`border ${typeColors[mov.tipo_movimentacao]}`}>
                      {mov.tipo_movimentacao}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {mov.funcionario_nome || mov.projeto_nome || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[mov.status]}>{mov.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(mov)}
                        className="text-xs h-8 w-8 p-0"
                        title="Editar"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(mov.id)}
                        className="text-xs h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Excluir"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      {['Entrega para Funcionário', 'Empréstimo', 'Baixa para Sucata', 'Entrada Estoque'].includes(mov.tipo_movimentacao) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleImprimirRecibo(mov)}
                          className="text-xs h-8 w-8 p-0"
                          title="Imprimir recibo"
                        >
                          <Printer className="w-3 h-3" />
                        </Button>
                      )}
                      </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <MovimentacaoModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingMovimentacao(null);
        }}
        empresaAtiva={empresaAtiva}
        onSave={handleSave}
        movimentacao={editingMovimentacao}
      />
    </div>
  );
}