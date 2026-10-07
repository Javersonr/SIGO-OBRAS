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

import { mesmoFormulario } from "./ead-gestao";

export const BUCKET_ASSINATURAS = "assinaturas";

/** Uma assinatura é um desenho pequeno: 2 MB sobra, e o PDF do aluno não engorda com foto de celular. */
export const LIMITE_ASSINATURA_BYTES = 2 * 1024 * 1024;

/** Valor do atributo `accept` do seletor de arquivo: só o que o PDF sabe desenhar. */
export const ACCEPT_ASSINATURA = "image/png,image/jpeg,.png,.jpg,.jpeg";

/** Quem assina além do aluno, na ordem do PDF: chave em `dados` do certificado e texto do aviso. */
const PESSOAS = [
  { chave: "instrutor", rotulo: "do instrutor", complemento: "qualificacao" },
  { chave: "responsavel_tecnico", rotulo: "do responsável técnico", complemento: "registro" },
];

const IMAGEM_PNG_OU_JPEG = /\.(png|jpe?g)$/i;

/**
 * A referência "assinaturas/<empresa>/caminho.png" ou null. Ignora URL (assinada ou não), Base44,
 * outro bucket, pasta de outra empresa (quando `empresaId` é informado), caminho que escapa da pasta,
 * arquivo que não é PNG ou JPEG e a junção de várias referências com "|" (o separador que Configurações
 * usa para guardar as assinaturas de todas as linhas de instrutor num campo só: uma junção nunca carrega
 * como imagem). Sem `empresaId` só confere o formato. A mesma regra vale no servidor
 * (portal-funcionario/assinaturas.ts) e no banco (CHECK da migração 0137): mude nos três.
 */
export function refDeAssinatura(valor, empresaId = null) {
  if (typeof valor !== "string") return null;
  const ref = valor.trim();
  if (!ref || /base44\./i.test(ref) || /[\\:|]/.test(ref)) return null;
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

/** Nome para comparar duas grafias da mesma pessoa: sem espaço sobrando e sem diferença de maiúscula. */
function nomeNormalizado(nome) {
  return String(nome ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Marca (só da tela, nunca gravada) de que a imagem do curso ainda não tem dono: foi anexada antes do nome. */
const marcaSemDono = (pessoa) => `${pessoa}_assinatura_sem_dono`;

const pessoaDaAssinatura = (pessoa) => {
  const dados = PESSOAS.find((p) => p.chave === pessoa);
  if (!dados) throw new Error(`pessoa desconhecida: ${pessoa}`);
  return dados;
};

/** Cópia do curso sem a marca de imagem sem dono de `pessoa` (o mesmo objeto, se não havia marca). */
function semMarca(curso, pessoa) {
  const marca = marcaSemDono(pessoa);
  if (!curso || !(marca in curso)) return curso;
  const { [marca]: _descartada, ...resto } = curso;
  return resto;
}

/**
 * Tira do formulário as marcas de "imagem sem dono" das duas pessoas. A tela chama isto depois de salvar: o
 * que foi gravado tem nome e imagem juntos, e mudar o nome dali em diante retira a imagem. O mesmo objeto
 * volta se não havia marca; a entrada não muda.
 */
export function semMarcasDeAssinatura(curso) {
  return PESSOAS.reduce((atual, p) => semMarca(atual, p.chave), curso);
}

/**
 * Regra do formulário do curso quando o RH ESCREVE o nome do instrutor ou do RT (campo de texto livre, ou
 * "— escolher dos salvos —", que esvazia o nome). A imagem da assinatura é de uma pessoa: se o nome muda
 * para outra, a imagem de quem estava antes sai do curso, senão a emissão congelaria o nome de uma
 * pessoa com a assinatura de outra (NR-1). Quem escolhe alguém da lista de Configurações não passa por
 * aqui (`aoEscolherPessoa`): lá o formulário já troca nome e imagem juntos.
 *
 * A exceção (A6) é a imagem anexada ANTES de haver nome (curso novo: o RH anexa e depois digita): ela ainda
 * não é de ninguém, e o nome que ele digita agora é o de quem assina. Enquanto o nome é digitado letra por
 * letra a imagem fica, e a marca `<pessoa>_assinatura_sem_dono` (só da tela) lembra disso até o curso ser
 * salvo (`semMarcasDeAssinatura`). O mesmo vale para uma imagem gravada sem nome (dado antigo). Quem já
 * tinha nome e imagem (a pessoa da lista, a imagem de um curso salvo, a anexada com o nome preenchido)
 * continua perdendo a imagem se o nome muda.
 *
 * `pessoa` é "instrutor" ou "responsavel_tecnico" (os campos são `<pessoa>_nome` e
 * `<pessoa>_assinatura_ref`). Mesmo nome, só com espaço ou maiúscula diferente, mantém a imagem. Devolve
 * um curso novo (o de entrada não muda), `imagemRetirada` (só quando havia uma imagem que a tela
 * mostrava) e o `aviso` para o toast ("" quando nada foi retirado). O aviso não repete o nome, que pode
 * estar pela metade enquanto o RH digita. Pessoa desconhecida lança: seria gravar um campo inventado.
 */
export function aoMudarNomeDaPessoa(curso, pessoa, novoNome) {
  const dados = pessoaDaAssinatura(pessoa);
  const campoNome = `${pessoa}_nome`;
  const campoRef = `${pessoa}_assinatura_ref`;
  const atual = curso || {};
  const nome = novoNome == null ? "" : String(novoNome);
  const proximo = { ...atual, [campoNome]: nome };
  const imagemDoCurso = atual[campoRef];
  if (!imagemDoCurso) return { curso: semMarca(proximo, pessoa), imagemRetirada: false, aviso: "" };
  const nomeAntes = nomeNormalizado(atual[campoNome]);
  const nomeDepois = nomeNormalizado(nome);
  // imagem ainda sem dono: o nome digitado agora é o dono (a marca segue até salvar)
  if (atual[marcaSemDono(pessoa)] === true || nomeAntes === "") {
    return {
      curso: { ...proximo, [marcaSemDono(pessoa)]: true },
      imagemRetirada: false,
      aviso: "",
    };
  }
  if (nomeAntes === nomeDepois) return { curso: proximo, imagemRetirada: false, aviso: "" };
  // referência que a tela nem mostra como imagem (sistema antigo): sai junto, sem avisar de uma imagem que o RH não via
  const eraVisivel = !!refDeAssinatura(imagemDoCurso);
  const motivo = nomeDepois
    ? "porque o nome mudou. Anexe a imagem de quem assina, no campo logo abaixo."
    : "porque o nome foi apagado. Escolha ou digite quem assina e anexe a imagem dessa pessoa.";
  return {
    curso: { ...semMarca(proximo, pessoa), [campoRef]: null },
    imagemRetirada: eraVisivel,
    aviso: eraVisivel ? `A imagem da assinatura ${dados.rotulo} foi retirada ${motivo}` : "",
  };
}

/**
 * O RH ESCOLHEU uma pessoa da lista de Configurações no seletor do instrutor ou do RT: nome, registro (ou
 * qualificação) e a imagem dela entram juntos, e a imagem de quem estava antes nunca fica (A6: a escolha
 * avisa, como `aoMudarNomeDaPessoa`, quando uma imagem que a tela mostrava é retirada porque a pessoa
 * escolhida não tem imagem em Configurações). Se é a MESMA pessoa que já estava no campo (o nome digitado
 * igual ao da lista) e a lista não traz imagem, a que o RH anexou fica. O registro/qualificação de quem
 * estava antes só é trocado se a pessoa escolhida tiver o seu. `escolhida` é o item de
 * `pessoasDosTreinamentos` ({ nome, registro | qualificacao, assinatura_ref }). Devolve o mesmo formato de
 * `aoMudarNomeDaPessoa`.
 */
export function aoEscolherPessoa(curso, pessoa, escolhida) {
  const dados = pessoaDaAssinatura(pessoa);
  const campoNome = `${pessoa}_nome`;
  const campoRef = `${pessoa}_assinatura_ref`;
  const campoComplemento = `${pessoa}_${dados.complemento}`;
  const atual = curso || {};
  const imagemVisivel = refDeAssinatura(atual[campoRef]);
  const mesmaPessoa = nomeNormalizado(atual[campoNome]) === nomeNormalizado(escolhida?.nome);
  const daLista = escolhida?.assinatura_ref || null;
  const imagem = daLista ?? (mesmaPessoa ? imagemVisivel : null);
  const retirada = !!imagemVisivel && !imagem;
  return {
    curso: {
      ...semMarca(atual, pessoa),
      [campoNome]: escolhida?.nome ?? "",
      [campoComplemento]: escolhida?.[dados.complemento] || atual[campoComplemento] || "",
      [campoRef]: imagem,
    },
    imagemRetirada: retirada,
    aviso: retirada
      ? `A imagem da assinatura ${dados.rotulo} foi retirada porque a pessoa escolhida não tem imagem em Configurações. Anexe a imagem dessa pessoa, no campo logo abaixo.`
      : "",
  };
}

/**
 * A imagem que o envio terminou de subir (`ref`) ou a remoção (`ref` null) chega ao formulário que a pediu?
 * `formulario` é o curso aberto quando o RH clicou (e o nome que ele tinha); `atual` é o que a tela mostra
 * AGORA. O envio é lento: nesse tempo o RH pode ter aberto outro curso ou mudado o nome / escolhido outra
 * pessoa, e a imagem não pode cair sob o nome de outra pessoa (A6). Vale: o mesmo formulário e o mesmo
 * nome do começo do envio (ou nome vazio no começo: a imagem fica sem dono e adota o que o RH digitou). Não
 * vale: devolve `aplicada: false`, o curso de `atual` sem mudança e o `aviso` para o toast. A remoção vale
 * no mesmo formulário, seja qual for o nome. `atual` e `formulario` não são alterados.
 */
export function aoTrocarImagemDaAssinatura({ atual, formulario, pessoa, ref }) {
  const dados = pessoaDaAssinatura(pessoa);
  const campoNome = `${pessoa}_nome`;
  const campoRef = `${pessoa}_assinatura_ref`;
  if (!mesmoFormulario(atual, formulario)) {
    return {
      curso: atual,
      aplicada: false,
      aviso:
        `A imagem da assinatura ${dados.rotulo} não foi anexada: o formulário mudou (outro curso foi aberto) ` +
        "durante o envio. Anexe de novo no curso certo.",
    };
  }
  if (ref == null) {
    return { curso: { ...semMarca(atual, pessoa), [campoRef]: null }, aplicada: true, aviso: "" };
  }
  const nomeNoInicio = nomeNormalizado(formulario[campoNome]);
  if (nomeNoInicio && nomeNoInicio !== nomeNormalizado(atual[campoNome])) {
    return {
      curso: atual,
      aplicada: false,
      aviso:
        `A imagem da assinatura ${dados.rotulo} não foi anexada: quem assina mudou durante o envio. ` +
        "Anexe de novo, já com o nome certo.",
    };
  }
  const anexada = { ...atual, [campoRef]: ref };
  return {
    curso: nomeNoInicio ? semMarca(anexada, pessoa) : { ...anexada, [marcaSemDono(pessoa)]: true },
    aplicada: true,
    aviso: "",
  };
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
