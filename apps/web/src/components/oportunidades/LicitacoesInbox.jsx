import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/sigoClient";
import { useEmpresa } from "../../Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Gavel,
  Search,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  ShieldCheck,
  Trophy,
  Building2,
  MapPin,
  CalendarClock,
  Trash2,
  FilterX,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

// Estados do fluxo (a ordem aqui é a ordem das abas)
const STATUS = [
  { key: "Nova", label: "Novas", color: "bg-blue-100 text-blue-700" },
  { key: "Em análise", label: "Em análise", color: "bg-amber-100 text-amber-700" },
  {
    key: "Aguardando validação",
    label: "Aguardando validação",
    color: "bg-purple-100 text-purple-700",
  },
  { key: "Convertida", label: "Convertidas", color: "bg-green-100 text-green-700" },
  { key: "Recusada", label: "Recusadas", color: "bg-rose-100 text-rose-700" },
  { key: "Descartada", label: "Descartadas", color: "bg-slate-100 text-slate-600" },
];

const PERFIS_VALIDADOR = ["Admin", "Admin Holding", "Gestor"];

const fmtBRL = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  try {
    // 'abertura' é date (YYYY-MM-DD) — força meio-dia pra não voltar 1 dia por TZ
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};

export default function LicitacoesInbox() {
  const { empresaAtiva, perfil, user } = useEmpresa();
  const isValidador = PERFIS_VALIDADOR.includes(perfil);

  const [statusFiltro, setStatusFiltro] = useState("Nova");
  const [busca, setBusca] = useState("");
  const [licitacoes, setLicitacoes] = useState([]);
  const [contagens, setContagens] = useState({});
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [acaoEmId, setAcaoEmId] = useState(null);
  const [selecionados, setSelecionados] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const carregar = useCallback(
    async (status = statusFiltro, q = busca) => {
      if (!empresaAtiva?.id) return;
      setLoading(true);
      setSelecionados(new Set());
      try {
        const { data, error } = await supabase.functions.invoke("licitacoes-triagem", {
          body: { action: "listar", empresa_id: empresaAtiva.id, status, q },
        });
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
    [empresaAtiva?.id, statusFiltro, busca]
  );

  useEffect(() => {
    carregar(statusFiltro, busca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id, statusFiltro]);

  const handleBuscarAgora = async () => {
    setBuscando(true);
    try {
      // dispara as duas fontes em paralelo (Alerta Licitação + PNCP)
      const [alerta, pncp] = await Promise.allSettled([
        supabase.functions.invoke("buscar-licitacoes", { body: {} }),
        supabase.functions.invoke("buscar-licitacoes-pncp", { body: {} }),
      ]);
      const novasDe = (res) => {
        if (res.status !== "fulfilled" || res.value?.error) return 0;
        const r = (res.value?.data?.resumo || []).find((x) => x.empresa_id === empresaAtiva?.id);
        return r?.novas ?? 0;
      };
      const total = novasDe(alerta) + novasDe(pncp);
      toast.success(`Busca executada. ${total} nova(s) licitação(ões) encontrada(s).`);
      setStatusFiltro("Nova");
      carregar("Nova", "");
    } catch (err) {
      console.error("[Licitacoes] buscar:", err);
      toast.error("Erro ao buscar: " + (err?.message || err));
    } finally {
      setBuscando(false);
    }
  };

  const chamarAcao = async (acao, lic, extra = {}) => {
    setAcaoEmId(lic.id);
    try {
      const base = {
        action: acao,
        empresa_id: empresaAtiva.id,
        id: lic.id,
        operador_email: user?.email,
        operador_nome: user?.full_name || user?.email,
      };
      const { data, error } = await supabase.functions.invoke("licitacoes-triagem", {
        body: { ...base, ...extra },
      });
      if (error) throw error;
      // se a function devolveu erro de regra (ex: auto-validação), vem em data?.error
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      console.error(`[Licitacoes] ${acao}:`, err);
      const msg = err?.context?.body || err?.message || String(err);
      toast.error(typeof msg === "string" ? msg : "Erro na ação");
      throw err;
    } finally {
      setAcaoEmId(null);
    }
  };

  const analisar = async (lic) => {
    await chamarAcao("em_analise", lic);
    toast.success("Marcada como Em análise.");
    carregar();
  };

  const participar = async (lic) => {
    await chamarAcao("marcar_participar", lic);
    toast.success("Enviada para validação.");
    carregar();
  };

  const descartar = async (lic) => {
    const motivo = window.prompt("Motivo do descarte (opcional):", "");
    if (motivo === null) return; // cancelou
    await chamarAcao("descartar", lic, { justificativa: motivo });
    toast.success("Licitação descartada.");
    carregar();
  };

  const validar = async (lic, decisao) => {
    let justificativa = "";
    if (decisao === "recusar") {
      justificativa = window.prompt("Motivo da recusa:", "") || "";
      if (justificativa.trim() === "") {
        toast.error("Informe o motivo da recusa.");
        return;
      }
    }
    const data = await chamarAcao("validar", lic, {
      perfil,
      validador_email: user?.email,
      validador_nome: user?.full_name || user?.email,
      decisao,
      justificativa,
    });
    if (data?.decisao === "aprovada") toast.success("Aprovada! Virou oportunidade no pipeline.");
    else toast.success("Licitação recusada.");
    carregar();
  };

  const busy = (lic) => acaoEmId === lic.id;

  // ---- seleção múltipla ----
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

  const excluirSelecionadas = async () => {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Excluir ${ids.length} licitação(ões) da lista? (some da lista; as Convertidas são ignoradas)`
      )
    )
      return;
    setBulkBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("licitacoes-triagem", {
        body: { action: "excluir_lote", empresa_id: empresaAtiva.id, ids },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data?.excluidas ?? 0} excluída(s) da lista.`);
      carregar();
    } catch (err) {
      console.error("[Licitacoes] excluir_lote:", err);
      toast.error("Erro ao excluir: " + (err?.message || err));
    } finally {
      setBulkBusy(false);
    }
  };

  const limparForaDoFiltro = async () => {
    if (
      !window.confirm(
        "Remover da lista todas as NOVAS que NÃO casam com as palavras-chave atuais da configuração? (somem da lista)"
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
      console.error("[Licitacoes] limpar_fora_do_filtro:", err);
      toast.error("Erro ao limpar: " + (err?.message || err));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ações globais */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-slate-700">
          <Gavel className="w-5 h-5 text-blue-600" />
          <span className="font-semibold">Licitações encontradas</span>
        </div>
        <div className="flex-1 min-w-[220px]">
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
        <Button onClick={handleBuscarAgora} disabled={buscando} className="gap-2">
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar agora
        </Button>
      </div>

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

      {/* Barra de seleção / ações em lote */}
      {!loading && licitacoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
            <Checkbox checked={todosMarcados} onCheckedChange={toggleTodos} />
            Selecionar todos ({licitacoes.length})
          </label>
          {selecionados.size > 0 && (
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
          <div className="flex-1" />
          {statusFiltro === "Nova" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={limparForaDoFiltro}
              disabled={bulkBusy}
              className="gap-1.5 text-slate-500"
              title="Remove as Novas que não casam com as palavras-chave atuais"
            >
              {bulkBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FilterX className="w-4 h-4" />
              )}
              Limpar fora do filtro
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
              Clique em <strong>“Buscar agora”</strong> para procurar as de hoje.
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
                            title={`Fonte: ${lic.fonte}`}
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

                      {/* Rastros do fluxo */}
                      {lic.operador_nome && (
                        <p className="mt-2 text-xs text-slate-400">
                          Operador: {lic.operador_nome}
                          {lic.validador_nome && ` · Validador: ${lic.validador_nome}`}
                          {lic.justificativa && ` · "${lic.justificativa}"`}
                        </p>
                      )}
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
                            onClick={() => participar(lic)}
                            className="gap-1.5"
                          >
                            {busy(lic) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            Vamos participar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy(lic)}
                            onClick={() => descartar(lic)}
                            className="gap-1.5 text-slate-500"
                          >
                            <XCircle className="w-4 h-4" /> Descartar
                          </Button>
                        </>
                      )}

                      {lic.status === "Aguardando validação" &&
                        (isValidador ? (
                          <>
                            <Button
                              size="sm"
                              disabled={busy(lic)}
                              onClick={() => validar(lic, "aprovar")}
                              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                            >
                              {busy(lic) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy(lic)}
                              onClick={() => validar(lic, "recusar")}
                              className="gap-1.5 text-rose-600 border-rose-200"
                            >
                              <XCircle className="w-4 h-4" /> Recusar
                            </Button>
                          </>
                        ) : (
                          <Badge className="bg-purple-100 text-purple-700 gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Aguardando validador
                          </Badge>
                        ))}

                      {lic.status === "Convertida" && (
                        <Badge className="bg-green-100 text-green-700 gap-1">
                          <Trophy className="w-3.5 h-3.5" /> No pipeline
                        </Badge>
                      )}
                      {lic.status === "Recusada" && (
                        <Badge className="bg-rose-100 text-rose-700">Recusada</Badge>
                      )}
                      {lic.status === "Descartada" && (
                        <Badge className="bg-slate-100 text-slate-600">Descartada</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rodapé explicativo do fluxo */}
      <div className="text-xs text-slate-400 pt-2 border-t space-y-1">
        <p>
          <strong>Novas</strong> = recém-encontradas, ainda não triadas ·{" "}
          <strong>Convertidas</strong> = aprovadas pelo validador e que viraram Oportunidade no
          pipeline (Kanban/calendário).
        </p>
        <p>
          Fluxo: <strong>operador</strong> analisa e marca “Vamos participar” →{" "}
          <strong>validador</strong> (Admin/Gestor) aprova ou recusa. Quem marca não pode validar a
          própria.
        </p>
        <p>
          <strong>Descartar</strong> = decisão de triagem (vai pra aba Descartadas, fica registrado)
          · <strong>Excluir</strong> = some da lista (limpeza de ruído) ·{" "}
          <strong>Limpar fora do filtro</strong> = remove as Novas que não casam com as
          palavras-chave atuais.
        </p>
      </div>
    </div>
  );
}
