import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ROTULO_EVENTO,
  abertaEmDaTentativa,
  ROTULO_ORIGEM_NAVEGADOR,
  descreverDetalhe,
  eventoInformadoPeloNavegador,
  origemDoEvento,
  rotuloDoEvento,
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
    expect(rotuloDoEvento("apostila_lida")).toMatch(/apostila/i);
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
});
