import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Portal do aluno e validação pública sem emoji nos textos da tela (T36). O emoji muda de cara em
 * cada aparelho (e some em celular antigo); o que precisa de destaque usa ícone do `lucide-react`.
 * O teste lê o código-fonte: cobre texto de componente e as mensagens montadas em `lib/`. Não vale
 * para mensagem de WhatsApp (`lib/portal-funcionario-acesso.js`), que não é tela do portal.
 */
const aqui = (caminho) => new URL(caminho, import.meta.url);
const ler = (caminho) => readFileSync(fileURLToPath(aqui(caminho)), "utf8");

// pictogramas e dingbats (✅ ❌ ✓ ⚠ ★), símbolos extras (⭐ ⬆) e o seletor de emoji; setas e "×" ficam de fora
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

const componentes = readdirSync(fileURLToPath(aqui("./")))
  .filter((nome) => nome.endsWith(".jsx") && !nome.includes(".test."))
  .map((nome) => `./${nome}`);

const ARQUIVOS = [
  ...componentes,
  "../../pages/PortalFuncionario.jsx",
  "../../pages/ValidarCertificado.jsx",
  "../../lib/portal-curso.js",
  "../../lib/portal-video.js",
  "../../lib/portal-ciencias.js",
  "../../lib/validacao-certificado.js",
  "../../lib/certificado-ead.js",
];

const comEmoji = (caminho) =>
  ler(caminho)
    .split("\n")
    .map((linha, i) => ({ n: i + 1, linha }))
    .filter(({ linha }) => EMOJI.test(linha))
    .map(({ n, linha }) => `${caminho}:${n}: ${linha.trim()}`);

describe("textos da tela do portal e da validação", () => {
  it("a lista de arquivos conferidos pega os componentes do portal", () => {
    expect(componentes).toContain("./CursoPortal.jsx");
    expect(componentes).toContain("./AvaliacaoPortal.jsx");
    expect(componentes).toContain("./CertificadoPortal.jsx");
    expect(componentes).toContain("./CienciasPortal.jsx");
  });

  it("nenhum arquivo tem emoji", () => {
    expect(ARQUIVOS.flatMap(comEmoji)).toEqual([]);
  });
});
