// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/cotacao-portal.test.ts
// ou com Deno:                           deno test supabase/functions/_shared/cotacao-portal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ehTokenCotacaoLegado,
  fimDoPrazo,
  motivoCotacaoFechada,
  participacaoPorToken,
  tokenCotacaoValido,
  validarRespostas,
} from "./cotacao-portal.ts";

// mesmo formato que a 0113 gera: 32 bytes → base64url sem padding
function tokenNovo(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const LEGADO = btoa("65f0a1b2c3d4e5f6a7b8c9d0-65f0a1b2c3d4e5f6a7b8c9d1-1710000000000");

test("token novo: 43 chars base64url, aceito; não parece legado", () => {
  for (let i = 0; i < 200; i++) {
    const t = tokenNovo();
    assert.equal(t.length, 43);
    assert.ok(tokenCotacaoValido(t), t);
    assert.ok(!ehTokenCotacaoLegado(t), t);
  }
});

test("token legado (btoa de id-id-timestamp) é reconhecido e recusado", () => {
  const uuid = btoa(
    "0b8e7c1e-1f2a-4c3d-9e8f-0123456789ab-5a6b7c8d-1f2a-4c3d-9e8f-0123456789ab-1760000000000"
  );
  for (const t of [LEGADO, uuid]) {
    assert.ok(!tokenCotacaoValido(t));
    assert.ok(ehTokenCotacaoLegado(t));
  }
  assert.equal(LEGADO.length, 84); // o tamanho dos 9 tokens atuais de produção
});

test("lixo não é token válido nem legado", () => {
  for (const t of [null, undefined, 42, "", "abc", "x".repeat(43) + "=", "a b", "' or 1=1 --"]) {
    assert.ok(!tokenCotacaoValido(t));
    assert.ok(!ehTokenCotacaoLegado(t));
  }
});

// Cliente falso: registra o valor procurado, pra provar que o formato é
// checado ANTES de ir ao banco.
function dbFalso(linha: unknown) {
  const procurados: unknown[] = [];
  const q = {
    select: () => q,
    eq: (_col: string, v: unknown) => (procurados.push(v), q),
    is: () => q,
    maybeSingle: async () => ({ data: linha }),
  };
  return { procurados, from: () => q };
}

test("participacaoPorToken: legado → 410; inválido → 404; vazio → 400 — sem consultar", async () => {
  const db = dbFalso({ id: "x" });
  const legado = await participacaoPorToken(db, LEGADO, "id");
  assert.ok("erro" in legado && legado.status === 410 && legado.codigo === "LINK_SUBSTITUIDO");

  const invalido = await participacaoPorToken(db, "abc", "id");
  assert.ok("erro" in invalido && invalido.status === 404);
  const vazio = await participacaoPorToken(db, "", "id");
  assert.ok("erro" in vazio && vazio.status === 400);
  assert.equal(db.procurados.length, 0);
});

test("participacaoPorToken: válido → consulta pelo token", async () => {
  const t = tokenNovo();
  const db = dbFalso({ id: "x" });
  assert.deepEqual(await participacaoPorToken(db, t, "id"), { cf: { id: "x" } });
  assert.deepEqual(db.procurados, [t]);

  const naoExiste = await participacaoPorToken(dbFalso(null), t, "id");
  assert.ok("erro" in naoExiste && naoExiste.status === 404);
});

test("prazo: vale o dia inteiro de Brasília", () => {
  const fim = fimDoPrazo("2026-03-20T00:00:00+00:00");
  assert.equal(fim, Date.parse("2026-03-21T02:59:59.999Z"));
  assert.equal(fimDoPrazo("2026-03-20"), fim);
  assert.equal(fimDoPrazo(null), null);
  assert.equal(fimDoPrazo("não é data"), null);

  const cot = { status: "Enviada aos Fornecedores", data_limite: "2026-03-20T00:00:00+00:00" };
  assert.equal(motivoCotacaoFechada(cot, Date.parse("2026-03-20T23:59:00-03:00")), null);
  assert.match(
    motivoCotacaoFechada(cot, Date.parse("2026-03-21T00:00:01-03:00")) ?? "",
    /terminou em 20\/03\/2026/
  );
});

test("status: Aprovada/Cancelada fecham; Respostas Recebidas e sem prazo continuam abertas", () => {
  const agora = Date.parse("2026-09-24T12:00:00Z");
  assert.ok(motivoCotacaoFechada({ status: "Aprovada", data_limite: null }, agora));
  assert.ok(motivoCotacaoFechada({ status: "Cancelada", data_limite: null }, agora));
  assert.equal(
    motivoCotacaoFechada({ status: "Respostas Recebidas", data_limite: null }, agora),
    null
  );
  assert.equal(
    motivoCotacaoFechada({ status: "Enviada aos Fornecedores", data_limite: null }, agora),
    null
  );
  assert.ok(motivoCotacaoFechada(null, agora));
});

const ITENS = [
  { id: "i1", descricao: "Cabo 10mm²", quantidade: "100.000" },
  { id: "i2", descricao: "Disjuntor", quantidade: 4 },
];

test("respostas: quantidade e descrição vêm do banco, não do body", () => {
  const r = validarRespostas(
    {
      i1: { valor_unitario: "2.5", prazo_entrega: "7", observacoes: "ok", quantidade: 1 },
      i2: { valor_unitario: 30, prazo_entrega: "", observacoes: 5 },
    },
    ITENS
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.linhas, [
    {
      item_id: "i1",
      item_descricao: "Cabo 10mm²",
      valor_unitario: 2.5,
      valor_total: 250,
      prazo_entrega_dias: 7,
      observacoes: "ok",
    },
    {
      item_id: "i2",
      item_descricao: "Disjuntor",
      valor_unitario: 30,
      valor_total: 120,
      prazo_entrega_dias: null,
      observacoes: "",
    },
  ]);
});

test("respostas: item de fora da cotação é ignorado; item sem valor não entra", () => {
  const r = validarRespostas(
    {
      i1: { valor_unitario: "" },
      "item-de-outra-cotacao": { valor_unitario: 1 },
      i2: { valor_unitario: "3,5" },
    },
    ITENS
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.ignorados, 1);
  assert.deepEqual(
    r.linhas.map((l) => [l.item_id, l.valor_unitario, l.valor_total]),
    [["i2", 3.5, 14]]
  );
});

test("respostas: valores/prazos absurdos são recusados", () => {
  const casos = [
    { i1: { valor_unitario: "-1" } },
    { i1: { valor_unitario: "0" } },
    { i1: { valor_unitario: "abc" } },
    { i1: { valor_unitario: "Infinity" } },
    { i1: { valor_unitario: 1e10 } },
    { i1: { valor_unitario: 1, prazo_entrega: "-3" } },
    { i1: { valor_unitario: 1, prazo_entrega: "99999" } },
    { i1: { valor_unitario: 1, prazo_entrega: "abc" } },
  ];
  for (const c of casos) assert.equal(validarRespostas(c, ITENS).ok, false, JSON.stringify(c));
  for (const c of [null, [], "x"]) assert.equal(validarRespostas(c, ITENS).ok, false);

  // unitário cabe em numeric(14,4), mas × quantidade estoura numeric(14,2)
  const muitos = [{ id: "i9", descricao: "Parafuso", quantidade: 1000 }];
  assert.equal(validarRespostas({ i9: { valor_unitario: 9e9 } }, muitos).ok, false);
  assert.equal(validarRespostas({ i9: { valor_unitario: 9e8 } }, muitos).ok, true);
});

test("respostas: observação é truncada", () => {
  const r = validarRespostas({ i2: { valor_unitario: 1, observacoes: "x".repeat(5000) } }, ITENS);
  assert.ok(r.ok && r.linhas[0].observacoes.length === 2000);
});
