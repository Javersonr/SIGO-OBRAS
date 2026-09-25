import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  ShoppingCart,
  FolderKanban,
  DollarSign,
  Package,
  AlertCircle,
  Info,
  Gavel,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const iconMap = {
  Cotação: ShoppingCart,
  Projeto: FolderKanban,
  Compra: ShoppingCart,
  Financeiro: DollarSign,
  Estoque: Package,
  Inspeção: AlertCircle,
  Manutenção: AlertCircle,
  Sistema: Info,
  Fluxo: Workflow,
  // Alerta de prazos do edital (alertar_prazos_licitacao, 0111)
  Licitação: Gavel,
};

// Etiqueta do tipo ao lado da data (só para os tipos que pedem destaque).
const tipoTag = {
  Licitação: "bg-amber-50 text-amber-700 border-amber-200",
};

const priorityColors = {
  Baixa: "bg-slate-100 text-slate-600 border-slate-200",
  Normal: "bg-blue-100 text-blue-700 border-blue-200",
  Alta: "bg-orange-100 text-orange-700 border-orange-200",
  Urgente: "bg-red-100 text-red-700 border-red-200",
};

// A lista traz só as N mais recentes do filtro; as contagens vêm do banco (count).
const LIMITE_LISTA = 50;

// Link absoluto (http://, //host) sai do SPA; relativo usa o router.
const ehLinkExterno = (link) => /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(String(link || ""));

/**
 * onAlterouLidas (opcional): chamado depois que o painel muda o estado de
 * leitura no banco (marcar lida, "Ver →", "Marcar todas", excluir não lida) —
 * o Layout usa para recontar o sino na hora, sem esperar o próximo ciclo.
 */
export default function NotificationsPanel({ open, onOpenChange, onAlterouLidas }) {
  const { empresaAtiva, user } = useEmpresa();
  const navigate = useNavigate();
  const [notificacoes, setNotificacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("todas"); // todas, nao-lidas
  // Contagem REAL no banco (count/HEAD) — antes o badge contava só as 50 carregadas.
  const [contagem, setContagem] = useState({ total: null, naoLidas: null });
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const contagemSeqRef = useRef(0);

  const empresaId = empresaAtiva?.id;
  const email = user?.email;

  // Lista do filtro atual: "Não lidas" busca no banco (lida=false) — antes
  // filtrava só as 50 mais recentes e escondia não lidas mais antigas.
  useEffect(() => {
    if (!open || !empresaId || !email) return;
    let ativo = true;
    const criterio = { empresa_id: empresaId, usuario_email: email };
    if (filter === "nao-lidas") criterio.lida = false;
    setLoading(true);
    sigo.entities.Notificacao.filter(criterio, "-created_date", LIMITE_LISTA)
      .then((result) => {
        if (ativo) setNotificacoes(result);
      })
      .catch((error) => console.error("Erro ao carregar notificações:", error))
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [open, empresaId, email, filter]);

  // Contagens reais (total e não lidas). A resposta mais recente vence.
  const recontar = useCallback(async () => {
    if (!empresaId || !email) return;
    const seq = ++contagemSeqRef.current;
    const base = { empresa_id: empresaId, usuario_email: email };
    try {
      const ent = sigo.entities.Notificacao;
      const [total, naoLidas] = await Promise.all([
        ent.count(base),
        ent.count({ ...base, lida: false }),
      ]);
      if (seq === contagemSeqRef.current) setContagem({ total, naoLidas });
    } catch (error) {
      console.warn("[NotificationsPanel] Erro ao contar notificações:", error?.message || error);
    }
  }, [empresaId, email]);

  // Trocou empresa/usuário: descarta a contagem da anterior (e respostas em voo).
  useEffect(() => {
    contagemSeqRef.current++;
    setContagem({ total: null, naoLidas: null });
  }, [empresaId, email]);

  useEffect(() => {
    if (open) recontar();
  }, [open, recontar]);

  // Subscription em tempo real para notificações
  useEffect(() => {
    if (!empresaAtiva?.id || !user?.email) return;

    const unsubscribe = sigo.entities.Notificacao.subscribe((event) => {
      // Apenas notificações para o usuário atual
      if (event.data?.empresa_id === empresaAtiva.id && event.data?.usuario_email === user.email) {
        if (event.type === "create") {
          setNotificacoes((prev) => [event.data, ...prev]);

          // Toast de notificação
          if (window.Notification && Notification.permission === "granted") {
            new Notification(event.data.titulo, {
              body: event.data.mensagem,
              icon: "/favicon.ico",
              tag: event.data.id,
            });
          }
        } else if (event.type === "update") {
          setNotificacoes((prev) => prev.map((n) => (n.id === event.id ? event.data : n)));
        } else if (event.type === "delete") {
          setNotificacoes((prev) => prev.filter((n) => n.id !== event.id));
        }
      }
    });

    return unsubscribe;
  }, [empresaAtiva?.id, user?.email]);

  // Solicitar permissão para notificações do navegador
  useEffect(() => {
    if (window.Notification && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Grava lida=true. true = gravou (ou já estava lida).
  const marcarComoLida = async (notificacao) => {
    if (notificacao.lida) return true;
    try {
      await sigo.entities.Notificacao.update(notificacao.id, { lida: true });
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === notificacao.id ? { ...n, lida: true } : n))
      );
      return true;
    } catch (error) {
      console.error("Erro ao marcar notificação:", error);
      return false;
    }
  };

  const handleMarcarLida = async (notificacao) => {
    if (notificacao.lida) return;
    if (await marcarComoLida(notificacao)) {
      recontar();
      onAlterouLidas?.();
    }
  };

  // "Ver →": grava a leitura ANTES de fechar/navegar — antes o painel fechava
  // na hora, o Layout recontava antes do UPDATE e o sino ficava defasado.
  const handleVer = async (e, notificacao) => {
    // Ctrl/⌘/Shift/Alt: o navegador abre em outra aba; o painel fica aberto.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      handleMarcarLida(notificacao);
      return;
    }
    e.preventDefault();
    const eraNaoLida = !notificacao.lida;
    const gravou = await marcarComoLida(notificacao);
    if (eraNaoLida && gravou) onAlterouLidas?.();
    onOpenChange(false);
    if (ehLinkExterno(notificacao.link)) window.location.assign(notificacao.link);
    else navigate(notificacao.link);
  };

  // UPDATE em lote por filtro (todas as não lidas do usuário nesta empresa) —
  // antes marcava só as até 50 carregadas na lista. RLS: tenant_isolation
  // (empresa_id = empresa do JWT) permite o UPDATE; super_admin_all também.
  const marcarTodasComoLidas = async () => {
    if (!empresaId || !email || marcandoTodas) return;
    setMarcandoTodas(true);
    try {
      if (!supabase) throw new Error("backend indisponível");
      const { error, count } = await supabase
        .from("notificacao")
        .update({ lida: true }, { count: "exact" })
        .eq("empresa_id", empresaId)
        .eq("usuario_email", email)
        .eq("lida", false)
        .is("deleted_at", null);
      if (error) throw error;
      setNotificacoes((prev) => prev.map((n) => (n.lida ? n : { ...n, lida: true })));
      if (count > 0) {
        toast.success(
          count === 1
            ? "1 notificação marcada como lida"
            : `${count} notificações marcadas como lidas`
        );
      }
    } catch (error) {
      console.error("Erro ao marcar todas:", error);
      toast.error(`Erro ao marcar todas como lidas: ${error?.message || "erro desconhecido"}`);
    } finally {
      setMarcandoTodas(false);
      recontar();
      onAlterouLidas?.();
    }
  };

  const excluirNotificacao = async (id) => {
    const eraNaoLida = notificacoes.some((n) => n.id === id && !n.lida);
    try {
      await sigo.entities.Notificacao.delete(id);
      setNotificacoes((prev) => prev.filter((n) => n.id !== id));
      recontar();
      if (eraNaoLida) onAlterouLidas?.();
    } catch (error) {
      console.error("Erro ao excluir notificação:", error);
    }
  };

  const limparLidas = async () => {
    try {
      const lidas = notificacoes.filter((n) => n.lida);
      await Promise.all(lidas.map((n) => sigo.entities.Notificacao.delete(n.id)));
      const removidas = new Set(lidas.map((n) => n.id));
      setNotificacoes((prev) => prev.filter((n) => !removidas.has(n.id)));
      recontar();
    } catch (error) {
      console.error("Erro ao limpar notificações:", error);
    }
  };

  const { filteredNotificacoes, naoLidasCount, totalCount } = useMemo(() => {
    const naoLidasCarregadas = notificacoes.filter((n) => !n.lida);
    return {
      filteredNotificacoes: filter === "nao-lidas" ? naoLidasCarregadas : notificacoes,
      // Contagem real do banco; enquanto ela não chega, o que está carregado.
      naoLidasCount: contagem.naoLidas ?? naoLidasCarregadas.length,
      totalCount: contagem.total ?? notificacoes.length,
    };
  }, [notificacoes, filter, contagem]);

  // A lista mostra só as mais recentes: avisa quando há mais no banco.
  const listaTruncada =
    !loading && notificacoes.length >= LIMITE_LISTA && filteredNotificacoes.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificações
              {naoLidasCount > 0 && (
                <Badge className="bg-red-500">{naoLidasCount.toLocaleString("pt-BR")}</Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {naoLidasCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={marcarTodasComoLidas}
                  disabled={marcandoTodas}
                  className="text-xs"
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  Marcar todas
                </Button>
              )}
              {notificacoes.some((n) => n.lida) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={limparLidas}
                  className="text-xs text-slate-500"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpar lidas
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Filtros */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={filter === "todas" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("todas")}
            className="flex-1"
          >
            Todas ({totalCount.toLocaleString("pt-BR")})
          </Button>
          <Button
            variant={filter === "nao-lidas" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("nao-lidas")}
            className="flex-1"
          >
            Não lidas ({naoLidasCount.toLocaleString("pt-BR")})
          </Button>
        </div>

        {/* Lista de Notificações */}
        <ScrollArea className="h-[calc(100vh-200px)] mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredNotificacoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">
                {filter === "nao-lidas" ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotificacoes.map((notif) => {
                const Icon = iconMap[notif.tipo] || Info;
                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "p-3 rounded-lg border transition-all",
                      notif.lida
                        ? "bg-slate-50 border-slate-200"
                        : "bg-white border-amber-200 shadow-sm"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                          priorityColors[notif.prioridade]
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4
                            className={cn(
                              "text-sm font-semibold",
                              notif.lida ? "text-slate-600" : "text-slate-900"
                            )}
                          >
                            {notif.titulo}
                          </h4>
                          <button
                            onClick={() => excluirNotificacao(notif.id)}
                            className="text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{notif.mensagem}</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-xs text-slate-400">
                            {new Date(notif.created_date).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {tipoTag[notif.tipo] && (
                              <span
                                className={cn(
                                  "px-1.5 py-px rounded border text-[10px] font-medium",
                                  tipoTag[notif.tipo]
                                )}
                              >
                                {notif.tipo}
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            {notif.link && (
                              <Link
                                to={notif.link}
                                onClick={(e) => handleVer(e, notif)}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                              >
                                Ver →
                              </Link>
                            )}
                            {!notif.lida && (
                              <button
                                onClick={() => handleMarcarLida(notif)}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                Marcar lida
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {listaTruncada && (
                <p className="text-center text-xs text-slate-400 py-2">
                  Mostrando as {LIMITE_LISTA} mais recentes
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
