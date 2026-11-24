/**
 * Regras puras do `fornecedor-acesso` (o login do Portal do Fornecedor e os links das cotações). Sem
 * `Deno.*` e sem import de URL: o `index.ts` só liga a rede e o banco. Teste: `regras.test.ts`, ao lado.
 *
 * Antes (Lote 2b-2 da varredura de nov/2026) a tela de cotação gerava a senha do fornecedor no navegador,
 * gravava o hash direto na tabela e montava o link com o token lido da tabela. Quem tinha acesso a Compras
 * podia, pela API, trocar a senha e entrar no portal "como o fornecedor", sem deixar rastro. Agora o
 * servidor gera a senha, grava o hash (bcrypt), registra na auditoria quem pediu e monta o link.
 */
import { temPermissaoServidor, type Vinculo } from "../_shared/conector/acesso.ts";
import { tokenCotacaoValido } from "../_shared/cotacao-portal.ts";

/** As ações que a função conhece. */
export const ACOES_FORNECEDOR_ACESSO: ReadonlySet<string> = new Set([
  "status",
  "credencial",
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
 * da conta (`is_owner`) passa por `temPermissaoServidor`, como na tela. Vínculo inativo ou excluído não
 * passa (o mesmo critério da função SQL `tem_permissao`).
 */
export function podeUsarCotacoes(p: {
  superAdmin: boolean;
  vinculo: Vinculo | null | undefined;
}): boolean {
  if (p.superAdmin) return true;
  const v = p.vinculo;
  if (!v || v.ativo !== true || v.deleted_at) return false;
  if (v.perfil === "Admin" || v.perfil === "Admin Holding") return true;
  return temPermissaoServidor(v, MODULO_COMPRAS, ABA_COTACOES);
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

/**
 * O que a ação `status` devolve por fornecedor da cotação: tem acesso ao portal? ativo? com que e-mail?
 * Nunca o hash da senha. `acessos` vem em ordem de criação (a mesma do login do portal); vale o primeiro
 * ativo e, sem ativo, o primeiro.
 */
export function statusDosAcessos(
  fornecedorIds: string[],
  acessos: AcessoDoPortal[] | null | undefined
): { fornecedor_id: string; email: string | null; tem_acesso: boolean; ativo: boolean }[] {
  const lista = acessos ?? [];
  return [...new Set(fornecedorIds)].map((fornecedorId) => {
    const doFornecedor = lista.filter((a) => a.fornecedor_id === fornecedorId);
    const ativo = doFornecedor.find((a) => a.ativo === true);
    const escolhido = ativo ?? doFornecedor[0] ?? null;
    return {
      fornecedor_id: fornecedorId,
      email: escolhido?.fornecedor_email ?? null,
      tem_acesso: doFornecedor.length > 0,
      ativo: !!ativo,
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
 * Credencial nova: com acesso ativo, troca a senha dele (o e-mail de login continua o mesmo); sem acesso
 * ativo, cria um com o e-mail do CADASTRO do fornecedor (lido do banco, nunca do corpo); sem e-mail no
 * cadastro, não há o que criar (a mensagem sai sem login e senha, como antes).
 */
export function decidirCredencial(p: {
  acessoAtivo: { id: string; fornecedor_email?: string | null } | null | undefined;
  emailDoCadastro: unknown;
}): DecisaoCredencial {
  if (p.acessoAtivo?.id) {
    return {
      tipo: "rotacionar",
      acessoId: p.acessoAtivo.id,
      email: p.acessoAtivo.fornecedor_email || emailNormalizado(p.emailDoCadastro),
    };
  }
  const email = emailNormalizado(p.emailDoCadastro);
  return email ? { tipo: "criar", email } : { tipo: "sem_email" };
}

// ---------------------------------------------------------------- auditoria

/** IP só no formato que a coluna inet aceita (v4/v6 ou prefixo); lixo vira null e não derruba o registro. */
export function ipParaAuditoria(ip: string | null | undefined): string | null {
  return ip && /^[0-9a-f.:/]+$/i.test(ip) ? ip : null;
}

interface BaseDoRegistro {
  empresaId: string;
  chamadorEmail: string;
  fornecedorId: string;
  fornecedorNome: string | null | undefined;
  status: "sucesso" | "erro";
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
  p: BaseDoRegistro & { acessoId: string; acessoNovo: boolean }
) {
  const nome = p.fornecedorNome || "fornecedor sem nome";
  return {
    ...base(p),
    tipo_acao: "senha_portal_fornecedor",
    entidade: "fornecedor_acesso",
    entidade_id: p.acessoId,
    descricao:
      p.status === "sucesso"
        ? `${p.chamadorEmail} gerou senha nova do Portal do Fornecedor para ${nome}` +
          (p.acessoNovo ? " (acesso criado agora)" : "")
        : `Falhou a gravação da senha nova do Portal do Fornecedor para ${nome}, pedida por ${p.chamadorEmail}; a senha anterior continua valendo`,
    dados_novos: { fornecedor_id: p.fornecedorId, acesso_novo: p.acessoNovo },
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
      p.status === "sucesso"
        ? `${p.chamadorEmail} gerou link novo da cotação para ${nome}; o link anterior deixou de valer`
        : `Falhou a troca do link da cotação para ${nome}, pedida por ${p.chamadorEmail}; o link anterior continua valendo`,
    dados_novos: { fornecedor_id: p.fornecedorId, cotacao_id: p.cotacaoId },
  };
}

export const MENSAGEM_SEM_RASTRO =
  "Não deu para registrar a operação na auditoria; nada foi alterado. Tente de novo.";
