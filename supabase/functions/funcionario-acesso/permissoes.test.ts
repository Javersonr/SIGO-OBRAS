// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/funcionario-acesso/permissoes.test.ts
//
// T33 (spec docs/superpowers/specs/2026-10-06-permissoes-ead-design.md, §7): cada ação do
// funcionario-acesso tem o seu "portão" (entrar) e o que exige de fato (agir). Antes, uma permissão só
// (Segurança do Trabalho → Funcionários) liberava tudo, inclusive liberar tentativa e revogar
// certificado. Uma linha de teste por célula da tabela da §7, mais a ordem "409 antes do 403" do criar
// (decidirCriar) e o status recortado de quem só matricula. Dados sintéticos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ABA_EAD,
  ABA_FUNCIONARIOS,
  ACOES_DO_RH,
  MENSAGEM_SEM_ACESSO_AO_PORTAL,
  MENSAGEM_SEM_EDICAO,
  MODULO_SST,
  avaliarPermissao,
  decidirCriar,
  mensagemSemPermissao,
  permissaoDaAcao,
  recortarAcessosParaEad,
} from "./regras.ts";
import { MENSAGEM_SEM_EDICAO_DA_RESPOSTA } from "./duvida.ts";

const M = "Segurança do Trabalho";
const vinculo = (permissoes: unknown, extra: Record<string, unknown> = {}) => ({
  perfil: "Gestor",
  is_owner: false,
  ativo: true,
  deleted_at: null,
  permissoes,
  ...extra,
});
const so = (aba: string, funcao: string) => vinculo({ [M]: { [aba]: { [funcao]: true } } });

const TODAS = [
  "status",
  "criar",
  "redefinir",
  "ativo",
  "liberar_tentativa",
  "revogar_certificado",
  "editar_resposta_duvida",
];

/** O que cada ação dá para um vínculo: [entra, age]. */
function mapa(v: unknown, superAdmin = false) {
  return Object.fromEntries(
    TODAS.map((acao) => {
      const r = avaliarPermissao({ acao, vinculo: v as never, superAdmin });
      return [acao, [r.entra, r.age]];
    })
  );
}

// ------------------------------------------------------------------------------------ a tabela da §7
test("nomes do módulo e das abas são os do editor de permissões", () => {
  assert.equal(MODULO_SST, "Segurança do Trabalho");
  assert.equal(ABA_FUNCIONARIOS, "Funcionários");
  assert.equal(ABA_EAD, "Treinamentos EAD");
});

test("permissaoDaAcao: a tabela da §7, célula por célula", () => {
  const funcionarios = [M, "Funcionários", null];
  const funcionariosEditar = [M, "Funcionários", "editar"];
  const ead = (f: string) => [M, "Treinamentos EAD", f];
  assert.deepEqual(permissaoDaAcao("status"), {
    entrar: [funcionarios, ead("matricular")],
    agir: [funcionarios, ead("matricular")],
  });
  assert.deepEqual(permissaoDaAcao("criar"), {
    entrar: [funcionarios, ead("matricular")],
    agir: [funcionariosEditar],
  });
  for (const acao of ["redefinir", "ativo"]) {
    assert.deepEqual(permissaoDaAcao(acao), { entrar: [funcionarios], agir: [funcionariosEditar] });
  }
  assert.deepEqual(permissaoDaAcao("liberar_tentativa"), {
    entrar: [ead("liberar_tentativa")],
    agir: [ead("liberar_tentativa")],
  });
  assert.deepEqual(permissaoDaAcao("revogar_certificado"), {
    entrar: [ead("revogar_certificado")],
    agir: [ead("revogar_certificado")],
  });
  // A6 (T21): editar a resposta de uma dúvida é responder dúvida (a 1ª resposta exige o mesmo no banco)
  assert.deepEqual(permissaoDaAcao("editar_resposta_duvida"), {
    entrar: [ead("responder_duvidas")],
    agir: [ead("responder_duvidas")],
  });
});

test("permissaoDaAcao: ação desconhecida não tem regra (o index responde 400)", () => {
  for (const acao of ["", "apagar", "STATUS", "__proto__", "constructor", "toString"]) {
    assert.equal(permissaoDaAcao(acao), null, acao);
  }
  assert.deepEqual([...ACOES_DO_RH].sort(), [...TODAS].sort());
});

test("só Funcionários → visualizar: entra no status e no criar (sem agir no criar), entra no redefinir e não nas ações do EAD", () => {
  assert.deepEqual(mapa(so("Funcionários", "visualizar")), {
    status: [true, true],
    criar: [true, false],
    redefinir: [true, false],
    ativo: [true, false],
    liberar_tentativa: [false, false],
    revogar_certificado: [false, false],
    editar_resposta_duvida: [false, false],
  });
});

test("só Treinamentos EAD → matricular: entra e age no status; entra no criar sem agir (C1); fora do resto", () => {
  assert.deepEqual(mapa(so("Treinamentos EAD", "matricular")), {
    status: [true, true],
    criar: [true, false],
    redefinir: [false, false],
    ativo: [false, false],
    liberar_tentativa: [false, false],
    revogar_certificado: [false, false],
    editar_resposta_duvida: [false, false],
  });
});

test("só Treinamentos EAD → visualizar (ou só liberar_tentativa): não entra no status nem no criar", () => {
  const visualizar = mapa(so("Treinamentos EAD", "visualizar"));
  for (const acao of TODAS) assert.deepEqual(visualizar[acao], [false, false], acao);
  const liberar = mapa(so("Treinamentos EAD", "liberar_tentativa"));
  assert.deepEqual(liberar.status, [false, false]);
  assert.deepEqual(liberar.criar, [false, false]);
  assert.deepEqual(liberar.liberar_tentativa, [true, true]);
  assert.deepEqual(liberar.revogar_certificado, [false, false]);
});

test("Funcionários → editar sem a aba nova: o acesso ao portal como hoje, e fora de liberar, revogar e editar resposta", () => {
  assert.deepEqual(mapa(so("Funcionários", "editar")), {
    status: [true, true],
    criar: [true, true],
    redefinir: [true, true],
    ativo: [true, true],
    liberar_tentativa: [false, false],
    revogar_certificado: [false, false],
    editar_resposta_duvida: [false, false],
  });
});

test("cada função do EAD libera só a sua ação", () => {
  assert.deepEqual(mapa(so("Treinamentos EAD", "revogar_certificado")).revogar_certificado, [
    true,
    true,
  ]);
  assert.deepEqual(mapa(so("Treinamentos EAD", "revogar_certificado")).liberar_tentativa, [
    false,
    false,
  ]);
  const tutor = mapa(so("Treinamentos EAD", "responder_duvidas"));
  assert.deepEqual(tutor.editar_resposta_duvida, [true, true]);
  assert.deepEqual(tutor.status, [false, false]);
});

test("Admin, dono e super admin passam em tudo; vínculo nulo, inativo ou excluído não passa em nada", () => {
  for (const v of [vinculo(null, { perfil: "Admin" }), vinculo({}, { is_owner: true })]) {
    for (const acao of TODAS) assert.deepEqual(mapa(v)[acao], [true, true], acao);
  }
  for (const acao of TODAS) assert.deepEqual(mapa(null, true)[acao], [true, true], acao);
  const tudo = {
    [M]: { Funcionários: { editar: true }, "Treinamentos EAD": { matricular: true } },
  };
  for (const v of [
    null,
    vinculo(tudo, { ativo: false }),
    vinculo(tudo, { ativo: null }),
    vinculo(tudo, { deleted_at: "2026-10-01T00:00:00Z" }),
    vinculo(tudo, { perfil: "Admin", ativo: false }),
  ]) {
    for (const acao of TODAS) assert.deepEqual(mapa(v)[acao], [false, false], JSON.stringify(v));
  }
});

test("ação desconhecida: ninguém entra, nem o super admin", () => {
  const r = avaliarPermissao({
    acao: "apagar",
    vinculo: vinculo(null, { perfil: "Admin" }),
    superAdmin: true,
  });
  assert.deepEqual(r, { entra: false, age: false, listaCompleta: false });
});

// ------------------------------------------------------------------------------------ status recortado
test("listaCompleta: super admin, Admin e quem tem Funcionários; quem só matricula recebe a recortada", () => {
  const lista = (v: unknown, superAdmin = false) =>
    avaliarPermissao({ acao: "status", vinculo: v as never, superAdmin }).listaCompleta;
  assert.equal(lista(null, true), true);
  assert.equal(lista(vinculo(null, { perfil: "Admin" })), true);
  assert.equal(lista(so("Funcionários", "visualizar")), true);
  assert.equal(lista(so("Treinamentos EAD", "matricular")), false);
  assert.equal(lista(null), false);
});

test("recortarAcessosParaEad: só funcionario_id e ativo; a lista completa passa inteira", () => {
  const acessos = [
    {
      funcionario_id: "f1",
      usuario: "00000000000",
      ativo: true,
      primeiro_acesso_pendente: true,
      bloqueado: false,
      ultimo_acesso: "2026-10-01T10:00:00Z",
    },
    { funcionario_id: "f2", usuario: "teste", ativo: false, bloqueado: true, ultimo_acesso: null },
  ];
  assert.deepEqual(recortarAcessosParaEad(acessos, false), [
    { funcionario_id: "f1", ativo: true },
    { funcionario_id: "f2", ativo: false },
  ]);
  for (const a of recortarAcessosParaEad(acessos, false)) {
    for (const campo of ["usuario", "ultimo_acesso", "bloqueado", "primeiro_acesso_pendente"]) {
      assert.equal(Object.hasOwn(a, campo), false, campo);
    }
  }
  assert.equal(recortarAcessosParaEad(acessos, true), acessos);
  assert.deepEqual(recortarAcessosParaEad(null as never, false), []);
});

// ------------------------------------------------------------------------------------ criar (P3 = C1)
test("decidirCriar: a ordem é fixa (sem entrar 403; com acesso 409, mesmo para quem não age; sem agir 403)", () => {
  for (const age of [true, false]) {
    for (const jaTemAcesso of [true, false]) {
      assert.equal(decidirCriar({ entra: false, age, jaTemAcesso }), "sem_permissao");
    }
  }
  assert.equal(decidirCriar({ entra: true, age: false, jaTemAcesso: true }), "conflito");
  assert.equal(decidirCriar({ entra: true, age: false, jaTemAcesso: false }), "sem_permissao");
  assert.equal(decidirCriar({ entra: true, age: true, jaTemAcesso: true }), "conflito");
  assert.equal(decidirCriar({ entra: true, age: true, jaTemAcesso: false }), "criar");
});

test("quem só matricula: 409 para quem já tem acesso (o aviso sai sem senha) e 403 para quem não tem (não cria)", () => {
  const p = avaliarPermissao({
    acao: "criar",
    vinculo: so("Treinamentos EAD", "matricular") as never,
    superAdmin: false,
  });
  assert.equal(decidirCriar({ ...p, jaTemAcesso: true }), "conflito");
  assert.equal(decidirCriar({ ...p, jaTemAcesso: false }), "sem_permissao");
});

// ------------------------------------------------------------------------------------ mensagens
test("MENSAGEM_SEM_EDICAO: as cinco ações de escrita, cada uma citando a permissão que falta", () => {
  assert.deepEqual(Object.keys(MENSAGEM_SEM_EDICAO).sort(), [
    "ativo",
    "criar",
    "editar_resposta_duvida",
    "liberar_tentativa",
    "redefinir",
    "revogar_certificado",
  ]);
  assert.equal(
    MENSAGEM_SEM_EDICAO.criar,
    "Este funcionário ainda não tem acesso ao portal. Criar o acesso exige Segurança do Trabalho → " +
      "Funcionários → Editar."
  );
  for (const acao of ["redefinir", "ativo"]) {
    assert.match(MENSAGEM_SEM_EDICAO[acao], /Segurança do Trabalho → Funcionários → Editar/);
  }
  assert.match(MENSAGEM_SEM_EDICAO.liberar_tentativa, /liberar/i);
  assert.match(MENSAGEM_SEM_EDICAO.liberar_tentativa, /Treinamentos EAD → Liberar tentativa/);
  assert.match(MENSAGEM_SEM_EDICAO.revogar_certificado, /revogar/i);
  assert.match(MENSAGEM_SEM_EDICAO.revogar_certificado, /Treinamentos EAD → Revogar certificado/);
  assert.equal(MENSAGEM_SEM_EDICAO.editar_resposta_duvida, MENSAGEM_SEM_EDICAO_DA_RESPOSTA);
  assert.match(MENSAGEM_SEM_EDICAO_DA_RESPOSTA, /Treinamentos EAD → Responder dúvidas/);
});

test("mensagemSemPermissao: o portão do acesso ao portal fala do portal; o das ações do EAD, da função que falta", () => {
  for (const acao of ["status", "criar", "redefinir", "ativo"]) {
    assert.equal(mensagemSemPermissao(acao, "entrar"), MENSAGEM_SEM_ACESSO_AO_PORTAL);
  }
  assert.equal(
    MENSAGEM_SEM_ACESSO_AO_PORTAL,
    "Sem permissão para gerenciar o acesso ao Portal do Funcionário"
  );
  for (const acao of ["liberar_tentativa", "revogar_certificado", "editar_resposta_duvida"]) {
    assert.equal(mensagemSemPermissao(acao, "entrar"), MENSAGEM_SEM_EDICAO[acao]);
    assert.equal(mensagemSemPermissao(acao, "agir"), MENSAGEM_SEM_EDICAO[acao]);
  }
  for (const acao of ["criar", "redefinir", "ativo"]) {
    assert.equal(mensagemSemPermissao(acao, "agir"), MENSAGEM_SEM_EDICAO[acao]);
  }
});

// ------------------------------------------------------------------------------------ o index.ts usa as regras
const INDEX = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const PRINCIPAL = INDEX.slice(INDEX.indexOf("Deno.serve("));

test("index.ts: ação fora da tabela é 400 e o portão (entrar) vem antes de qualquer leitura", () => {
  assert.match(
    PRINCIPAL,
    /if \(!permissaoDaAcao\(acao\)\) return fail\("Ação desconhecida", 400\)/
  );
  const portao = PRINCIPAL.indexOf(
    'if (!pode.entra) return fail(mensagemSemPermissao(acao, "entrar"), 403)'
  );
  assert.ok(portao > 0, "portão não encontrado");
  for (const leitura of [
    '.from("funcionario_portal_acesso")',
    "matriculaDoChamador(",
    "duvidaDoChamador(",
    '.from("funcionario")',
  ]) {
    const i = PRINCIPAL.indexOf(leitura);
    assert.ok(i > portao, `${leitura} antes do portão`);
  }
  // nada de módulo/aba fixos nem da conferência única de antes
  assert.doesNotMatch(INDEX, /const MODULO = /);
  assert.doesNotMatch(INDEX, /podeEditar/);
  assert.match(
    PRINCIPAL,
    /avaliarPermissao\(\{\s*acao,\s*vinculo,\s*superAdmin: staff\.is_super_admin\s*\}\)/
  );
});

test("index.ts: o status de quem só matricula vem recortado", () => {
  const bloco = PRINCIPAL.slice(PRINCIPAL.indexOf('if (acao === "status")'));
  assert.match(bloco, /recortarAcessosParaEad\(\s*acessos,\s*pode\.listaCompleta\s*\)/);
});

test("index.ts: o criar decide por decidirCriar depois de ler o acesso atual (409 antes do 403)", () => {
  const bloco = PRINCIPAL.slice(PRINCIPAL.indexOf('if (body.acao === "criar")'));
  const decisao = bloco.indexOf("decidirCriar({");
  assert.ok(decisao > 0, "decidirCriar não é usado no criar");
  assert.match(bloco, /jaTemAcesso: !!atual/);
  assert.ok(bloco.indexOf('codigo: "JA_TEM_ACESSO"') > decisao);
  assert.match(bloco, /fail\(MENSAGEM_SEM_EDICAO\.criar, 403\)/);
  // o insert só acontece depois da decisão "criar"
  assert.ok(
    bloco.indexOf('.from("funcionario_portal_acesso").insert(') > bloco.indexOf('"sem_permissao"')
  );
});

test("index.ts: liberar, revogar, editar resposta, redefinir e ativo exigem o agir da ação", () => {
  const matricula = PRINCIPAL.slice(PRINCIPAL.indexOf("if (ACOES_DE_MATRICULA.has(acao)) {"));
  assert.ok(
    matricula.indexOf("if (!pode.age) return fail(MENSAGEM_SEM_EDICAO[acao], 403)") <
      matricula.indexOf("matriculaDoChamador(")
  );
  const duvida = PRINCIPAL.slice(PRINCIPAL.indexOf("if (ACOES_DE_DUVIDA.has(acao)) {"));
  assert.ok(
    duvida.indexOf("if (!pode.age) return fail(MENSAGEM_SEM_EDICAO_DA_RESPOSTA, 403)") >= 0 &&
      duvida.indexOf("if (!pode.age)") < duvida.indexOf("duvidaDoChamador(")
  );
  const resto = PRINCIPAL.slice(
    PRINCIPAL.indexOf(
      'if (!atual) return fail("Este funcionário ainda não tem acesso ao portal", 404)'
    )
  );
  assert.match(resto, /if \(!pode\.age\) return fail\(MENSAGEM_SEM_EDICAO\[acao\], 403\)/);
});
