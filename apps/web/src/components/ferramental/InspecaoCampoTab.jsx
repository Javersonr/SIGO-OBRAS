import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Camera, Check, AlertCircle, MapPin, User, Loader, Truck, MoreVertical, Eye, Edit2, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import SheetModalComponent from '@/components/ui/sheet-modal';
import InspecaoDetalheModal from './InspecaoDetalheModal';
import { toast } from 'sonner';

export default function InspecaoCampoTab({ caminhoes: caminhoesProps = [] }) {
  const { empresaAtiva, user } = useEmpresa();
  const navigate = useNavigate();
  const [ferramentas, setFerramentas] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroLocalizacao, setFiltroLocalizacao] = useState('Caminhão');
  const [filtroFuncionario, setFiltroFuncionario] = useState('');
  
  // Modal nova inspeção
  const [showNovaInspecao, setShowNovaInspecao] = useState(false);
  const [tipoInspecao, setTipoInspecao] = useState('funcionario'); // 'funcionario' ou 'caminhao'
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [novaInspecaoForm, setNovaInspecaoForm] = useState({
    funcionario_id: '',
    funcionario_nome: '',
    caminhao_localizacao: '',
    almoxarifado_id: '',
    almoxarifado_nome: ''
  });
  
  // Inspeções ativas
  const [inspecoesAtivas, setInspecoesAtivas] = useState([]);
  const [inspecoesHistorico, setInspecoesHistorico] = useState([]);
  const [inspecaoSelecionada, setInspecaoSelecionada] = useState(null);
  const [showInspecaoDetalhe, setShowInspecaoDetalhe] = useState(false);
  const caminhoes = caminhoesProps;

  useEffect(() => {
    if (empresaAtiva) {
      loadData();
    }
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ferrs, funcs, inspsAtivas, inspsHistorico] = await Promise.all([
        base44.entities.Ferramenta.filter({ 
          empresa_id: empresaAtiva.id,
          ativo: true
        }, '', 1000),
        base44.entities.Funcionario.filter({ 
          empresa_id: empresaAtiva.id,
          ativo: true
        }, '', 1000),
        base44.entities.InspecaoFerramenta.filter({ 
          empresa_id: empresaAtiva.id,
          status: 'em_andamento'
        }, '-created_date', 100),
        base44.entities.InspecaoFerramenta.filter({ 
          empresa_id: empresaAtiva.id
        }, '-created_date', 100)
      ]);
      
      setFerramentas(ferrs);
      setFuncionarios(funcs);
      setInspecoesAtivas(inspsAtivas);
      setInspecoesHistorico(inspsHistorico.filter(i => i.status !== 'em_andamento'));
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleIniciarInspecao = async () => {
    if (tipoInspecao === 'funcionario' && !novaInspecaoForm.funcionario_id) {
      toast.error('Selecione um funcionário');
      return;
    }
    if (tipoInspecao === 'caminhao' && !novaInspecaoForm.caminhao_id) {
      toast.error('Selecione um caminhão');
      return;
    }

    const user = await base44.auth.me();

    try {
      // Filtrar ferramentas baseado no tipo de inspeção
      let ferramentasFiltradas = [];
      if (tipoInspecao === 'funcionario') {
        ferramentasFiltradas = ferramentas.filter(f => 
          f.funcionario_id === novaInspecaoForm.funcionario_id
        );
      } else {
        // Para caminhão, buscar ferramentas pela localização
        ferramentasFiltradas = ferramentas.filter(f => 
          f.localizacao?.includes(novaInspecaoForm.caminhao_placa)
        );
      }

      // Agrupar ferramentas por código para inspeção
      const ferramentasAgrupadas = {};
      ferramentasFiltradas.forEach(f => {
        const key = `${f.codigo}-${f.descricao}`;
        if (!ferramentasAgrupadas[key]) {
          ferramentasAgrupadas[key] = {
            codigo: f.codigo,
            descricao: f.descricao,
            foto_url: f.foto_url,
            itens: []
          };
        }
        ferramentasAgrupadas[key].itens.push({
          id: f.id,
          numero_serie: f.numero_serie,
          status_foto: 'pendente'
        });
      });

      const inspecao = await base44.entities.InspecaoFerramenta.create({
        empresa_id: empresaAtiva.id,
        data_inspecao: new Date().toISOString().split('T')[0],
        funcionario_id: tipoInspecao === 'funcionario' ? novaInspecaoForm.funcionario_id : '',
        funcionario_nome: tipoInspecao === 'funcionario' ? novaInspecaoForm.funcionario_nome : '',
        caminhao_localizacao: tipoInspecao === 'caminhao' ? novaInspecaoForm.caminhao_placa : (novaInspecaoForm.caminhao_localizacao || ''),
        ferramentas_inspecionadas: JSON.stringify(Object.values(ferramentasAgrupadas)),
        total_ferramentas: Object.values(ferramentasAgrupadas).reduce((sum, f) => sum + f.itens.length, 0),
        total_fotografadas: 0,
        status: 'em_andamento'
      });

      // Registrar no histórico
      await base44.entities.InspecaoHistorico.create({
        empresa_id: empresaAtiva.id,
        inspecao_id: inspecao.id,
        tipo_acao: 'inspecao_iniciada',
        descricao: `Inspeção iniciada - ${tipoInspecao === 'funcionario' ? novaInspecaoForm.funcionario_nome : novaInspecaoForm.caminhao_placa}`,
        usuario_email: user.email,
        usuario_nome: user.full_name,
        timestamp: new Date().toISOString()
      });

      toast.success('Inspeção iniciada! Acesse na aba para fotografar as ferramentas');
      setShowNovaInspecao(false);
      setTipoInspecao('funcionario');
      setNovaInspecaoForm({ funcionario_id: '', funcionario_nome: '', caminhao_localizacao: '', caminhao_id: '', caminhao_placa: '' });
      loadData();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao iniciar inspeção');
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Carregando...</div>;
  }

  const ferramentasFiltradas = ferramentas.filter(f => 
    !filtroLocalizacao || f.localizacao?.includes(filtroLocalizacao)
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Botão Nova Inspeção */}
      <Button 
        onClick={() => setShowNovaInspecao(true)} 
        className="bg-blue-600 hover:bg-blue-700 gap-2 w-full sm:w-auto"
      >
        <Plus className="w-4 h-4" />
        Iniciar Nova Inspeção
      </Button>

      {/* Inspeções Ativas */}
      {inspecoesAtivas.length > 0 && (
        <div className="space-y-3 mb-8">
          <h3 className="font-semibold text-slate-800">Inspeções em Andamento</h3>
          {inspecoesAtivas.map(insp => (
            <Card key={insp.id} className="p-3 sm:p-4 hover:border-blue-300 transition-colors">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm sm:text-base text-slate-800 truncate">{insp.funcionario_nome}</p>
                    <p className="text-xs sm:text-sm text-slate-500 truncate">{insp.caminhao_localizacao}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge className="bg-blue-100 text-blue-700 text-xs sm:text-sm whitespace-nowrap">
                      {insp.total_fotografadas}/{insp.total_ferramentas}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setInspecaoSelecionada(insp);
                          setShowInspecaoDetalhe(true);
                        }}>
                          <Eye className="w-4 h-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setInspecaoSelecionada(insp);
                          setShowInspecaoDetalhe(true);
                        }}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={async () => {
                            if (confirm('Deseja excluir esta inspeção?')) {
                              try {
                                await base44.entities.InspecaoFerramenta.delete(insp.id);
                                toast.success('Inspeção excluída');
                                loadData();
                              } catch (error) {
                                console.error('Erro ao excluir:', error);
                                toast.error('Erro ao excluir inspeção');
                              }
                            }
                          }}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(insp.total_fotografadas / insp.total_ferramentas) * 100}%` }}
                  />
                </div>
                <Button 
                  onClick={() => {
                    setInspecaoSelecionada(insp);
                    setShowInspecaoDetalhe(true);
                  }}
                  variant="outline" 
                  className="w-full gap-2 text-xs sm:text-sm"
                >
                  <Camera className="w-4 h-4" />
                  Continuar Inspeção
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Histórico de Inspeções */}
      {inspecoesHistorico.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">Histórico de Inspeções</h3>
          {inspecoesHistorico.map(insp => (
            <Card key={insp.id} className="p-3 sm:p-4 hover:border-slate-300 transition-colors opacity-75">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm sm:text-base text-slate-800 truncate">{insp.funcionario_nome}</p>
                    <p className="text-xs sm:text-sm text-slate-500 truncate">{insp.caminhao_localizacao}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge className={`text-xs sm:text-sm whitespace-nowrap ${insp.status === 'concluida' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {insp.status === 'concluida' ? 'Concluída' : 'Reprovada'}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setInspecaoSelecionada(insp);
                          setShowInspecaoDetalhe(true);
                        }}>
                          <Eye className="w-4 h-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={async () => {
                            if (confirm('Deseja excluir esta inspeção?')) {
                              try {
                                await base44.entities.InspecaoFerramenta.delete(insp.id);
                                toast.success('Inspeção excluída');
                                loadData();
                              } catch (error) {
                                console.error('Erro ao excluir:', error);
                                toast.error('Erro ao excluir inspeção');
                              }
                            }
                          }}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nova Inspeção */}
      <SheetModalComponent
        open={showNovaInspecao}
        onOpenChange={setShowNovaInspecao}
        title="Iniciar Inspeção de Campo"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowNovaInspecao(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleIniciarInspecao} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              Iniciar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Tipo de Vistoria *</Label>
            <Select value={tipoInspecao} onValueChange={(v) => {
              setTipoInspecao(v);
              setNovaInspecaoForm({ funcionario_id: '', funcionario_nome: '', caminhao_localizacao: '', caminhao_id: '', caminhao_placa: '' });
            }}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="funcionario">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Ferramental do Funcionário
                  </div>
                </SelectItem>
                <SelectItem value="caminhao">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Ferramental do Caminhão
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoInspecao === 'funcionario' && (
            <div>
              <Label>Funcionário *</Label>
              <Select
                value={novaInspecaoForm.funcionario_id}
                onValueChange={(v) => {
                  const func = funcionarios.find(f => f.id === v);
                  setNovaInspecaoForm({
                    ...novaInspecaoForm,
                    funcionario_id: v,
                    funcionario_nome: func?.nome_completo || ''
                  });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {funcionarios.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome_completo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tipoInspecao === 'caminhao' && (
            <div>
              <Label>Caminhão *</Label>
              <Select
                value={novaInspecaoForm.caminhao_id}
                onValueChange={(v) => {
                  const cam = caminhoes.find(c => c.id === v);
                  setNovaInspecaoForm({
                    ...novaInspecaoForm,
                    caminhao_id: v,
                    caminhao_placa: cam?.placa || ''
                  });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o caminhão" />
                </SelectTrigger>
                <SelectContent>
                  {caminhoes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.placa} - {c.modelo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tipoInspecao === 'funcionario' && novaInspecaoForm.funcionario_id && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>{ferramentas.filter(f => f.funcionario_id === novaInspecaoForm.funcionario_id).length}</strong> ferramentas serão listadas para inspeção
              </p>
            </div>
          )}

          {tipoInspecao === 'caminhao' && novaInspecaoForm.caminhao_id && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>{ferramentas.filter(f => f.caminhao_id === novaInspecaoForm.caminhao_id).length}</strong> ferramentas serão listadas para inspeção
              </p>
            </div>
          )}
        </div>
      </SheetModalComponent>

      {/* Modal Detalhe da Inspeção */}
      {inspecaoSelecionada && (
        <InspecaoDetalheModal
          open={showInspecaoDetalhe}
          onOpenChange={setShowInspecaoDetalhe}
          inspecao={inspecaoSelecionada}
          onComplete={() => {
            loadData();
            setInspecaoSelecionada(null);
          }}
          onEditar={(ferramenta) => {
            navigate(createPageUrl('Ferramental'));
          }}
          onExcluir={async (ferramenta) => {
            try {
              await base44.entities.Ferramenta.delete(ferramenta.id);
              toast.success('Ferramenta excluída');
              loadData();
            } catch (error) {
              console.error('Erro ao excluir:', error);
              toast.error('Erro ao excluir ferramenta');
            }
          }}
        />
      )}
    </div>
  );
}