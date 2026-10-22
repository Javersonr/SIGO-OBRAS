// node --test supabase/functions/_shared/documentos/declaracao-comum.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caixaDoLogo,
  linhasDaAssinatura,
  linhasDaEmpresa,
  LOGO_ALTURA_MM,
  LOGO_LARGURA_MM,
} from "./declaracao-comum.ts";
import * as docx from "./declaracao-docx.ts";
import { DADOS } from "./testes/amostras.ts";

test("caixaDoLogo: cabe em 50 x 18 mm sem deformar", () => {
  assert.equal(LOGO_LARGURA_MM, 50);
  assert.equal(LOGO_ALTURA_MM, 18);
  // limitado pela altura
  assert.deepEqual(caixaDoLogo({ largura: 200, altura: 100 }), { larguraMm: 36, alturaMm: 18 });
  // limitado pela largura
  assert.deepEqual(caixaDoLogo({ largura: 400, altura: 50 }), { larguraMm: 50, alturaMm: 6.25 });
  // imagem pequena é ampliada até a caixa (o logo de 1 x 1 px é só um exemplo de proporção)
  assert.deepEqual(caixaDoLogo({ largura: 1, altura: 1 }), { larguraMm: 18, alturaMm: 18 });
});

test("linhasDaEmpresa e linhasDaAssinatura: dados do papel timbrado e da assinatura, sem linha vazia", () => {
  assert.deepEqual(linhasDaEmpresa(DADOS), [
    "Empresa Teste Construções & Serviços Ltda",
    "CNPJ: 11.222.333/0001-81",
    "Rua das Obras, 100 - Centro - Cidade/MG - CEP 38000-000",
    "Telefone: (34) 3333-0000 | E-mail: contato@exemplo.test",
  ]);
  assert.deepEqual(linhasDaAssinatura(DADOS), [
    "Fulana de Tal",
    "Sócia-administradora",
    "CPF: 529.982.247-25",
    "Empresa Teste Construções & Serviços Ltda",
  ]);
  const vazio = {
    ...DADOS,
    empresa: { ...DADOS.empresa, cnpj: "", endereco: "", contato: "" },
    representante: { nome: "Fulana de Tal", cargo: "", cpf: "" },
  };
  assert.deepEqual(linhasDaEmpresa(vazio), ["Empresa Teste Construções & Serviços Ltda"]);
  assert.deepEqual(linhasDaAssinatura(vazio), [
    "Fulana de Tal",
    "Empresa Teste Construções & Serviços Ltda",
  ]);
});

test("declaracao-docx.ts continua exportando as constantes do logo (o contrato das próximas tasks)", () => {
  assert.equal(docx.LOGO_LARGURA_MM, LOGO_LARGURA_MM);
  assert.equal(docx.LOGO_ALTURA_MM, LOGO_ALTURA_MM);
  assert.equal(typeof docx.gerarDocxDeclaracao, "function");
});
