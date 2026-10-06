import { describe, it, expect } from "vitest";
import {
  OPCOES_MODALIDADE,
  apresentacaoDoRequisito,
  avisoDaModalidade,
  explicacaoDaModalidade,
  rotuloDaModalidade,
  seloDaModalidade,
} from "./ead-modalidade";
import { MODALIDADES, requisitosDoCurso } from "./ead-requisitos";

describe("opções de modalidade da tela do curso", () => {
  it("oferece as três modalidades do banco, EAD primeiro", () => {
    expect(OPCOES_MODALIDADE.map((o) => o.valor)).toEqual(MODALIDADES);
    expect(OPCOES_MODALIDADE[0].valor).toBe("ead");
  });
  it("cada opção tem rótulo e explicação curta", () => {
    for (const o of OPCOES_MODALIDADE) {
      expect(o.rotulo.length).toBeGreaterThan(2);
      expect(o.explicacao.length).toBeGreaterThan(20);
    }
  });
  it("explica o que cada modalidade faz com o certificado", () => {
    expect(explicacaoDaModalidade("ead")).toMatch(/emite certificado/i);
    expect(explicacaoDaModalidade("semipresencial")).toMatch(/prática presencial/i);
    expect(explicacaoDaModalidade("apoio")).toMatch(/não emite certificado/i);
  });
  it("modalidade ausente vale EAD; desconhecida aparece como está", () => {
    expect(rotuloDaModalidade(undefined)).toBe(rotuloDaModalidade("ead"));
    expect(rotuloDaModalidade("")).toBe(rotuloDaModalidade("ead"));
    expect(rotuloDaModalidade("outra")).toBe("outra");
    expect(explicacaoDaModalidade("outra")).toBe("");
  });
});

describe("aviso de NR-35 marcada como EAD", () => {
  it("avisa quando o nome ou o código tem NR-35 e a modalidade é EAD (ou não foi marcada)", () => {
    for (const curso of [
      { nome: "NR-35 Trabalho em Altura" },
      { nome: "Altura", codigo: "NR35" },
      { nome: "nr 35 reciclagem (8h)", modalidade: "ead" },
    ]) {
      expect(avisoDaModalidade(curso)).toMatch(/NR-35/);
      expect(avisoDaModalidade(curso)).toMatch(/presencial/i);
    }
  });
  it("não avisa para apoio ou semipresencial, nem para outros cursos", () => {
    expect(avisoDaModalidade({ nome: "NR-35", modalidade: "apoio" })).toBeNull();
    expect(avisoDaModalidade({ nome: "NR-35", modalidade: "semipresencial" })).toBeNull();
    expect(avisoDaModalidade({ nome: "NR-10 Básico" })).toBeNull();
    expect(avisoDaModalidade({ nome: "NR-350" })).toBeNull();
    expect(avisoDaModalidade({})).toBeNull();
    expect(avisoDaModalidade(null)).toBeNull();
  });
});

describe("aviso de NR-35 sugere só 'Apoio ao presencial' (A5)", () => {
  it("a 35.4.5 exige treinamento presencial: o aviso não manda marcar Semipresencial", () => {
    const aviso = avisoDaModalidade({ nome: "NR-35 Trabalho em Altura" });
    expect(aviso).toMatch(/Apoio ao presencial/);
    expect(aviso).not.toMatch(/semipresencial/i);
    // o rótulo sugerido existe de verdade no seletor
    expect(OPCOES_MODALIDADE.map((o) => o.rotulo)).toContain("Apoio ao presencial");
  });
});

describe("seloDaModalidade: o selo da lista de cursos do RH", () => {
  it("EAD (ou ausente) não tem selo; semipresencial e apoio têm", () => {
    expect(seloDaModalidade("ead")).toBeNull();
    expect(seloDaModalidade(undefined)).toBeNull();
    expect(seloDaModalidade("")).toBeNull();
    expect(seloDaModalidade("semipresencial")?.texto).toBe("Semipresencial");
  });
  it("D3: apoio ganha um selo NEUTRO 'Apoio — sem certificado' (não é pendência)", () => {
    const selo = seloDaModalidade("apoio");
    expect(selo?.texto).toBe("Apoio — sem certificado");
    expect(selo?.tom).toBe("neutro");
    // nada de âmbar/alerta: curso de apoio publicado e matriculável não é "com pendências"
    expect(seloDaModalidade("semipresencial")?.tom).toBe("neutro");
  });
  it("valor desconhecido aparece como está, para o RH ver que há algo estranho", () => {
    expect(seloDaModalidade("outra")?.texto).toBe("outra");
  });
});

describe("apresentacaoDoRequisito: como a lista de requisitos do curso mostra cada pendência", () => {
  it("pendência que trava publicar/matricular: 'Pendente', em alerta", () => {
    expect(apresentacaoDoRequisito({ ok: false, bloqueia: true, bloqueiaEmissao: true })).toEqual({
      prefixo: "Pendente: ",
      tom: "alerta",
    });
  });
  it("só trava a emissão (o motivo do curso de apoio, D3): 'Informação', neutro, sem pedir ação", () => {
    expect(apresentacaoDoRequisito({ ok: false, bloqueia: false, bloqueiaEmissao: true })).toEqual({
      prefixo: "Informação: ",
      tom: "neutro",
    });
  });
  it("requisito de revisão (não bloqueia nada): 'Revisar', neutro", () => {
    expect(apresentacaoDoRequisito({ ok: false, bloqueia: false, bloqueiaEmissao: false })).toEqual(
      { prefixo: "Revisar: ", tom: "neutro" }
    );
  });
  it("com os requisitos de verdade: o apoio completo só mostra a informação, nenhum 'Pendente'", () => {
    const curso = {
      nome: "NR-35 (apoio)",
      modalidade: "apoio",
      carga_horaria_horas: 1,
      instrutor_nome: "Instrutor teste",
      responsavel_tecnico_nome: "RT teste",
    };
    const aulas = [{ tipo: "texto", conteudo_texto: "Texto teste", duracao_seg: 3600 }];
    const questoes = Array.from({ length: 5 }, () => ({}));
    const prefixos = requisitosDoCurso({ curso, aulas, questoes })
      .filter((r) => !r.ok)
      .map((r) => apresentacaoDoRequisito(r).prefixo);
    expect(prefixos).toContain("Informação: ");
    expect(prefixos).not.toContain("Pendente: ");
  });
});
