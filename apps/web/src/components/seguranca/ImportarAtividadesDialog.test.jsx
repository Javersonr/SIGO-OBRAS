import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção: a RPC lança se for chamada.
vi.mock("@/api/sigoClient", () => ({
  supabase: {
    rpc: vi.fn(() => {
      throw new Error("o diálogo chamou o banco durante o teste");
    }),
  },
  sigo: {},
  resolveStorageUrl: vi.fn(),
}));

// O Dialog do Radix usa portal (precisa de `document`): aqui ele só entrega o conteúdo quando está aberto.
vi.mock("@/components/ui/dialog", () => {
  const Passa = ({ children }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: Passa,
    DialogHeader: Passa,
    DialogFooter: Passa,
    DialogTitle: Passa,
    DialogDescription: Passa,
  };
});

// O Select do Radix trocado por caixas simples: o teste confere o valor escolhido e as opções.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }) => <div data-valor={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <span data-opcao={value}>{children}</span>,
}));

import ImportarAtividadesDialog, {
  ErrosDoArquivo,
  PreviaDaImportacao,
  PreviaPorVideo,
} from "./ImportarAtividadesDialog";
import {
  FORMATO_POR_VIDEO,
  MODULO_NOVO,
  TEMPOS_PADRAO,
  lerPacoteDeAtividades,
  lerQuestionariosPorVideo,
  planejarImportacao,
  planejarImportacaoPorVideo,
} from "@/lib/ead-atividades-importar";

/**
 * Diálogo "Importar atividades" (atividades interativas, A7). `renderToStaticMarkup` não roda efeitos nem
 * cliques: confere o passo 1 e as duas prévias; a leitura, o plano e o payload estão em
 * lib/ead-atividades-importar.test.js. Só dados sintéticos.
 */
const semOperacao = () => {};
const opcao = (texto, segura, proxima) => ({
  texto,
  feedback: `Comentário: ${texto}`,
  segura,
  proxima,
});
const PACOTE = [
  {
    id: "M1",
    titulo: "Introdução sintética",
    casos: [
      {
        titulo: "Caso sintético",
        contexto: "Contexto.",
        etapas: [
          {
            id: "e1",
            pergunta: "Decisão?",
            opcoes: [opcao("Segura", true, null), opcao("Insegura", false, "e1")],
          },
        ],
        reflexao: "Reflexão.",
      },
    ],
    questoes: [
      { enunciado: "Pergunta 1?", opcoes: ["a", "b"], correta: 0, explicacao: "Porque a." },
      { enunciado: "Pergunta 2?", opcoes: ["a", "b"], correta: 5, explicacao: "" },
    ],
    estudo: [
      { titulo: "Tarefa sintética", instrucoes: "Faça.", evidencia: "Foto.", tempoEstimadoMin: 30 },
    ],
  },
  { id: "M2", titulo: "Sem atividades", casos: [], questoes: [], estudo: [] },
];
const MODULOS = ["M1 · Introdução", "M2 · Outro"];

describe("ImportarAtividadesDialog", () => {
  it("fechado não desenha nada", () => {
    expect(
      renderToStaticMarkup(
        <ImportarAtividadesDialog
          aberto={false}
          onFechar={semOperacao}
          curso={{ id: "c1" }}
          aulas={[]}
        />
      )
    ).toBe("");
  });

  it("aberto começa no passo 1: escolher o arquivo .json (nada é gravado antes do Confirmar)", () => {
    const html = renderToStaticMarkup(
      <ImportarAtividadesDialog
        aberto
        onFechar={semOperacao}
        curso={{ id: "c1", nome: "Curso Sintético" }}
        aulas={[]}
        onImportado={semOperacao}
      />
    );
    expect(html).toContain("Importar atividades");
    expect(html).toContain("Passo 1 de 3");
    expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain("Escolher o arquivo");
    expect(html).not.toContain("Confirmar e importar");
  });
});

describe("PreviaDaImportacao (pacote do material)", () => {
  const plano = planejarImportacao({
    pacote: lerPacoteDeAtividades(PACOTE),
    modulosDoCurso: MODULOS,
    codigosExistentes: ["M1-T1"],
    tempos: TEMPOS_PADRAO,
    escolhaDeModulo: {},
  });
  const html = renderToStaticMarkup(
    <PreviaDaImportacao
      plano={plano}
      modulosDoCurso={MODULOS}
      semAtividades={["M2"]}
      tempos={{ questionarioMin: "15", casoMin: "10" }}
      onTempos={semOperacao}
      onEscolha={semOperacao}
      desmarcados={new Set()}
      onAlternar={semOperacao}
    />
  );

  it("mostra o módulo do arquivo, o módulo do curso casado pelo código e a opção de módulo novo", () => {
    expect(html).toContain("M1 · Introdução sintética");
    expect(html).toContain('data-valor="M1 · Introdução"');
    expect(html).toContain("casado pelo código");
    expect(html).toContain(`data-opcao="${MODULO_NOVO}"`);
    expect(html).toContain("Módulos do arquivo sem atividades: M2.");
  });

  it("cada atividade com o problema que bloqueia, e a que já existe sai desmarcada e travada", () => {
    expect(html).toContain("M1 · Caso 1: Caso sintético");
    expect(html).toContain("Questão 2: sem resposta certa");
    expect(html).toContain("já existe — será pulada");
    const tarefa = html.match(
      /<input type="checkbox"[^>]*aria-label="Importar M1 · Atividade de estudo 1: [^"]*"[^>]*>/
    );
    expect(tarefa?.[0]).toContain('disabled=""');
    expect(tarefa?.[0]).not.toContain("checked");
  });

  it("os tempos padrão são editáveis", () => {
    expect(html).toContain('id="importar-tempo-questionario"');
    expect(html).toContain('id="importar-tempo-caso"');
  });
});

describe("PreviaPorVideo (exercícios pós-vídeo)", () => {
  const aulas = [
    {
      id: "v1",
      ordem: 1,
      tipo: "video",
      modulo: "SEP 1",
      titulo: "Vídeo sintético",
      video_ref: "treinamentos/emp/2026/10/1a2b-S02A.mp4",
    },
  ];
  const arquivo = lerQuestionariosPorVideo({
    tipo: FORMATO_POR_VIDEO,
    itens: [
      {
        video: "S02A",
        questoes: [{ pergunta: "P1?", opcoes: ["a", "b"], correta: 1, comentario: "c" }],
      },
      {
        video: "S09Z",
        questoes: [{ pergunta: "P2?", opcoes: ["a", "b"], correta: 0, comentario: "c" }],
      },
    ],
  });
  const plano = planejarImportacaoPorVideo({ arquivo, aulas, codigosExistentes: [] });
  const html = renderToStaticMarkup(
    <PreviaPorVideo
      plano={plano}
      minutos="5"
      onMinutos={semOperacao}
      desmarcados={new Set()}
      onAlternar={semOperacao}
    />
  );

  it("por vídeo: o código, a aula achada, quantas questões e os problemas", () => {
    expect(html).toContain("Exercícios do vídeo: Vídeo sintético");
    expect(html).toContain("Vídeo S02A · depois da aula Vídeo sintético · 1 questão · 5 min");
    expect(html).toContain("vídeo S09Z não encontrado neste curso");
    expect(html).toContain('id="importar-tempo-pos-video"');
  });
});

describe("ErrosDoArquivo (o que o leitor recusou ou descartou)", () => {
  it("lista cada erro num alerta, com o título e a dica", () => {
    const html = renderToStaticMarkup(
      <ErrosDoArquivo
        erros={["O módulo M2 aparece mais de uma vez no arquivo.", "O 3º módulo não tem o código."]}
        titulo="O arquivo tem erros:"
        dica="Corrija e escolha de novo."
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("O arquivo tem erros:");
    expect(html).toContain("O módulo M2 aparece mais de uma vez no arquivo.");
    expect(html).toContain("O 3º módulo não tem o código.");
    expect(html).toContain("Corrija e escolha de novo.");
  });

  it("sem erros não desenha nada; o título padrão é o do passo 1", () => {
    expect(renderToStaticMarkup(<ErrosDoArquivo erros={[]} />)).toBe("");
    expect(renderToStaticMarkup(<ErrosDoArquivo />)).toBe("");
    expect(renderToStaticMarkup(<ErrosDoArquivo erros={["x"]} />)).toContain(
      "O arquivo não pode ser importado:"
    );
  });
});
