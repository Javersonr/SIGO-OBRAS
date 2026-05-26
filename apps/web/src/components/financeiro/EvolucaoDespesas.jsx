import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function EvolucaoDespesas({ transacoes, categorias, versao = "real" }) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");

  const dadosFiltrados = useMemo(() => {
    let filtradas = transacoes.filter(
      (t) =>
        t.tipo === "despesa" && t.status === "pago" && (versao === "real" || t.numero_documento)
    );

    if (dataInicio) {
      filtradas = filtradas.filter((t) => new Date(t.data) >= new Date(dataInicio));
    }
    if (dataFim) {
      filtradas = filtradas.filter((t) => new Date(t.data) <= new Date(dataFim));
    }
    if (categoriaFiltro !== "todas") {
      filtradas = filtradas.filter((t) => t.categoria_id === categoriaFiltro);
    }

    return filtradas;
  }, [transacoes, dataInicio, dataFim, categoriaFiltro, versao]);

  // Agrupar por mês
  const despesasPorMes = useMemo(() => {
    const grupos = {};
    dadosFiltrados.forEach((t) => {
      const mes = new Date(t.data).toLocaleDateString("pt-BR", { year: "numeric", month: "short" });
      grupos[mes] = (grupos[mes] || 0) + (t.valor || 0);
    });
    return Object.entries(grupos).sort((a, b) => {
      const [mesA] = a[0].split(" ");
      const [mesB] = b[0].split(" ");
      return new Date(a[0]) - new Date(b[0]);
    });
  }, [dadosFiltrados]);

  // Agrupar por categoria
  const despesasPorCategoria = useMemo(() => {
    const grupos = {};
    dadosFiltrados.forEach((t) => {
      const cat = t.categoria_nome || "Sem categoria";
      grupos[cat] = (grupos[cat] || 0) + (t.valor || 0);
    });
    return Object.entries(grupos).sort((a, b) => b[1] - a[1]);
  }, [dadosFiltrados]);

  const totalDespesas = dadosFiltrados.reduce((sum, t) => sum + (t.valor || 0), 0);
  const mediaMensal = despesasPorMes.length > 0 ? totalDespesas / despesasPorMes.length : 0;

  const variacao =
    despesasPorMes.length >= 2
      ? ((despesasPorMes[despesasPorMes.length - 1][1] -
          despesasPorMes[despesasPorMes.length - 2][1]) /
          despesasPorMes[despesasPorMes.length - 2][1]) *
        100
      : 0;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const maxValor = Math.max(...despesasPorMes.map(([_, v]) => v), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Evolução de Despesas</CardTitle>
          <Badge variant={versao === "real" ? "default" : "outline"}>
            {versao === "real" ? "Regime Real" : "Regime Contábil (NF-e)"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
          <div>
            <Label className="text-xs">Data Início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Data Fim</Label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {categorias
                  .filter((c) => c.tipo === "Despesa")
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-xs text-red-600 mb-1">Total de Despesas</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalDespesas)}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 mb-1">Média Mensal</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(mediaMensal)}</p>
          </div>
          <div className={`p-4 rounded-lg ${variacao > 0 ? "bg-orange-50" : "bg-green-50"}`}>
            <p className={`text-xs mb-1 ${variacao > 0 ? "text-orange-600" : "text-green-600"}`}>
              Variação Mensal
            </p>
            <p
              className={`text-2xl font-bold flex items-center gap-2 ${variacao > 0 ? "text-orange-700" : "text-green-700"}`}
            >
              {variacao > 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              {Math.abs(variacao).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Gráfico de Barras por Mês */}
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Despesas Mensais</h4>
          <div className="space-y-2">
            {despesasPorMes.map(([mes, valor]) => (
              <div key={mes} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">{mes}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(valor)}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full transition-all"
                    style={{ width: `${(valor / maxValor) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Despesas por Categoria */}
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Despesas por Categoria</h4>
          <div className="space-y-3">
            {despesasPorCategoria.map(([categoria, valor]) => {
              const percentual = (valor / totalDespesas) * 100;
              return (
                <div
                  key={categoria}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{categoria}</p>
                    <p className="text-xs text-slate-500">{percentual.toFixed(1)}% do total</p>
                  </div>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(valor)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
