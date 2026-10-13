// node --test supabase/functions/_shared/habilitacao/documentos-regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  certidoesDaBiblioteca,
  diasAte,
  IDS_TIPO_DOCUMENTO,
  JANELA_VENCE_LOGO_DIAS,
  rotuloDoTipo,
  situacaoDaValidade,
  TIPOS_DOCUMENTO,
  TIPOS_ESSENCIAIS,
  tipoDocumento,
} from "./documentos-regras.ts";

test("TIPOS_DOCUMENTO: os 18 ids do contrato, nesta ordem, sem repetir", () => {
  assert.deepEqual(IDS_TIPO_DOCUMENTO, [
    "cnd_federal",
    "cnd_estadual",
    "cnd_municipal",
    "crf_fgts",
    "cndt_trabalhista",
    "certidao_falencia",
    "certidao_crea_pj",
    "certidao_junta",
    "sicaf",
    "contrato_social",
    "cartao_cnpj",
    "inscricao_estadual",
    "inscricao_municipal",
    "balanco_dre",
    "alvara",
    "procuracao",
    "documento_representante",
    "outro",
  ]);
  assert.equal(new Set(IDS_TIPO_DOCUMENTO).size, 18);
  assert.deepEqual(
    TIPOS_DOCUMENTO.map((t) => t.id),
    IDS_TIPO_DOCUMENTO
  );
  assert.deepEqual(TIPOS_ESSENCIAIS, [
    "cnd_federal",
    "cnd_estadual",
    "cnd_municipal",
    "crf_fgts",
    "cndt_trabalhista",
    "certidao_falencia",
    "contrato_social",
    "cartao_cnpj",
  ]);
  assert.deepEqual(
    TIPOS_DOCUMENTO.filter((t) => t.unico).map((t) => t.id),
    [
      "cnd_federal",
      "crf_fgts",
      "cndt_trabalhista",
      "certidao_falencia",
      "certidao_junta",
      "cartao_cnpj",
      "inscricao_estadual",
      "inscricao_municipal",
      "alvara",
    ]
  );
});

test("tipoDocumento e rotuloDoTipo: id desconhecido não quebra", () => {
  assert.equal(tipoDocumento("crf_fgts")?.rotulo, "CRF do FGTS");
  assert.equal(tipoDocumento("CRF_FGTS"), null);
  assert.equal(tipoDocumento(null), null);
  assert.equal(rotuloDoTipo("cnd_federal"), "CND Federal (Receita/PGFN)");
  assert.equal(rotuloDoTipo("inventado"), "Outro");
});

test("diasAte: dias de calendário, sem fuso; data irreal → null", () => {
  assert.equal(diasAte("2026-10-23", "2026-10-13"), 10);
  assert.equal(diasAte("2026-10-13", "2026-10-13"), 0);
  assert.equal(diasAte("2026-10-12", "2026-10-13"), -1);
  assert.equal(diasAte("2027-03-01", "2026-12-31"), 60);
  assert.equal(diasAte("2026-10-23T12:00:00Z", "2026-10-13"), 10);
  assert.equal(diasAte("2026-02-30", "2026-01-01"), null);
  assert.equal(diasAte("", "2026-01-01"), null);
  assert.equal(diasAte(null, "2026-01-01"), null);
  assert.equal(diasAte("2026-10-23", "ontem"), null);
});

test("situacaoDaValidade: vencido antes de hoje; vence_logo de 0 a 30 dias; valido depois", () => {
  assert.equal(JANELA_VENCE_LOGO_DIAS, 30);
  assert.deepEqual(situacaoDaValidade(null, "2026-10-13"), {
    situacao: "sem_validade",
    dias: null,
  });
  assert.deepEqual(situacaoDaValidade("2026-10-12", "2026-10-13"), {
    situacao: "vencido",
    dias: -1,
  });
  assert.deepEqual(situacaoDaValidade("2026-10-13", "2026-10-13"), {
    situacao: "vence_logo",
    dias: 0,
  });
  assert.deepEqual(situacaoDaValidade("2026-11-12", "2026-10-13"), {
    situacao: "vence_logo",
    dias: 30,
  });
  assert.deepEqual(situacaoDaValidade("2026-11-13", "2026-10-13"), {
    situacao: "valido",
    dias: 31,
  });
  assert.deepEqual(situacaoDaValidade("2026-10-20", "2026-10-13", 5), {
    situacao: "valido",
    dias: 7,
  });
});

test("certidoesDaBiblioteca: ativos do grupo certidão e qualquer ativo com validade", () => {
  const docs = [
    {
      id: "1",
      tipo: "crf_fgts",
      nome: "CRF outubro",
      numero: "123",
      validade: "2026-10-28",
      ativo: true,
    },
    { id: "2", tipo: "cnd_municipal", nome: "Sede", validade: "2026-11-10", ativo: true },
    { id: "3", tipo: "cnd_federal", nome: "Antiga", validade: "2026-01-10", ativo: false },
    { id: "4", tipo: "balanco_dre", nome: "Balanço 2025", ativo: true },
    { id: "5", tipo: "alvara", nome: "Alvará 2026", validade: "2026-12-31", ativo: true },
    { id: "6", tipo: "outro", nome: "Seguro garantia", validade: "2027-01-15", ativo: true },
    { id: "7", tipo: "certidao_falencia", nome: "Falência", ativo: true },
  ];
  assert.deepEqual(certidoesDaBiblioteca(docs), [
    { tipo: "CND Municipal — Sede", numero: null, validade: "2026-11-10" },
    { tipo: "CRF do FGTS", numero: "123", validade: "2026-10-28" },
    { tipo: "Certidão de falência e recuperação judicial", numero: null, validade: null },
    { tipo: "Alvará de funcionamento", numero: null, validade: "2026-12-31" },
    { tipo: "Seguro garantia", numero: null, validade: "2027-01-15" },
  ]);
  assert.deepEqual(certidoesDaBiblioteca([]), []);
});
