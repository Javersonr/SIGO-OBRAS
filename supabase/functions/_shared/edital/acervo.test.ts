// node --test supabase/functions/_shared/edital/acervo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { carregarAcervo, fonteDoAdmin, garantirIds, hojeBR } from "./acervo.ts";
import { sanearEdital } from "./edital-regras.ts";
import { camadaDaEmpresa } from "../conector/camada-empresa.ts";
import { criarFakeAdmin, type ChamadaFake } from "../conector/testes/fake-admin.ts";

const E = "00000000-0000-4000-8000-000000000001";

/** [de, ate] do .range() da chamada (paginação de 1000 em 1000). */
function faixa(c: ChamadaFake): [number, number] {
  const r = c.filtros.find((f) => f.metodo === "range");
  return r ? [r.args[0] as number, r.args[1] as number] : [0, 999];
}

/** Gera n atestados sintéticos com ids "00000000-0000-4000-8000-1xxxxxxxxxxx". */
function atestados(de: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-1${String(de + i).padStart(11, "0")}`,
    tipo: "cat",
    numero: `${de + i}/2025`,
    ordem: de + i,
  }));
}

test("carregarAcervo: pagina de 1000 em 1000 até vir menos de 1000", async () => {
  const fake = criarFakeAdmin((c) => {
    if (c.tabela !== "acervo_atestado") return undefined;
    const [de] = faixa(c);
    return { data: de === 0 ? atestados(0, 1000) : de === 1000 ? atestados(1000, 3) : [] };
  });
  const acervo = await carregarAcervo(fonteDoAdmin(fake.admin, E));
  assert.equal(acervo.atestados.length, 1003);
  const faixas = fake.chamadas.filter((c) => c.tabela === "acervo_atestado").map(faixa);
  assert.deepEqual(faixas, [
    [0, 999],
    [1000, 1999],
  ]);
});

test("carregarAcervo: quantitativo de atestado de fora sai; perfil é a 1ª linha", async () => {
  const [a1] = atestados(0, 1);
  const fake = criarFakeAdmin((c) => {
    if (c.tabela === "acervo_perfil") return { data: [{ porte: "EPP" }] };
    if (c.tabela === "acervo_atestado") return { data: [a1] };
    if (c.tabela === "acervo_quantitativo") {
      return {
        data: [
          { atestado_id: a1.id, categoria: "postes", quantidade: 10 },
          { atestado_id: "00000000-0000-4000-8000-999999999999", categoria: "postes" },
        ],
      };
    }
    return undefined;
  });
  const acervo = await carregarAcervo(fonteDoAdmin(fake.admin, E));
  assert.deepEqual(acervo.perfil, { porte: "EPP" });
  assert.equal(acervo.quantitativos.length, 1);
  assert.equal(acervo.quantitativos[0].atestado_id, a1.id);
});

test("carregarAcervo: erro do banco vira 'Falha ao ler o acervo: …'", async () => {
  const fake = criarFakeAdmin((c) =>
    c.tabela === "acervo_profissional" ? { error: { message: "timeout" } } : undefined
  );
  await assert.rejects(carregarAcervo(fonteDoAdmin(fake.admin, E)), {
    message: "Falha ao ler o acervo: timeout",
  });
  const fake2 = criarFakeAdmin((c) =>
    c.tabela === "acervo_perfil" ? { error: { message: "pooler" } } : undefined
  );
  await assert.rejects(carregarAcervo(fonteDoAdmin(fake2.admin, E)), {
    message: "Falha ao ler o acervo: pooler",
  });
});

test("fonteDoAdmin e CamadaEmpresa: toda leitura presa à empresa e sem excluídos", async () => {
  for (const fonte of ["admin", "camada"] as const) {
    const fake = criarFakeAdmin();
    await carregarAcervo(
      fonte === "admin" ? fonteDoAdmin(fake.admin, E) : camadaDaEmpresa(fake.admin, E)
    );
    assert.equal(fake.chamadas.length, 4, fonte);
    for (const c of fake.chamadas) {
      assert.ok(
        c.filtros.some((f) => f.metodo === "eq" && f.args[0] === "empresa_id" && f.args[1] === E),
        `${fonte} ${c.tabela}`
      );
      assert.ok(
        c.filtros.some(
          (f) => f.metodo === "is" && f.args[0] === "deleted_at" && f.args[1] === null
        ),
        `${fonte} ${c.tabela}`
      );
    }
  }
});

test("hojeBR: virada do dia em UTC × Brasília", () => {
  assert.equal(hojeBR(new Date("2026-10-08T02:59:59Z")), "2026-10-07");
  assert.equal(hojeBR(new Date("2026-10-08T03:00:00Z")), "2026-10-08");
  assert.match(hojeBR(), /^\d{4}-\d{2}-\d{2}$/);
});

test("garantirIds: preserva ids únicos e renumera os repetidos ou vazios", () => {
  const ok = sanearEdital({
    habilitacao: { tecnica_operacional: [{ id: "op7", descricao: "Postes" }] },
  });
  garantirIds(ok);
  assert.equal(ok.habilitacao.tecnica_operacional[0].id, "op7");
  const rep = sanearEdital({
    habilitacao: {
      tecnica_operacional: [
        { id: "x", descricao: "Postes" },
        { id: "x", descricao: "Luminárias" },
      ],
    },
  });
  garantirIds(rep);
  assert.deepEqual(
    rep.habilitacao.tecnica_operacional.map((x) => x.id),
    ["op1", "op2"]
  );
});
