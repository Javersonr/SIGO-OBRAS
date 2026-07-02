import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
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

const fmtQtd = (v) => (v == null ? "-" : Number(v).toLocaleString("pt-BR"));
const fmtDataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "-");

const FORM_VAZIO = {
  operacao_id: "",
  tempo_min: "",
  tempo_parada_min: "0",
  motivo_parada: "",
  quantidade_boa: "",
  quantidade_refugo: "0",
  motivo_refugo: "",
  concluir_operacao: false,
  observacoes: "",
};

export default function ApontamentoTab({ empresaAtiva, user }) {
  const [opsAbertas, setOpsAbertas] = useState([]);
  const [opSelecionada, setOpSelecionada] = useState("");
  const [operacoes, setOperacoes] = useState([]);
  const [apontamentos, setApontamentos] = useState([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  const loadOps = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const ops = await sigo.entities.OrdemProducao.filter(
        { empresa_id: empresaAtiva.id },
        { sort_by: "-created_at", limit: 100 }
      );
      setOpsAbertas(
        (ops || []).filter((o) => o.status === "Liberada" || o.status === "EmProducao")
      );
    } catch (e) {
      console.error("[ApontamentoTab] erro:", e);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    loadOps();
  }, [loadOps]);

  const loadDaOp = useCallback(async (opId) => {
    if (!opId) {
      setOperacoes([]);
      setApontamentos([]);
      return;
    }
    try {
      const [opers, aponts] = await Promise.all([
        sigo.entities.OrdemProducaoOperacao.filter({ ordem_producao_id: opId }, { sort_by: "seq" }),
        sigo.entities.ApontamentoProducao.filter(
          { ordem_producao_id: opId },
          { sort_by: "-created_at", limit: 50 }
        ),
      ]);
      setOperacoes(opers || []);
      setApontamentos(aponts || []);
    } catch (e) {
      console.error("[ApontamentoTab] erro:", e);
    }
  }, []);

  useEffect(() => {
    loadDaOp(opSelecionada);
  }, [opSelecionada, loadDaOp]);

  const op = opsAbertas.find((o) => o.id === opSelecionada);

  const handleApontar = async () => {
    if (!op) {
      toast.error("Selecione uma ordem de produção");
      return;
    }
    const tempo = Number(form.tempo_min) || 0;
    const boa = Number(form.quantidade_boa) || 0;
    const refugo = Number(form.quantidade_refugo) || 0;
    if (tempo <= 0 && boa <= 0 && refugo <= 0) {
      toast.error("Informe tempo trabalhado ou quantidades");
      return;
    }
    setSaving(true);
    try {
      const oper = operacoes.find((o) => o.id === form.operacao_id) || null;
      const agora = new Date();
      await sigo.entities.ApontamentoProducao.create({
        empresa_id: empresaAtiva.id,
        ordem_producao_id: op.id,
        operacao_id: oper?.id || null,
        operacao_seq: oper?.seq ?? null,
        centro_trabalho_id: oper?.centro_trabalho_id || null,
        operador_id: user?.id || null,
        operador_nome: user?.full_name || user?.email || null,
        inicio: new Date(agora.getTime() - tempo * 60000).toISOString(),
        fim: agora.toISOString(),
        tempo_min: tempo,
        tempo_parada_min: Number(form.tempo_parada_min) || 0,
        motivo_parada: form.motivo_parada || null,
        quantidade_boa: boa,
        quantidade_refugo: refugo,
        motivo_refugo: form.motivo_refugo || null,
        observacoes: form.observacoes || null,
      });

      // Atualiza a operação (tempo real acumulado + status)
      if (oper) {
        await sigo.entities.OrdemProducaoOperacao.update(oper.id, {
          tempo_real_min: (Number(oper.tempo_real_min) || 0) + tempo,
          status: form.concluir_operacao ? "Concluida" : "EmExecucao",
        });
      }

      // Primeira atividade real: OP Liberada -> EmProducao
      if (op.status === "Liberada") {
        await sigo.entities.OrdemProducao.update(op.id, {
          status: "EmProducao",
          data_inicio_real: agora.toISOString(),
        });
      }

      toast.success("Apontamento registrado");
      setForm(FORM_VAZIO);
      await Promise.all([loadDaOp(op.id), loadOps()]);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao registrar apontamento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Label>Ordem de produção (liberada / em produção)</Label>
        <Select value={opSelecionada} onValueChange={setOpSelecionada}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a OP" />
          </SelectTrigger>
          <SelectContent>
            {opsAbertas.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma OP liberada — libere uma OP na aba Ordens
              </div>
            )}
            {opsAbertas.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.numero || o.id.slice(0, 8)} — {o.material_nome} ({fmtQtd(o.quantidade)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {op && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Formulário de apontamento */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Novo apontamento
              </h3>
              <div>
                <Label>Operação</Label>
                <Select
                  value={form.operacao_id}
                  onValueChange={(v) => setForm({ ...form, operacao_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {operacoes.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.seq} — {o.nome}{" "}
                        {o.centro_trabalho_nome ? `(${o.centro_trabalho_nome})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tempo trabalhado (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.tempo_min}
                    onChange={(e) => setForm({ ...form, tempo_min: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tempo de parada (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.tempo_parada_min}
                    onChange={(e) => setForm({ ...form, tempo_parada_min: e.target.value })}
                  />
                </div>
              </div>
              {Number(form.tempo_parada_min) > 0 && (
                <div>
                  <Label>Motivo da parada</Label>
                  <Input
                    value={form.motivo_parada}
                    placeholder="Ex.: falta de material, quebra de máquina, setup"
                    onChange={(e) => setForm({ ...form, motivo_parada: e.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Qtd boa</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.quantidade_boa}
                    onChange={(e) => setForm({ ...form, quantidade_boa: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Qtd refugo</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.quantidade_refugo}
                    onChange={(e) => setForm({ ...form, quantidade_refugo: e.target.value })}
                  />
                </div>
              </div>
              {Number(form.quantidade_refugo) > 0 && (
                <div>
                  <Label>Motivo do refugo</Label>
                  <Input
                    value={form.motivo_refugo}
                    onChange={(e) => setForm({ ...form, motivo_refugo: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
              {form.operacao_id && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="concluir-oper"
                    checked={form.concluir_operacao}
                    onCheckedChange={(v) => setForm({ ...form, concluir_operacao: !!v })}
                  />
                  <Label htmlFor="concluir-oper" className="cursor-pointer">
                    Concluir esta operação
                  </Label>
                </div>
              )}
              <Button className="w-full" onClick={handleApontar} disabled={saving}>
                {saving ? "Registrando…" : "Registrar apontamento"}
              </Button>
            </CardContent>
          </Card>

          {/* Operações da OP */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold mb-3">Operações da OP</h3>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seq</TableHead>
                      <TableHead>Operação</TableHead>
                      <TableHead className="text-right">Prev. (min)</TableHead>
                      <TableHead className="text-right">Real (min)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operacoes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          OP sem roteiro
                        </TableCell>
                      </TableRow>
                    ) : (
                      operacoes.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>{o.seq}</TableCell>
                          <TableCell>{o.nome}</TableCell>
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
            </CardContent>
          </Card>
        </div>
      )}

      {op && (
        <div>
          <h3 className="font-semibold mb-2">Apontamentos da OP</h3>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Operação</TableHead>
                  <TableHead className="text-right">Tempo (min)</TableHead>
                  <TableHead className="text-right">Parada (min)</TableHead>
                  <TableHead className="text-right">Boa</TableHead>
                  <TableHead className="text-right">Refugo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apontamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Nenhum apontamento ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  apontamentos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmtDataHora(a.fim || a.created_at)}
                      </TableCell>
                      <TableCell>{a.operador_nome || "-"}</TableCell>
                      <TableCell>{a.operacao_seq != null ? `#${a.operacao_seq}` : "-"}</TableCell>
                      <TableCell className="text-right">{fmtQtd(a.tempo_min)}</TableCell>
                      <TableCell className="text-right">{fmtQtd(a.tempo_parada_min)}</TableCell>
                      <TableCell className="text-right">{fmtQtd(a.quantidade_boa)}</TableCell>
                      <TableCell className="text-right">{fmtQtd(a.quantidade_refugo)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
