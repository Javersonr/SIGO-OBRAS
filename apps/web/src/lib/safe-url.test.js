import { describe, it, expect } from "vitest";
import { safeUrl } from "./safe-url";

// Proteção contra XSS via href/window.open com dado vindo do banco.
// Bloqueia javascript:/data:/vbscript:; libera http(s)/mailto/tel e relativos.

describe("safeUrl", () => {
  it("permite caminhos relativos e âncoras", () => {
    expect(safeUrl("/Estoque")).toBe("/Estoque");
    expect(safeUrl("#topo")).toBe("#topo");
    expect(safeUrl("./pasta")).toBe("./pasta");
    expect(safeUrl("../pasta")).toBe("../pasta");
    expect(safeUrl("rel/ativo")).toBe("rel/ativo");
  });
  it("permite protocolos seguros", () => {
    expect(safeUrl("https://sigoobras.com.br")).toBe("https://sigoobras.com.br");
    expect(safeUrl("http://exemplo.com")).toBe("http://exemplo.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("tel:+5531999999999")).toBe("tel:+5531999999999");
  });
  it("BLOQUEIA protocolos perigosos (→ #)", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("JavaScript:alert(1)")).toBe("#"); // case-insensitive
    expect(safeUrl("data:text/html,<script>")).toBe("#");
    expect(safeUrl("vbscript:msgbox(1)")).toBe("#");
  });
  it("vazio/nulo/não-string → #", () => {
    expect(safeUrl("")).toBe("#");
    expect(safeUrl("   ")).toBe("#");
    expect(safeUrl(null)).toBe("#");
    expect(safeUrl(undefined)).toBe("#");
    expect(safeUrl(123)).toBe("#");
  });
});
