import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, PlusCircle } from "lucide-react";

export default function AcrescentarPreLancamentoModal({
  open,
  onOpenChange,
  fechamento,
  empresaId,
  onSucesso,
}) {
  const [pendentes, setPendentes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionados, setSelecionados] = useState([]);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !empresaId) return;
    setSelecionados([]);
    setBusca("");
    setCarregando(true);

    const idsNoFechamento = JSON.parse(fechamento?.pre_lancamentos_ids || "[]");

    sigo.entities.PreLancamento.filter({ empresa_id: empresaId, status: "Pendente" })
      .then((data) => {
        // Excluir os que já estão neste fechamento
        setPendentes((data || []).filter((p) => !idsNoFechamento.includes(p.id)));
      })
      .catch(() => setPendentes([]))
      .finally(() => setCarregando(false));
  }, [open, empresaId, fechamento]);

  const getDados = (pl) => {
    try {
      return typeof pl.dados_extraidos === "string"
        ? JSON.parse(pl.dados_extraidos)
        : pl.dados_extraidos || {};
    } catch {
      return {};
    }
  };

  const filtrados = pendentes.filter((pl) => {
    if (!busca.trim()) return true;
    const d = getDados(pl);
    const s = busca.toLowerCase();
    return (
      d.fornecedor?.toLowerCase().includes(s) ||
      d.descricao?.toLowerCase().includes(s) ||
      pl.projeto_nome?.toLowerCase().includes(s) ||
      pl.observacoes?.toLowerCase().includes(s)
    );
  });

  const toggle = (id) =>
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const handleConfirmar = async () => {
    if (selecionados.length === 0) return;
    setSalvando(true);
    try {
      const idsAtuais = JSON.parse(fechamento.pre_lancamentos_ids || "[]");
      const novosIds = [...idsAtuais, ...selecionados];

      const plsSelecionados = pendentes.filter((p) => selecionados.includes(p.id));
      const valorExtra = plsSelecionados.reduce((sum, pl) => {
        const d = getDados(pl);
        return sum + (parseFloat(d.valor) || 0);
      }, 0);

      await sigo.entities.FechamentoCaixa.update(fechamento.id, {
        pre_lancamentos_ids: JSON.stringify(novosIds),
        valor_total: (fechamento.valor_total || 0) + valorExtra,
      });

      await Promise.all(
        selecionados.map((id) =>
          sigo.entities.PreLancamento.update(id, { status: "Em Fechamento" })
        )
      );

      onSucesso();
      onOpenChange(false);
    } catch (err) {
      alert("Erro ao acrescentar: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-blue-600" />
            Acrescentar Pré-lançamentos ao Fechamento #{fechamento?.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por fornecedor, descrição, projeto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-lg">
          {carregando ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {pendentes.length === 0
                ? "Nenhum pré-lançamento pendente disponível."
                : "Nenhum resultado encontrado."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={
                        filtrados.length > 0 && filtrados.every((p) => selecionados.includes(p.id))
                      }
                      onCheckedChange={(v) => {
                        if (v)
                          setSelecionados((prev) => [
                            ...new Set([...prev, ...filtrados.map((p) => p.id)]),
                          ]);
                        else
                          setSelecionados((prev) =>
                            prev.filter((id) => !filtrados.some((p) => p.id === id))
                          );
                      }}
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Fornecedor</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Descrição</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Projeto</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((pl) => {
                  const d = getDados(pl);
                  const valor = parseFloat(d.valor) || 0;
                  const checked = selecionados.includes(pl.id);
                  return (
                    <tr
                      key={pl.id}
                      className={`border-b cursor-pointer hover:bg-slate-50 ${checked ? "bg-blue-50" : ""}`}
                      onClick={() => toggle(pl.id)}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(pl.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {d.fornecedor || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{d.descricao || "-"}</td>
                      <td className="px-3 py-2 text-slate-500">{pl.projeto_nome || "-"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-600">
                        R$ {valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-slate-600">
            {selecionados.length > 0 ? (
              <span>
                <Badge className="bg-blue-100 text-blue-700 mr-2">
                  {selecionados.length} selecionado(s)
                </Badge>
                Total: R${" "}
                {pendentes
                  .filter((p) => selecionados.includes(p.id))
                  .reduce((s, p) => {
                    const d = getDados(p);
                    return s + (parseFloat(d.valor) || 0);
                  }, 0)
                  .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            ) : (
              <span className="text-slate-400">Selecione os pré-lançamentos para adicionar</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmar}
              disabled={selecionados.length === 0 || salvando}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {salvando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              Acrescentar ({selecionados.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
