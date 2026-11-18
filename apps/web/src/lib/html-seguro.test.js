import { describe, it, expect } from "vitest";
import { escaparHtml, urlSegura } from "./html-seguro";

describe("escaparHtml", () => {
  it("devolve vazio para null/undefined", () => {
    expect(escaparHtml(null)).toBe("");
    expect(escaparHtml(undefined)).toBe("");
  });

  it("converte número e booleano em texto", () => {
    expect(escaparHtml(0)).toBe("0");
    expect(escaparHtml(12.5)).toBe("12.5");
    expect(escaparHtml(false)).toBe("false");
  });

  it("escapa & < > \" '", () => {
    expect(escaparHtml(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
  });

  it("neutraliza tag com evento", () => {
    const out = escaparHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<");
    expect(out).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("não escapa duas vezes de forma inesperada (& já escapado vira &amp;amp;)", () => {
    expect(escaparHtml("&amp;")).toBe("&amp;amp;");
  });

  it("mantém texto comum, acentos e quebras de linha", () => {
    expect(escaparHtml("Instalação de poste\nlinha 2")).toBe("Instalação de poste\nlinha 2");
  });
});

describe("urlSegura", () => {
  it("aceita http(s), mailto, tel e caminho relativo", () => {
    expect(urlSegura("https://exemplo.com/a.png")).toBe("https://exemplo.com/a.png");
    expect(urlSegura("http://exemplo.com")).toBe("http://exemplo.com");
    expect(urlSegura("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(urlSegura("tel:+550000000000")).toBe("tel:+550000000000");
    expect(urlSegura("/logo.png")).toBe("/logo.png");
    expect(urlSegura("./img.png")).toBe("./img.png");
  });

  it("aceita blob: e data: de imagem", () => {
    expect(urlSegura("blob:https://exemplo.com/123-abc")).toBe("blob:https://exemplo.com/123-abc");
    expect(urlSegura("data:image/png;base64,iVBORw0KGgo=")).toBe(
      "data:image/png;base64,iVBORw0KGgo="
    );
  });

  it("recusa javascript:, data: não-imagem, vbscript:, ignorando espaços e maiúsculas", () => {
    expect(urlSegura("javascript:alert(1)")).toBe("");
    expect(urlSegura("  JavaScript:alert(1)")).toBe("");
    expect(urlSegura("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(urlSegura("data:image/svg+xml,<svg onload=alert(1)>")).toBe("");
    expect(urlSegura("vbscript:msgbox(1)")).toBe("");
    expect(urlSegura("java\tscript:alert(1)")).toBe("");
  });

  it("recusa vazio e não-texto", () => {
    expect(urlSegura("")).toBe("");
    expect(urlSegura("   ")).toBe("");
    expect(urlSegura(null)).toBe("");
    expect(urlSegura(undefined)).toBe("");
    expect(urlSegura(123)).toBe("");
  });
});
