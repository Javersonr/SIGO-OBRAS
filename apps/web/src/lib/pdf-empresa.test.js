import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// pdf-empresa importa o sigoClient (sessão do Supabase), que não existe no ambiente do teste
vi.mock("@/api/sigoClient", () => ({ resolveStorageUrl: vi.fn() }));

import { logoParaPdfDeUrl } from "./pdf-empresa";

const URL_ASSINADA = "https://armazenamento.exemplo/logos/logo.png?token=sintetico";

/** FileReader e Image de mentira (o teste roda no Node, sem DOM): devolvem sempre o mesmo logo 200x80. */
function instalarNavegadorDeMentira({ imagemValida = true } = {}) {
  vi.stubGlobal(
    "FileReader",
    class {
      readAsDataURL() {
        this.result = "data:image/png;base64,AAAA";
        queueMicrotask(() => this.onload());
      }
    }
  );
  vi.stubGlobal(
    "Image",
    class {
      set src(_valor) {
        this.naturalWidth = 200;
        this.naturalHeight = 80;
        queueMicrotask(() => (imagemValida ? this.onload() : this.onerror(new Error("imagem"))));
      }
    }
  );
}

beforeEach(() => instalarNavegadorDeMentira());
afterEach(() => vi.unstubAllGlobals());

describe("logoParaPdfDeUrl", () => {
  it("baixa a URL assinada e devolve o logo no formato do PDF (dataUrl + tamanho)", async () => {
    const fetchFalso = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) }));
    vi.stubGlobal("fetch", fetchFalso);
    const logo = await logoParaPdfDeUrl(URL_ASSINADA);
    expect(logo).toEqual({ dataUrl: "data:image/png;base64,AAAA", w: 200, h: 80 });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(fetchFalso.mock.calls[0][0]).toBe(URL_ASSINADA);
  });

  it("sem URL, ou com o que não é http(s) (ref crua, data:, javascript:), nem tenta baixar", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    for (const v of [null, undefined, "", "   ", 42, {}, "logos-empresa/x/logo.png"]) {
      expect(await logoParaPdfDeUrl(v)).toBeNull();
    }
    expect(await logoParaPdfDeUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(await logoParaPdfDeUrl("javascript:alert(1)")).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("resposta de erro (URL assinada vencida, arquivo sumido) = sem logo, sem estourar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, blob: async () => new Blob(["{}"]) }))
    );
    expect(await logoParaPdfDeUrl(URL_ASSINADA)).toBeNull();
  });

  it("falha de rede = sem logo, sem estourar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    expect(await logoParaPdfDeUrl(URL_ASSINADA)).toBeNull();
  });

  it("arquivo que não é imagem (o navegador não decodifica) = sem logo", async () => {
    instalarNavegadorDeMentira({ imagemValida: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["texto"]) }))
    );
    expect(await logoParaPdfDeUrl(URL_ASSINADA)).toBeNull();
  });

  it("rede que trava não prende o botão do aluno: passado o limite, desiste e devolve null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, rejeitar) => {
            signal.addEventListener("abort", () =>
              rejeitar(new DOMException("abort", "AbortError"))
            );
          })
      )
    );
    expect(await logoParaPdfDeUrl(URL_ASSINADA, { limiteMs: 20 })).toBeNull();
  });
});
