import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleQuestion, Loader2 } from "lucide-react";
import { chamarPortal, fmtDataHora } from "./api";

/** "Fale com o tutor": a dúvida fica registrada e o tutor é avisado. */
export default function DuvidasPortal({ item, token, aulaId, recarregar, tratarErro }) {
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const duvidas = item.duvidas || [];

  const enviar = async () => {
    setErro("");
    setOk("");
    setEnviando(true);
    try {
      await chamarPortal(
        "duvida",
        { matricula_id: item.matricula.id, aula_id: aulaId || undefined, pergunta },
        token
      );
      setPergunta("");
      setOk("Dúvida enviada. A resposta aparece aqui.");
      await recarregar();
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") tratarErro(e);
      else setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <p className="font-semibold flex items-center gap-2 text-slate-800">
        <MessageCircleQuestion className="w-5 h-5 text-sky-600" /> Fale com o tutor
      </p>
      {duvidas.map((d) => (
        <div key={d.id} className="text-sm border-l-2 border-slate-200 pl-3 space-y-1">
          <p className="text-slate-800">
            <span className="text-xs text-slate-400">{fmtDataHora(d.created_at)} · </span>
            {d.pergunta}
          </p>
          {d.resposta ? (
            <p className="text-emerald-800 bg-emerald-50 rounded p-2">
              <span className="text-xs text-emerald-600">Resposta · </span>
              {d.resposta}
            </p>
          ) : (
            <p className="text-xs text-amber-700">Aguardando resposta do tutor</p>
          )}
        </div>
      ))}
      <Textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Escreva sua dúvida sobre o curso ou esta aula…"
        rows={3}
        maxLength={2000}
      />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      <Button
        onClick={enviar}
        disabled={enviando || pergunta.trim().length < 3}
        variant="outline"
        className="w-full"
      >
        {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Enviar dúvida
      </Button>
    </div>
  );
}
