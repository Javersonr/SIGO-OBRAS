import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ClipboardCheck, Loader2, RefreshCw, XCircle } from "lucide-react";
import { apiPortal } from "./api";
import {
  MARCADOS_VAZIOS,
  corpoDaDeclaracao,
  itensFaltando,
  todosMarcados,
  tratamentoDoErroDaDeclaracao,
} from "@/lib/portal-declaracao";
import { ITENS_DA_DECLARACAO } from "@/lib/ead-declaracao-ambiente";

/**
 * O miolo da declaração de ambiente e horário (T35; NR-1, Anexo II, 4.3 e 4.4): a orientação do responsável técnico
 * (RT), a ART dele se houver, e os três itens que o aluno marca. Só apresentação: quem decide o que o botão faz é
 * quem usa. Na tela do RT ("Como o aluno vê") `previa` deixa o botão parado e avisa que nada é gravado.
 */
export function DeclaracaoAmbienteConteudo({
  declaracao,
  marcados,
  onMarcar,
  onConfirmar,
  enviando = false,
  previa = false,
}) {
  const faltam = itensFaltando(marcados);
  const liberado = todosMarcados(marcados) && !enviando && !previa;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p
          className="text-sm text-slate-800 whitespace-pre-line leading-relaxed"
          data-testid="texto-da-declaracao"
        >
          {declaracao.texto}
        </p>
        {declaracao.art && (
          <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">
            ART do responsável técnico: <strong>{declaracao.art}</strong>
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-slate-800">Eu declaro que:</legend>
        {ITENS_DA_DECLARACAO.map((i) => (
          <label
            key={i.id}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50"
          >
            <input
              type="checkbox"
              checked={marcados?.[i.id] === true}
              onChange={(e) => onMarcar(i.id, e.target.checked)}
              disabled={enviando}
              className="mt-0.5 h-5 w-5 shrink-0 accent-slate-900"
            />
            <span>{i.rotulo}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={onConfirmar}
          disabled={!liberado}
          className="h-11 w-full bg-slate-900 hover:bg-slate-800"
        >
          {enviando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ClipboardCheck className="mr-1 h-4 w-4" />
          )}
          Declarar e abrir o curso
        </Button>
        {previa ? (
          <p className="text-center text-xs text-violet-700">
            Prévia: o botão não grava nada. O aluno só abre o curso depois de marcar os três itens.
          </p>
        ) : (
          faltam > 0 && (
            <p className="text-center text-xs text-slate-500">
              {faltam === 1
                ? "Falta marcar 1 item para abrir o curso."
                : `Faltam marcar ${faltam} itens para abrir o curso.`}
            </p>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Tela da declaração antes de abrir o curso, na 1ª abertura de cada dia (T35). O servidor confere a versão do texto
 * e os três itens e grava o evento na trilha (ação `declarar_ambiente`); aqui só se lê, marca e confirma. Se o RT
 * salvou um texto novo enquanto o aluno lia, o servidor recusa (409 `TEXTO_MUDOU`), os dados são buscados de novo e
 * o aluno marca os itens de novo diante do texto novo. Declarou: `onDeclarada()` e o curso abre.
 *
 * `declaracao` = `dados.declaracao_ambiente` (versão, texto, ART); `recarregar` busca os dados de novo.
 */
export default function DeclaracaoAmbientePortal({
  item,
  declaracao,
  token,
  recarregar,
  onDeclarada,
  onVoltar,
  onErroSessao,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const [marcados, setMarcados] = useState({ ...MARCADOS_VAZIOS });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  // o ref vale já no 2º clique, antes de a tela redesenhar com `enviando`
  const enviandoRef = useRef(false);
  const versao = declaracao?.versao;

  // texto novo (o RT salvou outra versão): o aluno confirma de novo diante do que está na tela agora
  useEffect(() => {
    setMarcados({ ...MARCADOS_VAZIOS });
  }, [versao]);

  const marcar = (id, valor) => setMarcados((atual) => ({ ...atual, [id]: valor }));

  const confirmar = async () => {
    if (enviandoRef.current) return;
    const corpo = corpoDaDeclaracao({ matriculaId: item.matricula.id, versao, marcados });
    if (!corpo) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErro("");
    setAviso("");
    try {
      await chamarPortal("declarar_ambiente", corpo, token);
      onDeclarada();
    } catch (e) {
      const tratamento = tratamentoDoErroDaDeclaracao(e);
      if (tratamento.acao === "sessao") onErroSessao(e);
      else if (tratamento.acao === "recarregar") {
        setAviso(tratamento.texto);
        await recarregar();
      } else setErro(tratamento.texto);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const tentarDeNovo = async () => {
    setErro("");
    setEnviando(true);
    try {
      await recarregar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 p-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button onClick={onVoltar} aria-label="Voltar aos meus treinamentos">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{item.curso?.nome}</p>
            <p className="text-xs text-slate-300">Antes de abrir o curso</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-slate-700" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Ambiente e horário de estudo</h1>
            <p className="text-sm text-slate-600">
              Em cada dia, antes de abrir o curso, leia a orientação e confirme as condições do seu
              estudo. A confirmação fica registrada, com a data e a hora.
            </p>
          </div>
        </div>

        {aviso && (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {aviso}
          </div>
        )}
        {erro && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <XCircle className="h-4 w-4 shrink-0" /> {erro}
          </div>
        )}

        {declaracao ? (
          <DeclaracaoAmbienteConteudo
            declaracao={declaracao}
            marcados={marcados}
            onMarcar={marcar}
            onConfirmar={confirmar}
            enviando={enviando}
          />
        ) : (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-red-200 bg-white p-6 text-center"
          >
            <p className="text-sm text-slate-700">
              Não foi possível carregar a declaração agora. Tente de novo.
            </p>
            <Button onClick={tentarDeNovo} disabled={enviando} className="bg-slate-900">
              {enviando ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Tentar de novo
            </Button>
          </div>
        )}

        <Button type="button" variant="outline" className="w-full bg-white" onClick={onVoltar}>
          Voltar aos meus treinamentos
        </Button>
      </div>
    </div>
  );
}
