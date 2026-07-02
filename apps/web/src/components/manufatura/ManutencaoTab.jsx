import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  PlayCircle,
  CheckCircle2,
  XCircle,
  CalendarClock,
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

const fmtMoeda = (v) =>
  v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (v) =>
  v ? new Date(String(v).length === 10 ? v + "T00:00:00" : v).toLocaleDateString("pt-BR") : "-";

const STATUS_BADGE = {
  Aberta: "bg-slate-100 text-slate-700",
  Programada: "bg-blue-100 text-blue-700",
  EmExecucao: "bg-amber-100 text-amber-700",
  Concluida: "bg-green-100 text-green-700",
  Cancelada: "bg-red-100 text-red-700",
};

const ORDEM_VAZIA = {
  centro_trabalho_id: "",
  tipo: "Corretiva",
  prioridade: "Normal",
  descricao_problema: "",
  data_prevista: "",
  parou_producao: false,
};

const PLANO_VAZIO = {
  centro_trabalho_id: "",
  nome: "",
  descricao_servico: "",
  intervalo_dias: "30",
  proxima_data: "",
};

export default function ManutencaoTab({ empresaAtiva, centros }) {
  const [ordens, setOrdens] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showOrdem, setShowOrdem] = useState(false);
  const [formOrdem, setFormOrdem] = useState(ORDEM_VAZIA);

  const [showPlano, setShowPlano] = useState(false);
  const [formPlano, setFormPlano] = useState(PLANO_VAZIO);

  const [showConcluir, setShowConcluir] = useState(false);
  const [ordemConcluir, setOrdemConcluir] = useState(null);
  const [concluirForm, setConcluirForm] = useState({
    descricao_servico: "",
    custo_pecas: "0",
    custo_servico: "0",
    tempo_parada_min: "0",
  });

  const loadData = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const [ords, plns] = await Promise.all([
        sigo.entities.OrdemManutencao.filter(
          { empresa_id: empresaAtiva.id },
          { sort_by: "-created_at", limit: 200 }
        ),
        sigo.entities.PlanoManutencao.filter(
          { empresa_id: empresaAtiva.id },
          { sort_by: "proxima_data" }
        ),
      ]);
      setOrdens(ords || []);
      setPlanos(plns || []);
    } catch (e) {
      console.error("[ManutencaoTab] erro:", e);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const criarOrdem = async () => {
    if (!formOrdem.centro_trabalho_id) {
      toast.error("Selecione o centro de trabalho / máquina");
      return;
    }
    setSaving(true);
    try {
      const ct = centros.find((c) => c.id === formOrdem.centro_trabalho_id);
      await sigo.entities.OrdemManutencao.create({
        empresa_id: empresaAtiva.id,
        centro_trabalho_id: formOrdem.centro_trabalho_id,
        centro_trabalho_nome: ct?.nome || null,
        tipo: formOrdem.tipo,
        prioridade: formOrdem.prioridade,
        status: "Aberta",
        descricao_problema: formOrdem.descricao_problema || null,
        data_prevista: formOrdem.data_prevista || null,
        parou_producao: !!formOrdem.parou_producao,
      });
      toast.success("Ordem de manutenção aberta");
      setShowOrdem(false);
      setFormOrdem(ORDEM_VAZIA);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao abrir ordem");
    } finally {
      setSaving(false);
    }
  };

  const iniciarOrdem = async (o) => {
    try {
      await sigo.entities.OrdemManutencao.update(o.id, {
        status: "EmExecucao",
        data_inicio: new Date().toISOString(),
      });
      await loadData();
    } catch (e) {
      toast.error(e.message || "Erro");
    }
  };

  const concluirOrdem = async () => {
    setSaving(true);
    try {
      await sigo.entities.OrdemManutencao.update(ordemConcluir.id, {
        status: "Concluida",
        data_fim: new Date().toISOString(),
        descricao_servico: concluirForm.descricao_servico || null,
        custo_pecas: Number(concluirForm.custo_pecas) || 0,
        custo_servico: Number(concluirForm.custo_servico) || 0,
        tempo_parada_min: Number(concluirForm.tempo_parada_min) || 0,
      });
      toast.success("Manutenção concluída");
      setShowConcluir(false);
      setOrdemConcluir(null);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao concluir");
    } finally {
      setSaving(false);
    }
  };

  const cancelarOrdem = async (o) => {
    if (!window.confirm("Cancelar esta ordem de manutenção?")) return;
    try {
      await sigo.entities.OrdemManutencao.update(o.id, { status: "Cancelada" });
      await loadData();
    } catch (e) {
      toast.error(e.message || "Erro");
    }
  };

  const criarPlano = async () => {
    if (!formPlano.centro_trabalho_id || !formPlano.nome || !formPlano.proxima_data) {
      toast.error("Informe centro, nome do plano e a próxima data");
      return;
    }
    setSaving(true);
    try {
      const ct = centros.find((c) => c.id === formPlano.centro_trabalho_id);
      await sigo.entities.PlanoManutencao.create({
        empresa_id: empresaAtiva.id,
        centro_trabalho_id: formPlano.centro_trabalho_id,
        centro_trabalho_nome: ct?.nome || null,
        nome: formPlano.nome,
        descricao_servico: formPlano.descricao_servico || null,
        intervalo_dias: Number(formPlano.intervalo_dias) || 30,
        proxima_data: formPlano.proxima_data,
        ativo: true,
      });
      toast.success("Plano de manutenção preventiva criado");
      setShowPlano(false);
      setFormPlano(PLANO_VAZIO);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao criar plano");
    } finally {
      setSaving(false);
    }
  };

  const togglePlano = async (p) => {
    try {
      await sigo.entities.PlanoManutencao.update(p.id, { ativo: !p.ativo });
      await loadData();
    } catch (e) {
      toast.error(e.message || "Erro");
    }
  };

  return (
    <div className="space-y-6">
      {/* Ordens */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Ordens de manutenção</h3>
          <Button onClick={() => setShowOrdem(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nova ordem
          </Button>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Máquina / Centro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Prevista</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : ordens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Nenhuma ordem de manutenção
                  </TableCell>
                </TableRow>
              ) : (
                ordens.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.centro_trabalho_nome}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{o.tipo}</Badge>
                    </TableCell>
                    <TableCell>{o.prioridade}</TableCell>
                    <TableCell>{fmtData(o.data_prevista)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[o.status] || ""} variant="secondary">
                        {o.status === "EmExecucao" ? "Em execução" : o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {o.status === "Concluida" ? fmtMoeda(o.custo_total) : "-"}
                    </TableCell>
                    <TableCell>
                      {o.status !== "Concluida" && o.status !== "Cancelada" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {o.status === "Aberta" && (
                              <DropdownMenuItem onClick={() => iniciarOrdem(o)}>
                                <PlayCircle className="w-4 h-4 mr-2" /> Iniciar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setOrdemConcluir(o);
                                setConcluirForm({
                                  descricao_servico: o.descricao_servico || "",
                                  custo_pecas: "0",
                                  custo_servico: "0",
                                  tempo_parada_min: "0",
                                });
                                setShowConcluir(true);
                              }}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" /> Concluir
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => cancelarOrdem(o)}
                            >
                              <XCircle className="w-4 h-4 mr-2" /> Cancelar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Planos preventivos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Planos preventivos
            <span className="text-xs text-muted-foreground font-normal">
              (geram ordens automaticamente na data)
            </span>
          </h3>
          <Button variant="outline" onClick={() => setShowPlano(true)}>
            <Plus className="w-4 h-4 mr-1" /> Novo plano
          </Button>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Máquina / Centro</TableHead>
                <TableHead className="text-right">Intervalo (dias)</TableHead>
                <TableHead>Próxima</TableHead>
                <TableHead>Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhum plano preventivo
                  </TableCell>
                </TableRow>
              ) : (
                planos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.centro_trabalho_nome}</TableCell>
                    <TableCell className="text-right">{p.intervalo_dias}</TableCell>
                    <TableCell>{fmtData(p.proxima_data)}</TableCell>
                    <TableCell>
                      <Button
                        variant={p.ativo ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePlano(p)}
                      >
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Nova ordem */}
      <Sheet open={showOrdem} onOpenChange={setShowOrdem}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Nova ordem de manutenção</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Máquina / centro *</Label>
              <Select
                value={formOrdem.centro_trabalho_id}
                onValueChange={(v) => setFormOrdem({ ...formOrdem, centro_trabalho_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {centros.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={formOrdem.tipo}
                  onValueChange={(v) => setFormOrdem({ ...formOrdem, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corretiva">Corretiva</SelectItem>
                    <SelectItem value="Preventiva">Preventiva</SelectItem>
                    <SelectItem value="Preditiva">Preditiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={formOrdem.prioridade}
                  onValueChange={(v) => setFormOrdem({ ...formOrdem, prioridade: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Problema / motivo</Label>
              <Textarea
                value={formOrdem.descricao_problema}
                onChange={(e) => setFormOrdem({ ...formOrdem, descricao_problema: e.target.value })}
              />
            </div>
            <div>
              <Label>Data prevista</Label>
              <Input
                type="date"
                value={formOrdem.data_prevista}
                onChange={(e) => setFormOrdem({ ...formOrdem, data_prevista: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={criarOrdem} disabled={saving}>
              {saving ? "Salvando…" : "Abrir ordem"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Concluir ordem */}
      <Sheet open={showConcluir} onOpenChange={setShowConcluir}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Concluir manutenção — {ordemConcluir?.centro_trabalho_nome}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Serviço executado</Label>
              <Textarea
                value={concluirForm.descricao_servico}
                onChange={(e) =>
                  setConcluirForm({ ...concluirForm, descricao_servico: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Peças (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  value={concluirForm.custo_pecas}
                  onChange={(e) =>
                    setConcluirForm({ ...concluirForm, custo_pecas: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Serviço (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  value={concluirForm.custo_servico}
                  onChange={(e) =>
                    setConcluirForm({ ...concluirForm, custo_servico: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Parada (min)</Label>
                <Input
                  type="number"
                  min="0"
                  value={concluirForm.tempo_parada_min}
                  onChange={(e) =>
                    setConcluirForm({ ...concluirForm, tempo_parada_min: e.target.value })
                  }
                />
              </div>
            </div>
            <Button className="w-full" onClick={concluirOrdem} disabled={saving}>
              {saving ? "Concluindo…" : "Concluir manutenção"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Novo plano */}
      <Sheet open={showPlano} onOpenChange={setShowPlano}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Novo plano preventivo</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Máquina / centro *</Label>
              <Select
                value={formPlano.centro_trabalho_id}
                onValueChange={(v) => setFormPlano({ ...formPlano, centro_trabalho_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {centros.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do plano *</Label>
              <Input
                value={formPlano.nome}
                placeholder="Ex.: Lubrificação mensal"
                onChange={(e) => setFormPlano({ ...formPlano, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Serviço a executar</Label>
              <Textarea
                value={formPlano.descricao_servico}
                onChange={(e) => setFormPlano({ ...formPlano, descricao_servico: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Intervalo (dias) *</Label>
                <Input
                  type="number"
                  min="1"
                  value={formPlano.intervalo_dias}
                  onChange={(e) => setFormPlano({ ...formPlano, intervalo_dias: e.target.value })}
                />
              </div>
              <div>
                <Label>Próxima execução *</Label>
                <Input
                  type="date"
                  value={formPlano.proxima_data}
                  onChange={(e) => setFormPlano({ ...formPlano, proxima_data: e.target.value })}
                />
              </div>
            </div>
            <Button className="w-full" onClick={criarPlano} disabled={saving}>
              {saving ? "Salvando…" : "Criar plano"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
