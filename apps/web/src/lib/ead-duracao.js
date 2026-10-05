export function parseDuracao(valor) {
  const match = /^(\d+):([0-5]\d)$/.exec(String(valor || "").trim());
  if (!match) return null;
  const seg = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(seg) && seg > 0 ? seg : null;
}
export function formatDuracao(segundos) {
  const seg = Math.max(0, Math.round(Number(segundos) || 0));
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}
/**
 * Vídeo sem duração cadastrada: o servidor responde AULA_SEM_DURACAO e o aluno não conclui a aula.
 * Mesma regra de duracaoParaProgresso (supabase/functions/portal-funcionario/requisitos.ts).
 */
export function videoSemDuracao(aula) {
  if (!aula || (aula.tipo && aula.tipo !== "video")) return false;
  const duracao = Number(aula.duracao_seg);
  return !(Number.isFinite(duracao) && duracao > 0);
}
export function lerDuracaoVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const encerrar = () => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const timeout = setTimeout(() => {
      encerrar();
      reject(new Error("Não foi possível ler a duração do vídeo"));
    }, 20000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const segundos = Math.ceil(video.duration);
      encerrar();
      if (Number.isFinite(segundos) && segundos > 0) resolve(segundos);
      else reject(new Error("O vídeo não tem duração válida"));
    };
    video.onerror = () => {
      encerrar();
      reject(new Error("O navegador não conseguiu ler este vídeo"));
    };
    video.src = url;
  });
}
