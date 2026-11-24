/**
 * fornecedor-acesso — a tela de cotação (Compras) pede ao SERVIDOR a senha do Portal do Fornecedor e os
 * links das cotações (Lote 2b-2 da varredura de nov/2026).
 *
 * Antes a tela gerava a senha no navegador, gravava o hash direto em `fornecedor_acesso` e montava o link
 * com o token lido de `cotacao_fornecedor`: quem tinha acesso a Compras podia, pela API, trocar a senha e
 * entrar no portal "como o fornecedor", sem rastro. Agora:
 *   { acao:"status", cotacao_id }        → { acessos:[{ fornecedor_id, email, tem_acesso, ativo }] }
 *                                          (por fornecedor da cotação; nunca o hash)
 *   { acao:"credencial", fornecedor_id } → { credencial: { email, senha } | null, motivo? }
 *                                          senha nova (gerador de senha provisória), grava o hash bcrypt em
 *                                          TODAS as linhas ativas do fornecedor e devolve a senha UMA vez; sem
 *                                          acesso ativo, cria com o e-mail do cadastro; sem e-mail nenhum,
 *                                          `credencial: null, motivo: "SEM_EMAIL"`
 *   { acao:"links", cotacao_id }         → { links:[{ cotacao_fornecedor_id, fornecedor_id, link }] }
 *   { acao:"reemitir_link", cotacao_fornecedor_id }
 *                                        → { cotacao_fornecedor_id, fornecedor_id, link } (o antigo deixa de valer)
 *
 * Identidade só pelo JWT (`usuarioDaRequisicao`); empresa = a da sessão; toda consulta filtrada por ela
 * (service role ignora a RLS). Permissão: aba Cotações de Compras, Admin, Admin Holding, dono ou super admin
 * (`podeUsarCotacoes`, em ./regras.ts), com o vínculo achado pelo critério do banco (`vinculoDoChamadorNaLista`).
 *
 * Auditoria: `credencial` e `reemitir_link` gravam em `audit_log` uma linha `iniciado` ANTES de alterar (a
 * tabela só aceita inserção e é imutável desde a 0173): sem ela, nada muda (500). Depois, uma linha `sucesso`
 * ou `erro`. IP que o banco recuse não derruba a ação (a linha é gravada de novo sem IP). A senha e o hash
 * nunca vão para o registro.
 *
 * O login do portal (portal-fornecedor-login) já confere bcrypt e regrava como bcrypt quem ainda está em
 * SHA-256: nada muda nele.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { generateProvisionalPassword, hashPassword } from "../_shared/passwords.ts";
import { ipDaRequisicao } from "../_shared/limite-tentativas.ts";
import {
  ACOES_FORNECEDOR_ACESSO,
  MENSAGEM_SEM_EMAIL,
  MENSAGEM_SEM_PERMISSAO,
  MENSAGEM_SEM_RASTRO,
  baseDoLink,
  camposDaTroca,
  decidirCredencial,
  idValido,
  linhaSemIp,
  linkDaCotacao,
  montarLinks,
  passosDaCredencial,
  podeUsarCotacoes,
  registroDaCredencial,
  registroDoLink,
  statusDosAcessos,
  vinculoDoChamadorNaLista,
  type AcessoDoPortal,
  type Participacao,
  type VinculoDaEmpresa,
} from "./regras.ts";

interface Body {
  acao?: unknown;
  cotacao_id?: unknown;
  fornecedor_id?: unknown;
  cotacao_fornecedor_id?: unknown;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Vínculo do chamador NA empresa da sessão, pelo critério do banco (revisão do 2b-2, C3): lê os vínculos não
 * excluídos da empresa e compara o e-mail em minúsculas no código (`ativo` nulo conta como ativo). Erro lança.
 */
async function vinculoDoChamador(
  supabase: Db,
  email: string,
  empresaId: string
): Promise<VinculoDaEmpresa | null> {
  const { data, error } = await supabase
    .from("usuario_empresa")
    .select("usuario_email, perfil, is_owner, permissoes, ativo, deleted_at")
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error("usuario_empresa: " + error.message);
  return vinculoDoChamadorNaLista(data ?? [], email);
}

/** A cotação existe e é da empresa da sessão? (cotação de outra empresa responde como inexistente) */
async function cotacaoDaEmpresa(supabase: Db, empresaId: string, cotacaoId: string) {
  const { data, error } = await supabase
    .from("cotacao")
    .select("id")
    .eq("id", cotacaoId)
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("cotacao: " + error.message);
  return data ?? null;
}

/** Fornecedores da cotação (participações), só da empresa da sessão. */
async function participacoesDaCotacao(
  supabase: Db,
  empresaId: string,
  cotacaoId: string
): Promise<Participacao[]> {
  const { data, error } = await supabase
    .from("cotacao_fornecedor")
    .select("id, fornecedor_id, token")
    .eq("cotacao_id", cotacaoId)
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("cotacao_fornecedor: " + error.message);
  return data ?? [];
}

/**
 * Grava uma linha na auditoria. Se o banco recusar e a linha tinha IP, grava de novo sem IP: um IP estranho
 * nunca derruba a ação (revisão do 2b-2, melhoria 3). Devolve a mensagem do erro final (ou null).
 */
async function gravarAuditoria(
  supabase: Db,
  linha: { endereco_ip: string | null }
): Promise<string | null> {
  const { error } = await supabase.from("audit_log").insert(linha);
  if (!error) return null;
  const semIp = linhaSemIp(linha);
  if (!semIp) return error.message;
  console.warn(
    "[fornecedor-acesso] audit_log recusou a linha; nova tentativa sem IP:",
    error.message
  );
  const { error: erroSemIp } = await supabase.from("audit_log").insert(semIp);
  return erroSemIp ? erroSemIp.message : null;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const chamador = await usuarioDaRequisicao(req);
    if (!chamador) return fail("Sessão inválida ou expirada. Faça login novamente.", 401);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const acao = typeof body?.acao === "string" ? body.acao : "";
    if (!ACOES_FORNECEDOR_ACESSO.has(acao)) return fail("Ação desconhecida", 400);

    // a empresa é SEMPRE a da sessão (super admin troca de empresa e o JWT é reemitido)
    const empresaId = chamador.empresa_id;
    if (!empresaId) return fail("Sessão sem empresa ativa", 400);

    const supabase = createAdminClient();
    const vinculo = chamador.is_super_admin
      ? null
      : await vinculoDoChamador(supabase, chamador.email, empresaId);
    if (!podeUsarCotacoes({ superAdmin: chamador.is_super_admin, vinculo })) {
      return fail(MENSAGEM_SEM_PERMISSAO, 403);
    }

    const auditoria = {
      empresaId,
      chamadorEmail: chamador.email,
      ip: ipDaRequisicao(req),
      userAgent: req.headers.get("user-agent"),
    };

    // ------------------------------------------------------------ status / links
    if (acao === "status" || acao === "links") {
      if (!idValido(body.cotacao_id)) return fail("cotacao_id inválido", 400);
      const cot = await cotacaoDaEmpresa(supabase, empresaId, body.cotacao_id);
      if (!cot) return fail("Cotação não encontrada", 404);
      const participacoes = await participacoesDaCotacao(supabase, empresaId, body.cotacao_id);

      if (acao === "links") {
        return ok({ links: montarLinks(baseDoLink(req.headers.get("origin")), participacoes) });
      }

      const ids = [...new Set(participacoes.map((p) => p.fornecedor_id))];
      let acessos: AcessoDoPortal[] = [];
      if (ids.length) {
        const { data, error } = await supabase
          .from("fornecedor_acesso")
          .select("id, fornecedor_id, fornecedor_email, ativo")
          .eq("empresa_id", empresaId)
          .in("fornecedor_id", ids)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (error) {
          console.error("[fornecedor-acesso] status:", error.message);
          return fail("Erro ao carregar os acessos dos fornecedores", 500);
        }
        acessos = data ?? [];
      }
      return ok({ acessos: statusDosAcessos(ids, acessos) });
    }

    // ------------------------------------------------------------ credencial
    if (acao === "credencial") {
      if (!idValido(body.fornecedor_id)) return fail("fornecedor_id inválido", 400);
      const fornecedorId = body.fornecedor_id;
      const { data: fornecedor, error: erroFornecedor } = await supabase
        .from("fornecedor")
        .select("id, nome_razao, email")
        .eq("id", fornecedorId)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .maybeSingle();
      if (erroFornecedor) {
        console.error("[fornecedor-acesso] fornecedor:", erroFornecedor.message);
        return fail("Erro ao carregar o fornecedor", 500);
      }
      if (!fornecedor) return fail("Fornecedor não encontrado", 404);

      // TODAS as linhas ativas do fornecedor (pode haver mais de uma: duplo clique antigo, legado)
      const { data: ativos, error: erroAcesso } = await supabase
        .from("fornecedor_acesso")
        .select("id, fornecedor_email")
        .eq("empresa_id", empresaId)
        .eq("fornecedor_id", fornecedorId)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (erroAcesso) {
        console.error("[fornecedor-acesso] acesso:", erroAcesso.message);
        return fail("Erro ao carregar o acesso do fornecedor", 500);
      }

      const decisao = decidirCredencial({
        acessosAtivos: ativos ?? [],
        emailDoCadastro: fornecedor.email,
      });
      if (decisao.tipo === "sem_email") {
        return ok({ credencial: null, motivo: "SEM_EMAIL", mensagem: MENSAGEM_SEM_EMAIL });
      }

      const acessoNovo = decisao.tipo === "criar";
      const acessoId = decisao.tipo === "rotacionar" ? decisao.acessoId : crypto.randomUUID();
      const dadosDoRegistro = {
        ...auditoria,
        fornecedorId,
        fornecedorNome: fornecedor.nome_razao,
        acessoId,
        acessoNovo,
      };

      // 1. o rastro primeiro (status "iniciado"): sem ele, nada muda
      const erroRastro = await gravarAuditoria(
        supabase,
        registroDaCredencial({ ...dadosDoRegistro, status: "iniciado" })
      );
      if (erroRastro) {
        console.error("[fornecedor-acesso] audit_log (credencial):", erroRastro);
        return fail(MENSAGEM_SEM_RASTRO, 500);
      }

      // 2. a senha nova: só o hash vai para o banco
      const senha = generateProvisionalPassword();
      const hash = await hashPassword(senha);
      const campos = camposDaTroca(hash, decisao.email);
      let erroGravar: string | null = null;
      let acessosTrocados = 0;
      for (const passo of passosDaCredencial(decisao)) {
        if (passo === "criar") {
          const { error } = await supabase.from("fornecedor_acesso").insert({
            id: acessoId,
            empresa_id: empresaId,
            fornecedor_id: fornecedorId,
            fornecedor_nome: fornecedor.nome_razao || "",
            ...campos,
            ativo: true,
          });
          if (error) erroGravar = error.message;
        } else {
          // todas as linhas ativas do fornecedor, inclusive as criadas por outra chamada ao mesmo tempo:
          // a última chamada a terminar define a senha válida (revisão do 2b-2, C2)
          const { data, error } = await supabase
            .from("fornecedor_acesso")
            .update(campos)
            .eq("empresa_id", empresaId)
            .eq("fornecedor_id", fornecedorId)
            .eq("ativo", true)
            .is("deleted_at", null)
            .select("id");
          if (error) erroGravar = error.message;
          else if (!data?.length) erroGravar = "nenhum acesso ativo encontrado ao gravar";
          else acessosTrocados = data.length;
        }
        if (erroGravar) break;
      }
      if (erroGravar) {
        console.error("[fornecedor-acesso] gravar senha:", erroGravar);
        const erroFalha = await gravarAuditoria(
          supabase,
          registroDaCredencial({ ...dadosDoRegistro, status: "erro", erro: erroGravar })
        );
        if (erroFalha) console.warn("[fornecedor-acesso] audit_log (falha):", erroFalha);
        return fail(
          "Não deu para gravar a senha nova do portal do fornecedor. Tente de novo.",
          500
        );
      }

      const erroFim = await gravarAuditoria(
        supabase,
        registroDaCredencial({ ...dadosDoRegistro, status: "sucesso", acessosTrocados })
      );
      if (erroFim) console.warn("[fornecedor-acesso] audit_log (sucesso):", erroFim);

      return ok({ credencial: { email: campos.fornecedor_email, senha } });
    }

    // ------------------------------------------------------------ reemitir_link
    if (!idValido(body.cotacao_fornecedor_id)) return fail("cotacao_fornecedor_id inválido", 400);
    const cotacaoFornecedorId = body.cotacao_fornecedor_id;
    const { data: cf, error: erroCf } = await supabase
      .from("cotacao_fornecedor")
      .select("id, cotacao_id, fornecedor_id, fornecedor_nome")
      .eq("id", cotacaoFornecedorId)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (erroCf) {
      console.error("[fornecedor-acesso] cotacao_fornecedor:", erroCf.message);
      return fail("Erro ao carregar o fornecedor da cotação", 500);
    }
    if (!cf) return fail("Fornecedor da cotação não encontrado", 404);

    const dadosDoLink = {
      ...auditoria,
      fornecedorId: cf.fornecedor_id,
      fornecedorNome: cf.fornecedor_nome,
      cotacaoFornecedorId,
      cotacaoId: cf.cotacao_id,
    };
    const erroRastro = await gravarAuditoria(
      supabase,
      registroDoLink({ ...dadosDoLink, status: "iniciado" })
    );
    if (erroRastro) {
      console.error("[fornecedor-acesso] audit_log (link):", erroRastro);
      return fail(MENSAGEM_SEM_RASTRO, 500);
    }

    // token = null: o trigger da 0113 gera outro (32 bytes aleatórios) e o antigo deixa de valer
    const { data: novo, error: erroLink } = await supabase
      .from("cotacao_fornecedor")
      .update({ token: null })
      .eq("id", cotacaoFornecedorId)
      .eq("empresa_id", empresaId)
      .select("id, fornecedor_id, token")
      .maybeSingle();
    const link = novo ? linkDaCotacao(baseDoLink(req.headers.get("origin")), novo.token) : null;
    if (erroLink || !link) {
      const motivo = erroLink?.message ?? "link novo não gerado";
      console.error("[fornecedor-acesso] reemitir link:", motivo);
      const erroFalha = await gravarAuditoria(
        supabase,
        registroDoLink({ ...dadosDoLink, status: "erro", erro: motivo })
      );
      if (erroFalha) console.warn("[fornecedor-acesso] audit_log (falha):", erroFalha);
      return fail("Não deu para gerar o link novo da cotação. Tente de novo.", 500);
    }
    const erroFim = await gravarAuditoria(
      supabase,
      registroDoLink({ ...dadosDoLink, status: "sucesso" })
    );
    if (erroFim) console.warn("[fornecedor-acesso] audit_log (sucesso):", erroFim);
    return ok({ cotacao_fornecedor_id: novo.id, fornecedor_id: novo.fornecedor_id, link });
  })
);
