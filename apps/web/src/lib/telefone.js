/**
 * Telefone brasileiro: máscara padrão "(00) 00000-0000" / "(00) 0000-0000".
 *
 * Mesma regra do servidor (normalizarTelefoneBR em _shared/whatsapp-envio.ts):
 * DDD + 8 dígitos (fixo) ou DDD + 9 dígitos (celular). Número fora disso não
 * é enviado pelo WhatsApp automático — por isso a validação no cadastro.
 */

/**
 * Só os dígitos, sem o +55 e sem o 0 de discagem interurbana ("(017)...").
 * Cuidado com números que só PARECEM ter prefixo:
 *  - "(55) 99999-9999" é DDD 55 (RS): com o texto já mascarado ("(" no início)
 *    um 12º dígito digitado NÃO faz o "55" virar código do país;
 *  - 0800/0300/0500/0900 são números de serviço: ficam como estão (e inválidos).
 */
export function digitosTelefone(valor) {
  const bruto = String(valor ?? "").trim();
  let d = bruto.replace(/\D/g, "");
  if (/^0[3589]00/.test(d)) return d;
  const mascarado = bruto.startsWith("(");
  if (d.startsWith("55") && (d.length === 13 || (d.length === 12 && !mascarado))) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  return d;
}

/** Máscara progressiva para digitação (no máximo 11 dígitos). */
export function mascaraTelefone(valor) {
  const d = digitosTelefone(valor).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Vazio conta como válido (campo opcional). DDD não tem 0; celular (11 dígitos) começa com 9. */
export function telefoneValido(valor) {
  const d = digitosTelefone(valor);
  if (!d) return true;
  if (d[0] === "0" || d[1] === "0") return false;
  if (d.length === 11) return d[2] === "9";
  return d.length === 10;
}

/** Formata para exibir/salvar; valor irreconhecível volta como veio (não esconde o erro). */
export function formatarTelefone(valor) {
  const d = digitosTelefone(valor);
  return d && telefoneValido(valor) ? mascaraTelefone(d) : String(valor ?? "");
}

export function mensagemTelefoneInvalido(valor) {
  const n = digitosTelefone(valor).length;
  if (n === 10 || n === 11) {
    return "Telefone inválido: confira o DDD e o número (celular tem 9 dígitos e começa com 9), ex.: (64) 99999-9999";
  }
  return `Telefone inválido (${n} dígito${n === 1 ? "" : "s"}): informe DDD + número, ex.: (64) 99999-9999`;
}
