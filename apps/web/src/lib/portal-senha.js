/**
 * Regra da senha do Portal do Funcionário, para a tela mostrar o que vale ANTES de o aluno enviar.
 *
 * COPIA a regra do servidor (`supabase/functions/_shared/portal-funcionario.ts`: `normalizarUsuario`,
 * `SENHAS_FRACAS` e `motivoSenhaInvalida`). Quem manda é o servidor, que confere de novo em toda
 * troca; esta cópia só evita o ida-e-volta de uma senha que ele ia recusar. Mudou lá, mude aqui:
 * `portal-senha.test.js` roda as duas regras sobre as mesmas entradas (inclusive a lista de senhas
 * fracas lida do arquivo do servidor) e quebra se divergirem.
 *
 * Função pura, sem DOM e sem `@/api/sigoClient`.
 */

/** Mínimo exigido pelo servidor. Só muda com OK do Javerson (e junto com a regra de lá). */
export const TAMANHO_MINIMO_SENHA = 6;
/** Teto do servidor (o campo da tela também usa). */
export const TAMANHO_MAXIMO_SENHA = 72;

const MSG_TAMANHO = `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`;
const MSG_LONGA = "Senha longa demais";
const MSG_USUARIO = "A senha não pode ser o seu usuário/CPF";
const MSG_FACIL = "Senha fácil demais — escolha outra";

/** CPF digitado com ou sem pontuação vira só dígitos; outro usuário, minúsculo. */
export function normalizarUsuario(bruto) {
  const u = (bruto || "").trim().toLowerCase();
  return /^[\d.\-\s/]+$/.test(u) ? u.replace(/\D/g, "") : u;
}

const SENHAS_FRACAS = new Set([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "654321",
  "123123",
  "000000",
  "111111",
  "222222",
  "999999",
  "senha1",
  "senha123",
  "abc123",
  "qwerty",
]);

const ehUsuario = (nova, usuario) => {
  const n = nova.toLowerCase();
  // sem o usuário conhecido (tela recarregada), esta regra fica para o servidor
  return !!usuario && (n === usuario || n.replace(/\D/g, "") === usuario);
};
const ehFraca = (nova) => {
  const n = nova.toLowerCase();
  return SENHAS_FRACAS.has(n) || /^(.)\1+$/.test(n);
};

/**
 * null = senha aceita; senão, o motivo da recusa (mesmo texto do servidor).
 * `usuario` é o usuário JÁ normalizado (`normalizarUsuario`); vazio = não conferir esta regra.
 */
export function motivoSenhaInvalida(nova, usuario) {
  if (!nova || nova.length < TAMANHO_MINIMO_SENHA) return MSG_TAMANHO;
  if (nova.length > TAMANHO_MAXIMO_SENHA) return MSG_LONGA;
  if (ehUsuario(nova, usuario)) return MSG_USUARIO;
  if (ehFraca(nova)) return MSG_FACIL;
  return null;
}

/**
 * As regras como lista para a tela: `{ id, texto, ok, aoSalvar }`, na ordem em que o servidor confere.
 * Sem nada digitado, ou antes do mínimo de caracteres, só o tamanho é avaliado: as outras ficam
 * pendentes (`ok: false`) em vez de aparecerem cumpridas por vacuidade. Todas `ok` (menos as
 * `aoSalvar`) = o servidor aceita a senha.
 *
 * Sem o usuário conhecido (tela recarregada: ele só existe na memória da página), a regra "diferente do
 * seu CPF ou usuário" NÃO PODE ser avaliada aqui: ela fica pendente (`ok: false`), com o texto dizendo
 * que o servidor confere ao salvar, e marcada `aoSalvar: true` para não travar o botão (T27, M1).
 */
export function regrasDaSenha(nova, usuario) {
  const s = nova || "";
  const tamanhoOk = s.length >= TAMANHO_MINIMO_SENHA && s.length <= TAMANHO_MAXIMO_SENHA;
  const usuarioConhecido = !!usuario;
  return [
    { id: "tamanho", texto: `Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`, ok: tamanhoOk },
    {
      id: "usuario",
      texto: usuarioConhecido
        ? "Diferente do seu CPF ou usuário"
        : "Diferente do seu CPF ou usuário (o servidor confere ao salvar)",
      ok: usuarioConhecido && tamanhoOk && !ehUsuario(s, usuario),
      aoSalvar: !usuarioConhecido,
    },
    {
      id: "facil",
      texto: "Nada de senha fácil, como 123456, 111111 ou senha123",
      ok: tamanhoOk && !ehFraca(s),
      aoSalvar: false,
    },
  ];
}

/**
 * Aviso para a senha que passou do limite do servidor (72 caracteres), em geral colada. O campo NÃO corta
 * o texto (um `maxLength` truncaria em silêncio, e o aluno só descobriria ao tentar entrar com a senha
 * inteira): ele vê o aviso, a regra de tamanho pendente e o botão desligado. null = dentro do limite.
 */
export function avisoDeSenhaLonga(senha) {
  const n = (senha || "").length;
  if (n <= TAMANHO_MAXIMO_SENHA) return null;
  return `A senha tem ${n} caracteres e o máximo é ${TAMANHO_MAXIMO_SENHA}. Use uma senha mais curta.`;
}

/** A confirmação só vale se foi digitada e é igual à nova senha. */
export function confirmacaoConfere(nova, confirma) {
  return !!confirma && nova === confirma;
}

/**
 * Avisa que a confirmação não vai bater, sem reclamar enquanto o aluno ainda digita: só quando ela saiu
 * do caminho da nova senha, isto é, não é o começo dela. Confirmação vazia, igual à nova ou mais curta e
 * ainda no caminho não avisa. (Confirmação do tamanho da nova ou maior que ainda é o começo dela só pode
 * ser igual, e igual não avisa: não há outro caso.)
 */
export function confirmacaoDivergiu(nova, confirma) {
  if (!confirma || confirma === nova) return false;
  return !(nova || "").startsWith(confirma);
}

/** Troca voluntária: o servidor recusa nova senha igual à atual. Só avisa com as duas digitadas. */
export function senhaNovaIgualAtual(nova, atual) {
  return !!nova && !!atual && nova === atual;
}

/**
 * Habilita o botão "Salvar senha". No 1º acesso (`obrigatoria`, senha provisória) não há senha atual a
 * pedir; na troca voluntária ela é obrigatória e a nova tem de ser diferente dela.
 */
export function podeTrocarSenha({ atual, nova, confirma, obrigatoria, usuario }) {
  if (!obrigatoria && !atual) return false;
  if (!obrigatoria && senhaNovaIgualAtual(nova, atual)) return false;
  // a regra que fica para o servidor (usuário desconhecido) não trava o botão: ele confere ao salvar
  if (!regrasDaSenha(nova, usuario).every((r) => r.ok || r.aoSalvar)) return false;
  return confirmacaoConfere(nova, confirma);
}
