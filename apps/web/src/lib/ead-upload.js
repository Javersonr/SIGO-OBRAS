/**
 * Envio de arquivos das aulas EAD (T30): validação antes de subir e envio com barra de progresso e
 * cancelamento. Sem import do app (o cliente do Supabase e o XHR entram por parâmetro), então tudo
 * aqui roda no Node com teste (ead-upload.test.js). Quem usa: components/seguranca/TreinamentosEadTab.jsx.
 *
 * Por que não `sigo.integrations.Core.UploadFile`: ele usa `storage.upload` (fetch), que não informa
 * progresso nem aceita cancelar. Aqui o envio é por URL assinada de upload + XMLHttpRequest, que dá
 * os dois. O caminho no bucket segue a mesma regra do SDK (`<empresa>/<ano>/<mês>/<uuid>-<nome>`), e
 * a assinatura da URL passa pela mesma RLS do upload normal.
 */

const GB = 1024 ** 3;
const MB = 1024 * 1024;

/** O bucket `treinamentos` limita cada arquivo a 1 GB (migração 0100). */
export const LIMITE_VIDEO_BYTES = GB;
/** Apostila em PDF: 100 MB (acima disso o PDF não abre bem no portal; o bucket aceitaria até 1 GB). */
export const LIMITE_PDF_BYTES = 100 * MB;

const REGRAS = {
  video: {
    mimes: ["video/mp4", "video/webm"],
    extensoes: ["mp4", "webm"],
    limite: LIMITE_VIDEO_BYTES,
    nome: "vídeo",
    orientacao: "Para vídeo use MP4 ou WebM (converta o arquivo antes de enviar).",
  },
  pdf: {
    mimes: ["application/pdf"],
    extensoes: ["pdf"],
    limite: LIMITE_PDF_BYTES,
    nome: "PDF",
    orientacao: "Anexe um arquivo PDF.",
  },
};

/** Valor do atributo `accept` do seletor de arquivo de cada tipo de aula. */
export const ACCEPT_AULA = {
  video: "video/mp4,video/webm,.mp4,.webm",
  pdf: "application/pdf,.pdf",
};

/** "1,5 GB", "100 MB", "850 KB", "0 B" (base 1024, uma casa decimal, vírgula). */
export function formatarTamanho(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let valor = n;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  const texto = i === 0 ? String(Math.round(valor)) : String(Math.round(valor * 10) / 10);
  return `${texto.replace(".", ",")} ${unidades[i]}`;
}

/**
 * O arquivo escolhido serve para a aula do tipo `tipo` ("video" ou "pdf")? Confere o tipo (MIME; sem
 * MIME, a extensão), que não esteja vazio e o tamanho. Devolve `{ ok: true }` ou
 * `{ ok: false, erro }` com o texto pronto para o toast.
 */
export function validarArquivoAula(arquivo, tipo) {
  const regra = REGRAS[tipo];
  if (!regra) return { ok: false, erro: "Este tipo de aula não recebe arquivo." };
  if (!arquivo) return { ok: false, erro: "Escolha um arquivo." };

  const mime = String(arquivo.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const nome = String(arquivo.name || "");
  const extensao = nome.includes(".") ? nome.split(".").pop().toLowerCase() : "";
  // com tipo informado, ele manda; só quando o navegador não informa (acontece no Windows com
  // .webm, por exemplo) vale a extensão
  const tipoAceito = mime ? regra.mimes.includes(mime) : regra.extensoes.includes(extensao);
  if (!tipoAceito) {
    const achado = mime || (extensao ? `.${extensao}` : "tipo desconhecido");
    return { ok: false, erro: `Formato não aceito (${achado}). ${regra.orientacao}` };
  }

  const tamanho = Number(arquivo.size);
  if (!(tamanho > 0)) return { ok: false, erro: "O arquivo está vazio." };
  if (tamanho > regra.limite) {
    return {
      ok: false,
      erro:
        `O arquivo tem ${formatarTamanho(tamanho)} e o limite para ${regra.nome} é ` +
        `${formatarTamanho(regra.limite)}.`,
    };
  }
  return { ok: true };
}

/** Percentual inteiro (0 a 100) do que já foi enviado; null quando o total não é conhecido. */
export function percentualEnvio(enviado, total) {
  const e = Number(enviado);
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(e)) return null;
  return Math.min(100, Math.max(0, Math.round((e / t) * 100)));
}

/**
 * Caminho do arquivo no bucket: `<empresa>/<ano>/<mês>/<uuid>-<nome>`. O primeiro segmento é a
 * empresa porque a RLS do bucket confere com a empresa do JWT. Mesma regra de `buildPath` do SDK
 * (shared/sdk/src/integrations.js): se uma mudar, mude a outra.
 */
export function caminhoDoUpload(empresaId, nomeArquivo, agora, uuid) {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const seguro = String(nomeArquivo).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${empresaId}/${ano}/${mes}/${uuid}-${seguro}`;
}

/**
 * Tipo de arquivo que a aula guarda no Storage ("video" ou "pdf"), ou null (aula de texto ou vídeo
 * do YouTube: não há arquivo para trocar). Aula antiga sem `tipo` é vídeo.
 */
export function tipoDeArquivoDaAula(aula) {
  if (!aula) return null;
  if (aula.tipo === "pdf") return "pdf";
  if ((aula.tipo || "video") === "video" && aula.fonte === "upload") return "video";
  return null;
}

/**
 * Campos da aula que mudam ao trocar o arquivo (a posição, o título, o módulo e a legenda ficam
 * como estão). Vídeo: referência nova e duração nova lida do arquivo novo. PDF: só a referência (o
 * tempo mínimo de leitura é decisão do RH e não depende do arquivo).
 */
export function dadosDaTrocaDeArquivo(tipoArquivo, ref, duracaoSeg) {
  if (tipoArquivo === "pdf") return { arquivo_ref: ref };
  return { fonte: "upload", video_ref: ref, youtube_id: null, duracao_seg: duracaoSeg };
}

/** Erro de envio cancelado pelo RH: `cancelado` deixa a tela tratá-lo sem mostrar como falha. */
function erroCancelado() {
  const erro = new Error("Envio cancelado");
  erro.name = "AbortError";
  erro.cancelado = true;
  return erro;
}

function erroDaResposta(xhr) {
  let mensagem = "";
  try {
    const corpo = JSON.parse(xhr.responseText || "null");
    mensagem = String(corpo?.message || corpo?.error || "");
  } catch {
    /* resposta que não é JSON (página de erro do gateway): usa a mensagem padrão */
  }
  const erro = new Error(mensagem || `Falha no envio do arquivo (HTTP ${xhr.status}).`);
  erro.status = xhr.status;
  return erro;
}

/**
 * Envia `corpo` por XMLHttpRequest. `aoProgredir({ enviado, total, percentual })` roda a cada
 * avanço; `sinal` (AbortSignal) cancela. Resolve em 2xx. Rejeita com `Error` (`status` quando o
 * servidor respondeu; `cancelado: true` quando foi cancelado). `criarXhr` existe para o teste.
 */
export function enviarComProgresso({
  criarXhr = () => new XMLHttpRequest(),
  url,
  metodo = "PUT",
  cabecalhos = {},
  corpo,
  aoProgredir,
  sinal,
}) {
  return new Promise((resolve, reject) => {
    if (sinal?.aborted) {
      reject(erroCancelado());
      return;
    }
    const xhr = criarXhr();
    let encerrado = false;
    const aoCancelar = () => xhr.abort();
    const encerrar = (acao) => (valor) => {
      if (encerrado) return;
      encerrado = true;
      sinal?.removeEventListener("abort", aoCancelar);
      acao(valor);
    };
    const concluir = encerrar(resolve);
    const falhar = encerrar(reject);

    xhr.open(metodo, url);
    for (const [nome, valor] of Object.entries(cabecalhos)) xhr.setRequestHeader(nome, valor);
    if (xhr.upload) {
      xhr.upload.onprogress = (evento) => {
        if (!evento.lengthComputable) return;
        aoProgredir?.({
          enviado: evento.loaded,
          total: evento.total,
          percentual: percentualEnvio(evento.loaded, evento.total),
        });
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) concluir();
      else falhar(erroDaResposta(xhr));
    };
    xhr.onerror = () =>
      falhar(new Error("Falha de conexão durante o envio. Confira a internet e tente de novo."));
    xhr.ontimeout = () => falhar(new Error("O envio demorou demais e foi interrompido."));
    xhr.onabort = () => falhar(erroCancelado());
    sinal?.addEventListener("abort", aoCancelar, { once: true });
    xhr.send(corpo);
  });
}

/**
 * Sobe `arquivo` para o bucket com progresso e cancelamento. `supabase` é o cliente bruto do
 * supabase-js e `chaveApi` a chave anon (cabeçalho `apikey`, como o supabase-js manda). Devolve
 * `{ bucket, path, ref }`; grave no banco só o `ref` ("bucket/caminho"), nunca uma URL assinada.
 */
export async function subirArquivoComProgresso({
  supabase,
  chaveApi,
  bucket,
  arquivo,
  aoProgredir,
  sinal,
  criarXhr,
  agora = new Date(),
  uuid = () => crypto.randomUUID(),
}) {
  if (!supabase) throw new Error("Backend não configurado");
  if (sinal?.aborted) throw erroCancelado();

  const { data: dadosUsuario } = await supabase.auth.getUser();
  const empresaId = dadosUsuario?.user?.app_metadata?.empresa_id;
  if (!empresaId)
    throw new Error("Não foi possível identificar a empresa da sessão. Entre de novo.");

  const path = caminhoDoUpload(empresaId, arquivo.name || `upload-${Date.now()}`, agora, uuid());
  const { data: assinada, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;

  const { data: dadosSessao } = await supabase.auth.getSession();
  const corpo = new FormData();
  corpo.append("cacheControl", "3600");
  corpo.append("", arquivo);

  await enviarComProgresso({
    criarXhr,
    url: assinada.signedUrl,
    metodo: "PUT",
    cabecalhos: {
      ...(chaveApi ? { apikey: chaveApi } : {}),
      authorization: `Bearer ${dadosSessao?.session?.access_token || chaveApi}`,
    },
    corpo,
    aoProgredir,
    sinal,
  });
  return { bucket, path, ref: `${bucket}/${path}` };
}
