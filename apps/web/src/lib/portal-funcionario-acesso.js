/**
 * Acesso do funcionário ao Portal (lado do RH): criar/redefinir login e avisar
 * pelo WhatsApp. A senha provisória só existe na resposta de criar/redefinir —
 * o servidor guarda apenas o hash, e o funcionário troca no primeiro acesso.
 */
import { sigo } from "@/api/sigoClient";
import { dispararWhatsApp } from "@/lib/whatsapp";
import { urlPublica } from "@/lib/url-publica";

export const urlPortal = () => urlPublica("/PortalFuncionario");

/**
 * Código que o `funcionario-acesso` devolve (HTTP 409) quando o funcionário já tem login. O front
 * decide por ele, nunca pelo texto da mensagem: o texto é para o RH ler e pode mudar.
 */
export const CODIGO_JA_TEM_ACESSO = "JA_TEM_ACESSO";

/**
 * Outros códigos do `funcionario-acesso` (T18). `CONFLITO` (409): a matrícula mudou desde que a tela foi
 * carregada (a tela mostrava um número de tentativas extras que já não vale). `EFEITO_SEM_REGISTRO` (500):
 * a ação ficou gravada, mas o registro na trilha falhou e não deu para desfazer.
 */
export const CODIGO_CONFLITO = "CONFLITO";
export const CODIGO_EFEITO_SEM_REGISTRO = "EFEITO_SEM_REGISTRO";

async function chamar(acao, dados = {}) {
  const { data } = await sigo.functions.invoke("funcionarioAcesso", { acao, ...dados });
  if (data?.success === false) {
    const erro = new Error(data.error || "Erro no acesso ao portal");
    // o sigoClient mantém no `data` os campos extras do erro do servidor (ex.: `codigo`)
    if (data.codigo) erro.codigo = data.codigo;
    throw erro;
  }
  return data;
}

export const acessoPortal = {
  status: (empresaId) => chamar("status", { empresa_id: empresaId }),
  criar: (funcionarioId, usuario) =>
    chamar("criar", { funcionario_id: funcionarioId, usuario: usuario || undefined }),
  redefinir: (funcionarioId) => chamar("redefinir", { funcionario_id: funcionarioId }),
  ativo: (funcionarioId, ativo) => chamar("ativo", { funcionario_id: funcionarioId, ativo }),
  // ações de matrícula (T18): o servidor confere a permissão, grava o evento com o e-mail do RH.
  // `extrasVistas` = as tentativas extras que a tela mostra (`extrasDaMatricula`): o servidor só libera
  // se a matrícula ainda tem esse número, e assim um 2º clique com a tela antiga não soma de novo.
  liberarTentativa: (matriculaId, extrasVistas) =>
    chamar("liberar_tentativa", {
      matricula_id: matriculaId,
      tentativas_extras_vistas: extrasVistas,
    }),
  revogarCertificado: (matriculaId, motivo) =>
    chamar("revogar_certificado", { matricula_id: matriculaId, motivo }),
};

/**
 * Tentativas extras da matrícula como a tela as mostra, lidas do mesmo jeito que o servidor lê
 * (`decidirLiberacao`): inteiro positivo, senão 0. É o número que `liberarTentativa` manda de volta.
 */
export function extrasDaMatricula(matricula) {
  const lidas = Number(matricula?.tentativas_extras);
  return Number.isInteger(lidas) && lidas > 0 ? lidas : 0;
}

/** Quanto tempo (ms) o aviso de "NÃO repita" fica na tela: o toast comum some antes de dar para ler. */
export const DURACAO_AVISO_SEM_REGISTRO_MS = 20000;

/**
 * O que a tela do RH faz quando uma ação de matrícula (liberar, revogar) falha: o texto do servidor, quanto
 * tempo mostrar e se a matrícula precisa ser recarregada (conflito: o número que a tela tinha já não vale,
 * e sem recarregar todo clique seguinte repetiria o mesmo conflito).
 * @returns {{ texto: string, duracao: number | undefined, recarregarMatricula: boolean }}
 */
export function falhaDaAcaoDoRH(erro) {
  const codigo = erro?.codigo;
  return {
    texto: erro?.message || "Não foi possível concluir a ação",
    duracao: codigo === CODIGO_EFEITO_SEM_REGISTRO ? DURACAO_AVISO_SEM_REGISTRO_MS : undefined,
    recarregarMatricula: codigo === CODIGO_CONFLITO,
  };
}

// Os mesmos limites do servidor (funcionario-acesso/regras.ts); o teste confere os dois lados.
export const MOTIVO_REVOGACAO_MIN = 5;
export const MOTIVO_REVOGACAO_MAX = 300;

/**
 * Confere o motivo da revogação antes de chamar o servidor (que repete a conferência). O motivo
 * aparece na consulta pública do certificado: uma linha só, então quebras e espaços repetidos viram um.
 * @returns {{ ok: true, motivo: string } | { ok: false, erro: string }}
 */
export function validarMotivoRevogacao(bruto) {
  const motivo = typeof bruto === "string" ? bruto.replace(/\s+/g, " ").trim() : "";
  if (!motivo) return { ok: false, erro: "Informe o motivo da revogação" };
  if (motivo.length < MOTIVO_REVOGACAO_MIN) {
    return {
      ok: false,
      erro: `O motivo precisa ter pelo menos ${MOTIVO_REVOGACAO_MIN} caracteres`,
    };
  }
  if (motivo.length > MOTIVO_REVOGACAO_MAX) {
    return { ok: false, erro: `O motivo pode ter no máximo ${MOTIVO_REVOGACAO_MAX} caracteres` };
  }
  return { ok: true, motivo };
}

const AVISO_DA_REVOGACAO = {
  enviado: ["success", "Certificado revogado. O funcionário foi avisado no WhatsApp."],
  inativo: [
    "success",
    "Certificado revogado. O funcionário está inativo: nenhum aviso foi enviado.",
  ],
  sem_telefone: [
    "warning",
    "Certificado revogado, mas o funcionário não tem telefone cadastrado: avise-o por outro meio.",
  ],
  telefone_invalido: [
    "warning",
    "Certificado revogado, mas o telefone do funcionário é inválido: corrija o cadastro e avise-o por outro meio.",
  ],
  canal_nao_configurado: [
    "warning",
    "Certificado revogado, mas o WhatsApp automático não está configurado: avise o funcionário por outro meio.",
  ],
  falhou: [
    "warning",
    "Certificado revogado, mas o aviso por WhatsApp falhou: avise o funcionário por outro meio.",
  ],
};

/**
 * O que mostrar ao RH depois de revogar: a revogação vale sempre; o texto diz se o aluno foi avisado
 * (`aviso_whatsapp` da resposta de `revogar_certificado`) ou o que fazer quando o aviso não saiu.
 * @returns {{ tipo: "success"|"warning", texto: string }}
 */
export function avisoDaRevogacao(resposta) {
  const chave = resposta?.aviso_whatsapp;
  const [tipo, texto] = Object.hasOwn(AVISO_DA_REVOGACAO, chave)
    ? AVISO_DA_REVOGACAO[chave]
    : ["success", "Certificado revogado"];
  return { tipo, texto };
}

const primeiroNome = (nome) => (nome || "").trim().split(/\s+/)[0] || "";

export function textoCredenciais({ nome, usuario, senha }) {
  return (
    `🔐 Olá, ${primeiroNome(nome)}! Este é o seu acesso ao Portal do Funcionário:\n${urlPortal()}\n\n` +
    `Usuário: ${usuario}\nSenha provisória: ${senha}\n\n` +
    "No primeiro acesso você vai criar a sua senha pessoal. Não compartilhe sua senha com ninguém."
  );
}

/**
 * Manda um aviso com o link do portal. Se o funcionário ainda não tem acesso,
 * cria agora e junta usuário e senha provisória na mesma mensagem.
 * @returns {{ via: "evolution"|"wa.me"|null, texto: string, credenciais: object|null }}
 */
export async function avisarNoPortal(funcionario, aviso) {
  let credenciais = null;
  try {
    credenciais = await acessoPortal.criar(funcionario.id);
  } catch (e) {
    if (e?.codigo !== CODIGO_JA_TEM_ACESSO) throw e;
  }
  const partes = [aviso, `Acesse: ${urlPortal()}`];
  partes.push(
    credenciais
      ? `Usuário: ${credenciais.usuario}\nSenha provisória: ${credenciais.senha_provisoria}\n` +
          "(no primeiro acesso você cria a sua senha pessoal)"
      : "Entre com o seu usuário (CPF) e a sua senha."
  );
  const texto = partes.join("\n\n");
  const via = funcionario.telefone ? await dispararWhatsApp(funcionario.telefone, texto) : null;
  return { via, texto, credenciais };
}

/** Rótulo e cor do status do acesso (lista de funcionários e ficha). */
export function statusAcesso(acesso) {
  if (!acesso) return { rotulo: "Sem acesso", classe: "text-slate-500 border-slate-200" };
  if (!acesso.ativo)
    return { rotulo: "Desativado", classe: "bg-slate-100 text-slate-600 border-slate-300" };
  if (acesso.bloqueado)
    return { rotulo: "Bloqueado", classe: "bg-red-100 text-red-700 border-red-200" };
  if (acesso.primeiro_acesso_pendente)
    return {
      rotulo: "Aguardando 1º acesso",
      classe: "bg-amber-100 text-amber-700 border-amber-200",
    };
  return { rotulo: "Ativo", classe: "bg-emerald-100 text-emerald-700 border-emerald-200" };
}
