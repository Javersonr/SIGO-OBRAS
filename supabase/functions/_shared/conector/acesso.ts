/**
 * Quem pode usar o conector do Claude e com quais permissões. Puro.
 *
 * temPermissaoServidor espelha o temPermissao do apps/web/src/Layout.jsx
 * (Admin/owner → tudo; senão permissoes[modulo][aba][funcao]). Só deve ser
 * chamado DEPOIS de avaliarAcesso — que confere usuário e vínculo ativos
 * antes de qualquer atalho de Admin (um Admin desativado não passa).
 */

export interface Vinculo {
  perfil?: string | null;
  is_owner?: boolean | null;
  ativo?: boolean | null;
  deleted_at?: string | null;
  permissoes?: unknown;
}

function objetoJson(v: unknown): Record<string, unknown> {
  let x = v;
  for (let i = 0; i < 2 && typeof x === "string"; i++) {
    try {
      x = JSON.parse(x);
    } catch {
      return {};
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
}

/** permissoes vem como objeto, jsonb-string ou null (usuario_empresa). */
export function lerPermissoes(v: unknown): Record<string, Record<string, unknown>> {
  return objetoJson(v) as Record<string, Record<string, unknown>>;
}

export function temPermissaoServidor(
  v: Vinculo,
  modulo: string,
  aba: string | null = null,
  funcao: string | null = null
): boolean {
  if (v.perfil === "Admin" || v.is_owner === true) return true;
  const moduloPerm = lerPermissoes(v.permissoes)[modulo];
  if (!moduloPerm || typeof moduloPerm !== "object") return false;
  if (!aba && !funcao) {
    return Object.values(moduloPerm).some(
      (abaPerm) =>
        typeof abaPerm === "object" &&
        abaPerm !== null &&
        Object.values(abaPerm as Record<string, unknown>).some((x) => x === true)
    );
  }
  const abaPerm = aba ? (moduloPerm as Record<string, unknown>)[aba] : undefined;
  if (aba && !funcao) {
    if (typeof abaPerm === "boolean") return abaPerm;
    if (typeof abaPerm === "object" && abaPerm !== null) {
      return Object.values(abaPerm as Record<string, unknown>).some((x) => x === true);
    }
    return false;
  }
  if (!abaPerm || typeof abaPerm !== "object") return false;
  return (abaPerm as Record<string, unknown>)[funcao as string] === true;
}

/** plano.modulos_liberados (objeto ou jsonb-string) → { modulo: boolean }. */
export function modulosDoPlano(v: unknown): Record<string, boolean> {
  return Object.fromEntries(Object.entries(objetoJson(v)).map(([k, b]) => [k, b === true]));
}

export interface EmpresaConector {
  ativo?: boolean | null;
  deleted_at?: string | null;
  conector_claude?: boolean | null;
}

function empresaComConector(e: EmpresaConector | null): boolean {
  return !!e && e.conector_claude === true && e.ativo !== false && !e.deleted_at;
}

/** Empresa pode usar o conector: liberada pelo SaaS + Oportunidades no plano (assinatura Ativa/Trial). */
export function empresaLiberada(
  e: EmpresaConector | null,
  modulosDosPlanos: Record<string, boolean>[]
): boolean {
  return empresaComConector(e) && modulosDosPlanos.some((m) => m.Oportunidades === true);
}

export type Negacao =
  | "chave_invalida"
  | "usuario_inativo"
  | "sem_vinculo"
  | "empresa_sem_conector"
  | "sem_modulo";

export const MENSAGEM_NEGACAO: Record<Negacao, string> = {
  chave_invalida: "Chave do conector inválida, expirada ou revogada. Conecte de novo pelo SIGO.",
  usuario_inativo: "Seu usuário no SIGO está desativado.",
  sem_vinculo: "Você não tem mais acesso a esta empresa no SIGO.",
  empresa_sem_conector: "O conector do Claude não está liberado para esta empresa.",
  sem_modulo: "A assinatura desta empresa não inclui o módulo Oportunidades.",
};

/**
 * Revogação IMPLÍCITA pela troca de senha (migração 0124): autorização criada
 * antes de usuario_custom.senha_alterada_em conta como revogada, mesmo que a
 * revogação explícita (revogarConectorDoUsuario) tenha falhado. Sem data de
 * troca (coluna nula) ou sem data de criação, não revoga.
 */
export function revogadaPelaTrocaDeSenha(
  criadoEm: string | null | undefined,
  senhaAlteradaEm: string | null | undefined
): boolean {
  if (!criadoEm || !senhaAlteradaEm) return false;
  return new Date(criadoEm).getTime() < new Date(senhaAlteradaEm).getTime();
}

export interface EntradaAcesso {
  chave: { expira_em: string; revogada_em: string | null } | null;
  autorizacao: {
    usuario_email: string;
    revogado_em: string | null;
    criado_em?: string;
  } | null;
  usuario: {
    email: string;
    ativo: boolean | null;
    deleted_at: string | null;
    senha_alterada_em?: string | null;
  } | null;
  vinculo: Vinculo | null;
  empresa: EmpresaConector | null;
  modulosDosPlanos: Record<string, boolean>[];
}

export function avaliarAcesso(
  e: EntradaAcesso,
  agora: Date = new Date()
): { ok: true } | { ok: false; motivo: Negacao } {
  const nega = (motivo: Negacao) => ({ ok: false as const, motivo });
  if (
    !e.chave ||
    e.chave.revogada_em ||
    new Date(e.chave.expira_em).getTime() <= agora.getTime() ||
    !e.autorizacao ||
    e.autorizacao.revogado_em ||
    revogadaPelaTrocaDeSenha(e.autorizacao.criado_em, e.usuario?.senha_alterada_em)
  ) {
    return nega("chave_invalida");
  }
  if (
    !e.usuario ||
    e.usuario.ativo !== true ||
    e.usuario.deleted_at ||
    String(e.usuario.email).toLowerCase() !== String(e.autorizacao.usuario_email).toLowerCase()
  ) {
    return nega("usuario_inativo");
  }
  if (!e.vinculo || e.vinculo.ativo === false || e.vinculo.deleted_at) return nega("sem_vinculo");
  if (!empresaComConector(e.empresa)) return nega("empresa_sem_conector");
  if (!e.modulosDosPlanos.some((m) => m.Oportunidades === true)) return nega("sem_modulo");
  return { ok: true };
}
