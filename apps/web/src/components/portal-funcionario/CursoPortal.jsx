import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  ListChecks,
  Signpost,
  ClipboardList,
  Clock,
} from "lucide-react";
import { apiPortal, criarFila, fmtTempo, fmtDataHora, armazenamentoPortal } from "./api";
import AvaliacaoPortal from "./AvaliacaoPortal";
import CertificadoPortal from "./CertificadoPortal";
import DuvidasPortal from "./DuvidasPortal";
import ApostilaPdf from "./ApostilaPdf";
import QuestionarioPortal from "./QuestionarioPortal";
import CasoPortal from "./CasoPortal";
import PrazoDoCurso from "./PrazoDoCurso";
import { leituraPodeContar, urlApostilaValida } from "@/lib/apostila-pdf";
import {
  MSG_PREVIA_CONCLUSAO,
  avisoDeAulaConcluida,
  botaoDeLeitura,
  chaveDoPainelDaAula,
  rotuloDoTipoNaLista,
  tempoPrevisto,
} from "@/lib/portal-leitura";
import { videoSemDuracao } from "@/lib/ead-duracao";
import {
  AVISO_VELOCIDADE,
  MSG_PLAYER_DEMOROU,
  MSG_RECARGA_SEM_REDE,
  MSG_VIDEO_FALHOU,
  MSG_VIDEO_RENOVADO,
  MSG_YOUTUBE_FALHOU,
  aulaDoCurso,
  avisoFimIncompleto,
  avisoPedePlay,
  avisoRetomada,
  criarCarregadorYouTube,
  criarVigiaDoPlayer,
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
  MSG_PROJETO_RENOVADO,
  MSG_PROJETO_SEM_LINK,
  abrirProjetoPedagogico,
  aulaSeguinte,
  cursoDespublicado,
  cursoDeApoio,
  praticaDoCurso,
  praticaPendente,
  preRequisitoPendente,
  MSG_CURSO_DE_APOIO,
  erroAposEnvioCerto,
  guardarPosicao,
  lerPosicao,
  mensagemDeFalha,
  msTemporizadorProva,
  numerarAulas,
  posicaoParaRetomar,
  progressoDoCurso,
  proximaAulaPendente,
  provaAguardando,
  textoDoAvisoPassageiro,
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

const ICONE_TIPO = {
  video: PlayCircle,
  pdf: FileText,
  texto: BookOpen,
  questionario: ListChecks,
  caso: Signpost,
  tarefa: ClipboardList,
};

/**
 * Marcador no fim do texto da aula (texto e tarefa, A5): quando ele aparece na tela, o botão de concluir
 * acende. Texto curto, que cabe na tela, mostra o marcador de cara e libera na hora. Sem
 * IntersectionObserver (navegador antigo) o fim não pode ser medido, e o aluno não pode ficar preso: libera.
 */
function MarcadorDeFim({ onVisivel }) {
  const ref = useRef(null);
  const onVisivelRef = useRef(onVisivel);
  onVisivelRef.current = onVisivel;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== "function") {
      onVisivelRef.current?.();
      return undefined;
    }
    const observador = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      observador.disconnect();
      onVisivelRef.current?.();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return <div ref={ref} aria-hidden="true" className="h-px" />;
}

/** Tarefa de estudo (A4): instruções e "o que produzir" (o texto da aula) e o tempo previsto. */
function TarefaDeEstudo({ aula }) {
  const previsto = tempoPrevisto(aula.duracao_seg);
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
          <ClipboardList className="w-4 h-4 text-slate-500" /> Atividade de estudo
        </span>
        {previsto && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" /> Tempo previsto: {previsto}
          </span>
        )}
      </div>
      <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
        {aula.conteudo_texto}
      </div>
      <p className="text-xs text-slate-500">
        Faça a atividade fora desta tela, como as instruções pedem, e volte aqui para confirmar.
      </p>
    </div>
  );
}

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
  // acesso em andamento (id da aula, para a tela de outra aula não mostrar o spinner dela), número
  // da tentativa (remonta o player) e aviso de fim com tempo a menos
  const [falhaVideo, setFalhaVideo] = useState(null);
  const [renovandoVideo, setRenovandoVideo] = useState(null);
  const [tentativaVideo, setTentativaVideo] = useState(0);
  const [fimIncompleto, setFimIncompleto] = useState(null); // { aulaId, texto }
  // player do YouTube pronto ("aula:tentativa" do que já disparou onReady); até lá, "Carregando vídeo..."
  const [ytPronto, setYtPronto] = useState("");
  // "Projeto pedagógico" renovando o link vencido antes de abrir
  const [abrindoProjeto, setAbrindoProjeto] = useState(false);
  // URLs de vídeo/legenda de cada aula, travadas na que abriu a aula: refazer os dados (concluir
  // aula, dúvida...) assina URLs novas, e trocar o src no meio do vídeo o recarregaria do início
  const [midiasDaAula, setMidiasDaAula] = useState({});
  // a última busca dos dados falhou: o aluno lê o problema e tem o botão "Tentar de novo"
  const [falhaRecarga, setFalhaRecarga] = useState(false);
  // relógio que só serve para refazer a conta quando acaba o intervalo da próxima tentativa da prova
  const [relogio, setRelogio] = useState(() => Date.now());
  // leituras (PDF, texto, tarefa) que o aluno já rolou até o fim nesta visita ao curso: o botão de
  // concluir só acende com o fim à vista (A5); voltar à aula não pede a rolagem de novo
  const [fimAlcancado, setFimAlcancado] = useState({});

  const fila = useMemo(() => criarFila(), []);
  const assistidoRef = useRef(0);
  const contandoRef = useRef(false);
  const timersRef = useRef({ tick: null, envio: null });
  const videoElRef = useRef(null);
  const playerRef = useRef(null);
  const ytContainerRef = useRef(null);
  const aulaRef = useRef(null);
  const renovandoRef = useRef(null); // id da aula cujo acesso ao vídeo está sendo renovado
  const renovacaoAutoRef = useRef({}); // aulaId -> quando o player renovou o acesso sozinho
  const retomadaRef = useRef(null); // { posicao }: o vídeo trocou de URL e volta a este segundo
  const posicaoInicialRef = useRef(null); // { aulaId, seg }: onde o aluno parou ao abrir a aula
  const abriuProximaRef = useRef(false);
  // texto do erro de um ENVIO (progresso ou evento) que é aviso passageiro (409/429, T31): o próximo
  // envio que der certo tira da tela só ele; outro erro que o aluno esteja lendo fica
  const avisoDeEnvioRef = useRef("");
  // estado da apostila (PDF) da aula aberta: o tempo de leitura só corre com ela na tela
  const estadoPdfRef = useRef({ aulaId: null, estado: "carregando" });
  // painel da aula aberta (conteúdo, botão de concluir e "Próxima aula"); a lista de aulas fica abaixo dele
  const painelAulaRef = useRef(null);

  const aula = aulas.find((a) => a.id === aulaId) || null;
  aulaRef.current = aula;

  // A aula aberta começa no topo da janela (A5). O painel e a lista de aulas ficam empilhados na mesma
  // página: sem esta rolagem, ao abrir uma aula (ou clicar "Próxima aula") a página continua rolada para
  // baixo e o marcador do fim da aula nova, que observa a janela, já nasce à vista e acende o botão sem
  // leitura. É um efeito de LAYOUT: roda no mesmo commit em que o painel e o marcador entram, antes de
  // qualquer efeito comum (o MarcadorDeFim começa a observar num `useEffect`), e a primeira medição do
  // IntersectionObserver só acontece no quadro seguinte, já com a página rolada. Sem animação: o
  // `scroll-behavior` smooth deixaria o marcador ser medido no meio da rolagem. Texto curto, que cabe na
  // tela, continua liberando na hora: o marcador fica à vista mesmo com o painel no topo.
  const chavePainel = chaveDoPainelDaAula({ aulaId, modo });
  useLayoutEffect(() => {
    if (!chavePainel) return;
    const painel = painelAulaRef.current;
    if (!painel?.scrollIntoView) return;
    try {
      painel.scrollIntoView({ block: "start", behavior: "instant" });
    } catch {
      painel.scrollIntoView(true); // navegador antigo, sem o valor "instant"
    }
  }, [chavePainel]);

  const tratarErro = (e) => {
    if (e?.codigo === "SESSAO" || e?.codigo === "TROCAR_SENHA") onErroSessao(e);
    else setErro(mensagemDeFalha(e));
  };

  // erro de um envio de progresso ou de evento: igual ao `tratarErro`, e guarda o texto quando é um aviso
  // passageiro (409/429) para o próximo envio certo poder tirá-lo da tela
  const tratarErroDeEnvio = (e) => {
    tratarErro(e);
    avisoDeEnvioRef.current = textoDoAvisoPassageiro(e);
  };
  const envioDeuCerto = () => {
    const aviso = avisoDeEnvioRef.current;
    if (!aviso) return;
    avisoDeEnvioRef.current = "";
    setErro((atual) => erroAposEnvioCerto(atual, aviso));
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
    fila(() => chamarPortal("evento", { evento: nome, matricula_id: mat.id, ...extra }, token))
      .then((r) => {
        envioDeuCerto();
        return r;
      })
      .catch(tratarErroDeEnvio);

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
      envioDeuCerto();
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
            ? "Aula concluída."
            : r.curso_concluido
              ? "Curso concluído!"
              : r.precisa_avaliacao
                ? "Todas as aulas concluídas — agora faça a avaliação final."
                : "Aula concluída — a próxima já está liberada."
        );
      } else if (fim && a.tipo === "video" && !r.aula_concluida) {
        // acabou com menos do mínimo contado (2x, 1,5x, trechos pulados): diz quanto foi contado
        const contagem = { segundos: assistidoRef.current, duracao: a.duracao_seg };
        if (precisaReassistir(contagem)) {
          setFimIncompleto({ aulaId: a.id, texto: avisoFimIncompleto(contagem) });
        }
      }
    } catch (e) {
      // a leitura não exige mais tempo mínimo (A5): o servidor conclui com o clique
      tratarErroDeEnvio(e);
    }
  };

  // tempo de tela das aulas sem player (leituras e atividades) pode contar agora? PDF: só com URL válida
  // e a apostila aberta na tela
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

  // o aluno chegou ao fim do conteúdo da aula (marcador do texto/tarefa ou última página da apostila)
  const marcarFim = (id) =>
    setFimAlcancado((atual) => (atual[id] ? atual : { ...atual, [id]: true }));

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
      envioDeuCerto();
    } catch (e) {
      // a troca não aconteceu: a aula anterior segue aberta COM a falha de vídeo e o "Tentar de novo"
      tratarErroDeEnvio(e);
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
    // a troca vai acontecer: só agora saem a falha do vídeo, o aviso de fim incompleto e a retomada
    // da aula anterior (se o evento acima falhasse, a aula anterior os manteria)
    setFalhaVideo(null);
    setFimIncompleto(null);
    retomadaRef.current = null;
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
    if (renovandoRef.current === a.id) return;
    renovandoRef.current = a.id;
    setFalhaVideo(null);
    setRenovandoVideo(a.id);
    const dados = await recarregar();
    const nova = aulaDoCurso(dados, mat.id, a.id);
    if (renovandoRef.current === a.id) renovandoRef.current = null;
    setRenovandoVideo((atual) => (atual === a.id ? null : atual));
    // O aluno abriu outra aula enquanto a busca corria: o resultado era da aula antiga. Não aplica
    // nada (nem troca a URL, nem pula para o segundo de lá, nem mostra falha de outra aula): o
    // spinner é por aula, então o player da aula nova (inclusive o do YouTube) já está na tela.
    if (aulaRef.current?.id !== a.id) return;
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
        setAviso(avisoRetomada(inicial.seg));
      }
      return;
    }
    retomadaRef.current = null;
    if (retomada.posicao > 0) {
      const limite = Number.isFinite(el.duration) ? Math.max(0, el.duration - 1) : retomada.posicao;
      el.currentTime = Math.min(retomada.posicao, limite);
    }
    setAviso(MSG_VIDEO_RENOVADO);
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
    // os avisos "aperte o play" cumpriram o papel; os demais (velocidade, aula concluída) ficam
    setAviso((atual) => (avisoPedePlay(atual) ? "" : atual));
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
    const chaveYouTube = `${aula.id}:${tentativaVideo}`;
    let vivo = true;
    let player = null;
    let vigia = null; // tempo limite do player para ficar pronto ("Carregando vídeo..." não dura para sempre)
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
          setAviso(avisoRetomada(inicioSeg));
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
            onReady: () => {
              vigia?.parar();
              if (vivo) setYtPronto(chaveYouTube);
            },
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
              vigia?.parar();
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
        // o iframe pode nunca avisar que está pronto (extensão que o bloqueia, rede que não chega):
        // passado o limite, a falha aparece com "Tentar de novo"
        vigia = criarVigiaDoPlayer({
          aoEstourar: () => {
            if (!vivo) return;
            setFalhaVideo({ aulaId: aula.id, mensagem: MSG_PLAYER_DEMOROU, acao: "tentar" });
          },
        });
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
      vigia?.parar();
      // o player morre aqui: o próximo (voltar da prova, A → B → A, nova tentativa) nasce com a mesma
      // chave e precisa do "Carregando vídeo..." de novo até o seu onReady
      setYtPronto("");
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
    // a espera já vem limitada ao máximo do setTimeout (acima disso ele dispara na hora e a tela
    // entraria em laço): num intervalo enorme o temporizador só acorda antes e a conta é refeita
    const espera = msTemporizadorProva(item.avaliacao?.proxima_em, Date.now());
    if (!espera) return undefined;
    const timer = setTimeout(() => setRelogio(Date.now()), espera);
    const aoVoltar = () => {
      if (!document.hidden) setRelogio(Date.now());
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [item.avaliacao?.proxima_em, relogio]);

  const voltar = async () => {
    await pararContagem();
    onVoltar();
  };

  // O link do projeto pedagógico é assinado por 3 h, como o dos vídeos: com os dados já velhos ele pode
  // estar vencido. Os dados são buscados de novo ANTES de abrir; sem link novo o aluno lê o que houve
  // (antes abria uma aba com erro, sem aviso). A regra está em lib/portal-curso.js (com teste).
  const abrirProjeto = async () => {
    const resultado = await abrirProjetoPedagogico({
      janela: window,
      urlAtual: item.curso?.projeto_pedagogico_url,
      vencida: dadosPrecisamRenovar(dadosCarregadosEm?.() ?? 0, Date.now()),
      recarregar,
      matriculaId: mat.id,
      aoComecarBusca: () => setAbrindoProjeto(true),
      aoTerminarBusca: () => setAbrindoProjeto(false),
    });
    if (resultado === "aberto") evento("abrir_projeto");
    else if (resultado === "renovado") setAviso(MSG_PROJETO_RENOVADO);
    else setErro(MSG_PROJETO_SEM_LINK);
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

  // PDF sem URL: o leitor mostra "Apostila indisponível" e não há contador nem "marcar como lida"
  const apostilaIndisponivel = aula?.tipo === "pdf" && !urlApostilaValida(aula.arquivo_url);
  // botão de concluir a leitura (texto, PDF, tarefa): acende ao chegar ao fim, sem relógio (A5)
  const botaoLeitura = aula
    ? botaoDeLeitura({
        tipo: aula.tipo,
        chegouAoFim: fimAlcancado[aula.id] === true,
        concluida: aula.concluida,
        previa,
        indisponivel: apostilaIndisponivel,
      })
    : null;
  const concluirLeitura = async () => {
    // prévia: nada é gravado e a aula não conclui; o RT só vê que o botão funcionaria
    if (previa) {
      setAviso(MSG_PREVIA_CONCLUSAO);
      return;
    }
    await pararContagem(false);
    sincronizar({ concluir: true });
  };

  // Questionário aprovado ou caso concluído: quem concluiu a aula foi a ação própria, no servidor (o
  // `progresso` nunca conclui essas aulas). O tempo de tela que ainda não tinha ido segue para a trilha, sem
  // pedir conclusão, e a lista é buscada de novo para liberar a próxima aula. Prévia: só o aviso.
  const aoConcluirAtividade = async (resposta) => {
    if (previa) {
      setAviso(MSG_PREVIA_CONCLUSAO);
      return;
    }
    const a = aulaRef.current;
    pararContagem(false);
    if (a) {
      const segundos = Math.floor(assistidoRef.current);
      fila(() =>
        chamarPortal(
          "progresso",
          { matricula_id: mat.id, aula_id: a.id, segundos_assistidos: segundos },
          token
        )
      )
        .then(() => envioDeuCerto())
        .catch(tratarErroDeEnvio);
    }
    const novos = await atualizarAulas();
    setAviso(avisoDeAulaConcluida({ resposta, dados: novos, matriculaId: mat.id }));
  };
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
              className="text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-md px-2 py-1.5 disabled:opacity-60"
              disabled={abrindoProjeto}
              onClick={abrirProjeto}
            >
              {abrindoProjeto ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}{" "}
              Projeto pedagógico
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
              certificado nem trilha. Todas as aulas estão liberadas e a prova e os questionários
              mostram o gabarito.
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

        {/* curso de apoio: o aluno sabe desde o começo que não há certificado (T8); concluído, a
            mensagem sai no bloco do certificado, logo abaixo */}
        {mat.status !== "concluido" && cursoDeApoio(item.curso) && (
          <div
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
          >
            {MSG_CURSO_DE_APOIO}
          </div>
        )}

        {/* curso que exige outro (T23): o aluno sabe desde o começo que só emite o certificado com o curso
            exigido concluído e dentro da validade; concluído, o aviso sai no bloco do certificado, abaixo */}
        {mat.status !== "concluido" && preRequisitoPendente(item) && (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {preRequisitoPendente(item).texto}
          </div>
        )}

        {/* parte prática presencial do semipresencial (T12): "pendente" ou "realizada em DD/MM, em <local>"; com a
            teoria concluída e a prática pendente, o aviso sai no bloco do certificado, logo abaixo */}
        {praticaDoCurso(item) && !(mat.status === "concluido" && praticaPendente(item)) && (
          <div
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
          >
            {praticaDoCurso(item).texto}
          </div>
        )}

        {/* prazo para concluir e dedicação diária do projeto pedagógico (T25); some quando o curso não os tem */}
        {modo !== "avaliacao" && <PrazoDoCurso item={item} previa={previa} />}

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
          <div ref={painelAulaRef} className="space-y-2">
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
              ) : renovandoVideo === aula.id ? (
                <div
                  role="status"
                  className="aspect-video bg-black rounded-lg flex items-center justify-center gap-2 text-sm text-white"
                >
                  <Loader2 className="w-4 h-4 animate-spin" /> Renovando o acesso ao vídeo...
                </div>
              ) : (
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
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
                    <>
                      <div ref={ytContainerRef} className="w-full h-full" />
                      {/* o player nasce no contêiner acima (fora do React); este aviso cobre o quadro até o
                          YouTube carregar e o player dizer que está pronto */}
                      {ytPronto !== `${aula.id}:${tentativaVideo}` && (
                        <div
                          role="status"
                          className="absolute inset-0 flex items-center justify-center gap-2 bg-black text-sm text-white"
                        >
                          <Loader2 className="w-4 h-4 animate-spin" /> Carregando vídeo...
                        </div>
                      )}
                    </>
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
                onFim={() => marcarFim(aula.id)}
              />
            )}
            {aula.tipo === "texto" && (
              <div className="bg-white rounded-lg border p-4 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                {aula.conteudo_texto}
              </div>
            )}
            {aula.tipo === "tarefa" && <TarefaDeEstudo aula={aula} />}
            {(aula.tipo === "texto" || aula.tipo === "tarefa") && (
              <MarcadorDeFim key={aula.id} onVisivel={() => marcarFim(aula.id)} />
            )}
            {aula.tipo === "questionario" && (
              <QuestionarioPortal
                key={aula.id}
                api={api}
                item={item}
                aula={aula}
                token={token}
                fila={fila}
                tratarErro={tratarErro}
                onConcluida={aoConcluirAtividade}
              />
            )}
            {aula.tipo === "caso" && (
              <CasoPortal
                key={aula.id}
                api={api}
                item={item}
                aula={aula}
                token={token}
                fila={fila}
                tratarErro={tratarErro}
                onConcluida={aoConcluirAtividade}
              />
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
                <span>Prévia: o tempo de tela não é contado nem gravado.</span>
              ) : (
                <span>
                  Tempo de tela: {fmtTempo(segundosTela)} · vai para a trilha do curso e só conta
                  com esta tela aberta
                </span>
              )}
            </div>
            {botaoLeitura && (
              <div className="space-y-1">
                <Button
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
                  disabled={!botaoLeitura.habilitado}
                  onClick={concluirLeitura}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {botaoLeitura.rotulo}
                </Button>
                {botaoLeitura.dica && (
                  <p className="text-xs text-center text-slate-500">{botaoLeitura.dica}</p>
                )}
              </div>
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
                Avaliação final
                {av.total_questoes
                  ? ` · ${av.total_questoes} ${av.total_questoes === 1 ? "questão" : "questões"}`
                  : ""}{" "}
                · nota mínima {av.nota_minima}%
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
                    <span className="flex-1 min-w-0 text-sm">
                      {a.numero}. {a.titulo}
                      {rotuloDoTipoNaLista(a.tipo) && (
                        <span className="block text-[11px] text-slate-400">
                          {rotuloDoTipoNaLista(a.tipo)}
                        </span>
                      )}
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
