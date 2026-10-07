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

// O teste NUNCA carrega o cliente de produção (ver CursoPortal.previa.test.jsx).
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("o portal chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import CertificadoPortal from "./CertificadoPortal";
import { MSG_CURSO_DE_APOIO } from "@/lib/portal-curso";

/** Só dados sintéticos. `renderToStaticMarkup` não roda efeitos: nada chama o servidor. */
const item = (extra = {}) => ({
  matricula: { id: "m1", status: "concluido" },
  curso: { id: "c1", nome: "Curso de teste", modalidade: "ead" },
  certificado: null,
  pode_emitir_certificado: true,
  pendencias_certificado: [],
  ...extra,
});
const html = (it) =>
  renderToStaticMarkup(
    <CertificadoPortal
      item={it}
      token="t"
      evento={() => {}}
      recarregar={async () => {}}
      tratarErro={() => {}}
    />
  );

describe("CertificadoPortal e a modalidade do curso (T8)", () => {
  it("curso de apoio concluído: só diz que não emite certificado, sem formulário nem pendências", () => {
    const saida = html(
      item({
        curso: { id: "c1", modalidade: "apoio" },
        pode_emitir_certificado: false,
        pendencias_certificado: ["Curso de apoio ao treinamento presencial: não emite certificado"],
      })
    );
    expect(saida).toContain(MSG_CURSO_DE_APOIO);
    expect(saida).not.toContain("Assine para emitir");
    expect(saida).not.toContain("aguarda a regularização");
    expect(saida).not.toContain('type="password"');
  });

  it("curso EAD que pode emitir: mostra a assinatura", () => {
    const saida = html(item());
    expect(saida).toContain("Assine para emitir");
    expect(saida).not.toContain(MSG_CURSO_DE_APOIO);
  });

  it("curso EAD com requisito pendente: lista o que falta, sem a mensagem de apoio", () => {
    const saida = html(
      item({ pode_emitir_certificado: false, pendencias_certificado: ["Informe o instrutor"] })
    );
    expect(saida).toContain("aguarda a regularização");
    expect(saida).toContain("Informe o instrutor");
    expect(saida).not.toContain(MSG_CURSO_DE_APOIO);
  });

  it("curso semipresencial: mostra o motivo que veio do servidor (a prática ainda não existe)", () => {
    const saida = html(
      item({
        curso: { id: "c1", modalidade: "semipresencial" },
        pode_emitir_certificado: false,
        pendencias_certificado: ["Curso semipresencial: o certificado só poderá ser emitido"],
      })
    );
    expect(saida).toContain("Curso semipresencial");
    expect(saida).not.toContain(MSG_CURSO_DE_APOIO);
  });

  it("certificado já emitido continua aparecendo, mesmo que o curso virasse de apoio depois", () => {
    const saida = html(
      item({
        curso: { id: "c1", modalidade: "apoio" },
        certificado: {
          codigo: "ABCD-2345-WXYZ",
          dados: { periodo: { conclusao: "2026-10-05" } },
          revogado: false,
        },
        pode_emitir_certificado: false,
      })
    );
    expect(saida).toContain("Certificado emitido");
    expect(saida).toContain("ABCD-2345-WXYZ");
    expect(saida).not.toContain(MSG_CURSO_DE_APOIO);
  });
});

describe("CertificadoPortal e o pré-requisito do curso (T23)", () => {
  const FALTA = {
    curso_id: "c0",
    nome: "Curso exigido de teste",
    atendido: false,
    motivo: "sem_matricula",
    texto:
      'Para emitir este certificado é preciso ter concluído antes o curso "Curso exigido de teste", dentro da validade. Você ainda não fez esse curso: procure o RH.',
  };
  const EM_DIA = { ...FALTA, atendido: true, motivo: "concluido", texto: "Pré-requisito em dia." };

  it("curso concluído sem o pré-requisito: diz o que falta e não mostra a assinatura nem a senha", () => {
    const saida = html(
      item({ pode_emitir_certificado: false, pre_requisito: FALTA, pendencias_certificado: [] })
    );
    expect(saida).toContain("Falta o pré-requisito");
    expect(saida).toContain("Curso exigido de teste");
    expect(saida).toContain("procure o RH");
    expect(saida).not.toContain("Assine para emitir");
    expect(saida).not.toContain('type="password"');
    // não confunde com requisito do curso a regularizar pelo RH
    expect(saida).not.toContain("aguarda a regularização");
  });

  it("pré-requisito e requisito do curso pendentes juntos: as duas explicações aparecem", () => {
    const saida = html(
      item({
        pode_emitir_certificado: false,
        pre_requisito: FALTA,
        pendencias_certificado: ["Informe o instrutor"],
      })
    );
    expect(saida).toContain("Falta o pré-requisito");
    expect(saida).toContain("aguarda a regularização");
    expect(saida).toContain("Informe o instrutor");
  });

  it("pré-requisito em dia: a assinatura aparece como sempre", () => {
    const saida = html(item({ pre_requisito: EM_DIA }));
    expect(saida).toContain("Assine para emitir");
    expect(saida).not.toContain("Falta o pré-requisito");
  });

  it("curso sem pré-requisito (null ou ausente): nada muda", () => {
    expect(html(item({ pre_requisito: null }))).toContain("Assine para emitir");
    expect(html(item())).toContain("Assine para emitir");
    const pendente = html(
      item({ pode_emitir_certificado: false, pendencias_certificado: ["Informe o instrutor"] })
    );
    expect(pendente).toContain("aguarda a regularização");
    expect(pendente).not.toContain("Falta o pré-requisito");
  });

  it("certificado já emitido não repete o aviso do pré-requisito", () => {
    const saida = html(
      item({
        pre_requisito: FALTA,
        pode_emitir_certificado: false,
        certificado: {
          codigo: "ABCD-2345-WXYZ",
          dados: { periodo: { conclusao: "2026-10-05" } },
          revogado: false,
        },
      })
    );
    expect(saida).toContain("Certificado emitido");
    expect(saida).not.toContain("Falta o pré-requisito");
  });
});
