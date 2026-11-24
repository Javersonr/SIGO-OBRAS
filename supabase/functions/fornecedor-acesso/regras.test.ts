// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/fornecedor-acesso/regras.test.ts
//
// Regras do fornecedor-acesso (Lote 2b-2): quem pode, o que volta em cada ação e o que vai para a
// auditoria. Dados sintéticos: nenhum nome, e-mail ou identificador real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACOES_FORNECEDOR_ACESSO,
  MENSAGEM_SEM_EMAIL,
  camposDaTroca,
  linhaSemIp,
  PAGINA_DE_VINCULOS,
  procurarVinculoDoChamador,
  passosDaCredencial,
  vinculoDoChamadorNaLista,
  BASE_CANONICA,
  baseDoLink,
  decidirCredencial,
  emailNormalizado,
  idValido,
  ipParaAuditoria,
  linkDaCotacao,
  montarLinks,
  podeUsarCotacoes,
  registroDaCredencial,
  registroDoLink,
  statusDosAcessos,
} from "./regras.ts";

const ID = "3f2b8c1e-5d4a-4b6e-9c7d-0a1b2c3d4e5f";
const ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TOKEN = "A".repeat(20) + "b_-" + "9".repeat(20); // 43 caracteres no formato da 0113

const vinculo = (extra: Record<string, unknown> = {}) => ({
  perfil: "Compras",
  is_owner: false,
  ativo: true,
  deleted_at: null,
  permissoes: null,
  ...extra,
});

// ------------------------------------------------------------ ações
test("ações: as quatro combinadas com a tela (credencial saiu: a senha não volta mais à tela)", () => {
  assert.deepEqual([...ACOES_FORNECEDOR_ACESSO].sort(), [
    "enviar_senha",
    "links",
    "reemitir_link",
    "status",
  ]);
});

// ------------------------------------------------------------ permissão
test("super admin passa mesmo sem vínculo", () => {
  assert.equal(podeUsarCotacoes({ superAdmin: true, vinculo: null }), true);
});

test("sem vínculo, vínculo inativo ou excluído: não passa (nem Admin)", () => {
  assert.equal(podeUsarCotacoes({ superAdmin: false, vinculo: null }), false);
  assert.equal(
    podeUsarCotacoes({ superAdmin: false, vinculo: vinculo({ perfil: "Admin", ativo: false }) }),
    false
  );
  assert.equal(
    podeUsarCotacoes({
      superAdmin: false,
      vinculo: vinculo({ perfil: "Admin", deleted_at: "2026-01-01T00:00:00Z" }),
    }),
    false
  );
});

test("Admin, Admin Holding e dono passam sem permissão marcada", () => {
  for (const extra of [{ perfil: "Admin" }, { perfil: "Admin Holding" }, { is_owner: true }]) {
    assert.equal(podeUsarCotacoes({ superAdmin: false, vinculo: vinculo(extra) }), true);
  }
});

test("aba Cotações de Compras (qualquer função marcada) passa; outra aba ou outro módulo, não", () => {
  const com = (permissoes: unknown) =>
    podeUsarCotacoes({ superAdmin: false, vinculo: vinculo({ permissoes }) });
  assert.equal(com({ Compras: { Cotações: { visualizar: true } } }), true);
  assert.equal(com(JSON.stringify({ Compras: { Cotações: { enviar: true } } })), true); // jsonb-string
  assert.equal(com({ Compras: { Cotações: { visualizar: false } } }), false);
  assert.equal(com({ Compras: { Histórico: { visualizar: true } } }), false);
  assert.equal(com({ Estoque: { Materiais: { editar: true } } }), false);
  assert.equal(com(null), false);
});

// ------------------------------------------------------------ ids
test("idValido: só uuid", () => {
  assert.equal(idValido(ID), true);
  assert.equal(idValido(ID.toUpperCase()), true);
  for (const v of ["", "abc", null, undefined, 123, `${ID}x`, "' or 1=1 --"]) {
    assert.equal(idValido(v), false, String(v));
  }
});

// ------------------------------------------------------------ links
test("baseDoLink: produção e origem desconhecida = endereço com www; dev = a própria origem", () => {
  assert.equal(BASE_CANONICA, "https://www.sigoobras.com.br");
  assert.equal(baseDoLink("https://sigoobras.com.br"), BASE_CANONICA);
  assert.equal(baseDoLink("https://www.sigoobras.com.br"), BASE_CANONICA);
  assert.equal(baseDoLink("https://site-qualquer.example"), BASE_CANONICA);
  assert.equal(baseDoLink(null), BASE_CANONICA);
  assert.equal(baseDoLink("http://localhost:5173"), "http://localhost:5173");
});

test("baseDoLink: as origens de dev são as mesmas do CORS", () => {
  const cors = readFileSync(fileURLToPath(new URL("../_shared/cors.ts", import.meta.url)), "utf8");
  for (const origem of [
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
  ]) {
    assert.ok(cors.includes(`"${origem}"`), origem);
    assert.equal(baseDoLink(origem), origem);
  }
});

test("linkDaCotacao: mesmo caminho que a tela montava; token fora do formato não vira link", () => {
  assert.equal(
    linkDaCotacao(BASE_CANONICA, TOKEN),
    `https://www.sigoobras.com.br/AcessoFornecedor?token=${TOKEN}`
  );
  assert.equal(linkDaCotacao(BASE_CANONICA, null), null);
  assert.equal(linkDaCotacao(BASE_CANONICA, "curto"), null);
  assert.equal(linkDaCotacao(BASE_CANONICA, TOKEN + "&x=1"), null);
});

test("montarLinks: um item por participação, sem devolver o token solto", () => {
  const links = montarLinks(BASE_CANONICA, [
    { id: ID, fornecedor_id: ID2, token: TOKEN },
    { id: ID2, fornecedor_id: ID, token: null },
  ]);
  assert.deepEqual(links, [
    {
      cotacao_fornecedor_id: ID,
      fornecedor_id: ID2,
      link: `${BASE_CANONICA}/AcessoFornecedor?token=${TOKEN}`,
    },
    { cotacao_fornecedor_id: ID2, fornecedor_id: ID, link: null },
  ]);
  assert.ok(links.every((l) => !("token" in l)));
  assert.deepEqual(montarLinks(BASE_CANONICA, null), []);
});

// ------------------------------------------------------------ status
test("statusDosAcessos: primeiro ativo vale; sem ativo, mostra que existe mas inativo; nunca o hash", () => {
  const r = statusDosAcessos(
    [ID, ID2, "sem-acesso", ID],
    [
      { id: "a1", fornecedor_id: ID, fornecedor_email: "inativo@exemplo.test", ativo: false },
      { id: "a2", fornecedor_id: ID, fornecedor_email: "ativo@exemplo.test", ativo: true },
      { id: "a3", fornecedor_id: ID2, fornecedor_email: "velho@exemplo.test", ativo: false },
    ],
    [
      { id: ID, email: null, telefone: "(11) 99999-0000" },
      { id: ID2, email: "", telefone: "123" },
      { id: "sem-acesso", email: "Cadastro@Exemplo.test", telefone: null },
    ]
  );
  assert.deepEqual(r, [
    {
      fornecedor_id: ID,
      email: "ativo@exemplo.test",
      tem_acesso: true,
      ativo: true,
      tem_email: true,
      tem_telefone: true,
    },
    {
      fornecedor_id: ID2,
      email: "velho@exemplo.test",
      tem_acesso: true,
      ativo: false,
      tem_email: false, // o e-mail de um acesso INATIVO não conta (o envio cria acesso com o do cadastro)
      tem_telefone: false,
    },
    {
      fornecedor_id: "sem-acesso",
      email: null,
      tem_acesso: false,
      ativo: false,
      tem_email: true,
      tem_telefone: false,
    },
  ]);
  for (const item of r) {
    assert.ok(!("senha_acesso" in item));
    assert.ok(!("telefone" in item)); // o número nunca sai na resposta
  }
});

// ------------------------------------------------------------ vínculo (revisão do 2b-2, C3)
test("podeUsarCotacoes: vínculo com ativo NULO conta como ativo (igual à tela e ao banco)", () => {
  assert.equal(
    podeUsarCotacoes({
      superAdmin: false,
      vinculo: vinculo({
        ativo: null,
        permissoes: { Compras: { Cotações: { visualizar: true } } },
      }),
    }),
    true
  );
  assert.equal(
    podeUsarCotacoes({ superAdmin: false, vinculo: vinculo({ perfil: "Admin", ativo: null }) }),
    true
  );
});

test("vinculoDoChamadorNaLista: e-mail sem diferenciar maiúsculas, ativo nulo vale, desativado não", () => {
  const lista = [
    { usuario_email: "Outra@Exemplo.test", perfil: "Admin", ativo: true, deleted_at: null },
    { usuario_email: "Compras@Exemplo.TEST", perfil: "Compras", ativo: false, deleted_at: null },
    { usuario_email: "compras@exemplo.test", perfil: "Compras", ativo: null, deleted_at: null },
  ];
  assert.equal(vinculoDoChamadorNaLista(lista, "COMPRAS@exemplo.test"), lista[2]);
  assert.equal(vinculoDoChamadorNaLista(lista, "ninguem@exemplo.test"), null);
  assert.equal(vinculoDoChamadorNaLista(lista, ""), null);
  assert.equal(vinculoDoChamadorNaLista(null, "compras@exemplo.test"), null);
  // só desativado: não acha
  assert.equal(vinculoDoChamadorNaLista([lista[1]], "compras@exemplo.test"), null);
  // "_" e "%" são letras, não curingas
  assert.equal(
    vinculoDoChamadorNaLista(
      [{ usuario_email: "aXb@exemplo.test", ativo: true }],
      "a_b@exemplo.test"
    ),
    null
  );
});

// ------------------------------------------------------------ credencial
test("emailNormalizado: sem espaços e minúsculo; não-texto vira vazio", () => {
  assert.equal(emailNormalizado("  Fulano@Exemplo.TEST "), "fulano@exemplo.test");
  assert.equal(emailNormalizado(null), "");
  assert.equal(emailNormalizado(42), "");
});

test("o login do portal procura o e-mail em minúsculas e sem espaços (o que a troca grava)", () => {
  const login = readFileSync(
    fileURLToPath(new URL("../portal-fornecedor-login/index.ts", import.meta.url)),
    "utf8"
  );
  assert.match(login, /const email = \(body\.email \?\? ""\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(login, /\.in\("fornecedor_email", \[\.\.\.new Set\(\[email, orig\]\)\]\)/);
  // a linha com e-mail legado é gravada no formato que o login acha
  const d = decidirCredencial({
    acessosAtivos: [{ id: ID, fornecedor_email: "  Login@Exemplo.TEST " }],
    emailDoCadastro: "outro@exemplo.test",
  });
  assert.equal(d.tipo, "rotacionar");
  const gravado = camposDaTroca("hash-sintetico", d.tipo === "rotacionar" ? d.email : "");
  assert.equal(gravado.fornecedor_email, "login@exemplo.test");
  assert.equal(gravado.fornecedor_email, emailNormalizado("  Login@Exemplo.TEST "));
});

test("decidirCredencial: com acesso ativo, troca a senha e o login sai normalizado (C1)", () => {
  assert.deepEqual(
    decidirCredencial({
      acessosAtivos: [{ id: ID, fornecedor_email: "Login@Exemplo.test" }],
      emailDoCadastro: "outro@exemplo.test",
    }),
    { tipo: "rotacionar", acessoId: ID, email: "login@exemplo.test" }
  );
});

test("decidirCredencial: acesso sem e-mail usa o do cadastro; nenhum e-mail = sem_email", () => {
  assert.deepEqual(
    decidirCredencial({
      acessosAtivos: [{ id: ID, fornecedor_email: null }],
      emailDoCadastro: " Forn@Exemplo.test",
    }),
    { tipo: "rotacionar", acessoId: ID, email: "forn@exemplo.test" }
  );
  assert.deepEqual(
    decidirCredencial({
      acessosAtivos: [{ id: ID, fornecedor_email: "  " }],
      emailDoCadastro: null,
    }),
    { tipo: "sem_email" }
  );
});

test("decidirCredencial: várias linhas ativas → a primeira com e-mail define o login", () => {
  assert.deepEqual(
    decidirCredencial({
      acessosAtivos: [
        { id: ID, fornecedor_email: null },
        { id: ID2, fornecedor_email: "Segunda@Exemplo.test" },
      ],
      emailDoCadastro: "cadastro@exemplo.test",
    }),
    { tipo: "rotacionar", acessoId: ID, email: "segunda@exemplo.test" }
  );
});

test("decidirCredencial: sem acesso ativo, cria com o e-mail do cadastro; sem e-mail, nada", () => {
  assert.deepEqual(
    decidirCredencial({ acessosAtivos: [], emailDoCadastro: " Forn@Exemplo.test " }),
    { tipo: "criar", email: "forn@exemplo.test" }
  );
  assert.deepEqual(decidirCredencial({ acessosAtivos: null, emailDoCadastro: "  " }), {
    tipo: "sem_email",
  });
  assert.deepEqual(decidirCredencial({ acessosAtivos: undefined, emailDoCadastro: null }), {
    tipo: "sem_email",
  });
});

test("passosDaCredencial: toda credencial termina trocando TODAS as linhas ativas (C2)", () => {
  assert.deepEqual(passosDaCredencial({ tipo: "criar", email: "a@exemplo.test" }), [
    "criar",
    "trocar_todas",
  ]);
  assert.deepEqual(
    passosDaCredencial({ tipo: "rotacionar", acessoId: ID, email: "a@exemplo.test" }),
    ["trocar_todas"]
  );
  assert.deepEqual(passosDaCredencial({ tipo: "sem_email" }), []);
});

test("camposDaTroca: o mesmo hash e o mesmo e-mail normalizado para todas as linhas", () => {
  assert.deepEqual(camposDaTroca("h", " A@Exemplo.TEST"), {
    senha_acesso: "h",
    fornecedor_email: "a@exemplo.test",
  });
});

test("duplo clique (simulado): duas chamadas, a última a terminar vale para todas as linhas", () => {
  // as duas viram "sem acesso" e criam uma linha cada; cada uma termina trocando todas as ativas
  const linhas: { id: string; senha_acesso: string; fornecedor_email: string }[] = [];
  const executar = (id: string, hash: string, passo: "criar" | "trocar_todas") => {
    const campos = camposDaTroca(hash, "Forn@Exemplo.test");
    if (passo === "criar") linhas.push({ id, ...campos });
    else for (const l of linhas) Object.assign(l, campos);
  };
  const d = decidirCredencial({ acessosAtivos: [], emailDoCadastro: "Forn@Exemplo.test" });
  const [criar, trocar] = passosDaCredencial(d);
  executar("A", "hashA", criar);
  executar("B", "hashB", criar);
  executar("B", "hashB", trocar);
  executar("A", "hashA", trocar); // A termina por último
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.senha_acesso === "hashA"));
  assert.ok(linhas.every((l) => l.fornecedor_email === "forn@exemplo.test"));
});

test("MENSAGEM_SEM_EMAIL explica que a mensagem vai sem login e senha", () => {
  assert.match(MENSAGEM_SEM_EMAIL, /não tem e-mail/);
  assert.match(MENSAGEM_SEM_EMAIL, /sem login e senha/);
});

// ------------------------------------------------------------ auditoria
const baseRegistro = {
  empresaId: ID,
  chamadorEmail: "compras@exemplo.test",
  fornecedorId: ID2,
  fornecedorNome: "Fornecedor Sintético",
  ip: "203.0.113.7",
  userAgent: "navegador de teste",
};

test("registroDaCredencial: a linha ANTES da troca diz 'pediu', com status iniciado (não sucesso)", () => {
  const r = registroDaCredencial({
    ...baseRegistro,
    acessoId: ID,
    acessoNovo: true,
    status: "iniciado",
  });
  assert.equal(r.status, "iniciado");
  assert.match(r.descricao, /compras@exemplo\.test pediu o envio de senha nova/);
  assert.doesNotMatch(r.descricao, /gerou/);
});

test("registroDaCredencial: quem, qual fornecedor e qual acesso; nada de senha", () => {
  const r = registroDaCredencial({
    ...baseRegistro,
    acessoId: ID,
    acessoNovo: true,
    status: "sucesso",
    acessosTrocados: 2,
  });
  assert.equal(r.empresa_id, ID);
  assert.equal(r.usuario_email, "compras@exemplo.test");
  assert.equal(r.tipo_acao, "senha_portal_fornecedor");
  assert.equal(r.entidade, "fornecedor_acesso");
  assert.equal(r.entidade_id, ID);
  assert.equal(r.entidade_nome, "Fornecedor Sintético");
  assert.equal(r.modulo, "Compras");
  assert.equal(r.status, "sucesso");
  assert.equal(r.mensagem_erro, null);
  assert.equal(r.endereco_ip, "203.0.113.7");
  assert.deepEqual(r.dados_novos, { fornecedor_id: ID2, acesso_novo: true, acessos_trocados: 2 });
  assert.match(r.descricao, /compras@exemplo\.test enviou senha nova/);
  assert.match(r.descricao, /acesso novo/);
  assert.doesNotMatch(JSON.stringify(r), /senha_acesso|hash/i);
  // as colunas obrigatórias da audit_log (0002): empresa_id, usuario_email, tipo_acao, entidade, descricao
  for (const k of ["empresa_id", "usuario_email", "tipo_acao", "entidade", "descricao"]) {
    assert.ok(r[k as keyof typeof r], k);
  }
});

test("registroDaCredencial: a falha diz que a senha anterior continua valendo e corta o erro", () => {
  const r = registroDaCredencial({
    ...baseRegistro,
    acessoId: ID,
    acessoNovo: false,
    status: "erro",
    erro: "x".repeat(1000),
  });
  assert.equal(r.status, "erro");
  assert.equal(r.mensagem_erro?.length, 300);
  assert.match(r.descricao, /senha anterior continua valendo/);
});

test("registroDoLink: pedido, troca e falha registrados com a cotação", () => {
  const dados = { ...baseRegistro, cotacaoFornecedorId: ID, cotacaoId: ID2 };
  const r = registroDoLink({ ...dados, status: "sucesso" });
  assert.equal(r.tipo_acao, "link_cotacao_reemitido");
  assert.equal(r.entidade, "cotacao_fornecedor");
  assert.equal(r.entidade_id, ID);
  assert.deepEqual(r.dados_novos, { fornecedor_id: ID2, cotacao_id: ID2 });
  assert.match(r.descricao, /link anterior deixou de valer/);
  const ini = registroDoLink({ ...dados, status: "iniciado" });
  assert.equal(ini.status, "iniciado");
  assert.match(ini.descricao, /pediu link novo/);
  assert.match(registroDoLink({ ...dados, status: "erro" }).descricao, /continua valendo/);
});

test("ipParaAuditoria: só IPv4/IPv6; o resto vira null (a coluna é inet)", () => {
  assert.equal(ipParaAuditoria("203.0.113.7"), "203.0.113.7");
  assert.equal(ipParaAuditoria("2001:db8::/64"), "2001:db8::/64");
  assert.equal(ipParaAuditoria("2001:db8::1"), "2001:db8::1");
  for (const lixo of ["<script>", "cafe", "1.2.3", "999.1.1.1", "", null, undefined]) {
    assert.equal(ipParaAuditoria(lixo), null, String(lixo));
  }
});

test("linhaSemIp: a 2ª tentativa vai sem IP; sem IP não há o que repetir", () => {
  assert.deepEqual(linhaSemIp({ endereco_ip: "203.0.113.7", x: 1 }), { endereco_ip: null, x: 1 });
  assert.equal(linhaSemIp({ endereco_ip: null }), null);
});

// ------------------------------------------------------------ index.ts (conferência de texto)
const index = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

test("index.ts: identidade só pelo JWT e empresa só da sessão", () => {
  assert.match(index, /usuarioDaRequisicao\(req\)/);
  assert.match(index, /const empresaId = chamador\.empresa_id;/);
  assert.doesNotMatch(index, /body\.empresa_id/);
  assert.doesNotMatch(index, /body\.email/);
});

test("index.ts: o vínculo não filtra por ativo; e-mail exato em minúsculas e, sem achar, páginas (C3)", () => {
  const ini = index.indexOf("async function vinculoDoChamador");
  const bloco = index.slice(ini, index.indexOf("async function cotacaoDaEmpresa"));
  assert.match(bloco, /procurarVinculoDoChamador\(/);
  assert.doesNotMatch(bloco, /\.eq\("ativo"/);
  assert.doesNotMatch(bloco, /ilike/);
  assert.match(bloco, /\.eq\("usuario_email", emailMinusculo\)/);
  assert.match(bloco, /\.range\(inicio, fim\)/);
});

test("index.ts: toda leitura/gravação de tabela de negócio é filtrada pela empresa", () => {
  const tabelas = index.match(/\.from\("(\w+)"\)/g) ?? [];
  assert.ok(tabelas.length > 0);
  // cada bloco .from("x") que não é audit_log tem um .eq("empresa_id", empresaId) antes do próximo .from
  const blocos = index.split(/\.from\("/).slice(1);
  for (const bloco of blocos) {
    const tabela = bloco.slice(0, bloco.indexOf('"'));
    if (tabela === "audit_log") continue;
    if (tabela === "empresa") {
      // o nome da empresa para a mensagem: a própria empresa da sessão
      assert.match(bloco.split(";")[0], /\.eq\("id", empresaId\)/);
      continue;
    }
    if (tabela === "fornecedor_acesso" && /^fornecedor_acesso"\)\.insert\(\{/.test(bloco)) {
      assert.match(bloco, /empresa_id: empresaId/);
      continue;
    }
    assert.match(bloco.split(";")[0], /\.eq\("empresa_id", empresaId\)/, tabela);
  }
});

test("index.ts: a troca vale para TODAS as linhas ativas do fornecedor, não só uma (C2)", () => {
  const troca = index.slice(index.indexOf(".update(campos)"));
  const filtro = troca.slice(0, troca.indexOf(";"));
  assert.match(filtro, /\.eq\("fornecedor_id", fornecedorId\)/);
  assert.match(filtro, /\.eq\("ativo", true\)/);
  assert.doesNotMatch(filtro, /\.eq\("id"/);
  assert.doesNotMatch(index, /\.limit\(1\)/);
});

test("index.ts: a senha nunca vai para o registro de auditoria nem para o log", () => {
  assert.doesNotMatch(index, /registroDaCredencial\([^)]*\b(senha|hash)\b/);
  // nenhum console.* recebe a variável da senha ou do hash como argumento
  assert.doesNotMatch(index, /console\.\w+\([^)]*,\s*(senha|hash)\b/);
});

test("index.ts: o rastro 'iniciado' do link é gravado ANTES da troca; a senha usa o fluxo do envio-senha.ts", () => {
  assert.match(index, /enviarSenhaDoFornecedor\(/);
  const rastroLink = index.indexOf('registroDoLink({ ...dadosDoLink, status: "iniciado" })');
  const trocaLink = index.indexOf(".update({ token: null })");
  const sucessoLink = index.indexOf('registroDoLink({ ...dadosDoLink, status: "sucesso" })');
  assert.ok(rastroLink > 0 && trocaLink > rastroLink && sucessoLink > trocaLink);
});

test("index.ts: toda gravação na auditoria passa por gravarAuditoria (repete sem IP)", () => {
  const inserts = index.match(/\.from\("audit_log"\)\.insert\(/g) ?? [];
  assert.equal(inserts.length, 2); // a tentativa e a repetição sem IP, dentro de gravarAuditoria
});

// ------------------------------------------------------------ vínculo em páginas (2ª revisão)
test("procurarVinculoDoChamador: acha pelo e-mail exato em minúsculas sem ler a empresa", async () => {
  const paginas: [number, number][] = [];
  const v = await procurarVinculoDoChamador(
    {
      porEmail: async (e) => {
        assert.equal(e, "compras@exemplo.test");
        return [{ usuario_email: "compras@exemplo.test", perfil: "Compras", ativo: null }];
      },
      pagina: async (i, f) => (paginas.push([i, f]), []),
    },
    "Compras@Exemplo.TEST"
  );
  assert.equal(v?.perfil, "Compras");
  assert.deepEqual(paginas, []);
});

test("procurarVinculoDoChamador: e-mail gravado com maiúsculas é achado na 3ª página", async () => {
  const outro = (n: number) => ({
    usuario_email: `outro${n}@exemplo.test`,
    perfil: "Estoque",
    ativo: true,
  });
  const lidas: [number, number][] = [];
  const v = await procurarVinculoDoChamador(
    {
      porEmail: async () => [],
      pagina: async (i, f) => {
        lidas.push([i, f]);
        if (i === 0) return [outro(1), outro(2)];
        if (i === 2) return [outro(3), outro(4)];
        return [{ usuario_email: "Compras@Exemplo.test", perfil: "Compras", ativo: true }];
      },
    },
    "compras@exemplo.test",
    2
  );
  assert.equal(v?.perfil, "Compras");
  assert.deepEqual(lidas, [
    [0, 1],
    [2, 3],
    [4, 5],
  ]);
});

test("procurarVinculoDoChamador: para no fim (página incompleta) e não aceita vínculo desativado", async () => {
  let chamadas = 0;
  const v = await procurarVinculoDoChamador(
    {
      porEmail: async () => [{ usuario_email: "c@exemplo.test", perfil: "Admin", ativo: false }],
      pagina: async () => (
        chamadas++,
        [{ usuario_email: "C@exemplo.test", perfil: "Admin", ativo: false }]
      ),
    },
    "c@exemplo.test",
    500
  );
  assert.equal(v, null);
  assert.equal(chamadas, 1);
  assert.equal(PAGINA_DE_VINCULOS, 500);
  assert.equal(
    await procurarVinculoDoChamador({ porEmail: async () => [], pagina: async () => [] }, ""),
    null
  );
});
