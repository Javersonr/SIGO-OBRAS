import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { chamarPortal, fmtDataHora } from "./api";

function CorrecaoComentada({ item }) {
  if (!item) return null;
  return (
    <div
      className={`mt-2 rounded-md border p-2 text-sm ${
        item.acertou ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <p className="font-medium flex items-center gap-1">
        {item.acertou ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Você acertou
          </>
        ) : (
          <>
            <XCircle className="w-4 h-4 text-amber-600" /> Resposta certa: {item.resposta_correta}
          </>
        )}
      </p>
      {item.comentario && <p className="text-slate-700 mt-1">{item.comentario}</p>}
    </div>
  );
}

/**
 * Prova do curso. A correção é feita no servidor (o gabarito nunca vem ao
 * navegador); cada envio vira uma tentativa guardada com a prova como estava.
 */
export default function AvaliacaoPortal({ item, token, fila, tratarErro, onFechar }) {
  const questoes = item.questoes || [];
  const av = item.avaliacao || {};
  const [respostas, setRespostas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fila(() =>
      chamarPortal("evento", { evento: "avaliacao_inicio", matricula_id: item.matricula.id }, token)
    ).catch(() => {});
  }, []);

  const enviar = async () => {
    if (questoes.some((q) => respostas[q.id] === undefined)) {
      setErro("Responda todas as questões antes de enviar");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const r = await fila(() =>
        chamarPortal(
          "avaliacao",
          {
            matricula_id: item.matricula.id,
            respostas: questoes.map((q) => ({ questao_id: q.id, resposta: respostas[q.id] })),
          },
          token
        )
      );
      setResultado(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") tratarErro(e);
      else setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-slate-800 text-lg">📝 Avaliação final</h2>
      <p className="text-sm text-slate-500">
        Nota mínima {av.nota_minima}%
        {av.tentativas_max
          ? ` · tentativa ${resultado?.tentativa ?? av.tentativas_usadas + 1} de ${av.tentativas_max}`
          : ""}
      </p>

      {resultado && (
        <div
          className={`rounded-lg border p-4 text-center ${
            resultado.aprovada
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <p className="text-lg font-bold">
            Nota: {resultado.nota}% ({resultado.acertos}/{resultado.total})
          </p>
          <p>
            {resultado.aprovada
              ? "🎉 Aprovado! Veja abaixo a correção comentada."
              : `Não atingiu a nota mínima (${resultado.nota_minima}%).`}
          </p>
          {!resultado.aprovada && resultado.proxima_em && (
            <p className="text-sm mt-1">
              Revise as aulas. Nova tentativa liberada em {fmtDataHora(resultado.proxima_em)}.
            </p>
          )}
          <Button className="mt-3 bg-slate-900" onClick={onFechar}>
            {resultado.aprovada ? "Continuar" : "Voltar às aulas"}
          </Button>
        </div>
      )}

      {questoes.map((q, qi) => (
        <div key={q.id} className="bg-white border rounded-lg p-3">
          <p className="font-medium text-sm mb-2">
            {qi + 1}. {q.pergunta}
          </p>
          <div className="space-y-1">
            {(q.opcoes || []).map((o, i) => (
              <label key={i} className="flex items-start gap-2 text-sm cursor-pointer p-1">
                <input
                  type="radio"
                  name={q.id}
                  className="mt-1"
                  checked={respostas[q.id] === i}
                  onChange={() => setRespostas((r) => ({ ...r, [q.id]: i }))}
                  disabled={!!resultado}
                />
                <span>
                  {String.fromCharCode(65 + i)}) {o}
                </span>
              </label>
            ))}
          </div>
          <CorrecaoComentada item={resultado?.revisao?.find((r) => r.questao_id === q.id)} />
        </div>
      ))}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!resultado && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button onClick={enviar} className="flex-1 bg-slate-900 h-11" disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar avaliação
          </Button>
        </div>
      )}
    </div>
  );
}
