/**
 * funcionario-acesso — o RH gerencia o login do Portal do Funcionário.
 *
 * Exige sessão de STAFF, e o funcionário tem de ser da empresa ativa dessa
 * sessão (super admin passa). Ações:
 *   { acao:"status", empresa_id? }                   → { acessos:[...] } da empresa
 *   { acao:"criar", funcionario_id, usuario? }       → { usuario, senha_provisoria }
 *                                                      (já tem acesso: 409 com `codigo: "JA_TEM_ACESSO"`)
 *   { acao:"redefinir", funcionario_id }             → { usuario, senha_provisoria }
 *   { acao:"ativo", funcionario_id, ativo:boolean }  → { ativo }
 *   { acao:"liberar_tentativa", matricula_id, tentativas_extras_vistas }
 *                                                    → { tentativas_extras } (T18)
 *   { acao:"revogar_certificado", matricula_id, motivo }
 *                                                    → { revogado, aviso_whatsapp } (T18)
 *
 * Permissão (espelha a aba Funcionários de RH & Segurança, onde fica a ficha
 * com o AcessoPortalCard): super admin, Admin, dono ou permissão na aba.
 * "status" basta ver a aba; criar/redefinir/ativar e as ações de matrícula
 * exigem a função "editar".
 *
 * As ações de matrícula (regras em ./regras.ts) gravam um evento na trilha com
 * o e-mail do RH (`detalhe.por`): `tentativa_liberada` (que também zera o
 * intervalo entre tentativas no portal) e `certificado_revogado` (que avisa o
 * aluno por WhatsApp, sem derrubar a revogação se o aviso falhar ou demorar: o aviso tem
 * tempo limite). Sem o evento a ação é desfeita (500 `TRILHA_FALHOU`, pode repetir); se nem
 * desfazer dá, o efeito fica gravado sem evento e a resposta é 500 `EFEITO_SEM_REGISTRO`, que
 * manda NÃO repetir e avisar o suporte. O servidor também barra a repetição: a liberação traz o
 * número de extras que a tela mostrava (`tentativas_extras_vistas`, obrigatório) e só soma se a
 * matrícula ainda tem esse número; senão 409 `CONFLITO` e nada é gravado.
 *
 * A senha provisória volta UMA vez (para o RH entregar); no primeiro acesso o
 * funcionário cria a própria senha, que ninguém do RH conhece.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { hashPassword } from "../_shared/passwords.ts";
import { temPermissaoServidor, type Vinculo } from "../_shared/conector/acesso.ts";
import {
  EVENTO_CERTIFICADO_REVOGADO,
  EVENTO_TENTATIVA_LIBERADA,
  normalizarUsuario,
  gerarSenhaProvisoria,
  registrarEvento,
} from "../_shared/portal-funcionario.ts";
import { CanalNaoConfiguradoError, enviarWhatsAppTexto } from "../_shared/whatsapp-envio.ts";
import {
  ACOES_DE_MATRICULA,
  MENSAGEM_SEM_EDICAO,
  avisarAluno,
  dadosDaRevogacao,
  dadosParaDesfazerRevogacao,
  decidirLiberacao,
  decidirRevogacao,
  destinoDoAviso,
  detalheDaLiberacao,
  detalheDaRevogacao,
  falhaDoRegistro,
  motivoDaRevogacao,
  registrarOuDesfazer,
  textoAvisoRevogacao,
  validarExtrasVistas,
  validarMatriculaId,
} from "./regras.ts";

// mesmo módulo/aba do front (pages/SegurancaTrabalho.jsx → aba Funcionários)
const MODULO = "Segurança do Trabalho";
const ABA = "Funcionários";
const ACOES_ESCRITA = new Set(["criar", "redefinir", "ativo", ...ACOES_DE_MATRICULA]);

interface Body {
  acao?: string;
  empresa_id?: string;
  funcionario_id?: string;
  usuario?: string;
  ativo?: boolean;
  matricula_id?: string;
  motivo?: string;
  tentativas_extras_vistas?: unknown;
}

type Staff = { email: string; is_super_admin: boolean; empresa_id: string | null };

/**
 * Vínculo ATIVO do chamador na empresa da sessão (e-mail do usuário do JWT +
 * empresa do JWT). null = sem vínculo. Erro de leitura lança (vira 500).
 */
async function vinculoDoChamador(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
  empresaId: string | null
): Promise<Vinculo | null> {
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from("usuario_empresa")
    .select("perfil, is_owner, permissoes, ativo, deleted_at")
    .eq("usuario_email", email.toLowerCase())
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("usuario_empresa: " + error.message);
  return data ?? null;
}

/**
 * A matrícula da requisição, só se for da empresa da sessão (super admin vê qualquer uma). Matrícula de
 * outra empresa responde como inexistente. Erro de leitura lança (vira 500).
 */
async function matriculaDoChamador(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  staff: Staff,
  matriculaId: string
) {
  const { data, error } = await supabase
    .from("treinamento_matricula")
    .select(
      "id, empresa_id, funcionario_id, curso_id, tentativas_extras, avaliacao_aprovada, deleted_at"
    )
    .eq("id", matriculaId)
    .maybeSingle();
  if (error) throw new Error("treinamento_matricula: " + error.message);
  if (!data || (!staff.is_super_admin && data.empresa_id !== staff.empresa_id)) return null;
  return data;
}

/**
 * Libera mais uma tentativa da avaliação. Só soma se a matrícula tem as extras que a TELA mostrava
 * (`extrasVistas`, do pedido): depois de uma falha sem registro na trilha, repetir com a tela antiga dá
 * 409 em vez de somar de novo (T18, M4). A soma também só grava se a matrícula ainda tem o valor lido
 * (dois cliques seguidos não perdem uma liberação) e o evento `tentativa_liberada` é o que faz o portal
 * ignorar o intervalo: sem o evento a liberação é desfeita, para a trilha e a matrícula não divergirem.
 */
async function liberarTentativa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  staff: Staff,
  // deno-lint-ignore no-explicit-any
  mat: any,
  extrasVistas: number
): Promise<Response> {
  const decisao = decidirLiberacao(mat, extrasVistas);
  if (!decisao.ok) {
    if (decisao.codigo === "CONFLITO") {
      // nada foi gravado; o log ajuda o suporte a conferir (a trilha pode não ter o evento da anterior)
      console.warn(
        "[funcionario-acesso] liberar_tentativa recusada: a tela mostrava",
        extrasVistas,
        "tentativas extras e a matrícula tem",
        mat.tentativas_extras ?? 0,
        "(pode ser o 2º clique depois de uma falha sem registro). Matrícula:",
        mat.id,
        "Autor:",
        staff.email
      );
    }
    return fail(
      decisao.mensagem,
      decisao.status,
      decisao.codigo ? { codigo: decisao.codigo } : undefined
    );
  }

  const { data: gravadas, error } = await supabase
    .from("treinamento_matricula")
    .update({ tentativas_extras: decisao.extrasNovas })
    .eq("id", mat.id)
    .eq("empresa_id", mat.empresa_id)
    .eq("tentativas_extras", decisao.extrasAtuais)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[funcionario-acesso] liberar_tentativa:", error.message);
    return fail("Erro ao liberar a tentativa", 500);
  }
  if (!gravadas?.length) {
    return fail("A matrícula mudou agora há pouco. Atualize a tela e tente de novo.", 409, {
      codigo: "CONFLITO",
    });
  }

  // O evento é o que faz o portal ignorar o intervalo: sem ele a liberação é desfeita. Se nem desfazer
  // dá (o banco falhou duas vezes seguidas), a resposta é outra e o suporte confere (T18, M4).
  const registro = await registrarOuDesfazer({
    registrar: () =>
      registrarEvento(supabase, req, {
        empresa_id: mat.empresa_id,
        funcionario_id: mat.funcionario_id,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        evento: EVENTO_TENTATIVA_LIBERADA,
        detalhe: detalheDaLiberacao({ por: staff.email, extrasNovas: decisao.extrasNovas }),
      }),
    desfazer: async () => {
      const { data: desfeitas, error: erroDesfazer } = await supabase
        .from("treinamento_matricula")
        .update({ tentativas_extras: decisao.extrasAtuais })
        .eq("id", mat.id)
        .eq("empresa_id", mat.empresa_id)
        .eq("tentativas_extras", decisao.extrasNovas)
        .select("id");
      if (erroDesfazer) {
        console.error("[funcionario-acesso] liberar_tentativa: não desfez:", erroDesfazer.message);
      }
      // 0 linhas = o valor já tinha mudado: o efeito continua gravado
      return !erroDesfazer && (desfeitas?.length ?? 0) > 0;
    },
  });
  if (registro !== "registrado") {
    const falha = falhaDoRegistro({ acao: "liberar_tentativa", resultado: registro });
    if (registro === "sem_registro") {
      console.error(
        "[funcionario-acesso] liberar_tentativa: EFEITO SEM REGISTRO. A matrícula ficou com",
        decisao.extrasNovas,
        "tentativas extras (eram",
        decisao.extrasAtuais + ") e a trilha não tem o evento. Matrícula:",
        mat.id,
        "Autor:",
        staff.email
      );
    }
    return fail(falha.mensagem, falha.status, { codigo: falha.codigo });
  }
  return ok({ tentativas_extras: decisao.extrasNovas });
}

/**
 * Revoga o certificado da matrícula (só a empresa dona revoga; o servidor confere que ainda vale, para
 * não sobrescrever autor e motivo de uma revogação anterior), registra `certificado_revogado` na trilha
 * e avisa o aluno por WhatsApp. A revogação sem registro de quem a fez não fica (é desfeita); já o
 * aviso é só um recado: se falhar, a revogação vale e o RH vê o motivo na resposta.
 */
async function revogarCertificado(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  staff: Staff,
  // deno-lint-ignore no-explicit-any
  mat: any,
  motivo: string
): Promise<Response> {
  const { data: cert, error: erroLeitura } = await supabase
    .from("treinamento_certificado")
    .select("id, codigo, dados, revogado_em")
    .eq("matricula_id", mat.id)
    .eq("empresa_id", mat.empresa_id)
    .maybeSingle();
  if (erroLeitura) {
    console.error("[funcionario-acesso] revogar_certificado:", erroLeitura.message);
    return fail("Erro ao carregar o certificado", 500);
  }
  const decisao = decidirRevogacao(cert);
  if (!decisao.ok) return fail(decisao.mensagem, decisao.status);

  const quando = new Date();
  const { data: revogados, error } = await supabase
    .from("treinamento_certificado")
    .update(dadosDaRevogacao({ agora: quando, por: staff.email, motivo }))
    .eq("id", cert.id)
    .eq("empresa_id", mat.empresa_id)
    .is("revogado_em", null)
    .select("id");
  if (error) {
    console.error("[funcionario-acesso] revogar_certificado:", error.message);
    return fail("Erro ao revogar o certificado", 500);
  }
  if (!revogados?.length) return fail("O certificado já está revogado", 409);

  const registro = await registrarOuDesfazer({
    registrar: () =>
      registrarEvento(supabase, req, {
        empresa_id: mat.empresa_id,
        funcionario_id: mat.funcionario_id,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        evento: EVENTO_CERTIFICADO_REVOGADO,
        detalhe: detalheDaRevogacao({ por: staff.email, codigo: cert.codigo, motivo }),
      }),
    desfazer: async () => {
      const { data: desfeitos, error: erroDesfazer } = await supabase
        .from("treinamento_certificado")
        .update(dadosParaDesfazerRevogacao())
        .eq("id", cert.id)
        .eq("empresa_id", mat.empresa_id)
        .eq("revogado_em", quando.toISOString())
        .select("id");
      if (erroDesfazer) {
        console.error(
          "[funcionario-acesso] revogar_certificado: não desfez:",
          erroDesfazer.message
        );
      }
      return !erroDesfazer && (desfeitos?.length ?? 0) > 0;
    },
  });
  if (registro !== "registrado") {
    const falha = falhaDoRegistro({ acao: "revogar_certificado", resultado: registro });
    if (registro === "sem_registro") {
      console.error(
        "[funcionario-acesso] revogar_certificado: EFEITO SEM REGISTRO. Certificado",
        cert.codigo,
        "revogado sem o evento na trilha e sem aviso ao aluno. Matrícula:",
        mat.id,
        "Autor:",
        staff.email
      );
    }
    return fail(falha.mensagem, falha.status, { codigo: falha.codigo });
  }

  const { data: func, error: erroFunc } = await supabase
    .from("funcionario")
    .select("nome_completo, telefone, ativo, deleted_at")
    .eq("id", mat.funcionario_id)
    .eq("empresa_id", mat.empresa_id)
    .maybeSingle();
  // erro de leitura NÃO é "funcionário inativo": o aviso é dado como falho e o RH avisa por outro meio
  if (erroFunc) {
    console.error(
      "[funcionario-acesso] aviso da revogação: não leu o funcionário:",
      erroFunc.message
    );
  }
  const aviso = await avisarAluno({
    destino: destinoDoAviso(func, erroFunc),
    texto: textoAvisoRevogacao({
      nome: func?.nome_completo,
      curso: cert.dados?.curso?.nome,
      codigo: cert.codigo,
      empresa: cert.dados?.empresa?.nome,
      motivo,
    }),
    enviar: enviarWhatsAppTexto,
    canalNaoConfigurado: (e) => e instanceof CanalNaoConfiguradoError,
    aoFalhar: (e) =>
      console.error("[funcionario-acesso] aviso da revogação:", (e as Error)?.message),
  });
  return ok({ revogado: true, aviso_whatsapp: aviso });
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const staff = await usuarioDaRequisicao(req);
    if (!staff) return fail("Sessão inválida", 401);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const acao = body.acao ?? "";
    if (acao !== "status" && !ACOES_ESCRITA.has(acao)) return fail("Ação desconhecida", 400);
    const supabase = createAdminClient();

    // Antes: qualquer usuário da empresa (Compras, Estoque...) redefinia a
    // senha de qualquer funcionário e recebia a provisória. Agora: ver a aba
    // para qualquer ação; "editar" para o que altera o acesso (logo antes de
    // alterar, para o 409 JA_TEM_ACESSO do avisarNoPortal seguir igual).
    let podeEditar = true;
    if (!staff.is_super_admin) {
      const vinculo = await vinculoDoChamador(supabase, staff.email, staff.empresa_id);
      if (!vinculo || !temPermissaoServidor(vinculo, MODULO, ABA)) {
        return fail("Sem permissão para gerenciar o acesso ao Portal do Funcionário", 403);
      }
      podeEditar = temPermissaoServidor(vinculo, MODULO, ABA, "editar");
    }
    const semEdicao = () =>
      fail("Sem permissão para alterar o acesso ao Portal do Funcionário", 403);

    if (acao === "status") {
      // super admin consulta a empresa aberta na tela; os demais, só a da sessão
      const empresaId =
        staff.is_super_admin && body.empresa_id ? body.empresa_id : staff.empresa_id;
      if (!empresaId) return fail("Sessão sem empresa ativa", 400);
      const { data, error } = await supabase
        .from("funcionario_portal_acesso")
        .select("funcionario_id, usuario, ativo, senha_provisoria, bloqueado_ate, ultimo_acesso")
        .eq("empresa_id", empresaId);
      if (error) return fail("Erro ao carregar acessos", 500);
      const agora = Date.now();
      return ok({
        acessos: (data ?? []).map((a) => ({
          funcionario_id: a.funcionario_id,
          usuario: a.usuario,
          ativo: a.ativo,
          primeiro_acesso_pendente: a.senha_provisoria,
          bloqueado: !!a.bloqueado_ate && Date.parse(a.bloqueado_ate) > agora,
          ultimo_acesso: a.ultimo_acesso,
        })),
      });
    }

    // Ações de matrícula (T18): a identidade e a empresa vêm da sessão; a matrícula, do banco.
    if (ACOES_DE_MATRICULA.has(acao)) {
      if (!podeEditar) return fail(MENSAGEM_SEM_EDICAO[acao], 403);
      const idDaMatricula = validarMatriculaId(body.matricula_id);
      if (!idDaMatricula.ok) return fail(idDaMatricula.mensagem, idDaMatricula.status);
      let motivo = "";
      let extrasVistas = 0;
      if (acao === "revogar_certificado") {
        const m = motivoDaRevogacao(body.motivo);
        if (!m.ok) return fail(m.mensagem, m.status);
        motivo = m.motivo;
      } else {
        const v = validarExtrasVistas(body.tentativas_extras_vistas);
        if (!v.ok) return fail(v.mensagem, v.status);
        extrasVistas = v.extrasVistas;
      }
      const mat = await matriculaDoChamador(supabase, staff, idDaMatricula.id);
      if (!mat || mat.deleted_at) return fail("Matrícula não encontrada", 404);
      return acao === "liberar_tentativa"
        ? liberarTentativa(supabase, req, staff, mat, extrasVistas)
        : revogarCertificado(supabase, req, staff, mat, motivo);
    }

    if (!body.funcionario_id) return fail("funcionario_id é obrigatório", 400);
    const { data: func } = await supabase
      .from("funcionario")
      .select("id, empresa_id, cpf, nome_completo")
      .eq("id", body.funcionario_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!func) return fail("Funcionário não encontrado", 404);
    if (!staff.is_super_admin && func.empresa_id !== staff.empresa_id) {
      return fail("Funcionário de outra empresa", 403);
    }
    const { data: atual } = await supabase
      .from("funcionario_portal_acesso")
      .select("usuario, sessao_versao, ativo")
      .eq("funcionario_id", func.id)
      .maybeSingle();
    const evento = (nome: string) =>
      registrarEvento(supabase, req, {
        empresa_id: func.empresa_id,
        funcionario_id: func.id,
        evento: nome,
        detalhe: { por: staff.email },
      });

    if (body.acao === "criar") {
      // `codigo`: é por ele que o front (avisarNoPortal) reconhece este caso; o texto pode mudar
      if (atual) {
        return fail("Este funcionário já tem acesso — use Redefinir senha", 409, {
          codigo: "JA_TEM_ACESSO",
        });
      }
      if (!podeEditar) return semEdicao();
      const usuario = normalizarUsuario(body.usuario || func.cpf || "");
      if (!usuario) {
        return fail("Funcionário sem CPF cadastrado — informe um usuário", 400);
      }
      if (/^\d+$/.test(usuario) && usuario.length !== 11) {
        return fail(
          "CPF do funcionário incompleto — corrija o cadastro ou informe outro usuário",
          400
        );
      }
      const senha = gerarSenhaProvisoria();
      const { error } = await supabase.from("funcionario_portal_acesso").insert({
        funcionario_id: func.id,
        empresa_id: func.empresa_id,
        usuario,
        senha_hash: await hashPassword(senha),
        senha_provisoria: true,
        ativo: true,
        criado_por: staff.email,
      });
      if (error) {
        if (error.code === "23505") {
          return fail(`O usuário "${usuario}" já está em uso — informe outro`, 409);
        }
        console.error("[funcionario-acesso] criar:", error);
        return fail("Erro ao criar acesso", 500);
      }
      await evento("acesso_criado");
      return ok({ usuario, senha_provisoria: senha, url_path: "/PortalFuncionario" });
    }

    if (!atual) return fail("Este funcionário ainda não tem acesso ao portal", 404);
    if (!podeEditar) return semEdicao(); // redefinir / ativo

    if (body.acao === "redefinir") {
      const senha = gerarSenhaProvisoria();
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({
          senha_hash: await hashPassword(senha),
          senha_provisoria: true,
          ativo: true,
          tentativas: 0,
          bloqueado_ate: null,
          sessao_versao: atual.sessao_versao + 1,
        })
        .eq("funcionario_id", func.id);
      if (error) return fail("Erro ao redefinir senha", 500);
      await evento("senha_redefinida");
      return ok({
        usuario: atual.usuario,
        senha_provisoria: senha,
        url_path: "/PortalFuncionario",
      });
    }

    if (body.acao === "ativo") {
      const ativo = body.ativo === true;
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({
          ativo,
          // desativar derruba as sessões abertas na hora
          sessao_versao: ativo ? atual.sessao_versao : atual.sessao_versao + 1,
        })
        .eq("funcionario_id", func.id);
      if (error) return fail("Erro ao alterar acesso", 500);
      await evento(ativo ? "acesso_reativado" : "acesso_desativado");
      return ok({ ativo });
    }

    return fail("Ação desconhecida", 400);
  })
);
