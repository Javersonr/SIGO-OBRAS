import React from "react";
import { Label } from "@/components/ui/label";
import { avisoDoCursoExigido, cursosQuePodemSerPreRequisito } from "@/lib/ead-pre-requisito";

const COLADOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Campo "Pré-requisito" do formulário do curso EAD (T23): o curso que o aluno precisa ter concluído, dentro da
 * validade, antes de ser matriculado neste e para emitir o certificado deste. Exemplo: o NR-10 Complementar (SEP)
 * exige o NR-10 Básico. O pré-requisito fica no curso EAD (não no cadastro central de treinamentos).
 *
 * `curso` é o formulário aberto (`pre_requisito_curso_id` é o valor); `cursos` são todos os cursos vivos da
 * empresa; `onChange(id)` recebe o id escolhido, ou null para "Nenhum". A troca só vale depois de "Salvar curso".
 * A regra de quais cursos aparecem (sem o próprio curso, sem o de apoio, sem fechar um círculo) e dos avisos está
 * em `lib/ead-pre-requisito.js`; o banco recusa o círculo e o curso de outra empresa de qualquer forma.
 */
export default function PreRequisitoCursoCampo({ curso, cursos, onChange }) {
  const atualId = curso?.pre_requisito_curso_id || null;
  const opcoes = cursosQuePodemSerPreRequisito({
    cursoId: curso?.id ?? null,
    cursos,
    atualId,
  }).sort((a, b) => COLADOR.compare(a.nome ?? "", b.nome ?? ""));
  const exigido = atualId ? (cursos ?? []).find((c) => c?.id === atualId) : null;
  // o vínculo aponta para um curso que a lista não tem: ele foi excluído e o aluno nunca cumprirá o pré-requisito
  const sumido = !!atualId && !exigido;
  const aviso = sumido
    ? "O curso exigido foi excluído: ninguém consegue cumprir o pré-requisito. Escolha outro ou deixe em Nenhum."
    : avisoDoCursoExigido(exigido);

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <Label htmlFor="curso-pre-requisito">Pré-requisito</Label>
      <select
        id="curso-pre-requisito"
        className="w-full h-10 rounded border bg-white px-2 text-sm"
        value={atualId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Nenhum</option>
        {sumido && <option value={atualId}>(curso excluído)</option>}
        {opcoes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-600">
        O curso que o funcionário precisa ter concluído, dentro da validade, antes deste. Quem não o
        tiver não pode ser matriculado neste curso e não emite o certificado dele. Exemplo: o NR-10
        Complementar (SEP) exige o NR-10 Básico.
      </p>
      {aviso && (
        <p role="alert" className="text-xs text-amber-700">
          {aviso}
        </p>
      )}
    </div>
  );
}
