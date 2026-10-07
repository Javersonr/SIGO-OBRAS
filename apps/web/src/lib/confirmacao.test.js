import { describe, it, expect, vi } from "vitest";
import { criarConfirmacoes } from "./confirmacao";

const config = (titulo) => ({ titulo, texto: "Tem certeza?" });

describe("criarConfirmacoes", () => {
  it("pedir mostra o pedido e a promessa só resolve quando o RH responde", async () => {
    const aoMudar = vi.fn();
    const c = criarConfirmacoes(aoMudar);
    const resolvido = vi.fn();
    const promessa = c.pedir(config("Remover")).then(resolvido);
    expect(aoMudar).toHaveBeenCalledTimes(1);
    expect(aoMudar).toHaveBeenLastCalledWith(config("Remover"));
    await Promise.resolve();
    expect(resolvido).not.toHaveBeenCalled();
    c.responder(true);
    await promessa;
    expect(resolvido).toHaveBeenCalledWith(true);
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it("responder(false) cancela", async () => {
    const c = criarConfirmacoes(() => {});
    const promessa = c.pedir(config("A"));
    c.responder(false);
    await expect(promessa).resolves.toBe(false);
  });

  it("só `true` confirma: qualquer outro valor conta como cancelar", async () => {
    const c = criarConfirmacoes(() => {});
    const promessa = c.pedir(config("A"));
    c.responder(undefined);
    await expect(promessa).resolves.toBe(false);
  });

  it("um novo pedido cancela o que ainda estava aberto e vira o pedido da tela", async () => {
    const aoMudar = vi.fn();
    const c = criarConfirmacoes(aoMudar);
    const primeiro = c.pedir(config("primeiro"));
    const segundo = c.pedir(config("segundo"));
    await expect(primeiro).resolves.toBe(false);
    expect(aoMudar).toHaveBeenLastCalledWith(config("segundo"));
    c.responder(true);
    await expect(segundo).resolves.toBe(true);
  });

  it("responder duas vezes (clique duplo) vale só a primeira", async () => {
    const aoMudar = vi.fn();
    const c = criarConfirmacoes(aoMudar);
    const promessa = c.pedir(config("A"));
    c.responder(true);
    c.responder(false);
    await expect(promessa).resolves.toBe(true);
    // pedido + 1 fechamento; a 2ª resposta não mexe na tela
    expect(aoMudar).toHaveBeenCalledTimes(2);
  });

  it("responder sem pedido aberto não faz nada", () => {
    const aoMudar = vi.fn();
    const c = criarConfirmacoes(aoMudar);
    expect(() => c.responder(true)).not.toThrow();
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("descartar (tela desmontada) cancela a promessa sem mexer na tela", async () => {
    const aoMudar = vi.fn();
    const c = criarConfirmacoes(aoMudar);
    const promessa = c.pedir(config("A"));
    c.descartar();
    await expect(promessa).resolves.toBe(false);
    expect(aoMudar).toHaveBeenCalledTimes(1);
  });

  it("o pedido mostrado é uma cópia: mexer no objeto de fora não muda a tela", () => {
    const aoMudar = vi.fn();
    const c = criarConfirmacoes(aoMudar);
    const original = config("A");
    c.pedir(original);
    original.titulo = "alterado";
    expect(aoMudar.mock.calls[0][0].titulo).toBe("A");
  });
});
