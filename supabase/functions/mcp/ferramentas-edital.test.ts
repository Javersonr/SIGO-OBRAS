// node --test supabase/functions/mcp/ferramentas-edital.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FERRAMENTAS_EDITAL } from "./ferramentas-edital.ts";
import type { DepsFerramenta } from "./registro.ts";
import { camadaDaEmpresa } from "../_shared/conector/camada-empresa.ts";
import {
  criarFakeAdmin,
  type ChamadaFake,
  type RespostaFake,
} from "../_shared/conector/testes/fake-admin.ts";
import { brl, fmtNum } from "../_shared/edital/edital-regras.ts";

const E = "00000000-0000-4000-8000-000000000001"; // empresa da chave
const OUTRA = "00000000-0000-4000-8000-000000000002";
const OP_A = "00000000-0000-4000-8000-000000000011"; // da empresa E
const OP_B = "00000000-0000-4000-8000-000000000012"; // da OUTRA
const ARQ_1 = "00000000-0000-4000-8000-000000000021";
const ARQ_2 = "00000000-0000-4000-8000-000000000022";
const PL = 1234567.89;

const ferramenta = (nome: string) => {
  const f = FERRAMENTAS_EDITAL.find((x) => x.def.name === nome);
  if (!f) throw new Error(`sem a ferramenta ${nome}`);
  return f;
};
/** valor do filtro .eq(coluna, valor) da chamada */
const eq = (c: ChamadaFake, coluna: string) =>
  c.filtros.find((f) => f.metodo === "eq" && f.args[0] === coluna)?.args[1];
const estrutura = (r: { resultado: { structuredContent?: unknown } }) =>
  r.resultado.structuredContent as Record<string, unknown>;

function montar(responder: (c: ChamadaFake) => RespostaFake | undefined) {
  const fake = criarFakeAdmin(responder);
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

// ─── buscar_oportunidades ───────────────────────────────────────────────────

test("buscar_oportunidades: exige texto ou nº/ano e não chama o banco sem filtro", async () => {
  const { fake, deps } = montar(() => undefined);
  for (const args of [{}, { texto: "de a" }, { numero_edital: "12" }]) {
    const r = await ferramenta("buscar_oportunidades").executar(args, deps);
    assert.equal(r.resultado.isError, true);
    assert.equal(estrutura(r).motivo, "validacao");
  }
  assert.equal(fake.chamadas.length, 0);
});

test("buscar_oportunidades: o nº vira p_numero/p_ano, a empresa vem da camada, saída com link", async () => {
  const { fake, deps } = montar((c) =>
    c.tabela === "conector_buscar_oportunidades"
      ? {
          data: [
            {
              id: OP_A,
              nome: "PE 012/2026 Iluminação",
              descricao: "x",
              licitacao_numero: "012/2026",
              licitacao_processo: null,
              orgao: "Prefeitura Municipal de Cidade Exemplo",
              cidade: "Cidade Exemplo",
              estado: "MG",
              status_nome: "Em análise",
              licitacao_data: "2026-10-15",
              created_at: "2026-10-01T10:00:00Z",
            },
          ],
        }
      : undefined
  );
  const r = await ferramenta("buscar_oportunidades").executar(
    { numero_edital: "PE 012/2026", limite: 5 },
    deps
  );
  assert.equal(r.resultado.isError, false);
  const [rpc] = fake.chamadas;
  assert.equal(rpc.op, "rpc");
  assert.deepEqual(rpc.payload, {
    p_texto: null,
    p_numero: "12",
    p_ano: "2026",
    p_limite: 5,
    p_empresa_id: E,
  });
  assert.deepEqual(estrutura(r), {
    oportunidades: [
      {
        id: OP_A,
        nome: "PE 012/2026 Iluminação",
        status: "Em análise",
        orgao: "Prefeitura Municipal de Cidade Exemplo",
        cidade: "Cidade Exemplo",
        estado: "MG",
        licitacao_numero: "012/2026",
        licitacao_data: "2026-10-15",
        link: `https://www.sigoobras.com.br/Oportunidades?openId=${OP_A}`,
      },
    ],
    total: 1,
  });
});

test("buscar_oportunidades: só texto vai em p_texto; limite padrão 20", async () => {
  const { fake, deps } = montar(() => undefined);
  const r = await ferramenta("buscar_oportunidades").executar({ texto: "Joanópolis LED" }, deps);
  assert.deepEqual(estrutura(r), { oportunidades: [], total: 0 });
  assert.deepEqual(fake.chamadas[0].payload, {
    p_texto: "Joanópolis LED",
    p_numero: null,
    p_ano: null,
    p_limite: 20,
    p_empresa_id: E,
  });
});

// ─── obter_oportunidade ─────────────────────────────────────────────────────

const ATENDE = {
  empresa: { id: E, nome: "Empresa Teste" },
  itens: [
    {
      exigencia_id: "op1",
      grupo: "tecnica_operacional",
      exigencia: "Postes",
      qtd_exigida: 10,
      unidade: "un",
      status: "atende",
      comprovacao: "CAT 1/2025: 12 postes",
      atestados: [],
      justificativa: "Atende.",
    },
    {
      exigencia_id: "ec1",
      grupo: "economica",
      exigencia: "PL mínimo",
      qtd_exigida: 100000,
      unidade: "R$",
      status: "atende",
      comprovacao: `Patrimônio líquido: ${brl(PL)}`,
      atestados: [],
      justificativa: `Exigido ${brl(100000)}; a empresa tem ${brl(PL)} — Patrimônio líquido. Atende.`,
    },
  ],
  veredito: "atende",
  cats_anexar: [],
  pendencias: [],
  riscos: [],
  alertas: [`PL ${fmtNum(PL)} no último balanço`],
  analisado_em: "2026-10-08T12:00:00.000Z",
  modelo: "Claude (conector)",
};

const OPS = [
  {
    id: OP_A,
    empresa_id: E,
    nome: "Iluminação LED",
    status_nome: "Em análise",
    alertar_prazos: true,
    licitacao_numero: "012/2026",
    cidade: "Cidade Exemplo",
    edital_analise: {
      versao: 1,
      extraido: { orgao: "Prefeitura" },
      atende: ATENDE,
      arquivos: [],
      analisado_em: "2026-10-08T12:00:00.000Z",
      analisado_por: "teste@exemplo.com via Claude",
    },
  },
  { id: OP_B, empresa_id: OUTRA, nome: "De outra empresa", edital_analise: null },
];

function responderObter(c: ChamadaFake): RespostaFake | undefined {
  if (c.tabela === "oportunidade" && c.op === "select") {
    const linha = OPS.find((o) => o.id === eq(c, "id") && o.empresa_id === eq(c, "empresa_id"));
    return { data: linha ?? null };
  }
  if (c.tabela === "acervo_perfil") {
    return { data: [{ patrimonio_liquido: PL, capital_social: 500000, registro_crea_pj: "X" }] };
  }
  if (c.tabela === "arquivo_oportunidade" && eq(c, "oportunidade_id") === OP_A) {
    return {
      data: [
        {
          id: ARQ_1,
          nome: "edital.pdf",
          categoria: "edital",
          pasta: null,
          tipo: "application/pdf",
          tamanho: 1000,
        },
        {
          id: ARQ_2,
          nome: "planilha.xlsx",
          categoria: null,
          pasta: "Envelope 01 – Proposta",
          tipo: "x",
          tamanho: 5,
        },
      ],
    };
  }
  if (c.tabela === "conector_texto_disponivel") {
    return { data: [{ arquivo_id: ARQ_1, paginas: 40, escaneadas: 2 }] };
  }
  return undefined;
}

test("obter_oportunidade: de outra empresa ou id inválido dá nao_encontrado", async () => {
  const { fake, deps } = montar(responderObter);
  for (const oportunidade_id of [OP_B, "00000000-0000-4000-8000-000000000099"]) {
    const r = await ferramenta("obter_oportunidade").executar({ oportunidade_id }, deps);
    assert.equal(r.resultado.isError, true);
    assert.equal(estrutura(r).motivo, "nao_encontrado");
  }
  const antes = fake.chamadas.length;
  const r = await ferramenta("obter_oportunidade").executar({ oportunidade_id: "abc" }, deps);
  assert.equal(estrutura(r).motivo, "nao_encontrado");
  assert.equal(fake.chamadas.length, antes); // nem chegou ao banco
  for (const c of fake.chamadas) assert.equal(eq(c, "empresa_id"), E);
});

test("obter_oportunidade: campos, análise, arquivos com texto e nada dos valores da empresa", async () => {
  const { fake, deps } = montar(responderObter);
  const r = await ferramenta("obter_oportunidade").executar({ oportunidade_id: OP_A }, deps);
  assert.equal(r.resultado.isError, false);
  assert.equal(r.alvo, OP_A);
  const s = estrutura(r) as {
    oportunidade: Record<string, unknown>;
    analise: { atende: { itens: { comprovacao: string }[] }; extraido: unknown };
    arquivos: { texto: unknown }[];
  };
  assert.equal(s.oportunidade.link, `https://www.sigoobras.com.br/Oportunidades?openId=${OP_A}`);
  assert.equal(s.oportunidade.licitacao_numero, "012/2026");
  assert.equal(s.oportunidade.orgao, null); // toda coluna da lista aparece, mesmo vazia
  assert.deepEqual(s.analise.extraido, { orgao: "Prefeitura" });
  assert.deepEqual(
    s.arquivos.map((a) => a.texto),
    [{ paginas: 40, escaneadas: 2 }, null]
  );
  const json = r.resultado.content[0].text;
  for (const proibido of [brl(PL), fmtNum(PL), "1234567", "500000"]) {
    assert.equal(json.includes(proibido), false, proibido);
  }
  assert.match(s.analise.atende.itens[1].comprovacao, /\[valor da empresa\]/);
  assert.equal(s.analise.atende.itens[0].comprovacao, "CAT 1/2025: 12 postes");
  // o perfil é lido só com as colunas econômicas, e só no servidor
  const perfil = fake.chamadas.find((c) => c.tabela === "acervo_perfil")!;
  assert.equal(perfil.colunas?.includes("registro_crea_pj"), false);
  const texto = fake.chamadas.find((c) => c.tabela === "conector_texto_disponivel")!;
  assert.deepEqual(texto.payload, { p_arquivo_ids: [ARQ_1, ARQ_2], p_empresa_id: E });
});

test("obter_oportunidade: sem análise e sem arquivos não lê o perfil nem o texto", async () => {
  const semAnalise = { ...OPS[0], edital_analise: null };
  const { fake, deps } = montar((c) =>
    c.tabela === "oportunidade" ? { data: eq(c, "id") === OP_A ? semAnalise : null } : undefined
  );
  const r = await ferramenta("obter_oportunidade").executar({ oportunidade_id: OP_A }, deps);
  assert.equal(estrutura(r).analise, null);
  assert.deepEqual(estrutura(r).arquivos, []);
  assert.deepEqual(
    fake.chamadas.map((c) => c.tabela),
    ["oportunidade", "arquivo_oportunidade"]
  );
});
