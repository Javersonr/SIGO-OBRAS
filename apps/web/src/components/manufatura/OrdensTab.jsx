import React, { useState, useEffect, useCallback } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Eye,
  AlertTriangle,
} from "lucide-react";
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
  Planejada: "bg-slate-100 text-slate-700",
  Liberada: "bg-blue-100 text-blue-700",
  EmProducao: "bg-amber-100 text-amber-700",
  Concluida: "bg-green-100 text-green-700",
  Cancelada: "bg-red-100 text-red-700",
};

const fmtQtd = (v) => (v == null ? "-" : Number(v).toLocaleString("pt-BR"));
const fmtMoeda = (v) =>
  v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "-");

const gerarNumero = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `OP-${ymd}-${String(Date.now()).slice(-4)}`;
};

const FORM_VAZIO = {
  material_id: "",
  quantidade: "",
  almoxarifado_wip_id: "",
  almoxarifado_destino_id: "",
  data_prevista_inicio: "",
  data_prevista_fim: "",
  observacoes: "",
};

export default function OrdensTab({ empresaAtiva, user, materiais, almoxarifados }) {
  const [ordens, setOrdens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todas");

  const [showNova, setShowNova] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const [showConcluir, setShowConcluir] = useState(false);
  const [opConcluir, setOpConcluir] = useState(null);
  const [qtdBoa, setQtdBoa] = useState("");
  const [qtdRefugo, setQtdRefugo] = useState("0");

  const [showDetalhe, setShowDetalhe] = useState(false);
  const [detalhe, setDetalhe] = useState(null); // { op, itens, operacoes }

  const fabricados = materiais.filter((m) => m.fabricado);

  const loadOrdens = useCallback(async () => {
    if (!empresaAtiva?.id || !supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vw_producao_resumo")
        .select("*")
        .eq("empresa_id", empresaAtiva.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      setOrdens(data || []);
    } catch (e) {
      console.error("[OrdensTab] erro:", e);
      toast.error("Erro ao carregar ordens de produção");
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadOrdens();
  }, [loadOrdens]);

  const handleCriar = async () => {
    if (!form.material_id || !form.quantidade || Number(form.quantidade) <= 0) {
      toast.error("Informe o produto e uma quantidade válida");
      return;
    }
    setSaving(true);
    try {
      const mat = materiais.find((m) => m.id === form.material_id);
      await sigo.entities.OrdemProducao.create({
        empresa_id: empresaAtiva.id,
        numero: gerarNumero(),
        material_id: form.material_id,
        material_nome: mat?.nome || null,
        quantidade: Number(form.quantidade),
        almoxarifado_wip_id: form.almoxarifado_wip_id || null,
        almoxarifado_destino_id: form.almoxarifado_destino_id || null,
        data_prevista_inicio: form.data_prevista_inicio || null,
        data_prevista_fim: form.data_prevista_fim || null,
        status: "Planejada",
        origem: "Manual",
        observacoes: form.observacoes || null,
      });
      toast.success("Ordem de produção criada");
      setShowNova(false);
      setForm(FORM_VAZIO);
      await loadOrdens();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao criar OP");
    } finally {
      setSaving(false);
    }
  };

  const handleLiberar = async (op) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("liberar_ordem_producao", { p_op_id: op.id });
      if (error) throw error;
      toast.success(`OP ${op.numero || ""} liberada — matéria-prima reservada`);
      await loadOrdens();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao liberar OP");
    } finally {
      setSaving(false);
    }
  };

  const handleConcluir = async () => {
    if (!opConcluir || !qtdBoa || Number(qtdBoa) <= 0) {
      toast.error("Informe a quantidade boa produzida");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("concluir_ordem_producao", {
        p_op_id: opConcluir.id,
        p_quantidade_boa: Number(qtdBoa),
        p_quantidade_refugo: Number(qtdRefugo) || 0,
        p_usuario_nome: user?.full_name || user?.email || null,
      });
      if (error) throw error;
      toast.success(`OP concluída — custo unitário ${fmtMoeda(data)}`);
      setShowConcluir(false);
      setOpConcluir(null);
      await loadOrdens();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao concluir OP");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelar = async (op) => {
    if (!window.confirm(`Cancelar a OP ${op.numero || ""}?`)) return;
    try {
      // Cancela reservas ativas vinculadas (trigger devolve o saldo)
      const reservas = await sigo.entities.ReservaMaterial.filter({
        empresa_id: empresaAtiva.id,
        ordem_producao_id: op.id,
        status: "Ativa",
      });
      for (const r of reservas) {
        await sigo.entities.ReservaMaterial.update(r.id, { status: "Cancelada" });
      }
      await sigo.entities.OrdemProducao.update(op.id, { status: "Cancelada" });
      toast.success("OP cancelada e reservas liberadas");
      await loadOrdens();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao cancelar OP");
    }
  };

  const handleVerDetalhe = async (op) => {
    try {
      const [opFull, itens, operacoes] = await Promise.all([
        sigo.entities.OrdemProducao.get(op.id),
        sigo.entities.OrdemProducaoItem.filter({ ordem_producao_id: op.id }),
        sigo.entities.OrdemProducaoOperacao.filter(
          { ordem_producao_id: op.id },
          { sort_by: "seq" }
        ),
      ]);
      setDetalhe({ op: opFull || op, itens: itens || [], operacoes: operacoes || [] });
      setShowDetalhe(true);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar detalhes da OP");
    }
  };

  const ordensFiltradas =
    filtroStatus === "todas" ? ordens : ordens.filter((o) => o.status === filtroStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="Planejada">Planejadas</SelectItem>
            <SelectItem value="Liberada">Liberadas</SelectItem>
            <SelectItem value="EmProducao">Em produção</SelectItem>
            <SelectItem value="Concluida">Concluídas</SelectItem>
            <SelectItem value="Cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowNova(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova OP
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Produzida</TableHead>
              <TableHead>Progresso</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : ordensFiltradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhuma ordem de produção
                </TableCell>
              </TableRow>
            ) : (
              ordensFiltradas.map((op) => (
                <TableRow key={op.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {op.numero || op.id.slice(0, 8)}
                    {op.atrasada && (
                      <AlertTriangle
                        className="w-4 h-4 text-red-500 inline ml-1"
                        title="Atrasada"
                      />
                    )}
                  </TableCell>
                  <TableCell>{op.material_nome}</TableCell>
                  <TableCell className="text-right">{fmtQtd(op.quantidade)}</TableCell>
                  <TableCell className="text-right">{fmtQtd(op.quantidade_produzida)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[90px]">
                      <div className="h-2 flex-1 bg-slate-200 rounded">
                        <div
                          className="h-2 bg-primary rounded"
                          style={{ width: `${op.progresso_pct || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {op.progresso_pct || 0}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmtData(op.data_prevista_inicio)}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[op.status] || ""} variant="secondary">
                      {op.status === "EmProducao" ? "Em produção" : op.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {op.status === "Concluida" ? fmtMoeda(op.custo_total) : "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleVerDetalhe(op)}>
                          <Eye className="w-4 h-4 mr-2" /> Detalhes
                        </DropdownMenuItem>
                        {op.status === "Planejada" && (
                          <DropdownMenuItem onClick={() => handleLiberar(op)} disabled={saving}>
                            <PlayCircle className="w-4 h-4 mr-2" /> Liberar (reserva MP)
                          </DropdownMenuItem>
                        )}
                        {(op.status === "Liberada" || op.status === "EmProducao") && (
                          <DropdownMenuItem
                            onClick={() => {
                              setOpConcluir(op);
                              setQtdBoa(String(op.quantidade || ""));
                              setQtdRefugo("0");
                              setShowConcluir(true);
                            }}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Concluir
                          </DropdownMenuItem>
                        )}
                        {op.status !== "Concluida" && op.status !== "Cancelada" && (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleCancelar(op)}
                          >
                            <XCircle className="w-4 h-4 mr-2" /> Cancelar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Nova OP */}
      <Sheet open={showNova} onOpenChange={setShowNova}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Nova Ordem de Produção</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Produto (item fabricado) *</Label>
              <Select
                value={form.material_id}
                onValueChange={(v) => setForm({ ...form, material_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {fabricados.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum material marcado como fabricado (Engenharia → material.fabricado)
                    </div>
                  )}
                  {fabricados.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.codigo ? `${m.codigo} — ` : ""}
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min="0"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
              />
            </div>
            <div>
              <Label>Almoxarifado WIP (consumo de MP) *</Label>
              <Select
                value={form.almoxarifado_wip_id}
                onValueChange={(v) => setForm({ ...form, almoxarifado_wip_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Onde a MP será consumida" />
                </SelectTrigger>
                <SelectContent>
                  {almoxarifados.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}
                      {a.tipo && a.tipo !== "Geral" ? ` (${a.tipo})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Almoxarifado destino (entrada do PA)</Label>
              <Select
                value={form.almoxarifado_destino_id}
                onValueChange={(v) => setForm({ ...form, almoxarifado_destino_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Se vazio, entra no WIP" />
                </SelectTrigger>
                <SelectContent>
                  {almoxarifados.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}
                      {a.tipo && a.tipo !== "Geral" ? ` (${a.tipo})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início previsto</Label>
                <Input
                  type="date"
                  value={form.data_prevista_inicio}
                  onChange={(e) => setForm({ ...form, data_prevista_inicio: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim previsto</Label>
                <Input
                  type="date"
                  value={form.data_prevista_fim}
                  onChange={(e) => setForm({ ...form, data_prevista_fim: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={handleCriar} disabled={saving}>
              {saving ? "Salvando…" : "Criar OP"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Concluir OP */}
      <Sheet open={showConcluir} onOpenChange={setShowConcluir}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Concluir OP {opConcluir?.numero}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Ao concluir, a matéria-prima reservada é baixada do estoque, o custo (material + mão
              de obra apontada) é apurado e o produto acabado entra no almoxarifado de destino pelo
              custo real.
            </p>
            <div>
              <Label>Quantidade boa *</Label>
              <Input
                type="number"
                min="0"
                value={qtdBoa}
                onChange={(e) => setQtdBoa(e.target.value)}
              />
            </div>
            <div>
              <Label>Quantidade refugada</Label>
              <Input
                type="number"
                min="0"
                value={qtdRefugo}
                onChange={(e) => setQtdRefugo(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleConcluir} disabled={saving}>
              {saving ? "Concluindo…" : "Concluir e dar entrada no PA"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Detalhe da OP */}
      <Sheet open={showDetalhe} onOpenChange={setShowDetalhe}>
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {detalhe?.op?.numero} — {detalhe?.op?.material_nome}
            </SheetTitle>
          </SheetHeader>
          {detalhe && (
            <div className="space-y-5 mt-4">
              <div>
                <h3 className="font-semibold text-sm mb-2">Componentes (matéria-prima)</h3>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Necessário</TableHead>
                        <TableHead className="text-right">Consumido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.itens.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Sem itens — a OP ainda não foi liberada
                          </TableCell>
                        </TableRow>
                      ) : (
                        detalhe.itens.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell>{it.material_nome}</TableCell>
                            <TableCell className="text-right">
                              {fmtQtd(it.quantidade_necessaria)} {it.unidade}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtQtd(it.quantidade_consumida)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">Operações (roteiro)</h3>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seq</TableHead>
                        <TableHead>Operação</TableHead>
                        <TableHead>Centro</TableHead>
                        <TableHead className="text-right">Previsto (min)</TableHead>
                        <TableHead className="text-right">Real (min)</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.operacoes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            Sem operações
                          </TableCell>
                        </TableRow>
                      ) : (
                        detalhe.operacoes.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>{o.seq}</TableCell>
                            <TableCell>{o.nome}</TableCell>
                            <TableCell>{o.centro_trabalho_nome || "-"}</TableCell>
                            <TableCell className="text-right">
                              {fmtQtd(o.tempo_previsto_min)}
                            </TableCell>
                            <TableCell className="text-right">{fmtQtd(o.tempo_real_min)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {o.status === "EmExecucao" ? "Em execução" : o.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {detalhe.op.status === "Concluida" && (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="border rounded-lg p-3">
                    <div className="text-muted-foreground">Material</div>
                    <div className="font-semibold">
                      {fmtMoeda(detalhe.op.custo_material ?? null)}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-muted-foreground">Mão de obra</div>
                    <div className="font-semibold">
                      {fmtMoeda(detalhe.op.custo_mao_obra ?? null)}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-semibold">{fmtMoeda(detalhe.op.custo_total ?? null)}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
