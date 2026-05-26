import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { sigo } from "@/api/sigoClient";

export default function ResultadosTab({ oportunidadeId, empresaAtiva, orcamentoItens }) {
  const [receitas, setReceitas] = React.useState([]);
  const [despesas, setDespesas] = React.useState([]);

  React.useEffect(() => {
    if (oportunidadeId) loadDados();
  }, [oportunidadeId]);

  const loadDados = async () => {
    const [receitasData, despesasData] = await Promise.all([
      sigo.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: oportunidadeId,
        tipo: "receita",
      }),
      sigo.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: oportunidadeId,
        tipo: "despesa",
      }),
    ]);
    setReceitas(receitasData);
    setDespesas(despesasData);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const totalReceitas = receitas
    .filter((r) => r.status === "pago")
    .reduce((s, r) => s + (r.valor || 0), 0);
  const totalReceitasPrevistas = receitas.reduce((s, r) => s + (r.valor || 0), 0);

  const totalDespesas = despesas
    .filter((d) => d.status === "pago")
    .reduce((s, d) => s + (d.valor || 0), 0);
  const totalDespesasPrevistas = despesas.reduce((s, d) => s + (d.valor || 0), 0);

  const totalOrcado = orcamentoItens.reduce((s, i) => s + (i.valor_total || 0), 0);

  const resultado = totalReceitas - totalDespesas;
  const resultadoPrevisto = totalReceitasPrevistas - totalDespesasPrevistas;
  const diferencaOrcamento = totalDespesas - totalOrcado;
  const percentualOrcado = totalOrcado > 0 ? (totalDespesas / totalOrcado) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card
          className={resultado >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Resultado Realizado</span>
              {resultado >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
            </div>
            <p
              className={`text-3xl font-bold ${resultado >= 0 ? "text-green-700" : "text-red-700"}`}
            >
              {formatCurrency(resultado)}
            </p>
            <p className="text-xs text-slate-600 mt-2">Receitas - Despesas (pagas)</p>
          </CardContent>
        </Card>

        <Card
          className={
            resultadoPrevisto >= 0 ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"
          }
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Resultado Previsto</span>
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <p
              className={`text-3xl font-bold ${resultadoPrevisto >= 0 ? "text-blue-700" : "text-orange-700"}`}
            >
              {formatCurrency(resultadoPrevisto)}
            </p>
            <p className="text-xs text-slate-600 mt-2">Todas receitas - Todas despesas</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo Financeiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-slate-700 mb-3">Receitas</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Previsto:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(totalReceitasPrevistas)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Recebido:</span>
                  <span className="font-semibold text-green-700">
                    {formatCurrency(totalReceitas)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">A Receber:</span>
                  <span className="font-semibold text-blue-700">
                    {formatCurrency(totalReceitasPrevistas - totalReceitas)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-700 mb-3">Despesas</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Previsto:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(totalDespesasPrevistas)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Pago:</span>
                  <span className="font-semibold text-red-700">
                    {formatCurrency(totalDespesas)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">A Pagar:</span>
                  <span className="font-semibold text-blue-700">
                    {formatCurrency(totalDespesasPrevistas - totalDespesas)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orçado x Realizado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm text-slate-600">Orçamento Total</p>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(totalOrcado)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 text-right">Realizado</p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(totalDespesas)}</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Execução do Orçamento</span>
                <span className="font-semibold text-slate-800">{percentualOrcado.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${percentualOrcado > 100 ? "bg-red-600" : "bg-blue-600"} transition-all`}
                  style={{ width: `${Math.min(percentualOrcado, 100)}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between items-center p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                {diferencaOrcamento > 0 ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="text-sm text-slate-600">Estouro de Orçamento</p>
                      <p className="text-lg font-bold text-red-700">
                        {formatCurrency(Math.abs(diferencaOrcamento))}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm text-slate-600">Economia no Orçamento</p>
                      <p className="text-lg font-bold text-green-700">
                        {formatCurrency(Math.abs(diferencaOrcamento))}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <Badge
                className={
                  diferencaOrcamento > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }
              >
                {diferencaOrcamento > 0 ? "+" : ""}
                {((diferencaOrcamento / totalOrcado) * 100).toFixed(1)}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
