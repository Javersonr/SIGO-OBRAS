import { describe, it, expect } from "vitest";
import {
  ACEITAR_DOCUMENTO,
  classificarArquivo,
  dadosIniciaisCadastro,
  formatarCpfCnpj,
  listaConferir,
  mesclarDadosIniciais,
  rotuloCampo,
} from "./ler-documento";

const MB = 1024 * 1024;
// o input entrega um File; aqui basta o que a função lê
const arq = (name, type, size = 2048) => ({ name, type, size });

describe("classificarArquivo", () => {
  it("XML é lido no navegador e sobe no bucket nfe-xml, mesmo sem tipo", () => {
    expect(classificarArquivo(arq("nota.xml", ""))).toEqual({
      ok: true,
      modo: "xml",
      bucket: "nfe-xml",
      mimeType: "text/xml",
      nomeArquivo: "nota.xml",
    });
    expect(classificarArquivo(arq("35260911.XML", "application/xml"))).toMatchObject({
      ok: true,
      modo: "xml",
      mimeType: "application/xml",
      nomeArquivo: "35260911.XML",
    });
  });

  it("PDF e foto vão para a IA pelo bucket comprovantes", () => {
    expect(classificarArquivo(arq("danfe.pdf", "application/pdf"))).toEqual({
      ok: true,
      modo: "ia",
      bucket: "comprovantes",
      mimeType: "application/pdf",
      nomeArquivo: "danfe.pdf",
    });
    expect(classificarArquivo(arq("recibo.JPG", ""))).toMatchObject({
      ok: true,
      modo: "ia",
      mimeType: "image/jpeg",
      nomeArquivo: "recibo.JPG",
    });
    expect(classificarArquivo(arq("boleto.webp", "image/webp"))).toMatchObject({
      ok: true,
      mimeType: "image/webp",
    });
  });

  it("extensão que a ia-processar não aceita ganha a do tipo", () => {
    expect(classificarArquivo(arq("foto.jfif", "image/jpeg"))).toMatchObject({
      ok: true,
      mimeType: "image/jpeg",
      nomeArquivo: "foto.jfif.jpg",
    });
    expect(classificarArquivo(arq("captura", "image/png"))).toMatchObject({
      ok: true,
      nomeArquivo: "captura.png",
    });
  });

  it("HEIC é recusado pedindo JPEG", () => {
    expect(classificarArquivo(arq("IMG_0001.HEIC", "")).erro).toMatch(/HEIC.*JPEG/);
    expect(classificarArquivo(arq("foto", "image/heif")).ok).toBe(false);
  });

  it("formato fora da lista, arquivo vazio ou grande demais → erro", () => {
    expect(classificarArquivo(arq("planilha.xlsx", "application/vnd.ms-excel"))).toEqual({
      ok: false,
      erro: "Formato não aceito — envie XML, PDF, JPG, PNG ou WEBP.",
    });
    expect(classificarArquivo(arq("vazio.pdf", "application/pdf", 0))).toEqual({
      ok: false,
      erro: "O arquivo está vazio.",
    });
    expect(classificarArquivo(arq("grande.pdf", "application/pdf", 11 * MB))).toEqual({
      ok: false,
      erro: "Arquivo grande demais (11,0 MB) — o limite é 10 MB.",
    });
    expect(classificarArquivo(arq("grande.xml", "text/xml", 6 * MB)).erro).toBe(
      "Arquivo grande demais (6,0 MB) — o limite é 5 MB."
    );
    expect(classificarArquivo(null)).toEqual({ ok: false, erro: "Nenhum arquivo escolhido." });
  });

  it("o accept do input segue a spec", () => {
    expect(ACEITAR_DOCUMENTO).toBe(".xml,application/pdf,image/jpeg,image/png,image/webp");
  });
});

describe("listaConferir", () => {
  it("campos duvidosos viram rótulos sem repetir; avisos sem vazios nem repetidos", () => {
    expect(
      listaConferir(
        [
          "valor_total",
          "emitente.documento",
          "vencimentos[1].data",
          "vencimentos.0.valor",
          "valor_total",
        ],
        ["Soma dos vencimentos difere do total.", " ", "Soma dos vencimentos difere do total."]
      )
    ).toEqual({
      campos: ["Valor", "CNPJ/CPF do emitente", "Vencimentos"],
      avisos: ["Soma dos vencimentos difere do total."],
    });
  });

  it("nada a conferir → listas vazias", () => {
    expect(listaConferir(undefined, null)).toEqual({ campos: [], avisos: [] });
  });

  it("campo desconhecido aparece como veio; subcampo desconhecido cai no grupo", () => {
    expect(rotuloCampo("placa_veiculo")).toBe("placa_veiculo");
    expect(rotuloCampo("emitente.cep")).toBe("Emitente");
    expect(rotuloCampo("itens.3.quantidade")).toBe("Itens");
    expect(rotuloCampo("  ")).toBe("");
  });
});

describe("cadastro rápido da pessoa lida", () => {
  it("formatarCpfCnpj formata 14 e 11 dígitos; o resto fica como veio", () => {
    expect(formatarCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCpfCnpj("12345678909")).toBe("123.456.789-09");
    expect(formatarCpfCnpj("123")).toBe("123");
    expect(formatarCpfCnpj(null)).toBe("");
  });

  it("dadosIniciaisCadastro monta a prop do fornecedor (cnpj) e do cliente (documento)", () => {
    const pessoa = {
      nome: "ELETRICA M&M LTDA",
      documento: "11222333000181",
      endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
    };
    expect(dadosIniciaisCadastro(pessoa, "cnpj")).toEqual({
      nome_razao: "ELETRICA M&M LTDA",
      cnpj: "11.222.333/0001-81",
      endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
    });
    expect(
      dadosIniciaisCadastro(
        { nome: "JOSE DA SILVA", documento: "12345678909", endereco: null },
        "documento"
      )
    ).toEqual({ nome_razao: "JOSE DA SILVA", documento: "123.456.789-09", endereco: "" });
    expect(dadosIniciaisCadastro(null, "cnpj")).toBeNull();
  });

  it("mesclarDadosIniciais preenche só campos do formulário, com o tipo pelos dígitos", () => {
    const vazio = { nome_razao: "", tipo_pessoa: "PJ", cnpj: "", endereco: "", cidade: "" };
    expect(
      mesclarDadosIniciais(
        vazio,
        { nome_razao: " JOSE DA SILVA ", cnpj: "123.456.789-09", endereco: "", extra: "x" },
        "cnpj"
      )
    ).toEqual({
      nome_razao: "JOSE DA SILVA",
      tipo_pessoa: "PF",
      cnpj: "123.456.789-09",
      endereco: "",
      cidade: "",
    });
    expect(mesclarDadosIniciais(vazio, null, "cnpj")).toEqual(vazio);
    expect(mesclarDadosIniciais(vazio, null, "cnpj")).not.toBe(vazio);
    expect(
      mesclarDadosIniciais({ ...vazio, tipo_pessoa: "PF" }, { cnpj: "11.222.333/0001-81" }, "cnpj")
        .tipo_pessoa
    ).toBe("PJ");
  });
});
