import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";

// O teste NUNCA carrega o cliente de produção: o sigoClient criaria o cliente do Supabase com o `.env.local`
// da máquina. O banco aqui é de mentira, em memória, e só sabe LER (select, eq, in, is, order, range): se o
// exportador tentasse gravar, `insert`/`update`/`delete` não existem e o teste falha.
const h = vi.hoisted(() => {
  const estado = { tabelas: {}, consultas: [], erros: {} };

  const passa = (linha, f) => {
    if (f.op === "eq") return linha[f.col] === f.valor;
    if (f.op === "in") return f.valor.includes(linha[f.col]);
    if (f.op === "is") return (linha[f.col] ?? null) === f.valor;
    return true;
  };

  function consulta(tabela) {
    const q = { tabela, filtros: [], colunas: "*", ordem: null };
    const executar = (de, ate) => {
      estado.consultas.push({ ...q, filtros: [...q.filtros], de, ate });
      if (estado.erros[tabela]) return { data: null, error: estado.erros[tabela] };
      const linhas = (estado.tabelas[tabela] ?? [])
        .filter((l) => q.filtros.every((f) => passa(l, f)))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const fatia = de === undefined ? linhas : linhas.slice(de, ate + 1);
      return { data: fatia.map((l) => ({ ...l })), error: null };
    };
    const api = {
      select(colunas) {
        q.colunas = colunas;
        return api;
      },
      eq(col, valor) {
        q.filtros.push({ op: "eq", col, valor });
        return api;
      },
      in(col, valor) {
        q.filtros.push({ op: "in", col, valor });
        return api;
      },
      is(col, valor) {
        q.filtros.push({ op: "is", col, valor });
        return api;
      },
      order(col) {
        q.ordem = col;
        return api;
      },
      range: (de, ate) => Promise.resolve(executar(de, ate)),
      maybeSingle: () => {
        const r = executar();
        return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
      },
    };
    return api;
  }
  return { estado, supabase: { from: (tabela) => consulta(tabela) } };
});

vi.mock("@/api/sigoClient", () => ({
  supabase: h.supabase,
  resolveStorageUrl: vi.fn(async (ref) => `https://arquivos.invalid/${ref}`),
}));
// O PDF do certificado é desenhado por React e jsPDF (precisam de DOM): aqui entra um gerador de mentira.
vi.mock("@/components/seguranca/certificadoParaRH", () => ({
  criarGeradorDeCertificado: () => async (certificado, salvar) => {
    salvar({ output: () => new TextEncoder().encode(`pdf ${certificado.codigo}`).buffer });
    return { faltaram: certificado.codigo === "ABC-123" ? ["instrutor"] : [] };
  },
}));

import { lerDadosDoDossie, exportarDossieDoCurso } from "./exportarDossieEad";

// Dados sintéticos: nenhum nome, CPF, IP ou identificador real.
const EMPRESA = "emp-1";
const OUTRA_EMPRESA = "emp-2";
const CURSO = "c1";
const linhasDe = (tabela) => h.estado.tabelas[tabela];

function popular() {
  h.estado.tabelas = {
    treinamento_curso: [
      {
        id: CURSO,
        empresa_id: EMPRESA,
        nome: "Curso de Teste",
        codigo: "NRT",
        modalidade: "ead",
        projeto_pedagogico_ref: "treinamentos/emp-1/projeto.pdf",
      },
      { id: "c-outro", empresa_id: EMPRESA, nome: "Outro curso" },
    ],
    treinamento_aula: [
      { id: "a1", empresa_id: EMPRESA, curso_id: CURSO, ordem: 1, titulo: "Aula A" },
      {
        id: "a9",
        empresa_id: EMPRESA,
        curso_id: "c-outro",
        ordem: 1,
        titulo: "Aula de outro curso",
      },
    ],
    funcionario: [
      {
        id: "f1",
        empresa_id: EMPRESA,
        nome_completo: "Beatriz Teste",
        cpf: "12345678909",
        salario: 9999,
      },
      { id: "f2", empresa_id: EMPRESA, nome_completo: "Ana Teste", cpf: "00000000000", salario: 1 },
      { id: "f3", empresa_id: EMPRESA, nome_completo: "Quem Não Fez", cpf: "11111111111" },
    ],
    treinamento_matricula: [
      { id: "m1", empresa_id: EMPRESA, curso_id: CURSO, funcionario_id: "f1", status: "concluido" },
      { id: "m2", empresa_id: EMPRESA, curso_id: CURSO, funcionario_id: "f2", status: "pendente" },
      {
        id: "m9",
        empresa_id: EMPRESA,
        curso_id: "c-outro",
        funcionario_id: "f3",
        status: "pendente",
      },
      {
        id: "mx",
        empresa_id: OUTRA_EMPRESA,
        curso_id: CURSO,
        funcionario_id: "fx",
        status: "pendente",
      },
    ],
    treinamento_progresso: [
      { id: 1, empresa_id: EMPRESA, matricula_id: "m1", aula_id: "a1", concluida: true },
      { id: 2, empresa_id: EMPRESA, matricula_id: "m9", aula_id: "a9", concluida: true },
    ],
    treinamento_evento: [
      { id: 1, empresa_id: EMPRESA, funcionario_id: "f1", matricula_id: "m1", evento: "play" },
      { id: 2, empresa_id: EMPRESA, funcionario_id: "f1", matricula_id: null, evento: "login" },
      { id: 3, empresa_id: EMPRESA, funcionario_id: "f3", matricula_id: null, evento: "login" },
      { id: 4, empresa_id: EMPRESA, funcionario_id: "f3", matricula_id: "m9", evento: "play" },
      {
        id: 5,
        empresa_id: OUTRA_EMPRESA,
        funcionario_id: "fx",
        matricula_id: "mx",
        evento: "play",
      },
    ],
    treinamento_tentativa: [
      {
        id: "t1",
        empresa_id: EMPRESA,
        curso_id: CURSO,
        matricula_id: "m1",
        funcionario_id: "f1",
        numero: 1,
      },
      {
        id: "t9",
        empresa_id: EMPRESA,
        curso_id: "c-outro",
        matricula_id: "m9",
        funcionario_id: "f3",
        numero: 1,
      },
    ],
    treinamento_certificado: [
      {
        id: "k1",
        empresa_id: EMPRESA,
        curso_id: CURSO,
        matricula_id: "m1",
        funcionario_id: "f1",
        codigo: "ABC-123",
        dados: { aluno: { nome: "Beatriz Teste" } },
      },
      {
        id: "k2",
        empresa_id: EMPRESA,
        curso_id: CURSO,
        matricula_id: "m2",
        funcionario_id: "f2",
        codigo: "DEF-456",
        dados: { aluno: { nome: "Ana Teste" } },
      },
      {
        id: "k9",
        empresa_id: EMPRESA,
        curso_id: "c-outro",
        matricula_id: "m9",
        funcionario_id: "f3",
        codigo: "ZZZ-999",
      },
    ],
  };
  h.estado.consultas = [];
  h.estado.erros = {};
}

beforeEach(popular);

describe("lerDadosDoDossie: só o que é desta empresa e deste curso", () => {
  it("traz o curso, as matrículas, aulas, tentativas e certificados do curso e nada dos outros", async () => {
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(d.curso.id).toBe(CURSO);
    expect(d.matriculas.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    expect(d.aulas.map((a) => a.id)).toEqual(["a1"]);
    expect(d.tentativas.map((t) => t.id)).toEqual(["t1"]);
    expect(d.certificados.map((c) => c.codigo).sort()).toEqual(["ABC-123", "DEF-456"]);
    expect(d.progresso.map((p) => p.matricula_id)).toEqual(["m1"]);
    expect(d.leituraIncompleta).toEqual([]);
  });

  it("a trilha junta os eventos das matrículas e os acessos ao portal de quem as tem", async () => {
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    // 1 = play da matrícula; 2 = login do f1 (sem matrícula). Fora: login de quem não é do curso (3),
    // evento de outro curso (4) e de outra empresa (5)
    expect(d.eventos.map((e) => e.id).sort()).toEqual([1, 2]);
  });

  it("os funcionários vêm só de quem tem matrícula, sem o salário nem outras colunas", async () => {
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(d.funcionarios.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
    const consulta = h.estado.consultas.find((c) => c.tabela === "funcionario");
    expect(consulta.colunas).not.toMatch(/salario|\*/);
    expect(consulta.colunas).toMatch(/nome_completo/);
    expect(consulta.colunas).toMatch(/cpf/);
  });

  it("TODA consulta é filtrada pela empresa da sessão", async () => {
    await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(h.estado.consultas.length).toBeGreaterThan(8);
    for (const c of h.estado.consultas) {
      expect(
        c.filtros.some((f) => f.op === "eq" && f.col === "empresa_id" && f.valor === EMPRESA),
        `${c.tabela} sem filtro de empresa`
      ).toBe(true);
    }
  });

  it("só lê: nenhuma consulta pede gravação (o banco de mentira nem tem insert, update ou delete)", async () => {
    await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(Object.keys(h.supabase)).toEqual(["from"]);
    const builder = h.supabase.from("treinamento_curso");
    for (const metodo of ["insert", "update", "upsert", "delete"]) {
      expect(builder[metodo]).toBeUndefined();
    }
  });

  it("lê tudo, página por página, quando passa de 1000 linhas", async () => {
    h.estado.tabelas.treinamento_evento = Array.from({ length: 2300 }, (_, i) => ({
      id: i + 1,
      empresa_id: EMPRESA,
      funcionario_id: "f1",
      matricula_id: "m1",
      evento: "play",
    }));
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(d.eventos).toHaveLength(2300);
    expect(d.leituraIncompleta).toEqual([]);
  });

  it("muitas matrículas viram várias consultas pequenas (os ids vão na URL)", async () => {
    h.estado.tabelas.treinamento_matricula = Array.from({ length: 200 }, (_, i) => ({
      id: `m${String(i).padStart(3, "0")}`,
      empresa_id: EMPRESA,
      curso_id: CURSO,
      funcionario_id: `f${String(i).padStart(3, "0")}`,
    }));
    h.estado.tabelas.treinamento_progresso = h.estado.tabelas.treinamento_matricula.map((m, i) => ({
      id: i + 1,
      empresa_id: EMPRESA,
      matricula_id: m.id,
      aula_id: "a1",
    }));
    const d = await lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO });
    expect(d.progresso).toHaveLength(200);
    const lotes = h.estado.consultas
      .filter((c) => c.tabela === "treinamento_progresso")
      .map((c) => c.filtros.find((f) => f.op === "in").valor.length);
    expect(lotes).toEqual([80, 80, 40]);
  });

  it("falha de leitura aborta: nunca sai um dossiê pela metade sem aviso", async () => {
    h.estado.erros.treinamento_tentativa = new Error("sem permissão");
    await expect(lerDadosDoDossie({ empresaId: EMPRESA, cursoId: CURSO })).rejects.toThrow(
      "sem permissão"
    );
  });

  it("curso que não é desta empresa não é encontrado", async () => {
    await expect(lerDadosDoDossie({ empresaId: OUTRA_EMPRESA, cursoId: CURSO })).rejects.toThrow(
      /não encontrado/i
    );
  });

  it("sem empresa ou sem curso não consulta nada", async () => {
    await expect(lerDadosDoDossie({ empresaId: "", cursoId: CURSO })).rejects.toThrow();
    await expect(lerDadosDoDossie({ empresaId: EMPRESA })).rejects.toThrow();
    expect(h.estado.consultas).toEqual([]);
  });
});

describe("exportarDossieDoCurso: lê, monta o ZIP e entrega ao navegador", () => {
  let ancora;
  let blobs;

  beforeEach(() => {
    ancora = { click: vi.fn(), remove: vi.fn() };
    globalThis.document = {
      createElement: vi.fn(() => ancora),
      body: { appendChild: vi.fn() },
    };
    blobs = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob);
      return "blob:teste";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("%PDF").buffer,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.document;
    delete globalThis.fetch;
  });

  const pedido = (extra = {}) => ({
    empresa: { id: EMPRESA, nome: "Empresa Teste Ltda" },
    cursoId: CURSO,
    geradoPor: "rh@teste.invalid",
    ...extra,
  });

  it("baixa um ZIP com projeto, planilhas e um PDF por certificado, e devolve o resumo", async () => {
    const passos = [];
    const resumo = await exportarDossieDoCurso(
      pedido({ aoProgredir: (p) => passos.push(p.etapa) })
    );

    expect(ancora.click).toHaveBeenCalledTimes(1);
    expect(ancora.download).toMatch(/^dossie_ead_NRT_\d{4}-\d{2}-\d{2}\.zip$/);
    expect(ancora.href).toBe("blob:teste");

    const zip = await JSZip.loadAsync(await blobs[0].arrayBuffer());
    const nomes = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .map((n) => n.split("/").slice(1).join("/"))
      .sort();
    expect(nomes).toEqual([
      "LEIA-ME.txt",
      "certificados/Certificado_Ana_Teste_DEF_456.pdf",
      "certificados/Certificado_Beatriz_Teste_ABC_123.pdf",
      "matriculas.csv",
      "projeto-pedagogico.pdf",
      "tentativas.csv",
      "trilha.csv",
    ]);
    expect(resumo.matriculas).toBe(2);
    expect(resumo.eventos).toBe(2);
    expect(resumo.certificados.incluidos).toBe(2);
    expect(resumo.projeto).toBe("incluido");
    // o certificado que saiu sem a imagem da assinatura entra no pacote, e o aviso diz qual
    expect(resumo.avisos.join(" ")).toMatch(/ABC-123 \(sem a imagem da assinatura do instrutor\)/);
    expect(passos[0]).toBe("lendo");
    expect(passos.at(-1)).toBe("compactando");
  });

  it("o projeto é baixado por URL assinada na hora, sem gravar nada", async () => {
    await exportarDossieDoCurso(pedido());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://arquivos.invalid/treinamentos/emp-1/projeto.pdf"
    );
  });

  it("projeto que não baixa vira aviso, e o ZIP sai assim mesmo", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const resumo = await exportarDossieDoCurso(pedido());
    expect(resumo.projeto).toBe("falhou");
    expect(ancora.click).toHaveBeenCalledTimes(1);
  });

  it("a empresa foi trocada no meio: não baixa nada e devolve null", async () => {
    const resumo = await exportarDossieDoCurso(pedido({ aindaVale: () => false }));
    expect(resumo).toBeNull();
    expect(ancora.click).not.toHaveBeenCalled();
  });

  it("erro de leitura sobe para a tela mostrar, sem baixar nada", async () => {
    h.estado.erros.treinamento_matricula = new Error("fora do ar");
    await expect(exportarDossieDoCurso(pedido())).rejects.toThrow("fora do ar");
    expect(ancora.click).not.toHaveBeenCalled();
  });
});
