import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, X } from "lucide-react";

export default function ConciliarTransacaoModal({
  open,
  onOpenChange,
  transacao,
  contas,
  categorias,
  onSucesso,
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [contaId, setContaId] = useState(transacao?.conta_id || "");

  if (!transacao) return null;

  const handleConciliar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const conta = contas.find((c) => c.id === (contaId || transacao.conta_id));
      await sigo.entities.TransacaoFinanceira.update(transacao.id, {
        status: transacao.tipo === "receita" ? "recebido" : "pago",
        conta_id: conta?.id || transacao.conta_id,
        conta_nome: conta?.nome || transacao.conta_nome,
      });
      setSucesso(true);
      setTimeout(() => {
        setSucesso(false);
        onOpenChange(false);
        onSucesso();
      }, 1500);
    } catch (err) {
      setErro("Erro ao conciliar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-full rounded-lg p-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900">Conciliar Lançamento</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {sucesso ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <p className="font-semibold text-slate-900">Conciliado com sucesso!</p>
            </div>
          ) : (
            <>
              {erro && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-800">{erro}</AlertDescription>
                </Alert>
              )}

              <div className="bg-slate-50 p-3 rounded-lg space-y-1 text-sm">
                <p>
                  <span className="text-slate-500">Descrição:</span>{" "}
                  <span className="font-medium">{transacao.descricao || "-"}</span>
                </p>
                <p>
                  <span className="text-slate-500">Tipo:</span>{" "}
                  <span
                    className={`font-medium ${transacao.tipo === "receita" ? "text-green-600" : "text-red-600"}`}
                  >
                    {transacao.tipo === "receita" ? "Receita" : "Despesa"}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Valor:</span>{" "}
                  <span className="font-semibold">
                    R${" "}
                    {(transacao.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </p>
              </div>

              {contas.length > 0 && (
                <div className="space-y-1">
                  <Label>Conta</Label>
                  <Select value={contaId || transacao.conta_id} onValueChange={setContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="text-xs text-slate-500">
                Ao conciliar, o status será alterado para{" "}
                <strong>{transacao.tipo === "receita" ? '"Recebido"' : '"Pago"'}</strong>.
              </p>

              <div className="flex gap-2">
                <Button
                  onClick={handleConciliar}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Conciliando...
                    </>
                  ) : (
                    "Conciliar Agora"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
