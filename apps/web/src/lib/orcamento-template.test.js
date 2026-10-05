import { describe, it, expect } from "vitest";
import { montarRegistroTemplate } from "./orcamento-template";

const DONO_OP = { empresa_id: "emp-1", oportunidade_id: "op-1" };
const DONO_PROJ = { empresa_id: "emp-1", projeto_id: "proj-1" };

// Linhas como ficam salvas no template (linha inteira do orcamento_item)
const ETAPA = {
  id: "e1",
  numero: "1",
  etapa: true,
  tipo: null,
  descricao: "SERVIÇOS PRELIMINARES",
  codigo: null,
  fonte: null,
  unidade: null,
  quantidade: null,
  valor_unitario_ref: null,
  valor_unitario: null,
  bdi: 0,
  imposto: 0,
  valor_total: null,
  ordem: 0,
};
const IMPORTADO = {
  id: "i1",
  numero: "1.10",
  etapa: false,
  tipo: null,
  descricao: "Escavação manual de vala",
  codigo: "93358",
  fonte: "SINAPI",
  unidade: "m³",
  quantidade: 125.5,
  valor_unitario_ref: 10.48,
  valor_unitario: 9.18,
  bdi: 0,
  imposto: 0,
  valor_total: 1152.09,
  ordem: 12,
};

describe("montarRegistroTemplate", () => {
  it("item antigo (sem numero/etapa): o mapeamento de antes, com as colunas novas nulas", () => {
    const salvo = {
      id: "velho-id",
      empresa_id: "outra-empresa",
      oportunidade_id: "outra-op",
      item: "7",
      tipo: "Mão de Obra",
      descricao: "Eletricista",
      codigo: "MO1",
      unidade: "h",
      quantidade: 8,
      valor_unitario: 50,
      bdi: 25,
      imposto: 0,
      valor_total: 500,
      ordem: 3,
    };
    expect(montarRegistroTemplate(salvo, 2, DONO_OP)).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
      item: "3",
      numero: null,
      etapa: false,
      tipo: "Mão de Obra",
      descricao: "Eletricista",
      codigo: "MO1",
      fonte: null,
      unidade: "h",
      quantidade: 8,
      valor_unitario_ref: null,
      valor_unitario: 50,
      bdi: 25,
      imposto: 0,
      valor_total: 500,
      ordem: 2,
    });
  });

  it("item antigo vazio: tipo Material, unidade UN e zeros, como antes", () => {
    expect(montarRegistroTemplate({ descricao: null }, 0, DONO_PROJ)).toEqual({
      empresa_id: "emp-1",
      projeto_id: "proj-1",
      item: "1",
      numero: null,
      etapa: false,
      tipo: "Material",
      descricao: "",
      codigo: "",
      fonte: null,
      unidade: "UN",
      quantidade: 0,
      valor_unitario_ref: null,
      valor_unitario: 0,
      bdi: 0,
      imposto: 0,
      valor_total: 0,
      ordem: 0,
    });
  });

  it("etapa: número e título, sem unidade, quantidade nem valores (como na importação)", () => {
    expect(montarRegistroTemplate(ETAPA, 0, DONO_OP)).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
      item: "1",
      numero: "1",
      etapa: true,
      tipo: null,
      descricao: "SERVIÇOS PRELIMINARES",
      codigo: "",
      fonte: null,
      unidade: null,
      quantidade: null,
      valor_unitario_ref: null,
      valor_unitario: null,
      bdi: 0,
      imposto: 0,
      valor_total: null,
      ordem: 0,
    });
  });

  it("item importado: leva numero, fonte e preço de referência; o tipo continua nulo", () => {
    expect(montarRegistroTemplate(IMPORTADO, 5, DONO_PROJ)).toEqual({
      empresa_id: "emp-1",
      projeto_id: "proj-1",
      item: "1.10",
      numero: "1.10",
      etapa: false,
      tipo: null,
      descricao: "Escavação manual de vala",
      codigo: "93358",
      fonte: "SINAPI",
      unidade: "m³",
      quantidade: 125.5,
      valor_unitario_ref: 10.48,
      valor_unitario: 9.18,
      bdi: 0,
      imposto: 0,
      valor_total: 1152.09,
      ordem: 5,
    });
  });

  it("todos os registros têm as mesmas 17 chaves e nada da linha salva vaza", () => {
    const salvos = [
      ETAPA,
      IMPORTADO,
      {},
      { id: "x", created_by: "u", deleted_at: null, projeto_id: "velho", material_id: "m" },
    ];
    const regs = salvos.map((s, i) => montarRegistroTemplate(s, i, DONO_OP));
    const chaves = Object.keys(regs[0]).sort();
    expect(chaves).toHaveLength(17);
    for (const r of regs) expect(Object.keys(r).sort()).toEqual(chaves);
    for (const campo of ["id", "created_by", "deleted_at", "projeto_id", "material_id"]) {
      expect(regs[3]).not.toHaveProperty(campo);
    }
    expect(regs.map((r) => r.ordem)).toEqual([0, 1, 2, 3]);
  });
});
