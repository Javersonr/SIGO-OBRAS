// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/financeiro-documento.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { paraSchemaGemini } from "../_shared/gemini-regras.ts";
import {
  chaveNfeValida,
  documentoFraco,
  MAX_ITENS_DOCUMENTO,
  normalizarDocumento,
  promptDocumento,
  SCHEMA_DOCUMENTO_FISCAL,
} from "./financeiro-documento.ts";

type Obj = Record<string, unknown>;

// chaves com DV calculado à mão (pesos 2..9 da direita p/ esquerda, módulo 11)
const CHAVE = "31260911222333000181550010000012341123456788"; // MG, NF-e 55, DV 8
const CHAVE_NFCE = "35260911222333000181650010000098761111222338"; // SP, NFC-e 65, DV 8
const CHAVE_RESTO_0 = "31260911222333000181550010000012341000000050"; // resto 0 → DV 0
const CHAVE_RESTO_1 = "31260911222333000181550010000012341000000000"; // resto 1 → DV 0

test("chaveNfeValida: DV módulo 11 (resto < 2 → 0)", () => {
  assert.equal(chaveNfeValida(CHAVE), true);
  assert.equal(chaveNfeValida(CHAVE_NFCE), true);
  assert.equal(chaveNfeValida(CHAVE_RESTO_0), true);
  assert.equal(chaveNfeValida(CHAVE_RESTO_1), true);
  // DV trocado
  assert.equal(chaveNfeValida(CHAVE.slice(0, 43) + "7"), false);
  assert.equal(chaveNfeValida(CHAVE_RESTO_0.slice(0, 43) + "1"), false);
  // um dígito do meio trocado muda o DV esperado
  assert.equal(chaveNfeValida("31260911222333000181550010000012351123456788"), false);
});

test("chaveNfeValida: formato, UF e modelo", () => {
  assert.equal(chaveNfeValida(CHAVE.slice(0, 43)), false); // 43 dígitos
  assert.equal(chaveNfeValida(CHAVE + "0"), false); // 45 dígitos
  assert.equal(chaveNfeValida(CHAVE.replace(/(\d{4})/g, "$1 ").trim()), false); // com espaços
  assert.equal(chaveNfeValida("0".repeat(44)), false); // DV "bate", mas UF 00 não existe
  assert.equal(chaveNfeValida("99260911222333000181550010000012341123456784"), false); // UF 99
  assert.equal(chaveNfeValida("31260911222333000181570010000012341123456785"), false); // CT-e (57)
  assert.equal(chaveNfeValida(Number(CHAVE)), false);
  assert.equal(chaveNfeValida(null), false);
  assert.equal(chaveNfeValida(undefined), false);
});

/** percorre o schema e devolve todos os nós (com o caminho) */
function nos(s: unknown, caminho = "$"): [string, Obj][] {
  if (!s || typeof s !== "object") return [];
  const o = s as Obj;
  const out: [string, Obj][] = [[caminho, o]];
  for (const [k, v] of Object.entries((o.properties as Obj) ?? {})) {
    out.push(...nos(v, `${caminho}.${k}`));
  }
  if (o.items) out.push(...nos(o.items, `${caminho}[]`));
  for (const v of (o.anyOf as unknown[]) ?? []) out.push(...nos(v, `${caminho}|`));
  return out;
}

test("SCHEMA_DOCUMENTO_FISCAL é estrito e espelha o DocumentoFiscal (sem origem)", () => {
  const s = SCHEMA_DOCUMENTO_FISCAL as Obj;
  assert.deepEqual(Object.keys(s.properties as Obj), [
    "tipo",
    "numero",
    "chave",
    "data_emissao",
    "valor_total",
    "emitente",
    "destinatario",
    "vencimentos",
    "forma_pagamento",
    "descricao",
    "itens",
    "avisos",
    "duvidosos",
  ]);
  const objetos = nos(s).filter(([, n]) => n.type === "object");
  assert.equal(objetos.length, 5); // raiz, emitente, destinatario, vencimento, item
  for (const [caminho, n] of objetos) {
    assert.equal(n.additionalProperties, false, caminho);
    assert.deepEqual(n.required, Object.keys(n.properties as Obj), caminho);
  }
  for (const [caminho, n] of nos(s)) {
    if (Array.isArray(n.enum) && n.enum.includes(null)) {
      assert.ok((n.type as string[]).includes("null"), caminho);
    }
  }
  const props = s.properties as Obj;
  assert.deepEqual((props.tipo as Obj).type, "string");
  assert.deepEqual((props.forma_pagamento as Obj).enum, [
    "pix",
    "boleto",
    "cartao",
    "dinheiro",
    "transferencia",
    null,
  ]);
});

test("schema convertido para o Gemini: enum anulável vira anyOf e nada de null em enum", () => {
  const g = paraSchemaGemini(SCHEMA_DOCUMENTO_FISCAL);
  for (const [caminho, n] of nos(g)) {
    if (Array.isArray(n.enum)) assert.ok(!n.enum.includes(null), caminho);
  }
  const forma = ((g as Obj).properties as Obj).forma_pagamento as Obj;
  assert.deepEqual(forma.anyOf, [
    { type: "string", enum: ["pix", "boleto", "cartao", "dinheiro", "transferencia"] },
    { type: "null" },
  ]);
});

test("prompt: pessoa certa por tipo de lançamento e regras de leitura", () => {
  const despesa = promptDocumento("despesa");
  const receita = promptDocumento("receita");
  assert.match(despesa, /DESPESA/);
  assert.match(despesa, /em emitente o emitente da nota, o prestador/);
  assert.match(receita, /RECEITA/);
  assert.match(receita, /em destinatario o destinatário da nota, o tomador/);
  assert.notEqual(despesa, receita);
  for (const p of [despesa, receita]) {
    assert.match(p, /NUNCA invente/);
    assert.match(p, /= null/);
    assert.match(p, /AAAA-MM-DD/);
    assert.match(p, /SOMENTE se estiver impressa/);
    assert.match(p, /no boleto, a data de vencimento/);
    assert.match(p, /duvidosos/);
    assert.match(p, new RegExp(`no máximo ${MAX_ITENS_DOCUMENTO}`));
  }
});

test("normalizarDocumento: DANFE completo", () => {
  const doc = normalizarDocumento({
    tipo: "nfe",
    numero: "000.001.234",
    chave: "3126 0911 2223 3300 0181 5500 1000 0012 3411 2345 6788",
    data_emissao: "2026-09-10",
    valor_total: 1500.5,
    emitente: {
      nome: "  ELETRICA   M&M LTDA ",
      documento: "11.222.333/0001-81",
      ie: "0012345670011",
      endereco: "Rua A, 10 - Centro - Araxá/MG",
    },
    destinatario: { nome: "SINERGIA CONSTRUCOES", documento: "28.182.842/0001-20" },
    vencimentos: [
      { numero: "002", data: "2026-11-10", valor: 750.25 },
      { numero: "001", data: "2026-10-10", valor: 750.25 },
    ],
    forma_pagamento: "boleto",
    descricao: "Materiais elétricos",
    itens: [
      {
        descricao: "CABO FLEXIVEL 2,5MM",
        codigo: "123",
        ean: "SEM GTIN",
        ncm: "8544.49.00",
        unidade: "M",
        quantidade: 100,
        valor_unitario: 3.456789,
        valor_total: 345.68,
      },
      { descricao: "  ", codigo: "X" },
    ],
    avisos: [],
    duvidosos: ["vencimentos"],
  });
  assert.deepEqual(doc, {
    origem: "ia",
    tipo: "nfe",
    numero: "1234",
    chave: CHAVE,
    data_emissao: "2026-09-10",
    valor_total: 1500.5,
    emitente: {
      nome: "ELETRICA M&M LTDA",
      documento: "11222333000181",
      ie: "0012345670011",
      endereco: "Rua A, 10 - Centro - Araxá/MG",
    },
    destinatario: { nome: "SINERGIA CONSTRUCOES", documento: "28182842000120" },
    vencimentos: [
      { numero: "001", data: "2026-10-10", valor: 750.25 },
      { numero: "002", data: "2026-11-10", valor: 750.25 },
    ],
    forma_pagamento: "boleto",
    descricao: "Materiais elétricos",
    itens: [
      {
        descricao: "CABO FLEXIVEL 2,5MM",
        codigo: "123",
        ean: null,
        ncm: "85444900",
        unidade: "M",
        quantidade: 100,
        valor_unitario: 3.4568,
        valor_total: 345.68,
      },
    ],
    avisos: [],
    duvidosos: ["vencimentos"],
  });
});

test("normalizarDocumento: chave com DV errado vira null com aviso", () => {
  const doc = normalizarDocumento({ tipo: "nfe", chave: CHAVE.slice(0, 43) + "1" });
  assert.equal(doc.chave, null);
  assert.deepEqual(doc.avisos, [
    "A chave de acesso lida não é uma chave de NF-e válida (dígito verificador) e foi descartada — confira no documento.",
  ]);
  // sem chave nenhuma: sem aviso
  assert.deepEqual(normalizarDocumento({ tipo: "recibo", chave: null }).avisos, []);
});

test("normalizarDocumento: CPF/CNPJ só com 11 ou 14 dígitos; senão null e em dúvida", () => {
  const doc = normalizarDocumento({
    emitente: { nome: "JOSE", documento: "123.456.789-01" },
    destinatario: { nome: "X", documento: "11.222.333/0001" },
  });
  assert.equal(doc.emitente.documento, "12345678901");
  assert.equal(doc.destinatario.documento, null);
  assert.deepEqual(doc.duvidosos, ["destinatario.documento"]);
});

test("normalizarDocumento: datas reais em AAAA-MM-DD", () => {
  assert.equal(normalizarDocumento({ data_emissao: "31/12/2026" }).data_emissao, "2026-12-31");
  assert.equal(
    normalizarDocumento({ data_emissao: "2026-09-01T10:30:00-03:00" }).data_emissao,
    "2026-09-01"
  );
  const invalida = normalizarDocumento({ data_emissao: "2026-02-30" });
  assert.equal(invalida.data_emissao, null);
  assert.deepEqual(invalida.duvidosos, ["data_emissao"]);
  assert.equal(normalizarDocumento({ data_emissao: "setembro" }).data_emissao, null);
  assert.deepEqual(normalizarDocumento({ data_emissao: null }).duvidosos, []);
});

test("normalizarDocumento: valores ≥ 0 com 2 casas; texto brasileiro aceito", () => {
  assert.equal(normalizarDocumento({ valor_total: "R$ 1.234,56" }).valor_total, 1234.56);
  assert.equal(normalizarDocumento({ valor_total: 99.999 }).valor_total, 100);
  assert.equal(normalizarDocumento({ valor_total: 0 }).valor_total, 0);
  const negativo = normalizarDocumento({ valor_total: -10 });
  assert.equal(negativo.valor_total, null);
  assert.deepEqual(negativo.duvidosos, ["valor_total"]);
  assert.equal(normalizarDocumento({ valor_total: "abc" }).valor_total, null);
});

test("normalizarDocumento: boleto com um vencimento sem valor usa o total", () => {
  const doc = normalizarDocumento({
    tipo: "boleto",
    valor_total: 320,
    vencimentos: [{ numero: null, data: "2026-10-05", valor: null }],
  });
  assert.deepEqual(doc.vencimentos, [{ numero: null, data: "2026-10-05", valor: 320 }]);
  assert.deepEqual(doc.avisos, []);
});

test("normalizarDocumento: vencimento ilegível é ignorado; soma ≠ total vira aviso", () => {
  const doc = normalizarDocumento({
    valor_total: 1000,
    vencimentos: [
      { numero: "2", data: "2026-11-10", valor: 400 },
      { numero: "1", data: "2026-10-10", valor: 400 },
      { numero: "3", data: null, valor: 200 },
    ],
  });
  assert.deepEqual(
    doc.vencimentos.map((v) => v.numero),
    ["1", "2"]
  );
  assert.deepEqual(doc.avisos, [
    "1 vencimento(s) sem data ou valor legível foram ignorados — confira as parcelas.",
    "A soma das parcelas (R$ 800,00) difere do valor total (R$ 1.000,00) — confira.",
  ]);
  // diferença de até R$ 0,05 não avisa
  const quase = normalizarDocumento({
    valor_total: 1000.04,
    vencimentos: [{ data: "2026-10-10", valor: 1000 }],
  });
  assert.deepEqual(quase.avisos, []);
});

test("normalizarDocumento: itens limitados ao máximo, com aviso", () => {
  const itens = Array.from({ length: MAX_ITENS_DOCUMENTO + 5 }, (_, i) => ({
    descricao: `ITEM ${i + 1}`,
  }));
  const doc = normalizarDocumento({ itens });
  assert.equal(doc.itens.length, MAX_ITENS_DOCUMENTO);
  assert.equal(doc.itens[MAX_ITENS_DOCUMENTO - 1].descricao, `ITEM ${MAX_ITENS_DOCUMENTO}`);
  assert.deepEqual(doc.avisos, [
    `Só os ${MAX_ITENS_DOCUMENTO} primeiros itens foram lidos — para trazer todos, use o XML da nota.`,
  ]);
});

test("normalizarDocumento: lixo vira documento vazio (tipo outro), sem lançar", () => {
  const vazio = {
    origem: "ia",
    tipo: "outro",
    numero: null,
    chave: null,
    data_emissao: null,
    valor_total: null,
    emitente: { nome: null, documento: null, ie: null, endereco: null },
    destinatario: { nome: null, documento: null },
    vencimentos: [],
    forma_pagamento: null,
    descricao: null,
    itens: [],
    avisos: [],
    duvidosos: [],
  };
  for (const lixo of [null, undefined, "texto", 42, [1, 2], {}]) {
    assert.deepEqual(normalizarDocumento(lixo), vazio);
  }
  const d = normalizarDocumento({
    tipo: "fatura",
    forma_pagamento: "credito",
    numero: "123/2026",
    avisos: [" Imagem  borrada ", "Imagem borrada", 7, null],
    duvidosos: "valor_total",
  });
  assert.equal(d.tipo, "outro");
  assert.equal(d.forma_pagamento, null);
  assert.equal(d.numero, "123/2026");
  assert.deepEqual(d.avisos, ["Imagem borrada", "7"]);
  assert.deepEqual(d.duvidosos, []);
});

test("documentoFraco: sem valor total ou sem a pessoa do lançamento", () => {
  const base = normalizarDocumento({
    valor_total: 10,
    emitente: { nome: "LOJA" },
    destinatario: { nome: "CLIENTE" },
  });
  assert.equal(documentoFraco(base), false);
  assert.equal(documentoFraco(base, "despesa"), false);
  assert.equal(documentoFraco(base, "receita"), false);
  assert.equal(documentoFraco({ ...base, valor_total: null }), true);
  assert.equal(documentoFraco({ ...base, valor_total: 0 }), false);
  const semEmitente = { ...base, emitente: { ...base.emitente, nome: null } };
  assert.equal(documentoFraco(semEmitente), true);
  assert.equal(documentoFraco(semEmitente, "receita"), false);
  const semDestinatario = { ...base, destinatario: { nome: null, documento: null } };
  assert.equal(documentoFraco(semDestinatario, "despesa"), false);
  assert.equal(documentoFraco(semDestinatario, "receita"), true);
});
