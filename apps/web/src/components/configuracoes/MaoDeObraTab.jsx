import React, { useState, useRef } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash2, Search, Eye, FileText, MoreVertical, DollarSign } from "lucide-react";

export default function MaoDeObraTab({
  empresaAtiva,
  maoDeObra,
  categoriasMaoDeObra,
  unidadesMedida,
  loadData,
  handleImportarMaoObra,
  handleExportarMaoObraExcel,
  handleExportarMaoObraPDF,
  handleBaixarModeloMaoObra,
  handleLimparTodosMaoDeObra,
  handleDeletarSelecionadosMaoDeObra,
  setShowVisualizarCatalog,
  setCatalogItemId,
  setCatalogItemTipo,
  setShowPrecoUSModal,
  setSelectedMaoObraUS,
  setPrecoUSForm,
}) {
  const [showMaoDeObraModal, setShowMaoDeObraModal] = useState(false);
  const [selectedMaoDeObra, setSelectedMaoDeObra] = useState(null);
  const [maoDeObraForm, setMaoDeObraForm] = useState({
    nome: "",
    descricao: "",
    categoria: "",
    unidade: "H",
    codigo: "",
    valor_us_global: "",
    raior_us: "1",
    preco_referencia: "",
    observacoes: "",
    ativo: true,
  });
  const [selectedMaoDeObraIds, setSelectedMaoDeObraIds] = useState([]);
  const [maoObraPage, setMaoObraPage] = useState(1);
  const [buscaMaoObra, setBuscaMaoObra] = useState("");
  const [filtroCategoriaMaoObra, setFiltroCategoriaMaoObra] = useState("");
  const [showNovaCatMaoObra, setShowNovaCatMaoObra] = useState(false);
  const [novaCatMaoObra, setNovaCatMaoObra] = useState("");
  const fileInputMaoObraRef = useRef(null);

  const handleSaveMaoDeObra = async () => {
    if (!maoDeObraForm.nome) return;
    try {
      const data = {
        ...maoDeObraForm,
        valor_us_global: parseFloat(maoDeObraForm.valor_us_global) || 0,
        raior_us: parseFloat(maoDeObraForm.raior_us) || 1,
        preco_referencia:
          (parseFloat(maoDeObraForm.valor_us_global) || 0) *
          (parseFloat(maoDeObraForm.raior_us) || 1),
      };
      if (selectedMaoDeObra) {
        await sigo.entities.MaoDeObra.update(selectedMaoDeObra.id, data);
      } else {
        await sigo.entities.MaoDeObra.create({ empresa_id: empresaAtiva.id, ...data });
      }
      setShowMaoDeObraModal(false);
      setMaoDeObraForm({
        nome: "",
        descricao: "",
        categoria: "",
        unidade: "H",
        codigo: "",
        valor_us_global: "",
        raior_us: "1",
        preco_referencia: "",
        observacoes: "",
        ativo: true,
      });
      setSelectedMaoDeObra(null);
      loadData();
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const handleDeleteMaoDeObra = async (m) => {
    if (!confirm("Desativar?")) return;
    await sigo.entities.MaoDeObra.update(m.id, { ativo: false });
    loadData();
  };

  const handleCriarCategoriaMaoObra = async () => {
    if (!novaCatMaoObra.trim()) return;
    await sigo.entities.CategoriaMaoDeObra.create({
      empresa_id: empresaAtiva.id,
      nome: novaCatMaoObra,
      ativo: true,
    });
    setNovaCatMaoObra("");
    setShowNovaCatMaoObra(false);
    loadData();
  };

  const filteredMao = maoDeObra.filter((m) => {
    const matchBusca =
      !buscaMaoObra ||
      m.nome?.toLowerCase().includes(buscaMaoObra.toLowerCase()) ||
      m.codigo?.toLowerCase().includes(buscaMaoObra.toLowerCase());
    const matchCat = !filtroCategoriaMaoObra || m.categoria === filtroCategoriaMaoObra;
    return matchBusca && matchCat;
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle>Mão de Obra</CardTitle>
            <div className="flex gap-2">
              {selectedMaoDeObraIds.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDeletarSelecionadosMaoDeObra(selectedMaoDeObraIds);
                    setSelectedMaoDeObraIds([]);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Apagar {selectedMaoDeObraIds.length}
                </Button>
              )}
              <input
                ref={fileInputMaoObraRef}
                type="file"
                className="hidden"
                accept=".csv"
                onChange={handleImportarMaoObra}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Ações
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleExportarMaoObraExcel}>
                    <FileText className="w-4 h-4 mr-2" />
                    Exportar em Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportarMaoObraPDF}>
                    <FileText className="w-4 h-4 mr-2" />
                    Exportar em PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBaixarModeloMaoObra}>
                    <FileText className="w-4 h-4 mr-2" />
                    Modelo de Importação
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputMaoObraRef.current?.click()}>
                    <FileText className="w-4 h-4 mr-2" />
                    Importar Mão de Obra
                  </DropdownMenuItem>
                  {selectedMaoDeObraIds.length > 0 && (
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedMaoObraUS({ ids: selectedMaoDeObraIds });
                        setPrecoUSForm({ valor_us_global: "" });
                        setShowPrecoUSModal(true);
                      }}
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      Valor de US
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLimparTodosMaoDeObra} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Todos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => {
                  setSelectedMaoDeObra(null);
                  setMaoDeObraForm({
                    nome: "",
                    descricao: "",
                    categoria: "",
                    unidade: "H",
                    codigo: "",
                    valor_us_global: "",
                    raior_us: "1",
                    preco_referencia: "",
                    observacoes: "",
                    ativo: true,
                  });
                  setShowMaoDeObraModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Nova Mão de Obra
              </Button>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={buscaMaoObra}
                onChange={(e) => setBuscaMaoObra(e.target.value)}
                placeholder="Buscar..."
                className="pl-10"
              />
            </div>
            <Select value={filtroCategoriaMaoObra} onValueChange={setFiltroCategoriaMaoObra}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Todas as categorias</SelectItem>
                {categoriasMaoDeObra.map((c) => (
                  <SelectItem key={c.id} value={c.nome}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        selectedMaoDeObraIds.length === maoDeObra.length && maoDeObra.length > 0
                      }
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedMaoDeObraIds(maoDeObra.map((m) => m.id));
                        else setSelectedMaoDeObraIds([]);
                      }}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Preço Ref.</TableHead>
                  <TableHead>Fator US</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMao.slice((maoObraPage - 1) * 50, maoObraPage * 50).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedMaoDeObraIds.includes(m.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedMaoDeObraIds([...selectedMaoDeObraIds, m.id]);
                          else
                            setSelectedMaoDeObraIds(
                              selectedMaoDeObraIds.filter((id) => id !== m.id)
                            );
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{m.nome}</TableCell>
                    <TableCell>{m.categoria || "-"}</TableCell>
                    <TableCell>{m.unidade}</TableCell>
                    <TableCell>{m.codigo || "-"}</TableCell>
                    <TableCell>R$ {(m.preco_referencia || 0).toFixed(2)}</TableCell>
                    <TableCell>{(m.raior_us || 1).toFixed(2)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setCatalogItemId(m.id);
                              setCatalogItemTipo("maodeobra");
                              setShowVisualizarCatalog(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMaoDeObra(m);
                              setMaoDeObraForm(m);
                              setShowMaoDeObraModal(true);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMaoObraUS(m);
                              setPrecoUSForm({
                                valor_us_global: m.valor_us_global?.toString() || "",
                              });
                              setShowPrecoUSModal(true);
                            }}
                          >
                            <DollarSign className="w-4 h-4 mr-2" />
                            Preço de US
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteMaoDeObra(m)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredMao.length > 50 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <p className="text-sm">
                Mostrando {(maoObraPage - 1) * 50 + 1} a{" "}
                {Math.min(maoObraPage * 50, filteredMao.length)} de {filteredMao.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={maoObraPage === 1}
                  onClick={() => setMaoObraPage(maoObraPage - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={maoObraPage * 50 >= filteredMao.length}
                  onClick={() => setMaoObraPage(maoObraPage + 1)}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Mão de Obra */}
      <Sheet open={showMaoDeObraModal} onOpenChange={setShowMaoDeObraModal}>
        <SheetContent side="right" className="h-full overflow-y-auto p-0 flex flex-col">
          <SheetHeader>
            <SheetTitle>{selectedMaoDeObra ? "Editar Serviço" : "Novo Serviço"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4 px-6 flex-1">
            <div>
              <Label>Nome *</Label>
              <Input
                value={maoDeObraForm.nome || ""}
                onChange={(e) => setMaoDeObraForm({ ...maoDeObraForm, nome: e.target.value })}
                placeholder="Ex: Instalação de Piso"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={maoDeObraForm.descricao || ""}
                onChange={(e) => setMaoDeObraForm({ ...maoDeObraForm, descricao: e.target.value })}
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select
                    value={maoDeObraForm.categoria || ""}
                    onValueChange={(v) => setMaoDeObraForm({ ...maoDeObraForm, categoria: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasMaoDeObra.map((c) => (
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
                    onClick={() => setShowNovaCatMaoObra(!showNovaCatMaoObra)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {showNovaCatMaoObra && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Nova categoria"
                      value={novaCatMaoObra}
                      onChange={(e) => setNovaCatMaoObra(e.target.value)}
                    />
                    <Button size="sm" onClick={handleCriarCategoriaMaoObra}>
                      Criar
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <Label>Unidade</Label>
                <Select
                  value={maoDeObraForm.unidade}
                  onValueChange={(v) => setMaoDeObraForm({ ...maoDeObraForm, unidade: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H">Hora</SelectItem>
                    <SelectItem value="D">Dia</SelectItem>
                    <SelectItem value="M">Mês</SelectItem>
                    <SelectItem value="UN">Unidade</SelectItem>
                    {unidadesMedida?.map((u) => (
                      <SelectItem key={u.id} value={u.sigla}>
                        {u.sigla} - {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Código Interno</Label>
              <Input
                value={maoDeObraForm.codigo || ""}
                onChange={(e) => setMaoDeObraForm({ ...maoDeObraForm, codigo: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor US$</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={maoDeObraForm.valor_us_global || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const r = parseFloat(maoDeObraForm.raior_us) || 1;
                    setMaoDeObraForm({
                      ...maoDeObraForm,
                      valor_us_global: v,
                      preco_referencia: (parseFloat(v) || 0) * r,
                    });
                  }}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Fator US</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={maoDeObraForm.raior_us || "1"}
                  onChange={(e) => {
                    const r = e.target.value;
                    const v = parseFloat(maoDeObraForm.valor_us_global) || 0;
                    setMaoDeObraForm({
                      ...maoDeObraForm,
                      raior_us: r,
                      preco_referencia: v * (parseFloat(r) || 1),
                    });
                  }}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={maoDeObraForm.observacoes || ""}
                onChange={(e) =>
                  setMaoDeObraForm({ ...maoDeObraForm, observacoes: e.target.value })
                }
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t">
            <Button variant="outline" onClick={() => setShowMaoDeObraModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMaoDeObra} className="bg-violet-600 hover:bg-violet-700">
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
