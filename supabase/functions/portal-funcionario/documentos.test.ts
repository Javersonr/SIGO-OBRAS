import { test } from "node:test";
import assert from "node:assert/strict";
import { documentosPublicados, carregarDocumentos, funcionarioPodeEntrar } from "./documentos.ts";

const doc = {
  id: "doc-teste",
  origem: "portal_funcionario",
  funcionario_id: "aluno-teste",
  publicado: true,
  tipo: "contracheque",
  nome_arquivo: "Teste.pdf",
  url: "contratacao/empresa-teste/arquivo.pdf",
};
test("somente documentos publicados pelo RH para o próprio funcionário", () => {
  const itens = [
    doc,
    { ...doc, funcionario_id: "outro-aluno" },
    { ...doc, publicado: false },
    { ...doc, origem: "legado" },
    { ...doc, tipo: "desconhecido" },
  ];
  assert.equal(documentosPublicados(itens, "aluno-teste").length, 1);
  assert.equal(documentosPublicados(JSON.stringify(itens), "aluno-teste").length, 1);
  for (const valor of [null, "{", {}, "null"])
    assert.deepEqual(documentosPublicados(valor, "aluno-teste"), []);
});
test("desativados e excluídos não acessam documentos", () => {
  assert.equal(funcionarioPodeEntrar({ ativo: true }), true);
  for (const func of [null, { ativo: false }, { deleted_at: "2026-10-01" }])
    assert.equal(funcionarioPodeEntrar(func), false);
});
test("consultas filtram empresa, funcionário e exclusão e não expõem referências internas", async () => {
  const filtros: unknown[] = [];
  const db = {
    from(tabela: string) {
      const query = {
        select() {
          return query;
        },
        eq(campo: string, valor: string) {
          filtros.push([tabela, campo, valor]);
          return query;
        },
        is(campo: string, valor: unknown) {
          filtros.push([tabela, campo, valor]);
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: { documentos_rh_anexos: [doc] } });
        },
        order() {
          return Promise.resolve({
            data: [
              {
                id: "adv-teste",
                tipo: "Escrita",
                motivo: "Teste",
                anexo_ref: "contratacao/outra-empresa/arquivo.pdf",
              },
            ],
          });
        },
      };
      return query;
    },
  };
  const resultado = await carregarDocumentos(
    db,
    "aluno-teste",
    "empresa-teste",
    async (refs, empresa) => {
      assert.equal(empresa, "empresa-teste");
      assert.equal(refs.length, 2);
      return new Map([[doc.url, "https://example.test/documento"]]);
    }
  );
  assert.ok(
    filtros.some(
      (f) => JSON.stringify(f) === JSON.stringify(["funcionario", "empresa_id", "empresa-teste"])
    )
  );
  assert.ok(
    filtros.some(
      (f) =>
        JSON.stringify(f) ===
        JSON.stringify(["funcionario_advertencia", "funcionario_id", "aluno-teste"])
    )
  );
  assert.equal(resultado.documentos[0].url, "https://example.test/documento");
  assert.equal(resultado.advertencias[0].url, null);
  assert.equal("ref" in resultado.documentos[0], false);
});
test("erro de banco não vira lista vazia enganosa", async () => {
  const db = {
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        maybeSingle: async () => ({ error: new Error("falha") }),
        order: async () => ({ data: [] }),
      };
      return q;
    },
  };
  await assert.rejects(
    carregarDocumentos(db, "aluno-teste", "empresa-teste", async () => new Map())
  );
});
