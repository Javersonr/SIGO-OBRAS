import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function KpiCard({
  titulo,
  valor,
  subtitulo,
  icon: Icon,
  cor = "blue",
  tendencia,
  tendenciaValor,
}) {
  const cores = {
    blue: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      icon: "text-blue-500",
      border: "border-blue-100",
    },
    green: {
      bg: "bg-green-50",
      text: "text-green-700",
      icon: "text-green-500",
      border: "border-green-100",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      icon: "text-amber-500",
      border: "border-amber-100",
    },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500", border: "border-red-100" },
    purple: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      icon: "text-purple-500",
      border: "border-purple-100",
    },
    slate: {
      bg: "bg-slate-50",
      text: "text-slate-700",
      icon: "text-slate-500",
      border: "border-slate-100",
    },
  };
  const c = cores[cor] || cores.blue;

  const TendIcon = tendencia === "up" ? TrendingUp : tendencia === "down" ? TrendingDown : Minus;
  const tendCor =
    tendencia === "up"
      ? "text-green-600"
      : tendencia === "down"
        ? "text-red-500"
        : "text-slate-400";

  return (
    <Card className={cn("border", c.border)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{titulo}</p>
            <p className={cn("text-2xl font-bold mt-1", c.text)}>{valor}</p>
            {subtitulo && <p className="text-xs text-slate-500 mt-1">{subtitulo}</p>}
          </div>
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
              c.bg
            )}
          >
            {Icon && <Icon className={cn("w-5 h-5", c.icon)} />}
          </div>
        </div>
        {tendenciaValor && (
          <div className={cn("flex items-center gap-1 mt-3 text-xs font-medium", tendCor)}>
            <TendIcon className="w-3.5 h-3.5" />
            {tendenciaValor}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
