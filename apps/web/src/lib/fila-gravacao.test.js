import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFilaGravacao, filasPorChave } from "./fila-gravacao";

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

  it("descarregar sem nada esperando e com uma gravação em voo resolve quando ela termina", async () => {
    const g1 = adiada();
    const g2 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockReturnValueOnce(g2.promessa);
    const fila = criarFilaGravacao({ gravar });
    fila.gravarJa("op1", 1);
    let resultado;
    fila.descarregar().then((ok) => {
      resultado = ok;
    });
    await microtarefas();
    expect(resultado).toBeUndefined();
    g1.resolver();
    await microtarefas();
    expect(resultado).toBe(true);
    // com a gravação em voo falhando, resolve false
    fila.gravarJa("op1", 2);
    const p = fila.descarregar();
    g2.rejeitar(new Error("sem rede"));
    await expect(p).resolves.toBe(false);
    expect(gravar).toHaveBeenCalledTimes(2);
  });

  it("sem aoFalhar: a falha resolve false e a fila segue gravando", async () => {
    const gravar = vi
      .fn()
      .mockRejectedValueOnce(new Error("sem rede"))
      .mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar });
    await expect(fila.gravarJa("op1", 1)).resolves.toBe(false);
    expect(fila.ocupada()).toBe(false);
    await expect(fila.gravarJa("op1", 2)).resolves.toBe(true);
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op1", 2],
    ]);
  });

  it("aoFalhar que lança não deixa a fila travada", async () => {
    const gravar = vi
      .fn()
      .mockRejectedValueOnce(new Error("sem rede"))
      .mockResolvedValue(undefined);
    const aoFalhar = vi.fn(() => {
      throw new Error("erro no aviso");
    });
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fila = criarFilaGravacao({ gravar, aoFalhar });
      await expect(fila.gravarJa("op1", 1)).resolves.toBe(false);
      expect(aoFalhar).toHaveBeenCalledTimes(1);
      expect(fila.ocupada()).toBe(false);
      await expect(fila.gravarJa("op1", 2)).resolves.toBe(true);
      await expect(fila.descarregar()).resolves.toBe(true);
      expect(gravar).toHaveBeenCalledTimes(2);
      expect(erroNoConsole).toHaveBeenCalledTimes(1);
    } finally {
      erroNoConsole.mockRestore();
    }
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

  it("valorPendente: o valor mais novo da chave que ainda não foi gravado", async () => {
    const g1 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockResolvedValue(undefined);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    expect(fila.valorPendente("op1")).toBeUndefined();
    fila.agendar("op1", 1);
    expect(fila.valorPendente("op1")).toBe(1);
    fila.descarregar(); // 1 em voo
    fila.agendar("op1", 2);
    expect(fila.valorPendente("op1")).toBe(2);
    expect(fila.valorPendente("op2")).toBeUndefined();
    g1.resolver();
    await microtarefas();
    expect(fila.valorPendente("op1")).toBe(2); // o 1 gravou; o 2 ainda espera
    await vi.advanceTimersByTimeAsync(1000);
    expect(gravar.mock.calls).toEqual([
      ["op1", 1],
      ["op1", 2],
    ]);
    expect(fila.valorPendente("op1")).toBeUndefined();
  });

  it("valorPendente some na falha, junto com o que esperava (a tela volta ao último gravado)", async () => {
    const g1 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa);
    const fila = criarFilaGravacao({ gravar, esperaMs: 1000 });
    fila.agendar("op1", 1);
    const p1 = fila.descarregar();
    fila.agendar("op1", 2);
    g1.rejeitar(new Error("sem rede"));
    await expect(p1).resolves.toBe(false);
    expect(fila.valorPendente("op1")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(gravar).toHaveBeenCalledTimes(1);
  });

  it("aoGravar avisa cada gravação; definirAvisos troca quem recebe, também das que já estavam na fila", async () => {
    const g1 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockResolvedValue(undefined);
    const antigos = { aoGravar: vi.fn(), aoFalhar: vi.fn() };
    const novos = { aoGravar: vi.fn(), aoFalhar: vi.fn() };
    const fila = criarFilaGravacao({ gravar, ...antigos });
    const p1 = fila.gravarJa("op1", 1);
    fila.definirAvisos(novos);
    g1.resolver();
    await expect(p1).resolves.toBe(true);
    expect(novos.aoGravar.mock.calls).toEqual([["op1", 1]]);
    gravar.mockRejectedValueOnce(new Error("RLS"));
    await expect(fila.gravarJa("op1", 2)).resolves.toBe(false);
    expect(novos.aoFalhar).toHaveBeenCalledTimes(1);
    expect(antigos.aoGravar).not.toHaveBeenCalled();
    expect(antigos.aoFalhar).not.toHaveBeenCalled();
  });

  it("aoGravar que lança não desfaz a gravação nem trava a fila", async () => {
    const gravar = vi.fn().mockResolvedValue(undefined);
    const aoGravar = vi.fn(() => {
      throw new Error("erro no aviso");
    });
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fila = criarFilaGravacao({ gravar, aoGravar });
      await expect(fila.gravarJa("op1", 1)).resolves.toBe(true);
      await expect(fila.gravarJa("op1", 2)).resolves.toBe(true);
      expect(fila.ocupada()).toBe(false);
      expect(fila.valorPendente("op1")).toBeUndefined();
      expect(erroNoConsole).toHaveBeenCalledTimes(2);
    } finally {
      erroNoConsole.mockRestore();
    }
  });
});

describe("filasPorChave (uma fila por oportunidade, no escopo do módulo)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a mesma chave devolve sempre a mesma fila; outra chave, outra fila", () => {
    const obterFila = filasPorChave({ gravar: vi.fn() });
    expect(obterFila("op1")).toBe(obterFila("op1"));
    expect(obterFila("op2")).not.toBe(obterFila("op1"));
  });

  it("a montagem nova parte do valor que ainda grava e grava depois dele (a edição não se perde)", async () => {
    const g1 = adiada();
    const gravar = vi.fn().mockReturnValueOnce(g1.promessa).mockResolvedValue(undefined);
    const obterFila = filasPorChave({ gravar, esperaMs: 1000 });
    const banco = { a: 0, b: 0 };
    // 1ª montagem: muda a célula A e sai da aba antes de 1 s (a descarga manda X na hora)
    const x = { ...banco, a: 1 };
    obterFila("op1").agendar("op1", x);
    obterFila("op1").descarregar();
    await microtarefas();
    expect(gravar.mock.calls).toEqual([["op1", x]]);
    // 2ª montagem (voltou à aba) antes de X terminar: parte de X, não do banco velho
    const fila = obterFila("op1");
    const inicial = fila.valorPendente("op1") ?? banco;
    expect(inicial).toBe(x);
    const xb = { ...inicial, b: 1 };
    fila.agendar("op1", xb);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gravar).toHaveBeenCalledTimes(1); // X + B espera X terminar
    g1.resolver();
    await microtarefas();
    expect(gravar.mock.calls).toEqual([
      ["op1", x],
      ["op1", xb],
    ]);
    expect(fila.valorPendente("op1")).toBeUndefined();
    expect(fila.ocupada()).toBe(false);
  });
});
