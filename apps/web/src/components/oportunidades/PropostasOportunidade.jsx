import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";
import { FileSignature, Loader2, Plus, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";

const fmtBRL = (v) =>
  (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_BADGE = {
  Rascunho: "bg-slate-100 text-slate-600",
  Enviada: "bg-blue-100 text-blue-700",
  Aceita: "bg-green-100 text-green-700",
  Recusada: "bg-red-100 text-red-700",
};

/**
 * Propostas versionadas da oportunidade (0066). Cada proposta é um snapshot
 * imutável (o banco trava alteração de valor) — mudou o preço, nova versão.
 */
export default function PropostasOportunidade({ oportunidadeId, empresaAtiva, user }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [form, setForm] = useState({ valor: "", descricao: "" });

  const carregar = useCallback(async () => {
    if (!oportunidadeId) return;
    setLoading(true);
    try {
      const data = await sigo.entities.PropostaOportunidade.filter(
        { oportunidade_id: oportunidadeId },
        { sort_by: "-versao" }
      );
      setPropostas(data || []);
    } catch (err) {
      console.error("Erro ao carregar propostas:", err);
    } finally {
      setLoading(false);
    }
  }, [oportunidadeId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleCriar = async () => {
    const valor = parseFloat(String(form.valor).replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) {
      toast.error("Informe o valor da proposta");
      return;
    }
    setSalvando(true);
    try {
      await sigo.entities.PropostaOportunidade.create({
        empresa_id: empresaAtiva.id,
        oportunidade_id: oportunidadeId,
        valor,
        descricao: form.descricao || null,
        status: "Enviada",
        criado_por_email: user?.email || null,
        criado_por_nome: user?.full_name || user?.email || null,
      });
      toast.success("Proposta registrada (nova versão)");
      setShowNova(false);
      setForm({ valor: "", descricao: "" });
      await carregar();
    } catch (err) {
      toast.error("Erro ao registrar proposta: " + (err?.message || ""));
    } finally {
      setSalvando(false);
    }
  };

  const handleStatus = async (p, status) => {
    try {
      await sigo.entities.PropostaOportunidade.update(p.id, { status });
      toast.success(`Proposta v${p.versao} marcada como ${status}`);
      await carregar();
    } catch (err) {
      toast.error("Erro: " + (err?.message || ""));
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
          <FileSignature className="w-4 h-4 text-blue-600" />
          Propostas ({propostas.length})
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowNova(!showNova)}
          className="gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Nova versão
        </Button>
      </div>

      {showNova && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-slate-600">Valor (R$)</label>
            <Input
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              placeholder="ex: 150000,00"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">Observação (opcional)</label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="ex: revisão pós-negociação"
              className="mt-1"
            />
          </div>
          <Button size="sm" onClick={handleCriar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Registrar
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : propostas.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">
          Nenhuma proposta registrada. Cada versão fica como histórico imutável (auditoria).
        </p>
      ) : (
        <div className="space-y-2">
          {propostas.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-3 text-sm border border-slate-100 rounded-lg px-3 py-2"
            >
              <span className="font-mono text-xs text-slate-400 shrink-0">v{p.versao}</span>
              <span className="font-semibold text-slate-800 shrink-0">{fmtBRL(p.valor)}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[p.status] || ""}`}
              >
                {p.status}
              </span>
              <span className="text-xs text-slate-500 truncate">
                {p.descricao || ""}
                {p.criado_por_nome ? ` — ${p.criado_por_nome}` : ""}
                {p.data_envio
                  ? ` em ${new Date(p.data_envio + "T12:00:00").toLocaleDateString("pt-BR")}`
                  : ""}
              </span>
              <span className="ml-auto flex items-center gap-1 shrink-0">
                {p.arquivo_url && (
                  <a
                    href={p.arquivo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {i === 0 && p.status === "Enviada" && (
                  <>
                    <button
                      title="Marcar Aceita"
                      onClick={() => handleStatus(p, "Aceita")}
                      className="p-1 rounded hover:bg-green-50 text-green-600"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="Marcar Recusada"
                      onClick={() => handleStatus(p, "Recusada")}
                      className="p-1 rounded hover:bg-red-50 text-red-600"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
