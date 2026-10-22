/**
 * Arquivos que o SERVIDOR grava nos Arquivos da oportunidade (spec 2026-10-09 §4 e §5): cópia da
 * biblioteca de habilitação e do acervo, documentos gerados e o edital baixado pelo link. O Claude
 * nunca manda bytes nem ref: aqui só entram ids já conferidos na empresa da chave.
 *
 * Origem e destino ficam sempre na pasta `<empresa_id>/` do bucket (caminhoDaEmpresa); a gravação
 * é atômica pela RPC conector_gravar_arquivo (0161): a mesma `origem` troca o arquivo no lugar, e
 * arquivo já assinado não é trocado. Banco e Storage injetados: roda no Node.
 */
import {
  caminhoSeguroDaEmpresa,
  type CamadaEmpresa,
  type StorageConector,
} from "./camada-empresa.ts";
import { caminhoDoEnvio } from "./envio-regras.ts";

export const BUCKET_OPORTUNIDADE = "anexos-oportunidade";
export const BUCKET_HABILITACAO = "habilitacao";
export const BUCKET_ACERVO = "certificados";
/** Iguais às PASTAS_PADRAO do front (travessão U+2013). */
export const PASTA_HABILITACAO = "Envelope 02 – Habilitação";
export const PASTA_CREDENCIAMENTO = "Credenciamento";
export const LIMITE_ARQUIVO_SERVIDOR = 52428800;

export type TipoArquivoServidor = "pdf" | "xlsx" | "docx" | "zip" | "doc" | "xls" | "jpg" | "png";

/** Tipos aceitos na cópia da biblioteca de habilitação e do acervo (3º parâmetro de tipoPelosBytesServidor). */
export const TIPOS_DOCUMENTO_BIBLIOTECA: readonly TipoArquivoServidor[] = Object.freeze<
  TipoArquivoServidor[]
>(["pdf", "jpg", "png"]);
/** Tipos aceitos no edital baixado pelo link (3º parâmetro de tipoPelosBytesServidor). */
export const TIPOS_EDITAL: readonly TipoArquivoServidor[] = Object.freeze<TipoArquivoServidor[]>([
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "zip",
]);

export const MIME_ARQUIVO: Record<TipoArquivoServidor, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  jpg: "image/jpeg",
  png: "image/png",
};

export class ErroArquivo extends Error {
  codigo: "nao_encontrado" | "grande_demais" | "vazio" | "storage" | "tipo_nao_aceito";
  constructor(codigo: ErroArquivo["codigo"], mensagem: string) {
    super(mensagem);
    this.name = "ErroArquivo";
    this.codigo = codigo;
  }
}

/** Extensão em minúsculas, sem o ponto ("" se o nome não tem). */
export function extensaoDoNome(nome: string): string {
  return /\.([A-Za-z0-9]{1,8})$/.exec(String(nome ?? "").trim())?.[1]?.toLowerCase() ?? "";
}

/** Caracteres de formato invisíveis (largura zero, marcas e isolamentos bidi, BOM): somem do nome. */
const FORMATO_INVISIVEL = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/** Corta em `n` unidades de texto sem deixar um par substituto (emoji etc.) pela metade. */
function cortar(texto: string, n: number): string {
  const corte = texto.slice(0, n);
  const ultimo = corte.charCodeAt(corte.length - 1);
  return ultimo >= 0xd800 && ultimo <= 0xdbff ? corte.slice(0, -1) : corte;
}

/** O nome sem invisíveis, sem \ / : * ? " < > | nem controle e com espaços juntos (sem cortar e sem reserva). */
function limparNome(nome: unknown): string {
  return String(nome ?? "")
    .replace(FORMATO_INVISIVEL, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nome para mostrar na aba Arquivos: sem \ / : * ? " < > | nem controle nem caractere de formato
 * invisível (U+200B–U+200F, U+202A–U+202E, U+2060, U+2066–U+2069, U+FEFF), espaços juntos, até 150
 * (mantém a extensão e não corta um par substituto ao meio). Nome que fica vazio vira "arquivo" (mais a
 * extensão, se sobrou só ela).
 */
export function nomeParaExibir(nome: string): string {
  const limpo = limparNome(nome);
  const ext = extensaoDoNome(limpo);
  const base = ext ? limpo.slice(0, limpo.length - ext.length - 1) : limpo;
  if (!base.trim()) return ext ? `arquivo.${ext}` : "arquivo";
  if (limpo.length <= 150) return limpo;
  return ext ? `${cortar(limpo, 150 - ext.length - 1)}.${ext}` : cortar(limpo, 150);
}

const comeca = (bytes: Uint8Array, assinatura: number[]) =>
  bytes.length >= assinatura.length && assinatura.every((x, i) => bytes[i] === x);

/** O tipo pelos bytes e, só para desempatar, pela extensão; sem filtro de tipos permitidos. */
function tipoDetectado(primeiros: Uint8Array, nome: string): TipoArquivoServidor | null {
  if (!primeiros?.length) return null;
  const ext = extensaoDoNome(nome);
  if (comeca(primeiros, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (comeca(primeiros, [0x50, 0x4b, 0x03, 0x04]))
    return ext === "xlsx" || ext === "docx" ? ext : "zip";
  if (comeca(primeiros, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return ext === "doc" || ext === "xls" ? ext : null;
  }
  if (comeca(primeiros, [0xff, 0xd8, 0xff])) return "jpg";
  if (comeca(primeiros, [0x89, 0x50, 0x4e, 0x47])) return "png";
  return null;
}

/**
 * O tipo vem dos BYTES; a extensão do nome só desempata os formatos que dividem a mesma assinatura.
 * Com `permitidos` (ex.: TIPOS_DOCUMENTO_BIBLIOTECA, TIPOS_EDITAL), um tipo detectado que não está na
 * lista vira null; sem o parâmetro, qualquer tipo reconhecido vale.
 */
export function tipoPelosBytesServidor(
  primeiros: Uint8Array,
  nome: string,
  permitidos?: readonly TipoArquivoServidor[]
): TipoArquivoServidor | null {
  const tipo = tipoDetectado(primeiros, nome);
  if (tipo && permitidos && !permitidos.includes(tipo)) return null;
  return tipo;
}

/**
 * "<bucket>/<empresaId>/…" → o caminho dentro do bucket; qualquer outra coisa → null.
 * A regra do caminho é a ÚNICA do conector, `caminhoSeguroDaEmpresa` (camada-empresa.ts): sem caractere de
 * controle (TAB, LF e CR o parser de URL apaga, e ".\t." viraria ".."), sem espaço nas pontas, sem "?", "#",
 * "%" e "\", sem segmento vazio, "." ou ".."; pontos seguidos DENTRO de um nome ("Empresa_Ltda..pdf") passam.
 */
export function caminhoDaEmpresa(ref: unknown, bucket: string, empresaId: string): string | null {
  if (typeof ref !== "string") return null;
  const prefixo = `${bucket}/`;
  if (!ref.startsWith(prefixo)) return null;
  const caminho = ref.slice(prefixo.length);
  return caminhoSeguroDaEmpresa(caminho, empresaId) ? caminho : null;
}

export async function baixarObjeto(
  storage: StorageConector,
  bucket: string,
  caminho: string,
  limite: number = LIMITE_ARQUIVO_SERVIDOR
): Promise<Uint8Array> {
  const { data, error } = await storage.from(bucket).download(caminho);
  if (error || !data) {
    const msg = error?.message ?? "sem resposta";
    throw new ErroArquivo(
      /not found/i.test(msg) ? "nao_encontrado" : "storage",
      `Falha ao ler o arquivo: ${msg}`
    );
  }
  if (data.size === 0) throw new ErroArquivo("vazio", "O arquivo está vazio");
  if (data.size > limite) {
    throw new ErroArquivo("grande_demais", "O arquivo passa do limite de tamanho");
  }
  return new Uint8Array(await data.arrayBuffer());
}

export interface ArquivoGravado {
  arquivo_id: string;
  nome: string;
  ref: string;
  tamanho: number;
  substituiu: boolean;
  mantido_assinado: boolean;
}

interface RespostaGravar {
  ok?: boolean;
  motivo?: string;
  arquivo_id?: string;
  substituiu?: boolean;
  mantido_assinado?: boolean;
  ref_anterior?: string | null;
}

/**
 * Outra linha viva da empresa usa esta ref (coluna `url`, que a tela edita)? Se sim, o objeto não pode
 * sair do Storage. Falha ao perguntar (erro ou exceção) conta como "sim": só vai ao log, nada se remove.
 */
async function refEmUso(db: CamadaEmpresa, ref: string): Promise<boolean> {
  try {
    const { data, error } = await db.ler("arquivo_oportunidade", "id").eq("url", ref).limit(1);
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  } catch (e) {
    console.error(
      "[conector] arquivo: conferir se a ref anterior ainda é usada:",
      (e as Error)?.message ?? String(e)
    );
    return true;
  }
}

/**
 * Envia os bytes para a pasta da empresa e grava a linha (ou troca a da mesma origem). null = oportunidade
 * não encontrada. `nome` e `origem` são só VALIDADOS (nome com ao menos um caractere visível; origem não
 * vazia, até 200 caracteres) antes de qualquer envio; o nome gravado é o que o chamador passa.
 */
export async function gravarNaOportunidade(
  deps: { db: CamadaEmpresa; storage: StorageConector; agora: Date; novoUuid?: () => string },
  p: {
    oportunidadeId: string;
    origem: string;
    nome: string;
    bytes: Uint8Array;
    tipo: TipoArquivoServidor;
    pasta: string | null;
    categoria: string | null;
    assinatura: "pendente" | null;
    usuarioNome: string;
  }
): Promise<ArquivoGravado | null> {
  if (!p.bytes?.length) throw new ErroArquivo("vazio", "O arquivo está vazio");
  if (p.bytes.length > LIMITE_ARQUIVO_SERVIDOR) {
    throw new ErroArquivo("grande_demais", "O arquivo passa de 50 MB");
  }
  // o banco recusaria nome e origem sem caractere visível: melhor saber antes de enviar até 50 MB
  if (typeof p.nome !== "string" || !/\S/.test(limparNome(p.nome))) {
    throw new Error("gravarNaOportunidade: nome inválido (sem nenhum caractere visível)");
  }
  if (typeof p.origem !== "string" || !/\S/.test(p.origem) || p.origem.length > 200) {
    throw new Error("gravarNaOportunidade: origem inválida (vazia ou com mais de 200 caracteres)");
  }
  const uuid = (deps.novoUuid ?? (() => crypto.randomUUID()))();
  const caminho = caminhoDoEnvio(deps.db.empresaId, p.nome, deps.agora, uuid);
  const balde = deps.storage.from(BUCKET_OPORTUNIDADE);
  // limpeza de melhor esforço: nunca lança (nem transforma a gravação feita em erro, nem mascara o erro
  // original da RPC); o que falhar vai ao log
  const remover = async (c: string) => {
    try {
      const { error } = await balde.remove([c]);
      if (error) console.error("[conector] arquivo: remover objeto:", error.message);
    } catch (e) {
      console.error("[conector] arquivo: remover objeto:", (e as Error)?.message ?? String(e));
    }
  };

  const envio = await balde.upload(caminho, p.bytes, {
    contentType: MIME_ARQUIVO[p.tipo],
    upsert: false,
  });
  if (envio.error) {
    throw new ErroArquivo("storage", `Falha ao gravar o arquivo: ${envio.error.message}`);
  }
  const ref = `${BUCKET_OPORTUNIDADE}/${caminho}`;

  let r: RespostaGravar;
  try {
    r = await deps.db.rpc<RespostaGravar>("conector_gravar_arquivo", {
      p_oportunidade_id: p.oportunidadeId,
      p_origem: p.origem,
      p_nome: p.nome,
      p_url: ref,
      p_tipo: MIME_ARQUIVO[p.tipo],
      p_tamanho: p.bytes.length,
      p_pasta: p.pasta,
      p_categoria: p.categoria,
      p_assinatura: p.assinatura,
      p_usuario_nome: p.usuarioNome,
    });
  } catch (e) {
    await remover(caminho);
    throw e;
  }
  if (r?.ok !== true || !r.arquivo_id) {
    await remover(caminho);
    if (r?.motivo === "nao_encontrada") return null;
    throw new Error(
      `conector_gravar_arquivo: resposta inesperada (ok=${String(r?.ok)}, motivo=${String(r?.motivo)})`
    );
  }
  if (r.mantido_assinado === true) {
    await remover(caminho);
    return {
      arquivo_id: r.arquivo_id,
      nome: p.nome,
      ref: "",
      tamanho: 0,
      substituiu: false,
      mantido_assinado: true,
    };
  }
  if (r.substituiu === true) {
    // o objeto da versão anterior deixa de ter linha: sai do Storage, mas SÓ se é da pasta desta
    // empresa no bucket da oportunidade. A ref_anterior vem de uma coluna que qualquer usuário da
    // empresa altera pela tela: nunca se confia nela sem passar por caminhoDaEmpresa. E, como a url
    // também é editável, outra linha viva pode ainda apontar para o mesmo objeto: então ele fica.
    const anterior = caminhoDaEmpresa(r.ref_anterior, BUCKET_OPORTUNIDADE, deps.db.empresaId);
    if (
      anterior &&
      anterior !== caminho &&
      !(await refEmUso(deps.db, `${BUCKET_OPORTUNIDADE}/${anterior}`))
    ) {
      await remover(anterior);
    }
  }
  return {
    arquivo_id: r.arquivo_id,
    nome: p.nome,
    ref,
    tamanho: p.bytes.length,
    substituiu: r.substituiu === true,
    mantido_assinado: false,
  };
}

/** Linha "Arquivo" no histórico da oportunidade; falha vai ao log (o arquivo já está gravado). */
export async function registrarNoHistorico(
  db: CamadaEmpresa,
  oportunidadeId: string,
  usuarioNome: string,
  descricao: string
): Promise<void> {
  try {
    await db.inserir("oportunidade_atualizacao", [
      { oportunidade_id: oportunidadeId, usuario_nome: usuarioNome, tipo: "Arquivo", descricao },
    ]);
  } catch (e) {
    console.error("[conector] arquivo: histórico:", (e as Error)?.message ?? String(e));
  }
}
