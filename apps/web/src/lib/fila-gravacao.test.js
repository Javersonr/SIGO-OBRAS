import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFilaGravacao } from "./fila-gravacao";

/** Promessa controlada de fora: a gravação só termina quando o teste manda. */
function adiada() {
  let resolver;
  let rejeitar;
  const promessa = new Promise((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** Deixa rodar as promessas pendentes (a fila encadeia com .then). */
const microtarefas = () => vi.advanceTimersByTimeAsync(0);

describe("criarFilaGravacao", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grava só o último valor, esperaMs depois da última mudança", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    fila.agendar("op1", { v: 1 });
    await vi.advanceTimersByTimeAsync(600);
    fila.agendar("op1", { v: 2 });
    await vi.advanceTimersByTimeAsync(999);
    expect(gravar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(gravar).toHaveBeenCalledWith("op1", { v: 2 });
  });

  it("fica ocupada enquanto espera e enquanto grava", async () => {
    const g = adiada();
    const gravar = vi.fn(() => g.promessa);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    expect(fila.ocupada()).toBe(false);
    fila.agendar("op1", 1);
    expect(fila.ocupada()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(fila.ocupada()).toBe(true);
    g.resolver();
    await microtarefas();
    expect(fila.ocupada()).toBe(false);
  });

  it("uma gravação de cada vez, na ordem em que entraram", async () => {
    const g1 = adiada();
    const g2 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockReturnValueOnce(g2.promessa);
    const fila = criarFilaGravacao({ gravar });
    const p1 = fila.gravarJa("op1", 1);
    const p2 = fila.gravarJa("op1", 2);
    await microtarefas();
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    g1.resolver();
    await microtarefas();
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op1", 2],
    ]);
    g2.resolver();
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(true);
  });

  it("gravarJa descarta o valor que esperava da mesma chave", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar });
    fila.agendar("op1", 1);
    await expect(fila.gravarJa("op1", 2)).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar.mock.calls).toEqual([["op1", 2]]);
    expect(fila.ocupada()).toBe(false);
  });

  it("agendar outra chave manda o valor que esperava para a fila na hora", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    fila.agendar("op1", 1);
    fila.agendar("op2", 2);
    await microtarefas();
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op2", 2],
    ]);
  });

  it("descarregar grava na hora o que esperava, e sem nada esperando só resolve", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    await expect(fila.descarregar()).resolves.toBe(true);
    expect(gravar).not.toHaveBeenCalled();
    fila.agendar("op1", 1);
    await expect(fila.descarregar()).resolves.toBe(true);
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar).toHaveBeenCalledTimes(1);
  });

  it("falha: avisa, descarta o que esperava e o que estava na fila depois, e volta a gravar", async () => {
    const erro = new Error("sem rede");
    const g1 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockResolvedValue(undefined);
    const aoFalhar = vi.fn();
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000, aoFalhar });
    const p1 = fila.gravarJa("op1", 1);
    const p2 = fila.gravarJa("op1", 2);
    fila.agendar("op1", 3);
    g1.rejeitar(erro);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(false);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar).toHaveBeenCalledWith("op1", erro);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar.mock.calls).toEqual([["op1", 1]]);
    expect(fila.ocupada()).toBe(false);
    await expect(fila.gravarJa("op1", 4)).resolves.toBe(true);
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op1", 4],
    ]);
  });

  it("a falha de uma chave não descarta a outra", async () => {
    const gravar = vi.fn(async (chave) => {
      if (chave === "op1") throw new Error("RLS");
    });
    const aoFalhar = vi.fn();
    const fila = criarFilaGravacao({ gravar, aoFalhar });
    const p1 = fila.gravarJa("op1", 1);
    const p2 = fila.gravarJa("op2", 2);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(true);
    expect(aoFalhar.mock.calls.map((c) => c[0])).toEqual(["op1"]);
  });
});
