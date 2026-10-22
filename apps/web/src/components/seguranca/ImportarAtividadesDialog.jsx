import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/sigoClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODULO_NOVO,
  TEMPOS_PADRAO,
  TEMPO_PADRAO_POS_VIDEO_MIN,
  codigosDasAulas,
  formatoDoArquivo,
  lerPacoteDeAtividades,
  lerQuestionariosPorVideo,
  mensagemDoErroDaImportacao,
  minutosDoTempo,
  modulosDasAulas,
  payloadDaImportacao,
  planejarImportacao,
  planejarImportacaoPorVideo,
  situacaoDaImportacao,
  textoDaSituacaoDaImportacao,
  textoDoResumoDaImportacao,
} from "@/lib/ead-atividades-importar";

const ROTULO_DO_TIPO = {
  caso: "Caso com decisões",
  questionario: "Questionário",
  tarefa: "Atividade de estudo",
};
const TEMPOS_INICIAIS = {
  questionarioMin: String(TEMPOS_PADRAO.questionarioMin),
  casoMin: String(TEMPOS_PADRAO.casoMin),
};
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const minutosDe = (segundos) => Math.round((Number(segundos) || 0) / 60);

/** O texto do arquivo escolhido (o diálogo não guarda o arquivo: só o que foi lido dele). */
function lerArquivoComoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(leitor.error ?? new Error("falha ao ler o arquivo"));
    leitor.readAsText(arquivo, "utf-8");
  });
}

/**
 * Os erros que o leitor do arquivo devolveu (JSON inválido, módulo ou vídeo repetido...). No passo 1 o arquivo não
 * foi lido; na prévia, o leitor seguiu com o que conseguiu e o "Confirmar" fica bloqueado até o arquivo ser corrigido.
 */
export function ErrosDoArquivo({ erros, titulo = "O arquivo não pode ser importado:", dica }) {
  if (!erros?.length) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800"
    >
      <p className="font-medium">{titulo}</p>
      <ul className="mt-1 list-disc pl-4">
        {erros.map((erro, i) => (
          <li key={i}>{erro}</li>
        ))}
      </ul>
      {dica && <p className="mt-1">{dica}</p>}
    </div>
  );
}

/** Uma atividade da prévia: marcar/desmarcar, o que ela é e o que a impede (ou que já existe e será pulada). */
function ItemDaImportacao({ item, marcado, desabilitado, onAlternar, detalhe }) {
  return (
    <li className="rounded-md bg-slate-50 p-2">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={marcado}
          disabled={desabilitado || item.jaExiste}
          onChange={() => onAlternar(item.codigo_origem)}
          aria-label={`Importar ${item.titulo}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-slate-800">{item.titulo}</span>
          <span className="block text-xs text-slate-500">{detalhe}</span>
          {item.jaExiste ? (
            <span className="block text-xs text-slate-500">já existe — será pulada</span>
          ) : item.problemas.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-red-700">
              {item.problemas.map((p, k) => (
                <li key={k} className="flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      </label>
    </li>
  );
}

/**
 * Passo 2 do pacote do material: os tempos padrão (A8), e por módulo do arquivo o módulo do curso onde as
 * atividades entram (casado pelo código, escolhido ou novo no fim) e a lista de atividades com os problemas.
 */
export function PreviaDaImportacao({
  plano,
  modulosDoCurso,
  semAtividades = [],
  tempos,
  onTempos,
  onEscolha,
  desmarcados,
  onAlternar,
  desabilitado = false,
}) {
  const temposValidos =
    minutosDoTempo(tempos.questionarioMin) !== null && minutosDoTempo(tempos.casoMin) !== null;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="importar-tempo-questionario" className="text-xs">
            Tempo de cada questionário (min)
          </Label>
          <Input
            id="importar-tempo-questionario"
            type="number"
            min={1}
            max={600}
            step={1}
            value={tempos.questionarioMin}
            onChange={(e) => onTempos({ ...tempos, questionarioMin: e.target.value })}
            disabled={desabilitado}
            className="mt-0.5 h-9"
          />
        </div>
        <div>
          <Label htmlFor="importar-tempo-caso" className="text-xs">
            Tempo de cada caso (min)
          </Label>
          <Input
            id="importar-tempo-caso"
            type="number"
            min={1}
            max={600}
            step={1}
            value={tempos.casoMin}
            onChange={(e) => onTempos({ ...tempos, casoMin: e.target.value })}
            disabled={desabilitado}
            className="mt-0.5 h-9"
          />
        </div>
        {!temposValidos && (
          <p role="alert" className="text-xs text-red-700 sm:col-span-2">
            Use minutos inteiros de 1 a 600 nos dois tempos.
          </p>
        )}
        <p className="text-xs text-slate-500 sm:col-span-2">
          As atividades de estudo trazem o próprio tempo. Os tempos somam na carga horária do curso
          e podem ser mudados depois, aula por aula.
        </p>
      </div>

      {plano.porModulo.length === 0 && (
        <p className="text-slate-500">O arquivo não tem atividades para importar.</p>
      )}
      {plano.porModulo.map((m) => {
        const itens = plano.itens.filter((i) => i.moduloPacote === m.moduloPacote);
        const idDoModulo = `importar-modulo-${m.moduloPacote}`;
        return (
          <section
            key={m.moduloPacote}
            aria-label={`Módulo ${m.moduloPacote} do arquivo`}
            className="space-y-2 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold text-slate-800">
                {m.moduloPacote}
                {m.tituloPacote ? ` · ${m.tituloPacote}` : ""}
              </h4>
              <span className="text-xs text-slate-500">
                {[
                  m.casos && plural(m.casos, "caso", "casos"),
                  m.questoes && `questionário com ${plural(m.questoes, "questão", "questões")}`,
                  m.tarefas && plural(m.tarefas, "atividade de estudo", "atividades de estudo"),
                  `${m.minutos} min a importar`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={idDoModulo} className="text-xs text-slate-600">
                Entra no módulo do curso
              </Label>
              <Select
                value={m.origem === "novo" ? MODULO_NOVO : m.modulo}
                onValueChange={(valor) => onEscolha(m.moduloPacote, valor)}
                disabled={desabilitado}
              >
                <SelectTrigger id={idDoModulo} className="h-8 w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {modulosDoCurso.map((modulo) => (
                    <SelectItem key={modulo} value={modulo}>
                      {modulo}
                    </SelectItem>
                  ))}
                  <SelectItem value={MODULO_NOVO}>Novo módulo no fim do curso</SelectItem>
                </SelectContent>
              </Select>
              {m.origem === "casado" && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-emerald-700 border-emerald-300"
                >
                  casado pelo código
                </Badge>
              )}
              {m.origem === "novo" && (
                <span className="text-xs text-slate-500">Novo módulo: {m.modulo}</span>
              )}
            </div>
            <ul className="space-y-1">
              {itens.map((i) => (
                <ItemDaImportacao
                  key={i.codigo_origem}
                  item={i}
                  marcado={!i.jaExiste && !desmarcados.has(i.codigo_origem)}
                  desabilitado={desabilitado}
                  onAlternar={onAlternar}
                  detalhe={[
                    ROTULO_DO_TIPO[i.tipo] ?? i.tipo,
                    `${minutosDe(i.duracao_seg)} min`,
                    i.tipo === "questionario" && plural(i.questoes.length, "questão", "questões"),
                    i.codigo_origem,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {semAtividades.length > 0 && (
        <p className="text-xs text-slate-500">
          Módulos do arquivo sem atividades: {semAtividades.join(", ")}.
        </p>
      )}
    </div>
  );
}

/**
 * Passo 2 dos exercícios pós-vídeo: o tempo de cada questionário e, por vídeo, a aula achada pelo código, quantas
 * questões e os problemas (vídeo não encontrado, questão sem resposta certa).
 */
export function PreviaPorVideo({
  plano,
  minutos,
  onMinutos,
  desmarcados,
  onAlternar,
  desabilitado = false,
}) {
  const valido = minutosDoTempo(minutos) !== null;
  return (
    <div className="space-y-3 text-sm">
      <div className="max-w-xs">
        <Label htmlFor="importar-tempo-pos-video" className="text-xs">
          Tempo de cada questionário pós-vídeo (min)
        </Label>
        <Input
          id="importar-tempo-pos-video"
          type="number"
          min={1}
          max={600}
          step={1}
          value={minutos}
          onChange={(e) => onMinutos(e.target.value)}
          disabled={desabilitado}
          className="mt-0.5 h-9"
        />
        {!valido && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            Use minutos inteiros de 1 a 600.
          </p>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Cada questionário entra logo depois da aula de vídeo do mesmo código e fica no módulo dela.
        O código precisa estar no nome do arquivo do vídeo (ex.: NR10_S02A_cena.mp4 ou S02A.mp4);
        vídeo do YouTube não tem arquivo e não é achado.
      </p>
      <ul className="space-y-1">
        {plano.itens.map((i) => (
          <ItemDaImportacao
            key={i.codigo_origem}
            item={i}
            marcado={!i.jaExiste && !desmarcados.has(i.codigo_origem)}
            desabilitado={desabilitado}
            onAlternar={onAlternar}
            detalhe={[
              `Vídeo ${i.video}`,
              i.aulaDoVideo ? `depois da aula ${i.aulaDoVideo.titulo}` : "aula não encontrada",
              plural(i.questoes.length, "questão", "questões"),
              `${minutosDe(i.duracao_seg)} min`,
            ].join(" · ")}
          />
        ))}
      </ul>
    </div>
  );
}

/** Passo 1: o arquivo (.json). Os erros de leitura ficam aqui, legíveis; nada vai para a prévia. */
function PassoDoArquivo({ lendo, erros, onArquivo }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Aceita o pacote do material (lista de módulos com casos, questões e atividades de estudo) e
        os exercícios pós-vídeo (arquivo com &quot;tipo&quot;: &quot;questionarios_por_video&quot;).
        Nada é gravado antes do &quot;Confirmar&quot;.
      </p>
      <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 text-slate-600 hover:border-slate-400">
        {lendo ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileUp className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{lendo ? "Lendo o arquivo..." : "Escolher o arquivo (.json)"}</span>
        <input
          type="file"
          accept=".json,application/json"
          className="hidden"
          disabled={lendo}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            onArquivo(arquivo);
          }}
        />
      </label>
      <ErrosDoArquivo erros={erros} />
    </div>
  );
}

/**
 * "Importar atividades" (atividades interativas, A7 e A8): passo 1, o arquivo (pacote do material ou exercícios
 * pós-vídeo); passo 2, a prévia (módulo de destino, tempos, problemas que bloqueiam o "Confirmar" até a atividade
 * ser desmarcada, o que já existe e será pulado); passo 3, a gravação de tudo de uma vez pela RPC
 * `importar_atividades_ead` (tudo ou nada) e o resumo. O "Confirmar" também fica bloqueado com mais de 300 atividades
 * (limite da RPC por chamada) e quando o leitor do arquivo devolveu erros (ver `situacaoDaImportacao`). Quem abre
 * confere a permissão (Treinamentos EAD → Editar) e o aviso de impacto; o banco confere de novo (42501).
 */
export default function ImportarAtividadesDialog({ aberto, onFechar, curso, aulas, onImportado }) {
  // { formato: "pacote", nome, pacote, erros } | { formato: "por_video", nome, porVideo, erros } | null
  const [lido, setLido] = useState(null);
  const [errosDoArquivo, setErrosDoArquivo] = useState([]);
  const [lendo, setLendo] = useState(false);
  const [tempos, setTempos] = useState(TEMPOS_INICIAIS);
  const [minutosPosVideo, setMinutosPosVideo] = useState(String(TEMPO_PADRAO_POS_VIDEO_MIN));
  const [escolha, setEscolha] = useState({});
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const [resumo, setResumo] = useState(null);
  // uma gravação por vez: o ref vale já no 2º clique, antes de a tela redesenhar
  const [importando, setImportando] = useState(false);
  const importandoRef = useRef(false);

  // cada abertura começa do zero (o arquivo anterior não fica na tela)
  useEffect(() => {
    if (!aberto) return;
    setLido(null);
    setErrosDoArquivo([]);
    setLendo(false);
    setTempos(TEMPOS_INICIAIS);
    setMinutosPosVideo(String(TEMPO_PADRAO_POS_VIDEO_MIN));
    setEscolha({});
    setDesmarcados(new Set());
    setResumo(null);
  }, [aberto]);

  const plano = useMemo(() => {
    if (!lido) return null;
    const codigosExistentes = codigosDasAulas(aulas);
    if (lido.formato === "por_video") {
      return planejarImportacaoPorVideo({
        arquivo: lido.porVideo,
        aulas,
        codigosExistentes,
        minutos: minutosPosVideo,
      });
    }
    return planejarImportacao({
      pacote: lido.pacote,
      modulosDoCurso: modulosDasAulas(aulas),
      codigosExistentes,
      tempos,
      escolhaDeModulo: escolha,
    });
  }, [lido, aulas, tempos, escolha, minutosPosVideo]);
  const situacao = useMemo(
    () => (plano ? situacaoDaImportacao(plano.itens, desmarcados, { erros: lido?.erros }) : null),
    [plano, desmarcados, lido]
  );
  const temposValidos =
    lido?.formato === "por_video"
      ? minutosDoTempo(minutosPosVideo) !== null
      : minutosDoTempo(tempos.questionarioMin) !== null && minutosDoTempo(tempos.casoMin) !== null;
  const semAtividades =
    lido?.formato === "pacote"
      ? lido.pacote.modulos
          .filter((m) => !m.casos.length && !m.questoes.length && !m.tarefas.length)
          .map((m) => m.id)
      : [];

  const escolherArquivo = async (arquivo) => {
    if (!arquivo) return;
    setLendo(true);
    setErrosDoArquivo([]);
    setLido(null);
    setEscolha({});
    setDesmarcados(new Set());
    try {
      let conteudo;
      try {
        conteudo = await lerArquivoComoTexto(arquivo);
      } catch (e) {
        setErrosDoArquivo([
          `Não foi possível ler o arquivo "${arquivo.name}" (${e?.message || e}).`,
        ]);
        return;
      }
      let json;
      try {
        json = JSON.parse(conteudo.replace(/^\uFEFF/, ""));
      } catch (e) {
        setErrosDoArquivo([
          `O arquivo "${arquivo.name}" não é um JSON válido (${e?.message || e}). Confira se é o arquivo certo.`,
        ]);
        return;
      }
      // O leitor segue com o que conseguiu ler e devolve `erros` (módulo ou vídeo repetido descartado...): com algo
      // para mostrar vai para a prévia COM os erros (o "Confirmar" fica bloqueado); sem nada, fica no passo 1.
      if (formatoDoArquivo(json) === "por_video") {
        const porVideo = lerQuestionariosPorVideo(json);
        if (porVideo.itens.length) {
          setLido({ formato: "por_video", nome: arquivo.name, porVideo, erros: porVideo.erros });
        } else {
          setErrosDoArquivo(
            porVideo.erros.length ? porVideo.erros : ["O arquivo não traz nenhum vídeo."]
          );
        }
      } else {
        const pacote = lerPacoteDeAtividades(json);
        if (pacote.modulos.length) {
          setLido({ formato: "pacote", nome: arquivo.name, pacote, erros: pacote.erros });
        } else {
          setErrosDoArquivo(
            pacote.erros.length ? pacote.erros : ["O arquivo não tem nenhum módulo."]
          );
        }
      }
    } finally {
      setLendo(false);
    }
  };

  const alternar = (codigo) =>
    setDesmarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(codigo)) novo.delete(codigo);
      else novo.add(codigo);
      return novo;
    });
  const escolher = (moduloPacote, valor) =>
    setEscolha((atual) => ({ ...atual, [moduloPacote]: valor }));

  const confirmar = async () => {
    if (!plano || !situacao?.podeConfirmar || !temposValidos || !curso?.id) return;
    if (importandoRef.current) return;
    const payload = payloadDaImportacao(plano.itens, desmarcados);
    if (!payload.length) return;
    importandoRef.current = true;
    setImportando(true);
    try {
      const { data, error } = await supabase.rpc("importar_atividades_ead", {
        p_curso_id: curso.id,
        p_atividades: payload,
      });
      if (error) {
        console.error("[importar atividades] a RPC recusou:", error);
        toast.error(mensagemDoErroDaImportacao(error), { duration: 12000 });
        return;
      }
      const feito = {
        criadas: Number(data?.criadas) || 0,
        puladas: Number(data?.puladas) || 0,
        questoes: Number(data?.questoes) || 0,
      };
      setResumo(feito);
      toast.success(textoDoResumoDaImportacao(feito));
      onImportado?.(feito);
    } catch (e) {
      console.error("[importar atividades] falha:", e);
      toast.error(mensagemDoErroDaImportacao(e));
    } finally {
      importandoRef.current = false;
      setImportando(false);
    }
  };

  // durante a gravação, Esc, clicar fora e Cancelar não fecham: a importação está a caminho
  const fechar = () => {
    if (importandoRef.current) return;
    onFechar();
  };

  const passo = resumo ? 3 : lido ? 2 : 1;
  return (
    <Dialog open={!!aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar atividades</DialogTitle>
          <DialogDescription>
            {curso?.nome ? `${curso.nome}. ` : ""}Passo {passo} de 3:{" "}
            {passo === 1
              ? "escolha o arquivo."
              : passo === 2
                ? `confira a prévia de ${lido.nome}.`
                : "pronto."}
          </DialogDescription>
        </DialogHeader>

        {resumo ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {textoDoResumoDaImportacao(resumo)}
          </p>
        ) : !lido ? (
          <PassoDoArquivo lendo={lendo} erros={errosDoArquivo} onArquivo={escolherArquivo} />
        ) : (
          <>
            <ErrosDoArquivo
              erros={lido.erros}
              titulo="O arquivo tem erros e não pode ser importado como está:"
              dica="A prévia abaixo mostra só o que foi lido. Corrija o arquivo e escolha-o de novo."
            />
            {lido.formato === "por_video" ? (
              <PreviaPorVideo
                plano={plano}
                minutos={minutosPosVideo}
                onMinutos={setMinutosPosVideo}
                desmarcados={desmarcados}
                onAlternar={alternar}
                desabilitado={importando}
              />
            ) : (
              <PreviaDaImportacao
                plano={plano}
                modulosDoCurso={modulosDasAulas(aulas)}
                semAtividades={semAtividades}
                tempos={tempos}
                onTempos={setTempos}
                onEscolha={escolher}
                desmarcados={desmarcados}
                onAlternar={alternar}
                desabilitado={importando}
              />
            )}
          </>
        )}

        {lido && !resumo && situacao && (
          <p
            role="status"
            aria-live="polite"
            className={`text-xs ${situacao.podeConfirmar ? "text-slate-600" : "text-amber-700"}`}
          >
            {textoDaSituacaoDaImportacao(situacao)}
          </p>
        )}

        <DialogFooter className="gap-2">
          {resumo ? (
            <Button onClick={fechar}>Fechar</Button>
          ) : (
            <>
              {lido && (
                <Button variant="ghost" onClick={() => setLido(null)} disabled={importando}>
                  Escolher outro arquivo
                </Button>
              )}
              <Button variant="outline" onClick={fechar} disabled={importando}>
                Cancelar
              </Button>
              {lido && (
                <Button
                  onClick={confirmar}
                  disabled={importando || !temposValidos || !situacao?.podeConfirmar}
                  className="bg-slate-900 hover:bg-slate-800"
                >
                  {importando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Confirmar e importar
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
