import React, { useState, useEffect, useMemo } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const formatCurrency = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const formatDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function AlertasVencimento() {
  const { empresaAtiva, empresas, setEmpresaAtiva } = useEmpresa();
  const navigate = useNavigate();
  const [transacoes, setTransacoes] = useState([]);
  const [empresasMap, setEmpresasMap] = useState({});
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("alertas_dismissed") || "[]");
    } catch {
      return [];
    }
  });
  const [expandido, setExpandido] = useState(true);

  useEffect(() => {
    if (!empresas?.length) return;

    // Montar mapa empresa_id -> nome
    const mapa = {};
    empresas.forEach((e) => {
      mapa[e.id] = e.razao_social || e.nome_fantasia || e.nome;
    });
    setEmpresasMap(mapa);

    // Buscar despesas E receitas de todas as empresas em paralelo.
    // allSettled garante que 1 query falhando não trava o componente em loading.
    Promise.allSettled(
      empresas.flatMap((e) => [
        sigo.entities.TransacaoFinanceira.filter({ empresa_id: e.id, tipo: "Despesa" }),
        sigo.entities.TransacaoFinanceira.filter({ empresa_id: e.id, tipo: "Receita" }),
      ])
    ).then((resultados) => {
      const ok = resultados.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const falhas = resultados.filter((r) => r.status === "rejected");
      if (falhas.length > 0) {
        console.warn(`[AlertasVencimento] ${falhas.length} query(s) falharam:`, falhas[0]?.reason);
      }
      setTransacoes(ok);
    });
  }, [empresas]);

  const alertas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje);
    limite.setDate(hoje.getDate() + 3);

    return transacoes
      .filter((t) => {
        if (!t.data_vencimento) return false;
        const venc = new Date(t.data_vencimento + "T00:00:00");
        const status = (t.status || "").toLowerCase();
        if (status === "pago" || status === "realizado" || status === "cancelado") return false;
        return venc >= hoje && venc <= limite;
      })
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  }, [transacoes]);

  const alertasVisiveis = alertas.filter((t) => !dismissed.includes(t.id));

  const dismiss = (id, e) => {
    e.stopPropagation();
    const novo = [...dismissed, id];
    setDismissed(novo);
    sessionStorage.setItem("alertas_dismissed", JSON.stringify(novo));
  };

  const dismissAll = (e) => {
    e.stopPropagation();
    const novo = alertasVisiveis.map((t) => t.id);
    const total = [...dismissed, ...novo];
    setDismissed(total);
    sessionStorage.setItem("alertas_dismissed", JSON.stringify(total));
  };

  const abrirTransacao = (t) => {
    const aba = (t.tipo || "").toLowerCase() === "despesa" ? "despesas" : "receitas";
    // Navegar imediatamente — o Financeiro cuida da troca de empresa se necessário
    navigate(`/Financeiro?transacaoId=${t.id}&tab=${aba}&empresaId=${t.empresa_id}`);
  };

  if (alertasVisiveis.length === 0) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  const labelDia = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    if (d.getTime() === hoje.getTime()) return "Hoje";
    if (d.getTime() === amanha.getTime()) return "Amanhã";
    return formatDate(dateStr);
  };

  const urgentes = alertasVisiveis.filter((t) => {
    const d = new Date(t.data_vencimento + "T00:00:00");
    return d.getTime() === hoje.getTime() || d.getTime() === amanha.getTime();
  });

  const isDespesa = (t) => (t?.tipo || "").toLowerCase() === "despesa";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border-2 overflow-hidden",
          urgentes.length > 0 ? "border-red-300 bg-red-50" : "border-orange-200 bg-orange-50"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3",
            urgentes.length > 0 ? "bg-red-100" : "bg-orange-100"
          )}
        >
          <button
            onClick={() => setExpandido((v) => !v)}
            className="flex items-center gap-2 flex-1 text-left"
          >
            <AlertTriangle
              className={cn(
                "w-5 h-5 shrink-0",
                urgentes.length > 0 ? "text-red-600" : "text-orange-600"
              )}
            />
            <span
              className={cn(
                "text-sm font-semibold",
                urgentes.length > 0 ? "text-red-800" : "text-orange-800"
              )}
            >
              {alertasVisiveis.length} conta{alertasVisiveis.length > 1 ? "s" : ""} a pagar vencendo
              nos próximos 3 dias
              {urgentes.length > 0 && (
                <span className="ml-2 text-xs font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full">
                  {urgentes.length} urgente{urgentes.length > 1 ? "s" : ""}
                </span>
              )}
            </span>
            {expandido ? (
              <ChevronUp className="w-4 h-4 ml-auto text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-auto text-slate-500" />
            )}
          </button>
          <button
            onClick={dismissAll}
            className="ml-3 text-xs text-slate-500 hover:text-slate-700 underline shrink-0"
          >
            Dispensar todos
          </button>
        </div>

        {/* Lista */}
        {expandido && (
          <div className="divide-y divide-orange-100">
            {alertasVisiveis.map((t) => {
              const d = new Date(t.data_vencimento + "T00:00:00");
              const isUrgente = d.getTime() === hoje.getTime() || d.getTime() === amanha.getTime();
              const nomeEmpresa = empresasMap[t.empresa_id];
              const multiEmpresa = empresas?.length > 1;

              return (
                <div
                  key={t.id}
                  onClick={() => abrirTransacao(t)}
                  className="flex items-center justify-between px-4 py-2.5 gap-3 hover:bg-white/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full shrink-0",
                        isUrgente ? "bg-red-200 text-red-800" : "bg-orange-200 text-orange-800"
                      )}
                    >
                      {labelDia(t.data_vencimento)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {t.descricao || "Sem descrição"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {[
                          isDespesa(t)
                            ? t.fornecedor_nome || t.categoria_nome
                            : t.cliente_nome || t.categoria_nome,
                          multiEmpresa && nomeEmpresa,
                          !isDespesa(t) && "Receita",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "text-sm font-bold",
                        isDespesa(t) ? "text-red-700" : "text-green-700"
                      )}
                    >
                      {formatCurrency(t.valor)}
                    </span>
                    <button
                      onClick={(e) => dismiss(t.id, e)}
                      className="p-1 hover:bg-red-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                      title="Dispensar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
