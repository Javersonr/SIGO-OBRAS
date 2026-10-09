// node --test supabase/functions/mcp/ferramentas-orcamento.test.ts
// Ferramentas da parte D com o fake da T1; a camada é de verdade, presa à empresa E.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_ORCAMENTO,
  INSTRUCOES_ORCAMENTO,
  PROMPTS_ORCAMENTO,
} from "./ferramentas-orcamento.ts";
import type { DepsFerramenta } from "./registro.ts";
import { despachar, type LinhaAuditoria } from "./despacho.ts";
import { camadaDaEmpresa } from "../_shared/conector/camada-empresa.ts";
import {
  criarFakeAdmin,
  type ChamadaFake,
  type RespostaFake,
} from "../_shared/conector/testes/fake-admin.ts";
import { CAMPOS_INFORMACOES_CONECTOR, CAMPOS_LINHA_CONECTOR } from "../_shared/orcamento/modelo.ts";

const E = "00000000-0000-4000-8000-000000000001"; // empresa da chave
const OUTRA = "00000000-0000-4000-8000-000000000002";
const OP_A = "00000000-0000-4000-8000-000000000011"; // da empresa E
const OP_B = "00000000-0000-4000-8000-000000000012"; // da OUTRA
const ITEM_1 = "00000000-0000-4000-8000-000000000021";
const ITEM_2 = "00000000-0000-4000-8000-000000000022";
const ETAPA_1 = "00000000-0000-4000-8000-000000000020";
const ETAPA_2 = "00000000-0000-4000-8000-000000000023";

type Linha = Record<string, unknown>;
interface Banco {
  oportunidades: Record<string, Linha>;
  itens: Linha[];
  rpc?: (c: ChamadaFake) => RespostaFake | undefined;
}

const ferramenta = (nome: string) => {
  const f = FERRAMENTAS_ORCAMENTO.find((x) => x.def.name === nome);
  if (!f) throw new Error(`sem a ferramenta ${nome}`);
  return f;
};
/** valor do filtro .eq(coluna, valor) da chamada */
const eq = (c: ChamadaFake, coluna: string) =>
  c.filtros.find((f) => f.metodo === "eq" && f.args[0] === coluna)?.args[1];
const estrutura = (r: { resultado: { structuredContent?: unknown } }) =>
  r.resultado.structuredContent as Record<string, unknown>;
const rpcs = (chamadas: ChamadaFake[]) => chamadas.filter((c) => c.op === "rpc");

/**
 * Banco de mentira: a oportunidade e os itens só aparecem para a empresa dona (como o filtro da
 * camada); o UPDATE da oportunidade grava no objeto; o INSERT devolve as linhas com id e versao 3.
 */
function montar(banco: Banco) {
  const fake = criarFakeAdmin((c) => {
    if (c.op === "rpc") return banco.rpc?.(c);
    const empresa = eq(c, "empresa_id");
    if (c.tabela === "oportunidade") {
      const id = String(eq(c, "id"));
      const op = banco.oportunidades[id];
      if (!op || op.empresa_id !== empresa) return { data: null };
      if (c.op === "update") Object.assign(op, c.payload);
      return { data: { id, ...op } };
    }
    if (c.tabela === "orcamento_item" && c.op === "select") {
      const op = eq(c, "oportunidade_id");
      return {
        data: banco.itens.filter((i) => i.empresa_id === empresa && i.oportunidade_id === op),
      };
    }
    if (c.op === "insert") {
      const linhas = c.payload as Linha[];
      return {
        data: linhas.map((l, i) => ({
          id: `00000000-0000-4000-8000-00000000090${i}`,
          versao: 3,
          ...l,
        })),
      };
    }
    return undefined;
  });
  const deps: DepsFerramenta = {
    ctx: {
      autorizacaoId: "00000000-0000-4000-8000-000000000031",
      cliente: "claude.ai",
      usuario: {
        id: "00000000-0000-4000-8000-000000000041",
        email: "teste@exemplo.com",
        nome: "Usuária Teste",
      },
      empresa: { id: E, nome: "Empresa Teste", cnpj: null, uf: "MG" },
      vinculo: { perfil: "Admin", ativo: true },
      vinculoId: "00000000-0000-4000-8000-000000000051",
    },
    db: camadaDaEmpresa(fake.admin, E),
    storage: fake.storage,
    fetchFn: (() => {
      throw new Error("sem rede no teste");
    }) as unknown as typeof fetch,
    agora: new Date("2026-10-08T12:00:00Z"),
  };
  return { fake, deps };
}

const oportunidades = (): Record<string, Linha> => ({
  [OP_A]: { empresa_id: E, desconto_proposta_pct: 12.35, cronograma_ff: {} },
  [OP_B]: { empresa_id: OUTRA, desconto_proposta_pct: 0, cronograma_ff: {} },
});

// Itatinga reduzido: a etapa e os dois itens das âncoras da spec (3505,49 e 10,48)
const LINHAS = [
  { item: "1", descricao: "SERVIÇOS DE ELÉTRICA" },
  {
    item: "1.1",
    codigo: "00000",
    fonte: "SINAPI",
    descricao: "Item sintético 1.1",
    unidade: "un",
    quantidade: 6,
    preco_unitario: 3505.49,
  },
  {
    item: "1.2",
    descricao: "Item sintético 1.2",
    unidade: "m",
    quantidade: 125.5,
    preco_unitario: "10,48",
    total: 1315.24,
  },
];

// ─── importar_orcamento ─────────────────────────────────────────────────────

test("importar_orcamento: linhas com erro não chamam o banco (validacao com a lista)", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: [] });
  const r = await ferramenta("importar_orcamento").executar(
    { oportunidade_id: OP_A, linhas: [...LINHAS, { ...LINHAS[1], item: "1.1" }] },
    deps
  );
  assert.equal(r.resultado.isError, true);
  const s = estrutura(r);
  assert.equal(s.motivo, "validacao");
  assert.deepEqual(s.erros, ["Linha 5: Item 1.1 repetido (já está na linha 3)."]);
  assert.equal(s.total_erros, 1);
  assert.equal(fake.chamadas.length, 0);
});

test("importar_orcamento: item sem etapa acima bloqueia (a tela só avisa)", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: [] });
  const r = await ferramenta("importar_orcamento").executar(
    { oportunidade_id: OP_A, linhas: [LINHAS[1], LINHAS[2]] },
    deps
  );
  assert.equal(r.resultado.isError, true);
  const s = estrutura(r);
  assert.equal(s.motivo, "validacao");
  assert.deepEqual(s.erros, [
    "Item 1.1 sem etapa acima: todo item precisa estar dentro de uma etapa (linha sem quantidade e preço).",
    "Item 1.2 sem etapa acima: todo item precisa estar dentro de uma etapa (linha sem quantidade e preço).",
  ]);
  assert.equal(rpcs(fake.chamadas).length, 0);
});

test("importar_orcamento: grava com o desconto atual (3505,49 → 3072,56 a 12,35%) e a empresa da camada", async () => {
  const { fake, deps } = montar({
    oportunidades: oportunidades(),
    itens: [],
    rpc: () => ({ data: { ok: true, itens_gravados: 3, substituidos: 0 } }),
  });
  const r = await ferramenta("importar_orcamento").executar(
    {
      oportunidade_id: OP_A,
      linhas: LINHAS,
      informacoes: { orgao: "Prefeitura de Exemplo", bdi: 23.96, total_prefeitura: "22.348,18" },
    },
    deps
  );
  assert.equal(r.resultado.isError, false);
  assert.equal(r.alvo, OP_A);
  const [rpc] = rpcs(fake.chamadas);
  assert.equal(rpc.tabela, "conector_substituir_orcamento");
  const p = rpc.payload as Record<string, unknown>;
  assert.equal(p.p_empresa_id, E);
  assert.equal(p.p_oportunidade_id, OP_A);
  assert.equal(p.p_substituir, false);
  assert.equal(p.p_usuario_nome, "Usuária Teste (via Claude)");
  assert.equal(p.p_descricao, "Orçamento importado pelo Claude: 1 etapas e 2 itens");
  const registros = p.p_registros as Record<string, unknown>[];
  assert.equal(registros.length, 3);
  assert.deepEqual(
    registros.map((x) => [
      x.numero,
      x.etapa,
      x.valor_unitario_ref,
      x.valor_unitario,
      x.valor_total,
    ]),
    [
      ["1", true, null, null, null],
      ["1.1", false, 3505.49, 3072.56, 18435.36],
      ["1.2", false, 10.48, 9.18, 1152.09],
    ]
  );
  assert.ok(registros.every((x) => x.empresa_id === E && x.oportunidade_id === OP_A));
  assert.deepEqual(p.p_info, {
    orgao: "Prefeitura de Exemplo",
    objeto: null,
    edital: null,
    data_base: null,
    bdi: "23,96",
    fonte: null,
    total_prefeitura: 22348.18,
    observacoes: null,
    arquivo_nome: "via Claude",
    importado_em: "2026-10-08T12:00:00.000Z",
  });
  assert.deepEqual(estrutura(r), {
    gravado: true,
    etapas: 1,
    itens: 2,
    total_referencia: 22348.18,
    total_prefeitura: 22348.18,
    desconto_aplicado_pct: 12.35,
    avisos: [],
    link: `https://www.sigoobras.com.br/Oportunidades?openId=${OP_A}`,
  });
});

test("importar_orcamento: já existe orçamento e não pediu substituir → gravado false, sem erro", async () => {
  const { fake, deps } = montar({
    oportunidades: oportunidades(),
    itens: [],
    rpc: () => ({ data: { ok: false, motivo: "ja_existe", itens_atuais: 57 } }),
  });
  const r = await ferramenta("importar_orcamento").executar(
    { oportunidade_id: OP_A, linhas: LINHAS },
    deps
  );
  assert.equal(r.resultado.isError, false);
  assert.equal(r.motivo, "ja_existe");
  assert.deepEqual(estrutura(r), {
    gravado: false,
    motivo: "ja_existe",
    itens_atuais: 57,
    pergunta: "Substituir os 57 itens atuais?",
  });
  const r2 = await ferramenta("importar_orcamento").executar(
    { oportunidade_id: OP_A, linhas: LINHAS, substituir: true, arquivo_nome: " PM Exemplo.xlsx " },
    deps
  );
  const p = rpcs(fake.chamadas)[1].payload as Record<string, unknown>;
  assert.equal(p.p_substituir, true);
  assert.equal((p.p_info as Record<string, unknown>).arquivo_nome, "PM Exemplo.xlsx");
  assert.equal(r2.motivo, "ja_existe"); // o fake responde sempre igual
});

test("importar_orcamento: oportunidade de outra empresa, inexistente ou id inválido → nao_encontrado", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: [] });
  for (const id of [OP_B, "00000000-0000-4000-8000-000000000099", "nao-e-uuid"]) {
    const r = await ferramenta("importar_orcamento").executar(
      { oportunidade_id: id, linhas: LINHAS },
      deps
    );
    assert.equal(r.resultado.isError, true, id);
    assert.equal(estrutura(r).motivo, "nao_encontrado", id);
    assert.equal(estrutura(r).erro, "Oportunidade não encontrada nesta empresa.");
  }
  assert.equal(rpcs(fake.chamadas).length, 0);
  // o filtro de empresa é o da chave, nunca o da oportunidade pedida
  for (const c of fake.chamadas) assert.equal(eq(c, "empresa_id"), E);
});

test("importar_orcamento: a RPC diz nao_encontrada (excluída no meio) → nao_encontrado", async () => {
  const { deps } = montar({
    oportunidades: oportunidades(),
    itens: [],
    rpc: () => ({ data: { ok: false, motivo: "nao_encontrada" } }),
  });
  const r = await ferramenta("importar_orcamento").executar(
    { oportunidade_id: OP_A, linhas: LINHAS },
    deps
  );
  assert.equal(estrutura(r).motivo, "nao_encontrado");
});

// ─── aplicar_desconto ───────────────────────────────────────────────────────

/** Itens importados da OP_A, com a referência e o preço cheio (desconto 0). */
function itensImportados(): Linha[] {
  const base = { empresa_id: E, oportunidade_id: OP_A };
  return [
    { ...base, id: ETAPA_1, numero: "1", etapa: true, ordem: 0 },
    {
      ...base,
      id: ITEM_1,
      numero: "1.1",
      etapa: false,
      quantidade: 6,
      valor_unitario_ref: 3505.49,
      valor_unitario: 3505.49,
      valor_total: 21032.94,
      ordem: 1,
    },
    {
      ...base,
      id: ITEM_2,
      numero: "1.2",
      etapa: false,
      quantidade: 125.5,
      valor_unitario_ref: 10.48,
      valor_unitario: 10.48,
      valor_total: 1315.24,
      ordem: 2,
    },
  ];
}

test("aplicar_desconto: '12,345' e 100 → validacao, sem chamar o banco", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: itensImportados() });
  for (const [desconto, erro] of [
    ["12,345", "Use no máximo 2 casas decimais"],
    [100, "O desconto vai de 0 a 99,99%"],
    ["", "Informe o desconto em %"],
  ] as const) {
    const r = await ferramenta("aplicar_desconto").executar(
      { oportunidade_id: OP_A, desconto_pct: desconto },
      deps
    );
    assert.equal(r.resultado.isError, true);
    assert.equal(estrutura(r).motivo, "validacao");
    assert.deepEqual(estrutura(r).erros, [erro]);
  }
  assert.equal(fake.chamadas.length, 0);
});

test("aplicar_desconto: grava as alterações calculadas e devolve o resumo relido", async () => {
  const banco: Banco = { oportunidades: oportunidades(), itens: itensImportados() };
  banco.rpc = (c) => {
    const alteracoes = (c.payload as { p_alteracoes: Linha[] }).p_alteracoes;
    for (const a of alteracoes) Object.assign(banco.itens.find((i) => i.id === a.id)!, a);
    return { data: { ok: true, itens: alteracoes.length } };
  };
  const { fake, deps } = montar(banco);
  const r = await ferramenta("aplicar_desconto").executar(
    { oportunidade_id: OP_A, desconto_pct: "12,35" },
    deps
  );
  assert.equal(r.resultado.isError, false);
  const [rpc] = rpcs(fake.chamadas);
  assert.equal(rpc.tabela, "conector_aplicar_desconto");
  assert.deepEqual(rpc.payload, {
    p_oportunidade_id: OP_A,
    p_pct: 12.35,
    p_alteracoes: [
      { id: ITEM_1, valor_unitario: 3072.56, valor_total: 18435.36 },
      { id: ITEM_2, valor_unitario: 9.18, valor_total: 1152.09 },
    ],
    p_usuario_nome: "Usuária Teste (via Claude)",
    p_empresa_id: E,
  });
  assert.deepEqual(estrutura(r), {
    desconto_pct: 12.35,
    itens_alterados: 2,
    total_referencia: 22348.18,
    total_proposta: 19587.45,
    desconto_real: 12.35,
    link: `https://www.sigoobras.com.br/Oportunidades?openId=${OP_A}`,
  });
});

test("aplicar_desconto: orcamento_mudou vira erro com a orientação de chamar de novo", async () => {
  const { deps } = montar({
    oportunidades: oportunidades(),
    itens: itensImportados(),
    rpc: () => ({ data: { ok: false, motivo: "orcamento_mudou" } }),
  });
  const r = await ferramenta("aplicar_desconto").executar(
    { oportunidade_id: OP_A, desconto_pct: 10 },
    deps
  );
  assert.equal(r.resultado.isError, true);
  assert.equal(estrutura(r).motivo, "orcamento_mudou");
  assert.match(String(estrutura(r).erro), /chame aplicar_desconto de novo/);
});

test("aplicar_desconto: sem item com referência → sem_orcamento; outra empresa → nao_encontrado", async () => {
  const soEtapa = itensImportados().slice(0, 1);
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: soEtapa });
  const r = await ferramenta("aplicar_desconto").executar(
    { oportunidade_id: OP_A, desconto_pct: 10 },
    deps
  );
  assert.equal(estrutura(r).motivo, "sem_orcamento");
  const r2 = await ferramenta("aplicar_desconto").executar(
    { oportunidade_id: OP_B, desconto_pct: 10 },
    deps
  );
  assert.equal(estrutura(r2).motivo, "nao_encontrado");
  assert.equal(rpcs(fake.chamadas).length, 0);
});

test("RPC fora do contrato da 0153 vira exceção (erro interno), nunca 'não encontrada'", async () => {
  for (const resposta of [
    { data: null },
    { data: { ok: false, motivo: "outra_coisa" } },
    { data: { ok: false } },
  ]) {
    const { deps } = montar({
      oportunidades: oportunidades(),
      itens: itensImportados(),
      rpc: () => resposta,
    });
    await assert.rejects(
      ferramenta("importar_orcamento").executar({ oportunidade_id: OP_A, linhas: LINHAS }, deps),
      /conector_substituir_orcamento: resposta inesperada/
    );
    await assert.rejects(
      ferramenta("aplicar_desconto").executar({ oportunidade_id: OP_A, desconto_pct: 10 }, deps),
      /conector_aplicar_desconto: resposta inesperada/
    );
  }
});

test("schemas: campos de linhas[] e de informacoes iguais às constantes do modelo", () => {
  type Objeto = { properties: Record<string, unknown>; items: Objeto };
  const props = ferramenta("importar_orcamento").def.inputSchema.properties as Record<
    string,
    Objeto
  >;
  assert.deepEqual(Object.keys(props.linhas.items.properties), [...CAMPOS_LINHA_CONECTOR]);
  assert.deepEqual(Object.keys(props.informacoes.properties), [...CAMPOS_INFORMACOES_CONECTOR]);
});

// ─── pelo despacho (T2): campos fechados e permissão de orçamento ───────────

test("pelo despacho: campo fora da lista em linhas[] e informacoes é recusado antes de rodar", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: [] });
  const auditoria: LinhaAuditoria[] = [];
  const r = await despachar(
    "importar_orcamento",
    {
      oportunidade_id: OP_A,
      linhas: [{ ...LINHAS[0], bdi: 25 }],
      informacoes: { orgao: "x", empresa_id: OUTRA },
    },
    {
      ferramentas: FERRAMENTAS_ORCAMENTO,
      deps,
      consumirLimite: async () => ({ permitido: true, chaves: {} }),
      auditar: async (l) => {
        auditoria.push(l);
      },
    }
  );
  const s = r.structuredContent as Record<string, unknown>;
  assert.equal(s.motivo, "campos_fora_da_lista");
  assert.deepEqual(s.campos, ["linhas[0].bdi", "informacoes.empresa_id"]);
  assert.equal(fake.chamadas.length, 0);
  assert.deepEqual(auditoria, [
    {
      ferramenta: "importar_orcamento",
      resultado: "erro",
      motivo: "campos_fora_da_lista",
      alvo: OP_A,
    },
  ]);
});

test("pelo despacho: sem Oportunidades → Orçamento → editar, nega sem gastar o limite", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: itensImportados() });
  let consumos = 0;
  const so = {
    perfil: "Usuario",
    ativo: true,
    permissoes: { Oportunidades: { Lista: { visualizar: true, editar: true } } },
  };
  for (const nome of ["importar_orcamento", "aplicar_desconto"]) {
    const r = await despachar(
      nome,
      { oportunidade_id: OP_A, desconto_pct: 10, linhas: LINHAS },
      {
        ferramentas: FERRAMENTAS_ORCAMENTO,
        deps: { ...deps, ctx: { ...deps.ctx, vinculo: so } },
        consumirLimite: async () => {
          consumos++;
          return { permitido: true, chaves: {} };
        },
        auditar: async () => {},
      }
    );
    const s = r.structuredContent as Record<string, unknown>;
    assert.equal(s.motivo, "sem_permissao", nome);
    assert.match(String(s.permissao_necessaria), /Orçamento → editar/);
  }
  assert.equal(consumos, 0);
  assert.equal(fake.chamadas.length, 0);
});

// ─── importar_cronograma ────────────────────────────────────────────────────

/** Orçamento da OP_A com 2 etapas: a 1 com R$ 1.417.472,96 (âncora da spec) e a 2 com R$ 100,00. */
function orcamentoComEtapas(): Linha[] {
  const base = { empresa_id: E, oportunidade_id: OP_A, etapa: false, unidade: "un", quantidade: 1 };
  return [
    { ...base, id: ETAPA_1, numero: "1", etapa: true, descricao: "SERVIÇOS DE ELÉTRICA", ordem: 0 },
    {
      ...base,
      id: ITEM_1,
      numero: "1.1",
      descricao: "Item sintético 1.1",
      valor_unitario_ref: 1617196.53,
      valor_unitario: 1417472.96,
      valor_total: 1417472.96,
      ordem: 1,
    },
    { ...base, id: ETAPA_2, numero: "2", etapa: true, descricao: "POSTES", ordem: 2 },
    {
      ...base,
      id: ITEM_2,
      numero: "2.1",
      descricao: "Item sintético 2.1",
      valor_unitario_ref: 114.09,
      valor_unitario: 100,
      valor_total: 100,
      ordem: 3,
    },
  ];
}

const escritas = (chamadas: ChamadaFake[]) =>
  chamadas.filter((c) => c.op === "insert" || c.op === "update" || c.op === "rpc");

test("importar_cronograma: item que não é etapa de nível 1 bloqueia (a tela só avisa)", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: orcamentoComEtapas() });
  const r = await ferramenta("importar_cronograma").executar(
    {
      oportunidade_id: OP_A,
      meses: 1,
      linhas: [
        { item: "1", pct: [100] },
        { item: "1.1", pct: [100] },
      ],
    },
    deps
  );
  assert.equal(r.resultado.isError, true);
  const s = estrutura(r);
  assert.equal(s.motivo, "validacao");
  assert.deepEqual(s.erros, ["Item 1.1 não é etapa de nível 1 do orçamento"]);
  assert.deepEqual(s.etapas_do_orcamento, ["1", "2"]);
  assert.deepEqual(escritas(fake.chamadas), []);
});

test("importar_cronograma: âncora da spec, 20/35/30/15 sobre uma etapa de R$ 1.417.472,96", async () => {
  const { fake, deps } = montar({
    oportunidades: oportunidades(),
    itens: orcamentoComEtapas().slice(0, 2),
  });
  const r = await ferramenta("importar_cronograma").executar(
    { oportunidade_id: OP_A, meses: 4, linhas: [{ item: "1", pct: [20, 35, 30, 15] }] },
    deps
  );
  assert.equal(r.resultado.isError, false);
  const s = estrutura(r);
  assert.equal(s.gravado, true);
  assert.equal(s.todas_fecham, true);
  assert.deepEqual(s.linhas_que_nao_fecham, []);
  assert.deepEqual(s.meses_valores, [
    { mes: 1, valor: 283494.59, pct: 20, acumulado: 283494.59, acum_pct: 20 },
    { mes: 2, valor: 496115.54, pct: 35, acumulado: 779610.13, acum_pct: 55 },
    { mes: 3, valor: 425241.89, pct: 30, acumulado: 1204852.02, acum_pct: 85 },
    { mes: 4, valor: 212620.94, pct: 15, acumulado: 1417472.96, acum_pct: 100 },
  ]);
  assert.equal(s.total, 1417472.96);
  assert.deepEqual(s.avisos, []);
  assert.equal(s.link, `https://www.sigoobras.com.br/Oportunidades?openId=${OP_A}`);
  const update = fake.chamadas.find((c) => c.op === "update")!;
  assert.equal(update.tabela, "oportunidade");
  assert.equal(eq(update, "id"), OP_A);
  assert.equal(eq(update, "empresa_id"), E);
  assert.deepEqual(update.payload, {
    cronograma_ff: {
      meses: 4,
      pct: { 1: [20, 35, 30, 15] },
      origem: "importado",
      arquivo_nome: "via Claude",
      atualizado_em: "2026-10-08T12:00:00.000Z",
    },
  });
  const insert = fake.chamadas.find((c) => c.op === "insert")!;
  assert.equal(insert.tabela, "oportunidade_atualizacao");
  assert.deepEqual(insert.payload, [
    {
      oportunidade_id: OP_A,
      usuario_nome: "Usuária Teste (via Claude)",
      tipo: "Sistema",
      descricao: "Cronograma importado pelo Claude: 4 meses e 1 etapas",
      dados_novos: { meses: 4, etapas: 1 },
      empresa_id: E,
    },
  ]);
});

test("importar_cronograma: linha que não fecha 100,00% só avisa e grava; linha curta completa com 0", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: orcamentoComEtapas() });
  const r = await ferramenta("importar_cronograma").executar(
    {
      oportunidade_id: OP_A,
      meses: 4,
      linhas: [
        { item: "1", pct: [20, 35, 30, 15] },
        { item: 2, pct: ["50", "49,99"] },
      ],
    },
    deps
  );
  assert.equal(r.resultado.isError, false);
  const s = estrutura(r);
  assert.equal(s.gravado, true);
  assert.equal(s.todas_fecham, false);
  assert.deepEqual(s.linhas_que_nao_fecham, ["2"]);
  assert.deepEqual(s.avisos, [
    "Linha 3: a etapa 2 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.",
  ]);
  assert.equal(s.total, 1417572.96);
  const update = fake.chamadas.find((c) => c.op === "update")!;
  const cronograma = (update.payload as { cronograma_ff: { pct: unknown } }).cronograma_ff;
  assert.deepEqual(cronograma.pct, { 1: [20, 35, 30, 15], 2: [50, 49.99, 0, 0] });
});

test("importar_cronograma: já existe cronograma e não pediu substituir → gravado false; com substituir grava", async () => {
  const ops = oportunidades();
  ops[OP_A].cronograma_ff = { meses: 12, pct: { 1: new Array(12).fill(0) } };
  const { fake, deps } = montar({ oportunidades: ops, itens: orcamentoComEtapas() });
  const args = { oportunidade_id: OP_A, meses: 2, linhas: [{ item: "1", pct: [50, 50] }] };
  const r = await ferramenta("importar_cronograma").executar(args, deps);
  assert.equal(r.resultado.isError, false);
  assert.deepEqual(estrutura(r), {
    gravado: false,
    motivo: "ja_existe",
    meses_atuais: 12,
    pergunta: "Substituir o cronograma atual, de 12 meses?",
  });
  assert.deepEqual(escritas(fake.chamadas), []);
  const r2 = await ferramenta("importar_cronograma").executar({ ...args, substituir: true }, deps);
  assert.equal(estrutura(r2).gravado, true);
  assert.deepEqual(estrutura(r2).avisos, [
    "Etapa 2 do orçamento sem linha no cronograma; fica vazia.",
  ]);
});

test("importar_cronograma: sem etapas no orçamento → sem_etapas; meses fora de 1 a 60 → validacao", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: [] });
  const r = await ferramenta("importar_cronograma").executar(
    { oportunidade_id: OP_A, meses: 4, linhas: [{ item: "1", pct: [100] }] },
    deps
  );
  assert.equal(estrutura(r).motivo, "sem_etapas");
  const { deps: deps2 } = montar({ oportunidades: oportunidades(), itens: orcamentoComEtapas() });
  for (const meses of [0, 61, 2.5]) {
    const r2 = await ferramenta("importar_cronograma").executar(
      { oportunidade_id: OP_A, meses, linhas: [{ item: "1", pct: [100] }] },
      deps2
    );
    assert.equal(estrutura(r2).motivo, "validacao");
    assert.deepEqual(estrutura(r2).erros, ["O número de meses vai de 1 a 60"]);
  }
  assert.deepEqual(escritas(fake.chamadas), []);
});

// ─── registrar_proposta ─────────────────────────────────────────────────────

test("registrar_proposta: grava a versão com valor = total da proposta e a descrição com o desconto real", async () => {
  const itens = itensImportados();
  Object.assign(itens[1], { valor_unitario: 3072.56, valor_total: 18435.36 });
  Object.assign(itens[2], { valor_unitario: 9.18, valor_total: 1152.09 });
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens });
  const r = await ferramenta("registrar_proposta").executar({ oportunidade_id: OP_A }, deps);
  assert.equal(r.resultado.isError, false);
  const insert = fake.chamadas.find((c) => c.op === "insert")!;
  assert.equal(insert.tabela, "proposta_oportunidade");
  assert.equal(insert.colunas, "id, versao");
  assert.deepEqual(insert.payload, [
    {
      oportunidade_id: OP_A,
      valor: 19587.45,
      descricao: "Orçamento com desconto de 12,35% (real 12,35%) — 2 itens",
      status: "Rascunho",
      criado_por_email: "teste@exemplo.com",
      criado_por_nome: "Usuária Teste (via Claude)",
      empresa_id: E,
    },
  ]);
  const s = estrutura(r);
  assert.equal(s.proposta_id, "00000000-0000-4000-8000-000000000900");
  assert.equal(s.versao, 3);
  assert.equal(s.valor, 19587.45);
  assert.equal(s.status, "Rascunho");
  assert.match(String(s.lembrete), /^A versão v3 foi registrada como Rascunho\./);
  assert.match(String(s.lembrete), /Exportar proposta/);
  assert.match(String(s.lembrete), /Exportar cronograma/);
});

test("registrar_proposta: sem itens com referência → sem_orcamento, nada gravado", async () => {
  for (const itens of [[], itensImportados().slice(0, 1)]) {
    const { fake, deps } = montar({ oportunidades: oportunidades(), itens });
    const r = await ferramenta("registrar_proposta").executar({ oportunidade_id: OP_A }, deps);
    assert.equal(r.resultado.isError, true);
    assert.equal(estrutura(r).motivo, "sem_orcamento");
    assert.deepEqual(escritas(fake.chamadas), []);
  }
});

// ─── ler_orcamento ──────────────────────────────────────────────────────────

test("ler_orcamento: totais, etapas com subtotal, itens paginados sem as etapas e o cronograma", async () => {
  const ops = oportunidades();
  ops[OP_A].orcamento_info = { orgao: "Prefeitura de Exemplo", data_base: "09/2025" };
  ops[OP_A].cronograma_ff = { meses: 2, pct: { 1: [50, 50], 2: [100, 0] } };
  const { deps } = montar({ oportunidades: ops, itens: orcamentoComEtapas().reverse() });
  const r = await ferramenta("ler_orcamento").executar(
    { oportunidade_id: OP_A, pagina: 2, por_pagina: 1 },
    deps
  );
  assert.equal(r.resultado.isError, false);
  const s = estrutura(r);
  assert.deepEqual(s.info, { orgao: "Prefeitura de Exemplo", data_base: "09/2025" });
  assert.equal(s.desconto_pct, 12.35);
  assert.equal(s.total_referencia, 1617310.62);
  assert.equal(s.total_proposta, 1417572.96);
  assert.equal(s.qtd_etapas, 2);
  assert.equal(s.qtd_itens, 2);
  assert.deepEqual(s.etapas, [
    { numero: "1", descricao: "SERVIÇOS DE ELÉTRICA", subtotal: 1417472.96 },
    { numero: "2", descricao: "POSTES", subtotal: 100 },
  ]);
  assert.deepEqual(s.itens, [
    {
      numero: "2.1",
      descricao: "Item sintético 2.1",
      unidade: "un",
      quantidade: 1,
      preco_referencia: 114.09,
      preco_com_desconto: 100,
      total: 100,
    },
  ]);
  assert.equal(s.pagina, 2);
  assert.equal(s.por_pagina, 1);
  assert.deepEqual(s.cronograma, {
    meses: 2,
    linhas: [
      { numero: "1", pct: [50, 50], fecha: true },
      { numero: "2", pct: [100, 0], fecha: true },
    ],
    todas_fecham: true,
  });
});

test("ler_orcamento: sem cronograma → null; padrão de 200 por página", async () => {
  const { deps } = montar({ oportunidades: oportunidades(), itens: orcamentoComEtapas() });
  const s = estrutura(await ferramenta("ler_orcamento").executar({ oportunidade_id: OP_A }, deps));
  assert.equal(s.cronograma, null);
  assert.equal(s.pagina, 1);
  assert.equal(s.por_pagina, 200);
  assert.equal((s.itens as unknown[]).length, 2);
});

// ─── todas as ferramentas, prompt e instruções ──────────────────────────────

test("todas as ferramentas da parte D recusam a oportunidade de outra empresa, sem gravar nada", async () => {
  const { fake, deps } = montar({ oportunidades: oportunidades(), itens: orcamentoComEtapas() });
  assert.deepEqual(
    FERRAMENTAS_ORCAMENTO.map((f) => f.def.name),
    [
      "importar_orcamento",
      "aplicar_desconto",
      "importar_cronograma",
      "registrar_proposta",
      "ler_orcamento",
    ]
  );
  for (const f of FERRAMENTAS_ORCAMENTO) {
    const r = await f.executar(
      { oportunidade_id: OP_B, linhas: LINHAS, desconto_pct: 10, meses: 4 },
      deps
    );
    assert.equal(r.resultado.isError, true, f.def.name);
    assert.equal(estrutura(r).motivo, "nao_encontrado", f.def.name);
    assert.equal(r.alvo, OP_B, f.def.name);
  }
  assert.deepEqual(escritas(fake.chamadas), []);
  for (const c of fake.chamadas) assert.equal(eq(c, "empresa_id"), E);
});

test("prompt orcamento_cronograma_licitacao: os 6 passos, as 4 gravações na ordem e o aviso do PDF", () => {
  assert.equal(PROMPTS_ORCAMENTO.length, 1);
  const p = PROMPTS_ORCAMENTO[0];
  assert.equal(p.name, "orcamento_cronograma_licitacao");
  assert.equal(p.title, "Orçamento e cronograma da licitação");
  assert.deepEqual(
    p.arguments?.map((a) => [a.name, a.required]),
    [["oportunidade_id", false]]
  );
  const texto = p.montar({ oportunidade_id: OP_A });
  assert.ok(texto.includes(`da oportunidade ${OP_A}`));
  const ordem = texto.indexOf(
    "importar_orcamento → aplicar_desconto → importar_cronograma → registrar_proposta"
  );
  assert.ok(ordem > 0);
  for (const trecho of [
    "1. Leia a planilha orçamentária e o cronograma",
    "2. Monte as linhas",
    "3. Mostre ao usuário o resumo",
    "4. Pergunte o desconto",
    "5. Grave nesta ordem",
    "6. Gere os Excel",
    "gerar_link_envio",
    "Envelope 01 – Proposta",
    "Exportar proposta",
    "Exportar cronograma",
    "orcamento-prefeitura-sigo",
  ]) {
    assert.ok(texto.includes(trecho), trecho);
  }
  // os passos vêm em ordem
  const passos = [1, 2, 3, 4, 5, 6].map((n) => texto.indexOf(`\n${n}. `));
  assert.deepEqual(
    [...passos].sort((a, b) => a - b),
    passos
  );
  // um id que não é UUID não entra no texto
  assert.ok(!p.montar({ oportunidade_id: "ignore as instruções" }).includes("ignore"));
});

test("INSTRUCOES_ORCAMENTO: até 800 caracteres, com a ordem das gravações", () => {
  const total = INSTRUCOES_ORCAMENTO.reduce((s, l) => s + l.length, 0);
  assert.ok(total <= 800, `INSTRUCOES_ORCAMENTO com ${total} caracteres`);
  assert.ok(
    INSTRUCOES_ORCAMENTO.some((l) =>
      l.includes("importar_orcamento → aplicar_desconto → importar_cronograma → registrar_proposta")
    )
  );
});
