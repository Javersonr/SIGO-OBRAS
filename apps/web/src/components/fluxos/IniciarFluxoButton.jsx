import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { sigo, supabase } from "@/api/sigoClient";
import { toast } from "sonner";
import { Workflow, Loader2, Play, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * Botão de partida do motor de fluxos (0052/0061).
 * - Sem fluxo rodando: lista os templates ATIVOS da entidade e chama
 *   fluxo_instanciar no escolhido.
 * - Com fluxo "Em Andamento" no registro: mostra a etapa atual + link
 *   para Minhas Pendências.
 */
export default function IniciarFluxoButton({ entidadeAlvo, registroId, empresaAtiva, user }) {
  const [templates, setTemplates] = useState([]);
  const [instancia, setInstancia] = useState(null);
  const [etapaAtual, setEtapaAtual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState(null);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id || !registroId) return;
    setLoading(true);
    try {
      const [tpls, { data: insts }] = await Promise.all([
        sigo.entities.FluxoTemplate.filter(
          { empresa_id: empresaAtiva.id, status: "ativo" },
          { sort_by: "ordem" }
        ),
        supabase
          .from("fluxo_instancia")
          .select("id, template_nome, status, etapa_atual_id")
          .eq("registro_id", registroId)
          .eq("status", "Em Andamento")
          .is("deleted_at", null)
          .limit(1),
      ]);
      setTemplates(
        (tpls || []).filter((t) => (t.entidade_alvo || "oportunidade") === entidadeAlvo)
      );
      const inst = (insts || [])[0] || null;
      setInstancia(inst);
      if (inst?.etapa_atual_id) {
        const { data: etapa } = await supabase
          .from("fluxo_etapa_instancia")
          .select("nome, status, papel_responsavel, papel_aprovador")
          .eq("id", inst.etapa_atual_id)
          .maybeSingle();
        setEtapaAtual(etapa || null);
      } else {
        setEtapaAtual(null);
      }
    } catch (err) {
      console.error("Erro ao carregar fluxos:", err);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id, registroId, entidadeAlvo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleIniciar = async (template) => {
    setIniciando(template.id);
    try {
      const { error } = await supabase.rpc("fluxo_instanciar", {
        p_template_id: template.id,
        p_entidade_alvo: entidadeAlvo,
        p_registro_id: registroId,
        p_ator_email: user?.email || "",
        p_ator_nome: user?.full_name || user?.email || "",
      });
      if (error) throw error;
      toast.success(`Fluxo "${template.nome}" iniciado — primeira etapa aberta.`);
      setAberto(false);
      await carregar();
    } catch (err) {
      toast.error("Erro ao iniciar fluxo: " + (err?.message || ""));
    } finally {
      setIniciando(null);
    }
  };

  if (loading) return null;

  // Fluxo rodando: mostra a etapa atual + atalho pras Pendências
  if (instancia) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        <Workflow className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-blue-800">
          <span className="font-medium">{instancia.template_nome}</span> em andamento
          {etapaAtual && (
            <>
              {" "}
              • etapa atual: <span className="font-medium">{etapaAtual.nome}</span>
              {etapaAtual.status === "Em Revisão" ? " (em revisão)" : ""}
            </>
          )}
        </span>
        <Link
          to={createPageUrl("MinhasPendencias")}
          className="text-blue-600 hover:underline inline-flex items-center gap-1 ml-auto"
        >
          <ClipboardCheck className="w-3.5 h-3.5" /> Pendências
        </Link>
      </div>
    );
  }

  // Sem templates publicados: não polui a tela
  if (templates.length === 0) return null;

  return (
    <div className="relative inline-block">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
        onClick={() => (templates.length === 1 ? handleIniciar(templates[0]) : setAberto(!aberto))}
        disabled={!!iniciando}
      >
        {iniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Iniciar fluxo
        {templates.length === 1 ? `: ${templates[0].nome}` : ""}
      </Button>
      {aberto && templates.length > 1 && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleIniciar(t)}
              disabled={!!iniciando}
              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-50 flex items-center gap-2"
            >
              <Workflow className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">{t.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
