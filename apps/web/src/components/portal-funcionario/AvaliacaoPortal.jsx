import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { apiPortal, fmtDataHora, armazenamentoPortal } from "./api";
import {
  avisoDaProvaReaberta,
  guardarRascunhoProva,
  lerRascunhoProva,
  limparRascunhoProva,
  mensagemDeFalha,
  provaParaTela,
  provaPrecisaReabrir,
  resumoDoResultado,
  resumoRespostas,
  textoSairDaProva,
} from "@/lib/portal-curso";

const MSG_PROVA_INVALIDA =
  "A prova chegou incompleta. Tente de novo; se continuar, avise o RH para conferir as questões do curso.";

// O servidor já decidiu: tentar de novo não adianta (a tela de aulas mostra a situação atual)
const SEM_NOVA_TENTATIVA = new Set(["LIMITE_TENTATIVAS", "AGUARDAR"]);

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
 * Prova do curso. A prova é do SERVIDOR: ao abrir, a tela pede `iniciar_avaliacao`, e o servidor sorteia
 * a ordem das questões e das alternativas, registra o início na trilha e devolve as questões SEM
 * gabarito. O navegador não sorteia nem informa a ordem exibida. A correção também é no servidor (o
 * gabarito só aparece depois de aprovado); cada envio vira uma tentativa guardada com a prova como estava.
 * O reprovado vê "insatisfatório", as tentativas e a próxima liberação (e a nota, enquanto o servidor a
 * mandar; D10: o reprovado só vê "insatisfatório", `REPROVADO_VE_NOTA` em regras.ts).
 *
 * Esta peça só abre a prova (carregando, erro, ou a prova pronta); a prova em si é `ProvaEmAndamento`.
 * Se o servidor recusar o envio porque a prova não vale mais (não estava iniciada nesta tentativa, ou o
 * RH mexeu nas questões), a prova é aberta de novo e as respostas que ainda valem continuam marcadas.
 *
 * `api` é injetada (padrão: o portal de verdade). Na prévia do responsável técnico (`api.previa`) o
 * sorteio é local e as questões chegam COM `correta` e `comentario`: a tela marca o gabarito e mostra o
 * comentário (só o RT vê), a correção é feita na hora, sem servidor, e nada é guardado no aparelho.
 */
export default function AvaliacaoPortal({
  item,
  token,
  fila,
  tratarErro,
  onFechar,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  // { fase: "carregando" } | { fase: "erro", mensagem, definitivo } | { fase: "pronta", prova, abertura, aviso }
  const [estado, setEstado] = useState({ fase: "carregando" });
  const abrindoRef = useRef(false); // uma abertura por vez (duplo clique, recarga)
  const aberturasRef = useRef(0); // remonta a prova quando ela é aberta de novo

  const abrirProva = async (aviso = "") => {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fila(() =>
        chamarPortal("iniciar_avaliacao", { matricula_id: item.matricula.id }, token)
      );
      const prova = provaParaTela(resposta, { previa });
      if (!prova) throw new Error(MSG_PROVA_INVALIDA);
      aberturasRef.current += 1;
      setEstado({ fase: "pronta", prova, abertura: aberturasRef.current, aviso });
    } catch (e) {
      if (e?.codigo === "SESSAO" || e?.codigo === "TROCAR_SENHA") tratarErro(e);
      else {
        setEstado({
          fase: "erro",
          mensagem: mensagemDeFalha(e),
          definitivo: SEM_NOVA_TENTATIVA.has(e?.codigo),
        });
      }
    } finally {
      abrindoRef.current = false;
    }
  };

  useEffect(() => {
    abrirProva();
  }, []);

  if (estado.fase === "pronta") {
    return (
      <ProvaEmAndamento
        key={estado.abertura}
        prova={estado.prova}
        aviso={estado.aviso}
        item={item}
        token={token}
        fila={fila}
        tratarErro={tratarErro}
        onFechar={onFechar}
        onReabrir={abrirProva}
        api={api}
      />
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-slate-800 text-lg">Avaliação final</h2>
      {estado.fase === "carregando" ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Preparando a prova...
        </p>
      ) : (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
          <p className="text-sm text-red-700">{estado.mensagem}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="bg-white" onClick={onFechar}>
              Voltar às aulas
            </Button>
            {!estado.definitivo && (
              <Button className="flex-1 bg-slate-900" onClick={() => abrirProva()}>
                Tentar de novo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A prova já aberta: questões e alternativas na ordem que o servidor sorteou (`prova`, de
 * `provaParaTela`). As respostas da tentativa em andamento ficam guardadas no navegador (por matrícula e
 * tentativa): recarregar a página ou voltar às aulas não as perde. Como as respostas vão pelo índice
 * ORIGINAL da alternativa, valem mesmo quando a prova é sorteada de novo.
 */
export function ProvaEmAndamento({
  prova,
  aviso = "",
  item,
  token,
  fila,
  tratarErro,
  onFechar,
  onReabrir,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  const armazenamento = () => (previa ? null : armazenamentoPortal());
  const raizRef = useRef(null);
  const questoes = prova.questoes;
  const av = item.avaliacao || {};
  const matriculaId = item.matricula.id;
  // número da tentativa que o servidor abriu; depois de enviada, a próxima começa sem rascunho
  const tentativa = prova.tentativa;
  const notaMinima = prova.notaMinima ?? av.nota_minima;
  const tentativasMax = prova.tentativasMax ?? av.tentativas_max;
  const [respostas, setRespostas] = useState(() =>
    lerRascunhoProva(armazenamento(), matriculaId, tentativa, questoes)
  ); // questao_id -> índice ORIGINAL
  const [recuperadas] = useState(() => Object.keys(respostas).length);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // depois de tentar enviar incompleta, as questões sem resposta ficam destacadas
  const [destacarFaltas, setDestacarFaltas] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  const resumo = resumoRespostas(questoes, respostas);
  const respondeu = (q) => Number.isInteger(respostas[q.id]);
  const final = resultado ? resumoDoResultado(resultado) : null;

  // cada resposta marcada vai para o navegador (a prova já enviada não deixa rascunho)
  useEffect(() => {
    if (resultado) return;
    guardarRascunhoProva(armazenamento(), matriculaId, tentativa, respostas);
  }, [respostas, resultado]);

  const irParaQuestao = (id) => {
    const el = document.getElementById(`questao-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };

  const enviar = async () => {
    if (resumo.faltam > 0) {
      setDestacarFaltas(true);
      setErro(
        `Responda todas as questões antes de enviar: ${
          resumo.faltam === 1 ? "falta 1" : `faltam ${resumo.faltam}`
        } (a primeira sem resposta é a questão ${resumo.primeiraSemResposta + 1}).`
      );
      irParaQuestao(questoes[resumo.primeiraSemResposta].id);
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      // só o que o aluno marcou: a ordem exibida e o início da prova são do servidor
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
      limparRascunhoProva(armazenamento(), matriculaId, tentativa);
      setResultado(r);
      setDestacarFaltas(false);
      // na prévia a tela rola dentro da gaveta, não na janela
      if (previa) raizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") tratarErro(e);
      // a prova aberta não vale mais: abre de novo, com as respostas que ainda valem
      else if (provaPrecisaReabrir(e)) onReabrir(avisoDaProvaReaberta(e));
      else setErro(mensagemDeFalha(e));
    } finally {
      setEnviando(false);
    }
  };

  const pedirSaida = () => {
    // sem nenhuma resposta não há o que perder; com respostas, o aluno confirma antes de sair
    if (resumo.respondidas > 0) setConfirmandoSaida(true);
    else onFechar();
  };

  return (
    <div ref={raizRef} className="space-y-3">
      <h2 className="font-semibold text-slate-800 text-lg">Avaliação final</h2>
      <p className="text-sm text-slate-500">
        Nota mínima {notaMinima}%
        {tentativasMax ? ` · tentativa ${tentativa} de ${tentativasMax}` : ""}
      </p>

      {aviso && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          {aviso}
        </p>
      )}

      {!resultado && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-slate-50/95 backdrop-blur border-b border-slate-200">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-800">
              {resumo.respondidas} de {resumo.total} respondidas
            </span>
            {resumo.faltam > 0 && (
              <span className="text-xs text-slate-500">
                {resumo.faltam === 1 ? "falta 1 questão" : `faltam ${resumo.faltam} questões`}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-[width]"
              style={{
                width: `${resumo.total ? Math.round((resumo.respondidas * 100) / resumo.total) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {!resultado && recuperadas > 0 && (
        <p className="text-xs text-slate-500">
          {recuperadas === 1
            ? "Recuperamos a resposta que você já tinha marcado nesta prova."
            : `Recuperamos as ${recuperadas} respostas que você já tinha marcado nesta prova.`}
        </p>
      )}

      {final && (
        <div
          className={`rounded-lg border p-4 text-center ${
            final.aprovada
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <p className="text-lg font-bold">{final.titulo}</p>
          <p>{final.mensagem}</p>
          {final.tentativas && <p className="text-sm mt-1">{final.tentativas}</p>}
          {!final.aprovada && !final.esgotada && resultado.proxima_em && (
            <p className="text-sm mt-1">
              Revise as aulas. Nova tentativa liberada em {fmtDataHora(resultado.proxima_em)}.
            </p>
          )}
          <Button className="mt-3 bg-slate-900" onClick={onFechar}>
            {final.aprovada ? "Continuar" : "Voltar às aulas"}
          </Button>
        </div>
      )}

      {questoes.map((q, qi) => {
        const faltando = destacarFaltas && !resultado && !respondeu(q);
        return (
          <div
            key={q.id}
            id={`questao-${q.id}`}
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
                    name={q.id}
                    className="mt-1"
                    checked={respostas[q.id] === op.indice}
                    onChange={() => setRespostas((r) => ({ ...r, [q.id]: op.indice }))}
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
            {previa && !resultado?.revisao && q.comentario && (
              <p className="mt-2 rounded-md border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-900">
                <span className="font-medium">Comentário (o aluno só vê depois de aprovado):</span>{" "}
                {q.comentario}
              </p>
            )}
            {faltando && <p className="text-xs text-red-600 mt-1">Falta responder esta questão.</p>}
            <CorrecaoComentada item={resultado?.revisao?.find((r) => r.questao_id === q.id)} />
          </div>
        );
      })}

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      {!resultado &&
        (confirmandoSaida ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"
          >
            <p className="text-sm text-amber-900">
              {textoSairDaProva({
                respondidas: resumo.respondidas,
                total: resumo.total,
                previa,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 bg-white"
                onClick={() => setConfirmandoSaida(false)}
              >
                Continuar a prova
              </Button>
              <Button className="flex-1 bg-slate-900" onClick={onFechar}>
                Voltar às aulas
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={pedirSaida} disabled={enviando}>
              Voltar
            </Button>
            <Button onClick={enviar} className="flex-1 bg-slate-900 h-11" disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar avaliação
            </Button>
          </div>
        ))}
    </div>
  );
}
