import React from "react";
import { CalendarClock, Clock } from "lucide-react";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import { prazoParaOAluno, textoDaDedicacao } from "@/lib/portal-prazo";

/**
 * Prazo para concluir e dedicação diária do curso (T25; NR-1, Anexo II, 3.1 itens j e k): o aluno sabe desde
 * o início quanto tempo por dia reservar e até quando o curso vale. Só informa: passar do prazo não tranca o
 * curso (o RH vê o atraso na tabela de matrículas e decide). Curso sem esses dados, ou já concluído, não
 * desenha nada. As regras e os textos estão em `@/lib/portal-prazo` (testadas).
 *
 * Na prévia do RT ("Ver como aluno") não há matrícula de verdade, então não há data: o prazo sai em dias.
 */
export default function PrazoDoCurso({ item, previa = false, hoje }) {
  const curso = item?.curso;
  if (!curso || item?.matricula?.status === "concluido") return null;

  const prazo = previa
    ? curso.prazo_conclusao_dias
      ? {
          texto: `Prazo para concluir: ${curso.prazo_conclusao_dias} dias, contados da matrícula`,
          tom: "normal",
        }
      : null
    : prazoParaOAluno({ matricula: item.matricula, curso, hoje: hoje || hojeEmBrasilia() });
  const dedicacao = textoDaDedicacao(curso);
  if (!prazo && !dedicacao) return null;

  const corDoPrazo =
    prazo?.tom === "atraso"
      ? "text-red-700"
      : prazo?.tom === "atencao"
        ? "text-amber-700"
        : "text-slate-700";
  return (
    <div
      role="status"
      className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-1"
    >
      {prazo && (
        <p className={`flex items-start gap-2 ${corDoPrazo}`}>
          <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{prazo.texto}</span>
        </p>
      )}
      {dedicacao && (
        <p className="flex items-start gap-2 text-slate-700">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{dedicacao}</span>
        </p>
      )}
    </div>
  );
}
