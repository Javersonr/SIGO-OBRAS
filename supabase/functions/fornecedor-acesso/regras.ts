/**
 * Regras puras do `fornecedor-acesso` (o login do Portal do Fornecedor e os links das cotações). Sem
 * `Deno.*` e sem import de URL: o `index.ts` só liga a rede e o banco. Teste: `regras.test.ts`, ao lado.
 *
 * Antes (Lote 2b-2 da varredura de nov/2026) a tela de cotação gerava a senha do fornecedor no navegador,
 * gravava o hash direto na tabela e montava o link com o token lido da tabela. Quem tinha acesso a Compras
 * podia, pela API, trocar a senha e entrar no portal "como o fornecedor", sem deixar rastro. Agora o
 * servidor gera a senha, ENVIA pelo WhatsApp do SIGO direto ao telefone do cadastro (decisão do dono, 24/11:
 * a senha não passa mais pela tela; ver ./envio-senha.ts), grava o hash (bcrypt), registra na auditoria quem
 * pediu e monta o link (que continua saindo pelo WhatsApp do próprio comprador).
 */
import { temPermissaoServidor, type Vinculo } from "../_shared/conector/acesso.ts";
import { tokenCotacaoValido } from "../_shared/cotacao-portal.ts";
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";

/** As ações que a função conhece. */
export const ACOES_FORNECEDOR_ACESSO: ReadonlySet<string> = new Set([
  "status",
  "enviar_senha",
  "links",
  "reemitir_link",
]);

/** Módulo e aba como aparecem no editor de permissões (ESTRUTURA_PERMISSOES do front). */
export const MODULO_COMPRAS = "Compras";
export const ABA_COTACOES = "Cotações";

export const MENSAGEM_SEM_PERMISSAO =
  "Sem permissão: o acesso do fornecedor ao portal é da aba Cotações de Compras.";

/**
 * Quem pode usar a função: a mesma regra que mostra a aba Cotações na tela de Compras
 * (`perfil === "Admin" || temPermissao("Compras", "Cotações")`, Compras.jsx), mais o Admin Holding e o
 * super admin, que o banco também trata como administrador (`usuario_eh_administrador()`, 0178). O dono
 * da conta (`is_owner`) passa por `temPermissaoServidor`, como na tela. Vínculo desativado (`ativo = false`)
 * ou excluído não passa; `ativo` NULO conta como ativo, como na tela (Layout.jsx), em `current_user_perfil()`
 * (0061), em `usuario_eh_administrador()` (0178) e em `tem_permissao` desde a 0179 (revisão do 2b-2, C3).
 */
export function podeUsarCotacoes(p: {
  superAdmin: boolean;
  vinculo: Vinculo | null | undefined;
}): boolean {
  if (p.superAdmin) return true;
  const v = p.vinculo;
  if (!v || v.ativo === false || v.deleted_at) return false;
  if (v.perfil === "Admin" || v.perfil === "Admin Holding") return true;
  return temPermissaoServidor(v, MODULO_COMPRAS, ABA_COTACOES);
}

export interface VinculoDaEmpresa extends Vinculo {
  usuario_email?: string | null;
}

/**
 * O vínculo do chamador entre os vínculos NÃO excluídos da empresa da sessão (em ordem de criação), pelo
 * mesmo critério do banco (`tem_permissao` / `current_user_perfil`): e-mail comparado em minúsculas
 * (`lower(ue.usuario_email) = current_user_email()`), `ativo` nulo conta como ativo, o primeiro que servir.
 * A comparação é feita aqui, e não com `ilike` na consulta, porque `_` e `%` num e-mail seriam curingas.
 */
export function vinculoDoChamadorNaLista(
  vinculos: VinculoDaEmpresa[] | null | undefined,
  email: string
): VinculoDaEmpresa | null {
  const alvo = String(email ?? "").toLowerCase();
  if (!alvo) return null;
  return (
    (vinculos ?? []).find(
      (v) =>
        !!v &&
        String(v.usuario_email ?? "").toLowerCase() === alvo &&
        v.ativo !== false &&
        !v.deleted_at
    ) ?? null
  );
}

/** Função da aba que a tela exige para "Enviar aos Fornecedores" (Compras.jsx, menu da cotação). */
export const FUNCAO_ENVIAR = "enviar";

export const MENSAGEM_SEM_PERMISSAO_ENVIO =
  "Sem permissão para enviar a senha do portal: é preciso a função Enviar da aba Cotações de Compras.";

/**
 * Quem pode ENVIAR a senha do portal ao fornecedor (`enviar_senha`): a mesma permissão que a tela exige para
 * "Enviar aos Fornecedores" (`temPermissao("Compras", "Cotações", "enviar")`), ou administrador (Admin, Admin
 * Holding, super admin; o dono passa por `temPermissaoServidor`). As leituras (`status`, `links`) seguem
 * com `podeUsarCotacoes`.
 */
export function podeEnviarSenha(p: {
  superAdmin: boolean;
  vinculo: Vinculo | null | undefined;
}): boolean {
  if (p.superAdmin) return true;
  const v = p.vinculo;
  if (!v || v.ativo === false || v.deleted_at) return false;
  if (v.perfil === "Admin" || v.perfil === "Admin Holding") return true;
  return temPermissaoServidor(v, MODULO_COMPRAS, ABA_COTACOES, FUNCAO_ENVIAR);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificador no formato uuid (os ids do corpo só servem para achar a linha; a empresa vem da sessão). */
export function idValido(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ---------------------------------------------------------------- links

/** Endereço oficial dos links que saem do sistema (o mesmo de apps/web/src/lib/url-publica.js). */
export const BASE_CANONICA = "https://www.sigoobras.com.br";

/** Origens de desenvolvimento (as mesmas de _shared/cors.ts): ali o link aponta para a própria origem. */
const ORIGENS_DE_DESENVOLVIMENTO: ReadonlySet<string> = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
]);

/**
 * Base do link: em produção, sempre o endereço com www (quem entra sem www geraria link para o domínio
 * sem certificado); em desenvolvimento, a origem da tela. Origem desconhecida = endereço oficial.
 */
export function baseDoLink(origem: string | null | undefined): string {
  return origem && ORIGENS_DE_DESENVOLVIMENTO.has(origem) ? origem : BASE_CANONICA;
}

/** Link da cotação para o fornecedor; `null` quando o token não está no formato do banco (0113). */
export function linkDaCotacao(base: string, token: unknown): string | null {
  if (!tokenCotacaoValido(token)) return null;
  return `${base}/AcessoFornecedor?token=${token}`;
}

export interface Participacao {
  id: string;
  fornecedor_id: string;
  token?: string | null;
}

/** O que a ação `links` devolve: um item por fornecedor da cotação (o token só vai dentro do link). */
export function montarLinks(
  base: string,
  participacoes: Participacao[] | null | undefined
): { cotacao_fornecedor_id: string; fornecedor_id: string; link: string | null }[] {
  return (participacoes ?? []).map((p) => ({
    cotacao_fornecedor_id: p.id,
    fornecedor_id: p.fornecedor_id,
    link: linkDaCotacao(base, p.token),
  }));
}

// ---------------------------------------------------------------- status

export interface AcessoDoPortal {
  id?: string;
  fornecedor_id: string;
  fornecedor_email?: string | null;
  ativo?: boolean | null;
}

export interface CadastroDoFornecedor {
  id: string;
  email?: string | null;
  telefone?: string | null;
}

/**
 * Telefone do cadastro para o envio da senha: o MESMO campo que a tela usa no wa.me (`fornecedor.telefone`,
 * CotacaoModal.jsx), normalizado por `normalizarTelefoneBR` (55 + DDD + número). Inválido = null.
 */
export function telefoneDoFornecedor(
  f: { telefone?: string | null } | null | undefined
): string | null {
  return normalizarTelefoneBR(String(f?.telefone ?? ""));
}

/**
 * O que a ação `status` devolve por fornecedor da cotação: tem acesso ao portal? ativo? com que e-mail? Há
 * e-mail para o login (`tem_email`: o do acesso ativo ou o do cadastro) e telefone válido para o envio da
 * senha (`tem_telefone`)? Nunca o hash da senha nem o telefone. `acessos` vem em ordem de criação (a mesma
 * do login do portal); vale o primeiro ativo e, sem ativo, o primeiro.
 */
export function statusDosAcessos(
  fornecedorIds: string[],
  acessos: AcessoDoPortal[] | null | undefined,
  cadastros: CadastroDoFornecedor[] | null | undefined = []
): {
  fornecedor_id: string;
  email: string | null;
  tem_acesso: boolean;
  ativo: boolean;
  tem_email: boolean;
  tem_telefone: boolean;
}[] {
  const lista = acessos ?? [];
  const cadastroPorId = new Map((cadastros ?? []).map((c) => [c.id, c]));
  return [...new Set(fornecedorIds)].map((fornecedorId) => {
    const doFornecedor = lista.filter((a) => a.fornecedor_id === fornecedorId);
    const ativo = doFornecedor.find((a) => a.ativo === true);
    const escolhido = ativo ?? doFornecedor[0] ?? null;
    const cadastro = cadastroPorId.get(fornecedorId) ?? null;
    return {
      fornecedor_id: fornecedorId,
      email: escolhido?.fornecedor_email ?? null,
      tem_acesso: doFornecedor.length > 0,
      ativo: !!ativo,
      tem_email: !!(emailNormalizado(ativo?.fornecedor_email) || emailNormalizado(cadastro?.email)),
      tem_telefone: !!telefoneDoFornecedor(cadastro),
    };
  });
}

// ---------------------------------------------------------------- credencial

/** E-mail como o login do portal procura (sem espaços, minúsculo); vazio = sem e-mail. */
export function emailNormalizado(e: unknown): string {
  return typeof e === "string" ? e.trim().toLowerCase() : "";
}

export type DecisaoCredencial =
  | { tipo: "rotacionar"; acessoId: string; email: string }
  | { tipo: "criar"; email: string }
  | { tipo: "sem_email" };

/**
 * Credencial nova.
 *  - Com acesso ativo: troca a senha. O login é o e-mail do acesso (o primeiro que tiver e-mail, senão o do
 *    CADASTRO), sempre NORMALIZADO: o `portal-fornecedor-login` procura `fornecedor_email in (minúsculo e sem
 *    espaços, digitado sem espaços)` e as telas de login mandam o e-mail em minúsculas, então uma linha legada
 *    com maiúscula, espaço ou nula nunca entraria (revisão do 2b-2, C1). A troca grava o e-mail normalizado.
 *  - Sem acesso ativo: cria um com o e-mail do cadastro (lido do banco, nunca do corpo).
 *  - Sem e-mail nenhum (nem no acesso nem no cadastro): `sem_email`, nada é gerado (a mensagem sai sem login
 *    e senha, e a tela avisa).
 */
export function decidirCredencial(p: {
  acessosAtivos: { id: string; fornecedor_email?: string | null }[] | null | undefined;
  emailDoCadastro: unknown;
}): DecisaoCredencial {
  const ativos = (p.acessosAtivos ?? []).filter((a) => a && a.id);
  const doAcesso = ativos.map((a) => emailNormalizado(a.fornecedor_email)).find((e) => !!e);
  if (ativos.length) {
    const email = doAcesso || emailNormalizado(p.emailDoCadastro);
    return email ? { tipo: "rotacionar", acessoId: ativos[0].id, email } : { tipo: "sem_email" };
  }
  const email = emailNormalizado(p.emailDoCadastro);
  return email ? { tipo: "criar", email } : { tipo: "sem_email" };
}

/**
 * O que a troca grava em TODAS as linhas ativas do fornecedor na empresa (revisão do 2b-2, C2): o mesmo hash
 * e o mesmo e-mail normalizado. Duas chamadas ao mesmo tempo (duplo clique) podiam deixar duas linhas ativas
 * com senhas diferentes, e a segunda nunca mais era trocada. Trocando todas no fim de cada chamada (e depois
 * de criar a linha nova, quando cria), a última chamada a terminar define a senha válida e nenhuma senha
 * "esquecida" continua valendo. Sem índice único de propósito: os dados de produção são desconhecidos.
 */
export function camposDaTroca(hash: string, email: string) {
  return { senha_acesso: hash, fornecedor_email: emailNormalizado(email) };
}

/** Passos da credencial, na ordem: criar (se for o caso) e SEMPRE terminar trocando todas as ativas. */
export function passosDaCredencial(d: DecisaoCredencial): ("criar" | "trocar_todas")[] {
  if (d.tipo === "sem_email") return [];
  return d.tipo === "criar" ? ["criar", "trocar_todas"] : ["trocar_todas"];
}

export const MENSAGEM_SEM_EMAIL =
  "Este fornecedor não tem e-mail no cadastro: a mensagem vai sem login e senha do portal.";

// ---------------------------------------------------------------- auditoria

const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
const IPV6_RE = /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}(\/(12[0-8]|1[01]\d|[1-9]?\d))?$/i;

/**
 * IP para a coluna `inet` da auditoria (o mesmo `ipDaRequisicao` do enviar-whatsapp). Formato que não seja
 * IPv4 ou IPv6 vira null. Se ainda assim o banco recusar, o index grava de novo sem IP
 * (`linhaSemIp`): IP estranho NUNCA derruba a ação (revisão do 2b-2, melhoria 3).
 */
export function ipParaAuditoria(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return IPV4_RE.test(ip) || (ip.includes(":") && IPV6_RE.test(ip)) ? ip : null;
}

/** A mesma linha sem IP, para a 2ª tentativa; `null` quando já estava sem IP (não há o que repetir). */
export function linhaSemIp<T extends { endereco_ip: string | null }>(linha: T): T | null {
  return linha.endereco_ip ? { ...linha, endereco_ip: null } : null;
}

/**
 * Status da linha da auditoria. `iniciado` é a linha gravada ANTES da troca (sem ela nada muda); ela não diz
 * que deu certo. Depois vem `sucesso` ou `erro`. A coluna `status` é texto livre desde a 0021 (a checagem
 * sucesso/erro da 0002 caiu); as funções irmãs só usam sucesso/erro porque registram depois do fato.
 */
export type StatusDoRegistro = "iniciado" | "sucesso" | "erro";

interface BaseDoRegistro {
  empresaId: string;
  chamadorEmail: string;
  fornecedorId: string;
  fornecedorNome: string | null | undefined;
  status: StatusDoRegistro;
  erro?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

function base(p: BaseDoRegistro) {
  return {
    empresa_id: p.empresaId,
    usuario_email: p.chamadorEmail,
    modulo: MODULO_COMPRAS,
    entidade_nome: p.fornecedorNome || null,
    status: p.status,
    mensagem_erro: p.erro ? String(p.erro).slice(0, 300) : null,
    endereco_ip: ipParaAuditoria(p.ip),
    user_agent: p.userAgent ? p.userAgent.slice(0, 400) : null,
  };
}

/**
 * Linha da auditoria (`audit_log`, só inserção desde a 0173) para a senha nova do portal. Leva quem pediu
 * e qual fornecedor; a senha e o hash NUNCA entram (a função nem os recebe).
 */
export function registroDaCredencial(
  p: BaseDoRegistro & {
    acessoId: string;
    acessoNovo: boolean;
    acessosTrocados?: number;
    /** número de destino JÁ MASCARADO (`mascararNumero`); nunca o número inteiro */
    destino?: string | null;
    /** na falha: "envio" (a mensagem não saiu) ou "gravacao" (saiu, mas a senha não foi gravada) */
    etapa?: "envio" | "gravacao";
  }
) {
  const nome = p.fornecedorNome || "fornecedor sem nome";
  const novo = p.acessoNovo ? " (acesso novo)" : "";
  const para = p.destino ? ` (${p.destino})` : "";
  const descricao =
    p.status === "iniciado"
      ? `${p.chamadorEmail} pediu o envio de senha nova do Portal do Fornecedor para ${nome}${novo} pelo WhatsApp do SIGO`
      : p.status === "sucesso"
        ? `${p.chamadorEmail} enviou senha nova do Portal do Fornecedor para ${nome}${novo} pelo WhatsApp do SIGO${para}; a senha anterior deixou de valer`
        : p.etapa === "gravacao"
          ? `A senha nova do Portal do Fornecedor para ${nome}, pedida por ${p.chamadorEmail}, foi enviada${para} mas não foi gravada; é preciso enviar de novo`
          : `Falhou o envio da senha nova do Portal do Fornecedor para ${nome}, pedida por ${p.chamadorEmail}; nada foi trocado e a senha anterior continua valendo`;
  return {
    ...base(p),
    tipo_acao: "senha_portal_fornecedor",
    entidade: "fornecedor_acesso",
    entidade_id: p.acessoId,
    descricao,
    dados_novos: {
      fornecedor_id: p.fornecedorId,
      acesso_novo: p.acessoNovo,
      ...(p.destino ? { destino: p.destino, canal: "whatsapp_sigo" } : {}),
      ...(typeof p.acessosTrocados === "number" ? { acessos_trocados: p.acessosTrocados } : {}),
    },
  };
}

/** Linha da auditoria para a troca do link de uma cotação (o link antigo deixa de valer). */
export function registroDoLink(
  p: BaseDoRegistro & { cotacaoFornecedorId: string; cotacaoId: string }
) {
  const nome = p.fornecedorNome || "fornecedor sem nome";
  return {
    ...base(p),
    tipo_acao: "link_cotacao_reemitido",
    entidade: "cotacao_fornecedor",
    entidade_id: p.cotacaoFornecedorId,
    descricao:
      p.status === "iniciado"
        ? `${p.chamadorEmail} pediu link novo da cotação para ${nome}`
        : p.status === "sucesso"
          ? `${p.chamadorEmail} gerou link novo da cotação para ${nome}; o link anterior deixou de valer`
          : `Falhou a troca do link da cotação para ${nome}, pedida por ${p.chamadorEmail}; o link anterior continua valendo`,
    dados_novos: { fornecedor_id: p.fornecedorId, cotacao_id: p.cotacaoId },
  };
}

export const MENSAGEM_SEM_RASTRO =
  "Não deu para registrar a operação na auditoria; nada foi alterado. Tente de novo.";
