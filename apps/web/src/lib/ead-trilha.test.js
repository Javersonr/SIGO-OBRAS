import { describe, it, expect } from "vitest";
import {
  ROTULO_ORIGEM_NAVEGADOR,
  eventoInformadoPeloNavegador,
  origemDoEvento,
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

  it("linha sem origem (resposta de antes da migração) vale servidor: só 'navegador' é selo", () => {
    expect(eventoInformadoPeloNavegador({ evento: "acesso_criado" })).toBe(false);
    expect(origemDoEvento({ evento: "acesso_criado" })).toBe("servidor");
    expect(origemDoEvento({ evento: "x", origem: null })).toBe("servidor");
  });

  it("valor desconhecido nunca vira selo nem é repassado ao CSV", () => {
    expect(eventoInformadoPeloNavegador({ origem: "NAVEGADOR" })).toBe(false);
    expect(origemDoEvento({ origem: "outro" })).toBe("servidor");
  });

  it("aguenta evento vazio", () => {
    expect(eventoInformadoPeloNavegador(undefined)).toBe(false);
    expect(eventoInformadoPeloNavegador(null)).toBe(false);
    expect(origemDoEvento(undefined)).toBe("servidor");
  });

  it("o rótulo do selo é o texto combinado com o RH", () => {
    expect(ROTULO_ORIGEM_NAVEGADOR).toBe("informado pelo navegador");
  });
});
