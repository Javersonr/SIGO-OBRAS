import React, { useState, useEffect, useCallback } from "react";
import { sigo, supabase } from "@/api/sigoClient";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PackageCheck, Loader2 } from "lucide-react";

const num = (v) => Number(v) || 0;

// Conferência de recebimento de um pedido de compra.
// Chama a RPC atômica conferir_recebimento_pedido (0068): valida o pendente,
// dá entrada no estoque (itens com material) e fecha o pedido (parcial/total).
export default function ConferirRecebimentoModal({ open, onOpenChange, pedido, user, onSuccess }) {
  const [itens, setItens] = useState([]);
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [almoxarifadoId, setAlmoxarifadoId] = useState("");
  const [nfeChave, setNfeChave] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().slice(0, 10));
  // pedido_item_id -> string (quantidade a receber agora)
  const [quantidades, setQuantidades] = useState({});
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!pedido?.id) return;
    setCarregando(true);
    try {
      const [its, alms] = await Promise.all([
        sigo.entities.PedidoCompraItem.filter({ pedido_id: pedido.id }),
        sigo.entities.Almoxarifado.filter({ empresa_id: pedido.empresa_id }),
      ]);
      const ativos = (its || []).filter((i) => !i.deleted_at);
      setItens(ativos);
      const almAtivos = (alms || []).filter(
        (a) => !a.deleted_at && (a.ativo === undefined || a.ativo === null || a.ativo === true)
      );
      setAlmoxarifados(almAtivos);
      // pré-seleciona almoxarifado se houver só um
      if (almAtivos.length === 1) setAlmoxarifadoId(almAtivos[0].id);
      // default: receber o pendente de cada item
      const q = {};
      ativos.forEach((i) => {
        const pend = num(i.quantidade) - num(i.quantidade_entregue);
        if (pend > 0.0001) q[i.id] = String(pend);
      });
      setQuantidades(q);
    } catch (err) {
      console.error("[ConferirRecebimento] erro ao carregar:", err);
      alert("❌ Erro ao carregar itens do pedido: " + (err?.message || ""));
    } finally {
      setCarregando(false);
    }
  }, [pedido?.id, pedido?.empresa_id]);

  useEffect(() => {
    if (open) {
      setNfeChave("");
      setDataRecebimento(new Date().toISOString().slice(0, 10));
      setAlmoxarifadoId("");
      carregar();
    }
  }, [open, carregar]);

  const setQtd = (itemId, valor) => setQuantidades((prev) => ({ ...prev, [itemId]: valor }));

  const pendenteDe = (i) => num(i.quantidade) - num(i.quantidade_entregue);
  const itensComPendente = itens.filter((i) => pendenteDe(i) > 0.0001);

  // itens que serão de fato recebidos agora (qtd > 0)
  const aReceber = itens
    .map((i) => ({ item: i, qtd: num(quantidades[i.id]) }))
    .filter((x) => x.qtd > 0.0001);

  const precisaAlmox = aReceber.some((x) => x.item.material_id);

  const handleConfirmar = async () => {
    if (!supabase) {
      alert("Backend Supabase não disponível.");
      return;
    }
    if (aReceber.length === 0) {
      alert("Informe a quantidade recebida de ao menos um item.");
      return;
    }
    // valida pendente no cliente (o banco revalida de qualquer forma)
    for (const x of aReceber) {
      if (x.qtd > pendenteDe(x.item) + 0.001) {
        alert(`O item "${x.item.descricao || "—"}" só tem ${pendenteDe(x.item)} pendente(s).`);
        return;
      }
    }
    if (precisaAlmox && !almoxarifadoId) {
      alert("Selecione o almoxarifado para dar entrada no estoque.");
      return;
    }

    setProcessando(true);
    try {
      const { data, error } = await supabase.rpc("conferir_recebimento_pedido", {
        p_pedido_id: pedido.id,
        p_almoxarifado_id: almoxarifadoId || null,
        p_itens: aReceber.map((x) => ({
          pedido_item_id: x.item.id,
          quantidade: x.qtd,
        })),
        p_nfe_chave: nfeChave || null,
        p_data: dataRecebimento || null,
        p_ator_email: user?.email || null,
        p_ator_nome: user?.full_name || null,
      });
      if (error) throw error;

      alert("✅ " + (data?.mensagem || "Recebimento registrado."));
      onSuccess?.(data);
      onOpenChange(false);
    } catch (err) {
      console.error("[ConferirRecebimento] erro:", err);
      alert("❌ " + (err?.message || "Erro ao conferir recebimento"));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-emerald-600" /> Conferir Recebimento
          </DialogTitle>
          <DialogDescription>
            Pedido <span className="font-medium">{pedido?.numero}</span> — confira o que chegou.
            Itens com material dão entrada no estoque automaticamente; o pedido fecha como{" "}
            <em>Entregue</em> ou <em>Entregue Parcial</em>.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando itens...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2 md:col-span-1">
                <Label>
                  Almoxarifado {precisaAlmox && <span className="text-red-500">*</span>}
                </Label>
                <Select value={almoxarifadoId} onValueChange={setAlmoxarifadoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {almoxarifados.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data do recebimento</Label>
                <Input
                  type="date"
                  value={dataRecebimento}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Chave da NF-e (opcional)</Label>
                <Input
                  placeholder="44 dígitos"
                  value={nfeChave}
                  onChange={(e) => setNfeChave(e.target.value)}
                />
              </div>
            </div>

            {itensComPendente.length === 0 ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded-md p-3">
                Todos os itens deste pedido já foram recebidos.
              </p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Pedido</TableHead>
                      <TableHead className="text-right">Já recebido</TableHead>
                      <TableHead className="text-right">Pendente</TableHead>
                      <TableHead className="text-right w-32">Receber agora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensComPendente.map((i) => {
                      const pend = pendenteDe(i);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="text-sm">
                            {i.descricao || "—"}
                            {!i.material_id && (
                              <span className="ml-2 text-xs text-amber-600">(sem estoque)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {num(i.quantidade)} {i.unidade || ""}
                          </TableCell>
                          <TableCell className="text-right text-sm text-slate-500">
                            {num(i.quantidade_entregue)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{pend}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              max={pend}
                              step="0.001"
                              className="text-right h-8"
                              value={quantidades[i.id] ?? ""}
                              onChange={(e) => setQtd(i.id, e.target.value)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={processando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={processando || carregando || aReceber.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <PackageCheck className="w-4 h-4 mr-2" />
            {processando ? "Registrando..." : "Confirmar Recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
