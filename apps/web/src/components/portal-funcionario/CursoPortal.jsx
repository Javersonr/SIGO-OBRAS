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
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { chamarPortal, criarFila, fmtTempo, fmtDataHora } from "./api";
import AvaliacaoPortal from "./AvaliacaoPortal";
import CertificadoPortal from "./CertificadoPortal";
import DuvidasPortal from "./DuvidasPortal";
import ApostilaPdf from "./ApostilaPdf";
import { leituraPodeContar, urlApostilaValida } from "@/lib/apostila-pdf";
import { videoSemDuracao } from "@/lib/ead-duracao";
import {
  AVISO_VELOCIDADE,
  MSG_RECARGA_SEM_REDE,
  MSG_VIDEO_FALHOU,
  MSG_YOUTUBE_FALHOU,
  aulaDoCurso,
  avisoFimIncompleto,
  criarCarregadorYouTube,
  dadosPrecisamRenovar,
  fonteDoVideo,
  mensagemErroYouTube,
  mensagemVideoIndisponivel,
  precisaReassistir,
  renovacaoAutomaticaPermitida,
  rotuloProgressoVideo,
  velocidadeNormal,
} from "@/lib/portal-video";

// IFrame API do YouTube, carregada uma única vez (falha = rejeita com mensagem e deixa tentar de novo)
let carregadorYouTube = null;
function carregarYouTubeAPI() {
  if (!carregadorYouTube) {
    carregadorYouTube = criarCarregadorYouTube({ janela: window, documento: document });
  }
  return carregadorYouTube();
}

/** Aviso no lugar do player: o aluno sempre lê o que houve, nunca fica diante de um quadro vazio. */
function AvisoVideo({ mensagem, rotuloBotao, onClick }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3"
    >
      <p className="font-semibold flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{mensagem}</span>
      </p>
      {onClick && (
        <Button type="button" variant="outline" size="sm" onClick={onClick}>
          <RefreshCw /> {rotuloBotao}
        </Button>
      )}
    </div>
  );
}

const ICONE_TIPO = { video: PlayCircle, pdf: FileText, texto: BookOpen };

/**
 * Curso aberto no portal. Regras (conferidas também no servidor):
 * - aulas em ordem: a próxima só abre com a anterior concluída;
 * - o tempo só conta com o vídeo tocando (ou a leitura aberta) e a aba VISÍVEL;
 * - eventos e progresso vão numa fila, na ordem em que aconteceram.
 */
export default function CursoPortal({
  item,
  token,
  recarregar,
  dadosCarregadosEm,
  onVoltar,
  onErroSessao,
}) {
  const mat = item.matricula;
  const aulas = item.aulas || [];
  const [aulaId, setAulaId] = useState(null);
  const [modo, setModo] = useState("aulas"); // aulas | avaliacao
  const [segundosTela, setSegundosTela] = useState(0);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  // vídeo: falha que o aluno precisa ver ({ aulaId, mensagem, acao, posicao }), renovação do
  // acesso em andamento, número da tentativa (remonta o player) e aviso de fim com tempo a menos
  const [falhaVideo, setFalhaVideo] = useState(null);
  const [renovandoVideo, setRenovandoVideo] = useState(false);
  const [tentativaVideo, setTentativaVideo] = useState(0);
  const [fimIncompleto, setFimIncompleto] = useState(null); // { aulaId, texto }
  // URLs de vídeo/legenda de cada aula, travadas na que abriu a aula: refazer os dados (concluir
  // aula, dúvida...) assina URLs novas, e trocar o src no meio do vídeo o recarregaria do início
  const [midiasDaAula, setMidiasDaAula] = useState({});

  const fila = useMemo(() => criarFila(), []);
  const assistidoRef = useRef(0);
  const contandoRef = useRef(false);
  const timersRef = useRef({ tick: null, envio: null });
  const videoElRef = useRef(null);
  const playerRef = useRef(null);
  const ytContainerRef = useRef(null);
  const aulaRef = useRef(null);
  const renovandoRef = useRef(false);
  const renovacaoAutoRef = useRef({}); // aulaId -> quando o player renovou o acesso sozinho
  const retomadaRef = useRef(null); // { posicao }: o vídeo trocou de URL e volta a este segundo
  // estado da apostila (PDF) da aula aberta: o tempo de leitura só corre com ela na tela
  const estadoPdfRef = useRef({ aulaId: null, estado: "carregando" });

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

  // `fim`: o vídeo acabou; se mesmo assim a aula não concluiu, o aluno é avisado
  const sincronizar = async ({ concluir = false, fim = false } = {}) => {
    const a = aulaRef.current;
    if (!a) return;
    const enviado = assistidoRef.current;
    try {
      const r = await fila(() =>
        chamarPortal(
          "progresso",
          {
            matricula_id: mat.id,
            aula_id: a.id,
            segundos_assistidos: Math.floor(enviado),
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
      } else if (fim && a.tipo === "video" && !r.aula_concluida) {
        // acabou com menos do mínimo contado (2x, 1,5x, trechos pulados): diz quanto foi contado
        const contagem = { segundos: assistidoRef.current, duracao: a.duracao_seg };
        if (precisaReassistir(contagem)) {
          setFimIncompleto({ aulaId: a.id, texto: avisoFimIncompleto(contagem) });
        }
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

  // leitura (PDF/texto) pode contar agora? PDF: só com URL válida e a apostila aberta na tela
  const leituraLiberada = (a) =>
    leituraPodeContar(
      a,
      estadoPdfRef.current.aulaId === a?.id ? estadoPdfRef.current.estado : "carregando"
    );

  // o leitor da apostila avisa quando abriu, está carregando ou falhou
  const aoMudarEstadoPdf = (aulaId, estado) => {
    estadoPdfRef.current = { aulaId, estado };
    const a = aulaRef.current;
    if (!a || a.id !== aulaId || a.concluida) return;
    if (leituraLiberada(a)) iniciarContagem();
    else pararContagem();
  };

  // URL assinada nova (a de 3 h pode vencer) para o "Tentar de novo" da apostila
  const urlNovaDaApostila = async (aulaIdDaApostila) => {
    const dados = await recarregar();
    const curso = dados?.cursos?.find((c) => c.matricula?.id === mat.id);
    return curso?.aulas?.find((x) => x.id === aulaIdDaApostila)?.arquivo_url ?? null;
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

  const abrirAula = async (aulaClicada) => {
    if (!aulaClicada.liberada) return;
    // clicar de novo na aula que já está aberta não faz nada (antes parava a contagem com o vídeo tocando)
    if (aulaClicada.id === aulaId && modo === "aulas") return;
    setErro("");
    setAviso("");
    setFalhaVideo(null);
    setFimIncompleto(null);
    retomadaRef.current = null;
    await pararContagem();
    // o vídeo da aula anterior não pode seguir tocando enquanto a nova abre
    videoElRef.current?.pause();
    playerRef.current?.pauseVideo?.();
    try {
      await fila(() =>
        chamarPortal(
          "evento",
          { evento: "abrir_aula", matricula_id: mat.id, aula_id: aulaClicada.id },
          token
        )
      );
    } catch (e) {
      tratarErro(e);
      return;
    }
    // As URLs assinadas de vídeo, legenda e PDF valem 3 h: com os dados carregados há mais de
    // 2h30, busca de novo antes de abrir a aula. Se a busca falhar, abre com o que tem (o
    // player trata o arquivo que não carregar).
    let a = aulaClicada;
    if (dadosPrecisamRenovar(dadosCarregadosEm?.() ?? 0, Date.now())) {
      const renovada = aulaDoCurso(await recarregar(), mat.id, aulaClicada.id);
      if (renovada) a = renovada;
    }
    assistidoRef.current = a.segundos_assistidos || 0;
    setSegundosTela(assistidoRef.current);
    setMidiasDaAula((m) => ({
      ...m,
      [a.id]: { video_url: a.video_url ?? null, legenda_url: a.legenda_url ?? null },
    }));
    setModo("aulas");
    setAulaId(a.id);
    aulaRef.current = a;
    // leitura (PDF/texto) conta enquanto a aula está aberta e a aba visível; a apostila em
    // PDF só começa a contar quando o leitor avisa que ela abriu (aoMudarEstadoPdf)
    if (a.tipo !== "video" && !a.concluida && leituraLiberada(a)) iniciarContagem();
  };

  // O arquivo do vídeo não carregou (link vencido, rede): busca os dados de novo e troca a URL.
  // Sem os dados ou sem URL nova, o aluno lê a mensagem e tem o botão "Recarregar".
  const renovarVideo = async (a, posicao = 0) => {
    if (renovandoRef.current) return;
    renovandoRef.current = true;
    setFalhaVideo(null);
    setRenovandoVideo(true);
    const dados = await recarregar();
    const nova = aulaDoCurso(dados, mat.id, a.id);
    renovandoRef.current = false;
    setRenovandoVideo(false);
    if (!dados) {
      setFalhaVideo({ aulaId: a.id, mensagem: MSG_RECARGA_SEM_REDE, acao: "recarregar", posicao });
    } else if (fonteDoVideo(nova) !== "upload") {
      setFalhaVideo({
        aulaId: a.id,
        mensagem: mensagemVideoIndisponivel(a),
        acao: "recarregar",
        posicao,
      });
    } else {
      retomadaRef.current = { posicao };
      setMidiasDaAula((m) => ({
        ...m,
        [a.id]: { video_url: nova.video_url, legenda_url: nova.legenda_url ?? null },
      }));
      setTentativaVideo((t) => t + 1);
    }
  };

  // erro do <video>: a 1ª vez (e a cada 5 min) renova sozinho; se persistir, mensagem + botão
  const aoErrarVideo = (a, el) => {
    if (el?.error?.code === 1) return; // MEDIA_ERR_ABORTED: interrompido, não é falha do arquivo
    pararContagem();
    const posicao = el?.currentTime || 0;
    const agora = Date.now();
    if (renovacaoAutomaticaPermitida(renovacaoAutoRef.current[a.id], agora)) {
      renovacaoAutoRef.current[a.id] = agora;
      renovarVideo(a, posicao);
    } else {
      setFalhaVideo({
        aulaId: a.id,
        mensagem: MSG_VIDEO_FALHOU,
        acao: "recarregar",
        posicao,
      });
    }
  };

  // o <video> carregou a URL nova: volta ao segundo em que estava e avisa que renovou
  const aoCarregarMetadados = (el) => {
    const retomada = retomadaRef.current;
    if (!retomada) return;
    retomadaRef.current = null;
    if (retomada.posicao > 0) {
      const limite = Number.isFinite(el.duration) ? Math.max(0, el.duration - 1) : retomada.posicao;
      el.currentTime = Math.min(retomada.posicao, limite);
    }
    setAviso("O acesso ao vídeo foi renovado. Aperte o play para continuar de onde parou.");
  };

  // só vale a velocidade normal: o tempo conta em tempo real, então 1,5x/2x contaria a menos
  const travarVelocidade = (el) => {
    if (velocidadeNormal(el.playbackRate)) return;
    el.defaultPlaybackRate = 1;
    el.playbackRate = 1;
    setAviso(AVISO_VELOCIDADE);
  };

  const aoTocarVideo = (a) => {
    setFimIncompleto(null);
    evento("play", { aula_id: a.id });
    iniciarContagem();
  };

  // fim do vídeo: manda o tempo contado e, se a aula não concluiu, o aluno é avisado (sincronizar)
  const aoFimDoVideo = (a) => {
    pararContagem(false);
    evento("fim_video", { aula_id: a.id });
    return sincronizar({ fim: true });
  };

  const assistirDeNovo = () => {
    setFimIncompleto(null);
    const el = videoElRef.current;
    if (el) {
      el.currentTime = 0;
      el.play()?.catch(() => {});
    } else if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(0, true);
      playerRef.current.playVideo?.();
    }
  };

  // YouTube: monta o player quando a aula é do tipo link. O player nasce dentro de um <div>
  // criado aqui (o React não gerencia os filhos do contêiner), então trocar de aula ou tentar
  // de novo sempre começa de um contêiner limpo.
  useEffect(() => {
    if (!aula || aula.tipo !== "video" || modo !== "aulas") return undefined;
    if (fonteDoVideo(aula) !== "youtube") return undefined;
    const contenedor = ytContainerRef.current;
    if (!contenedor) return undefined;
    let vivo = true;
    let player = null;
    carregarYouTubeAPI()
      .then((YT) => {
        if (!vivo) return;
        const alvo = document.createElement("div");
        alvo.className = "w-full h-full";
        contenedor.appendChild(alvo);
        player = new YT.Player(alvo, {
          videoId: aula.youtube_id,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onStateChange: (ev) => {
              if (ev.data === YT.PlayerState.PLAYING) {
                aoTocarVideo(aula);
              } else if (ev.data === YT.PlayerState.PAUSED) {
                pararContagem();
                evento("pausa", { aula_id: aula.id });
              } else if (ev.data === YT.PlayerState.ENDED) {
                aoFimDoVideo(aula);
              }
            },
            onPlaybackRateChange: (ev) => {
              if (velocidadeNormal(ev.data)) return;
              ev.target.setPlaybackRate(1);
              setAviso(AVISO_VELOCIDADE);
            },
            onError: (ev) => {
              pararContagem();
              setFalhaVideo({
                aulaId: aula.id,
                mensagem: mensagemErroYouTube(ev.data),
                acao: "tentar",
              });
            },
          },
        });
        playerRef.current = player;
      })
      .catch((e) => {
        if (!vivo) return;
        setFalhaVideo({
          aulaId: aula.id,
          mensagem: e?.message || MSG_YOUTUBE_FALHOU,
          acao: "tentar",
        });
      });
    return () => {
      vivo = false;
      try {
        player?.destroy?.();
      } catch {
        /* player já removido */
      }
      if (playerRef.current === player) playerRef.current = null;
      contenedor.innerHTML = "";
    };
  }, [aula?.id, modo, tentativaVideo]);

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
        if (a && a.tipo !== "video" && !a.concluida && leituraLiberada(a)) iniciarContagem();
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
  // PDF sem URL: o leitor mostra "Apostila indisponível" e não há contador nem "marcar como lida"
  const apostilaIndisponivel = aula?.tipo === "pdf" && !urlApostilaValida(aula.arquivo_url);
  // vídeo: de onde vem (arquivo, YouTube ou nada), com a URL travada na que abriu a aula
  const midias = (aula && midiasDaAula[aula.id]) || {
    video_url: aula?.video_url,
    legenda_url: aula?.legenda_url,
  };
  const fonteVideo =
    aula?.tipo === "video" ? fonteDoVideo({ ...aula, video_url: midias.video_url }) : null;
  const falha = aula && falhaVideo?.aulaId === aula.id ? falhaVideo : null;
  // sem player na tela (arquivo indisponível ou falha), não há tempo para mostrar
  const videoSemPlayer = aula?.tipo === "video" && (fonteVideo === "indisponivel" || !!falha);
  const tentarYouTubeDeNovo = () => {
    setFalhaVideo(null);
    setTentativaVideo((t) => t + 1);
  };

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
            {aula.tipo === "video" &&
              (fonteVideo === "indisponivel" ? (
                <AvisoVideo mensagem={mensagemVideoIndisponivel(aula)} />
              ) : falha ? (
                <AvisoVideo
                  mensagem={falha.mensagem}
                  rotuloBotao={falha.acao === "tentar" ? "Tentar de novo" : "Recarregar"}
                  onClick={() =>
                    falha.acao === "tentar"
                      ? tentarYouTubeDeNovo()
                      : renovarVideo(aula, falha.posicao)
                  }
                />
              ) : renovandoVideo ? (
                <div
                  role="status"
                  className="aspect-video bg-black rounded-lg flex items-center justify-center gap-2 text-sm text-white"
                >
                  <Loader2 className="w-4 h-4 animate-spin" /> Renovando o acesso ao vídeo...
                </div>
              ) : (
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  {fonteVideo === "upload" ? (
                    <video
                      key={`${aula.id}:${tentativaVideo}`}
                      ref={videoElRef}
                      src={midias.video_url}
                      crossOrigin="anonymous"
                      controls
                      controlsList="nodownload noplaybackrate"
                      playsInline
                      className="w-full h-full"
                      onLoadedMetadata={(e) => aoCarregarMetadados(e.currentTarget)}
                      onPlay={() => aoTocarVideo(aula)}
                      onPause={() => {
                        pararContagem();
                        evento("pausa", { aula_id: aula.id });
                      }}
                      onEnded={() => aoFimDoVideo(aula)}
                      onRateChange={(e) => travarVelocidade(e.currentTarget)}
                      onError={(e) => aoErrarVideo(aula, e.currentTarget)}
                    >
                      {midias.legenda_url && (
                        <track
                          kind="subtitles"
                          src={midias.legenda_url}
                          srcLang="pt-BR"
                          label="Português"
                          default
                        />
                      )}
                    </video>
                  ) : (
                    <div ref={ytContainerRef} className="w-full h-full" />
                  )}
                </div>
              ))}
            {aula.tipo === "video" && !aula.concluida && fimIncompleto?.aulaId === aula.id && (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2"
              >
                <p>{fimIncompleto.texto}</p>
                <Button type="button" variant="outline" size="sm" onClick={assistirDeNovo}>
                  <RotateCcw /> Assistir de novo
                </Button>
              </div>
            )}
            {aula.tipo === "pdf" && (
              <ApostilaPdf
                key={aula.id}
                url={aula.arquivo_url}
                titulo={aula.titulo}
                onEstado={(estado) => aoMudarEstadoPdf(aula.id, estado)}
                obterUrlNova={() => urlNovaDaApostila(aula.id)}
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
              ) : apostilaIndisponivel || videoSemPlayer ? null : aula.tipo === "video" ? (
                videoSemDuracao(aula) ? (
                  <span className="text-amber-700">
                    Esta aula está sem duração cadastrada — avise o RH. O tempo não será contado.
                  </span>
                ) : (
                  <span>
                    Assistido:{" "}
                    {rotuloProgressoVideo({ segundos: segundosTela, duracao: aula.duracao_seg })} ·
                    o tempo só conta com esta tela aberta e o vídeo tocando em velocidade normal
                  </span>
                )
              ) : (
                <span>
                  Tempo de leitura: {fmtTempo(segundosTela)}
                  {minimo ? ` de ${fmtTempo(minimo)}` : ""} · o tempo só conta com esta tela aberta
                </span>
              )}
            </div>
            {aula.tipo !== "video" && !aula.concluida && !apostilaIndisponivel && (
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
