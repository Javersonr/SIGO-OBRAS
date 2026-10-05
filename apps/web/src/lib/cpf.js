/**
 * CPF: validação pelos dígitos verificadores e máscara 000.000.000-00.
 * Mesmo estilo de validarCnpj (lib/cnpj.js). Usado no representante legal da
 * empresa (Configurações → Empresa) e no diálogo "Exportar proposta".
 */

function soDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * true se o CPF tem 11 dígitos, não são todos iguais e os dois dígitos
 * verificadores conferem. Aceita com ou sem máscara; letras invalidam.
 */
export function validarCpf(cpf) {
  const texto = String(cpf ?? "").trim();
  if (/[^\d.\-\s]/.test(texto)) return false;
  const d = soDigitos(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  // pesos 10..2 (1º dígito) e 11..2 (2º dígito); resto 10 vira 0
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/**
 * Máscara 000.000.000-00, progressiva (serve para o campo enquanto digita):
 * "5299" → "529.9". Corta em 11 dígitos; vazio/null → "".
 */
export function formatarCpf(cpf) {
  const d = soDigitos(cpf).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
