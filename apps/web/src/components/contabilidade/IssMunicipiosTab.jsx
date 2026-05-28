import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, X, MapPin } from "lucide-react";

const UF_LIST = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const FORM_EMPTY = {
  municipio: "",
  uf: "MG",
  codigo_ibge: "",
  aliquota_iss: "",
  codigo_servico_lc116: "",
  descricao_servico: "",
  retencao_iss_obra: true,
  ativo: true,
  observacoes: "",
};

/**
 * Cadastro de ISS por município. Para construção civil é comum atuar em
 * vários municípios e cada um tem alíquota própria (2% a 5%).
 *
 * O código LC 116/03 mais usado em obras é 7.02 — "Execução de obras de
 * construção civil". Algumas prefeituras tem variações por subitem.
 */
export default function IssMunicipiosTab({ empresaAtiva }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const data = await sigo.entities.IssMunicipio.filter({
        empresa_id: empresaAtiva.id,
      });
      setLista((data || []).sort((a, b) => (a.municipio || "").localeCompare(b.municipio || "")));
    } catch (err) {
      console.error("[IssMunicipiosTab]", err);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleEditar = (m) => {
    setForm({
      municipio: m.municipio || "",
      uf: m.uf || "MG",
      codigo_ibge: m.codigo_ibge || "",
      aliquota_iss: String(m.aliquota_iss ?? ""),
      codigo_servico_lc116: m.codigo_servico_lc116 || "",
      descricao_servico: m.descricao_servico || "",
      retencao_iss_obra: m.retencao_iss_obra !== false,
      ativo: m.ativo !== false,
      observacoes: m.observacoes || "",
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const handleCancelar = () => {
    setForm(FORM_EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSalvar = async () => {
    if (!form.municipio || !form.uf || !form.aliquota_iss) {
      alert("Município, UF e alíquota são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaAtiva.id,
        municipio: form.municipio,
        uf: form.uf,
        codigo_ibge: form.codigo_ibge || null,
        aliquota_iss: parseFloat(form.aliquota_iss),
        codigo_servico_lc116: form.codigo_servico_lc116 || null,
        descricao_servico: form.descricao_servico || null,
        retencao_iss_obra: form.retencao_iss_obra,
        ativo: form.ativo,
        observacoes: form.observacoes || null,
      };
      if (editingId) {
        await sigo.entities.IssMunicipio.update(editingId, payload);
      } else {
        await sigo.entities.IssMunicipio.create(payload);
      }
      handleCancelar();
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (m) => {
    if (!confirm(`Excluir ${m.municipio}/${m.uf}?`)) return;
    try {
      await sigo.entities.IssMunicipio.delete(m.id);
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">
            <MapPin className="w-4 h-4 inline mr-1" />
            ISS por município
          </h3>
          <p className="text-xs text-slate-500">
            Cadastre as cidades onde sua empresa presta serviço. Código LC 116/03 mais comum em
            obra: <code>7.02 — Execução de obras de construção civil</code>.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Novo município
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label>Município *</Label>
                <Input
                  placeholder="Ex: Belo Horizonte"
                  value={form.municipio}
                  onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
                />
              </div>
              <div>
                <Label>UF *</Label>
                <select
                  className="w-full h-10 border rounded px-3 text-sm"
                  value={form.uf}
                  onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))}
                >
                  {UF_LIST.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Código IBGE</Label>
                <Input
                  placeholder="7 dígitos"
                  value={form.codigo_ibge}
                  onChange={(e) => setForm((f) => ({ ...f, codigo_ibge: e.target.value }))}
                />
              </div>
              <div>
                <Label>Alíquota ISS (%) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 3.00"
                  value={form.aliquota_iss}
                  onChange={(e) => setForm((f) => ({ ...f, aliquota_iss: e.target.value }))}
                />
              </div>
              <div>
                <Label>Código LC 116/03</Label>
                <Input
                  placeholder="Ex: 7.02"
                  value={form.codigo_servico_lc116}
                  onChange={(e) => setForm((f) => ({ ...f, codigo_servico_lc116: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-3">
                <Label>Descrição do serviço</Label>
                <Input
                  placeholder="Ex: Execução de obras de construção civil"
                  value={form.descricao_servico}
                  onChange={(e) => setForm((f) => ({ ...f, descricao_servico: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-3 flex gap-6 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.retencao_iss_obra}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, retencao_iss_obra: !!v }))}
                  />
                  Contratante retém ISS na obra
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ativo}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: !!v }))}
                  />
                  Ativo
                </label>
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
                <TableHead>Município</TableHead>
                <TableHead>UF</TableHead>
                <TableHead className="text-right">Alíquota</TableHead>
                <TableHead>LC 116</TableHead>
                <TableHead>Retenção</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-6">
                    Nenhum município cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                lista.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.municipio}</TableCell>
                    <TableCell>{m.uf}</TableCell>
                    <TableCell className="text-right font-mono">{m.aliquota_iss}%</TableCell>
                    <TableCell className="text-xs">{m.codigo_servico_lc116 || "—"}</TableCell>
                    <TableCell>
                      {m.retencao_iss_obra ? (
                        <Badge className="bg-amber-100 text-amber-700">Sim</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.ativo ? (
                        <Badge className="bg-green-100 text-green-700">Ativo</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEditar(m)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => handleExcluir(m)}
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
