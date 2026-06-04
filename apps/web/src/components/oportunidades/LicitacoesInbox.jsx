import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Gavel,
  Search,
  Loader2,
  ExternalLink,
  XCircle,
  Eye,
  Send,
  Trophy,
  Building2,
  MapPin,
  CalendarClock,
  Trash2,
  FilterX,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

// 4 status (sem validador): Nova → Em análise → Convertida · Excluída
const STATUS = [
  { key: "Nova", label: "Novas" },
  { key: "Em análise", label: "Em análise" },
  { key: "Convertida", label: "Oportunidades" },
  { key: "Excluída", label: "Excluídas" },
];

const fmtBRL = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};

const FILTROS_VAZIOS = { uf: "", valorMin: "", valorMax: "", dataIni: "", dataFim: "" };

export default function LicitacoesInbox() {
  const { empresaAtiva, user } = useEmpresa();

  const [statusFiltro, setStatusFiltro] = useState("Nova");
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [showFiltros, setShowFiltros] = useState(false);
  const [licitacoes, setLicitacoes] = useState([]);
  const [contagens, setContagens] = useState({});
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [acaoEmId, setAcaoEmId] = useState(null);
  const [selecionados, setSelecionados] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const carregar = useCallback(
    async (status = statusFiltro) => {
      if (!empresaAtiva?.id) return;
      setLoading(true);
      setSelecionados(new Set());
      try {
        const body = {
          action: "listar",
          empresa_id: empresaAtiva.id,
          status,
          q: busca || undefined,
          uf: filtros.uf || undefined,
          valor_min: filtros.valorMin || undefined,
          valor_max: filtros.valorMax || undefined,
          data_ini: filtros.dataIni || undefined,
          data_fim: filtros.dataFim || undefined,
        };
        const { data, error } = await supabase.functions.invoke("licitacoes-triagem", { body });
        if (error) throw error;
        setLicitacoes(data?.licitacoes || []);
        setContagens(data?.contagens || {});
      } catch (err) {
        console.error("[Licitacoes] listar:", err);
        toast.error("Erro ao carregar licitações");
      } finally {
        setLoading(false);
      }
    },
    [empresaAtiva?.id, statusFiltro, busca, filtros]
  );

  useEffect(() => {
    carregar(statusFiltro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id, statusFiltro]);

  const handleBuscarAgora = async () => {
    setBuscando(true);
    try {
      const [alerta, pncp] = await Promise.allSettled([
        supabase.functions.invoke("buscar-licitacoes", { body: { full: true } }),
        supabase.functions.invoke("buscar-licitacoes-pncp", { body: { aberto: true } }),
      ]);
      const novasDe = (res) => {
        if (res.status !== "fulfilled" || res.value?.error) return 0;
        const r = (res.value?.data?.resumo || []).find((x) => x.empresa_id === empresaAtiva?.id);
        return r?.novas ?? 0;
      };
      const total = novasDe(alerta) + novasDe(pncp);

      // Alinha as "Novas" à palavra-chave ATUAL: remove as que não casam mais
      // (ou já passaram). É o que se espera ao trocar a palavra-chave e buscar —
      // a lista de Novas passa a refletir a palavra-chave nova. Best-effort.
      let removidas = 0;
      try {
        const { data: limp } = await supabase.functions.invoke("licitacoes-triagem", {
          body: { action: "limpar_fora_do_filtro", empresa_id: empresaAtiva.id },
        });
        removidas = limp?.removidas ?? 0;
      } catch (e) {
        // sem palavras-chave na config (400) ou outro erro → não bloqueia a busca
        console.warn("[Licitacoes] alinhar Novas à palavra-chave falhou:", e?.message || e);
      }

      toast.success(
        `Busca executada. ${total} nova(s) encontrada(s)` +
          (removidas > 0 ? `; ${removidas} fora da palavra-chave removida(s).` : ".")
      );
      setStatusFiltro("Nova");
      carregar("Nova");
    } catch (err) {
      console.error("[Licitacoes] buscar:", err);
      toast.error("Erro ao buscar: " + (err?.message || err));
    } finally {
      setBuscando(false);
    }
  };

  // ---- ações single ----
  const chamar = async (action, lic, extra = {}) => {
    setAcaoEmId(lic.id);
    try {
      const { data, error } = await supabase.functions.invoke("licitacoes-triagem", {
        body: {
          action,
          empresa_id: empresaAtiva.id,
          id: lic.id,
          operador_email: user?.email,
          operador_nome: user?.full_name || user?.email,
          ...extra,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      console.error(`[Licitacoes] ${action}:`, err);
      toast.error(err?.message || "Erro na ação");
      throw err;
    } finally {
      setAcaoEmId(null);
    }
  };

  const analisar = async (lic) => {
    await chamar("em_analise", lic);
    toast.success("Em análise.");
    carregar();
  };
  const virarOportunidade = async (lic) => {
    await chamar("virar_oportunidade", lic);
    toast.success("Virou oportunidade no pipeline! 🎯");
    carregar();
  };
  const excluirUm = async (lic) => {
    await chamarLote("excluir_lote", [lic.id]);
    toast.success("Movida para Excluídas.");
    carregar();
  };
  const restaurarUm = async (lic) => {
    await chamarLote("restaurar_lote", [lic.id]);
    toast.success("Restaurada para Novas.");
    carregar();
  };

  // ---- ações em lote ----
  const chamarLote = async (action, ids) => {
    const { data, error } = await supabase.functions.invoke("licitacoes-triagem", {
      body: { action, empresa_id: empresaAtiva.id, ids },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const excluirSelecionadas = async () => {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const data = await chamarLote("excluir_lote", ids);
      toast.success(`${data?.excluidas ?? 0} movida(s) para Excluídas.`);
      carregar();
    } catch (err) {
      toast.error("Erro ao excluir: " + (err?.message || err));
    } finally {
      setBulkBusy(false);
    }
  };

  const restaurarSelecionadas = async () => {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const data = await chamarLote("restaurar_lote", ids);
      toast.success(`${data?.restauradas ?? 0} restaurada(s).`);
      carregar();
    } catch (err) {
      toast.error("Erro ao restaurar: " + (err?.message || err));
    } finally {
      setBulkBusy(false);
    }
  };

  const limparForaDoFiltro = async () => {
    if (
      !window.confirm(
        "Remover de vez as NOVAS que não casam com as palavras-chave atuais ou já passaram?"
      )
    )
      return;
    setBulkBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("licitacoes-triagem", {
        body: { action: "limpar_fora_do_filtro", empresa_id: empresaAtiva.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data?.removidas ?? 0} removida(s); ${data?.mantidas ?? 0} mantida(s).`);
      carregar();
    } catch (err) {
      toast.error("Erro ao limpar: " + (err?.message || err));
    } finally {
      setBulkBusy(false);
    }
  };

  // ---- seleção ----
  const toggleSel = (id) =>
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todosMarcados = licitacoes.length > 0 && licitacoes.every((l) => selecionados.has(l.id));
  const toggleTodos = () =>
    setSelecionados(todosMarcados ? new Set() : new Set(licitacoes.map((l) => l.id)));

  const busy = (lic) => acaoEmId === lic.id;
  const aplicarFiltros = () => carregar();
  const limparFiltros = () => {
    setFiltros(FILTROS_VAZIOS);
    setBusca("");
    setTimeout(() => carregar(), 0);
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho + busca + ações globais */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-slate-700">
          <Gavel className="w-5 h-5 text-blue-600" />
          <span className="font-semibold">Licitações</span>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Buscar por título, órgão, objeto, município…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && carregar()}
            />
          </div>
        </div>
        <Button variant="outline" onClick={() => setShowFiltros((v) => !v)} className="gap-2">
          <SlidersHorizontal className="w-4 h-4" /> Filtros
        </Button>
        <Button onClick={handleBuscarAgora} disabled={buscando} className="gap-2">
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar agora
        </Button>
      </div>

      {/* Filtros: estado, valor, data */}
      {showFiltros && (
        <div className="flex flex-wrap items-end gap-3 bg-slate-50 border rounded-lg p-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Estado (UF)</label>
            <Input
              className="w-20 uppercase"
              maxLength={2}
              placeholder="MG"
              value={filtros.uf}
              onChange={(e) => setFiltros((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Valor mín. (R$)</label>
            <Input
              type="number"
              className="w-32"
              placeholder="0"
              value={filtros.valorMin}
              onChange={(e) => setFiltros((f) => ({ ...f, valorMin: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Valor máx. (R$)</label>
            <Input
              type="number"
              className="w-32"
              placeholder="sem teto"
              value={filtros.valorMax}
              onChange={(e) => setFiltros((f) => ({ ...f, valorMax: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Abertura de</label>
            <Input
              type="date"
              className="w-40"
              value={filtros.dataIni}
              onChange={(e) => setFiltros((f) => ({ ...f, dataIni: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">até</label>
            <Input
              type="date"
              className="w-40"
              value={filtros.dataFim}
              onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
            />
          </div>
          <Button onClick={aplicarFiltros} className="gap-1.5">
            <Search className="w-4 h-4" /> Filtrar
          </Button>
          <Button variant="ghost" onClick={limparFiltros} className="text-slate-500">
            Limpar
          </Button>
        </div>
      )}

      {/* Abas por status (com contagem) */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {STATUS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFiltro(s.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              statusFiltro === s.key
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s.label}
            <span
              className={`ml-2 inline-flex items-center justify-center text-xs px-1.5 rounded-full ${
                statusFiltro === s.key ? "bg-white/20 text-white" : "bg-white text-slate-500"
              }`}
            >
              {contagens[s.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Barra de seleção em lote */}
      {!loading && licitacoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
            <Checkbox checked={todosMarcados} onCheckedChange={toggleTodos} />
            Selecionar todos ({licitacoes.length})
          </label>
          {selecionados.size > 0 &&
            statusFiltro !== "Excluída" &&
            statusFiltro !== "Convertida" && (
              <Button
                size="sm"
                variant="outline"
                onClick={excluirSelecionadas}
                disabled={bulkBusy}
                className="gap-1.5 text-rose-600 border-rose-200"
              >
                {bulkBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Excluir {selecionados.size} selecionada(s)
              </Button>
            )}
          {selecionados.size > 0 && statusFiltro === "Excluída" && (
            <Button
              size="sm"
              variant="outline"
              onClick={restaurarSelecionadas}
              disabled={bulkBusy}
              className="gap-1.5 text-emerald-600 border-emerald-200"
            >
              {bulkBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Restaurar {selecionados.size} selecionada(s)
            </Button>
          )}
          <div className="flex-1" />
          {statusFiltro === "Nova" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={limparForaDoFiltro}
              disabled={bulkBusy}
              className="gap-1.5 text-slate-500"
              title="Remove de vez as Novas fora do filtro ou já passadas"
            >
              <FilterX className="w-4 h-4" /> Limpar fora do filtro
            </Button>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : licitacoes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          Nenhuma licitação em <strong>{STATUS.find((s) => s.key === statusFiltro)?.label}</strong>.
          {statusFiltro === "Nova" && (
            <div className="mt-2 text-sm">
              Clique em <strong>“Buscar agora”</strong> para procurar as em aberto.
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {licitacoes.map((lic) => (
            <Card key={lic.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Checkbox
                    checked={selecionados.has(lic.id)}
                    onCheckedChange={() => toggleSel(lic.id)}
                    className="mt-1 shrink-0"
                    aria-label="Selecionar licitação"
                  />
                  <div className="flex-1 flex flex-col md:flex-row md:items-start gap-3 justify-between min-w-0">
                    {/* Dados */}
                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0">
                          {lic.uf || "—"}
                        </Badge>
                        {lic.fonte && (
                          <Badge
                            className={`shrink-0 ${
                              lic.fonte === "PNCP"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            {lic.fonte === "PNCP" ? "PNCP" : "Alerta"}
                          </Badge>
                        )}
                        <h3 className="font-semibold text-slate-900 leading-snug">
                          {lic.titulo || lic.objeto || "Licitação"}
                        </h3>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        {lic.orgao && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" /> {lic.orgao}
                          </span>
                        )}
                        {lic.municipio && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {lic.municipio}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="w-3.5 h-3.5" /> Abertura:{" "}
                          {fmtData(lic.abertura)}
                        </span>
                        {lic.tipo && <span>{lic.tipo}</span>}
                      </div>
                      {lic.objeto && lic.objeto !== lic.titulo && (
                        <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{lic.objeto}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-lg font-bold text-emerald-600">
                          {fmtBRL(lic.valor)}
                        </span>
                        {lic.link_externo && (
                          <a
                            href={lic.link_externo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Abrir no portal
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Ações por status */}
                    <div className="flex flex-row md:flex-col gap-2 shrink-0">
                      {(lic.status === "Nova" || lic.status === "Em análise") && (
                        <>
                          {lic.status === "Nova" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy(lic)}
                              onClick={() => analisar(lic)}
                              className="gap-1.5"
                            >
                              <Eye className="w-4 h-4" /> Analisar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={busy(lic)}
                            onClick={() => virarOportunidade(lic)}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          >
                            {busy(lic) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            Virar oportunidade
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy(lic)}
                            onClick={() => excluirUm(lic)}
                            className="gap-1.5 text-slate-500"
                          >
                            <XCircle className="w-4 h-4" /> Excluir
                          </Button>
                        </>
                      )}

                      {lic.status === "Convertida" && (
                        <Badge className="bg-green-100 text-green-700 gap-1">
                          <Trophy className="w-3.5 h-3.5" /> No pipeline
                        </Badge>
                      )}

                      {lic.status === "Excluída" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy(lic)}
                          onClick={() => restaurarUm(lic)}
                          className="gap-1.5 text-emerald-600 border-emerald-200"
                        >
                          {busy(lic) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Legenda */}
      <div className="text-xs text-slate-400 pt-2 border-t space-y-1">
        <p>
          <strong>Novas</strong> = recém-encontradas · <strong>Em análise</strong> = você está
          estudando · <strong>Oportunidades</strong> = viraram Oportunidade no pipeline ·{" "}
          <strong>Excluídas</strong> = removidas (recuperáveis).
        </p>
        <p>
          Fluxo: <strong>Analisar</strong> → <strong>Virar oportunidade</strong> (entra no
          Kanban/calendário). <strong>Excluir</strong> manda pra aba Excluídas (dá pra restaurar);{" "}
          <strong>Limpar fora do filtro</strong> apaga de vez as Novas fora do filtro/passadas.
        </p>
      </div>
    </div>
  );
}
