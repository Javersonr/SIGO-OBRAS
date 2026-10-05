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
  ChevronRight,
  Eye,
} from "lucide-react";
import { apiPortal, criarFila, fmtTempo, fmtDataHora, armazenamentoPortal } from "./api";
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
import {
  aulaSeguinte,
  cursoDespublicado,
  guardarPosicao,
  lerPosicao,
  mensagemDeFalha,
  msAteLiberar,
  numerarAulas,
  posicaoParaRetomar,
  progressoDoCurso,
  proximaAulaPendente,
  provaAguardando,
} from "@/lib/portal-curso";

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
 *
 * `api` é injetada (padrão: o portal de verdade). A prévia do responsável técnico ("Ver como aluno")
 * passa uma API de mentira com `previa: true` (lib/portal-previa.js): nada vai ao servidor, o tempo
 * não é contado, a prova fica disponível sem concluir as aulas e nada é guardado no aparelho.
 */
export default function CursoPortal({
  item,
  token,
  recarregar,
  empresaLogoUrl = null,
  dadosCarregadosEm,
  abrirProximaAula = false,
  onVoltar,
  onErroSessao,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const previa = api.previa === true;
  // o que o portal guarda no aparelho (posição do vídeo, respostas da prova) não vale na prévia
  const armazenamento = () => (previa ? null : armazenamentoPortal());
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
  // a última busca dos dados falhou: o aluno lê o problema e tem o botão "Tentar de novo"
  const [falhaRecarga, setFalhaRecarga] = useState(false);
  // relógio que só serve para refazer a conta quando acaba o intervalo da próxima tentativa da prova
  const [agora, setAgora] = useState(() => Date.now());

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
  const posicaoInicialRef = useRef(null); // { aulaId, seg }: onde o aluno parou ao abrir a aula
  const abriuProximaRef = useRef(false);
  // estado da apostila (PDF) da aula aberta: o tempo de leitura só corre com ela na tela
  const estadoPdfRef = useRef({ aulaId: null, estado: "carregando" });

  const aula = aulas.find((a) => a.id === aulaId) || null;
  aulaRef.current = aula;

  const tratarErro = (e) => {
    if (e?.codigo === "SESSAO" || e?.codigo === "TROCAR_SENHA") onErroSessao(e);
    else setErro(mensagemDeFalha(e));
  };

  // Busca os dados de novo. Se falhar, o aluno LÊ o problema (antes a falha passava em silêncio e a tela
  // dizia que a próxima aula já estava liberada) e tem o botão "Tentar de novo".
  const atualizarAulas = async () => {
    const dados = await recarregar();
    setFalhaRecarga(!dados);
    return dados;
  };

  // posição atual do vídeo no aparelho, para retomar de onde o aluno parou (só aula de vídeo ainda não concluída)
  const guardarPosicaoAtual = () => {
    const a = aulaRef.current;
    if (!a || a.tipo !== "video" || a.concluida) return;
    const segundos = videoElRef.current?.currentTime ?? playerRef.current?.getCurrentTime?.();
    guardarPosicao(armazenamento(), mat.id, a.id, segundos);
  };

  const evento = (nome, extra = {}) =>
    fila(() =>
      chamarPortal("evento", { evento: nome, matricula_id: mat.id, ...extra }, token)
    ).catch(tratarErro);

  // `fim`: o vídeo acabou; se mesmo assim a aula não concluiu, o aluno é avisado
  const sincronizar = async ({ concluir = false, fim = false } = {}) => {
    const a = aulaRef.current;
    if (!a || previa) return; // prévia: o tempo não é contado nem enviado
    guardarPosicaoAtual();
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
        const novos = await atualizarAulas();
        // sem os dados novos a tela não sabe o que foi liberado: só afirma o que o servidor confirmou
        setAviso(
          !novos
            ? "✅ Aula concluída."
            : r.curso_concluido
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
    if (previa || contandoRef.current || document.hidden) return;
    contandoRef.current = true;
    timersRef.current.tick = setInterval(() => {
      assistidoRef.current += 1;
      setSegundosTela(assistidoRef.current);
    }, 1000);
    timersRef.current.envio = setInterval(sincronizar, 10000);
  }

  function pararContagem(enviar = true) {
    if (!contandoRef.current) return undefined;
    guardarPosicaoAtual(); // o vídeo estava tocando: guarda o ponto em que parou
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
    // vídeo: volta ao ponto em que o aluno parou (posição guardada no aparelho; sem ela, o tempo já contado)
    posicaoInicialRef.current =
      a.tipo === "video"
        ? {
            aulaId: a.id,
            seg: posicaoParaRetomar({
              salva: lerPosicao(armazenamento(), mat.id, a.id),
              segundosAssistidos: a.segundos_assistidos,
              duracao: a.duracao_seg,
              concluida: a.concluida,
            }),
          }
        : null;
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
    if (!retomada) {
      // primeira vez que a aula carrega: volta ao ponto em que o aluno parou da última vez
      const inicial = posicaoInicialRef.current;
      if (inicial && inicial.aulaId === aulaRef.current?.id && inicial.seg > 0) {
        posicaoInicialRef.current = null;
        const limite = Number.isFinite(el.duration) ? Math.max(0, el.duration - 1) : inicial.seg;
        el.currentTime = Math.min(inicial.seg, limite);
        setAviso(
          `Retomamos o vídeo de onde você parou (${fmtTempo(inicial.seg)}). Aperte o play para continuar.`
        );
      }
      return;
    }
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
        // retoma de onde o aluno parou (o YouTube aceita o segundo inicial em `start`)
        const inicial = posicaoInicialRef.current;
        const inicioSeg = inicial?.aulaId === aula.id ? inicial.seg : 0;
        if (inicioSeg > 0) {
          posicaoInicialRef.current = null;
          setAviso(
            `Retomamos o vídeo de onde você parou (${fmtTempo(inicioSeg)}). Aperte o play para continuar.`
          );
        }
        player = new YT.Player(alvo, {
          videoId: aula.youtube_id,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            ...(inicioSeg > 0 ? { start: inicioSeg } : {}),
          },
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

  // "Começar"/"Continuar" no painel: abre direto na próxima aula pendente (depois do evento abrir_curso,
  // porque os dois entram na mesma fila)
  useEffect(() => {
    if (!abrirProximaAula || abriuProximaRef.current) return;
    abriuProximaRef.current = true;
    const proxima = proximaAulaPendente(aulas);
    if (proxima) abrirAula(proxima);
  }, []);

  // A nova tentativa da prova libera sozinha: quando o intervalo acaba, o botão volta a ficar ativo
  // (sem isto a conta só era refeita se o aluno mexesse na tela). Também refaz a conta quando a aba
  // volta a ficar visível, porque o celular pausa temporizadores com a tela apagada.
  useEffect(() => {
    const espera = msAteLiberar(item.avaliacao?.proxima_em, Date.now());
    if (!espera) return undefined;
    const timer = setTimeout(() => setAgora(Date.now()), espera + 300);
    const aoVoltar = () => {
      if (!document.hidden) setAgora(Date.now());
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [item.avaliacao?.proxima_em, agora]);

  const voltar = async () => {
    await pararContagem();
    onVoltar();
  };

  const aulasNumeradas = numerarAulas(aulas);
  const { feitas, semAulas } = progressoDoCurso(aulas);
  const todasFeitas = !semAulas && feitas === aulas.length;
  const av = item.avaliacao || {};
  const aguardando = provaAguardando(av.proxima_em, Date.now());
  // prévia: o RT abre a prova sem concluir as aulas (nada é gravado)
  const provaLiberada = todasFeitas || previa;
  const podeFazerProva =
    provaLiberada && item.curso?.tem_avaliacao && !mat.avaliacao_aprovada && !av.limite_atingido;
  const proximaPendente = proximaAulaPendente(aulas);
  const numeroDaAula = (a) => aulasNumeradas.find((x) => x.id === a?.id)?.numero;
  // botão "Próxima aula": só depois de concluir a aula aberta (as aulas seguem em ordem)
  // (na prévia, que não conclui aula, o botão leva à seguinte da lista)
  const seguinte = aula && (aula.concluida || previa) ? aulaSeguinte(aulas, aula.id) : null;

  // aulas agrupadas por módulo, na ordem
  const grupos = [];
  for (const a of aulasNumeradas) {
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
              {previa
                ? `${aulas.length} aulas · prévia`
                : `${feitas}/${aulas.length} aulas concluídas`}
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
        {previa && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"
          >
            <Eye className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-[12rem]">
              <strong>Prévia como aluno.</strong> Nada é gravado: sem matrícula, tempo, tentativa,
              certificado nem trilha. Todas as aulas estão liberadas e a prova mostra o gabarito.
            </span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={voltar}>
              Sair da prévia
            </Button>
          </div>
        )}
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

        {falhaRecarga && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
          >
            <span className="flex-1">
              Não foi possível atualizar o curso agora. Verifique sua conexão: a lista de aulas pode
              estar desatualizada (a próxima aula pode já estar liberada).
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 bg-white"
              onClick={atualizarAulas}
            >
              <RefreshCw /> Tentar de novo
            </Button>
          </div>
        )}
        {mat.status !== "concluido" && cursoDespublicado(item.curso) && (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            O RH despublicou este curso (pode estar em revisão). Em caso de dúvida, fale com o RH.
          </div>
        )}

        {/* durante a prova o certificado sai da frente: o aluno só vê as questões */}
        {modo !== "avaliacao" && (mat.status === "concluido" || item.certificado) && (
          <CertificadoPortal
            api={api}
            item={item}
            token={token}
            empresaLogoUrl={empresaLogoUrl}
            evento={evento}
            recarregar={atualizarAulas}
            tratarErro={tratarErro}
          />
        )}

        {modo === "avaliacao" ? (
          <AvaliacaoPortal
            api={api}
            item={item}
            token={token}
            fila={fila}
            tratarErro={tratarErro}
            onFechar={async () => {
              await atualizarAulas();
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
                ) : previa ? (
                  <span>Prévia: o tempo assistido não é contado nem gravado.</span>
                ) : (
                  <span>
                    Assistido:{" "}
                    {rotuloProgressoVideo({ segundos: segundosTela, duracao: aula.duracao_seg })} ·
                    o tempo só conta com esta tela aberta e o vídeo tocando em velocidade normal
                  </span>
                )
              ) : previa ? (
                <span>Prévia: o tempo de leitura não é contado nem gravado.</span>
              ) : (
                <span>
                  Tempo de leitura: {fmtTempo(segundosTela)}
                  {minimo ? ` de ${fmtTempo(minimo)}` : ""} · o tempo só conta com esta tela aberta
                </span>
              )}
            </div>
            {aula.tipo !== "video" && !aula.concluida && !apostilaIndisponivel && !previa && (
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
            {seguinte && (
              // o título inteiro vai no rótulo: o Button tem whitespace-nowrap, então quebra a linha
              // (whitespace-normal), cresce em altura (h-auto) e a seta fica fixa à direita
              <Button
                type="button"
                className="w-full h-auto min-h-11 py-2 whitespace-normal bg-slate-900 hover:bg-slate-800"
                onClick={() => abrirAula(seguinte)}
              >
                <span className="min-w-0 flex-1 text-left break-words">
                  Próxima aula: {numeroDaAula(seguinte)}. {seguinte.titulo}
                </span>
                <ChevronRight className="w-4 h-4 ml-1 shrink-0" />
              </Button>
            )}
          </div>
        ) : semAulas ? (
          // curso sem nenhuma aula: o aluno lê o que houve em vez de ficar diante de uma tela vazia
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            Este curso ainda não tem aulas cadastradas. Avise o RH para liberar o conteúdo; seu
            progresso não é afetado.
          </div>
        ) : (
          mat.status !== "concluido" &&
          !todasFeitas && (
            <div className="rounded-lg border bg-white p-3 space-y-2">
              <p className="text-sm text-slate-600">Escolha uma aula liberada na lista abaixo.</p>
              {proximaPendente && (
                // mesmo tratamento do "Próxima aula": título longo quebra linha em vez de vazar
                <Button
                  type="button"
                  className="w-full h-auto min-h-11 py-2 whitespace-normal bg-slate-900 hover:bg-slate-800"
                  onClick={() => abrirAula(proximaPendente)}
                >
                  <span className="min-w-0 flex-1 text-left break-words">
                    Continuar: {numeroDaAula(proximaPendente)}. {proximaPendente.titulo}
                  </span>
                  <ChevronRight className="w-4 h-4 ml-1 shrink-0" />
                </Button>
              )}
            </div>
          )
        )}

        {modo === "aulas" &&
          provaLiberada &&
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
                      {a.numero}. {a.titulo}
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
          api={api}
          item={item}
          token={token}
          aulaId={aulaId}
          recarregar={atualizarAulas}
          tratarErro={tratarErro}
        />
      </div>
    </div>
  );
}
