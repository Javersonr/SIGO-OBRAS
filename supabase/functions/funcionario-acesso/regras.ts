/**
 * Regras das ações do RH sobre a MATRÍCULA de um funcionário no EAD (T18): liberar uma tentativa da
 * avaliação e revogar o certificado. Módulo puro (sem `Deno.*`, banco e canal de WhatsApp injetados):
 * o `index.ts` só liga a rede e o banco. Teste: `regras.test.ts`, ao lado.
 *
 * Ambas as ações antes eram gravadas direto do navegador do RH (sem evento, sem autor confiável e,
 * na revogação, sem avisar o aluno). Agora passam pelo servidor, que confere a permissão "editar" da
 * aba Funcionários, grava o evento na trilha com o e-mail do RH (`detalhe.por`) e avisa o aluno.
 */
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";

/** Ações de `funcionario-acesso` que mexem na matrícula (e não no login do portal). */
export const ACOES_DE_MATRICULA = new Set(["liberar_tentativa", "revogar_certificado"]);

/** Mensagem do 403 de cada ação (a tela mostra o texto como veio). */
export const MENSAGEM_SEM_EDICAO: Record<string, string> = {
  liberar_tentativa:
    "Sem permissão para liberar tentativa: é preciso poder editar Funcionários em Segurança do Trabalho",
  revogar_certificado:
    "Sem permissão para revogar o certificado: é preciso poder editar Funcionários em Segurança do Trabalho",
};

/** Resultado de uma conferência: segue (`ok`) ou recusa com o status HTTP e o texto para o RH. */
export type Conferencia<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; status: number; mensagem: string };

// uuid em qualquer caixa; evita mandar lixo ao banco (22P02 viraria 500)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarMatriculaId(bruto: unknown): Conferencia<{ id: string }> {
  const id = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  if (!UUID.test(id)) return { ok: false, status: 400, mensagem: "matricula_id inválido" };
  return { ok: true, id };
}

// O motivo aparece na consulta pública do certificado: texto curto, de uma linha.
export const MOTIVO_REVOGACAO_MIN = 5;
export const MOTIVO_REVOGACAO_MAX = 300;

export function motivoDaRevogacao(bruto: unknown): Conferencia<{ motivo: string }> {
  const motivo = typeof bruto === "string" ? bruto.replace(/\s+/g, " ").trim() : "";
  if (!motivo) {
    return { ok: false, status: 400, mensagem: "Informe o motivo da revogação" };
  }
  if (motivo.length < MOTIVO_REVOGACAO_MIN) {
    return {
      ok: false,
      status: 400,
      mensagem: `O motivo da revogação precisa ter pelo menos ${MOTIVO_REVOGACAO_MIN} caracteres`,
    };
  }
  if (motivo.length > MOTIVO_REVOGACAO_MAX) {
    return {
      ok: false,
      status: 400,
      mensagem: `O motivo da revogação pode ter no máximo ${MOTIVO_REVOGACAO_MAX} caracteres`,
    };
  }
  return { ok: true, motivo };
}

// ---------------------------------------------------------------- liberar tentativa

interface MatriculaParaLiberar {
  avaliacao_aprovada?: boolean | null;
  tentativas_extras?: unknown;
  deleted_at?: string | null;
}

/**
 * Pode liberar mais uma tentativa? Soma 1 às extras da matrícula (o limite do curso não muda). Quem já
 * foi aprovado não precisa de tentativa. `extrasAtuais` é o valor lido, que o servidor usa para gravar
 * só se ninguém mudou no meio (dois cliques seguidos não somam um só).
 */
export function decidirLiberacao(
  matricula: MatriculaParaLiberar | null | undefined
): Conferencia<{ extrasAtuais: number; extrasNovas: number }> {
  if (!matricula || matricula.deleted_at) {
    return { ok: false, status: 404, mensagem: "Matrícula não encontrada" };
  }
  if (matricula.avaliacao_aprovada === true) {
    return {
      ok: false,
      status: 409,
      mensagem: "Este funcionário já foi aprovado na avaliação: não há tentativa a liberar",
    };
  }
  const lidas = Number(matricula.tentativas_extras);
  const extrasAtuais = Number.isInteger(lidas) && lidas > 0 ? lidas : 0;
  return { ok: true, extrasAtuais, extrasNovas: extrasAtuais + 1 };
}

/** `detalhe` do evento `tentativa_liberada`: quem liberou e quantas extras a matrícula tem agora. */
export function detalheDaLiberacao(p: { por: string; extrasNovas: number }) {
  return { por: p.por, tentativas_extras: p.extrasNovas };
}

// ---------------------------------------------------------------- revogar certificado

/**
 * Só revoga certificado que existe e ainda vale. O banco só deixa a empresa revogar uma vez, mas o
 * servidor (service role) passa por aquela trava: sem esta conferência ele sobrescreveria o autor e o
 * motivo de uma revogação anterior.
 */
export function decidirRevogacao(
  certificado: { revogado_em?: string | null } | null | undefined
): Conferencia {
  if (!certificado) {
    return { ok: false, status: 404, mensagem: "Esta matrícula ainda não tem certificado" };
  }
  if (certificado.revogado_em) {
    return { ok: false, status: 409, mensagem: "O certificado já está revogado" };
  }
  return { ok: true };
}

/** As únicas colunas que a revogação grava no certificado (hora do servidor, e-mail do RH, motivo). */
export function dadosDaRevogacao(p: { agora: Date; por: string; motivo: string }) {
  return {
    revogado_em: p.agora.toISOString(),
    revogado_por: p.por,
    motivo_revogacao: p.motivo,
  };
}

/**
 * Desfaz a revogação quando o evento não pôde ser gravado na trilha (a revogação sem registro de
 * quem fez não fica). Mesmas colunas de `dadosDaRevogacao`.
 */
export function dadosParaDesfazerRevogacao() {
  return { revogado_em: null, revogado_por: null, motivo_revogacao: null };
}

/** `detalhe` do evento `certificado_revogado`. */
export function detalheDaRevogacao(p: { por: string; codigo: string; motivo: string }) {
  return { por: p.por, codigo: p.codigo, motivo: p.motivo };
}

// ---------------------------------------------------------------- aviso ao aluno

const primeiroNome = (nome: unknown) =>
  (typeof nome === "string" ? nome : "").trim().split(/\s+/)[0] || "";

/** Mensagem de WhatsApp que o aluno recebe quando o RH revoga o certificado dele. */
export function textoAvisoRevogacao(p: {
  nome?: string | null;
  curso?: string | null;
  codigo: string;
  empresa?: string | null;
  motivo: string;
}): string {
  const nome = primeiroNome(p.nome);
  const curso = (p.curso ?? "").trim();
  const empresa = (p.empresa ?? "").trim();
  const quem = empresa ? `pela ${empresa}` : "pela empresa";
  return (
    `Olá${nome ? `, ${nome}` : ""}. ` +
    `O certificado ${curso ? `do curso "${curso}" ` : ""}(código ${p.codigo}) foi revogado ${quem} ` +
    "e deixa de valer.\n\n" +
    `Motivo: ${p.motivo}\n\n` +
    "Em caso de dúvida, procure o RH da empresa."
  );
}

/** Para onde vai o aviso: um número, ou o motivo de não haver para onde mandar. */
export type DestinoDoAviso =
  | { tipo: "enviar"; numero: string }
  | { tipo: "sem_telefone" | "telefone_invalido" | "inativo" };

/** Quem não é mais funcionário ativo da empresa não recebe a mensagem. */
export function destinoDoAviso(
  funcionario: {
    telefone?: string | null;
    ativo?: boolean | null;
    deleted_at?: string | null;
  } | null
): DestinoDoAviso {
  if (!funcionario || funcionario.deleted_at || funcionario.ativo === false) {
    return { tipo: "inativo" };
  }
  const bruto = (funcionario.telefone ?? "").trim();
  if (!bruto) return { tipo: "sem_telefone" };
  const numero = normalizarTelefoneBR(bruto);
  return numero ? { tipo: "enviar", numero } : { tipo: "telefone_invalido" };
}

/** O que o RH fica sabendo sobre o aviso (a revogação vale em qualquer caso). */
export type ResultadoDoAviso =
  | "enviado"
  | "sem_telefone"
  | "telefone_invalido"
  | "inativo"
  | "canal_nao_configurado"
  | "falhou";

/**
 * Manda o aviso sem nunca derrubar a ação: falha do canal vira "falhou" (ou "canal_nao_configurado") e
 * o RH é informado na tela. `enviar` e `canalNaoConfigurado` vêm de fora (Evolution no servidor).
 */
export async function avisarAluno(p: {
  destino: DestinoDoAviso;
  texto: string;
  enviar: (numero: string, texto: string) => Promise<void>;
  canalNaoConfigurado: (erro: unknown) => boolean;
  aoFalhar?: (erro: unknown) => void;
}): Promise<ResultadoDoAviso> {
  if (p.destino.tipo !== "enviar") return p.destino.tipo;
  try {
    await p.enviar(p.destino.numero, p.texto);
    return "enviado";
  } catch (e) {
    p.aoFalhar?.(e);
    return p.canalNaoConfigurado(e) ? "canal_nao_configurado" : "falhou";
  }
}
