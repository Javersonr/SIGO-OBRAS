// node --test supabase/functions/mcp/ferramentas-acervo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLUNAS_ATESTADO_CONECTOR,
  COLUNAS_PERFIL_CONECTOR,
  FERRAMENTAS_ACERVO,
  INSTRUCOES_ACERVO,
  PROMPTS_ACERVO,
} from "./ferramentas-acervo.ts";
import { despachar, type LinhaAuditoria } from "./despacho.ts";
import type { DepsFerramenta } from "./registro.ts";
import type { Vinculo } from "../_shared/conector/acesso.ts";
import { camadaDaEmpresa } from "../_shared/conector/camada-empresa.ts";
import { CATEGORIAS_ACERVO } from "../_shared/edital/acervo-categorias.ts";
import { MSG_SEM_CONFIRMACAO } from "../_shared/edital/acervo-cadastro.ts";
import { criarFakeAdmin, type ChamadaFake } from "../_shared/conector/testes/fake-admin.ts";

const E = "00000000-0000-4000-8000-000000000001";
const AT1 = "00000000-0000-4000-8000-000000000051";
const AT2 = "00000000-0000-4000-8000-000000000052";
const AT3 = "00000000-0000-4000-8000-000000000053";
const AT_OUTRA = "00000000-0000-4000-8000-000000000059";
const PROF = "00000000-0000-4000-8000-000000000061";

const ferramenta = (nome: string) => FERRAMENTAS_ACERVO.find((f) => f.def.name === nome)!;
const sc = (r: { resultado: { structuredContent?: unknown } }) =>
  r.resultado.structuredContent as Record<string, unknown>;
const eqDe = (c: ChamadaFake, coluna: string) =>
  c.filtros.find((f) => f.metodo === "eq" && f.args[0] === coluna)?.args[1];
const inDe = (c: ChamadaFake, coluna: string) =>
  c.filtros.find((f) => f.metodo === "in" && f.args[0] === coluna)?.args[1] as string[] | undefined;

const EDITOR: Vinculo = {
  perfil: "Usuario",
  ativo: true,
  permissoes: { Oportunidades: { Lista: { visualizar: true, editar: true } } },
};

// valores econômicos e o valor do contrato: o fake os devolve se alguém pedir a coluna
const PERFIL = {
  registro_crea_pj: "MG-000001",
  porte: "EPP",
  razao_social_anterior: null,
  capital_social: 1234567.89,
  capital_social_data: "2024-05-01",
  patrimonio_liquido: 7654321.01,
  pl_data_base: "2025-12-31",
  ccl: 555555.55,
  liquidez_corrente: 2.345,
  liquidez_geral: 1.987,
  solvencia_geral: 3.21,
  endividamento_geral: 0.123,
  exercicio_balanco: 2025,
  balanco_registro: "JUCEMG 999",
  faturamento: [{ ano: 2025, receita_bruta: 9876543.21 }],
  certidoes: [{ tipo: "CERTIDAO-SINTETICA" }],
  cadastros: [{ orgao: "Concessionária", codigo: "C-1", situacao: "ativo" }],
  alertas: ["Capital social integralizado de R$ 1.234.567,89", "CATs antigas no nome anterior"],
  observacoes: "PL de R$7.654.321,01 no balanço de 2025",
  updated_at: "2026-01-01T00:00:00Z",
};

const atestado = (id: string, ordem: number, extra: Record<string, unknown> = {}) => ({
  id,
  tipo: "cat",
  numero: null,
  conselho: "CREA-MG",
  art_numero: null,
  contratante: "Prefeitura Sintética",
  contratante_cnpj: "00.000.000/0001-00",
  contrato: "C-1",
  valor: 213148.2,
  objeto: "Iluminação pública",
  cidade: "Cidade Teste",
  uf: "MG",
  data_inicio: "2024-01-01",
  data_fim: "2024-06-30",
  atividades: ["execucao"],
  codigos_crea: [],
  com_execucao: true,
  situacao: "concluida",
  profissional_id: PROF,
  profissional_nome: "Eng. Sintético",
  empresa_executora: null,
  cobre_arts: [],
  riscos: null,
  observacoes: null,
  arquivo_ref: null,
  ordem,
  ...extra,
});

// fora de ordem de propósito: a ferramenta ordena por ordem e id
const ATESTADOS = [
  atestado(AT3, 3),
  atestado(AT1, 1, {
    numero: "CAT nº 3.239.747/2025",
    arquivo_ref: `certificados/${E}/2026/10/x.pdf`,
  }),
  atestado(AT2, 2, { contratante: "Prefeitura de Joanópolis", atividades: '["projeto"]' }),
];
const QUANTS = [
  {
    atestado_id: AT1,
    categoria: "poste",
    descricao: "Postes",
    quantidade: "50",
    unidade: "un",
    especificacao: null,
    na_atividade_tecnica: true,
    observacao: "síntese",
    ordem: 1,
  },
  {
    atestado_id: AT2,
    categoria: "rede_aerea",
    descricao: "Rede",
    quantidade: 2,
    unidade: "km",
    especificacao: null,
    na_atividade_tecnica: false,
    observacao: "síntese",
    ordem: 1,
  },
  {
    atestado_id: AT3,
    categoria: "poste",
    descricao: "Postes 9 m",
    quantidade: 10,
    unidade: "un",
    especificacao: "9 m",
    na_atividade_tecnica: false,
    observacao: "detalhe",
    ordem: 2,
  },
  {
    atestado_id: AT3,
    categoria: "poste",
    descricao: "Total de postes",
    quantidade: 30,
    unidade: "un",
    especificacao: null,
    na_atividade_tecnica: false,
    observacao: "síntese",
    ordem: 1,
  },
];
const PROFS = [
  {
    id: PROF,
    nome: "Eng. Sintético",
    registro: "MG-0999001/D",
    titulos: "Eng. Eletricista",
    atribuicoes: "Art. 8º",
    restricoes: null,
    vinculo_desde: "2020-01-01",
    responsavel_tecnico: true,
    ativo: true,
    observacoes: "interno",
  },
];

function responder(c: ChamadaFake) {
  if (c.tabela === "acervo_perfil") return { data: [PERFIL] };
  if (c.tabela === "acervo_atestado" && c.terminal === "maybeSingle") {
    return { data: ATESTADOS.filter((a) => a.id === eqDe(c, "id")) };
  }
  if (c.tabela === "acervo_atestado") return { data: ATESTADOS };
  if (c.tabela === "acervo_quantitativo") {
    const categoria = eqDe(c, "categoria");
    const ids = inDe(c, "atestado_id");
    return {
      data: QUANTS.filter(
        (q) => (!categoria || q.categoria === categoria) && (!ids || ids.includes(q.atestado_id))
      ),
    };
  }
  if (c.tabela === "acervo_profissional") return { data: PROFS };
  return undefined;
}

function montar(
  resp: (c: ChamadaFake) => { data?: unknown } | undefined = responder,
  vinculo = EDITOR
) {
  const { admin, chamadas, storage } = criarFakeAdmin(resp);
  const deps: DepsFerramenta = {
    ctx: {
      autorizacaoId: "00000000-0000-4000-8000-0000000000a1",
      cliente: "Claude",
      usuario: { id: "00000000-0000-4000-8000-0000000000b1", email: "u@exemplo.test", nome: "U" },
      empresa: { id: E, nome: "Empresa Teste", cnpj: null, uf: "MG" },
      vinculo,
      vinculoId: "00000000-0000-4000-8000-0000000000c1",
    },
    db: camadaDaEmpresa(admin, E),
    storage,
    fetchFn: fetch,
    agora: new Date("2026-10-08T12:00:00Z"),
  };
  return { deps, chamadas };
}

const ECONOMICAS = [
  "capital_social",
  "capital_social_data",
  "patrimonio_liquido",
  "pl_data_base",
  "ccl",
  "liquidez_corrente",
  "liquidez_geral",
  "solvencia_geral",
  "endividamento_geral",
  "exercicio_balanco",
  "balanco_registro",
  "faturamento",
  "certidoes",
];

test("defs do §5 (linhas 11 e 12), INSTRUCOES_ACERVO ≤ 800 e o prompt cadastrar_acervo", () => {
  assert.deepEqual(
    FERRAMENTAS_ACERVO.map((f) => [
      f.def.name,
      f.def.inputSchema.required,
      f.def.annotations.readOnlyHint,
      f.def.annotations.idempotentHint,
    ]),
    [
      ["ler_acervo", [], true, true],
      [
        "cadastrar_atestado",
        ["confirmado_pelo_usuario", "tipo", "objeto", "quantitativos"],
        false,
        false,
      ],
    ]
  );
  const props = (FERRAMENTAS_ACERVO[1].def.inputSchema.properties ?? {}) as Record<string, unknown>;
  assert.ok(!("valor" in props) && !("empresa_id" in props));
  const total = INSTRUCOES_ACERVO.reduce((s, l) => s + l.length, 0);
  assert.ok(total <= 800, `INSTRUCOES_ACERVO com ${total}`);
  assert.deepEqual(
    PROMPTS_ACERVO.map((p) => [p.name, p.title, p.arguments]),
    [["cadastrar_acervo", "Cadastrar acervo", []]]
  );
});

test("ler_acervo: nenhum select do perfil ou do atestado pede coluna econômica, certidões, valor ou *", async () => {
  for (const coluna of [...ECONOMICAS, "valor"]) {
    const todas = `${COLUNAS_PERFIL_CONECTOR}, ${COLUNAS_ATESTADO_CONECTOR}`
      .split(",")
      .map((c) => c.trim());
    assert.ok(!todas.includes(coluna), coluna);
  }
  const { deps, chamadas } = montar();
  for (const args of [{}, { categoria: "poste", busca: "cidade" }, { atestado_id: AT1 }]) {
    const r = await ferramenta("ler_acervo").executar(args, deps);
    assert.equal(r.resultado.isError, false);
  }
  const doAcervo = chamadas.filter(
    (c) => c.tabela === "acervo_perfil" || c.tabela === "acervo_atestado"
  );
  assert.ok(doAcervo.some((c) => c.tabela === "acervo_perfil"));
  assert.ok(doAcervo.some((c) => c.tabela === "acervo_atestado" && c.terminal === "maybeSingle"));
  for (const c of doAcervo) {
    const colunas = String(c.colunas)
      .split(",")
      .map((x) => x.trim());
    for (const proibida of [...ECONOMICAS, "valor", "*"]) {
      assert.ok(!colunas.includes(proibida), `${c.tabela} selecionou ${proibida}`);
    }
    assert.equal(eqDe(c, "empresa_id"), E);
  }
});

test("ler_acervo: a saída não tem capital, PL, faturamento, certidões nem o valor do contrato", async () => {
  const { deps } = montar();
  const r = await ferramenta("ler_acervo").executar({}, deps);
  const json = JSON.stringify(sc(r));
  for (const proibido of [
    "1234567.89",
    "1.234.567,89",
    "7654321.01",
    "7.654.321,01",
    "9876543.21",
    "CERTIDAO-SINTETICA",
    "213148.2",
    "JUCEMG",
    '"valor"',
  ]) {
    assert.ok(!json.includes(proibido), `a saída contém ${proibido}`);
  }
  assert.deepEqual(sc(r).perfil, {
    registro_crea_pj: "MG-000001",
    porte: "EPP",
    razao_social_anterior: null,
    cadastros: [{ orgao: "Concessionária", codigo: "C-1", situacao: "ativo" }],
    alertas: [
      "Capital social integralizado de [valor da empresa]",
      "CATs antigas no nome anterior",
    ],
    observacoes: "PL de [valor da empresa] no balanço de 2025",
  });
});

test("ler_acervo: paginação, total e quantitativos só dos atestados da página, em ordem", async () => {
  const { deps, chamadas } = montar();
  const r = await ferramenta("ler_acervo").executar({ por_pagina: 2, pagina: 2 }, deps);
  const s = sc(r);
  assert.equal(s.total_atestados, 3);
  assert.equal(s.pagina, 2);
  assert.equal(s.por_pagina, 2);
  assert.deepEqual(s.categorias, CATEGORIAS_ACERVO);
  const atestados = s.atestados as Record<string, unknown>[];
  assert.deepEqual(
    atestados.map((a) => a.id),
    [AT3]
  );
  assert.deepEqual(atestados[0].quantitativos, [
    {
      categoria: "poste",
      descricao: "Total de postes",
      quantidade: 30,
      unidade: "un",
      especificacao: null,
      na_atividade_tecnica: false,
      observacao: "síntese",
    },
    {
      categoria: "poste",
      descricao: "Postes 9 m",
      quantidade: 10,
      unidade: "un",
      especificacao: "9 m",
      na_atividade_tecnica: false,
      observacao: "detalhe",
    },
  ]);
  const quant = chamadas.find((c) => c.tabela === "acervo_quantitativo")!;
  assert.deepEqual(inDe(quant, "atestado_id"), [AT3]);
  const primeira = await ferramenta("ler_acervo").executar({ por_pagina: 2 }, deps);
  assert.deepEqual(
    (sc(primeira).atestados as { id: string }[]).map((a) => a.id),
    [AT1, AT2]
  );
  assert.deepEqual(s.profissionais, [
    {
      id: PROF,
      nome: "Eng. Sintético",
      registro: "MG-0999001/D",
      titulos: "Eng. Eletricista",
      atribuicoes: "Art. 8º",
      restricoes: null,
      vinculo_desde: "2020-01-01",
      responsavel_tecnico: true,
      ativo: true,
    },
  ]);
});

test("ler_acervo: atestado com tem_pdf, listas do legado em texto e sem colunas fora do §5", async () => {
  const { deps } = montar();
  const r = await ferramenta("ler_acervo").executar({ tipo: "atestados", por_pagina: 2 }, deps);
  const [a1, a2] = sc(r).atestados as Record<string, unknown>[];
  assert.deepEqual(Object.keys(a1), [
    "id",
    "tipo",
    "numero",
    "conselho",
    "art_numero",
    "contratante",
    "objeto",
    "cidade",
    "uf",
    "data_inicio",
    "data_fim",
    "atividades",
    "com_execucao",
    "situacao",
    "profissional_nome",
    "empresa_executora",
    "cobre_arts",
    "riscos",
    "observacoes",
    "tem_pdf",
    "quantitativos",
  ]);
  assert.equal(a1.tem_pdf, true);
  assert.equal(a2.tem_pdf, false);
  assert.deepEqual(a2.atividades, ["projeto"]);
  assert.equal(sc(r).perfil, null);
  assert.deepEqual(sc(r).profissionais, []);
});

test("ler_acervo: categoria = atestados com algum quantitativo dela; busca sem acento por contratante e nº", async () => {
  const { deps, chamadas } = montar();
  const ids = async (args: Record<string, unknown>) =>
    (
      (sc(await ferramenta("ler_acervo").executar(args, deps)).atestados as { id: string }[]) ?? []
    ).map((a) => a.id);
  assert.deepEqual(await ids({ categoria: "poste" }), [AT1, AT3]);
  assert.equal(
    eqDe(chamadas.find((c) => c.tabela === "acervo_quantitativo")!, "categoria"),
    "poste"
  );
  assert.deepEqual(await ids({ categoria: "Rede aérea" }), [AT2]);
  assert.deepEqual(await ids({ busca: "JOANOPOLIS" }), [AT2]);
  assert.deepEqual(await ids({ busca: "3239747" }), [AT1]);
  assert.deepEqual(await ids({ busca: "3.239.747/2025" }), [AT1]);
  assert.deepEqual(await ids({ busca: "prefeitura inexistente" }), []);
});

test("ler_acervo: atestado de outra empresa → nao_encontrado; entradas fora da faixa → validacao", async () => {
  const { deps } = montar();
  const r = await ferramenta("ler_acervo").executar({ atestado_id: AT_OUTRA }, deps);
  assert.equal(r.resultado.isError, true);
  assert.equal(sc(r).motivo, "nao_encontrado");
  assert.equal(r.alvo, AT_OUTRA);
  const v = await ferramenta("ler_acervo").executar(
    { categoria: "iluminacao", por_pagina: 101, pagina: 0, tipo: "obras" },
    deps
  );
  assert.equal(v.resultado.isError, true);
  assert.equal(sc(v).motivo, "validacao");
  assert.deepEqual(sc(v).erros, [
    "tipo: use tudo, atestados, profissionais",
    "pagina: inteiro a partir de 1",
    "por_pagina: inteiro de 1 a 100",
    'categoria: "iluminacao" fora da lista (veja categorias)',
  ]);
});

test("ler_acervo: tipo profissionais traz só os profissionais", async () => {
  const { deps, chamadas } = montar();
  const r = await ferramenta("ler_acervo").executar({ tipo: "profissionais" }, deps);
  assert.equal(sc(r).perfil, null);
  assert.deepEqual(sc(r).atestados, []);
  assert.equal(sc(r).total_atestados, 0);
  assert.equal((sc(r).profissionais as unknown[]).length, 1);
  assert.deepEqual(
    chamadas.map((c) => c.tabela),
    ["acervo_profissional"]
  );
});

const CADASTRO = {
  confirmado_pelo_usuario: true,
  tipo: "cat",
  numero: "CAT nº 3.239.748/2025",
  objeto: "Iluminação pública com LED",
  contratante: "Prefeitura Sintética",
  profissional: { nome: "Eng. Sintético", registro: "MG-0999001/D" },
  quantitativos: [
    { categoria: "poste", descricao: "Postes DT 11 m", quantidade: 30, unidade: "un" },
    {
      categoria: "poste",
      descricao: "Total de postes",
      quantidade: 50,
      unidade: "un",
      sintese: true,
    },
    { categoria: "rede_aerea", descricao: "Rede aérea", quantidade: 2, unidade: "km" },
  ],
};

test("cadastrar_atestado: sem confirmado_pelo_usuario → validacao e nenhuma chamada ao banco", async () => {
  const { deps, chamadas } = montar();
  const { confirmado_pelo_usuario: _, ...semConfirmacao } = CADASTRO;
  const r = await ferramenta("cadastrar_atestado").executar(semConfirmacao, deps);
  assert.equal(r.resultado.isError, true);
  assert.deepEqual(sc(r), {
    erro: "Atestado não gravado: corrija e confirme de novo com o usuário.",
    motivo: "validacao",
    erros: [MSG_SEM_CONFIRMACAO],
  });
  assert.equal(chamadas.length, 0);
});

test("cadastrar_atestado: grava pela RPC com a empresa da camada e uma síntese por categoria", async () => {
  const NOVO = "00000000-0000-4000-8000-000000000070";
  const { deps, chamadas } = montar((c) =>
    c.op === "rpc"
      ? {
          data: {
            ok: true,
            atestado_id: NOVO,
            profissional_id: PROF,
            profissional_criado: false,
            quantitativos: 3,
          },
        }
      : undefined
  );
  const r = await ferramenta("cadastrar_atestado").executar(CADASTRO, deps);
  assert.equal(r.resultado.isError, false);
  assert.equal(r.alvo, NOVO);
  assert.deepEqual(sc(r), {
    criado: true,
    atestado_id: NOVO,
    profissional: { id: PROF, criado: false },
    quantitativos: 3,
    sinteses: [
      { categoria: "poste", quantidade: 50, unidade: "un" },
      { categoria: "rede_aerea", quantidade: 2, unidade: "km" },
    ],
    avisos: [],
    proximo_passo: `Use gerar_link_envio com alvo atestado e atestado_id ${NOVO} para anexar o PDF; depois status_envio (página) ou registrar_arquivos (curl).`,
  });
  assert.equal(chamadas.length, 1);
  const [rpc] = chamadas;
  assert.equal(rpc.tabela, "conector_cadastrar_atestado");
  const p = rpc.payload as Record<string, Record<string, unknown> | Record<string, unknown>[]>;
  assert.equal(p.p_empresa_id, E);
  assert.ok(!("empresa_id" in (p.p_atestado as Record<string, unknown>)));
  assert.ok(!("valor" in (p.p_atestado as Record<string, unknown>)));
  assert.deepEqual(
    (p.p_quantitativos as Record<string, unknown>[]).map((q) => [
      q.categoria,
      q.observacao,
      q.ordem,
    ]),
    [
      ["poste", "detalhe", 1],
      ["poste", "síntese", 2],
      ["rede_aerea", "síntese", 3],
    ]
  );
  assert.deepEqual(p.p_profissional, {
    nome: "Eng. Sintético",
    registro: "MG-0999001/D",
    titulos: null,
  });
});

test("cadastrar_atestado: nº já cadastrado → criado false, sem erro", async () => {
  const { deps } = montar((c) =>
    c.op === "rpc" ? { data: { ok: false, motivo: "duplicado", atestado_id: AT1 } } : undefined
  );
  const r = await ferramenta("cadastrar_atestado").executar(CADASTRO, deps);
  assert.equal(r.resultado.isError, false);
  assert.deepEqual(sc(r), { criado: false, motivo: "duplicado", atestado_id: AT1 });
  assert.equal(r.alvo, AT1);
  assert.equal(r.motivo, "duplicado");
});

test("despacho: valor ou empresa_id no cadastrar_atestado → campos_fora_da_lista e nada roda", async () => {
  const { deps, chamadas } = montar();
  const auditoria: LinhaAuditoria[] = [];
  const r = await despachar(
    "cadastrar_atestado",
    {
      ...CADASTRO,
      valor: 213148.2,
      empresa_id: AT_OUTRA,
      quantitativos: [{ ...CADASTRO.quantitativos[0], empresa_id: AT_OUTRA }],
    },
    {
      ferramentas: FERRAMENTAS_ACERVO,
      deps,
      consumirLimite: async () => ({ permitido: true, chaves: {} }),
      auditar: async (l) => {
        auditoria.push(l);
      },
    }
  );
  assert.equal(r.isError, true);
  // ordem de encontro: o quantitativos fica na posição que já tinha em CADASTRO
  assert.deepEqual((r.structuredContent as Record<string, unknown>).campos, [
    "quantitativos[0].empresa_id",
    "valor",
    "empresa_id",
  ]);
  assert.equal(chamadas.length, 0);
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].resultado, "erro");
  assert.equal(auditoria[0].motivo, "campos_fora_da_lista");
});

test("prompt cadastrar_acervo: todas as ids de categoria, a conferência e o link do PDF", () => {
  const texto = PROMPTS_ACERVO[0].montar({});
  for (const c of CATEGORIAS_ACERVO) assert.ok(texto.includes(`- ${c.id} — ${c.label}`), c.id);
  for (const trecho of [
    "empresa_atual",
    "ler_acervo",
    "na_atividade_tecnica",
    "sintese: true",
    "confirmado_pelo_usuario: true",
    "cadastrar_atestado",
    'gerar_link_envio com alvo "atestado"',
    "status_envio",
    "registrar_arquivos",
  ]) {
    assert.ok(texto.includes(trecho), trecho);
  }
});
