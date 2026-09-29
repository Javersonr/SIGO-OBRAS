/**
 * Helpers de anexos guardados no banco.
 *
 * Formato certo de gravar: a REFERÊNCIA estável "bucket/caminho" (o retorno
 * `ref` do UploadFile). A URL assinada (`file_url`) expira em 1h e depois o
 * Storage responde {"error":"InvalidJWT"} — por isso nunca vai para o banco.
 * Para exibir: <AnexoViewer>, <ImgStorage> ou resolveStorageUrl().
 *
 * Legado: anexos do Base44 (base44.app / media.base44.com) — a plataforma
 * antiga apagou os arquivos; não há o que abrir (só reanexar).
 */

/** Referência a gravar a partir do retorno de sigo.integrations.Core.UploadFile. */
export function refDoUpload(res) {
  if (!res) return null;
  if (res.ref) return res.ref;
  if (res.bucket && res.path) return `${res.bucket}/${res.path}`;
  return null;
}

export const ehBase44 = (ref) => /base44\.app|media\.base44\.com|base44\./i.test(String(ref || ""));

/** Caminho sem ?token=... / #... (para achar extensão e nome). */
const semQuery = (ref) => String(ref || "").split(/[?#]/)[0];

export function extensaoDoArquivo(ref) {
  const m = semQuery(ref).match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Nome legível: último segmento, decodificado, sem o prefixo de upload
 * ("<uuid>-arquivo.pdf" → "arquivo.pdf"; Base44 "<hash9>_arquivo.pdf" → "arquivo.pdf").
 */
export function nomeDoArquivo(ref, padrao = "Anexo") {
  let nome = semQuery(ref).split("/").pop() || "";
  try {
    nome = decodeURIComponent(nome);
  } catch {
    /* mantém */
  }
  nome = nome
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "")
    .replace(/^[0-9a-f]{9}_/i, "");
  return nome || padrao;
}

const EXT_IMAGEM = ["jpg", "jpeg", "jfif", "png", "gif", "webp", "avif", "bmp", "svg"];

/** Imagem exibível no navegador (HEIC não é). `tipo` = mime opcional. */
export function ehImagem(ref, tipo) {
  const ext = extensaoDoArquivo(ref);
  if (ext) return EXT_IMAGEM.includes(ext);
  return /^image\/(?!hei[cf])/i.test(String(tipo || ""));
}

export function ehPdf(ref, tipo) {
  const ext = extensaoDoArquivo(ref);
  if (ext) return ext === "pdf";
  return /pdf/i.test(String(tipo || ""));
}

/**
 * Lista de anexos do formulário com o anexo que JÁ SUBIU no fim (o "Ler documento" sobe o arquivo
 * uma vez só e entrega { nome, url: ref, tipo }). Devolve a mesma lista quando não há o que
 * acrescentar: sem `url` (transacao_anexo.url é NOT NULL) ou com a mesma referência já na lista.
 */
export function acrescentarAnexoPronto(lista, anexo) {
  const atual = lista || [];
  if (!anexo?.url) return atual;
  if (atual.some((a) => a?.url === anexo.url)) return atual;
  return [...atual, anexo];
}

/**
 * O que gravar em transacao_anexo ao salvar a EDIÇÃO de uma despesa: `existentes` são as linhas que já
 * estão no banco e `anexos` a lista do formulário (com `id` = já gravado; sem `id` = novo, cuja `url` é a
 * referência "bucket/caminho", nunca a URL assinada). Devolve os ids a remover (gravados que saíram da
 * lista) e os anexos a criar. O recibo quitado gerado pelo servidor (pode ter chegado com o formulário
 * aberto) nunca é removido daqui.
 *
 * `listaCarregada: false` = a lista do formulário não veio do banco (a consulta ao abrir a edição falhou
 * ou ainda não terminou): então "não está na lista" não quer dizer "foi retirado". Nada é removido, os
 * anexos novos continuam sendo criados, e `remocaoPulada` avisa que havia o que remover (para o toast).
 */
export function planejarSincronizacaoAnexos(existentes, anexos, { listaCarregada = true } = {}) {
  const lista = anexos || [];
  const candidatos = (existentes || [])
    .filter((e) => !String(e?.url || "").includes("/recibos/recibo-quitado-"))
    .filter((e) => !lista.some((a) => a?.id === e.id))
    .map((e) => e.id);
  const criar = lista
    .filter((a) => !a?.id)
    .map((a) => ({ nome: a.nome, url: a.url, tipo: a.tipo || "comprovante" }));
  return {
    remover: listaCarregada ? candidatos : [],
    criar,
    remocaoPulada: !listaCarregada && candidatos.length > 0,
  };
}

/**
 * Lista do formulário quando a consulta dos anexos da despesa termina: os anexos do banco (`carregados`)
 * e, depois deles, os NOVOS (sem `id`) que o usuário já acrescentou enquanto a consulta corria (upload
 * manual ou "Ler documento"), sem repetir uma referência que já veio do banco. Os itens da lista anterior
 * que têm `id` são descartados (valem os do banco). Com `carregados` vazio (a consulta falhou), sobram só
 * os anexos novos.
 */
export function mesclarAnexosCarregados(carregados, atuais) {
  const doBanco = carregados || [];
  const novos = (atuais || []).filter(
    (a) => a && !a.id && !doBanco.some((c) => c?.url && c.url === a.url)
  );
  return [...doBanco, ...novos];
}
