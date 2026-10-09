/**
 * Envio de arquivos do conector do Claude e texto do edital para o Claude (spec 2026-09-25 §4.6 e
 * §4.8). Módulo PURO (sem sigoClient): a página /EnviarArquivos, o botão "Preparar para o Claude"
 * e a leitura do edital injetam a entidade do SDK.
 *
 * O texto de cada página do PDF (extraído no navegador) vai para `arquivo_texto_pagina`, com a RLS
 * da empresa: por isso a gravação exige a sessão na empresa do arquivo.
 */

/**
 * 50 MB: o limite do bucket anexos-oportunidade desde a 0150 (aplicada em 09/10/2026), que também
 * libera o .xlsx. Antes dela o bucket aceitava só 25 MB (migração 0015).
 */
export const LIMITE_ANEXO_OPORTUNIDADE = 50 * 1024 * 1024;
export const LIMITE_ANEXO_ATESTADO = 25 * 1024 * 1024;
export const MAX_CARACTERES_PAGINA = 100000;
/** Teto de caracteres por lote do bulkCreate (além das 200 linhas), para o corpo da requisição. */
export const MAX_CARACTERES_LOTE = 2000000;
export const LINHAS_POR_LOTE = 200;
export const CATEGORIAS_COM_TEXTO = ["edital", "termo_referencia", "anexo_edital", "errata"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?link=<uuid> → uuid em minúsculas | null. */
export function lerParametroLink(search) {
  const v = new URLSearchParams(search || "").get("link");
  const t = String(v ?? "").trim();
  return UUID.test(t) ? t.toLowerCase() : null;
}

/** A gravação do texto passa pela RLS: a sessão precisa estar na empresa do link. */
export function precisaTrocarEmpresa(empresaIdDaSessao, empresaIdDoLink) {
  if (!empresaIdDoLink) return false;
  return String(empresaIdDaSessao ?? "").toLowerCase() !== String(empresaIdDoLink).toLowerCase();
}

const megas = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** O arquivo escolhido cabe na vaga? (extensão do tipo esperado e tamanho) */
export function arquivoCabeNoSlot(file, slot, limiteBytes) {
  if (!file) return { ok: false, erro: "Escolha um arquivo" };
  const tipo = slot?.tipo === "xlsx" ? "xlsx" : "pdf";
  const nome = String(file.name ?? "");
  if (!new RegExp(`\\.${tipo}$`, "i").test(nome)) {
    return { ok: false, erro: `Este espaço espera um arquivo .${tipo}` };
  }
  if (!(file.size > 0)) return { ok: false, erro: "O arquivo está vazio" };
  if (file.size > limiteBytes) {
    return { ok: false, erro: `O arquivo passa de ${megas(limiteBytes)}` };
  }
  return { ok: true };
}

/** Páginas do extrairPaginasPdf ({n, texto, escaneada}) → linhas de arquivo_texto_pagina. */
export function montarLinhasTexto(paginas, { empresaId, arquivoId }) {
  return (paginas || [])
    .filter((p) => Number.isInteger(p?.n) && p.n >= 1 && p.n <= 5000)
    .map((p) => ({
      empresa_id: empresaId,
      arquivo_id: arquivoId,
      pagina: p.n,
      texto: String(p.texto ?? "").slice(0, MAX_CARACTERES_PAGINA),
      escaneada: p.escaneada === true,
    }));
}

/** Lotes de até 200 linhas e até MAX_CARACTERES_LOTE caracteres de texto. */
export function lotesDeTexto(linhas) {
  const lotes = [];
  let atual = [];
  let chars = 0;
  for (const l of linhas) {
    if (
      atual.length &&
      (atual.length >= LINHAS_POR_LOTE || chars + l.texto.length > MAX_CARACTERES_LOTE)
    ) {
      lotes.push(atual);
      atual = [];
      chars = 0;
    }
    atual.push(l);
    chars += l.texto.length;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

/**
 * Regrava o texto do arquivo: "apaga" (deleted_at) as páginas anteriores e grava as novas em lotes.
 * `entidade` = sigo.entities.ArquivoTextoPagina (injetada). Devolve o nº de páginas gravadas.
 *
 * Se um lote falhar, apaga de novo o que os lotes anteriores gravaram e relança o erro original: o
 * arquivo termina SEM texto (o conector responde "sem_texto" e manda usar "Preparar para o
 * Claude"). Texto parcial é pior, porque o Claude o leria como o edital inteiro.
 */
export async function gravarTextoPaginas(entidade, { empresaId, arquivoId, paginas }) {
  if (!empresaId || !arquivoId) throw new Error("Empresa e arquivo são obrigatórios");
  const linhas = montarLinhasTexto(paginas, { empresaId, arquivoId });
  const apagar = () => entidade.deleteMany({ empresa_id: empresaId, arquivo_id: arquivoId });
  await apagar();
  try {
    for (const lote of lotesDeTexto(linhas)) await entidade.bulkCreate(lote);
  } catch (erro) {
    try {
      await apagar();
    } catch (erroLimpeza) {
      console.error("[envio-arquivos] não consegui apagar o texto parcial:", erroLimpeza);
    }
    throw erro;
  }
  return linhas.length;
}
