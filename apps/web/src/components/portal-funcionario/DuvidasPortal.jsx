import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleQuestion, Loader2, RefreshCw, User, Clock } from "lucide-react";
import { apiPortal, fmtDataHora } from "./api";
import { tutorDoCurso } from "@/lib/ead-tutor";
import { numerarAulas } from "@/lib/portal-curso";
import {
  mensagemDuvidaEnviada,
  resumoDasDuvidas,
  rotuloDaAulaDaDuvida,
  textoDoResumo,
} from "@/lib/portal-duvidas";

const horaDeAgora = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * "Fale com o tutor": a dúvida fica registrada e o tutor é avisado. O cartão mostra quem é o tutor e quando ele
 * atende (nome e atendimento do curso, cadastrados pelo RH; o telefone nunca vem ao aluno), a aula de cada
 * dúvida e a resposta. O aluno vê a resposta sem sair do curso: depois de enviar a tela se atualiza, e o botão
 * "Atualizar" busca as respostas novas (T21). Na prévia do responsável técnico (`api.previa`) o cartão aparece
 * como o aluno vê, mas não envia nada (e não há o que atualizar).
 */
export default function DuvidasPortal({
  item,
  token,
  aulaId,
  recarregar,
  tratarErro,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  // hora da última atualização que o aluno pediu e aviso de que ela falhou (a lista pode estar velha)
  const [atualizadoAs, setAtualizadoAs] = useState("");
  const [falhaAoAtualizar, setFalhaAoAtualizar] = useState(false);
  const duvidas = item.duvidas || [];
  // o servidor não numera as aulas: o número é a posição na lista, o mesmo que o aluno vê no curso
  const aulas = numerarAulas(item.aulas);
  const tutor = tutorDoCurso(item.curso);
  const resumo = textoDoResumo(resumoDasDuvidas(duvidas));
  // a dúvida nova vai ligada à aula que está aberta (ou ao curso todo)
  const aulaDaNova = rotuloDaAulaDaDuvida({ aula_id: aulaId }, aulas);

  const enviar = async () => {
    setErro("");
    setOk("");
    setEnviando(true);
    try {
      const resposta = await chamarPortal(
        "duvida",
        { matricula_id: item.matricula.id, aula_id: aulaId || undefined, pergunta },
        token
      );
      setPergunta("");
      setOk(mensagemDuvidaEnviada(resposta?.tutor_avisado === true));
      setFalhaAoAtualizar(false);
      await recarregar();
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") tratarErro(e);
      else setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // Busca os dados de novo (é a mesma busca de "concluir aula"): a resposta do tutor chega sem o aluno sair
  // do curso. O portal devolve null quando a busca falha (e já avisa a sessão vencida).
  const atualizar = async () => {
    setErro("");
    setOk("");
    setAtualizando(true);
    try {
      const dados = await recarregar();
      setFalhaAoAtualizar(!dados);
      if (dados) setAtualizadoAs(horaDeAgora());
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") tratarErro(e);
      else setFalhaAoAtualizar(true);
    } finally {
      setAtualizando(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <p className="font-semibold flex items-center gap-2 text-slate-800 flex-1">
          <MessageCircleQuestion className="w-5 h-5 text-sky-600" /> Fale com o tutor
        </p>
        {!previa && duvidas.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={atualizar}
            disabled={atualizando}
            title="Ver se o tutor já respondeu"
          >
            {atualizando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
          </Button>
        )}
      </div>
      {tutor && (
        <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600 space-y-1">
          {tutor.nome && (
            <p className="flex items-start gap-1.5">
              <User className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
              <span>
                Tutor: <span className="font-medium text-slate-800">{tutor.nome}</span>
              </span>
            </p>
          )}
          {tutor.atendimento && (
            <p className="flex items-start gap-1.5">
              <Clock className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
              <span>Atendimento: {tutor.atendimento}</span>
            </p>
          )}
        </div>
      )}
      {resumo && (
        <p className="text-xs text-slate-500" role="status">
          {resumo}
          {atualizadoAs && !falhaAoAtualizar ? ` (atualizado às ${atualizadoAs})` : ""}
        </p>
      )}
      {falhaAoAtualizar && (
        <p className="text-xs text-red-600" role="alert">
          Não foi possível atualizar agora. Confira sua conexão e tente de novo.
        </p>
      )}
      {duvidas.map((d) => {
        const aulaDaDuvida = rotuloDaAulaDaDuvida(d, aulas);
        return (
          <div key={d.id} className="text-sm border-l-2 border-slate-200 pl-3 space-y-1">
            <p className="text-xs text-slate-400">
              {fmtDataHora(d.created_at)}
              {aulaDaDuvida ? ` · ${aulaDaDuvida}` : ""}
            </p>
            <p className="text-slate-800 whitespace-pre-wrap">{d.pergunta}</p>
            {d.resposta ? (
              <div className="text-emerald-800 bg-emerald-50 rounded p-2">
                <p className="text-xs text-emerald-600">
                  Resposta{d.respondida_em ? ` · ${fmtDataHora(d.respondida_em)}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{d.resposta}</p>
              </div>
            ) : (
              <p className="text-xs text-amber-700">Aguardando resposta do tutor</p>
            )}
          </div>
        );
      })}
      <Textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Escreva sua dúvida sobre o curso ou esta aula…"
        rows={3}
        maxLength={2000}
        disabled={previa}
      />
      <p className="text-xs text-slate-500">
        {aulaDaNova
          ? `A dúvida será enviada com a aula aberta (${aulaDaNova}).`
          : "A dúvida será enviada sobre o curso. Abra uma aula para ligá-la a ela."}
      </p>
      {previa && (
        <p className="text-xs text-slate-500">
          Prévia: aqui o aluno escreve a dúvida e o tutor é avisado. Nada é enviado nesta tela.
        </p>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      <Button
        onClick={enviar}
        disabled={previa || enviando || pergunta.trim().length < 3}
        variant="outline"
        className="w-full"
      >
        {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Enviar dúvida
      </Button>
    </div>
  );
}
