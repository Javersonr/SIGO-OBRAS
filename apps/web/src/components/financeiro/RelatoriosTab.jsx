import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DRERelatorio from './DRERelatorio';
import BalancoPatrimonial from './BalancoPatrimonial';
import EvolucaoDespesas from './EvolucaoDespesas';
import ApuracaoResultados from './ApuracaoResultados';
import IndicesFinanceiros from './IndicesFinanceiros';
import FluxoCaixaRelatorio from './FluxoCaixaRelatorio';
import FiltrosAvancados from './FiltrosAvancados';
import GraficosComparativos from './GraficosComparativos';
import RelatoriosCustomizados from './RelatoriosCustomizados';
import AssistenteIA from './AssistenteIA';
import InsightsIA from './InsightsIA';
import SugestoesVisualizacao from './SugestoesVisualizacao';

export default function RelatoriosTab({ transacoes, contas, categorias }) {
  const { empresaAtiva, user } = useEmpresa();
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    categoriaId: 'all',
    centroCustoId: 'all',
    contaId: 'all',
    projetoId: 'all',
    versao: 'real'
  });
  const [tipoRelatorio, setTipoRelatorio] = useState('dre');
  const [centrosCusto, setCentrosCusto] = useState([]);

  React.useEffect(() => {
    if (!empresaAtiva?.id) return;
    let cancelled = false;
    base44.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id })
      .then(data => { if (!cancelled) setCentrosCusto(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [empresaAtiva?.id]);

  const handleAplicarFiltrosIA = (novosFiltros, tipo) => {
    setFiltros({ ...filtros, ...novosFiltros });
    setTipoRelatorio(tipo);
  };

  const handleAplicarSugestao = (sugestao) => {
    // Aplicar sugestão de visualização
    console.log('Aplicando sugestão:', sugestao);
  };

  const handleSalvarTemplate = async (nome) => {
    try {
      await base44.entities.RelatorioCustomizado.create({
        empresa_id: empresaAtiva.id,
        usuario_id: user?.id,
        nome,
        tipo: 'Personalizado',
        filtros: JSON.stringify(filtros),
        publico: false,
        favorito: false
      });
      alert('Template salvo com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      alert('Erro ao salvar template');
    }
  };

  const handleCarregarTemplate = (filtrosTemplate) => {
    setFiltros(filtrosTemplate);
  };

  // Filtrar transações
  const transacoesFiltradas = transacoes.filter(t => {
    const data = t.data_vencimento || t.created_date;
    if (filtros.dataInicio && data < filtros.dataInicio) return false;
    if (filtros.dataFim && data > filtros.dataFim) return false;
    if (filtros.categoriaId !== 'all' && t.categoria_id !== filtros.categoriaId) return false;
    if (filtros.centroCustoId !== 'all' && t.centro_custo_id !== filtros.centroCustoId) return false;
    if (filtros.contaId !== 'all' && t.conta_id !== filtros.contaId) return false;
    if (filtros.projetoId !== 'all' && t.projeto_id !== filtros.projetoId) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header com Templates */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Relatórios Gerenciais</h2>
          <p className="text-sm text-slate-500 mt-1">
            Demonstrativos financeiros customizáveis com gráficos comparativos
          </p>
        </div>
        <RelatoriosCustomizados onCarregarTemplate={handleCarregarTemplate} />
      </div>

      {/* Assistente IA */}
      <AssistenteIA 
        transacoes={transacoesFiltradas}
        onAplicarFiltros={handleAplicarFiltrosIA}
        categorias={categorias}
        centrosCusto={centrosCusto}
      />

      {/* Filtros Avançados */}
      <FiltrosAvancados 
        filtros={filtros}
        onFiltrosChange={setFiltros}
        categorias={categorias}
        onSalvarTemplate={handleSalvarTemplate}
      />

      {/* Insights IA */}
      <InsightsIA 
        transacoes={transacoesFiltradas}
        categorias={categorias}
        tipo={tipoRelatorio}
      />

      {/* Sugestões de Visualização */}
      <SugestoesVisualizacao 
        transacoes={transacoesFiltradas}
        tipo={tipoRelatorio}
        onAplicarSugestao={handleAplicarSugestao}
      />

      {/* Gráficos Comparativos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficosComparativos 
          transacoes={transacoesFiltradas} 
          filtros={filtros}
          tipo="dre"
        />
        <GraficosComparativos 
          transacoes={transacoesFiltradas} 
          filtros={filtros}
          tipo="fluxo"
        />
      </div>

      <GraficosComparativos 
        transacoes={transacoesFiltradas} 
        filtros={filtros}
        tipo="margens"
      />

      <Tabs defaultValue="dre" className="w-full" onValueChange={setTipoRelatorio}>
        <TabsList className="grid w-full grid-cols-6 bg-slate-100">
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="balanco">Balanço</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="indices">Índices</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
          <TabsTrigger value="apuracao">Apuração</TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="space-y-4">
          <DRERelatorio transacoes={transacoesFiltradas} versao={filtros.versao} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} categorias={categorias} />
        </TabsContent>

        <TabsContent value="balanco" className="space-y-4">
          <BalancoPatrimonial transacoes={transacoesFiltradas} contas={contas} versao={filtros.versao} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} />
        </TabsContent>

        <TabsContent value="fluxo" className="space-y-4">
          <FluxoCaixaRelatorio transacoes={transacoesFiltradas} contas={contas} versao={filtros.versao} dataInicio={filtros.dataInicio} dataFim={filtros.dataFim} />
        </TabsContent>

        <TabsContent value="indices" className="space-y-4">
          <IndicesFinanceiros transacoes={transacoesFiltradas} contas={contas} versao={filtros.versao} />
        </TabsContent>

        <TabsContent value="evolucao" className="space-y-4">
          <EvolucaoDespesas transacoes={transacoesFiltradas} categorias={categorias} versao={filtros.versao} />
        </TabsContent>

        <TabsContent value="apuracao" className="space-y-4">
          <ApuracaoResultados transacoes={transacoesFiltradas} categorias={categorias} versao={filtros.versao} />
        </TabsContent>
      </Tabs>

      {filtros.versao === 'contabil' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-sm text-amber-800">
              <strong>Regime Contábil:</strong> Mostra apenas transações com nota fiscal (NF-e) para conformidade contábil.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}