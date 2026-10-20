import React from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const letra = (i) => String.fromCharCode(65 + i);

/**
 * Lista de questões de múltipla escolha com o editor, na aba Treinamentos EAD: a avaliação final do curso e cada
 * questionário de módulo (atividades interativas) usam a mesma tela. O gabarito é conferido por quem grava
 * (`onSalvar` usa `normalizarQuestao`, lib/ead-questao.js); aqui só se desenha e se edita o rascunho.
 *
 * - `questoes`: em ordem. `rascunho`: a questão aberta no editor ({ id?, aula_id?, pergunta, opcoes, correta,
 *   comentario }) ou null. `onRascunho(rascunho | null)` abre, muda e fecha o editor.
 * - `podeEditar`: sem a função Editar a lista só mostra (sem botões nem editor).
 * - `grupo`: nome único dos botões de rádio da alternativa correta (a prova e cada questionário têm o seu).
 * - `dicaDoComentario`: quando o aluno vê o comentário (na prova, depois da aprovação; no questionário, na
 *   correção de cada envio). `vazio`: o texto da lista sem questões.
 */
export default function QuestoesEad({
  questoes = [],
  rascunho = null,
  onRascunho,
  onSalvar,
  onExcluir,
  salvando = false,
  podeEditar = false,
  grupo = "correta",
  dicaDoComentario = "Comentário da resposta",
  vazio = "",
}) {
  const mudar = (campos) => onRascunho({ ...rascunho, ...campos });

  return (
    <div className="space-y-2">
      {questoes.length === 0 && vazio ? <p className="text-xs text-slate-500">{vazio}</p> : null}
      {questoes.map((q, qi) => (
        <div key={q.id} className="text-sm bg-slate-50 rounded p-2">
          <div className="flex items-start gap-2">
            <span className="flex-1 font-medium">
              {qi + 1}. {q.pergunta}
            </span>
            {podeEditar && (
              <>
                <button
                  type="button"
                  title="Editar questão"
                  aria-label={`Editar a questão ${qi + 1}`}
                  onClick={() =>
                    onRascunho({
                      id: q.id,
                      aula_id: q.aula_id ?? null,
                      pergunta: q.pergunta || "",
                      opcoes:
                        Array.isArray(q.opcoes) && q.opcoes.length >= 2 ? [...q.opcoes] : ["", ""],
                      correta: q.correta ?? 0,
                      comentario: q.comentario || "",
                    })
                  }
                >
                  <Pencil className="w-4 h-4 text-slate-400 hover:text-slate-800" />
                </button>
                <button
                  type="button"
                  title="Excluir questão"
                  aria-label={`Excluir a questão ${qi + 1}`}
                  onClick={() => onExcluir(q)}
                >
                  <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                </button>
              </>
            )}
          </div>
          <ul className="mt-1 ml-4 space-y-0.5">
            {(q.opcoes || []).map((o, i) => (
              <li
                key={i}
                className={i === q.correta ? "text-emerald-700 font-medium" : "text-slate-600"}
              >
                {letra(i)}) {o}
                {i === q.correta && (
                  <>
                    <Check className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only"> (correta)</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {q.comentario && (
            <p className="mt-1 ml-4 flex items-start gap-1 text-xs italic text-slate-500">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {q.comentario}
            </p>
          )}
        </div>
      ))}
      {podeEditar && rascunho && (
        <div className="border rounded-lg p-3 space-y-2 bg-white">
          <Input
            placeholder="Pergunta"
            aria-label="Pergunta"
            value={rascunho.pergunta}
            onChange={(e) => mudar({ pergunta: e.target.value })}
            className="h-9"
          />
          {rascunho.opcoes.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={grupo}
                checked={rascunho.correta === i}
                onChange={() => mudar({ correta: i })}
                title="Marcar como correta"
                aria-label={`Marcar a opção ${letra(i)} como correta`}
              />
              <Input
                placeholder={`Opção ${letra(i)}`}
                value={o}
                onChange={(e) => {
                  const opcoes = [...rascunho.opcoes];
                  opcoes[i] = e.target.value;
                  mudar({ opcoes });
                }}
                className="h-8"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover opção ${letra(i)}`}
                disabled={rascunho.opcoes.length <= 2}
                onClick={() =>
                  mudar({
                    opcoes: rascunho.opcoes.filter((_, indice) => indice !== i),
                    correta:
                      rascunho.correta === i
                        ? -1
                        : rascunho.correta > i
                          ? rascunho.correta - 1
                          : rascunho.correta,
                  })
                }
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={rascunho.opcoes.length >= 6}
            onClick={() => mudar({ opcoes: [...rascunho.opcoes, ""] })}
          >
            <Plus className="w-4 h-4 mr-1" /> Adicionar alternativa
          </Button>
          <Input
            placeholder={dicaDoComentario}
            aria-label="Comentário da resposta"
            value={rascunho.comentario || ""}
            onChange={(e) => mudar({ comentario: e.target.value })}
            className="h-9"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onRascunho(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSalvar} disabled={salvando}>
              Salvar questão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
