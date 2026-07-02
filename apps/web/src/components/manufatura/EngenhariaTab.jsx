import React, { useState } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Edit, Trash2, CheckCircle2, Calculator } from "lucide-react";
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

const STATUS_BADGE = {
  Rascunho: "bg-slate-100 text-slate-700",
  Ativa: "bg-green-100 text-green-700",
  Obsoleta: "bg-red-100 text-red-700",
};

const COMPONENTE_VAZIO = { material_id: "", quantidade: "", perda_pct: "0", operacao_seq: "" };
const OPERACAO_VAZIA = {
  seq: "",
  nome: "",
  centro_trabalho_id: "",
  tempo_setup_min: "0",
  tempo_ciclo_min: "0",
};

export default function EngenhariaTab({ empresaAtiva, materiais, centros, fichas, reloadShared }) {
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fichaAtual, setFichaAtual] = useState(null); // null = nova
  const [cab, setCab] = useState({ material_id: "", quantidade_base: "1", observacoes: "" });
  const [componentes, setComponentes] = useState([{ ...COMPONENTE_VAZIO }]);
  const [operacoes, setOperacoes] = useState([]);

  const fabricaveis = materiais; // qualquer material pode virar fabricado ao ganhar ficha

  const abrirNova = () => {
    setFichaAtual(null);
    setCab({ material_id: "", quantidade_base: "1", observacoes: "" });
    setComponentes([{ ...COMPONENTE_VAZIO }]);
    setOperacoes([]);
    setShowEditor(true);
  };

  const abrirEdicao = async (ficha) => {
    try {
      const [itens, opers] = await Promise.all([
        sigo.entities.FichaTecnicaItem.filter({ ficha_id: ficha.id }),
        sigo.entities.RoteiroOperacao.filter({ ficha_id: ficha.id }, { sort_by: "seq" }),
      ]);
      setFichaAtual(ficha);
      setCab({
        material_id: ficha.material_id,
        quantidade_base: String(ficha.quantidade_base ?? 1),
        observacoes: ficha.observacoes || "",
      });
      setComponentes(
        (itens || []).length > 0
          ? itens.map((i) => ({
              material_id: i.material_id,
              quantidade: String(i.quantidade),
              perda_pct: String(i.perda_pct ?? 0),
              operacao_seq: i.operacao_seq != null ? String(i.operacao_seq) : "",
            }))
          : [{ ...COMPONENTE_VAZIO }]
      );
      setOperacoes(
        (opers || []).map((o) => ({
          seq: String(o.seq),
          nome: o.nome,
          centro_trabalho_id: o.centro_trabalho_id || "",
          tempo_setup_min: String(o.tempo_setup_min ?? 0),
          tempo_ciclo_min: String(o.tempo_ciclo_min ?? 0),
        }))
      );
      setShowEditor(true);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao abrir ficha técnica");
    }
  };

  const salvarFicha = async () => {
    if (!cab.material_id) {
      toast.error("Selecione o produto da ficha");
      return;
    }
    const comps = componentes.filter((c) => c.material_id && Number(c.quantidade) > 0);
    if (comps.length === 0) {
      toast.error("Adicione ao menos 1 componente com quantidade");
      return;
    }
    setSaving(true);
    try {
      const mat = materiais.find((m) => m.id === cab.material_id);
      let fichaId = fichaAtual?.id;

      if (fichaAtual) {
        await sigo.entities.FichaTecnica.update(fichaAtual.id, {
          quantidade_base: Number(cab.quantidade_base) || 1,
          observacoes: cab.observacoes || null,
        });
        // Recria itens e roteiro (edição completa)
        await sigo.entities.FichaTecnicaItem.deleteMany({ ficha_id: fichaAtual.id });
        await sigo.entities.RoteiroOperacao.deleteMany({ ficha_id: fichaAtual.id });
      } else {
        const versoes = fichas.filter((f) => f.material_id === cab.material_id);
        const proxVersao = versoes.length ? Math.max(...versoes.map((f) => f.versao || 1)) + 1 : 1;
        const nova = await sigo.entities.FichaTecnica.create({
          empresa_id: empresaAtiva.id,
          material_id: cab.material_id,
          material_nome: mat?.nome || null,
          versao: proxVersao,
          quantidade_base: Number(cab.quantidade_base) || 1,
          unidade: mat?.unidade || null,
          status: "Rascunho",
          observacoes: cab.observacoes || null,
        });
        fichaId = nova.id;
      }

      await sigo.entities.FichaTecnicaItem.bulkCreate(
        comps.map((c) => {
          const cm = materiais.find((m) => m.id === c.material_id);
          return {
            empresa_id: empresaAtiva.id,
            ficha_id: fichaId,
            material_id: c.material_id,
            material_nome: cm?.nome || null,
            material_codigo: cm?.codigo || null,
            quantidade: Number(c.quantidade),
            unidade: cm?.unidade || null,
            perda_pct: Number(c.perda_pct) || 0,
            operacao_seq: c.operacao_seq !== "" ? Number(c.operacao_seq) : null,
          };
        })
      );

      const opers = operacoes.filter((o) => o.seq !== "" && o.nome);
      if (opers.length > 0) {
        await sigo.entities.RoteiroOperacao.bulkCreate(
          opers.map((o) => {
            const ct = centros.find((c) => c.id === o.centro_trabalho_id);
            return {
              empresa_id: empresaAtiva.id,
              ficha_id: fichaId,
              seq: Number(o.seq),
              nome: o.nome,
              centro_trabalho_id: o.centro_trabalho_id || null,
              centro_trabalho_nome: ct?.nome || null,
              tempo_setup_min: Number(o.tempo_setup_min) || 0,
              tempo_ciclo_min: Number(o.tempo_ciclo_min) || 0,
            };
          })
        );
      }

      toast.success(fichaAtual ? "Ficha atualizada" : "Ficha criada (Rascunho)");
      setShowEditor(false);
      await reloadShared();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao salvar ficha");
    } finally {
      setSaving(false);
    }
  };

  const ativarFicha = async (ficha) => {
    try {
      // Só 1 Ativa por material: obsoleta a anterior
      const ativas = fichas.filter(
        (f) => f.material_id === ficha.material_id && f.status === "Ativa" && f.id !== ficha.id
      );
      for (const a of ativas) {
        await sigo.entities.FichaTecnica.update(a.id, { status: "Obsoleta" });
      }
      await sigo.entities.FichaTecnica.update(ficha.id, { status: "Ativa" });
      // Produto com ficha ativa é fabricado
      await sigo.entities.Material.update(ficha.material_id, { fabricado: true });
      toast.success("Ficha ativada — material marcado como fabricado");
      await reloadShared();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao ativar ficha");
    }
  };

  const excluirFicha = async (ficha) => {
    if (!window.confirm(`Excluir a ficha v${ficha.versao} de ${ficha.material_nome}?`)) return;
    try {
      await sigo.entities.FichaTecnica.delete(ficha.id);
      toast.success("Ficha excluída");
      await reloadShared();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao excluir");
    }
  };

  const recalcularCustos = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("atualizar_custo_padrao", {
        p_empresa_id: empresaAtiva.id,
        p_material_id: null,
      });
      if (error) throw error;
      toast.success(`Custo padrão recalculado para ${data} item(ns) fabricado(s)`);
      await reloadShared();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao recalcular custos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="outline" onClick={recalcularCustos} disabled={saving}>
          <Calculator className="w-4 h-4 mr-1" /> Recalcular custo padrão
        </Button>
        <Button onClick={abrirNova}>
          <Plus className="w-4 h-4 mr-1" /> Nova ficha técnica
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead className="text-center">Versão</TableHead>
              <TableHead className="text-right">Qtd base</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fichas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma ficha técnica — crie a primeira para poder gerar OPs
                </TableCell>
              </TableRow>
            ) : (
              fichas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.material_nome}</TableCell>
                  <TableCell className="text-center">v{f.versao}</TableCell>
                  <TableCell className="text-right">
                    {Number(f.quantidade_base).toLocaleString("pt-BR")} {f.unidade || ""}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[f.status] || ""} variant="secondary">
                      {f.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => abrirEdicao(f)}>
                          <Edit className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        {f.status !== "Ativa" && (
                          <DropdownMenuItem onClick={() => ativarFicha(f)}>
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Ativar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-red-600" onClick={() => excluirFicha(f)}>
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

      {/* Editor de ficha */}
      <Sheet open={showEditor} onOpenChange={setShowEditor}>
        <SheetContent className="overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>
              {fichaAtual
                ? `Editar ficha v${fichaAtual.versao} — ${fichaAtual.material_nome}`
                : "Nova ficha técnica"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5 mt-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Produto *</Label>
                <Select
                  value={cab.material_id}
                  onValueChange={(v) => setCab({ ...cab, material_id: v })}
                  disabled={!!fichaAtual}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Item a ser produzido" />
                  </SelectTrigger>
                  <SelectContent>
                    {fabricaveis.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.codigo ? `${m.codigo} — ` : ""}
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade base (rendimento)</Label>
                <Input
                  type="number"
                  min="0"
                  value={cab.quantidade_base}
                  onChange={(e) => setCab({ ...cab, quantidade_base: e.target.value })}
                />
              </div>
            </div>

            {/* Componentes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Componentes</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setComponentes([...componentes, { ...COMPONENTE_VAZIO }])}
                >
                  <Plus className="w-4 h-4 mr-1" /> Componente
                </Button>
              </div>
              <div className="space-y-2">
                {componentes.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {i === 0 && <Label className="text-xs">Material</Label>}
                      <Select
                        value={c.material_id}
                        onValueChange={(v) => {
                          const arr = [...componentes];
                          arr[i] = { ...arr[i], material_id: v };
                          setComponentes(arr);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Material" />
                        </SelectTrigger>
                        <SelectContent>
                          {materiais
                            .filter((m) => m.id !== cab.material_id)
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.codigo ? `${m.codigo} — ` : ""}
                                {m.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Qtd</Label>}
                      <Input
                        type="number"
                        min="0"
                        value={c.quantidade}
                        onChange={(e) => {
                          const arr = [...componentes];
                          arr[i] = { ...arr[i], quantidade: e.target.value };
                          setComponentes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Perda %</Label>}
                      <Input
                        type="number"
                        min="0"
                        value={c.perda_pct}
                        onChange={(e) => {
                          const arr = [...componentes];
                          arr[i] = { ...arr[i], perda_pct: e.target.value };
                          setComponentes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Op. seq</Label>}
                      <Input
                        type="number"
                        placeholder="—"
                        value={c.operacao_seq}
                        onChange={(e) => {
                          const arr = [...componentes];
                          arr[i] = { ...arr[i], operacao_seq: e.target.value };
                          setComponentes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setComponentes(componentes.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roteiro */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Roteiro de operações</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOperacoes([
                      ...operacoes,
                      { ...OPERACAO_VAZIA, seq: String((operacoes.length + 1) * 10) },
                    ])
                  }
                >
                  <Plus className="w-4 h-4 mr-1" /> Operação
                </Button>
              </div>
              <div className="space-y-2">
                {operacoes.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Sem roteiro — a OP não terá operações nem custo de mão de obra.
                  </p>
                )}
                {operacoes.map((o, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-1">
                      {i === 0 && <Label className="text-xs">Seq</Label>}
                      <Input
                        type="number"
                        value={o.seq}
                        onChange={(e) => {
                          const arr = [...operacoes];
                          arr[i] = { ...arr[i], seq: e.target.value };
                          setOperacoes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      {i === 0 && <Label className="text-xs">Operação</Label>}
                      <Input
                        placeholder="Ex.: Corte"
                        value={o.nome}
                        onChange={(e) => {
                          const arr = [...operacoes];
                          arr[i] = { ...arr[i], nome: e.target.value };
                          setOperacoes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-4">
                      {i === 0 && <Label className="text-xs">Centro de trabalho</Label>}
                      <Select
                        value={o.centro_trabalho_id}
                        onValueChange={(v) => {
                          const arr = [...operacoes];
                          arr[i] = { ...arr[i], centro_trabalho_id: v };
                          setOperacoes(arr);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Centro" />
                        </SelectTrigger>
                        <SelectContent>
                          {centros.map((ct) => (
                            <SelectItem key={ct.id} value={ct.id}>
                              {ct.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
                      {i === 0 && <Label className="text-xs">Setup</Label>}
                      <Input
                        type="number"
                        min="0"
                        value={o.tempo_setup_min}
                        onChange={(e) => {
                          const arr = [...operacoes];
                          arr[i] = { ...arr[i], tempo_setup_min: e.target.value };
                          setOperacoes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Ciclo (min/un)</Label>}
                      <Input
                        type="number"
                        min="0"
                        value={o.tempo_ciclo_min}
                        onChange={(e) => {
                          const arr = [...operacoes];
                          arr[i] = { ...arr[i], tempo_ciclo_min: e.target.value };
                          setOperacoes(arr);
                        }}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOperacoes(operacoes.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Input
                value={cab.observacoes}
                onChange={(e) => setCab({ ...cab, observacoes: e.target.value })}
              />
            </div>

            <Button className="w-full" onClick={salvarFicha} disabled={saving}>
              {saving ? "Salvando…" : fichaAtual ? "Salvar alterações" : "Criar ficha (Rascunho)"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
