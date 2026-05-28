import React, { useState, useEffect, useMemo } from "react";
import { useEmpresa } from "../Layout";
import { sigo, supabase } from "@/api/sigoClient";
import { Calculator, FileText, Building2, Search, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { formatBRL, formatFullDate } from "@/lib/formatters";

const TIPOS_NFE = {
  NFe_recebida: { label: "NFe Recebida", cor: "bg-blue-100 text-blue-700" },
  NFe_emitida: { label: "NFe Emitida", cor: "bg-emerald-100 text-emerald-700" },
  NFSe_recebida: { label: "NFS-e Recebida", cor: "bg-cyan-100 text-cyan-700" },
  NFSe_emitida: { label: "NFS-e Emitida", cor: "bg-teal-100 text-teal-700" },
  NFCe: { label: "NFC-e", cor: "bg-slate-100 text-slate-700" },
  Outro: { label: "Outro", cor: "bg-amber-100 text-amber-700" },
};

const STATUS_NFE = {
  "Pendente Conferencia": { label: "Pendente", cor: "bg-amber-100 text-amber-700" },
  Conferida: { label: "Conferida", cor: "bg-green-100 text-green-700" },
  Cancelada: { label: "Cancelada", cor: "bg-red-100 text-red-700" },
  Inutilizada: { label: "Inutilizada", cor: "bg-slate-100 text-slate-700" },
  Substituida: { label: "Substituída", cor: "bg-purple-100 text-purple-700" },
};

const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Nao Definido"];

function formatCNPJ(v) {
  if (!v) return "—";
  const d = String(v).replace(/\D/g, "");
  if (d.length !== 14) return v;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default function Contabilidade() {
  const { empresaAtiva } = useEmpresa();
  const [tab, setTab] = useState("dashboard");
  const [nfes, setNfes] = useState([]);
  const [resumoMensal, setResumoMensal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    tipo: "todos",
    status: "todos",
    busca: "",
    mes: "atual",
  });
  const [regimeForm, setRegimeForm] = useState({
    regime_tributario: empresaAtiva?.regime_tributario || "Nao Definido",
    cnae_principal: empresaAtiva?.cnae_principal || "",
    inscricao_municipal: empresaAtiva?.inscricao_municipal || "",
  });
  const [salvandoRegime, setSalvandoRegime] = useState(false);

  useEffect(() => {
    setRegimeForm({
      regime_tributario: empresaAtiva?.regime_tributario || "Nao Definido",
      cnae_principal: empresaAtiva?.cnae_principal || "",
      inscricao_municipal: empresaAtiva?.inscricao_municipal || "",
    });
  }, [empresaAtiva?.id]);

  const carregar = React.useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const lista = await sigo.entities.NotaFiscalEletronica.filter({
        empresa_id: empresaAtiva.id,
      });
      setNfes(
        (lista || []).sort((a, b) => new Date(b.data_emissao || 0) - new Date(a.data_emissao || 0))
      );

      if (supabase) {
        const { data: resumo, error } = await supabase
          .from("v_nfe_resumo_mensal")
          .select("*")
          .eq("empresa_id", empresaAtiva.id)
          .order("mes", { ascending: false });
        if (!error) setResumoMensal(resumo || []);
      }
    } catch (err) {
      console.error("[Contabilidade] falha ao carregar NFes:", err);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // KPIs do mês corrente
  const kpis = useMemo(() => {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const doMes = nfes.filter((n) => {
      const d = n.data_emissao ? new Date(n.data_emissao + "T00:00") : null;
      return d && d >= inicioMes;
    });
    return {
      qtMes: doMes.length,
      valorMes: doMes.reduce((s, n) => s + Number(n.valor_total || 0), 0),
      pendentes: nfes.filter((n) => n.status === "Pendente Conferencia").length,
      icmsMes: doMes.reduce((s, n) => s + Number(n.valor_icms || 0), 0),
    };
  }, [nfes]);

  const nfesFiltradas = useMemo(() => {
    let lista = [...nfes];
    if (filtros.tipo !== "todos") lista = lista.filter((n) => n.tipo === filtros.tipo);
    if (filtros.status !== "todos") lista = lista.filter((n) => n.status === filtros.status);
    if (filtros.mes === "atual") {
      const hoje = new Date();
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      lista = lista.filter((n) => {
        const d = n.data_emissao ? new Date(n.data_emissao + "T00:00") : null;
        return d && d >= ini;
      });
    } else if (filtros.mes === "ultimos3") {
      const corte = new Date();
      corte.setMonth(corte.getMonth() - 3);
      lista = lista.filter((n) => {
        const d = n.data_emissao ? new Date(n.data_emissao + "T00:00") : null;
        return d && d >= corte;
      });
    }
    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      lista = lista.filter(
        (n) =>
          n.emit_nome?.toLowerCase().includes(q) ||
          n.emit_cnpj?.includes(q) ||
          n.numero?.toLowerCase().includes(q) ||
          n.chave_nfe?.includes(q)
      );
    }
    return lista;
  }, [nfes, filtros]);

  const salvarRegime = async () => {
    if (!empresaAtiva?.id) return;
    setSalvandoRegime(true);
    try {
      await sigo.entities.Empresa.update(empresaAtiva.id, regimeForm);
      alert("Configuração salva. Recarregue para o regime entrar em vigor.");
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || "desconhecido"));
    } finally {
      setSalvandoRegime(false);
    }
  };

  const exportarCSV = () => {
    const linhas = [
      [
        "Tipo",
        "Numero",
        "Chave NFe",
        "Data Emissao",
        "Emitente CNPJ",
        "Emitente Nome",
        "Valor Total",
        "ICMS",
        "ISS",
        "PIS",
        "COFINS",
        "Status",
      ],
      ...nfesFiltradas.map((n) => [
        TIPOS_NFE[n.tipo]?.label || n.tipo,
        n.numero || "",
        n.chave_nfe || "",
        n.data_emissao || "",
        n.emit_cnpj || "",
        n.emit_nome || "",
        n.valor_total || 0,
        n.valor_icms || 0,
        n.valor_iss || 0,
        n.valor_pis || 0,
        n.valor_cofins || 0,
        STATUS_NFE[n.status]?.label || n.status,
      ]),
    ];
    const csv = linhas
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "").replace(/"/g, '""');
            return /[;\n"]/.test(s) ? `"${s}"` : s;
          })
          .join(";")
      )
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!empresaAtiva) return <div className="p-6 text-slate-500">Selecione uma empresa.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contabilidade</h1>
          <p className="text-slate-500 text-sm">
            Regime tributário:{" "}
            <Badge className="ml-1">{empresaAtiva.regime_tributario || "Não definido"}</Badge>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Resumo</TabsTrigger>
          <TabsTrigger value="nfes">NFe ({nfes.length})</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 pt-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              titulo="Notas no mês"
              valor={kpis.qtMes}
              sub={`${nfes.length} total`}
              icon={FileText}
              cor="blue"
            />
            <KPICard
              titulo="Valor no mês"
              valor={formatBRL(kpis.valorMes)}
              sub="Soma das NFe"
              icon={Calculator}
              cor="emerald"
            />
            <KPICard
              titulo="ICMS no mês"
              valor={formatBRL(kpis.icmsMes)}
              sub="ICMS destacado"
              icon={Building2}
              cor="amber"
            />
            <KPICard
              titulo="Pendentes"
              valor={kpis.pendentes}
              sub="Aguardando conferência"
              icon={FileText}
              cor="rose"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo mensal</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {resumoMensal.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Sem dados ainda. Importe NFes pelo Financeiro (Despesa &gt; Importar XML NFe).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Qt</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">ICMS</TableHead>
                      <TableHead className="text-right">ISS</TableHead>
                      <TableHead className="text-right">PIS</TableHead>
                      <TableHead className="text-right">COFINS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumoMensal.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {r.mes ? new Date(r.mes).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={TIPOS_NFE[r.tipo]?.cor}>
                            {TIPOS_NFE[r.tipo]?.label || r.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{r.qt_notas}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.valor_total)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.total_icms)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.total_iss)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.total_pis)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.total_cofins)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nfes" className="space-y-4 pt-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="CNPJ, nome, número ou chave"
                    className="pl-8"
                    value={filtros.busca}
                    onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={filtros.tipo}
                  onValueChange={(v) => setFiltros((f) => ({ ...f, tipo: v }))}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {Object.entries(TIPOS_NFE).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={filtros.status}
                  onValueChange={(v) => setFiltros((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {Object.entries(STATUS_NFE).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Período</Label>
                <Select
                  value={filtros.mes}
                  onValueChange={(v) => setFiltros((f) => ({ ...f, mes: v }))}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atual">Mês atual</SelectItem>
                    <SelectItem value="ultimos3">Últimos 3 meses</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={exportarCSV}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Emitente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">ICMS</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nfesFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                        {loading ? "Carregando..." : "Nenhuma NFe encontrada."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    nfesFiltradas.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell>
                          <Badge className={TIPOS_NFE[n.tipo]?.cor}>
                            {TIPOS_NFE[n.tipo]?.label || n.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {n.numero || (n.chave_nfe ? "…" + n.chave_nfe.slice(-8) : "—")}
                        </TableCell>
                        <TableCell>{formatFullDate(n.data_emissao)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{n.emit_nome || "—"}</div>
                          <div className="text-xs text-slate-500">{formatCNPJ(n.emit_cnpj)}</div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatBRL(n.valor_total)}
                        </TableCell>
                        <TableCell className="text-right">{formatBRL(n.valor_icms)}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_NFE[n.status]?.cor}>
                            {STATUS_NFE[n.status]?.label || n.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Regime tributário da empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-w-2xl">
              <div>
                <Label>Regime</Label>
                <Select
                  value={regimeForm.regime_tributario}
                  onValueChange={(v) => setRegimeForm((f) => ({ ...f, regime_tributario: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIMES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  Cada empresa do grupo pode ter regime diferente.
                </p>
              </div>
              <div>
                <Label>CNAE principal</Label>
                <Input
                  placeholder="Ex: 4399-1/03"
                  value={regimeForm.cnae_principal}
                  onChange={(e) => setRegimeForm((f) => ({ ...f, cnae_principal: e.target.value }))}
                />
              </div>
              <div>
                <Label>Inscrição municipal (para NFS-e)</Label>
                <Input
                  placeholder="Inscrição na prefeitura"
                  value={regimeForm.inscricao_municipal}
                  onChange={(e) =>
                    setRegimeForm((f) => ({ ...f, inscricao_municipal: e.target.value }))
                  }
                />
              </div>
              <Button onClick={salvarRegime} disabled={salvandoRegime}>
                {salvandoRegime ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPICard({ titulo, valor, sub, icon: Icon, cor }) {
  const cores = {
    blue: "text-blue-600 border-blue-200",
    emerald: "text-emerald-600 border-emerald-200",
    amber: "text-amber-600 border-amber-200",
    rose: "text-rose-600 border-rose-200",
  };
  return (
    <Card className={cores[cor] || ""}>
      <CardContent className="p-5">
        <Icon className="w-5 h-5 mb-2" />
        <p className="text-2xl font-bold">{valor}</p>
        <p className="text-sm text-slate-500 mt-1">{titulo}</p>
        <p className="text-xs text-slate-400 mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
