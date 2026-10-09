// node --test supabase/functions/mcp/ferramentas-orcamento.test.ts
// Ferramentas da parte D com o fake da T1; a camada é de verdade, presa à empresa E.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FERRAMENTAS_ORCAMENTO } from "./ferramentas-orcamento.ts";
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
