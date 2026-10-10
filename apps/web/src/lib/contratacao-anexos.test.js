import { describe, it, expect } from "vitest";
import {
  listaDeAnexos,
  juntarAnexos,
  reconciliarAnexos,
  semAnexo,
  comAnexoTrocado,
} from "./contratacao-anexos";

const a = (ref, extra = {}) => ({ ref, nome: ref.split("/").pop(), item: null, ...extra });

describe("listaDeAnexos", () => {
  it("aceita lista, texto JSON do legado e valores vazios", () => {
    expect(listaDeAnexos([a("b/1.pdf")])).toHaveLength(1);
    expect(listaDeAnexos('[{"ref":"b/1.pdf"}]')).toEqual([{ ref: "b/1.pdf" }]);
    expect(listaDeAnexos(null)).toEqual([]);
    expect(listaDeAnexos("não é json")).toEqual([]);
    expect(listaDeAnexos({ ref: "b/1.pdf" })).toEqual([]);
  });
});

describe("juntarAnexos", () => {
  it("acrescenta os novos no fim, sem repetir a mesma ref", () => {
    const atuais = [a("b/1.pdf")];
    expect(juntarAnexos(atuais, [a("b/2.pdf"), a("b/1.pdf")]).map((x) => x.ref)).toEqual([
      "b/1.pdf",
      "b/2.pdf",
    ]);
    expect(atuais).toHaveLength(1);
  });
});

describe("reconciliarAnexos", () => {
  it("o caso real: a IA renomeia um arquivo enquanto outros três entram na lista", () => {
    // a leitura começou com 1 arquivo; quando terminou, a lista do banco já tinha 4
    const antes = [a("b/uuid-ADMISSAO.pdf")];
    const depois = [a("b/NOME_CTPS.pdf", { nome: "NOME_CTPS.pdf", item: "ctps", por_ia: true })];
    const atuais = [a("b/uuid-ADMISSAO.pdf"), a("b/uuid-FICHA.pdf"), a("b/uuid-SINERGIA.pdf")];
    const r = reconciliarAnexos([...atuais, a("b/uuid-RG.jpeg")], antes, depois);
    expect(r.map((x) => x.ref)).toEqual([
      "b/NOME_CTPS.pdf",
      "b/uuid-FICHA.pdf",
      "b/uuid-SINERGIA.pdf",
      "b/uuid-RG.jpeg",
    ]);
    expect(r[0]).toMatchObject({ item: "ctps", por_ia: true, nome: "NOME_CTPS.pdf" });
  });

  it("anexo removido durante a leitura não volta", () => {
    const antes = [a("b/1.pdf"), a("b/2.pdf")];
    const depois = [a("b/1.pdf", { item: "rg_cpf" }), a("b/2.pdf", { item: "ctps" })];
    expect(reconciliarAnexos([a("b/2.pdf")], antes, depois)).toEqual([
      a("b/2.pdf", { item: "ctps" }),
    ]);
  });

  it("sem mudança no banco devolve o resultado do processamento", () => {
    const antes = [a("b/1.pdf")];
    const depois = [a("b/1.pdf", { item: "rg_cpf" })];
    expect(reconciliarAnexos(antes, antes, depois)).toEqual(depois);
  });

  it("listas de tamanhos diferentes não trocam nada (processamento inconsistente)", () => {
    const atuais = [a("b/1.pdf"), a("b/2.pdf")];
    expect(reconciliarAnexos(atuais, [a("b/1.pdf")], [])).toEqual(atuais);
  });
});

describe("semAnexo e comAnexoTrocado", () => {
  it("remove pela ref, não pela posição", () => {
    expect(semAnexo([a("b/1.pdf"), a("b/2.pdf")], "b/1.pdf")).toEqual([a("b/2.pdf")]);
    expect(semAnexo([a("b/1.pdf")], "b/9.pdf")).toEqual([a("b/1.pdf")]);
  });

  it("troca um anexo pela ref e ignora quando ele já saiu da lista", () => {
    const novo = a("b/1.pdf", { item: "ctps" });
    expect(comAnexoTrocado([a("b/1.pdf"), a("b/2.pdf")], "b/1.pdf", novo)).toEqual([
      novo,
      a("b/2.pdf"),
    ]);
    expect(comAnexoTrocado([a("b/2.pdf")], "b/1.pdf", novo)).toEqual([a("b/2.pdf")]);
  });
});
