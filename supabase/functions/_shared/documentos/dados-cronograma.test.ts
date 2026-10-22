// node --test supabase/functions/_shared/documentos/dados-cronograma.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarDadosCronograma,
  nomeArquivoCronograma,
  TITULO_CRONOGRAMA,
} from "./dados-cronograma.ts";

test("montarDadosCronograma: prazo, resumo e o mesmo cabeçalho da proposta", () => {
  const d = montarDadosCronograma({
    etapas: [
      { numero: "1", descricao: "Serviços preliminares", centavos: 100000 },
      { numero: "2", descricao: "Rede", centavos: 300000 },
    ],
    cronograma: { meses: 2, pct: { "1": [100, 0], "2": [40, 60] } },
    info: { orgao: "Prefeitura de Exemplo" },
    oportunidade: { nome: "CE 009 Exemplo" },
    empresa: { razao_social: "Empresa Teste Ltda", cidade: "Cidade", estado: "MG" },
    representante: { nome: "Fulana de Tal" },
    opcoes: { local: "Cidade/MG", dataISO: "2026-10-13" },
  });
  assert.equal(d.titulo, TITULO_CRONOGRAMA);
  assert.equal(TITULO_CRONOGRAMA, "Cronograma físico-financeiro");
  assert.equal(d.prazoMeses, 2);
  assert.equal(d.resumo.todasFecham, true);
  assert.deepEqual(
    d.resumo.meses.map((m) => m.centavos),
    [220000, 180000]
  );
  assert.equal(d.resumo.totalCentavos, 400000);
  assert.equal(d.orgao, "Prefeitura de Exemplo");
  assert.equal(d.localData, "Cidade/MG, 13 de outubro de 2026");
});

test("nomeArquivoCronograma", () => {
  assert.equal(
    nomeArquivoCronograma("CE 009 Exemplo", "2026-10-13", "xlsx"),
    "Cronograma - CE 009 Exemplo - 2026-10-13.xlsx"
  );
});
