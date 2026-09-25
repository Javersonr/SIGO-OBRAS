/**
 * auth-bridge — ponte entre o login custom (usuario_custom) e o Supabase Auth.
 *
 * Por quê: o projeto usa chaves assimétricas (JWKS), então só o Supabase assina
 * JWT válido. Em vez de assinar token na mão, garantimos um auth.users espelho
 * (com a MESMA senha que o usuário acabou de digitar) e geramos a sessão real
 * via signInWithPassword. O JWT resultante carrega app_metadata.empresa_id, que
 * a RLS (current_empresa_id em 0014) lê. Migração de senha transparente.
 *
 * Tudo aqui é "best-effort": o chamador deve envolver em try/catch e, se falhar,
 * seguir o login como antes (sem sessão) — assim a Etapa 1 não quebra nada.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// deno-lint-ignore no-explicit-any
type Admin = any;

const getUrl = () => Deno.env.get("SUPABASE_URL") ?? "";
const getAnon = () => Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/** Procura o id do auth.users pelo email (listUsers — sem filtro nativo). */
export async function findAuthUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const alvo = (email || "").toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users) break;
    const u = data.users.find((x: { email?: string }) => (x.email || "").toLowerCase() === alvo);
    if (u) return u.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

/**
 * Garante o auth.users espelho com a senha atual + app_metadata. Retorna o id.
 * app_metadata NÃO é editável pelo usuário (seguro p/ guardar empresa_id/perfil).
 *
 * Sem o auth_user_id salvo, reaproveita a conta que já existir com o e-mail —
 * mas só depois de derrubar as sessões dela (adotarContaPorEmail), porque ela
 * pode ter vindo de um cadastro público no Auth feito por outra pessoa.
 */
export async function ensureAuthUser(
  admin: Admin,
  opts: {
    email: string;
    senha: string;
    authUserId?: string | null;
    appMetadata: Record<string, unknown>;
  }
): Promise<string> {
  const { email, senha, appMetadata } = opts;
  let id = opts.authUserId || null;

  if (!id) {
    id = await findAuthUserIdByEmail(admin, email);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        app_metadata: appMetadata,
      });
      if (!error) return data.user.id;
      // corrida: pode ter sido criado entre a busca e o create
      id = await findAuthUserIdByEmail(admin, email);
      if (!id) throw error;
    }
    await adotarContaPorEmail(admin, id, email, senha);
  }

  const { error } = await admin.auth.admin.updateUserById(id, {
    password: senha,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error) throw error;
  return id;
}

/**
 * Conta do Auth achada pelo e-mail, ainda sem vínculo com usuario_custom. Quem a
 * criou (ex.: signup público com o e-mail de um usuário SIGO) pode ter sessão
 * aberta nela, e o refresh token passaria a sair com o empresa_id que a ponte
 * vai gravar. Então: troca a senha SEM app_metadata, abre uma sessão com ela e
 * faz logout global (derruba todas as sessões e refresh tokens). Qualquer falha
 * lança antes do app_metadata ser gravado — o próximo login tenta de novo.
 */
async function adotarContaPorEmail(admin: Admin, id: string, email: string, senha: string) {
  const { error: errSenha } = await admin.auth.admin.updateUserById(id, {
    password: senha,
    email_confirm: true,
  });
  if (errSenha) throw errSenha;
  const sessao = await emitirSessao(email, senha);
  const { error: errLogout } = await admin.auth.admin.signOut(sessao.access_token, "global");
  if (errLogout) throw errLogout;
}

/** Gera a sessão real (tokens) via signInWithPassword (cliente anon). */
export async function emitirSessao(email: string, senha: string) {
  const anon = createClient(getUrl(), getAnon(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data.session; // { access_token, refresh_token, expires_at, ... }
}

/**
 * Emite uma sessão SEM a senha (usado na troca de empresa, onde o usuário não
 * redigita). Gera um magic link admin-side (não envia e-mail) e troca o
 * hashed_token por uma sessão via verifyOtp. O access_token sai já com o
 * app_metadata ATUAL (ou seja, depois do update de empresa_id).
 */
export async function emitirSessaoSemSenha(admin: Admin, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const hashed = data?.properties?.hashed_token;
  if (!hashed) throw new Error("generateLink não retornou hashed_token");
  const anon = createClient(getUrl(), getAnon(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: vd, error: ve } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (ve) throw ve;
  return vd.session;
}

/**
 * Atualiza só o app_metadata (empresa_id/perfil/is_super_admin) do auth.users —
 * sem mexer na senha. Usado na troca de empresa. Exige o id do auth user (o do
 * token do chamador): nunca procura a conta pelo e-mail, senão daria empresa_id
 * a uma conta do Auth que a ponte não criou.
 */
export async function atualizarAppMetadataEmpresa(
  admin: Admin,
  opts: {
    authUserId: string;
    empresa_id: string;
    perfil: string;
    is_super_admin: boolean;
  }
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(opts.authUserId, {
    app_metadata: {
      empresa_id: opts.empresa_id,
      perfil: opts.perfil,
      is_super_admin: !!opts.is_super_admin,
    },
  });
  if (error) throw error;
}

/**
 * Reflete uma nova senha no auth.users (best-effort). Se o espelho ainda não
 * existir, não faz nada — o próximo login pela ponte cria/atualiza com a senha
 * nova de qualquer forma (auto-cura). Não altera app_metadata.
 */
export async function atualizarSenhaAuth(
  admin: Admin,
  opts: { email: string; senha: string; authUserId?: string | null }
): Promise<void> {
  const id = opts.authUserId || (await findAuthUserIdByEmail(admin, opts.email));
  if (!id) return;
  const { error } = await admin.auth.admin.updateUserById(id, { password: opts.senha });
  if (error) throw error;
}

/**
 * Fluxo completo: garante o usuário no Auth + emite a sessão. Persiste o
 * auth_user_id de volta em usuario_custom se ainda não estava salvo.
 * Retorna a sessão (ou lança — o chamador trata como best-effort).
 */
export async function montarSessao(
  admin: Admin,
  opts: {
    email: string;
    senha: string;
    usuarioCustomId: string;
    authUserId?: string | null;
    empresa_id: string;
    perfil: string;
    is_super_admin: boolean;
  }
) {
  const appMetadata = {
    empresa_id: opts.empresa_id,
    perfil: opts.perfil,
    is_super_admin: !!opts.is_super_admin,
  };
  const authUserId = await ensureAuthUser(admin, {
    email: opts.email,
    senha: opts.senha,
    authUserId: opts.authUserId,
    appMetadata,
  });
  if (authUserId && authUserId !== opts.authUserId) {
    await admin
      .from("usuario_custom")
      .update({ auth_user_id: authUserId })
      .eq("id", opts.usuarioCustomId);
  }
  return await emitirSessao(opts.email, opts.senha);
}
