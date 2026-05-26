import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { sigo } from "@/api/sigoClient";
import { TrendingUp, TrendingDown, FileSpreadsheet } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";

export default function FluxoContaDetalhado({ empresaAtiva, contas }) {
  const [contaSelecionada, setContaSelecionada] = useState(contas[0]?.id || "");
  const [periodo, setPeriodo] = useState("mes");
  const [transacoes, setTransacoes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contaSelecionada) {
      loadTransacoes();
    }
  }, [contaSelecionada, periodo]);

  const loadTransacoes = async () => {
    setLoading(true);
    try {
      const todas = await sigo.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        conta_id: contaSelecionada,
      });

      // Filtrar por período
      const dataInicio = getDataInicio(periodo);
      const filtered = todas.filter((t) => {
        const data = new Date(t.data || t.data_vencimento);
        return data >= dataInicio;
      });

      setTransacoes(
        filtered.sort(
          (a, b) => new Date(b.data || b.data_vencimento) - new Date(a.data || a.data_vencimento)
        )
      );
    } catch (error) {
      console.error("Erro ao carregar transações:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDataInicio = (periodo) => {
    const hoje = new Date();
    switch (periodo) {
      case "semana":
        return new Date(hoje.setDate(hoje.getDate() - 7));
      case "mes":
        return new Date(hoje.setMonth(hoje.getMonth() - 1));
      case "trimestre":
        return new Date(hoje.setMonth(hoje.getMonth() - 3));
      case "ano":
        return new Date(hoje.setFullYear(hoje.getFullYear() - 1));
      default:
        return new Date(0);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const conta = contas.find((c) => c.id === contaSelecionada);

  // Calcular métricas
  const totalReceitas = transacoes
    .filter((t) => t.tipo === "Receita" || t.tipo === "receita")
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const totalDespesas = transacoes
    .filter((t) => t.tipo === "Despesa" || t.tipo === "despesa")
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const saldoFinal = (conta?.saldo_inicial || 0) + totalReceitas - totalDespesas;

  // Preparar dados para gráfico
  const prepararDadosGrafico = () => {
    const grupos = {};

    transacoes.forEach((t) => {
      const data = new Date(t.data || t.data_vencimento);
      let chave;

      if (periodo === "semana") {
        chave = data.toLocaleDateString("pt-BR");
      } else if (periodo === "mes" || periodo === "trimestre") {
        chave = `${data.getDate()}/${data.getMonth() + 1}`;
      } else {
        chave = `${data.getMonth() + 1}/${data.getFullYear()}`;
      }

      if (!grupos[chave]) {
        grupos[chave] = { data: chave, receitas: 0, despesas: 0, saldo: 0 };
      }

      if (t.tipo === "Receita" || t.tipo === "receita") {
        grupos[chave].receitas += t.valor || 0;
      } else {
        grupos[chave].despesas += t.valor || 0;
      }
    });

    // Calcular saldo acumulado
    let saldoAcumulado = conta?.saldo_inicial || 0;
    const dados = Object.values(grupos).map((g) => {
      saldoAcumulado += g.receitas - g.despesas;
      return { ...g, saldo: saldoAcumulado };
    });

    return dados;
  };

  const handleExportar = () => {
    const dadosExportacao = transacoes.map((t) => ({
      Data: t.data || t.data_vencimento || "",
      Tipo: t.tipo,
      Descrição: t.descricao || "",
      Categoria: t.categoria_nome || "",
      Valor: t.valor || 0,
      Status: t.status,
      Projeto: t.projeto_nome || "",
      "Fornecedor/Cliente": t.fornecedor_nome || t.cliente_nome || "",
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExportacao);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transações");
    XLSX.writeFile(wb, `Fluxo_${conta?.nome}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const dadosGrafico = prepararDadosGrafico();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Fluxo Detalhado por Conta</h2>
        <div className="flex gap-3">
          <Select value={contaSelecionada} onValueChange={setContaSelecionada}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Última Semana</SelectItem>
              <SelectItem value="mes">Último Mês</SelectItem>
              <SelectItem value="trimestre">Último Trimestre</SelectItem>
              <SelectItem value="ano">Último Ano</SelectItem>
              <SelectItem value="tudo">Todo Período</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleExportar}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500 mb-1">Saldo Inicial</p>
            <p className="text-2xl font-bold text-slate-800">
              {formatCurrency(conta?.saldo_inicial || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">Receitas</p>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalReceitas)}</p>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">Despesas</p>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDespesas)}</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500 mb-1">Saldo Final</p>
            <p
              className={`text-2xl font-bold ${saldoFinal >= 0 ? "text-blue-600" : "text-red-600"}`}
            >
              {formatCurrency(saldoFinal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Evolução */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução do Saldo</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Line type="monotone" dataKey="receitas" stroke="#10b981" name="Receitas" />
              <Line type="monotone" dataKey="despesas" stroke="#ef4444" name="Despesas" />
              <Line type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2} name="Saldo" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Lista de Transações */}
      <Card>
        <CardHeader>
          <CardTitle>Transações ({transacoes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Data</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                    Descrição
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                    Categoria
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Tipo</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                    Valor
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {transacoes.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                      Nenhuma transação encontrada
                    </td>
                  </tr>
                ) : (
                  transacoes.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">
                        {new Date(t.data || t.data_vencimento).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-sm">{t.descricao || "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        {t.categoria_nome && (
                          <Badge variant="outline" className="text-xs">
                            {t.categoria_nome}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge
                          className={
                            t.tipo === "Receita" || t.tipo === "receita"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }
                        >
                          {t.tipo}
                        </Badge>
                      </td>
                      <td
                        className={`px-4 py-3 text-sm font-semibold text-right ${
                          t.tipo === "Receita" || t.tipo === "receita"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(t.valor)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge variant="outline">
                          {t.status === "pago" || t.status === "Pago" ? "Realizado" : "Pendente"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
