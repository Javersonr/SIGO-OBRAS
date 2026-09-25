import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
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
import { TIPOS_PRAZO, chaveDoDia, eventosPorDia, rotuloEvento } from "@/lib/prazos-licitacao";

// Cor de cada empresa (ponto no chip e legenda) no modo "Todas as empresas".
const CORES = [
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-green-100 border-green-300 text-green-800",
  "bg-orange-100 border-orange-300 text-orange-800",
  "bg-pink-100 border-pink-300 text-pink-800",
  "bg-teal-100 border-teal-300 text-teal-800",
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const nomeDaEmpresa = (e) => e?.nome_fantasia || e?.razao_social || e?.nome || "";

// Oportunidades vivas de UMA empresa (1 nova tentativa em rate limit).
// null = falhou → fica fora do cache e é tentada de novo depois.
async function carregarOpsDaEmpresa(empresaId) {
  const buscar = () =>
    sigo.entities.Oportunidade.filter({ empresa_id: empresaId, arquivado: false });
  try {
    return await buscar();
  } catch (e) {
    if (e?.status === 429) {
      await esperar(1000);
      try {
        return await buscar();
      } catch {
        /* cai no log abaixo */
      }
    }
    console.error("[CalendarioConsolidado] Erro ao carregar oportunidades:", e);
    return null;
  }
}

export default function CalendarioConsolidado() {
  const {
    user,
    empresas,
    empresaAtiva,
    setEmpresaAtiva,
    perfil,
    temPermissao,
    vinculo,
    isSuperAdmin,
  } = useEmpresa();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  // Cache { empresa_id: oportunidades[] } — cada empresa é buscada uma vez por
  // empresa LOGADA (JWT): cacheDonoRef guarda com qual JWT o cache foi montado.
  const [opsPorEmpresa, setOpsPorEmpresa] = useState({});
  const carregadasRef = useRef(new Set());
  const cacheDonoRef = useRef(null);
  // Incrementa para forçar nova busca do que saiu de carregadasRef (invalidação).
  const [cacheVersao, setCacheVersao] = useState(0);
  const [loading, setLoading] = useState(true);
  // Filtro inicial = empresa LOGADA (antes: "todas"). "Todas" segue no seletor.
  const [filtroEmpresa, setFiltroEmpresa] = useState(empresaAtiva?.id || null);
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

  // Empresas que o calendário pode mostrar. A RLS (tenant_isolation) só devolve
  // oportunidades da empresa do JWT (= a logada): para quem não é super admin,
  // buscar outra empresa voltava [] e esse [] ficava no cache. Por isso só o
  // super admin (policy super_admin_all) vê as demais empresas e "Todas".
  const empresasMap = useMemo(() => {
    const map = {};
    if (isSuperAdmin) {
      (empresas || []).forEach((e) => {
        map[e.id] = e;
      });
    }
    if (empresaAtiva?.id && !map[empresaAtiva.id]) map[empresaAtiva.id] = empresaAtiva;
    return map;
  }, [empresas, empresaAtiva, isSuperAdmin]);

  // Trocou a empresa logada: o filtro acompanha — exceto se o usuário
  // escolheu "todas" (abrir evento de outra empresa troca a ativa).
  useEffect(() => {
    if (!empresaAtiva?.id) return;
    setFiltroEmpresa((f) => (f === "todas" ? f : empresaAtiva.id));
  }, [empresaAtiva?.id]);

  // Quem não é super admin vê sempre (e só) a empresa logada.
  const filtroEfetivo = isSuperAdmin ? filtroEmpresa : empresaAtiva?.id || null;

  // Empresas cujas oportunidades o filtro atual mostra.
  const idsVisiveis = useMemo(() => {
    if (filtroEfetivo === "todas") return Object.keys(empresasMap);
    return filtroEfetivo ? [filtroEfetivo] : [];
  }, [filtroEfetivo, empresasMap]);

  // Força nova busca de UMA empresa (ex.: detalhe fechado) sem piscar o
  // calendário: os dados atuais ficam na tela até a resposta chegar.
  const invalidarEmpresa = useCallback((empresaId) => {
    if (!empresaId) return;
    carregadasRef.current.delete(empresaId);
    setCacheVersao((v) => v + 1);
  }, []);

  // Busca só o que falta no cache: de início a empresa logada; as outras só
  // quando o usuário pede (antes buscava TODAS as empresas sempre).
  useEffect(() => {
    if (!user?.email) return;
    // Trocou a empresa logada (= JWT novo; o Layout aplica a sessão antes de
    // mudar empresaAtiva): o que foi buscado com o JWT anterior não vale mais.
    const dono = empresaAtiva?.id || null;
    if (cacheDonoRef.current !== dono) {
      cacheDonoRef.current = dono;
      carregadasRef.current = new Set();
      setOpsPorEmpresa((prev) => (Object.keys(prev).length ? {} : prev));
    }
    const faltam = idsVisiveis.filter((id) => !carregadasRef.current.has(id));
    if (faltam.length === 0) {
      setLoading(false);
      return;
    }
    let ativo = true;
    setLoading(true);
    (async () => {
      // Sequencial com pausa curta: evita rajada/rate limit com várias empresas.
      for (let i = 0; i < faltam.length && ativo; i++) {
        const id = faltam[i];
        if (carregadasRef.current.has(id)) continue;
        const ops = await carregarOpsDaEmpresa(id);
        // Efeito refeito no meio (empresa trocada/invalidação): resposta velha
        // não entra no cache — a execução nova busca de novo.
        if (!ativo) return;
        if (ops) {
          carregadasRef.current.add(id);
          setOpsPorEmpresa((prev) => ({ ...prev, [id]: ops }));
        }
        if (i < faltam.length - 1) await esperar(150);
      }
      if (ativo) setLoading(false);
    })();
    return () => {
      ativo = false;
    };
  }, [user?.email, empresaAtiva?.id, idsVisiveis, cacheVersao]);

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

  const listaEmpresas = useMemo(() => Object.values(empresasMap), [empresasMap]);
  // Ponto colorido da empresa no chip só faz sentido vendo várias.
  const mostrarEmpresas = filtroEfetivo === "todas" && listaEmpresas.length > 1;

  const opsFiltradas = useMemo(
    () => idsVisiveis.flatMap((id) => opsPorEmpresa[id] || []),
    [idsVisiveis, opsPorEmpresa]
  );
  // Spinner só quando falta dado de alguma empresa visível; recarga de uma
  // empresa já exibida (invalidação) atualiza em segundo plano.
  const mostrarSpinner = loading && idsVisiveis.some((id) => !opsPorEmpresa[id]);

  // Mesma regra da página Oportunidades: Admin, ou vínculo sem permissões granulares.
  const podeVerValores = useMemo(() => {
    const permissoes = safeParseJSON(vinculo?.permissoes, {}) || {};
    return perfil === "Admin" || Object.keys(permissoes).length === 0;
  }, [perfil, vinculo?.permissoes]);

  // O detalhe atualiza "a lista" com updaters (prev => prev.map/filter): aplica
  // no cache da empresa da oportunidade — ex.: datas relidas quando o
  // LerEditalSheet fecha aparecem no calendário na hora.
  const empresaIdDetalhe = oportunidadeDetalhe?.empresa_id || empresaDetalhe?.id || null;
  const setOportunidadesDoDetalhe = useCallback(
    (updater) => {
      if (!empresaIdDetalhe || typeof updater !== "function") return;
      setOpsPorEmpresa((prev) =>
        Array.isArray(prev[empresaIdDetalhe])
          ? { ...prev, [empresaIdDetalhe]: updater(prev[empresaIdDetalhe]) }
          : prev
      );
    },
    [empresaIdDetalhe]
  );

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

  // Eventos por dia: impugnação, esclarecimento, limite da proposta e sessão
  // (com horário), ou fechamento previsto quando não há sessão.
  const oportunidadesPorData = useMemo(() => eventosPorDia(opsFiltradas), [opsFiltradas]);

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

  const urlNovaOportunidade = (dateStr) =>
    `${createPageUrl("Oportunidades")}?new=1&licitacao_data=${dateStr}`;

  const handleAbrirModalCriacao = (dateStr, e) => {
    const filtroUnico = !!filtroEfetivo && filtroEfetivo !== "todas";
    if (filtroUnico || listaEmpresas.length === 1) {
      const empresaId = filtroUnico ? filtroEfetivo : listaEmpresas[0]?.id;
      const empresa = empresasMap[empresaId];
      if (!empresa) return;
      // Já é a empresa logada: navega direto (sem trocar a sessão à toa).
      if (empresa.id === empresaAtiva?.id) {
        navigate(urlNovaOportunidade(dateStr));
        return;
      }
      setEmpresaAtiva(empresa).then(() => {
        setTimeout(() => navigate(urlNovaOportunidade(dateStr)), 500);
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
    if (empresa.id !== empresaAtiva?.id) {
      await setEmpresaAtiva(empresa);
      await esperar(500);
    }
    navigate(urlNovaOportunidade(dateStr));
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
          {listaEmpresas.length > 1 && (
            <Select value={filtroEfetivo || ""} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="h-7 text-xs w-44">
                <Building2 className="w-3 h-3 mr-1 shrink-0" />
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {/* RLS: só super admin enxerga outras empresas além da logada */}
                {isSuperAdmin && <SelectItem value="todas">Todas as empresas</SelectItem>}
                {listaEmpresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {nomeDaEmpresa(e)}
                    {e.id === empresaAtiva?.id ? " (logada)" : ""}
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

      {mostrarSpinner ? (
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
                const dateStr = chaveDoDia(day);
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
                      {opsNoDia.slice(0, 2).map((ev) => {
                        const { op } = ev;
                        const tipo = TIPOS_PRAZO[ev.tipo];
                        const nomeEmpresa = nomeDaEmpresa(empresasMap[op.empresa_id]);
                        return (
                          <div
                            key={`${op.id}-${ev.tipo}`}
                            onClick={() => handleClickOportunidade(op)}
                            className={cn(
                              "px-1 py-0.5 rounded border text-xs cursor-pointer hover:opacity-75 transition-opacity group relative",
                              tipo.classe
                            )}
                          >
                            <span className="flex items-center gap-1 min-w-0">
                              {mostrarEmpresas && (
                                <span
                                  className={cn(
                                    "w-2 h-2 rounded-full border shrink-0",
                                    empresasCores[op.empresa_id] || CORES[0]
                                  )}
                                />
                              )}
                              <span className="truncate">
                                {tipo.emoji}{" "}
                                {ev.hora && <span className="font-semibold">{ev.hora} </span>}
                                {op.nome}
                              </span>
                            </span>
                            {/* Tooltip cresce para cima (bottom-full) conforme o nº de linhas */}
                            <span className="absolute left-0 bottom-full mb-1 z-10 hidden group-hover:flex flex-col items-start bg-slate-800 text-white text-xs rounded px-2 py-1.5 pointer-events-none whitespace-nowrap shadow-lg gap-0.5">
                              {nomeEmpresa && <span className="font-semibold">{nomeEmpresa}</span>}
                              <span>
                                {tipo.emoji} {rotuloEvento(ev)}
                                {op.licitacao_modalidade ? ` · ${op.licitacao_modalidade}` : ""}
                              </span>
                              <span className="max-w-[18rem] truncate">{op.nome}</span>
                              {(op.licitacao_numero || op.orgao) && (
                                <span className="max-w-[18rem] truncate">
                                  {[
                                    op.licitacao_numero && `Edital ${op.licitacao_numero}`,
                                    op.orgao,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                              {op.licitacao_garantia_proposta && (
                                <span>✅ Com garantia de proposta</span>
                              )}
                              {ev.tipo === "sessao" && op.licitacao_visita_tecnica && (
                                <span className="max-w-[18rem] truncate">
                                  🔎 Visita técnica: {op.licitacao_visita_tecnica}
                                </span>
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
                {opsPopover.map((ev) => {
                  const { op } = ev;
                  const tipo = TIPOS_PRAZO[ev.tipo];
                  const nomeEmpresa = nomeDaEmpresa(empresasMap[op.empresa_id]);
                  const detalhes = [
                    op.licitacao_modalidade,
                    op.licitacao_numero && `Edital ${op.licitacao_numero}`,
                  ].filter(Boolean);
                  return (
                    <div
                      key={`${op.id}-${ev.tipo}`}
                      onClick={() => {
                        handleClickOportunidade(op);
                        setPopoverDia(null);
                      }}
                      className="p-2 rounded-lg text-sm cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", tipo.ponto)} />
                        {tipo.emoji} {rotuloEvento(ev)}
                      </p>
                      <p className="font-medium text-slate-800">{op.nome}</p>
                      {nomeEmpresa && (
                        <p className="text-xs text-slate-500 mt-0.5">{nomeEmpresa}</p>
                      )}
                      {detalhes.length > 0 && (
                        <p className="text-xs text-slate-500">{detalhes.join(" · ")}</p>
                      )}
                      {/* Visita técnica é texto livre (0111) — só informa, não vira evento */}
                      {ev.tipo === "sessao" && op.licitacao_visita_tecnica && (
                        <p className="text-xs text-slate-500 line-clamp-2">
                          Visita técnica: {op.licitacao_visita_tecnica}
                        </p>
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
            {listaEmpresas.map((e) => (
              <button
                key={e.id}
                onClick={() => handleSelecionarEmpresaENavegar(e.id, popoverData.dateStr)}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-100 transition-colors flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate">{nomeDaEmpresa(e)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Legenda dos tipos de prazo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        {Object.entries(TIPOS_PRAZO).map(([id, t]) => (
          <span key={id} className="flex items-center gap-1">
            <span className={cn("w-2.5 h-2.5 rounded-full", t.ponto)} />
            {t.rotulo}
          </span>
        ))}
      </div>

      {/* Legenda de empresas (clique filtra; clicar de novo volta a "todas") */}
      {listaEmpresas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {listaEmpresas.map((empresa) => (
            <button
              key={empresa.id}
              onClick={() => setFiltroEmpresa(filtroEfetivo === empresa.id ? "todas" : empresa.id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs transition-all",
                filtroEfetivo === empresa.id
                  ? "border-slate-400 bg-slate-100 font-semibold"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full border",
                  empresasCores[empresa.id] || CORES[0]
                )}
              />
              <span className="text-slate-600">{nomeDaEmpresa(empresa)}</span>
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
            // Fechou o detalhe (e com ele a leitura do edital): rebusca a empresa
            // para refletir datas/status/arquivamento alterados lá dentro.
            invalidarEmpresa(empresaIdDetalhe);
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
        // Permissões REAIS da sessão (antes: perfil="Admin" e temPermissao={() => true}).
        // Ao abrir evento de outra empresa (super admin) a sessão já foi trocada
        // para ela em handleClickOportunidade, então perfil/vínculo são os dela.
        perfil={perfil}
        temPermissao={temPermissao}
        podeVerValores={podeVerValores}
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
        setOportunidades={setOportunidadesDoDetalhe}
        fileInputOrcamentoRef={fileInputRef}
        uploadingFile={uploadingFile}
      />
    </div>
  );
}
