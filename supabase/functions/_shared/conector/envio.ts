/**
 * Link de envio de arquivos do conector do Claude (spec 25/09 §4.6): criar o link, conferir os
 * objetos enviados e registrar. Uma só rotina de registro (registrarEnvio) para a página
 * /EnviarArquivos e para o Claude Code (envio por URL assinada).
 *
 * Banco pela CamadaEmpresa (presa à empresa da chave) e Storage/fetch injetados: roda no Node.
 * A única leitura sem empresa é lerLinkPorId (página de envio): o id do link é a chave, e quem
 * chama confere o dono em seguida.
 */
import type { Admin, CamadaEmpresa, StorageConector } from "./camada-empresa.ts";
import { dadosOuErro } from "./camada-empresa.ts";
import {
  BUCKET_DO_ALVO,
  caminhoDoEnvio,
  CATEGORIAS_EDITAL,
  conferirObjeto,
  LIMITE_BYTES,
  MIME_DO_TIPO,
  pastaParaGravarServidor,
  situacaoDoLink,
  VALIDADE_LINK_MS,
  type AlvoEnvio,
  type ArquivoDoLink,
  type ArquivoPedido,
  type MotivoRecusa,
  type TipoArquivoEnvio,
} from "./envio-regras.ts";
import { linkPaginaEnvio } from "./recurso.ts";

export type CodigoErroEnvio =
  | "alvo_nao_encontrado"
  | "nao_encontrado"
  | "link_expirado"
  | "link_usado"
  | "outro_usuario"
  | "faltam_arquivos"
  | "arquivos_invalidos"
  | "sem_permissao";

export class ErroEnvio extends Error {
  codigo: CodigoErroEnvio;
  detalhes: Record<string, unknown> | null;
  constructor(
    codigo: CodigoErroEnvio,
    mensagem: string,
    detalhes: Record<string, unknown> | null = null
  ) {
    super(mensagem);
    this.name = "ErroEnvio";
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export interface LinkCriado {
  link_id: string;
  pagina: string;
  expira_em: string;
  alvo: AlvoEnvio;
  alvo_id: string;
  arquivos: {
    indice: number;
    nome: string;
    tipo: TipoArquivoEnvio;
    caminho: string;
    upload_url: string;
    token: string;
  }[];
}

const COLUNAS_LINK =
  "id, autorizacao_id, usuario_custom_id, alvo, oportunidade_id, atestado_id, bucket, arquivos, registrados, expira_em, usado_em, usado_por";

/** Lista do link (jsonb) → arquivos esperados, na ordem do índice. */
export function arquivosDoLink(v: unknown): ArquivoDoLink[] {
  const lista = Array.isArray(v) ? v : [];
  return (lista as ArquivoDoLink[])
    .filter((a) => a && typeof a.caminho === "string" && typeof a.indice === "number")
    .sort((a, b) => a.indice - b.indice);
}

export async function criarLinkEnvio(
  db: CamadaEmpresa,
  storage: StorageConector,
  p: {
    autorizacaoId: string;
    usuarioCustomId: string;
    alvo: AlvoEnvio;
    alvoId: string;
    arquivos: ArquivoPedido[];
    agora: Date;
    novoUuid?: () => string;
  }
): Promise<LinkCriado> {
  const tabela = p.alvo === "oportunidade" ? "oportunidade" : "acervo_atestado";
  const alvo = await db.porId<{ id: string }>(tabela, p.alvoId, "id");
  if (!alvo) {
    throw new ErroEnvio(
      "alvo_nao_encontrado",
      p.alvo === "oportunidade"
        ? "Oportunidade não encontrada nesta empresa."
        : "Atestado não encontrado nesta empresa."
    );
  }
  const novoUuid = p.novoUuid ?? (() => crypto.randomUUID());
  const bucket = BUCKET_DO_ALVO[p.alvo];
  const arquivos: ArquivoDoLink[] = p.arquivos.map((a, i) => ({
    ...a,
    indice: i + 1,
    caminho: caminhoDoEnvio(db.empresaId, a.nome, p.agora, novoUuid()),
  }));
  const expira = new Date(p.agora.getTime() + VALIDADE_LINK_MS).toISOString();
  const [link] = await db.inserir<{ id: string }>("mcp_link_envio", [
    {
      autorizacao_id: p.autorizacaoId,
      usuario_custom_id: p.usuarioCustomId,
      alvo: p.alvo,
      oportunidade_id: p.alvo === "oportunidade" ? alvo.id : null,
      atestado_id: p.alvo === "atestado" ? alvo.id : null,
      bucket,
      arquivos,
      expira_em: expira,
    },
  ]);
  const saida: LinkCriado["arquivos"] = [];
  for (const a of arquivos) {
    const { data, error } = await storage.from(bucket).createSignedUploadUrl(a.caminho);
    if (error || !data) {
      throw new Error(`Falha ao gerar a URL de envio: ${error?.message ?? "sem resposta"}`);
    }
    saida.push({
      indice: a.indice,
      nome: a.nome,
      tipo: a.tipo,
      caminho: a.caminho,
      upload_url: data.signedUrl,
      token: data.token,
    });
  }
  return {
    link_id: link.id,
    pagina: linkPaginaEnvio(link.id),
    expira_em: expira,
    alvo: p.alvo,
    alvo_id: alvo.id,
    arquivos: saida,
  };
}

/** Lê só os primeiros `n` bytes do corpo e cancela o resto (não baixa o PDF inteiro). */
async function primeirosBytes(resp: Response, n: number): Promise<Uint8Array> {
  const leitor = resp.body?.getReader();
  if (!leitor) return new Uint8Array(await resp.arrayBuffer()).slice(0, n);
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < n) {
      const { done, value } = await leitor.read();
      if (done || !value) break;
      partes.push(value);
      total += value.length;
    }
  } finally {
    await leitor.cancel().catch(() => {});
  }
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return junto.slice(0, n);
}

/**
 * list(pasta, {search: nome, limit: 1}) → metadata.size; createSignedUrl(caminho, 60) +
 * fetchFn(url, {headers: {Range: "bytes=0-7"}}), lendo só os 8 primeiros bytes.
 * Falha de rede ou do Storage LANÇA (não vira "tipo errado", que apagaria o envio).
 */
export async function lerObjeto(
  storage: StorageConector,
  fetchFn: typeof fetch,
  bucket: string,
  caminho: string
): Promise<{ existe: boolean; tamanho: number | null; primeiros: Uint8Array | null }> {
  const corte = caminho.lastIndexOf("/");
  const pasta = caminho.slice(0, corte);
  const nome = caminho.slice(corte + 1);
  const { data, error } = await storage.from(bucket).list(pasta, { search: nome, limit: 1 });
  if (error) throw new Error(`Falha ao conferir o arquivo no Storage: ${error.message}`);
  const item = (data ?? []).find((o) => o.name === nome);
  if (!item) return { existe: false, tamanho: null, primeiros: null };
  const tamanho = typeof item.metadata?.size === "number" ? item.metadata.size : null;
  // objeto vazio: o Range não tem o que devolver (o Storage responde 416) e conferirObjeto já diz "vazio"
  if (tamanho === 0) return { existe: true, tamanho: 0, primeiros: null };
  const { data: assinada, error: erroUrl } = await storage
    .from(bucket)
    .createSignedUrl(caminho, 60);
  if (erroUrl || !assinada) {
    throw new Error(`Falha ao ler o arquivo no Storage: ${erroUrl?.message ?? "sem URL"}`);
  }
  const resp = await fetchFn(assinada.signedUrl, { headers: { Range: "bytes=0-7" } });
  if (!resp.ok) {
    await resp.body?.cancel().catch(() => {});
    throw new Error(`Falha ao ler o arquivo no Storage (HTTP ${resp.status})`);
  }
  return { existe: true, tamanho, primeiros: await primeirosBytes(resp, 8) };
}

export interface ResultadoRegistro {
  link_id: string;
  alvo: AlvoEnvio;
  alvo_id: string;
  registrados: {
    indice: number;
    nome: string;
    arquivo_id: string | null;
    ref: string;
    tamanho: number;
  }[];
  recusados: { indice: number; nome: string; motivo: MotivoRecusa }[];
}

interface LinhaLink {
  id: string;
  autorizacao_id: string;
  usuario_custom_id: string;
  alvo: AlvoEnvio;
  oportunidade_id: string | null;
  atestado_id: string | null;
  bucket: string;
  arquivos: unknown;
  expira_em: string;
  usado_em: string | null;
}

const MSG_RECUSA: Record<MotivoRecusa, string> = {
  ausente: "não foi enviado",
  vazio: "está vazio (gere um link novo para enviar de novo)",
  grande_demais: "passa do limite de tamanho",
  tipo_errado: "não é do tipo esperado (foi apagado; envie de novo)",
};

export async function registrarEnvio(
  db: CamadaEmpresa,
  storage: StorageConector,
  p: {
    linkId: string;
    origem: "claude" | "pagina";
    autorizacaoId: string | null; // origem "claude": tem de ser a do link
    usuarioCustomId: string; // origem "pagina": tem de ser o do link
    usuarioNome: string;
    aceitarParcial: boolean;
    agora: Date;
    fetchFn: typeof fetch;
  }
): Promise<ResultadoRegistro> {
  // 1. o link, o dono e a situação
  const link = await db.porId<LinhaLink>("mcp_link_envio", p.linkId, COLUNAS_LINK);
  if (!link) throw new ErroEnvio("nao_encontrado", "Link de envio não encontrado nesta empresa.");
  const dono =
    p.origem === "claude"
      ? link.autorizacao_id === p.autorizacaoId
      : link.usuario_custom_id === p.usuarioCustomId;
  if (!dono) throw new ErroEnvio("outro_usuario", "Este link foi gerado para outro usuário.");
  const situacao = situacaoDoLink(link, p.agora);
  if (situacao === "usado") throw new ErroEnvio("link_usado", "Este link já foi usado.");
  if (situacao === "expirado") {
    throw new ErroEnvio("link_expirado", "Este link expirou (vale 2 horas). Gere outro.");
  }
  const alvoId = (link.alvo === "oportunidade" ? link.oportunidade_id : link.atestado_id) ?? "";

  // 2. confere cada objeto ANTES de consumir o link
  const validos: { a: ArquivoDoLink; tamanho: number }[] = [];
  const recusados: ResultadoRegistro["recusados"] = [];
  for (const a of arquivosDoLink(link.arquivos)) {
    const obj = await lerObjeto(storage, p.fetchFn, link.bucket, a.caminho);
    const c = conferirObjeto(a, obj, LIMITE_BYTES[link.alvo]);
    if (c.ok) {
      validos.push({ a, tamanho: obj.tamanho ?? 0 });
      continue;
    }
    recusados.push({ indice: a.indice, nome: a.nome, motivo: c.motivo });
    if (c.motivo === "tipo_errado") {
      // única exclusão do conector: o objeto recém-enviado para ESTE link, no caminho do servidor
      const { error } = await storage.from(link.bucket).remove([a.caminho]);
      if (error) console.error("[conector] envio: remover tipo errado:", error.message);
    }
  }

  // 3. falta arquivo sem aceitar_parcial → não consome (dá para tentar de novo nas 2 h)
  const detalhes = {
    recusados: recusados.map((r) => ({ ...r, problema: MSG_RECUSA[r.motivo] })),
  };
  if (recusados.length && !p.aceitarParcial) {
    throw new ErroEnvio(
      "faltam_arquivos",
      `Faltam arquivos: ${recusados.map((r) => `${r.nome} (${MSG_RECUSA[r.motivo]})`).join("; ")}.`,
      detalhes
    );
  }
  if (!validos.length) {
    throw new ErroEnvio("arquivos_invalidos", "Nenhum arquivo válido foi enviado.", detalhes);
  }

  // 4. consome o link de forma atômica (só um registro ganha)
  const agoraIso = p.agora.toISOString();
  const consumido = await db.atualizar(
    "mcp_link_envio",
    link.id,
    { usado_em: agoraIso, usado_por: p.origem },
    "id",
    (q) => {
      const base = q.is("usado_em", null).gt("expira_em", agoraIso);
      return p.origem === "claude"
        ? base.eq("autorizacao_id", p.autorizacaoId)
        : base.eq("usuario_custom_id", p.usuarioCustomId);
    }
  );
  if (!consumido) throw new ErroEnvio("link_usado", "Este link já foi usado.");

  // 5. grava os registros (um INSERT só); se ele falhar, o link volta a pendente
  let registrados: ResultadoRegistro["registrados"];
  try {
    registrados =
      link.alvo === "oportunidade"
        ? await registrarNaOportunidade(db, link, validos, p)
        : await registrarNoAtestado(db, link, validos);
  } catch (e) {
    // se a volta também falhar (queda do banco), o erro original continua saindo; a falha vai ao log
    await db
      .atualizar("mcp_link_envio", link.id, { usado_em: null, usado_por: null })
      .catch((e2) =>
        console.error("[conector] envio: devolver o link a pendente:", (e2 as Error)?.message)
      );
    throw e;
  }

  // 6. o que entrou fica no link (status_envio); falha aqui não desfaz o registro
  await db
    .atualizar("mcp_link_envio", link.id, { registrados })
    .catch((e) => console.error("[conector] envio: registrados:", (e as Error)?.message));
  return { link_id: link.id, alvo: link.alvo, alvo_id: alvoId, registrados, recusados };
}

async function registrarNaOportunidade(
  db: CamadaEmpresa,
  link: LinhaLink,
  validos: { a: ArquivoDoLink; tamanho: number }[],
  p: { origem: "claude" | "pagina"; usuarioNome: string }
): Promise<ResultadoRegistro["registrados"]> {
  const opId = link.oportunidade_id as string;
  const linhas = validos.map(({ a, tamanho }) => ({
    oportunidade_id: opId,
    nome: a.nome,
    url: `${link.bucket}/${a.caminho}`,
    tipo: MIME_DO_TIPO[a.tipo],
    tamanho,
    categoria: a.categoria,
    pasta: pastaParaGravarServidor(a.pasta, a.categoria),
    usuario_nome: p.usuarioNome,
  }));
  const criados = await db.inserir<{ id: string; url: string }>(
    "arquivo_oportunidade",
    linhas,
    "id, url"
  );
  const idPorRef = new Map(criados.map((c) => [c.url, c.id]));
  const registrados = validos.map(({ a, tamanho }) => {
    const ref = `${link.bucket}/${a.caminho}`;
    return { indice: a.indice, nome: a.nome, arquivo_id: idPorRef.get(ref) ?? null, ref, tamanho };
  });
  const doEdital = validos
    .filter(({ a }) => (CATEGORIAS_EDITAL as readonly string[]).includes(a.categoria ?? ""))
    .map(({ a }) => ({
      arquivo_oportunidade_id: idPorRef.get(`${link.bucket}/${a.caminho}`) ?? null,
      nome: a.nome,
      categoria: a.categoria,
    }))
    .filter((x) => x.arquivo_oportunidade_id);
  // Os arquivos já estão gravados: o que vem abaixo é complemento e não desfaz o registro
  // (repetir o envio duplicaria os arquivos).
  try {
    if (doEdital.length) {
      await db.rpc("edital_analise_anexar_arquivos", {
        p_oportunidade_id: opId,
        p_arquivos: doEdital,
      });
    }
    const quem = p.origem === "claude" ? "pelo Claude" : "pela página do conector";
    await db.inserir("oportunidade_atualizacao", [
      {
        oportunidade_id: opId,
        usuario_nome: p.usuarioNome,
        tipo: "Arquivo",
        descricao: `Arquivos enviados ${quem}: ${validos.map(({ a }) => a.nome).join(", ")}`,
      },
    ]);
  } catch (e) {
    console.error("[conector] envio: complemento da oportunidade:", (e as Error)?.message);
  }
  return registrados;
}

async function registrarNoAtestado(
  db: CamadaEmpresa,
  link: LinhaLink,
  validos: { a: ArquivoDoLink; tamanho: number }[]
): Promise<ResultadoRegistro["registrados"]> {
  const { a, tamanho } = validos[0];
  const ref = `${link.bucket}/${a.caminho}`;
  const ok = await db.atualizar("acervo_atestado", link.atestado_id as string, {
    arquivo_ref: ref,
  });
  if (!ok) throw new ErroEnvio("alvo_nao_encontrado", "Atestado não encontrado nesta empresa.");
  return [{ indice: a.indice, nome: a.nome, arquivo_id: null, ref, tamanho }];
}

/** Única leitura sem empresa: o id do link é a chave; quem chama confere o dono. */
export async function lerLinkPorId(
  admin: Admin,
  linkId: string
): Promise<Record<string, unknown> | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkId ?? "")) {
    return null;
  }
  return dadosOuErro<Record<string, unknown>>(
    await admin
      .from("mcp_link_envio")
      .select(`empresa_id, ${COLUNAS_LINK}`)
      .eq("id", linkId.toLowerCase())
      .maybeSingle()
  );
}
