// node --test supabase/functions/mcp/ferramentas-edital.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FERRAMENTAS_EDITAL, INSTRUCOES_EDITAL, PROMPTS_EDITAL } from "./ferramentas-edital.ts";
import { despachar, type LinhaAuditoria } from "./despacho.ts";
import type { DepsFerramenta } from "./registro.ts";
import { camadaDaEmpresa } from "../_shared/conector/camada-empresa.ts";
import {
  criarFakeAdmin,
  type ChamadaFake,
  type RespostaFake,
} from "../_shared/conector/testes/fake-admin.ts";
import { brl, fmtNum, renumerarIds, sanearEdital } from "../_shared/edital/edital-regras.ts";
import { METODO_LEITURA_EDITAL, REGRAS_ATENDE } from "../_shared/edital/metodo.ts";

const E = "00000000-0000-4000-8000-000000000001"; // empresa da chave
const OUTRA = "00000000-0000-4000-8000-000000000002";
const OP_A = "00000000-0000-4000-8000-000000000011"; // da empresa E
const OP_B = "00000000-0000-4000-8000-000000000012"; // da OUTRA
const ARQ_1 = "00000000-0000-4000-8000-000000000021";
const ARQ_2 = "00000000-0000-4000-8000-000000000022";
const PL = 1234567.89;
// perfil econômico da empresa: as 8 colunas que só o servidor lê (COLUNAS_PERFIL_ECONOMICO), com
// valores distintos entre si para que cada um só possa ter saído da sua própria coluna
const FAT_2025 = 7654321.09;
const PERFIL = {
  capital_social: 500000,
  patrimonio_liquido: PL,
  ccl: 345678.12,
  liquidez_corrente: 1.234,
  liquidez_geral: 1.567,
  solvencia_geral: 2.891,
  endividamento_geral: 0.432,
  faturamento: [{ ano: 2025, receita_bruta: FAT_2025 }],
};
const VALORES_DA_EMPRESA = [
  PERFIL.capital_social,
  PERFIL.patrimonio_liquido,
  PERFIL.ccl,
  PERFIL.liquidez_corrente,
  PERFIL.liquidez_geral,
  PERFIL.solvencia_geral,
  PERFIL.endividamento_geral,
  FAT_2025,
];

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
    {
      exigencia_id: "ec2",
      grupo: "economica",
      exigencia: "Capital social, CCL e índices",
      qtd_exigida: 300000,
      unidade: "R$",
      status: "atende",
      comprovacao: `Capital social ${brl(PERFIL.capital_social)}; CCL ${brl(PERFIL.ccl)}; receita bruta de 2025 ${brl(FAT_2025)}`,
      atestados: [],
      justificativa: `Liquidez corrente ${fmtNum(PERFIL.liquidez_corrente)}, geral ${fmtNum(PERFIL.liquidez_geral)}, solvência geral ${fmtNum(PERFIL.solvencia_geral)}, endividamento geral ${fmtNum(PERFIL.endividamento_geral)}. Atende.`,
    },
  ],
  veredito: "atende",
  cats_anexar: [],
  pendencias: [`Conferir o capital social de ${fmtNum(PERFIL.capital_social)} no contrato`],
  riscos: [
    `Receita bruta de 2025 (${fmtNum(FAT_2025)}) perto do mínimo; CCL ${fmtNum(PERFIL.ccl)}`,
  ],
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
    return { data: [{ ...PERFIL, registro_crea_pj: "X" }] };
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
  // nenhum dos 8 valores econômicos sai, em nenhuma das duas formas (R$ e número). O guarda não
  // pode ser vazio: o "Atende?" gravado tem de conter cada valor, senão o assert abaixo não prova nada
  const gravado = JSON.stringify(ATENDE);
  const json = r.resultado.content[0].text;
  for (const v of VALORES_DA_EMPRESA) {
    assert.ok(gravado.includes(brl(v)) || gravado.includes(fmtNum(v)), `fixture sem ${v}`);
    for (const proibido of [brl(v), fmtNum(v)]) {
      assert.equal(json.includes(proibido), false, proibido);
    }
  }
  for (const proibido of ["1234567", "500000", "345678", "7654321"]) {
    assert.equal(json.includes(proibido), false, proibido);
  }
  assert.match(s.analise.atende.itens[1].comprovacao, /\[valor da empresa\]/);
  assert.match(s.analise.atende.itens[2].comprovacao, /\[valor da empresa\]/);
  assert.equal(s.analise.atende.itens[0].comprovacao, "CAT 1/2025: 12 postes");
  // o perfil é lido só com as colunas econômicas (as 8, nem uma a menos), e só no servidor
  const perfil = fake.chamadas.find((c) => c.tabela === "acervo_perfil")!;
  const colunasLidas = String(perfil.colunas)
    .split(",")
    .map((c) => c.trim());
  assert.deepEqual(colunasLidas.sort(), Object.keys(PERFIL).sort());
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

// ─── T9: criar_ou_atualizar_oportunidade, registrar_atende, adicionar_nota ──

const EDITAL = JSON.parse(
  readFileSync(
    new URL("../_shared/edital/fixtures/edital-consolidado.json", import.meta.url),
    "utf8"
  )
);
const NOVA = "00000000-0000-4000-8000-000000000013";
const STATUS = "00000000-0000-4000-8000-000000000061";
const AT1 = "00000000-0000-4000-8000-000000000071";
const VINCULO = "00000000-0000-4000-8000-000000000051";
const DUPLICATA = {
  id: OP_A,
  nome: "PE 012/2026 - Iluminação - Cidade Exemplo/MG",
  descricao: null,
  licitacao_numero: null,
  licitacao_processo: null,
  orgao: null,
  cidade: null,
  estado: "MG",
  status_nome: "Em análise",
  licitacao_data: null,
  created_at: "2026-09-01T10:00:00Z",
};

function responderCriar(duplicatas: unknown[]) {
  return (c: ChamadaFake): RespostaFake | undefined => {
    if (c.tabela === "conector_buscar_oportunidades") return { data: duplicatas };
    if (c.tabela === "status_oportunidade") {
      return { data: [{ id: STATUS, nome: "Prospecção", ordem: 1 }] };
    }
    if (c.tabela === "oportunidade" && c.op === "insert") return { data: [{ id: NOVA }] };
    if (c.tabela === "oportunidade_atualizacao" && c.op === "insert") {
      return { data: [{ id: "00000000-0000-4000-8000-000000000081" }] };
    }
    return undefined;
  };
}
const inserts = (fake: { chamadas: ChamadaFake[] }, tabela: string) =>
  fake.chamadas.filter((c) => c.tabela === tabela && c.op === "insert");

test("criar: com duplicata e sem confirmar_nova não grava nada e pergunta", async () => {
  const { fake, deps } = montar(responderCriar([DUPLICATA]));
  const r = await ferramenta("criar_ou_atualizar_oportunidade").executar({ edital: EDITAL }, deps);
  assert.equal(r.resultado.isError, false);
  const s = estrutura(r);
  assert.equal(s.criada, false);
  assert.equal(s.motivo, "duplicatas");
  assert.deepEqual(
    (s.duplicatas as { id: string; motivo: string }[]).map((d) => [d.id, d.motivo]),
    [[OP_A, "numero_no_texto_e_local"]]
  );
  assert.match(String(s.pergunta), /confirmar_nova: true/);
  const busca = fake.chamadas.find((c) => c.tabela === "conector_buscar_oportunidades")!;
  assert.deepEqual(busca.payload, {
    p_numero: "12",
    p_ano: "2026",
    p_limite: 50,
    p_empresa_id: E,
  });
  assert.equal(
    fake.chamadas.some((c) => c.op === "insert" || c.op === "update"),
    false
  );
});

test("criar: com confirmar_nova grava na empresa da camada, com responsável, status e alerta", async () => {
  const { fake, deps } = montar(responderCriar([DUPLICATA]));
  const r = await ferramenta("criar_ou_atualizar_oportunidade").executar(
    { edital: EDITAL, confirmar_nova: true },
    deps
  );
  assert.equal(r.resultado.isError, false);
  assert.equal(r.alvo, NOVA);
  const s = estrutura(r) as {
    oportunidade_id: string;
    criada: boolean;
    link: string;
    exigencias: { tecnica_operacional: { id: string }[] };
  };
  assert.equal(s.oportunidade_id, NOVA);
  assert.equal(s.criada, true);
  assert.equal(s.link, `https://www.sigoobras.com.br/Oportunidades?openId=${NOVA}`);
  assert.equal(s.exigencias.tecnica_operacional[0].id, "op1");
  const [ins] = inserts(fake, "oportunidade");
  const linha = (ins.payload as Record<string, unknown>[])[0];
  assert.equal(linha.empresa_id, E);
  assert.deepEqual(linha.responsaveis_ids, [VINCULO]);
  assert.equal(linha.alertar_prazos, true);
  assert.equal(linha.status_id, STATUS);
  assert.equal(linha.licitacao_numero, "012/2026");
  assert.equal(linha.edital_analisado_em, "2026-10-08T12:00:00.000Z");
  const analise = linha.edital_analise as Record<string, unknown>;
  assert.equal(analise.analisado_por, "teste@exemplo.com via Claude");
  assert.deepEqual(analise.arquivos, []);
  const [hist] = inserts(fake, "oportunidade_atualizacao");
  const { dados_novos, ...resto } = (hist.payload as Record<string, unknown>[])[0];
  assert.deepEqual(resto, {
    oportunidade_id: NOVA,
    usuario_nome: "Usuária Teste",
    tipo: "Sistema",
    descricao: "Dados preenchidos pelo Claude a partir do edital",
    dados_anteriores: null,
    empresa_id: E,
  });
  assert.equal((dados_novos as Record<string, unknown>).alertar_prazos, true);
});

test("criar: falha no histórico não desfaz a gravação", async () => {
  const base = responderCriar([]);
  const { deps } = montar((c) =>
    c.tabela === "oportunidade_atualizacao" ? { error: { message: "falhou" } } : base(c)
  );
  const r = await ferramenta("criar_ou_atualizar_oportunidade").executar({ edital: EDITAL }, deps);
  assert.equal(r.resultado.isError, false);
  assert.equal(estrutura(r).oportunidade_id, NOVA);
});

test("atualizar: só o que mudou e a análise pela RPC de mesclagem (atende e arquivos ficam)", async () => {
  const existente = {
    id: OP_A,
    empresa_id: E,
    nome: "Título do usuário",
    alertar_prazos: true,
    edital_analisado_em: "2026-09-01T10:00:00Z",
    licitacao_numero: "12/2026",
  };
  const { fake, deps } = montar((c) => {
    if (c.tabela === "oportunidade" && c.op === "select") {
      return { data: eq(c, "id") === OP_A && eq(c, "empresa_id") === E ? existente : null };
    }
    if (c.tabela === "oportunidade" && c.op === "update") return { data: { id: OP_A } };
    if (c.tabela === "edital_analise_mesclar") return { data: true };
    return undefined;
  });
  const r = await ferramenta("criar_ou_atualizar_oportunidade").executar(
    { edital: EDITAL, oportunidade_id: OP_A },
    deps
  );
  assert.equal(r.resultado.isError, false);
  assert.equal(estrutura(r).criada, false);
  assert.equal(
    fake.chamadas.some((c) => c.tabela === "conector_buscar_oportunidades"),
    false
  );
  const up = fake.chamadas.find((c) => c.tabela === "oportunidade" && c.op === "update")!;
  const patch = up.payload as Record<string, unknown>;
  assert.equal("nome" in patch, false);
  assert.equal("alertar_prazos" in patch, false);
  assert.equal("edital_analise" in patch, false);
  assert.equal(patch.licitacao_numero, "012/2026");
  assert.equal(eq(up, "empresa_id"), E);
  const mescla = fake.chamadas.find((c) => c.tabela === "edital_analise_mesclar")!;
  const p = mescla.payload as {
    p_oportunidade_id: string;
    p_patch: Record<string, unknown>;
    p_empresa_id: string;
  };
  assert.equal(p.p_oportunidade_id, OP_A);
  assert.equal(p.p_empresa_id, E);
  assert.deepEqual(Object.keys(p.p_patch).sort(), [
    "analisado_em",
    "analisado_por",
    "extraido",
    "versao",
  ]);
});

test("campo fora do schema dentro de edital é recusado pelo despacho, sem tocar no banco", async () => {
  const { fake, deps } = montar(() => undefined);
  const auditoria: LinhaAuditoria[] = [];
  const r = await despachar(
    "criar_ou_atualizar_oportunidade",
    { edital: { ...EDITAL, local: { ...EDITAL.local, bairro: "Centro" }, empresa_id: OUTRA } },
    {
      ferramentas: FERRAMENTAS_EDITAL,
      deps,
      consumirLimite: async () => ({ permitido: true, chaves: {} }),
      auditar: async (l) => {
        auditoria.push(l);
      },
    }
  );
  assert.equal(r.isError, true);
  const s = r.structuredContent as { motivo: string; campos: string[] };
  assert.equal(s.motivo, "campos_fora_da_lista");
  assert.deepEqual(s.campos.sort(), ["edital.empresa_id", "edital.local.bairro"]);
  assert.equal(fake.chamadas.length, 0);
  assert.equal(auditoria[0].motivo, "campos_fora_da_lista");
});

const EXTRAIDO_GRAVADO = renumerarIds(sanearEdital(EDITAL));
function responderAtende(c: ChamadaFake): RespostaFake | undefined {
  if (c.tabela === "oportunidade" && c.op === "select") {
    const daEmpresa = eq(c, "id") === OP_A && eq(c, "empresa_id") === E;
    const analise = { versao: 1, extraido: EXTRAIDO_GRAVADO, atende: null, arquivos: [] };
    return { data: daEmpresa ? { id: OP_A, edital_analise: analise } : null };
  }
  if (c.tabela === "acervo_perfil") {
    return { data: [{ patrimonio_liquido: PL, exercicio_balanco: 2025 }] };
  }
  if (c.tabela === "acervo_atestado") {
    return {
      data: [
        {
          id: AT1,
          tipo: "cat",
          numero: "1/2025",
          contratante: "Prefeitura Y",
          com_execucao: true,
          situacao: "concluida",
          ordem: 1,
        },
      ],
    };
  }
  if (c.tabela === "acervo_quantitativo") {
    return {
      data: [
        {
          atestado_id: AT1,
          categoria: "outro",
          descricao: "Luminárias LED",
          quantidade: 600,
          unidade: "un",
          na_atividade_tecnica: true,
          observacao: "síntese",
        },
      ],
    };
  }
  if (c.tabela === "edital_analise_mesclar") return { data: true };
  return undefined;
}
const AVALIACAO = {
  oportunidade_id: OP_A,
  itens: [
    {
      exigencia_id: "op1",
      status: "atende",
      comprovacao: `CAT ${AT1}: 600 luminárias`,
      atestado_ids: [AT1],
      justificativa: "Atende.",
    },
    { exigencia_id: "pr1", status: "verificar", justificativa: "Confirmar o vínculo." },
    { exigencia_id: "rg1", status: "atende", justificativa: "CREA ativo." },
  ],
  cats_anexar: [{ atestado_id: AT1, motivo: "Comprova op1" }],
};

test("registrar_atende: grava o atende pela RPC e devolve sem os valores da empresa", async () => {
  const { fake, deps } = montar(responderAtende);
  const r = await ferramenta("registrar_atende").executar(AVALIACAO, deps);
  assert.equal(r.resultado.isError, false);
  assert.equal(r.alvo, OP_A);
  const mescla = fake.chamadas.find((c) => c.tabela === "edital_analise_mesclar")!;
  assert.deepEqual(Object.keys(mescla.payload as object).sort(), [
    "p_empresa_id",
    "p_oportunidade_id",
    "p_patch",
  ]);
  const gravado = (
    mescla.payload as {
      p_patch: {
        atende: {
          modelo: string;
          itens: {
            exigencia_id: string;
            status: string;
            atestados: { id: string }[];
            comprovacao: string;
          }[];
        };
      };
    }
  ).p_patch.atende;
  assert.equal(gravado.modelo, "Claude (conector)");
  const op1 = gravado.itens.find((i) => i.exigencia_id === "op1")!;
  assert.equal(op1.status, "atende");
  assert.deepEqual(
    op1.atestados.map((a) => a.id),
    [AT1]
  );
  assert.equal(op1.comprovacao.includes(AT1), false); // o UUID virou "CAT 1/2025"
  const ec1 = gravado.itens.find((i) => i.exigencia_id === "ec1")!;
  assert.equal(ec1.status, "atende"); // calculado pelo SIGO com o PL
  assert.ok(JSON.stringify(gravado).includes(brl(PL))); // a tela vê o valor
  const json = r.resultado.content[0].text;
  assert.equal(json.includes(brl(PL)), false);
  assert.equal(json.includes(fmtNum(PL)), false);
});

test("registrar_atende: inválido dá validacao e não grava; sem análise dá sem_analise", async () => {
  const { fake, deps } = montar(responderAtende);
  const desconhecido = "00000000-0000-4000-8000-000000000099";
  const r = await ferramenta("registrar_atende").executar(
    {
      ...AVALIACAO,
      itens: [
        { exigencia_id: "ec1", status: "atende", justificativa: "x" },
        { exigencia_id: "op1", status: "atende", atestado_ids: [desconhecido], justificativa: "x" },
      ],
    },
    deps
  );
  assert.equal(r.resultado.isError, true);
  const s = estrutura(r);
  assert.equal(s.motivo, "validacao");
  assert.deepEqual(s.exigencias_invalidas, ["ec1"]);
  assert.deepEqual(s.atestados_invalidos, [desconhecido]);
  assert.equal(
    fake.chamadas.some((c) => c.tabela === "edital_analise_mesclar"),
    false
  );

  const sem = montar((c) =>
    c.tabela === "oportunidade" ? { data: { id: OP_A, edital_analise: null } } : undefined
  );
  const r2 = await ferramenta("registrar_atende").executar(AVALIACAO, sem.deps);
  assert.equal(estrutura(r2).motivo, "sem_analise");
});

test("oportunidade de outra empresa: nao_encontrado em criar/atualizar, registrar_atende e nota", async () => {
  const { fake, deps } = montar((c) =>
    c.tabela === "oportunidade" && c.op === "select"
      ? { data: eq(c, "empresa_id") === OUTRA ? { id: OP_B } : null }
      : undefined
  );
  const chamadas: [string, Record<string, unknown>][] = [
    ["criar_ou_atualizar_oportunidade", { edital: EDITAL, oportunidade_id: OP_B }],
    ["registrar_atende", { ...AVALIACAO, oportunidade_id: OP_B }],
    ["adicionar_nota", { oportunidade_id: OP_B, texto: "Nota" }],
  ];
  for (const [nome, args] of chamadas) {
    const r = await ferramenta(nome).executar(args, deps);
    assert.equal(r.resultado.isError, true, nome);
    assert.equal(estrutura(r).motivo, "nao_encontrado", nome);
  }
  assert.equal(
    fake.chamadas.some((c) => c.op !== "select"),
    false
  );
});

test("adicionar_nota: grava a nota 'via Claude' na empresa da camada", async () => {
  const NOTA = "00000000-0000-4000-8000-000000000081";
  const { fake, deps } = montar((c) => {
    if (c.tabela === "oportunidade") return { data: eq(c, "id") === OP_A ? { id: OP_A } : null };
    if (c.tabela === "oportunidade_atualizacao") return { data: [{ id: NOTA }] };
    return undefined;
  });
  const r = await ferramenta("adicionar_nota").executar(
    { oportunidade_id: OP_A, texto: "  Ligar para o setor de licitações.  " },
    deps
  );
  assert.deepEqual(estrutura(r), {
    nota_id: NOTA,
    oportunidade_id: OP_A,
    link: `https://www.sigoobras.com.br/Oportunidades?openId=${OP_A}`,
  });
  assert.deepEqual(inserts(fake, "oportunidade_atualizacao")[0].payload, [
    {
      oportunidade_id: OP_A,
      usuario_nome: "Usuária Teste (via Claude)",
      tipo: "Nota",
      descricao: "Ligar para o setor de licitações.",
      empresa_id: E,
    },
  ]);
  for (const texto of [" ", "x".repeat(5001)]) {
    const r2 = await ferramenta("adicionar_nota").executar({ oportunidade_id: OP_A, texto }, deps);
    assert.equal(estrutura(r2).motivo, "validacao");
  }
});

test("defs: anotações do §5, schemas fechados, instruções curtas e o prompt com o método", () => {
  const esperado: Record<string, [boolean, boolean]> = {
    buscar_oportunidades: [true, true],
    obter_oportunidade: [true, true],
    criar_ou_atualizar_oportunidade: [false, false],
    registrar_atende: [false, true],
    adicionar_nota: [false, false],
  };
  assert.deepEqual(
    FERRAMENTAS_EDITAL.map((f) => f.def.name),
    Object.keys(esperado)
  );
  for (const f of FERRAMENTAS_EDITAL) {
    const [leitura, idempotente] = esperado[f.def.name];
    assert.equal(f.def.annotations.readOnlyHint, leitura, f.def.name);
    assert.equal(f.def.annotations.idempotentHint, idempotente, f.def.name);
    assert.equal(f.def.annotations.openWorldHint, false, f.def.name);
    if (!leitura) assert.equal(f.def.annotations.destructiveHint, false, f.def.name);
    assert.equal(f.def.inputSchema.additionalProperties, false, f.def.name);
    assert.ok(Array.isArray(f.def.inputSchema.required), f.def.name);
  }
  const props = FERRAMENTAS_EDITAL[2].def.inputSchema.properties as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(props.edital.additionalProperties, false);
  assert.equal("required" in props.edital, false);
  assert.ok(INSTRUCOES_EDITAL.join("\n").length <= 800);

  assert.equal(PROMPTS_EDITAL[0].name, "analisar_edital");
  const texto = PROMPTS_EDITAL[0].montar({});
  for (const linha of [...METODO_LEITURA_EDITAL, ...REGRAS_ATENDE]) {
    assert.ok(texto.includes(linha), linha);
  }
  assert.equal(texto.includes("oportunidade_id ="), false);
  assert.ok(
    PROMPTS_EDITAL[0].montar({ oportunidade_id: OP_A }).includes(`oportunidade_id = ${OP_A}`)
  );
});
