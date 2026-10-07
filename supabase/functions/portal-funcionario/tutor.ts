// Tutor do curso e aviso de dúvida (T21; decisão D4 de 06/10/2026: o RH configura o tutor de cada curso quando
// quiser). Regra pura, sem `Deno.*` nem rede: o `index.ts` liga o banco e o WhatsApp. Teste em tutor.test.ts.
//
// O curso guarda `tutor_nome`, `tutor_telefone` (WhatsApp que recebe cada dúvida) e `tutor_atendimento` (texto
// livre com o horário e o prazo de resposta). O telefone NUNCA vai ao aluno: a dúvida passa pelo portal e o
// servidor avisa o tutor. O aluno recebe só o nome e o atendimento.
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";

/**
 * Onde o tutor responde: RH & Segurança, aba Treinamentos (`?tab=` é lido por pages/SegurancaTrabalho.jsx). O
 * endereço canônico é o com www (o domínio sem www gera "Não seguro"; ver url-publica.js no front).
 */
export const URL_DUVIDAS_DO_TUTOR =
  "https://www.sigoobras.com.br/SegurancaTrabalho?tab=treinamentos_ead";

/** A pergunta vai inteira para o SIGO (até 2000 caracteres); no WhatsApp do tutor basta o começo. */
export const MAX_PERGUNTA_NO_AVISO = 600;

const aparar = (valor: unknown): string => String(valor ?? "").trim();

/**
 * O número do tutor pronto para o envio (E.164 sem "+"), ou null quando o curso não tem telefone ou ele é de um
 * formato que o envio recusa (a regra é a de `normalizarTelefoneBR`, a mesma que o RH vê na tela do curso).
 */
export function destinoDoAvisoAoTutor(
  curso: { tutor_telefone?: unknown } | null | undefined
): string | null {
  return normalizarTelefoneBR(aparar(curso?.tutor_telefone));
}

/** O texto do WhatsApp ao tutor: onde a dúvida foi feita, quem perguntou, a pergunta e o link para responder. */
export function mensagemDuvidaAoTutor(dados: {
  cursoNome?: string | null;
  alunoNome?: string | null;
  aulaTitulo?: string | null;
  pergunta: string;
}): string {
  const curso = aparar(dados.cursoNome);
  const aluno = aparar(dados.alunoNome);
  const aula = aparar(dados.aulaTitulo);
  const pergunta = aparar(dados.pergunta);
  const trecho =
    pergunta.length > MAX_PERGUNTA_NO_AVISO
      ? `${pergunta.slice(0, MAX_PERGUNTA_NO_AVISO)}...`
      : pergunta;
  return [
    `❓ Dúvida no curso ${curso || "(sem nome)"}`,
    `De: ${aluno || "(aluno não identificado)"}`,
    ...(aula ? [`Aula: ${aula}`] : []),
    "",
    `"${trecho}"`,
    "",
    "Responda no SIGO (RH & Segurança → Treinamentos → Dúvidas):",
    URL_DUVIDAS_DO_TUTOR,
  ].join("\n");
}

/** O que o aluno recebe do tutor em `dados`: nome e atendimento (aparados; vazio vira null). Sem telefone. */
export function tutorParaOAluno(
  curso: { tutor_nome?: unknown; tutor_atendimento?: unknown } | null | undefined
): { tutor_nome: string | null; tutor_atendimento: string | null } {
  return {
    tutor_nome: aparar(curso?.tutor_nome) || null,
    tutor_atendimento: aparar(curso?.tutor_atendimento) || null,
  };
}
