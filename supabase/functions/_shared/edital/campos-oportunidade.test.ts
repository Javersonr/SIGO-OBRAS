// node --test supabase/functions/_shared/edital/campos-oportunidade.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  camposOportunidadeDoEdital,
  COLUNAS_OPORTUNIDADE_EDITAL,
  dataDoEdital,
  horaDoEdital,
  numeroDoEdital,
  ufDoEdital,
} from "./campos-oportunidade.ts";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/edital-consolidado.json", import.meta.url), "utf8")
);
const variar = (patch: Record<string, unknown>) => ({ ...structuredClone(FIXTURE), ...patch });

test("fixture: resultado exato (datas, horas, UF por nome, R$, visita facultativa, título resumido)", () => {
  assert.deepEqual(camposOportunidadeDoEdital(FIXTURE), {
    nome: "Contratação de empresa especializada para execução de serviços de manutenção e eficientização da iluminação pública…",
    orgao: "Prefeitura Municipal de Cidade Exemplo",
    valor_estimado: 1234567.89,
    licitacao_modalidade: "pregao",
    licitacao_numero: "012/2026",
    licitacao_processo: "PA 045/2026",
    licitacao_portal: "Portal de Compras Exemplo",
    licitacao_forma: "eletronica",
    licitacao_data: "2026-10-15",
    licitacao_horario: "09:30",
    licitacao_data_proposta: "2026-10-15",
    licitacao_horario_proposta: "09:00",
    licitacao_horario_impugnacao: "14:00",
    licitacao_data_esclarecimento: "2026-10-10",
    licitacao_visita_tecnica:
      "Facultativa — 05/10/2026 às 10:00 — Agendar com o setor de licitações",
    licitacao_garantia_proposta: true,
    licitacao_criterio_julgamento: "Menor preço global",
    licitacao_prazo_execucao: "12 meses",
    licitacao_exclusiva_me_epp: false,
    cidade: "Cidade Exemplo",
    estado: "MG",
    endereco: "Rua Exemplo, 100 - Centro",
    descricao:
      "Contratação de empresa especializada para execução de serviços de manutenção e eficientização da iluminação pública, com substituição de luminárias por LED, fornecimento de materiais, mão de obra e equipamentos",
  });
});

test("toda chave da saída está na lista fechada de colunas", () => {
  for (const k of Object.keys(camposOportunidadeDoEdital(FIXTURE))) {
    assert.ok((COLUNAS_OPORTUNIDADE_EDITAL as readonly string[]).includes(k), k);
  }
});

test("datas: DD/MM/AAAA e AAAA-MM-DD; 31/02/2026 é inválida", () => {
  assert.equal(dataDoEdital("15/10/2026"), "2026-10-15");
  assert.equal(dataDoEdital("5/3/2026"), "2026-03-05");
  assert.equal(dataDoEdital("2026-10-15T10:00:00"), "2026-10-15");
  assert.equal(dataDoEdital("31/02/2026"), null);
  assert.equal(dataDoEdital("2026-02-31"), null);
  assert.equal(dataDoEdital("amanhã"), null);
});

test("horas: 9h30, 14:00:00, 10h; 25:00 é inválida", () => {
  assert.equal(horaDoEdital("9h30"), "09:30");
  assert.equal(horaDoEdital("14:00:00"), "14:00");
  assert.equal(horaDoEdital("10h"), "10:00");
  assert.equal(horaDoEdital("8.30"), "08:30");
  assert.equal(horaDoEdital("25:00"), null);
});

test("UF por sigla e por nome; números em formato brasileiro", () => {
  assert.equal(ufDoEdital("minas gerais"), "MG");
  assert.equal(ufDoEdital("São Paulo"), "SP");
  assert.equal(ufDoEdital("sp"), "SP");
  assert.equal(ufDoEdital("Xyz"), null);
  assert.equal(numeroDoEdital("1.234,56"), 1234.56);
  assert.equal(numeroDoEdital("213.148"), 213148);
  assert.equal(numeroDoEdital("R$ 1.234,00"), 1234);
  assert.equal(numeroDoEdital(1234.5), 1234.5);
  assert.equal(numeroDoEdital("abc"), null);
});

test("visita obrigatória; modalidade e forma inválidas ficam de fora", () => {
  const c = camposOportunidadeDoEdital(
    variar({
      modalidade: "leilao",
      forma: "hibrida",
      datas: {
        ...FIXTURE.datas,
        visita_tecnica: { obrigatoria: true, data: "2026-10-06", hora: "14h", descricao: null },
      },
    })
  );
  assert.equal(c.licitacao_visita_tecnica, "Obrigatória — 06/10/2026 às 14:00");
  assert.equal("licitacao_modalidade" in c, false);
  assert.equal("licitacao_forma" in c, false);
});

test("título sugerido curto vence o objeto; vazio, null e lista não quebram", () => {
  const c = camposOportunidadeDoEdital(
    variar({ titulo_sugerido: "  Iluminação LED — Exemplo/MG " })
  );
  assert.equal(c.nome, "Iluminação LED — Exemplo/MG");
  assert.deepEqual(camposOportunidadeDoEdital({}), {});
  assert.deepEqual(camposOportunidadeDoEdital(null), {});
  assert.deepEqual(camposOportunidadeDoEdital([]), {});
  assert.deepEqual(camposOportunidadeDoEdital({ orgao: "   ", local: null, datas: "x" }), {});
});
