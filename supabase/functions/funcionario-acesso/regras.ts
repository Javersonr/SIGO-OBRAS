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

/**
 * Resultado de uma conferência: segue (`ok`) ou recusa com o status HTTP e o texto para o RH. `codigo`
 * (opcional) é o que a tela usa para decidir o que fazer; o texto pode mudar.
 */
export type Conferencia<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; status: number; mensagem: string; codigo?: string };

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

/** Nome do campo do corpo com o número de tentativas extras que a tela do RH mostrava (T18, M4). */
export const CAMPO_EXTRAS_VISTAS = "tentativas_extras_vistas";

/**
 * O número de tentativas extras que a tela mostrava quando o RH clicou em "Liberar". É OBRIGATÓRIO: a
 * liberação só vale sobre esse número (ver `decidirLiberacao`), então um pedido sem ele é recusado em vez de
 * valer "sobre o que estiver no banco". Só inteiro não negativo, vindo como número no JSON.
 */
export function validarExtrasVistas(bruto: unknown): Conferencia<{ extrasVistas: number }> {
  if (typeof bruto !== "number" || !Number.isSafeInteger(bruto) || bruto < 0) {
    return {
      ok: false,
      status: 400,
      mensagem: `${CAMPO_EXTRAS_VISTAS} inválido: atualize a página e tente de novo`,
    };
  }
  return { ok: true, extrasVistas: bruto };
}

/**
 * Pode liberar mais uma tentativa? Soma 1 às extras da matrícula (o limite do curso não muda). Quem já
 * foi aprovado não precisa de tentativa.
 *
 * Idempotência (T18, M4): a liberação grava o efeito (as extras) e depois o evento da trilha. Se o evento
 * e o desfazer falham, a matrícula fica com uma extra a mais e SEM evento (`sem_registro`); um segundo
 * clique, lendo o valor novo do banco, somaria outra extra para um evento só. Por isso o pedido traz o
 * número que a tela mostrava (`extrasVistas`) e o servidor só soma se a matrícula AINDA tem esse número;
 * senão responde 409 `CONFLITO`, sem gravar nada. A tela que ficou com o número antigo depois de uma falha
 * não consegue repetir a liberação. `extrasAtuais` (o valor lido, igual a `extrasVistas` quando segue) é o
 * que o servidor usa para gravar só se ninguém mudou no meio (dois cliques seguidos não somam um só).
 */
export function decidirLiberacao(
  matricula: MatriculaParaLiberar | null | undefined,
  extrasVistas: number
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
  if (extrasVistas !== extrasAtuais) {
    return {
      ok: false,
      status: 409,
      codigo: "CONFLITO",
      mensagem:
        `As tentativas extras desta matrícula mudaram desde que a tela foi carregada (a tela mostrava ` +
        `${extrasVistas}, agora são ${extrasAtuais}). Nada foi liberado. Confira a trilha de auditoria e ` +
        "atualize a tela antes de liberar de novo.",
    };
  }
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
  | { tipo: "sem_telefone" | "telefone_invalido" | "inativo" | "falhou" };

/**
 * Quem não é mais funcionário ativo da empresa não recebe a mensagem. `erroDeLeitura` = o banco falhou ao
 * ler o funcionário: não dá para saber se ele está ativo, então o resultado é "falhou" (o RH avisa por
 * outro meio) e nunca "inativo", que dizia ao RH, num toast verde, que o aluno ativo "não precisava" de
 * aviso (T18, M1).
 */
export function destinoDoAviso(
  funcionario: {
    telefone?: string | null;
    ativo?: boolean | null;
    deleted_at?: string | null;
  } | null,
  erroDeLeitura?: unknown
): DestinoDoAviso {
  if (erroDeLeitura) return { tipo: "falhou" };
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
 * Prazo (ms) para o aviso sair. O envio ao Evolution já tem o seu (`TEMPO_LIMITE_ENVIO_MS`, 12 s, em
 * `_shared/whatsapp-envio.ts`); este é a rede de segurança por cima, um pouco maior: o aviso é só um
 * recado e a revogação, que já está gravada, não espera minutos por ele (T18, M2).
 */
export const TEMPO_LIMITE_AVISO_MS = 15_000;

/**
 * Manda o aviso sem nunca derrubar nem atrasar a ação: falha do canal vira "falhou" (ou
 * "canal_nao_configurado"), e passar de `limiteMs` sem resposta também vira "falhou"; o RH é informado na
 * tela. `enviar` e `canalNaoConfigurado` vêm de fora (Evolution no servidor).
 */
export async function avisarAluno(p: {
  destino: DestinoDoAviso;
  texto: string;
  enviar: (numero: string, texto: string) => Promise<void>;
  canalNaoConfigurado: (erro: unknown) => boolean;
  aoFalhar?: (erro: unknown) => void;
  limiteMs?: number;
}): Promise<ResultadoDoAviso> {
  if (p.destino.tipo !== "enviar") return p.destino.tipo;
  const limiteMs = p.limiteMs ?? TEMPO_LIMITE_AVISO_MS;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const esgotou = new Promise<never>((_ok, rejeitar) => {
    relogio = setTimeout(
      () => rejeitar(new Error(`Aviso sem resposta em ${limiteMs} ms (tempo esgotado)`)),
      limiteMs
    );
  });
  try {
    // a corrida também segura um envio que falhe só depois do prazo (a rejeição tardia já tem handler)
    await Promise.race([p.enviar(p.destino.numero, p.texto), esgotou]);
    return "enviado";
  } catch (e) {
    p.aoFalhar?.(e);
    return p.canalNaoConfigurado(e) ? "canal_nao_configurado" : "falhou";
  } finally {
    clearTimeout(relogio);
  }
}

// ---------------------------------------------------------------- efeito sem registro na trilha

/** Como terminou "gravar o efeito, registrar o evento e, se o evento falhar, desfazer o efeito". */
export type ResultadoDoRegistro = "registrado" | "desfeito" | "sem_registro";

/**
 * A liberação e a revogação gravam o EFEITO (extras da matrícula, `revogado_*` do certificado) e depois o
 * evento da trilha. Sem o evento o efeito não fica: tenta-se desfazê-lo. Se o evento falha E o desfazer
 * também falha (ou não atinge a linha), uma última tentativa de gravar o evento: se ela passa, efeito e
 * registro ficam em dia. Só quando as três falham sobra `sem_registro`: o efeito está gravado SEM evento
 * e SEM como desfazer, e repetir o pedido pioraria (a liberação somaria mais uma tentativa extra para um
 * evento só). Repetir a liberação com a tela antiga é barrado por `decidirLiberacao` (409 `CONFLITO`:
 * o pedido traz o número de extras que a tela mostrava). Quem chama responde com `falhaDoRegistro` e
 * deixa rastro no log. Nunca lança. A exceção de um passo (rede, banco) conta como falha, e a causa vai
 * para `aoFalhar(passo, erro)` (o `index.ts` a escreve no `console.error`; injetado para este módulo
 * continuar puro). Um `aoFalhar` que ele próprio lance não derruba a resposta.
 */
export async function registrarOuDesfazer(p: {
  registrar: () => Promise<boolean>;
  desfazer: () => Promise<boolean>;
  aoFalhar?: (passo: "registrar" | "desfazer", erro: unknown) => void;
}): Promise<ResultadoDoRegistro> {
  const tentar = async (nome: "registrar" | "desfazer") => {
    try {
      return await p[nome]();
    } catch (erro) {
      try {
        p.aoFalhar?.(nome, erro);
      } catch {
        // o log nunca derruba a resposta
      }
      return false;
    }
  };
  if (await tentar("registrar")) return "registrado";
  if (await tentar("desfazer")) return "desfeito";
  return (await tentar("registrar")) ? "registrado" : "sem_registro";
}

/**
 * A resposta de erro para o RH quando o evento não foi gravado. `desfeito`: nada ficou gravado, é só
 * tentar de novo (`TRILHA_FALHOU`). `sem_registro`: o efeito ficou, a mensagem manda NÃO repetir e avisar o
 * suporte, e o código próprio (`EFEITO_SEM_REGISTRO`) deixa a tela e os logs distinguirem os dois casos.
 */
export function falhaDoRegistro(p: {
  acao: "liberar_tentativa" | "revogar_certificado";
  resultado: Exclude<ResultadoDoRegistro, "registrado">;
}): { status: 500; codigo: "TRILHA_FALHOU" | "EFEITO_SEM_REGISTRO"; mensagem: string } {
  const liberar = p.acao === "liberar_tentativa";
  if (p.resultado === "desfeito") {
    return {
      status: 500,
      codigo: "TRILHA_FALHOU",
      mensagem: liberar
        ? "Não foi possível registrar a liberação na trilha de auditoria. Tente de novo."
        : "Não foi possível registrar a revogação na trilha de auditoria. Tente de novo.",
    };
  }
  return {
    status: 500,
    codigo: "EFEITO_SEM_REGISTRO",
    mensagem: liberar
      ? "A tentativa foi liberada, mas o registro na trilha de auditoria falhou e a liberação não pôde " +
        "ser desfeita. NÃO repita a liberação (somaria outra tentativa extra): avise o suporte para " +
        "conferir a matrícula."
      : "O certificado foi revogado, mas o registro na trilha de auditoria falhou e a revogação não pôde " +
        "ser desfeita. O funcionário NÃO foi avisado: avise-o por outro meio e peça ao suporte para " +
        "conferir o registro.",
  };
}
