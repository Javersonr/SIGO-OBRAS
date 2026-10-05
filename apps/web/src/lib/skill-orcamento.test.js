import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { NOME_SKILL, CAMINHO_SKILL, textoSkillValido, montarZipSkill } from "./skill-orcamento";
import {
  ABA_ORCAMENTO,
  ABA_INFORMACOES,
  CABECALHOS_MODELO,
  ROTULOS_INFO,
} from "./orcamento-modelo";

const skill = readFileSync(
  new URL("../../public/skills/orcamento-prefeitura-sigo/SKILL.md", import.meta.url),
  "utf8"
);

describe("SKILL.md", () => {
  it("frontmatter com name e description válidos para o Claude", () => {
    expect(skill.startsWith("---\nname: orcamento-prefeitura-sigo\ndescription: ")).toBe(true);
    const description = /^description: (.+)$/m.exec(skill)[1];
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
    expect(skill.indexOf("\n---\n", 4)).toBeGreaterThan(0);
  });
  it("usa exatamente os nomes do modelo do SIGO", () => {
    // Tabelas e prosa do documento (o Claude lê o texto inteiro).
    for (const texto of [ABA_ORCAMENTO, ABA_INFORMACOES, ...CABECALHOS_MODELO, ...ROTULOS_INFO]) {
      expect(skill).toContain(texto);
    }
    // O que realmente grava o .xlsx é o bloco Python: as listas e os nomes das abas têm de ser
    // iguais aos de orcamento-modelo.js, na mesma ordem (o toContain acima acharia as strings
    // na prosa mesmo com o código errado).
    const python = /```python\n([\s\S]*?)\n```/.exec(skill)[1];
    const lista = (nome) =>
      JSON.parse(new RegExp(`^${nome} = (\\[[^\\]]*\\])`, "m").exec(python)[1]);
    expect(lista("CABECALHOS")).toEqual(CABECALHOS_MODELO);
    expect(lista("ROTULOS_INFO")).toEqual(ROTULOS_INFO);
    expect(python).toContain(`ws.title = "${ABA_ORCAMENTO}"`);
    expect(python).toContain(`create_sheet("${ABA_INFORMACOES}")`);
  });
});

describe("textoSkillValido", () => {
  it("aceita a skill e recusa o index.html do fallback", () => {
    expect(textoSkillValido(skill)).toBe(true);
    expect(textoSkillValido(String.fromCharCode(0xfeff) + skill)).toBe(true); // com BOM
    expect(textoSkillValido("<!doctype html><html><body>SIGO</body></html>")).toBe(false);
    expect(textoSkillValido("---\nname: outra-skill\n---\n")).toBe(false);
    expect(textoSkillValido("")).toBe(false);
    expect(textoSkillValido(null)).toBe(false);
  });
});

describe("montarZipSkill", () => {
  it("zip só com orcamento-prefeitura-sigo/SKILL.md, texto íntegro", async () => {
    const bytes = await montarZipSkill(JSZip, skill, "uint8array");
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual([`${NOME_SKILL}/SKILL.md`]);
    expect(await zip.file(`${NOME_SKILL}/SKILL.md`).async("string")).toBe(skill);
  });
  it("caminho público da skill", () => {
    expect(CAMINHO_SKILL).toBe(`/skills/${NOME_SKILL}/SKILL.md`);
  });
});
