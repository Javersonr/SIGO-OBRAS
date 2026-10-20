import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sigo, supabase } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
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
  const [conciliadaNoBanco, setConciliadaNoBanco] = useState(false);

  // A despesa gerada pode ter sido conciliada com uma linha do extrato do
  // banco (Conciliação Bancária). Avisa antes: desfazer aqui desfaz também
  // essa conciliação.
  useEffect(() => {
    setConciliadaNoBanco(false);
    if (!open || !transacao?.id) return;
    let ativo = true;
    sigo.entities.TransacaoFinanceira.get(transacao.id)
      .then((tx) => ativo && setConciliadaNoBanco(!!tx?.conciliado))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [open, transacao?.id]);

  const handleDesfazer = async () => {
    setDesfazendo(true);
    setErro(null);
    try {
      // Item dentro de um fechamento (pago ou não) não volta para "Pendente": sairia
      // da lista de pendentes sem sair do fechamento, que continuaria somando o
      // valor dele. Confere sempre pelo pré-lançamento (o `transacao` recebido do
      // histórico de fechamentos é só { id }, sem pre_lancamento_id).
      if (preLancamento?.id) {
        const fechamentos = await sigo.entities.FechamentoCaixa.filter({});
        const fechamento = fechamentos.find((f) =>
          safeParseJSON(f.pre_lancamentos_ids, []).includes(preLancamento.id)
        );
        if (fechamento) {
          setErro(
            fechamento.status === "Pago"
              ? "Este pré-lançamento já foi incluído em um fechamento de caixa pago e não pode ser desfeito."
              : `Este pré-lançamento está no fechamento #${fechamento.numero || ""}, ainda não pago: desfaça o fechamento antes.`
          );
          setDesfazendo(false);
          return;
        }
      }

      // Deletar a transação financeira vinculada
      if (transacao?.id) {
        // Lançamento conciliado com o extrato do banco não pode ser excluído
        // (trigger da 0155). desconciliar_transacao (0156) desfaz os dois lados
        // numa transação só e devolve a linha do banco para "pendente". Lê o
        // estado atual: o `transacao` recebido pode ser só { id }.
        const atual = await sigo.entities.TransacaoFinanceira.get(transacao.id);
        if (atual?.conciliado) {
          if (!supabase) throw new Error("backend indisponível");
          const { error: errDesconciliar } = await supabase.rpc("desconciliar_transacao", {
            p_transacao_id: transacao.id,
          });
          if (errDesconciliar) {
            throw new Error(
              `não foi possível desfazer a conciliação com o extrato do banco (${errDesconciliar.message})`
            );
          }
        }

        // Deletar anexos da transação primeiro. allSettled pra não bloquear
        // o desfazer se 1 anexo falhar — anexo órfão é menos crítico do que
        // pré-lançamento travado em status "Conciliado".
        try {
          const anexos = await sigo.entities.TransacaoAnexo.filter({ transacao_id: transacao.id });
          const results = await Promise.allSettled(
            anexos.map((a) => sigo.entities.TransacaoAnexo.delete(a.id))
          );
          const orfaos = results.filter((r) => r.status === "rejected").length;
          if (orfaos > 0) {
            console.warn(
              `[DesfazerConciliacao] ${orfaos} anexo(s) não foram apagados — ficam como órfãos.`
            );
          }
        } catch (err) {
          console.warn("[DesfazerConciliacao] falha apagando anexos:", err);
        }
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
          {conciliadaNoBanco && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              Esta despesa está conciliada com uma linha do extrato do banco. A conciliação bancária
              também será desfeita e a linha do extrato voltará para pendente.
            </div>
          )}
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
