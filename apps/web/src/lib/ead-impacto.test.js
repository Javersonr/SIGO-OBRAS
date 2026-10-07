import { describe, it, expect } from "vitest";
import {
  resumirProgressoAula,
  mudouGabarito,
  mudouNotaMinima,
  quantidadeDeMatriculas,
  avisoDeMudanca,
  textoConfirmarRemocaoAula,
} from "./ead-impacto";

const mat = (id, status, curso_id = "c1") => ({ id, status, curso_id });

describe("resumirProgressoAula", () => {
  const matriculas = [
    mat("m1", "em_andamento"),
    mat("m2", "pendente"),
    mat("m3", "concluido"),
    mat("m4", "em_andamento"),
  ];

  it("conta quem tem tempo assistido ou aula concluída, e separa quem já concluiu a aula", () => {
    const progressos = [
      { matricula_id: "m1", segundos_assistidos: 120, concluida: false },
      { matricula_id: "m4", segundos_assistidos: 600, concluida: true },
    ];
    expect(resumirProgressoAula(matriculas, progressos)).toEqual({
      emAndamento: 2,
      comProgresso: 2,
      concluiramAula: 1,
    });
  });

  it("matrícula pendente com tempo assistido na aula também conta", () => {
    const progressos = [{ matricula_id: "m2", segundos_assistidos: 30, concluida: false }];
    expect(resumirProgressoAula(matriculas, progressos).comProgresso).toBe(1);
  });

  it("ignora matrícula já concluída, matrícula que não é da lista e linha zerada", () => {
    const progressos = [
      { matricula_id: "m3", segundos_assistidos: 900, concluida: true }, // curso concluído
      { matricula_id: "apagada", segundos_assistidos: 900, concluida: true }, // matrícula removida
      { matricula_id: "m1", segundos_assistidos: 0, concluida: false }, // sem progresso
    ];
    expect(resumirProgressoAula(matriculas, progressos)).toEqual({
      emAndamento: 2,
      comProgresso: 0,
      concluiramAula: 0,
    });
  });

  it("duas linhas da mesma matrícula contam uma vez", () => {
    const progressos = [
      { matricula_id: "m1", segundos_assistidos: 10, concluida: false },
      { matricula_id: "m1", segundos_assistidos: 20, concluida: true },
    ];
    expect(resumirProgressoAula(matriculas, progressos)).toMatchObject({
      comProgresso: 1,
      concluiramAula: 1,
    });
  });

  it("entradas nulas dão tudo zero", () => {
    expect(resumirProgressoAula(null, null)).toEqual({
      emAndamento: 0,
      comProgresso: 0,
      concluiramAula: 0,
    });
  });
});

describe("mudouGabarito", () => {
  const antes = { correta: 1, opcoes: ["A", "B", "C"] };

  it("mudar a alternativa correta é mudar o gabarito", () => {
    expect(mudouGabarito(antes, { correta: 2, opcoes: ["A", "B", "C"] })).toBe(true);
  });

  it("corrigir o texto da alternativa correta conta", () => {
    expect(mudouGabarito(antes, { correta: 1, opcoes: ["A", "B2", "C"] })).toBe(true);
  });

  it("remover uma alternativa antes da correta desloca o índice e conta", () => {
    expect(mudouGabarito(antes, { correta: 0, opcoes: ["B", "C"] })).toBe(true);
  });

  it("mexer só no enunciado ou numa alternativa errada não muda o gabarito", () => {
    expect(mudouGabarito(antes, { correta: 1, opcoes: ["A!", "B", "C"], pergunta: "novo" })).toBe(
      false
    );
    expect(mudouGabarito(antes, { correta: 1, opcoes: ["A", "B", "C", "D"] })).toBe(false);
  });

  it("sem a questão anterior (questão nova) não há gabarito mudado", () => {
    expect(mudouGabarito(null, { correta: 0, opcoes: ["A", "B"] })).toBe(false);
  });
});

describe("mudouNotaMinima", () => {
  it("compara como número e trata vazio como 70 (padrão do curso)", () => {
    expect(mudouNotaMinima({ nota_minima: 70 }, 80)).toBe(true);
    expect(mudouNotaMinima({ nota_minima: "70" }, 70)).toBe(false);
    expect(mudouNotaMinima({ nota_minima: null }, 70)).toBe(false);
    expect(mudouNotaMinima({}, 75)).toBe(true);
  });

  it("curso novo (sem cadastro anterior) não é mudança", () => {
    expect(mudouNotaMinima(undefined, 90)).toBe(false);
    expect(mudouNotaMinima(null, 90)).toBe(false);
  });
});

describe("quantidadeDeMatriculas", () => {
  it("usa o singular e o plural", () => {
    expect(quantidadeDeMatriculas(1)).toBe("1 matrícula em andamento");
    expect(quantidadeDeMatriculas(3)).toBe("3 matrículas em andamento");
  });
});

describe("avisoDeMudanca", () => {
  it("sem matrícula em andamento não há aviso (gabarito, nota mínima e aula nova)", () => {
    expect(avisoDeMudanca("gabarito", { emAndamento: 0 })).toBeNull();
    expect(avisoDeMudanca("nota_minima", { emAndamento: 0 })).toBeNull();
    expect(avisoDeMudanca("aula_nova", { emAndamento: 0 })).toBeNull();
  });

  it("gabarito: diz quantas matrículas e que notas já registradas não mudam", () => {
    const a = avisoDeMudanca("gabarito", { emAndamento: 4 });
    expect(a.titulo).toMatch(/gabarito/i);
    expect(a.texto).toContain("4 matrículas em andamento");
    expect(a.texto).toMatch(/próximas provas/);
    expect(a.texto).toMatch(/já registradas não mudam/);
    expect(a.rotuloConfirmar).toBeTruthy();
  });

  it("nota mínima: vale para as próximas tentativas", () => {
    const a = avisoDeMudanca("nota_minima", { emAndamento: 1 });
    expect(a.titulo).toMatch(/nota mínima/i);
    expect(a.texto).toContain("1 matrícula em andamento");
    expect(a.texto).toMatch(/próximas tentativas/);
  });

  it("aula nova: entra no fim da trilha e vira exigência para quem não concluiu", () => {
    const a = avisoDeMudanca("aula_nova", { emAndamento: 2 });
    expect(a.texto).toContain("2 matrículas em andamento");
    expect(a.texto).toMatch(/fim da trilha/);
  });

  it("trocar o arquivo: só avisa quando alguém já tem progresso nesta aula", () => {
    expect(avisoDeMudanca("aula_trocar", { emAndamento: 5, comProgresso: 0 })).toBeNull();
    const a = avisoDeMudanca("aula_trocar", {
      emAndamento: 5,
      comProgresso: 3,
      concluiramAula: 1,
      ehVideo: true,
    });
    expect(a.texto).toContain("3 matrículas");
    expect(a.texto).toContain("1 já a concluiu");
    expect(a.texto).toMatch(/duração nova/);
    expect(a.texto).toMatch(/continua com ela concluída/);
  });

  it("mudar a duração: texto próprio de vídeo e de leitura", () => {
    expect(avisoDeMudanca("aula_duracao", { comProgresso: 0 })).toBeNull();
    const video = avisoDeMudanca("aula_duracao", { comProgresso: 2, ehVideo: true });
    expect(video.texto).toMatch(/90%/);
    const leitura = avisoDeMudanca("aula_duracao", { comProgresso: 2, ehVideo: false });
    expect(leitura.texto).toMatch(/tempo mínimo de leitura/);
    expect(leitura.texto).not.toMatch(/90%/);
  });

  it("não cita 'já concluíram' quando ninguém concluiu a aula", () => {
    const a = avisoDeMudanca("aula_trocar", { comProgresso: 2, concluiramAula: 0, ehVideo: true });
    expect(a.texto).not.toMatch(/concluiu|concluíram/);
  });

  it("tipo desconhecido não gera aviso", () => {
    expect(avisoDeMudanca("outra-coisa", { emAndamento: 9, comProgresso: 9 })).toBeNull();
  });
});

describe("textoConfirmarRemocaoAula", () => {
  it("sem ninguém afetado mantém a pergunta simples, com o título da aula", () => {
    const t = textoConfirmarRemocaoAula({ tituloAula: "Riscos elétricos" });
    expect(t).toContain('Remover a aula "Riscos elétricos" deste curso?');
    expect(t).not.toMatch(/progresso/);
  });

  it("com progresso, diz quantas matrículas, quantas concluíram e o que acontece com o tempo", () => {
    const t = textoConfirmarRemocaoAula({
      tituloAula: "Riscos elétricos",
      emAndamento: 6,
      comProgresso: 4,
      concluiramAula: 2,
    });
    expect(t).toContain("4 matrículas já têm progresso nesta aula (2 já a concluíram)");
    expect(t).toContain("6 matrículas em andamento");
    expect(t).toMatch(/registro de auditoria/);
    expect(t).toMatch(/deixa de contar/);
  });

  it("só matrículas em andamento (ninguém tocou na aula) ainda avisa da exigência do curso", () => {
    const t = textoConfirmarRemocaoAula({ tituloAula: "X", emAndamento: 2, comProgresso: 0 });
    expect(t).toContain("2 matrículas em andamento");
    expect(t).not.toMatch(/já têm progresso/);
  });

  it("singular: uma matrícula com progresso", () => {
    const t = textoConfirmarRemocaoAula({
      tituloAula: "X",
      emAndamento: 1,
      comProgresso: 1,
      concluiramAula: 0,
    });
    expect(t).toContain("1 matrícula já tem progresso nesta aula");
  });

  it("aula sem título ainda gera uma pergunta legível", () => {
    expect(textoConfirmarRemocaoAula({})).toContain("Remover esta aula do curso?");
  });
});
