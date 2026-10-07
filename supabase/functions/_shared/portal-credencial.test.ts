// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/portal-credencial.test.ts
//
// T38: o Portal do Funcionário com um login só (CPF e senha) em mais de uma empresa. Spec:
// docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md (aprovado em 07/10/2026).
// Dados sintéticos: os CPFs são gerados aqui a partir de bases fictícias (os dígitos verificadores são calculados),
// e os IPs são de documentação (RFC 5737).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPARACOES_NO_LOGIN,
  ESCOPO_ATIVACAO,
  ESCOPO_ESCOLHA,
  ESCOPO_SESSAO,
  OPERADOR_ACESSO_CONFIRMADO,
  OPERADOR_CREDENCIAL_BLOQUEADA,
  OPERADOR_LOGIN_FALHA,
  OPERADOR_RESET_RECUSADO,
  OPERADOR_SENHA_CRIADA,
  OPERADOR_TROCA_SENHA,
  PROVISORIAS_NO_LOGIN,
  VALIDADE_PROVISORIA_DIAS,
  alvoDaRedefinicao,
  ativacaoValida,
  conferirLogin,
  conflitoDeOutroCadastro,
  cpfValido,
  criarComparador,
  decidirCriarVinculo,
  decidirLogin,
  efeitoDaConfirmacao,
  efeitoDaRedefinicao,
  efeitoDaSenhaNova,
  eventoDoResetRecusado,
  eventosDaAtivacao,
  eventosDaFalhaDeLogin,
  exigeTrocaNaAtivacao,
  falhaDeLogin,
  IDS_POR_LOTE,
  lerEmLotes,
  lerPessoaDoBanco,
  montarItens,
  origemDepoisDaTroca,
  outrasEmpresasLiberadas,
  outrosVinculosLiberados,
  podeCriarSenhaNova,
  provisoriaNova,
  provisoriasDoLogin,
  registrarEventoDaCredencial,
  respostaDoCriar,
  sessaoValida,
  situacaoDoVinculo,
  statusDoVinculo,
  ttlDaTroca,
  usuarioDoAcesso,
  vinculoEscolhido,
  type CadastroDoPortal,
  type CredencialDoPortal,
  type ItemDoVinculo,
  type VinculoDoPortal,
} from "./portal-credencial.ts";
import {
  EVENTO_ACESSO_AGUARDANDO_PROVISORIA,
  EVENTO_ACESSO_LIBERADO,
} from "./portal-funcionario.ts";

// ------------------------------------------------------------------------------------------ dados sintéticos

/** CPF com os dígitos verificadores certos, a partir de 9 dígitos fictícios. */
function cpfCom(base9: string): string {
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(base9);
  const d2 = dv(base9 + d1);
  return `${base9}${d1}${d2}`;
}

const CPF_A = cpfCom("100200300");
const CPF_B = cpfCom("400500600");
const AGORA = Date.parse("2026-10-07T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const DIA = 86_400_000;

function credencial(extra: Partial<CredencialDoPortal> = {}): CredencialDoPortal {
  return {
    id: "cred-1",
    usuario: CPF_A,
    tipo: "cpf",
    senha_hash: "$2a$10$hashpessoal",
    senha_geracao: 1,
    senha_origem_empresa_id: null,
    sessao_versao: 1,
    tentativas: 0,
    bloqueado_ate: null,
    ...extra,
  };
}

function vinculo(extra: Partial<VinculoDoPortal> = {}): VinculoDoPortal {
  return {
    funcionario_id: "func-a",
    empresa_id: "emp-a",
    credencial_id: "cred-1",
    ativo: true,
    sessao_versao: 1,
    provisoria_hash: null,
    provisoria_criada_em: null,
    provisoria_expira_em: null,
    geracao_liberada: 1,
    confirmado_em: iso(AGORA - 10 * DIA),
    ...extra,
  };
}

function cadastro(extra: Partial<CadastroDoPortal> = {}): CadastroDoPortal {
  return {
    id: "func-a",
    empresa_id: "emp-a",
    cpf: CPF_A,
    ativo: true,
    deleted_at: null,
    nome_completo: "Fulano de Teste",
    data_admissao: "2026-01-05",
    ...extra,
  };
}

/** Um vínculo e o cadastro dele, na empresa `emp` (funcionário `func-<emp>`). */
function item(
  emp: string,
  extraV: Partial<VinculoDoPortal> = {},
  extraC: Partial<CadastroDoPortal> = {}
) {
  const funcionario_id = extraV.funcionario_id ?? `func-${emp}`;
  return {
    vinculo: vinculo({ funcionario_id, empresa_id: `emp-${emp}`, ...extraV }),
    cadastro: cadastro({ id: funcionario_id, empresa_id: `emp-${emp}`, ...extraC }),
  } satisfies ItemDoVinculo;
}

const sit = (i: ItemDoVinculo, c: CredencialDoPortal | null = credencial(), agora = AGORA) =>
  situacaoDoVinculo({ vinculo: i.vinculo, cadastro: i.cadastro, credencial: c, agora });

// --------------------------------------------------------------------------------------------------- CPF e usuário

test("cpfValido: dígitos verificadores, com ou sem máscara; tamanho, repetidos e letras recusam", () => {
  assert.equal(cpfValido(CPF_A), true);
  assert.equal(
    cpfValido(`${CPF_A.slice(0, 3)}.${CPF_A.slice(3, 6)}.${CPF_A.slice(6, 9)}-${CPF_A.slice(9)}`),
    true
  );
  // um dígito trocado
  const errado = CPF_A.slice(0, 10) + String((Number(CPF_A[10]) + 1) % 10);
  assert.equal(cpfValido(errado), false);
  assert.equal(cpfValido("11111111111"), false);
  assert.equal(cpfValido(CPF_A.slice(0, 10)), false);
  assert.equal(cpfValido(`${CPF_A}0`), false);
  assert.equal(cpfValido(`CPF ${CPF_A}`), false);
  assert.equal(cpfValido(""), false);
  assert.equal(cpfValido(null), false);
});

test("usuarioDoAcesso: com CPF no cadastro o usuário é SEMPRE o CPF (o usuário do corpo é ignorado)", () => {
  assert.deepEqual(usuarioDoAcesso({ cpf: CPF_A, usuarioInformado: "outro.nome" }), {
    ok: true,
    usuario: CPF_A,
    tipo: "cpf",
  });
  const mascarado = `${CPF_A.slice(0, 3)}.${CPF_A.slice(3, 6)}.${CPF_A.slice(6, 9)}-${CPF_A.slice(9)}`;
  assert.deepEqual(usuarioDoAcesso({ cpf: mascarado }), { ok: true, usuario: CPF_A, tipo: "cpf" });
});

test("usuarioDoAcesso: CPF com dígito verificador errado não cria acesso (R4)", () => {
  const errado = CPF_A.slice(0, 10) + String((Number(CPF_A[10]) + 1) % 10);
  const r = usuarioDoAcesso({ cpf: errado, usuarioInformado: "joao.silva" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.equal(r.codigo, "CPF_INVALIDO");
  }
  // CPF incompleto também
  const incompleto = usuarioDoAcesso({ cpf: "123" });
  assert.equal(incompleto.ok, false);
});

test("usuarioDoAcesso: sem CPF, usuário com letras (manual); só números é recusado; vazio pede usuário", () => {
  assert.deepEqual(usuarioDoAcesso({ cpf: null, usuarioInformado: "  Joao.Silva " }), {
    ok: true,
    usuario: "joao.silva",
    tipo: "manual",
  });
  for (const numerico of ["12345", "123.456.789-00", CPF_B]) {
    const r = usuarioDoAcesso({ cpf: "", usuarioInformado: numerico });
    assert.equal(r.ok, false, numerico);
    if (!r.ok) {
      assert.equal(r.codigo, "USUARIO_NUMERICO");
      assert.match(r.mensagem, /Usuário só com números é CPF: cadastre o CPF no funcionário/);
    }
  }
  const vazio = usuarioDoAcesso({ cpf: "não tem", usuarioInformado: "" });
  assert.equal(vazio.ok, false);
  if (!vazio.ok) assert.equal(vazio.codigo, "SEM_USUARIO");
});

// --------------------------------------------------------------------------------------------------- leitura

test("montarItens: o cadastro só vale se for da MESMA empresa do vínculo", () => {
  const v1 = vinculo({ funcionario_id: "func-a", empresa_id: "emp-a" });
  const v2 = vinculo({ funcionario_id: "func-b", empresa_id: "emp-b" });
  const itens = montarItens(
    [v1, v2],
    [
      cadastro({ id: "func-a", empresa_id: "emp-a" }),
      cadastro({ id: "func-b", empresa_id: "emp-x" }),
    ]
  );
  assert.equal(itens[0].cadastro?.id, "func-a");
  assert.equal(itens[1].cadastro, null);
  assert.equal(sit(itens[1]), "cadastro_inativo");
  assert.deepEqual(montarItens(null, null), []);
});

test("lerEmLotes: a lista de uma empresa inteira vai em lotes de 100 ids (o filtro cabe na URL)", async () => {
  assert.equal(IDS_POR_LOTE, 100);
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const lotes: string[][] = [];
  const r = await lerEmLotes([...ids, "id-0", ""], async (lote) => {
    lotes.push(lote);
    return { data: lote.map((id) => ({ id })), error: null };
  });
  assert.deepEqual(
    lotes.map((l) => l.length),
    [100, 100, 50]
  );
  assert.equal(r.error, null);
  assert.equal(r.data.length, 250, "repetidos e vazios saem");
  // um lote com erro devolve o erro (nada de lista pela metade)
  let chamadas = 0;
  const comErro = await lerEmLotes(ids, async (lote) => {
    chamadas++;
    return chamadas === 2
      ? { data: null, error: { message: "fora do ar" } }
      : { data: lote, error: null };
  });
  assert.deepEqual(comErro, { data: [], error: { message: "fora do ar" } });
  assert.equal(chamadas, 2);
  // sem ids, nenhuma consulta
  let nenhuma = 0;
  assert.deepEqual(
    await lerEmLotes([], async () => {
      nenhuma++;
      return { data: [], error: null };
    }),
    { data: [], error: null }
  );
  assert.equal(nenhuma, 0);
});

/** Supabase de mentira para leituras encadeadas: registra o filtro e devolve a resposta da tabela. */
function fakeLeitura(respostas: Record<string, { data: unknown; error: unknown }>) {
  const filtros: string[] = [];
  return {
    filtros,
    from(tabela: string) {
      const resposta = respostas[tabela] ?? { data: null, error: null };
      const cadeia = {
        select: (colunas: string) => {
          filtros.push(`${tabela}.select(${colunas.includes("*") ? "*" : "colunas"})`);
          return cadeia;
        },
        eq: (coluna: string, valor: unknown) => {
          filtros.push(`${tabela}.${coluna}=${valor}`);
          return cadeia;
        },
        in: (coluna: string, valores: unknown[]) => {
          filtros.push(`${tabela}.${coluna} in ${valores.join(",")}`);
          return Promise.resolve(resposta);
        },
        maybeSingle: () => Promise.resolve(resposta),
        then: (ok: (r: unknown) => unknown, erro: (e: unknown) => unknown) =>
          Promise.resolve(resposta).then(ok, erro),
      };
      return cadeia;
    },
  };
}

test("lerPessoaDoBanco: pelo usuário (login) ou pelo id (token), nunca em lista e nunca com select(*)", async () => {
  const banco = fakeLeitura({
    portal_credencial: { data: credencial(), error: null },
    funcionario_portal_acesso: { data: [vinculo()], error: null },
    funcionario: { data: [cadastro()], error: null },
  });
  const r = await lerPessoaDoBanco(banco, { usuario: CPF_A });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.credencial?.id, "cred-1");
    assert.equal(r.itens.length, 1);
    assert.equal(sit(r.itens[0]), "liberado");
  }
  assert.ok(banco.filtros.includes(`portal_credencial.usuario=${CPF_A}`));
  assert.ok(banco.filtros.includes("funcionario_portal_acesso.credencial_id=cred-1"));
  assert.ok(banco.filtros.includes("funcionario.id in func-a"));
  assert.equal(
    banco.filtros.some((f) => f.endsWith("select(*)")),
    false
  );

  const porId = fakeLeitura({ portal_credencial: { data: null, error: null } });
  const vazio = await lerPessoaDoBanco(porId, { id: "cred-x" });
  assert.deepEqual(vazio, { ok: true, credencial: null, itens: [] });
  assert.ok(porId.filtros.includes("portal_credencial.id=cred-x"));
});

test("lerPessoaDoBanco: com ou sem credencial, as MESMAS 3 consultas (o tempo não diz se o CPF existe, R10)", async () => {
  const contar = async (respostas: Record<string, { data: unknown; error: unknown }>) => {
    const banco = fakeLeitura(respostas);
    await lerPessoaDoBanco(banco, { usuario: CPF_A });
    return banco.filtros.filter((f) => f.includes(".select(")).length;
  };
  const semCredencial = await contar({ portal_credencial: { data: null, error: null } });
  const semVinculo = await contar({
    portal_credencial: { data: credencial(), error: null },
    funcionario_portal_acesso: { data: [], error: null },
  });
  const comVinculo = await contar({
    portal_credencial: { data: credencial(), error: null },
    funcionario_portal_acesso: { data: [vinculo()], error: null },
    funcionario: { data: [cadastro()], error: null },
  });
  assert.deepEqual([semCredencial, semVinculo, comVinculo], [3, 3, 3]);
});

test("lerPessoaDoBanco: erro de leitura não vira 'não existe'", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    for (const tabela of ["portal_credencial", "funcionario_portal_acesso", "funcionario"]) {
      const banco = fakeLeitura({
        portal_credencial: { data: credencial(), error: null },
        funcionario_portal_acesso: { data: [vinculo()], error: null },
        funcionario: { data: [cadastro()], error: null },
        [tabela]: { data: null, error: { message: "fora do ar" } },
      });
      assert.deepEqual(await lerPessoaDoBanco(banco, { id: "cred-1" }), { ok: false }, tabela);
    }
  } finally {
    console.error = original;
  }
});

// --------------------------------------------------------------------------------------------- situação (§3.2)

test("situacaoDoVinculo: a tabela da §3.2, na ordem", () => {
  // liberado: geração igual à da credencial
  assert.equal(sit(item("a")), "liberado");
  // desativado vem antes de tudo
  assert.equal(sit(item("a", { ativo: false })), "desativado");
  // cadastro inativo ou apagado
  assert.equal(sit(item("a", {}, { ativo: false })), "cadastro_inativo");
  assert.equal(sit(item("a", {}, { deleted_at: iso(AGORA) })), "cadastro_inativo");
  // credencial cpf e o CPF do cadastro mudou
  assert.equal(sit(item("a", {}, { cpf: CPF_B })), "cpf_mudou");
  assert.equal(sit(item("a", {}, { cpf: "" })), "cpf_mudou");
  // provisória pendente e não vencida
  const comProvisoria = item("a", {
    provisoria_hash: "$2a$10$prov",
    provisoria_criada_em: iso(AGORA - DIA),
    provisoria_expira_em: iso(AGORA + DIA),
    geracao_liberada: null,
  });
  assert.equal(sit(comProvisoria), "aguardando_provisoria");
  // provisória da cópia da 0145: sem vencimento
  assert.equal(
    sit(item("a", { provisoria_hash: "$2a$10$prov", provisoria_expira_em: null })),
    "aguardando_provisoria"
  );
  // travado: a geração subiu (senha criada com a provisória de outra empresa)
  assert.equal(sit(item("a"), credencial({ senha_geracao: 2 })), "travado");
});

test("situacaoDoVinculo: geracao_liberada nulo nunca é liberado; provisória vencida sem uso cai em travado", () => {
  assert.equal(sit(item("a", { geracao_liberada: null })), "travado");
  const vencida = item("a", {
    provisoria_hash: "$2a$10$prov",
    provisoria_criada_em: iso(AGORA - 8 * DIA),
    provisoria_expira_em: iso(AGORA - DIA),
    geracao_liberada: null,
  });
  assert.equal(sit(vencida), "travado");
  // credencial ainda sem senha: nada abre com "senha pessoal"
  assert.equal(
    sit(item("a", { geracao_liberada: 0 }), credencial({ senha_hash: null, senha_geracao: 0 })),
    "travado"
  );
  // vínculo sem credencial (linha de antes da 0145 que a cópia ainda não ligou)
  assert.equal(sit(item("a", { credencial_id: null }), null), "travado");
});

test("situacaoDoVinculo: credencial manual não depende do CPF do cadastro", () => {
  const manual = credencial({ tipo: "manual", usuario: "joao.silva" });
  assert.equal(sit(item("a", {}, { cpf: "" }), manual), "liberado");
  assert.equal(sit(item("a", {}, { cpf: CPF_B }), manual), "liberado");
});

// ------------------------------------------------------------------------------------- login: as 4 comparações

/** Comparador que conta as chamadas e confere a senha pelo "hash" (o texto depois do prefixo). */
function contador(senhasCertas: Record<string, string>) {
  const chamadas: string[] = [];
  const comparar = async (senha: string, hash: string) => {
    chamadas.push(hash);
    return senhasCertas[hash] === senha;
  };
  return { chamadas, comparar };
}

const FICTICIO = "$2a$10$ficticio";

/** Vínculo NOVO com a provisória pendente (nunca liberado nem confirmado). */
function provisoria(emp: string, criadaHaDias: number, hash = `$2a$10$prov-${emp}`) {
  return item(emp, {
    provisoria_hash: hash,
    provisoria_criada_em: iso(AGORA - criadaHaDias * DIA),
    provisoria_expira_em: iso(AGORA - criadaHaDias * DIA + 7 * DIA),
    geracao_liberada: null,
    confirmado_em: null,
  });
}

test("conferirLogin: SEMPRE 4 comparações, em todo caminho (o tempo não diz o que existe)", async () => {
  assert.equal(COMPARACOES_NO_LOGIN, 4);
  assert.equal(PROVISORIAS_NO_LOGIN, 3);
  const casos: {
    nome: string;
    cred: CredencialDoPortal | null;
    provisorias: ItemDoVinculo[];
    senha: string;
  }[] = [
    { nome: "credencial inexistente", cred: null, provisorias: [], senha: "qualquer" },
    {
      nome: "sem senha",
      cred: credencial({ senha_hash: null, senha_geracao: 0 }),
      provisorias: [],
      senha: "x",
    },
    { nome: "senha certa", cred: credencial(), provisorias: [], senha: "pessoal" },
    { nome: "senha errada", cred: credencial(), provisorias: [], senha: "errada" },
    {
      nome: "1 provisória",
      cred: credencial(),
      provisorias: [provisoria("b", 1)],
      senha: "prov-b",
    },
    {
      nome: "3 provisórias",
      cred: credencial(),
      provisorias: [provisoria("b", 1), provisoria("c", 2), provisoria("d", 3)],
      senha: "errada",
    },
    {
      nome: "5 provisórias",
      cred: credencial(),
      provisorias: ["b", "c", "d", "e", "f"].map((e, i) => provisoria(e, i + 1)),
      senha: "errada",
    },
  ];
  for (const c of casos) {
    const { chamadas, comparar } = contador({
      $2a$10$hashpessoal: "pessoal",
      "$2a$10$prov-b": "prov-b",
    });
    const ordenadas = provisoriasDoLogin({
      itens: c.provisorias,
      credencial: c.cred,
      agora: AGORA,
    });
    await conferirLogin({
      senha: c.senha,
      credencial: c.cred,
      provisorias: ordenadas,
      comparar,
      hashFicticio: FICTICIO,
    });
    assert.equal(chamadas.length, 4, c.nome);
  }
});

test("conferirLogin: o que falta é completado com o hash fictício, que nunca confere", async () => {
  const { chamadas, comparar } = contador({ [FICTICIO]: "adivinhada" });
  const r = await conferirLogin({
    senha: "adivinhada",
    credencial: null,
    provisorias: [],
    comparar,
    hashFicticio: FICTICIO,
  });
  assert.deepEqual(chamadas, [FICTICIO, FICTICIO, FICTICIO, FICTICIO]);
  assert.deepEqual(r, { pessoal: false, provisoria: null });
});

test("conferirLogin: diz qual conferiu (a pessoal ou a provisória de qual vínculo)", async () => {
  const { comparar } = contador({ $2a$10$hashpessoal: "pessoal", "$2a$10$prov-c": "prov-c" });
  const provisorias = provisoriasDoLogin({
    itens: [provisoria("b", 1), provisoria("c", 2)],
    credencial: credencial(),
    agora: AGORA,
  });
  const pessoal = await conferirLogin({
    senha: "pessoal",
    credencial: credencial(),
    provisorias,
    comparar,
    hashFicticio: FICTICIO,
  });
  assert.equal(pessoal.pessoal, true);
  assert.equal(pessoal.provisoria, null);
  const daC = await conferirLogin({
    senha: "prov-c",
    credencial: credencial(),
    provisorias,
    comparar,
    hashFicticio: FICTICIO,
  });
  assert.equal(daC.pessoal, false);
  assert.equal(daC.provisoria?.vinculo.empresa_id, "emp-c");
});

test("provisoriasDoLogin: só as 3 mais recentes, de vínculo ativo, cadastro ativo, CPF certo e não vencidas", () => {
  const itens = [
    provisoria("b", 1),
    provisoria("c", 2),
    provisoria("d", 3),
    provisoria("e", 4), // a 4ª mais recente fica de fora
    item("f", { provisoria_hash: "$2a$10$x", provisoria_criada_em: iso(AGORA), ativo: false }),
    item("g", { provisoria_hash: "$2a$10$x", provisoria_criada_em: iso(AGORA) }, { ativo: false }),
    item("h", { provisoria_hash: "$2a$10$x", provisoria_criada_em: iso(AGORA) }, { cpf: CPF_B }), // cpf_mudou
    item("i", {
      provisoria_hash: "$2a$10$x",
      provisoria_criada_em: iso(AGORA - 9 * DIA),
      provisoria_expira_em: iso(AGORA - 2 * DIA),
    }),
    item("j"), // sem provisória
  ];
  const r = provisoriasDoLogin({ itens, credencial: credencial(), agora: AGORA });
  assert.deepEqual(
    r.map((i) => i.vinculo.empresa_id),
    ["emp-b", "emp-c", "emp-d"]
  );
});

test("criarComparador: hash que não é bcrypt paga o bcrypt do fictício e nunca confere", async () => {
  const verificados: string[] = [];
  const verificar = async (senha: string, hash: string) => {
    verificados.push(hash);
    return hash === "$2a$10$certo" && senha === "s";
  };
  const comparar = criarComparador(verificar, FICTICIO);
  assert.equal(await comparar("s", "$2a$10$certo"), true);
  // SHA-256 legado (64 hex): não vale no portal, mas custa o mesmo bcrypt
  assert.equal(await comparar("s", "a".repeat(64)), false);
  assert.equal(await comparar("s", ""), false);
  assert.deepEqual(verificados, ["$2a$10$certo", FICTICIO, FICTICIO]);
});

// ------------------------------------------------------------------------------------------ login: a decisão

test("decidirLogin: senha pessoal certa com uma empresa liberada entra direto", () => {
  const d = decidirLogin({
    credencial: credencial(),
    conferencia: { pessoal: true, provisoria: null },
    itens: [item("a"), item("b", { ativo: false })],
    agora: AGORA,
  });
  assert.equal(d.tipo, "entrar");
  if (d.tipo === "entrar") assert.equal(d.item.vinculo.empresa_id, "emp-a");
});

test("decidirLogin: duas liberadas pedem a escolha (só as liberadas)", () => {
  const d = decidirLogin({
    credencial: credencial(),
    conferencia: { pessoal: true, provisoria: null },
    itens: [item("a"), item("b"), item("c", { geracao_liberada: null })],
    agora: AGORA,
  });
  assert.equal(d.tipo, "escolher");
  if (d.tipo === "escolher") {
    assert.deepEqual(
      d.itens.map((i) => i.vinculo.empresa_id),
      ["emp-a", "emp-b"]
    );
  }
});

test("decidirLogin: senha certa sem empresa liberada: pedir provisória, cadastro inativo ou desativado", () => {
  const base = {
    credencial: credencial(),
    conferencia: { pessoal: true, provisoria: null },
    agora: AGORA,
  };
  assert.equal(
    decidirLogin({ ...base, itens: [item("a", { geracao_liberada: null })] }).tipo,
    "pedir_provisoria"
  );
  assert.equal(
    decidirLogin({ ...base, itens: [item("a", {}, { cpf: CPF_B })] }).tipo,
    "pedir_provisoria"
  );
  assert.equal(
    decidirLogin({ ...base, itens: [provisoria("a", 1), item("b", { ativo: false })] }).tipo,
    "pedir_provisoria"
  );
  assert.equal(
    decidirLogin({ ...base, itens: [item("a", {}, { ativo: false }), item("b", { ativo: false })] })
      .tipo,
    "cadastro_inativo"
  );
  assert.equal(decidirLogin({ ...base, itens: [item("a", { ativo: false })] }).tipo, "desativado");
  assert.equal(decidirLogin({ ...base, itens: [] }).tipo, "desativado");
});

test("decidirLogin: bloqueada com a senha certa diz o bloqueio; com a senha errada, credenciais sem contar falha", () => {
  const bloqueada = credencial({ bloqueado_ate: iso(AGORA + 5 * 60_000) });
  const certa = decidirLogin({
    credencial: bloqueada,
    conferencia: { pessoal: true, provisoria: null },
    itens: [item("a")],
    agora: AGORA,
  });
  assert.equal(certa.tipo, "bloqueado");
  const errada = decidirLogin({
    credencial: bloqueada,
    conferencia: { pessoal: false, provisoria: null },
    itens: [item("a")],
    agora: AGORA,
  });
  assert.deepEqual(errada, { tipo: "credenciais", contarFalha: false });
});

test("decidirLogin: a provisória entra mesmo com a credencial bloqueada (é outro segredo)", () => {
  const p = provisoria("b", 1);
  const d = decidirLogin({
    credencial: credencial({ bloqueado_ate: iso(AGORA + 60_000) }),
    conferencia: { pessoal: false, provisoria: p },
    itens: [item("a"), p],
    agora: AGORA,
  });
  assert.equal(d.tipo, "senha_provisoria");
});

test("decidirLogin: a etapa senha_provisoria é IGUAL com e sem senha na credencial (defesa 2: nada de tem_senha)", () => {
  const p = provisoria("b", 1);
  const comSenha = decidirLogin({
    credencial: credencial(),
    conferencia: { pessoal: false, provisoria: p },
    itens: [item("a"), p],
    agora: AGORA,
  });
  const semSenha = decidirLogin({
    credencial: credencial({ senha_hash: null, senha_geracao: 0 }),
    conferencia: { pessoal: false, provisoria: p },
    itens: [p],
    agora: AGORA,
  });
  assert.deepEqual(Object.keys(comSenha).sort(), ["item", "tipo"]);
  assert.deepEqual(comSenha, semSenha);
});

test("decidirLogin: nada confere = credenciais; conta a falha só se a credencial existe e não está bloqueada", () => {
  assert.deepEqual(
    decidirLogin({
      credencial: null,
      conferencia: { pessoal: false, provisoria: null },
      itens: [],
      agora: AGORA,
    }),
    { tipo: "credenciais", contarFalha: false }
  );
  assert.deepEqual(
    decidirLogin({
      credencial: credencial(),
      conferencia: { pessoal: false, provisoria: null },
      itens: [item("a")],
      agora: AGORA,
    }),
    { tipo: "credenciais", contarFalha: true }
  );
});

test("falhaDeLogin: bloqueia na 5ª por 15 min e zera o contador; antes só soma", () => {
  assert.deepEqual(falhaDeLogin({ credencial: credencial({ tentativas: 2 }), agora: AGORA }), {
    tentativa: 3,
    bloqueou: false,
    tentativas: 3,
    bloqueado_ate: null,
  });
  assert.deepEqual(falhaDeLogin({ credencial: credencial({ tentativas: 4 }), agora: AGORA }), {
    tentativa: 5,
    bloqueou: true,
    tentativas: 0,
    bloqueado_ate: iso(AGORA + 15 * 60_000),
  });
});

test("eventosDaFalhaDeLogin: trilha só dos vínculos liberados, sem IP; registro do operador com o bloqueio", () => {
  const r = eventosDaFalhaDeLogin({
    credencial: credencial(),
    itens: [item("a"), item("b", { geracao_liberada: null }), provisoria("c", 1)],
    agora: AGORA,
    tentativa: 5,
    bloqueou: true,
  });
  assert.deepEqual(r.trilha, [
    {
      empresa_id: "emp-a",
      funcionario_id: "func-a",
      evento: "login_falha",
      detalhe: { tentativa: 5, bloqueou: true },
    },
  ]);
  assert.deepEqual(
    r.operador.map((e) => e.evento),
    [OPERADOR_LOGIN_FALHA, OPERADOR_CREDENCIAL_BLOQUEADA]
  );
  assert.equal(r.operador[0].empresa_id, null);
  const semBloqueio = eventosDaFalhaDeLogin({
    credencial: credencial(),
    itens: [item("a")],
    agora: AGORA,
    tentativa: 1,
    bloqueou: false,
  });
  assert.deepEqual(
    semBloqueio.operador.map((e) => e.evento),
    [OPERADOR_LOGIN_FALHA]
  );
});

// ------------------------------------------------------------------------------------------ sessão (§5.2-5.3)

const PAYLOAD = {
  scope: ESCOPO_SESSAO,
  credencial_id: "cred-1",
  empresa_id: "emp-a",
  funcionario_id: "func-a",
  v: 1,
  vc: 1,
};

test("sessaoValida: confere escopo, credencial (vc), vínculo (v, empresa, credencial) e situação liberado", () => {
  const base = {
    payload: PAYLOAD,
    credencial: credencial(),
    vinculo: vinculo(),
    cadastro: cadastro(),
    agora: AGORA,
  };
  assert.deepEqual(sessaoValida(base), { ok: true });
  const falhas: [string, Partial<typeof base>][] = [
    ["sem payload", { payload: null as unknown as typeof PAYLOAD }],
    ["token de escolha", { payload: { ...PAYLOAD, scope: ESCOPO_ESCOLHA } }],
    ["token de ativação", { payload: { ...PAYLOAD, scope: ESCOPO_ATIVACAO } }],
    [
      "token antigo, sem credencial_id",
      { payload: { ...PAYLOAD, credencial_id: undefined as unknown as string } },
    ],
    ["vc velho", { payload: { ...PAYLOAD, vc: 0 } }],
    ["v velho", { payload: { ...PAYLOAD, v: 0 } }],
    ["credencial inexistente", { credencial: null as unknown as CredencialDoPortal }],
    ["vínculo de outra credencial", { vinculo: vinculo({ credencial_id: "cred-2" }) }],
    ["vínculo de outra empresa", { vinculo: vinculo({ empresa_id: "emp-b" }) }],
    ["vínculo desativado", { vinculo: vinculo({ ativo: false }) }],
    ["vínculo travado", { credencial: credencial({ senha_geracao: 2 }) }],
    ["CPF mudou", { cadastro: cadastro({ cpf: CPF_B }) }],
    ["cadastro de outra empresa", { cadastro: cadastro({ empresa_id: "emp-b" }) }],
  ];
  for (const [nome, extra] of falhas) {
    assert.deepEqual(sessaoValida({ ...base, ...extra }), { ok: false, motivo: "sessao" }, nome);
  }
  // cadastro inativo tem a mensagem própria (como hoje)
  assert.deepEqual(sessaoValida({ ...base, cadastro: cadastro({ ativo: false }) }), {
    ok: false,
    motivo: "cadastro_inativo",
  });
});

test("vinculoEscolhido: só cadastro da credencial e liberado", () => {
  const itens = [item("a"), item("b"), item("c", { geracao_liberada: null })];
  const cred = credencial();
  assert.equal(
    vinculoEscolhido({ itens, credencial: cred, funcionarioId: "func-b", agora: AGORA })?.vinculo
      .empresa_id,
    "emp-b"
  );
  assert.equal(
    vinculoEscolhido({ itens, credencial: cred, funcionarioId: "func-c", agora: AGORA }),
    null
  );
  assert.equal(
    vinculoEscolhido({ itens, credencial: cred, funcionarioId: "func-x", agora: AGORA }),
    null
  );
  const deOutra = [item("d", { credencial_id: "cred-2" })];
  assert.equal(
    vinculoEscolhido({ itens: deOutra, credencial: cred, funcionarioId: "func-d", agora: AGORA }),
    null
  );
});

test("outrasEmpresasLiberadas: conta só as OUTRAS empresas liberadas (nada de 'esperando liberação')", () => {
  const itens = [item("a"), item("b"), provisoria("c", 1), item("d", { geracao_liberada: null })];
  assert.equal(
    outrasEmpresasLiberadas({ itens, credencial: credencial(), empresaId: "emp-a", agora: AGORA }),
    1
  );
  assert.equal(
    outrasEmpresasLiberadas({
      itens: [item("a")],
      credencial: credencial(),
      empresaId: "emp-a",
      agora: AGORA,
    }),
    0
  );
  assert.deepEqual(
    outrosVinculosLiberados({
      itens,
      credencial: credencial(),
      empresaId: "emp-a",
      agora: AGORA,
    }).map((i) => i.vinculo.funcionario_id),
    ["func-b"]
  );
  // vínculo de outra credencial nunca entra na lista
  assert.deepEqual(
    outrosVinculosLiberados({
      itens: [item("e", { credencial_id: "cred-2" })],
      credencial: credencial(),
      empresaId: "emp-a",
      agora: AGORA,
    }),
    []
  );
});

test("ttlDaTroca: o token da outra empresa vence junto com o de origem", () => {
  assert.equal(ttlDaTroca({ expOrigem: 1_000_600, agoraSeg: 1_000_000 }), 600);
  assert.equal(ttlDaTroca({ expOrigem: 1_000_000, agoraSeg: 1_000_000 }), 0);
  assert.equal(ttlDaTroca({ expOrigem: undefined, agoraSeg: 1_000_000 }), 0);
});

test("ativacaoValida: token de ativação amarrado à provisória (uma nova anula o anterior)", () => {
  const p = provisoria("b", 1);
  const payload = {
    scope: ESCOPO_ATIVACAO,
    credencial_id: "cred-1",
    funcionario_id: "func-b",
    empresa_id: "emp-b",
    pc: p.vinculo.provisoria_criada_em,
  };
  const base = {
    payload,
    credencial: credencial(),
    vinculo: p.vinculo,
    cadastro: p.cadastro,
    agora: AGORA,
  };
  assert.equal(ativacaoValida(base), true);
  assert.equal(ativacaoValida({ ...base, payload: { ...payload, scope: ESCOPO_SESSAO } }), false);
  assert.equal(
    ativacaoValida({ ...base, payload: { ...payload, pc: iso(AGORA - 3 * DIA) } }),
    false
  );
  assert.equal(
    ativacaoValida({ ...base, vinculo: { ...p.vinculo, provisoria_hash: null } }),
    false
  );
  assert.equal(ativacaoValida({ ...base, vinculo: { ...p.vinculo, ativo: false } }), false);
  assert.equal(ativacaoValida({ ...base, cadastro: { ...p.cadastro, cpf: CPF_B } }), false);
  assert.equal(ativacaoValida({ ...base, payload: { ...payload, empresa_id: "emp-a" } }), false);
});

// ------------------------------------------------------------------------------ senha nova, origem, defesa 1

test("podeCriarSenhaNova (defesa 1): sem senha qualquer vínculo; com senha só vínculo confirmado", () => {
  const semSenha = credencial({ senha_hash: null, senha_geracao: 0 });
  assert.equal(
    podeCriarSenhaNova({ credencial: semSenha, vinculo: vinculo({ confirmado_em: null }) }),
    true
  );
  assert.equal(
    podeCriarSenhaNova({ credencial: credencial(), vinculo: vinculo({ confirmado_em: null }) }),
    false
  );
  assert.equal(podeCriarSenhaNova({ credencial: credencial(), vinculo: vinculo() }), true);
  // o hash inutilizável do procedimento do operador conta como "com senha": só a empresa conferida cria
  const doOperador = credencial({
    senha_hash: "$2a$10$inutilizavel",
    senha_origem_empresa_id: null,
  });
  assert.equal(
    podeCriarSenhaNova({ credencial: doOperador, vinculo: vinculo({ confirmado_em: null }) }),
    false
  );
  assert.equal(
    podeCriarSenhaNova({ credencial: doOperador, vinculo: vinculo({ confirmado_em: iso(AGORA) }) }),
    true
  );
});

test("exigeTrocaNaAtivacao (caso 2): origem de OUTRA empresa exige; nula ou a mesma não", () => {
  assert.equal(
    exigeTrocaNaAtivacao({
      credencial: credencial({ senha_origem_empresa_id: "emp-a" }),
      empresaId: "emp-b",
    }),
    true
  );
  assert.equal(
    exigeTrocaNaAtivacao({
      credencial: credencial({ senha_origem_empresa_id: "emp-b" }),
      empresaId: "emp-b",
    }),
    false
  );
  assert.equal(
    exigeTrocaNaAtivacao({
      credencial: credencial({ senha_origem_empresa_id: null }),
      empresaId: "emp-b",
    }),
    false
  );
  // depois de um trocar_senha na empresa de origem a origem continua: ainda exige
  const depois = origemDepoisDaTroca({ origem: "emp-a", via: "sessao", empresaId: "emp-a" });
  assert.equal(
    exigeTrocaNaAtivacao({
      credencial: credencial({ senha_origem_empresa_id: depois }),
      empresaId: "emp-b",
    }),
    true
  );
});

test("origemDepoisDaTroca: só a troca da ativação em OUTRA empresa zera a origem", () => {
  assert.equal(
    origemDepoisDaTroca({ origem: "emp-a", via: "sessao", empresaId: "emp-a" }),
    "emp-a"
  );
  assert.equal(
    origemDepoisDaTroca({ origem: "emp-a", via: "sessao", empresaId: "emp-b" }),
    "emp-a"
  );
  assert.equal(
    origemDepoisDaTroca({ origem: "emp-a", via: "ativacao", empresaId: "emp-a" }),
    "emp-a"
  );
  assert.equal(origemDepoisDaTroca({ origem: "emp-a", via: "ativacao", empresaId: "emp-b" }), null);
  assert.equal(origemDepoisDaTroca({ origem: null, via: "ativacao", empresaId: "emp-b" }), null);
  assert.equal(origemDepoisDaTroca({ origem: null, via: "sessao", empresaId: "emp-b" }), null);
});

/** Aplica os patches de um efeito e devolve a situação de cada vínculo depois. */
function situacoesDepois(
  efeito: { credencial: Partial<CredencialDoPortal>; vinculo: Partial<VinculoDoPortal> },
  cred: CredencialDoPortal,
  itens: ItemDoVinculo[],
  funcionarioDaProvisoria: string
) {
  const novaCred = { ...cred, ...efeito.credencial, senha_hash: "$2a$10$nova" };
  return Object.fromEntries(
    itens.map((i) => {
      const v =
        i.vinculo.funcionario_id === funcionarioDaProvisoria
          ? { ...i.vinculo, ...efeito.vinculo }
          : i.vinculo;
      return [
        i.vinculo.empresa_id,
        situacaoDoVinculo({ vinculo: v, cadastro: i.cadastro, credencial: novaCred, agora: AGORA }),
      ];
    })
  );
}

test("efeitoDaSenhaNova (caso 1): primeira senha libera e confirma a empresa da provisória; origem = ela", () => {
  const cred = credencial({ senha_hash: null, senha_geracao: 0 });
  const p = provisoria("a", 0);
  const e = efeitoDaSenhaNova({ credencial: cred, item: p, itens: [p], agora: AGORA });
  assert.equal(e.credencial.senha_geracao, 1);
  assert.equal(e.credencial.senha_origem_empresa_id, "emp-a");
  assert.equal(e.credencial.tentativas, 0);
  assert.equal(e.credencial.bloqueado_ate, null);
  assert.equal(e.credencial.sessao_versao, 2);
  assert.equal(e.vinculo.geracao_liberada, 1);
  assert.equal(e.vinculo.confirmado_em, iso(AGORA));
  assert.equal(e.vinculo.provisoria_hash, null);
  assert.equal(e.vinculo.provisoria_criada_em, null);
  assert.equal(e.vinculo.provisoria_expira_em, null);
  assert.deepEqual(e.travadas, []);
  assert.deepEqual(situacoesDepois(e, cred, [p], "func-a"), { "emp-a": "liberado" });
});

test("efeitoDaSenhaNova (caso 3): sobe a geração, trava as outras liberadas e só a origem fica liberada", () => {
  const cred = credencial({ senha_geracao: 3, senha_origem_empresa_id: null });
  const a = item("a", { geracao_liberada: 3 });
  const c = item("c", { geracao_liberada: 3 });
  const b = provisoria("b", 1);
  b.vinculo.confirmado_em = iso(AGORA - 30 * DIA);
  const e = efeitoDaSenhaNova({ credencial: cred, item: b, itens: [a, b, c], agora: AGORA });
  assert.equal(e.credencial.senha_geracao, 4);
  assert.equal(e.credencial.senha_origem_empresa_id, "emp-b");
  // o confirmado_em antigo é mantido (não é a primeira vez)
  assert.equal(e.vinculo.confirmado_em, iso(AGORA - 30 * DIA));
  assert.deepEqual(
    e.travadas.map((t) => t.vinculo.empresa_id),
    ["emp-a", "emp-c"]
  );
  // a regra do §4.2: com origem não nula, só a origem fica liberada
  assert.deepEqual(situacoesDepois(e, cred, [a, b, c], "func-b"), {
    "emp-a": "travado",
    "emp-b": "liberado",
    "emp-c": "travado",
  });
});

test("efeitoDaConfirmacao (caso 2 sem troca): libera na geração atual, sem mexer na senha nem na origem", () => {
  const cred = credencial({ senha_geracao: 2, senha_origem_empresa_id: null, tentativas: 3 });
  const b = provisoria("b", 1);
  const e = efeitoDaConfirmacao({ credencial: cred, item: b, agora: AGORA, troca: false });
  assert.deepEqual(e.credencial, { tentativas: 0, bloqueado_ate: null });
  assert.equal(e.vinculo.geracao_liberada, 2);
  assert.equal(e.vinculo.confirmado_em, iso(AGORA));
  assert.equal(e.vinculo.provisoria_hash, null);
  assert.deepEqual(situacoesDepois(e, cred, [item("a", { geracao_liberada: 2 }), b], "func-b"), {
    "emp-a": "liberado",
    "emp-b": "liberado",
  });
});

test("efeitoDaConfirmacao (caso 2 com troca): não sobe a geração, derruba as sessões e zera a origem de outra empresa", () => {
  const cred = credencial({ senha_geracao: 1, senha_origem_empresa_id: "emp-a", sessao_versao: 4 });
  const b = provisoria("b", 1);
  const e = efeitoDaConfirmacao({ credencial: cred, item: b, agora: AGORA, troca: true });
  assert.equal(e.credencial.senha_geracao, undefined, "a troca não sobe a geração");
  assert.equal(e.credencial.sessao_versao, 5);
  assert.equal(e.credencial.senha_origem_empresa_id, null);
  assert.equal(e.credencial.senha_alterada_em, iso(AGORA));
  // a A continua liberada (mesma geração) e a B passa a estar
  assert.deepEqual(situacoesDepois(e, cred, [item("a"), b], "func-b"), {
    "emp-a": "liberado",
    "emp-b": "liberado",
  });
  // na própria empresa de origem, a troca da ativação mantém a origem
  const naOrigem = efeitoDaConfirmacao({
    credencial: credencial({ senha_origem_empresa_id: "emp-b" }),
    item: b,
    agora: AGORA,
    troca: true,
  });
  assert.equal(naOrigem.credencial.senha_origem_empresa_id, "emp-b");
});

// ------------------------------------------------------------------------------------------ eventos (§7)

test("eventosDaAtivacao: a trilha da empresa é IDÊNTICA no caso 1, no caso 2 e no caso 2 com troca", () => {
  const b = provisoria("b", 1);
  const formas = [
    eventosDaAtivacao({ forma: "senha_nova", primeira: true, item: b, travadas: [] }),
    eventosDaAtivacao({ forma: "senha_atual", primeira: false, item: b, travadas: [] }),
    eventosDaAtivacao({ forma: "troca", primeira: false, item: b, travadas: [] }),
  ];
  const esperada = [
    {
      empresa_id: "emp-b",
      funcionario_id: "func-b",
      evento: "login",
      detalhe: { via: "provisoria" },
    },
    {
      empresa_id: "emp-b",
      funcionario_id: "func-b",
      evento: EVENTO_ACESSO_LIBERADO,
      detalhe: null,
    },
  ];
  // a trilha de TODAS as empresas, na ordem em que o servidor grava (primeiro o que depende da senha)
  for (const f of formas) {
    assert.deepEqual(f.daLiberacao.trilha, esperada);
    assert.deepEqual([...f.daSenha.trilha, ...f.daLiberacao.trilha], esperada);
  }
});

test("eventosDaAtivacao: senha_criada, acesso_confirmado e troca_senha da ativação só no registro do operador", () => {
  const b = provisoria("b", 1);
  const nova = eventosDaAtivacao({ forma: "senha_nova", primeira: false, item: b, travadas: [] });
  assert.deepEqual(nova.daSenha.operador, [
    { empresa_id: "emp-b", evento: OPERADOR_SENHA_CRIADA, detalhe: { primeira: false } },
  ]);
  assert.deepEqual(nova.daLiberacao.operador, []);
  const atual = eventosDaAtivacao({ forma: "senha_atual", primeira: false, item: b, travadas: [] });
  assert.deepEqual(atual.daSenha.operador, []);
  assert.deepEqual(atual.daLiberacao.operador, [
    { empresa_id: "emp-b", evento: OPERADOR_ACESSO_CONFIRMADO, detalhe: { troca: false } },
  ]);
  const troca = eventosDaAtivacao({ forma: "troca", primeira: false, item: b, travadas: [] });
  assert.deepEqual(troca.daSenha.operador, [
    { empresa_id: "emp-b", evento: OPERADOR_TROCA_SENHA, detalhe: { via: "ativacao" } },
  ]);
  assert.deepEqual(troca.daLiberacao.operador, [
    { empresa_id: "emp-b", evento: OPERADOR_ACESSO_CONFIRMADO, detalhe: { troca: true } },
  ]);
  for (const f of [nova, atual, troca]) {
    for (const bloco of [f.daSenha, f.daLiberacao]) {
      const nomes = bloco.trilha.map((e) => e.evento);
      for (const doOperador of ["senha_criada", "acesso_confirmado", "reset_recusado"]) {
        assert.equal(nomes.includes(doOperador), false, doOperador);
      }
      assert.equal(nomes.includes("troca_senha"), false);
    }
  }
});

test("eventosDaAtivacao: cada empresa que travou recebe acesso_aguardando_provisoria, sem dizer qual mexeu", () => {
  const b = provisoria("b", 1);
  const r = eventosDaAtivacao({
    forma: "senha_nova",
    primeira: false,
    item: b,
    travadas: [item("a"), item("c")],
  });
  assert.deepEqual(r.daSenha.trilha, [
    {
      empresa_id: "emp-a",
      funcionario_id: "func-a",
      evento: EVENTO_ACESSO_AGUARDANDO_PROVISORIA,
      detalhe: { motivo: "senha_nova" },
    },
    {
      empresa_id: "emp-c",
      funcionario_id: "func-c",
      evento: EVENTO_ACESSO_AGUARDANDO_PROVISORIA,
      detalhe: { motivo: "senha_nova" },
    },
  ]);
  assert.equal(JSON.stringify(r.daSenha.trilha).includes("emp-b"), false);
});

// revisão 1, I1: a ativação grava a credencial primeiro e libera o vínculo depois; se a liberação falhar (a provisória
// mudou no meio), a senha JÁ mudou. O que depende só da senha tem de poder ser gravado sem esperar a liberação.
test("eventosDaAtivacao: o que depende só da senha (daSenha) não traz nada da empresa da provisória", () => {
  const b = provisoria("b", 1);
  const travadas = [item("a"), item("c")];
  for (const forma of ["senha_nova", "troca"] as const) {
    const r = eventosDaAtivacao({ forma, primeira: true, item: b, travadas });
    // as travadas e o registro do operador estão em daSenha...
    assert.ok(r.daSenha.operador.length > 0, forma);
    // ...e nenhum evento da trilha de daSenha é da empresa da provisória nem é login/acesso_liberado
    for (const e of r.daSenha.trilha) {
      assert.equal(e.evento, EVENTO_ACESSO_AGUARDANDO_PROVISORIA, forma);
      assert.notEqual(e.empresa_id, "emp-b", forma);
    }
  }
  const nova = eventosDaAtivacao({ forma: "senha_nova", primeira: true, item: b, travadas });
  assert.equal(nova.daSenha.trilha.length, 2);
});

test("eventosDaAtivacao: o que depende da liberação (daLiberacao) é só da empresa da provisória", () => {
  const b = provisoria("b", 1);
  const travadas = [item("a"), item("c")];
  for (const forma of ["senha_nova", "senha_atual", "troca"] as const) {
    const r = eventosDaAtivacao({ forma, primeira: false, item: b, travadas });
    assert.deepEqual(
      r.daLiberacao.trilha.map((e) => e.evento),
      ["login", EVENTO_ACESSO_LIBERADO],
      forma
    );
    for (const e of r.daLiberacao.trilha) assert.equal(e.empresa_id, "emp-b", forma);
    // nunca o que conta que a senha mudou: se a liberação falha, estes não podem ter sido gravados
    const doOperador = r.daLiberacao.operador.map((e) => e.evento);
    assert.equal(doOperador.includes(OPERADOR_SENHA_CRIADA), false, forma);
    assert.equal(doOperador.includes(OPERADOR_TROCA_SENHA), false, forma);
    assert.equal(
      r.daLiberacao.trilha.some((e) => e.evento === EVENTO_ACESSO_AGUARDANDO_PROVISORIA),
      false,
      forma
    );
  }
});

test("eventosDaAtivacao: acesso_confirmado só sai com a liberação (a consulta de alertas o usa para inocentar)", () => {
  // tools/portal-credencial-alertas.sql, regra 1: um reset_recusado seguido de acesso_confirmado é a própria pessoa.
  // Se a liberação falhasse e o acesso_confirmado já tivesse sido gravado, uma recusa suspeita sumiria da lista.
  const b = provisoria("b", 1);
  for (const forma of ["senha_nova", "senha_atual", "troca"] as const) {
    const r = eventosDaAtivacao({ forma, primeira: false, item: b, travadas: [] });
    assert.equal(
      r.daSenha.operador.some((e) => e.evento === OPERADOR_ACESSO_CONFIRMADO),
      false,
      forma
    );
  }
});

test("eventoDoResetRecusado: só no registro do operador (a trilha da empresa não pode contar que há senha)", () => {
  const r = eventoDoResetRecusado(provisoria("b", 1));
  assert.deepEqual(r.trilha, []);
  assert.deepEqual(r.operador, [
    { empresa_id: "emp-b", evento: OPERADOR_RESET_RECUSADO, detalhe: null },
  ]);
});

test("registrarEventoDaCredencial: grava no registro do operador com IP e dispositivo, nunca derruba", async () => {
  const linhas: { tabela: string; linha: Record<string, unknown> }[] = [];
  const fake = (erro: unknown) => ({
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        linhas.push({ tabela, linha });
        return { error: erro };
      },
    }),
  });
  const req = new Request("https://x.supabase.co/functions/v1/portal-funcionario", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.9", "user-agent": "Navegador/1.0" },
  });
  const ok = await registrarEventoDaCredencial(fake(null), req, {
    credencial_id: "cred-1",
    empresa_id: "emp-a",
    evento: OPERADOR_LOGIN_FALHA,
    detalhe: { tentativa: 1, bloqueou: false },
  });
  assert.equal(ok, true);
  assert.equal(linhas[0].tabela, "portal_credencial_evento");
  assert.equal(linhas[0].linha.ip, "203.0.113.9");
  assert.equal(linhas[0].linha.dispositivo, "Navegador/1.0");
  assert.equal(linhas[0].linha.credencial_id, "cred-1");
  const original = console.error;
  console.error = () => {};
  try {
    const falhou = await registrarEventoDaCredencial(fake({ message: "x" }), req, {
      credencial_id: "cred-1",
      empresa_id: null,
      evento: OPERADOR_LOGIN_FALHA,
      detalhe: null,
    });
    assert.equal(falhou, false);
  } finally {
    console.error = original;
  }
});

// ------------------------------------------------------------------------------------------ RH: criar (§6)

test("decidirCriarVinculo: sem credencial do CPF, cria; com credencial cpf de outra empresa, liga", () => {
  assert.deepEqual(
    decidirCriarVinculo({
      funcionarioId: "func-a",
      usuario: { usuario: CPF_A, tipo: "cpf" },
      credencialExistente: null,
      outrosNaEmpresa: [],
    }),
    { ok: true, credencial: "nova", desativar: [] }
  );
  assert.deepEqual(
    decidirCriarVinculo({
      funcionarioId: "func-b",
      usuario: { usuario: CPF_A, tipo: "cpf" },
      credencialExistente: { id: "cred-1", tipo: "cpf" },
      // o vínculo da OUTRA empresa não entra aqui: outrosNaEmpresa é só da empresa do RH
      outrosNaEmpresa: [],
    }),
    { ok: true, credencial: "existente", desativar: [] }
  );
});

test("decidirCriarVinculo: usuário com letras já usado é USUARIO_EM_USO; CPF igual a usuário manual legado é conflito", () => {
  const manual = decidirCriarVinculo({
    funcionarioId: "func-a",
    usuario: { usuario: "joao.silva", tipo: "manual" },
    credencialExistente: { id: "cred-9", tipo: "manual" },
    outrosNaEmpresa: [],
  });
  assert.equal(manual.ok, false);
  if (!manual.ok) {
    assert.equal(manual.status, 409);
    assert.equal(manual.codigo, "USUARIO_EM_USO");
    assert.match(
      manual.mensagem,
      /Este usuário já existe no portal. Escolha outro, por exemplo joao.silva2/
    );
  }
  const legado = decidirCriarVinculo({
    funcionarioId: "func-a",
    usuario: { usuario: CPF_A, tipo: "cpf" },
    credencialExistente: { id: "cred-9", tipo: "manual" },
    outrosNaEmpresa: [],
  });
  assert.equal(legado.ok, false);
  if (!legado.ok) {
    assert.equal(legado.codigo, "CPF_EM_CONFLITO");
    assert.equal(legado.mensagem.includes(CPF_A), false, "a mensagem não repete o CPF");
  }
});

test("decidirCriarVinculo: credencial órfã (vínculo que falhou ao gravar) é reaproveitada, inclusive a com letras", () => {
  assert.deepEqual(
    decidirCriarVinculo({
      funcionarioId: "func-a",
      usuario: { usuario: "joao.silva", tipo: "manual" },
      credencialExistente: { id: "cred-9", tipo: "manual", orfa: true },
      outrosNaEmpresa: [],
    }),
    { ok: true, credencial: "existente", desativar: [] }
  );
  assert.deepEqual(
    decidirCriarVinculo({
      funcionarioId: "func-a",
      usuario: { usuario: CPF_A, tipo: "cpf" },
      credencialExistente: { id: "cred-9", tipo: "cpf", orfa: true },
      outrosNaEmpresa: [],
    }),
    { ok: true, credencial: "existente", desativar: [] }
  );
  // órfã de outro tipo continua conflito
  const tipoTrocado = decidirCriarVinculo({
    funcionarioId: "func-a",
    usuario: { usuario: CPF_A, tipo: "cpf" },
    credencialExistente: { id: "cred-9", tipo: "manual", orfa: true },
    outrosNaEmpresa: [],
  });
  assert.equal(tipoTrocado.ok, false);
});

test("conflitoDeOutroCadastro: outro cadastro ATIVO com acesso na empresa é 409; inativo é desativado (readmissão)", () => {
  const outroAtivo = item(
    "a",
    { funcionario_id: "func-a2" },
    { nome_completo: "Fulano Antigo", data_admissao: "2025-03-10" }
  );
  const r = conflitoDeOutroCadastro({ funcionarioId: "func-a", outrosNaEmpresa: [outroAtivo] });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.codigo, "OUTRO_CADASTRO_COM_ACESSO");
    assert.match(r.mensagem, /Fulano Antigo/);
    assert.match(r.mensagem, /10\/03\/2025/);
  }
  const inativo = item("a", { funcionario_id: "func-a2" }, { ativo: false });
  const apagado = item("a", { funcionario_id: "func-a3" }, { deleted_at: iso(AGORA) });
  const desligado = item("a", { funcionario_id: "func-a4", ativo: false }); // vínculo já desativado: nada a fazer
  assert.deepEqual(
    conflitoDeOutroCadastro({
      funcionarioId: "func-a",
      outrosNaEmpresa: [inativo, apagado, desligado],
    }),
    { ok: true, desativar: ["func-a2", "func-a3"] }
  );
  // o próprio cadastro não conta
  assert.deepEqual(
    conflitoDeOutroCadastro({ funcionarioId: "func-a", outrosNaEmpresa: [item("a")] }),
    {
      ok: true,
      desativar: [],
    }
  );
});

test("respostaDoCriar: as mesmas chaves com e sem credencial em outra empresa (§6)", () => {
  const r = respostaDoCriar({ usuario: CPF_A, senha: "ABCD2345" });
  assert.deepEqual(r, {
    usuario: CPF_A,
    senha_provisoria: "ABCD2345",
    url_path: "/PortalFuncionario",
  });
  // a decisão "liga" e "cria" levam à MESMA resposta: nada nela depende da credencial existir
  assert.deepEqual(Object.keys(r).sort(), ["senha_provisoria", "url_path", "usuario"]);
});

test("provisoriaNova: vence em 7 dias", () => {
  assert.equal(VALIDADE_PROVISORIA_DIAS, 7);
  assert.deepEqual(provisoriaNova(AGORA), {
    provisoria_criada_em: iso(AGORA),
    provisoria_expira_em: iso(AGORA + 7 * DIA),
  });
});

// --------------------------------------------------------------------------------- RH: redefinir e status

test("alvoDaRedefinicao: mesma credencial, religar ao CPF novo (caso 7) ou ao CPF cadastrado depois (R9)", () => {
  assert.deepEqual(alvoDaRedefinicao({ cadastro: cadastro(), credencialAtual: credencial() }), {
    ok: true,
    religar: false,
  });
  assert.deepEqual(
    alvoDaRedefinicao({ cadastro: cadastro({ cpf: CPF_B }), credencialAtual: credencial() }),
    {
      ok: true,
      religar: true,
      usuario: CPF_B,
      tipo: "cpf",
    }
  );
  const manual = credencial({ tipo: "manual", usuario: "joao.silva" });
  assert.deepEqual(
    alvoDaRedefinicao({ cadastro: cadastro({ cpf: "" }), credencialAtual: manual }),
    {
      ok: true,
      religar: false,
    }
  );
  assert.deepEqual(
    alvoDaRedefinicao({ cadastro: cadastro({ cpf: CPF_B }), credencialAtual: manual }),
    {
      ok: true,
      religar: true,
      usuario: CPF_B,
      tipo: "cpf",
    }
  );
});

test("alvoDaRedefinicao: CPF inválido ou CPF apagado do cadastro não redefinem", () => {
  const errado = CPF_B.slice(0, 10) + String((Number(CPF_B[10]) + 1) % 10);
  const invalido = alvoDaRedefinicao({
    cadastro: cadastro({ cpf: errado }),
    credencialAtual: credencial(),
  });
  assert.equal(invalido.ok, false);
  if (!invalido.ok) assert.equal(invalido.codigo, "CPF_INVALIDO");
  const semCpf = alvoDaRedefinicao({
    cadastro: cadastro({ cpf: null }),
    credencialAtual: credencial(),
  });
  assert.equal(semCpf.ok, false);
  if (!semCpf.ok) assert.equal(semCpf.codigo, "SEM_CPF");
  // vínculo de antes da cópia (sem credencial): liga ao CPF do cadastro
  assert.deepEqual(alvoDaRedefinicao({ cadastro: cadastro(), credencialAtual: null }), {
    ok: true,
    religar: true,
    usuario: CPF_A,
    tipo: "cpf",
  });
});

test("efeitoDaRedefinicao: nova provisória, tira a liberação, reativa, derruba as sessões desta empresa", () => {
  const v = vinculo({ sessao_versao: 3, ativo: false });
  const e = efeitoDaRedefinicao({
    vinculo: v,
    provisoriaHash: "$2a$10$p",
    agora: AGORA,
    religarPara: null,
  });
  assert.deepEqual(e, {
    provisoria_hash: "$2a$10$p",
    provisoria_criada_em: iso(AGORA),
    provisoria_expira_em: iso(AGORA + 7 * DIA),
    geracao_liberada: null,
    ativo: true,
    sessao_versao: 4,
  });
  // não mexe no confirmado_em (o fluxo normal nunca o apaga) nem no bloqueio (é da credencial)
  assert.equal("confirmado_em" in e, false);
  assert.equal("tentativas" in e, false);
  // religar (caso 7): vínculo novo para a outra credencial, sem a confirmação da antiga
  const religado = efeitoDaRedefinicao({
    vinculo: v,
    provisoriaHash: "$2a$10$p",
    agora: AGORA,
    religarPara: "cred-2",
  });
  assert.equal(religado.credencial_id, "cred-2");
  assert.equal(religado.confirmado_em, null);
  assert.equal(religado.geracao_liberada, null);
});

test("statusDoVinculo: selo da Ficha; Bloqueado só em vínculo liberado (defesa 4)", () => {
  const bloqueada = credencial({ bloqueado_ate: iso(AGORA + 60_000) });
  const liberado = statusDoVinculo({
    vinculo: vinculo({ ultimo_acesso: iso(AGORA - DIA) }),
    credencial: bloqueada,
    cadastro: cadastro(),
    agora: AGORA,
  });
  assert.deepEqual(liberado, {
    funcionario_id: "func-a",
    usuario: CPF_A,
    ativo: true,
    situacao: "liberado",
    primeiro_acesso_pendente: false,
    precisa_provisoria: false,
    bloqueado: true,
    ultimo_acesso: iso(AGORA - DIA),
  });
  const travado = statusDoVinculo({
    vinculo: vinculo({ geracao_liberada: null }),
    credencial: bloqueada,
    cadastro: cadastro(),
    agora: AGORA,
  });
  assert.equal(travado.bloqueado, false);
  assert.equal(travado.precisa_provisoria, true);
  const aguardando = statusDoVinculo({
    vinculo: provisoria("a", 1).vinculo,
    credencial: credencial(),
    cadastro: cadastro(),
    agora: AGORA,
  });
  assert.equal(aguardando.primeiro_acesso_pendente, true);
  assert.equal(aguardando.situacao, "aguardando_provisoria");
  const cpfMudou = statusDoVinculo({
    vinculo: vinculo(),
    credencial: credencial(),
    cadastro: cadastro({ cpf: CPF_B }),
    agora: AGORA,
  });
  assert.equal(cpfMudou.precisa_provisoria, true);
});
