import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Guarda de regressão: os documentos de SST que citam o responsável técnico (RT) leem o RT do cadastro da
// empresa. Nenhum pode trazer o nome, o registro ou o CPF de uma pessoa escritos no código: o documento
// sairia com essa pessoa como RT de qualquer empresa, e o dado pessoal iria para o pacote público do site.
const pasta = dirname(fileURLToPath(import.meta.url));
const ler = (arquivo) => readFileSync(join(pasta, arquivo), "utf8");

const DOCUMENTOS = [
  "VisualizarAutorizacaoFormalCemigModal.jsx",
  "VisualizarDireitoRecusaModal.jsx",
];

describe("documentos de SST com responsável técnico", () => {
  for (const arquivo of DOCUMENTOS) {
    const fonte = ler(arquivo);

    it(`${arquivo}: lê o RT do cadastro da empresa`, () => {
      expect(fonte).toContain('from "@/lib/responsavel-tecnico"');
      expect(fonte).toContain("responsavelTecnicoParaDocumento(empresaAtiva)");
    });

    it(`${arquivo}: não traz CPF escrito no código`, () => {
      expect(fonte).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    });

    it(`${arquivo}: não traz número de registro em conselho escrito no código`, () => {
      // "CREA-MG 000000/D", "CREA-MG: 000000/D", "n° 000000/D"...
      expect(fonte).not.toMatch(/\b\d{4,7}\/[A-Z]\b/);
    });

    it(`${arquivo}: não traz nome de pessoa como padrão do RT`, () => {
      // o padrão antigo era `|| "Nome Sobrenome"` e `eu, <strong>Nome Sobrenome</strong>`
      expect(fonte).not.toMatch(/responsavel_tecnico_nome \|\| "/);
      expect(fonte).not.toMatch(/eu, <strong>[A-ZÀ-Ú][a-zà-ú]+ /);
      expect(fonte).not.toMatch(/Responsável Técnico: [A-ZÀ-Ú][a-zà-ú]+ [A-ZÀ-Ú]/);
    });
  }
});
