/**
 * portal-funcionario — Portal do Funcionário (treinamentos EAD + ciências).
 *
 * O funcionário entra com USUÁRIO (CPF) e SENHA pessoal; o RH cria o acesso
 * com senha provisória (edge function funcionario-acesso) e o primeiro login
 * obriga a troca. A sessão é um token HMAC de 12h amarrado à `sessao_versao`
 * do acesso: redefinir a senha ou desativar derruba as sessões abertas.
 *
 * Ações sem sessão:
 *   { acao:"login", usuario, senha }            → { token, trocar_senha, nome }
 *   { acao:"link", funcionario_id }  [STAFF]    → { url_path, usuario, tem_acesso }
 * Ações com sessão ({ token }):
 *   trocar_senha { nova_senha, senha_atual? }   logout  (senha_atual é obrigatória fora do 1º acesso)
 *   dados                                       evento { evento, matricula_id?, aula_id?, detalhe? }
 *   progresso { matricula_id, aula_id, segundos_assistidos }  (a duração vem do cadastro da aula)
 *   iniciar_avaliacao { matricula_id }          → sorteia a prova NO SERVIDOR (sem gabarito)
 *   avaliacao { matricula_id, respostas:[{questao_id,resposta}] }  (exige iniciar_avaliacao antes)
 *   certificado { matricula_id, senha }          ciencia { ciencia_id }
 *   duvida { matricula_id, aula_id?, pergunta }
 *
 * Reconfirmar a senha com a sessão aberta (`certificado` e `trocar_senha` com a senha atual) tem limite de
 * tentativas por funcionário (escopo próprio, 5 em 15 min); passou do teto responde 429 `LIMITE`.
 *
 * `dados` não leva as questões (saem sorteadas em iniciar_avaliacao) e só assina URL e manda o texto das
 * aulas LIBERADAS: a aula bloqueada vai na lista, mas sem conteúdo (T16).
 *
 * Trilha de auditoria (NR-1, Anexo II): todo acesso e atividade vira uma linha
 * em treinamento_evento com data/hora DO SERVIDOR, IP e dispositivo. O tempo
 * assistido informado pelo navegador é limitado pelo relógio do servidor
 * (ultimo_sinal_em), então não dá para "declarar" tempo que não passou.
 * A trilha é só de inclusão (0135): treinamento_evento, treinamento_tentativa e
 * treinamento_certificado só recebem INSERT daqui; o banco recusa UPDATE/DELETE.
 * Os eventos que o navegador relata (ação `evento`) levam origem "navegador".
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken, verifyPortalToken } from "../_shared/portal-token.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { hashPassword, verifyPassword } from "../_shared/passwords.ts";
import {
  normalizarUsuario,
  motivoSenhaInvalida,
  inteiroAleatorioSeguro,
  registrarEvento,
  origemDaRequisicao,
  gerarCodigoCertificado,
  hashDoCertificado,
  HASH_VERSAO_CANONICO,
  EVENTO_TENTATIVA_LIBERADA,
  type EventoPortal,
} from "../_shared/portal-funcionario.ts";
import { enviarWhatsAppTexto, normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import { assinarDaEmpresa, refDaEmpresa } from "../_shared/storage-assinar.ts";
import { carregarDocumentos, funcionarioPodeEntrar } from "./documentos.ts";
import { confirmarCiencia } from "./ciencia.ts";
import { requisitosDoCurso, duracaoParaProgresso } from "./requisitos.ts";
import {
  EVENTO_PROVA_INICIADA,
  NOTA_MINIMA_PADRAO,
  TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG,
  aulaLiberada,
  aulasParaAluno,
  comRastroDeFalha,
  conclusaoDaAula,
  corrigirProva,
  creditarTempo,
  cursoPublicado,
  datasDeConclusao,
  detalheDaProvaIniciada,
  detalheLimitado,
  inicioDaProva,
  liberacoesPorMatricula,
  logoAssinadoParaPdf,
  matriculaParaAluno,
  type ProgressoDaAula,
  provaDaOrdem,
  proximaTentativaEm,
  reconfirmarSenha,
  refsDasAulasLiberadas,
  respostaDaCorrecao,
  situacaoDasTentativas,
  situacaoDaTrilha,
  sortearProva,
  ultimaLiberacao,
  validarEnvio,
} from "./regras.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  liberarTentativas,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";

const TTL_SESSAO = 60 * 60 * 12;
const TTL_ARQUIVO = 60 * 60 * 3; // URLs assinadas de vídeo/legenda/PDF
const MAX_FALHAS_LOGIN = 5;
const BLOQUEIO_MIN = 15;
const TEMPO_MINIMO_PADRAO = 60; // aula de PDF/texto sem tempo definido
// limitador atômico do login (mesmos tetos do login-custom)
const JANELA_LOGIN_SEG = 15 * 60;
const MAX_LOGIN_POR_IP = 30;
const MAX_LOGIN_POR_CONTA = 8;
// Antes de a senha conferir, TODA falha de login responde igual (401): a
// resposta não revela se o CPF existe, está bloqueado ou desativado.
const MSG_CREDENCIAIS = "Credenciais inválidas: confira o usuário (CPF) e a senha.";
// cada dúvida manda WhatsApp ao tutor pelo canal único do SaaS
const JANELA_DUVIDA_SEG = 60 * 60;
const MAX_DUVIDAS_POR_HORA = 10;

const EVENTOS_CLIENTE = new Set([
  "abrir_curso",
  "abrir_aula",
  "play",
  "pausa",
  "fim_video",
  "aba_oculta",
  "aba_visivel",
  "avaliacao_inicio",
  "abrir_projeto",
  "abrir_certificado",
]);

// comparação de senha com usuário inexistente gasta o mesmo tempo
const HASH_FICTICIO = await hashPassword(crypto.randomUUID());

interface Body {
  acao?: string;
  usuario?: string;
  senha?: string;
  senha_atual?: string;
  nova_senha?: string;
  funcionario_id?: string;
  token?: string;
  evento?: string;
  detalhe?: Record<string, unknown>;
  matricula_id?: string;
  aula_id?: string;
  segundos_assistidos?: number;
  concluir?: boolean;
  respostas?: unknown;
  ciencia_id?: string;
  pergunta?: string;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

// deno-lint-ignore no-explicit-any
type Db = any;

/** O que `prepararProva` devolve: a resposta de recusa, ou o que a prova precisa. */
type FalhaOuProva =
  | { falha: Response }
  | {
      falha: null;
      // deno-lint-ignore no-explicit-any
      questoes: any[];
      // deno-lint-ignore no-explicit-any
      curso: any;
      usadas: number;
      max: number | null;
    };

/**
 * Aulas do curso em ordem + quais estão concluídas nesta matrícula. Só aulas
 * da empresa da sessão (curso_id de outra empresa → trilha vazia).
 */
async function trilhaDoCurso(
  supabase: Db,
  cursoId: string,
  matriculaId: string,
  empresaId: string
) {
  const [{ data: aulas }, { data: progs }] = await Promise.all([
    supabase
      .from("treinamento_aula")
      .select("id, ordem, tipo, duracao_seg")
      .eq("curso_id", cursoId)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true }),
    supabase
      .from("treinamento_progresso")
      .select("aula_id, concluida")
      .eq("matricula_id", matriculaId),
  ]);
  // deno-lint-ignore no-explicit-any
  const feitas = new Set((progs ?? []).filter((p: any) => p.concluida).map((p: any) => p.aula_id));
  return { aulas: aulas ?? [], feitas };
}

/** A aula existe (não apagada) e é do curso, na empresa da sessão. */
async function aulaDoCurso(supabase: Db, aulaId: string, cursoId: string, empresaId: string) {
  const { data } = await supabase
    .from("treinamento_aula")
    .select("id")
    .eq("id", aulaId)
    .eq("curso_id", cursoId)
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * Conclusão recalculada só com o que o SERVIDOR grava: todas as aulas da
 * trilha concluídas no progresso e, se o curso tem prova, uma tentativa
 * APROVADA desta matrícula neste curso. Não usa matricula.status nem
 * avaliacao_aprovada (a empresa grava a matrícula pela API).
 */
// deno-lint-ignore no-explicit-any
async function situacaoReal(supabase: Db, mat: any, empresaId: string) {
  const [trilha, { data: questoes }, { data: aprovadas }] = await Promise.all([
    trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId),
    supabase
      .from("treinamento_questao")
      .select("id")
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("treinamento_tentativa")
      .select("numero, nota")
      .eq("matricula_id", mat.id)
      .eq("curso_id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .eq("aprovada", true)
      .order("numero", { ascending: false })
      .limit(1),
  ]);
  return situacaoDaTrilha({
    aulas: trilha.aulas,
    feitas: trilha.feitas,
    temAvaliacao: (questoes ?? []).length > 0,
    aprovacao: aprovadas?.[0] ?? null,
  });
}

// deno-lint-ignore no-explicit-any
async function concluirSeCompleto(supabase: Db, mat: any, empresaId: string) {
  const [sit, { data: curso }] = await Promise.all([
    situacaoReal(supabase, mat, empresaId),
    supabase
      .from("treinamento_curso")
      .select("validade_meses")
      .eq("id", mat.curso_id)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);
  // precisaAvaliacao = "é a hora da prova": só quando TODAS as aulas terminaram
  if (!sit.aulasOk) return { status: "em_andamento", concluiu: false, precisaAvaliacao: false };
  if (!sit.concluido) {
    return { status: "em_andamento", concluiu: false, precisaAvaliacao: sit.temAvaliacao };
  }
  const patch: Record<string, unknown> = {
    status: "concluido",
    ...datasDeConclusao(new Date(), curso?.validade_meses),
  };
  await supabase.from("treinamento_matricula").update(patch).eq("id", mat.id);
  return { status: "concluido", concluiu: true, precisaAvaliacao: false };
}

/**
 * Assina em lote as referências "bucket/caminho" (vídeo, legenda, PDF). Só as
 * da pasta da empresa da sessão (refDaEmpresa): ref gravada apontando para a
 * pasta de outra empresa fica sem URL. Mapa ref original → URL assinada.
 */
async function assinarRefs(
  supabase: Db,
  refs: (string | null | undefined)[],
  empresaId: string,
  ttl = TTL_ARQUIVO
) {
  const porBucket = new Map<string, Map<string, string[]>>(); // bucket → caminho → originais
  for (const original of new Set(refs.filter((r): r is string => !!r))) {
    const ref = refDaEmpresa(original, empresaId);
    if (!ref) continue;
    const i = ref.indexOf("/");
    const bucket = ref.slice(0, i);
    const caminho = ref.slice(i + 1);
    const caminhos = porBucket.get(bucket) ?? new Map<string, string[]>();
    caminhos.set(caminho, [...(caminhos.get(caminho) ?? []), original]);
    porBucket.set(bucket, caminhos);
  }
  const assinada = new Map<string, string>();
  for (const [bucket, caminhos] of porBucket) {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrls([...caminhos.keys()], ttl);
    for (const s of data ?? []) {
      if (!s?.signedUrl || !s.path) continue;
      for (const original of caminhos.get(s.path) ?? []) assinada.set(original, s.signedUrl);
    }
  }
  return assinada;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const supabase = createAdminClient();
    const agoraIso = () => new Date().toISOString();

    // ------------------------------------------------ link (legado, STAFF)
    if (body.acao === "link") {
      const staff = await usuarioDaRequisicao(req);
      if (!staff) return fail("Sessão inválida", 401);
      const { data: func } = await supabase
        .from("funcionario")
        .select("id, empresa_id")
        .eq("id", body.funcionario_id ?? "")
        .is("deleted_at", null)
        .maybeSingle();
      if (!func) return fail("Funcionário não encontrado", 404);
      if (!staff.is_super_admin && func.empresa_id !== staff.empresa_id) {
        return fail("Funcionário de outra empresa", 403);
      }
      const { data: acesso } = await supabase
        .from("funcionario_portal_acesso")
        .select("usuario")
        .eq("funcionario_id", func.id)
        .maybeSingle();
      return ok({
        url_path: "/PortalFuncionario",
        usuario: acesso?.usuario ?? null,
        tem_acesso: !!acesso,
      });
    }

    // ---------------------------------------------------------------- login
    if (body.acao === "login") {
      const usuario = normalizarUsuario(body.usuario ?? "");
      const senha = body.senha ?? "";
      if (!usuario || !senha) return fail("Informe usuário e senha", 400);

      // Limite de tentativas por IP e por CPF (padrão do login-custom): consumido
      // ANTES de conferir a senha — rajada paralela não passa do teto (o
      // contador `tentativas` abaixo é lido-e-gravado, não segura concorrência).
      // CPF não cadastrado também conta: o 429 não revela quem existe.
      const limite = await consumirTentativa(supabase, "funcionario-login", JANELA_LOGIN_SEG, [
        { tipo: "ip", valor: ipDaRequisicao(req), max: MAX_LOGIN_POR_IP },
        { tipo: "conta", valor: usuario, max: MAX_LOGIN_POR_CONTA },
      ]);
      if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429, { codigo: "LIMITE" });

      const { data: acesso } = await supabase
        .from("funcionario_portal_acesso")
        .select("*")
        .eq("usuario", usuario)
        .maybeSingle();
      // Mesma resposta para CPF inexistente, senha errada, acesso bloqueado ou
      // desativado: 423/403 só depois de a senha conferir (enumeração de CPF).
      const credenciaisInvalidas = () => fail(MSG_CREDENCIAIS, 401, { codigo: "CREDENCIAIS" });
      if (!acesso) {
        await verifyPassword(senha, HASH_FICTICIO);
        return credenciaisInvalidas();
      }
      const ev = (e: Omit<EventoPortal, "empresa_id" | "funcionario_id">) =>
        registrarEvento(supabase, req, {
          empresa_id: acesso.empresa_id,
          funcionario_id: acesso.funcionario_id,
          ...e,
        });

      const bloqueado = !!acesso.bloqueado_ate && Date.parse(acesso.bloqueado_ate) > Date.now();
      const { ok: senhaOk } = await verifyPassword(senha, acesso.senha_hash);
      if (!senhaOk) {
        // bloqueado ou desativado: não conta falha (como antes)
        if (bloqueado || !acesso.ativo) return credenciaisInvalidas();
        const tentativas = acesso.tentativas + 1;
        const bloquear = tentativas >= MAX_FALHAS_LOGIN;
        const bloqueadoAte = bloquear
          ? new Date(Date.now() + BLOQUEIO_MIN * 60_000).toISOString()
          : null;
        await supabase
          .from("funcionario_portal_acesso")
          .update({ tentativas: bloquear ? 0 : tentativas, bloqueado_ate: bloqueadoAte })
          .eq("funcionario_id", acesso.funcionario_id);
        await ev({ evento: "login_falha", detalhe: { tentativa: tentativas, bloqueou: bloquear } });
        return credenciaisInvalidas();
      }

      // senha certa: agora pode dizer o motivo
      if (bloqueado) {
        return fail(
          `Acesso bloqueado por senhas erradas. Tente de novo às ${hora(acesso.bloqueado_ate)} ou fale com o RH.`,
          423,
          { codigo: "BLOQUEADO" }
        );
      }
      if (!acesso.ativo)
        return fail("Acesso desativado — fale com o RH", 403, { codigo: "DESATIVADO" });
      await liberarTentativas(supabase, limite);

      // funcionário da MESMA empresa do acesso (acesso apontando p/ outra = inativo)
      const { data: func } = await supabase
        .from("funcionario")
        .select("nome_completo, ativo, deleted_at")
        .eq("id", acesso.funcionario_id)
        .eq("empresa_id", acesso.empresa_id)
        .maybeSingle();
      if (!funcionarioPodeEntrar(func)) return fail("Cadastro inativo — fale com o RH", 403);

      await supabase
        .from("funcionario_portal_acesso")
        .update({ tentativas: 0, bloqueado_ate: null, ultimo_acesso: agoraIso() })
        .eq("funcionario_id", acesso.funcionario_id);
      await ev({ evento: "login", detalhe: { senha_provisoria: acesso.senha_provisoria } });

      const token = await signPortalToken(
        {
          scope: "funcionario_sessao",
          empresa_id: acesso.empresa_id,
          funcionario_id: acesso.funcionario_id,
          v: acesso.sessao_versao,
        },
        TTL_SESSAO
      );
      return ok({ token, trocar_senha: acesso.senha_provisoria, nome: func.nome_completo });
    }

    // --------------------------------------------------------------- sessão
    const payload = body.token ? await verifyPortalToken(body.token) : null;
    if (!payload || payload.scope !== "funcionario_sessao" || !payload.funcionario_id) {
      return fail("Entre com seu usuário e senha para continuar", 401, { codigo: "SESSAO" });
    }
    const funcionarioId = payload.funcionario_id as string;
    const empresaId = payload.empresa_id as string;
    const { data: acesso } = await supabase
      .from("funcionario_portal_acesso")
      .select("*")
      .eq("funcionario_id", funcionarioId)
      .maybeSingle();
    if (
      !acesso ||
      !acesso.ativo ||
      acesso.sessao_versao !== payload.v ||
      !empresaId ||
      acesso.empresa_id !== empresaId
    ) {
      return fail("Sua sessão terminou — entre de novo", 401, { codigo: "SESSAO" });
    }
    const ev = (e: Omit<EventoPortal, "empresa_id" | "funcionario_id">) =>
      registrarEvento(supabase, req, {
        empresa_id: empresaId,
        funcionario_id: funcionarioId,
        ...e,
      });

    const { data: funcionarioSessao, error: erroFuncionarioSessao } = await supabase
      .from("funcionario")
      .select("id, ativo, deleted_at")
      .eq("id", funcionarioId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (erroFuncionarioSessao) return fail("Não foi possível validar seu acesso", 503);
    if (!funcionarioPodeEntrar(funcionarioSessao)) {
      return fail("Cadastro inativo — fale com o RH", 401, { codigo: "SESSAO" });
    }

    // Reconfirmação da senha com a sessão aberta (assinar o certificado e trocar a senha informando a
    // atual): limite de tentativas por funcionário, em escopo próprio, consumido ANTES de conferir (T27).
    const reconfirmar = (senha: string) =>
      reconfirmarSenha({
        funcionarioId,
        consumir: (escopo, janelaSeg, limites) =>
          consumirTentativa(supabase, escopo, janelaSeg, limites),
        conferir: async () => (await verifyPassword(senha, acesso.senha_hash)).ok,
        liberar: (consumo) => liberarTentativas(supabase, consumo),
      });
    const muitasTentativas = () => fail(MSG_MUITAS_TENTATIVAS, 429, { codigo: "LIMITE" });

    // --------------------------------------------------------- trocar senha
    if (body.acao === "trocar_senha") {
      const nova = body.nova_senha ?? "";
      if (!acesso.senha_provisoria) {
        // a senha atual é obrigatória na troca voluntária (só o 1º acesso, com a provisória, dispensa)
        if (!body.senha_atual) return fail("Informe a sua senha atual", 400);
        const reconfirmacao = await reconfirmar(body.senha_atual);
        if (reconfirmacao === "limite") return muitasTentativas();
        if (reconfirmacao === "incorreta") return fail("Senha atual incorreta", 400);
      }
      const motivo = motivoSenhaInvalida(nova, acesso.usuario);
      if (motivo) return fail(motivo, 400);
      if ((await verifyPassword(nova, acesso.senha_hash)).ok) {
        return fail("A nova senha tem de ser diferente da atual", 400);
      }
      const versao = acesso.sessao_versao + 1;
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({
          senha_hash: await hashPassword(nova),
          senha_provisoria: false,
          sessao_versao: versao,
        })
        .eq("funcionario_id", funcionarioId);
      if (error) return fail("Erro ao salvar a senha", 500);
      await ev({ evento: "troca_senha", detalhe: { era_provisoria: acesso.senha_provisoria } });
      const token = await signPortalToken(
        {
          scope: "funcionario_sessao",
          empresa_id: empresaId,
          funcionario_id: funcionarioId,
          v: versao,
        },
        TTL_SESSAO
      );
      return ok({ token });
    }

    if (body.acao === "logout") {
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({ sessao_versao: acesso.sessao_versao + 1 })
        .eq("funcionario_id", funcionarioId)
        .eq("empresa_id", empresaId)
        .eq("sessao_versao", acesso.sessao_versao);
      if (error) return fail("Não foi possível encerrar sua sessão", 500);
      await ev({ evento: "logout" });
      return ok({ message: "Até logo" });
    }

    if (acesso.senha_provisoria) {
      return fail("Crie sua senha pessoal para continuar", 403, { codigo: "TROCAR_SENHA" });
    }

    // Nenhum ID do corpo é usado: documentos sempre pertencem ao token validado.
    if (body.acao === "documentos") {
      try {
        return ok(
          await carregarDocumentos(supabase, funcionarioId, empresaId, (refs, empresa) =>
            assinarRefs(supabase, refs, empresa, 300)
          )
        );
      } catch {
        return fail("Não foi possível carregar seus documentos. Tente novamente.", 500);
      }
    }

    /**
     * Matrícula do próprio funcionário, na empresa da sessão (ou null). A RLS
     * só confere o empresa_id da linha, não o curso_id: matrícula da empresa
     * apontando para curso de OUTRA empresa é descartada.
     */
    const minhaMatricula = async (id?: string) => {
      if (!id) return null;
      const { data } = await supabase
        .from("treinamento_matricula")
        .select("*")
        .eq("id", id)
        .eq("funcionario_id", funcionarioId)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!data) return null;
      const { data: curso } = await supabase
        .from("treinamento_curso")
        .select("id")
        .eq("id", data.curso_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      return curso ? data : null;
    };

    // ---------------------------------------------------------------- dados
    if (body.acao === "dados") {
      const [{ data: func }, { data: emp }, { data: mats }] = await Promise.all([
        supabase
          .from("funcionario")
          .select("id, nome_completo, funcao_nome")
          .eq("id", funcionarioId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("empresa")
          .select("nome, razao_social, logo_url")
          .eq("id", empresaId)
          .maybeSingle(),
        supabase
          .from("treinamento_matricula")
          .select("*")
          .eq("funcionario_id", funcionarioId)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null),
      ]);
      if (!func) return fail("Funcionário não encontrado", 404);

      const cursoIds = [...new Set((mats ?? []).map((m: { curso_id: string }) => m.curso_id))];
      const matIds = (mats ?? []).map((m: { id: string }) => m.id);
      const vazio = Promise.resolve({ data: [] });
      // curso, aulas e questões SÓ da empresa da sessão: matrícula apontando
      // para curso de outra empresa não traz nada dele (e sai da lista abaixo)
      const [
        { data: cursos },
        { data: aulas },
        { data: prog },
        { data: questoes },
        { data: tentativas },
        { data: certificados },
        { data: duvidas },
        { data: liberacoes },
      ] = await Promise.all([
        cursoIds.length
          ? supabase
              .from("treinamento_curso")
              .select("*")
              .in("id", cursoIds)
              .eq("empresa_id", empresaId)
          : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_aula")
              .select("*")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .order("ordem", { ascending: true })
          : vazio,
        matIds.length
          ? supabase.from("treinamento_progresso").select("*").in("matricula_id", matIds)
          : vazio,
        // só para contar (tem_avaliacao e total_questoes): o texto e as alternativas saem apenas em
        // iniciar_avaliacao, já sorteados, e o gabarito nunca sai antes da aprovação (T16)
        cursoIds.length
          ? supabase
              .from("treinamento_questao")
              .select("id, curso_id")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
          : vazio,
        matIds.length
          ? supabase
              .from("treinamento_tentativa")
              .select("matricula_id, numero, nota, aprovada, created_at")
              .in("matricula_id", matIds)
              .order("numero", { ascending: true })
          : vazio,
        matIds.length
          ? supabase
              .from("treinamento_certificado")
              .select(
                "matricula_id, codigo, dados, assinatura_aluno, emitido_em, revogado_em, hash_sha256"
              )
              .in("matricula_id", matIds)
          : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_duvida")
              .select("id, curso_id, aula_id, pergunta, resposta, respondida_em, created_at")
              .eq("funcionario_id", funcionarioId)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
          : vazio,
        // liberações do RH (T18): quem foi liberado depois da última tentativa não espera o intervalo
        matIds.length
          ? supabase
              .from("treinamento_evento")
              .select("matricula_id, created_at")
              .eq("empresa_id", empresaId)
              .eq("funcionario_id", funcionarioId)
              .eq("evento", EVENTO_TENTATIVA_LIBERADA)
              .in("matricula_id", matIds)
          : vazio,
      ]);
      const liberadaEm = liberacoesPorMatricula(liberacoes);

      const progPor = new Map(
        // deno-lint-ignore no-explicit-any
        (prog ?? []).map((p: any) => [`${p.matricula_id}|${p.aula_id}`, p])
      );
      const agora = Date.now();

      // matrícula de curso que não é da empresa fica fora da lista
      // deno-lint-ignore no-explicit-any
      const cursosDaEmpresa = new Set((cursos ?? []).map((c: any) => c.id));
      const matsDaEmpresa = (mats ?? []).filter((m: { curso_id: string }) =>
        cursosDaEmpresa.has(m.curso_id)
      );
      // aulas do curso e progresso desta matrícula (a regra de liberação está em regras.ts)
      // deno-lint-ignore no-explicit-any
      const aulasDoCurso = (cursoId: string) =>
        (aulas ?? []).filter((a: any) => a.curso_id === cursoId);
      const progressoDa =
        (matriculaId: string) =>
        (aulaId: string): ProgressoDaAula =>
          progPor.get(`${matriculaId}|${aulaId}`) as ProgressoDaAula;

      // Só as aulas LIBERADAS têm arquivo assinado (T16): a URL vale 3 h e pode ser repassada, então
      // aula bloqueada não ganha URL. A próxima aula recebe a sua quando for liberada (o portal
      // recarrega os dados ao concluir uma aula).
      const assinada = await assinarRefs(
        supabase,
        [
          ...matsDaEmpresa.flatMap((m: { id: string; curso_id: string }) =>
            refsDasAulasLiberadas(aulasDoCurso(m.curso_id), progressoDa(m.id))
          ),
          // deno-lint-ignore no-explicit-any
          ...(cursos ?? []).map((c: any) => c.projeto_pedagogico_ref),
        ],
        empresaId
      );
      const url = (ref?: string | null) => (ref ? (assinada.get(ref) ?? null) : null);

      // deno-lint-ignore no-explicit-any
      const resposta = matsDaEmpresa.map((m: any) => {
        // deno-lint-ignore no-explicit-any
        const curso: any = (cursos ?? []).find((c: any) => c.id === m.curso_id) || null;
        const aulasCurso = aulasParaAluno({
          aulas: aulasDoCurso(m.curso_id),
          progresso: progressoDa(m.id),
          urlDe: url,
          tempoMinimoPadrao: TEMPO_MINIMO_PADRAO,
        });
        // deno-lint-ignore no-explicit-any
        const questoesCurso = (questoes ?? []).filter((q: any) => q.curso_id === m.curso_id);
        // deno-lint-ignore no-explicit-any
        const tents = (tentativas ?? []).filter((t: any) => t.matricula_id === m.id);
        const { max, esgotada, aguardarAte } = situacaoDasTentativas({
          usadas: tents.length,
          curso,
          matricula: m,
          ultima: tents[tents.length - 1],
          liberadaEm: liberadaEm.get(m.id),
          agora,
        });
        // deno-lint-ignore no-explicit-any
        const cert: any = (certificados ?? []).find((c: any) => c.matricula_id === m.id) || null;
        const pendencias = requisitosDoCurso({
          curso: curso || {},
          aulas: (aulas ?? []).filter((a: { curso_id: string }) => a.curso_id === m.curso_id),
          questoes: questoesCurso,
        }).filter((r) => r.bloqueia && !r.ok);
        const concluidoReal = situacaoDaTrilha({
          aulas: aulasCurso,
          feitas: new Set(
            aulasCurso
              .filter((a: { concluida: boolean }) => a.concluida)
              .map((a: { id: string }) => a.id)
          ),
          temAvaliacao: questoesCurso.length > 0,
          // deno-lint-ignore no-explicit-any
          aprovacao: tents.find((t: any) => t.aprovada) ?? null,
        }).concluido;
        return {
          // a nota de quem ainda não foi aprovado não vai ao navegador (T16)
          matricula: matriculaParaAluno(m),
          curso: curso && {
            id: curso.id,
            nome: curso.nome,
            codigo: curso.codigo,
            descricao: curso.descricao,
            carga_horaria_horas: curso.carga_horaria_horas,
            projeto_pedagogico_url: url(curso.projeto_pedagogico_ref),
            tem_avaliacao: questoesCurso.length > 0,
            // o portal mostra um selo quando o RH despublicou o curso (T14)
            ativo: cursoPublicado(curso),
          },
          aulas: aulasCurso,
          // as questões NÃO vão aqui (T16): saem sorteadas, sem gabarito, em iniciar_avaliacao
          avaliacao: {
            total_questoes: questoesCurso.length,
            tentativas_usadas: tents.length,
            tentativas_max: max,
            limite_atingido: esgotada && !m.avaliacao_aprovada,
            proxima_em: aguardarAte !== null ? new Date(aguardarAte).toISOString() : null,
            nota_minima: curso?.nota_minima ?? NOTA_MINIMA_PADRAO,
          },
          certificado: cert && {
            codigo: cert.codigo,
            dados: cert.dados,
            assinatura_aluno: cert.assinatura_aluno,
            emitido_em: cert.emitido_em,
            hash_sha256: cert.hash_sha256,
            revogado: !!cert.revogado_em,
          },
          pode_emitir_certificado: concluidoReal && !cert && pendencias.length === 0,
          pendencias_certificado: pendencias.map((r) => r.texto),
          // deno-lint-ignore no-explicit-any
          duvidas: (duvidas ?? []).filter((d: any) => d.curso_id === m.curso_id),
        };
      });

      const { data: ciencias } = await supabase
        .from("entrega_ciencia")
        .select("id, tipo, descricao, itens, status, created_at, confirmada_em")
        .eq("funcionario_id", funcionarioId)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);

      // Logo da empresa para o PDF do certificado (T15): URL assinada só da pasta da empresa da
      // sessão. Só vale a chamada ao Storage quando o aluno tem certificado para baixar; quem
      // emite um agora recarrega os `dados` e recebe o logo junto.
      const empresaLogoUrl = (certificados ?? []).length
        ? await logoAssinadoParaPdf(
            emp?.logo_url,
            // falha ao assinar = PDF sem logo para o aluno; o rastro fica nos logs da função
            comRastroDeFalha(
              (refs: string[]) => assinarDaEmpresa(supabase, refs, empresaId),
              (erro) => console.error("[portal-funcionario] logo da empresa não assinado:", erro)
            )
          )
        : null;

      return ok({
        funcionario: func,
        empresa_nome: emp?.nome || emp?.razao_social || "",
        empresa_logo_url: empresaLogoUrl,
        cursos: resposta,
        ciencias: ciencias ?? [],
      });
    }

    // --------------------------------------------------------------- evento
    if (body.acao === "evento") {
      const nome = body.evento ?? "";
      if (!EVENTOS_CLIENTE.has(nome)) return fail("Evento inválido", 400);
      const mat = await minhaMatricula(body.matricula_id);
      if (body.matricula_id && !mat) return fail("Matrícula não encontrada", 404);
      // aula informada tem de ser do curso da matrícula (na empresa da sessão)
      if (body.aula_id && nome !== "abrir_aula") {
        if (!mat) return fail("matricula_id é obrigatório com aula_id", 400);
        if (!(await aulaDoCurso(supabase, body.aula_id, mat.curso_id, empresaId))) {
          return fail("Aula não pertence ao curso", 400);
        }
      }

      if (nome === "abrir_aula") {
        if (!mat || !body.aula_id) return fail("matricula_id e aula_id são obrigatórios", 400);
        const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
        if (!trilha.aulas.some((a: { id: string }) => a.id === body.aula_id)) {
          return fail("Aula não pertence ao curso", 400);
        }
        if (!aulaLiberada(trilha, body.aula_id)) {
          return fail("Conclua a aula anterior primeiro", 409, { codigo: "AULA_BLOQUEADA" });
        }
        // o relógio da aula começa agora
        await supabase
          .from("funcionario_portal_acesso")
          .update({ ultimo_sinal_em: agoraIso() })
          .eq("funcionario_id", funcionarioId);
        if (!mat.iniciado_em || mat.status === "pendente") {
          await supabase
            .from("treinamento_matricula")
            .update({
              iniciado_em: mat.iniciado_em ?? agoraIso(),
              status: mat.status === "pendente" ? "em_andamento" : mat.status,
            })
            .eq("id", mat.id);
        }
      }
      await ev({
        evento: nome,
        matricula_id: mat?.id ?? null,
        curso_id: mat?.curso_id ?? null,
        aula_id: body.aula_id ?? null,
        detalhe: detalheLimitado(body.detalhe),
        // quem relata é o navegador do aluno: o servidor só carimba a hora e o IP (T17)
        origem: "navegador",
      });
      return ok({ registrado: true });
    }

    // ------------------------------------------------------------ progresso
    if (body.acao === "progresso") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
      // deno-lint-ignore no-explicit-any
      const aula: any = trilha.aulas.find((a: { id: string }) => a.id === body.aula_id);
      if (!aula) return fail("Aula não pertence ao curso", 400);
      if (!aulaLiberada(trilha, aula.id)) {
        return fail("Conclua a aula anterior primeiro", 409, { codigo: "AULA_BLOQUEADA" });
      }

      const duracao = duracaoParaProgresso(aula, TEMPO_MINIMO_PADRAO);
      if (duracao === null) {
        return fail("Esta aula está sem duração cadastrada — avise o RH", 409, {
          codigo: "AULA_SEM_DURACAO",
        });
      }

      const { data: atual } = await supabase
        .from("treinamento_progresso")
        .select("*")
        .eq("matricula_id", mat.id)
        .eq("aula_id", aula.id)
        .maybeSingle();
      const jaTinha = atual?.segundos_assistidos ?? 0;

      // O navegador informa o total; o servidor só aceita o que cabe no tempo
      // real passado desde o último sinal deste funcionário (qualquer aba/aula).
      const agora = Date.now();
      const { decorrido, pedido, aceito, novoSeg, ajustado } = creditarTempo({
        jaTinha,
        informado: body.segundos_assistidos,
        ultimoSinalEm: acesso.ultimo_sinal_em,
        agora,
        duracao,
      });

      await supabase
        .from("funcionario_portal_acesso")
        .update({ ultimo_sinal_em: new Date(agora).toISOString() })
        .eq("funcionario_id", funcionarioId);
      if (ajustado) {
        await ev({
          evento: "progresso_ajustado",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { pedido, aceito, decorrido: Math.round(decorrido) },
        });
      }

      // vídeo conclui sozinho aos 90% assistidos; apostila (pdf/texto) exige o
      // tempo de leitura COMPLETO e o clique explícito em "Marcar como lida"
      const { ehVideo, concluirCedo, faltamSeg, concluiu, podeConcluir } = conclusaoDaAula({
        tipo: aula.tipo,
        duracao,
        segundos: novoSeg,
        jaConcluida: atual?.concluida,
        pediuConcluir: body.concluir,
      });
      if (concluirCedo) {
        const faltam = Math.ceil(faltamSeg / 60);
        return fail(`Continue lendo: ainda faltam ${faltam} min do tempo mínimo de leitura.`, 409, {
          codigo: "TEMPO_LEITURA",
          segundos_assistidos: novoSeg,
          faltam_seg: faltamSeg,
        });
      }
      const { error: upErr } = await supabase.from("treinamento_progresso").upsert(
        {
          empresa_id: empresaId,
          matricula_id: mat.id,
          aula_id: aula.id,
          segundos_assistidos: novoSeg,
          concluida: concluiu,
          concluida_em: concluiu && !atual?.concluida ? agoraIso() : (atual?.concluida_em ?? null),
        },
        { onConflict: "matricula_id,aula_id" }
      );
      if (upErr) {
        console.error("[portal-funcionario] progresso:", upErr);
        return fail("Erro ao salvar progresso", 500);
      }

      let resultado = { status: mat.status, concluiu: false, precisaAvaliacao: false };
      if (concluiu && !atual?.concluida) {
        if (!ehVideo) {
          await ev({
            evento: "apostila_lida",
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            aula_id: aula.id,
            detalhe: { segundos: novoSeg, minimo: duracao },
          });
        }
        await ev({
          evento: "aula_concluida",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { segundos: novoSeg, duracao },
        });
        resultado = await concluirSeCompleto(supabase, mat, empresaId);
        if (resultado.concluiu) {
          await ev({ evento: "curso_concluido", matricula_id: mat.id, curso_id: mat.curso_id });
        }
      }
      if (resultado.status !== mat.status && resultado.status !== "concluido") {
        await supabase
          .from("treinamento_matricula")
          .update({ status: resultado.status })
          .eq("id", mat.id);
      }

      return ok({
        segundos_assistidos: novoSeg,
        pode_concluir: podeConcluir,
        aula_concluida: concluiu,
        curso_concluido: resultado.concluiu,
        precisa_avaliacao: resultado.precisaAvaliacao && !mat.avaliacao_aprovada,
        status: resultado.status,
      });
    }

    // ------------------------------------------------------------ avaliação
    // A prova é do SERVIDOR (T16). `iniciar_avaliacao` confere se o aluno pode fazê-la, sorteia a ordem
    // das questões e das alternativas (sorteio criptográfico), grava o sorteio na trilha (evento
    // `avaliacao_iniciada`, com a hora do servidor) e devolve as questões SEM gabarito. `avaliacao` só
    // aceita o envio de uma prova iniciada nesta tentativa e completa, e corrige com a ordem que o
    // servidor gravou: o navegador não escolhe a ordem, não define o início nem o tempo.

    /**
     * Confere se a matrícula pode fazer a prova AGORA e traz o que ela precisa. As duas ações recusam
     * pelos mesmos motivos (já aprovado, aulas por concluir, sem questões, tentativas esgotadas,
     * intervalo correndo). `comGabarito`: só a correção carrega `correta` e `comentario`; abrir a
     * prova nunca os lê.
     */
    // deno-lint-ignore no-explicit-any
    const prepararProva = async (mat: any, comGabarito: boolean): Promise<FalhaOuProva> => {
      if (mat.avaliacao_aprovada) {
        return { falha: fail("Você já foi aprovado nesta avaliação", 409) };
      }
      const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
      if (!trilha.aulas.every((a: { id: string }) => trilha.feitas.has(a.id))) {
        return { falha: fail("Conclua todas as aulas antes da avaliação", 409) };
      }
      const [{ data: questoes }, { data: curso }, { data: anteriores }, { data: liberacoes }] =
        await Promise.all([
          supabase
            .from("treinamento_questao")
            .select(
              comGabarito
                ? "id, ordem, pergunta, opcoes, correta, comentario"
                : "id, ordem, pergunta, opcoes"
            )
            .eq("curso_id", mat.curso_id)
            .eq("empresa_id", empresaId)
            .is("deleted_at", null)
            .order("ordem", { ascending: true }),
          supabase
            .from("treinamento_curso")
            .select("nota_minima, max_tentativas, intervalo_tentativa_min")
            .eq("id", mat.curso_id)
            .eq("empresa_id", empresaId)
            .maybeSingle(),
          supabase
            .from("treinamento_tentativa")
            .select("numero, aprovada, created_at")
            .eq("matricula_id", mat.id)
            .order("numero", { ascending: false }),
          // liberação do RH (T18): depois da última tentativa, o intervalo não vale
          supabase
            .from("treinamento_evento")
            .select("created_at")
            .eq("matricula_id", mat.id)
            .eq("empresa_id", empresaId)
            .eq("evento", EVENTO_TENTATIVA_LIBERADA)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
      if (!questoes?.length) return { falha: fail("Este curso não tem avaliação", 400) };

      const usadas = anteriores?.length ?? 0;
      const tentativas = situacaoDasTentativas({
        usadas,
        curso,
        matricula: mat,
        ultima: anteriores?.[0],
        liberadaEm: ultimaLiberacao(liberacoes),
        agora: Date.now(),
      });
      if (tentativas.esgotada) {
        return {
          falha: fail("Você usou todas as tentativas. Procure o RH para liberar uma nova.", 403, {
            codigo: "LIMITE_TENTATIVAS",
          }),
        };
      }
      if (tentativas.aguardarAte !== null) {
        const libera = tentativas.aguardarAte;
        return {
          falha: fail(
            `Nova tentativa liberada às ${hora(new Date(libera).toISOString())}. Revise as aulas enquanto isso.`,
            429,
            { codigo: "AGUARDAR", liberada_em: new Date(libera).toISOString() }
          ),
        };
      }
      // deno-lint-ignore no-explicit-any
      return { falha: null, questoes: questoes as any[], curso, usadas, max: tentativas.max };
    };

    /** O último início de prova gravado nesta matrícula (a linha da trilha), ou erro de leitura. */
    // deno-lint-ignore no-explicit-any
    const ultimoInicioDaProva = (mat: any) =>
      supabase
        .from("treinamento_evento")
        .select("created_at, detalhe")
        .eq("matricula_id", mat.id)
        .eq("empresa_id", empresaId)
        .eq("evento", EVENTO_PROVA_INICIADA)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (body.acao === "iniciar_avaliacao") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararProva(mat, false);
      if (preparo.falha) return preparo.falha;
      const { questoes, curso, max } = preparo;
      const numero = preparo.usadas + 1;

      // Prova já aberta nesta tentativa (o aluno recarregou a página ou voltou às aulas e abriu de novo):
      // mantém o mesmo sorteio e a hora do primeiro início, e não grava outro evento. Se o RH mexeu nas
      // questões nesse meio tempo, a ordem gravada não confere e a prova é sorteada de novo.
      const { data: gravado, error: erroLeitura } = await ultimoInicioDaProva(mat);
      if (erroLeitura) return fail("Não foi possível abrir a prova. Tente de novo.", 503);
      const inicio = inicioDaProva(gravado);
      let prova =
        inicio && inicio.tentativa === numero ? provaDaOrdem(questoes, inicio.ordem) : null;
      if (!prova) {
        prova = sortearProva(questoes, inteiroAleatorioSeguro);
        const gravou = await ev({
          evento: EVENTO_PROVA_INICIADA,
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          detalhe: detalheDaProvaIniciada({ tentativa: numero, agora: Date.now(), prova }),
        });
        // sem o início na trilha o envio seria recusado: melhor nem abrir a prova
        if (!gravou) return fail("Não foi possível abrir a prova. Tente de novo.", 503);
      }

      return ok({
        tentativa: numero,
        tentativas_max: max,
        nota_minima: curso?.nota_minima ?? NOTA_MINIMA_PADRAO,
        // só o que o aluno vê: sem `correta`, sem `comentario`
        questoes: prova.map(({ id, pergunta, opcoes, ordem_opcoes }) => ({
          id,
          pergunta,
          opcoes,
          ordem_opcoes,
        })),
      });
    }

    if (body.acao === "avaliacao") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararProva(mat, true);
      if (preparo.falha) return preparo.falha;
      const { questoes, curso, max } = preparo;
      const numero = preparo.usadas + 1;

      // início desta tentativa, resposta de todas as questões e tempo mínimo (regras em regras.ts)
      const { data: gravado, error: erroLeitura } = await ultimoInicioDaProva(mat);
      if (erroLeitura) return fail("Não foi possível validar a prova. Tente de novo.", 503);
      const envio = validarEnvio({
        questoes,
        respostas: body.respostas,
        inicio: inicioDaProva(gravado),
        numero,
        agora: Date.now(),
        tempoMinimoPorQuestaoSeg: TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG,
      });
      if (!envio.ok) {
        return fail(envio.mensagem, envio.status, { codigo: envio.codigo, ...envio.extra });
      }

      // a ordem exibida é a que o SERVIDOR sorteou (não a que o navegador diz ter mostrado)
      const exibicao = new Map(
        envio.prova.map((q, i) => [q.id, { posicao: i + 1, ordem_opcoes: q.ordem_opcoes }])
      );
      const { marcada, acertou, acertos, nota, minima, aprovada } = corrigirProva({
        questoes,
        respostas: envio.respostas,
        notaMinima: curso?.nota_minima,
      });

      const { error: tErr } = await supabase.from("treinamento_tentativa").insert({
        empresa_id: empresaId,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        funcionario_id: funcionarioId,
        numero,
        // deno-lint-ignore no-explicit-any
        prova: questoes.map((q: any) => ({
          questao_id: q.id,
          ordem: q.ordem,
          pergunta: q.pergunta,
          opcoes: q.opcoes,
          correta: q.correta,
        })),
        // deno-lint-ignore no-explicit-any
        respostas: questoes.map((q: any) => ({
          questao_id: q.id,
          resposta: marcada.get(q.id) ?? null,
          acertou: acertou(q),
          posicao_exibida: exibicao.get(q.id)?.posicao ?? null,
          ordem_opcoes_exibida: exibicao.get(q.id)?.ordem_opcoes ?? null,
        })),
        acertos,
        total: questoes.length,
        nota,
        aprovada,
        ...origemDaRequisicao(req),
      });
      if (tErr) {
        // unique(matricula_id, numero): envio duplo simultâneo
        return fail("Esta tentativa já foi registrada — recarregue a página", 409);
      }
      await supabase
        .from("treinamento_matricula")
        .update({ nota_avaliacao: nota, avaliacao_aprovada: aprovada, avaliacao_em: agoraIso() })
        .eq("id", mat.id);
      await ev({
        evento: "avaliacao_envio",
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        detalhe: { tentativa: numero, nota, aprovada },
      });

      let concluiu = false;
      if (aprovada) {
        // concluirSeCompleto confere a tentativa aprovada recém-gravada
        const r = await concluirSeCompleto(supabase, mat, empresaId);
        concluiu = r.concluiu;
        if (concluiu) {
          await ev({ evento: "curso_concluido", matricula_id: mat.id, curso_id: mat.curso_id });
        }
      }

      // Correção comentada só após aprovar: antes disso, a nova tentativa
      // viraria cópia do gabarito.
      const revisao = aprovada
        ? // deno-lint-ignore no-explicit-any
          questoes.map((q: any) => ({
            questao_id: q.id,
            acertou: acertou(q),
            resposta_correta: (q.opcoes as string[] | null)?.[q.correta] ?? null,
            comentario: q.comentario ?? null,
          }))
        : null;
      const liberaMs = proximaTentativaEm(aprovada, curso?.intervalo_tentativa_min, Date.now());
      const liberaEm = liberaMs !== null ? new Date(liberaMs).toISOString() : null;

      // Reprovado: "insatisfatório", tentativas e próxima liberação; nota, acertos e total só enquanto
      // REPROVADO_VE_NOTA (D10 em aberto; fora, eles deixam deduzir o gabarito). Aprovado: como antes.
      // Regra em regras.ts.
      return ok(
        respostaDaCorrecao({
          aprovada,
          nota,
          notaMinima: minima,
          acertos,
          total: questoes.length,
          tentativa: numero,
          tentativasMax: max,
          proximaEm: liberaEm,
          cursoConcluido: concluiu,
          revisao,
        })
      );
    }

    // ---------------------------------------------------------- certificado
    // Emissão = assinatura eletrônica do aluno: ele confirma a declaração com
    // a SENHA pessoal (só ele conhece), e o servidor registra quando/de onde.
    if (body.acao === "certificado") {
      let mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);

      const { data: existente } = await supabase
        .from("treinamento_certificado")
        .select("codigo, dados, assinatura_aluno, emitido_em, hash_sha256, revogado_em")
        .eq("matricula_id", mat.id)
        .maybeSingle();
      if (existente) {
        return ok({ certificado: { ...existente, revogado: !!existente.revogado_em } });
      }

      // NR-1: conclusão recalculada aqui (progresso + tentativa aprovada), não
      // pelo status da matrícula, que a empresa grava pela API.
      const sit = await situacaoReal(supabase, mat, empresaId);
      if (!sit.concluido) return fail("Conclua o curso antes de emitir o certificado", 409);

      const reconfirmacao = await reconfirmar(body.senha ?? "");
      if (reconfirmacao === "limite") return muitasTentativas();
      if (reconfirmacao === "incorreta") {
        return fail("Senha incorreta — a assinatura não foi feita", 400);
      }

      // matrícula sem o status/data que o servidor grava ao concluir: regrava
      // antes de montar o certificado (conclusão e validade vêm dela)
      if (mat.status !== "concluido" || !mat.data_conclusao) {
        await concluirSeCompleto(supabase, mat, empresaId);
        mat = (await minhaMatricula(mat.id)) ?? mat;
      }

      const [{ data: curso }, { data: func }, { data: emp }, { data: aulas }] = await Promise.all([
        supabase
          .from("treinamento_curso")
          .select("*")
          .eq("id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("funcionario")
          .select("nome_completo, cpf, funcao_nome")
          .eq("id", funcionarioId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("empresa")
          .select("nome, razao_social, cnpj")
          .eq("id", empresaId)
          .maybeSingle(),
        supabase
          .from("treinamento_aula")
          .select(
            "ordem, modulo, titulo, tipo, fonte, video_ref, youtube_id, arquivo_ref, conteudo_texto, duracao_seg"
          )
          .eq("curso_id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null)
          .order("ordem", { ascending: true }),
      ]);
      if (!func) return fail("Funcionário não encontrado", 404);
      const { count: nQuestoes, error: erroQuestoes } = await supabase
        .from("treinamento_questao")
        .select("id", { count: "exact", head: true })
        .eq("curso_id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null);
      if (erroQuestoes) return fail("Não foi possível validar os requisitos do curso", 503);
      const pendencias = requisitosDoCurso({
        curso: curso || {},
        aulas: aulas || [],
        questoes: Array.from({ length: nQuestoes || 0 }, () => ({})),
      }).filter((r) => r.bloqueia && !r.ok);
      if (pendencias.length)
        return fail("O certificado aguarda a regularização do curso pelo RH", 409, {
          codigo: "REQUISITOS",
          pendencias: pendencias.map((r) => r.texto),
        });

      const dados = {
        aluno: { nome: func?.nome_completo, cpf: func?.cpf, funcao: func?.funcao_nome ?? null },
        empresa: { nome: emp?.razao_social || emp?.nome, cnpj: emp?.cnpj ?? null },
        curso: {
          nome: curso.nome,
          codigo: curso.codigo,
          carga_horaria_horas: curso.carga_horaria_horas,
          modalidade: "Ensino a distância (EAD) — NR-1, Anexo II",
          conteudo_programatico: curso.conteudo_programatico || null,
          // deno-lint-ignore no-explicit-any
          aulas: (aulas ?? []).map((a: any) => ({ modulo: a.modulo, titulo: a.titulo })),
        },
        periodo: {
          inicio: (mat.iniciado_em ?? mat.created_at)?.slice(0, 10),
          conclusao: mat.data_conclusao,
          validade: mat.proxima_renovacao ?? null,
        },
        avaliacao: sit.aprovacao
          ? { nota: sit.aprovacao.nota, tentativa: sit.aprovacao.numero }
          : null,
        instrutor: {
          nome: curso.instrutor_nome ?? null,
          qualificacao: curso.instrutor_qualificacao ?? null,
        },
        responsavel_tecnico: {
          nome: curso.responsavel_tecnico_nome ?? null,
          registro: curso.responsavel_tecnico_registro ?? null,
        },
      };
      const assinatura = {
        metodo: "senha_pessoal_portal_funcionario",
        usuario: acesso.usuario,
        declaracao:
          "Declaro que realizei pessoalmente este treinamento, assisti às aulas e fiz a avaliação.",
        assinado_em: agoraIso(),
        ...origemDaRequisicao(req),
        // versão do hash: a validação pública sabe se refaz o hash canônico (2) ou o antigo (sem versão)
        hash_versao: HASH_VERSAO_CANONICO,
      };

      for (let i = 0; i < 3; i++) {
        const codigo = gerarCodigoCertificado();
        // JSON canônico (chaves ordenadas): o jsonb do banco reordena as chaves, e só assim o hash
        // dá para refazer a partir do que ficou gravado (validar-certificado confere isso)
        const hash = await hashDoCertificado(codigo, dados, assinatura);
        const { data: cert, error } = await supabase
          .from("treinamento_certificado")
          .insert({
            empresa_id: empresaId,
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            funcionario_id: funcionarioId,
            codigo,
            hash_sha256: hash,
            dados,
            assinatura_aluno: assinatura,
          })
          .select("codigo, dados, assinatura_aluno, emitido_em, hash_sha256")
          .single();
        if (!error) {
          // o que o banco devolveu tem de dar o mesmo hash; se não der, a validação pública acusaria
          // "dados não conferem" num certificado recém-emitido: deixa rastro no log (não derruba)
          if ((await hashDoCertificado(cert.codigo, cert.dados, cert.assinatura_aluno)) !== hash) {
            console.error(
              "[portal-funcionario] certificado: hash não reproduzível pelo banco",
              codigo
            );
          }
          await ev({
            evento: "certificado_assinado",
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            detalhe: { codigo },
          });
          return ok({ certificado: { ...cert, revogado: false } });
        }
        if (error.code !== "23505") {
          console.error("[portal-funcionario] certificado:", error);
          return fail("Erro ao emitir certificado", 500);
        }
        // 23505 no codigo: sorteia outro; na matricula_id: outra aba já emitiu
        const { data: jaEmitido } = await supabase
          .from("treinamento_certificado")
          .select("codigo, dados, assinatura_aluno, emitido_em, hash_sha256")
          .eq("matricula_id", mat.id)
          .maybeSingle();
        if (jaEmitido) return ok({ certificado: { ...jaEmitido, revogado: false } });
      }
      return fail("Erro ao gerar o código do certificado — tente de novo", 500);
    }

    // ------------------------------------------------------------- ciência
    // Confirmação = assinatura eletrônica simples (Lei 14.063/2020): quem
    // (login pessoal), quando, o quê e de onde (IP/dispositivo).
    if (body.acao === "ciencia") {
      const cienciaId = body.ciencia_id;
      if (!cienciaId) return fail("ciencia_id é obrigatório", 400);
      const evidencia = {
        metodo: "portal_funcionario_login",
        usuario: acesso.usuario,
        confirmado_em: agoraIso(),
        ...origemDaRequisicao(req),
      };
      // só o servidor confirma (trigger da 0134) e só uma vez: o UPDATE exige status pendente,
      // então uma 2ª aba não sobrescreve a evidência da 1ª (regra e testes em ciencia.ts)
      const r = await confirmarCiencia(supabase, {
        cienciaId,
        funcionarioId,
        empresaId,
        evidencia,
      });
      if (r.resultado === "nao_encontrada") return fail("Registro não encontrado", 404);
      if (r.resultado === "ja_confirmada") return ok({ message: "Já confirmada" });
      if (r.resultado === "erro") return fail("Erro ao registrar ciência", 500);
      await ev({ evento: "ciencia", detalhe: { ciencia_id: cienciaId } });
      return ok({ message: "Ciência registrada", evidencia });
    }

    // -------------------------------------------------------------- dúvida
    if (body.acao === "duvida") {
      const pergunta = (body.pergunta ?? "").trim();
      if (pergunta.length < 3) return fail("Escreva sua dúvida", 400);
      if (pergunta.length > 2000) return fail("Dúvida longa demais (máx. 2000 caracteres)", 400);
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      if (body.aula_id && !(await aulaDoCurso(supabase, body.aula_id, mat.curso_id, empresaId))) {
        return fail("Aula não pertence ao curso", 400);
      }
      // cada dúvida vira um WhatsApp ao tutor: teto por funcionário
      const limite = await consumirTentativa(supabase, "portal-duvida", JANELA_DUVIDA_SEG, [
        { tipo: "conta", valor: funcionarioId, max: MAX_DUVIDAS_POR_HORA },
      ]);
      if (!limite.permitido) {
        return fail(
          "Você enviou muitas dúvidas em pouco tempo. Aguarde um pouco e envie de novo.",
          429,
          { codigo: "LIMITE" }
        );
      }

      const { data: duvida, error } = await supabase
        .from("treinamento_duvida")
        .insert({
          empresa_id: empresaId,
          curso_id: mat.curso_id,
          matricula_id: mat.id,
          funcionario_id: funcionarioId,
          aula_id: body.aula_id ?? null,
          pergunta,
        })
        .select("id, curso_id, aula_id, pergunta, resposta, respondida_em, created_at")
        .single();
      if (error) return fail("Erro ao enviar a dúvida", 500);
      await ev({
        evento: "duvida_enviada",
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        aula_id: body.aula_id ?? null,
        detalhe: { duvida_id: duvida.id },
      });

      const [{ data: curso }, { data: func }] = await Promise.all([
        supabase
          .from("treinamento_curso")
          .select("nome, tutor_telefone")
          .eq("id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("funcionario")
          .select("nome_completo")
          .eq("id", funcionarioId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
      ]);
      const tel = normalizarTelefoneBR(curso?.tutor_telefone ?? "");
      if (tel) {
        try {
          await enviarWhatsAppTexto(
            tel,
            `❓ Dúvida no curso ${curso?.nome}\nDe: ${func?.nome_completo}\n\n"${pergunta}"\n\nResponda no SIGO → RH & Segurança → Treinamentos → Dúvidas.`
          );
        } catch (e) {
          console.error("[portal-funcionario] aviso ao tutor:", (e as Error)?.message);
        }
      }
      return ok({ duvida });
    }

    return fail("Ação desconhecida", 400);
  })
);
