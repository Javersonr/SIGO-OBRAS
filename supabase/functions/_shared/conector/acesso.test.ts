// node --test supabase/functions/_shared/conector/acesso.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// ---------------------------------------------------------------------------------------------------------------
// T33: a tabela de casos que a função SQL public.tem_permissao (migração 0147) repete IGUAL no smoke
// tools/smoke-permissoes-ead.sql (mesmo id, mesma resposta). O lado TypeScript é o vinculoDoChamador do
// funcionario-acesso (vínculo ativo e não excluído) + temPermissaoServidor; o lado SQL lê usuario_empresa pelo
// e-mail e pela empresa do token. Regra em dois lugares (R3 do spec): este teste também confere que o smoke tem
// cada caso com a mesma resposta, para uma mudança num lado não passar sem a do outro.
const M = "Segurança do Trabalho";
const EAD = "Treinamentos EAD";
const eadEditar = { [M]: { [EAD]: { editar: true } } };
type Caso = {
  id: string;
  vinculo: Record<string, unknown> | null;
  consulta: [string, string | null, string | null];
  esperado: boolean;
};
const v = (permissoes: unknown, extra: Record<string, unknown> = {}) => ({
  perfil: "Gestor",
  is_owner: false,
  ativo: true,
  deleted_at: null,
  permissoes,
  ...extra,
});
const CASOS_TEM_PERMISSAO: Caso[] = [
  { id: "P01_sem_vinculo", vinculo: null, consulta: [M, EAD, null], esperado: false },
  {
    id: "P02_vinculo_inativo",
    vinculo: v(eadEditar, { ativo: false }),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  {
    id: "P03_vinculo_ativo_nulo",
    vinculo: v(eadEditar, { ativo: null }),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  {
    id: "P04_vinculo_excluido",
    vinculo: v(eadEditar, { deleted_at: "2026-10-01T00:00:00Z" }),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  {
    id: "P05_admin",
    vinculo: v(null, { perfil: "Admin" }),
    consulta: [M, EAD, "publicar"],
    esperado: true,
  },
  {
    id: "P06_dono",
    vinculo: v({}, { is_owner: true }),
    consulta: [M, EAD, "publicar"],
    esperado: true,
  },
  {
    id: "P07_admin_inativo",
    vinculo: v(null, { perfil: "Admin", ativo: false }),
    consulta: [M, EAD, "publicar"],
    esperado: false,
  },
  {
    id: "P08_aba_true",
    vinculo: v({ [M]: { [EAD]: true } }),
    consulta: [M, EAD, null],
    esperado: true,
  },
  {
    id: "P09_aba_true_com_funcao",
    vinculo: v({ [M]: { [EAD]: true } }),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  { id: "P10_funcao_true", vinculo: v(eadEditar), consulta: [M, EAD, "editar"], esperado: true },
  {
    id: "P11_funcao_false",
    vinculo: v({ [M]: { [EAD]: { editar: false, visualizar: true } } }),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  {
    id: "P12_qualquer_funcao_da_aba",
    vinculo: v({ [M]: { [EAD]: { matricular: true } } }),
    consulta: [M, EAD, null],
    esperado: true,
  },
  {
    id: "P13_aba_sem_funcao_true",
    vinculo: v({ [M]: { [EAD]: { editar: false } } }),
    consulta: [M, EAD, null],
    esperado: false,
  },
  {
    id: "P14_aba_false",
    vinculo: v({ [M]: { [EAD]: false } }),
    consulta: [M, EAD, null],
    esperado: false,
  },
  {
    id: "P15_so_modulo",
    vinculo: v({ [M]: { [EAD]: { matricular: true } } }),
    consulta: [M, null, null],
    esperado: true,
  },
  // só o módulo conta abas com ALGUMA função true; aba marcada como true direto não conta (como no Layout)
  {
    id: "P16_so_modulo_aba_true",
    vinculo: v({ [M]: { [EAD]: true } }),
    consulta: [M, null, null],
    esperado: false,
  },
  {
    id: "P17_outra_aba",
    vinculo: v({ [M]: { Funcionários: { editar: true } } }),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  {
    id: "P18_texto_json",
    vinculo: v(JSON.stringify(eadEditar)),
    consulta: [M, EAD, "editar"],
    esperado: true,
  },
  {
    id: "P19_texto_json_duas_vezes",
    vinculo: v(JSON.stringify(JSON.stringify(eadEditar))),
    consulta: [M, EAD, "editar"],
    esperado: true,
  },
  {
    id: "P20_json_invalido",
    vinculo: v("não é json"),
    consulta: [M, EAD, "editar"],
    esperado: false,
  },
  { id: "P21_lista_no_lugar_do_objeto", vinculo: v([]), consulta: [M, EAD, null], esperado: false },
  { id: "P22_permissoes_nulas", vinculo: v(null), consulta: [M, EAD, null], esperado: false },
];

/** O lado TypeScript: o vínculo que o vinculoDoChamador acharia (ativo = true, sem deleted_at) + a regra. */
function temPermissaoComVinculo(vinculo: Caso["vinculo"], [modulo, aba, funcao]: Caso["consulta"]) {
  if (!vinculo || vinculo.ativo !== true || vinculo.deleted_at) return false;
  return temPermissaoServidor(vinculo, modulo, aba, funcao);
}

test("tem_permissao (T33): a tabela de casos comum ao smoke SQL", () => {
  for (const c of CASOS_TEM_PERMISSAO) {
    assert.equal(temPermissaoComVinculo(c.vinculo, c.consulta), c.esperado, c.id);
  }
});

test("tem_permissao (T33): o smoke SQL repete cada caso com a mesma resposta", () => {
  const smoke = readFileSync(
    fileURLToPath(new URL("../../../../tools/smoke-permissoes-ead.sql", import.meta.url)),
    "utf8"
  );
  const ids = CASOS_TEM_PERMISSAO.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "id repetido na tabela");
  for (const c of CASOS_TEM_PERMISSAO) {
    // uma linha da tabela de casos do smoke: ('<id>', ..., <esperado>)
    const linha = new RegExp(`\\('${c.id}',[^\\n]*,\\s*${c.esperado}\\)`);
    assert.match(smoke, linha, `${c.id} (esperado ${c.esperado}) não está no smoke`);
  }
  const noSmoke = [...smoke.matchAll(/\('(P\d\d_[a-z_]+)',/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(noSmoke)].sort(),
    [...ids].sort(),
    "o smoke tem caso que o teste não tem"
  );
});
