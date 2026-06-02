import React, { useState, useEffect, useMemo, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import DetalheDespesaModal from "./DetalheDespesaModal";
import DetalheReceitaModal from "./DetalheReceitaModal";

const formatCurrency = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function CalendarioFinanceiro() {
  const { empresaAtiva, setEmpresaAtiva, empresas } = useEmpresa();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [transacaoDetalhe, setTransacaoDetalhe] = useState(null);
  const [empresaDetalhe, setEmpresaDetalhe] = useState(null);
  const [anexosDetalhe, setAnexosDetalhe] = useState([]);
  const [showDespesaDetalhe, setShowDespesaDetalhe] = useState(false);
  const [showReceitaDetalhe, setShowReceitaDetalhe] = useState(false);

  const handleAbrirTransacao = async (t) => {
    setPopoverDia(null);
    // Encontrar a empresa dona da transação
    const empresaDona = empresas?.find((e) => e.id === t.empresa_id) || empresaAtiva;
    // Se for empresa diferente da ativa, trocar para ela
    if (empresaDona && empresaDona.id !== empresaAtiva?.id) {
      await setEmpresaAtiva(empresaDona, window.location.pathname + window.location.search);
    }
    // Buscar anexos da transação
    try {
      const anexos = await sigo.entities.TransacaoAnexo.filter({ transacao_id: t.id });
      setAnexosDetalhe(anexos);
    } catch {
      setAnexosDetalhe([]);
    }
    setEmpresaDetalhe(empresaDona);
    setTransacaoDetalhe(t);
    const tipo = (t.tipo || "").toLowerCase();
    if (tipo === "receita") {
      setShowReceitaDetalhe(true);
    } else {
      setShowDespesaDetalhe(true);
    }
  };

  const [transacoes, setTransacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [popoverDia, setPopoverDia] = useState(null);
  const popoverRef = useRef(null);

  // Fechar popover ao clicar fora
  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverDia(null);
      }
    };
    if (popoverDia) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverDia]);

  // Carregar transações de todas as empresas do usuário
  useEffect(() => {
    if (!empresas?.length) return;
    setLoading(true);
    Promise.all(empresas.map((e) => sigo.entities.TransacaoFinanceira.filter({ empresa_id: e.id })))
      .then((resultados) => setTransacoes(resultados.flat()))
      .finally(() => setLoading(false));
  }, [empresas?.map((e) => e.id).join(",")]);

  // Fixa horário no meio-dia: evita que mudanças de DST (caso o Brasil
  // volte a ter horário de verão) ou setDate sobre uma data com horário 00:00
  // gerem dia pulado/repetido. Iteração sempre constrói novo Date para
  // não acumular drift de ms.
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12, 0, 0);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 12, 0, 0);

  const startDate = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    monthStart.getDate() - monthStart.getDay(),
    12,
    0,
    0
  );
  const endDate = new Date(
    monthEnd.getFullYear(),
    monthEnd.getMonth(),
    monthEnd.getDate() + (6 - monthEnd.getDay()),
    12,
    0,
    0
  );

  const days = [];
  for (
    let d = new Date(startDate);
    d <= endDate;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0)
  ) {
    days.push(new Date(d));
  }

  // Agrupar transações por data de vencimento
  const transacoesPorData = useMemo(() => {
    const map = {};
    transacoes.forEach((t) => {
      const dataKey = t.data_vencimento || t.data;
      if (!dataKey) return;
      const dateStr = dataKey.split("T")[0];
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(t);
    });
    return map;
  }, [transacoes]);

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (date) => date.getMonth() === currentDate.getMonth();

  // Resumo do mês
  const resumoMes = useMemo(() => {
    let receitas = 0,
      despesas = 0;
    transacoes.forEach((t) => {
      const dataKey = t.data_vencimento || t.data;
      if (!dataKey) return;
      const d = new Date(dataKey + "T12:00:00");
      if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear())
        return;
      const tipo = (t.tipo || "").toLowerCase();
      if (tipo === "receita") receitas += t.valor || 0;
      else if (tipo === "despesa") despesas += t.valor || 0;
    });
    return { receitas, despesas, saldo: receitas - despesas };
  }, [transacoes, currentDate]);

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 capitalize">
          {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Resumo do mês */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
          <div>
            <p className="text-xs text-green-700">Receitas</p>
            <p className="text-sm font-bold text-green-700">{formatCurrency(resumoMes.receitas)}</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
          <div>
            <p className="text-xs text-red-700">Despesas</p>
            <p className="text-sm font-bold text-red-700">{formatCurrency(resumoMes.despesas)}</p>
          </div>
        </div>
        <div
          className={cn(
            "border rounded-lg px-3 py-2 flex items-center gap-2",
            resumoMes.saldo >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"
          )}
        >
          <div>
            <p
              className={cn("text-xs", resumoMes.saldo >= 0 ? "text-blue-700" : "text-orange-700")}
            >
              Saldo
            </p>
            <p
              className={cn(
                "text-sm font-bold",
                resumoMes.saldo >= 0 ? "text-blue-700" : "text-orange-700"
              )}
            >
              {formatCurrency(resumoMes.saldo)}
            </p>
          </div>
        </div>
      </div>

      {/* Grid calendário */}
      <Card>
        <CardContent className="p-3">
          {/* Dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => (
              <div key={dia} className="text-center text-xs font-semibold text-slate-500 py-1">
                {dia}
              </div>
            ))}
          </div>

          {/* Células dos dias */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const dateStr = day.toISOString().split("T")[0];
              const items = transacoesPorData[dateStr] || [];
              const receitas = items.filter((t) => (t.tipo || "").toLowerCase() === "receita");
              const despesas = items.filter((t) => (t.tipo || "").toLowerCase() === "despesa");
              const today = isToday(day);
              const currentMonth = isCurrentMonth(day);
              const MAX_SHOW = 2;
              const totalItems = items.length;
              const showItems = items.slice(0, MAX_SHOW);
              const extra = totalItems - MAX_SHOW;

              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[90px] p-1.5 rounded-lg border text-left transition-colors",
                    today && "bg-amber-50 border-amber-300",
                    !today && currentMonth && "bg-white border-slate-200 hover:bg-slate-50",
                    !currentMonth && "bg-slate-50 border-slate-100"
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-semibold mb-1",
                      today && "text-amber-600",
                      !today && currentMonth && "text-slate-700",
                      !currentMonth && "text-slate-400"
                    )}
                  >
                    {day.getDate()}
                    {items.length > 0 && currentMonth && (
                      <span className="ml-1 text-slate-400 font-normal">({items.length})</span>
                    )}
                  </div>

                  {/* Pills de receitas/despesas */}
                  {receitas.length > 0 && (
                    <div className="text-xs text-green-700 bg-green-100 rounded px-1 mb-0.5 truncate">
                      +{formatCurrency(receitas.reduce((s, t) => s + (t.valor || 0), 0))}
                    </div>
                  )}
                  {despesas.length > 0 && (
                    <div className="text-xs text-red-700 bg-red-100 rounded px-1 mb-0.5 truncate">
                      -{formatCurrency(despesas.reduce((s, t) => s + (t.valor || 0), 0))}
                    </div>
                  )}

                  {/* Nomes das transações */}
                  <div className="space-y-0.5 mt-0.5">
                    {showItems.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "text-xs rounded px-1 truncate leading-tight cursor-pointer hover:opacity-75",
                          (t.tipo || "").toLowerCase() === "receita"
                            ? "text-green-800 bg-green-50 border border-green-200"
                            : "text-red-800 bg-red-50 border border-red-200"
                        )}
                        title={t.descricao}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAbrirTransacao(t);
                        }}
                      >
                        {t.descricao || "-"}
                      </div>
                    ))}
                    {extra > 0 && (
                      <button
                        className="text-xs text-blue-600 font-medium hover:underline leading-tight"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPopoverDia((prev) =>
                            prev?.dateStr === dateStr ? null : { dateStr, rect, items }
                          );
                        }}
                      >
                        +{extra} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Popover cascata */}
      {popoverDia && (
        <div
          ref={popoverRef}
          className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-80 max-h-96 overflow-y-auto"
          style={{
            top: Math.min(popoverDia.rect.bottom + 4, window.innerHeight - 380),
            left: Math.min(popoverDia.rect.left, window.innerWidth - 320),
          }}
        >
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800 capitalize">
              {new Date(popoverDia.dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <button onClick={() => setPopoverDia(null)} className="p-1 hover:bg-slate-100 rounded">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <div className="p-2 space-y-1">
            {popoverDia.items.map((t) => {
              const isReceita = (t.tipo || "").toLowerCase() === "receita";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "p-2 rounded-lg border transition-all cursor-pointer hover:shadow-sm",
                    isReceita
                      ? "bg-green-50 border-green-200 hover:bg-green-100"
                      : "bg-red-50 border-red-200 hover:bg-red-100"
                  )}
                  onClick={() => {
                    setPopoverDia(null);
                    handleAbrirTransacao(t);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate flex-1">
                      {t.descricao || "-"}
                    </p>
                    <span
                      className={cn(
                        "text-sm font-bold shrink-0",
                        isReceita ? "text-green-700" : "text-red-700"
                      )}
                    >
                      {isReceita ? "+" : "-"}
                      {formatCurrency(t.valor)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {t.categoria_nome && (
                      <Badge variant="outline" className="text-xs py-0">
                        {t.categoria_nome}
                      </Badge>
                    )}
                    {t.projeto_nome && (
                      <span className="text-xs text-slate-500">{t.projeto_nome}</span>
                    )}
                    <Badge
                      className={cn(
                        "text-xs py-0",
                        t.status === "Realizado" || t.status === "pago"
                          ? "bg-green-100 text-green-700"
                          : t.status === "Cancelado"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-yellow-100 text-yellow-700"
                      )}
                    >
                      {t.status || "Previsto"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modais de detalhe inline */}
      <DetalheDespesaModal
        open={showDespesaDetalhe}
        onOpenChange={setShowDespesaDetalhe}
        despesa={transacaoDetalhe}
        anexos={anexosDetalhe}
        podeEditar={true}
        empresaAtiva={empresaDetalhe || empresaAtiva}
        onBaixar={() => {
          setShowDespesaDetalhe(false);
        }}
      />
      <DetalheReceitaModal
        open={showReceitaDetalhe}
        onOpenChange={setShowReceitaDetalhe}
        receita={transacaoDetalhe}
        podeEditar={true}
        empresaAtiva={empresaDetalhe || empresaAtiva}
      />

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span>Receita</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span>Despesa</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-50 border border-amber-300" />
          <span>Hoje</span>
        </div>
      </div>
    </div>
  );
}
