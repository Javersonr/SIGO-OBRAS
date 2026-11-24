import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  MENSAGEM_SOLICITACAO_SUMIU,
  MENSAGEM_VOLTOU_PARA_APROVACAO,
  STATUS_APROVADOS,
  avaliarStatusDaSolicitacao,
  conferirSolicitacaoAprovada,
} from "./solicitacao-status";

const sigoCom = (get) => ({ entities: { SolicitacaoCompra: { get } } });

describe("STATUS_APROVADOS", () => {
  it("é o mesmo grupo da migração 0178", () => {
    const sql = readFileSync(
      new URL(
        "../../../../supabase/migrations/0178_compras_aprovacao_regras_do_dono.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(sql).toContain(
      "aprovados constant text[] := array['Aprovada', 'Em Cotação', 'Cotação Aprovada', 'Pedido Gerado'];"
    );
    expect(STATUS_APROVADOS).toEqual([
      "Aprovada",
      "Em Cotação",
      "Cotação Aprovada",
      "Pedido Gerado",
    ]);
  });
});

describe("avaliarStatusDaSolicitacao", () => {
  it("qualquer status do grupo aprovado segue", () => {
    for (const status of STATUS_APROVADOS) {
      expect(avaliarStatusDaSolicitacao({ status })).toEqual({ ok: true });
    }
  });

  it("voltou para pendente: para com a mensagem combinada", () => {
    expect(avaliarStatusDaSolicitacao({ status: "Pendente Aprovação" })).toEqual({
      ok: false,
      mensagem: MENSAGEM_VOLTOU_PARA_APROVACAO,
    });
    expect(MENSAGEM_VOLTOU_PARA_APROVACAO).toBe(
      "A solicitação voltou para aprovação porque um item foi alterado. Aprove de novo antes de continuar."
    );
  });

  it("rejeitada, cancelada ou sem status: para", () => {
    for (const status of ["Rejeitada", "Cancelada", undefined]) {
      const r = avaliarStatusDaSolicitacao({ status });
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/não pode seguir/);
    }
  });

  it("solicitação que sumiu (excluída): para", () => {
    expect(avaliarStatusDaSolicitacao(null)).toEqual({
      ok: false,
      mensagem: MENSAGEM_SOLICITACAO_SUMIU,
    });
  });
});

describe("conferirSolicitacaoAprovada", () => {
  it("lê a solicitação no banco na hora (não a da lista em memória)", async () => {
    const get = vi.fn().mockResolvedValue({ id: "s1", status: "Pendente Aprovação" });
    const r = await conferirSolicitacaoAprovada(sigoCom(get), "s1");
    expect(get).toHaveBeenCalledWith("s1");
    expect(r).toEqual({ ok: false, mensagem: MENSAGEM_VOLTOU_PARA_APROVACAO });
  });

  it("aprovada no banco: segue", async () => {
    const get = vi.fn().mockResolvedValue({ id: "s1", status: "Em Cotação" });
    expect(await conferirSolicitacaoAprovada(sigoCom(get), "s1")).toEqual({ ok: true });
  });

  it("não achou (get devolve null): para", async () => {
    const get = vi.fn().mockResolvedValue(null);
    expect(await conferirSolicitacaoAprovada(sigoCom(get), "s1")).toEqual({
      ok: false,
      mensagem: MENSAGEM_SOLICITACAO_SUMIU,
    });
  });

  it("erro de leitura: para, com a mensagem do erro", async () => {
    const get = vi.fn().mockRejectedValue(new Error("rede caiu"));
    const r = await conferirSolicitacaoAprovada(sigoCom(get), "s1");
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/rede caiu/);
  });
});
