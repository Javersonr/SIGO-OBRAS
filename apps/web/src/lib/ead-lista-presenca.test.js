import { describe, it, expect } from "vitest";
import {
  desenharListaDePresenca,
  nomeDoArquivoDaLista,
  textosDaListaDePresenca,
} from "./ead-lista-presenca";

// Dados sintéticos (o repositório é público): nenhum nome, CPF ou CNPJ real.
const curso = {
  nome: "Curso Semipresencial de Teste",
  codigo: "CT-1",
  modalidade: "semipresencial",
  carga_horaria_horas: 40,
  carga_teorica_horas: 8,
  carga_pratica_horas: 32,
  responsavel_tecnico_nome: "RT de Teste",
  responsavel_tecnico_registro: "CREA-XX 0000",
};
const sessao = {
  id: "s1",
  data: "2026-10-05",
  hora_inicio: "08:00:00",
  hora_fim: "17:00:00",
  carga_horas: 8,
  local: "Pátio de treinamento de teste",
  instrutor_nome: "Instrutor de Teste",
  instrutor_qualificacao: "Técnico de Teste",
};
const empresa = {
  razao_social: "Empresa de Teste Ltda",
  cnpj: "00000000000000",
  endereco: "Rua de Teste, 1",
};
const participantes = [
  { nome: "Aluno Um de Teste", cpf: "000.000.000-00", funcao: "Eletricista" },
  { nome: "Aluno Dois de Teste", cpf: "", funcao: "" },
];

describe("lista de presença da sessão prática (T12)", () => {
  it("os textos dizem a sessão real: presencial, data, horário, carga, local, instrutor e RT", () => {
    const t = textosDaListaDePresenca({ sessao, curso, empresa });
    expect(t.titulo).toBe("LISTA DE PRESENÇA — TREINAMENTO PRESENCIAL (PARTE PRÁTICA)");
    expect(t.treinamento).toContain("Curso Semipresencial de Teste (CT-1)");
    expect(t.treinamento).toContain("40 h");
    expect(t.treinamento).toContain("teoria a distância: 8 h");
    expect(t.treinamento).toContain("prática presencial: 32 h");
    expect(t.sessao).toBe("Data: 05/10/2026 — Horário: 08:00 às 17:00 — Carga desta sessão: 8 h");
    expect(t.local).toBe("Local: Pátio de treinamento de teste");
    expect(t.instrutor).toBe("Instrutor: Instrutor de Teste — Técnico de Teste");
    expect(t.declaracao).toMatch(/parte prática presencial/);
    expect(t.declaracao).not.toMatch(/EAD/);
    expect(t.assinaturaInstrutor).toBe("Instrutor: Instrutor de Teste");
    expect(t.assinaturaRt).toBe("Responsável técnico: RT de Teste");
    expect(t.registroRt).toBe("CREA-XX 0000");
  });

  it("sem qualificação, sem RT ou sem as cargas: as linhas saem sem o pedaço que falta", () => {
    const t = textosDaListaDePresenca({
      sessao: { ...sessao, instrutor_qualificacao: null },
      curso: {
        ...curso,
        carga_teorica_horas: null,
        responsavel_tecnico_nome: "",
        responsavel_tecnico_registro: null,
      },
      empresa: {},
    });
    expect(t.instrutor).toBe("Instrutor: Instrutor de Teste");
    expect(t.treinamento).not.toContain("teoria a distância");
    expect(t.assinaturaRt).toBe("Responsável técnico");
    expect(t.registroRt).toBeNull();
  });

  it("nome do arquivo: curso e dia da sessão, sem espaço nem barra", () => {
    expect(nomeDoArquivoDaLista(curso, sessao)).toBe(
      "Lista_Presenca_Curso_Semipresencial_de_Teste_05-10-2026.pdf"
    );
  });

  it("o PDF sai com o cabeçalho real e um participante por linha (o jsPDF de verdade)", async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let logoPedido = null;
    desenharListaDePresenca(doc, {
      sessao,
      curso,
      empresa,
      participantes,
      logo: null,
      desenharLogo: (d, logo, y) => {
        logoPedido = { logo, y };
        return y;
      },
    });
    expect(logoPedido).toEqual({ logo: null, y: 10 });
    const texto = doc.output();
    expect(texto).toContain("LISTA DE PRESEN");
    expect(texto).toContain("05/10/2026");
    expect(texto).toContain("08:00 às 17:00");
    expect(texto).toContain("treinamento de teste");
    expect(texto).toContain("Instrutor de Teste");
    expect(texto).toContain("RT de Teste");
    expect(texto).toContain("Aluno Um de Teste");
    expect(texto).toContain("Aluno Dois de Teste");
    expect(texto).toContain("Eletricista");
    // nada da lista antiga do EAD (10 h por dia, horário fixo, "modalidade EAD")
    expect(texto).not.toContain("10h");
    expect(texto).not.toContain("07:00");
    expect(texto).not.toMatch(/modalidade EAD/);
  });

  it("muitos participantes: a lista continua na página seguinte", async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const muitos = Array.from({ length: 40 }, (_, i) => ({
      nome: `Aluno ${i + 1} de Teste`,
      cpf: "",
      funcao: "",
    }));
    desenharListaDePresenca(doc, { sessao, curso, empresa, participantes: muitos, logo: null });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output()).toContain("Aluno 40 de Teste");
  });
});
