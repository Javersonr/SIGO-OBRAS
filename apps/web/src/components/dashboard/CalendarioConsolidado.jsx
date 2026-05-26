import React, { useState, useEffect, useMemo, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2, Building2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import OportunidadeDetalhe from "../oportunidades/OportunidadeDetalhe";

export default function CalendarioConsolidado() {
  const { user, empresas, empresaAtiva, setEmpresaAtiva } = useEmpresa();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [oportunidades, setOportunidades] = useState([]);
  const [empresasMap, setEmpresasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filtroEmpresa, setFiltroEmpresa] = useState("todas");
  const [popoverData, setPopoverData] = useState(null);
  const [popoverDia, setPopoverDia] = useState(null);
  const popoverRef = useRef(null);

  // Estado para modal de detalhe inline (igual ao CalendarioFinanceiro)
  const [oportunidadeDetalhe, setOportunidadeDetalhe] = useState(null);
  const [empresaDetalhe, setEmpresaDetalhe] = useState(null);
  const [showDetalhe, setShowDetalhe] = useState(false);
  const [atualizacoes, setAtualizacoes] = useState([]);
  const [orcamentoItens, setOrcamentoItens] = useState([]);
  const [cronogramaEtapas, setCronogramaEtapas] = useState([]);
  const [arquivos, setArquivos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [statusListDetalhe, setStatusListDetalhe] = useState([]);
  const [usuariosDetalhe, setUsuariosDetalhe] = useState([]);
  const [novaNota, setNovaNota] = useState("");
  const [itensSelecionados, setItensSelecionados] = useState(new Set());
  const [filtroTipoOrcamento, setFiltroTipoOrcamento] = useState("all");
  const updateTimeoutRef = useRef({});
  const fileInputRef = useRef(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        if (e.target.closest("button")?.textContent?.includes("mais")) return;
        setPopoverDia(null);
      }
    };
    if (popoverDia) {
      setTimeout(() => document.addEventListener("click", handleClick), 0);
    }
    return () => document.removeEventListener("click", handleClick);
  }, [popoverDia]);

  useEffect(() => {
    if (!user?.email) return;
    loadTodasOportunidades();
  }, [user?.email, empresas]);

  const loadTodasOportunidades = async () => {
    setLoading(true);
    try {
      // Construir mapa de empresas a partir do contexto (evita chamadas extras)
      const map = {};
      (empresas || []).forEach((e) => {
        map[e.id] = e;
      });

      // Usar empresas já disponíveis no contexto em vez de buscar vínculos novamente
      const empresasIds = Object.keys(map);
      if (empresasIds.length === 0) {
        setLoading(false);
        return;
      }

      // Buscar oportunidades sequencialmente para evitar rate limit
      const todasOps = [];
      for (const empresaId of empresasIds) {
        try {
          const ops = await sigo.entities.Oportunidade.filter({
            empresa_id: empresaId,
            arquivado: false,
          });
          todasOps.push(...ops);
        } catch (e) {
          if (e?.status === 429) {
            // Rate limit: aguardar e tentar novamente
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const ops = await sigo.entities.Oportunidade.filter({
                empresa_id: empresaId,
                arquivado: false,
              });
              todasOps.push(...ops);
            } catch {
              /* skip */
            }
          }
        }
        // Pequeno delay entre requisições para não sobrecarregar
        if (empresasIds.indexOf(empresaId) < empresasIds.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      setEmpresasMap(map);
      setOportunidades(todasOps);
    } catch (e) {
      console.error("Erro ao carregar calendário:", e);
    } finally {
      setLoading(false);
    }
  };

  // Abrir oportunidade inline (mesma lógica do CalendarioFinanceiro)
  const handleClickOportunidade = async (op) => {
    const empresaDona = empresasMap[op.empresa_id] || empresaAtiva;
    // Se for empresa diferente da ativa, trocar para ela (sem navegar)
    if (empresaDona && empresaDona.id !== empresaAtiva?.id) {
      await setEmpresaAtiva(empresaDona, window.location.pathname + window.location.search);
    }
    // Carregar dados da oportunidade em dois lotes para reduzir burst
    try {
      const [atualiz, itens, etapas, arqs] = await Promise.all([
        sigo.entities.OportunidadeAtualizacao.filter({
          empresa_id: op.empresa_id,
          oportunidade_id: op.id,
        }),
        sigo.entities.OrcamentoItem.filter({ empresa_id: op.empresa_id, oportunidade_id: op.id }),
        sigo.entities.CronogramaEtapa.filter({ empresa_id: op.empresa_id, oportunidade_id: op.id }),
        sigo.entities.ArquivoOportunidade.filter({
          empresa_id: op.empresa_id,
          oportunidade_id: op.id,
        }),
      ]);
      setAtualizacoes(atualiz.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setOrcamentoItens(itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
      setCronogramaEtapas(etapas.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
      setArquivos(arqs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));

      await new Promise((r) => setTimeout(r, 150));
      const [status, usuarios] = await Promise.all([
        sigo.entities.StatusOportunidade.filter({ empresa_id: op.empresa_id }),
        sigo.entities.UsuarioEmpresa.filter({ empresa_id: op.empresa_id, ativo: true }),
      ]);
      setStatusListDetalhe(status.sort((a, b) => a.ordem - b.ordem));
      setUsuariosDetalhe(usuarios);
    } catch {}
    setEmpresaDetalhe(empresaDona);
    setOportunidadeDetalhe(op);
    setShowDetalhe(true);
  };

  const empresasComOps = useMemo(() => {
    const ids = new Set(
      oportunidades
        .filter((op) => op.licitacao_data || op.data_fechamento_prevista)
        .map((op) => op.empresa_id)
    );
    return [...ids].map((id) => empresasMap[id]).filter(Boolean);
  }, [oportunidades, empresasMap]);

  const opsFiltradas = useMemo(() => {
    if (filtroEmpresa === "todas") return oportunidades;
    return oportunidades.filter((op) => op.empresa_id === filtroEmpresa);
  }, [oportunidades, filtroEmpresa]);

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDate = new Date(monthStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const endDate = new Date(monthEnd);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const days = [];
  let day = new Date(startDate);
  while (day <= endDate) {
    days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }

  const oportunidadesPorData = useMemo(() => {
    const map = {};
    opsFiltradas.forEach((op) => {
      const entradas = [];
      if (op.licitacao_data) entradas.push({ op, tipo: "licitacao", data: op.licitacao_data });
      if (op.licitacao_data_impugnacao)
        entradas.push({ op, tipo: "impugnacao", data: op.licitacao_data_impugnacao });
      if (op.licitacao_data_proposta)
        entradas.push({ op, tipo: "proposta", data: op.licitacao_data_proposta });
      if (entradas.length === 0 && op.data_fechamento_prevista) {
        entradas.push({ op, tipo: "fechamento", data: op.data_fechamento_prevista });
      }
      entradas.forEach(({ op: o, tipo, data }) => {
        const dateStr = data.split("T")[0];
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({ ...o, _tipoEvento: tipo });
      });
    });
    return map;
  }, [opsFiltradas]);

  const TIPO_LABELS = {
    licitacao: "🏛️",
    impugnacao: "⚖️",
    proposta: "📋",
    fechamento: "📅",
  };

  const CORES = [
    "bg-blue-100 border-blue-300 text-blue-800",
    "bg-purple-100 border-purple-300 text-purple-800",
    "bg-green-100 border-green-300 text-green-800",
    "bg-orange-100 border-orange-300 text-orange-800",
    "bg-pink-100 border-pink-300 text-pink-800",
    "bg-teal-100 border-teal-300 text-teal-800",
  ];

  const empresasCores = useMemo(() => {
    const mapa = {};
    Object.keys(empresasMap).forEach((id, i) => {
      mapa[id] = CORES[i % CORES.length];
    });
    return mapa;
  }, [empresasMap]);

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (date) => date.getMonth() === currentDate.getMonth();

  const handleAbrirModalCriacao = (dateStr, e) => {
    const empresasDisponiveis = Object.values(empresasMap);
    if (filtroEmpresa !== "todas" || empresasDisponiveis.length === 1) {
      const empresaId = filtroEmpresa !== "todas" ? filtroEmpresa : empresasDisponiveis[0]?.id;
      const empresa = empresasMap[empresaId];
      if (!empresa) return;
      setEmpresaAtiva(empresa).then(() => {
        setTimeout(() => {
          navigate(`${createPageUrl("Oportunidades")}?new=1&licitacao_data=${dateStr}`);
        }, 500);
      });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopoverData({ dateStr, x: rect.left, y: rect.bottom + 4 });
    }
  };

  const handleSelecionarEmpresaENavegar = async (empresaId, dateStr) => {
    setPopoverData(null);
    const empresa = empresasMap[empresaId];
    if (!empresa) return;
    await setEmpresaAtiva(empresa);
    await new Promise((r) => setTimeout(r, 500));
    navigate(`${createPageUrl("Oportunidades")}?new=1&licitacao_data=${dateStr}`);
  };

  return (
    <div className="space-y-3">
      {/* Header com filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">
            {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCurrentDate(new Date())}
          >
            Hoje
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {empresasComOps.length > 1 && (
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="h-7 text-xs w-40">
                <Building2 className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as empresas</SelectItem>
                {empresasComOps.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome_fantasia || e.razao_social || e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 mb-1">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const dateStr = day.toISOString().split("T")[0];
                const opsNoDia = oportunidadesPorData[dateStr] || [];
                const today = isToday(day);
                const currentMonth = isCurrentMonth(day);

                return (
                  <div
                    key={idx}
                    className={cn(
                      "min-h-[80px] p-1 rounded border transition-colors group/day",
                      today && "bg-blue-50 border-blue-300",
                      !today && currentMonth && "bg-white border-slate-200",
                      !currentMonth && "bg-slate-50 border-slate-100"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div
                        className={cn(
                          "text-xs font-medium",
                          today && "text-blue-600 font-bold",
                          !today && currentMonth && "text-slate-700",
                          !currentMonth && "text-slate-400"
                        )}
                      >
                        {day.getDate()}
                      </div>
                      {currentMonth && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAbrirModalCriacao(dateStr, e);
                          }}
                          className="opacity-0 group-hover/day:opacity-100 transition-opacity w-4 h-4 rounded-full bg-slate-200 hover:bg-blue-500 hover:text-white flex items-center justify-center text-slate-500"
                          title="Criar oportunidade nesta data"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {opsNoDia.slice(0, 2).map((op) => {
                        const corClasse = empresasCores[op.empresa_id] || CORES[0];
                        const empresa = empresasMap[op.empresa_id];
                        const nomeEmpresa =
                          empresa?.nome_fantasia || empresa?.razao_social || empresa?.nome || "";
                        return (
                          <div
                            key={op.id + op._tipoEvento}
                            onClick={() => handleClickOportunidade(op)}
                            title={nomeEmpresa ? `${op.nome} — ${nomeEmpresa}` : op.nome}
                            className={cn(
                              "px-1 py-0.5 rounded border text-xs cursor-pointer truncate hover:opacity-75 transition-opacity group relative overflow-visible",
                              corClasse
                            )}
                          >
                            <span className="truncate block">
                              {TIPO_LABELS[op._tipoEvento] || ""} {op.nome}
                            </span>
                            <span className="absolute left-0 right-0 -top-14 z-10 hidden group-hover:flex flex-col items-start bg-slate-800 text-white text-xs rounded px-2 py-1.5 pointer-events-none whitespace-nowrap shadow-lg gap-0.5">
                              {nomeEmpresa && <span className="font-semibold">{nomeEmpresa}</span>}
                              <span>
                                {op._tipoEvento === "impugnacao"
                                  ? "⚖️ Impugnação"
                                  : op._tipoEvento === "proposta"
                                    ? "📋 Limite Proposta"
                                    : op._tipoEvento === "licitacao"
                                      ? "🏛️ Licitação"
                                      : "📅 Fechamento"}
                                {op.licitacao_modalidade ? ` · ${op.licitacao_modalidade}` : ""}
                              </span>
                              {op.licitacao_garantia_proposta && (
                                <span>✅ Com garantia de proposta</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                      {opsNoDia.length > 2 && (
                        <button
                          className="text-xs text-blue-600 font-medium pl-0.5 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPopoverDia((prev) =>
                              prev?.dateStr === dateStr ? null : { dateStr, rect }
                            );
                          }}
                        >
                          +{opsNoDia.length - 2} mais
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Popover de oportunidades extras */}
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
                {opsPopover.map((op) => {
                  const empresa = empresasMap[op.empresa_id];
                  const nomeEmpresa =
                    empresa?.nome_fantasia || empresa?.razao_social || empresa?.nome || "";
                  return (
                    <div
                      key={op.id + op._tipoEvento}
                      onClick={() => {
                        handleClickOportunidade(op);
                        setPopoverDia(null);
                      }}
                      className="p-2 rounded-lg text-sm cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all"
                    >
                      <p className="font-medium text-slate-800">
                        {TIPO_LABELS[op._tipoEvento] || ""} {op.nome}
                      </p>
                      {nomeEmpresa && (
                        <p className="text-xs text-slate-500 mt-0.5">{nomeEmpresa}</p>
                      )}
                      {op.licitacao_modalidade && (
                        <p className="text-xs text-slate-500">{op.licitacao_modalidade}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {/* Popover seleção de empresa para criar oportunidade */}
      {popoverData && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopoverData(null)} />
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-2 min-w-[200px]"
            style={{ left: popoverData.x, top: popoverData.y }}
          >
            <p className="text-xs font-semibold text-slate-500 px-2 py-1 mb-1">
              Criar oportunidade em:
            </p>
            {Object.values(empresasMap).map((e) => (
              <button
                key={e.id}
                onClick={() => handleSelecionarEmpresaENavegar(e.id, popoverData.dateStr)}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-100 transition-colors flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate">{e.nome_fantasia || e.razao_social || e.nome}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Legenda de empresas */}
      {Object.keys(empresasMap).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(empresasMap).map(([id, empresa], i) => (
            <button
              key={id}
              onClick={() => setFiltroEmpresa(filtroEmpresa === id ? "todas" : id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs transition-all",
                filtroEmpresa === id
                  ? "border-slate-400 bg-slate-100 font-semibold"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className={cn("w-2.5 h-2.5 rounded-full border", CORES[i % CORES.length])} />
              <span className="text-slate-600">
                {empresa?.nome_fantasia || empresa?.razao_social || empresa?.nome}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Modal de detalhe inline (igual ao CalendarioFinanceiro) */}
      <OportunidadeDetalhe
        open={showDetalhe}
        onOpenChange={(v) => {
          setShowDetalhe(v);
          if (!v) {
            setOportunidadeDetalhe(null);
            setEmpresaDetalhe(null);
          }
        }}
        selectedOp={oportunidadeDetalhe}
        setSelectedOp={setOportunidadeDetalhe}
        statusList={statusListDetalhe}
        usuariosEmpresa={usuariosDetalhe}
        empresaAtiva={empresaDetalhe || empresaAtiva}
        user={user}
        perfil="Admin"
        temPermissao={() => true}
        podeVerValores={true}
        atualizacoes={atualizacoes}
        orcamentoItens={orcamentoItens}
        setOrcamentoItens={setOrcamentoItens}
        cronogramaEtapas={cronogramaEtapas}
        arquivos={arquivos}
        materiais={materiais}
        novaNota={novaNota}
        setNovaNota={setNovaNota}
        itensSelecionados={itensSelecionados}
        setItensSelecionados={setItensSelecionados}
        filtroTipoOrcamento={filtroTipoOrcamento}
        setFiltroTipoOrcamento={setFiltroTipoOrcamento}
        updateTimeoutRef={updateTimeoutRef}
        onAddNota={async () => {}}
        onDeleteArquivo={async () => {}}
        onUploadFile={async () => {}}
        onReloadArquivos={() => {}}
        onLimparOrcamento={async () => {}}
        onExportarExcel={() => {}}
        onExportarPDF={async () => {}}
        onBaixarModelo={() => {}}
        onImportarOrcamento={async () => {}}
        onDeleteOrcamentoItem={async () => {}}
        onDeleteSelecionados={async () => {}}
        onNovoOrcamentoSelect={async () => {}}
        onOpenModal={() => {}}
        onDelete={async () => {}}
        onShowStatusConfig={() => {}}
        onShowSalvarTemplate={() => {}}
        onShowAplicarTemplate={() => {}}
        onShowRelatoriosOrcamento={() => {}}
        onShowClienteView={() => {}}
        setOportunidades={() => {}}
        fileInputOrcamentoRef={fileInputRef}
        uploadingFile={uploadingFile}
      />
    </div>
  );
}
