import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { sigo } from "@/api/sigoClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export default function DespesasTab({ oportunidadeId, empresaAtiva }) {
  const navigate = useNavigate();
  const [despesas, setDespesas] = React.useState([]);
  const [filtroStatus, setFiltroStatus] = React.useState("all");
  const [dataInicio, setDataInicio] = React.useState("");
  const [dataFim, setDataFim] = React.useState("");

  React.useEffect(() => {
    if (oportunidadeId) loadDespesas();
  }, [oportunidadeId]);

  const loadDespesas = async () => {
    const transacoes = await sigo.entities.TransacaoFinanceira.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: oportunidadeId,
      tipo: "despesa",
    });
    setDespesas(
      transacoes.sort((a, b) => new Date(b.data_vencimento) - new Date(a.data_vencimento))
    );
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const calcularTotais = (status) => {
    return despesas
      .filter((d) => status === "all" || d.status === status)
      .reduce((sum, d) => sum + (d.valor || 0), 0);
  };

  const despesasFiltradas = despesas.filter((d) => {
    const matchStatus = filtroStatus === "all" || d.status === filtroStatus;
    const matchDataInicio = !dataInicio || d.data_vencimento >= dataInicio;
    const matchDataFim = !dataFim || d.data_vencimento <= dataFim;
    return matchStatus && matchDataInicio && matchDataFim;
  });

  const totalEmAberto = calcularTotais("em_aberto");
  const totalVencido = despesas
    .filter(
      (d) => d.status === "em_aberto" && d.data_vencimento < new Date().toISOString().split("T")[0]
    )
    .reduce((s, d) => s + (d.valor || 0), 0);
  const totalPago = calcularTotais("pago");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">Despesas do Projeto</h3>
        <Button onClick={() => navigate(createPageUrl("Financeiro"))} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Despesa
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Em aberto</span>
              <Badge className="bg-blue-100 text-blue-700">
                {despesas.filter((d) => d.status === "em_aberto").length}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalEmAberto)}</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-red-700">Vencido</span>
              <Badge className="bg-red-100 text-red-700">
                {
                  despesas.filter(
                    (d) =>
                      d.status === "em_aberto" &&
                      d.data_vencimento < new Date().toISOString().split("T")[0]
                  ).length
                }
              </Badge>
            </div>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalVencido)}</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-green-700">Pagos</span>
              <Badge className="bg-green-100 text-green-700">
                {despesas.filter((d) => d.status === "pago").length}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPago)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="em_aberto">Em aberto</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          placeholder="Data início"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="w-[150px]"
        />
        <span className="flex items-center text-slate-500">até</span>
        <Input
          type="date"
          placeholder="Data fim"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="w-[150px]"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                Descrição
              </th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                Vencimento
              </th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Valor</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                Categoria
              </th>
            </tr>
          </thead>
          <tbody>
            {despesasFiltradas.map((despesa) => {
              const isVencido =
                despesa.status === "em_aberto" &&
                despesa.data_vencimento < new Date().toISOString().split("T")[0];
              return (
                <tr
                  key={despesa.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() =>
                    navigate(createPageUrl("Financeiro") + `?tab=despesas&id=${despesa.id}`)
                  }
                >
                  <td className="px-4 py-3 text-sm text-slate-800">{despesa.descricao}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(despesa.data_vencimento).toLocaleDateString("pt-BR")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-red-600">
                    {formatCurrency(despesa.valor)}
                  </td>
                  <td className="px-4 py-3">
                    {despesa.status === "pago" ? (
                      <Badge className="bg-green-100 text-green-700">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Pago
                      </Badge>
                    ) : isVencido ? (
                      <Badge className="bg-red-100 text-red-700">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Vencido
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700">Em aberto</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {despesa.categoria_nome || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {despesasFiltradas.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma despesa encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}
