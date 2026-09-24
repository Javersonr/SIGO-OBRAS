/**
 * portal-funcionario — Portal do Funcionário (treinamentos EAD).
 *
 * Ações:
 *   { acao:"link", funcionario_id }                       [exige sessão STAFF]
 *   { acao:"dados", token }                               [anon + token]
 *     → funcionário, cursos, aulas (com video_url assinada p/ upload próprio),
 *       questões da avaliação (SEM gabarito) e estado da avaliação.
 *   { acao:"progresso", token, matricula_id, aula_id, segundos_assistidos,
 *     duracao_seg? }
 *   { acao:"avaliacao", token, matricula_id, respostas:[{questao_id,resposta}] }
 *     → corrige no servidor, grava nota; aprovação exige nota >= nota_minima.
 *       Aprovado: devolve `revisao` (acertou/resposta correta/comentário).
 *
 * CONCLUSÃO DO CURSO: todas as aulas >=90% assistidas E, se o curso tiver
 * questões, avaliação aprovada. Aí grava data_conclusao + proxima_renovacao.
 *
 * Segurança: funcionário NÃO tem sessão authenticated; tudo passa por aqui
 * (service role) validando o token HMAC e devolvendo só o escopo dele.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken, verifyPortalToken } from "../_shared/portal-token.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";

const TTL_LINK = 60 * 60 * 24 * 30; // 30 dias
const TTL_VIDEO = 60 * 60 * 3; // URL assinada do vídeo: 3h
const PCT_CONCLUSAO = 0.9;

interface Body {
  acao?: string;
  funcionario_id?: string;
  token?: string;
  matricula_id?: string;
  aula_id?: string;
  segundos_assistidos?: number;
  duracao_seg?: number;
  respostas?: { questao_id: string; resposta: number }[];
  ciencia_id?: string;
}

// deno-lint-ignore no-explicit-any
async function concluirSeCompleto(supabase: any, mat: any) {
  // todas as aulas concluídas?
  const [{ data: aulasCurso }, { data: progs }, { data: questoes }, { data: curso }] =
    await Promise.all([
      supabase
        .from("treinamento_aula")
        .select("id")
        .eq("curso_id", mat.curso_id)
        .is("deleted_at", null),
      supabase
        .from("treinamento_progresso")
        .select("aula_id, concluida")
        .eq("matricula_id", mat.id),
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
  const feitas = new Set(
    // deno-lint-ignore no-explicit-any
    (progs ?? []).filter((p: any) => p.concluida).map((p: any) => p.aula_id)
  );
  // deno-lint-ignore no-explicit-any
  const aulasOk =
    (aulasCurso ?? []).length > 0 && (aulasCurso ?? []).every((a: any) => feitas.has(a.id));
  const precisaAvaliacao = (questoes ?? []).length > 0;
  const avaliacaoOk = !precisaAvaliacao || mat.avaliacao_aprovada === true;

  if (!aulasOk)
    return {
      status: mat.status === "pendente" ? "em_andamento" : mat.status,
      concluiu: false,
      precisaAvaliacao,
    };
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

    // ---------------------------------------------------------------- link
    if (body.acao === "link") {
      const usuario = await usuarioDaRequisicao(req);
      if (!usuario) return fail("Sessão inválida", 401);
      if (!body.funcionario_id) return fail("funcionario_id é obrigatório", 400);
      const { data: func } = await supabase
        .from("funcionario")
        .select("id, empresa_id")
        .eq("id", body.funcionario_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!func) return fail("Funcionário não encontrado", 404);
      const token = await signPortalToken(
        { scope: "funcionario", empresa_id: func.empresa_id, funcionario_id: func.id },
        TTL_LINK
      );
      return ok({ token, url_path: `/#/PortalFuncionario?token=${encodeURIComponent(token)}` });
    }

    const payload = body.token ? await verifyPortalToken(body.token) : null;
    if (!payload || payload.scope !== "funcionario" || !payload.funcionario_id) {
      return fail("Link inválido ou expirado — peça um novo ao RH", 401);
    }
    const funcionarioId = payload.funcionario_id as string;
    const empresaId = payload.empresa_id as string;

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

      const cursoIds = [...new Set((mats ?? []).map((m) => m.curso_id))];
      const matIds = (mats ?? []).map((m) => m.id);
      const [{ data: cursos }, { data: aulas }, { data: prog }, { data: questoes }] =
        await Promise.all([
          cursoIds.length
            ? supabase.from("treinamento_curso").select("*").in("id", cursoIds)
            : Promise.resolve({ data: [] }),
          cursoIds.length
            ? supabase
                .from("treinamento_aula")
                .select("*")
                .in("curso_id", cursoIds)
                .is("deleted_at", null)
                .order("ordem", { ascending: true })
            : Promise.resolve({ data: [] }),
          matIds.length
            ? supabase.from("treinamento_progresso").select("*").in("matricula_id", matIds)
            : Promise.resolve({ data: [] }),
          cursoIds.length
            ? supabase
                .from("treinamento_questao")
                .select("id, curso_id, ordem, pergunta, opcoes") // SEM `correta`!
                .in("curso_id", cursoIds)
                .is("deleted_at", null)
                .order("ordem", { ascending: true })
            : Promise.resolve({ data: [] }),
        ]);

      // URLs assinadas dos vídeos hospedados e das legendas, em lote por bucket
      const refs = (aulas ?? []).flatMap((a) => [
        ...(a.fonte === "upload" && a.video_ref ? [a.video_ref] : []),
        ...(a.legenda_ref ? [a.legenda_ref] : []),
      ]);
      const porBucket = new Map<string, string[]>();
      for (const ref of refs) {
        const slash = ref.indexOf("/");
        const bucket = ref.slice(0, slash);
        porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), ref.slice(slash + 1)]);
      }
      const assinada = new Map<string, string>();
      for (const [bucket, caminhos] of porBucket) {
        const { data: lote } = await supabase.storage
          .from(bucket)
          .createSignedUrls(caminhos, TTL_VIDEO);
        for (const s of lote ?? []) {
          if (s.signedUrl && s.path) assinada.set(`${bucket}/${s.path}`, s.signedUrl);
        }
      }

      const progPor = new Map((prog ?? []).map((p) => [`${p.matricula_id}|${p.aula_id}`, p]));
      const resposta = (mats ?? []).map((m) => {
        const curso = (cursos ?? []).find((c) => c.id === m.curso_id) || null;
        const aulasCurso = (aulas ?? [])
          .filter((a) => a.curso_id === m.curso_id)
          .map((a) => {
            const p = progPor.get(`${m.id}|${a.id}`);
            return {
              id: a.id,
              ordem: a.ordem,
              titulo: a.titulo,
              fonte: a.fonte || "youtube",
              youtube_id: a.youtube_id,
              video_url:
                a.fonte === "upload" && a.video_ref ? assinada.get(a.video_ref) || null : null,
              legenda_url: a.legenda_ref ? assinada.get(a.legenda_ref) || null : null,
              duracao_seg: a.duracao_seg,
              segundos_assistidos: p?.segundos_assistidos ?? 0,
              concluida: p?.concluida ?? false,
            };
          });
        const questoesCurso = (questoes ?? []).filter((q) => q.curso_id === m.curso_id);
        return {
          matricula: m,
          curso: curso ? { ...curso, tem_avaliacao: questoesCurso.length > 0 } : curso,
          aulas: aulasCurso,
          questoes: questoesCurso,
        };
      });

      // ciências de entrega (EPI/ferramenta/documento) pendentes e recentes
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

    // ------------------------------------------------------------- ciência
    // Confirmação = assinatura eletrônica simples (Lei 14.063/2020): grava
    // quem (token do funcionário), quando, o quê e de onde (IP/dispositivo).
    if (body.acao === "ciencia") {
      const cienciaId = (body as { ciencia_id?: string }).ciencia_id;
      if (!cienciaId) return fail("ciencia_id é obrigatório", 400);
      const { data: ciencia } = await supabase
        .from("entrega_ciencia")
        .select("id, status, funcionario_id")
        .eq("id", cienciaId)
        .eq("funcionario_id", funcionarioId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!ciencia) return fail("Registro não encontrado", 404);
      if (ciencia.status === "confirmada") return ok({ message: "Já confirmada" });

      const evidencia = {
        metodo: "portal_funcionario_token",
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        dispositivo: req.headers.get("user-agent") || null,
        token_exp: payload.exp ?? null,
        confirmado_em: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("entrega_ciencia")
        .update({
          status: "confirmada",
          confirmada_em: new Date().toISOString(),
          evidencia,
        })
        .eq("id", cienciaId);
      if (error) return fail("Erro ao registrar ciência", 500);
      return ok({ message: "Ciência registrada", evidencia });
    }

    // ------------------------------------------------------------ progresso
    if (body.acao === "progresso") {
      const { matricula_id, aula_id } = body;
      const segundos = Math.max(0, Math.floor(Number(body.segundos_assistidos) || 0));
      if (!matricula_id || !aula_id) return fail("matricula_id e aula_id são obrigatórios", 400);

      const { data: mat } = await supabase
        .from("treinamento_matricula")
        .select("*")
        .eq("id", matricula_id)
        .eq("funcionario_id", funcionarioId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!mat) return fail("Matrícula não encontrada", 404);
      const { data: aula } = await supabase
        .from("treinamento_aula")
        .select("id, curso_id, duracao_seg")
        .eq("id", aula_id)
        .eq("curso_id", mat.curso_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!aula) return fail("Aula não pertence ao curso", 400);

      const duracaoInformada = Math.floor(Number(body.duracao_seg) || 0);
      if (!aula.duracao_seg && duracaoInformada > 0) {
        await supabase
          .from("treinamento_aula")
          .update({ duracao_seg: duracaoInformada })
          .eq("id", aula.id);
        aula.duracao_seg = duracaoInformada;
      }

      const { data: atual } = await supabase
        .from("treinamento_progresso")
        .select("*")
        .eq("matricula_id", matricula_id)
        .eq("aula_id", aula_id)
        .maybeSingle();

      let novoSeg = Math.max(segundos, atual?.segundos_assistidos ?? 0);
      if (aula.duracao_seg) novoSeg = Math.min(novoSeg, aula.duracao_seg);
      const concluiu =
        atual?.concluida ||
        (aula.duracao_seg ? novoSeg >= Math.floor(aula.duracao_seg * PCT_CONCLUSAO) : false);

      const { error: upErr } = await supabase.from("treinamento_progresso").upsert(
        {
          empresa_id: empresaId,
          matricula_id,
          aula_id,
          segundos_assistidos: novoSeg,
          concluida: concluiu,
          concluida_em:
            concluiu && !atual?.concluida
              ? new Date().toISOString()
              : (atual?.concluida_em ?? null),
        },
        { onConflict: "matricula_id,aula_id" }
      );
      if (upErr) {
        console.error("[portal-funcionario] progresso:", upErr);
        return fail("Erro ao salvar progresso", 500);
      }

      let resultado = { status: mat.status, concluiu: false, precisaAvaliacao: false };
      if (concluiu) {
        resultado = await concluirSeCompleto(supabase, mat);
      } else if (mat.status === "pendente") {
        resultado.status = "em_andamento";
      }
      if (resultado.status !== mat.status && resultado.status !== "concluido") {
        await supabase
          .from("treinamento_matricula")
          .update({ status: resultado.status })
          .eq("id", matricula_id);
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
      const { matricula_id } = body;
      const respostas = body.respostas ?? [];
      if (!matricula_id || !respostas.length) {
        return fail("matricula_id e respostas são obrigatórios", 400);
      }
      const { data: mat } = await supabase
        .from("treinamento_matricula")
        .select("*")
        .eq("id", matricula_id)
        .eq("funcionario_id", funcionarioId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!mat) return fail("Matrícula não encontrada", 404);

      const [{ data: questoes }, { data: curso }] = await Promise.all([
        supabase
          .from("treinamento_questao")
          .select("id, ordem, opcoes, correta, comentario")
          .eq("curso_id", mat.curso_id)
          .is("deleted_at", null)
          .order("ordem", { ascending: true }),
        supabase
          .from("treinamento_curso")
          .select("nota_minima")
          .eq("id", mat.curso_id)
          .maybeSingle(),
      ]);
      if (!questoes?.length) return fail("Este curso não tem avaliação", 400);

      const marcada = new Map(respostas.map((r) => [r.questao_id, Number(r.resposta)]));
      const acertou = (q: { id: string; correta: number }) => marcada.get(q.id) === q.correta;
      const acertos = questoes.filter(acertou).length;
      const nota = Math.round((acertos / questoes.length) * 100);
      const minima = curso?.nota_minima ?? 70;
      const aprovada = nota >= minima;

      await supabase
        .from("treinamento_matricula")
        .update({
          nota_avaliacao: nota,
          avaliacao_aprovada: aprovada,
          avaliacao_em: new Date().toISOString(),
        })
        .eq("id", matricula_id);

      let concluiu = false;
      if (aprovada) {
        const r = await concluirSeCompleto(supabase, { ...mat, avaliacao_aprovada: true });
        concluiu = r.concluiu;
      }

      // Correção comentada só após aprovar: antes disso, a nova tentativa
      // viraria cópia do gabarito.
      const revisao = aprovada
        ? questoes.map((q) => ({
            questao_id: q.id,
            acertou: acertou(q),
            resposta_correta: (q.opcoes as string[] | null)?.[q.correta] ?? null,
            comentario: q.comentario ?? null,
          }))
        : null;

      return ok({
        nota,
        nota_minima: minima,
        aprovada,
        acertos,
        total: questoes.length,
        curso_concluido: concluiu,
        revisao,
      });
    }

    return fail("Ação desconhecida", 400);
  })
);
