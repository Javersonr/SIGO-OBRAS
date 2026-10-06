/**
 * Assinaturas (imagem) do instrutor e do responsável técnico no certificado EAD (T29). Puro (sem DOM e
 * sem sigoClient: a URL e o carregamento da imagem entram por parâmetro), com teste ao lado. Quem usa:
 * components/seguranca/TreinamentosEadTab.jsx (anexar a imagem no curso), lib/certificado-ead.js
 * (desenhar), components/portal-funcionario/CertificadoPortal.jsx e
 * components/seguranca/MatriculaAuditoriaSheet.jsx (carregar as imagens do PDF).
 *
 * Decisão D7 (06/10/2026): vale a IMAGEM da assinatura (não ICP-Brasil). O banco guarda a referência
 * "assinaturas/<empresa>/..." (nunca `file_url`, que expira em 1 h); referência do Base44 é arquivo
 * perdido e é ignorada. A mesma regra vale no servidor (portal-funcionario/assinaturas.ts) e no banco
 * (migração 0137).
 */

export const BUCKET_ASSINATURAS = "assinaturas";

/** Uma assinatura é um desenho pequeno: 2 MB sobra, e o PDF do aluno não engorda com foto de celular. */
export const LIMITE_ASSINATURA_BYTES = 2 * 1024 * 1024;

/** Valor do atributo `accept` do seletor de arquivo: só o que o PDF sabe desenhar. */
export const ACCEPT_ASSINATURA = "image/png,image/jpeg,.png,.jpg,.jpeg";

/** Quem assina além do aluno, na ordem do PDF: chave em `dados` do certificado e texto do aviso. */
const PESSOAS = [
  { chave: "instrutor", rotulo: "do instrutor" },
  { chave: "responsavel_tecnico", rotulo: "do responsável técnico" },
];

const IMAGEM_PNG_OU_JPEG = /\.(png|jpe?g)$/i;

/**
 * A referência "assinaturas/<empresa>/caminho.png" ou null. Ignora URL (assinada ou não), Base44,
 * outro bucket, pasta de outra empresa (quando `empresaId` é informado), caminho que escapa da pasta e
 * arquivo que não é PNG ou JPEG. Sem `empresaId` só confere o formato.
 */
export function refDeAssinatura(valor, empresaId = null) {
  if (typeof valor !== "string") return null;
  const ref = valor.trim();
  if (!ref || /base44\./i.test(ref) || ref.includes("\\") || ref.includes(":")) return null;
  const partes = ref.split("/");
  if (partes.length < 3 || partes.some((p) => !p || p === "." || p === "..")) return null;
  if (partes[0] !== BUCKET_ASSINATURAS) return null;
  if (empresaId && partes[1] !== empresaId) return null;
  return IMAGEM_PNG_OU_JPEG.test(ref) ? ref : null;
}

/**
 * O arquivo escolhido serve de assinatura? PNG ou JPEG (pelo tipo; sem tipo, pela extensão), não vazio e
 * até `LIMITE_ASSINATURA_BYTES`. Devolve `{ ok: true }` ou `{ ok: false, erro }` com o texto do toast.
 */
export function validarImagemAssinatura(arquivo) {
  if (!arquivo) return { ok: false, erro: "Escolha uma imagem da assinatura." };
  const mime = String(arquivo.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const nome = String(arquivo.name || "");
  const tipoAceito = mime
    ? mime === "image/png" || mime === "image/jpeg"
    : IMAGEM_PNG_OU_JPEG.test(nome);
  if (!tipoAceito) {
    return {
      ok: false,
      erro: "Formato não aceito. Anexe a imagem da assinatura em PNG ou JPEG (o PDF do certificado não desenha outros formatos).",
    };
  }
  const tamanho = Number(arquivo.size);
  if (!Number.isFinite(tamanho) || tamanho <= 0) {
    return { ok: false, erro: "O arquivo está vazio. Escolha outra imagem." };
  }
  if (tamanho > LIMITE_ASSINATURA_BYTES) {
    return {
      ok: false,
      erro: "A imagem passa de 2 MB. Recorte só a assinatura ou reduza a imagem e envie de novo.",
    };
  }
  return { ok: true };
}

/**
 * Nome com que o arquivo sobe para o Storage. O caminho gravado precisa terminar em .png/.jpg/.jpeg (é
 * assim que o servidor e o banco reconhecem uma imagem de assinatura): se o nome não termina, a
 * extensão do tipo é acrescentada. Sem nome, "assinatura".
 */
export function nomeParaEnvio(arquivo) {
  const nome = String(arquivo?.name || "").trim() || "assinatura";
  if (IMAGEM_PNG_OU_JPEG.test(nome)) return nome;
  const mime = String(arquivo?.type || "").toLowerCase();
  return `${nome}${mime === "image/png" ? ".png" : ".jpg"}`;
}

/**
 * Tamanho (mm) da imagem `w` x `h` dentro da caixa `maxW` x `maxH`, mantendo a proporção. Encolhe ou
 * amplia até uma das medidas tocar a caixa. null se alguma medida não for um número positivo.
 */
export function caberNaCaixa(w, h, maxW, maxH) {
  const ok = [w, h, maxW, maxH].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
  if (!ok) return null;
  const escala = Math.min(maxW / w, maxH / h);
  return { w: w * escala, h: h * escala };
}

/**
 * Formato que o jsPDF espera para a imagem de uma data URL: "PNG", "JPEG" ou undefined (o jsPDF então
 * tenta reconhecer pelo conteúdo e recusa o que não sabe desenhar, como SVG).
 */
export function formatoDaImagem(dataUrl) {
  const tipo = /^data:image\/([a-z0-9.+-]+)/i.exec(String(dataUrl || ""))?.[1]?.toLowerCase();
  if (tipo === "png") return "PNG";
  if (tipo === "jpeg" || tipo === "jpg") return "JPEG";
  return undefined;
}

/** Caixa (mm) da imagem acima da linha da assinatura no PDF, e a folga entre a imagem e a linha. */
const CAIXA_LARGURA_MM = 64;
const CAIXA_ALTURA_MM = 18;
const FOLGA_DA_LINHA_MM = 1.5;

/**
 * Onde desenhar a imagem de assinatura no PDF: centrada em `xCentro` e apoiada logo acima da linha
 * (`yLinha`), numa caixa de 64 x 18 mm que cabe na coluna e não invade o texto de cima. null se a
 * imagem não tem medida.
 */
export function posicaoDaAssinatura(xCentro, yLinha, imagem) {
  const tamanho = caberNaCaixa(imagem?.w, imagem?.h, CAIXA_LARGURA_MM, CAIXA_ALTURA_MM);
  if (!tamanho) return null;
  return {
    x: xCentro - tamanho.w / 2,
    y: yLinha - FOLGA_DA_LINHA_MM - tamanho.h,
    w: tamanho.w,
    h: tamanho.h,
  };
}

/**
 * O certificado tem imagem de assinatura para esta pessoa? `tem_assinatura` é a marca que o servidor
 * manda ao aluno (a referência não sai de lá); o RH lê a linha do banco e vê a própria `assinatura_ref`.
 */
export function temAssinatura(pessoa) {
  return !!(pessoa && (pessoa.tem_assinatura || pessoa.assinatura_ref));
}

/**
 * Carrega as imagens da assinatura do instrutor e do RT de um certificado para o PDF. `urlDe(pessoa)`
 * devolve (ou promete) a URL da imagem: o aluno usa a `assinatura_url` que o servidor assinou, e o RH
 * resolve a `assinatura_ref` pela própria sessão. `carregar(url)` devolve `{ dataUrl, w, h }` ou null.
 * Quem não tem assinatura fica de fora (o certificado sai só com nome e registro, sem aviso). Quem tem e
 * a imagem não veio (sem URL, URL vencida, rede, formato) entra em `naoCarregadas`: o PDF sai sem ela e
 * a tela avisa. Nunca lança.
 */
export async function carregarAssinaturasDoCertificado(dados, { urlDe, carregar }) {
  const imagens = { instrutor: null, responsavel_tecnico: null };
  const naoCarregadas = [];
  // as duas imagens descem ao mesmo tempo (cada uma tem o próprio limite de tempo); a ordem do resultado é a do PDF
  const resultados = await Promise.all(
    PESSOAS.map(async ({ chave }) => {
      const pessoa = dados?.[chave];
      if (!temAssinatura(pessoa)) return { chave, tem: false };
      try {
        const url = await urlDe(pessoa);
        return { chave, tem: true, imagem: url ? await carregar(url) : null };
      } catch {
        return { chave, tem: true, imagem: null };
      }
    })
  );
  for (const { chave, tem, imagem } of resultados) {
    if (!tem) continue;
    if (imagem) imagens[chave] = imagem;
    else naoCarregadas.push(chave);
  }
  return { imagens, naoCarregadas };
}

/**
 * Quem ficou sem a imagem da assinatura no PDF já baixado: as que não carregaram (`naoCarregadas`) e as
 * que carregaram mas o PDF não aceitou (carregadas que não estão em `desenhadas`, o retorno do
 * `baixarCertificadoPdf`). Na ordem do certificado.
 */
export function assinaturasQueFaltaram(carregadas, desenhadas) {
  const feitas = desenhadas || [];
  return PESSOAS.map((p) => p.chave).filter(
    (chave) =>
      (carregadas?.naoCarregadas || []).includes(chave) ||
      (carregadas?.imagens?.[chave] && !feitas.includes(chave))
  );
}

/** Aviso (texto para a tela) quando o PDF saiu sem a imagem de alguma assinatura; "" se não faltou nenhuma. */
export function avisoAssinaturasNaoCarregadas(chaves) {
  const rotulos = PESSOAS.filter((p) => (chaves || []).includes(p.chave)).map((p) => p.rotulo);
  if (!rotulos.length) return "";
  return (
    `O PDF foi baixado sem a imagem da assinatura ${rotulos.join(" e ")}, que não pôde ser carregada. ` +
    "O nome, o registro, o QR Code e a validação do certificado não mudam. Para baixar com a assinatura, " +
    "atualize a página e baixe de novo; se continuar sem ela, avise o RH."
  );
}
