import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PERFIS_ADMINISTRADOR,
  ehAdministrador,
  ehSolicitante,
  solicitanteNaoPodeDecidir,
} from "./compras-aprovacao";

const user = { id: "u1", full_name: "Pessoa Sintética" };
const minha = { solicitante_id: "u1", solicitante_nome: "Pessoa Sintética" };
const deOutro = { solicitante_id: "u2", solicitante_nome: "Outra Pessoa" };
const vinculo = (perfil, extra = {}) => ({ perfil, ativo: true, deleted_at: null, ...extra });

describe("ehAdministrador", () => {
  it("super admin, Admin e Admin Holding (os mesmos do usuario_eh_administrador da 0178)", () => {
    expect(PERFIS_ADMINISTRADOR).toEqual(["Admin", "Admin Holding"]);
    expect(ehAdministrador({ isSuperAdmin: true, vinculo: null })).toBe(true);
    expect(ehAdministrador({ isSuperAdmin: false, vinculo: vinculo("Admin") })).toBe(true);
    expect(ehAdministrador({ isSuperAdmin: false, vinculo: vinculo("Admin Holding") })).toBe(true);
  });

  it("a migração 0178 usa a mesma lista de perfis", () => {
    const sql = readFileSync(
      new URL(
        "../../../../supabase/migrations/0178_compras_aprovacao_regras_do_dono.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(sql).toMatch(/ue\.perfil in \('Admin', 'Admin Holding'\)/);
  });

  it("outros perfis, dono sem perfil Admin e vínculo inativo/excluído: não", () => {
    expect(ehAdministrador({ isSuperAdmin: false, vinculo: vinculo("Compras") })).toBe(false);
    expect(
      ehAdministrador({ isSuperAdmin: false, vinculo: vinculo("Compras", { is_owner: true }) })
    ).toBe(false);
    expect(
      ehAdministrador({ isSuperAdmin: false, vinculo: vinculo("Admin", { ativo: false }) })
    ).toBe(false);
    expect(
      ehAdministrador({
        isSuperAdmin: false,
        vinculo: vinculo("Admin", { deleted_at: "2026-01-01" }),
      })
    ).toBe(false);
    expect(ehAdministrador({ isSuperAdmin: false, vinculo: null })).toBe(false);
  });

  it("ativo nulo conta como ativo (igual ao banco)", () => {
    expect(
      ehAdministrador({ isSuperAdmin: false, vinculo: vinculo("Admin", { ativo: null }) })
    ).toBe(true);
  });
});

describe("ehSolicitante", () => {
  it("pelo id ou pelo nome (sem diferenciar maiúsculas)", () => {
    expect(ehSolicitante(minha, user)).toBe(true);
    expect(ehSolicitante({ solicitante_nome: "pessoa sintética " }, user)).toBe(true);
    expect(ehSolicitante(deOutro, user)).toBe(false);
  });

  it("nome vazio dos dois lados não faz de todo mundo solicitante", () => {
    expect(ehSolicitante({ solicitante_nome: "" }, { id: "u9", full_name: "" })).toBe(false);
    expect(ehSolicitante({}, { id: "u9" })).toBe(false);
    expect(ehSolicitante(null, user)).toBe(false);
  });
});

describe("solicitanteNaoPodeDecidir", () => {
  it("solicitante comum: esconde Aprovar/Reprovar", () => {
    expect(
      solicitanteNaoPodeDecidir({
        solicitacao: minha,
        user,
        isSuperAdmin: false,
        vinculo: vinculo("Compras"),
      })
    ).toBe(true);
  });

  it("solicitante administrador (Admin, Admin Holding, super admin): mostra", () => {
    for (const p of [
      { isSuperAdmin: false, vinculo: vinculo("Admin") },
      { isSuperAdmin: false, vinculo: vinculo("Admin Holding") },
      { isSuperAdmin: true, vinculo: null },
    ]) {
      expect(solicitanteNaoPodeDecidir({ solicitacao: minha, user, ...p })).toBe(false);
    }
  });

  it("quem não pediu: mostra (as faixas de aprovação seguem valendo no banco)", () => {
    expect(
      solicitanteNaoPodeDecidir({
        solicitacao: deOutro,
        user,
        isSuperAdmin: false,
        vinculo: vinculo("Compras"),
      })
    ).toBe(false);
  });
});
