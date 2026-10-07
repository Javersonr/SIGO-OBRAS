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
 *   { acao:"editar_resposta_duvida", duvida_id, resposta }
 *                                                    → { editada } (A6, T21)
 *
 * Permissão (T33, `permissaoDaAcao` em ./regras.ts): super admin, Admin, dono ou a
 * permissão da ação. O acesso ao portal (criar, redefinir, ativar) segue em
 * Segurança do Trabalho → Funcionários (a Ficha); "status" aceita também quem tem
 * Treinamentos EAD → Matricular, com a lista recortada (só funcionario_id e ativo),
 * e "criar" o deixa entrar só para o 409 JA_TEM_ACESSO (criar exige Funcionários →
 * Editar: `decidirCriar`). Liberar tentativa, revogar certificado e editar a resposta
 * de uma dúvida exigem a função própria da aba Treinamentos EAD.
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
 * Editar a resposta de uma dúvida (A6, T21) também passa por aqui: o servidor troca o texto e grava o evento
 * `duvida_resposta_editada` com a versão ANTERIOR inteira (a trilha é só de inclusão), com a mesma regra de
 * desfazer se o evento não grava (regras em ./duvida.ts). A primeira resposta segue pela tela do RH.
 *
 * A senha provisória volta UMA vez (para o RH entregar); no primeiro acesso o
 * funcionário cria a própria senha, que ninguém do RH conhece.
 *
 * T38 (um login em mais de uma empresa; spec docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md):
 * a senha é da PESSOA (`portal_credencial`) e cada cadastro tem o seu VÍNCULO (`funcionario_portal_acesso`). O RH só
 * mexe no vínculo da empresa dele:
 *   - criar: com CPF no cadastro o usuário é SEMPRE o CPF (dígitos verificadores certos; o `usuario` do corpo é
 *     ignorado); a credencial do CPF, de qualquer empresa, é ligada ao cadastro, e a resposta é a mesma exista ela ou
 *     não. 409: `JA_TEM_ACESSO` (este cadastro), `OUTRO_CADASTRO_COM_ACESSO` (outro cadastro ativo da pessoa NESTA
 *     empresa), `USUARIO_EM_USO` (usuário com letras já usado). Nenhum diz nada de outra empresa;
 *   - redefinir: provisória nova do vínculo (vence em 7 dias), a senha atual deixa de abrir esta empresa e as sessões
 *     dela caem; não mexe na senha pessoal nem no bloqueio (é da pessoa); religa ao CPF novo quando o CPF mudou;
 *   - ativo: só o vínculo desta empresa; reativar recusa `OUTRO_CADASTRO_COM_ACESSO`;
 *   - status: só os vínculos da empresa, com a situação (`statusDoVinculo`); "Bloqueado" só em vínculo liberado.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { hashPassword } from "../_shared/passwords.ts";
import type { Vinculo } from "../_shared/conector/acesso.ts";
import {
  EVENTO_CERTIFICADO_REVOGADO,
  EVENTO_DUVIDA_RESPOSTA_EDITADA,
  EVENTO_TENTATIVA_LIBERADA,
  gerarSenhaProvisoria,
  registrarEvento,
} from "../_shared/portal-funcionario.ts";
import {
  COLUNAS_CADASTRO,
  COLUNAS_CREDENCIAL,
  COLUNAS_VINCULO,
  alvoDaRedefinicao,
  conflitoDeOutroCadastro,
  decidirCriarVinculo,
  efeitoDaRedefinicao,
  montarItens,
  provisoriaNova,
  respostaDoCriar,
  statusDoVinculo,
  usuarioDoAcesso,
  lerEmLotes,
  type CadastroDoPortal,
  type CredencialDoPortal,
  type ItemDoVinculo,
  type Recusa,
  type VinculoDoPortal,
} from "../_shared/portal-credencial.ts";
import { CanalNaoConfiguradoError, enviarWhatsAppTexto } from "../_shared/whatsapp-envio.ts";
import {
  ACOES_DE_MATRICULA,
  MENSAGEM_SEM_EDICAO,
  avaliarPermissao,
  avisarAluno,
  dadosDaRevogacao,
  dadosParaDesfazerRevogacao,
  decidirCriar,
  decidirLiberacao,
  decidirRevogacao,
  destinoDoAviso,
  detalheDaLiberacao,
  detalheDaRevogacao,
  falhaDoRegistro,
  mensagemSemPermissao,
  motivoDaRevogacao,
  permissaoDaAcao,
  recortarAcessosParaEad,
  registrarOuDesfazer,
  textoAvisoRevogacao,
  validarExtrasVistas,
  validarMatriculaId,
} from "./regras.ts";
import {
  ACOES_DE_DUVIDA,
  MENSAGEM_SEM_EDICAO_DA_RESPOSTA,
  dadosDaEdicao,
  dadosParaDesfazerEdicao,
  decidirEdicaoDaResposta,
  detalheDaEdicao,
  falhaDoRegistroDaEdicao,
  validarDuvidaId,
  validarRespostaDaDuvida,
} from "./duvida.ts";

interface Body {
  acao?: string;
  empresa_id?: string;
  funcionario_id?: string;
  usuario?: string;
  ativo?: boolean;
  matricula_id?: string;
  motivo?: string;
  tentativas_extras_vistas?: unknown;
  duvida_id?: string;
  resposta?: unknown;
}

type Staff = { email: string; is_super_admin: boolean; empresa_id: string | null };

/**
 * A credencial de um usuário (o CPF ou o usuário com letras) e se ela é ÓRFÃ (nenhum vínculo e sem senha: sobra de
 * um `criar` cujo vínculo falhou ao gravar; as funções não apagam linha alguma, então ela é reaproveitada). Saber se
 * há vínculo em qualquer empresa só serve a essa decisão: a resposta ao RH é a mesma. Erro de leitura lança.
 */
async function credencialDoUsuario(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  usuario: string
): Promise<{ id: string; tipo: "cpf" | "manual"; orfa: boolean } | null> {
  const { data, error } = await supabase
    .from("portal_credencial")
    .select("id, tipo, senha_hash")
    .eq("usuario", usuario)
    .maybeSingle();
  if (error) throw new Error("credencial: " + error.message);
  if (!data) return null;
  const { data: vinculos, error: erroVinculos } = await supabase
    .from("funcionario_portal_acesso")
    .select("funcionario_id")
    .eq("credencial_id", data.id)
    .limit(1);
  if (erroVinculos) throw new Error("vínculos da credencial: " + erroVinculos.message);
  return { id: data.id, tipo: data.tipo, orfa: !data.senha_hash && !(vinculos ?? []).length };
}

/**
 * Os vínculos de uma credencial (a pessoa) NA empresa do RH, com o cadastro de cada um: a regra do outro cadastro da
 * mesma pessoa na mesma empresa (§3.3 do spec da T38). Nunca lê vínculo de outra empresa. Erro de leitura lança.
 */
async function vinculosDaCredencialNaEmpresa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  credencialId: string,
  empresaId: string
): Promise<ItemDoVinculo[]> {
  const { data: vinculos, error } = await supabase
    .from("funcionario_portal_acesso")
    .select(COLUNAS_VINCULO)
    .eq("credencial_id", credencialId)
    .eq("empresa_id", empresaId);
  if (error) throw new Error("vínculos da pessoa: " + error.message);
  const ids = (vinculos ?? []).map((v: VinculoDoPortal) => v.funcionario_id);
  if (!ids.length) return [];
  // sem filtro de deleted_at: o cadastro apagado conta como inativo (readmissão)
  const { data: cadastros, error: erroCadastros } = await supabase
    .from("funcionario")
    .select(COLUNAS_CADASTRO)
    .in("id", ids)
    .eq("empresa_id", empresaId);
  if (erroCadastros) throw new Error("cadastros da pessoa: " + erroCadastros.message);
  return montarItens(vinculos, cadastros);
}

/**
 * Readmissão (§3.3): desativa o vínculo dos outros cadastros (inativos ou apagados) da pessoa nesta empresa, derruba
 * as sessões deles e grava `acesso_desativado` na trilha de cada um. Erro lança (o chamador responde 500).
 */
async function desativarOutrosCadastros(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  staff: Staff,
  empresaId: string,
  funcionarioIds: string[]
) {
  for (const funcionarioId of funcionarioIds) {
    const { data: v, error } = await supabase
      .from("funcionario_portal_acesso")
      .select("sessao_versao")
      .eq("funcionario_id", funcionarioId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (error) throw new Error("vínculo antigo: " + error.message);
    if (!v) continue;
    const { error: erroUpdate } = await supabase
      .from("funcionario_portal_acesso")
      .update({ ativo: false, sessao_versao: v.sessao_versao + 1 })
      .eq("funcionario_id", funcionarioId)
      .eq("empresa_id", empresaId);
    if (erroUpdate) throw new Error("desativar o vínculo antigo: " + erroUpdate.message);
    await registrarEvento(supabase, req, {
      empresa_id: empresaId,
      funcionario_id: funcionarioId,
      evento: "acesso_desativado",
      detalhe: { por: staff.email, motivo: "outro_cadastro" },
    });
  }
}

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
 * A dúvida da requisição, só se for da empresa da sessão (super admin vê qualquer uma). Dúvida de outra
 * empresa responde como inexistente. Erro de leitura lança (vira 500).
 */
async function duvidaDoChamador(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  staff: Staff,
  duvidaId: string
) {
  const { data, error } = await supabase
    .from("treinamento_duvida")
    .select(
      "id, empresa_id, funcionario_id, curso_id, matricula_id, resposta, respondida_por, respondida_em, updated_at, deleted_at"
    )
    .eq("id", duvidaId)
    .maybeSingle();
  if (error) throw new Error("treinamento_duvida: " + error.message);
  if (!data || (!staff.is_super_admin && data.empresa_id !== staff.empresa_id)) return null;
  return data;
}

/** Nome do usuário do SIGO (o que a tela já gravava em `respondida_por`); sem ele, o e-mail da sessão. */
async function nomeDoAutor(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string
): Promise<string> {
  const { data, error } = await supabase
    .from("usuario_custom")
    .select("nome_completo")
    .eq("email", email.toLowerCase())
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[funcionario-acesso] nome do autor da resposta:", error.message);
    return email;
  }
  const nome = typeof data?.nome_completo === "string" ? data.nome_completo.trim() : "";
  return nome || email;
}

/**
 * Edita a resposta de uma dúvida já respondida (A6, T21). Grava só se a dúvida continua como foi lida
 * (`updated_at`: duas edições seguidas não perdem uma versão), e o evento `duvida_resposta_editada` leva a
 * versão ANTERIOR inteira e o e-mail de quem editou. Sem o evento a edição é desfeita (a resposta anterior
 * volta); se nem desfazer dá, a resposta é `EFEITO_SEM_REGISTRO` e a versão anterior vai para o log.
 */
async function editarRespostaDaDuvida(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  staff: Staff,
  // deno-lint-ignore no-explicit-any
  duvida: any,
  respostaNova: string
): Promise<Response> {
  const decisao = decidirEdicaoDaResposta(duvida, respostaNova);
  if (!decisao.ok) {
    return fail(
      decisao.mensagem,
      decisao.status,
      decisao.codigo ? { codigo: decisao.codigo } : undefined
    );
  }
  if (!decisao.mudou) return ok({ editada: false });

  const quando = new Date();
  const autor = await nomeDoAutor(supabase, staff.email);
  const nova = dadosDaEdicao({ resposta: respostaNova, por: autor, agora: quando });
  let gravar = supabase
    .from("treinamento_duvida")
    .update(nova)
    .eq("id", duvida.id)
    .eq("empresa_id", duvida.empresa_id)
    .is("deleted_at", null);
  gravar = decisao.lidaEm ? gravar.eq("updated_at", decisao.lidaEm) : gravar;
  const { data: gravadas, error } = await gravar.select("id, updated_at");
  if (error) {
    console.error("[funcionario-acesso] editar_resposta_duvida:", error.message);
    return fail("Erro ao editar a resposta", 500);
  }
  if (!gravadas?.length) {
    return fail("A dúvida mudou agora há pouco. Atualize a tela e tente de novo.", 409, {
      codigo: "CONFLITO",
    });
  }

  const registro = await registrarOuDesfazer({
    // a exceção de um passo (rede, banco) conta como falha; a causa fica no log
    aoFalhar: (passo, erro) =>
      console.error("[funcionario-acesso] editar_resposta_duvida: o passo lançou:", passo, erro),
    registrar: () =>
      registrarEvento(supabase, req, {
        empresa_id: duvida.empresa_id,
        funcionario_id: duvida.funcionario_id,
        matricula_id: duvida.matricula_id ?? null,
        curso_id: duvida.curso_id,
        evento: EVENTO_DUVIDA_RESPOSTA_EDITADA,
        detalhe: detalheDaEdicao({
          por: staff.email,
          duvidaId: duvida.id,
          anterior: decisao.anterior,
        }),
      }),
    desfazer: async () => {
      const { data: desfeitas, error: erroDesfazer } = await supabase
        .from("treinamento_duvida")
        .update(dadosParaDesfazerEdicao(decisao.anterior))
        .eq("id", duvida.id)
        .eq("empresa_id", duvida.empresa_id)
        .eq("respondida_em", nova.respondida_em)
        .select("id");
      if (erroDesfazer) {
        console.error(
          "[funcionario-acesso] editar_resposta_duvida: não desfez:",
          erroDesfazer.message
        );
      }
      // 0 linhas = a dúvida já tinha mudado de novo: a edição continua gravada
      return !erroDesfazer && (desfeitas?.length ?? 0) > 0;
    },
  });
  if (registro !== "registrado") {
    if (registro === "sem_registro") {
      console.error(
        "[funcionario-acesso] editar_resposta_duvida: EFEITO SEM REGISTRO. A dúvida",
        duvida.id,
        "ficou com a resposta nova e a trilha não tem o evento. VERSÃO ANTERIOR (guarde):",
        JSON.stringify(decisao.anterior),
        "Autor:",
        staff.email
      );
    }
    const falha = falhaDoRegistroDaEdicao(registro);
    return fail(falha.mensagem, falha.status, { codigo: falha.codigo });
  }
  return ok({ editada: true });
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
    // a exceção de um passo (rede, banco) conta como falha; a causa fica no log
    aoFalhar: (passo, erro) =>
      console.error("[funcionario-acesso] liberar_tentativa: o passo lançou:", passo, erro),
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
    // a exceção de um passo (rede, banco) conta como falha; a causa fica no log
    aoFalhar: (passo, erro) =>
      console.error("[funcionario-acesso] revogar_certificado: o passo lançou:", passo, erro),
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
    if (!permissaoDaAcao(acao)) return fail("Ação desconhecida", 400);
    const supabase = createAdminClient();

    // Antes: qualquer usuário da empresa (Compras, Estoque...) redefinia a senha de qualquer funcionário e
    // recebia a provisória; depois, a aba Funcionários liberava tudo, inclusive liberar tentativa e revogar
    // certificado. Agora (T33): o portão da ação (entrar) antes de qualquer leitura e o que ela exige (agir)
    // logo antes de alterar, para o 409 JA_TEM_ACESSO do avisarNoPortal seguir igual (decidirCriar).
    const vinculo: Vinculo | null = staff.is_super_admin
      ? null
      : await vinculoDoChamador(supabase, staff.email, staff.empresa_id);
    const pode = avaliarPermissao({ acao, vinculo, superAdmin: staff.is_super_admin });
    if (!pode.entra) return fail(mensagemSemPermissao(acao, "entrar"), 403);

    if (acao === "status") {
      // super admin consulta a empresa aberta na tela; os demais, só a da sessão
      const empresaId =
        staff.is_super_admin && body.empresa_id ? body.empresa_id : staff.empresa_id;
      if (!empresaId) return fail("Sessão sem empresa ativa", 400);
      // Só os vínculos da empresa (T38). A credencial de cada um é lida pelo id que o vínculo DESTA empresa aponta
      // (nunca por CPF nem em lista aberta), e só para calcular a situação e mostrar o usuário.
      const { data: vinculos, error } = await supabase
        .from("funcionario_portal_acesso")
        .select(COLUNAS_VINCULO)
        .eq("empresa_id", empresaId);
      if (error) return fail("Erro ao carregar acessos", 500);
      const idsDasCredenciais = [
        ...new Set((vinculos ?? []).map((v: VinculoDoPortal) => v.credencial_id).filter(Boolean)),
      ];
      const idsDosCadastros = (vinculos ?? []).map((v: VinculoDoPortal) => v.funcionario_id);
      // em lotes: a lista é de um vínculo por funcionário da empresa, e o filtro in(...) vai na URL
      const [
        { data: credenciais, error: erroCredenciais },
        { data: cadastros, error: erroCadastros },
      ] = await Promise.all([
        lerEmLotes<CredencialDoPortal>(idsDasCredenciais as string[], (lote) =>
          supabase.from("portal_credencial").select(COLUNAS_CREDENCIAL).in("id", lote)
        ),
        lerEmLotes<CadastroDoPortal>(idsDosCadastros, (lote) =>
          supabase
            .from("funcionario")
            .select(COLUNAS_CADASTRO)
            .in("id", lote)
            .eq("empresa_id", empresaId)
        ),
      ]);
      if (erroCredenciais || erroCadastros) return fail("Erro ao carregar acessos", 500);
      const agora = Date.now();
      const credencialPorId = new Map(credenciais.map((c) => [c.id, c]));
      const acessos = montarItens(vinculos, cadastros).map(({ vinculo, cadastro }) =>
        statusDoVinculo({
          vinculo,
          cadastro,
          credencial:
            (vinculo.credencial_id ? credencialPorId.get(vinculo.credencial_id) : null) ?? null,
          agora,
        })
      );
      // quem entra só por Treinamentos EAD → Matricular não recebe login (CPF) nem último acesso
      return ok({ acessos: recortarAcessosParaEad(acessos, pode.listaCompleta) });
    }

    // Ações de matrícula (T18): a identidade e a empresa vêm da sessão; a matrícula, do banco.
    if (ACOES_DE_MATRICULA.has(acao)) {
      if (!pode.age) return fail(MENSAGEM_SEM_EDICAO[acao], 403);
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

    // Edição da resposta de uma dúvida (A6, T21): dúvida e empresa vêm do banco e da sessão; o autor é o da sessão.
    if (ACOES_DE_DUVIDA.has(acao)) {
      if (!pode.age) return fail(MENSAGEM_SEM_EDICAO_DA_RESPOSTA, 403);
      const idDaDuvida = validarDuvidaId(body.duvida_id);
      if (!idDaDuvida.ok) return fail(idDaDuvida.mensagem, idDaDuvida.status);
      const texto = validarRespostaDaDuvida(body.resposta);
      if (!texto.ok) return fail(texto.mensagem, texto.status);
      const duvida = await duvidaDoChamador(supabase, staff, idDaDuvida.id);
      if (!duvida || duvida.deleted_at) return fail("Dúvida não encontrada", 404);
      return editarRespostaDaDuvida(supabase, req, staff, duvida, texto.resposta);
    }

    if (!body.funcionario_id) return fail("funcionario_id é obrigatório", 400);
    const { data: func } = await supabase
      .from("funcionario")
      .select("id, empresa_id, cpf, nome_completo, ativo, deleted_at, data_admissao")
      .eq("id", body.funcionario_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!func) return fail("Funcionário não encontrado", 404);
    if (!staff.is_super_admin && func.empresa_id !== staff.empresa_id) {
      return fail("Funcionário de outra empresa", 403);
    }
    const { data: atual } = await supabase
      .from("funcionario_portal_acesso")
      .select(COLUNAS_VINCULO)
      .eq("funcionario_id", func.id)
      .maybeSingle();
    const evento = (nome: string) =>
      registrarEvento(supabase, req, {
        empresa_id: func.empresa_id,
        funcionario_id: func.id,
        evento: nome,
        detalhe: { por: staff.email },
      });
    const recusar = (r: Recusa) => fail(r.mensagem, r.status, { codigo: r.codigo });
    // 23505 do vínculo: o próprio cadastro ganhou acesso agora há pouco (chave do funcionário) ou outro cadastro da
    // pessoa nesta empresa ficou ativo antes (índice "um vínculo ativo por pessoa e empresa", 0145)
    const conflitoDoVinculo = (mensagem: unknown) =>
      String(mensagem ?? "").includes("funcionario_portal_acesso_pkey")
        ? fail("Este funcionário já tem acesso — use Redefinir senha", 409, {
            codigo: "JA_TEM_ACESSO",
          })
        : fail(
            "Outro cadastro desta pessoa nesta empresa já tem acesso ao portal. Atualize a tela e confira.",
            409,
            { codigo: "OUTRO_CADASTRO_COM_ACESSO" }
          );

    if (body.acao === "criar") {
      // A ordem "409 antes do 403" é a de decidirCriar (regras.ts, sob teste): quem só matricula recebe o 409
      // de quem já tem acesso (o aviso sai só com o link) e nunca cria o acesso (P3 = C1).
      const decisao = decidirCriar({ entra: pode.entra, age: pode.age, jaTemAcesso: !!atual });
      // `codigo`: é por ele que o front (avisarNoPortal) reconhece este caso; o texto pode mudar
      if (decisao === "conflito") {
        return fail("Este funcionário já tem acesso — use Redefinir senha", 409, {
          codigo: "JA_TEM_ACESSO",
        });
      }
      if (decisao === "sem_permissao") return fail(MENSAGEM_SEM_EDICAO.criar, 403);
      // T38: com CPF no cadastro o usuário é SEMPRE o CPF, com os dígitos verificadores certos (o `usuario` do corpo
      // é ignorado); sem CPF, um usuário com letras. A credencial do CPF, de qualquer empresa, é LIGADA ao cadastro
      // novo, e a resposta é a mesma exista ela ou não (o RH não fica sabendo se a pessoa já usa o portal).
      const usuario = usuarioDoAcesso({ cpf: func.cpf, usuarioInformado: body.usuario });
      if (!usuario.ok) return recusar(usuario);
      let existente: Awaited<ReturnType<typeof credencialDoUsuario>> = null;
      let plano;
      try {
        existente = await credencialDoUsuario(supabase, usuario.usuario);
        plano = decidirCriarVinculo({
          funcionarioId: func.id,
          usuario,
          credencialExistente: existente,
          outrosNaEmpresa: existente
            ? await vinculosDaCredencialNaEmpresa(supabase, existente.id, func.empresa_id)
            : [],
        });
      } catch (e) {
        console.error("[funcionario-acesso] criar:", (e as Error).message);
        return fail("Erro ao criar acesso", 500);
      }
      if (!plano.ok) return recusar(plano);
      let credencialId: string = existente?.id ?? "";
      if (!credencialId) {
        const { data: nova, error: erroNova } = await supabase
          .from("portal_credencial")
          .insert({ usuario: usuario.usuario, tipo: usuario.tipo })
          .select("id")
          .single();
        if (erroNova || !nova) {
          if (erroNova?.code === "23505") {
            return fail(
              "O acesso foi criado agora há pouco por outro pedido. Atualize a tela.",
              409,
              {
                codigo: "CONFLITO",
              }
            );
          }
          console.error("[funcionario-acesso] criar credencial:", erroNova);
          return fail("Erro ao criar acesso", 500);
        }
        credencialId = nova.id;
      }
      // (se algo abaixo falhar, a credencial recém-criada fica órfã e o próximo "criar" a reaproveita)
      try {
        await desativarOutrosCadastros(supabase, req, staff, func.empresa_id, plano.desativar);
      } catch (e) {
        console.error("[funcionario-acesso] criar (readmissão):", (e as Error).message);
        return fail("Erro ao criar acesso", 500);
      }
      const senha = gerarSenhaProvisoria();
      const { error } = await supabase.from("funcionario_portal_acesso").insert({
        funcionario_id: func.id,
        empresa_id: func.empresa_id,
        credencial_id: credencialId,
        ativo: true,
        criado_por: staff.email,
        provisoria_hash: await hashPassword(senha),
        ...provisoriaNova(Date.now()),
        geracao_liberada: null,
        confirmado_em: null,
      });
      if (error) {
        if (error.code === "23505") return conflitoDoVinculo(error.message);
        console.error("[funcionario-acesso] criar:", error);
        return fail("Erro ao criar acesso", 500);
      }
      await evento("acesso_criado");
      return ok(respostaDoCriar({ usuario: usuario.usuario, senha }));
    }

    if (!atual) return fail("Este funcionário ainda não tem acesso ao portal", 404);
    if (!pode.age) return fail(MENSAGEM_SEM_EDICAO[acao], 403); // redefinir / ativo

    if (body.acao === "redefinir") {
      // Nova provisória do vínculo (7 dias); a senha atual deixa de abrir esta empresa e as sessões dela caem. Não
      // mexe na senha pessoal, na geração nem no bloqueio (é da pessoa: o RH de uma empresa não desbloqueia as
      // outras). Com o CPF corrigido (caso 7) ou cadastrado depois (R9), religa o vínculo à credencial do CPF.
      const { data: credencialAtual, error: erroCredencial } = atual.credencial_id
        ? await supabase
            .from("portal_credencial")
            .select(COLUNAS_CREDENCIAL)
            .eq("id", atual.credencial_id)
            .maybeSingle()
        : { data: null, error: null };
      if (erroCredencial) return fail("Erro ao redefinir senha", 500);
      const alvo = alvoDaRedefinicao({ cadastro: func, credencialAtual: credencialAtual ?? null });
      if (!alvo.ok) return recusar(alvo);
      let credencialId: string = atual.credencial_id ?? "";
      let usuarioFinal: string = credencialAtual?.usuario ?? "";
      let religarPara: string | null = null;
      let desativar: string[] = [];
      try {
        if (alvo.religar) {
          const existente = await credencialDoUsuario(supabase, alvo.usuario);
          const plano = decidirCriarVinculo({
            funcionarioId: func.id,
            usuario: { usuario: alvo.usuario, tipo: alvo.tipo },
            credencialExistente: existente,
            outrosNaEmpresa: existente
              ? await vinculosDaCredencialNaEmpresa(supabase, existente.id, func.empresa_id)
              : [],
          });
          if (!plano.ok) return recusar(plano);
          desativar = plano.desativar;
          if (existente) {
            credencialId = existente.id;
          } else {
            const { data: nova, error: erroNova } = await supabase
              .from("portal_credencial")
              .insert({ usuario: alvo.usuario, tipo: alvo.tipo })
              .select("id")
              .single();
            if (erroNova || !nova) throw new Error("credencial nova: " + erroNova?.message);
            credencialId = nova.id;
          }
          religarPara = credencialId;
          usuarioFinal = alvo.usuario;
        } else {
          const outro = conflitoDeOutroCadastro({
            funcionarioId: func.id,
            outrosNaEmpresa: await vinculosDaCredencialNaEmpresa(
              supabase,
              credencialId,
              func.empresa_id
            ),
          });
          if (!outro.ok) return recusar(outro);
          desativar = outro.desativar;
        }
        await desativarOutrosCadastros(supabase, req, staff, func.empresa_id, desativar);
      } catch (e) {
        console.error("[funcionario-acesso] redefinir:", (e as Error).message);
        return fail("Erro ao redefinir senha", 500);
      }
      const senha = gerarSenhaProvisoria();
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update(
          efeitoDaRedefinicao({
            vinculo: atual,
            provisoriaHash: await hashPassword(senha),
            agora: Date.now(),
            religarPara,
          })
        )
        .eq("funcionario_id", func.id);
      if (error) {
        if (error.code === "23505") return conflitoDoVinculo(error.message);
        return fail("Erro ao redefinir senha", 500);
      }
      await evento("senha_redefinida");
      return ok(respostaDoCriar({ usuario: usuarioFinal, senha }));
    }

    if (body.acao === "ativo") {
      const ativo = body.ativo === true;
      // reativar: a pessoa não pode ter dois vínculos ativos na mesma empresa (outro cadastro ativo = 409; o de
      // cadastro inativo é desativado, como na readmissão)
      if (ativo && !atual.ativo && atual.credencial_id) {
        try {
          const outro = conflitoDeOutroCadastro({
            funcionarioId: func.id,
            outrosNaEmpresa: await vinculosDaCredencialNaEmpresa(
              supabase,
              atual.credencial_id,
              func.empresa_id
            ),
          });
          if (!outro.ok) return recusar(outro);
          await desativarOutrosCadastros(supabase, req, staff, func.empresa_id, outro.desativar);
        } catch (e) {
          console.error("[funcionario-acesso] reativar:", (e as Error).message);
          return fail("Erro ao alterar acesso", 500);
        }
      }
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({
          ativo,
          // desativar derruba as sessões abertas na hora
          sessao_versao: ativo ? atual.sessao_versao : atual.sessao_versao + 1,
        })
        .eq("funcionario_id", func.id);
      if (error) {
        if (error.code === "23505") return conflitoDoVinculo(error.message);
        return fail("Erro ao alterar acesso", 500);
      }
      await evento(ativo ? "acesso_reativado" : "acesso_desativado");
      return ok({ ativo });
    }

    return fail("Ação desconhecida", 400);
  })
);
