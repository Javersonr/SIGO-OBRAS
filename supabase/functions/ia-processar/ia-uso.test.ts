// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/ia-uso.test.ts
// ou com Deno:                           deno test supabase/functions/ia-processar/ia-uso.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACOES_EDITAL,
  ACOES_GERAIS,
  COTA_EDITAL_PADRAO,
  COTA_GERAL_PADRAO,
  contabilizar,
  ehAcaoEdital,
  ehAcaoGeral,
  inicioDoDiaBR,
  lerCota,
  novoMedidor,
  registrarUso,
  verificarCotaEdital,
  verificarCotaGeral,
} from "./ia-uso.ts";

/** cliente falso: registra filtros/inserts e devolve o que o teste mandar */
function clienteFalso(opts: {
  cota?: string | null;
  usadas?: number;
  erroContagem?: string;
  erroInsert?: string;
  lanca?: boolean;
}) {
  const chamadas: { tabela: string; ops: [string, unknown[]][] }[] = [];
  const inserts: unknown[] = [];
  const from = (tabela: string) => {
    if (opts.lanca) throw new Error("rede caiu");
    const reg = { tabela, ops: [] as [string, unknown[]][] };
    chamadas.push(reg);
    // deno-lint-ignore no-explicit-any
    const q: any = {};
    for (const op of ["select", "eq", "is", "in", "gte"]) {
      q[op] = (...a: unknown[]) => {
        reg.ops.push([op, a]);
        return q;
      };
    }
    q.maybeSingle = () =>
      Promise.resolve({ data: opts.cota === undefined ? null : { valor: opts.cota }, error: null });
    q.insert = (row: unknown) => {
      inserts.push(row);
      return Promise.resolve({ error: opts.erroInsert ? { message: opts.erroInsert } : null });
    };
    // contagem (head: true) é "thenable"
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(
        opts.erroContagem
          ? { count: null, error: { message: opts.erroContagem } }
          : { count: opts.usadas ?? 0, error: null }
      ).then(ok);
    return q;
  };
  return { cliente: { from }, chamadas, inserts };
}

const usuario = { email: "a@b.com", is_super_admin: false, empresa_id: "emp-1" };

test("ehAcaoEdital só para as 3 ações de edital", () => {
  assert.equal(ehAcaoEdital("edital_atende"), true);
  assert.equal(ehAcaoEdital("edital_xyz"), false);
  assert.equal(ehAcaoEdital("llm"), false);
});

test("ehAcaoGeral só para as 4 ações da cota geral", () => {
  for (const acao of ["llm", "extrair_documentos", "validar_exames_pcmso"]) {
    assert.equal(ehAcaoGeral(acao), true);
  }
  assert.equal(ehAcaoGeral("financeiro_ler_documento"), true);
  assert.deepEqual(
    [...ACOES_GERAIS],
    ["llm", "extrair_documentos", "validar_exames_pcmso", "financeiro_ler_documento"]
  );
  // edital tem cota própria: nunca entra na geral
  assert.equal(ehAcaoGeral("edital_consolidar"), false);
  assert.equal(ehAcaoGeral("edital_atende"), false);
  assert.equal(ehAcaoGeral("xyz"), false);
  assert.equal(ehAcaoGeral(""), false);
  assert.equal(ehAcaoGeral(undefined), false);
  assert.equal(ehAcaoGeral(null), false);
  assert.equal(ehAcaoGeral(42), false);
  assert.equal(ehAcaoGeral(["llm"]), false);
  // as duas listas nunca se sobrepõem (uma requisição conta em uma cota só)
  assert.equal(
    ACOES_EDITAL.some((a) => (ACOES_GERAIS as readonly string[]).includes(a)),
    false
  );
});

test("contabilizar soma tokens/modelos/custo e ignora 'sem chave'", () => {
  const m = novoMedidor();
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o-mini",
    usage: { input_tokens: 100, output_tokens: 10 },
  });
  contabilizar(m, { ok: false, motivo: "timeout", provedor: "openai", modelo: "gpt-4o" });
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o",
    usage: { input_tokens: 50, output_tokens: 5 },
  });
  contabilizar(m, { ok: false, motivo: "config" });
  assert.deepEqual(m, {
    chamadas: 3,
    tokens_entrada: 150,
    tokens_saida: 15,
    modelos: ["gpt-4o-mini", "gpt-4o"],
    provedores: ["openai"],
    // 100×0,15 + 10×0,60 = 21 µUS$; timeout sem usage = 0; 50×2,50 + 5×10 = 175 µUS$
    custo_usd: 0.000196,
    custo_conhecido: true,
  });
  contabilizar(undefined, { ok: true }); // sem medidor: não quebra
});

test("contabilizar percorre as tentativas do chamarIA (Gemini falhou → OpenAI)", () => {
  const m = novoMedidor();
  const openai = {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o-mini",
    usage: { input_tokens: 1000, output_tokens: 100 },
  };
  contabilizar(m, {
    ...openai,
    tentativas: [
      {
        ok: false,
        motivo: "http",
        provedor: "gemini",
        modelo: "gemini-3.5-flash-lite",
        usage: { input_tokens: 2000, output_tokens: 0 },
      },
      openai,
    ],
  });
  // a resposta final NÃO é somada de novo (ela já está nas tentativas)
  assert.deepEqual(m, {
    chamadas: 2,
    tokens_entrada: 3000,
    tokens_saida: 100,
    modelos: ["gemini-3.5-flash-lite", "gpt-4o-mini"],
    provedores: ["gemini", "openai"],
    // 2000×0,30 = 600 µUS$ + (1000×0,15 + 100×0,60) = 210 µUS$
    custo_usd: 0.00081,
    custo_conhecido: true,
  });
  // tentativas vazias ou só "sem chave": nada é somado
  const vazio = novoMedidor();
  contabilizar(vazio, { ok: false, motivo: "config", tentativas: [] });
  contabilizar(vazio, { ok: false, tentativas: [{ ok: false, motivo: "config" }] });
  assert.deepEqual(vazio, novoMedidor());
});

test("contabilizar: modelo sem preço não inventa custo", () => {
  const m = novoMedidor();
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-5",
    usage: { input_tokens: 10, output_tokens: 1 },
  });
  assert.equal(m.chamadas, 1);
  assert.equal(m.custo_usd, 0);
  assert.equal(m.custo_conhecido, false);
});

test("inicioDoDiaBR usa o dia de Brasília", () => {
  // 02:00 UTC de 25/09 = 23:00 de 24/09 em Brasília
  assert.equal(inicioDoDiaBR(new Date("2026-09-25T02:00:00Z")), "2026-09-24T00:00:00-03:00");
  assert.equal(inicioDoDiaBR(new Date("2026-09-25T03:00:00Z")), "2026-09-25T00:00:00-03:00");
});

test("lerCota: inteiro ≥ 1, senão o padrão", () => {
  assert.equal(lerCota("50"), 50);
  assert.equal(lerCota(" 1000 "), 1000);
  assert.equal(lerCota("0"), COTA_EDITAL_PADRAO);
  assert.equal(lerCota("abc"), COTA_EDITAL_PADRAO);
  assert.equal(lerCota(null), COTA_EDITAL_PADRAO);
  assert.equal(lerCota("2.5"), COTA_EDITAL_PADRAO);
});

test("lerCota: o padrão é o 2º parâmetro (edital 400, geral 300)", () => {
  assert.equal(COTA_EDITAL_PADRAO, 400);
  assert.equal(COTA_GERAL_PADRAO, 300);
  assert.equal(lerCota(undefined, COTA_GERAL_PADRAO), 300);
  assert.equal(lerCota("0", COTA_GERAL_PADRAO), 300);
  assert.equal(lerCota("abc", 7), 7);
  assert.equal(lerCota(" 25 ", COTA_GERAL_PADRAO), 25);
  assert.equal(lerCota(80, COTA_GERAL_PADRAO), 80);
});

test("cota: abaixo libera, chegou recusa, super admin isento, erro libera", async () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  let f = clienteFalso({ usadas: 399 });
  assert.equal(await verificarCotaEdital(f.cliente, usuario, agora), null);
  // filtro por empresa, só ações edital_* e só de hoje
  const cont = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    cont.ops.find(([o]) => o === "eq"),
    ["eq", ["empresa_id", "emp-1"]]
  );
  assert.deepEqual(
    cont.ops.find(([o]) => o === "gte"),
    ["gte", ["criado_em", "2026-09-24T00:00:00-03:00"]]
  );

  f = clienteFalso({ usadas: 400 });
  assert.deepEqual(await verificarCotaEdital(f.cliente, usuario, agora), {
    cota: 400,
    usadas: 400,
  });
  f = clienteFalso({ usadas: 10, cota: "10" });
  assert.deepEqual(await verificarCotaEdital(f.cliente, usuario, agora), { cota: 10, usadas: 10 });
  f = clienteFalso({ usadas: 10_000 });
  assert.equal(
    await verificarCotaEdital(f.cliente, { ...usuario, is_super_admin: true }, agora),
    null
  );
  assert.equal(f.chamadas.length, 0);
  f = clienteFalso({ erroContagem: 'relation "public.ia_uso" does not exist' });
  assert.equal(await verificarCotaEdital(f.cliente, usuario, agora), null);
  f = clienteFalso({ lanca: true });
  assert.equal(await verificarCotaEdital(f.cliente, usuario, agora), null);
  // sem empresa: conta as do próprio usuário
  f = clienteFalso({ usadas: 0 });
  await verificarCotaEdital(f.cliente, { ...usuario, empresa_id: null }, agora);
  const semEmp = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    semEmp.ops.find(([o]) => o === "is"),
    ["is", ["empresa_id", null]]
  );
  assert.deepEqual(
    semEmp.ops.find(([o]) => o === "eq"),
    ["eq", ["usuario_email", "a@b.com"]]
  );
});

test("cota do edital: lê ia_cota_edital_dia e conta só as ações edital_*", async () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  const f = clienteFalso({ usadas: 5, cota: "5" });
  assert.deepEqual(await verificarCotaEdital(f.cliente, usuario, agora), { cota: 5, usadas: 5 });
  const cfg = f.chamadas.find((c) => c.tabela === "saas_config")!;
  assert.deepEqual(
    cfg.ops.find(([o]) => o === "eq"),
    ["eq", ["chave", "ia_cota_edital_dia"]]
  );
  const cont = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    cont.ops.find(([o]) => o === "in"),
    ["in", ["acao", [...ACOES_EDITAL]]]
  );
  // cota inválida no banco → padrão do edital (400), nunca o da geral (300)
  const g = clienteFalso({ usadas: 350, cota: "abc" });
  assert.equal(await verificarCotaEdital(g.cliente, usuario, agora), null);
});

test("cota geral: padrão 300 quando não há chave; chegou recusa, abaixo libera", async () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  let f = clienteFalso({ usadas: 299 });
  assert.equal(await verificarCotaGeral(f.cliente, usuario, agora), null);
  f = clienteFalso({ usadas: 300 });
  assert.deepEqual(await verificarCotaGeral(f.cliente, usuario, agora), {
    cota: COTA_GERAL_PADRAO,
    usadas: 300,
  });
  f = clienteFalso({ usadas: 1_000 });
  assert.deepEqual(await verificarCotaGeral(f.cliente, usuario, agora), {
    cota: 300,
    usadas: 1_000,
  });
  // chave presente mas inválida → também o padrão da geral
  f = clienteFalso({ usadas: 300, cota: "0" });
  assert.deepEqual(await verificarCotaGeral(f.cliente, usuario, agora), { cota: 300, usadas: 300 });
});

test("cota geral: lê ia_cota_geral_dia do saas_config", async () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  let f = clienteFalso({ usadas: 10, cota: "10" });
  assert.deepEqual(await verificarCotaGeral(f.cliente, usuario, agora), { cota: 10, usadas: 10 });
  const cfg = f.chamadas.find((c) => c.tabela === "saas_config")!;
  assert.deepEqual(
    cfg.ops.find(([o]) => o === "eq"),
    ["eq", ["chave", "ia_cota_geral_dia"]]
  );
  // cota maior que o padrão vale (a do painel manda)
  f = clienteFalso({ usadas: 300, cota: "500" });
  assert.equal(await verificarCotaGeral(f.cliente, usuario, agora), null);
  f = clienteFalso({ usadas: 500, cota: "500" });
  assert.deepEqual(await verificarCotaGeral(f.cliente, usuario, agora), { cota: 500, usadas: 500 });
});

test("cota geral: conta só as ações gerais da empresa, hoje (fuso de Brasília)", async () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  let f = clienteFalso({ usadas: 0 });
  await verificarCotaGeral(f.cliente, usuario, agora);
  const cont = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    cont.ops.find(([o]) => o === "in"),
    ["in", ["acao", [...ACOES_GERAIS]]]
  );
  assert.deepEqual(
    cont.ops.find(([o]) => o === "eq"),
    ["eq", ["empresa_id", "emp-1"]]
  );
  assert.deepEqual(
    cont.ops.find(([o]) => o === "gte"),
    ["gte", ["criado_em", "2026-09-24T00:00:00-03:00"]]
  );
  // sem empresa: as do próprio usuário (como a cota do edital)
  f = clienteFalso({ usadas: 0 });
  await verificarCotaGeral(f.cliente, { ...usuario, empresa_id: null }, agora);
  const semEmp = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    semEmp.ops.find(([o]) => o === "is"),
    ["is", ["empresa_id", null]]
  );
  assert.deepEqual(
    semEmp.ops.find(([o]) => o === "eq"),
    ["eq", ["usuario_email", "a@b.com"]]
  );
});

test("cota geral: super admin isento (nem consulta) e erro ao contar libera", async () => {
  let f = clienteFalso({ usadas: 10_000 });
  assert.equal(await verificarCotaGeral(f.cliente, { ...usuario, is_super_admin: true }), null);
  assert.equal(f.chamadas.length, 0);
  f = clienteFalso({ erroContagem: 'relation "public.ia_uso" does not exist' });
  assert.equal(await verificarCotaGeral(f.cliente, usuario), null);
  f = clienteFalso({ lanca: true });
  assert.equal(await verificarCotaGeral(f.cliente, usuario), null);
});

test("registrarUso: grava a soma; sem chamada não grava; erro não propaga", async () => {
  const m = novoMedidor();
  let f = clienteFalso({});
  await registrarUso(f.cliente, usuario, "edital_atende", m);
  assert.equal(f.inserts.length, 0);

  contabilizar(m, {
    ok: true,
    provedor: "gemini",
    modelo: "gemini-3.5-flash-lite",
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o",
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
  await registrarUso(f.cliente, usuario, "edital_atende", m);
  assert.deepEqual(f.inserts, [
    {
      empresa_id: "emp-1",
      usuario_email: "a@b.com",
      acao: "edital_atende",
      provedor: "gemini,openai",
      modelo: "gemini-3.5-flash-lite,gpt-4o",
      tokens_entrada: 2000,
      tokens_saida: 200,
      // (1000×0,30 + 100×2,50) + (1000×2,50 + 100×10) = 550 + 3500 µUS$
      custo_usd: 0.00405,
    },
  ]);

  // nenhum modelo com preço → custo_usd null (não 0); sem provedor → null
  const semPreco = novoMedidor();
  contabilizar(semPreco, {
    ok: true,
    modelo: "gpt-5",
    usage: { input_tokens: 5, output_tokens: 5 },
  });
  f = clienteFalso({});
  await registrarUso(f.cliente, usuario, "llm", semPreco);
  assert.deepEqual(f.inserts, [
    {
      empresa_id: "emp-1",
      usuario_email: "a@b.com",
      acao: "llm",
      provedor: null,
      modelo: "gpt-5",
      tokens_entrada: 5,
      tokens_saida: 5,
      custo_usd: null,
    },
  ]);
  f = clienteFalso({ erroInsert: "permission denied" });
  await registrarUso(f.cliente, usuario, "edital_atende", m); // só loga
  f = clienteFalso({ lanca: true });
  await registrarUso(f.cliente, usuario, "edital_atende", m); // só loga
});
