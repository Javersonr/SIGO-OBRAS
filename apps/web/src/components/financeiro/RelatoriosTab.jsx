import React, { useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import {
  dataReferencia,
  expandirParcelas,
  tipoRelatorioValido,
} from "@/lib/relatorios-financeiros";
import { useEmpresa } from "../../Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DRERelatorio from "./DRERelatorio";
import BalancoPatrimonial from "./BalancoPatrimonial";
import EvolucaoDespesas from "./EvolucaoDespesas";
import ApuracaoResultados from "./ApuracaoResultados";
import IndicesFinanceiros from "./IndicesFinanceiros";
import FluxoCaixaRelatorio from "./FluxoCaixaRelatorio";
import FiltrosAvancados from "./FiltrosAvancados";
import GraficosComparativos from "./GraficosComparativos";
import RelatoriosCustomizados from "./RelatoriosCustomizados";
import AssistenteIA from "./AssistenteIA";
import InsightsIA from "./InsightsIA";
import SugestoesVisualizacao from "./SugestoesVisualizacao";

// Filtro de seleção ("all" ou vazio = não filtra — template antigo sem a chave
// não pode zerar o relatório).
const ativo = (v) => v && v !== "all";

export default function RelatoriosTab({ transacoes, contas, categorias }) {
  const { empresaAtiva, user } = useEmpresa();
  const [filtros, setFiltros] = useState({
    dataInicio: "",
    dataFim: "",
    categoriaId: "all",
    centroCustoId: "all",
    contaId: "all",
    projetoId: "all",
    versao: "real",
  });
  const [tipoRelatorio, setTipoRelatorio] = useState("dre");
  const [centrosCusto, setCentrosCusto] = useState([]);

  React.useEffect(() => {
    if (!empresaAtiva?.id) return;
    let cancelled = false;
    sigo.entities.CentroCusto.filter({ empresa_id: empresaAtiva.id })
      .then((data) => {
        if (!cancelled) setCentrosCusto(data);
      })
      .catch((err) => {
        console.warn("[RelatoriosTab] falha carregando centros de custo:", err);
        if (!cancelled) setCentrosCusto([]);
      });
    return () => {
      cancelled = true;
    };
  }, [empresaAtiva?.id]);

  const handleAplicarFiltrosIA = (novosFiltros, tipo) => {
    setFiltros((atual) => ({ ...atual, ...novosFiltros }));
    // Tabs agora é controlado: um tipo que não é aba ("comparacao", "lista")
    // deixaria a tela sem conteúdo — nesse caso mantém a aba atual.
    const tipoValido = tipoRelatorioValido(tipo);
    if (tipoValido) setTipoRelatorio(tipoValido);
  };

  const handleAplicarSugestao = (sugestao) => {
    // Aplicar sugestão de visualização
    console.log("Aplicando sugestão:", sugestao);
  };

  const handleSalvarTemplate = async (nome) => {
    try {
      await sigo.entities.RelatorioCustomizado.create({
        empresa_id: empresaAtiva.id,
        usuario_id: user?.id,
        nome,
        tipo: "Personalizado",
        // filtros é JSONB no banco. Antes salvava JSON.stringify(...) que
        // armazenava como texto literal — quebrava queries jsonb_extract_path.
        filtros: filtros || {},
        publico: false,
        favorito: false,
      });
      alert("Template salvo com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar template:", error);
      alert("Erro ao salvar template");
    }
  };

  const handleCarregarTemplate = (filtrosTemplate) => {
    setFiltros(filtrosTemplate);
  };

  // Filtrar transações
  //
  // Defense-in-depth: o componente pai (Financeiro.jsx) carrega só transações
  // da empresaAtiva, mas se algum dia esse contrato mudar, queremos garantir
  // que relatórios JAMAIS mostrem dados de outra empresa. RLS no Supabase já
  // protege contra leak via API, mas dados em memória podem vir contaminados
  // por bug no caller.
  //
  // Memoizado: antes o filter rodava a cada render e gerava um array novo, que
  // disparava de novo os efeitos que chamam a IA (InsightsIA/Sugestões).
  const empresaId = empresaAtiva?.id;
  const { dataInicio, dataFim, categoriaId, centroCustoId, contaId, projetoId } = filtros;

  // Todas as transações da empresa, com as parceladas abertas em uma linha por
  // parcela (valor, vencimento e pagamento de cada uma, como no extrato). É
  // também a base do saldo das contas numa data passada (Balanço/Índices).
  const transacoesEmpresa = useMemo(
    () =>
      expandirParcelas(
        (transacoes || []).filter((t) => !(empresaId && t.empresa_id && t.empresa_id !== empresaId))
      ),
    [transacoes, empresaId]
  );

  // Todos os filtros MENOS o de data: base do comparativo "período anterior"
  // (antes recebia só o período atual e o "Anterior" saía sempre zerado).
  const transacoesSemPeriodo = useMemo(
    () =>
      transacoesEmpresa.filter((t) => {
        if (ativo(categoriaId) && t.categoria_id !== categoriaId) return false;
        if (ativo(centroCustoId) && t.centro_custo_id !== centroCustoId) return false;
        if (ativo(contaId) && t.conta_id !== contaId) return false;
        if (ativo(projetoId) && t.projeto_id !== projetoId) return false;
        return true;
      }),
    [transacoesEmpresa, categoriaId, centroCustoId, contaId, projetoId]
  );

  const transacoesFiltradas = useMemo(
    () =>
      transacoesSemPeriodo.filter((t) => {
        const data = dataReferencia(t);
        if (dataInicio && data < dataInicio) return false;
        if (dataFim && data > dataFim) return false;
        return true;
      }),
    [transacoesSemPeriodo, dataInicio, dataFim]
  );

  // Balanço/liquidez são POSIÇÃO na data fim e recebem as transações sem o
  // corte de período: o que estava em aberto naquela data (inclusive com
  // vencimento depois dela) é decidido em calcularBalanco/calcularIndices.

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
      <InsightsIA transacoes={transacoesFiltradas} categorias={categorias} />

      {/* Sugestões de Visualização */}
      <SugestoesVisualizacao
        transacoes={transacoesFiltradas}
        tipo={tipoRelatorio}
        onAplicarSugestao={handleAplicarSugestao}
      />

      {/* Gráficos Comparativos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* "dre" compara atual × anterior: precisa das transações sem o corte de data */}
        <GraficosComparativos transacoes={transacoesSemPeriodo} filtros={filtros} tipo="dre" />
        <GraficosComparativos transacoes={transacoesFiltradas} filtros={filtros} tipo="fluxo" />
      </div>

      <GraficosComparativos transacoes={transacoesFiltradas} filtros={filtros} tipo="margens" />

      {/* Controlado: antes era defaultValue e o tipo escolhido pela IA não trocava a aba */}
      <Tabs value={tipoRelatorio} className="w-full" onValueChange={setTipoRelatorio}>
        <TabsList className="grid w-full grid-cols-6 bg-slate-100">
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="balanco">Balanço</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="indices">Índices</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
          <TabsTrigger value="apuracao">Apuração</TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="space-y-4">
          <DRERelatorio
            transacoes={transacoesFiltradas}
            versao={filtros.versao}
            dataInicio={filtros.dataInicio}
            dataFim={filtros.dataFim}
          />
        </TabsContent>

        <TabsContent value="balanco" className="space-y-4">
          <BalancoPatrimonial
            transacoes={transacoesSemPeriodo}
            transacoesCaixa={transacoesEmpresa}
            contas={contas}
            versao={filtros.versao}
            dataFim={filtros.dataFim}
          />
        </TabsContent>

        <TabsContent value="fluxo" className="space-y-4">
          <FluxoCaixaRelatorio
            transacoes={transacoesFiltradas}
            contas={contas}
            versao={filtros.versao}
            dataInicio={filtros.dataInicio}
            dataFim={filtros.dataFim}
          />
        </TabsContent>

        <TabsContent value="indices" className="space-y-4">
          <IndicesFinanceiros
            transacoes={transacoesFiltradas}
            transacoesPosicao={transacoesSemPeriodo}
            transacoesCaixa={transacoesEmpresa}
            contas={contas}
            versao={filtros.versao}
            dataInicio={filtros.dataInicio}
            dataFim={filtros.dataFim}
          />
        </TabsContent>

        <TabsContent value="evolucao" className="space-y-4">
          <EvolucaoDespesas
            transacoes={transacoesFiltradas}
            categorias={categorias}
            versao={filtros.versao}
          />
        </TabsContent>

        <TabsContent value="apuracao" className="space-y-4">
          <ApuracaoResultados
            transacoes={transacoesFiltradas}
            categorias={categorias}
            versao={filtros.versao}
          />
        </TabsContent>
      </Tabs>

      {filtros.versao === "contabil" && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-sm text-amber-800">
              <strong>Regime Contábil:</strong> Mostra apenas transações com nota fiscal (NF-e) para
              conformidade contábil.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
