/**
 * Paridade da biblioteca de habilitação: a lista de tipos e as contas de validade da tela
 * (habilitacao-documentos.js) são iguais às do servidor
 * (supabase/functions/_shared/habilitacao/documentos-regras.ts).
 */
import { describe, it, expect } from "vitest";
import * as tela from "./habilitacao-documentos";
import * as servidor from "../../../../supabase/functions/_shared/habilitacao/documentos-regras.ts";

describe("paridade tela × servidor", () => {
  it("a tela exporta todo nome que o servidor exporta em tempo de execução", () => {
    const nomes = Object.keys(servidor);
    expect(nomes.length).toBeGreaterThan(0);
    for (const k of nomes) expect(tela, k).toHaveProperty(k);
  });

  it("mesmos tipos, na mesma ordem, com os mesmos campos", () => {
    expect(tela.TIPOS_DOCUMENTO).toEqual(servidor.TIPOS_DOCUMENTO);
    expect(tela.IDS_TIPO_DOCUMENTO).toEqual(servidor.IDS_TIPO_DOCUMENTO);
    expect(tela.TIPOS_ESSENCIAIS).toEqual(servidor.TIPOS_ESSENCIAIS);
    expect(tela.JANELA_VENCE_LOGO_DIAS).toBe(servidor.JANELA_VENCE_LOGO_DIAS);
  });

  it("diasAte, situacaoDaValidade, tipoDocumento, rotuloDoTipo e certidoesDaBiblioteca dão o mesmo", () => {
    const hoje = "2026-10-13";
    const datas = [
      null,
      "",
      "2026-10-12",
      "2026-10-13",
      "2026-10-23T12:00:00Z",
      "2026-11-12",
      "2026-11-13",
      "2026-02-30",
      "x",
    ];
    for (const d of datas) {
      expect(tela.diasAte(d, hoje), String(d)).toEqual(servidor.diasAte(d, hoje));
      expect(tela.situacaoDaValidade(d, hoje), String(d)).toEqual(
        servidor.situacaoDaValidade(d, hoje)
      );
      expect(tela.situacaoDaValidade(d, hoje, 5), `${d} (janela 5)`).toEqual(
        servidor.situacaoDaValidade(d, hoje, 5)
      );
    }
    for (const id of [...servidor.IDS_TIPO_DOCUMENTO, "inventado", null]) {
      expect(tela.tipoDocumento(id), String(id)).toEqual(servidor.tipoDocumento(id));
      expect(tela.rotuloDoTipo(id), String(id)).toBe(servidor.rotuloDoTipo(id));
    }
    const docs = servidor.IDS_TIPO_DOCUMENTO.flatMap((tipo, i) => [
      {
        id: `a${i}`,
        tipo,
        nome: `Nome ${i}`,
        numero: i % 2 ? `N${i}` : null,
        validade: "2026-12-01",
        ativo: true,
      },
      { id: `b${i}`, tipo, nome: `Sem validade ${i}`, ativo: true },
      { id: `c${i}`, tipo, nome: `Inativo ${i}`, validade: "2026-12-01", ativo: false },
      { id: `d${i}`, tipo, nome: `Ativo nulo ${i}`, validade: "2026-12-01", ativo: null },
      { id: `e${i}`, tipo, nome: `Sem a chave ativo ${i}`, validade: "2026-12-01" },
    ]);
    expect(tela.certidoesDaBiblioteca(docs)).toEqual(servidor.certidoesDaBiblioteca(docs));
  });
});
