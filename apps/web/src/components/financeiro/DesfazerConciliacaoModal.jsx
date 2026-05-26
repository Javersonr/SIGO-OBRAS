import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sigo } from "@/api/sigoClient";
import { Loader2, Undo2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DesfazerConciliacaoModal({
  open,
  onOpenChange,
  preLancamento,
  transacao,
  onSucesso,
}) {
  const [desfazendo, setDesfazendo] = useState(false);
  const [erro, setErro] = useState(null);

  const handleDesfazer = async () => {
    setDesfazendo(true);
    setErro(null);
    try {
      // Verificar se está incluído em algum fechamento pago
      if (transacao?.pre_lancamento_id) {
        const fechamentos = await sigo.entities.FechamentoCaixa.filter({});
        const fechamentoPago = fechamentos.find((f) => {
          if (f.status === "Pago") {
            const ids = JSON.parse(f.pre_lancamentos_ids || "[]");
            return ids.includes(preLancamento.id);
          }
          return false;
        });
        if (fechamentoPago) {
          setErro(
            "Este pré-lançamento já foi incluído em um fechamento de caixa pago e não pode ser desfeito."
          );
          setDesfazendo(false);
          return;
        }
      }

      // Deletar a transação financeira vinculada
      if (transacao?.id) {
        // Deletar anexos da transação primeiro
        try {
          const anexos = await sigo.entities.TransacaoAnexo.filter({ transacao_id: transacao.id });
          await Promise.all(anexos.map((a) => sigo.entities.TransacaoAnexo.delete(a.id)));
        } catch {}
        await sigo.entities.TransacaoFinanceira.delete(transacao.id);
      }

      // Reverter o pré-lançamento para Pendente
      await sigo.entities.PreLancamento.update(preLancamento.id, {
        status: "Pendente",
        transacao_id: null,
      });

      onOpenChange(false);
      onSucesso();
    } catch (err) {
      setErro("Erro ao desfazer: " + err.message);
    } finally {
      setDesfazendo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700">
            <Undo2 className="w-5 h-5" />
            Desfazer Conciliação
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {erro && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800">{erro}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-slate-600">
            Deseja desfazer a conciliação deste pré-lançamento? A despesa gerada será removida e o
            pré-lançamento voltará ao status <strong>Pendente</strong>.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm text-orange-800">
            ⚠️ Esta ação não poderá ser desfeita se o item já estiver em um fechamento de caixa
            pago.
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={desfazendo}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDesfazer}
              disabled={desfazendo}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {desfazendo ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Undo2 className="w-4 h-4 mr-2" />
              )}
              Desfazer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
