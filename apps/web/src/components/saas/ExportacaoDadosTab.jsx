import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Loader2, CheckCircle2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const ENTIDADES = [
  { key: 'Empresa', label: 'Empresas' },
  { key: 'UsuarioEmpresa', label: 'Usuários de Empresas' },
  { key: 'Plano', label: 'Planos' },
  { key: 'Assinatura', label: 'Assinaturas' },
  { key: 'Cliente', label: 'Clientes' },
  { key: 'Fornecedor', label: 'Fornecedores' },
  { key: 'Projeto', label: 'Projetos' },
  { key: 'Oportunidade', label: 'Oportunidades' },
  { key: 'TransacaoFinanceira', label: 'Transações Financeiras' },
  { key: 'ContaFinanceira', label: 'Contas Financeiras' },
  { key: 'CategoriaFinanceira', label: 'Categorias Financeiras' },
  { key: 'CentroCusto', label: 'Centros de Custo' },
  { key: 'SolicitacaoCompra', label: 'Solicitações de Compra' },
  { key: 'PedidoCompra', label: 'Pedidos de Compra' },
  { key: 'Cotacao', label: 'Cotações' },
  { key: 'Material', label: 'Materiais' },
  { key: 'Almoxarifado', label: 'Almoxarifados' },
  { key: 'EstoqueMovimento', label: 'Movimentos de Estoque' },
  { key: 'Funcionario', label: 'Funcionários' },
  { key: 'Ferramental', label: 'Ferramentais' },
  { key: 'PreLancamento', label: 'Pré-Lançamentos' },
  { key: 'ExtratoBancario', label: 'Extrato Bancário' },
  { key: 'DiarioObra', label: 'Diário de Obra' },
];

export default function ExportacaoDadosTab() {
  const [empresaId, setEmpresaId] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [exportando, setExportando] = useState({});
  const [exportandoTudo, setExportandoTudo] = useState(false);
  const [exportandoTodasEmpresas, setExportandoTodasEmpresas] = useState(false);
  const [progressoTodasEmpresas, setProgressoTodasEmpresas] = useState('');
  const [contagens, setContagens] = useState({});
  const [contagensLoading, setContagensLoading] = useState(false);

  useEffect(() => {
    const carregarEmpresas = async () => {
      setLoadingEmpresas(true);
      try {
        const lista = await base44.entities.Empresa.filter({ ativo: true });
        setEmpresas(lista);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEmpresas(false);
      }
    };
    carregarEmpresas();
  }, []);

  useEffect(() => {
    if (!empresaId) { setContagens({}); return; }
    const carregarContagens = async () => {
      setContagensLoading(true);
      const novasContagens = {};
      await Promise.all(
        ENTIDADES.map(async ({ key }) => {
          try {
            const dados = await base44.entities[key]?.filter?.({ empresa_id: empresaId }) || [];
            novasContagens[key] = dados.length;
          } catch {
            novasContagens[key] = 0;
          }
        })
      );
      setContagens(novasContagens);
      setContagensLoading(false);
    };
    carregarContagens();
  }, [empresaId]);

  const exportarEntidade = async (key, label, formato = 'excel') => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    setExportando(prev => ({ ...prev, [key]: true }));
    try {
      const dados = await base44.entities[key]?.filter?.({ empresa_id: empresaId }) || [];
      if (dados.length === 0) { toast.info(`Sem dados para ${label}`); return; }

      if (formato === 'json') {
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${key}_${empresaId}.json`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
        XLSX.writeFile(wb, `${key}_${empresaId}.xlsx`);
      }
      toast.success(`${label} exportado!`);
    } catch (e) {
      toast.error(`Erro ao exportar ${label}`);
    } finally {
      setExportando(prev => ({ ...prev, [key]: false }));
    }
  };

  const exportarTudo = async (formato = 'excel') => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    setExportandoTudo(true);
    try {
      const empresa = empresas.find(e => e.id === empresaId);
      const nomeArquivo = `backup_${empresa?.nome || empresaId}_${new Date().toISOString().split('T')[0]}`;

      if (formato === 'json') {
        const backup = {};
        await Promise.all(
          ENTIDADES.map(async ({ key }) => {
            try {
              backup[key] = await base44.entities[key]?.filter?.({ empresa_id: empresaId }) || [];
            } catch { backup[key] = []; }
          })
        );
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${nomeArquivo}.json`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        await Promise.all(
          ENTIDADES.map(async ({ key, label }) => {
            try {
              const dados = await base44.entities[key]?.filter?.({ empresa_id: empresaId }) || [];
              if (dados.length > 0) {
                const ws = XLSX.utils.json_to_sheet(dados);
                XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
              }
            } catch {}
          })
        );
        XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
      }
      toast.success('Backup completo exportado!');
    } catch (e) {
      toast.error('Erro ao exportar backup');
    } finally {
      setExportandoTudo(false);
    }
  };

  const exportarTodasEmpresas = async (formato = 'excel') => {
    setExportandoTodasEmpresas(true);
    setProgressoTodasEmpresas('Iniciando...');
    try {
      const nomeArquivo = `backup_todas_empresas_${new Date().toISOString().split('T')[0]}`;

      if (formato === 'json') {
        const backupGeral = {};
        for (let i = 0; i < empresas.length; i++) {
          const emp = empresas[i];
          setProgressoTodasEmpresas(`Exportando ${emp.nome} (${i + 1}/${empresas.length})...`);
          backupGeral[emp.nome] = {};
          await Promise.all(
            ENTIDADES.map(async ({ key }) => {
              try {
                backupGeral[emp.nome][key] = await base44.entities[key]?.filter?.({ empresa_id: emp.id }) || [];
              } catch { backupGeral[emp.nome][key] = []; }
            })
          );
        }
        const blob = new Blob([JSON.stringify(backupGeral, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${nomeArquivo}.json`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        for (let i = 0; i < empresas.length; i++) {
          const emp = empresas[i];
          setProgressoTodasEmpresas(`Exportando ${emp.nome} (${i + 1}/${empresas.length})...`);
          for (const { key, label } of ENTIDADES) {
            try {
              const dados = await base44.entities[key]?.filter?.({ empresa_id: emp.id }) || [];
              if (dados.length > 0) {
                const nomeAba = `${emp.nome.slice(0, 15)}_${label.slice(0, 14)}`.slice(0, 31);
                const ws = XLSX.utils.json_to_sheet(dados);
                XLSX.utils.book_append_sheet(wb, ws, nomeAba);
              }
            } catch {}
          }
        }
        XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
      }
      toast.success('Todas as empresas exportadas!');
    } catch (e) {
      toast.error('Erro ao exportar');
    } finally {
      setExportandoTodasEmpresas(false);
      setProgressoTodasEmpresas('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Exportar TODAS as empresas */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Database className="w-5 h-5" />
            Exportar Todas as Empresas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-blue-700">Exporta os dados de <strong>todas as {empresas.length} empresas</strong> de uma só vez.</p>
          {exportandoTodasEmpresas && (
            <p className="text-sm text-blue-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {progressoTodasEmpresas}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              onClick={() => exportarTodasEmpresas('excel')}
              disabled={exportandoTodasEmpresas || empresas.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {exportandoTodasEmpresas ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Todas as Empresas (Excel)
            </Button>
            <Button
              onClick={() => exportarTodasEmpresas('json')}
              disabled={exportandoTodasEmpresas || empresas.length === 0}
              variant="outline"
              className="border-blue-300"
            >
              {exportandoTodasEmpresas ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Todas as Empresas (JSON)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Seleção de empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Exportação de Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Label>Empresa</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={loadingEmpresas ? 'Carregando...' : 'Selecione a empresa'} />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {empresaId && (
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => exportarTudo('excel')}
                disabled={exportandoTudo}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {exportandoTudo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Exportar Tudo (Excel)
              </Button>
              <Button
                onClick={() => exportarTudo('json')}
                disabled={exportandoTudo}
                variant="outline"
              >
                {exportandoTudo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Exportar Tudo (JSON)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de entidades */}
      {empresaId && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ENTIDADES.map(({ key, label }) => (
            <Card key={key} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    {contagensLoading ? (
                      <p className="text-xs text-slate-400 mt-0.5">Contando...</p>
                    ) : (
                      <Badge variant="outline" className="mt-1 text-xs">
                        {contagens[key] ?? 0} registros
                      </Badge>
                    )}
                  </div>
                  {contagens[key] > 0 && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    disabled={!!exportando[key] || contagens[key] === 0}
                    onClick={() => exportarEntidade(key, label, 'excel')}
                  >
                    {exportando[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Excel'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    disabled={!!exportando[key] || contagens[key] === 0}
                    onClick={() => exportarEntidade(key, label, 'json')}
                  >
                    {exportando[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : 'JSON'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}