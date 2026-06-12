import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/sigoClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck, ShieldOff, Loader2, AlertTriangle } from "lucide-react";

const PODE_REVOGAR = ["Admin", "Admin Holding", "Gestor"];

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Lista as liberações SST excepcionais ativas (ASO/NR vencido liberado por
// Admin/Gestor) e permite REVOGAR — fechando o loop de compliance da decisão
// nº 1 do dono. Backend: revogar_liberacao_sst (0071).
export default function LiberacoesSSTAtivas({ empresaAtiva, perfil }) {
  const [liberacoes, setLiberacoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [alvo, setAlvo] = useState(null); // liberação a revogar
  const [motivo, setMotivo] = useState("");
  const [processando, setProcessando] = useState(false);

  const podeRevogar = PODE_REVOGAR.includes(perfil);

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id || !supabase) return;
    setCarregando(true);
    try {
      const { data: libs, error } = await supabase
        .from("liberacao_sst")
        .select(
          "id, funcionario_id, motivo, valido_ate, liberado_por_nome, liberado_por_email, created_at"
        )
        .eq("empresa_id", empresaAtiva.id)
        .is("deleted_at", null)
        .order("valido_ate", { ascending: true });
      if (error) throw error;

      const ids = [...new Set((libs || []).map((l) => l.funcionario_id))];
      let nomePorId = {};
      if (ids.length > 0) {
        const { data: funcs } = await supabase
          .from("funcionario")
          .select("id, nome_completo")
          .in("id", ids);
        nomePorId = Object.fromEntries((funcs || []).map((f) => [f.id, f.nome_completo]));
      }
      setLiberacoes(
        (libs || []).map((l) => ({ ...l, funcionario_nome: nomePorId[l.funcionario_id] || "—" }))
      );
    } catch (err) {
      console.error("[LiberacoesSST] erro:", err);
      alert("❌ Erro ao carregar liberações: " + (err?.message || ""));
    } finally {
      setCarregando(false);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirRevogar = (lib) => {
    setAlvo(lib);
    setMotivo("");
  };

  const confirmarRevogar = async () => {
    if (motivo.trim().length < 5) {
      alert("Informe a justificativa da revogação (mín. 5 caracteres).");
      return;
    }
    setProcessando(true);
    try {
      const { error } = await supabase.rpc("revogar_liberacao_sst", {
        p_liberacao_id: alvo.id,
        p_motivo: motivo.trim(),
        p_perfil: perfil,
      });
      if (error) throw error;
      setAlvo(null);
      await carregar();
    } catch (err) {
      console.error("[LiberacoesSST] revogar erro:", err);
      alert("❌ " + (err?.message || "Erro ao revogar liberação"));
    } finally {
      setProcessando(false);
    }
  };

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold">Liberações SST excepcionais ativas</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Funcionários com ASO/NR vencido liberados para campo por exceção. Toda liberação é
        notificada aos gestores. Admin/Gestor pode revogar a qualquer momento — ao revogar, o
        funcionário volta a ser bloqueado se a pendência continuar.
      </p>

      {carregando ? (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : liberacoes.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">
          Nenhuma liberação excepcional ativa. 👍
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Válido até</TableHead>
                <TableHead>Liberado por</TableHead>
                {podeRevogar && <TableHead className="w-24 text-right">Ação</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {liberacoes.map((l) => {
                const vencida = l.valido_ate && l.valido_ate < hoje;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.funcionario_nome}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={l.motivo}>
                      {l.motivo}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge
                        className={
                          vencida
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }
                      >
                        {vencida && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {fmtData(l.valido_ate)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {l.liberado_por_nome || l.liberado_por_email || "—"}
                    </TableCell>
                    {podeRevogar && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => abrirRevogar(l)}
                        >
                          <ShieldOff className="w-4 h-4 mr-1" /> Revogar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="w-5 h-5 text-red-600" /> Revogar liberação SST
            </DialogTitle>
            <DialogDescription>
              Revogar a liberação de <span className="font-medium">{alvo?.funcionario_nome}</span>.
              O funcionário volta a ser bloqueado para campo se o ASO/NR continuar vencido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Justificativa da revogação *</Label>
            <Textarea
              rows={3}
              placeholder="Ex.: ASO regularizado / liberação concedida por engano"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)} disabled={processando}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmarRevogar}
              disabled={processando || motivo.trim().length < 5}
            >
              <ShieldOff className="w-4 h-4 mr-2" />
              {processando ? "Revogando..." : "Confirmar Revogação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
