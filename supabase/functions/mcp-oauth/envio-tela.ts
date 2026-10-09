/**
 * Ações da página de envio de arquivos do conector do Claude (/EnviarArquivos?link=<id>), chamadas
 * pela SPA com a sessão do usuário (mesma entrada das ações da tela do mcp-oauth).
 *
 *   link_envio      {link_id} → o link, a empresa, o alvo e uma vaga por arquivo esperado, com o
 *                   token de upload assinado gerado na hora (só para os que faltam);
 *   concluir_envio  {link_id, aceitar_parcial?} → registrarEnvio (a mesma rotina do Claude Code).
 *
 * Só quem GEROU o link usa a página, e de novo com o vínculo ativo na empresa do link e a
 * permissão do alvo (spec 25/09 §4.6; decisão 13 do contrato do Plano 2). O upload não depende da
 * empresa ativa da sessão (vai por URL assinada); só a gravação do texto, feita depois pela tela,
 * passa pela RLS. Importável no Node (sem Deno.*): o index.ts liga a rede.
 */
import { fail, ok } from "../_shared/cors.ts";
import type { Vinculo } from "../_shared/conector/acesso.ts";
import {
  camadaDaEmpresa,
  type Admin,
  type CamadaEmpresa,
  type StorageConector,
} from "../_shared/conector/camada-empresa.ts";
import { uuidOuNull } from "../_shared/conector/entrada.ts";
import {
  atendeExigencia,
  exigenciaDoAlvo,
  rotuloExigencia,
} from "../_shared/conector/permissoes-ferramentas.ts";
import { situacaoDoLink, type AlvoEnvio } from "../_shared/conector/envio-regras.ts";
import {
  arquivosDoLink,
  ErroEnvio,
  lerLinkPorId,
  registrarEnvio,
  type CodigoErroEnvio,
} from "../_shared/conector/envio.ts";

type Obj = Record<string, unknown>;

/** Usuário da sessão da SPA (mcp-oauth/index.ts → usuarioDaSessao). */
export interface UsuarioTela {
  id: string;
  email: string;
  nome: string;
  senhaProvisoria: boolean;
  senhaAlteradaEm: string | null;
}

const STATUS_DO_ERRO: Record<CodigoErroEnvio, number> = {
  alvo_nao_encontrado: 404,
  nao_encontrado: 404,
  outro_usuario: 403,
  sem_permissao: 403,
  link_expirado: 409,
  link_usado: 409,
  faltam_arquivos: 409,
  arquivos_invalidos: 409,
};

/** O link é do usuário, ele segue com vínculo ativo na empresa do link e tem a permissão do alvo. */
async function linkDoUsuario(
  body: Obj,
  uc: UsuarioTela,
  admin: Admin
): Promise<{ link: Obj; alvo: AlvoEnvio; db: CamadaEmpresa } | Response> {
  const linkId = uuidOuNull(body.link_id);
  const link = linkId ? await lerLinkPorId(admin, linkId) : null;
  if (!link) return fail("Link não encontrado", 404);
  if (link.usuario_custom_id !== uc.id) return fail("Este link foi gerado para outro usuário", 403);
  const { data: vinculo, error } = await admin
    .from("usuario_empresa")
    .select("id, perfil, is_owner, permissoes, ativo, deleted_at")
    .eq("usuario_email", uc.email)
    .eq("empresa_id", link.empresa_id)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!vinculo) return fail("Você não tem mais acesso à empresa deste link.", 403);
  const alvo = link.alvo as AlvoEnvio;
  const exigencia = exigenciaDoAlvo(alvo);
  if (!atendeExigencia(vinculo as Vinculo, exigencia)) {
    return fail(`Seu usuário não tem a permissão ${rotuloExigencia(exigencia)} no SIGO.`, 403, {
      codigo: "sem_permissao",
    });
  }
  return { link, alvo, db: camadaDaEmpresa(admin, String(link.empresa_id)) };
}

async function existeNoStorage(
  storage: StorageConector,
  bucket: string,
  caminho: string
): Promise<boolean> {
  const corte = caminho.lastIndexOf("/");
  const nome = caminho.slice(corte + 1);
  const { data, error } = await storage
    .from(bucket)
    .list(caminho.slice(0, corte), { search: nome, limit: 1 });
  if (error) throw new Error(error.message);
  return (data ?? []).some((o) => o.name === nome);
}

export async function acaoLinkEnvio(
  body: Obj,
  uc: UsuarioTela,
  admin: Admin,
  agora: Date = new Date()
): Promise<Response> {
  const r = await linkDoUsuario(body, uc, admin);
  if (r instanceof Response) return r;
  const { link, alvo, db } = r;
  const bucket = String(link.bucket);
  const storage: StorageConector = admin.storage;
  const [{ data: empresa, error: erroEmpresa }, doAlvo] = await Promise.all([
    admin.from("empresa").select("id, nome, nome_fantasia").eq("id", link.empresa_id).maybeSingle(),
    alvo === "oportunidade"
      ? db.porId<{ nome: string | null }>("oportunidade", String(link.oportunidade_id), "id, nome")
      : db.porId<{ numero: string | null; objeto: string | null }>(
          "acervo_atestado",
          String(link.atestado_id),
          "id, numero, objeto"
        ),
  ]);
  if (erroEmpresa) throw new Error(erroEmpresa.message);
  const alvoNome =
    alvo === "oportunidade"
      ? ((doAlvo as { nome: string | null } | null)?.nome ?? null)
      : (() => {
          const at = doAlvo as { numero: string | null; objeto: string | null } | null;
          if (!at) return null;
          return at.numero ? `CAT/Atestado ${at.numero}` : at.objeto;
        })();
  const situacao = situacaoDoLink(link as { expira_em: string; usado_em: string | null }, agora);
  const registrados = (Array.isArray(link.registrados) ? link.registrados : []) as Obj[];
  const arquivos = [];
  for (const a of arquivosDoLink(link.arquivos)) {
    let enviado = registrados.some((x) => x.indice === a.indice);
    let upload: { bucket: string; path: string; token: string } | null = null;
    if (situacao === "pendente" && !enviado) {
      enviado = await existeNoStorage(storage, bucket, a.caminho);
      if (!enviado) {
        const { data, error } = await storage.from(bucket).createSignedUploadUrl(a.caminho);
        if (error || !data) throw new Error(error?.message ?? "URL de envio sem resposta");
        upload = { bucket, path: data.path, token: data.token };
      }
    }
    arquivos.push({
      indice: a.indice,
      nome: a.nome,
      tipo: a.tipo,
      categoria: a.categoria,
      pasta: a.pasta,
      enviado,
      upload,
    });
  }
  return ok({
    link_id: link.id,
    empresa: {
      id: link.empresa_id,
      nome: empresa ? String(empresa.nome_fantasia || empresa.nome) : "",
    },
    alvo,
    alvo_nome: alvoNome,
    situacao,
    expira_em: link.expira_em,
    arquivos,
  });
}

export async function acaoConcluirEnvio(
  body: Obj,
  uc: UsuarioTela,
  admin: Admin,
  fetchFn: typeof fetch = fetch,
  agora: Date = new Date()
): Promise<Response> {
  const r = await linkDoUsuario(body, uc, admin);
  if (r instanceof Response) return r;
  try {
    const resultado = await registrarEnvio(r.db, admin.storage, {
      linkId: String(r.link.id),
      origem: "pagina",
      autorizacaoId: null,
      usuarioCustomId: uc.id,
      usuarioNome: uc.nome || uc.email,
      aceitarParcial: body.aceitar_parcial === true,
      agora,
      fetchFn,
    });
    return ok(resultado);
  } catch (e) {
    if (!(e instanceof ErroEnvio)) throw e;
    return fail(e.message, STATUS_DO_ERRO[e.codigo], { codigo: e.codigo, ...(e.detalhes ?? {}) });
  }
}
