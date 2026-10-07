import { describe, it, expect } from "vitest";
import {
  decidirAvisoAoRH,
  textoDoDialogoDeAviso,
  textoDeAtraso,
  prepararLoteDeAtrasados,
  idsAvisadosHoje,
  guardarAvisadosHoje,
  classificarEnvio,
  deveInterromperOLote,
  resumirLote,
  rotuloDoMotivoPulado,
  LIMITE_DO_LOTE,
} from "./ead-aviso-matricula";

describe("decidirAvisoAoRH", () => {
  const creds = { usuario: "u", senha_provisoria: "XYZ123" };

  it("enviado pelo canal automático e sem senha nova: só um aviso, sem janela e sem copiar nada", () => {
    const r = decidirAvisoAoRH({ via: "evolution", credenciais: null });
    expect(r.situacao).toBe("enviado");
    expect(r.dialogo).toBe(false);
    expect(r.aviso).toEqual({ tipo: "success", texto: "Aviso enviado pelo WhatsApp" });
  });

  it("senha provisória nova: a janela abre mesmo com o envio automático (a senha aparece só uma vez)", () => {
    const r = decidirAvisoAoRH({ via: "evolution", credenciais: creds });
    expect(r.situacao).toBe("enviado");
    expect(r.temSenha).toBe(true);
    expect(r.dialogo).toBe(true);
  });

  it("WhatsApp aberto para o RH enviar: sem senha nova não precisa de janela", () => {
    const r = decidirAvisoAoRH({ via: "wa.me", credenciais: null });
    expect(r.situacao).toBe("aberto");
    expect(r.dialogo).toBe(false);
    expect(r.aviso).toBeNull();
  });

  it("WhatsApp aberto com senha nova: janela, para a senha não se perder se o RH não enviar", () => {
    const r = decidirAvisoAoRH({ via: "wa.me", credenciais: creds });
    expect(r.dialogo).toBe(true);
  });

  it("sem telefone: nada foi enviado e a janela oferece a mensagem para copiar", () => {
    for (const via of [null, undefined]) {
      const r = decidirAvisoAoRH({ via, credenciais: null });
      expect(r.situacao).toBe("sem_telefone");
      expect(r.dialogo).toBe(true);
    }
  });

  it("telefone inválido: nada foi enviado e a janela oferece a mensagem para copiar", () => {
    const r = decidirAvisoAoRH({ via: "invalido", credenciais: null });
    expect(r.situacao).toBe("telefone_invalido");
    expect(r.dialogo).toBe(true);
  });

  it("credencial sem senha provisória não conta como senha", () => {
    expect(decidirAvisoAoRH({ via: "evolution", credenciais: { usuario: "u" } }).temSenha).toBe(
      false
    );
  });
});

describe("textoDoDialogoDeAviso", () => {
  it("fala da senha só quando ela existe", () => {
    expect(textoDoDialogoDeAviso({ situacao: "enviado", temSenha: true })).toMatch(
      /senha provisória/i
    );
    expect(textoDoDialogoDeAviso({ situacao: "sem_telefone", temSenha: false })).not.toMatch(
      /senha provisória/i
    );
  });

  it("cada situação diz o que aconteceu com a mensagem", () => {
    expect(textoDoDialogoDeAviso({ situacao: "enviado", temSenha: true })).toMatch(/enviada/i);
    expect(textoDoDialogoDeAviso({ situacao: "aberto", temSenha: true })).toMatch(/aberto/i);
    expect(textoDoDialogoDeAviso({ situacao: "sem_telefone", temSenha: true })).toMatch(
      /nada foi enviado/i
    );
    expect(textoDoDialogoDeAviso({ situacao: "telefone_invalido", temSenha: false })).toMatch(
      /inválido/i
    );
  });
});

describe("textoDeAtraso", () => {
  const url = "https://exemplo.test/PortalFuncionario";

  it("um treinamento: singular, com o prazo", () => {
    const t = textoDeAtraso({
      nome: "Ana Maria Souza",
      itens: [{ cursoNome: "NR-10 Básico", limite: "2026-10-01" }],
      urlPortal: url,
    });
    expect(t).toContain("Olá, Ana!");
    expect(t).toContain("1 treinamento atrasado");
    expect(t).toContain("- NR-10 Básico (prazo: 01/10/2026)");
    expect(t).toContain(url);
  });

  it("vários: plural; passando de 8, resume o resto", () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({
      cursoNome: `Curso ${i + 1}`,
      limite: "2026-10-01",
    }));
    const t = textoDeAtraso({ nome: "Beto", itens, urlPortal: url });
    expect(t).toContain("10 treinamentos atrasados");
    expect(t).toContain("- Curso 8 ");
    expect(t).not.toContain("- Curso 9 ");
    expect(t).toContain("e mais 2");
  });

  it("não leva senha nem usuário", () => {
    const t = textoDeAtraso({
      nome: "Beto",
      itens: [{ cursoNome: "X", limite: "2026-10-01" }],
      urlPortal: url,
    });
    expect(t).not.toMatch(/senha provisória/i);
    expect(t).toMatch(/usuário \(CPF\) e a sua senha/);
  });

  it("sem nome ainda cumprimenta", () => {
    expect(
      textoDeAtraso({ nome: "", itens: [{ cursoNome: "X", limite: "2026-10-01" }], urlPortal: url })
    ).toContain("Olá!");
  });
});

describe("prepararLoteDeAtrasados", () => {
  const url = "https://exemplo.test/PortalFuncionario";
  const linha = (id, funcionarioId, extra = {}) => ({
    id,
    funcionarioId,
    atrasada: true,
    cursoNome: `Curso ${id}`,
    prazo: { limite: "2026-10-01", diasDeAtraso: 5 },
    funcionario: {
      id: funcionarioId,
      nome_completo: `Pessoa ${funcionarioId}`,
      telefone: "(38) 99999-9999",
    },
    ...extra,
  });
  const acesso = (funcionario_id, extra = {}) => ({ funcionario_id, ativo: true, ...extra });
  const montar = (linhas, acessos, extra = {}) =>
    prepararLoteDeAtrasados({ linhas, acessos, urlPortal: url, ...extra });

  it("uma mensagem por funcionário, juntando os cursos atrasados dele", () => {
    const r = montar(
      [linha("m1", "f1"), linha("m2", "f1"), linha("m3", "f2")],
      [acesso("f1"), acesso("f2")]
    );
    expect(r.enviar).toHaveLength(2);
    const f1 = r.enviar.find((e) => e.funcionarioId === "f1");
    expect(f1.itens).toHaveLength(2);
    expect(f1.texto).toContain("2 treinamentos atrasados");
    expect(f1.telefone).toBe("(38) 99999-9999");
    expect(r.pulados).toEqual([]);
  });

  it("só entra quem está atrasado", () => {
    const r = montar([linha("m1", "f1", { atrasada: false })], [acesso("f1")]);
    expect(r.enviar).toEqual([]);
    expect(r.pulados).toEqual([]);
  });

  it("pula quem não tem telefone, quem tem telefone inválido, quem não tem acesso e quem está desativado", () => {
    const r = montar(
      [
        linha("m1", "f1", { funcionario: { id: "f1", nome_completo: "A", telefone: "" } }),
        linha("m2", "f2", { funcionario: { id: "f2", nome_completo: "B", telefone: "123" } }),
        linha("m3", "f3"),
        linha("m4", "f4"),
      ],
      [acesso("f1"), acesso("f2"), acesso("f4", { ativo: false })]
    );
    const motivo = (id) => r.pulados.find((p) => p.funcionarioId === id)?.motivo;
    expect(r.enviar).toEqual([]);
    expect(motivo("f1")).toBe("sem_telefone");
    expect(motivo("f2")).toBe("telefone_invalido");
    expect(motivo("f3")).toBe("sem_acesso");
    expect(motivo("f4")).toBe("acesso_desativado");
  });

  it("quem já recebeu o lembrete hoje não recebe de novo", () => {
    const r = montar([linha("m1", "f1"), linha("m2", "f2")], [acesso("f1"), acesso("f2")], {
      avisadosHoje: ["f1"],
    });
    expect(r.enviar.map((e) => e.funcionarioId)).toEqual(["f2"]);
    expect(r.pulados).toEqual([
      expect.objectContaining({ funcionarioId: "f1", motivo: "avisado_hoje" }),
    ]);
  });

  it("acesso bloqueado temporariamente ainda recebe o lembrete", () => {
    const r = montar([linha("m1", "f1")], [acesso("f1", { bloqueado: true })]);
    expect(r.enviar).toHaveLength(1);
  });

  it("sem a lista de acessos não dá para saber quem entra: ninguém é enviado", () => {
    const r = montar([linha("m1", "f1")], null);
    expect(r.enviar).toEqual([]);
    expect(r.pulados[0].motivo).toBe("acesso_desconhecido");
  });

  it("respeita o limite por lote e diz quantos ficaram para depois", () => {
    const linhas = Array.from({ length: 5 }, (_, i) => linha(`m${i}`, `f${i}`));
    const acessos = linhas.map((l) => acesso(l.funcionarioId));
    const r = montar(linhas, acessos, { limite: 3 });
    expect(r.enviar).toHaveLength(3);
    expect(r.excedente).toBe(2);
  });

  it("o limite padrão fica abaixo do teto por hora do canal (60)", () => {
    expect(LIMITE_DO_LOTE).toBeLessThan(60);
    expect(LIMITE_DO_LOTE).toBeGreaterThan(0);
  });

  it("os itens saem do mais antigo para o mais novo", () => {
    const r = montar(
      [
        linha("m1", "f1", { cursoNome: "Novo", prazo: { limite: "2026-10-03", diasDeAtraso: 3 } }),
        linha("m2", "f1", {
          cursoNome: "Antigo",
          prazo: { limite: "2026-09-20", diasDeAtraso: 16 },
        }),
      ],
      [acesso("f1")]
    );
    expect(r.enviar[0].itens.map((i) => i.cursoNome)).toEqual(["Antigo", "Novo"]);
  });
});

describe("idsAvisadosHoje e guardarAvisadosHoje", () => {
  it("lê os ids do dia e esquece os de outro dia", () => {
    const texto = JSON.stringify({ dia: "2026-10-06", ids: ["f1", "f2"] });
    expect(idsAvisadosHoje(texto, "2026-10-06")).toEqual(["f1", "f2"]);
    expect(idsAvisadosHoje(texto, "2026-10-07")).toEqual([]);
  });

  it("texto vazio, quebrado ou de forma errada não derruba: ninguém", () => {
    for (const ruim of [
      null,
      undefined,
      "",
      "{quebrado",
      "[]",
      '{"dia":"2026-10-06"}',
      '{"dia":"2026-10-06","ids":"f1"}',
    ]) {
      expect(idsAvisadosHoje(ruim, "2026-10-06")).toEqual([]);
    }
  });

  it("guarda somando aos de hoje, sem repetir", () => {
    const antes = guardarAvisadosHoje(null, "2026-10-06", ["f1"]);
    const depois = guardarAvisadosHoje(antes, "2026-10-06", ["f1", "f2"]);
    expect(idsAvisadosHoje(depois, "2026-10-06")).toEqual(["f1", "f2"]);
  });

  it("um dia novo começa do zero", () => {
    const ontem = guardarAvisadosHoje(null, "2026-10-05", ["f1"]);
    const hoje = guardarAvisadosHoje(ontem, "2026-10-06", ["f2"]);
    expect(idsAvisadosHoje(hoje, "2026-10-06")).toEqual(["f2"]);
  });
});

describe("classificarEnvio", () => {
  it("resposta sem erro é envio", () => {
    expect(classificarEnvio({ data: { success: true } })).toBe("enviado");
    expect(classificarEnvio({ data: {} })).toBe("enviado");
  });

  it("canal não configurado, limite por hora, serviço fora do ar e falha qualquer", () => {
    expect(classificarEnvio({ data: { success: false, error: "EVOLUTION_NAO_CONFIGURADA" } })).toBe(
      "canal_nao_configurado"
    );
    expect(classificarEnvio({ data: { success: false, error: "x", codigo: "LIMITE" } })).toBe(
      "limite"
    );
    expect(
      classificarEnvio({
        data: { success: false, error: "x" },
        error: { context: { status: 429 } },
      })
    ).toBe("limite");
    expect(
      classificarEnvio({
        data: { success: false, error: "x" },
        error: { context: { status: 503 } },
      })
    ).toBe("indisponivel");
    expect(classificarEnvio({ data: { success: false, error: "Falha no envio" } })).toBe("falhou");
  });

  it("sem resposta nenhuma é falha", () => {
    expect(classificarEnvio(undefined)).toBe("falhou");
    expect(classificarEnvio({})).toBe("falhou");
  });
});

describe("deveInterromperOLote", () => {
  it("para quando o canal não vai aceitar os próximos", () => {
    expect(deveInterromperOLote("limite")).toBe(true);
    expect(deveInterromperOLote("indisponivel")).toBe(true);
    expect(deveInterromperOLote("canal_nao_configurado")).toBe(true);
  });

  it("falha de um envio não pára os outros", () => {
    expect(deveInterromperOLote("falhou")).toBe(false);
    expect(deveInterromperOLote("enviado")).toBe(false);
  });
});

describe("resumirLote", () => {
  it("conta enviados, falhas e o que não chegou a ser tentado", () => {
    const r = resumirLote({
      resultados: [
        { funcionarioId: "f1", nome: "A", classe: "enviado" },
        { funcionarioId: "f2", nome: "B", classe: "falhou" },
        { funcionarioId: "f3", nome: "C", classe: "enviado" },
      ],
      naoTentados: 4,
      interrompidoPor: null,
    });
    expect(r.enviados).toBe(2);
    expect(r.falhas.map((f) => f.nome)).toEqual(["B"]);
    expect(r.naoTentados).toBe(4);
    expect(r.tipo).toBe("warning");
    expect(r.texto).toMatch(/2 de 3/);
  });

  it("tudo enviado é sucesso", () => {
    const r = resumirLote({
      resultados: [{ funcionarioId: "f1", nome: "A", classe: "enviado" }],
      naoTentados: 0,
      interrompidoPor: null,
    });
    expect(r.tipo).toBe("success");
  });

  it("interrompido explica o motivo", () => {
    const r = resumirLote({
      resultados: [{ funcionarioId: "f1", nome: "A", classe: "enviado" }],
      naoTentados: 5,
      interrompidoPor: "limite",
    });
    expect(r.tipo).toBe("warning");
    expect(r.texto).toMatch(/limite/i);
  });
});

describe("rotuloDoMotivoPulado", () => {
  it("cada motivo tem texto de tela", () => {
    for (const m of [
      "sem_telefone",
      "telefone_invalido",
      "sem_acesso",
      "acesso_desativado",
      "acesso_desconhecido",
      "avisado_hoje",
    ]) {
      expect(rotuloDoMotivoPulado(m).length).toBeGreaterThan(5);
    }
    expect(rotuloDoMotivoPulado("sem_acesso")).toMatch(/botão do WhatsApp/);
  });
});
