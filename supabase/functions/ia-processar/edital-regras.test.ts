// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/edital-regras.test.ts
// ou com Deno:                           deno test supabase/functions/ia-processar/edital-regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apelidarAtestados,
  avaliarEconomica,
  categoriaDaExigencia,
  chaveApelido,
  editalPorLote,
  montarAtende,
  motivosFraca,
  parcialFraca,
  sanearEdital,
  semSumario,
  normalizar,
  trocarApelidos,
  type Acervo,
  type AcervoAtestado,
  type AcervoQuantitativo,
} from "./edital-regras.ts";
import type {
  EditalConsolidado,
  ExigenciaOperacional,
  ExigenciaProfissional,
  RespostaTecnica,
} from "./edital-schemas.ts";

// ─── Acervo sintético ───────────────────────────────────────────────────────
// ordem dos apelidos: cat, atestado, cao, cat_profissional (depois "ordem")
//   [AT1] C1 cat 100/2024  postes 300, luminárias 500
//   [AT2] C2 cat 200/2024  postes 250, luminárias 400
//   [AT3] C3 cat 300/2024  SEM execução (só projeto): postes 1000
//   [AT4] T1 atestado s/ CAT: postes 100
//   [AT5] O1 CAO
//   [AT6] P1 CAT profissional (obra de outra empresa): luminárias 3000, postes 800
let ordem = 0;
const at = (id: string, tipo: string, numero: string | null, extra: Partial<AcervoAtestado> = {}) =>
  ({
    id,
    tipo,
    numero,
    contratante: `Contratante ${id}`,
    com_execucao: true,
    situacao: "concluida",
    ordem: ++ordem,
    ...extra,
  }) as AcervoAtestado;
const sint = (atestado_id: string, categoria: string, quantidade: number, unidade = "un") =>
  ({
    atestado_id,
    categoria,
    descricao: categoria,
    quantidade,
    unidade,
    observacao: "síntese",
    na_atividade_tecnica: true,
  }) as AcervoQuantitativo;

const ACERVO: Acervo = {
  perfil: { capital_social: 400000, patrimonio_liquido: 3029384.33, faturamento: [] },
  profissionais: [{ nome: "Eng. Fulano", ativo: true, responsavel_tecnico: true }],
  atestados: [
    at("C1", "cat", "100/2024"),
    at("C2", "cat", "200/2024"),
    at("C3", "cat", "300/2024", { com_execucao: false }),
    at("T1", "atestado", null),
    at("O1", "cao", "CAO-1"),
    at("P1", "cat_profissional", "900/2019"),
  ],
  quantitativos: [
    sint("C1", "poste", 300),
    sint("C1", "luminaria_ip", 500),
    sint("C2", "poste", 250),
    sint("C2", "luminaria_ip", 400),
    sint("C3", "poste", 1000),
    sint("T1", "poste", 100),
    sint("P1", "luminaria_ip", 3000),
    sint("P1", "poste", 800),
  ],
};
const AP = apelidarAtestados(ACERVO.atestados);

const op = (id: string, x: Partial<ExigenciaOperacional>): ExigenciaOperacional => ({
  id,
  descricao: "Execução de serviços de iluminação",
  servico: null,
  quantidade: null,
  unidade: null,
  percentual_minimo: null,
  somatorio_permitido: null,
  exige_execucao: null,
  pagina: 1,
  trecho: null,
  ...x,
});
const pr = (id: string, x: Partial<ExigenciaProfissional> = {}): ExigenciaProfissional => ({
  id,
  descricao: "CAT do engenheiro eletricista em iluminação pública",
  profissional: "engenheiro eletricista",
  servico: null,
  quantidade: null,
  unidade: null,
  pagina: 1,
  trecho: null,
  ...x,
});
const resp = (
  exigencia_id: string,
  status: RespostaTecnica["itens"][number]["status"],
  atestados: string[],
  comprovacao = "comprovado"
) => ({ exigencia_id, status, atestados, comprovacao, justificativa: "IA disse." });

function rodar(
  ed: Omit<Partial<EditalConsolidado>, "habilitacao"> & {
    habilitacao: Partial<EditalConsolidado["habilitacao"]>;
  },
  resposta: Partial<RespostaTecnica>
) {
  const base = sanearEdital({});
  const extraido: EditalConsolidado = {
    ...base,
    ...ed,
    habilitacao: { ...base.habilitacao, ...ed.habilitacao },
  };
  return montarAtende({
    extraido,
    acervo: ACERVO,
    apelidos: AP,
    empresa: { id: "e1", nome: "Teste", uf: "MG" },
    resposta: { itens: [], cats_anexar: [], pendencias: [], riscos: [], ...resposta },
    modelo: "gpt-4o",
    agoraISO: "2026-09-24T12:00:00Z",
    hojeISO: "2026-09-24",
  });
}
const item = (r: ReturnType<typeof rodar>, id: string) =>
  r.itens.find((i) => i.exigencia_id === id)!;
const ids = (r: ReturnType<typeof rodar>, id: string) => item(r, id).atestados.map((a) => a.id);

// ─── 6) apelidos ────────────────────────────────────────────────────────────

test("6 apelidos: formato [ATn], chave tolerante e troca só com colchetes", () => {
  assert.equal(AP.lista[0].alias, "[AT1]");
  assert.equal(AP.aliasDoId.get("P1"), "[AT6]");
  assert.equal(chaveApelido("[AT6]"), "AT6");
  assert.equal(chaveApelido(" at-6 "), "AT6");
  assert.equal(chaveApelido("AT06"), "AT6");
  assert.equal(chaveApelido("A6"), null);
  assert.equal(chaveApelido("Grupo A4"), null);
  assert.equal(
    trocarApelidos("Cadastro Grupo A4 e subgrupo A1; rede AT 138 kV; prova [AT1].", AP),
    "Cadastro Grupo A4 e subgrupo A1; rede AT 138 kV; prova CAT 100/2024."
  );
  assert.equal(
    trocarApelidos("Somando [AT1, AT2] e [AT4 e AT5]", AP),
    "Somando CAT 100/2024, CAT 200/2024 e atestado s/ CAT (Contratante T1), CAO CAO-1"
  );
  assert.equal(trocarApelidos("código inexistente [AT99]", AP), "código inexistente [AT99]");
});

// ─── 1) CAT profissional fora do operacional + recálculo ────────────────────

test("1 CAT profissional sai do operacional; o que sobra é recalculado pelas sínteses", () => {
  const r = rodar(
    {
      habilitacao: {
        tecnica_operacional: [
          // soma permitida: sem P1, C1 = 300 < 500 → verificar
          op("op1", {
            servico: "postes",
            quantidade: 500,
            unidade: "un",
            somatorio_permitido: true,
          }),
          // soma permitida: C1+C2 = 900 ≥ 800 → continua atende
          op("op2", {
            servico: "luminárias LED",
            quantidade: 800,
            unidade: "un",
            somatorio_permitido: true,
          }),
          // somatório vedado: teto 500 < 800 → verificar
          op("op3", {
            servico: "luminárias LED",
            quantidade: 800,
            unidade: "un",
            somatorio_permitido: false,
          }),
          // edital não diz: teto 500 < 800 ≤ soma 900 → ressalva
          op("op4", { servico: "luminárias LED", quantidade: 800, unidade: "un" }),
          // só a CAT profissional → nao_atende
          op("op5", { servico: "luminárias LED", quantidade: 800, unidade: "un" }),
          // categoria ambígua (rede em metros, sem síntese compatível) → verificar
          op("op6", { servico: "rede de distribuição", quantidade: 2, unidade: "km" }),
        ],
      },
    },
    {
      itens: [
        resp("op1", "atende", ["[AT1]", "[AT6]"]),
        resp("op2", "atende", ["[AT1]", "AT2", "[AT6]"]),
        resp("op3", "atende", ["[AT1]", "[AT2]", "[AT6]"]),
        resp("op4", "atende", ["[AT1]", "[AT2]", "[AT6]"]),
        resp("op5", "atende", ["[AT6]"]),
        resp("op6", "atende", ["[AT1]", "[AT6]"]),
      ],
    }
  );
  assert.equal(item(r, "op1").status, "verificar");
  assert.match(item(r, "op1").justificativa, /soma 300 un.*exigido 500 un/);
  assert.match(item(r, "op1").comprovacao!, /desconsiderado pelo sistema: CAT 900\/2019/);
  assert.deepEqual(ids(r, "op1"), ["C1"]);
  assert.equal(item(r, "op2").status, "atende");
  assert.match(item(r, "op2").justificativa, /soma 900 un/);
  assert.equal(item(r, "op3").status, "verificar");
  assert.match(item(r, "op3").justificativa, /somatório vedado/);
  assert.equal(item(r, "op4").status, "ressalva");
  assert.equal(item(r, "op5").status, "nao_atende");
  assert.deepEqual(ids(r, "op5"), []);
  assert.equal(item(r, "op6").status, "verificar");
  assert.match(item(r, "op6").justificativa, /não deu para recalcular/);
});

test("1 cats_anexar: só atestados usados em atende/ressalva após os ajustes", () => {
  const r = rodar(
    {
      habilitacao: {
        tecnica_operacional: [
          op("op1", {
            servico: "luminárias LED",
            quantidade: 800,
            unidade: "un",
            somatorio_permitido: true,
          }),
        ],
        tecnica_profissional: [pr("pr1")],
      },
    },
    {
      itens: [resp("op1", "atende", ["[AT1]", "[AT2]", "[AT6]"]), resp("pr1", "atende", ["[AT6]"])],
      cats_anexar: [
        { atestado: "[AT6]", motivo: "comprova op1 e pr1" }, // tirado do op1 → motivo do sistema
        { atestado: "[AT3]", motivo: "reforço" }, // não usado em item nenhum → fora
        { atestado: "[AT1]", motivo: "luminárias" },
      ],
    }
  );
  const anexar = Object.fromEntries(r.cats_anexar.map((c) => [c.id, c.motivo]));
  assert.deepEqual(Object.keys(anexar).sort(), ["C1", "C2", "P1"]);
  assert.equal(anexar.P1, "Comprova pr1");
  assert.equal(anexar.C1, "luminárias");
  assert.equal(anexar.C2, "Comprova op1");
});

// ─── 2) exige execução ──────────────────────────────────────────────────────

test("2 exige execução: tira CAT sem execução, recalcula; sem nada → nao_atende; edital vago → ressalva", () => {
  const exec = { exige_execucao: true, somatorio_permitido: true, unidade: "un" };
  const r = rodar(
    {
      habilitacao: {
        tecnica_operacional: [
          // C3 (sem execução) sai; C1 = 300 < 500 → verificar
          op("op1", { ...exec, descricao: "Execução de rede com postes", quantidade: 500 }),
          // C3 sai; C1 + C2 = 550 ≥ 500 → atende
          op("op2", { ...exec, descricao: "Execução de rede com postes", quantidade: 500 }),
          // só C3 → nao_atende
          op("op3", { ...exec, descricao: "Execução de rede com postes", quantidade: 500 }),
          // texto não fala em execução → não tira, "ressalva"
          op("op4", {
            ...exec,
            descricao: "Implantação de postes de concreto",
            quantidade: 500,
          }),
        ],
      },
    },
    {
      itens: [
        resp("op1", "atende", ["[AT1]", "[AT3]"]),
        resp("op2", "atende", ["[AT1]", "[AT2]", "[AT3]"]),
        resp("op3", "atende", ["[AT3]"]),
        resp("op4", "atende", ["[AT3]"]),
      ],
    }
  );
  assert.equal(item(r, "op1").status, "verificar");
  assert.deepEqual(ids(r, "op1"), ["C1"]);
  assert.match(item(r, "op1").justificativa, /exige execução e CAT 300\/2024/);
  assert.equal(item(r, "op2").status, "atende");
  assert.equal(item(r, "op3").status, "nao_atende");
  assert.equal(item(r, "op4").status, "ressalva");
  assert.deepEqual(ids(r, "op4"), ["C3"]);
});

// ─── 4) técnico-profissional só com CAT ─────────────────────────────────────

test("4 técnico-profissional: só atestado → ressalva; só CAO → verificar; CAT → atende", () => {
  const r = rodar(
    { habilitacao: { tecnica_profissional: [pr("pr1"), pr("pr2"), pr("pr3"), pr("pr4")] } },
    {
      itens: [
        resp("pr1", "atende", ["[AT4]"]),
        resp("pr2", "atende", ["[AT5]"]),
        resp("pr3", "atende", ["[AT6]"]),
        resp("pr4", "atende", ["[AT5]", "[AT1]"]),
      ],
    }
  );
  assert.equal(item(r, "pr1").status, "ressalva");
  assert.equal(item(r, "pr2").status, "verificar");
  assert.match(item(r, "pr2").justificativa, /CAO comprova o acervo da empresa/);
  assert.equal(item(r, "pr3").status, "atende");
  assert.equal(item(r, "pr4").status, "atende");
});

// ─── 3) parcial fraca ───────────────────────────────────────────────────────

const enchimento = "Cláusula de fornecimento e condições gerais do contrato. ".repeat(40);
const parcialComDados = () => {
  const p = sanearEdital({
    orgao: "Prefeitura de Teste",
    objeto: "Iluminação pública",
    numero_edital: "10/2026",
  });
  return p;
};

test("3 sumário e menção em lista não tornam a parcial fraca", () => {
  const sumario = [
    "SUMÁRIO",
    "8.4 Qualificação técnica ........................ 12",
    "8.5 Qualificação econômico-financeira ........... 13",
    "8.6 Patrimônio líquido e índices de liquidez …………… 14",
  ].join("\n");
  const lista =
    "A habilitação compreende: habilitação jurídica, regularidade fiscal, qualificação técnica e qualificação econômico-financeira, nos termos da lei.";
  assert.deepEqual(motivosFraca(parcialComDados(), `${sumario}\n${enchimento}`, false), []);
  assert.deepEqual(motivosFraca(parcialComDados(), `${lista}\n${enchimento}`, false), []);
  // sumário numa linha só (PDF sem quebras)
  assert.equal(parcialFraca(parcialComDados(), sumario.replace(/\n/g, " "), false), false);
  assert.doesNotMatch(semSumario(normalizar(sumario)), /qualificacao tecnica/);
});

test("3 exigência de verdade continua fraca quando o modelo não extraiu", () => {
  const tecnica =
    "8.4 QUALIFICAÇÃO TÉCNICA: a) Atestado(s) de capacidade técnica em nome da licitante, com CAT, comprovando a parcela de maior relevância: 50% do quantitativo de luminárias.";
  const economica =
    "8.5 A licitante deverá comprovar patrimônio líquido mínimo de 10% do valor estimado e índice de liquidez geral igual ou superior a 1,00.";
  assert.deepEqual(motivosFraca(parcialComDados(), `${tecnica}\n${enchimento}`, false), [
    "tecnica",
  ]);
  assert.deepEqual(motivosFraca(parcialComDados(), `${economica}\n${enchimento}`, false), [
    "economica",
  ]);
  // quase vazia continua valendo
  assert.deepEqual(motivosFraca(sanearEdital({}), enchimento, false), ["quase_vazia"]);
});

test("3 sumário grande não fica lento (300 mil caracteres)", () => {
  const grande = "8.4 Qualificação técnica ........ 12\n".repeat(8000);
  const t0 = Date.now();
  assert.deepEqual(motivosFraca(parcialComDados(), grande, false), []);
  assert.ok(Date.now() - t0 < 1500, `levou ${Date.now() - t0} ms`);
});

// ─── 5) econômico por lote ──────────────────────────────────────────────────

const ec = (x: Partial<Parameters<typeof avaliarEconomica>[0]>) => ({
  id: "ec1",
  tipo: "capital_social" as const,
  valor_minimo: null,
  percentual_do_estimado: null,
  exercicio: null,
  descricao: null,
  pagina: 1,
  trecho: null,
  ...x,
});

test("5 editalPorLote: lotes distintos ou critério por lote/item", () => {
  const it = (lote: string) => ({
    lote,
    item: "1",
    descricao: "x",
    quantidade: 1,
    unidade: "un",
    valor_unitario: 1,
    valor_total: 1,
  });
  assert.equal(editalPorLote({ itens: [it("1"), it("2")], criterio_julgamento: null }), true);
  assert.equal(editalPorLote({ itens: [it("1"), it("1")], criterio_julgamento: null }), false);
  assert.equal(editalPorLote({ itens: [], criterio_julgamento: "Menor preço por lote" }), true);
  assert.equal(editalPorLote({ itens: [], criterio_julgamento: "Menor preço por item" }), true);
  assert.equal(editalPorLote({ itens: [], criterio_julgamento: "Menor preço global" }), false);
});

test("5 capital em % do estimado com vários lotes → verificar com teto por lote", () => {
  const perfil = { capital_social: 400000 };
  // 10% de R$ 10 mi = R$ 1 mi > 400 mil — pelo total seria nao_atende
  const antes = avaliarEconomica(ec({ percentual_do_estimado: 10 }), perfil, 10_000_000);
  assert.equal(antes.status, "nao_atende");
  const lote = avaliarEconomica(ec({ percentual_do_estimado: 10 }), perfil, 10_000_000, {
    porLote: true,
  });
  assert.equal(lote.status, "verificar");
  assert.match(lote.justificativa, /atende a lotes de até R\$\s?4\.000\.000,00/);
  // valor_minimo = 10% × total (conta do modelo) também não vale por lote
  const derivado = avaliarEconomica(
    ec({ percentual_do_estimado: 10, valor_minimo: 1_000_000 }),
    perfil,
    10_000_000,
    { porLote: true }
  );
  assert.equal(derivado.status, "verificar");
  // valor fixado pelo edital (não é a conta do total) continua valendo
  const fixo = avaliarEconomica(
    ec({ percentual_do_estimado: 10, valor_minimo: 300_000 }),
    perfil,
    10_000_000,
    { porLote: true }
  );
  assert.equal(fixo.status, "atende");
  // cobre o % do total → atende qualquer lote
  const folga = avaliarEconomica(ec({ percentual_do_estimado: 10 }), perfil, 3_000_000, {
    porLote: true,
  });
  assert.equal(folga.status, "atende");
});

test("5 montarAtende aplica o por-lote a partir dos itens do edital", () => {
  const itemLote = (lote: string) => ({
    lote,
    item: "1",
    descricao: "Luminária",
    quantidade: 1,
    unidade: "un",
    valor_unitario: 1,
    valor_total: 1,
  });
  const r = rodar(
    {
      valor_estimado: 10_000_000,
      itens: [itemLote("1"), itemLote("2")],
      habilitacao: {
        economica: [ec({ tipo: "patrimonio_liquido", percentual_do_estimado: 40 })],
      },
    },
    {}
  );
  // PL 3.029.384,33 < 40% de 10 mi (4 mi) → por lote: verificar, até ~R$ 7,57 mi
  assert.equal(item(r, "ec1").status, "verificar");
  assert.match(item(r, "ec1").justificativa, /atende a lotes de até R\$\s?7\.573\.460,8\d/);
});

// ─── recálculo: escolha da categoria ────────────────────────────────────────

test("categoriaDaExigencia: palavras da categoria, mais específica, unidade só se específica", () => {
  const cats = ["luminaria_ip", "substituicao_luminaria", "poste"];
  assert.equal(categoriaDaExigencia("luminárias LED", "un", cats), "luminaria_ip");
  assert.equal(
    categoriaDaExigencia("substituição de luminárias", "un", cats),
    "substituicao_luminaria"
  );
  assert.equal(categoriaDaExigencia("postes de concreto", "un", cats), "poste");
  assert.equal(categoriaDaExigencia("transformadores", "un", ["transformador"]), "transformador");
  assert.equal(categoriaDaExigencia("rede de distribuição", "m", ["rede_subterranea"]), null);
  assert.equal(categoriaDaExigencia("subestação", "kVA", ["potencia_kva"]), "potencia_kva");
  assert.equal(categoriaDaExigencia("braços", "un", ["poste"]), null);
});
