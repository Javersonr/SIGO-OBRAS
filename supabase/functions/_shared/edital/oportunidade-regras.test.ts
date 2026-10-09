// node --test supabase/functions/_shared/edital/oportunidade-regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analiseNova,
  NOME_PADRAO,
  paraApelidos,
  patchDaAnalise,
  planoDeGravacao,
  resumoExigencias,
  validarRespostaTecnica,
} from "./oportunidade-regras.ts";
import { camposOportunidadeDoEdital } from "./campos-oportunidade.ts";
import { apelidarAtestados, renumerarIds, sanearEdital } from "./edital-regras.ts";

const EXTRAIDO = renumerarIds(
  sanearEdital(
    JSON.parse(readFileSync(new URL("./fixtures/edital-consolidado.json", import.meta.url), "utf8"))
  )
);
const CAMPOS = camposOportunidadeDoEdital(EXTRAIDO);
const VINCULO = "00000000-0000-4000-8000-000000000051";
const STATUS = { id: "00000000-0000-4000-8000-000000000061", nome: "Prospecção" };
const AT1 = "00000000-0000-4000-8000-000000000071";
const AT2 = "00000000-0000-4000-8000-000000000072";

test("criar: campos + alertar_prazos + status inicial + responsável; o histórico não leva os internos", () => {
  const p = planoDeGravacao(CAMPOS, null, {
    statusInicial: STATUS,
    vinculoId: VINCULO,
    temAnalise: false,
  });
  assert.equal(p.criar, true);
  assert.equal(p.anteriores, null);
  assert.deepEqual(p.patch, {
    ...CAMPOS,
    alertar_prazos: true,
    responsaveis_ids: [VINCULO],
    status_id: STATUS.id,
    status_nome: "Prospecção",
  });
  assert.deepEqual(p.novos, { ...CAMPOS, alertar_prazos: true });
});

test("criar sem status e sem título: sem status_id e com nome de reserva", () => {
  const p = planoDeGravacao({ licitacao_numero: "012/2026", orgao: "Prefeitura X" }, null, {
    statusInicial: null,
    vinculoId: VINCULO,
    temAnalise: false,
  });
  assert.equal("status_id" in p.patch, false);
  assert.equal(p.patch.nome, "Edital 012/2026 — Prefeitura X");
  const vazio = planoDeGravacao({}, null, {
    statusInicial: null,
    vinculoId: VINCULO,
    temAnalise: false,
  });
  assert.equal(vazio.patch.nome, NOME_PADRAO);
});

test("atualizar: mantém nome e descrição existentes e grava só o que mudou", () => {
  const existente = {
    id: "00000000-0000-4000-8000-000000000011",
    nome: "Título do usuário",
    descricao: "Descrição do usuário",
    orgao: null,
    valor_estimado: "1234567.89", // numeric que volta como texto: igual
    licitacao_data: "2026-10-15",
    licitacao_horario: "9:30", // mesma hora escrita de outro jeito: igual
    estado: "Minas Gerais", // UF por nome: igual
    licitacao_numero: "12/2026", // mudou para 012/2026
    alertar_prazos: true,
  };
  const p = planoDeGravacao(CAMPOS, existente, {
    statusInicial: STATUS,
    vinculoId: VINCULO,
    temAnalise: true,
  });
  assert.equal(p.criar, false);
  assert.equal("nome" in p.patch, false);
  assert.equal("descricao" in p.patch, false);
  for (const k of ["valor_estimado", "licitacao_data", "licitacao_horario", "estado"]) {
    assert.equal(k in p.patch, false, k);
  }
  assert.equal(p.patch.licitacao_numero, "012/2026");
  assert.equal(p.anteriores?.licitacao_numero, "12/2026");
  assert.equal(p.patch.orgao, "Prefeitura Municipal de Cidade Exemplo");
  assert.equal(p.anteriores?.orgao, null);
  assert.equal("status_id" in p.patch, false);
  assert.equal("responsaveis_ids" in p.patch, false);
  assert.deepEqual(p.novos, p.patch);
  // nome vazio na existente: o do edital entra
  const semNome = planoDeGravacao(
    CAMPOS,
    { ...existente, nome: "  " },
    {
      statusInicial: null,
      vinculoId: VINCULO,
      temAnalise: true,
    }
  );
  assert.equal(semNome.patch.nome, CAMPOS.nome);
});

test("alertar_prazos: só liga se ainda não havia análise e se estava desligado", () => {
  const base = { id: "x", alertar_prazos: false };
  const o = { statusInicial: null, vinculoId: VINCULO };
  assert.equal(planoDeGravacao({}, base, { ...o, temAnalise: false }).patch.alertar_prazos, true);
  assert.equal(
    planoDeGravacao({}, base, { ...o, temAnalise: false }).anteriores?.alertar_prazos,
    false
  );
  assert.equal(
    "alertar_prazos" in planoDeGravacao({}, base, { ...o, temAnalise: true }).patch,
    false
  );
  assert.equal(
    "alertar_prazos" in
      planoDeGravacao({}, { ...base, alertar_prazos: true }, { ...o, temAnalise: false }).patch,
    false
  );
});

test("analiseNova e patchDaAnalise: 'via Claude'; a reanálise não leva atende nem arquivos", () => {
  const p = {
    extraido: EXTRAIDO,
    email: "teste@exemplo.com",
    agoraIso: "2026-10-08T12:00:00.000Z",
  };
  assert.deepEqual(analiseNova(p), {
    versao: 1,
    extraido: EXTRAIDO,
    atende: null,
    arquivos: [],
    analisado_em: p.agoraIso,
    analisado_por: "teste@exemplo.com via Claude",
  });
  assert.deepEqual(Object.keys(patchDaAnalise(p)).sort(), [
    "analisado_em",
    "analisado_por",
    "extraido",
    "versao",
  ]);
});

test("resumoExigencias: os ids finais por grupo", () => {
  assert.deepEqual(resumoExigencias(EXTRAIDO), {
    tecnica_operacional: [
      { id: "op1", descricao: "Substituição de luminárias de iluminação pública por LED" },
    ],
    tecnica_profissional: [
      { id: "pr1", descricao: "Engenheiro eletricista com CAT de iluminação pública" },
    ],
    economica: [
      {
        id: "ec1",
        tipo: "patrimonio_liquido",
        descricao: "Patrimônio líquido mínimo de 10% do valor estimado",
      },
    ],
    registros: [{ id: "rg1", tipo: "crea", descricao: "Registro da empresa no CREA" }],
  });
});

const ATESTADOS = new Set([AT1, AT2]);
const ITEM_OK = {
  exigencia_id: "op1",
  status: "atende" as const,
  comprovacao: `CAT ${AT1}: 600 luminárias`,
  atestado_ids: [AT1.toUpperCase(), AT1],
  justificativa: "Atende com folga.",
};

test("validarRespostaTecnica: aceita a resposta certa (UUID em minúsculas, sem repetir)", () => {
  const r = validarRespostaTecnica(
    {
      itens: [ITEM_OK, { exigencia_id: "rg1", status: "ressalva", justificativa: "Confirmar." }],
      cats_anexar: [{ atestado_id: AT1, motivo: "Comprova op1" }],
      pendencias: ["  Juntar contrato  ", 3],
      riscos: [],
    },
    EXTRAIDO,
    ATESTADOS
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.resposta.itens[0].atestado_ids, [AT1]);
  assert.equal(r.resposta.itens[1].comprovacao, null);
  assert.deepEqual(r.resposta.pendencias, ["Juntar contrato"]);
  assert.deepEqual(r.resposta.cats_anexar, [{ atestado_id: AT1, motivo: "Comprova op1" }]);
});

test("validarRespostaTecnica: exigência inexistente, econômica, atestado desconhecido e status inválido", () => {
  const r = validarRespostaTecnica(
    {
      itens: [
        { ...ITEM_OK, exigencia_id: "op9" },
        { ...ITEM_OK, exigencia_id: "ec1" },
        {
          ...ITEM_OK,
          exigencia_id: "pr1",
          atestado_ids: ["00000000-0000-4000-8000-000000000099", "AT1"],
        },
        { ...ITEM_OK, exigencia_id: "rg1", status: "talvez" },
        { ...ITEM_OK, exigencia_id: "op1", justificativa: " " },
      ],
      cats_anexar: [{ atestado_id: "nao-e-uuid", motivo: "x" }],
    },
    EXTRAIDO,
    ATESTADOS
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.exigencias_invalidas, ["op9", "ec1"]);
  assert.deepEqual(r.atestados_invalidos, [
    "00000000-0000-4000-8000-000000000099",
    "AT1",
    "nao-e-uuid",
  ]);
  assert.equal(r.erros.length, 3);
  assert.match(r.erros[0], /ec1 é econômico-financeira/);
  assert.match(r.erros[1], /rg1: status inválido \(talvez\)/);
  assert.match(r.erros[2], /op1: justificativa é obrigatória/);
  assert.equal(validarRespostaTecnica({}, EXTRAIDO, ATESTADOS).ok, false);
});

test("paraApelidos: UUID → [ATn] nas listas e nos textos", () => {
  const ap = apelidarAtestados([
    { id: AT2, tipo: "cat", numero: "2/2025", ordem: 2 },
    { id: AT1, tipo: "cat", numero: "1/2025", ordem: 1 },
  ]);
  const r = paraApelidos(
    {
      itens: [{ ...ITEM_OK, atestado_ids: [AT1, AT2] }],
      cats_anexar: [{ atestado_id: AT2, motivo: `Soma com ${AT1}` }],
      pendencias: [`Conferir a ART do ${AT2}`],
      riscos: [],
    },
    ap
  );
  assert.deepEqual(r, {
    itens: [
      {
        exigencia_id: "op1",
        status: "atende",
        comprovacao: "CAT [AT1]: 600 luminárias",
        atestados: ["[AT1]", "[AT2]"],
        justificativa: "Atende com folga.",
      },
    ],
    cats_anexar: [{ atestado: "[AT2]", motivo: "Soma com [AT1]" }],
    pendencias: ["Conferir a ART do [AT2]"],
    riscos: [],
  });
});
