import { useState, useEffect, useCallback } from "react";
import { useEmpresa } from "../Layout";
import { sigo, supabase } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Play,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Hourglass,
} from "lucide-react";

/**
 * Minhas Pendências — a face do motor de fluxos (0052/0053/0061).
 * Duas listas: etapas "Em Execução" do MEU papel (executar) e etapas
 * "Em Revisão" do MEU papel aprovador (aprovar/reprovar). Admin vê tudo.
 * As RPCs derivam e-mail/perfil do token (0061) — sem spoof.
 */
export default function MinhasPendencias() {
  const { empresaAtiva, perfil, user } = useEmpresa();
  const [etapas, setEtapas] = useState([]);
  const [instancias, setInstancias] = useState({});
  const [loading, setLoading] = useState(true);
  const [agindo, setAgindo] = useState(null); // id da etapa em ação
  const [checklistAberto, setChecklistAberto] = useState(null); // id da etapa
  const [checksMarcados, setChecksMarcados] = useState({});

  const isAdmin = perfil === "Admin" || perfil === "Admin Holding";

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [execucao, revisao] = await Promise.all([
        sigo.entities.FluxoEtapaInstancia.filter({
          empresa_id: empresaAtiva.id,
          status: "Em Execução",
        }),
        sigo.entities.FluxoEtapaInstancia.filter({
          empresa_id: empresaAtiva.id,
          status: "Em Revisão",
        }),
      ]);
      const todas = [...(execucao || []), ...(revisao || [])];
      setEtapas(todas);

      const instIds = [...new Set(todas.map((e) => e.fluxo_instancia_id).filter(Boolean))];
      if (instIds.length > 0) {
        const { data: insts } = await supabase
          .from("fluxo_instancia")
          .select("id, template_nome, entidade_alvo, registro_id, status")
          .in("id", instIds);
        setInstancias(Object.fromEntries((insts || []).map((i) => [i.id, i])));
      } else {
        setInstancias({});
      }
    } catch (err) {
      console.error("Erro ao carregar pendências:", err);
      toast.error("Erro ao carregar pendências");
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const minhasExecutar = etapas.filter(
    (e) =>
      e.status === "Em Execução" &&
      (isAdmin || !e.papel_responsavel || e.papel_responsavel === perfil)
  );
  const minhasAprovar = etapas.filter(
    (e) =>
      e.status === "Em Revisão" &&
      (isAdmin || !e.papel_aprovador || e.papel_aprovador === perfil) &&
      // quem executou não decide (a RPC também bloqueia)
      (e.executor_email || "").toLowerCase() !== (user?.email || "").toLowerCase()
  );

  const checklistDe = (e) => (Array.isArray(e.checklist) ? e.checklist : []);

  const handleConcluir = async (etapa) => {
    const itens = checklistDe(etapa);
    if (itens.length > 0 && checklistAberto !== etapa.id) {
      // abre o checklist antes de concluir
      setChecklistAberto(etapa.id);
      setChecksMarcados(
        Object.fromEntries(
          itens.map((item, i) => [i, (etapa.checklist_estado || []).includes(item)])
        )
      );
      return;
    }
    setAgindo(etapa.id);
    try {
      const marcados = itens.filter((_, i) => checksMarcados[i]);
      const { data, error } = await supabase.rpc("fluxo_concluir_etapa", {
        p_etapa_id: etapa.id,
        p_executor_email: user?.email || "",
        p_executor_nome: user?.full_name || user?.email || "",
        p_executor_perfil: perfil || null,
        p_checklist_estado: itens.length > 0 ? marcados : null,
      });
      if (error) throw error;
      toast.success(data?.mensagem || "Etapa concluída");
      setChecklistAberto(null);
      await carregar();
    } catch (err) {
      toast.error("Erro: " + (err?.message || "tente de novo"));
    } finally {
      setAgindo(null);
    }
  };

  const handleAprovar = async (etapa) => {
    const comentario = window.prompt(
      `Aprovar a etapa "${etapa.nome}"?\nComentário (opcional):`,
      ""
    );
    if (comentario === null) return;
    setAgindo(etapa.id);
    try {
      const { data, error } = await supabase.rpc("fluxo_aprovar_etapa", {
        p_etapa_id: etapa.id,
        p_aprovador_email: user?.email || "",
        p_aprovador_nome: user?.full_name || user?.email || "",
        p_aprovador_perfil: perfil || "",
        p_comentario: comentario || null,
      });
      if (error) throw error;
      toast.success(data?.mensagem || "Etapa aprovada");
      await carregar();
    } catch (err) {
      toast.error("Erro: " + (err?.message || "tente de novo"));
    } finally {
      setAgindo(null);
    }
  };

  const handleReprovar = async (etapa) => {
    const motivo = window.prompt(
      `Reprovar a etapa "${etapa.nome}" (volta para execução).\nMotivo (obrigatório, mín. 5 caracteres):`,
      ""
    );
    if (motivo === null) return;
    if ((motivo || "").trim().length < 5) {
      toast.error("Motivo obrigatório (mín. 5 caracteres)");
      return;
    }
    setAgindo(etapa.id);
    try {
      const { data, error } = await supabase.rpc("fluxo_reprovar_etapa", {
        p_etapa_id: etapa.id,
        p_aprovador_email: user?.email || "",
        p_aprovador_nome: user?.full_name || user?.email || "",
        p_aprovador_perfil: perfil || "",
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      toast.success(data?.mensagem || "Etapa reprovada");
      await carregar();
    } catch (err) {
      toast.error("Erro: " + (err?.message || "tente de novo"));
    } finally {
      setAgindo(null);
    }
  };

  const CardEtapa = ({ etapa, modo }) => {
    const inst = instancias[etapa.fluxo_instancia_id] || {};
    const itens = checklistDe(etapa);
    const aberto = checklistAberto === etapa.id;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{etapa.nome}</p>
            <p className="text-xs text-slate-500">
              {inst.template_nome || "Fluxo"} • etapa #{etapa.ordem}
              {etapa.papel_responsavel && modo === "executar" && (
                <> • executa: {etapa.papel_responsavel}</>
              )}
              {etapa.papel_aprovador && modo === "aprovar" && (
                <> • aprova: {etapa.papel_aprovador}</>
              )}
            </p>
            {modo === "aprovar" && etapa.executor_nome && (
              <p className="text-xs text-slate-400">
                Executada por {etapa.executor_nome}
                {etapa.data_execucao &&
                  ` em ${new Date(etapa.data_execucao).toLocaleDateString("pt-BR")}`}
              </p>
            )}
            {etapa.comentario && (
              <p className="text-xs text-amber-700 mt-1">Última decisão: {etapa.comentario}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {modo === "executar" ? (
              <Button
                size="sm"
                onClick={() => handleConcluir(etapa)}
                disabled={agindo === etapa.id}
                className="gap-1 bg-blue-600 hover:bg-blue-700"
              >
                {agindo === etapa.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {itens.length > 0 && !aberto ? "Checklist" : "Concluir"}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => handleAprovar(etapa)}
                  disabled={agindo === etapa.id}
                  className="gap-1 bg-green-600 hover:bg-green-700"
                >
                  <ThumbsUp className="w-3.5 h-3.5" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReprovar(etapa)}
                  disabled={agindo === etapa.id}
                  className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Reprovar
                </Button>
              </>
            )}
          </div>
        </div>

        {modo === "executar" && aberto && itens.length > 0 && (
          <div className="border-t border-slate-100 pt-2 space-y-1">
            {itens.map((item, i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!checksMarcados[i]}
                  onChange={(ev) =>
                    setChecksMarcados({ ...checksMarcados, [i]: ev.target.checked })
                  }
                  className="rounded border-slate-300"
                />
                {item}
              </label>
            ))}
            <p className="text-[11px] text-slate-400">
              Marque o que foi feito e clique em Concluir.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" />
            Minhas Pendências
          </h1>
          <p className="text-sm text-slate-500">
            Etapas de fluxo aguardando você — perfil {perfil || "—"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-600" />
              Para executar ({minhasExecutar.length})
            </h2>
            {minhasExecutar.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm bg-white border border-dashed border-slate-200 rounded-xl">
                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-green-300" />
                Nada para executar. 👏
              </div>
            ) : (
              minhasExecutar.map((e) => <CardEtapa key={e.id} etapa={e} modo="executar" />)
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-amber-600" />
              Para aprovar ({minhasAprovar.length})
            </h2>
            {minhasAprovar.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm bg-white border border-dashed border-slate-200 rounded-xl">
                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-green-300" />
                Nada aguardando sua aprovação.
              </div>
            ) : (
              minhasAprovar.map((e) => <CardEtapa key={e.id} etapa={e} modo="aprovar" />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
