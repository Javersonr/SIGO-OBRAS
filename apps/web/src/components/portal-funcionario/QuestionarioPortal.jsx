import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { apiPortal, armazenamentoPortal } from "./api";
import { CorrecaoComentada } from "./AvaliacaoPortal";
import {
  guardarRascunhoProva,
  lerRascunhoProva,
  limparRascunhoProva,
  resumoRespostas,
} from "@/lib/portal-curso";
import {
  MSG_QUESTIONARIO_INVALIDO,
  detalheDaTentativa,
  idDoRascunhoDoQuestionario,
  questionarioParaTela,
  reacaoAoErroDaAbertura,
  reacaoAoErroDoEnvio,
  resultadoDoQuestionario,
  textoDasFaltas,
  textoDoQuestionarioConcluido,
} from "@/lib/portal-questionario";

/**
 * Questionário do módulo (A2): estudo guiado, com tentativas livres. O questionário é do SERVIDOR: ao abrir, a
 * tela pede `questionario_abrir` e o servidor sorteia questões e alternativas (sem gabarito) ou, com a aula já
 * concluída, devolve a melhor nota. O envio (`questionario_enviar`) leva o índice ORIGINAL de cada resposta; o
 * servidor corrige com a nota mínima do módulo e devolve a correção comentada, aprovado ou não. Aprovado: a aula
 * conclui (`onConcluida(resposta)`); não aprovado: "Tentar de novo" abre uma tentativa nova, já re-sorteada.
 *
 * `api` é injetada (padrão: o portal de verdade). Na prévia do RT (`api.previa`) o sorteio e a correção são
 * locais, as questões chegam com gabarito e comentário (só o RT vê) e nada é guardado no aparelho.
 */
export default function QuestionarioPortal({
  api = apiPortal,
  item,
  aula,
  token,
  fila,
  tratarErro,
  onConcluida,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  // { fase: "carregando" } | { fase: "erro", mensagem, definitivo }
  // | { fase: "concluido", notaMinima, melhorNota, tentativas } | { fase: "respondendo", prova, abertura, aviso }
  const [estado, setEstado] = useState({ fase: "carregando" });
  const abrindoRef = useRef(false); // uma abertura por vez (duplo clique)
  const aberturasRef = useRef(0); // remonta a tentativa quando o questionário é aberto de novo

  const abrir = async (aviso = "") => {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fila(() =>
        chamarPortal(
          "questionario_abrir",
          { matricula_id: item.matricula.id, aula_id: aula.id },
          token
        )
      );
      const tela = questionarioParaTela(resposta, { previa });
      if (!tela) throw new Error(MSG_QUESTIONARIO_INVALIDO);
      aberturasRef.current += 1;
      setEstado({ ...tela, abertura: aberturasRef.current, aviso });
    } catch (e) {
      const reacao = reacaoAoErroDaAbertura(e);
      if (reacao.acao === "sessao") tratarErro(e);
      else setEstado({ fase: "erro", mensagem: reacao.mensagem, definitivo: reacao.definitivo });
    } finally {
      abrindoRef.current = false;
    }
  };

  useEffect(() => {
    abrir();
  }, []);

  if (estado.fase === "respondendo") {
    return (
      <QuestionarioEmAndamento
        key={estado.abertura}
        prova={estado.prova}
        aviso={estado.aviso}
        item={item}
        aula={aula}
        token={token}
        fila={fila}
        tratarErro={tratarErro}
        onReabrir={abrir}
        onConcluida={onConcluida}
        api={api}
      />
    );
  }
  return <SituacaoDoQuestionario estado={estado} onTentar={() => abrir()} />;
}

function CabecalhoDoQuestionario({ detalhe = "" }) {
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-lg">
        <ListChecks className="w-5 h-5 text-violet-600" /> Questionário do módulo
      </h2>
      {detalhe && <p className="text-sm text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Antes das questões: carregando, falha (com ou sem "Tentar de novo") ou a aula já concluída. */
export function SituacaoDoQuestionario({ estado, onTentar }) {
  return (
    <div className="space-y-3">
      <CabecalhoDoQuestionario />
      {estado.fase === "concluido" ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{textoDoQuestionarioConcluido(estado)}</span>
        </div>
      ) : estado.fase === "erro" ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{estado.mensagem}</span>
          </p>
          {!estado.definitivo && (
            <Button type="button" variant="outline" className="bg-white" onClick={onTentar}>
              <RotateCcw /> Tentar de novo
            </Button>
          )}
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Preparando o questionário...
        </p>
      )}
    </div>
  );
}

/**
 * Uma tentativa aberta: as questões na ordem do servidor. As respostas ficam guardadas no aparelho (por
 * matrícula, aula e tentativa): recarregar a página não as perde. Depois do envio, o resultado e a correção
 * comentada; sem aprovação, "Tentar de novo".
 */
export function QuestionarioEmAndamento({
  prova,
  aviso = "",
  item,
  aula,
  token,
  fila,
  tratarErro,
  onReabrir,
  onConcluida,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  const armazenamento = () => (previa ? null : armazenamentoPortal());
  const raizRef = useRef(null);
  const questoes = prova.questoes;
  const idRascunho = idDoRascunhoDoQuestionario(item.matricula.id, aula.id);
  const tentativa = prova.tentativa;
  const [respostas, setRespostas] = useState(() =>
    lerRascunhoProva(armazenamento(), idRascunho, tentativa, questoes)
  ); // questao_id -> índice ORIGINAL
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [destacarFaltas, setDestacarFaltas] = useState(false);
  const resumo = resumoRespostas(questoes, respostas);

  // cada resposta marcada vai para o aparelho (a tentativa enviada não deixa rascunho)
  useEffect(() => {
    if (resultado) return;
    guardarRascunhoProva(armazenamento(), idRascunho, tentativa, respostas);
  }, [respostas, resultado]);

  const enviar = async () => {
    if (resumo.faltam > 0) {
      setDestacarFaltas(true);
      setErro(textoDasFaltas(resumo));
      const el = document.getElementById(`questionario-${questoes[resumo.primeiraSemResposta].id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const r = await fila(() =>
        chamarPortal(
          "questionario_enviar",
          {
            matricula_id: item.matricula.id,
            aula_id: aula.id,
            respostas: questoes.map((q) => ({ questao_id: q.id, resposta: respostas[q.id] })),
          },
          token
        )
      );
      limparRascunhoProva(armazenamento(), idRascunho, tentativa);
      setResultado(r);
      setDestacarFaltas(false);
      raizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (r?.aprovada === true) onConcluida?.(r);
    } catch (e) {
      const reacao = reacaoAoErroDoEnvio(e);
      if (reacao.acao === "sessao") tratarErro(e);
      else if (reacao.acao === "reabrir") onReabrir(reacao.aviso);
      else if (reacao.acao === "concluido") {
        onConcluida?.({});
        onReabrir();
      } else setErro(reacao.mensagem);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div ref={raizRef} className="space-y-3">
      <CabecalhoDoQuestionario detalhe={detalheDaTentativa(prova)} />

      {aviso && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          {aviso}
        </p>
      )}

      {resultado ? (
        <ResultadoDoQuestionario resultado={resultado} onTentarDeNovo={() => onReabrir()} />
      ) : (
        <p className="text-sm font-medium text-slate-700">
          {resumo.respondidas} de {resumo.total} respondidas
        </p>
      )}

      <QuestoesDoQuestionario
        prova={prova}
        respostas={respostas}
        resultado={resultado}
        previa={previa}
        destacarFaltas={destacarFaltas && !resultado}
        onMarcar={(id, indice) => setRespostas((r) => ({ ...r, [id]: indice }))}
      />

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      {!resultado && (
        <Button onClick={enviar} className="w-full bg-slate-900 h-11" disabled={enviando}>
          {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Enviar respostas
        </Button>
      )}
    </div>
  );
}

/** As questões da tentativa; depois do envio, travadas e com a correção comentada de cada uma. */
export function QuestoesDoQuestionario({
  prova,
  respostas,
  resultado = null,
  previa = false,
  destacarFaltas = false,
  onMarcar,
}) {
  return (
    <div className="space-y-3">
      {prova.questoes.map((q, qi) => {
        const marcada = respostas?.[q.id];
        const faltando = destacarFaltas && !Number.isInteger(marcada);
        return (
          <div
            key={q.id}
            id={`questionario-${q.id}`}
            tabIndex={-1}
            className={`bg-white border rounded-lg p-3 outline-none ${
              faltando ? "border-red-300 ring-1 ring-red-200" : ""
            }`}
          >
            <p className="font-medium text-sm mb-2">
              {qi + 1}. {q.pergunta}
            </p>
            <div className="space-y-1">
              {q.exibicao.map((op, pos) => (
                <label
                  key={op.indice}
                  className="flex items-start gap-2 text-sm cursor-pointer p-1"
                >
                  <input
                    type="radio"
                    name={`questionario-${prova.tentativa}-${q.id}`}
                    className="mt-1"
                    checked={marcada === op.indice}
                    onChange={() => onMarcar?.(q.id, op.indice)}
                    disabled={!!resultado}
                  />
                  <span>
                    {String.fromCharCode(65 + pos)}) {op.texto}
                    {previa && op.indice === q.correta && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> gabarito
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {previa && !resultado && q.comentario && (
              <p className="mt-2 rounded-md border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-900">
                <span className="font-medium">Comentário (o aluno vê depois de enviar):</span>{" "}
                {q.comentario}
              </p>
            )}
            {faltando && <p className="text-xs text-red-600 mt-1">Falta responder esta questão.</p>}
            <CorrecaoComentada item={resultado?.revisao?.find?.((r) => r.questao_id === q.id)} />
          </div>
        );
      })}
    </div>
  );
}

/** Placar depois do envio; o não aprovado vê quantos acertos faltam e "Tentar de novo". */
export function ResultadoDoQuestionario({ resultado, onTentarDeNovo }) {
  const final = resultadoDoQuestionario(resultado);
  return (
    <div
      role="status"
      className={`rounded-lg border p-4 text-center space-y-1 ${
        final.aprovada
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <p className="text-lg font-bold">{final.titulo}</p>
      <p className="text-sm">{final.mensagem}</p>
      {!final.aprovada && (
        <Button type="button" className="mt-2 bg-slate-900" onClick={onTentarDeNovo}>
          <RotateCcw /> Tentar de novo
        </Button>
      )}
    </div>
  );
}
