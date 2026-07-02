import React, { useState, useEffect, useCallback } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { toast } from "sonner";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Factory,
  DollarSign,
  Plus,
  Pencil,
  Gauge,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const TIPOS = [
  { key: "Vendas", label: "Vendas", unidade: "R$", icon: TrendingUp, inverso: false },
  { key: "Producao", label: "Produção", unidade: "UN", icon: Factory, inverso: false },
  { key: "Despesas", label: "Despesas (teto)", unidade: "R$", icon: TrendingDown, inverso: true },
  { key: "Resultado", label: "Resultado", unidade: "R$", icon: DollarSign, inverso: false },
];

const fmtMoeda = (v) =>
  v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v) => (v == null ? "-" : Number(v).toLocaleString("pt-BR"));
const fmtValor = (v, unidade) => (unidade === "UN" ? fmtQtd(v) : fmtMoeda(v));
const fmtPct = (v) => (v == null ? "-" : `${(Number(v) * 100).toFixed(1)}%`);

// Cor da barra: para metas normais, mais é melhor; para Despesas (teto), passar é ruim
function corBarra(pct, inverso) {
  if (pct == null) return "bg-slate-300";
  if (inverso) {
    if (pct >= 100) return "bg-red-500";
    if (pct >= 85) return "bg-amber-500";
    return "bg-green-500";
  }
  if (pct >= 100) return "bg-green-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-red-500";
}

export default function PainelMetas() {
  const { empresaAtiva, temPermissao } = useEmpresa();
  const hoje = new Date();
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [mes, setMes] = useState(String(hoje.getMonth() + 1));
  const [linhasAno, setLinhasAno] = useState([]); // vw_meta_realizado do ano inteiro
  const [kpiProducao, setKpiProducao] = useState({ ops: 0, produzido: 0, refugo: 0, oee: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showMeta, setShowMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ tipo: "Vendas", valor_meta: "" });

  const podeVer = temPermissao("Manufatura", "Metas");
  const podeEditar = temPermissao("Manufatura", "Metas", "editar");

  const loadData = useCallback(async () => {
    if (!empresaAtiva?.id || !supabase) return;
    setLoading(true);
    try {
      const anoN = Number(ano);
      const mesN = Number(mes);
      const ini = `${anoN}-${String(mesN).padStart(2, "0")}-01`;
      const fim = new Date(anoN, mesN, 0); // último dia do mês
      const fimStr = `${anoN}-${String(mesN).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;

      const [metasRes, opsRes, oeeRes] = await Promise.all([
        supabase
          .from("vw_meta_realizado")
          .select("*")
          .eq("empresa_id", empresaAtiva.id)
          .eq("ano", anoN)
          .order("mes"),
        supabase
          .from("vw_producao_resumo")
          .select("quantidade_produzida, quantidade_refugada, data_fim_real, status")
          .eq("empresa_id", empresaAtiva.id)
          .eq("status", "Concluida")
          .gte("data_fim_real", ini)
          .lte("data_fim_real", `${fimStr}T23:59:59`),
        supabase
          .from("vw_oee_centro_dia")
          .select("oee")
          .eq("empresa_id", empresaAtiva.id)
          .gte("dia", ini)
          .lte("dia", fimStr),
      ]);
      if (metasRes.error) throw metasRes.error;

      setLinhasAno(metasRes.data || []);

      const ops = opsRes.data || [];
      const oees = (oeeRes.data || []).map((l) => l.oee).filter((v) => v != null);
      setKpiProducao({
        ops: ops.length,
        produzido: ops.reduce((a, o) => a + Number(o.quantidade_produzida || 0), 0),
        refugo: ops.reduce((a, o) => a + Number(o.quantidade_refugada || 0), 0),
        oee: oees.length ? oees.reduce((a, b) => a + Number(b), 0) / oees.length : null,
      });
    } catch (e) {
      console.error("[PainelMetas] erro:", e);
      toast.error("Erro ao carregar metas");
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id, ano, mes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metasDoMes = TIPOS.map((t) => ({
    ...t,
    linha: linhasAno.find((l) => l.tipo === t.key && l.mes === Number(mes)) || null,
  }));

  const abrirMeta = (tipo) => {
    const existente = linhasAno.find((l) => l.tipo === tipo && l.mes === Number(mes));
    setMetaForm({ tipo, valor_meta: existente ? String(existente.valor_meta) : "" });
    setShowMeta(true);
  };

  const salvarMeta = async () => {
    if (!metaForm.valor_meta || Number(metaForm.valor_meta) <= 0) {
      toast.error("Informe o valor da meta");
      return;
    }
    setSaving(true);
    try {
      const existente = linhasAno.find((l) => l.tipo === metaForm.tipo && l.mes === Number(mes));
      const tipoCfg = TIPOS.find((t) => t.key === metaForm.tipo);
      if (existente?.meta_id) {
        await sigo.entities.Meta.update(existente.meta_id, {
          valor_meta: Number(metaForm.valor_meta),
        });
      } else {
        await sigo.entities.Meta.create({
          empresa_id: empresaAtiva.id,
          tipo: metaForm.tipo,
          ano: Number(ano),
          mes: Number(mes),
          valor_meta: Number(metaForm.valor_meta),
          unidade: tipoCfg?.unidade || "R$",
        });
      }
      toast.success("Meta salva");
      setShowMeta(false);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Erro ao salvar meta");
    } finally {
      setSaving(false);
    }
  };

  if (!podeVer) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Você não tem permissão para ver o painel de metas.
      </div>
    );
  }

  const anosDisponiveis = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Painel de Metas</h1>
            <p className="text-sm text-muted-foreground">
              Vendas, produção e financeiro — meta × realizado
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de meta × realizado do mês */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metasDoMes.map((t) => {
          const l = t.linha;
          const pct = l?.pct_atingido != null ? Number(l.pct_atingido) : null;
          return (
            <Card key={t.key}>
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <t.icon className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{t.label}</span>
                  </div>
                  {podeEditar && (
                    <Button variant="ghost" size="sm" onClick={() => abrirMeta(t.key)}>
                      {l ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
                {l ? (
                  <>
                    <div className="text-2xl font-bold">{fmtValor(l.realizado, t.unidade)}</div>
                    <div className="text-xs text-muted-foreground">
                      Meta: {fmtValor(l.valor_meta, t.unidade)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 bg-slate-200 rounded">
                        <div
                          className={`h-2 rounded ${corBarra(pct, t.inverso)}`}
                          style={{ width: `${Math.min(pct || 0, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{pct != null ? `${pct}%` : "-"}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground py-3">
                    {loading ? "Carregando…" : "Sem meta definida para este mês"}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* KPIs de produção do mês */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <PackageCheck className="w-8 h-8 text-primary shrink-0" />
            <div>
              <div className="text-sm text-muted-foreground">OPs concluídas</div>
              <div className="text-xl font-bold">{kpiProducao.ops}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <Factory className="w-8 h-8 text-primary shrink-0" />
            <div>
              <div className="text-sm text-muted-foreground">Unidades produzidas</div>
              <div className="text-xl font-bold">{fmtQtd(kpiProducao.produzido)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-500 shrink-0" />
            <div>
              <div className="text-sm text-muted-foreground">Refugo</div>
              <div className="text-xl font-bold">{fmtQtd(kpiProducao.refugo)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <Gauge className="w-8 h-8 text-primary shrink-0" />
            <div>
              <div className="text-sm text-muted-foreground">OEE médio</div>
              <div className="text-xl font-bold">{fmtPct(kpiProducao.oee)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visão anual */}
      <div>
        <h3 className="font-semibold mb-2">Ano {ano} — meta × realizado por mês</h3>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                {TIPOS.map((t) => (
                  <TableHead key={t.key} className="text-right">
                    {t.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MESES.map((nomeMes, i) => {
                const mesN = i + 1;
                const doMes = TIPOS.map(
                  (t) => linhasAno.find((l) => l.tipo === t.key && l.mes === mesN) || null
                );
                if (doMes.every((l) => !l)) return null;
                return (
                  <TableRow key={nomeMes} className={mesN === Number(mes) ? "bg-primary/5" : ""}>
                    <TableCell className="font-medium">{nomeMes}</TableCell>
                    {doMes.map((l, j) => (
                      <TableCell key={j} className="text-right whitespace-nowrap">
                        {l ? (
                          <span>
                            {fmtValor(l.realizado, TIPOS[j].unidade)}
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              / {fmtValor(l.valor_meta, TIPOS[j].unidade)}{" "}
                              {l.pct_atingido != null ? `(${l.pct_atingido}%)` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {linhasAno.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {loading
                      ? "Carregando…"
                      : "Nenhuma meta definida neste ano — use o botão + nos cards acima"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Editor de meta */}
      <Sheet open={showMeta} onOpenChange={setShowMeta}>
        <SheetContent className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>
              Meta de {TIPOS.find((t) => t.key === metaForm.tipo)?.label} — {MESES[Number(mes) - 1]}
              /{ano}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Valor da meta ({TIPOS.find((t) => t.key === metaForm.tipo)?.unidade})</Label>
              <Input
                type="number"
                min="0"
                value={metaForm.valor_meta}
                onChange={(e) => setMetaForm({ ...metaForm, valor_meta: e.target.value })}
              />
              {metaForm.tipo === "Despesas" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Para despesas a meta é um teto: passar de 100% fica vermelho.
                </p>
              )}
            </div>
            <Button className="w-full" onClick={salvarMeta} disabled={saving}>
              {saving ? "Salvando…" : "Salvar meta"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
