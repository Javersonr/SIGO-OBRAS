/**
 * Busca tolerante — helpers usados no app inteiro.
 *
 * `normalizarTexto` põe os DOIS lados da comparação em minúsculas e sem
 * acentos ("Elétrica" → "eletrica"), então "joao" acha "João". Para strings
 * ASCII o resultado é idêntico ao toLowerCase() puro — seguro inclusive em
 * checagens técnicas ('xml', 'nfe', ...).
 *
 * `matchBusca` é a busca multi-termo: divide o texto digitado por espaço e
 * exige que CADA termo apareça em algum dos campos (em qualquer ordem).
 */

export function normalizarTexto(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function matchBusca(busca, ...campos) {
  const termos = normalizarTexto(busca).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;
  const alvo = normalizarTexto(campos.filter(Boolean).join(" "));
  return termos.every((termo) => alvo.includes(termo));
}
