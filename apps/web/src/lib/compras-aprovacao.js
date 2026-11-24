/**
 * Quem pode aprovar a própria solicitação de compra (regra do dono, 23/11): "o solicitante nunca aprova a
 * própria compra, a não ser que seja administrador". Espelho, só para a tela, da função do banco
 * `usuario_eh_administrador()` (migração 0178): administrador = super admin, perfil "Admin" ou perfil
 * "Admin Holding", com o vínculo ativo (ativo nulo conta como ativo, como no banco). O dono da conta
 * (`is_owner`) com outro perfil NÃO conta (dúvida em aberto do dono; o banco faz igual).
 *
 * A proteção de verdade é o banco (as RPCs de aprovação recusam); aqui só se decide o que a tela mostra.
 */

export const PERFIS_ADMINISTRADOR = ["Admin", "Admin Holding"];

export function ehAdministrador({ isSuperAdmin, vinculo }) {
  if (isSuperAdmin === true) return true;
  if (!vinculo || vinculo.ativo === false || vinculo.deleted_at) return false;
  return PERFIS_ADMINISTRADOR.includes(vinculo.perfil);
}

/**
 * O usuário é quem pediu a compra? Mesmo critério que a tela já usava: o id gravado em `solicitante_id` ou o
 * nome do solicitante igual ao do usuário (sem diferenciar maiúsculas).
 */
export function ehSolicitante(solicitacao, user) {
  if (!solicitacao || !user) return false;
  if (solicitacao.solicitante_id && solicitacao.solicitante_id === user.id) return true;
  const nome = String(solicitacao.solicitante_nome || "")
    .trim()
    .toLowerCase();
  return (
    !!nome &&
    nome ===
      String(user.full_name || "")
        .trim()
        .toLowerCase()
  );
}

/** Esconder Aprovar/Reprovar: é o solicitante e não é administrador. */
export function solicitanteNaoPodeDecidir({ solicitacao, user, isSuperAdmin, vinculo }) {
  return ehSolicitante(solicitacao, user) && !ehAdministrador({ isSuperAdmin, vinculo });
}
