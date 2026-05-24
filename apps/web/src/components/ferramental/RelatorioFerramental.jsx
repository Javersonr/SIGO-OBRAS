import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, Download, Filter, AlertTriangle, MapPin, Package, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import RelatorioFuncao from './RelatorioFuncao';
import AlertasConformidadeFerramental from './AlertasConformidadeFerramental';

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const statusColors = {
  'Disponível': 'bg-green-100 text-green-700',
  'Em Uso': 'bg-blue-100 text-blue-700',
  'Em Manutenção': 'bg-orange-100 text-orange-700',
  'Danificado': 'bg-red-100 text-red-700',
  'Inativo': 'bg-slate-100 text-slate-700',
  'Sucata': 'bg-red-100 text-red-700',
};

export default function RelatorioFerramental({ ferramentas, movimentacoes, almoxarifados, empresaAtiva }) {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterLocalizacao, setFilterLocalizacao] = useState('all');

  // Filtrar dados
  const dadosFiltrados = useMemo(() => {
    let ferrFiltradas = ferramentas;

    if (filterTipo !== 'all') {
      ferrFiltradas = ferrFiltradas.filter(f => f.tipo === filterTipo);
    }

    if (filterLocalizacao !== 'all') {
      ferrFiltradas = ferrFiltradas.filter(f => f.localizacao === filterLocalizacao);
    }

    let movFiltradas = movimentacoes;
    if (dataInicio) {
      movFiltradas = movFiltradas.filter(m => {
        const data = m.data_movimentacao || m.created_date;
        return new Date(data) >= new Date(dataInicio);
      });
    }
    if (dataFim) {
      movFiltradas = movFiltradas.filter(m => {
        const data = m.data_movimentacao || m.created_date;
        return new Date(data) <= new Date(dataFim);
      });
    }

    return { ferrFiltradas, movFiltradas };
  }, [ferramentas, movimentacoes, filterTipo, filterLocalizacao, dataInicio, dataFim]);

  // 1. Ferramentas por Localização
  const ferramentasPorLocalizacao = useMemo(() => {
    const grupos = {};
    dadosFiltrados.ferrFiltradas.forEach(f => {
      const local = f.localizacao || 'Sem localização';
      grupos[local] = (grupos[local] || 0) + 1;
    });
    return Object.entries(grupos).map(([nome, quantidade]) => ({
      nome,
      quantidade,
      percentual: ((quantidade / dadosFiltrados.ferrFiltradas.length) * 100).toFixed(1)
    }));
  }, [dadosFiltrados]);

  // 2. Ferramentas por Status
  const ferramentasPorStatus = useMemo(() => {
    const grupos = {};
    dadosFiltrados.ferrFiltradas.forEach(f => {
      const status = f.status || 'Desconhecido';
      grupos[status] = (grupos[status] || 0) + 1;
    });
    return Object.entries(grupos).map(([nome, quantidade]) => ({
      nome,
      quantidade,
      percentual: ((quantidade / dadosFiltrados.ferrFiltradas.length) * 100).toFixed(1)
    }));
  }, [dadosFiltrados]);

  // 3. Ferramentas com vencimento próximo (próximos 30 dias)
  const ferramentasVencimento = useMemo(() => {
    const hoje = new Date();
    const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

    return dadosFiltrados.ferrFiltradas.filter(f => {
      if (!f.data_vencimento_laudo) return false;
      const dataVenc = new Date(f.data_vencimento_laudo);
      return dataVenc >= hoje && dataVenc <= em30dias;
    }).sort((a, b) => new Date(a.data_vencimento_laudo) - new Date(b.data_vencimento_laudo));
  }, [dadosFiltrados]);

  // 4. Histórico de movimentações por período
  const movimentacoesPorPeriodo = useMemo(() => {
    const grupos = {};
    dadosFiltrados.movFiltradas.forEach(m => {
      const data = (m.data_movimentacao || m.created_date).split('T')[0];
      if (!grupos[data]) {
        grupos[data] = { entrada: 0, saida: 0, manutencao: 0, outras: 0 };
      }
      const tipo = m.tipo_movimentacao || 'outras';
      if (tipo.includes('Entrada')) grupos[data].entrada++;
      else if (tipo.includes('Saida') || tipo.includes('Entrega')) grupos[data].saida++;
      else if (tipo.includes('Manutenção')) grupos[data].manutencao++;
      else grupos[data].outras++;
    });

    return Object.entries(grupos)
      .map(([data, valores]) => ({ data, ...valores }))
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .slice(-30); // Últimos 30 dias
  }, [dadosFiltrados]);

  // Estatísticas gerais
  const stats = useMemo(() => {
    const total = dadosFiltrados.ferrFiltradas.length;
    const disponivel = dadosFiltrados.ferrFiltradas.filter(f => f.status === 'Disponível').length;
    const emUso = dadosFiltrados.ferrFiltradas.filter(f => f.status === 'Em Uso').length;
    const manutencao = dadosFiltrados.ferrFiltradas.filter(f => f.status === 'Em Manutenção').length;
    const valorTotal = dadosFiltrados.ferrFiltradas.reduce((sum, f) => sum + (f.valor_unitario || 0), 0);

    return { total, disponivel, emUso, manutencao, valorTotal };
  }, [dadosFiltrados]);

  const handleExportarCSV = (dados, nomeArquivo) => {
    let csv = '';
    if (dados.length === 0) {
      toast.error('Sem dados para exportar');
      return;
    }

    const headers = Object.keys(dados[0]);
    csv = headers.join(';') + '\n';
    csv += dados.map(row =>
      headers.map(header =>
        String(row[header] || '').includes(';') ? `"${row[header]}"` : row[header]
      ).join(';')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Relatório exportado');
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Tipo de Ferramenta</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="Ferramenta">Ferramenta</SelectItem>
                  <SelectItem value="EPI">EPI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Localização</Label>
              <Select value={filterLocalizacao} onValueChange={setFilterLocalizacao}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as localizações</SelectItem>
                  {almoxarifados.map(local => (
                    <SelectItem key={local} value={local}>{local}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Data Final</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas Gerais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total de Ferramentas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.total}</div>
            <p className="text-xs text-slate-500 mt-1">unidades no estoque</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Disponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.disponivel}</div>
            <p className="text-xs text-slate-500 mt-1">prontas para uso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Em Uso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.emUso}</div>
            <p className="text-xs text-slate-500 mt-1">com funcionários</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800">R$ {stats.valorTotal.toFixed(2)}</div>
            <p className="text-xs text-slate-500 mt-1">valor do estoque</p>
          </CardContent>
        </Card>
      </div>

      {/* Relatórios */}
      <Tabs defaultValue="localizacao" className="w-full">
      {/* Alertas de Conformidade */}
      <AlertasConformidadeFerramental empresaAtiva={empresaAtiva} />

        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="localizacao" className="text-xs sm:text-sm">Por Local</TabsTrigger>
          <TabsTrigger value="status" className="text-xs sm:text-sm">Por Status</TabsTrigger>
          <TabsTrigger value="vencimento" className="text-xs sm:text-sm">Vencimento</TabsTrigger>
          <TabsTrigger value="funcao" className="text-xs sm:text-sm">Por Função</TabsTrigger>
          <TabsTrigger value="movimentacoes" className="text-xs sm:text-sm">Movimentações</TabsTrigger>
        </TabsList>

        {/* 1. Ferramentas por Localização */}
        <TabsContent value="localizacao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico */}
            {ferramentasPorLocalizacao.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Distribuição por Localização</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ferramentasPorLocalizacao}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nome" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="quantidade" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Tabela */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Detalhes por Local</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportarCSV(ferramentasPorLocalizacao, 'relatorio_localizacao')}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Exportar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ferramentasPorLocalizacao.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium">{item.nome}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-amber-600">{item.quantidade}</div>
                        <div className="text-xs text-slate-500">{item.percentual}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. Ferramentas por Status */}
        <TabsContent value="status" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico Pizza */}
            {ferramentasPorStatus.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Distribuição por Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={ferramentasPorStatus}
                        dataKey="quantidade"
                        nameKey="nome"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {ferramentasPorStatus.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Tabela */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Detalhes por Status</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportarCSV(ferramentasPorStatus, 'relatorio_status')}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Exportar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ferramentasPorStatus.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[item.nome] + ' text-xs'}>{item.nome}</Badge>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-800">{item.quantidade}</div>
                        <div className="text-xs text-slate-500">{item.percentual}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. Ferramentas com Vencimento Próximo */}
        <TabsContent value="vencimento">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  Laudos com Vencimento nos Próximos 30 Dias ({ferramentasVencimento.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const dados = ferramentasVencimento.map(f => ({
                      codigo: f.codigo,
                      descricao: f.descricao,
                      numero_laudo: f.numero_laudo,
                      data_vencimento: f.data_vencimento_laudo,
                      localizacao: f.localizacao,
                      status: f.status
                    }));
                    handleExportarCSV(dados, 'relatorio_vencimento');
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ferramentasVencimento.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Nenhuma ferramenta com vencimento próximo</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Nº Laudo</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ferramentasVencimento.map((f) => {
                        const diasRestantes = Math.ceil(
                          (new Date(f.data_vencimento_laudo) - new Date()) / (1000 * 60 * 60 * 24)
                        );
                        const urgente = diasRestantes <= 7;

                        return (
                          <TableRow key={f.id} className={urgente ? 'bg-red-50' : ''}>
                            <TableCell className="font-mono text-sm">{f.codigo}</TableCell>
                            <TableCell className="font-medium">{f.descricao}</TableCell>
                            <TableCell>{f.numero_laudo || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                <span>{new Date(f.data_vencimento_laudo).toLocaleDateString('pt-BR')}</span>
                                <Badge className={urgente ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}>
                                  {diasRestantes}d
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{f.localizacao || '-'}</TableCell>
                            <TableCell>
                              <Badge className={statusColors[f.status] + ' text-xs'}>{f.status}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Por Função */}
        <TabsContent value="funcao" className="space-y-4">
          <RelatorioFuncao empresaAtiva={empresaAtiva} />
        </TabsContent>

        {/* 5. Histórico de Movimentações */}
        <TabsContent value="movimentacoes" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico */}
            {movimentacoesPorPeriodo.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Movimentações nos Últimos 30 Dias</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={movimentacoesPorPeriodo}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="entrada" stackId="a" fill="#10b981" name="Entrada" />
                      <Bar dataKey="saida" stackId="a" fill="#3b82f6" name="Saída" />
                      <Bar dataKey="manutencao" stackId="a" fill="#f59e0b" name="Manutenção" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Tabela de Movimentações */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Últimas Movimentações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {dadosFiltrados.movFiltradas.slice(-20).reverse().map((mov) => (
                    <div key={mov.id} className="p-2 bg-slate-50 rounded text-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium">{mov.ferramenta_descricao || mov.tipo_movimentacao}</p>
                          <p className="text-xs text-slate-500">{mov.tipo_movimentacao}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary" className="text-xs">+{mov.quantidade || 1}</Badge>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(mov.data_movimentacao || mov.created_date).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}