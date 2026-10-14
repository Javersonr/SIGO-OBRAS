/**
 * Arquivos que o SERVIDOR grava nos Arquivos da oportunidade (spec 2026-10-09 §4 e §5): cópia da
 * biblioteca de habilitação e do acervo, documentos gerados e o edital baixado pelo link. O Claude
 * nunca manda bytes nem ref: aqui só entram ids já conferidos na empresa da chave.
 *
 * Origem e destino ficam sempre na pasta `<empresa_id>/` do bucket (caminhoDaEmpresa); a gravação
 * é atômica pela RPC conector_gravar_arquivo (0156): a mesma `origem` troca o arquivo no lugar, e
 * arquivo já assinado não é trocado. Banco e Storage injetados: roda no Node.
 */
import type { CamadaEmpresa, StorageConector } from "./camada-empresa.ts";
import { caminhoDoEnvio } from "./envio-regras.ts";

export const BUCKET_OPORTUNIDADE = "anexos-oportunidade";
export const BUCKET_HABILITACAO = "habilitacao";
export const BUCKET_ACERVO = "certificados";
/** Iguais às PASTAS_PADRAO do front (travessão U+2013). */
export const PASTA_HABILITACAO = "Envelope 02 – Habilitação";
export const PASTA_CREDENCIAMENTO = "Credenciamento";
export const LIMITE_ARQUIVO_SERVIDOR = 52428800;

export type TipoArquivoServidor = "pdf" | "xlsx" | "docx" | "zip" | "doc" | "xls" | "jpg" | "png";

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

/** Nome para mostrar na aba Arquivos: sem \ / : * ? " < > | nem controle, espaços juntos, até 150 (mantém a extensão). */
export function nomeParaExibir(nome: string): string {
  const limpo = String(nome ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length <= 150) return limpo;
  const ext = extensaoDoNome(limpo);
  return ext ? `${limpo.slice(0, 150 - ext.length - 1)}.${ext}` : limpo.slice(0, 150);
}

const comeca = (bytes: Uint8Array, assinatura: number[]) =>
  bytes.length >= assinatura.length && assinatura.every((x, i) => bytes[i] === x);

/** O tipo vem dos BYTES; a extensão do nome só desempata os formatos que dividem a mesma assinatura. */
export function tipoPelosBytesServidor(
  primeiros: Uint8Array,
  nome: string
): TipoArquivoServidor | null {
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
 * "<bucket>/<empresaId>/…" → o caminho dentro do bucket; qualquer outra coisa → null.
 * Recusa "?", "#", "%" e "\" e todo SEGMENTO vazio, "." ou ".." (que sairia da pasta da empresa);
 * pontos seguidos DENTRO de um nome ("Empresa_Ltda..pdf") não são segmento e passam.
 */
export function caminhoDaEmpresa(ref: unknown, bucket: string, empresaId: string): string | null {
  if (typeof ref !== "string") return null;
  const prefixo = `${bucket}/`;
  if (!ref.startsWith(prefixo) || /[?#%\\]/.test(ref)) return null;
  const caminho = ref.slice(prefixo.length);
  const partes = caminho.split("/");
  if (partes.length < 2 || partes.some((p) => p === "" || p === "." || p === "..")) return null;
  return partes[0].toLowerCase() === empresaId.toLowerCase() ? caminho : null;
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

/** Envia os bytes para a pasta da empresa e grava a linha (ou troca a da mesma origem). null = oportunidade não encontrada. */
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
  const uuid = (deps.novoUuid ?? (() => crypto.randomUUID()))();
  const caminho = caminhoDoEnvio(deps.db.empresaId, p.nome, deps.agora, uuid);
  const balde = deps.storage.from(BUCKET_OPORTUNIDADE);
  const remover = async (c: string) => {
    const { error } = await balde.remove([c]);
    if (error) console.error("[conector] arquivo: remover objeto:", error.message);
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
    // empresa altera pela tela: nunca se confia nela sem passar por caminhoDaEmpresa.
    const anterior = caminhoDaEmpresa(r.ref_anterior, BUCKET_OPORTUNIDADE, deps.db.empresaId);
    if (anterior && anterior !== caminho) await remover(anterior);
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
