import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, X, FileText, Eye } from "lucide-react";
import DraggableComprovante from "../shared/DraggableComprovante";

export default function EditarPreLancamentoModal({
  open,
  onOpenChange,
  preLancamento,
  empresaId,
  contas,
  categorias,
  onSucesso,
}) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [visualizandoComprovante, setVisualizandoComprovante] = useState(false);

  useEffect(() => {
    if (preLancamento) {
      setForm({
        descricao: preLancamento.descricao || "",
        tipo: preLancamento.tipo || "despesa",
        valor: preLancamento.valor || "",
        data: preLancamento.data || "",
        data_vencimento: preLancamento.data_vencimento || "",
        conta_id: preLancamento.conta_id || "",
        categoria_id: preLancamento.categoria_id || "",
        observacoes: preLancamento.observacoes || "",
      });
    }
  }, [preLancamento]);

  const handleSalvar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const conta = contas.find((c) => c.id === form.conta_id);
      const categoria = categorias.find((c) => c.id === form.categoria_id);
      await sigo.entities.TransacaoFinanceira.update(preLancamento.id, {
        descricao: form.descricao,
        tipo: form.tipo,
        valor: parseFloat(form.valor) || 0,
        data: form.data,
        data_vencimento: form.data_vencimento,
        conta_id: form.conta_id || null,
        conta_nome: conta?.nome || preLancamento.conta_nome,
        categoria_id: form.categoria_id || null,
        categoria_nome: categoria?.nome || preLancamento.categoria_nome,
        observacoes: form.observacoes,
      });
      onSucesso();
      onOpenChange(false);
    } catch (err) {
      setErro("Erro ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!preLancamento) return null;

  return (
    <React.Fragment>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg w-full h-full sm:h-auto max-h-screen sm:max-h-[90vh] rounded-none sm:rounded-lg p-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
            <h2 className="text-base font-semibold text-slate-900">Editar Pré-Lançamento</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {erro && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">{erro}</AlertDescription>
              </Alert>
            )}

            {preLancamento?.comprovante_url && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                {preLancamento.comprovante_url.toLowerCase().includes(".pdf") ||
                preLancamento.comprovante_url.toLowerCase().includes("pdf") ? (
                  <div className="w-12 h-12 bg-red-50 rounded border border-red-200 flex flex-col items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-red-500" />
                    <span className="text-[9px] text-red-500 font-medium">PDF</span>
                  </div>
                ) : (
                  <img
                    src={preLancamento.comprovante_url}
                    alt="Comprovante"
                    className="w-12 h-12 object-cover rounded border border-slate-200 flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">Comprovante anexado</p>
                  <p className="text-xs text-slate-500 truncate">
                    {preLancamento.comprovante_url.split("/").pop()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisualizandoComprovante(true)}
                  className="flex-shrink-0 gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Visualizar
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Descrição</Label>
                <Input
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Data Competência</Label>
                <Input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Data Vencimento</Label>
                <Input
                  type="date"
                  value={form.data_vencimento}
                  onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Conta</Label>
                <Select
                  value={form.conta_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, conta_id: v }))}
                >
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

              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoria_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1">
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSalvar}
                disabled={loading}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
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
          </div>
        </DialogContent>
      </Dialog>

      {visualizandoComprovante && preLancamento?.comprovante_url && (
        <DraggableComprovante
          url={preLancamento.comprovante_url}
          onFechar={() => setVisualizandoComprovante(false)}
        />
      )}
    </React.Fragment>
  );
}
