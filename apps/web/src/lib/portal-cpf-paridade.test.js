import { describe, it, expect } from "vitest";
import { formatarCpf, validarCpf } from "./cpf";
import { cpfValido } from "../../../../supabase/functions/_shared/portal-credencial.ts";

/**
 * T38 (P8): o servidor só cria o acesso ao portal com CPF de dígitos verificadores certos, porque um CPF digitado
 * errado ligaria o cadastro à credencial de OUTRA pessoa (R4). A conta do servidor (`cpfValido`, em
 * `_shared/portal-credencial.ts`) é a mesma de `lib/cpf.js` (`validarCpf`, que a tela usa): este teste roda as duas
 * sobre a mesma lista (modelo: `portal-senha.test.js`). Mudou uma, muda a outra. Só CPFs sintéticos, gerados aqui.
 */

/** CPF com os dígitos verificadores certos, a partir de 9 dígitos fictícios. */
function cpfCom(base9) {
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base9);
  return `${base9}${d1}${dv(base9 + d1)}`;
}

const validos = ["100200300", "400500600", "000000001", "987654321", "123123123", "555444333"].map(
  cpfCom
);
const trocaUltimo = (cpf) => cpf.slice(0, 10) + String((Number(cpf[10]) + 1) % 10);
const trocaPenultimo = (cpf) => cpf.slice(0, 9) + String((Number(cpf[9]) + 1) % 10) + cpf[10];

const casos = [
  ...validos,
  ...validos.map(formatarCpf),
  ...validos.map((c) => ` ${formatarCpf(c)} `),
  ...validos.map(trocaUltimo),
  ...validos.map(trocaPenultimo),
  "00000000000",
  "11111111111",
  "99999999999",
  "1234567890",
  "123456789012",
  "",
  "   ",
  "abc",
  `CPF ${validos[0]}`,
  `${validos[0]}x`,
  `${validos[0].slice(0, 3)}/${validos[0].slice(3)}`,
  null,
  undefined,
];

describe("portal: o CPF do acesso é conferido igual na tela e no servidor (T38, P8)", () => {
  it("as duas contas dizem o mesmo para toda a lista", () => {
    for (const cpf of casos) {
      expect(cpfValido(cpf), String(cpf)).toBe(validarCpf(cpf));
    }
  });

  it("a lista tem válidos e inválidos (o teste não passa vazio)", () => {
    const resultados = casos.map((c) => validarCpf(c));
    expect(resultados.filter(Boolean).length).toBeGreaterThanOrEqual(12);
    expect(resultados.filter((r) => !r).length).toBeGreaterThanOrEqual(12);
  });
});
