/**
 * portal-funcionario — Portal do Funcionário (treinamentos EAD).
 *
 * Ações:
 *   { acao:"link", funcionario_id }            [exige sessão de STAFF]
 *     → { success, url_path, token }  (token HMAC scope=funcionario, 30 dias)
 *
 *   { acao:"dados", token }                    [anon + token]
 *     → { success, funcionario, empresa_nome, cursos:[{matricula, curso,
 *         aulas:[{...aula, segundos_assistidos, concluida}] }] }
 *
 *   { acao:"progresso", token, matricula_id, aula_id, segundos_assistidos }
 *     → upsert monotônico do progresso; aula conclui com >=90% da duração;
 *       curso conclui quando TODAS as aulas concluírem (data + renovação).
 *
 * Segurança: mesmo desenho dos portais fornecedor/cliente — o funcionário
 * NÃO recebe sessão authenticated; todo acesso passa por aqui (service role)
 * validando o token e devolvendo só o escopo dele.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken, verifyPortalToken } from "../_shared/portal-token.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";

const TTL_LINK = 60 * 60 * 24 * 30; // 30 dias
const PCT_CONCLUSAO = 0.9;

interface Body {
  acao?: string;
  funcionario_id?: string;
  token?: string;
  matricula_id?: string;
  aula_id?: string;
  segundos_assistidos?: number;
  /** informado pelo player do YouTube quando a aula não tem duração cadastrada */
  duracao_seg?: number;
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
        .select("id, empresa_id, nome_completo")
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

    // demais ações exigem token válido de funcionário
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
      const [{ data: cursos }, { data: aulas }, { data: prog }] = await Promise.all([
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
      ]);

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
              youtube_id: a.youtube_id,
              duracao_seg: a.duracao_seg,
              segundos_assistidos: p?.segundos_assistidos ?? 0,
              concluida: p?.concluida ?? false,
            };
          });
        return { matricula: m, curso, aulas: aulasCurso };
      });

      return ok({
        funcionario: func,
        empresa_nome: emp?.nome || emp?.razao_social || "",
        cursos: resposta,
      });
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

      // duração desconhecida no cadastro: aceita a do player (uma vez)
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

      // monotônico + clamp na duração (se conhecida)
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

      // status do curso
      let statusNovo = mat.status;
      let cursoConcluido = false;
      if (mat.status === "pendente") statusNovo = "em_andamento";
      if (concluiu) {
        const [{ data: aulasCurso }, { data: progs }] = await Promise.all([
          supabase
            .from("treinamento_aula")
            .select("id")
            .eq("curso_id", mat.curso_id)
            .is("deleted_at", null),
          supabase
            .from("treinamento_progresso")
            .select("aula_id, concluida")
            .eq("matricula_id", matricula_id),
        ]);
        const feitas = new Set((progs ?? []).filter((p) => p.concluida).map((p) => p.aula_id));
        cursoConcluido = (aulasCurso ?? []).every((a) => feitas.has(a.id));
        if (cursoConcluido) statusNovo = "concluido";
      }

      if (statusNovo !== mat.status) {
        const patch: Record<string, unknown> = { status: statusNovo };
        if (statusNovo === "concluido") {
          const hoje = new Date();
          patch.data_conclusao = hoje.toISOString().slice(0, 10);
          const { data: curso } = await supabase
            .from("treinamento_curso")
            .select("validade_meses")
            .eq("id", mat.curso_id)
            .maybeSingle();
          if (curso?.validade_meses) {
            const renova = new Date(hoje);
            renova.setMonth(renova.getMonth() + curso.validade_meses);
            patch.proxima_renovacao = renova.toISOString().slice(0, 10);
          }
        }
        await supabase.from("treinamento_matricula").update(patch).eq("id", matricula_id);
      }

      return ok({
        segundos_assistidos: novoSeg,
        aula_concluida: concluiu,
        curso_concluido: cursoConcluido,
        status: statusNovo,
      });
    }

    return fail("Ação desconhecida", 400);
  })
);
