import React, { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, DollarSign, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIPOS_PRAZO, chaveDoDia, eventosPorDia, rotuloEvento } from "@/lib/prazos-licitacao";

// Tipos que levam o valor estimado no chip (os prazos só repetiriam o valor).
const TIPOS_COM_VALOR = new Set(["sessao", "fechamento"]);

export default function CalendarioOportunidades({
  oportunidades,
  onSelectOportunidade,
  formatCurrency,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [popoverDia, setPopoverDia] = useState(null); // { dateStr, rect }
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        // Se clicou em um botão "+mais", não feche
        if (e.target.closest("button")?.textContent?.includes("mais")) return;
        setPopoverDia(null);
      }
    };
    if (popoverDia) {
      setTimeout(() => document.addEventListener("click", handleClick), 0);
    }
    return () => document.removeEventListener("click", handleClick);
  }, [popoverDia]);

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDate = new Date(monthStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const endDate = new Date(monthEnd);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Um evento por prazo: impugnação, esclarecimento, limite da proposta e sessão
  // (ou fechamento previsto, sem sessão). Proposta = sessão não duplica.
  const oportunidadesPorData = useMemo(() => eventosPorDia(oportunidades), [oportunidades]);

  const days = [];
  let day = new Date(startDate);
  while (day <= endDate) {
    days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  return (
    <div className="space-y-4">
      {/* Header do Calendário */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800">
            {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h2>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Hoje
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grid do Calendário */}
      <Card>
        <CardContent className="p-4">
          {/* Dias da Semana */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => (
              <div key={dia} className="text-center text-sm font-semibold text-slate-600 py-2">
                {dia}
              </div>
            ))}
          </div>

          {/* Dias do Mês */}
          <div className="grid grid-cols-7 gap-2">
            {days.map((day, idx) => {
              const dateStr = chaveDoDia(day);
              const opsNoDia = oportunidadesPorData[dateStr] || [];
              const today = isToday(day);
              const currentMonth = isCurrentMonth(day);

              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[120px] p-2 rounded-lg border transition-colors",
                    today && "bg-amber-50 border-amber-300",
                    !today && currentMonth && "bg-white border-slate-200 hover:bg-slate-50",
                    !currentMonth && "bg-slate-50 border-slate-100"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium mb-2",
                      today && "text-amber-600",
                      !today && currentMonth && "text-slate-700",
                      !currentMonth && "text-slate-400"
                    )}
                  >
                    {day.getDate()}
                  </div>

                  <div className="space-y-1">
                    {opsNoDia.slice(0, 3).map((ev) => {
                      const { op } = ev;
                      const tipo = TIPOS_PRAZO[ev.tipo];
                      return (
                        <div
                          key={`${op.id}-${ev.tipo}`}
                          onClick={() => onSelectOportunidade(op)}
                          title={`${rotuloEvento(ev)} — ${op.nome || op.titulo || ""}`}
                          className={cn(
                            "p-1.5 rounded border text-xs cursor-pointer hover:shadow-md transition-all",
                            tipo.classe
                          )}
                        >
                          <p className="flex items-center gap-1 text-[10px] font-semibold leading-tight mb-0.5">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", tipo.ponto)} />
                            <span className="truncate">{rotuloEvento(ev)}</span>
                          </p>
                          <p className="font-medium text-slate-800 truncate">
                            {op.nome || op.titulo}
                          </p>
                          {TIPOS_COM_VALOR.has(ev.tipo) && op.valor_estimado > 0 && (
                            <p className="text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                              <DollarSign className="w-3 h-3" />
                              {formatCurrency(op.valor_estimado)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {opsNoDia.length > 3 && (
                      <button
                        className="text-xs text-blue-600 font-medium pl-1 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPopoverDia((prev) =>
                            prev?.dateStr === dateStr ? null : { dateStr, rect }
                          );
                        }}
                      >
                        +{opsNoDia.length - 3} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Popover cascata - todos os itens do dia */}
      {popoverDia &&
        (() => {
          const opsPopover = oportunidadesPorData[popoverDia.dateStr] || [];
          const dateLabel = new Date(popoverDia.dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
          return (
            <div
              ref={popoverRef}
              className="fixed bg-white border border-slate-200 rounded-xl shadow-xl w-72 max-h-80 overflow-y-auto"
              style={{
                zIndex: 9999,
                top: Math.min(popoverDia.rect.bottom + 4, window.innerHeight - 320),
                left: Math.min(popoverDia.rect.left, window.innerWidth - 290),
              }}
            >
              <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 capitalize">{dateLabel}</p>
                <button
                  onClick={() => setPopoverDia(null)}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="p-2 space-y-1">
                {opsPopover.map(({ op, ...ev }) => (
                  <div
                    key={`${op.id}-${ev.tipo}`}
                    onClick={() => {
                      onSelectOportunidade(op);
                      setPopoverDia(null);
                    }}
                    className="p-2 rounded-lg text-sm cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <span
                        className={cn("w-2 h-2 rounded-full shrink-0", TIPOS_PRAZO[ev.tipo].ponto)}
                      />
                      {rotuloEvento(ev)}
                    </p>
                    <p className="font-medium text-slate-800">{op.nome || op.titulo}</p>
                    {op.cidade && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {op.cidade}
                        {op.estado ? `/${op.estado}` : ""}
                      </p>
                    )}
                    {op.valor_estimado > 0 && (
                      <p className="text-xs text-green-600 font-semibold mt-0.5">
                        {formatCurrency(op.valor_estimado)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        {Object.entries(TIPOS_PRAZO).map(([id, tipo]) => (
          <div key={id} className="flex items-center gap-2">
            <div className={cn("w-4 h-4 rounded border", tipo.classe)} />
            <span>{tipo.rotulo}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-50 border border-amber-300" />
          <span>Hoje</span>
        </div>
      </div>
    </div>
  );
}
