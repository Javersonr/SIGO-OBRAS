import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtQtd = (v) => (v == null ? "-" : Number(v).toLocaleString("pt-BR"));
const fmtDataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "-");

const RESULTADO_BADGE = {
  Aprovada: "bg-green-100 text-green-700",
  Reprovada: "bg-red-100 text-red-700",
  Parcial: "bg-amber-100 text-amber-700",
  Pendente: "bg-slate-100 text-slate-700",
};

const FORM_VAZIO = {
  origem_tipo: "OrdemProducao",
  ordem_producao_id: "",
  material_id: "",
  lote: "",
  quantidade_inspecionada: "",
  quantidade_aprovada: "",
  quantidade_reprovada: "0",
  nao_conformidade: "",
  acao_corretiva: "",
  observacoes: "",
};

export default function QualidadeTab({ empresaAtiva, user, materiais }) {
  const [inspecoes, setInspecoes] = useState([]);
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const loadData = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [insps, opsList] = await Promise.all([
        sigo.entities.InspecaoQualidade.filter(
          { empresa_id: empresaAtiva.id },
          { sort_by: "-created_at", limit: 200 }
        ),
        sigo.entities.OrdemProducao.filter(
          { empresa_id: empresaAtiva.id },
          { sort_by: "-created_at", limit: 100 }
        ),
      ]);
      setInspecoes(insps || []);
      setOps(opsList || []);
    } catch (e) {
      console.error("[QualidadeTab] erro:", e);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const calcularResultado = (aprovada, reprovada) => {
    const a = Number(aprovada) || 0;
    const r = Number(reprovada) || 0;
    if (a > 0 && r === 0) return "Aprovada";
    if (a === 0 && r > 0) return "Reprovada";
    if (a > 0 && r > 0) return "Parcial";
    return "Pendente";
  };

  const salvar = async () => {
    if (!form.material_id || !form.quantidade_inspecionada) {
      toast.error("Informe o material e a quantidade inspecionada");
      return;
    }
    setSaving(true);
    try {
      const mat = materiais.find((m) => m.id === form.material_id);
      const op = ops.find((o) => o.id === form.ordem_producao_id);
      await sigo.entities.InspecaoQualidade.create({
        empresa_id: empresaAtiva.id,
        origem_tipo: form.origem_tipo,
        ordem_producao_id:
          form.origem_tipo === "OrdemProducao" ? form.ordem_producao_id || null : null,
        ordem_producao_numero: form.origem_tipo === "OrdemProducao" ? op?.numero || null : null,
        material_id: form.material_id,
        material_nome: mat?.nome || null,
        lote: form.lote || null,
        quantidade_inspecionada: Number(form.quantidade_inspecionada),
        quantidade_aprovada: Number(form.quantidade_aprovada) || 0,
        quantidade_reprovada: Number(form.quantidade_reprovada) || 0,
        resultado: calcularResultado(form.quantidade_aprovada, form.quantidade_reprovada),
        nao_conformidade: form.nao_conformidade || null,
        acao_corretiva: form.acao_corretiva || null,
        inspetor_id: user?.id || null,
        inspetor_nome: user?.full_name || user?.email || null,
        observacoes: form.observacoes || null,
      });
      toast.success("Inspeção registrada");
      setShowModal(false);
      setForm(FORM_VAZIO);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao registrar inspeção");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova inspeção
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Inspecionada</TableHead>
              <TableHead className="text-right">Aprovada</TableHead>
              <TableHead className="text-right">Reprovada</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Inspetor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : inspecoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma inspeção registrada
                </TableCell>
              </TableRow>
            ) : (
              inspecoes.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="whitespace-nowrap">
                    {fmtDataHora(i.data_inspecao || i.created_at)}
                  </TableCell>
                  <TableCell>
                    {i.origem_tipo === "OrdemProducao"
                      ? `OP ${i.ordem_producao_numero || ""}`
                      : i.origem_tipo}
                  </TableCell>
                  <TableCell>{i.material_nome}</TableCell>
                  <TableCell className="text-right">{fmtQtd(i.quantidade_inspecionada)}</TableCell>
                  <TableCell className="text-right">{fmtQtd(i.quantidade_aprovada)}</TableCell>
                  <TableCell className="text-right">{fmtQtd(i.quantidade_reprovada)}</TableCell>
                  <TableCell>
                    <Badge className={RESULTADO_BADGE[i.resultado] || ""} variant="secondary">
                      {i.resultado}
                    </Badge>
                  </TableCell>
                  <TableCell>{i.inspetor_nome || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Nova inspeção de qualidade</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Origem</Label>
              <Select
                value={form.origem_tipo}
                onValueChange={(v) => setForm({ ...form, origem_tipo: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OrdemProducao">Ordem de produção</SelectItem>
                  <SelectItem value="Recebimento">Recebimento de compra</SelectItem>
                  <SelectItem value="Estoque">Estoque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.origem_tipo === "OrdemProducao" && (
              <div>
                <Label>Ordem de produção</Label>
                <Select
                  value={form.ordem_producao_id}
                  onValueChange={(v) => {
                    const op = ops.find((o) => o.id === v);
                    setForm({
                      ...form,
                      ordem_producao_id: v,
                      material_id: op?.material_id || form.material_id,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a OP" />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.numero || o.id.slice(0, 8)} — {o.material_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Material *</Label>
              <Select
                value={form.material_id}
                onValueChange={(v) => setForm({ ...form, material_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o material" />
                </SelectTrigger>
                <SelectContent>
                  {materiais.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.codigo ? `${m.codigo} — ` : ""}
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Inspecionada *</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.quantidade_inspecionada}
                  onChange={(e) => setForm({ ...form, quantidade_inspecionada: e.target.value })}
                />
              </div>
              <div>
                <Label>Aprovada</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.quantidade_aprovada}
                  onChange={(e) => setForm({ ...form, quantidade_aprovada: e.target.value })}
                />
              </div>
              <div>
                <Label>Reprovada</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.quantidade_reprovada}
                  onChange={(e) => setForm({ ...form, quantidade_reprovada: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Lote</Label>
              <Input
                value={form.lote}
                onChange={(e) => setForm({ ...form, lote: e.target.value })}
              />
            </div>
            {Number(form.quantidade_reprovada) > 0 && (
              <>
                <div>
                  <Label>Não conformidade</Label>
                  <Textarea
                    value={form.nao_conformidade}
                    placeholder="Descreva o defeito encontrado"
                    onChange={(e) => setForm({ ...form, nao_conformidade: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ação corretiva</Label>
                  <Textarea
                    value={form.acao_corretiva}
                    onChange={(e) => setForm({ ...form, acao_corretiva: e.target.value })}
                  />
                </div>
              </>
            )}
            <div>
              <Label>Observações</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Registrar inspeção"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
