import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export default function CardsResumo({ transacoes, tipo = "receitas" }) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  const total = transacoes.reduce((sum, t) => sum + (t.valor || 0), 0);
  const pendentes = transacoes.filter((t) => t.status === "em_aberto" || t.status === "Pendente");
  const pagos = transacoes.filter(
    (t) => t.status === "pago" || t.status === "Pago" || t.status === "Realizado"
  );
  const atrasados = transacoes.filter((t) => {
    if (t.status === "atrasado") return true;
    if (t.status !== "em_aberto" && t.status !== "Pendente") return false;
    const vencimento = new Date(t.data_vencimento);
    return vencimento < new Date();
  });

  const totalPendente = pendentes.reduce((sum, t) => sum + (t.valor || 0), 0);
  const totalPago = pagos.reduce((sum, t) => sum + (t.valor || 0), 0);
  const totalAtrasado = atrasados.reduce((sum, t) => sum + (t.valor || 0), 0);

  const cards = [
    {
      label: "Total",
      value: total,
      icon: tipo === "receitas" ? TrendingUp : TrendingDown,
      color: tipo === "receitas" ? "text-blue-600" : "text-slate-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
    {
      label: tipo === "receitas" ? "A Receber" : "A Pagar",
      value: totalPendente,
      count: pendentes.length,
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
    },
    {
      label: tipo === "receitas" ? "Recebido" : "Pago",
      value: totalPago,
      count: pagos.length,
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
    },
    {
      label: "Atrasados",
      value: totalAtrasado,
      count: atrasados.length,
      icon: AlertCircle,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className={`border-2 ${card.borderColor}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{formatCurrency(card.value)}</p>
                {card.count !== undefined && (
                  <p className="text-xs text-slate-500 mt-1">
                    {card.count} {card.count === 1 ? "item" : "itens"}
                  </p>
                )}
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
