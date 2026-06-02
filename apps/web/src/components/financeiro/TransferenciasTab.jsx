import React, { useState } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { sigo, supabase } from "@/api/sigoClient";

export default function TransferenciasTab({ empresaAtiva, contas, onReload }) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferencias, setTransferencias] = useState([]);
  const [form, setForm] = useState({
    conta_origem_id: "",
    conta_destino_id: "",
    valor: "",
    data: new Date().toISOString().split("T")[0],
    descricao: "",
  });

  React.useEffect(() => {
    if (empresaAtiva?.id) {
      loadTransferencias();
    }
  }, [empresaAtiva?.id]);

  const loadTransferencias = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    const trans = await sigo.entities.TransacaoTransferencia.filter({
      empresa_id: empresaAtiva.id,
    });
    setTransferencias(trans.sort((a, b) => new Date(b.data) - new Date(a.data)));
  }, [empresaAtiva?.id]);

  const handleSave = async () => {
    if (saving) return; // guarda contra clique duplo
    if (!form.conta_origem_id || !form.conta_destino_id || !form.valor) {
      alert("Preencha origem, destino e valor.");
      return;
    }
    if (form.conta_origem_id === form.conta_destino_id) {
      alert("Conta de origem e destino devem ser diferentes.");
      return;
    }
    const valor = parseFloat(form.valor) || 0;
    if (valor <= 0) {
      alert("Valor deve ser maior que zero.");
      return;
    }
    if (!empresaAtiva?.id) {
      alert("Selecione uma empresa antes de transferir.");
      return;
    }

    setSaving(true);
    try {
      // Antes esta função só criava a linha em transacao_transferencia. Não
      // mexia em extrato_bancario nem em saldo_atual das contas — o saldo
      // mostrado ao usuário ficava desatualizado e relatórios divergiam.
      // Agora chama a RPC criar_transferencia_atomica (0034) que faz tudo
      // numa transaction única.
      const { data, error } = await supabase.rpc("criar_transferencia_atomica", {
        p_empresa_id: empresaAtiva.id,
        p_conta_origem_id: form.conta_origem_id,
        p_conta_destino_id: form.conta_destino_id,
        p_valor: valor,
        p_data: form.data,
        p_descricao: form.descricao || null,
        p_created_by: null,
      });

      if (error) {
        console.error("Erro na transferência:", error);
        alert(`Erro ao registrar transferência: ${error.message}`);
        return;
      }
      if (data && data.success === false) {
        alert(`Não foi possível concluir a transferência: ${data.error || "erro desconhecido"}`);
        return;
      }

      setShowModal(false);
      setForm({
        conta_origem_id: "",
        conta_destino_id: "",
        valor: "",
        data: new Date().toISOString().split("T")[0],
        descricao: "",
      });
      await loadTransferencias();
      onReload?.();
    } catch (err) {
      console.error("Falha inesperada ao transferir:", err);
      alert(`Falha inesperada: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value || 0
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Transferências</h2>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Transferência
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Data</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">De</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Para</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Valor</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                Descrição
              </th>
            </tr>
          </thead>
          <tbody>
            {transferencias.map((t) => (
              <tr key={t.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  {new Date(t.data).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-sm">{t.conta_origem_nome}</td>
                <td className="px-4 py-3 text-sm">{t.conta_destino_nome}</td>
                <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                  {formatCurrency(t.valor)}
                </td>
                <td className="px-4 py-3 text-sm">{t.descricao || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent
          style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
        >
          <SheetHeader>
            <SheetTitle>Nova Transferência</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Conta Origem *</Label>
              <Select
                value={form.conta_origem_id}
                onValueChange={(v) => setForm({ ...form, conta_origem_id: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione" />
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
            <div>
              <Label>Conta Destino *</Label>
              <Select
                value={form.conta_destino_id}
                onValueChange={(v) => setForm({ ...form, conta_destino_id: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((c) => c.id !== form.conta_origem_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor *</Label>
              <Input
                type="number"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.valor || !form.conta_origem_id || !form.conta_destino_id}
            >
              {saving ? "Transferindo..." : "Transferir"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
