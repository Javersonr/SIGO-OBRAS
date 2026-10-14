/**
 * Assinatura dos arquivos da oportunidade (aba Arquivos). Módulo PURO (sem React, sem banco).
 *
 * `arquivo_oportunidade.assinatura` (migração 0156) tem três valores:
 *   - `pendente`: o PDF foi GERADO pelo SIGO (proposta, cronograma ou declaração) com o bloco de
 *     assinatura em branco e ainda não foi assinado. A tela mostra o selo "falta assinar" e o botão
 *     "Enviar assinado" (a pessoa assina o PDF no gov.br e sobe a versão assinada).
 *   - `assinado`: a versão assinada já foi enviada (ou o servidor manteve a que já estava assinada).
 *     O selo vira "assinado" e o botão some.
 *   - nulo: arquivo sem estado de assinatura. É o caso de tudo que não é PDF gerado (Excel, .docx,
 *     documentos da biblioteca, anexos comuns, links) e de TODA linha antiga, porque antes da 0156 a
 *     coluna nem existe: `arq.assinatura` vem `undefined` e a tela não mostra selo nem botão.
 *
 * Regra do PDF no "Enviar assinado" (`validarArquivoAssinado`): o TIPO que o navegador informa manda
 * quando vem preenchido (só `application/pdf` ou `application/x-pdf`, sem diferenciar maiúsculas e
 * ignorando parâmetros como "; charset"); só quando o tipo vem VAZIO vale a extensão `.pdf` do nome.
 * Assim, "Declaracao" sem extensão com tipo `application/pdf` entra, e "decl.pdf" com tipo de imagem
 * não. Tamanho que não seja um número finito maior que zero conta como arquivo vazio.
 */

import { LIMITE_ANEXO_OPORTUNIDADE } from "./envio-arquivos";

const MB = 1024 * 1024;

/** Selo do estado da assinatura: { texto, cor: "amber" | "green" } ou null (sem selo). */
export function seloDaAssinatura(arq) {
  if (arq?.assinatura === "pendente") return { texto: "falta assinar", cor: "amber" };
  if (arq?.assinatura === "assinado") return { texto: "assinado", cor: "green" };
  return null;
}

/** "Enviar assinado" só para o arquivo pendente que não é um link. */
export function podeEnviarAssinado(arq) {
  return arq?.assinatura === "pendente" && arq?.tipo !== "link";
}

/**
 * Só um "Enviar assinado" por vez: com um envio em andamento (`assinandoId` = a linha em envio), nenhum
 * outro pode começar. Sem isso, o fim do envio da linha A zerava o estado da linha B, que estava subindo.
 */
export function podeIniciarEnvio(assinandoId) {
  return assinandoId === null || assinandoId === undefined;
}

const TIPO_PDF = /^application\/(x-)?pdf\s*(;|$)/;

/** PDF pelo tipo, ou, se o tipo vier vazio, pela extensão do nome. */
function ehPdf(arquivo) {
  const tipo = String(arquivo.type ?? "")
    .trim()
    .toLowerCase();
  if (tipo) return TIPO_PDF.test(tipo);
  return /\.pdf$/i.test(String(arquivo.name ?? "").trim());
}

/**
 * Confere o arquivo escolhido (um `File`, ou { name, type, size }) antes de subir:
 * { ok: true } ou { ok: false, erro }. `limite` em bytes (padrão: o do bucket, 50 MB).
 */
export function validarArquivoAssinado(arquivo, limite = LIMITE_ANEXO_OPORTUNIDADE) {
  if (!arquivo) return { ok: false, erro: "Escolha o PDF assinado" };
  if (!ehPdf(arquivo)) return { ok: false, erro: "O arquivo assinado tem de ser um PDF" };
  const { size } = arquivo;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return { ok: false, erro: "O arquivo está vazio" };
  }
  const teto = Number.isFinite(limite) && limite > 0 ? limite : LIMITE_ANEXO_OPORTUNIDADE;
  if (size > teto) return { ok: false, erro: `O arquivo passa de ${Math.round(teto / MB)} MB` };
  return { ok: true };
}

/**
 * O que gravar em arquivo_oportunidade ao enviar a versão assinada: só a referência nova, o tamanho,
 * o tipo e a marca `assinado`. Nunca `nome`, `pasta`, `categoria` nem `origem` (a origem é o que o
 * servidor usa para achar o documento: mexer nela faria a próxima geração duplicar o arquivo).
 * `tamanho` fica null quando o arquivo não traz um tamanho numérico (o antigo era do PDF pendente).
 */
export function patchDoAssinado(ref, arquivo) {
  const size = arquivo?.size;
  return {
    url: ref,
    tamanho: typeof size === "number" && Number.isFinite(size) ? size : null,
    tipo: "application/pdf",
    assinatura: "assinado",
  };
}

/** "Baixar" vale para todo arquivo com referência, menos o link (que abre pelo próprio botão). */
export function ehBaixavel(arq) {
  return !!arq && arq.tipo !== "link" && String(arq.url ?? "").trim() !== "";
}
