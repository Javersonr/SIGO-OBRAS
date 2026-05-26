import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Plus, X } from "lucide-react";

export default function CriarMaterialModal({
  open,
  onOpenChange,
  empresaAtiva,
  nomeInicial = "",
  onMaterialCriado,
}) {
  const [form, setForm] = useState({
    nome: "",
    categoria: "",
    codigo: "",
    ean: "",
    unidade: "UN",
    preco: "",
    estoque: "",
    estoque_minimo: "",
    localizacao: "",
    foto_url: "",
    observacoes: "",
  });
  const [categoriasMaterial, setCategoriasMaterial] = useState([]);
  const [unidadesMedida, setUnidadesMedida] = useState([]);
  const [showNovaCat, setShowNovaCat] = useState(false);
  const [novaCat, setNovaCat] = useState("");
  const [showNovaUnidade, setShowNovaUnidade] = useState(false);
  const [novaUnidade, setNovaUnidade] = useState({ sigla: "", nome: "" });
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && empresaAtiva?.id) {
      setForm((prev) => ({ ...prev, nome: nomeInicial }));
      loadCategorias();
    }
  }, [open, empresaAtiva?.id, nomeInicial]);

  const loadCategorias = async () => {
    const [cats, unidades] = await Promise.all([
      sigo.entities.CategoriaMaterial.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      sigo.entities.UnidadeMedida.filter({ empresa_id: empresaAtiva.id, ativo: true }),
    ]);
    setCategoriasMaterial(cats);
    setUnidadesMedida(unidades);
  };

  const handleSave = async () => {
    if (!form.nome) return;
    setSaving(true);
    try {
      // Buscar todos os materiais para gerar código automático
      let codigoFinal = form.codigo;
      if (!codigoFinal) {
        const todos = await sigo.entities.Material.filter({
          empresa_id: empresaAtiva.id,
          ativo: true,
        });
        const codigosNumericos = todos
          .map((m) => m.codigo || "")
          .filter((c) => /^\d+$/.test(c.trim()))
          .map((c) => parseInt(c.trim(), 10) || 0);
        const ultimoCodigo = codigosNumericos.length > 0 ? Math.max(...codigosNumericos) : 0;
        codigoFinal = (ultimoCodigo + 1).toString().padStart(6, "0");
      }

      const novoMat = await sigo.entities.Material.create({
        empresa_id: empresaAtiva.id,
        nome: form.nome,
        categoria: form.categoria || undefined,
        codigo: codigoFinal,
        ean: form.ean || undefined,
        unidade: form.unidade,
        preco: parseFloat(form.preco) || 0,
        estoque: parseFloat(form.estoque) || 0,
        estoque_minimo: parseFloat(form.estoque_minimo) || 0,
        localizacao: form.localizacao || undefined,
        foto_url: form.foto_url || undefined,
        observacoes: form.observacoes || undefined,
        ativo: true,
      });

      if (onMaterialCriado) onMaterialCriado(novoMat);
      onOpenChange(false);
      setForm({
        nome: "",
        categoria: "",
        codigo: "",
        ean: "",
        unidade: "UN",
        preco: "",
        estoque: "",
        estoque_minimo: "",
        localizacao: "",
        foto_url: "",
        observacoes: "",
      });
    } catch (error) {
      console.error("Erro ao criar material:", error);
      alert("Erro ao criar material: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(true);
    try {
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      setForm((prev) => ({ ...prev, foto_url: file_url }));
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleCriarCategoria = async () => {
    if (!novaCat.trim()) return;
    await sigo.entities.CategoriaMaterial.create({
      empresa_id: empresaAtiva.id,
      nome: novaCat,
      ativo: true,
    });
    setNovaCat("");
    setShowNovaCat(false);
    loadCategorias();
  };

  const handleCriarUnidade = async () => {
    if (!novaUnidade.sigla || !novaUnidade.nome) return;
    await sigo.entities.UnidadeMedida.create({
      empresa_id: empresaAtiva.id,
      sigla: novaUnidade.sigla,
      nome: novaUnidade.nome,
      ativo: true,
    });
    setNovaUnidade({ sigla: "", nome: "" });
    setShowNovaUnidade(false);
    loadCategorias();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <SheetHeader className="p-6 border-b flex-shrink-0">
          <SheetTitle>Novo Material</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Foto */}
          <div>
            <Label>Foto do Material</Label>
            <div className="mt-2 flex items-start gap-4">
              {form.foto_url ? (
                <div className="relative">
                  <img
                    src={form.foto_url}
                    alt="Material"
                    className="w-32 h-32 object-cover rounded-lg border"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full"
                    onClick={() => setForm((prev) => ({ ...prev, foto_url: "" }))}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-amber-400 transition-colors">
                  <div className="text-center">
                    <Plus className="w-6 h-6 mx-auto text-slate-400" />
                    <span className="text-xs text-slate-500 mt-1 block">Adicionar foto</span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleUploadFoto}
                    disabled={uploadingFoto}
                  />
                </label>
              )}
              {uploadingFoto && <p className="text-sm text-slate-500">Enviando...</p>}
            </div>
          </div>

          <div>
            <Label>Nome *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Cimento Portland CP-II saco 50kg"
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <div className="flex gap-2 mt-1.5">
                <Select
                  value={form.categoria || ""}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, categoria: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasMaterial.map((c) => (
                      <SelectItem key={c.id} value={c.nome}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNovaCat(!showNovaCat)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {showNovaCat && (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Nova categoria"
                    value={novaCat}
                    onChange={(e) => setNovaCat(e.target.value)}
                  />
                  <Button size="sm" onClick={handleCriarCategoria}>
                    Criar
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label>Unidade</Label>
              <div className="flex gap-2 mt-1.5">
                <Select
                  value={form.unidade}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, unidade: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">Unidade</SelectItem>
                    <SelectItem value="PC">Peça</SelectItem>
                    <SelectItem value="KG">Quilograma</SelectItem>
                    <SelectItem value="M">Metro</SelectItem>
                    <SelectItem value="M2">Metro²</SelectItem>
                    <SelectItem value="M3">Metro³</SelectItem>
                    <SelectItem value="L">Litro</SelectItem>
                    <SelectItem value="CX">Caixa</SelectItem>
                    <SelectItem value="SC">Saco</SelectItem>
                    {unidadesMedida.map((u) => (
                      <SelectItem key={u.id} value={u.sigla}>
                        {u.sigla} - {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNovaUnidade(!showNovaUnidade)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {showNovaUnidade && (
                <div className="space-y-2 mt-2 p-3 border rounded-lg">
                  <Input
                    placeholder="Sigla (ex: TON)"
                    value={novaUnidade.sigla}
                    onChange={(e) =>
                      setNovaUnidade({ ...novaUnidade, sigla: e.target.value.toUpperCase() })
                    }
                    maxLength={5}
                  />
                  <Input
                    placeholder="Nome completo (ex: Tonelada)"
                    value={novaUnidade.nome}
                    onChange={(e) => setNovaUnidade({ ...novaUnidade, nome: e.target.value })}
                  />
                  <Button size="sm" onClick={handleCriarUnidade} className="w-full">
                    Criar
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Código Interno</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm((prev) => ({ ...prev, codigo: e.target.value }))}
                placeholder="Código interno"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-500 mt-1">
                Gerado automaticamente se deixado em branco
              </p>
            </div>
            <div>
              <Label>Código EAN</Label>
              <Input
                value={form.ean}
                onChange={(e) => setForm((prev) => ({ ...prev, ean: e.target.value }))}
                placeholder="Código de barras"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Preço Referência (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.preco}
                onChange={(e) => setForm((prev) => ({ ...prev, preco: e.target.value }))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Estoque Atual</Label>
              <Input
                type="number"
                value={form.estoque}
                onChange={(e) => setForm((prev) => ({ ...prev, estoque: e.target.value }))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Estoque Mínimo</Label>
              <Input
                type="number"
                value={form.estoque_minimo}
                onChange={(e) => setForm((prev) => ({ ...prev, estoque_minimo: e.target.value }))}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Localização</Label>
            <Input
              value={form.localizacao}
              onChange={(e) => setForm((prev) => ({ ...prev, localizacao: e.target.value }))}
              placeholder="Ex: Almoxarifado A - Prateleira 3"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.nome || saving}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? "Salvando..." : "Salvar Material"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
