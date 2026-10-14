/** Amostras sintéticas compartilhadas pelos testes de imagem, .docx e PDF das declarações. */
import type { DadosDeclaracao } from "../declaracoes.ts";

/** PNG de 1 x 1 pixel. */
export const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ),
  (c) => c.charCodeAt(0)
);

/** Declaração sintética (empresa, órgão e representante fictícios). */
export const DADOS: DadosDeclaracao = {
  empresa: {
    nome: "Empresa Teste Construções & Serviços Ltda",
    cnpj: "11.222.333/0001-81",
    endereco: "Rua das Obras, 100 - Centro - Cidade/MG - CEP 38000-000",
    contato: "Telefone: (34) 3333-0000 | E-mail: contato@exemplo.test",
  },
  titulo: "Declaração de que não emprega menor",
  destinatario: "Prefeitura Municipal de Exemplo",
  referencia: "Ref.: CE 009/2026 — Iluminação pública <LED>",
  paragrafos: [
    "A empresa DECLARA, sob as penas da lei, que não emprega menor.",
    "Por ser verdade, firma a presente.",
  ],
  localData: "Cidade/MG, 13 de outubro de 2026",
  representante: { nome: "Fulana de Tal", cargo: "Sócia-administradora", cpf: "529.982.247-25" },
};
