/**
 * Credenciais do Portal do Fornecedor e links das cotações — quem gera é o SERVIDOR (Edge Function
 * `fornecedor-acesso`, Lote 2b-2 da varredura de nov/2026).
 *
 * Antes a tela gerava a senha no navegador e gravava o hash direto na tabela: quem tinha Compras podia, pela
 * API, trocar a senha e entrar no portal "como o fornecedor", sem rastro. Agora o servidor gera a senha,
 * grava só o hash, registra na auditoria quem pediu e devolve a senha UMA vez, para a mensagem.
 *
 * Como hash não é reversível, a senha em claro só existe no momento do ENVIO: cada ação de enviar troca a
 * senha (a anterior deixa de valer). Por isso NUNCA trocar ao simplesmente ABRIR uma tela.
 *
 * Todas as funções recebem o `sigo` (do `@/api/sigoClient`) e LANÇAM erro com a mensagem do servidor quando
 * a função falha (o `sigo.functions.invoke` não lança: devolve `data.success === false`).
 */

export const FUNCAO_FORNECEDOR_ACESSO = "fornecedorAcesso";

export const MENSAGEM_FALHA_SERVIDOR =
  "Não deu para falar com o servidor do portal do fornecedor. Tente de novo.";

async function chamar(sigo, acao, dados) {
  const { data } = await sigo.functions.invoke(FUNCAO_FORNECEDOR_ACESSO, { acao, ...dados });
  if (!data || typeof data !== "object" || data.success === false) {
    throw new Error(data?.error || MENSAGEM_FALHA_SERVIDOR);
  }
  return data;
}

/**
 * Senha nova do portal para o fornecedor (cria o acesso, com o e-mail do cadastro, quando não existe).
 * Devolve `{ email, senha }` com a senha em claro FRESCA para a mensagem, ou `null` quando o fornecedor não
 * tem acesso nem e-mail no cadastro para criar um (a mensagem sai sem login e senha, como antes).
 */
export async function rotacionarCredencialFornecedor(sigo, { fornecedorId }) {
  const data = await chamar(sigo, "credencial", { fornecedor_id: fornecedorId });
  const c = data.credencial;
  return c && c.email && c.senha ? { email: c.email, senha: c.senha } : null;
}

/**
 * Credenciais conhecidas dos fornecedores da cotação, no formato que as telas usam:
 * `{ [fornecedor_id]: { email, senha: null } }`, só para quem tem acesso ATIVO ao portal. A senha é sempre
 * `null` aqui: o banco só tem o hash, e a senha nova só nasce ao ENVIAR (rotacionarCredencialFornecedor).
 */
export async function credenciaisDaCotacao(sigo, cotacaoId) {
  const data = await chamar(sigo, "status", { cotacao_id: cotacaoId });
  const creds = {};
  for (const a of Array.isArray(data.acessos) ? data.acessos : []) {
    if (a && a.ativo === true && a.email) creds[a.fornecedor_id] = { email: a.email, senha: null };
  }
  return creds;
}

/**
 * Links da cotação montados pelo servidor: `{ porFornecedor: { [fornecedor_id]: link },
 * porParticipacao: { [cotacao_fornecedor_id]: link } }`. Participação sem link válido fica de fora.
 */
export async function linksDaCotacao(sigo, cotacaoId) {
  const data = await chamar(sigo, "links", { cotacao_id: cotacaoId });
  const porFornecedor = {};
  const porParticipacao = {};
  for (const l of Array.isArray(data.links) ? data.links : []) {
    if (!l || !l.link) continue;
    porFornecedor[l.fornecedor_id] = l.link;
    porParticipacao[l.cotacao_fornecedor_id] = l.link;
  }
  return { porFornecedor, porParticipacao };
}

/** Troca o link de um fornecedor da cotação (o anterior deixa de valer) e devolve o novo. */
export async function reemitirLinkCotacao(sigo, cotacaoFornecedorId) {
  const data = await chamar(sigo, "reemitir_link", {
    cotacao_fornecedor_id: cotacaoFornecedorId,
  });
  if (!data.link) throw new Error(MENSAGEM_FALHA_SERVIDOR);
  return data.link;
}

/**
 * A credencial para pôr na mensagem de ENVIO: a que a tela já tem com senha (gerada nesta abertura) ou uma
 * senha nova pelo servidor. `soSeTemAcesso`: só troca quando o fornecedor já tem acesso (o painel da
 * cotação não cria acesso novo). Devolve `null` quando não há credencial para mostrar; lança se o servidor
 * falhar (a tela avisa e não abre a mensagem).
 */
export async function credencialParaEnvio(sigo, { atual, fornecedorId, soSeTemAcesso = false }) {
  if (atual?.senha) return atual;
  if (soSeTemAcesso && !atual) return null;
  return rotacionarCredencialFornecedor(sigo, { fornecedorId });
}
