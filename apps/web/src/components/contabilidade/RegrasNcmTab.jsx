import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, X, Package } from "lucide-react";

const FORM_EMPTY = {
  ncm: "",
  descricao: "",
  cfop_padrao_entrada: "",
  cfop_padrao_saida: "",
  cst_icms: "",
  cst_ipi: "",
  aliquota_icms: "",
  aliquota_icms_st: "",
  reducao_base_calculo: "",
  aliquota_ipi: "",
  conta_contabil_sugerida: "",
  centro_custo_sugerido: "",
  observacoes: "",
};

/**
 * Cadastro de regras de imposto por NCM (8 dígitos).
 *
 * Quando uma NFe entra com um NCM cadastrado aqui, o sistema preenche
 * automaticamente CFOP, CST, alíquota ICMS/IPI e sugere conta contábil.
 *
 * Exemplos comuns em construção civil:
 *   2523.29.10 — Cimento Portland comum (ICMS varia por UF)
 *   3214.10.20 — Massa corrida
 *   7214.20.00 — Vergalhão CA-50
 *   2517.10.00 — Brita
 */
export default function RegrasNcmTab({ empresaAtiva }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const data = await sigo.entities.RegraImpostoNcm.filter({
        empresa_id: empresaAtiva.id,
      });
      setLista((data || []).sort((a, b) => (a.ncm || "").localeCompare(b.ncm || "")));
    } catch (err) {
      console.error("[RegrasNcmTab]", err);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleEditar = (r) => {
    setForm({
      ncm: r.ncm || "",
      descricao: r.descricao || "",
      cfop_padrao_entrada: r.cfop_padrao_entrada || "",
      cfop_padrao_saida: r.cfop_padrao_saida || "",
      cst_icms: r.cst_icms || "",
      cst_ipi: r.cst_ipi || "",
      aliquota_icms: String(r.aliquota_icms ?? ""),
      aliquota_icms_st: String(r.aliquota_icms_st ?? ""),
      reducao_base_calculo: String(r.reducao_base_calculo ?? ""),
      aliquota_ipi: String(r.aliquota_ipi ?? ""),
      conta_contabil_sugerida: r.conta_contabil_sugerida || "",
      centro_custo_sugerido: r.centro_custo_sugerido || "",
      observacoes: r.observacoes || "",
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleCancelar = () => {
    setForm(FORM_EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSalvar = async () => {
    if (!form.ncm) {
      alert("NCM é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const num = (v) => (v === "" || v == null ? null : parseFloat(v));
      const payload = {
        empresa_id: empresaAtiva.id,
        ncm: form.ncm,
        descricao: form.descricao || null,
        cfop_padrao_entrada: form.cfop_padrao_entrada || null,
        cfop_padrao_saida: form.cfop_padrao_saida || null,
        cst_icms: form.cst_icms || null,
        cst_ipi: form.cst_ipi || null,
        aliquota_icms: num(form.aliquota_icms),
        aliquota_icms_st: num(form.aliquota_icms_st),
        reducao_base_calculo: num(form.reducao_base_calculo),
        aliquota_ipi: num(form.aliquota_ipi),
        conta_contabil_sugerida: form.conta_contabil_sugerida || null,
        centro_custo_sugerido: form.centro_custo_sugerido || null,
        observacoes: form.observacoes || null,
      };
      if (editingId) {
        await sigo.entities.RegraImpostoNcm.update(editingId, payload);
      } else {
        await sigo.entities.RegraImpostoNcm.create(payload);
      }
      handleCancelar();
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (r) => {
    if (!confirm(`Excluir regra NCM ${r.ncm}?`)) return;
    try {
      await sigo.entities.RegraImpostoNcm.delete(r.id);
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    }
  };

  const filtrada = busca
    ? lista.filter(
        (r) => r.ncm?.includes(busca) || r.descricao?.toLowerCase().includes(busca.toLowerCase())
      )
    : lista;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">
            <Package className="w-4 h-4 inline mr-1" />
            Regras por NCM
          </h3>
          <p className="text-xs text-slate-500">
            Quando uma NFe vem com NCM cadastrado aqui, sistema preenche CFOP/CST e alíquotas.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Buscar NCM ou descrição"
            className="w-[200px]"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nova regra
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>NCM *</Label>
                <Input
                  placeholder="8 dígitos (ex: 25232910)"
                  value={form.ncm}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ncm: e.target.value.replace(/\D/g, "") }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Input
                  placeholder="Ex: Cimento Portland comum"
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                />
              </div>
              <div>
                <Label>CFOP Entrada</Label>
                <Input
                  placeholder="Ex: 1102"
                  value={form.cfop_padrao_entrada}
                  onChange={(e) => setForm((f) => ({ ...f, cfop_padrao_entrada: e.target.value }))}
                />
              </div>
              <div>
                <Label>CFOP Saída</Label>
                <Input
                  placeholder="Ex: 5102"
                  value={form.cfop_padrao_saida}
                  onChange={(e) => setForm((f) => ({ ...f, cfop_padrao_saida: e.target.value }))}
                />
              </div>
              <div>
                <Label>CST ICMS</Label>
                <Input
                  placeholder="Ex: 00, 10, 60"
                  value={form.cst_icms}
                  onChange={(e) => setForm((f) => ({ ...f, cst_icms: e.target.value }))}
                />
              </div>
              <div>
                <Label>Alíquota ICMS (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.aliquota_icms}
                  onChange={(e) => setForm((f) => ({ ...f, aliquota_icms: e.target.value }))}
                />
              </div>
              <div>
                <Label>Alíquota ICMS-ST (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.aliquota_icms_st}
                  onChange={(e) => setForm((f) => ({ ...f, aliquota_icms_st: e.target.value }))}
                />
              </div>
              <div>
                <Label>Redução BC (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.reducao_base_calculo}
                  onChange={(e) => setForm((f) => ({ ...f, reducao_base_calculo: e.target.value }))}
                />
              </div>
              <div>
                <Label>CST IPI</Label>
                <Input
                  placeholder="Ex: 00, 50, 99"
                  value={form.cst_ipi}
                  onChange={(e) => setForm((f) => ({ ...f, cst_ipi: e.target.value }))}
                />
              </div>
              <div>
                <Label>Alíquota IPI (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.aliquota_ipi}
                  onChange={(e) => setForm((f) => ({ ...f, aliquota_ipi: e.target.value }))}
                />
              </div>
              <div>
                <Label>Conta contábil sugerida</Label>
                <Input
                  placeholder="Ex: 3.1.01.001 - Material de Construção"
                  value={form.conta_contabil_sugerida}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conta_contabil_sugerida: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Centro de custo sugerido</Label>
                <Input
                  value={form.centro_custo_sugerido}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, centro_custo_sugerido: e.target.value }))
                  }
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
                <TableHead>NCM</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>CFOP E/S</TableHead>
                <TableHead>CST ICMS</TableHead>
                <TableHead className="text-right">ICMS %</TableHead>
                <TableHead className="text-right">IPI %</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrada.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500 py-6">
                    Nenhuma regra NCM cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtrada.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.ncm}</TableCell>
                    <TableCell>{r.descricao || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.cfop_padrao_entrada || "—"} / {r.cfop_padrao_saida || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.cst_icms || "—"}</TableCell>
                    <TableCell className="text-right">{r.aliquota_icms ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.aliquota_ipi ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.conta_contabil_sugerida || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEditar(r)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => handleExcluir(r)}
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
