import { describe, it, expect, vi } from "vitest";
import { criarCacheSoDeSucesso } from "./cache-so-sucesso";

// A6 (T34): o gerador de certificados do dossiê guarda em cache o logo e as imagens de assinatura, que se
// repetem em dezenas de PDFs. O cache antigo guardava também a FALHA (null), então uma queda de rede na
// primeira imagem deixava todos os certificados do lote sem ela. Este cache guarda só o sucesso.
describe("criarCacheSoDeSucesso", () => {
  it("o sucesso é guardado: a segunda leitura da mesma chave não busca de novo", async () => {
    const buscar = vi.fn(async (chave) => ({ imagem: chave }));
    const cache = criarCacheSoDeSucesso(buscar);
    expect(await cache("a")).toEqual({ imagem: "a" });
    expect(await cache("a")).toEqual({ imagem: "a" });
    expect(buscar).toHaveBeenCalledTimes(1);
    await cache("b");
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("a falha (null) NÃO é guardada: a próxima leitura tenta de novo e, se der certo, passa a valer", async () => {
    const buscar = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ imagem: "ok" });
    const cache = criarCacheSoDeSucesso(buscar);
    expect(await cache("a")).toBeNull();
    expect(await cache("a")).toEqual({ imagem: "ok" });
    expect(await cache("a")).toEqual({ imagem: "ok" });
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("a exceção também é falha: vira null (nunca derruba quem pediu) e não é guardada", async () => {
    const buscar = vi
      .fn()
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValue({ imagem: "ok" });
    const cache = criarCacheSoDeSucesso(buscar);
    expect(await cache("a")).toBeNull();
    expect(await cache("a")).toEqual({ imagem: "ok" });
  });

  it("falha que não passa (arquivo apagado) para de ser tentada depois do limite de tentativas", async () => {
    const buscar = vi.fn(async () => null);
    const cache = criarCacheSoDeSucesso(buscar, { maxFalhas: 3 });
    for (let i = 0; i < 10; i += 1) expect(await cache("a")).toBeNull();
    expect(buscar).toHaveBeenCalledTimes(3);
    // outra chave não herda a desistência
    await cache("b");
    expect(buscar).toHaveBeenCalledTimes(4);
  });

  it("pedidos ao mesmo tempo para a mesma chave dividem uma busca só", async () => {
    let liberar;
    const buscar = vi.fn(
      () =>
        new Promise((resolve) => {
          liberar = () => resolve({ imagem: "ok" });
        })
    );
    const cache = criarCacheSoDeSucesso(buscar);
    const [p1, p2] = [cache("a"), cache("a")];
    liberar();
    expect(await p1).toEqual({ imagem: "ok" });
    expect(await p2).toEqual({ imagem: "ok" });
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("uma falha em andamento conta uma vez só, mesmo com vários pedidos juntos", async () => {
    const buscar = vi.fn(async () => null);
    const cache = criarCacheSoDeSucesso(buscar, { maxFalhas: 2 });
    await Promise.all([cache("a"), cache("a"), cache("a")]);
    expect(buscar).toHaveBeenCalledTimes(1);
    await cache("a");
    await cache("a");
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("a busca recebe a chave como veio", async () => {
    const buscar = vi.fn(async () => ({ x: 1 }));
    await criarCacheSoDeSucesso(buscar)("treinamentos/emp/a.png");
    expect(buscar).toHaveBeenCalledWith("treinamentos/emp/a.png");
  });
});
