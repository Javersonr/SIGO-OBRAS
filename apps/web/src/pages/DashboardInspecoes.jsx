import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Users,
  Wrench,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moment from "moment";

export default function DashboardInspecoes() {
  const { empresaAtiva } = useEmpresa();
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("mes"); // semana, mes
  const [inspecoes, setInspecoes] = useState([]);
  const [metricas, setMetricas] = useState({
    total: 0,
    validadas: 0,
    falhas: 0,
    pendentes: 0,
    taxaSucesso: 0,
  });
  const [dadosGraficos, setDadosGraficos] = useState({
    porPeriodo: [],
    porFerramenta: [],
    porFuncionario: [],
    distribuicao: [],
  });

  useEffect(() => {
    if (empresaAtiva) {
      carregarDados();
    }
  }, [empresaAtiva, periodo]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const todasInspecoes = await sigo.entities.InspecaoFerramenta.filter({
        empresa_id: empresaAtiva.id,
        status: "concluida",
      });

      // Filtrar por período
      const dataInicio =
        periodo === "semana"
          ? moment().subtract(7, "days").startOf("day")
          : moment().subtract(30, "days").startOf("day");

      const inspecoesFiltradas = todasInspecoes.filter((i) =>
        moment(i.data_inspecao).isAfter(dataInicio)
      );

      setInspecoes(inspecoesFiltradas);
      processarDados(inspecoesFiltradas);
    } catch (error) {
      console.error("Erro ao carregar inspeções:", error);
    } finally {
      setLoading(false);
    }
  };

  const processarDados = (inspecoes) => {
    let totalItens = 0;
    let itensValidados = 0;
    let itensFalha = 0;
    let itensPendentes = 0;

    const ferramentasMap = new Map();
    const funcionariosMap = new Map();
    const diasMap = new Map();

    inspecoes.forEach((inspecao) => {
      try {
        const ferramentas = JSON.parse(inspecao.ferramentas_inspecionadas || "[]");
        const dia = moment(inspecao.data_inspecao).format("DD/MM");

        // Contadores por dia
        if (!diasMap.has(dia)) {
          diasMap.set(dia, { dia, validados: 0, falhas: 0, pendentes: 0 });
        }

        ferramentas.forEach((ferr) => {
          ferr.itens?.forEach((item) => {
            totalItens++;

            if (item.status === "validado") {
              itensValidados++;
              diasMap.get(dia).validados++;
            } else if (item.status === "falha") {
              itensFalha++;
              diasMap.get(dia).falhas++;
            } else {
              itensPendentes++;
              diasMap.get(dia).pendentes++;
            }

            // Métricas por ferramenta
            const key = ferr.descricao;
            if (!ferramentasMap.has(key)) {
              ferramentasMap.set(key, { ferramenta: ferr.descricao, total: 0, falhas: 0 });
            }
            ferramentasMap.get(key).total++;
            if (item.status === "falha") {
              ferramentasMap.get(key).falhas++;
            }
          });
        });

        // Métricas por funcionário
        const func = inspecao.funcionario_nome;
        if (!funcionariosMap.has(func)) {
          funcionariosMap.set(func, { funcionario: func, total: 0, validados: 0, falhas: 0 });
        }
        funcionariosMap.get(func).total++;
        ferramentas.forEach((ferr) => {
          ferr.itens?.forEach((item) => {
            if (item.status === "validado") funcionariosMap.get(func).validados++;
            if (item.status === "falha") funcionariosMap.get(func).falhas++;
          });
        });
      } catch (e) {
        console.error("Erro ao processar inspeção:", e);
      }
    });

    const taxaSucesso = totalItens > 0 ? ((itensValidados / totalItens) * 100).toFixed(1) : 0;

    setMetricas({
      total: totalItens,
      validadas: itensValidados,
      falhas: itensFalha,
      pendentes: itensPendentes,
      taxaSucesso: parseFloat(taxaSucesso),
    });

    // Dados dos gráficos
    const porPeriodo = Array.from(diasMap.values()).slice(-14);

    const porFerramenta = Array.from(ferramentasMap.values())
      .map((f) => ({ ...f, taxaFalha: ((f.falhas / f.total) * 100).toFixed(1) }))
      .sort((a, b) => b.falhas - a.falhas)
      .slice(0, 10);

    const porFuncionario = Array.from(funcionariosMap.values())
      .map((f) => ({
        ...f,
        taxaSucesso: f.total > 0 ? ((f.validados / f.total) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const distribuicao = [
      { name: "Validados", value: itensValidados, color: "#10b981" },
      { name: "Falhas", value: itensFalha, color: "#ef4444" },
      { name: "Pendentes", value: itensPendentes, color: "#f59e0b" },
    ];

    setDadosGraficos({ porPeriodo, porFerramenta, porFuncionario, distribuicao });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard de Inspeções</h1>
          <p className="text-slate-600">Análise e métricas das inspeções de ferramentas</p>
        </div>
        <Tabs value={periodo} onValueChange={setPeriodo}>
          <TabsList>
            <TabsTrigger value="semana">Última Semana</TabsTrigger>
            <TabsTrigger value="mes">Último Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total de Itens</CardTitle>
            <Calendar className="w-4 h-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{metricas.total}</div>
            <p className="text-xs text-slate-500 mt-1">Inspeções: {inspecoes.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Taxa de Sucesso</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metricas.taxaSucesso}%</div>
            <p className="text-xs text-slate-500 mt-1">{metricas.validadas} validados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Falhas</CardTitle>
            <XCircle className="w-4 h-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metricas.falhas}</div>
            <p className="text-xs text-slate-500 mt-1">
              {metricas.total > 0 ? ((metricas.falhas / metricas.total) * 100).toFixed(1) : 0}% do
              total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pendentes</CardTitle>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{metricas.pendentes}</div>
            <p className="text-xs text-slate-500 mt-1">Aguardando validação</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inspeções por Período */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              Inspeções por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosGraficos.porPeriodo}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="validados" fill="#10b981" name="Validados" />
                <Bar dataKey="falhas" fill="#ef4444" name="Falhas" />
                <Bar dataKey="pendentes" fill="#f59e0b" name="Pendentes" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição de Status */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Validações</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dadosGraficos.distribuicao}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {dadosGraficos.distribuicao.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ferramentas com Maior Falha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-red-600" />
              Ferramentas com Mais Falhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosGraficos.porFerramenta} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="ferramenta" width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="falhas" fill="#ef4444" name="Falhas" />
                <Bar dataKey="total" fill="#94a3b8" name="Total" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Desempenho por Funcionário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Desempenho dos Funcionários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {dadosGraficos.porFuncionario.map((func, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{func.funcionario}</p>
                    <p className="text-sm text-slate-600">
                      {func.total} inspeções • {func.validados} validados • {func.falhas} falhas
                    </p>
                  </div>
                  <Badge
                    className={
                      func.taxaSucesso >= 90
                        ? "bg-green-100 text-green-800"
                        : func.taxaSucesso >= 70
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }
                  >
                    {func.taxaSucesso}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
