// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/portal-funcionario/projeto.test.ts
//
// T25 (projeto pedagógico estruturado, NR-1 Anexo II 3.1 e 3.3). A regra pura do que o aluno recebe do projeto
// (`projeto.ts`), a ligação dela no `index.ts` (que não é importável no Node: confere-se pelo TEXTO do código,
// como em `tutor.test.ts`) e a migração `0141_treinamento_curso_projeto_pedagogico.sql`. Só dados fictícios: o
// repositório é público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  MAX_DEDICACAO_DIARIA_MIN,
  MAX_PRAZO_CONCLUSAO_DIAS,
  VERSAO_DA_MARCA,
  camposCanonicosDoProjeto,
  estadoDoPdfDoProjeto,
  marcaDoProjeto,
  projetoParaOAluno,
} from "./projeto.ts";
import {
  VERSAO_DA_MARCA as versaoFront,
  camposCanonicosDoProjeto as camposFront,
  estadoDoPdfDoProjeto as estadoFront,
  marcaDoProjeto as marcaFront,
} from "../../../apps/web/src/lib/ead-projeto-marca.js";

// ------------------------------------------------------------------ o que o aluno recebe
test("projetoParaOAluno: prazo e dedicação diária, inteiros dentro do limite; o resto vira null", () => {
  assert.deepEqual(projetoParaOAluno({ prazo_conclusao_dias: 30, dedicacao_diaria_min: 45 }), {
    prazo_conclusao_dias: 30,
    dedicacao_diaria_min: 45,
  });
  // o limite vale, e um a mais não
  assert.equal(
    projetoParaOAluno({ prazo_conclusao_dias: MAX_PRAZO_CONCLUSAO_DIAS }).prazo_conclusao_dias,
    3650
  );
  assert.equal(
    projetoParaOAluno({ prazo_conclusao_dias: MAX_PRAZO_CONCLUSAO_DIAS + 1 }).prazo_conclusao_dias,
    null
  );
  assert.equal(
    projetoParaOAluno({ dedicacao_diaria_min: MAX_DEDICACAO_DIARIA_MIN }).dedicacao_diaria_min,
    1440
  );
  assert.equal(
    projetoParaOAluno({ dedicacao_diaria_min: MAX_DEDICACAO_DIARIA_MIN + 1 }).dedicacao_diaria_min,
    null
  );
  for (const ruim of [undefined, null, 0, -1, 1.5, "", "  ", "abc", NaN, Infinity, {}, []]) {
    assert.deepEqual(
      projetoParaOAluno({ prazo_conclusao_dias: ruim, dedicacao_diaria_min: ruim }),
      { prazo_conclusao_dias: null, dedicacao_diaria_min: null },
      String(ruim)
    );
  }
  // número como texto (o PostgREST devolve integer como número, mas o dado legado pode vir como texto)
  assert.deepEqual(projetoParaOAluno({ prazo_conclusao_dias: "30", dedicacao_diaria_min: "45" }), {
    prazo_conclusao_dias: 30,
    dedicacao_diaria_min: 45,
  });
  assert.deepEqual(projetoParaOAluno(null), {
    prazo_conclusao_dias: null,
    dedicacao_diaria_min: null,
  });
  assert.deepEqual(projetoParaOAluno(undefined), {
    prazo_conclusao_dias: null,
    dedicacao_diaria_min: null,
  });
});

test("projetoParaOAluno: o texto do projeto e a validação nunca vão ao aluno", () => {
  const curso = {
    prazo_conclusao_dias: 30,
    dedicacao_diaria_min: 45,
    objetivo_geral: "texto",
    principios_sst: "texto",
    estrategia_pedagogica: "texto",
    infraestrutura_apoio: "texto",
    publico_alvo: "texto",
    instrumentos_aprendizagem: "texto",
    modulos_objetivos: [{ modulo: "A", objetivo: "texto" }],
    projeto_validado_em: "2026-10-01",
    projeto_validado_por: "RT Teste",
    proxima_revisao: "2028-10-01",
  };
  assert.deepEqual(Object.keys(projetoParaOAluno(curso)).sort(), [
    "dedicacao_diaria_min",
    "prazo_conclusao_dias",
  ]);
});

// ------------------------------------------------------------------ a marca do PDF do projeto
// Os mesmos valores estão em apps/web/src/lib/ead-projeto-marca.test.js: as duas cópias da regra (front e servidor)
// precisam dar a MESMA marca, senão o requisito do projeto diverge entre a tela do RH e o portal.
const projetoDeTeste = {
  objetivo_geral: "Objetivo de teste",
  principios_sst: "Princípios de teste",
  estrategia_pedagogica: "Estratégia de teste",
  infraestrutura_apoio: "Infraestrutura de teste",
  publico_alvo: "Público de teste",
  instrumentos_aprendizagem: "Instrumentos de teste",
  dedicacao_diaria_min: 30,
  prazo_conclusao_dias: 45,
  modulos_objetivos: [
    { modulo: "Módulo 2", objetivo: "Objetivo do módulo 2" },
    { modulo: "Módulo 1", objetivo: "Objetivo do módulo 1" },
  ],
  projeto_validado_em: "2026-10-01",
  projeto_validado_por: "RT Teste",
  proxima_revisao: "2028-10-01",
};
const PDF = "treinamentos/empresa/2026/10/projeto.pdf";

test("marcaDoProjeto: os valores de referência são os do front e não mudam", () => {
  assert.equal(VERSAO_DA_MARCA, "v1");
  assert.equal(VERSAO_DA_MARCA, versaoFront);
  assert.equal(marcaDoProjeto(projetoDeTeste), "v1:15ea345e713e2a");
  assert.equal(marcaDoProjeto({}), "v1:0c548973284055");
  assert.match(marcaDoProjeto(projetoDeTeste), /^v1:[0-9a-f]{14}$/);
});

test("marcaDoProjeto: servidor e front dão a mesma marca e o mesmo estado do PDF, inclusive nas bordas", () => {
  const casos: Record<string, unknown>[] = [
    {},
    projetoDeTeste,
    { ...projetoDeTeste, objetivo_geral: "  Objetivo de teste \n" },
    { ...projetoDeTeste, dedicacao_diaria_min: "30", prazo_conclusao_dias: " 45 " },
    { ...projetoDeTeste, dedicacao_diaria_min: 1.5, prazo_conclusao_dias: "abc" },
    { ...projetoDeTeste, modulos_objetivos: [...projetoDeTeste.modulos_objetivos].reverse() },
    { ...projetoDeTeste, modulos_objetivos: JSON.stringify(projetoDeTeste.modulos_objetivos) },
    { ...projetoDeTeste, modulos_objetivos: "não é json" },
    { ...projetoDeTeste, modulos_objetivos: null },
    {
      ...projetoDeTeste,
      modulos_objetivos: [
        ...projetoDeTeste.modulos_objetivos,
        { modulo: "Módulo 3", objetivo: "   " },
        { modulo: "Módulo 4" },
        null,
        "texto",
        { modulo: "Módulo 5", objetivo: 7 },
        { modulo: "Árvore", objetivo: "Texto com acento e emoji 🙂" },
      ],
    },
    { ...projetoDeTeste, projeto_validado_em: "2026-10-01T00:00:00", projeto_validado_por: " RT " },
    { ...projetoDeTeste, projeto_validado_em: null, projeto_validado_por: null },
    { ...projetoDeTeste, publico_alvo: "x".repeat(4000) },
  ];
  for (const caso of casos) {
    assert.equal(marcaDoProjeto(caso), marcaFront(caso), JSON.stringify(caso).slice(0, 80));
    assert.deepEqual(camposCanonicosDoProjeto(caso), camposFront(caso));
    for (const extra of [{}, { projeto_pedagogico_ref: PDF }, { projeto_pedagogico_ref: "  " }]) {
      for (const marca of [undefined, "", marcaDoProjeto(caso), "v1:0000000000000a"]) {
        const curso = { ...caso, ...extra, projeto_pdf_marca: marca };
        assert.equal(
          estadoDoPdfDoProjeto(curso),
          estadoFront(curso),
          JSON.stringify(curso).slice(0, 80)
        );
      }
    }
  }
  assert.equal(marcaDoProjeto(null), marcaFront(null));
  assert.equal(estadoDoPdfDoProjeto(null), estadoFront(null));
});

test("estadoDoPdfDoProjeto: sem PDF, atual e desatualizado (PDF gerado antes da validação, texto mudado depois)", () => {
  assert.equal(estadoDoPdfDoProjeto({}), "sem_pdf");
  assert.equal(
    estadoDoPdfDoProjeto({ ...projetoDeTeste, projeto_pedagogico_ref: "  " }),
    "sem_pdf"
  );
  const atual = {
    ...projetoDeTeste,
    projeto_pedagogico_ref: PDF,
    projeto_pdf_marca: marcaDoProjeto(projetoDeTeste),
  };
  assert.equal(estadoDoPdfDoProjeto(atual), "atual");
  // PDF sem marca
  assert.equal(
    estadoDoPdfDoProjeto({ ...projetoDeTeste, projeto_pedagogico_ref: PDF }),
    "desatualizado"
  );
  // o PDF saiu antes da validação; registrar a validação o deixa desatualizado
  const semValidacao = {
    ...projetoDeTeste,
    projeto_validado_em: null,
    projeto_validado_por: null,
    proxima_revisao: null,
  };
  const pdfAnterior = { ...atual, projeto_pdf_marca: marcaDoProjeto(semValidacao) };
  assert.equal(estadoDoPdfDoProjeto(pdfAnterior), "desatualizado");
  // texto mudado depois do PDF
  assert.equal(estadoDoPdfDoProjeto({ ...atual, objetivo_geral: "Mudado" }), "desatualizado");
  // o que o PDF busca em outras partes do curso não conta
  assert.equal(
    estadoDoPdfDoProjeto({ ...atual, nome: "Outro nome", carga_horaria_horas: 99 }),
    "atual"
  );
});

// ------------------------------------------------------------------ o index.ts usa a regra
const codigoDoIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** O trecho de uma ação, do `if (body.acao === "<nome>")` até o próximo `// ----` de seção. */
function trechoDaAcao(nome: string): string {
  const inicio = codigoDoIndex.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada no index.ts`);
  const resto = codigoDoIndex.slice(inicio + 10);
  const proximo = resto.search(
    /\n {4}(?:if \(body\.acao === |\/\/ -{5,}|return fail\("Ação desconhecida")/
  );
  return codigoDoIndex.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

test("index.ts, ação dados: o curso do aluno leva o prazo e a dedicação, e nenhum texto do projeto", () => {
  assert.match(codigoDoIndex, /import \{ projetoParaOAluno \} from "\.\/projeto\.ts"/);
  const acao = trechoDaAcao("dados");
  assert.match(acao, /\.\.\.projetoParaOAluno\(\s*curso\s*\)/);
  for (const coluna of [
    "objetivo_geral",
    "principios_sst",
    "estrategia_pedagogica",
    "infraestrutura_apoio",
    "publico_alvo",
    "instrumentos_aprendizagem",
    "modulos_objetivos",
    "projeto_validado",
    "proxima_revisao",
    "projeto_pdf_marca",
  ]) {
    assert.doesNotMatch(acao, new RegExp(coluna), `${coluna} não pode sair em dados`);
  }
});

// ------------------------------------------------------------------ a migração 0141
const pastaMigracoes = new URL("../../migrations/", import.meta.url);
const arquivos0141 = readdirSync(pastaMigracoes).filter((n) => /^0141_.+\.sql$/.test(n));
const migracao = readFileSync(
  new URL(arquivos0141[0] ?? "0141_ausente.sql", pastaMigracoes),
  "utf8"
);
const sqlMigracao = migracao.replace(/--.*$/gm, "");

test("existe exatamente uma migração 0141, a do projeto pedagógico", () => {
  assert.equal(arquivos0141.length, 1, arquivos0141.join(", "));
  assert.equal(arquivos0141[0], "0141_treinamento_curso_projeto_pedagogico.sql");
});

test("migração 0141: as 12 colunas do projeto mais a marca do PDF, no curso, idempotentes e com o tipo certo", () => {
  assert.match(sqlMigracao, /alter table public\.treinamento_curso\s+add column if not exists/i);
  const colunas: Record<string, string> = {
    objetivo_geral: "text",
    principios_sst: "text",
    estrategia_pedagogica: "text",
    infraestrutura_apoio: "text",
    publico_alvo: "text",
    instrumentos_aprendizagem: "text",
    dedicacao_diaria_min: "integer",
    prazo_conclusao_dias: "integer",
    modulos_objetivos: "jsonb",
    projeto_validado_em: "date",
    projeto_validado_por: "text",
    proxima_revisao: "date",
    projeto_pdf_marca: "text",
  };
  for (const [nome, tipo] of Object.entries(colunas)) {
    assert.match(
      sqlMigracao,
      new RegExp(`add column if not exists ${nome} ${tipo}(,|;)`),
      `${nome} ${tipo}`
    );
    assert.match(
      sqlMigracao,
      new RegExp(`comment on column public\\.treinamento_curso\\.${nome} is`)
    );
  }
  // nenhuma coluna a mais além das 12 do projeto e da marca do PDF (o aluno e o cadastro central não ganham nada)
  assert.equal((sqlMigracao.match(/add column if not exists/gi) || []).length, 13);
  assert.equal(Object.keys(colunas).length, 13);
  assert.doesNotMatch(sqlMigracao, /\btreinamento\b\s*\(|alter table public\.treinamento\s/i);
});

test("migração 0141: os limites repetem os da tela e do servidor, e a restrição é recriada", () => {
  assert.match(sqlMigracao, /char_length\(objetivo_geral\)\s*<=\s*4000/);
  assert.match(sqlMigracao, /char_length\(instrumentos_aprendizagem\)\s*<=\s*4000/);
  assert.match(sqlMigracao, /dedicacao_diaria_min between 1 and 1440/);
  assert.match(sqlMigracao, /prazo_conclusao_dias between 1 and 3650/);
  assert.match(sqlMigracao, /char_length\(projeto_validado_por\)\s*<=\s*120/);
  assert.match(sqlMigracao, /jsonb_typeof\(modulos_objetivos\)\s*=\s*'array'/);
  // quem validou e a data andam juntos; a revisão não vem antes da validação
  assert.match(
    sqlMigracao,
    /\(projeto_validado_em is null\)\s*=\s*\(projeto_validado_por is null\)/
  );
  assert.match(sqlMigracao, /proxima_revisao >= projeto_validado_em/);
  // a marca do PDF cabe com folga ("v1:" e 14 dígitos)
  assert.match(sqlMigracao, /char_length\(projeto_pdf_marca\)\s*<=\s*64/);
  assert.ok(marcaDoProjeto({}).length <= 64);
  for (const trava of [
    "treinamento_curso_projeto_textos_chk",
    "treinamento_curso_dedicacao_diaria_chk",
    "treinamento_curso_prazo_conclusao_chk",
    "treinamento_curso_modulos_objetivos_chk",
    "treinamento_curso_projeto_validado_por_chk",
    "treinamento_curso_projeto_validacao_chk",
    "treinamento_curso_projeto_pdf_marca_chk",
  ]) {
    assert.match(sqlMigracao, new RegExp(`drop constraint if exists ${trava}`, "i"), trava);
    assert.match(sqlMigracao, new RegExp(`add constraint ${trava}`, "i"), trava);
  }
  // o servidor e a tela usam os mesmos números
  assert.equal(MAX_PRAZO_CONCLUSAO_DIAS, 3650);
  assert.equal(MAX_DEDICACAO_DIARIA_MIN, 1440);
  const lib = readFileSync(
    new URL("../../../apps/web/src/lib/ead-projeto.js", import.meta.url),
    "utf8"
  );
  assert.match(lib, /export const LIMITE_TEXTO_PROJETO = 4000;/);
  assert.match(lib, /export const LIMITE_VALIDADO_POR = 120;/);
  assert.match(lib, /export const MAX_DEDICACAO_MIN = 1440;/);
  assert.match(lib, /export const MAX_PRAZO_DIAS = 3650;/);
});

test("migração 0141: transação, sem mexer em dado real, termina em select 'ok' as res;", () => {
  assert.match(sqlMigracao, /^\s*begin;/im);
  assert.match(sqlMigracao, /^\s*commit;/im);
  assert.match(migracao.trimEnd(), /select 'ok' as res;$/);
  // D5: o texto do projeto é do responsável técnico, preenchido pela tela; a migração não grava nada
  assert.doesNotMatch(sqlMigracao, /\bupdate\s+public\./i);
  assert.doesNotMatch(sqlMigracao, /\binsert\s+into\b/i);
  assert.doesNotMatch(sqlMigracao, /\bdelete\s+from\b/i);
});

test("migração 0141: sem UUID, e-mail, telefone, token nem URL (repositório público)", () => {
  assert.doesNotMatch(migracao, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(migracao, /[\w.+-]+@[\w-]+\.[\w.-]+/);
  assert.doesNotMatch(migracao, /https?:\/\//i);
  assert.doesNotMatch(migracao, /\b\d{4,5}-\d{4}\b/);
});
