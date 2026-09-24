import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageCircleQuestion, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { dispararWhatsApp } from "@/lib/whatsapp";
import { urlPortal } from "@/lib/portal-funcionario-acesso";

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

/** Canal "Fale com o tutor": dúvidas dos funcionários e respostas do RH/instrutor. */
export default function DuvidasTutorCard({ empresaAtiva, cursos, funcPorId, aulas, user }) {
  const [duvidas, setDuvidas] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [salvando, setSalvando] = useState(null);
  const [verRespondidas, setVerRespondidas] = useState(false);

  const carregar = async () => {
    try {
      const ds = await sigo.entities.TreinamentoDuvida.filter({ empresa_id: empresaAtiva.id });
      setDuvidas(ds.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (empresaAtiva?.id) carregar();
  }, [empresaAtiva?.id]);

  const responder = async (d) => {
    const texto = (respostas[d.id] || "").trim();
    if (!texto) return;
    setSalvando(d.id);
    try {
      await sigo.entities.TreinamentoDuvida.update(d.id, {
        resposta: texto,
        respondida_por: user?.full_name || user?.email || null,
        respondida_em: new Date().toISOString(),
      });
      const f = funcPorId.get(d.funcionario_id);
      const curso = cursos.find((c) => c.id === d.curso_id);
      if (f?.telefone) {
        const via = await dispararWhatsApp(
          f.telefone,
          `💬 Sua dúvida no curso "${curso?.nome || ""}" foi respondida. Veja no Portal do Funcionário:\n${urlPortal()}`
        );
        if (via === "evolution") toast.success("📲 Funcionário avisado pelo WhatsApp");
      }
      setRespostas((r) => ({ ...r, [d.id]: "" }));
      toast.success("Resposta enviada");
      carregar();
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setSalvando(null);
    }
  };

  const pendentes = duvidas.filter((d) => !d.resposta);
  const lista = verRespondidas ? duvidas : pendentes;
  const tituloAula = new Map((aulas || []).map((a) => [a.id, a.titulo]));

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5" /> Dúvidas dos alunos
          {pendentes.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              {pendentes.length} sem resposta
            </Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setVerRespondidas(!verRespondidas)}>
          {verRespondidas ? "Só pendentes" : `Ver todas (${duvidas.length})`}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {lista.length === 0 && (
          <p className="text-sm text-slate-500">
            {verRespondidas ? "Nenhuma dúvida ainda." : "Nenhuma dúvida esperando resposta."}
          </p>
        )}
        {lista.map((d) => {
          const f = funcPorId.get(d.funcionario_id);
          const curso = cursos.find((c) => c.id === d.curso_id);
          return (
            <div key={d.id} className="rounded-md border p-3 space-y-2 text-sm">
              <p className="text-xs text-slate-500">
                {fmtDataHora(d.created_at)} · {f?.nome_completo || "—"} · {curso?.nome || "—"}
                {d.aula_id && tituloAula.get(d.aula_id) ? ` · ${tituloAula.get(d.aula_id)}` : ""}
              </p>
              <p className="text-slate-800">{d.pergunta}</p>
              {d.resposta ? (
                <p className="text-emerald-800 bg-emerald-50 rounded p-2">
                  {d.resposta}
                  <span className="block text-xs text-emerald-600 mt-1">
                    {d.respondida_por} · {fmtDataHora(d.respondida_em)}
                  </span>
                </p>
              ) : (
                <div className="flex gap-2 items-end">
                  <Textarea
                    rows={2}
                    value={respostas[d.id] || ""}
                    onChange={(e) => setRespostas((r) => ({ ...r, [d.id]: e.target.value }))}
                    placeholder="Resposta ao funcionário…"
                  />
                  <Button
                    size="sm"
                    onClick={() => responder(d)}
                    disabled={salvando === d.id || !(respostas[d.id] || "").trim()}
                  >
                    {salvando === d.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
