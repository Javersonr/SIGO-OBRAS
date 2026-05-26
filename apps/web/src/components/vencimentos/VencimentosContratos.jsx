import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import * as XLSX from "xlsx";

const CORES = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6"];

export default function VencimentosContratos({ projetos = [] }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Filtrar projetos com contrato e data de vencimento
  const projetosComContrato = useMemo(() => {
    return projetos.filter((p) => p.numero_contrato && p.data_vencimento_contrato);
  }, [projetos]);

  // Classificar por status de vencimento
  const vencimentos = useMemo(() => {
    return projetosComContrato
      .map((p) => {
        const dataVenc = new Date(p.data_vencimento_contrato);
        dataVenc.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((dataVenc - hoje) / (1000 * 60 * 60 * 24));

        let status = "vigente";
        if (diasRestantes < 0) status = "vencido";
        else if (diasRestantes <= 30) status = "alerta";
        else if (diasRestantes <= 90) status = "aviso";

        return {
          ...p,
          dataVenc,
          diasRestantes,
          status,
        };
      })
      .sort((a, b) => a.dataVenc - b.dataVenc);
  }, [projetosComContrato, hoje]);

  // KPIs
  const kpis = useMemo(() => {
    const vencido = vencimentos.filter((v) => v.status === "vencido").length;
    const alerta = vencimentos.filter((v) => v.status === "alerta").length;
    const aviso = vencimentos.filter((v) => v.status === "aviso").length;
    const vigente = vencimentos.filter((v) => v.status === "vigente").length;

    return { vencido, alerta, aviso, vigente, total: vencimentos.length };
  }, [vencimentos]);

  // Gráfico: Distribuição de status
  const dadosStatus = useMemo(() => {
    const map = { vencido: 0, alerta: 0, aviso: 0, vigente: 0 };
    vencimentos.forEach((v) => {
      map[v.status]++;
    });
    return [
      { name: "Vencido", value: map.vencido, color: "#ef4444" },
      { name: "Alerta (0-30 dias)", value: map.alerta, color: "#f59e0b" },
      { name: "Aviso (31-90 dias)", value: map.aviso, color: "#fbbf24" },
      { name: "Vigente", value: map.vigente, color: "#10b981" },
    ].filter((d) => d.value > 0);
  }, [vencimentos]);

  // Gráfico: Vencimentos por mês
  const dadosMeses = useMemo(() => {
    const meses = {};
    vencimentos.forEach((v) => {
      const key = v.dataVenc.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
      if (!meses[key]) meses[key] = 0;
      meses[key]++;
    });
    return Object.entries(meses).map(([mes, count]) => ({ mes, quantidade: count }));
  }, [vencimentos]);

  // Exportar Excel
  const exportarExcel = () => {
    const rows = vencimentos.map((v) => ({
      Contrato: v.numero_contrato,
      Projeto: v.nome,
      Cliente: v.cliente_nome || "-",
      "Data Vencimento": v.dataVenc.toLocaleDateString("pt-BR"),
      "Dias Restantes":
        v.diasRestantes >= 0 ? v.diasRestantes : `(Vencido há ${Math.abs(v.diasRestantes)} dias)`,
      Status: { vencido: "Vencido", alerta: "Alerta", aviso: "Aviso", vigente: "Vigente" }[
        v.status
      ],
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vencimentos");

    // Resumo
    const resumoRows = [
      { Métrica: "Total de Contratos", Valor: kpis.total },
      { Métrica: "Vencidos", Valor: kpis.vencido },
      { Métrica: "Alerta (0-30 dias)", Valor: kpis.alerta },
      { Métrica: "Aviso (31-90 dias)", Valor: kpis.aviso },
      { Métrica: "Vigentes", Valor: kpis.vigente },
    ];
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    XLSX.writeFile(
      wb,
      `Vencimentos_Contratos_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      vencido: "bg-red-100 text-red-700 border-red-300",
      alerta: "bg-orange-100 text-orange-700 border-orange-300",
      aviso: "bg-amber-100 text-amber-700 border-amber-300",
      vigente: "bg-green-100 text-green-700 border-green-300",
    };
    const labels = {
      vencido: "⚠ Vencido",
      alerta: "⏰ Alerta",
      aviso: "📌 Aviso",
      vigente: "✓ Vigente",
    };
    return <Badge className={styles[status]}>{labels[status]}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-600">#</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{kpis.total}</p>
              <p className="text-xs text-slate-500">Contratos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{kpis.vencido}</p>
              <p className="text-xs text-slate-500">Vencidos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{kpis.alerta}</p>
              <p className="text-xs text-slate-500">Alerta</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <span className="text-sm font-bold text-amber-600">30</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{kpis.aviso}</p>
              <p className="text-xs text-slate-500">Aviso</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{kpis.vigente}</p>
              <p className="text-xs text-slate-500">Vigentes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dadosStatus.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={dadosStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {dadosStatus.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {dadosMeses.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Vencimentos por Mês</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dadosMeses}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="quantidade"
                    fill="#3b82f6"
                    name="Quantidade"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Botão Exportar */}
      {vencimentos.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={exportarExcel} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar Excel
          </Button>
        </div>
      )}

      {/* Tabela de Vencimentos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Todos os Contratos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left p-3 font-semibold text-slate-600">Contrato</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Projeto</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Cliente</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Vencimento</th>
                  <th className="text-center p-3 font-semibold text-slate-600">Dias</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {vencimentos.map((v) => (
                  <tr key={v.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-semibold text-slate-700">
                      {v.numero_contrato}
                    </td>
                    <td className="p-3 max-w-xs truncate text-slate-700">{v.nome}</td>
                    <td className="p-3 text-slate-600">{v.cliente_nome || "-"}</td>
                    <td className="p-3 font-medium">{v.dataVenc.toLocaleDateString("pt-BR")}</td>
                    <td
                      className="p-3 text-center font-bold"
                      style={{
                        color:
                          v.status === "vencido"
                            ? "#dc2626"
                            : v.status === "alerta"
                              ? "#ea580c"
                              : v.status === "aviso"
                                ? "#b45309"
                                : "#16a34a",
                      }}
                    >
                      {v.diasRestantes >= 0 ? v.diasRestantes : `(${Math.abs(v.diasRestantes)})`}
                    </td>
                    <td className="p-3">{getStatusBadge(v.status)}</td>
                  </tr>
                ))}
                {vencimentos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Nenhum contrato registrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
