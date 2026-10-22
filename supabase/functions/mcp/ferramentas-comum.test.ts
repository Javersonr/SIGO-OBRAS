// node --test supabase/functions/mcp/ferramentas-comum.test.ts
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRAVACAO,
  ID_OPORTUNIDADE,
  logarErro,
  mensagemSemCaminho,
  nomeDoUsuario,
  plural,
} from "./ferramentas-comum.ts";
import type { DepsFerramenta } from "./registro.ts";

test("nomeDoUsuario: o nome do usuário da chave, marcado como 'via Claude'", () => {
  const deps = { ctx: { usuario: { nome: "Usuária Teste" } } } as unknown as DepsFerramenta;
  assert.equal(nomeDoUsuario(deps), "Usuária Teste (via Claude)");
});

test("plural: singular só para 1", () => {
  assert.equal(plural(1, "documento", "documentos"), "1 documento");
  assert.equal(plural(0, "documento", "documentos"), "0 documentos");
  assert.equal(plural(2, "documento", "documentos"), "2 documentos");
  assert.equal(plural(12, "cópia", "cópias"), "12 cópias");
});

test("ID_OPORTUNIDADE e GRAVACAO: o esquema do id e as anotações das ferramentas que gravam", () => {
  assert.deepEqual(ID_OPORTUNIDADE, { type: "string", description: "UUID da oportunidade" });
  assert.deepEqual(GRAVACAO, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
});

test("mensagemSemCaminho: tira caminho, URL e número longo (CPF, CNPJ) da mensagem e corta em 300", () => {
  // caminho / URL / ref do Storage
  assert.equal(
    mensagemSemCaminho(new Error("falhou em anexos-oportunidade/E/2026/10/a.pdf agora")),
    "falhou em [caminho] agora"
  );
  assert.equal(
    mensagemSemCaminho(new Error("fetch https://x.exemplo.test/arquivo.pdf?t=1 falhou")),
    "fetch [caminho] falhou"
  );
  // número longo: CPF com e sem máscara, CNPJ sem máscara, telefone
  assert.equal(
    mensagemSemCaminho(new Error("CPF 529.982.247-25 inválido")),
    "CPF [numero] inválido"
  );
  assert.equal(mensagemSemCaminho(new Error("CPF 52998224725 inválido")), "CPF [numero] inválido");
  assert.equal(mensagemSemCaminho(new Error("CNPJ 11222333000181 x")), "CNPJ [numero] x");
  // número curto e texto comum ficam
  assert.equal(mensagemSemCaminho(new Error("linha 12 de 3 falhou")), "linha 12 de 3 falhou");
  // o que não é Error vira texto; o corte é em 300
  assert.equal(mensagemSemCaminho("texto simples"), "texto simples");
  assert.equal(mensagemSemCaminho(new Error("x".repeat(500))).length, 300);
});

test("logarErro: o nome do erro e a mensagem sem caminho nem número, nunca a ref", () => {
  const log = mock.method(console, "error", () => {});
  try {
    logarErro(
      "ferramenta_x",
      "ler o arquivo",
      new TypeError("sem acesso a a/b/c.pdf (52998224725)")
    );
    logarErro("ferramenta_x", "outra coisa", "texto");
    assert.deepEqual(
      log.mock.calls.map((c) => c.arguments[0]),
      [
        "[conector] ferramenta_x: ler o arquivo: TypeError: sem acesso a [caminho] ([numero])",
        "[conector] ferramenta_x: outra coisa: string: texto",
      ]
    );
  } finally {
    log.mock.restore();
  }
});

test("as ferramentas novas da habilitação usam os helpers comuns e não têm mais cópia deles", () => {
  const copias = [
    /\bconst nomeDoUsuario\b/,
    /\bconst plural\b/,
    /\bconst GRAVACAO\b/,
    /\bconst ID_OPORTUNIDADE\b/,
    /\bconst mensagemSemCaminho\b/,
    /\bfunction logarErro\b/,
  ];
  for (const arquivo of ["./ferramentas-habilitacao.ts", "./ferramentas-documentos.ts"]) {
    const fonte = readFileSync(new URL(arquivo, import.meta.url), "utf8");
    for (const copia of copias) assert.ok(!copia.test(fonte), `${arquivo} ainda define ${copia}`);
    assert.ok(
      fonte.includes('from "./ferramentas-comum.ts"'),
      `${arquivo} não importa o módulo comum`
    );
  }
});
