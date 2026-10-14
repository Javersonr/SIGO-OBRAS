import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Signpost,
} from "lucide-react";
import { apiPortal } from "./api";
import {
  MSG_CASO_RESPOSTA_INVALIDA,
  casoParaTela,
  reacaoAoErroDaAberturaDoCaso,
  reacaoAoErroDoCaso,
  telaConcluida,
  telaDepoisDaEscolha,
} from "@/lib/portal-caso";

/**
 * Caso com decisões (A3): o aluno lê a situação e escolhe, etapa por etapa, só clicando. O caso é do SERVIDOR:
 * `caso_abrir` diz onde ele está (refeito a partir da trilha: recarregar a página retoma de onde parou),
 * `caso_escolher` confere a etapa, grava a escolha e devolve o comentário e a próxima etapa, e `caso_concluir`
 * conclui a aula no fim ("Para refletir"). A escolha insegura mostra o comentário em âmbar e segue para onde o
 * roteiro manda; a segura, em verde.
 *
 * Uma chamada por vez: enquanto `caso_escolher` ou `caso_concluir` está em andamento, as opções e o botão ficam
 * desabilitados (o servidor descarta a escolha repetida, mas a aba que perdesse a corrida receberia uma resposta
 * descartada). Recusa do servidor vale o que ele diz: `CASO_FORA_DE_ORDEM` leva a tela ao estado que ele mandou.
 *
 * `api` é injetada (padrão: o portal de verdade). Na prévia do RT o roteiro anda no navegador, sem gravar nada
 * (lib/portal-previa.js).
 */
export default function CasoPortal({
  api = apiPortal,
  item,
  aula,
  token,
  fila,
  tratarErro,
  onConcluida,
}) {
  const { chamarPortal } = api;
  const [tela, setTela] = useState({ fase: "carregando" });
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ocupadoRef = useRef(false); // uma chamada por vez: dois cliques rápidos não viram duas escolhas
  const abrindoRef = useRef(false); // uma abertura por vez (duplo clique em "Tentar de novo")
  const corpo = (extra = {}) => ({ matricula_id: item.matricula.id, aula_id: aula.id, ...extra });

  const abrir = async (avisoNovo = "") => {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setTela({ fase: "carregando" });
    setAviso("");
    try {
      const r = await fila(() => chamarPortal("caso_abrir", corpo(), token));
      const nova = casoParaTela(r);
      if (!nova) throw new Error(MSG_CASO_RESPOSTA_INVALIDA);
      setTela(nova);
      setAviso(avisoNovo);
    } catch (e) {
      const reacao = reacaoAoErroDaAberturaDoCaso(e);
      if (reacao.acao === "sessao") tratarErro(e);
      else setTela({ fase: "erro", mensagem: reacao.mensagem, definitivo: reacao.definitivo });
    } finally {
      abrindoRef.current = false;
    }
  };

  useEffect(() => {
    abrir();
  }, []);

  // recusa de uma escolha ou da conclusão: vale o que o servidor diz (lib/portal-caso.js)
  const tratarRecusa = async (e) => {
    const reacao = reacaoAoErroDoCaso(e);
    if (reacao.acao === "sessao") tratarErro(e);
    else if (reacao.acao === "tela") {
      setTela(reacao.tela);
      setAviso(reacao.aviso);
    } else if (reacao.acao === "reabrir") await abrir(reacao.aviso);
    else if (reacao.acao === "erro") {
      setTela({ fase: "erro", mensagem: reacao.mensagem, definitivo: reacao.definitivo });
    } else setAviso(reacao.mensagem);
  };

  const enviar = async (acao, extra, aoResponder) => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setEnviando(true);
    setAviso("");
    try {
      const r = await fila(() => chamarPortal(acao, corpo(extra), token));
      aoResponder(r);
    } catch (e) {
      await tratarRecusa(e);
    } finally {
      ocupadoRef.current = false;
      setEnviando(false);
    }
  };

  const escolher = (indice) => {
    if (tela.fase !== "etapa") return undefined;
    const atual = tela;
    return enviar("caso_escolher", { etapa_id: atual.etapa.id, opcao: indice }, (r) => {
      const nova = telaDepoisDaEscolha(atual, r, indice);
      if (!nova) throw new Error(MSG_CASO_RESPOSTA_INVALIDA);
      setTela(nova);
    });
  };

  const continuar = () => {
    if (tela.fase === "comentario") setTela(tela.seguinte);
  };

  const concluir = () => {
    if (tela.fase !== "fim") return undefined;
    const atual = tela;
    return enviar("caso_concluir", {}, (r) => {
      setTela(telaConcluida(atual));
      onConcluida?.(r);
    });
  };

  return (
    <CasoNaTela
      tela={tela}
      aviso={aviso}
      enviando={enviando}
      onEscolher={escolher}
      onContinuar={continuar}
      onConcluir={concluir}
      onTentar={() => abrir()}
    />
  );
}

/** Comentário de uma escolha: verde na segura, âmbar na insegura. */
function ComentarioDaEscolha({ comentario, segura }) {
  return (
    <div
      role="status"
      className={`rounded-lg border p-3 text-sm space-y-1 ${
        segura
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold flex items-center gap-2">
        {segura ? (
          <ShieldCheck className="w-4 h-4 shrink-0" />
        ) : (
          <ShieldAlert className="w-4 h-4 shrink-0" />
        )}
        {segura ? "Escolha segura" : "Escolha insegura"}
      </p>
      <p className="whitespace-pre-wrap">{comentario}</p>
    </div>
  );
}

/** O caso na tela, a partir do estado montado em lib/portal-caso.js (sem rede: os testes o desenham direto). */
export function CasoNaTela({
  tela,
  aviso = "",
  enviando = false,
  onEscolher,
  onContinuar,
  onConcluir,
  onTentar,
}) {
  const mostraContexto =
    ["etapa", "comentario", "fim", "concluido"].includes(tela.fase) && !!tela.contexto;
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-lg">
        <Signpost className="w-5 h-5 text-sky-600" /> Estudo de caso
      </h2>

      {mostraContexto && (
        <div className="bg-white rounded-lg border p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Situação</p>
          <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
            {tela.contexto}
          </p>
        </div>
      )}

      {aviso && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          {aviso}
        </p>
      )}

      {tela.fase === "carregando" && (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Abrindo o caso...
        </p>
      )}

      {tela.fase === "erro" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{tela.mensagem}</span>
          </p>
          {!tela.definitivo && (
            <Button type="button" variant="outline" className="bg-white" onClick={onTentar}>
              <RotateCcw /> Tentar de novo
            </Button>
          )}
        </div>
      )}

      {tela.fase === "etapa" && (
        <div className="space-y-2">
          {tela.ultimo && (
            <>
              <p className="text-xs text-slate-500">Comentário da sua última escolha:</p>
              <ComentarioDaEscolha
                comentario={tela.ultimo.comentario}
                segura={tela.ultimo.segura}
              />
            </>
          )}
          {tela.passagem > 1 && (
            <p className="text-xs text-amber-700">
              Você já passou por esta etapa. Releia a situação antes de escolher.
            </p>
          )}
          <p className="font-medium text-slate-800 whitespace-pre-wrap">{tela.etapa.pergunta}</p>
          <div className="space-y-2">
            {tela.etapa.opcoes.map((op) => (
              <Button
                key={op.indice}
                type="button"
                variant="outline"
                disabled={enviando}
                onClick={() => onEscolher?.(op.indice)}
                className="w-full h-auto min-h-11 justify-start whitespace-normal bg-white py-2 text-left"
              >
                <span className="min-w-0 flex-1 break-words">{op.texto}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {tela.fase === "comentario" && (
        <div className="space-y-2">
          <p className="font-medium text-slate-800 whitespace-pre-wrap">{tela.etapa.pergunta}</p>
          {tela.escolhida && (
            <p className="text-sm text-slate-600">Sua escolha: {tela.escolhida}</p>
          )}
          <ComentarioDaEscolha comentario={tela.comentario} segura={tela.segura} />
          <Button
            type="button"
            className="w-full h-11 bg-slate-900 hover:bg-slate-800"
            onClick={onContinuar}
          >
            Continuar <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {tela.fase === "fim" && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3">
          <p className="flex items-center gap-2 font-semibold text-sky-900">
            <Lightbulb className="w-4 h-4" /> Para refletir
          </p>
          {tela.reflexao && (
            <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
              {tela.reflexao}
            </p>
          )}
          <Button
            type="button"
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
            disabled={enviando}
            onClick={onConcluir}
          >
            {enviando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Concluir caso
          </Button>
        </div>
      )}

      {tela.fase === "concluido" && (
        <div className="space-y-2">
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" /> Caso concluído.
          </p>
          {tela.reflexao && (
            <div className="rounded-lg border bg-white p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Para refletir
              </p>
              <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                {tela.reflexao}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
