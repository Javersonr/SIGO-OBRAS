/**
 * Chamadas do Portal do Funcionário + sessão (token de 12h no localStorage).
 * O funcionário não tem sessão Supabase: tudo passa pela edge function
 * portal-funcionario, que valida o token e grava com service role.
 */
import { sigo } from "@/api/sigoClient";

const CHAVE = "sigo_portal_funcionario";

export const sessaoPortal = {
  ler() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE) || "null");
    } catch {
      return null;
    }
  },
  salvar(s) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(s));
    } catch {
      /* navegador sem storage: a sessão dura só esta aba */
    }
  },
  limpar() {
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      /* ok */
    }
  },
};

export class ErroPortal extends Error {
  constructor(mensagem, codigo, extra) {
    super(mensagem);
    this.codigo = codigo || null;
    this.extra = extra || {};
  }
}

export async function chamarPortal(acao, dados = {}, token) {
  const { data } = await sigo.functions.invoke("portalFuncionario", { acao, token, ...dados });
  if (data?.success === false)
    throw new ErroPortal(data.error || "Erro no portal", data.codigo, data);
  return data;
}

/**
 * Fila: eventos e progresso vão ao servidor NA ORDEM em que aconteceram — o
 * servidor mede o tempo real entre um sinal e o seguinte.
 */
export function criarFila() {
  let cauda = Promise.resolve();
  return (tarefa) => {
    const resultado = cauda.then(tarefa, tarefa);
    cauda = resultado.catch(() => {});
    return resultado;
  };
}

export const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export const fmtDataHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export const fmtTempo = (seg) => {
  const s = Math.max(0, Math.floor(seg || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
