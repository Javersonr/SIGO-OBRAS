// node --test supabase/functions/_shared/documentos/formatos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dataPorExtenso,
  formatarCep,
  formatarCpf,
  formatarCpfCnpj,
  validarCpf,
  valorPorExtenso,
} from "./formatos.ts";

test("valorPorExtenso: reais e centavos, com 'de' no milhão redondo", () => {
  assert.equal(valorPorExtenso(0), "zero reais");
  assert.equal(valorPorExtenso(1), "um real");
  assert.equal(valorPorExtenso(0.01), "um centavo");
  assert.equal(valorPorExtenso(1100), "mil e cem reais");
  assert.equal(valorPorExtenso(2500), "dois mil e quinhentos reais");
  assert.equal(valorPorExtenso(1000000), "um milhão de reais");
  assert.equal(valorPorExtenso(1152.09), "mil cento e cinquenta e dois reais e nove centavos");
  assert.equal(
    valorPorExtenso(1417472.96),
    "um milhão quatrocentos e dezessete mil quatrocentos e setenta e dois reais e noventa e seis centavos"
  );
});

test("CPF, CNPJ, CEP e data por extenso", () => {
  assert.equal(validarCpf("529.982.247-25"), true);
  assert.equal(validarCpf("529.982.247-26"), false);
  assert.equal(validarCpf("111.111.111-11"), false);
  assert.equal(formatarCpf("52998224725"), "529.982.247-25");
  assert.equal(formatarCpf("5299"), "529.9");
  assert.equal(formatarCpfCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarCpfCnpj("52998224725"), "529.982.247-25");
  assert.equal(formatarCep("38000000"), "38000-000");
  assert.equal(formatarCep("38.000"), "38.000");
  assert.equal(dataPorExtenso("2026-10-05"), "05 de outubro de 2026");
  assert.equal(dataPorExtenso("2026-13-05"), "");
  assert.equal(dataPorExtenso(null), "");
});
