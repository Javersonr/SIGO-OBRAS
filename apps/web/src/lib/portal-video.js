/**
 * Player do Portal do Funcionário (T13) — regras puras, sem DOM e sem rede.
 *
 * O aluno nunca pode ficar diante de uma tela preta ou em branco sem texto: quando o
 * vídeo não toca, quando termina com o tempo contado a menos ou quando o link assinado
 * vence, o portal diz o que houve e o que fazer. A lógica daqui é testada em
 * portal-video.test.js; quem usa é components/portal-funcionario/CursoPortal.jsx.
 */
import { urlApostilaValida as urlHttpValida } from "./apostila-pdf";

/**
 * Vídeo conclui sozinho a partir de 90% contados (arredondado para cima).
 * Mesma regra de `conclusaoDaAula` em supabase/functions/portal-funcionario/regras.ts:
 * se mudar lá, mude aqui.
 */
export const PCT_MINIMO_VIDEO = 0.9;

/**
 * As URLs assinadas de vídeo, legenda e PDF valem 3 h (TTL_ARQUIVO do portal-funcionario).
 * Com mais de 2 h 30 de idade, os dados são buscados de novo ao abrir uma aula (sobra meia hora).
 */
export const IDADE_MAX_DADOS_MS = (2 * 60 + 30) * 60 * 1000;

/** O player só renova sozinho uma vez nesta janela por aula; se falhar de novo, mostra a mensagem. */
export const JANELA_RENOVACAO_AUTO_MS = 5 * 60 * 1000;

export const AVISO_VELOCIDADE =
  "A velocidade fica sempre em 1x: o tempo do treinamento só é contado em velocidade normal.";

export const MSG_VIDEO_FALHOU =
  "Não foi possível carregar o vídeo. Toque em Recarregar; se continuar, avise o RH.";
export const MSG_RECARGA_SEM_REDE =
  "Não foi possível recarregar o vídeo agora. Verifique sua conexão e tente de novo.";
export const MSG_YOUTUBE_FALHOU =
  "Não foi possível carregar o YouTube. Verifique sua conexão (ou algum bloqueador de anúncios) e tente de novo.";

const positivo = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const inteiro = (n) => Math.max(0, Math.floor(Number(n) || 0));

/** m:ss, para baixo (igual ao fmtTempo do portal, que importa o cliente e não entra aqui). */
const mmss = (seg) => {
  const s = inteiro(seg);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Segundos contados que concluem o vídeo; 0 quando a duração não é válida. */
export function minimoVideoSeg(duracao) {
  const d = positivo(duracao);
  return d ? Math.ceil(d * PCT_MINIMO_VIDEO) : 0;
}

/** Percentual da duração já contado (0 a 100, sempre para baixo: 66,7% mostra 66%). */
export function percentualContado(segundos, duracao) {
  const d = positivo(duracao);
  if (!d) return 0;
  return Math.min(100, Math.floor((inteiro(segundos) * 100) / d));
}

/** No fim do vídeo, o tempo contado ainda não chega ao mínimo (assistiu em 1,5x/2x ou pulando). */
export function precisaReassistir({ segundos, duracao }) {
  const minimo = minimoVideoSeg(duracao);
  return minimo > 0 && inteiro(segundos) < minimo;
}

/** "1:05 de 3:00 (mínimo 2:42)"; sem duração cadastrada, só o tempo contado. */
export function rotuloProgressoVideo({ segundos, duracao }) {
  const d = positivo(duracao);
  if (!d) return mmss(segundos);
  const visto = Math.min(inteiro(segundos), Math.floor(d));
  return `${mmss(visto)} de ${mmss(d)} (mínimo ${mmss(minimoVideoSeg(d))})`;
}

/** Aviso do fim do vídeo com menos do que o mínimo contado. */
export function avisoFimIncompleto({ segundos, duracao }) {
  const pct = percentualContado(segundos, duracao);
  return (
    `O vídeo terminou, mas só ${pct}% foi contado — o mínimo para concluir a aula é ` +
    `${Math.round(PCT_MINIMO_VIDEO * 100)}%. O tempo só conta com o vídeo tocando em ` +
    `velocidade normal, sem pular trechos. O que já foi contado fica somado: toque em ` +
    `"Assistir de novo" para completar.`
  );
}

/** Só a velocidade normal (1x) conta tempo. */
export function velocidadeNormal(taxa) {
  return taxa === 1;
}

/**
 * Os dados do portal (com as URLs assinadas) já passaram de 2 h 30 e devem ser buscados de
 * novo antes de abrir a aula. Não saber quando carregou (0, nulo, inválido) também renova.
 */
export function dadosPrecisamRenovar(carregadoEm, agora) {
  const t = Number(carregadoEm);
  if (!Number.isFinite(t) || t <= 0) return true;
  return agora - t > IDADE_MAX_DADOS_MS;
}

/** Pode renovar a URL do vídeo sozinho? Não, se já renovou há menos de 5 min (evita laço de erro). */
export function renovacaoAutomaticaPermitida(ultimaEm, agora) {
  const t = Number(ultimaEm);
  if (!Number.isFinite(t) || t <= 0) return true;
  return agora - t >= JANELA_RENOVACAO_AUTO_MS;
}

/** A aula `aulaId` da matrícula `matriculaId` dentro da resposta da ação `dados` (ou null). */
export function aulaDoCurso(dados, matriculaId, aulaId) {
  const curso = dados?.cursos?.find?.((c) => c?.matricula?.id === matriculaId);
  return curso?.aulas?.find?.((a) => a?.id === aulaId) ?? null;
}

/**
 * De onde sai o vídeo da aula: "upload" (arquivo), "youtube" ou "indisponivel" (upload sem
 * URL válida, YouTube sem id ou aula inexistente: o portal mostra o aviso, não um quadro vazio).
 */
export function fonteDoVideo(aula) {
  if (!aula) return "indisponivel";
  if (aula.fonte === "upload") return urlHttpValida(aula.video_url) ? "upload" : "indisponivel";
  const id = typeof aula.youtube_id === "string" ? aula.youtube_id.trim() : "";
  return id ? "youtube" : "indisponivel";
}

export function mensagemVideoIndisponivel(aula) {
  return aula?.fonte === "upload"
    ? "Arquivo indisponível — avise o RH"
    : "Vídeo indisponível — avise o RH";
}

/** Texto para cada código de erro do player do YouTube (onError). */
export function mensagemErroYouTube(codigo) {
  switch (Number(codigo)) {
    case 100:
      return "O vídeo do YouTube foi removido ou está privado — avise o RH.";
    case 101:
    case 150:
      return "O dono do vídeo não permite exibi-lo aqui — avise o RH.";
    case 2:
      return "O endereço do vídeo do YouTube é inválido — avise o RH.";
    default:
      return "O player do YouTube não conseguiu carregar o vídeo. Tente de novo; se continuar, avise o RH.";
  }
}

/**
 * Carregador da IFrame API do YouTube. Devolve `carregar()`, que dá a mesma promessa a quem
 * chamar enquanto o script carrega. Falha (script bloqueado/sem rede = `onerror`, ou sem
 * resposta em `timeoutMs`) REJEITA com mensagem, tira o script da página e deixa chamar
 * `carregar()` de novo. O `window`/`document` entram por parâmetro (teste sem DOM).
 */
export function criarCarregadorYouTube({
  janela,
  documento,
  agendar = setTimeout,
  cancelar = clearTimeout,
  timeoutMs = 20000,
}) {
  let promessa = null;
  return function carregar() {
    if (janela?.YT?.Player) return Promise.resolve(janela.YT);
    if (promessa) return promessa;
    promessa = new Promise((resolve, reject) => {
      let encerrada = false;
      let timer = null;
      const script = documento.createElement("script");
      const anterior = janela.onYouTubeIframeAPIReady;
      janela.onYouTubeIframeAPIReady = () => {
        anterior?.();
        if (encerrada) return;
        encerrada = true;
        cancelar(timer);
        resolve(janela.YT);
      };
      const falhar = () => {
        if (encerrada) return;
        encerrada = true;
        cancelar(timer);
        script.parentNode?.removeChild(script);
        promessa = null;
        reject(new Error(MSG_YOUTUBE_FALHOU));
      };
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = falhar;
      timer = agendar(falhar, timeoutMs);
      documento.head.appendChild(script);
    });
    return promessa;
  };
}
