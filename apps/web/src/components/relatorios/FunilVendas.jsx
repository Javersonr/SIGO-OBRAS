import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, FileText, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FunilVendas({ dados, expandido = false }) {
  const statusAgrupado = dados.reduce((acc, op) => {
    const status = op.status_nome || "Sem Status";
    if (!acc[status]) {
      acc[status] = { nome: status, quantidade: 0, valor: 0 };
    }
    acc[status].quantidade += 1;
    acc[status].valor += op.valor_estimado || 0;
    return acc;
  }, {});

  const dadosGrafico = Object.values(statusAgrupado);

  const CORES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const exportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Funil de Vendas", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 22);

    let y = 35;
    dadosGrafico.forEach((item) => {
      doc.text(
        `${item.nome}: ${item.quantidade} oportunidades - ${formatCurrency(item.valor)}`,
        14,
        y
      );
      y += 7;
    });

    doc.save(`funil_vendas_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportarCSV = () => {
    const headers = ["Status", "Quantidade", "Valor Total"];
    const linhas = dadosGrafico.map((item) => [item.nome, item.quantidade, item.valor]);

    const csv = [headers, ...linhas].map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `funil_vendas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Funil de Vendas
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileText className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarPDF}>
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {dadosGrafico.length > 0 ? (
          <div className="space-y-6">
            <ResponsiveContainer width="100%" height={expandido ? 400 : 300}>
              <BarChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <Tooltip
                  formatter={(value, name) => [
                    name === "valor" ? formatCurrency(value) : value,
                    name === "quantidade" ? "Oportunidades" : "Valor",
                  ]}
                />
                <Legend />
                <Bar dataKey="quantidade" fill="#3b82f6" name="Quantidade" />
                {expandido && <Bar dataKey="valor" fill="#10b981" name="Valor" />}
              </BarChart>
            </ResponsiveContainer>

            {expandido && (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosGrafico}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.nome}: ${formatCurrency(entry.valor)}`}
                  >
                    {dadosGrafico.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CORES[index % CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <p>Nenhum dado disponível</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
