import React from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { detalharTentativa } from "@/lib/ead-tentativa";

const STATUS = {
  acertou: {
    rotulo: "Acertou",
    classe: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  errou: { rotulo: "Errou", classe: "bg-red-50 text-red-700 border-red-200" },
  sem_resposta: {
    rotulo: "Sem resposta",
    classe: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

/**
 * A prova de uma tentativa como o aluno a viu (trilha de auditoria do RH, T18): cada pergunta, na
 * posição em que apareceu, com as alternativas na ordem exibida, a que o aluno marcou e a correta.
 * O que marca a resposta é texto e ícone, não só a cor (leitura em impressão e por leitor de tela).
 * `abertaEm`: hora em que a prova foi aberta (evento `avaliacao_iniciada`), quando há.
 */
export default function ProvaDaTentativa({ tentativa, abertaEm, formatarDataHora }) {
  const { temDetalhe, questoes } = detalharTentativa(tentativa);

  return (
    <div className="space-y-3 rounded-md bg-slate-50 p-3 text-xs">
      <p className="text-slate-500">
        {abertaEm ? `Prova aberta em ${formatarDataHora(abertaEm)} · ` : ""}
        Enviada em {formatarDataHora(tentativa.created_at)}
        {tentativa.dispositivo ? ` · Aparelho: ${tentativa.dispositivo}` : ""}
      </p>

      {!temDetalhe ? (
        <p className="text-slate-500">
          Esta tentativa não guardou o texto da prova, só o resultado ({tentativa.acertos}/
          {tentativa.total} acertos).
        </p>
      ) : (
        <>
          <p className="text-slate-500">
            Questões e alternativas na ordem em que apareceram para o aluno. “Marcada” é a resposta
            dele; “correta” é a do gabarito.
          </p>
          {questoes.some((q) => !q.ordemRegistrada) && (
            <p className="text-amber-700">
              Esta tentativa não registrou a ordem das alternativas exibida ao aluno: aparecem na
              ordem do cadastro da questão.
            </p>
          )}
          <ol className="space-y-3">
            {questoes.map((q, i) => {
              const status = STATUS[q.status];
              return (
                <li key={q.id} className="rounded-md border bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">Questão {q.posicao ?? i + 1}</span>
                    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${status.classe}`}>
                      {status.rotulo}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-slate-800">{q.pergunta}</p>
                  <ul className="mt-2 space-y-1">
                    {q.alternativas.map((a) => {
                      const erradaMarcada = a.marcada && !a.correta;
                      return (
                        <li
                          key={a.indiceOriginal}
                          className={`flex items-start gap-2 rounded px-2 py-1 ${
                            a.correta
                              ? "bg-emerald-50 text-emerald-900"
                              : erradaMarcada
                                ? "bg-red-50 text-red-900"
                                : "text-slate-700"
                          }`}
                        >
                          <span className="w-4 shrink-0 font-mono text-slate-500">{a.letra})</span>
                          <span className="min-w-0 flex-1 break-words">{a.texto}</span>
                          <span className="flex shrink-0 flex-wrap justify-end gap-x-2 text-[11px] font-medium">
                            {a.marcada && (
                              <span className="inline-flex items-center gap-0.5">
                                {a.correta ? (
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <X className="h-3 w-3" aria-hidden="true" />
                                )}
                                marcada
                              </span>
                            )}
                            {a.correta && <span>correta</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
