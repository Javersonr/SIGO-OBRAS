import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Activity,
  DollarSign,
  Percent,
  PieChart,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { calcularIndices } from "@/lib/relatorios-financeiros";

export default function IndicesFinanceiros({
  transacoes,
  transacoesPosicao,
  transacoesCaixa,
  contas,
  versao = "real",
  dataInicio,
  dataFim,
}) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };

  // null = índice sem base de cálculo (divisor zero) → "n/d", não 0/"Crítico"
  const formatPercent = (value) => (value === null ? "n/d" : `${value.toFixed(2)}%`);
  const formatIndice = (value) => (value === null ? "n/d" : value.toFixed(2));
  const classificar = (value, regra) => (value === null ? "na" : regra(value));

  // antes: regime contábil por t.e_contabil (coluna inexistente), contas tipo
  // "Dinheiro" (não existe) somando saldo_INICIAL, e fatores inventados
  // (receitas × 0,3, AC × 0,8/0,6/0,4). Agora: disponibilidades = saldo na data-fim
  // de Banco/Caixa/Fundo Fixo/Investimento, AC = disponibilidades + contas a
  // receber, PC = contas a pagar, resultado com o mesmo critério da DRE.
  const {
    receitas,
    despesas,
    lucroLiquido,
    patrimonioLiquido,
    liquidezCorrente,
    liquidezImediata,
    margemLiquida,
    roe,
    roa,
    grauEndividamento,
    giroAtivo,
    prazoMedioRecebimento,
  } = calcularIndices({
    transacoes,
    transacoesPosicao,
    transacoesCaixa,
    contas,
    versao,
    dataInicio,
    dataFim,
  });

  // Função auxiliar para badge de status
  const getStatusBadge = (value, good, warning) => {
    if (value >= good) {
      return <Badge className="bg-green-100 text-green-700">Ótimo</Badge>;
    }
    if (value >= warning) {
      return <Badge className="bg-yellow-100 text-yellow-700">Atenção</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700">Crítico</Badge>;
  };

  const IndexCard = ({ icon: Icon, title, value, subtitle, status, description }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              status === "na"
                ? "bg-slate-100"
                : status === "good"
                  ? "bg-green-100"
                  : status === "warning"
                    ? "bg-yellow-100"
                    : "bg-red-100"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5",
                status === "na"
                  ? "text-slate-500"
                  : status === "good"
                    ? "text-green-600"
                    : status === "warning"
                      ? "text-yellow-600"
                      : "text-red-600"
              )}
            />
          </div>
          {status && status !== "na" && (
            <Badge
              className={cn(
                status === "good"
                  ? "bg-green-100 text-green-700"
                  : status === "warning"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
              )}
            >
              {status === "good" ? "Ótimo" : status === "warning" ? "Atenção" : "Crítico"}
            </Badge>
          )}
        </div>
        <h4 className="text-sm font-medium text-slate-600 mb-1">{title}</h4>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        {description && <p className="text-xs text-slate-400 mt-2 pt-2 border-t">{description}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Índices Financeiros e Contábeis</h2>
          <p className="text-slate-600 mt-1">Análise completa da saúde financeira da empresa</p>
        </div>
        <Badge variant="outline" className="text-sm">
          Versão: {versao === "contabil" ? "Contábil" : "Real"}
        </Badge>
      </div>

      {/* Alertas */}
      {/* null < 1 é true em JS — sem o !== null, "n/d" disparava o alerta */}
      {((liquidezCorrente !== null && liquidezCorrente < 1) ||
        (margemLiquida !== null && margemLiquida < 0) ||
        (grauEndividamento !== null && grauEndividamento > 70)) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-orange-900 mb-1">Atenção aos Indicadores</h4>
                <ul className="text-sm text-orange-800 space-y-1">
                  {liquidezCorrente !== null && liquidezCorrente < 1 && (
                    <li>
                      • Liquidez Corrente abaixo do ideal - dificuldade em honrar compromissos
                    </li>
                  )}
                  {margemLiquida !== null && margemLiquida < 0 && (
                    <li>• Margem Líquida negativa - empresa operando com prejuízo</li>
                  )}
                  {grauEndividamento !== null && grauEndividamento > 70 && (
                    <li>
                      • Endividamento elevado - mais de 70% dos ativos são financiados por terceiros
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Índices de Liquidez */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-900">Índices de Liquidez</h3>
        </div>
        {/* Liquidez Seca removida: não há estoques no sistema, ela seria igual à
            Corrente (antes saía AC × 0,8, número inventado). */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IndexCard
            icon={TrendingUp}
            title="Liquidez Corrente"
            value={formatIndice(liquidezCorrente)}
            subtitle="(Disponibilidades + Contas a Receber) / Contas a Pagar"
            status={classificar(liquidezCorrente, (v) =>
              v >= 1.5 ? "good" : v >= 1 ? "warning" : "critical"
            )}
            description="Capacidade de pagar dívidas de curto prazo. Ideal: acima de 1,5"
          />
          <IndexCard
            icon={DollarSign}
            title="Liquidez Imediata"
            value={formatIndice(liquidezImediata)}
            subtitle="Disponibilidades / Contas a Pagar"
            status={classificar(liquidezImediata, (v) =>
              v >= 0.5 ? "good" : v >= 0.3 ? "warning" : "critical"
            )}
            description="Capacidade imediata de pagamento. Ideal: acima de 0,5"
          />
        </div>
      </div>

      {/* Índices de Rentabilidade */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-semibold text-slate-900">Índices de Rentabilidade</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <IndexCard
            icon={Percent}
            title="Margem Líquida"
            value={formatPercent(margemLiquida)}
            subtitle="Resultado antes de IR/CSLL / Receita Líquida"
            status={classificar(margemLiquida, (v) =>
              v >= 10 ? "good" : v >= 5 ? "warning" : "critical"
            )}
            description="Percentual de lucro sobre vendas. Ideal: acima de 10%"
          />
          <IndexCard
            icon={TrendingUp}
            title="ROE (Retorno sobre PL)"
            value={formatPercent(roe)}
            subtitle="Resultado / Patrimônio Líquido (gerencial)"
            status={classificar(roe, (v) => (v >= 15 ? "good" : v >= 10 ? "warning" : "critical"))}
            description="Retorno sobre investimento dos sócios. Ideal: acima de 15%"
          />
          <IndexCard
            icon={BarChart3}
            title="ROA (Retorno sobre Ativos)"
            value={formatPercent(roa)}
            subtitle="Resultado / Ativo Circulante"
            status={classificar(roa, (v) => (v >= 10 ? "good" : v >= 5 ? "warning" : "critical"))}
            description="Eficiência no uso dos ativos. Ideal: acima de 10%"
          />
        </div>
      </div>

      {/* Índices de Endividamento — Composição do Endividamento (PC/PC, sempre
          100%) e Imobilização do PL removidos: o sistema não registra passivo de
          longo prazo nem ativo imobilizado. */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="w-5 h-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-slate-900">Índices de Endividamento</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <IndexCard
            icon={PieChart}
            title="Grau de Endividamento"
            value={formatPercent(grauEndividamento)}
            subtitle="Contas a Pagar / Ativo Circulante"
            status={classificar(grauEndividamento, (v) =>
              v <= 50 ? "good" : v <= 70 ? "warning" : "critical"
            )}
            description="Quanto dos ativos é financiado por terceiros. Ideal: abaixo de 50%"
          />
        </div>
      </div>

      {/* Índices de Atividade */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-slate-900">Índices de Atividade</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IndexCard
            icon={Activity}
            title="Giro do Ativo"
            value={formatIndice(giroAtivo)}
            subtitle="Receita Líquida / Ativo Circulante"
            status={classificar(giroAtivo, (v) =>
              v >= 1.5 ? "good" : v >= 1 ? "warning" : "critical"
            )}
            description="Eficiência na geração de receita. Ideal: acima de 1,5"
          />
          <IndexCard
            icon={DollarSign}
            title="Prazo Médio de Recebimento"
            value={
              prazoMedioRecebimento === null ? "n/d" : `${prazoMedioRecebimento.toFixed(0)} dias`
            }
            subtitle="(Contas a Receber / Receita do período) × dias do período"
            status={classificar(prazoMedioRecebimento, (v) =>
              v <= 30 ? "good" : v <= 45 ? "warning" : "critical"
            )}
            description={
              prazoMedioRecebimento === null && !(dataInicio && dataFim)
                ? "Selecione data início e fim para calcular."
                : "Tempo médio para receber vendas. Ideal: até 30 dias"
            }
          />
        </div>
      </div>

      {/* Resumo Geral */}
      <Card className="bg-slate-50 border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Resumo dos Valores Base</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-600 mb-1">Receitas</p>
              <p className="font-semibold text-green-600">{formatCurrency(receitas)}</p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">Despesas</p>
              <p className="font-semibold text-red-600">{formatCurrency(despesas)}</p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">Resultado antes de IR/CSLL</p>
              <p
                className={cn(
                  "font-semibold",
                  lucroLiquido >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {formatCurrency(lucroLiquido)}
              </p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">Patrimônio Líquido</p>
              <p className="font-semibold text-blue-600">{formatCurrency(patrimonioLiquido)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Como Interpretar os Índices
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-800">
            <div>
              <strong>Liquidez:</strong> Mede a capacidade de pagar dívidas. Quanto maior, melhor.
            </div>
            <div>
              <strong>Rentabilidade:</strong> Mede o lucro gerado. Valores positivos e crescentes
              são ideais.
            </div>
            <div>
              <strong>Endividamento:</strong> Mede a dependência de capital de terceiros. Quanto
              menor, melhor.
            </div>
            <div>
              <strong>Atividade:</strong> Mede a eficiência operacional. Valores altos indicam boa
              gestão.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
