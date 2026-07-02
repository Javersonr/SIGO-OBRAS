import React, { useState, useEffect, useCallback } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { toast } from "sonner";
import { Play, ShoppingCart, Factory, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
const fmtData = (v) => (v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "-");
const fmtDataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "-");

const TIPO_BADGE = {
  Comprar: "bg-blue-100 text-blue-700",
  Produzir: "bg-amber-100 text-amber-700",
};
const STATUS_BADGE = {
  Pendente: "bg-slate-100 text-slate-700",
  Convertida: "bg-green-100 text-green-700",
  Descartada: "bg-red-100 text-red-700",
};

export default function MrpTab({ empresaAtiva, user }) {
  const [execucoes, setExecucoes] = useState([]);
  const [execSelecionada, setExecSelecionada] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [rodando, setRodando] = useState(false);
  const [agindo, setAgindo] = useState(false);

  const loadExecucoes = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const execs = await sigo.entities.MrpExecucao.filter(
        { empresa_id: empresaAtiva.id },
        { sort_by: "-created_at", limit: 10 }
      );
      setExecucoes(execs || []);
      if (execs?.length && !execSelecionada) setExecSelecionada(execs[0].id);
    } catch (e) {
      console.error("[MrpTab] erro:", e);
    }
  }, [empresaAtiva?.id, execSelecionada]);

  useEffect(() => {
    loadExecucoes();
  }, [loadExecucoes]);

  const loadSugestoes = useCallback(async (execId) => {
    if (!execId) {
      setSugestoes([]);
      return;
    }
    try {
      const sugs = await sigo.entities.MrpSugestao.filter(
        { execucao_id: execId },
        { sort_by: "material_nome" }
      );
      setSugestoes(sugs || []);
    } catch (e) {
      console.error("[MrpTab] erro:", e);
    }
  }, []);

  useEffect(() => {
    loadSugestoes(execSelecionada);
  }, [execSelecionada, loadSugestoes]);

  const executarMrp = async () => {
    setRodando(true);
    try {
      const { data, error } = await supabase.rpc("executar_mrp", {
        p_empresa_id: empresaAtiva.id,
        p_executado_por: user?.full_name || user?.email || null,
      });
      if (error) throw error;
      toast.success("MRP executado");
      setExecSelecionada(data);
      await loadExecucoes();
      await loadSugestoes(data);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao executar MRP");
    } finally {
      setRodando(false);
    }
  };

  const converterProducao = async (sug) => {
    setAgindo(true);
    try {
      const { error } = await supabase.rpc("converter_sugestao_producao", {
        p_sugestao_id: sug.id,
      });
      if (error) throw error;
      toast.success(`OP planejada criada para ${sug.material_nome}`);
      await loadSugestoes(execSelecionada);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao converter sugestão");
    } finally {
      setAgindo(false);
    }
  };

  const gerarSolicitacaoCompra = async () => {
    setAgindo(true);
    try {
      const { error } = await supabase.rpc("gerar_solicitacao_compra_mrp", {
        p_execucao_id: execSelecionada,
        p_solicitante_nome: user?.full_name || user?.email || null,
      });
      if (error) throw error;
      toast.success("Solicitação de compra gerada — enviada para aprovação em Compras");
      await loadSugestoes(execSelecionada);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao gerar solicitação de compra");
    } finally {
      setAgindo(false);
    }
  };

  const descartar = async (sug) => {
    try {
      await sigo.entities.MrpSugestao.update(sug.id, { status: "Descartada" });
      await loadSugestoes(execSelecionada);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao descartar");
    }
  };

  const comprarPendentes = sugestoes.filter((s) => s.tipo === "Comprar" && s.status === "Pendente");

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="max-w-sm flex-1 min-w-[220px]">
          <Label>Execução</Label>
          <Select value={execSelecionada} onValueChange={setExecSelecionada}>
            <SelectTrigger>
              <SelectValue placeholder="Nenhuma execução ainda" />
            </SelectTrigger>
            <SelectContent>
              {execucoes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {fmtDataHora(e.created_at)} — {e.total_sugestoes} sugestão(ões)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {comprarPendentes.length > 0 && (
            <Button variant="outline" onClick={gerarSolicitacaoCompra} disabled={agindo}>
              <ShoppingCart className="w-4 h-4 mr-1" />
              Gerar SC ({comprarPendentes.length} itens)
            </Button>
          )}
          <Button onClick={executarMrp} disabled={rodando}>
            <Play className="w-4 h-4 mr-1" />
            {rodando ? "Calculando…" : "Executar MRP"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        O MRP calcula: necessidade (estoque mínimo + componentes de OPs planejadas) − disponível −
        produção em andamento. Sugestões <b>Comprar</b> viram uma Solicitação de Compra (esteira de
        aprovação do módulo Compras); sugestões <b>Produzir</b> viram OPs planejadas.
      </p>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead className="text-right">Qtd sugerida</TableHead>
              <TableHead className="text-right">Disponível</TableHead>
              <TableHead className="text-right">Necessidade</TableHead>
              <TableHead>P/ quando</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sugestoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {execucoes.length === 0
                    ? "Execute o MRP para gerar sugestões"
                    : "Nenhuma sugestão nesta execução — estoque cobre a demanda"}
                </TableCell>
              </TableRow>
            ) : (
              sugestoes.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.material_codigo ? `${s.material_codigo} — ` : ""}
                    {s.material_nome}
                  </TableCell>
                  <TableCell>
                    <Badge className={TIPO_BADGE[s.tipo] || ""} variant="secondary">
                      {s.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtQtd(s.quantidade)} {s.unidade || ""}
                  </TableCell>
                  <TableCell className="text-right">{fmtQtd(s.disponivel)}</TableCell>
                  <TableCell className="text-right">{fmtQtd(s.necessidade_bruta)}</TableCell>
                  <TableCell>{fmtData(s.data_necessidade)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[s.status] || ""} variant="secondary">
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.status === "Pendente" && (
                      <div className="flex gap-1">
                        {s.tipo === "Produzir" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => converterProducao(s)}
                            disabled={agindo}
                            title="Criar OP planejada"
                          >
                            <Factory className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => descartar(s)}
                          title="Descartar sugestão"
                        >
                          <XCircle className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
