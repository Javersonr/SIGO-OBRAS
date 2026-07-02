import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtMoeda = (v) =>
  v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FORM_VAZIO = {
  codigo: "",
  nome: "",
  tipo: "Maquina",
  custo_hora: "",
  capacidade_hora_dia: "",
  descricao: "",
};

export default function CentrosTab({ empresaAtiva, centros, reloadShared }) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);

  const abrir = (centro = null) => {
    setSelecionado(centro);
    setForm(
      centro
        ? {
            codigo: centro.codigo || "",
            nome: centro.nome || "",
            tipo: centro.tipo || "Maquina",
            custo_hora: String(centro.custo_hora ?? ""),
            capacidade_hora_dia: String(centro.capacidade_hora_dia ?? ""),
            descricao: centro.descricao || "",
          }
        : FORM_VAZIO
    );
    setShowModal(true);
  };

  const salvar = async () => {
    if (!form.nome) {
      toast.error("Informe o nome do centro de trabalho");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaAtiva.id,
        codigo: form.codigo || null,
        nome: form.nome,
        tipo: form.tipo,
        custo_hora: Number(form.custo_hora) || 0,
        capacidade_hora_dia: form.capacidade_hora_dia ? Number(form.capacidade_hora_dia) : null,
        descricao: form.descricao || null,
      };
      if (selecionado) {
        await sigo.entities.CentroTrabalho.update(selecionado.id, payload);
      } else {
        await sigo.entities.CentroTrabalho.create(payload);
      }
      toast.success(selecionado ? "Centro atualizado" : "Centro criado");
      setShowModal(false);
      await reloadShared();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao salvar centro");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (centro) => {
    if (!window.confirm(`Excluir o centro "${centro.nome}"?`)) return;
    try {
      await sigo.entities.CentroTrabalho.delete(centro.id);
      toast.success("Centro excluído");
      await reloadShared();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao excluir");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => abrir()}>
          <Plus className="w-4 h-4 mr-1" /> Novo centro
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Custo/hora</TableHead>
              <TableHead className="text-right">Capacidade (h/dia)</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum centro de trabalho — cadastre máquinas/células para o roteiro e o custeio
                </TableCell>
              </TableRow>
            ) : (
              centros.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.codigo || "-"}</TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{fmtMoeda(c.custo_hora)}</TableCell>
                  <TableCell className="text-right">
                    {c.capacidade_hora_dia != null ? Number(c.capacidade_hora_dia) : "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => abrir(c)}>
                          <Edit className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => excluir(c)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selecionado ? "Editar centro" : "Novo centro de trabalho"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Código</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={form.nome}
                  placeholder="Ex.: Serra CNC 01, Célula de Montagem"
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Maquina">Máquina</SelectItem>
                  <SelectItem value="Celula">Célula</SelectItem>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="Externo">Externo (terceiro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Custo por hora (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.custo_hora}
                  onChange={(e) => setForm({ ...form, custo_hora: e.target.value })}
                />
              </div>
              <div>
                <Label>Capacidade (h/dia)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.capacidade_hora_dia}
                  onChange={(e) => setForm({ ...form, capacidade_hora_dia: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
