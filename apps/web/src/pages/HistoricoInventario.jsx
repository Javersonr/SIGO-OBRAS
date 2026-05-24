import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '@/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Eye, Download, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import HistoricoInventarioFilters from '@/components/ferramental/HistoricoInventarioFilters';
import HistoricoDetalhesModal from '@/components/ferramental/HistoricoDetalhesModal';

export default function HistoricoInventario() {
  const { empresaAtiva } = useEmpresa();
  const [historico, setHistorico] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [itemSelecionado, setItemSelecionado] = useState(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 20;

  const [filtros, setFiltros] = useState({
    ferramenta: '',
    usuario: '',
    dataInicio: '',
    dataFim: '',
    tipoOperacao: '',
    busca: ''
  });

  // Carregar dados iniciais
  useEffect(() => {
    if (!empresaAtiva?.id) return;
    carregarDados();
  }, [empresaAtiva?.id]);

  // Recarregar quando filtros mudam
  useEffect(() => {
    if (!empresaAtiva?.id) return;
    setPage(0);
    carregarHistorico(0);
  }, [filtros, empresaAtiva?.id]);

  const carregarDados = async () => {
    try {
      setCarregando(true);
      
      // Carregar ferramentas
      const ferrs = await base44.entities.Ferramenta.filter({
        empresa_id: empresaAtiva.id,
        ativo: true
      });
      setFerramentas(ferrs);

      // Carregar usuários únicos do histórico
      const hist = await base44.entities.InventarioHistorico.filter({
        empresa_id: empresaAtiva.id,
        ativo: true
      }, '-timestamp', 1000);
      
      const usuariosUnicos = [...new Map(
        hist.map(h => [h.usuario_email, h])
      ).values()].map(h => ({
        email: h.usuario_email,
        nome: h.usuario_nome
      }));

      setUsuarios(usuariosUnicos);
      setTotalItems(hist.length);
      
      carregarHistorico(0);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setCarregando(false);
    }
  };

  const carregarHistorico = async (pageNum = 0) => {
    try {
      let query = { empresa_id: empresaAtiva.id, ativo: true };

      if (filtros.ferramenta) query.ferramenta_id = filtros.ferramenta;
      if (filtros.usuario) query.usuario_email = filtros.usuario;
      if (filtros.tipoOperacao) query.tipo_operacao = filtros.tipoOperacao;

      let hist = await base44.entities.InventarioHistorico.filter(
        query,
        '-timestamp',
        10000
      );

      // Aplicar filtros de data
      if (filtros.dataInicio) {
        const dataInicio = new Date(filtros.dataInicio);
        hist = hist.filter(h => new Date(h.timestamp) >= dataInicio);
      }
      if (filtros.dataFim) {
        const dataFim = new Date(filtros.dataFim);
        dataFim.setHours(23, 59, 59, 999);
        hist = hist.filter(h => new Date(h.timestamp) <= dataFim);
      }

      // Aplicar busca
      if (filtros.busca) {
        const busca = filtros.busca.toLowerCase();
        hist = hist.filter(h =>
          h.ferramenta_codigo?.toLowerCase().includes(busca) ||
          h.ferramenta_descricao?.toLowerCase().includes(busca)
        );
      }

      setTotalItems(hist.length);
      const inicio = pageNum * pageSize;
      setHistorico(hist.slice(inicio, inicio + pageSize));
      setPage(pageNum);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      toast.error('Erro ao carregar histórico');
    }
  };

  const exportarCSV = () => {
    try {
      const headers = [
        'Data',
        'Ferramenta',
        'Código',
        'Quantidade',
        'Localização',
        'Tipo',
        'Usuário',
        'Método',
        'Confiança IA'
      ];

      const rows = historico.map(h => [
        format(new Date(h.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        h.ferramenta_descricao,
        h.ferramenta_codigo,
        h.quantidade,
        h.localizacao,
        h.tipo_operacao,
        h.usuario_nome,
        h.metodo_identificacao,
        `${h.confianca_ia || 0}%`
      ]);

      const csv = [
        headers.join(';'),
        ...rows.map(r => r.map(v => `"${v}"`).join(';'))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `historico_inventario_${format(new Date(), 'ddMMyyyy')}.csv`;
      link.click();

      toast.success('Arquivo exportado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar arquivo');
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-slate-600">Carregando histórico...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Histórico de Inventário</h1>
          <p className="text-slate-600 mt-1">
            {totalItems} registros encontrados
          </p>
        </div>
        <Button
          onClick={exportarCSV}
          disabled={historico.length === 0}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <HistoricoInventarioFilters
        filtros={filtros}
        onFiltrosChange={setFiltros}
        usuarios={usuarios}
        ferramentas={ferramentas}
      />

      {/* Tabela */}
      <Card className="overflow-hidden border-slate-200">
        {historico.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow>
                  <TableHead className="text-xs font-semibold text-slate-700">Data/Hora</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Ferramenta</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 text-right">Quantidade</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Localização</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Tipo</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Usuário</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Método</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 text-center">IA</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 text-center">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((item) => {
                  const confianca = item.confianca_ia || 0;
                  let confiancaCor = 'bg-red-100 text-red-800';
                  if (confianca >= 80) confiancaCor = 'bg-green-100 text-green-800';
                  else if (confianca >= 60) confiancaCor = 'bg-yellow-100 text-yellow-800';

                  return (
                    <TableRow key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <TableCell className="text-xs text-slate-900 whitespace-nowrap">
                        {format(new Date(item.timestamp), 'dd/MM HH:mm', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-slate-900">{item.ferramenta_descricao}</div>
                        <div className="text-xs text-slate-500">{item.ferramenta_codigo}</div>
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-slate-900 text-right">
                        {item.quantidade}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">{item.localizacao}</TableCell>
                      <TableCell>
                        <Badge className="text-xs capitalize bg-blue-100 text-blue-800">
                          {item.tipo_operacao}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700 whitespace-nowrap">
                        {item.usuario_nome}
                      </TableCell>
                      <TableCell>
                        <Badge className="text-xs bg-slate-100 text-slate-800">
                          {item.metodo_identificacao}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.confianca_ia !== undefined && (
                          <Badge className={`text-xs ${confiancaCor}`}>
                            {item.confianca_ia}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setItemSelecionado(item);
                            setShowDetalhes(true);
                          }}
                          className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-slate-600">Nenhum registro encontrado</p>
          </div>
        )}
      </Card>

      {/* Paginação */}
      {totalItems > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Mostrando {page * pageSize + 1} a {Math.min((page + 1) * pageSize, totalItems)} de {totalItems}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => carregarHistorico(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              onClick={() => carregarHistorico(page + 1)}
              disabled={(page + 1) * pageSize >= totalItems}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      <HistoricoDetalhesModal
        open={showDetalhes}
        onOpenChange={setShowDetalhes}
        item={itemSelecionado}
      />
    </div>
  );
}