// node --test supabase/functions/mcp/testes/deps-habilitacao.test.ts
// Testes do próprio auxiliar `montarDeps`: as ferramentas das próximas tasks são testadas com ele, então
// ele tem de se comportar como o servidor de verdade (Storage confinado, RPC que recusa o que o banco recusa).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gravarNaOportunidade,
  PASTA_HABILITACAO,
} from "../../_shared/conector/arquivo-servidor.ts";
import { ErroCamada } from "../../_shared/conector/camada-empresa.ts";
import { PARAMETROS_GRAVAR_ARQUIVO } from "../../_shared/conector/testes/fake-admin.ts";
import { AGORA, E, montarDeps, OP, OUTRA, PDF } from "./deps-habilitacao.ts";

const PARAMS = {
  p_oportunidade_id: OP,
  p_origem: "biblioteca:doc1",
  p_nome: "CND Federal.pdf",
  p_url: `anexos-oportunidade/${E}/2026/10/u1-CND_Federal.pdf`,
  p_tipo: "application/pdf",
  p_tamanho: 10,
  p_pasta: PASTA_HABILITACAO,
  p_categoria: null,
  p_assinatura: null,
  p_usuario_nome: "Usuário Teste (via Claude)",
};
const GRAVOU = {
  ok: true,
  substituiu: false,
  mantido_assinado: false,
  ref_anterior: null,
};
const erroDoBanco = (e: unknown) => e instanceof ErroCamada && e.codigo === "banco";

test("montarDeps: o storage das ferramentas já vem confinado à pasta da empresa", async () => {
  const { deps, fake } = montarDeps();
  const caminhoDaEmpresa = `${E}/2026/10/a.pdf`;
  await deps.storage.from("anexos-oportunidade").upload(caminhoDaEmpresa, PDF, {
    contentType: "application/pdf",
    upsert: false,
  });
  assert.deepEqual(fake.objetos.get(`anexos-oportunidade/${caminhoDaEmpresa}`), PDF);
  assert.equal(fake.chamadasStorage.length, 1);

  // outra empresa ou fora da pasta: lança e o Storage de verdade nem é chamado
  for (const caminho of [`${OUTRA}/2026/10/a.pdf`, "2026/10/a.pdf", `${E}/../${OUTRA}/a.pdf`, E]) {
    await assert.rejects(
      () => deps.storage.from("anexos-oportunidade").download(caminho),
      (e: unknown) => e instanceof ErroCamada && e.codigo === "campo_proibido"
    );
  }
  assert.equal(fake.chamadasStorage.length, 1);
});

test("montarDeps: o terceiro parâmetro opcional responde ao Storage; sem ele nada muda", async () => {
  const sem = montarDeps();
  const { data } = await sem.deps.storage.from("b").createSignedUrl(`${E}/a.pdf`, 60);
  assert.match(data?.signedUrl ?? "", /^https:\/\/storage\.test\//);

  const com = montarDeps(undefined, {}, (c) =>
    c.metodo === "list" ? { data: [{ name: "a.pdf", metadata: { size: 3 } }] } : undefined
  );
  const lista = await com.deps.storage.from("b").list(E, { search: "a.pdf", limit: 1 });
  assert.deepEqual(lista.data, [{ name: "a.pdf", metadata: { size: 3 } }]);
});

test("montarDeps: a RPC padrão devolve arq-1, arq-2… com a forma de sempre e guarda os parâmetros", async () => {
  const { deps, gravados } = montarDeps();
  const a = await deps.db.rpc("conector_gravar_arquivo", PARAMS);
  const b = await deps.db.rpc("conector_gravar_arquivo", {
    ...PARAMS,
    p_origem: "biblioteca:doc2",
  });
  assert.deepEqual(a, { ...GRAVOU, arquivo_id: "arq-1" });
  assert.deepEqual(b, { ...GRAVOU, arquivo_id: "arq-2" });
  assert.deepEqual(
    gravados.map((g) => [g.p_origem, g.p_empresa_id]),
    [
      ["biblioteca:doc1", E],
      ["biblioteca:doc2", E],
    ]
  );
});

test("montarDeps: a RPC padrão recusa o que o banco recusaria (parâmetros, pasta da empresa, origem, nome, assinatura)", async () => {
  const recusas: [string, Record<string, unknown>, RegExp][] = [
    ["parâmetro a mais", { ...PARAMS, p_extra: 1 }, /Could not find the function/],
    [
      "nome de parâmetro errado",
      { ...PARAMS, p_usuario: "U", p_usuario_nome: undefined },
      /Could not find/,
    ],
    ["origem só com espaço", { ...PARAMS, p_origem: " \t\n" }, /origem inválida/],
    ["origem nula", { ...PARAMS, p_origem: null }, /origem inválida/],
    ["origem com 201 caracteres", { ...PARAMS, p_origem: "o".repeat(201) }, /origem inválida/],
    ["nome só com espaço", { ...PARAMS, p_nome: "\n \t" }, /nome inválido/],
    ["nome nulo", { ...PARAMS, p_nome: null }, /nome inválido/],
    [
      "url de outra empresa",
      { ...PARAMS, p_url: `anexos-oportunidade/${OUTRA}/a.pdf` },
      /fora da pasta/,
    ],
    ["url de outro bucket", { ...PARAMS, p_url: `habilitacao/${E}/a.pdf` }, /fora da pasta/],
    ["url só com a pasta", { ...PARAMS, p_url: `anexos-oportunidade/${E}/` }, /fora da pasta/],
    ["url nula", { ...PARAMS, p_url: null }, /fora da pasta/],
    [
      "url com ..",
      { ...PARAMS, p_url: `anexos-oportunidade/${E}/../${OUTRA}/a.pdf` },
      /fora da pasta/,
    ],
    ["url com .", { ...PARAMS, p_url: `anexos-oportunidade/${E}/./a.pdf` }, /fora da pasta/],
    ["assinatura assinado", { ...PARAMS, p_assinatura: "assinado" }, /assinatura inválida/],
    ["assinatura qualquer", { ...PARAMS, p_assinatura: "ok" }, /assinatura inválida/],
    ["oportunidade nula", { ...PARAMS, p_oportunidade_id: null }, /obrigatórias/],
  ];
  const { deps, gravados } = montarDeps();
  for (const [rotulo, params, mensagem] of recusas) {
    await assert.rejects(
      // (um parâmetro `undefined` some do JSON do supabase-js: o fake o trata assim)
      () => deps.db.rpc("conector_gravar_arquivo", params),
      (e: unknown) => erroDoBanco(e) && mensagem.test((e as Error).message),
      rotulo
    );
  }
  assert.equal(gravados.length, recusas.length); // todas as tentativas ficam registradas

  // o id continua sendo o arq-N de sempre (N = a N-ésima chamada da RPC), e pontos DENTRO do nome do
  // arquivo não são segmento "..": passam
  const ok = await deps.db.rpc<{ arquivo_id: string }>("conector_gravar_arquivo", {
    ...PARAMS,
    p_url: `anexos-oportunidade/${E}/2026/10/u-Empresa_Ltda..pdf`,
  });
  assert.equal(ok.arquivo_id, `arq-${recusas.length + 1}`);
});

test("montarDeps: os parâmetros que a RPC padrão exige são os 11 da função SQL", async () => {
  const { fake } = montarDeps();
  // sem p_empresa_id (a camada o injeta; aqui vai direto ao admin) a função não existe com essa assinatura
  const r = await fake.admin.rpc("conector_gravar_arquivo", PARAMS);
  assert.equal(r.error?.code, "PGRST202");
  assert.equal(PARAMETROS_GRAVAR_ARQUIVO.length, 11);
  assert.deepEqual(
    [...PARAMETROS_GRAVAR_ARQUIVO].sort(),
    [...Object.keys(PARAMS), "p_empresa_id"].sort()
  );
});

test("montarDeps: o respondedor do teste vem primeiro e a RPC padrão não se mete", async () => {
  const { deps } = montarDeps((c) =>
    c.tabela === "conector_gravar_arquivo"
      ? { data: { ok: false, motivo: "nao_encontrada" } }
      : undefined
  );
  assert.deepEqual(await deps.db.rpc("conector_gravar_arquivo", PARAMS), {
    ok: false,
    motivo: "nao_encontrada",
  });
});

test("montarDeps: gravarNaOportunidade de ponta a ponta passa pelo Storage confinado e pela RPC validada", async () => {
  const { deps, fake, gravados } = montarDeps();
  let n = 0;
  const r = await gravarNaOportunidade(
    { ...deps, novoUuid: () => `u${++n}` },
    {
      oportunidadeId: OP,
      origem: "biblioteca:doc1",
      nome: "CND Federal.pdf",
      bytes: PDF,
      tipo: "pdf",
      pasta: PASTA_HABILITACAO,
      categoria: null,
      assinatura: null,
      usuarioNome: "Usuário Teste (via Claude)",
    }
  );
  assert.equal(r?.arquivo_id, "arq-1");
  assert.equal(r?.ref, `anexos-oportunidade/${E}/2026/10/u1-CND_Federal.pdf`);
  assert.deepEqual(fake.objetos.get(r!.ref), PDF);
  assert.equal(gravados.length, 1);
  assert.equal(deps.agora, AGORA);
});
