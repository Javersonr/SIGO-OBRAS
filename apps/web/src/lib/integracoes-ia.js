/**
 * integracoes-ia — regras puras do card "Google Gemini (IA padrão)" do SaaS
 * Admin (components/saas/IntegracoesTab.jsx). Testado com vitest em node.
 *
 * As listas repetem MODELOS_GEMINI_PADRAO / MODELOS_GEMINI_FORTE do servidor
 * (supabase/functions/_shared/gemini-regras.ts): quem valida é a função
 * saas-config; aqui é só o que aparece no seletor.
 */

export const GEMINI_MODELO_PADRAO = "gemini-3.5-flash-lite";
export const GEMINI_MODELO_FORTE = "gemini-3.8-flash";

export const OPCOES_GEMINI_PADRAO = [
  { valor: "gemini-3.5-flash-lite", rotulo: "gemini-3.5-flash-lite (recomendado)" },
  { valor: "gemini-3.1-flash-lite", rotulo: "gemini-3.1-flash-lite (mais barato)" },
  { valor: "gemini-3.8-flash", rotulo: "gemini-3.8-flash (mais preciso)" },
];

export const OPCOES_GEMINI_FORTE = [
  { valor: "gemini-3.8-flash", rotulo: "gemini-3.8-flash (recomendado)" },
  { valor: "gemini-3.1-pro-preview", rotulo: "gemini-3.1-pro-preview (mais caro)" },
];

/**
 * Corpo do "Salvar" do card do Gemini, só com o que mudou em relação ao
 * status do servidor (sem status, compara com os padrões). null = nada a salvar.
 */
export function payloadGemini({ novaChave = "", modelo, modeloForte, status } = {}) {
  const payload = { acao: "definir" };
  const chave = String(novaChave ?? "").trim();
  if (chave) payload.chave_gemini = chave;
  if (modelo && modelo !== (status?.modelo || GEMINI_MODELO_PADRAO)) {
    payload.gemini_modelo = modelo;
  }
  if (modeloForte && modeloForte !== (status?.modelo_forte || GEMINI_MODELO_FORTE)) {
    payload.gemini_modelo_forte = modeloForte;
  }
  return Object.keys(payload).length > 1 ? payload : null;
}

/** resposta do saasConfig { acao:"testar_gemini" } → { ok, mensagem } para a tela */
export function resultadoTesteGemini(data) {
  if (!data || data.success === false) {
    return { ok: false, mensagem: data?.error || "Não foi possível testar a chave" };
  }
  const t = data.gemini_teste;
  if (!t || typeof t.mensagem !== "string") {
    return { ok: false, mensagem: "Resposta inesperada do servidor" };
  }
  return { ok: t.ok === true, mensagem: t.mensagem };
}
