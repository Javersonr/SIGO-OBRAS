// node --test supabase/functions/_shared/conector/acesso.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avaliarAcesso,
  empresaLiberada,
  lerPermissoes,
  modulosDoPlano,
  revogadaPelaTrocaDeSenha,
  temPermissaoServidor,
  type EntradaAcesso,
} from "./acesso.ts";

const perm = {
  Oportunidades: {
    Lista: { visualizar: true, criar: true, editar: false },
    Arquivos: { criar: true },
  },
};

test("lerPermissoes: objeto, jsonb-string (simples e dupla) e lixo", () => {
  assert.deepEqual(lerPermissoes(perm), perm);
  assert.deepEqual(lerPermissoes(JSON.stringify(perm)), perm);
  assert.deepEqual(lerPermissoes(JSON.stringify(JSON.stringify(perm))), perm);
  assert.deepEqual(lerPermissoes("{}"), {});
  assert.deepEqual(lerPermissoes(null), {});
  assert.deepEqual(lerPermissoes("não json"), {});
});

test("temPermissaoServidor: espelha o temPermissao do Layout", () => {
  const v = { perfil: "Gestor", permissoes: perm };
  assert.equal(temPermissaoServidor(v, "Oportunidades"), true);
  assert.equal(temPermissaoServidor(v, "Oportunidades", "Lista"), true);
  assert.equal(temPermissaoServidor(v, "Oportunidades", "Lista", "criar"), true);
  assert.equal(temPermissaoServidor(v, "Oportunidades", "Lista", "editar"), false);
  assert.equal(temPermissaoServidor(v, "Financeiro", "Despesas", "criar"), false);
  // aba booleana direta
  assert.equal(temPermissaoServidor({ permissoes: { M: { A: true } } }, "M", "A"), true);
  // Admin e owner liberam tudo
  assert.equal(temPermissaoServidor({ perfil: "Admin" }, "Financeiro", "X", "y"), true);
  assert.equal(
    temPermissaoServidor({ perfil: "Gestor", is_owner: true }, "Financeiro", "X", "y"),
    true
  );
});

test("modulosDoPlano: objeto ou jsonb-string, só true conta", () => {
  assert.deepEqual(modulosDoPlano({ Oportunidades: true, Financeiro: false }), {
    Oportunidades: true,
    Financeiro: false,
  });
  assert.deepEqual(modulosDoPlano('{"Oportunidades":true}'), { Oportunidades: true });
  assert.deepEqual(modulosDoPlano({ Oportunidades: "sim" }), { Oportunidades: false });
  assert.deepEqual(modulosDoPlano(null), {});
});

test("empresaLiberada: conector ligado + ativa + Oportunidades em algum plano", () => {
  const e = { ativo: true, deleted_at: null, conector_claude: true };
  assert.equal(empresaLiberada(e, [{ Oportunidades: true }]), true);
  assert.equal(empresaLiberada({ ...e, conector_claude: false }, [{ Oportunidades: true }]), false);
  assert.equal(empresaLiberada({ ...e, ativo: false }, [{ Oportunidades: true }]), false);
  assert.equal(empresaLiberada(e, [{ Oportunidades: false }]), false);
  assert.equal(empresaLiberada(e, []), false);
  assert.equal(empresaLiberada(null, [{ Oportunidades: true }]), false);
});

const AGORA = new Date("2026-10-01T12:00:00Z");
const base = (): EntradaAcesso => ({
  chave: { expira_em: "2026-10-01T13:00:00Z", revogada_em: null },
  autorizacao: { usuario_email: "ana@x.com", revogado_em: null },
  usuario: { email: "Ana@x.com", ativo: true, deleted_at: null },
  vinculo: { perfil: "Gestor", ativo: true, deleted_at: null, permissoes: perm },
  empresa: { ativo: true, deleted_at: null, conector_claude: true },
  modulosDosPlanos: [{ Oportunidades: true }],
});

test("avaliarAcesso: tudo certo → ok", () => {
  assert.deepEqual(avaliarAcesso(base(), AGORA), { ok: true });
});

test("avaliarAcesso: ordem das negações", () => {
  const casos: [Partial<EntradaAcesso>, string][] = [
    [{ chave: null }, "chave_invalida"],
    [{ chave: { expira_em: "2026-10-01T11:00:00Z", revogada_em: null } }, "chave_invalida"],
    [
      { chave: { expira_em: "2026-10-01T13:00:00Z", revogada_em: "2026-10-01T10:00:00Z" } },
      "chave_invalida",
    ],
    [
      { autorizacao: { usuario_email: "ana@x.com", revogado_em: "2026-09-30T00:00:00Z" } },
      "chave_invalida",
    ],
    [{ usuario: { email: "ana@x.com", ativo: false, deleted_at: null } }, "usuario_inativo"],
    [{ usuario: { email: "outra@x.com", ativo: true, deleted_at: null } }, "usuario_inativo"],
    [{ vinculo: null }, "sem_vinculo"],
    [{ vinculo: { perfil: "Admin", ativo: false, deleted_at: null } }, "sem_vinculo"],
    [
      { empresa: { ativo: true, deleted_at: null, conector_claude: false } },
      "empresa_sem_conector",
    ],
    [{ modulosDosPlanos: [{ Oportunidades: false }] }, "sem_modulo"],
  ];
  for (const [mudanca, motivo] of casos) {
    assert.deepEqual(
      avaliarAcesso({ ...base(), ...mudanca }, AGORA),
      { ok: false, motivo },
      motivo
    );
  }
});

test("revogadaPelaTrocaDeSenha: autorização criada ANTES da troca de senha", () => {
  assert.equal(revogadaPelaTrocaDeSenha("2026-09-20T10:00:00Z", "2026-09-25T10:00:00Z"), true);
  assert.equal(revogadaPelaTrocaDeSenha("2026-09-26T10:00:00Z", "2026-09-25T10:00:00Z"), false);
  // senha nunca trocada desde a 0124 (coluna nula) ou autorização sem data
  assert.equal(revogadaPelaTrocaDeSenha("2026-09-20T10:00:00Z", null), false);
  assert.equal(revogadaPelaTrocaDeSenha("2026-09-20T10:00:00Z", undefined), false);
  assert.equal(revogadaPelaTrocaDeSenha(undefined, "2026-09-25T10:00:00Z"), false);
  // mesmo instante não revoga (só o que é estritamente anterior)
  assert.equal(revogadaPelaTrocaDeSenha("2026-09-25T10:00:00Z", "2026-09-25T10:00:00Z"), false);
  // formatos do Postgres (+00:00, microssegundos) e do JS (Z, milissegundos)
  assert.equal(
    revogadaPelaTrocaDeSenha("2026-09-25T10:00:00.123456+00:00", "2026-09-25T10:00:00.500Z"),
    true
  );
});

test("avaliarAcesso: troca de senha depois da autorização → chave_invalida (revogação implícita)", () => {
  const e = base();
  e.autorizacao = { ...e.autorizacao!, criado_em: "2026-09-20T10:00:00Z" };
  e.usuario = { ...e.usuario!, senha_alterada_em: "2026-09-25T10:00:00Z" };
  assert.deepEqual(avaliarAcesso(e, AGORA), { ok: false, motivo: "chave_invalida" });
});

test("avaliarAcesso: autorização criada depois da troca de senha segue valendo", () => {
  const e = base();
  e.autorizacao = { ...e.autorizacao!, criado_em: "2026-09-26T10:00:00Z" };
  e.usuario = { ...e.usuario!, senha_alterada_em: "2026-09-25T10:00:00Z" };
  assert.deepEqual(avaliarAcesso(e, AGORA), { ok: true });
  // senha nunca trocada (coluna nula) também vale
  e.usuario = { ...e.usuario!, senha_alterada_em: null };
  assert.deepEqual(avaliarAcesso(e, AGORA), { ok: true });
});

test("avaliarAcesso: Admin DESATIVADO não passa (ativo antes do atalho de Admin)", () => {
  const e = {
    ...base(),
    vinculo: { perfil: "Admin", is_owner: true, ativo: false, deleted_at: null },
  };
  assert.deepEqual(avaliarAcesso(e, AGORA), { ok: false, motivo: "sem_vinculo" });
});
