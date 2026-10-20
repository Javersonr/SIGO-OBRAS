import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { isReceita, isDespesa, isStatusPago } from "@/lib/financeiro-utils";
import { calcularComparativoPeriodos, variacaoPercentual } from "@/lib/relatorios-financeiros";

export default function GraficosComparativos({
  transacoes,
  filtros,
  tipo = "dre", // 'dre', 'fluxo', 'balanco'
}) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  // Comparação DRE: Período Atual vs Anterior. Para tipo "dre" o RelatoriosTab
  // manda as transações SEM o filtro de data (antes mandava já cortadas no
  // período e o "Anterior" saía sempre zerado); o período anterior agora tem
  // o mesmo nº de dias do atual (antes ficava 1 dia menor).
  const getDREComparativo = () =>
    calcularComparativoPeriodos(transacoes, filtros?.dataInicio, filtros?.dataFim);

  // Fluxo de Caixa: Projetado vs Realizado
  const getFluxoComparativo = () => {
    const fluxoPorMes = {};

    transacoes.forEach((t) => {
      const mes = (t.data_vencimento || t.created_date)?.slice(0, 7);
      if (!mes) return;

      if (!fluxoPorMes[mes]) {
        fluxoPorMes[mes] = {
          mes,
          realizado: 0,
          projetado: 0,
        };
      }

      const valor = t.valor || 0;
      const mult = isReceita(t) ? 1 : -1;

      if (isStatusPago(t.status)) {
        fluxoPorMes[mes].realizado += valor * mult;
        fluxoPorMes[mes].projetado += valor * mult;
      } else {
        fluxoPorMes[mes].projetado += valor * mult;
      }
    });

    return Object.values(fluxoPorMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map((item) => ({
        // T12:00:00 evita parse UTC que deslocaria mês em UTC-3
        mes: new Date(item.mes + "-01T12:00:00").toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        }),
        realizado: item.realizado,
        projetado: item.projetado,
      }));
  };

  // Evolução Mensal das Margens
  const getEvolicaoMargens = () => {
    const margensPorMes = {};

    transacoes.forEach((t) => {
      if (!isStatusPago(t.status)) return;

      const mes = (t.data_vencimento || t.created_date)?.slice(0, 7);
      if (!mes) return;

      if (!margensPorMes[mes]) {
        margensPorMes[mes] = { mes, receitas: 0, despesas: 0 };
      }

      if (isReceita(t)) {
        margensPorMes[mes].receitas += t.valor || 0;
      } else if (isDespesa(t)) {
        margensPorMes[mes].despesas += t.valor || 0;
      }
    });

    return Object.values(margensPorMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map((item) => ({
        // Inclui year p/ distinguir "jan 25" de "jan 26" em séries que
        // cruzam virada de ano. Antes ambos viravam só "jan." e o gráfico
        // somava os 2 anos no mesmo ponto.
        mes: new Date(item.mes + "-01T12:00:00").toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        }),
        margemBruta:
          item.receitas > 0 ? ((item.receitas - item.despesas) / item.receitas) * 100 : 0,
        receitas: item.receitas,
        despesas: item.despesas,
      }));
  };

  if (tipo === "dre") {
    const dados = getDREComparativo();

    if (dados.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center text-slate-500">
            Selecione um período para visualizar a comparação
          </CardContent>
        </Card>
      );
    }

    // antes: base 0 virava divisor 1 ("+1234500%"); agora null → "n/d"
    const variacao = variacaoPercentual(dados[1]?.lucro, dados[0]?.lucro);

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Comparativo: Período Atual vs Anterior</CardTitle>
            {variacao === null ? (
              <div
                className="px-3 py-1 rounded-lg bg-slate-100 text-sm font-bold text-slate-500"
                title="Sem resultado no período anterior para comparar"
              >
                n/d
              </div>
            ) : (
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-lg ${variacao >= 0 ? "bg-green-100" : "bg-red-100"}`}
              >
                {variacao >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                <span
                  className={`text-sm font-bold ${variacao >= 0 ? "text-green-700" : "text-red-700"}`}
                >
                  {variacao >= 0 ? "+" : ""}
                  {variacao.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="receitas" fill="#10b981" name="Receitas" />
              <Bar dataKey="despesas" fill="#ef4444" name="Despesas" />
              <Bar dataKey="lucro" fill="#f59e0b" name="Lucro/Prejuízo" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  if (tipo === "fluxo") {
    const dados = getFluxoComparativo();

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fluxo de Caixa: Projetado vs Realizado</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Area
                type="monotone"
                dataKey="projetado"
                fill="#94a3b8"
                stroke="#64748b"
                name="Projetado"
                fillOpacity={0.3}
              />
              <Line
                type="monotone"
                dataKey="realizado"
                stroke="#f59e0b"
                strokeWidth={3}
                name="Realizado"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  if (tipo === "margens") {
    const dados = getEvolicaoMargens();

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução da Margem de Lucro</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip
                formatter={(value, name) =>
                  name === "margemBruta" ? `${value.toFixed(1)}%` : formatCurrency(value)
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="margemBruta"
                stroke="#10b981"
                strokeWidth={2}
                name="Margem (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  return null;
}
