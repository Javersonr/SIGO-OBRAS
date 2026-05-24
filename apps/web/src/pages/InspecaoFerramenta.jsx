import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../Layout';
import { Plus, Trash2, Edit, Search, MoreHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SheetModalComponent from '@/components/ui/sheet-modal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const inspecaoSchema = {
  empresa_id: '',
  data_inspecao: new Date().toISOString().split('T')[0],
  placa: '',
  modelo: '',
  km_atual: '',
  motorista: '',
  responsavel_nome: '',
  status: 'Aprovado',
  itens_inspecao: '[]',
  observacoes: '',
  proxima_inspecao: '',
  anexos: '[]',
  ativo: true
};

export default function InspecaoFerramenta() {
  const { empresaAtiva, perfil } = useEmpresa();
  const [inspecoes, setInspecoes] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedInspecao, setSelectedInspecao] = useState(null);
  const [formData, setFormData] = useState(inspecaoSchema);
  const [itensInspecao, setItensInspecao] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (empresaAtiva) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [insp, ferrs] = await Promise.all([
        base44.entities.InspecaoCaminhao.filter({ empresa_id: empresaAtiva.id }),
        base44.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true })
      ]);
      setInspecoes(insp.sort((a, b) => new Date(b.data_inspecao) - new Date(a.data_inspecao)));
      setFerramentas(ferrs);
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (insp = null) => {
    if (insp) {
      setFormData({ ...insp });
      setItensInspecao(JSON.parse(insp.itens_inspecao || '[]'));
      setSelectedInspecao(insp);
    } else {
      setFormData({ ...inspecaoSchema, empresa_id: empresaAtiva.id });
      setItensInspecao(ferramentas.map(f => ({
        ferramenta_id: f.id,
        ferramenta_codigo: f.codigo,
        ferramenta_descricao: f.descricao,
        quantidade: f.quantidade_estoque || 1,
        tem_laudo: false,
        status: 'OK',
        observacao: ''
      })));
      setSelectedInspecao(null);
    }
    setShowModal(true);
  };

  const handleAddItem = () => {
    setItensInspecao([...itensInspecao, {
      ferramenta_id: '',
      ferramenta_codigo: '',
      ferramenta_descricao: '',
      quantidade: 1,
      tem_laudo: false,
      status: 'OK',
      observacao: ''
    }]);
  };

  const handleRemoveItem = (index) => {
    setItensInspecao(itensInspecao.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...itensInspecao];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'ferramenta_id') {
      const ferr = ferramentas.find(f => f.id === value);
      if (ferr) {
        updated[index].ferramenta_codigo = ferr.codigo;
        updated[index].ferramenta_descricao = ferr.descricao;
        updated[index].quantidade = ferr.quantidade_estoque || 1;
      }
    }
    
    setItensInspecao(updated);
  };

  const handleSave = async () => {
    if (!formData.placa || !formData.data_inspecao) {
      toast.error('Preencha placa e data da inspeção');
      return;
    }

    if (itensInspecao.length === 0) {
      toast.error('Adicione pelo menos um item à inspeção');
      return;
    }

    const dataToSave = {
      ...formData,
      itens_inspecao: JSON.stringify(itensInspecao)
    };

    setSaving(true);
    try {
      if (selectedInspecao) {
        await base44.entities.InspecaoCaminhao.update(selectedInspecao.id, dataToSave);
        toast.success('Inspeção atualizada');
      } else {
        await base44.entities.InspecaoCaminhao.create(dataToSave);
        toast.success('Inspeção criada');
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar inspeção');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deseja deletar esta inspeção?')) return;
    try {
      await base44.entities.InspecaoCaminhao.delete(id);
      toast.success('Inspeção deletada');
      loadData();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao deletar');
    }
  };

  const filteredInspecoes = inspecoes.filter(i =>
    i.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.modelo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.motorista?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusColors = {
    'Aprovado': 'bg-green-100 text-green-700',
    'Reprovado': 'bg-red-100 text-red-700',
    'Atenção': 'bg-yellow-100 text-yellow-700'
  };

  if (!empresaAtiva) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inspeção de Ferramental</h1>
          <p className="text-slate-500">Controle de ferramental nos caminhões</p>
        </div>
        {['Admin', 'Gestor'].includes(perfil) && (
          <Button onClick={() => handleOpenModal()} className="bg-amber-500 hover:bg-amber-600 gap-2">
            <Plus className="w-4 h-4" />
            Nova Inspeção
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por placa, modelo ou motorista..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabela */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Motorista</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell>
              </TableRow>
            ) : filteredInspecoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  Nenhuma inspeção encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredInspecoes.map(insp => (
                <TableRow key={insp.id}>
                  <TableCell>{new Date(insp.data_inspecao).toLocaleDateString()}</TableCell>
                  <TableCell className="font-mono font-bold">{insp.placa}</TableCell>
                  <TableCell>{insp.modelo}</TableCell>
                  <TableCell>{insp.motorista || '-'}</TableCell>
                  <TableCell>{insp.responsavel_nome || '-'}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[insp.status]}>{insp.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenModal(insp)}>
                          <Edit className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(insp.id)} className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" /> Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal */}
      <SheetModalComponent
        open={showModal}
        onOpenChange={setShowModal}
        title={selectedInspecao ? 'Editar Inspeção' : 'Nova Inspeção'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Dados do Caminhão */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-4">Dados do Caminhão</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Placa *</Label>
                <Input
                  value={formData.placa}
                  onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })}
                  placeholder="ABC-1234"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Data da Inspeção *</Label>
                <Input
                  type="date"
                  value={formData.data_inspecao}
                  onChange={(e) => setFormData({ ...formData, data_inspecao: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="Volvo FH16"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>KM Atual</Label>
                <Input
                  type="number"
                  value={formData.km_atual}
                  onChange={(e) => setFormData({ ...formData, km_atual: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Motorista</Label>
                <Input
                  value={formData.motorista}
                  onChange={(e) => setFormData({ ...formData, motorista: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Responsável pela Inspeção</Label>
                <Input
                  value={formData.responsavel_nome}
                  onChange={(e) => setFormData({ ...formData, responsavel_nome: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          {/* Checklist Ferramental */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Checklist de Ferramental</h3>
              <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-2">
                <Plus className="w-3 h-3" />
                Adicionar Item
              </Button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {itensInspecao.map((item, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-slate-700">Item {idx + 1}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Ferramenta</Label>
                      <select
                        value={item.ferramenta_id}
                        onChange={(e) => handleItemChange(idx, 'ferramenta_id', e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
                      >
                        <option value="">Selecione...</option>
                        {ferramentas.map(f => (
                          <option key={f.id} value={f.id}>
                            {f.codigo} - {f.descricao}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) => handleItemChange(idx, 'quantidade', parseInt(e.target.value) || 1)}
                        className="mt-1 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Status</Label>
                      <select
                        value={item.status}
                        onChange={(e) => handleItemChange(idx, 'status', e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
                      >
                        <option value="OK">OK</option>
                        <option value="Danificado">Danificado</option>
                        <option value="Faltando">Faltando</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.tem_laudo}
                          onChange={(e) => handleItemChange(idx, 'tem_laudo', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-xs">Tem Laudo</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Observação</Label>
                    <Input
                      value={item.observacao}
                      onChange={(e) => handleItemChange(idx, 'observacao', e.target.value)}
                      placeholder="Observações sobre este item..."
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status e Próxima Inspeção */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status da Inspeção</Label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full mt-1.5 px-3 py-2 border border-slate-300 rounded-md"
              >
                <option value="Aprovado">✅ Aprovado</option>
                <option value="Atenção">⚠️ Atenção</option>
                <option value="Reprovado">❌ Reprovado</option>
              </select>
            </div>
            <div>
              <Label>Próxima Inspeção</Label>
              <Input
                type="date"
                value={formData.proxima_inspecao}
                onChange={(e) => setFormData({ ...formData, proxima_inspecao: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Observações Gerais */}
          <div>
            <Label>Observações Gerais</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Observações sobre a inspeção..."
              rows={3}
              className="mt-1.5"
            />
          </div>
        </div>
      </SheetModalComponent>
    </div>
  );
}