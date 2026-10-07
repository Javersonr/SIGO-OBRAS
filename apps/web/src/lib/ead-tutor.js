/**
 * Tutor do curso EAD (T21, decisão D4 de 06/10/2026: "deixa local para configurar").
 *
 * Cada curso pode ter um tutor: nome, WhatsApp (recebe o aviso de cada dúvida do aluno) e atendimento (texto
 * livre com o horário e o prazo de resposta). O RH preenche pela tela do curso quando quiser; nada disso
 * trava publicar o curso (o tutor é só aviso no painel de requisitos, `ead-requisitos.js`).
 *
 * Lógica pura (sem DOM nem backend), para ser testada. Os limites repetem os do banco (migração 0140).
 */
import {
  formatarTelefone,
  mensagemTelefoneInvalido,
  normalizarTelefoneBR,
  telefoneValido,
} from "./telefone.js";

export const MAX_TUTOR_NOME = 120;
export const MAX_TUTOR_ATENDIMENTO = 300;

const texto = (valor) => String(valor ?? "").trim();

/**
 * O que o RH digitou no formulário do curso vira o que o banco guarda, ou o erro que ele precisa ler.
 * Vazio vira null (o tutor é opcional). O telefone só grava se o envio do WhatsApp o aceita (a regra
 * `normalizarTelefoneBR`, a mesma do servidor, mais a validação de máscara do resto do sistema) e vai para o
 * banco na máscara nacional "(00) 00000-0000", como os outros telefones do SIGO; o servidor põe o 55 na hora de
 * enviar.
 */
export function dadosDoTutorParaGravar(curso) {
  const nome = texto(curso?.tutor_nome);
  const atendimento = texto(curso?.tutor_atendimento);
  const telefone = texto(curso?.tutor_telefone);

  if (nome.length > MAX_TUTOR_NOME) {
    return { ok: false, erro: `Nome do tutor longo demais (máx. ${MAX_TUTOR_NOME} caracteres)` };
  }
  if (atendimento.length > MAX_TUTOR_ATENDIMENTO) {
    return {
      ok: false,
      erro: `Atendimento do tutor longo demais (máx. ${MAX_TUTOR_ATENDIMENTO} caracteres)`,
    };
  }
  if (telefone && (!telefoneValido(telefone) || !normalizarTelefoneBR(telefone))) {
    return { ok: false, erro: `WhatsApp do tutor: ${mensagemTelefoneInvalido(telefone)}` };
  }

  return {
    ok: true,
    dados: {
      tutor_nome: nome || null,
      tutor_telefone: telefone ? formatarTelefone(telefone) : null,
      tutor_atendimento: atendimento || null,
    },
  };
}

/**
 * O que o aluno vê do tutor na tela do curso: nome e atendimento, o que existir; nada se não houver nenhum
 * dos dois. O telefone do tutor NUNCA vai ao aluno (a dúvida passa pelo portal, que avisa o tutor).
 */
export function tutorDoCurso(curso) {
  const nome = texto(curso?.tutor_nome) || null;
  const atendimento = texto(curso?.tutor_atendimento) || null;
  return nome || atendimento ? { nome, atendimento } : null;
}
