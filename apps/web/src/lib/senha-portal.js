/**
 * Credenciais do portal do fornecedor — a senha NUNCA fica em texto puro no banco.
 *
 * O banco guarda SHA-256 hex (o Edge Function portal-fornecedor-login aceita
 * bcrypt/SHA-256 e regrava como bcrypt no primeiro login). Como hash não é
 * reversível, a senha em claro só existe no momento do ENVIO: cada ação de
 * enviar rotaciona a senha (gera nova, grava o hash, mostra a nova na mensagem).
 * Por isso NUNCA rotacionar ao simplesmente ABRIR uma tela — invalidaria a
 * senha que o fornecedor já recebeu.
 */

const SEM_CONFUSOS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function gerarSenhaPortal() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SEM_CONFUSOS[b % SEM_CONFUSOS.length]).join("");
}

export async function sha256Hex(texto) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** bcrypt ($2...) ou SHA-256 hex — ou seja, NÃO é texto puro legado. */
export function senhaEstaHasheada(s) {
  return /^\$2/.test(s || "") || /^[a-f0-9]{64}$/i.test(s || "");
}

/**
 * Rotaciona (ou cria) o acesso do fornecedor e devolve { email, senha } com a
 * senha em claro FRESCA para incluir na mensagem. Retorna null se não há
 * acesso nem e-mail para criar um.
 */
export async function rotacionarCredencialFornecedor(
  sigo,
  { empresaId, fornecedorId, fornecedorNome, fornecedorEmail }
) {
  const acessos = await sigo.entities.FornecedorAcesso.filter({
    fornecedor_id: fornecedorId,
    empresa_id: empresaId,
    ativo: true,
  });
  const senha = gerarSenhaPortal();
  const hash = await sha256Hex(senha);
  if (acessos.length > 0) {
    await sigo.entities.FornecedorAcesso.update(acessos[0].id, { senha_acesso: hash });
    return { email: acessos[0].fornecedor_email, senha };
  }
  if (!fornecedorEmail) return null;
  await sigo.entities.FornecedorAcesso.create({
    empresa_id: empresaId,
    fornecedor_id: fornecedorId,
    fornecedor_nome: fornecedorNome || "",
    fornecedor_email: fornecedorEmail,
    senha_acesso: hash,
    ativo: true,
  });
  return { email: fornecedorEmail, senha };
}
