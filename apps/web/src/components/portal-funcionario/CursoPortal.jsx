import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  CheckCircle2,
  PlayCircle,
  Lock,
  FileText,
  BookOpen,
  FileDown,
  X,
} from "lucide-react";
import { chamarPortal, criarFila, fmtTempo, fmtDataHora } from "./api";
import AvaliacaoPortal from "./AvaliacaoPortal";
import CertificadoPortal from "./CertificadoPortal";
import DuvidasPortal from "./DuvidasPortal";

// IFrame API do YouTube, carregada uma única vez
let ytApiPromise = null;
function carregarYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        anterior?.();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return ytApiPromise;
}

const ICONE_TIPO = { video: PlayCircle, pdf: FileText, texto: BookOpen };

/**
 * Curso aberto no portal. Regras (conferidas também no servidor):
 * - aulas em ordem: a próxima só abre com a anterior concluída;
 * - o tempo só conta com o vídeo tocando (ou a leitura aberta) e a aba VISÍVEL;
 * - eventos e progresso vão numa fila, na ordem em que aconteceram.
 */
export default function CursoPortal({ item, token, recarregar, onVoltar, onErroSessao }) {
  const mat = item.matricula;
  const aulas = item.aulas || [];
  const [aulaId, setAulaId] = useState(null);
  const [modo, setModo] = useState("aulas"); // aulas | avaliacao
  const [segundosTela, setSegundosTela] = useState(0);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const fila = useMemo(() => criarFila(), []);
  const assistidoRef = useRef(0);
  const contandoRef = useRef(false);
  const timersRef = useRef({ tick: null, envio: null });
  const videoElRef = useRef(null);
  const playerRef = useRef(null);
  const aulaRef = useRef(null);

  const aula = aulas.find((a) => a.id === aulaId) || null;
  aulaRef.current = aula;

  const tratarErro = (e) => {
    if (e?.codigo === "SESSAO" || e?.codigo === "TROCAR_SENHA") onErroSessao(e);
    else setErro(e?.message || "Erro no portal");
  };

  const evento = (nome, extra = {}) =>
    fila(() =>
      chamarPortal("evento", { evento: nome, matricula_id: mat.id, ...extra }, token)
    ).catch(tratarErro);

  const sincronizar = async ({ concluir = false } = {}) => {
    const a = aulaRef.current;
    if (!a) return;
    const enviado = assistidoRef.current;
    const duracaoMidia =
      a.tipo === "video"
        ? videoElRef.current?.duration || playerRef.current?.getDuration?.() || 0
        : 0;
    try {
      const r = await fila(() =>
        chamarPortal(
          "progresso",
          {
            matricula_id: mat.id,
            aula_id: a.id,
            segundos_assistidos: Math.floor(enviado),
            duracao_seg: duracaoMidia ? Math.floor(duracaoMidia) : undefined,
            concluir: concluir || undefined,
          },
          token
        )
      );
      // o servidor é quem manda: realinha o contador ao que ele aceitou
      const andouDepois = Math.max(0, assistidoRef.current - enviado);
      assistidoRef.current = r.segundos_assistidos + andouDepois;
      setSegundosTela(assistidoRef.current);
      if (r.aula_concluida && !a.concluida) {
        pararContagem(false);
        await recarregar();
        setAviso(
          r.curso_concluido
            ? "🎉 Curso concluído!"
            : r.precisa_avaliacao
              ? "✅ Todas as aulas concluídas — agora faça a avaliação final."
              : "✅ Aula concluída — a próxima já está liberada."
        );
      }
    } catch (e) {
      // servidor mede o tempo real: se ainda falta leitura, volta a contar
      if (e?.codigo === "TEMPO_LEITURA") {
        if (Number.isFinite(e.extra?.segundos_assistidos)) {
          assistidoRef.current = e.extra.segundos_assistidos;
          setSegundosTela(assistidoRef.current);
        }
        setErro(e.message);
        iniciarContagem();
        return;
      }
      tratarErro(e);
    }
  };

  function iniciarContagem() {
    if (contandoRef.current || document.hidden) return;
    contandoRef.current = true;
    timersRef.current.tick = setInterval(() => {
      assistidoRef.current += 1;
      setSegundosTela(assistidoRef.current);
    }, 1000);
    timersRef.current.envio = setInterval(sincronizar, 10000);
  }

  function pararContagem(enviar = true) {
    if (!contandoRef.current) return undefined;
    contandoRef.current = false;
    clearInterval(timersRef.current.tick);
    clearInterval(timersRef.current.envio);
    return enviar ? sincronizar() : undefined;
  }

  const abrirAula = async (a) => {
    if (!a.liberada) return;
    setErro("");
    setAviso("");
    await pararContagem();
    playerRef.current?.destroy?.();
    playerRef.current = null;
    try {
      await fila(() =>
        chamarPortal("evento", { evento: "abrir_aula", matricula_id: mat.id, aula_id: a.id }, token)
      );
    } catch (e) {
      tratarErro(e);
      return;
    }
    assistidoRef.current = a.segundos_assistidos || 0;
    setSegundosTela(assistidoRef.current);
    setModo("aulas");
    setAulaId(a.id);
    aulaRef.current = a;
    // leitura (PDF/texto) conta enquanto a aula está aberta e a aba visível
    if (a.tipo !== "video" && !a.concluida) iniciarContagem();
  };

  // YouTube: monta o player quando a aula é do tipo link
  useEffect(() => {
    if (!aula || aula.tipo !== "video" || aula.fonte === "upload" || modo !== "aulas") return;
    let vivo = true;
    carregarYouTubeAPI().then((YT) => {
      if (!vivo) return;
      playerRef.current = new YT.Player("player-aula", {
        videoId: aula.youtube_id,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (ev) => {
            if (ev.data === YT.PlayerState.PLAYING) {
              evento("play", { aula_id: aula.id });
              iniciarContagem();
            } else if (ev.data === YT.PlayerState.PAUSED) {
              pararContagem();
              evento("pausa", { aula_id: aula.id });
            } else if (ev.data === YT.PlayerState.ENDED) {
              pararContagem();
              evento("fim_video", { aula_id: aula.id });
            }
          },
        },
      });
    });
    return () => {
      vivo = false;
    };
  }, [aula?.id, modo]);

  // aba escondida = tempo parado (e vídeo pausado)
  useEffect(() => {
    const onVis = () => {
      const a = aulaRef.current;
      if (document.hidden) {
        pararContagem();
        videoElRef.current?.pause();
        playerRef.current?.pauseVideo?.();
        evento("aba_oculta", { aula_id: a?.id });
      } else {
        evento("aba_visivel", { aula_id: a?.id });
        if (a && a.tipo !== "video" && !a.concluida) iniciarContagem();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    evento("abrir_curso");
    return () => {
      pararContagem();
      playerRef.current?.destroy?.();
    };
  }, []);

  const voltar = async () => {
    await pararContagem();
    onVoltar();
  };

  const feitas = aulas.filter((a) => a.concluida).length;
  const todasFeitas = aulas.length > 0 && feitas === aulas.length;
  const av = item.avaliacao || {};
  const aguardando = av.proxima_em && new Date(av.proxima_em) > new Date();
  const podeFazerProva =
    todasFeitas && item.curso?.tem_avaliacao && !mat.avaliacao_aprovada && !av.limite_atingido;

  // aulas agrupadas por módulo, na ordem
  const grupos = [];
  for (const a of aulas) {
    const ultimo = grupos[grupos.length - 1];
    if (!ultimo || ultimo.modulo !== (a.modulo || null)) {
      grupos.push({ modulo: a.modulo || null, aulas: [a] });
    } else ultimo.aulas.push(a);
  }

  const minimo = aula?.duracao_seg || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={voltar} aria-label="Voltar aos meus treinamentos">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight truncate">{item.curso?.nome}</p>
            <p className="text-xs text-slate-300">
              {feitas}/{aulas.length} aulas concluídas
            </p>
          </div>
          {item.curso?.projeto_pedagogico_url && (
            <button
              className="text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-md px-2 py-1.5"
              onClick={() => {
                evento("abrir_projeto");
                window.open(item.curso.projeto_pedagogico_url, "_blank", "noopener");
              }}
            >
              <FileDown className="w-4 h-4" /> Projeto pedagógico
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {aviso && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            <span className="flex-1">{aviso}</span>
            <button onClick={() => setAviso("")} aria-label="Fechar aviso">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {erro && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro("")} aria-label="Fechar erro">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {(mat.status === "concluido" || item.certificado) && (
          <CertificadoPortal
            item={item}
            token={token}
            evento={evento}
            recarregar={recarregar}
            tratarErro={tratarErro}
          />
        )}

        {modo === "avaliacao" ? (
          <AvaliacaoPortal
            item={item}
            token={token}
            fila={fila}
            tratarErro={tratarErro}
            onFechar={async () => {
              await recarregar();
              setModo("aulas");
            }}
          />
        ) : aula ? (
          <div className="space-y-2">
            {aula.tipo === "video" && (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {aula.fonte === "upload" && aula.video_url ? (
                  <video
                    key={aula.id}
                    ref={videoElRef}
                    src={aula.video_url}
                    crossOrigin="anonymous"
                    controls
                    controlsList="nodownload"
                    className="w-full h-full"
                    onPlay={() => {
                      evento("play", { aula_id: aula.id });
                      iniciarContagem();
                    }}
                    onPause={() => {
                      pararContagem();
                      evento("pausa", { aula_id: aula.id });
                    }}
                    onEnded={() => {
                      pararContagem();
                      evento("fim_video", { aula_id: aula.id });
                    }}
                  >
                    {aula.legenda_url && (
                      <track
                        kind="subtitles"
                        src={aula.legenda_url}
                        srcLang="pt-BR"
                        label="Português"
                        default
                      />
                    )}
                  </video>
                ) : (
                  <div id="player-aula" className="w-full h-full" />
                )}
              </div>
            )}
            {aula.tipo === "pdf" && (
              <iframe
                title={aula.titulo}
                src={aula.arquivo_url || "about:blank"}
                className="w-full h-[70vh] rounded-lg border bg-white"
              />
            )}
            {aula.tipo === "texto" && (
              <div className="bg-white rounded-lg border p-4 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                {aula.conteudo_texto}
              </div>
            )}
            <div className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-800">{aula.titulo}</span>
              {aula.concluida ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  concluída
                </Badge>
              ) : (
                <span>
                  {aula.tipo === "video" ? "Assistido" : "Tempo de leitura"}:{" "}
                  {fmtTempo(segundosTela)}
                  {minimo ? ` de ${fmtTempo(minimo)}` : ""} · o tempo só conta com esta tela aberta
                  {aula.tipo === "video" ? " e o vídeo tocando" : ""}
                </span>
              )}
            </div>
            {aula.tipo !== "video" && !aula.concluida && (
              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
                disabled={minimo > 0 && segundosTela < minimo}
                onClick={async () => {
                  await pararContagem(false);
                  sincronizar({ concluir: true });
                }}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {minimo > 0 && segundosTela < minimo
                  ? `Marcar como lida (faltam ${fmtTempo(minimo - segundosTela)})`
                  : "Marcar como lida — li e compreendi"}
              </Button>
            )}
          </div>
        ) : (
          !(mat.status === "concluido") && (
            <p className="text-sm text-slate-500 py-2">Escolha a próxima aula liberada 👇</p>
          )
        )}

        {modo === "aulas" &&
          todasFeitas &&
          item.curso?.tem_avaliacao &&
          !mat.avaliacao_aprovada && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
              <p className="text-sm text-violet-900">
                📝 Avaliação final · nota mínima {av.nota_minima}%
                {av.tentativas_max
                  ? ` · tentativa ${av.tentativas_usadas + 1} de ${av.tentativas_max}`
                  : ""}
              </p>
              {av.limite_atingido ? (
                <p className="text-sm text-red-700">
                  Você usou todas as tentativas. Procure o RH para liberar uma nova.
                </p>
              ) : aguardando ? (
                <p className="text-sm text-amber-700">
                  Nova tentativa liberada em {fmtDataHora(av.proxima_em)}. Revise as aulas enquanto
                  isso.
                </p>
              ) : null}
              <Button
                className="w-full bg-violet-600 hover:bg-violet-700 h-11"
                disabled={!podeFazerProva || aguardando}
                onClick={async () => {
                  await pararContagem();
                  setModo("avaliacao");
                }}
              >
                Fazer avaliação final
              </Button>
            </div>
          )}

        <div className="space-y-3">
          {grupos.map((g, gi) => (
            <div key={gi} className="space-y-2">
              {g.modulo && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-1">
                  {g.modulo}
                </p>
              )}
              {g.aulas.map((a) => {
                const Icone = ICONE_TIPO[a.tipo] || PlayCircle;
                return (
                  <button
                    key={a.id}
                    onClick={() => abrirAula(a)}
                    disabled={!a.liberada}
                    className={`w-full text-left rounded-lg border p-3 flex items-center gap-3 bg-white ${
                      a.liberada ? "hover:border-slate-400" : "opacity-60 cursor-not-allowed"
                    } ${aulaId === a.id ? "border-slate-800" : "border-slate-200"}`}
                  >
                    {a.concluida ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    ) : a.liberada ? (
                      <Icone className="w-5 h-5 text-slate-500 shrink-0" />
                    ) : (
                      <Lock className="w-5 h-5 text-slate-400 shrink-0" />
                    )}
                    <span className="flex-1 text-sm">
                      {a.ordem}. {a.titulo}
                    </span>
                    {!a.liberada && (
                      <span className="text-[11px] text-slate-400">conclua a anterior</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <DuvidasPortal
          item={item}
          token={token}
          aulaId={aulaId}
          recarregar={recarregar}
          tratarErro={tratarErro}
        />
      </div>
    </div>
  );
}
