// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/saas-config/regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAVES_COTA,
  MODELOS_OPENAI,
  statusCotas,
  statusGemini,
  validarDefinir,
} from "./regras.ts";

const CHAVE_GEMINI = "AIzaSyTESTE0000000000000000000000001234";

test("definir: chave do Gemini aparada e aceita sem checar prefixo", () => {
  assert.deepEqual(validarDefinir({ chave_gemini: `  ${CHAVE_GEMINI}\n` }), {
    ok: true,
    linhas: [{ chave: "gemini_api_key", valor: CHAVE_GEMINI }],
  });
  // prefixo diferente de AIza também vale (o Google muda o formato das chaves)
  assert.equal(validarDefinir({ chave_gemini: "AQ.Ab8RN6K_teste_chave_nova_42" }).ok, true);
});

test("definir: chave do Gemini curta, com espaço no meio ou que não é texto é recusada", () => {
  const erro = "Chave do Gemini inválida (sem espaços, com 20 caracteres ou mais)";
  assert.deepEqual(validarDefinir({ chave_gemini: "AIzaSy123" }), { ok: false, erro });
  assert.deepEqual(validarDefinir({ chave_gemini: "AIzaSyTESTE 0000000000000000001234" }), {
    ok: false,
    erro,
  });
  assert.deepEqual(validarDefinir({ chave_gemini: 12345678901234567890 }), { ok: false, erro });
  assert.deepEqual(validarDefinir({ chave_gemini: null }), { ok: false, erro });
});

test("definir: modelos do Gemini só das listas permitidas", () => {
  assert.deepEqual(
    validarDefinir({
      gemini_modelo: "gemini-3.8-flash",
      gemini_modelo_forte: "gemini-3.1-pro-preview",
    }),
    {
      ok: true,
      linhas: [
        { chave: "gemini_modelo", valor: "gemini-3.8-flash" },
        { chave: "gemini_modelo_forte", valor: "gemini-3.1-pro-preview" },
      ],
    }
  );
  assert.deepEqual(validarDefinir({ gemini_modelo: "gemini-3.1-pro-preview" }), {
    ok: false,
    erro: "Modelo padrão do Gemini deve ser um de: gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.8-flash",
  });
  assert.deepEqual(validarDefinir({ gemini_modelo_forte: "gemini-3.5-flash-lite" }), {
    ok: false,
    erro: "Modelo forte do Gemini deve ser um de: gemini-3.8-flash, gemini-3.1-pro-preview",
  });
});

test("definir: OpenAI mantém as regras de hoje", () => {
  assert.deepEqual([...MODELOS_OPENAI], ["gpt-4o-mini", "gpt-4o"]);
  assert.deepEqual(
    validarDefinir({ chave_openai: " sk-teste000000000000000000 ", modelo: "gpt-4o" }),
    {
      ok: true,
      linhas: [
        { chave: "openai_api_key", valor: "sk-teste000000000000000000" },
        { chave: "openai_modelo", valor: "gpt-4o" },
      ],
    }
  );
  assert.deepEqual(validarDefinir({ chave_openai: "chave-sem-prefixo-0000000000" }), {
    ok: false,
    erro: "Chave OpenAI inválida (deve começar com sk-)",
  });
  assert.deepEqual(validarDefinir({ modelo: "gpt-5" }), {
    ok: false,
    erro: "Modelo deve ser um de: gpt-4o-mini, gpt-4o",
  });
});

test("definir: cotas diárias de IA, inteiro de 1 a 100000, gravadas como texto", () => {
  assert.deepEqual(validarDefinir({ cota_edital_dia: 1, cota_geral_dia: 100000 }), {
    ok: true,
    linhas: [
      { chave: "ia_cota_edital_dia", valor: "1" },
      { chave: "ia_cota_geral_dia", valor: "100000" },
    ],
  });
  // as duas são opcionais: quem não veio não é mexido
  assert.deepEqual(validarDefinir({ cota_geral_dia: 250 }), {
    ok: true,
    linhas: [{ chave: "ia_cota_geral_dia", valor: "250" }],
  });
  assert.deepEqual(validarDefinir({ cota_edital_dia: 400 }), {
    ok: true,
    linhas: [{ chave: "ia_cota_edital_dia", valor: "400" }],
  });
  // junto com outros campos
  assert.deepEqual(validarDefinir({ gemini_modelo: "gemini-3.8-flash", cota_geral_dia: 300 }), {
    ok: true,
    linhas: [
      { chave: "gemini_modelo", valor: "gemini-3.8-flash" },
      { chave: "ia_cota_geral_dia", valor: "300" },
    ],
  });
});

test("definir: cota fora de 1..100000, fracionada ou que não é número é recusada", () => {
  const erroEdital =
    "Limite diário de leitura de editais inválido (informe um número inteiro de 1 a 100000)";
  const erroGeral =
    "Limite diário das demais ações de IA inválido (informe um número inteiro de 1 a 100000)";
  for (const ruim of [0, 100001, 12.5, -3, "abc", "", "50", null, NaN, Infinity, true, [10], {}]) {
    assert.deepEqual(validarDefinir({ cota_edital_dia: ruim }), { ok: false, erro: erroEdital });
    assert.deepEqual(validarDefinir({ cota_geral_dia: ruim }), { ok: false, erro: erroGeral });
  }
  // uma inválida recusa o pedido inteiro (nada é gravado), mesmo com a outra boa
  assert.deepEqual(validarDefinir({ cota_edital_dia: 400, cota_geral_dia: 0 }), {
    ok: false,
    erro: erroGeral,
  });
  assert.deepEqual(validarDefinir({ chave_gemini: CHAVE_GEMINI, cota_edital_dia: 100001 }), {
    ok: false,
    erro: erroEdital,
  });
});

test("definir: tudo junto sai na ordem; corpo vazio é recusado", () => {
  const r = validarDefinir({
    chave_openai: "sk-teste000000000000000000",
    modelo: "gpt-4o-mini",
    chave_gemini: CHAVE_GEMINI,
    gemini_modelo: "gemini-3.1-flash-lite",
    gemini_modelo_forte: "gemini-3.8-flash",
    cota_edital_dia: 500,
    cota_geral_dia: 200,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.linhas.map((l) => l.chave), [
    "openai_api_key",
    "openai_modelo",
    "gemini_api_key",
    "gemini_modelo",
    "gemini_modelo_forte",
    "ia_cota_edital_dia",
    "ia_cota_geral_dia",
  ]);
  assert.deepEqual(validarDefinir({}), { ok: false, erro: "Nada para definir" });
});

test("definir: um campo inválido recusa o pedido inteiro (nada é gravado)", () => {
  assert.deepEqual(validarDefinir({ chave_gemini: CHAVE_GEMINI, gemini_modelo: "gemini-9" }), {
    ok: false,
    erro: "Modelo padrão do Gemini deve ser um de: gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.8-flash",
  });
});

test("statusGemini: painel, secret, não configurada e modelo fora da lista; nunca devolve a chave", () => {
  const linhas = [
    { chave: "gemini_api_key", valor: CHAVE_GEMINI },
    { chave: "gemini_modelo", valor: "gemini-3.1-flash-lite" },
    { chave: "openai_api_key", valor: "sk-teste000000000000000000" },
  ];
  const painel = statusGemini(linhas, {});
  assert.deepEqual(painel, {
    configurada: true,
    final: "1234",
    origem: "painel",
    modelo: "gemini-3.1-flash-lite",
    modelo_forte: "gemini-3.8-flash",
  });
  assert.ok(!JSON.stringify(painel).includes("AIzaSy"));

  assert.deepEqual(statusGemini(linhas, { GEMINI_API_KEY: "AIzaSySECRET000000000000000009876" }), {
    configurada: true,
    final: "9876",
    origem: "secret",
    modelo: "gemini-3.1-flash-lite",
    modelo_forte: "gemini-3.8-flash",
  });

  assert.deepEqual(
    statusGemini([{ chave: "gemini_modelo_forte", valor: "gemini-9-ultra" }], {
      GEMINI_API_KEY: "",
    }),
    {
      configurada: false,
      final: null,
      origem: null,
      modelo: "gemini-3.5-flash-lite",
      modelo_forte: "gemini-3.8-flash",
    }
  );
});

test("statusCotas: valores efetivos; sem chave ou inválida valem os padrões 400 e 300", () => {
  assert.deepEqual([...CHAVES_COTA], ["ia_cota_edital_dia", "ia_cota_geral_dia"]);
  assert.deepEqual(statusCotas([]), { edital_dia: 400, geral_dia: 300 });
  assert.deepEqual(
    statusCotas([
      { chave: "ia_cota_edital_dia", valor: "50" },
      { chave: "ia_cota_geral_dia", valor: " 1000 " },
    ]),
    { edital_dia: 50, geral_dia: 1000 }
  );
  // só uma configurada: a outra fica no padrão
  assert.deepEqual(statusCotas([{ chave: "ia_cota_geral_dia", valor: "120" }]), {
    edital_dia: 400,
    geral_dia: 120,
  });
  // inválida (0, texto, decimal, vazia) → padrão; outras chaves são ignoradas
  assert.deepEqual(
    statusCotas([
      { chave: "ia_cota_edital_dia", valor: "0" },
      { chave: "ia_cota_geral_dia", valor: "abc" },
      { chave: "gemini_modelo", valor: "gemini-3.8-flash" },
    ]),
    { edital_dia: 400, geral_dia: 300 }
  );
  assert.deepEqual(
    statusCotas([
      { chave: "ia_cota_edital_dia", valor: "2.5" },
      { chave: "ia_cota_geral_dia", valor: null },
    ]),
    { edital_dia: 400, geral_dia: 300 }
  );
});
