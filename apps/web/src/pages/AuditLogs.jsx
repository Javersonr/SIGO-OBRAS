import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { format } from 'date-fns';
import { Search, Filter, RefreshCw, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuditLogs() {
  const { empresaAtiva } = useEmpresa();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    tipo_acao: '',
    entidade: '',
    usuario_email: '',
    data_inicio: '',
    data_fim: ''
  });

  const tiposAcao = ['criar', 'editar', 'deletar', 'visualizar', 'exportar', 'imprimir', 'configurar'];
  const entidades = ['Funcao', 'Funcionario', 'Ferramenta', 'EPI', 'Treinamento', 'Certificado', 'Empresa', 'UsuarioEmpresa'];

  const carregarLogs = async () => {
    if (!empresaAtiva?.id) return;

    setLoading(true);
    try {
      let query = { empresa_id: empresaAtiva.id };

      if (filters.tipo_acao) query.tipo_acao = filters.tipo_acao;
      if (filters.entidade) query.entidade = filters.entidade;
      if (filters.usuario_email) query.usuario_email = filters.usuario_email;

      const auditLogs = await base44.entities.AuditLog.filter(query);

      // Filtrar por datas se necessário
      let filtered = auditLogs;
      if (filters.data_inicio || filters.data_fim) {
        filtered = auditLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          if (filters.data_inicio && logDate < new Date(filters.data_inicio)) return false;
          if (filters.data_fim) {
            const endDate = new Date(filters.data_fim);
            endDate.setHours(23, 59, 59, 999);
            if (logDate > endDate) return false;
          }
          return true;
        });
      }

      // Ordenar por timestamp descendente
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLogs(filtered);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarLogs();
  }, [empresaAtiva?.id]);

  const handleFiltrar = () => {
    carregarLogs();
  };

  const handleLimparFiltros = () => {
    setFilters({
      tipo_acao: '',
      entidade: '',
      usuario_email: '',
      data_inicio: '',
      data_fim: ''
    });
  };

  const exportarLogs = () => {
    const csv = [
      ['Data/Hora', 'Usuário', 'Ação', 'Entidade', 'Descrição', 'Status'].join(','),
      ...logs.map(log =>
        [
          format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss'),
          log.usuario_email,
          log.tipo_acao,
          log.entidade,
          `"${log.descricao.replace(/"/g, '""')}"`,
          log.status
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status) => {
    return status === 'sucesso' ? 'text-green-600' : 'text-red-600';
  };

  const getAcaoColor = (tipo) => {
    const colors = {
      criar: 'bg-blue-100 text-blue-800',
      editar: 'bg-yellow-100 text-yellow-800',
      deletar: 'bg-red-100 text-red-800',
      visualizar: 'bg-gray-100 text-gray-800',
      exportar: 'bg-purple-100 text-purple-800',
      imprimir: 'bg-indigo-100 text-indigo-800',
      configurar: 'bg-orange-100 text-orange-800'
    };
    return colors[tipo] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Logs de Auditoria</h1>
        <p className="text-gray-600 mt-2">Visualize histórico de todas as ações realizadas no sistema</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Tipo de Ação</label>
              <Select value={filters.tipo_acao} onValueChange={(value) => setFilters({...filters, tipo_acao: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todos</SelectItem>
                  {tiposAcao.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Entidade</label>
              <Select value={filters.entidade} onValueChange={(value) => setFilters({...filters, entidade: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todas</SelectItem>
                  {entidades.map(ent => (
                    <SelectItem key={ent} value={ent}>{ent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Email do Usuário</label>
              <Input
                placeholder="Digite o email..."
                value={filters.usuario_email}
                onChange={(e) => setFilters({...filters, usuario_email: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data Início</label>
              <Input
                type="date"
                value={filters.data_inicio}
                onChange={(e) => setFilters({...filters, data_inicio: e.target.value})}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Data Fim</label>
              <Input
                type="date"
                value={filters.data_fim}
                onChange={(e) => setFilters({...filters, data_fim: e.target.value})}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleFiltrar} className="gap-2">
              <Filter className="w-4 h-4" />
              Filtrar
            </Button>
            <Button variant="outline" onClick={handleLimparFiltros}>
              Limpar Filtros
            </Button>
            <Button variant="outline" onClick={() => carregarLogs()} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={exportarLogs} className="gap-2 ml-auto">
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {logs.length > 0 ? `${logs.length} Registro(s)` : 'Nenhum registro encontrado'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Nenhum log de auditoria encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="text-sm">
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell>{log.usuario_email}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getAcaoColor(log.tipo_acao)}`}>
                          {log.tipo_acao}
                        </span>
                      </TableCell>
                      <TableCell>{log.entidade}</TableCell>
                      <TableCell className="max-w-xs truncate">{log.descricao}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${getStatusColor(log.status)}`}>
                          {log.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}