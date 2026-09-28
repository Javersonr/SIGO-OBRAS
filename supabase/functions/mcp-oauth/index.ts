/**
 * mcp-oauth — servidor de autorização OAuth 2.1 do conector do Claude (MCP).
 *
 * Endpoints do protocolo (chamados pelo Claude, servidor a servidor, sem JWT
 * do Supabase — deploy com --no-verify-jwt):
 *   POST …/mcp-oauth/register  JSON (RFC 7591)  → 201 {client_id, …}
 *   POST …/mcp-oauth/token     form (RFC 6749)  → {access_token, refresh_token, …}
 *   POST …/mcp-oauth/revoke    form (RFC 7009)  → 200
 * Ações da tela do SIGO (/AutorizarConector e Meu Perfil), POST JSON {acao},
 * com a sessão da SPA (JWT do Supabase): contexto | aprovar | negar | listar |
 * revogar | gerar_manual.
 * Metadata do AS: estática em https://www.sigoobras.com.br/.well-known/oauth-authorization-server
 *
 * Segredos: só o SHA-256 vai para o banco (conector_codigo / conector_chave).
 * Chaves presas à empresa escolhida na aprovação (conector_autorizacao).
 *
 * CORS: register/token/revoke respondem com Access-Control-Allow-Origin: *
 * (sem credenciais — clientes de navegador como o MCP Inspector); as ações da
 * tela seguem restritas às origens do SIGO (withCors).
 * Erro de sessão nas ações da tela: 401 com `codigo: "sessao_invalida"` — a
 * tela usa esse campo para mandar ao login (e só nesse caso).
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { fail, ok, withCors } from "../_shared/cors.ts";
import { getCallerFromJWT, usuarioCustomDoCaller } from "../_shared/auth-jwt.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  MSG_MUITAS_TENTATIVAS,
  type Consumo,
} from "../_shared/limite-tentativas.ts";
import { gerarSegredo, hashSegredo, pkceS256Confere, PREFIXO } from "../_shared/conector/cripto.ts";
import {
  destinoDoRedirect,
  recursoCanonico,
  redirectConfere,
} from "../_shared/conector/redirect.ts";
import {
  empresaLiberada,
  modulosDoPlano,
  revogadaPelaTrocaDeSenha,
  temPermissaoServidor,
  type EmpresaConector,
  type Vinculo,
} from "../_shared/conector/acesso.ts";
import {
  decidirRenovacao,
  DURACAO,
  erroOAuth,
  ESCOPO,
  ISSUER,
  lerFormUnico,
  montarRedirectErro,
  montarRedirectSucesso,
  nomeDoApp,
  respostaRegistro,
  validarPedidoAutorizacao,
  validarRegistro,
} from "../_shared/conector/oauth-regras.ts";
import { revogarAutorizacao } from "../_shared/conector/revogar.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;
type Obj = Record<string, unknown>;

const RECURSO = recursoCanonico(`${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/mcp`) as string;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_CACHE = {
  "content-type": "application/json",
  "cache-control": "no-store",
  pragma: "no-cache",
};

const MSG_INDISPONIVEL = "Serviço indisponível, tente de novo";
const MSG_SESSAO = "Sessão inválida ou expirada. Entre no SIGO de novo.";
const ESPERA_INDISPONIVEL = { "retry-after": "5" };
const ESPERA_LIMITE = { "retry-after": "60" };

const jsonOAuth = (corpo: unknown, status = 200, extras: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...SEM_CACHE, ...extras } });
const agoraIso = () => new Date().toISOString();
const daquiMs = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Endpoints do protocolo: abertos a qualquer origem, sem credenciais. */
const CORS_PROTOCOLO: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version",
  "access-control-expose-headers": "retry-after",
  "access-control-max-age": "86400",
};

const telaDoSigo = withCors(async (req) => {
  if (req.method !== "POST") return fail("Método não permitido", 405);
  return await acaoDaTela(req, createAdminClient());
});

Deno.serve(async (req) => {
  const endpoint = /\/(register|token|revoke)$/.exec(new URL(req.url).pathname)?.[1];
  // Tratados ANTES do withCors, que só libera as origens do SIGO
  if (endpoint) return comCorsProtocolo(await protocolo(endpoint, req));
  return await telaDoSigo(req);
});

function comCorsProtocolo(resp: Response): Response {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(CORS_PROTOCOLO)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, headers });
}

async function protocolo(endpoint: string, req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") {
    return jsonOAuth(erroOAuth("invalid_request", "Método não permitido"), 405, {
      allow: "POST, OPTIONS",
    });
  }
  return await comErroServidor(endpoint, () => {
    const admin = createAdminClient();
    if (endpoint === "register") return registrar(req, admin);
    if (endpoint === "token") return token(req, admin);
    return revogarToken(req, admin);
  });
}

/**
 * Exceção nos endpoints do protocolo OAuth (register/token/revoke) vira
 * server_error no formato OAuth, com no-store — não o 500 genérico do
 * withCors, que sai fora do formato OAuth e sem os headers de cache certos.
 */
async function comErroServidor(nome: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[mcp-oauth] ${nome}:`, (err as Error)?.message ?? String(err));
    return jsonOAuth(erroOAuth("server_error"), 500);
  }
}

// ─── Protocolo ──────────────────────────────────────────────────────────────

async function registrar(req: Request, admin: Admin): Promise<Response> {
  // RFC 7591 §3.1: corpo JSON. Aceitar text/plain deixava qualquer página
  // registrar clientes sem preflight a partir do navegador dos visitantes.
  if (!/application\/json/i.test(req.headers.get("content-type") ?? "")) {
    return jsonOAuth(
      erroOAuth("invalid_client_metadata", "Envie o registro como application/json"),
      400
    );
  }
  // IP de saída da Anthropic é compartilhado por todos os clientes: limite folgado
  const lim = await consumirTentativa(
    admin,
    "mcp-oauth:register",
    3600,
    [{ tipo: "ip", valor: ipDaRequisicao(req), max: 1000 }],
    { falharFechado: true }
  );
  if (lim.indisponivel) {
    return jsonOAuth(erroOAuth("server_error", MSG_INDISPONIVEL), 503, ESPERA_INDISPONIVEL);
  }
  if (!lim.permitido) {
    return jsonOAuth(
      erroOAuth("invalid_client_metadata", MSG_MUITAS_TENTATIVAS),
      429,
      ESPERA_LIMITE
    );
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return jsonOAuth(erroOAuth("invalid_client_metadata", "JSON inválido"), 400);
  }
  const v = validarRegistro(corpo);
  if (!v.ok) return jsonOAuth(erroOAuth(v.erro, v.descricao), 400);
  const clientId = gerarSegredo(PREFIXO.cliente, 16);
  const { error } = await admin.from("conector_cliente").insert({
    client_id: clientId,
    nome: v.cliente.nome,
    redirect_uris: v.cliente.redirect_uris,
    tipo: v.cliente.tipo,
  });
  if (error) {
    console.error("[mcp-oauth] register:", error.message);
    return jsonOAuth(erroOAuth("server_error"), 500);
  }
  return jsonOAuth(respostaRegistro(clientId, v.cliente, Math.floor(Date.now() / 1000)), 201);
}

async function token(req: Request, admin: Admin): Promise<Response> {
  // Limite por IP (spec §4.1), nunca pelo client_id: ele vem do chamador e é
  // público — girar valores escapava do limite, e 240 POSTs lixo com o
  // client_id da vítima travavam a troca/renovação dela. Teto alto: o IP de
  // saída da Anthropic é compartilhado por todos os usuários.
  const lim = await consumirTentativa(
    admin,
    "mcp-oauth:token",
    3600,
    [{ tipo: "ip", valor: ipDaRequisicao(req), max: 3000 }],
    { falharFechado: true }
  );
  // Limitador fora do ar ≠ recusa: 4xx no refresh faria o cliente descartar
  // a conexão e pedir reconexão a todos.
  if (lim.indisponivel) return jsonOAuth(erroOAuth("server_error"), 503, ESPERA_INDISPONIVEL);
  if (!lim.permitido) {
    return jsonOAuth(erroOAuth("invalid_request", MSG_MUITAS_TENTATIVAS), 429, ESPERA_LIMITE);
  }
  const form = lerFormUnico(await req.text());
  if (!form)
    return jsonOAuth(erroOAuth("invalid_request", "Parâmetro repetido ou corpo inválido"), 400);
  if (form.grant_type === "authorization_code") return await trocarCodigo(form, admin);
  if (form.grant_type === "refresh_token") return await renovar(form, admin);
  return jsonOAuth(erroOAuth("unsupported_grant_type"), 400);
}

/**
 * Autorização vigente para a troca do código e a renovação. Revogação
 * implícita (0124): senha trocada depois da autorização também a derruba,
 * mesmo se a revogação explícita da função de senha falhou.
 */
async function autorizacaoAtiva(admin: Admin, id: string) {
  const { data, error } = await admin
    .from("conector_autorizacao")
    .select("id, criado_em, revogado_em, cliente_id, resource, usuario_custom_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revogado_em) return null;
  const { data: dono, error: erroDono } = await admin
    .from("usuario_custom")
    .select("senha_alterada_em")
    .eq("id", data.usuario_custom_id)
    .maybeSingle();
  if (erroDono) throw new Error(erroDono.message);
  if (revogadaPelaTrocaDeSenha(data.criado_em, dono?.senha_alterada_em)) return null;
  return data;
}

async function emitirPar(admin: Admin, aut: { id: string; criado_em: string }, familia: string) {
  const acesso = gerarSegredo(PREFIXO.acesso);
  const renovacao = gerarSegredo(PREFIXO.renovacao);
  const limite = new Date(aut.criado_em).getTime() + DURACAO.renovacaoMaximaMs;
  const expRenovacao = new Date(
    Math.min(Date.now() + DURACAO.renovacaoOciosaMs, limite)
  ).toISOString();
  const { error } = await admin.from("conector_chave").insert([
    {
      chave_hash: await hashSegredo(acesso),
      autorizacao_id: aut.id,
      tipo: "acesso",
      familia,
      expira_em: daquiMs(DURACAO.acessoMs),
    },
    {
      chave_hash: await hashSegredo(renovacao),
      autorizacao_id: aut.id,
      tipo: "renovacao",
      familia,
      expira_em: expRenovacao,
    },
  ]);
  if (error) throw new Error(error.message);
  await admin.from("conector_autorizacao").update({ ultimo_uso: agoraIso() }).eq("id", aut.id);
  return {
    access_token: acesso,
    token_type: "Bearer",
    expires_in: Math.floor(DURACAO.acessoMs / 1000),
    refresh_token: renovacao,
    scope: ESCOPO,
  };
}

async function trocarCodigo(f: Record<string, string>, admin: Admin): Promise<Response> {
  const { code, redirect_uri, client_id, code_verifier } = f;
  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return jsonOAuth(erroOAuth("invalid_request", "Faltam parâmetros"), 400);
  }
  const hash = await hashSegredo(code);
  // uso único e atômico
  const { data: cod, error } = await admin
    .from("conector_codigo")
    .update({ usado_em: agoraIso() })
    .eq("codigo_hash", hash)
    .is("usado_em", null)
    .gt("expira_em", agoraIso())
    .select("autorizacao_id, cliente_id, redirect_uri, code_challenge, resource")
    .maybeSingle();
  if (error) {
    console.error("[mcp-oauth] token/code:", error.message);
    return jsonOAuth(erroOAuth("server_error"), 500);
  }
  if (!cod) {
    // código reaproveitado → provável vazamento: derruba a autorização (RFC 6749 §4.1.2)
    const { data: usado, error: erroUsado } = await admin
      .from("conector_codigo")
      .select("autorizacao_id")
      .eq("codigo_hash", hash)
      .not("usado_em", "is", null)
      .maybeSingle();
    if (erroUsado) throw new Error(erroUsado.message);
    if (usado) await revogarAutorizacao(admin, usado.autorizacao_id, "codigo_reutilizado");
    return jsonOAuth(erroOAuth("invalid_grant"), 400);
  }
  const { data: cli, error: erroCli } = await admin
    .from("conector_cliente")
    .select("id, client_id")
    .eq("id", cod.cliente_id)
    .maybeSingle();
  if (erroCli) throw new Error(erroCli.message);
  if (!cli || cli.client_id !== client_id || cod.redirect_uri !== redirect_uri) {
    return jsonOAuth(erroOAuth("invalid_grant"), 400);
  }
  if (!(await pkceS256Confere(code_verifier, cod.code_challenge)))
    return jsonOAuth(erroOAuth("invalid_grant"), 400);
  if (f.resource !== undefined && recursoCanonico(f.resource) !== cod.resource) {
    return jsonOAuth(erroOAuth("invalid_target"), 400);
  }
  const aut = await autorizacaoAtiva(admin, cod.autorizacao_id);
  if (!aut) return jsonOAuth(erroOAuth("invalid_grant"), 400);
  const par = await emitirPar(admin, aut, crypto.randomUUID());
  await admin.from("conector_cliente").update({ ultimo_uso: agoraIso() }).eq("id", cli.id);
  return jsonOAuth(par);
}

async function renovar(f: Record<string, string>, admin: Admin): Promise<Response> {
  const { refresh_token, client_id } = f;
  if (!refresh_token || !client_id)
    return jsonOAuth(erroOAuth("invalid_request", "Faltam parâmetros"), 400);
  const hash = await hashSegredo(refresh_token);
  const { data: ch, error: erroCh } = await admin
    .from("conector_chave")
    .select("chave_hash, autorizacao_id, familia, expira_em, substituida_em, revogada_em")
    .eq("chave_hash", hash)
    .eq("tipo", "renovacao")
    .maybeSingle();
  if (erroCh) throw new Error(erroCh.message);
  if (!ch) return jsonOAuth(erroOAuth("invalid_grant"), 400);
  const aut = await autorizacaoAtiva(admin, ch.autorizacao_id);
  if (!aut) return jsonOAuth(erroOAuth("invalid_grant"), 400);
  const { data: cli, error: erroCli } = await admin
    .from("conector_cliente")
    .select("client_id")
    .eq("id", aut.cliente_id)
    .maybeSingle();
  if (erroCli) throw new Error(erroCli.message);
  if (!cli || cli.client_id !== client_id) return jsonOAuth(erroOAuth("invalid_grant"), 400);
  if (f.resource !== undefined && recursoCanonico(f.resource) !== aut.resource) {
    return jsonOAuth(erroOAuth("invalid_target"), 400);
  }
  const decisao = decidirRenovacao(
    {
      expira_em: ch.expira_em,
      substituida_em: ch.substituida_em,
      revogada_em: ch.revogada_em,
      inicio_autorizacao: aut.criado_em,
    },
    new Date()
  );
  if (decisao === "reuso_revogar") {
    await revogarAutorizacao(admin, aut.id, "renovacao_reutilizada");
    return jsonOAuth(erroOAuth("invalid_grant"), 400);
  }
  if (decisao !== "ok") return jsonOAuth(erroOAuth("invalid_grant"), 400);
  const { data: marcada, error: erroMarcada } = await admin
    .from("conector_chave")
    .update({ substituida_em: agoraIso() })
    .eq("chave_hash", hash)
    .is("substituida_em", null)
    .is("revogada_em", null)
    .select("chave_hash")
    .maybeSingle();
  if (erroMarcada) throw new Error(erroMarcada.message);
  if (!marcada) return jsonOAuth(erroOAuth("invalid_grant"), 400); // outra renovação chegou antes
  return jsonOAuth(await emitirPar(admin, aut, ch.familia));
}

async function revogarToken(req: Request, admin: Admin): Promise<Response> {
  const f = lerFormUnico(await req.text());
  if (!f?.token) return jsonOAuth(erroOAuth("invalid_request"), 400);
  const hash = await hashSegredo(f.token);
  const { data: ch, error } = await admin
    .from("conector_chave")
    .select("autorizacao_id, tipo")
    .eq("chave_hash", hash)
    .maybeSingle();
  if (error) {
    // RFC 7009 §2.2.1: falha do servidor é 503, nunca 200 de falso sucesso.
    console.error("[mcp-oauth] revoke:", error.message);
    return jsonOAuth(erroOAuth("server_error"), 503);
  }
  if (ch?.tipo === "acesso") {
    const { error: e2 } = await admin
      .from("conector_chave")
      .update({ revogada_em: agoraIso() })
      .eq("chave_hash", hash)
      .is("revogada_em", null);
    if (e2) {
      console.error("[mcp-oauth] revoke:", e2.message);
      return jsonOAuth(erroOAuth("server_error"), 503);
    }
  } else if (ch) {
    await revogarAutorizacao(admin, ch.autorizacao_id, "revogado_pelo_cliente");
  }
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}

// ─── Ações da tela (sessão da SPA) ──────────────────────────────────────────

interface UsuarioTela {
  id: string;
  email: string;
  nome: string;
  senhaProvisoria: boolean;
  senhaAlteradaEm: string | null;
}

const sessaoInvalida = () => fail(MSG_SESSAO, 401, { codigo: "sessao_invalida" });

/** Limitador da tela: fora do ar → 503 (não é "muitas tentativas"). */
function recusaDoLimite(lim: Consumo): Response | null {
  if (lim.indisponivel) return fail(MSG_INDISPONIVEL, 503);
  if (!lim.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429);
  return null;
}

async function usuarioDaSessao(req: Request, admin: Admin): Promise<UsuarioTela | null> {
  const caller = await getCallerFromJWT(req); // chave opaca do conector não é JWT → null
  if (!caller) return null;
  const uc = await usuarioCustomDoCaller(
    admin,
    caller,
    "id, email, nome_completo, ativo, deleted_at, senha_provisoria, senha_alterada_em"
  );
  if (!uc || uc.ativo !== true || uc.deleted_at) return null;
  if ((caller.email ?? "").toLowerCase() !== String(uc.email).toLowerCase()) return null;
  return {
    id: uc.id,
    email: String(uc.email).toLowerCase(),
    nome: uc.nome_completo,
    senhaProvisoria: uc.senha_provisoria === true,
    senhaAlteradaEm: uc.senha_alterada_em ?? null,
  };
}

/**
 * Corrida com a troca de senha: a sessão foi conferida no início da ação; se
 * uma troca de senha a derrubou enquanto a autorização nascia (inclusive
 * depois do UPDATE em lote da revogação explícita), a credencial nova não
 * pode sair. O Auth recusa o JWT de sessão encerrada (getCallerFromJWT).
 */
async function sessaoSegueValida(req: Request): Promise<boolean> {
  return !!(await getCallerFromJWT(req));
}

/** Linha em mcp_auditoria (best-effort: falha só vai para o log). */
async function auditar(admin: Admin, linha: Obj): Promise<void> {
  try {
    const { error } = await admin.from("mcp_auditoria").insert({ resultado: "ok", ...linha });
    if (error) console.error("[mcp-oauth] auditoria:", error.message);
  } catch (e) {
    console.error("[mcp-oauth] auditoria:", (e as Error)?.message ?? String(e));
  }
}

/** Empresas em que o usuário tem vínculo ativo com Oportunidades/Lista E que podem usar o conector. */
async function empresasLiberadas(
  admin: Admin,
  email: string
): Promise<{ id: string; nome: string }[]> {
  const { data: vincs, error: erroVincs } = await admin
    .from("usuario_empresa")
    .select("empresa_id, perfil, is_owner, permissoes, ativo, deleted_at")
    .eq("usuario_email", email)
    .eq("ativo", true)
    .is("deleted_at", null);
  // Falha do banco não pode virar "nenhuma empresa liberada" (withCors → 500)
  if (erroVincs) throw new Error(erroVincs.message);
  const ids = [
    ...new Set(
      ((vincs ?? []) as Obj[])
        .filter((v) => temPermissaoServidor(v as Vinculo, "Oportunidades", "Lista"))
        .map((v) => String(v.empresa_id))
    ),
  ];
  if (!ids.length) return [];
  const [{ data: emps, error: erroEmps }, { data: assins, error: erroAssins }] = await Promise.all([
    admin
      .from("empresa")
      .select("id, nome, nome_fantasia, ativo, deleted_at, conector_claude")
      .in("id", ids),
    admin
      .from("assinatura")
      .select("empresa_id, plano_id")
      .in("empresa_id", ids)
      .in("status", ["Ativa", "Trial"])
      .is("deleted_at", null),
  ]);
  if (erroEmps) throw new Error(erroEmps.message);
  if (erroAssins) throw new Error(erroAssins.message);
  const planoIds = [...new Set(((assins ?? []) as Obj[]).map((a) => String(a.plano_id)))];
  const { data: planos, error: erroPlanos } = planoIds.length
    ? await admin.from("plano").select("id, modulos_liberados").in("id", planoIds)
    : { data: [], error: null };
  if (erroPlanos) throw new Error(erroPlanos.message);
  const modulos = new Map(
    ((planos ?? []) as Obj[]).map((p) => [String(p.id), modulosDoPlano(p.modulos_liberados)])
  );
  return ((emps ?? []) as Obj[])
    .filter((e) =>
      empresaLiberada(
        e as EmpresaConector,
        ((assins ?? []) as Obj[])
          .filter((a) => a.empresa_id === e.id)
          .map((a) => modulos.get(String(a.plano_id)) ?? {})
      )
    )
    .map((e) => ({ id: String(e.id), nome: String(e.nome_fantasia || e.nome) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function clienteDoPedido(admin: Admin, clientId: unknown, redirectUri: unknown) {
  if (typeof clientId !== "string" || !clientId) return null;
  const { data: cli, error } = await admin
    .from("conector_cliente")
    .select("id, tipo, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message); // não é "pedido inválido"
  if (!cli || !redirectConfere(cli.redirect_uris, redirectUri)) return null;
  return cli;
}

async function acaoDaTela(req: Request, admin: Admin): Promise<Response> {
  const uc = await usuarioDaSessao(req, admin);
  if (!uc) return sessaoInvalida();
  let body: Obj;
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }
  switch (String(body.acao ?? "")) {
    case "contexto":
      return await contexto(body, uc, admin);
    case "aprovar":
      return await aprovar(req, body, uc, admin);
    case "negar":
      return await negar(body, admin);
    case "listar":
      return await listar(uc, admin);
    case "revogar":
      return await revogarDaTela(req, body, uc, admin);
    case "gerar_manual":
      return await gerarManual(req, body, uc, admin);
    default:
      return fail("Ação desconhecida", 400);
  }
}

async function contexto(body: Obj, uc: UsuarioTela, admin: Admin): Promise<Response> {
  const cli = await clienteDoPedido(admin, body.client_id, body.redirect_uri);
  if (!cli) {
    return fail(
      "Pedido de autorização inválido: aplicativo ou endereço de retorno não reconhecido. Tente conectar de novo pelo Claude.",
      400
    );
  }
  return ok({
    cliente: {
      // nunca o client_name do DCR (registro aberto)
      nome: nomeDoApp("oauth", cli.tipo),
      destino: destinoDoRedirect(String(body.redirect_uri)),
    },
    usuario: { email: uc.email, nome: uc.nome },
    empresas: await empresasLiberadas(admin, uc.email),
  });
}

const MSG_SENHA_PROVISORIA = "Troque sua senha provisória antes de conectar o Claude";

async function aprovar(req: Request, body: Obj, uc: UsuarioTela, admin: Admin): Promise<Response> {
  if (uc.senhaProvisoria) return fail(MSG_SENHA_PROVISORIA, 403);
  const recusa = recusaDoLimite(
    await consumirTentativa(
      admin,
      "mcp-oauth:aprovar",
      3600,
      [{ tipo: "conta", valor: uc.id, max: 30 }],
      { falharFechado: true }
    )
  );
  if (recusa) return recusa;
  const v = validarPedidoAutorizacao(body, RECURSO);
  if (!v.ok) return fail(v.descricao, 400);
  const cli = await clienteDoPedido(admin, v.pedido.client_id, v.pedido.redirect_uri);
  if (!cli) return fail("Pedido de autorização inválido.", 400);
  const empresaId = String(body.empresa_id ?? "");
  if (!(await empresasLiberadas(admin, uc.email)).some((e) => e.id === empresaId)) {
    return fail("Escolha uma empresa liberada para o conector.", 403);
  }
  const { data: aut, error } = await admin
    .from("conector_autorizacao")
    .insert({
      empresa_id: empresaId,
      usuario_custom_id: uc.id,
      usuario_email: uc.email,
      cliente_id: cli.id,
      tipo: "oauth",
      resource: RECURSO,
      escopo: ESCOPO,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const codigo = gerarSegredo(PREFIXO.codigo);
  const { error: e2 } = await admin.from("conector_codigo").insert({
    codigo_hash: await hashSegredo(codigo),
    autorizacao_id: aut.id,
    cliente_id: cli.id,
    redirect_uri: v.pedido.redirect_uri,
    code_challenge: v.pedido.code_challenge,
    resource: RECURSO,
    expira_em: daquiMs(DURACAO.codigoMs),
  });
  if (e2) throw new Error(e2.message);
  if (!(await sessaoSegueValida(req))) {
    await revogarAutorizacao(admin, aut.id, "sessao_encerrada");
    return sessaoInvalida();
  }
  await auditar(admin, {
    empresa_id: empresaId,
    usuario_email: uc.email,
    autorizacao_id: aut.id,
    cliente: nomeDoApp("oauth", cli.tipo),
    ferramenta: "(conexao)",
    ip: ipDaRequisicao(req),
  });
  return ok({
    redirect_url: montarRedirectSucesso(v.pedido.redirect_uri, codigo, v.pedido.state, ISSUER),
  });
}

async function negar(body: Obj, admin: Admin): Promise<Response> {
  const cli = await clienteDoPedido(admin, body.client_id, body.redirect_uri);
  if (!cli) return fail("Pedido de autorização inválido.", 400);
  const state = typeof body.state === "string" && body.state ? body.state : undefined;
  return ok({
    redirect_url: montarRedirectErro(String(body.redirect_uri), "access_denied", state, ISSUER),
  });
}

/**
 * Conexões do usuário. Só as EFETIVADAS: chave manual, ou OAuth com alguma
 * chave viva (não revogada, não substituída, não expirada) — aprovação
 * abandonada (código nunca trocado) não aparece como "Conectado". Autorização
 * anterior à última troca de senha também não (revogação implícita).
 */
async function listar(uc: UsuarioTela, admin: Admin): Promise<Response> {
  const desde = new Date(Date.now() - DURACAO.renovacaoMaximaMs).toISOString();
  const { data: auts, error: erroAuts } = await admin
    .from("conector_autorizacao")
    .select("id, empresa_id, cliente_id, tipo, criado_em, ultimo_uso")
    .eq("usuario_custom_id", uc.id)
    .is("revogado_em", null)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(50);
  if (erroAuts) throw new Error(erroAuts.message);
  const candidatas = ((auts ?? []) as Obj[]).filter(
    (a) => !revogadaPelaTrocaDeSenha(String(a.criado_em), uc.senhaAlteradaEm)
  );
  const oauthIds = candidatas.filter((a) => a.tipo !== "manual").map((a) => String(a.id));
  const { data: vivas, error: erroVivas } = oauthIds.length
    ? await admin
        .from("conector_chave")
        .select("autorizacao_id")
        .in("autorizacao_id", oauthIds)
        .is("revogada_em", null)
        .is("substituida_em", null)
        .gt("expira_em", agoraIso())
    : { data: [], error: null };
  if (erroVivas) throw new Error(erroVivas.message);
  const comChaveViva = new Set(((vivas ?? []) as Obj[]).map((c) => String(c.autorizacao_id)));
  const lista = candidatas.filter((a) => a.tipo === "manual" || comChaveViva.has(String(a.id)));

  const empIds = [...new Set(lista.map((a) => String(a.empresa_id)))];
  const cliIds = [
    ...new Set(
      lista
        .map((a) => a.cliente_id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const [{ data: emps, error: erroEmps }, { data: clis, error: erroClis }] = await Promise.all([
    empIds.length
      ? admin.from("empresa").select("id, nome, nome_fantasia").in("id", empIds)
      : { data: [], error: null },
    cliIds.length
      ? admin.from("conector_cliente").select("id, tipo").in("id", cliIds)
      : { data: [], error: null },
  ]);
  if (erroEmps) throw new Error(erroEmps.message);
  if (erroClis) throw new Error(erroClis.message);
  const nomeEmp = new Map(
    ((emps ?? []) as Obj[]).map((e) => [String(e.id), String(e.nome_fantasia || e.nome)])
  );
  const tipoCli = new Map(((clis ?? []) as Obj[]).map((c) => [String(c.id), String(c.tipo)]));
  const autorizacoes = lista.map((a) => ({
    id: a.id,
    empresa: nomeEmp.get(String(a.empresa_id)) ?? "—",
    app: nomeDoApp(String(a.tipo), a.cliente_id ? tipoCli.get(String(a.cliente_id)) : null),
    criado_em: a.criado_em,
    ultimo_uso: a.ultimo_uso,
  }));
  return ok({ autorizacoes, empresas_liberadas: await empresasLiberadas(admin, uc.email) });
}

async function revogarDaTela(
  req: Request,
  body: Obj,
  uc: UsuarioTela,
  admin: Admin
): Promise<Response> {
  const id = String(body.autorizacao_id ?? "");
  if (!UUID.test(id)) return fail("Conexão não encontrada", 404);
  const { data: aut, error } = await admin
    .from("conector_autorizacao")
    .select("id, empresa_id, tipo, cliente_id")
    .eq("id", id)
    .eq("usuario_custom_id", uc.id)
    .maybeSingle();
  if (error) throw new Error(error.message); // não é "conexão não encontrada"
  if (!aut) return fail("Conexão não encontrada", 404);
  await revogarAutorizacao(admin, aut.id, "usuario");
  let tipoCliente: string | null = null;
  if (aut.cliente_id) {
    const { data: cli } = await admin
      .from("conector_cliente")
      .select("tipo")
      .eq("id", aut.cliente_id)
      .maybeSingle();
    tipoCliente = cli?.tipo ?? null; // só para o nome na auditoria
  }
  await auditar(admin, {
    empresa_id: aut.empresa_id,
    usuario_email: uc.email,
    autorizacao_id: aut.id,
    cliente: nomeDoApp(aut.tipo, tipoCliente),
    ferramenta: "(desconexao)",
    ip: ipDaRequisicao(req),
  });
  return ok({ revogada: true });
}

async function gerarManual(
  req: Request,
  body: Obj,
  uc: UsuarioTela,
  admin: Admin
): Promise<Response> {
  if (uc.senhaProvisoria) return fail(MSG_SENHA_PROVISORIA, 403);
  const recusa = recusaDoLimite(
    await consumirTentativa(
      admin,
      "mcp-oauth:manual",
      86400,
      [{ tipo: "conta", valor: uc.id, max: 10 }],
      { falharFechado: true }
    )
  );
  if (recusa) return recusa;
  const empresaId = String(body.empresa_id ?? "");
  if (!(await empresasLiberadas(admin, uc.email)).some((e) => e.id === empresaId)) {
    return fail("O conector do Claude não está liberado para esta empresa.", 403);
  }
  const { data: aut, error } = await admin
    .from("conector_autorizacao")
    .insert({
      empresa_id: empresaId,
      usuario_custom_id: uc.id,
      usuario_email: uc.email,
      cliente_id: null,
      tipo: "manual",
      resource: RECURSO,
      escopo: ESCOPO,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const chave = gerarSegredo(PREFIXO.manual);
  const expira = daquiMs(DURACAO.manualMs);
  const { error: e2 } = await admin.from("conector_chave").insert({
    chave_hash: await hashSegredo(chave),
    autorizacao_id: aut.id,
    tipo: "manual",
    familia: crypto.randomUUID(),
    expira_em: expira,
  });
  if (e2) throw new Error(e2.message);
  if (!(await sessaoSegueValida(req))) {
    await revogarAutorizacao(admin, aut.id, "sessao_encerrada");
    return sessaoInvalida();
  }
  await auditar(admin, {
    empresa_id: empresaId,
    usuario_email: uc.email,
    autorizacao_id: aut.id,
    cliente: nomeDoApp("manual", null),
    ferramenta: "(chave_manual)",
    ip: ipDaRequisicao(req),
  });
  return ok({ chave, expira_em: expira, url: RECURSO });
}
