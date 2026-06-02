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
import { isReceita, isDespesa, isStatusPago, isStatusPendente } from "@/lib/financeiro-utils";

export default function IndicesFinanceiros({ transacoes, contas, versao = "real" }) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(2)}%`;
  };

  // Filtrar transações pela versão
  const transacoesFiltradas = transacoes.filter((t) =>
    versao === "contabil" ? t.e_contabil === true : true
  );

  // Calcular valores base — usa os helpers normalizados, antes só pegava
  // status="Realizado" e perdia registros gravados como "pago".
  const receitas = transacoesFiltradas
    .filter((t) => isReceita(t) && isStatusPago(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const despesas = transacoesFiltradas
    .filter((t) => isDespesa(t) && isStatusPago(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const lucroLiquido = receitas - despesas;

  // Ativo Circulante (saldo das contas)
  const ativoCirculante = contas
    .filter((c) => ["Banco", "Dinheiro"].includes(c.tipo))
    .reduce((sum, c) => sum + (c.saldo_inicial || 0), 0);

  // Passivo Circulante (contas a pagar pendentes)
  const passivoCirculante = transacoesFiltradas
    .filter((t) => isDespesa(t) && isStatusPendente(t.status))
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const ativoTotal = ativoCirculante + receitas * 0.3; // Estimativa simples
  const patrimonioLiquido = ativoTotal - passivoCirculante;

  // ========================================
  // ÍNDICES DE LIQUIDEZ
  // ========================================
  const liquidezCorrente = passivoCirculante > 0 ? ativoCirculante / passivoCirculante : 0;

  const liquidezSeca = passivoCirculante > 0 ? (ativoCirculante * 0.8) / passivoCirculante : 0;

  const liquidezImediata = passivoCirculante > 0 ? (ativoCirculante * 0.6) / passivoCirculante : 0;

  // ========================================
  // ÍNDICES DE RENTABILIDADE
  // ========================================
  const margemLiquida = receitas > 0 ? (lucroLiquido / receitas) * 100 : 0;

  const roe = patrimonioLiquido > 0 ? (lucroLiquido / patrimonioLiquido) * 100 : 0;

  const roa = ativoTotal > 0 ? (lucroLiquido / ativoTotal) * 100 : 0;

  // ========================================
  // ÍNDICES DE ENDIVIDAMENTO
  // ========================================
  const grauEndividamento = ativoTotal > 0 ? (passivoCirculante / ativoTotal) * 100 : 0;

  const composicaoEndividamento =
    passivoCirculante > 0 ? (passivoCirculante / passivoCirculante) * 100 : 0;

  const imobilizacaoPatrimonio =
    patrimonioLiquido > 0 ? ((ativoTotal - ativoCirculante) / patrimonioLiquido) * 100 : 0;

  // ========================================
  // ÍNDICES DE ATIVIDADE
  // ========================================
  const giroAtivo = ativoTotal > 0 ? receitas / ativoTotal : 0;

  const prazoMedioRecebimento = receitas > 0 ? ((ativoCirculante * 0.4) / receitas) * 30 : 0;

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
              status === "good"
                ? "bg-green-100"
                : status === "warning"
                  ? "bg-yellow-100"
                  : "bg-red-100"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5",
                status === "good"
                  ? "text-green-600"
                  : status === "warning"
                    ? "text-yellow-600"
                    : "text-red-600"
              )}
            />
          </div>
          {status && (
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
      {(liquidezCorrente < 1 || margemLiquida < 0 || grauEndividamento > 70) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-orange-900 mb-1">Atenção aos Indicadores</h4>
                <ul className="text-sm text-orange-800 space-y-1">
                  {liquidezCorrente < 1 && (
                    <li>
                      • Liquidez Corrente abaixo do ideal - dificuldade em honrar compromissos
                    </li>
                  )}
                  {margemLiquida < 0 && (
                    <li>• Margem Líquida negativa - empresa operando com prejuízo</li>
                  )}
                  {grauEndividamento > 70 && (
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <IndexCard
            icon={TrendingUp}
            title="Liquidez Corrente"
            value={liquidezCorrente.toFixed(2)}
            subtitle="Ativo Circulante / Passivo Circulante"
            status={
              liquidezCorrente >= 1.5 ? "good" : liquidezCorrente >= 1 ? "warning" : "critical"
            }
            description="Capacidade de pagar dívidas de curto prazo. Ideal: acima de 1,5"
          />
          <IndexCard
            icon={Activity}
            title="Liquidez Seca"
            value={liquidezSeca.toFixed(2)}
            subtitle="(AC - Estoques) / Passivo Circulante"
            status={liquidezSeca >= 1 ? "good" : liquidezSeca >= 0.7 ? "warning" : "critical"}
            description="Liquidez sem considerar estoques. Ideal: acima de 1,0"
          />
          <IndexCard
            icon={DollarSign}
            title="Liquidez Imediata"
            value={liquidezImediata.toFixed(2)}
            subtitle="Disponibilidades / Passivo Circulante"
            status={
              liquidezImediata >= 0.5 ? "good" : liquidezImediata >= 0.3 ? "warning" : "critical"
            }
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
            subtitle="Lucro Líquido / Receita Total"
            status={margemLiquida >= 10 ? "good" : margemLiquida >= 5 ? "warning" : "critical"}
            description="Percentual de lucro sobre vendas. Ideal: acima de 10%"
          />
          <IndexCard
            icon={TrendingUp}
            title="ROE (Retorno sobre PL)"
            value={formatPercent(roe)}
            subtitle="Lucro Líquido / Patrimônio Líquido"
            status={roe >= 15 ? "good" : roe >= 10 ? "warning" : "critical"}
            description="Retorno sobre investimento dos sócios. Ideal: acima de 15%"
          />
          <IndexCard
            icon={BarChart3}
            title="ROA (Retorno sobre Ativos)"
            value={formatPercent(roa)}
            subtitle="Lucro Líquido / Ativo Total"
            status={roa >= 10 ? "good" : roa >= 5 ? "warning" : "critical"}
            description="Eficiência no uso dos ativos. Ideal: acima de 10%"
          />
        </div>
      </div>

      {/* Índices de Endividamento */}
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
            subtitle="Passivo Total / Ativo Total"
            status={
              grauEndividamento <= 50 ? "good" : grauEndividamento <= 70 ? "warning" : "critical"
            }
            description="Quanto dos ativos é financiado por terceiros. Ideal: abaixo de 50%"
          />
          <IndexCard
            icon={Activity}
            title="Composição do Endividamento"
            value={formatPercent(composicaoEndividamento)}
            subtitle="Passivo Circulante / Passivo Total"
            status={
              composicaoEndividamento <= 40
                ? "good"
                : composicaoEndividamento <= 60
                  ? "warning"
                  : "critical"
            }
            description="Concentração das dívidas no curto prazo. Ideal: abaixo de 40%"
          />
          <IndexCard
            icon={BarChart3}
            title="Imobilização do PL"
            value={formatPercent(imobilizacaoPatrimonio)}
            subtitle="Ativo Permanente / Patrimônio Líquido"
            status={
              imobilizacaoPatrimonio <= 70
                ? "good"
                : imobilizacaoPatrimonio <= 90
                  ? "warning"
                  : "critical"
            }
            description="Capital próprio investido em ativos fixos. Ideal: abaixo de 70%"
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
            value={giroAtivo.toFixed(2)}
            subtitle="Receita Total / Ativo Total"
            status={giroAtivo >= 1.5 ? "good" : giroAtivo >= 1 ? "warning" : "critical"}
            description="Eficiência na geração de receita. Ideal: acima de 1,5"
          />
          <IndexCard
            icon={DollarSign}
            title="Prazo Médio de Recebimento"
            value={`${prazoMedioRecebimento.toFixed(0)} dias`}
            subtitle="(Contas a Receber / Receita) × 30"
            status={
              prazoMedioRecebimento <= 30
                ? "good"
                : prazoMedioRecebimento <= 45
                  ? "warning"
                  : "critical"
            }
            description="Tempo médio para receber vendas. Ideal: até 30 dias"
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
              <p className="text-slate-600 mb-1">Lucro Líquido</p>
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
