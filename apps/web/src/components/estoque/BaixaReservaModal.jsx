import React, { useState, useEffect } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X, Check, AlertCircle } from "lucide-react";

export default function BaixaReservaModal({ open, onOpenChange, reserva, onSave }) {
  const [itens, setItens] = useState([]);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && reserva?.id) {
      loadItensReserva();
    }
  }, [open, reserva?.id]);

  const loadItensReserva = async () => {
    try {
      const todasReservas = await sigo.entities.ReservaMaterial.filter({
        numero: reserva.numero,
      });
      setItens(todasReservas.map((r) => ({ ...r, selecionado: true })));
    } catch (error) {
      console.error("Erro ao carregar itens:", error);
    }
  };

  const handleBaixa = async () => {
    const itensSelecionados = itens.filter((i) => i.selecionado);
    if (itensSelecionados.length === 0) {
      alert("Selecione pelo menos um item");
      return;
    }

    setSaving(true);
    try {
      if (!supabase) {
        throw new Error("Supabase client indisponível");
      }

      let user = null;
      try {
        user = await sigo.auth.me();
      } catch {
        /* anônimo ok */
      }

      // Baixa atômica por reserva (saída de estoque + status Utilizada + saldo
      // recalculado dentro do Postgres). Substitui o bulkCreate + Promise.all.
      const erros = [];
      let sucesso = 0;
      for (const item of itensSelecionados) {
        try {
          const { error } = await supabase.rpc("baixar_reserva_atomica", {
            p_reserva_id: item.id,
            p_quantidade_baixar: parseFloat(item.quantidade_reservada),
            p_usuario_nome: user?.full_name || null,
            p_observacoes: observacoes || `Baixa de reserva ${item.numero}`,
          });
          if (error) throw error;
          sucesso++;
        } catch (err) {
          erros.push(`${item.material_descricao || item.id}: ${err.message || err}`);
        }
      }

      if (erros.length > 0) {
        alert(
          `Baixa parcial: ${sucesso}/${itensSelecionados.length} OK.\n\nErros:\n${erros.join("\n")}`
        );
      } else {
        alert("✅ Baixa realizada com sucesso!");
      }
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao dar baixa:", error);
      alert("Erro ao dar baixa na reserva: " + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col w-full md:w-auto"
        data-fullscreen-modal
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Dar Baixa em Reserva</SheetTitle>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {itens.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Carregando itens...</p>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 font-medium mb-1">Reserva: {reserva?.numero}</p>
                <p className="text-xs text-blue-700">Projeto: {reserva?.projeto_nome || "-"}</p>
              </div>

              <div>
                <Label className="text-base font-semibold block mb-3">
                  Itens para Dar Baixa ({itens.filter((i) => i.selecionado).length}/{itens.length})
                </Label>
                <div className="space-y-2">
                  {itens.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.selecionado}
                        onChange={(e) =>
                          setItens((prev) =>
                            prev.map((i) =>
                              i.id === item.id ? { ...i, selecionado: e.target.checked } : i
                            )
                          )
                        }
                        className="w-4 h-4 rounded"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-800">{item.material_descricao}</div>
                        <div className="text-xs text-slate-600">
                          Código: {item.material_codigo} • {item.quantidade_reservada}{" "}
                          {item.unidade}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  A saída será registrada no estoque e a reserva marcada como "Utilizada"
                </p>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Motivo ou observações da saída..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleBaixa}
            disabled={saving || itens.length === 0 || !itens.some((i) => i.selecionado)}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            <Check className="w-4 h-4" />
            {saving ? "Processando..." : "Dar Baixa"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
