import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sigo, supabase } from "@/api/sigoClient";
import { toast } from "sonner";
import { Loader2, Plus, Receipt, TrendingUp, TrendingDown, FileText } from "lucide-react";

const fmtBRL = (v) =>
  (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_BADGE = {
  Rascunho: "bg-slate-100 text-slate-700",
  Aprovada: "bg-blue-100 text-blue-700",
  Faturada: "bg-green-100 text-green-700",
};

/**
 * Aba Medições do projeto: ciclo medir → faturar → reter + margem da obra.
 * Backend: migration 0058 (medicao_obra, faturar_medicao, v_margem_projeto).
 */
export default function MedicoesTab({ projeto, empresaAtiva, podeEditar = true }) {
  const [medicoes, setMedicoes] = useState([]);
  const [margem, setMargem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [faturandoId, setFaturandoId] = useState(null);
  const [showNova, setShowNova] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const [form, setForm] = useState({
    competencia: new Date().toISOString().slice(0, 7), // yyyy-MM
    percentual_fisico: "",
    valor_medido: "",
    observacoes: "",
  });
  const [config, setConfig] = useState({
    valor_contrato: projeto?.valor_contrato ?? "",
    retencao_percentual: projeto?.retencao_percentual ?? 0,
    iss_percentual: projeto?.iss_percentual ?? 0,
    inss_percentual: projeto?.inss_percentual ?? 0,
  });

  const carregar = useCallback(async () => {
    if (!projeto?.id) return;
    setLoading(true);
    try {
      const [meds, { data: marg }] = await Promise.all([
        sigo.entities.MedicaoObra.filter({ projeto_id: projeto.id }, { sort_by: "numero" }),
        supabase.from("v_margem_projeto").select("*").eq("projeto_id", projeto.id).maybeSingle(),
      ]);
      setMedicoes(meds || []);
      setMargem(marg || null);
    } catch (err) {
      console.error("Erro ao carregar medições:", err);
      toast.error("Erro ao carregar medições");
    } finally {
      setLoading(false);
    }
  }, [projeto?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleSalvarConfig = async () => {
    setSalvando(true);
    try {
      await sigo.entities.Projeto.update(projeto.id, {
        valor_contrato: parseFloat(String(config.valor_contrato).replace(",", ".")) || null,
        retencao_percentual: parseFloat(String(config.retencao_percentual).replace(",", ".")) || 0,
        iss_percentual: parseFloat(String(config.iss_percentual).replace(",", ".")) || 0,
        inss_percentual: parseFloat(String(config.inss_percentual).replace(",", ".")) || 0,
      });
      toast.success("Contrato atualizado");
      setShowConfig(false);
      await carregar();
    } catch {
      toast.error("Erro ao salvar contrato");
    } finally {
      setSalvando(false);
    }
  };

  const handleCriar = async () => {
    const valor = parseFloat(String(form.valor_medido).replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) {
      toast.error("Informe o valor medido");
      return;
    }
    setSalvando(true);
    try {
      await sigo.entities.MedicaoObra.create({
        empresa_id: empresaAtiva.id,
        projeto_id: projeto.id,
        competencia: form.competencia + "-01",
        percentual_fisico: parseFloat(String(form.percentual_fisico).replace(",", ".")) || null,
        valor_medido: valor,
        observacoes: form.observacoes || null,
        status: "Rascunho",
      });
      toast.success("Medição criada (rascunho)");
      setShowNova(false);
      setForm({ ...form, percentual_fisico: "", valor_medido: "", observacoes: "" });
      await carregar();
    } catch (err) {
      toast.error("Erro ao criar medição: " + (err?.message || ""));
    } finally {
      setSalvando(false);
    }
  };

  const handleFaturar = async (med) => {
    const venc = window.prompt(
      `Faturar a Medição #${med.numero} (${fmtBRL(med.valor_medido)}).\n` +
        `Retenção: ${med.retencao_percentual || 0}%.\n\n` +
        "Data de vencimento da fatura (AAAA-MM-DD):",
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    );
    if (!venc) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) {
      toast.error("Data inválida (use AAAA-MM-DD)");
      return;
    }
    setFaturandoId(med.id);
    try {
      const { data, error } = await supabase.rpc("faturar_medicao", {
        p_medicao_id: med.id,
        p_data_vencimento: venc,
      });
      if (error) throw error;
      toast.success(data?.mensagem || "Medição faturada");
      await carregar();
    } catch (err) {
      toast.error("Erro ao faturar: " + (err?.message || ""));
    } finally {
      setFaturandoId(null);
    }
  };

  const margemValor =
    margem != null
      ? (parseFloat(margem.faturado) || 0) - (parseFloat(margem.custo_realizado) || 0)
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Margem da obra */}
      {margem && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              {margemValor >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              Margem da Obra
            </h3>
            {podeEditar && (
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="text-xs text-blue-600 hover:underline"
              >
                {showConfig ? "Fechar" : "Configurar contrato"}
              </button>
            )}
          </div>

          {showConfig && (
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">Valor do contrato (R$)</Label>
                <Input
                  value={config.valor_contrato ?? ""}
                  onChange={(e) => setConfig({ ...config, valor_contrato: e.target.value })}
                  placeholder="ex: 250000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Retenção contratual (%)</Label>
                <Input
                  value={config.retencao_percentual ?? ""}
                  onChange={(e) => setConfig({ ...config, retencao_percentual: e.target.value })}
                  placeholder="ex: 10"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">ISS retido (%)</Label>
                <Input
                  value={config.iss_percentual ?? ""}
                  onChange={(e) => setConfig({ ...config, iss_percentual: e.target.value })}
                  placeholder="ex: 5"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">INSS retido (%)</Label>
                <Input
                  value={config.inss_percentual ?? ""}
                  onChange={(e) => setConfig({ ...config, inss_percentual: e.target.value })}
                  placeholder="ex: 11"
                  className="mt-1"
                />
              </div>
              <Button size="sm" onClick={handleSalvarConfig} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Salvar
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Contrato</p>
              <p className="font-semibold text-slate-800">{fmtBRL(margem.valor_contrato)}</p>
              <p className="text-[11px] text-slate-400">
                Ret. {margem.retencao_percentual || 0}% • ISS {config.iss_percentual || 0}% • INSS{" "}
                {config.inss_percentual || 0}%
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Custo realizado</p>
              <p className="font-semibold text-red-700">{fmtBRL(margem.custo_realizado)}</p>
              <p className="text-[11px] text-slate-400">
                + {fmtBRL(margem.custo_comprometido)} a pagar
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Faturado</p>
              <p className="font-semibold text-green-700">{fmtBRL(margem.faturado)}</p>
              <p className="text-[11px] text-slate-400">
                Recebido {fmtBRL(margem.recebido)} • Retido {fmtBRL(margem.retido_acumulado)}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${margemValor >= 0 ? "bg-green-50" : "bg-red-50"}`}>
              <p className="text-xs text-slate-500">Margem (fat. − custo)</p>
              <p className={`font-bold ${margemValor >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmtBRL(margemValor)}
              </p>
              <p className="text-[11px] text-slate-400">
                Avanço físico {margem.percentual_fisico ?? 0}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Medições */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Medições ({medicoes.length})
          </h3>
          {podeEditar && (
            <Button size="sm" onClick={() => setShowNova(!showNova)} className="gap-1">
              <Plus className="w-4 h-4" /> Nova medição
            </Button>
          )}
        </div>

        {showNova && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Competência</Label>
              <Input
                type="month"
                value={form.competencia}
                onChange={(e) => setForm({ ...form, competencia: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Avanço físico acumulado (%)</Label>
              <Input
                value={form.percentual_fisico}
                onChange={(e) => setForm({ ...form, percentual_fisico: e.target.value })}
                placeholder="ex: 35"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Valor medido (R$)</Label>
              <Input
                value={form.valor_medido}
                onChange={(e) => setForm({ ...form, valor_medido: e.target.value })}
                placeholder="ex: 45000,00"
                className="mt-1"
              />
            </div>
            <Button size="sm" onClick={handleCriar} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Criar rascunho
            </Button>
          </div>
        )}

        {medicoes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Nenhuma medição. Crie a primeira para começar a faturar por avanço.
          </p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    Competência
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Físico
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Valor medido
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Retenção
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Líquido
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">
                    Status
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {medicoes.map((m, i) => (
                  <tr key={m.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-3 py-2 font-medium">#{m.numero}</td>
                    <td className="px-3 py-2">
                      {m.competencia
                        ? new Date(m.competencia + "T12:00:00").toLocaleDateString("pt-BR", {
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.percentual_fisico != null ? `${m.percentual_fisico}%` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmtBRL(m.valor_medido)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {m.status === "Faturada"
                        ? fmtBRL(m.valor_retencao)
                        : `${m.retencao_percentual || 0}%`}
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">
                      {m.status === "Faturada" ? fmtBRL(m.valor_liquido) : "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[m.status] || "bg-slate-100 text-slate-600"}`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {podeEditar && m.status !== "Faturada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => handleFaturar(m)}
                          disabled={faturandoId === m.id}
                        >
                          {faturandoId === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Receipt className="w-3.5 h-3.5" />
                          )}
                          Faturar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          Faturar gera a receita líquida (valor − retenção) e a receita de retenção (caução) no
          Financeiro, vinculadas a esta obra.
        </p>
      </div>
    </div>
  );
}
