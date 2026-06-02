import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, ArrowDownCircle, DollarSign, FileDown } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { isReceita, isDespesa, isStatusPago } from "@/lib/financeiro-utils";

export default function FluxoCaixaRelatorio({
  transacoes,
  contas,
  versao = "real",
  dataInicio,
  dataFim,
}) {
  const transacoesFiltradas =
    versao === "contabil" ? transacoes.filter((t) => t.numero_documento) : transacoes;

  // Filtrar por período
  const transacoesPeriodo = transacoesFiltradas.filter((t) => {
    const data = t.data_vencimento || t.created_date;
    if (!data) return false;
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim) return false;
    return true;
  });

  // Agrupar por mês
  const fluxoPorMes = {};
  transacoesPeriodo.forEach((t) => {
    const mes = (t.data_vencimento || t.created_date)?.slice(0, 7);
    if (!mes) return;

    if (!fluxoPorMes[mes]) {
      fluxoPorMes[mes] = { mes, entradas: 0, saidas: 0, saldo: 0 };
    }

    if (isReceita(t) && isStatusPago(t.status)) {
      fluxoPorMes[mes].entradas += t.valor || 0;
    } else if (isDespesa(t) && isStatusPago(t.status)) {
      fluxoPorMes[mes].saidas += t.valor || 0;
    }
  });

  // Calcular saldos acumulados
  const dadosFluxo = Object.values(fluxoPorMes)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((item, idx, arr) => {
      const saldoMes = item.entradas - item.saidas;
      const saldoAcumulado = arr
        .slice(0, idx + 1)
        .reduce((sum, i) => sum + (i.entradas - i.saidas), 0);

      return {
        mes: new Date(item.mes + "-01").toLocaleDateString("pt-BR", {
          month: "short",
          year: "numeric",
        }),
        entradas: item.entradas,
        saidas: item.saidas,
        saldo: saldoMes,
        saldoAcumulado,
      };
    });

  const totalEntradas = dadosFluxo.reduce((sum, d) => sum + d.entradas, 0);
  const totalSaidas = dadosFluxo.reduce((sum, d) => sum + d.saidas, 0);
  const saldoFinal = totalEntradas - totalSaidas;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Fluxo de Caixa", 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${dataInicio || "Início"} a ${dataFim || "Hoje"}`, 14, 28);

    let y = 40;
    doc.setFontSize(12);
    doc.text("Mês", 14, y);
    doc.text("Entradas", 60, y);
    doc.text("Saídas", 110, y);
    doc.text("Saldo", 160, y);

    y += 8;
    doc.setFontSize(10);

    dadosFluxo.forEach((item) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.text(item.mes, 14, y);
      doc.text(formatCurrency(item.entradas), 60, y);
      doc.text(formatCurrency(item.saidas), 110, y);
      doc.setTextColor(item.saldo >= 0 ? 0 : 255, 0, 0);
      doc.text(formatCurrency(item.saldo), 160, y);
      doc.setTextColor(0, 0, 0);

      y += 7;
    });

    doc.save(`fluxo_caixa_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Fluxo de Caixa</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Entradas e saídas ao longo do tempo</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportarPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
            <Badge variant={versao === "real" ? "default" : "outline"}>
              {versao === "real" ? "Regime Real" : "Regime Contábil (NF-e)"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700 font-medium">Entradas</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalEntradas)}</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-700 font-medium">Saídas</span>
            </div>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalSaidas)}</p>
          </div>

          <div
            className={`border rounded-lg p-4 ${saldoFinal >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <DollarSign
                className={`w-5 h-5 ${saldoFinal >= 0 ? "text-blue-600" : "text-orange-600"}`}
              />
              <span
                className={`text-sm font-medium ${saldoFinal >= 0 ? "text-blue-700" : "text-orange-700"}`}
              >
                Saldo
              </span>
            </div>
            <p
              className={`text-2xl font-bold ${saldoFinal >= 0 ? "text-blue-700" : "text-orange-700"}`}
            >
              {formatCurrency(saldoFinal)}
            </p>
          </div>
        </div>

        {/* Gráfico de Linha - Evolução */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Evolução do Saldo</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dadosFluxo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelStyle={{ color: "#1e293b" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="saldoAcumulado"
                stroke="#f59e0b"
                strokeWidth={2}
                name="Saldo Acumulado"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Barras - Entradas vs Saídas */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Entradas vs Saídas Mensais</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dadosFluxo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelStyle={{ color: "#1e293b" }}
              />
              <Legend />
              <Bar dataKey="entradas" fill="#10b981" name="Entradas" />
              <Bar dataKey="saidas" fill="#ef4444" name="Saídas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
