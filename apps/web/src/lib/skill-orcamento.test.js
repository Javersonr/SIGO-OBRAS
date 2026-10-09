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
import { ABA_CRONOGRAMA, cabecalhoCronograma } from "./cronograma-modelo";
import { MAX_MESES } from "./cronograma-ff";
import {
  CAMPOS_INFORMACOES_CONECTOR,
  CAMPOS_LINHA_CONECTOR,
} from "../../../../supabase/functions/_shared/orcamento/modelo.ts";
import { NOMES_FERRAMENTAS } from "../../../../supabase/functions/_shared/conector/permissoes-ferramentas.ts";

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
  it("aba Cronograma com o nome, o cabeçalho e o limite de meses do SIGO", () => {
    for (const texto of [ABA_CRONOGRAMA, ...cabecalhoCronograma(2)]) {
      expect(skill).toContain(texto);
    }
    const python = /```python\n([\s\S]*?)\n```/.exec(skill)[1];
    const fixo = /^CABECALHO_CRONOGRAMA = (\[[^\]]*\])/m.exec(python)[1];
    expect(JSON.parse(fixo)).toEqual(cabecalhoCronograma(0)); // ["Item", "Descrição"]
    const mes1 = cabecalhoCronograma(1)[2]; // "Mês 1"
    expect(python).toContain(`PREFIXO_MES = "${mes1.slice(0, -1)}"`);
    expect(python).toContain(`create_sheet("${ABA_CRONOGRAMA}")`);
    expect(python).toContain(`MAX_MESES = ${MAX_MESES}`);
    expect(python).toContain(`["Orçamento", "Informações", "${ABA_CRONOGRAMA}"]`);
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

describe("SKILL.md com o conector do SIGO Obras", () => {
  const secao = skill.slice(skill.indexOf("## Com o conector do SIGO Obras"));

  it("tem a seção, avisada no começo do documento", () => {
    expect(skill.indexOf("## Com o conector do SIGO Obras")).toBeGreaterThan(0);
    const intro = skill.slice(0, skill.indexOf("## Resultado"));
    expect(intro).toContain("**Com o conector do SIGO Obras**");
  });
  it("cita as 5 ferramentas da parte D, o gerar_link_envio e como saber se o conector existe", () => {
    const nomes = [
      "empresa_atual",
      "importar_orcamento",
      "aplicar_desconto",
      "importar_cronograma",
      "registrar_proposta",
      "ler_orcamento",
      "gerar_link_envio",
      "buscar_oportunidades",
      "registrar_arquivos",
    ];
    for (const nome of nomes) {
      expect(secao).toContain(`\`${nome}\``);
      // o nome citado na skill tem de ser uma ferramenta que o servidor realmente expõe
      expect(NOMES_FERRAMENTAS).toContain(nome);
    }
  });
  it("cada campo de linhas[] e de informacoes do conector aparece em crase", () => {
    for (const campo of [...CAMPOS_LINHA_CONECTOR, ...CAMPOS_INFORMACOES_CONECTOR]) {
      expect(secao).toContain(`\`${campo}\``);
    }
  });
  it("gravações na ordem, desconto perguntado antes, substituir só com confirmação, pasta e PDF", () => {
    const passo5 = secao.slice(secao.indexOf("5. Grave nesta ordem"));
    const posicoes = [
      "importar_orcamento",
      "aplicar_desconto",
      "importar_cronograma",
      "registrar_proposta",
    ].map((n) => passo5.indexOf(`\`${n}\``));
    expect(posicoes.every((p) => p > 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    expect(secao.indexOf("pergunte o desconto")).toBeLessThan(
      secao.indexOf("5. Grave nesta ordem")
    );
    expect(secao).toContain("`substituir: true`");
    expect(secao).toContain("Envelope 01 – Proposta");
    expect(secao).toContain("**Exportar proposta**");
    expect(secao).toContain("**Exportar cronograma**");
  });
});
