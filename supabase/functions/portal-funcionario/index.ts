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
 *   trocar_senha { nova_senha, senha_atual? }   logout
 *   dados                                       evento { evento, matricula_id?, aula_id?, detalhe? }
 *   progresso { matricula_id, aula_id, segundos_assistidos, duracao_seg? }
 *   avaliacao { matricula_id, respostas:[{questao_id,resposta}] }
 *   certificado { matricula_id, senha }          ciencia { ciencia_id }
 *   duvida { matricula_id, aula_id?, pergunta }
 *
 * Trilha de auditoria (NR-1, Anexo II): todo acesso e atividade vira uma linha
 * em treinamento_evento com data/hora DO SERVIDOR, IP e dispositivo. O tempo
 * assistido informado pelo navegador é limitado pelo relógio do servidor
 * (ultimo_sinal_em), então não dá para "declarar" tempo que não passou.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken, verifyPortalToken } from "../_shared/portal-token.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { hashPassword, verifyPassword } from "../_shared/passwords.ts";
import {
  normalizarUsuario,
  motivoSenhaInvalida,
  registrarEvento,
  origemDaRequisicao,
  gerarCodigoCertificado,
  sha256Hex,
  type EventoPortal,
} from "../_shared/portal-funcionario.ts";
import { enviarWhatsAppTexto, normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";

const TTL_SESSAO = 60 * 60 * 12;
const TTL_ARQUIVO = 60 * 60 * 3; // URLs assinadas de vídeo/legenda/PDF
const PCT_CONCLUSAO = 0.9;
const TOLERANCIA_SEG = 2; // folga de rede por sinal de progresso
const MAX_FALHAS_LOGIN = 5;
const BLOQUEIO_MIN = 15;
const TEMPO_MINIMO_PADRAO = 60; // aula de PDF/texto sem tempo definido

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
  duracao_seg?: number;
  respostas?: { questao_id: string; resposta: number }[];
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

/** Aulas do curso em ordem + quais estão concluídas nesta matrícula. */
async function trilhaDoCurso(supabase: Db, cursoId: string, matriculaId: string) {
  const [{ data: aulas }, { data: progs }] = await Promise.all([
    supabase
      .from("treinamento_aula")
      .select("id, ordem, tipo, duracao_seg")
      .eq("curso_id", cursoId)
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

/** Progresso linear: só libera a aula se todas as anteriores estão concluídas. */
// deno-lint-ignore no-explicit-any
function aulaLiberada(trilha: { aulas: any[]; feitas: Set<unknown> }, aulaId: string) {
  for (const a of trilha.aulas) {
    if (a.id === aulaId) return true;
    if (!trilha.feitas.has(a.id)) return false;
  }
  return false;
}

// deno-lint-ignore no-explicit-any
async function concluirSeCompleto(supabase: Db, mat: any) {
  const [trilha, { data: questoes }, { data: curso }] = await Promise.all([
    trilhaDoCurso(supabase, mat.curso_id, mat.id),
    supabase
      .from("treinamento_questao")
      .select("id")
      .eq("curso_id", mat.curso_id)
      .is("deleted_at", null),
    supabase
      .from("treinamento_curso")
      .select("validade_meses")
      .eq("id", mat.curso_id)
      .maybeSingle(),
  ]);
  const aulasOk =
    trilha.aulas.length > 0 && trilha.aulas.every((a: { id: string }) => trilha.feitas.has(a.id));
  const precisaAvaliacao = (questoes ?? []).length > 0;
  const avaliacaoOk = !precisaAvaliacao || mat.avaliacao_aprovada === true;
  // precisaAvaliacao = "é a hora da prova": só quando TODAS as aulas terminaram
  if (!aulasOk) return { status: "em_andamento", concluiu: false, precisaAvaliacao: false };
  if (!avaliacaoOk) return { status: "em_andamento", concluiu: false, precisaAvaliacao };
  const hoje = new Date();
  const patch: Record<string, unknown> = {
    status: "concluido",
    data_conclusao: hoje.toISOString().slice(0, 10),
  };
  if (curso?.validade_meses) {
    const renova = new Date(hoje);
    renova.setMonth(renova.getMonth() + curso.validade_meses);
    patch.proxima_renovacao = renova.toISOString().slice(0, 10);
  }
  await supabase.from("treinamento_matricula").update(patch).eq("id", mat.id);
  return { status: "concluido", concluiu: true, precisaAvaliacao };
}

/** Assina em lote as referências "bucket/caminho" (vídeo, legenda, PDF). */
async function assinarRefs(supabase: Db, refs: string[]) {
  const porBucket = new Map<string, string[]>();
  for (const ref of new Set(refs.filter(Boolean))) {
    const i = ref.indexOf("/");
    if (i < 1) continue;
    const b = ref.slice(0, i);
    porBucket.set(b, [...(porBucket.get(b) ?? []), ref.slice(i + 1)]);
  }
  const assinada = new Map<string, string>();
  for (const [bucket, caminhos] of porBucket) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(caminhos, TTL_ARQUIVO);
    for (const s of data ?? []) {
      if (s.signedUrl && s.path) assinada.set(`${bucket}/${s.path}`, s.signedUrl);
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

      const { data: acesso } = await supabase
        .from("funcionario_portal_acesso")
        .select("*")
        .eq("usuario", usuario)
        .maybeSingle();
      if (!acesso) {
        await verifyPassword(senha, HASH_FICTICIO);
        return fail("Usuário ou senha incorretos", 401, { codigo: "CREDENCIAIS" });
      }
      const ev = (e: Omit<EventoPortal, "empresa_id" | "funcionario_id">) =>
        registrarEvento(supabase, req, {
          empresa_id: acesso.empresa_id,
          funcionario_id: acesso.funcionario_id,
          ...e,
        });

      if (acesso.bloqueado_ate && Date.parse(acesso.bloqueado_ate) > Date.now()) {
        return fail(
          `Acesso bloqueado por senhas erradas. Tente de novo às ${hora(acesso.bloqueado_ate)} ou fale com o RH.`,
          423,
          { codigo: "BLOQUEADO" }
        );
      }
      if (!acesso.ativo)
        return fail("Acesso desativado — fale com o RH", 403, { codigo: "DESATIVADO" });

      const { ok: senhaOk } = await verifyPassword(senha, acesso.senha_hash);
      if (!senhaOk) {
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
        return fail(
          bloquear
            ? `Muitas senhas erradas — acesso bloqueado até ${hora(bloqueadoAte!)}.`
            : "Usuário ou senha incorretos",
          401,
          { codigo: bloquear ? "BLOQUEADO" : "CREDENCIAIS" }
        );
      }

      const { data: func } = await supabase
        .from("funcionario")
        .select("nome_completo, deleted_at")
        .eq("id", acesso.funcionario_id)
        .maybeSingle();
      if (!func || func.deleted_at) return fail("Cadastro inativo — fale com o RH", 403);

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
    if (!acesso || !acesso.ativo || acesso.sessao_versao !== payload.v) {
      return fail("Sua sessão terminou — entre de novo", 401, { codigo: "SESSAO" });
    }
    const ev = (e: Omit<EventoPortal, "empresa_id" | "funcionario_id">) =>
      registrarEvento(supabase, req, {
        empresa_id: empresaId,
        funcionario_id: funcionarioId,
        ...e,
      });

    // --------------------------------------------------------- trocar senha
    if (body.acao === "trocar_senha") {
      const nova = body.nova_senha ?? "";
      if (!acesso.senha_provisoria) {
        const { ok: atualOk } = await verifyPassword(body.senha_atual ?? "", acesso.senha_hash);
        if (!atualOk) return fail("Senha atual incorreta", 400);
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
      await ev({ evento: "logout" });
      return ok({ message: "Até logo" });
    }

    if (acesso.senha_provisoria) {
      return fail("Crie sua senha pessoal para continuar", 403, { codigo: "TROCAR_SENHA" });
    }

    /** Matrícula do próprio funcionário (ou null). */
    const minhaMatricula = async (id?: string) => {
      if (!id) return null;
      const { data } = await supabase
        .from("treinamento_matricula")
        .select("*")
        .eq("id", id)
        .eq("funcionario_id", funcionarioId)
        .is("deleted_at", null)
        .maybeSingle();
      return data;
    };

    // ---------------------------------------------------------------- dados
    if (body.acao === "dados") {
      const [{ data: func }, { data: emp }, { data: mats }] = await Promise.all([
        supabase
          .from("funcionario")
          .select("id, nome_completo, funcao_nome")
          .eq("id", funcionarioId)
          .maybeSingle(),
        supabase.from("empresa").select("nome, razao_social").eq("id", empresaId).maybeSingle(),
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
      const [
        { data: cursos },
        { data: aulas },
        { data: prog },
        { data: questoes },
        { data: tentativas },
        { data: certificados },
        { data: duvidas },
      ] = await Promise.all([
        cursoIds.length ? supabase.from("treinamento_curso").select("*").in("id", cursoIds) : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_aula")
              .select("*")
              .in("curso_id", cursoIds)
              .is("deleted_at", null)
              .order("ordem", { ascending: true })
          : vazio,
        matIds.length
          ? supabase.from("treinamento_progresso").select("*").in("matricula_id", matIds)
          : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_questao")
              .select("id, curso_id, ordem, pergunta, opcoes") // SEM gabarito!
              .in("curso_id", cursoIds)
              .is("deleted_at", null)
              .order("ordem", { ascending: true })
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
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
          : vazio,
      ]);

      // deno-lint-ignore no-explicit-any
      const assinada = await assinarRefs(supabase, [
        // deno-lint-ignore no-explicit-any
        ...(aulas ?? []).flatMap((a: any) => [
          a.tipo === "video" && a.fonte === "upload" ? a.video_ref : null,
          a.legenda_ref,
          a.tipo === "pdf" ? a.arquivo_ref : null,
        ]),
        // deno-lint-ignore no-explicit-any
        ...(cursos ?? []).map((c: any) => c.projeto_pedagogico_ref),
      ]);
      const url = (ref?: string | null) => (ref ? (assinada.get(ref) ?? null) : null);
      const progPor = new Map(
        // deno-lint-ignore no-explicit-any
        (prog ?? []).map((p: any) => [`${p.matricula_id}|${p.aula_id}`, p])
      );
      const agora = Date.now();

      // deno-lint-ignore no-explicit-any
      const resposta = (mats ?? []).map((m: any) => {
        // deno-lint-ignore no-explicit-any
        const curso: any = (cursos ?? []).find((c: any) => c.id === m.curso_id) || null;
        let anterioresOk = true;
        const aulasCurso = (aulas ?? [])
          // deno-lint-ignore no-explicit-any
          .filter((a: any) => a.curso_id === m.curso_id)
          // deno-lint-ignore no-explicit-any
          .map((a: any) => {
            // deno-lint-ignore no-explicit-any
            const p: any = progPor.get(`${m.id}|${a.id}`);
            const concluida = p?.concluida ?? false;
            const liberada = anterioresOk;
            anterioresOk = anterioresOk && concluida;
            return {
              id: a.id,
              ordem: a.ordem,
              modulo: a.modulo,
              tipo: a.tipo || "video",
              titulo: a.titulo,
              fonte: a.fonte || "youtube",
              youtube_id: a.youtube_id,
              video_url: a.tipo === "video" && a.fonte === "upload" ? url(a.video_ref) : null,
              legenda_url: url(a.legenda_ref),
              arquivo_url: a.tipo === "pdf" ? url(a.arquivo_ref) : null,
              conteudo_texto: a.tipo === "texto" ? a.conteudo_texto : null,
              duracao_seg: a.duracao_seg || (a.tipo === "video" ? null : TEMPO_MINIMO_PADRAO),
              segundos_assistidos: p?.segundos_assistidos ?? 0,
              concluida,
              liberada,
            };
          });
        // deno-lint-ignore no-explicit-any
        const questoesCurso = (questoes ?? []).filter((q: any) => q.curso_id === m.curso_id);
        // deno-lint-ignore no-explicit-any
        const tents = (tentativas ?? []).filter((t: any) => t.matricula_id === m.id);
        const ultima = tents[tents.length - 1];
        const max =
          curso?.max_tentativas > 0 ? curso.max_tentativas + (m.tentativas_extras || 0) : null;
        const liberaEm =
          ultima && !ultima.aprovada && curso?.intervalo_tentativa_min > 0
            ? Date.parse(ultima.created_at) + curso.intervalo_tentativa_min * 60_000
            : 0;
        // deno-lint-ignore no-explicit-any
        const cert: any = (certificados ?? []).find((c: any) => c.matricula_id === m.id) || null;
        return {
          matricula: m,
          curso: curso && {
            id: curso.id,
            nome: curso.nome,
            codigo: curso.codigo,
            descricao: curso.descricao,
            carga_horaria_horas: curso.carga_horaria_horas,
            projeto_pedagogico_url: url(curso.projeto_pedagogico_ref),
            tem_avaliacao: questoesCurso.length > 0,
          },
          aulas: aulasCurso,
          questoes: questoesCurso,
          avaliacao: {
            tentativas_usadas: tents.length,
            tentativas_max: max,
            limite_atingido: max !== null && tents.length >= max && !m.avaliacao_aprovada,
            proxima_em: liberaEm > agora ? new Date(liberaEm).toISOString() : null,
            nota_minima: curso?.nota_minima ?? 70,
          },
          certificado: cert && {
            codigo: cert.codigo,
            dados: cert.dados,
            assinatura_aluno: cert.assinatura_aluno,
            emitido_em: cert.emitido_em,
            hash_sha256: cert.hash_sha256,
            revogado: !!cert.revogado_em,
          },
          pode_emitir_certificado:
            m.status === "concluido" && !cert && !!curso?.carga_horaria_horas,
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

      return ok({
        funcionario: func,
        empresa_nome: emp?.nome || emp?.razao_social || "",
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

      if (nome === "abrir_aula") {
        if (!mat || !body.aula_id) return fail("matricula_id e aula_id são obrigatórios", 400);
        const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id);
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
        detalhe: body.detalhe ?? null,
      });
      return ok({ registrado: true });
    }

    // ------------------------------------------------------------ progresso
    if (body.acao === "progresso") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id);
      // deno-lint-ignore no-explicit-any
      const aula: any = trilha.aulas.find((a: { id: string }) => a.id === body.aula_id);
      if (!aula) return fail("Aula não pertence ao curso", 400);
      if (!aulaLiberada(trilha, aula.id)) {
        return fail("Conclua a aula anterior primeiro", 409, { codigo: "AULA_BLOQUEADA" });
      }

      const informada = Math.floor(Number(body.duracao_seg) || 0);
      if (aula.tipo === "video" && !aula.duracao_seg && informada > 0) {
        await supabase
          .from("treinamento_aula")
          .update({ duracao_seg: informada })
          .eq("id", aula.id);
        aula.duracao_seg = informada;
      }
      const duracao = aula.duracao_seg || (aula.tipo === "video" ? 0 : TEMPO_MINIMO_PADRAO);

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
      const ultimoSinal = acesso.ultimo_sinal_em ? Date.parse(acesso.ultimo_sinal_em) : agora;
      const decorrido = Math.max(0, (agora - ultimoSinal) / 1000);
      const pedido = Math.max(0, Math.floor(Number(body.segundos_assistidos) || 0) - jaTinha);
      const aceito = Math.min(pedido, Math.floor(decorrido + TOLERANCIA_SEG));
      let novoSeg = jaTinha + aceito;
      if (duracao) novoSeg = Math.min(novoSeg, duracao);

      await supabase
        .from("funcionario_portal_acesso")
        .update({ ultimo_sinal_em: new Date(agora).toISOString() })
        .eq("funcionario_id", funcionarioId);
      if (pedido > aceito + TOLERANCIA_SEG) {
        await ev({
          evento: "progresso_ajustado",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { pedido, aceito, decorrido: Math.round(decorrido) },
        });
      }

      const concluiu =
        atual?.concluida || (duracao ? novoSeg >= Math.floor(duracao * PCT_CONCLUSAO) : false);
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
        await ev({
          evento: "aula_concluida",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { segundos: novoSeg, duracao },
        });
        resultado = await concluirSeCompleto(supabase, mat);
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
        aula_concluida: concluiu,
        curso_concluido: resultado.concluiu,
        precisa_avaliacao: resultado.precisaAvaliacao && !mat.avaliacao_aprovada,
        status: resultado.status,
      });
    }

    // ------------------------------------------------------------ avaliação
    if (body.acao === "avaliacao") {
      const respostas = body.respostas ?? [];
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      if (!respostas.length) return fail("Envie as respostas", 400);
      if (mat.avaliacao_aprovada) return fail("Você já foi aprovado nesta avaliação", 409);

      const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id);
      if (!trilha.aulas.every((a: { id: string }) => trilha.feitas.has(a.id))) {
        return fail("Conclua todas as aulas antes da avaliação", 409);
      }
      const [{ data: questoes }, { data: curso }, { data: anteriores }] = await Promise.all([
        supabase
          .from("treinamento_questao")
          .select("id, ordem, pergunta, opcoes, correta, comentario")
          .eq("curso_id", mat.curso_id)
          .is("deleted_at", null)
          .order("ordem", { ascending: true }),
        supabase
          .from("treinamento_curso")
          .select("nota_minima, max_tentativas, intervalo_tentativa_min")
          .eq("id", mat.curso_id)
          .maybeSingle(),
        supabase
          .from("treinamento_tentativa")
          .select("numero, aprovada, created_at")
          .eq("matricula_id", mat.id)
          .order("numero", { ascending: false }),
      ]);
      if (!questoes?.length) return fail("Este curso não tem avaliação", 400);

      const usadas = anteriores?.length ?? 0;
      const max =
        curso?.max_tentativas > 0 ? curso.max_tentativas + (mat.tentativas_extras || 0) : null;
      if (max !== null && usadas >= max) {
        return fail("Você usou todas as tentativas. Procure o RH para liberar uma nova.", 403, {
          codigo: "LIMITE_TENTATIVAS",
        });
      }
      const ultima = anteriores?.[0];
      if (ultima && !ultima.aprovada && curso?.intervalo_tentativa_min > 0) {
        const libera = Date.parse(ultima.created_at) + curso.intervalo_tentativa_min * 60_000;
        if (Date.now() < libera) {
          return fail(
            `Nova tentativa liberada às ${hora(new Date(libera).toISOString())}. Revise as aulas enquanto isso.`,
            429,
            { codigo: "AGUARDAR", liberada_em: new Date(libera).toISOString() }
          );
        }
      }

      const marcada = new Map(respostas.map((r) => [r.questao_id, Number(r.resposta)]));
      const acertou = (q: { id: string; correta: number }) => marcada.get(q.id) === q.correta;
      const acertos = questoes.filter(acertou).length;
      const nota = Math.round((acertos / questoes.length) * 100);
      const minima = curso?.nota_minima ?? 70;
      const aprovada = nota >= minima;
      const numero = usadas + 1;

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
          resposta: marcada.has(q.id) ? marcada.get(q.id) : null,
          acertou: acertou(q),
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
        const r = await concluirSeCompleto(supabase, { ...mat, avaliacao_aprovada: true });
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
      const liberaEm =
        !aprovada && curso?.intervalo_tentativa_min > 0
          ? new Date(Date.now() + curso.intervalo_tentativa_min * 60_000).toISOString()
          : null;

      return ok({
        nota,
        nota_minima: minima,
        aprovada,
        acertos,
        total: questoes.length,
        tentativa: numero,
        tentativas_max: max,
        proxima_em: liberaEm,
        curso_concluido: concluiu,
        revisao,
      });
    }

    // ---------------------------------------------------------- certificado
    // Emissão = assinatura eletrônica do aluno: ele confirma a declaração com
    // a SENHA pessoal (só ele conhece), e o servidor registra quando/de onde.
    if (body.acao === "certificado") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      if (mat.status !== "concluido")
        return fail("Conclua o curso antes de emitir o certificado", 409);

      const { data: existente } = await supabase
        .from("treinamento_certificado")
        .select("codigo, dados, assinatura_aluno, emitido_em, hash_sha256, revogado_em")
        .eq("matricula_id", mat.id)
        .maybeSingle();
      if (existente) {
        return ok({ certificado: { ...existente, revogado: !!existente.revogado_em } });
      }

      const { ok: senhaOk } = await verifyPassword(body.senha ?? "", acesso.senha_hash);
      if (!senhaOk) return fail("Senha incorreta — a assinatura não foi feita", 400);

      const [{ data: curso }, { data: func }, { data: emp }, { data: aulas }, { data: aprov }] =
        await Promise.all([
          supabase.from("treinamento_curso").select("*").eq("id", mat.curso_id).maybeSingle(),
          supabase
            .from("funcionario")
            .select("nome_completo, cpf, funcao_nome")
            .eq("id", funcionarioId)
            .maybeSingle(),
          supabase
            .from("empresa")
            .select("nome, razao_social, cnpj")
            .eq("id", empresaId)
            .maybeSingle(),
          supabase
            .from("treinamento_aula")
            .select("ordem, modulo, titulo")
            .eq("curso_id", mat.curso_id)
            .is("deleted_at", null)
            .order("ordem", { ascending: true }),
          supabase
            .from("treinamento_tentativa")
            .select("numero, nota")
            .eq("matricula_id", mat.id)
            .eq("aprovada", true)
            .order("numero", { ascending: false })
            .limit(1),
        ]);
      if (!curso?.carga_horaria_horas) {
        return fail("O curso ainda não tem carga horária definida — procure o RH", 409);
      }

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
        avaliacao: aprov?.[0] ? { nota: aprov[0].nota, tentativa: aprov[0].numero } : null,
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
      };

      for (let i = 0; i < 3; i++) {
        const codigo = gerarCodigoCertificado();
        const hash = await sha256Hex(JSON.stringify({ codigo, dados, assinatura }));
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
      if (!body.ciencia_id) return fail("ciencia_id é obrigatório", 400);
      const { data: ciencia } = await supabase
        .from("entrega_ciencia")
        .select("id, status")
        .eq("id", body.ciencia_id)
        .eq("funcionario_id", funcionarioId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!ciencia) return fail("Registro não encontrado", 404);
      if (ciencia.status === "confirmada") return ok({ message: "Já confirmada" });
      const evidencia = {
        metodo: "portal_funcionario_login",
        usuario: acesso.usuario,
        confirmado_em: agoraIso(),
        ...origemDaRequisicao(req),
      };
      const { error } = await supabase
        .from("entrega_ciencia")
        .update({ status: "confirmada", confirmada_em: evidencia.confirmado_em, evidencia })
        .eq("id", ciencia.id);
      if (error) return fail("Erro ao registrar ciência", 500);
      await ev({ evento: "ciencia", detalhe: { ciencia_id: ciencia.id } });
      return ok({ message: "Ciência registrada", evidencia });
    }

    // -------------------------------------------------------------- dúvida
    if (body.acao === "duvida") {
      const pergunta = (body.pergunta ?? "").trim();
      if (pergunta.length < 3) return fail("Escreva sua dúvida", 400);
      if (pergunta.length > 2000) return fail("Dúvida longa demais (máx. 2000 caracteres)", 400);
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);

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
          .maybeSingle(),
        supabase.from("funcionario").select("nome_completo").eq("id", funcionarioId).maybeSingle(),
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
