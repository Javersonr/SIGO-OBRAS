import React, { useState } from "react";
import { supabase } from "@/api/sigoClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Rocket } from "lucide-react";

const fmtBRL = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PedidoDiretoModal({
  open,
  onOpenChange,
  solicitacao,
  fornecedores,
  user,
  onSuccess,
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [previsaoEntrega, setPrevisaoEntrega] = useState("");
  const [processando, setProcessando] = useState(false);

  React.useEffect(() => {
    if (open) {
      setFornecedorId("");
      setCondicaoPagamento("");
      setPrevisaoEntrega("");
    }
  }, [open]);

  const handleConfirmar = async () => {
    if (!fornecedorId) {
      alert("Selecione um fornecedor.");
      return;
    }
    if (!supabase) {
      alert("Backend Supabase não disponível.");
      return;
    }

    setProcessando(true);
    try {
      const { data, error } = await supabase.rpc("gerar_pedido_direto", {
        p_solicitacao_id: solicitacao.id,
        p_fornecedor_id: fornecedorId,
        p_emissor_email: user?.email,
        p_emissor_nome: user?.full_name,
        p_condicao_pagamento: condicaoPagamento || null,
        p_previsao_entrega: previsaoEntrega || null,
      });
      if (error) throw error;

      const pedidoId = typeof data === "string" ? data : data?.id || data;
      alert(`✅ Pedido criado (id: ${pedidoId}).`);
      onSuccess?.(pedidoId);
      onOpenChange(false);
    } catch (err) {
      console.error("[PedidoDiretoModal] erro:", err);
      alert("❌ " + (err?.message || "Erro ao gerar pedido direto"));
    } finally {
      setProcessando(false);
    }
  };

  const fornecedoresAtivos = (fornecedores || []).filter(
    (f) => f.ativo === undefined || f.ativo === null || f.ativo === true
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-emerald-600" /> Gerar Pedido Direto
          </DialogTitle>
          <DialogDescription>
            Cria pedido de compra a partir da solicitação {solicitacao?.numero}, sem passar por
            cotação. Valor estimado:{" "}
            <span className="font-medium text-emerald-700">
              {fmtBRL(solicitacao?.valor_total_estimado)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Fornecedor *</Label>
            <Select value={fornecedorId} onValueChange={setFornecedorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fornecedor" />
              </SelectTrigger>
              <SelectContent>
                {fornecedoresAtivos.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome_fantasia || f.nome_razao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fornecedoresAtivos.length === 0 && (
              <p className="text-xs text-amber-700">
                Nenhum fornecedor ativo cadastrado. Cadastre em Configurações &gt; Fornecedores.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Condição de pagamento</Label>
            <Input
              placeholder="Ex: À vista, 30 dias, 30/60/90..."
              value={condicaoPagamento}
              onChange={(e) => setCondicaoPagamento(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Previsão de entrega</Label>
            <Input
              type="date"
              value={previsaoEntrega}
              onChange={(e) => setPrevisaoEntrega(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={processando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={processando || !fornecedorId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Rocket className="w-4 h-4 mr-2" />
            {processando ? "Gerando..." : "Confirmar Pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
