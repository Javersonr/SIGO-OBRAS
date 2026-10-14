import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ROTULO_EVENTO,
  abertaEmDaTentativa,
  abertaEmDoQuestionario,
  ROTULO_ORIGEM_NAVEGADOR,
  descreverDetalhe,
  eventoInformadoPeloNavegador,
  origemDoEvento,
  rotuloDoEvento,
  tentativasDosQuestionarios,
  tomDoEvento,
} from "./ead-trilha";

describe("origem do evento da trilha (T17)", () => {
  it("evento relatado pelo navegador do aluno é marcado", () => {
    expect(eventoInformadoPeloNavegador({ evento: "play", origem: "navegador" })).toBe(true);
    expect(origemDoEvento({ evento: "play", origem: "navegador" })).toBe("navegador");
  });

  it("evento do servidor não leva o selo", () => {
    expect(eventoInformadoPeloNavegador({ evento: "login", origem: "servidor" })).toBe(false);
    expect(origemDoEvento({ evento: "login", origem: "servidor" })).toBe("servidor");
  });

  it("linha sem origem (resposta de antes da migração) NÃO vale servidor: a origem sai vazia, e não há selo (T17, M3)", () => {
    expect(eventoInformadoPeloNavegador({ evento: "acesso_criado" })).toBe(false);
    expect(origemDoEvento({ evento: "acesso_criado" })).toBe("");
    expect(origemDoEvento({ evento: "x", origem: null })).toBe("");
    expect(origemDoEvento({ evento: "x", origem: "" })).toBe("");
  });

  it("valor desconhecido nunca vira selo nem é repassado ao CSV: sai vazio, não 'servidor'", () => {
    expect(eventoInformadoPeloNavegador({ origem: "NAVEGADOR" })).toBe(false);
    expect(origemDoEvento({ origem: "NAVEGADOR" })).toBe("");
    expect(origemDoEvento({ origem: "outro" })).toBe("");
    expect(origemDoEvento({ origem: 1 })).toBe("");
  });

  it("aguenta evento vazio", () => {
    expect(eventoInformadoPeloNavegador(undefined)).toBe(false);
    expect(eventoInformadoPeloNavegador(null)).toBe(false);
    expect(origemDoEvento(undefined)).toBe("");
    expect(origemDoEvento(null)).toBe("");
  });

  it("só os dois valores que o banco aceita (check da migração 0135) saem como estão", () => {
    const migracao = readFileSync(
      new URL("../../../../supabase/migrations/0135_trilha_imutavel.sql", import.meta.url),
      "utf8"
    );
    expect(migracao).toMatch(/origem in \('servidor', 'navegador'\)/);
    expect(origemDoEvento({ origem: "servidor" })).toBe("servidor");
    expect(origemDoEvento({ origem: "navegador" })).toBe("navegador");
  });

  it("o rótulo do selo é o texto combinado com o RH", () => {
    expect(ROTULO_ORIGEM_NAVEGADOR).toBe("informado pelo navegador");
  });
});

// ---------------------------------------------------------------------------------------------
// T18: rótulo legível para TODOS os eventos e descrição do detalhe
// ---------------------------------------------------------------------------------------------

const lerFuncao = (caminho) =>
  readFileSync(new URL(`../../../../supabase/functions/${caminho}`, import.meta.url), "utf8");

/** Todo nome de evento que as Edge Functions do EAD gravam (lido do código, não de uma lista à mão). */
function eventosGravadosPeloServidor() {
  const nomes = new Set();
  const portal = lerFuncao("portal-funcionario/index.ts");
  for (const m of portal.matchAll(/\bevento:\s*"([a-z_]+)"/g)) nomes.add(m[1]);
  // evento escolhido por condição: `evento: cond ? "a" : "b"` (progresso: tarefa_confirmada ou apostila_lida)
  for (const m of portal.matchAll(/\bevento:\s*[^,\n]*?\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)) {
    nomes.add(m[1]);
    nomes.add(m[2]);
  }
  const clientes = portal.slice(
    portal.indexOf("const EVENTOS_CLIENTE = new Set(["),
    portal.indexOf("]);", portal.indexOf("const EVENTOS_CLIENTE"))
  );
  for (const m of clientes.matchAll(/"([a-z_]+)"/g)) nomes.add(m[1]);
  const acesso = lerFuncao("funcionario-acesso/index.ts");
  for (const m of acesso.matchAll(/\bevento\(([^)]*)\)/g)) {
    for (const s of m[1].matchAll(/"([a-z_]+)"/g)) nomes.add(s[1]);
  }
  for (const arquivo of [
    "_shared/portal-funcionario.ts",
    "portal-funcionario/regras.ts",
    "portal-funcionario/declaracao-ambiente.ts",
    // atividades interativas (Tasks 3, 6 e 9): se o nome do evento morar numa constante EVENTO_*, ele entra aqui
    "portal-funcionario/caso.ts",
    "portal-funcionario/caso-aluno.ts",
    "portal-funcionario/questionario.ts",
  ]) {
    for (const m of lerFuncao(arquivo).matchAll(/export const EVENTO_[A-Z_]+ = "([a-z_]+)"/g)) {
      nomes.add(m[1]);
    }
  }
  return nomes;
}

describe("rótulos da trilha (T18)", () => {
  it("todo evento que o servidor grava tem rótulo (a trilha não mostra nome técnico)", () => {
    const nomes = eventosGravadosPeloServidor();
    // sem estes a leitura do código teria falhado em silêncio e o teste passaria vazio
    for (const esperado of [
      "login",
      "abrir_aula",
      "apostila_lida",
      "avaliacao_iniciada",
      "acesso_reativado",
      "tentativa_liberada",
      "certificado_revogado",
      "declaracao_ambiente",
      // o caso com decisões (Task 9): as três constantes EVENTO_CASO_* do caso-aluno.ts
      "caso_escolha",
      "caso_reiniciado",
      "caso_concluido",
    ]) {
      expect(nomes, esperado).toContain(esperado);
    }
    expect(nomes.size).toBeGreaterThanOrEqual(25);
    const semRotulo = [...nomes].filter((n) => !ROTULO_EVENTO[n]);
    expect(semRotulo).toEqual([]);
  });

  it("a declaração de ambiente e horário tem rótulo em português (T35)", () => {
    expect(rotuloDoEvento("declaracao_ambiente")).toMatch(/declarou.*ambiente/i);
    expect(tomDoEvento("declaracao_ambiente")).toBe("normal");
  });

  it("os eventos novos do RH e da apostila têm rótulo em português", () => {
    // A5 (atividades interativas): a leitura conclui ao chegar ao fim, sem tempo mínimo
    expect(rotuloDoEvento("apostila_lida")).toBe("Leu até o fim");
    expect(rotuloDoEvento("tentativa_liberada")).toMatch(/liberad/i);
    expect(rotuloDoEvento("certificado_revogado")).toMatch(/revogad/i);
  });

  it("evento desconhecido aparece pelo nome (nunca em branco)", () => {
    expect(rotuloDoEvento("evento_novo")).toBe("evento_novo");
    // nome que existe no protótipo do objeto não pode devolver função
    expect(rotuloDoEvento("constructor")).toBe("constructor");
    expect(rotuloDoEvento(undefined)).toBe("");
  });

  it("revogação e login errado têm tom de atenção; o resto é normal", () => {
    expect(tomDoEvento("certificado_revogado")).toBe("revogado");
    expect(tomDoEvento("login_falha")).toBe("atencao");
    expect(tomDoEvento("progresso_ajustado")).toBe("atencao");
    expect(tomDoEvento("login")).toBe("normal");
    expect(tomDoEvento(undefined)).toBe("normal");
  });
});

describe("descreverDetalhe da trilha (T18)", () => {
  const d = (evento, detalhe) => descreverDetalhe({ evento, detalhe });

  it("prova enviada, prova aberta e aula concluída", () => {
    expect(d("avaliacao_envio", { tentativa: 2, nota: 60, aprovada: false })).toBe(
      "tentativa 2 · nota 60% · reprovado"
    );
    expect(d("avaliacao_envio", { tentativa: 1, nota: 100, aprovada: true })).toContain("aprovado");
    expect(d("avaliacao_iniciada", { tentativa: 3 })).toBe("tentativa 3");
    expect(d("aula_concluida", { segundos: 3725 })).toBe("1h02 assistidos");
  });

  it("apostila lida: tempo de leitura e o mínimo exigido", () => {
    expect(d("apostila_lida", { segundos: 600, minimo: 540 })).toBe(
      "10min 0s de leitura (mínimo 9min 0s)"
    );
    expect(d("apostila_lida", { segundos: 60 })).toBe("1min 0s de leitura");
  });

  it("liberação de tentativa mostra o autor e quantas extras a matrícula tem", () => {
    const texto = d("tentativa_liberada", { por: "rh@exemplo.test", tentativas_extras: 2 });
    expect(texto).toContain("por rh@exemplo.test");
    expect(texto).toContain("2");
    expect(d("tentativa_liberada", { por: "rh@exemplo.test" })).toBe("por rh@exemplo.test");
  });

  it("revogação mostra o autor, o código e o motivo", () => {
    const texto = d("certificado_revogado", {
      por: "rh@exemplo.test",
      codigo: "ABCD-2345-EFGH",
      motivo: "Prova feita por outra pessoa",
    });
    expect(texto).toContain("por rh@exemplo.test");
    expect(texto).toContain("ABCD-2345-EFGH");
    expect(texto).toContain("Prova feita por outra pessoa");
  });

  it("declaração de ambiente (T35): a versão do texto e se era o texto padrão, sem repetir o texto inteiro", () => {
    expect(d("declaracao_ambiente", { versao: 2, texto_padrao: false, art: "ART 55" })).toBe(
      "texto v2 · ART: ART 55"
    );
    expect(d("declaracao_ambiente", { versao: 2, texto_padrao: false })).toBe("texto v2");
    expect(d("declaracao_ambiente", { versao: 0, texto_padrao: true })).toBe(
      "texto padrão, sem aprovação do RT"
    );
    expect(d("declaracao_ambiente", undefined)).toBe("");
    // o texto inteiro fica no evento (a prova), mas não polui a linha da trilha
    expect(d("declaracao_ambiente", { versao: 1, texto: "Texto longo do RT" })).not.toContain(
      "Texto longo"
    );
  });

  it("acessos do RH continuam 'por <e-mail>'; evento sem detalhe fica vazio", () => {
    expect(d("senha_redefinida", { por: "rh@exemplo.test" })).toBe("por rh@exemplo.test");
    expect(d("login", undefined)).toBe("");
    expect(descreverDetalhe({ evento: "login" })).toBe("");
    expect(descreverDetalhe(null)).toBe("");
  });

  it("login errado e progresso ajustado", () => {
    expect(d("login_falha", { bloqueou: true })).toBe("acesso bloqueado por 15 min");
    expect(d("login_falha", { tentativa: 3 })).toBe("tentativa 3");
    expect(d("progresso_ajustado", { pedido: 90, aceito: 30 })).toBe("pediu +90s, aceito +30s");
  });

  it("detalhe vindo do navegador com texto no lugar do número não quebra", () => {
    expect(() => d("aula_concluida", { segundos: "muito" })).not.toThrow();
    expect(() => d("apostila_lida", { segundos: null, minimo: undefined })).not.toThrow();
  });
});

describe("abertaEmDaTentativa (T18)", () => {
  const abriu = (numero, created_at) => ({
    evento: "avaliacao_iniciada",
    detalhe: { tentativa: numero },
    created_at,
  });

  it("devolve a hora em que a prova daquela tentativa foi aberta pela 1ª vez", () => {
    const eventos = [
      abriu(1, "2026-10-05T10:00:00Z"),
      abriu(2, "2026-10-05T11:00:00Z"),
      // reabriu a tentativa 2 (a prova foi sorteada de novo): vale a primeira abertura
      abriu(2, "2026-10-05T11:30:00Z"),
      { evento: "login", created_at: "2026-10-05T09:00:00Z" },
    ];
    expect(abertaEmDaTentativa(eventos, 2)).toBe("2026-10-05T11:00:00Z");
    expect(abertaEmDaTentativa(eventos, 1)).toBe("2026-10-05T10:00:00Z");
  });

  it("sem evento daquela tentativa (prova antiga, de antes da T16) devolve null", () => {
    expect(abertaEmDaTentativa([abriu(1, "2026-10-05T10:00:00Z")], 3)).toBeNull();
    expect(abertaEmDaTentativa([], 1)).toBeNull();
    expect(abertaEmDaTentativa(undefined, 1)).toBeNull();
    expect(abertaEmDaTentativa([{ evento: "avaliacao_iniciada", detalhe: null }], 1)).toBeNull();
  });
});

describe("edição da resposta de uma dúvida (A6, T21)", () => {
  it("o evento tem rótulo em português e tom normal", () => {
    expect(rotuloDoEvento("duvida_resposta_editada")).toMatch(/resposta.*d[úu]vida.*editada/i);
    expect(tomDoEvento("duvida_resposta_editada")).toBe("normal");
  });

  it("a linha diz quem editou e que a versão anterior ficou guardada, sem repetir o texto antigo", () => {
    const texto = descreverDetalhe({
      evento: "duvida_resposta_editada",
      detalhe: {
        por: "rh@exemplo.test",
        duvida_id: "x",
        resposta_anterior: "Texto que NÃO aparece",
      },
    });
    expect(texto).toBe("por rh@exemplo.test · versão anterior guardada no registro");
    expect(texto).not.toContain("Texto que");
    expect(descreverDetalhe({ evento: "duvida_resposta_editada", detalhe: {} })).toBe(
      "versão anterior guardada no registro"
    );
  });
});

describe("conclusão adiada e registrada pelo sistema (A6, revisão 2)", () => {
  it("os dois eventos têm rótulo em português (nada de nome técnico na trilha) e tom normal", () => {
    expect(rotuloDoEvento("conclusao_adiada")).toMatch(/conclus[ãa]o.*adiada/i);
    expect(rotuloDoEvento("conclusao_registrada")).toMatch(/conclus[ãa]o.*registrada/i);
    expect(tomDoEvento("conclusao_adiada")).toBe("normal");
    expect(tomDoEvento("conclusao_registrada")).toBe("normal");
  });

  it("o evento adiado diz o motivo; o registrado diz a data da conclusão que ficou na matrícula", () => {
    expect(
      descreverDetalhe({ evento: "conclusao_adiada", detalhe: { motivo: "curso_nao_lido" } })
    ).toBe("não foi possível ler o curso");
    expect(
      descreverDetalhe({ evento: "conclusao_adiada", detalhe: { motivo: "gravacao_falhou" } })
    ).toBe("não foi possível gravar a conclusão");
    expect(descreverDetalhe({ evento: "conclusao_adiada", detalhe: {} })).toBe("");
    expect(
      descreverDetalhe({
        evento: "conclusao_registrada",
        detalhe: { data_conclusao: "2026-10-01" },
      })
    ).toBe("data da conclusão 01/10/2026");
    expect(descreverDetalhe({ evento: "conclusao_registrada", detalhe: {} })).toBe("");
    // data que não é data não vira lixo na linha
    expect(
      descreverDetalhe({ evento: "conclusao_registrada", detalhe: { data_conclusao: "ontem" } })
    ).toBe("");
  });

  it("A7: o adiamento pela prova ilegível diz o motivo (questões ou aprovação)", () => {
    expect(
      descreverDetalhe({ evento: "conclusao_adiada", detalhe: { motivo: "prova_nao_lida" } })
    ).toBe("não foi possível ler a prova (questões ou aprovação)");
  });

  it("A7: o registro diz por onde a conclusão adiada foi gravada (abertura do portal, aula, prova ou certificado)", () => {
    const registrada = (origem) =>
      descreverDetalhe({
        evento: "conclusao_registrada",
        detalhe: { data_conclusao: "2026-10-01", origem },
      });
    expect(registrada("retomada")).toBe("data da conclusão 01/10/2026 · ao abrir o portal");
    expect(registrada("aula")).toBe("data da conclusão 01/10/2026 · ao concluir a aula");
    expect(registrada("prova")).toBe("data da conclusão 01/10/2026 · na aprovação da prova");
    expect(registrada("certificado")).toBe(
      "data da conclusão 01/10/2026 · no pedido do certificado"
    );
    // origem desconhecida (ou ausente, como nos eventos gravados antes da A7) não vira texto técnico
    expect(registrada("outra")).toBe("data da conclusão 01/10/2026");
    expect(registrada("toString")).toBe("data da conclusão 01/10/2026");
    expect(descreverDetalhe({ evento: "conclusao_registrada", detalhe: { origem: "aula" } })).toBe(
      "ao concluir a aula"
    );
  });
});

// ---------------------------------------------------------------------------------------------
// T38: um login em mais de uma empresa
// ---------------------------------------------------------------------------------------------

describe("eventos do portal com um login em mais de uma empresa (T38)", () => {
  it("a liberação pela provisória e o aviso de senha que mudou fora da empresa têm rótulo", () => {
    expect(rotuloDoEvento("acesso_liberado")).toBe("Acesso liberado com a senha provisória");
    expect(rotuloDoEvento("acesso_aguardando_provisoria")).toBe(
      "Acesso passou a pedir nova senha provisória"
    );
    expect(tomDoEvento("acesso_aguardando_provisoria")).toBe("atencao");
  });

  it("o detalhe não diz qual empresa mexeu nem se a pessoa já tinha senha", () => {
    expect(
      descreverDetalhe({
        evento: "acesso_aguardando_provisoria",
        detalhe: { motivo: "senha_nova" },
      })
    ).toBe("a senha do portal mudou fora desta empresa");
    expect(
      descreverDetalhe({ evento: "acesso_aguardando_provisoria", detalhe: { motivo: "suporte" } })
    ).toBe("a senha foi redefinida pelo suporte do SIGO");
    expect(descreverDetalhe({ evento: "acesso_aguardando_provisoria", detalhe: {} })).toBe("");
    expect(descreverDetalhe({ evento: "acesso_liberado", detalhe: null })).toBe("");
    expect(descreverDetalhe({ evento: "login", detalhe: { via: "provisoria" } })).toBe(
      "com a senha provisória"
    );
    expect(descreverDetalhe({ evento: "login", detalhe: { via: "senha" } })).toBe("");
    // o procedimento do suporte desativa o vínculo da empresa que ocupou o CPF
    expect(
      descreverDetalhe({ evento: "acesso_desativado", detalhe: { por: "suporte do SIGO" } })
    ).toBe("por suporte do SIGO");
  });
});

// ---------------------------------------------------------------------------------------------
// Atividades interativas (spec 2026-10-14, contrato C2): questionário, caso e tarefa
// ---------------------------------------------------------------------------------------------

describe("eventos das atividades interativas (C2)", () => {
  const NOVOS = [
    "questionario_iniciado",
    "questionario_envio",
    "caso_escolha",
    "caso_reiniciado",
    "caso_concluido",
    "tarefa_confirmada",
  ];

  it("todo evento novo tem rótulo em português, nunca o nome técnico", () => {
    for (const nome of NOVOS) {
      expect(Object.hasOwn(ROTULO_EVENTO, nome), nome).toBe(true);
      expect(rotuloDoEvento(nome), nome).not.toBe(nome);
    }
    expect(rotuloDoEvento("questionario_envio")).toMatch(/question[áa]rio/i);
    expect(rotuloDoEvento("caso_escolha")).toMatch(/caso/i);
    expect(rotuloDoEvento("tarefa_confirmada")).toMatch(/atividade de estudo/i);
  });

  it("A5: o rótulo da leitura diz que o aluno chegou ao fim; eventos antigos (com mínimo) seguem legíveis", () => {
    expect(rotuloDoEvento("apostila_lida")).toBe("Leu até o fim");
    expect(descreverDetalhe({ evento: "apostila_lida", detalhe: { segundos: 125 } })).toBe(
      "2min 5s de leitura"
    );
    expect(
      descreverDetalhe({ evento: "apostila_lida", detalhe: { segundos: 600, minimo: 540 } })
    ).toBe("10min 0s de leitura (mínimo 9min 0s)");
  });

  it("caso recomeçado tem tom de atenção; as outras atividades, normal", () => {
    expect(tomDoEvento("caso_reiniciado")).toBe("atencao");
    for (const nome of NOVOS.filter((n) => n !== "caso_reiniciado")) {
      expect(tomDoEvento(nome), nome).toBe("normal");
    }
  });
});

describe("descreverDetalhe das atividades interativas", () => {
  const d = (evento, detalhe) => descreverDetalhe({ evento, detalhe });

  it("questionário aberto e enviado: tentativa, nota e se atingiu a nota mínima", () => {
    expect(
      d("questionario_iniciado", { tentativa: 2, iniciada_em: "2026-10-14T10:00:00Z", prova: [] })
    ).toBe("tentativa 2");
    expect(d("questionario_envio", { tentativa: 3, nota: 75, aprovada: false })).toBe(
      "tentativa 3 · nota 75% · abaixo da nota mínima"
    );
    expect(d("questionario_envio", { tentativa: 1, nota: 88, aprovada: true })).toBe(
      "tentativa 1 · nota 88% · atingiu a nota mínima"
    );
  });

  it("escolha no caso: etapa, opção do cadastro, segura ou não e para onde levou", () => {
    expect(
      d("caso_escolha", {
        rodada: 1,
        etapa: "e1",
        opcao: 1,
        segura: false,
        proxima: "r1",
        passagem: 1,
      })
    ).toBe("etapa e1 · opção 2 do cadastro · escolha insegura · seguiu para r1");
    expect(
      d("caso_escolha", {
        rodada: 2,
        etapa: "e2",
        opcao: 0,
        segura: true,
        proxima: null,
        passagem: 2,
      })
    ).toBe("rodada 2 · etapa e2 (2ª vez) · opção 1 do cadastro · escolha segura · encerrou o caso");
  });

  it("caso recomeçado e concluído", () => {
    expect(d("caso_reiniciado", { rodada: 2, motivo: "caso_alterado" })).toBe(
      "rodada 2 · o RH mudou o roteiro e o caminho feito deixou de existir"
    );
    expect(d("caso_concluido", { rodada: 1, escolhas: 4 })).toBe("4 escolhas");
    expect(d("caso_concluido", { rodada: 2, escolhas: 1 })).toBe("rodada 2 · 1 escolha");
  });

  it("atividade de estudo confirmada: o tempo de tela", () => {
    expect(d("tarefa_confirmada", { segundos: 754 })).toBe("12min 34s de tela");
  });

  it("detalhe fora do formato não quebra nem vira lixo na linha", () => {
    expect(() => d("caso_escolha", { etapa: 5, opcao: "x" })).not.toThrow();
    expect(d("caso_escolha", { etapa: 5, opcao: "x" })).toBe("");
    expect(d("questionario_envio", null)).toBe("");
    expect(d("caso_reiniciado", { motivo: "outro" })).toBe("");
    expect(d("tarefa_confirmada", undefined)).toBe("0min 0s de tela");
  });
});

describe("abertaEmDoQuestionario", () => {
  const abriu = (aula_id, tentativa, created_at) => ({
    evento: "questionario_iniciado",
    aula_id,
    detalhe: { tentativa },
    created_at,
  });

  it("devolve a 1ª abertura daquela tentativa daquele questionário", () => {
    const eventos = [
      abriu("aq1", 1, "2026-10-14T10:00:00Z"),
      abriu("aq2", 1, "2026-10-14T09:00:00Z"),
      // reabriu a mesma tentativa: vale a primeira
      abriu("aq1", 1, "2026-10-14T10:30:00Z"),
      abriu("aq1", 2, "2026-10-14T11:00:00Z"),
      // a prova final não conta
      {
        evento: "avaliacao_iniciada",
        aula_id: null,
        detalhe: { tentativa: 1 },
        created_at: "2026-10-14T08:00:00Z",
      },
    ];
    expect(abertaEmDoQuestionario(eventos, "aq1", 1)).toBe("2026-10-14T10:00:00Z");
    expect(abertaEmDoQuestionario(eventos, "aq2", 1)).toBe("2026-10-14T09:00:00Z");
    expect(abertaEmDoQuestionario(eventos, "aq1", 2)).toBe("2026-10-14T11:00:00Z");
    expect(abertaEmDoQuestionario(eventos, "aq1", 3)).toBeNull();
    expect(abertaEmDoQuestionario(undefined, "aq1", 1)).toBeNull();
  });
});

describe("tentativasDosQuestionarios", () => {
  const aulas = [
    { id: "a1", titulo: "Vídeo de abertura" },
    { id: "aq1", titulo: "M1 · Questionário do módulo" },
    { id: "aq2", titulo: "M2 · Questionário do módulo" },
  ];

  it("em ordem de aula e de número, com o rótulo numerado que o aluno vê", () => {
    const linhas = tentativasDosQuestionarios({
      aulas,
      tentativas: [
        { id: "t3", aula_id: "aq2", numero: 1 },
        { id: "t2", aula_id: "aq1", numero: 2 },
        { id: "t1", aula_id: "aq1", numero: 1 },
      ],
    });
    expect(linhas.map((l) => [l.tentativa.id, l.aula])).toEqual([
      ["t1", "2. M1 · Questionário do módulo"],
      ["t2", "2. M1 · Questionário do módulo"],
      ["t3", "3. M2 · Questionário do módulo"],
    ]);
  });

  it("aula que saiu da lista vai para o fim como 'Questionário removido'", () => {
    const linhas = tentativasDosQuestionarios({
      aulas,
      tentativas: [
        { id: "tx", aula_id: "apagada", numero: 1 },
        { id: "t1", aula_id: "aq1", numero: 1 },
      ],
    });
    expect(linhas.map((l) => l.aula)).toEqual([
      "2. M1 · Questionário do módulo",
      "Questionário removido",
    ]);
  });

  it("entrada vazia não quebra", () => {
    expect(tentativasDosQuestionarios()).toEqual([]);
    expect(tentativasDosQuestionarios({ tentativas: null, aulas: null })).toEqual([]);
  });
});
