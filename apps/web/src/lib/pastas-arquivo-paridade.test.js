/**
 * Paridade da pasta "Edital": a tela (pastas-arquivo.js) e o checklist do servidor (checklist.ts) decidem igual
 * se um arquivo é o edital. O upload manual da tela grava só a pasta "Edital", sem categoria.
 */
import { describe, it, expect } from "vitest";
import { mesmaPasta, PASTA_EDITAL, pastaDoArquivo } from "./pastas-arquivo";
import { montarChecklist } from "../../../../supabase/functions/_shared/habilitacao/checklist.ts";

const editalDoServidor = (arquivo) =>
  montarChecklist({
    extraido: null,
    atende: null,
    arquivos: [{ id: "a1", nome: "x.pdf", origem: null, assinatura: null, ...arquivo }],
    documentos: [],
    atestados: [],
    modelos: [],
    hojeISO: "2026-10-13",
  }).edital.arquivos === 1;

describe("pasta Edital: tela × servidor", () => {
  it("sem categoria, o checklist conta o arquivo como edital quando a tela o mostra na pasta Edital", () => {
    const pastas = [
      "Edital",
      " edital ",
      "EDITAL",
      "Édital",
      "Edital   ",
      "Editais",
      "Edital extra",
      "Outros",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "",
      "   ",
      null,
      undefined,
    ];
    for (const pasta of pastas) {
      const arquivo = { pasta, categoria: null };
      expect(editalDoServidor(arquivo), JSON.stringify(pasta)).toBe(
        mesmaPasta(pastaDoArquivo(arquivo), PASTA_EDITAL)
      );
    }
  });

  it("sem pasta gravada, as categorias do edital caem em Edital na tela e no servidor", () => {
    for (const categoria of [
      "edital",
      "termo_referencia",
      "anexo_edital",
      "errata",
      "outro",
      null,
    ]) {
      const arquivo = { pasta: null, categoria };
      expect(editalDoServidor(arquivo), String(categoria)).toBe(
        mesmaPasta(pastaDoArquivo(arquivo), PASTA_EDITAL)
      );
    }
  });
});
