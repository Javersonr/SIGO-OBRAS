/**
 * login-custom — autentica usuário admin/staff via email + senha
 *
 * Fluxo:
 *   1. Recebe { email, senha, empresa_id? }
 *   2. Busca usuario_custom WHERE lower(email) = lower(?) AND ativo = true AND deleted_at IS NULL
 *   3. Valida senha (bcrypt ou SHA-256 legado com rehash transparente)
 *   4. Resolve vínculos com empresa via usuario_empresa
 *      - Se 1 empresa apenas → retorna usuario completo
 *      - Se múltiplas e empresa_id não foi passado → retorna lista para o
 *        frontend escolher
 *      - Se empresa_id foi passado → valida e retorna usuario com essa empresa
 *   5. Retorna { success, usuario, multiplas_empresas?, empresas?, usuario_base? }
 *
 * Compatível com a forma de resposta esperada pelo frontend atual
 * (sessionStorage 'custom_auth'). JWT real será adicionado na Phase 4.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";

interface LoginBody {
  email?: string;
  senha?: string;
  empresa_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let body: LoginBody;
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const senha = body.senha ?? "";
  const empresaIdEscolhida = body.empresa_id;

  if (!email || !senha) return fail("Email e senha são obrigatórios", 400);

  const supabase = createAdminClient();

  // 1. Buscar usuário
  const { data: usuario, error: userErr } = await supabase
    .from("usuario_custom")
    .select(
      "id, email, senha_hash, senha_provisoria, nome_completo, empresa_id, is_super_admin, ativo, deleted_at"
    )
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (userErr) {
    console.error("Erro consultando usuario_custom:", userErr);
    return fail("Erro interno", 500);
  }

  if (!usuario || !usuario.ativo) {
    // Mensagem genérica pra não vazar se o email existe
    return fail("Credenciais inválidas", 401);
  }

  // 2. Validar senha
  const { ok: senhaOk, needsRehash } = await verifyPassword(senha, usuario.senha_hash);
  if (!senhaOk) return fail("Credenciais inválidas", 401);

  // Rehash transparente: se era SHA-256 legado, regrava como bcrypt
  // E desliga senha_provisoria — user já provou que sabe a senha original,
  // não é "provisória" no sentido de "admin escolheu pra ele trocar".
  if (needsRehash) {
    const novoHash = await hashPassword(senha);
    await supabase
      .from("usuario_custom")
      .update({ senha_hash: novoHash, senha_provisoria: false })
      .eq("id", usuario.id);
    // Atualiza o objeto local pro response não enviar must_change_password=true
    usuario.senha_provisoria = false;
  }

  // 3. Resolver vínculos com empresas via usuario_empresa
  const { data: vinculos, error: vincErr } = await supabase
    .from("usuario_empresa")
    .select("id, empresa_id, grupo_id, perfil, is_owner, nome_completo, ativo, deleted_at")
    .eq("usuario_email", email)
    .is("deleted_at", null)
    .eq("ativo", true);

  if (vincErr) {
    console.error("Erro consultando usuario_empresa:", vincErr);
    return fail("Erro interno", 500);
  }

  // Super admin sem vínculo: cria sessão na empresa_id do usuario_custom direto
  if ((!vinculos || vinculos.length === 0) && usuario.is_super_admin) {
    return ok({
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome_completo: usuario.nome_completo,
        empresa_id: usuario.empresa_id,
        perfil: "Admin",
        is_super_admin: true,
        must_change_password: usuario.senha_provisoria,
      },
    });
  }

  if (!vinculos || vinculos.length === 0) {
    return fail("Usuário sem vínculo ativo em nenhuma empresa", 403);
  }

  // 4. Carrega dados das empresas vinculadas
  const empresaIds = vinculos.map((v) => v.empresa_id);
  const { data: empresas } = await supabase
    .from("empresa")
    .select(
      "id, nome, nome_fantasia, razao_social, cnpj, logo_url, tema_cores, is_holding, grupo_id, ativo"
    )
    .in("id", empresaIds)
    .eq("ativo", true);

  const empresasAtivas = (empresas ?? []).filter((e) => e.ativo);

  if (empresasAtivas.length === 0) {
    return fail("Nenhuma empresa ativa vinculada ao usuário", 403);
  }

  // 5. Caso 1: empresa_id veio na chamada — valida e retorna
  if (empresaIdEscolhida) {
    const empresa = empresasAtivas.find((e) => e.id === empresaIdEscolhida);
    const vinc = vinculos.find((v) => v.empresa_id === empresaIdEscolhida);
    if (!empresa || !vinc) {
      return fail("Empresa escolhida não está vinculada ao usuário", 403);
    }
    return ok({
      usuario: buildUsuarioResponse(usuario, vinc, empresa),
    });
  }

  // 6. Caso 2: 1 empresa só — retorna direto
  if (empresasAtivas.length === 1) {
    const empresa = empresasAtivas[0];
    const vinc = vinculos.find((v) => v.empresa_id === empresa.id)!;
    return ok({
      usuario: buildUsuarioResponse(usuario, vinc, empresa),
    });
  }

  // 7. Caso 3: múltiplas empresas — devolve lista pro frontend escolher
  const gruposIds = [...new Set(vinculos.map((v) => v.grupo_id).filter(Boolean))];
  let grupos: unknown[] = [];
  if (gruposIds.length > 0) {
    const { data: gruposData } = await supabase
      .from("grupo_empresarial")
      .select("id, nome")
      .in("id", gruposIds);
    grupos = gruposData ?? [];
  }

  return ok({
    multiplas_empresas: true,
    empresas: empresasAtivas.map((e) => ({
      ...e,
      perfil: vinculos.find((v) => v.empresa_id === e.id)?.perfil ?? "Operador",
    })),
    grupos,
    usuario_base: {
      id: usuario.id,
      email: usuario.email,
      nome_completo: usuario.nome_completo,
      is_super_admin: usuario.is_super_admin,
      must_change_password: usuario.senha_provisoria,
    },
  });
});

function buildUsuarioResponse(
  // deno-lint-ignore no-explicit-any
  usuario: any,
  // deno-lint-ignore no-explicit-any
  vinculo: any,
  // deno-lint-ignore no-explicit-any
  empresa: any
) {
  return {
    id: usuario.id,
    email: usuario.email,
    nome_completo: usuario.nome_completo,
    empresa_id: empresa.id,
    empresa_nome: empresa.nome,
    empresa: empresa,
    perfil: vinculo.perfil,
    is_owner: vinculo.is_owner,
    is_super_admin: usuario.is_super_admin,
    grupo_id: vinculo.grupo_id,
    must_change_password: usuario.senha_provisoria,
  };
}
