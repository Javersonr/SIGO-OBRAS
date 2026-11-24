/**
 * Portal do Fornecedor na tela de cotação: acesso, links e ENVIO da senha — quem faz é o SERVIDOR (Edge
 * Function `fornecedor-acesso`, Lote 2b-2 da varredura de nov/2026).
 *
 * Decisão do dono (24/11): a senha do fornecedor NÃO passa mais pela tela. O servidor gera a senha e a envia
 * direto ao telefone do cadastro pelo WhatsApp do SIGO; a tela nunca a vê. O link da cotação continua saindo
 * pelo WhatsApp do próprio comprador (wa.me), com uma linha dizendo onde está o login.
 *
 * Quando a senha é enviada:
 *   - AUTOMATICAMENTE, só para quem ainda não tem acesso (`tem_acesso === false`), na hora do convite;
 *   - SOB PEDIDO, pelo botão "Enviar nova senha" do Painel de Status;
 *   - lembretes e reenvios para quem já tem acesso NÃO trocam a senha.
 * Falha no envio da senha nunca impede o convite: o wa.me abre com o link e a tela explica o motivo.
 *
 * Todas as funções recebem o `sigo` (do `@/api/sigoClient`). `sigo.functions.invoke` não lança: devolve
 * `data.success === false`.
 */

export const FUNCAO_FORNECEDOR_ACESSO = "fornecedorAcesso";

export const MENSAGEM_FALHA_SERVIDOR =
  "Não deu para falar com o servidor do portal do fornecedor. Tente de novo.";

/** Texto para o fornecedor sem e-mail (o mesmo do servidor no motivo SEM_EMAIL). */
export const MENSAGEM_FORNECEDOR_SEM_EMAIL =
  "Este fornecedor não tem e-mail no cadastro: a mensagem vai sem login e senha do portal.";

export const MENSAGEM_ENVIAR_DEPOIS = "Dá para enviar a senha depois pelo Painel de Status.";

/** O que a tela diz para cada motivo de a senha não ter sido enviada (linguagem simples). */
export const TEXTO_DO_MOTIVO = {
  SEM_EMAIL: "o fornecedor não tem e-mail no cadastro (o e-mail é o login do portal)",
  SEM_TELEFONE: "o fornecedor não tem telefone válido no cadastro (DDD + número)",
  LIMITE: "o limite de mensagens automáticas por hora foi atingido; aguarde um pouco",
  CANAL_INDISPONIVEL: "o WhatsApp do SIGO está fora do ar no momento",
  SEM_PERMISSAO: "você não tem permissão para enviar a senha (função Enviar da aba Cotações)",
  SEM_RASTRO: "não deu para registrar o envio na auditoria",
  FALHA_NO_ENVIO: "o WhatsApp do SIGO não aceitou a mensagem",
  FALHA_AO_GRAVAR:
    "a mensagem com a senha saiu, mas a senha não foi gravada e pode não valer; envie uma nova",
};

async function chamar(sigo, acao, dados) {
  const { data } = await sigo.functions.invoke(FUNCAO_FORNECEDOR_ACESSO, { acao, ...dados });
  if (!data || typeof data !== "object" || data.success === false) {
    const erro = new Error(data?.error || MENSAGEM_FALHA_SERVIDOR);
    if (data?.codigo) erro.codigo = data.codigo;
    throw erro;
  }
  return data;
}

/**
 * Situação de cada fornecedor da cotação no portal:
 * `{ [fornecedor_id]: { tem_acesso, ativo, tem_email, tem_telefone, email } }`. Nunca senha nem telefone.
 */
export async function acessosDaCotacao(sigo, cotacaoId) {
  const data = await chamar(sigo, "status", { cotacao_id: cotacaoId });
  const acessos = {};
  for (const a of Array.isArray(data.acessos) ? data.acessos : []) {
    if (!a || !a.fornecedor_id) continue;
    acessos[a.fornecedor_id] = {
      tem_acesso: a.tem_acesso === true,
      ativo: a.ativo === true,
      tem_email: a.tem_email === true,
      tem_telefone: a.tem_telefone === true,
      email: a.email || null,
    };
  }
  return acessos;
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
 * Pede ao servidor que envie senha nova ao fornecedor pelo WhatsApp do SIGO. NUNCA lança e nunca devolve a
 * senha: `{ enviado, motivo, mensagem, destino, login }` (destino já mascarado, ex. 5511*****0000).
 */
export async function enviarSenhaFornecedor(sigo, fornecedorId) {
  let data;
  try {
    ({ data } = await sigo.functions.invoke(FUNCAO_FORNECEDOR_ACESSO, {
      acao: "enviar_senha",
      fornecedor_id: fornecedorId,
    }));
  } catch (e) {
    return { enviado: false, motivo: "ERRO", mensagem: e?.message || MENSAGEM_FALHA_SERVIDOR };
  }
  if (data && data.success !== false && data.enviado === true) {
    return {
      enviado: true,
      motivo: null,
      mensagem: null,
      destino: data.destino || null,
      login: data.login || null,
    };
  }
  return {
    enviado: false,
    motivo: data?.motivo || data?.codigo || "ERRO",
    mensagem: data?.mensagem || data?.error || MENSAGEM_FALHA_SERVIDOR,
    destino: null,
    login: null,
  };
}

/** Frase simples para o motivo (sem código técnico). */
export function textoDoMotivo(resultado) {
  return TEXTO_DO_MOTIVO[resultado?.motivo] || resultado?.mensagem || MENSAGEM_FALHA_SERVIDOR;
}

/**
 * A linha sobre login e senha no convite que o COMPRADOR envia (wa.me). Nunca leva a senha.
 *   "enviada"  → a senha acabou de sair pelo número do SIGO;
 *   "ja_tinha" → o fornecedor já tinha acesso;
 *   qualquer outra coisa (inclusive falha) → nenhuma linha.
 */
export const LINHA_SENHA_ENVIADA =
  "Seu login e senha do portal chegam em outra mensagem, enviada pelo número do SIGO Obras.";
export const LINHA_JA_TEM_ACESSO =
  "Para consultar seu histórico, use o login e a senha que você já recebeu.";

export function linhaSobreSenha(situacao) {
  if (situacao === "enviada") return LINHA_SENHA_ENVIADA;
  if (situacao === "ja_tinha") return LINHA_JA_TEM_ACESSO;
  return "";
}

/** Situação para mostrar/copiar o convite sem disparar envio: senha enviada agora, acesso que já existia, nada. */
export function situacaoAtual(acesso, enviadaAgora) {
  if (enviadaAgora) return "enviada";
  if (acesso?.ativo) return "ja_tinha";
  return null;
}

/** Texto da janela do WhatsApp aberta enquanto o servidor envia a senha. */
export const TEXTO_PREPARANDO = "Preparando a mensagem...";

/** O convite vai precisar esperar o envio da senha? (fornecedor ainda sem acesso e senha não enviada agora) */
export function precisaEnviarSenhaAntes(acesso, enviadaAgora) {
  return !enviadaAgora && !!acesso && acesso.tem_acesso === false;
}

function mostrarEspera(janela) {
  try {
    janela.document.title = "WhatsApp";
    janela.document.body.innerHTML = `<p style="font-family:sans-serif;padding:24px">${TEXTO_PREPARANDO}</p>`;
  } catch {
    /* janela sem document acessível: segue sem o texto */
  }
}

/**
 * Abre o convite do WhatsApp sem cair no bloqueio de pop-up (2ª revisão do 2b-2). O navegador só deixa abrir
 * janela logo depois do clique; o envio da senha pode levar até ~12 s. Por isso, quando há envio de senha:
 *   1. abre a janela NA HORA do clique (antes de qualquer espera), mostrando "Preparando a mensagem...";
 *   2. espera o envio da senha (`preparar`, que nunca impede o convite: falha = situação null);
 *   3. leva a janela para o endereço do wa.me (`montarUrl(situacao)`).
 * Sem envio de senha, abre o wa.me direto, como antes. Se o navegador não abrir a janela (retorno nulo) ou ela
 * tiver sido fechada, devolve `aberta: false` com o `url`, para a tela mostrar o botão "Abrir WhatsApp".
 * `abrirJanela(url)` é o `window.open(url, "_blank")` (injetado para teste).
 */
export async function abrirConvite({ precisaEnviar, abrirJanela, preparar, montarUrl }) {
  let janela = null;
  if (precisaEnviar) {
    janela = abrirJanela("");
    if (janela) mostrarEspera(janela);
  }
  let resultado;
  try {
    resultado = (await preparar()) || {};
  } catch {
    resultado = {};
  }
  const url = montarUrl(resultado.situacao ?? null);
  if (precisaEnviar) {
    if (janela && !janela.closed) {
      try {
        janela.opener = null;
        janela.location.href = url;
        return { resultado, url, aberta: true };
      } catch {
        /* não deu para levar a janela: a tela mostra o botão */
      }
    }
    return { resultado, url, aberta: false };
  }
  return { resultado, url, aberta: !!abrirJanela(url) };
}

/**
 * O que fazer na hora do convite (botão WhatsApp). Nunca lança; o convite sai em qualquer caso.
 *   - fornecedor SEM acesso (`tem_acesso === false`): o servidor envia a senha antes; deu certo → "enviada";
 *     falhou → situação null (nenhuma linha sobre senha) e um aviso com o motivo e "dá para enviar depois";
 *   - fornecedor com acesso ativo: não troca a senha → "ja_tinha";
 *   - acesso desativado ou situação desconhecida (status não carregou): não envia nada → null.
 * Devolve `{ situacao, aviso, tipoAviso: "sucesso" | "alerta" | null, resultado }`.
 */
export async function prepararConvite(sigo, { acesso, fornecedorId }) {
  if (acesso && acesso.tem_acesso === false) {
    const resultado = await enviarSenhaFornecedor(sigo, fornecedorId);
    if (resultado.enviado) {
      return {
        situacao: "enviada",
        aviso: `Senha do portal enviada pelo WhatsApp do SIGO para ${resultado.destino || "o telefone do cadastro"}.`,
        tipoAviso: "sucesso",
        resultado,
      };
    }
    return {
      situacao: null,
      aviso: `A senha do portal não foi enviada: ${textoDoMotivo(resultado)}. O convite sai com o link. ${MENSAGEM_ENVIAR_DEPOIS}`,
      tipoAviso: "alerta",
      resultado,
    };
  }
  if (acesso?.ativo) return { situacao: "ja_tinha", aviso: null, tipoAviso: null, resultado: null };
  return { situacao: null, aviso: null, tipoAviso: null, resultado: null };
}
