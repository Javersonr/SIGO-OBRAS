import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/sigoClient";
import { Gauge, Timer, CheckCircle2, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

const fmtPct = (v) => (v == null ? "-" : `${(Number(v) * 100).toFixed(1)}%`);
const fmtQtd = (v) => (v == null ? "-" : Number(v).toLocaleString("pt-BR"));
const fmtData = (v) => (v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "-");

const media = (linhas, campo) => {
  const vals = linhas.map((l) => l[campo]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
};

export default function OeeTab({ empresaAtiva }) {
  const [dias, setDias] = useState("30");
  const [linhas, setLinhas] = useState([]);
  const [paradas, setParadas] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!empresaAtiva?.id || !supabase) return;
    setLoading(true);
    try {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(dias));
      const desdeStr = desde.toISOString().slice(0, 10);

      const [oeeRes, paradasRes] = await Promise.all([
        supabase
          .from("vw_oee_centro_dia")
          .select("*")
          .eq("empresa_id", empresaAtiva.id)
          .gte("dia", desdeStr)
          .order("dia", { ascending: false }),
        supabase
          .from("vw_paradas_resumo")
          .select("*")
          .eq("empresa_id", empresaAtiva.id)
          .gte("dia", desdeStr),
      ]);
      if (oeeRes.error) throw oeeRes.error;
      if (paradasRes.error) throw paradasRes.error;
      setLinhas(oeeRes.data || []);

      // Pareto: agrega por motivo no período
      const porMotivo = {};
      for (const p of paradasRes.data || []) {
        const k = p.motivo_parada || "Não informado";
        if (!porMotivo[k]) porMotivo[k] = { motivo: k, ocorrencias: 0, tempo: 0 };
        porMotivo[k].ocorrencias += Number(p.ocorrencias) || 0;
        porMotivo[k].tempo += Number(p.tempo_parada_min) || 0;
      }
      setParadas(Object.values(porMotivo).sort((a, b) => b.tempo - a.tempo));
    } catch (e) {
      console.error("[OeeTab] erro:", e);
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id, dias]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cards = [
    { titulo: "OEE médio", valor: fmtPct(media(linhas, "oee")), icon: Gauge },
    { titulo: "Disponibilidade", valor: fmtPct(media(linhas, "disponibilidade")), icon: Timer },
    { titulo: "Performance", valor: fmtPct(media(linhas, "performance")), icon: Activity },
    { titulo: "Qualidade", valor: fmtPct(media(linhas, "qualidade")), icon: CheckCircle2 },
  ];

  const totalParadaMin = paradas.reduce((a, p) => a + p.tempo, 0);

  return (
    <div className="space-y-4">
      <div className="max-w-[180px]">
        <Label>Período</Label>
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.titulo}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{c.titulo}</div>
                <div className="text-xl font-bold">{loading ? "…" : c.valor}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* OEE por centro/dia */}
        <div>
          <h3 className="font-semibold mb-2">OEE por centro / dia</h3>
          <div className="border rounded-lg overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead>Centro</TableHead>
                  <TableHead className="text-right">Disp.</TableHead>
                  <TableHead className="text-right">Perf.</TableHead>
                  <TableHead className="text-right">Qual.</TableHead>
                  <TableHead className="text-right">OEE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      Sem apontamentos no período — o OEE nasce do apontamento de chão de fábrica
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{fmtData(l.dia)}</TableCell>
                      <TableCell>{l.centro_trabalho_nome || "Sem centro"}</TableCell>
                      <TableCell className="text-right">{fmtPct(l.disponibilidade)}</TableCell>
                      <TableCell className="text-right">{fmtPct(l.performance)}</TableCell>
                      <TableCell className="text-right">{fmtPct(l.qualidade)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtPct(l.oee)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pareto de paradas */}
        <div>
          <h3 className="font-semibold mb-2">
            Paradas por motivo{" "}
            <span className="text-xs text-muted-foreground font-normal">
              ({fmtQtd(totalParadaMin)} min no período)
            </span>
          </h3>
          <div className="border rounded-lg overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Ocorrências</TableHead>
                  <TableHead className="text-right">Tempo (min)</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Nenhuma parada registrada no período
                    </TableCell>
                  </TableRow>
                ) : (
                  paradas.map((p) => (
                    <TableRow key={p.motivo}>
                      <TableCell className="font-medium">{p.motivo}</TableCell>
                      <TableCell className="text-right">{fmtQtd(p.ocorrencias)}</TableCell>
                      <TableCell className="text-right">{fmtQtd(p.tempo)}</TableCell>
                      <TableCell className="text-right">
                        {totalParadaMin > 0
                          ? `${((p.tempo / totalParadaMin) * 100).toFixed(1)}%`
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
