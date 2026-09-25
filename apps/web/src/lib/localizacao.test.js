import { describe, it, expect } from "vitest";
import { obterLocalizacao } from "./localizacao";

const posicao = {
  coords: { latitude: -19.5, longitude: -46.9, accuracy: 14.6 },
  timestamp: Date.UTC(2026, 8, 25, 13),
};

describe("obterLocalizacao", () => {
  it("devolve a coordenada quando a pessoa permite", async () => {
    const geo = { getCurrentPosition: (ok) => ok(posicao) };
    await expect(obterLocalizacao({ geolocation: geo })).resolves.toEqual({
      status: "concedida",
      lat: -19.5,
      lng: -46.9,
      precisao_m: 15,
      capturada_em: "2026-09-25T13:00:00.000Z",
    });
  });

  it("recusa, erro de posição e tempo esgotado viram status", async () => {
    const erro = (code) => ({ getCurrentPosition: (_ok, falha) => falha({ code }) });
    await expect(obterLocalizacao({ geolocation: erro(1) })).resolves.toEqual({ status: "negada" });
    await expect(obterLocalizacao({ geolocation: erro(2) })).resolves.toEqual({
      status: "indisponivel",
    });
    await expect(obterLocalizacao({ geolocation: erro(3) })).resolves.toEqual({
      status: "sem_resposta",
    });
  });

  it("sem Geolocation no navegador → indisponível", async () => {
    await expect(obterLocalizacao({ geolocation: null })).resolves.toEqual({
      status: "indisponivel",
    });
  });

  it("aparelho que nunca responde → sem_resposta depois do limite", async () => {
    const mudo = { getCurrentPosition: () => {} };
    await expect(
      obterLocalizacao({ geolocation: mudo, timeoutMs: 10, folgaMs: 10 })
    ).resolves.toEqual({
      status: "sem_resposta",
    });
  });
});
