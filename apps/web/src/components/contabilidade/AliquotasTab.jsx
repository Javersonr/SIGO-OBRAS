import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Edit, Trash2, X } from "lucide-react";

/**
 * CRUD de alíquotas tributárias por empresa.
 *
 * A vigência (data_inicio/data_fim) permite versionamento — uma alíquota
 * mudou em 01/07? Cadastre nova com data_inicio='2026-07-01' que o sistema
 * vai pegar a vigente em cada data automaticamente via get_aliquota_vigente().
 *
 * Defaults sugeridos quando o usuário escolhe regime Lucro Presumido:
 *   PIS 0.65, COFINS 3.00, IRPJ 1.2 (15% × 8%), CSLL 1.08 (9% × 12%)
 */

const IMPOSTOS = [
  { v: "PIS", desc: "PIS sobre faturamento" },
  { v: "COFINS", desc: "COFINS sobre faturamento" },
  { v: "IRPJ", desc: "Imposto de Renda PJ" },
  { v: "CSLL", desc: "Contribuição Social sobre Lucro" },
  { v: "ISS", desc: "Imposto Sobre Serviços" },
  { v: "ICMS", desc: "ICMS sobre mercadorias" },
  { v: "IPI", desc: "Imposto Produtos Industrializados" },
  { v: "INSS", desc: "INSS Patronal" },
  { v: "IRRF", desc: "IR Retido na Fonte" },
];

const REGIMES = ["Todos", "Simples Nacional", "Lucro Presumido", "Lucro Real"];

const FORM_EMPTY = {
  imposto: "PIS",
  aliquota: "",
  data_inicio: new Date().toISOString().slice(0, 10),
  data_fim: "",
  regime_aplicavel: "Todos",
  observacoes: "",
};

export default function AliquotasTab({ empresaAtiva }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const data = await sigo.entities.AliquotaImposto.filter({
        empresa_id: empresaAtiva.id,
      });
      setLista(
        (data || []).sort(
          (a, b) =>
            (a.imposto || "").localeCompare(b.imposto || "") ||
            new Date(b.data_inicio || 0) - new Date(a.data_inicio || 0)
        )
      );
    } catch (err) {
      console.error("[AliquotasTab]", err);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const isVigente = (a) => {
    const hoje = new Date().toISOString().slice(0, 10);
    if (a.data_fim && a.data_fim < hoje) return false;
    if (a.data_inicio && a.data_inicio > hoje) return false;
    return true;
  };

  const handleEditar = (a) => {
    setForm({
      imposto: a.imposto,
      aliquota: String(a.aliquota ?? ""),
      data_inicio: a.data_inicio || "",
      data_fim: a.data_fim || "",
      regime_aplicavel: a.regime_aplicavel || "Todos",
      observacoes: a.observacoes || "",
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleCancelar = () => {
    setForm(FORM_EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSalvar = async () => {
    if (!form.aliquota || isNaN(parseFloat(form.aliquota))) {
      alert("Informe uma alíquota válida (ex: 0.65 para 0,65%).");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaAtiva.id,
        imposto: form.imposto,
        aliquota: parseFloat(form.aliquota),
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        regime_aplicavel: form.regime_aplicavel,
        observacoes: form.observacoes || null,
      };
      if (editingId) {
        await sigo.entities.AliquotaImposto.update(editingId, payload);
      } else {
        await sigo.entities.AliquotaImposto.create(payload);
      }
      handleCancelar();
      await carregar();
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (a) => {
    if (!confirm(`Excluir alíquota ${a.imposto} ${a.aliquota}%?`)) return;
    try {
      await sigo.entities.AliquotaImposto.delete(a.id);
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Alíquotas vigentes</h3>
          <p className="text-xs text-slate-500">
            Versionadas por data — sempre use a vigente na data da operação.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nova alíquota
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Imposto *</Label>
                <Select
                  value={form.imposto}
                  onValueChange={(v) => setForm((f) => ({ ...f, imposto: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPOSTOS.map((i) => (
                      <SelectItem key={i.v} value={i.v}>
                        {i.v} — {i.desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alíquota (%) *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Ex: 0.65 (= 0,65%)"
                  value={form.aliquota}
                  onChange={(e) => setForm((f) => ({ ...f, aliquota: e.target.value }))}
                />
              </div>
              <div>
                <Label>Vigência início *</Label>
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))}
                />
              </div>
              <div>
                <Label>Vigência fim (deixe vazio se ainda vigente)</Label>
                <Input
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))}
                />
              </div>
              <div>
                <Label>Regime aplicável</Label>
                <Select
                  value={form.regime_aplicavel}
                  onValueChange={(v) => setForm((f) => ({ ...f, regime_aplicavel: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIMES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observações</Label>
                <Input
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSalvar} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
              </Button>
              <Button variant="outline" onClick={handleCancelar} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imposto</TableHead>
                <TableHead className="text-right">Alíquota</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-6">
                    Nenhuma alíquota cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                lista.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold">{a.imposto}</TableCell>
                    <TableCell className="text-right font-mono">{a.aliquota}%</TableCell>
                    <TableCell className="text-xs">
                      {a.data_inicio || "—"} → {a.data_fim || "vigente"}
                    </TableCell>
                    <TableCell className="text-xs">{a.regime_aplicavel || "Todos"}</TableCell>
                    <TableCell>
                      {isVigente(a) ? (
                        <Badge className="bg-green-100 text-green-700">Vigente</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">Histórica</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEditar(a)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => handleExcluir(a)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
