import { describe, it, expect } from "vitest";
import {
  VALIDADE_PROVISORIA_DIAS as VALIDADE_NO_SERVIDOR,
  statusDoVinculo,
} from "../../../../supabase/functions/_shared/portal-credencial.ts";
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
  dicaDoAvisoDaLinha,
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

  it("primeiro acesso pendente (A6): não manda 'entre com a sua senha', e sim a provisória que o RH passou", () => {
    const t = textoDeAtraso({
      nome: "Beto",
      itens: [{ cursoNome: "X", limite: "2026-10-01" }],
      urlPortal: url,
      primeiroAcessoPendente: true,
    });
    expect(t).not.toMatch(/e a sua senha/);
    expect(t).toMatch(/senha provisória/);
    expect(t).toMatch(/cria a sua senha/);
    expect(t).toMatch(/fale com o RH/);
    // ainda não leva a senha nem o usuário, só orienta
    expect(t).not.toMatch(/\d{6}/);
    expect(t).toContain(url);
  });

  it("primeiro acesso pendente (T38, P3): diz que a provisória vale 7 dias, como a do servidor, e o que fazer se venceu", () => {
    const t = textoDeAtraso({
      nome: "Beto",
      itens: [{ cursoNome: "X", limite: "2026-10-01" }],
      urlPortal: url,
      primeiroAcessoPendente: true,
    });
    expect(VALIDADE_NO_SERVIDOR).toBe(7);
    expect(t).toContain(`vale por ${VALIDADE_NO_SERVIDOR} dias`);
    expect(t).toMatch(/venceu.*fale com o RH/);
  });

  it("texto comum (T38): quem não consegue entrar é mandado ao RH, sem falar em senha provisória", () => {
    const t = textoDeAtraso({
      nome: "Beto",
      itens: [{ cursoNome: "X", limite: "2026-10-01" }],
      urlPortal: url,
    });
    expect(t).toMatch(/usuário \(CPF\) e a sua senha\. Se não conseguir entrar, fale com o RH\.$/);
    expect(t).not.toMatch(/senha provisória/);
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

  it("primeiro acesso pendente (A6): ainda recebe, com o texto da senha provisória", () => {
    const r = montar(
      [linha("m1", "f1"), linha("m2", "f2")],
      [
        acesso("f1", { primeiro_acesso_pendente: true }),
        acesso("f2", { primeiro_acesso_pendente: false }),
      ]
    );
    const f1 = r.enviar.find((e) => e.funcionarioId === "f1");
    const f2 = r.enviar.find((e) => e.funcionarioId === "f2");
    expect(f1.texto).toMatch(/senha provisória/);
    expect(f1.texto).not.toMatch(/e a sua senha/);
    expect(f1.primeiroAcessoPendente).toBe(true);
    expect(f2.texto).toMatch(/usuário \(CPF\) e a sua senha/);
    expect(f2.texto).not.toMatch(/senha provisória/);
    expect(f2.primeiroAcessoPendente).toBe(false);
  });

  it("curso despublicado (A6): o aluno não consegue fazê-lo, então não entra no lembrete", () => {
    const r = montar(
      [
        linha("m1", "f1", { cursoNome: "Publicado", curso: { id: "c1", ativo: true } }),
        linha("m2", "f1", { cursoNome: "Despublicado", curso: { id: "c2", ativo: false } }),
        // só tem atraso em curso despublicado: nem recebe nem aparece como "de fora"
        linha("m3", "f2", { cursoNome: "Despublicado", curso: { id: "c2", ativo: false } }),
      ],
      [acesso("f1"), acesso("f2")]
    );
    expect(r.enviar.map((e) => e.funcionarioId)).toEqual(["f1"]);
    expect(r.enviar[0].itens.map((i) => i.cursoNome)).toEqual(["Publicado"]);
    expect(r.enviar[0].texto).toContain("1 treinamento atrasado");
    expect(r.enviar[0].texto).not.toContain("Despublicado");
    expect(r.pulados).toEqual([]);
    // quantas matrículas ficaram fora por isso, para a tela dizer
    expect(r.despublicados).toBe(2);
  });

  it("curso sem o campo 'ativo' (ou curso ausente na linha) conta como publicado", () => {
    const r = montar(
      [linha("m1", "f1", { curso: {} }), linha("m2", "f2", { curso: undefined })],
      [acesso("f1"), acesso("f2")]
    );
    expect(r.enviar).toHaveLength(2);
    expect(r.despublicados).toBe(0);
  });

  it("T38: acesso que precisa de nova senha provisória não recebe o lembrete e aparece entre os de fora", () => {
    const r = montar(
      [linha("m1", "f1"), linha("m2", "f2"), linha("m3", "f3")],
      [
        acesso("f1", { precisa_provisoria: true, primeiro_acesso_pendente: false }),
        acesso("f2", { precisa_provisoria: false, primeiro_acesso_pendente: false }),
        acesso("f3", { primeiro_acesso_pendente: true, precisa_provisoria: false }),
      ]
    );
    expect(r.enviar.map((e) => e.funcionarioId)).toEqual(["f2", "f3"]);
    expect(r.pulados).toEqual([
      expect.objectContaining({ funcionarioId: "f1", motivo: "precisa_provisoria" }),
    ]);
  });

  it("T38: a ordem dos motivos de fora: avisado hoje e desativado vêm antes; o telefone depois", () => {
    const r = montar(
      [
        linha("m1", "f1"),
        linha("m2", "f2"),
        linha("m3", "f3", { funcionario: { id: "f3", nome_completo: "C", telefone: "" } }),
      ],
      [
        acesso("f1", { precisa_provisoria: true }),
        acesso("f2", { precisa_provisoria: true, ativo: false }),
        acesso("f3", { precisa_provisoria: true }),
      ],
      { avisadosHoje: ["f1"] }
    );
    const motivo = (id) => r.pulados.find((p) => p.funcionarioId === id)?.motivo;
    expect(r.enviar).toEqual([]);
    expect(motivo("f1")).toBe("avisado_hoje");
    expect(motivo("f2")).toBe("acesso_desativado");
    // sem telefone E sem senha que abra: o que o RH precisa resolver primeiro é o acesso
    expect(motivo("f3")).toBe("precisa_provisoria");
  });

  it("T38: com o status do servidor, só o 'travado' e o 'cpf_mudou' ficam de fora; o liberado e o aguardando recebem", () => {
    const AGORA = Date.parse("2026-10-07T12:00:00Z");
    const DIA = 86_400_000;
    const iso = (ms) => new Date(ms).toISOString();
    const credencial = {
      id: "cred-1",
      usuario: "12345678909",
      tipo: "cpf",
      senha_hash: "$2a$10$hash",
      senha_geracao: 1,
      senha_origem_empresa_id: null,
      sessao_versao: 1,
      tentativas: 0,
      bloqueado_ate: null,
    };
    const cadastro = (funcionarioId, extra = {}) => ({
      id: funcionarioId,
      empresa_id: "emp-1",
      cpf: "123.456.789-09",
      ativo: true,
      deleted_at: null,
      ...extra,
    });
    const vinculo = (funcionarioId, extra = {}) => ({
      funcionario_id: funcionarioId,
      empresa_id: "emp-1",
      credencial_id: "cred-1",
      ativo: true,
      sessao_versao: 1,
      provisoria_hash: null,
      provisoria_criada_em: null,
      provisoria_expira_em: null,
      geracao_liberada: 1,
      confirmado_em: iso(AGORA - 30 * DIA),
      ...extra,
    });
    const status = (v, c = cadastro(v.funcionario_id)) =>
      statusDoVinculo({ vinculo: v, credencial, cadastro: c, agora: AGORA });
    const acessos = [
      // entra com a senha que já tem
      status(vinculo("f1")),
      // recebeu a provisória há 1 dia e ainda não entrou
      status(
        vinculo("f2", {
          geracao_liberada: null,
          provisoria_hash: "$2a$10$p",
          provisoria_criada_em: iso(AGORA - DIA),
          provisoria_expira_em: iso(AGORA + 6 * DIA),
        })
      ),
      // a provisória venceu sem uso (o caso comum depois da P3)
      status(
        vinculo("f3", {
          geracao_liberada: null,
          provisoria_hash: "$2a$10$p",
          provisoria_criada_em: iso(AGORA - 8 * DIA),
          provisoria_expira_em: iso(AGORA - DIA),
        })
      ),
      // a senha mudou em outra empresa (a geração subiu)
      status(vinculo("f4", { geracao_liberada: 0 })),
      // o CPF do cadastro mudou
      status(vinculo("f5"), cadastro("f5", { cpf: "987.654.321-00" })),
    ];
    expect(acessos.map((a) => a.situacao)).toEqual([
      "liberado",
      "aguardando_provisoria",
      "travado",
      "travado",
      "cpf_mudou",
    ]);
    const r = montar(
      ["f1", "f2", "f3", "f4", "f5"].map((id) => linha(`m-${id}`, id)),
      acessos
    );
    expect(r.enviar.map((e) => e.funcionarioId)).toEqual(["f1", "f2"]);
    expect(r.enviar[0].texto).toMatch(/e a sua senha/);
    expect(r.enviar[1].texto).toMatch(/senha provisória/);
    expect(r.pulados.map((p) => [p.funcionarioId, p.motivo])).toEqual([
      ["f3", "precisa_provisoria"],
      ["f4", "precisa_provisoria"],
      ["f5", "precisa_provisoria"],
    ]);
  });

  it("T38: status de quem só matricula (recortado, sem os campos novos) segue como antes", () => {
    const r = montar([linha("m1", "f1")], [acesso("f1")]);
    expect(r.enviar).toHaveLength(1);
    expect(r.enviar[0].primeiroAcessoPendente).toBe(false);
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
      "precisa_provisoria",
    ]) {
      expect(rotuloDoMotivoPulado(m).length).toBeGreaterThan(5);
    }
    expect(rotuloDoMotivoPulado("sem_acesso")).toMatch(/botão do WhatsApp/);
  });

  it("T33 (C1): quem não pode criar o acesso é mandado a quem tem Funcionários → Editar", () => {
    const texto = rotuloDoMotivoPulado("sem_acesso", { podeCriarAcesso: false });
    expect(texto).toMatch(/Funcionários → Editar/);
    expect(texto).not.toMatch(/cria o acesso e envia a senha/);
    // quem pode criar segue com o texto de antes; os outros motivos não mudam
    expect(rotuloDoMotivoPulado("sem_acesso", { podeCriarAcesso: true })).toBe(
      rotuloDoMotivoPulado("sem_acesso")
    );
    expect(rotuloDoMotivoPulado("sem_telefone", { podeCriarAcesso: false })).toBe(
      rotuloDoMotivoPulado("sem_telefone")
    );
  });
});

describe("rotuloDoMotivoPulado: precisa_provisoria (T38)", () => {
  it("manda gerar uma nova senha provisória em Redefinir senha, na Ficha do funcionário", () => {
    const texto = rotuloDoMotivoPulado("precisa_provisoria");
    expect(texto).toMatch(/nova senha provisória/);
    expect(texto).toMatch(/Redefinir senha/);
    expect(texto).toMatch(/Ficha do funcionário/);
  });

  it("quem vê a lista mas não edita Funcionários é mandado a quem pode redefinir", () => {
    const texto = rotuloDoMotivoPulado("precisa_provisoria", { podeCriarAcesso: false });
    expect(texto).toMatch(/nova senha provisória/);
    expect(texto).toMatch(/Funcionários → Editar/);
    expect(rotuloDoMotivoPulado("precisa_provisoria", { podeCriarAcesso: true })).toBe(
      rotuloDoMotivoPulado("precisa_provisoria")
    );
  });
});

describe("dicaDoAvisoDaLinha (T33)", () => {
  it("inativo não é avisado; quem cria o acesso vê a dica de antes; quem não cria, a quem pedir", () => {
    expect(dicaDoAvisoDaLinha({ inativo: true, podeCriarAcesso: true })).toBe(
      "Funcionário inativo: não há a quem avisar"
    );
    expect(dicaDoAvisoDaLinha({ inativo: false, podeCriarAcesso: true })).toBe(
      "Avisar pelo WhatsApp (cria o acesso ao portal se ainda não tiver)"
    );
    const semCriar = dicaDoAvisoDaLinha({ inativo: false, podeCriarAcesso: false });
    expect(semCriar).toMatch(/^Avisar pelo WhatsApp/);
    expect(semCriar).toMatch(/Funcionários → Editar/);
    expect(semCriar).not.toMatch(/cria o acesso/);
  });
});
