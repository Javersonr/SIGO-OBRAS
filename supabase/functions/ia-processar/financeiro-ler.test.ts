// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/financeiro-ler.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { promptDocumento, SCHEMA_DOCUMENTO_FISCAL } from "./financeiro-documento.ts";
import { erroArquivoDocumento, lerDocumentoFinanceiro } from "./financeiro-ler.ts";
import { novoMedidor } from "./ia-uso.ts";

type Obj = Record<string, unknown>;

const REF = "comprovantes/11111111-2222-3333-4444-555555555555/2026/09/abc-danfe.pdf";

/** chamarIA falso: devolve as respostas na ordem e guarda as opções recebidas */
function chamadorFalso(respostas: Obj[]) {
  const pedidos: Obj[] = [];
  const chamar = async (o: Obj) => {
    pedidos.push(o);
    const r = respostas[pedidos.length - 1];
    if (!r) throw new Error("chamada a mais");
    return r;
  };
  // deno-lint-ignore no-explicit-any
  return { chamar: chamar as any, pedidos };
}

const ok = (resultado: unknown, extra: Obj = {}) => ({
  ok: true,
  resultado,
  modelo: "gemini-3.5-flash-lite",
  provedor: "gemini",
  ms: 10,
  ...extra,
});

const COMPLETO = {
  tipo: "nfe",
  numero: "123",
  valor_total: 150.5,
  emitente: { nome: "ELETRO LTDA", documento: "11222333000181" },
  destinatario: { nome: "SINERGIA", documento: null },
};
const SEM_VALOR = { ...COMPLETO, valor_total: null };

test("erroArquivoDocumento: PDF, JPG, JPEG, PNG e WEBP passam; HEIC pede JPEG; resto recusa", () => {
  for (const nome of ["a.pdf", "b.JPG", "c.jpeg", "d.png", "e.WebP"]) {
    assert.equal(erroArquivoDocumento(`comprovantes/x/${nome}`), null, nome);
  }
  assert.match(erroArquivoDocumento("comprovantes/x/IMG_0001.HEIC") ?? "", /tire a foto em JPEG/);
  assert.match(erroArquivoDocumento("comprovantes/x/foto.heif") ?? "", /tire a foto em JPEG/);
  assert.equal(
    erroArquivoDocumento("comprovantes/x/nota.docx"),
    "Formato não aceito — envie PDF, JPG, PNG ou WEBP."
  );
  assert.equal(
    erroArquivoDocumento("comprovantes/x/sem-extensao"),
    "Formato não aceito — envie PDF, JPG, PNG ou WEBP."
  );
});

test("entrada inválida: 400 sem chamar a IA", async () => {
  const f = chamadorFalso([]);
  assert.deepEqual(await lerDocumentoFinanceiro(f.chamar, { tipo: "despesa" }), {
    ok: false,
    erro: "file_ref é obrigatório",
    entrada: true,
  });
  assert.deepEqual(await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "compra" }), {
    ok: false,
    erro: 'tipo deve ser "despesa" ou "receita"',
    entrada: true,
  });
  const heic = await lerDocumentoFinanceiro(f.chamar, {
    file_ref: "comprovantes/x/IMG_0001.heic",
    tipo: "despesa",
  });
  assert.equal(heic.ok, false);
  assert.equal(!heic.ok && heic.entrada, true);
  assert.match((!heic.ok && heic.erro) || "", /tire a foto em JPEG/);
  assert.equal(f.pedidos.length, 0);
});

test("leitura boa no nível padrão: uma chamada com schema estrito, 60 s e 8000 tokens", async () => {
  const f = chamadorFalso([ok(COMPLETO)]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.deepEqual(f.pedidos, [
    {
      prompt: promptDocumento("despesa"),
      fileRefs: [REF],
      jsonSchema: SCHEMA_DOCUMENTO_FISCAL,
      nomeSchema: "documento_fiscal",
      strict: true,
      timeoutMs: 60_000,
      maxOutputTokens: 8_000,
      esforco: "low",
      nivel: "padrao",
    },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.nivel, "padrao");
  assert.equal(r.provedor, "gemini");
  assert.equal(r.modelo, "gemini-3.5-flash-lite");
  assert.equal(r.documento.origem, "ia");
  assert.equal(r.documento.valor_total, 150.5);
  assert.equal(r.documento.emitente.nome, "ELETRO LTDA");
  assert.deepEqual(r.documento.avisos, []);
});

test("fraco no padrão (sem valor): refaz no forte e fica com o forte", async () => {
  const f = chamadorFalso([ok(SEM_VALOR), ok(COMPLETO, { modelo: "gemini-3.8-flash" })]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.deepEqual(
    f.pedidos.map((p) => p.nivel),
    ["padrao", "forte"]
  );
  assert.equal(r.ok && r.nivel, "forte");
  assert.equal(r.ok && r.modelo, "gemini-3.8-flash");
  assert.equal(r.ok && r.documento.valor_total, 150.5);
});

test("forte não fraco vence o padrão fraco mesmo com menos campos", async () => {
  const padraoCheio = {
    ...SEM_VALOR,
    descricao: "Materiais elétricos",
    itens: [
      { descricao: "CABO", quantidade: 1, valor_total: 10 },
      { descricao: "FITA", quantidade: 2, valor_total: 5 },
    ],
  };
  const f = chamadorFalso([ok(padraoCheio), ok({ valor_total: 15, emitente: { nome: "LOJA" } })]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.equal(r.ok && r.nivel, "forte");
  assert.equal(r.ok && r.documento.emitente.nome, "LOJA");
});

test("fraco nos dois níveis: fica com o mais completo (avisos não contam) e avisa o que faltou", async () => {
  const f = chamadorFalso([
    ok({ numero: "9", avisos: ["borrado", "cortado", "torto", "escuro"] }),
    ok({ numero: "9", descricao: "Serviço", data_emissao: "2026-09-01" }),
  ]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.equal(r.ok && r.nivel, "forte");
  assert.deepEqual(r.ok && r.documento.avisos, [
    "Leitura incompleta: não encontrei o valor total nem o nome do fornecedor — confira o documento e preencha à mão.",
  ]);
});

test("receita: prompt de receita e a pessoa fraca é o destinatário", async () => {
  const f = chamadorFalso([
    ok({ valor_total: 900, emitente: { nome: "SINERGIA" }, destinatario: { nome: null } }),
    ok({ valor_total: 900, emitente: { nome: "SINERGIA" }, destinatario: { nome: null } }),
  ]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "receita" });
  assert.equal(f.pedidos[0].prompt, promptDocumento("receita"));
  assert.equal(f.pedidos.length, 2);
  assert.deepEqual(r.ok && r.documento.avisos, [
    "Leitura incompleta: não encontrei o nome do cliente — confira o documento e preencha à mão.",
  ]);
});

test("erro no padrão: tenta o forte", async () => {
  const f = chamadorFalso([
    { ok: false, erro: "Resposta cortada", motivo: "cortada", provedor: "gemini" },
    ok(COMPLETO, { modelo: "gpt-4o", provedor: "openai" }),
  ]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.equal(r.ok && r.provedor, "openai");
  assert.equal(r.ok && r.nivel, "forte");
});

test("sem chave nenhuma: para na 1ª chamada, erro da IA (503 no index)", async () => {
  const f = chamadorFalso([{ ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" }]);
  const m = novoMedidor();
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" }, m);
  assert.deepEqual(r, { ok: false, erro: "IA_NAO_CONFIGURADA", entrada: false });
  assert.equal(f.pedidos.length, 1);
  assert.equal(m.chamadas, 0);
});

test("os dois níveis falham: devolve o último erro", async () => {
  const f = chamadorFalso([
    { ok: false, erro: "e1", motivo: "http" },
    { ok: false, erro: "e2", motivo: "timeout" },
  ]);
  assert.deepEqual(await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" }), {
    ok: false,
    erro: "e2",
    entrada: false,
  });
});

test("medidor soma as duas chamadas do escalonamento (com o fallback de provedor)", async () => {
  const openai = ok(SEM_VALOR, {
    modelo: "gpt-4o-mini",
    provedor: "openai",
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
  const f = chamadorFalso([
    {
      ...openai,
      tentativas: [
        {
          ok: false,
          erro: "Google indisponível",
          motivo: "rede",
          provedor: "gemini",
          modelo: "gemini-3.5-flash-lite",
          usage: { input_tokens: 500, output_tokens: 0 },
        },
        openai,
      ],
    },
    ok(COMPLETO, { modelo: "gemini-3.8-flash", usage: { input_tokens: 1000, output_tokens: 200 } }),
  ]);
  const m = novoMedidor();
  await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" }, m);
  assert.equal(m.chamadas, 3);
  assert.equal(m.tokens_entrada, 2500);
  assert.equal(m.tokens_saida, 300);
  assert.deepEqual(m.modelos, ["gemini-3.5-flash-lite", "gpt-4o-mini", "gemini-3.8-flash"]);
  assert.deepEqual(m.provedores, ["gemini", "openai"]);
});
